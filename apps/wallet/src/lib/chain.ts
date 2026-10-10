// All chain access of the wallet goes through here. Nothing in this file touches key material:
// the passkey signs inside the authenticator, the bank sponsors and relays, viem only reads.
// Order is law (EntryPoint v0.7): build → sponsor → sign → send.
import {
  attestationChallenge,
  attestationSignatureFromPasskey,
  buildCancelRecoveryUserOp,
  buildCreateAndProtectUserOp,
  buildTransferUserOp,
  buildUserOp,
  type ChainEndpoints,
  type UserOperationV7 as ChainUserOp,
  createPasskeyAccount,
  explorerTxUrl,
  loadPasskeyAccount,
  type MetaTransaction,
  type PasskeyAccount,
  type PasskeyPublicKey,
  passkeySignerAddress,
  type RecoveryStatus,
  recovery,
  recoveryNonce,
  recoveryTypedData,
  safeOpHash,
  signUserOpWithPasskey,
  transferTransaction,
  userOpToJson,
  type WebAuthnAssertion,
} from '@keyline/chain';
import {
  type UserOperationV7 as JsonUserOp,
  type PolicyDecision,
  UserOperationV7Schema,
} from '@keyline/shared';
import { base64URLStringToBuffer } from '@simplewebauthn/browser';
import {
  type Address,
  createPublicClient,
  erc20Abi,
  formatUnits,
  getAddress,
  type Hex,
  hashTypedData,
  hexToBytes,
  http,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { env } from '../env';
import { api, isApiError } from './api';
import type { LocalWallet } from './storage';

export const endpoints: ChainEndpoints = {
  chainId: env.chainId,
  rpcUrl: env.rpcUrl,
  bundlerUrl: env.bundlerUrl,
};

export const publicClient = createPublicClient({ chain: baseSepolia, transport: http(env.rpcUrl) });

export class PasskeyCancelledError extends Error {
  constructor() {
    super('The passkey prompt was dismissed');
    this.name = 'PasskeyCancelledError';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------------------------------------------

export function ownerOf(wallet: Pick<LocalWallet, 'pubKeyX' | 'pubKeyY'>): PasskeyPublicKey {
  return { x: BigInt(wallet.pubKeyX), y: BigInt(wallet.pubKeyY) };
}

/** Counterfactual account before deployment; attached account afterwards (owner = passkey signer proxy). */
export function accountFor(wallet: LocalWallet): PasskeyAccount {
  const owner = ownerOf(wallet);
  if (wallet.status === 'deployed') return loadPasskeyAccount(getAddress(wallet.address), owner);
  return createPasskeyAccount({ pubKeyX: owner.x, pubKeyY: owner.y });
}

// ---------------------------------------------------------------------------------------------------------------
// userOp JSON ⇄ abstractionkit
// ---------------------------------------------------------------------------------------------------------------

/** JSON-safe userOp for the bank (`userOpToJson` then the shared schema, nulls dropped). */
export function toJsonUserOp(userOp: ChainUserOp): JsonUserOp {
  const raw = userOpToJson(userOp);
  const compact: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (value !== null) compact[key] = value;
  return UserOperationV7Schema.parse(compact);
}

function big(value: string): bigint {
  return value.startsWith('0x') ? BigInt(value) : BigInt(value);
}

/** Inverse of `toJsonUserOp`: the bank's sponsored userOp back into abstractionkit's bigint shape. */
export function fromJsonUserOp(json: JsonUserOp): ChainUserOp {
  return {
    sender: json.sender,
    nonce: big(json.nonce),
    factory: json.factory ?? null,
    factoryData: json.factoryData ?? null,
    callData: json.callData,
    callGasLimit: big(json.callGasLimit),
    verificationGasLimit: big(json.verificationGasLimit),
    preVerificationGas: big(json.preVerificationGas),
    maxFeePerGas: big(json.maxFeePerGas),
    maxPriorityFeePerGas: big(json.maxPriorityFeePerGas),
    paymaster: json.paymaster ?? null,
    paymasterVerificationGasLimit:
      json.paymasterVerificationGasLimit === undefined ? null : big(json.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit:
      json.paymasterPostOpGasLimit === undefined ? null : big(json.paymasterPostOpGasLimit),
    paymasterData: json.paymasterData ?? null,
    signature: json.signature,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// WebAuthn assertion over a 32-byte challenge (raw buffers → abstractionkit parses them)
// ---------------------------------------------------------------------------------------------------------------

export async function assertWithPasskey(challenge: Hex, credentialId: string): Promise<WebAuthnAssertion> {
  if (typeof navigator === 'undefined' || !navigator.credentials) throw new PasskeyCancelledError();
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge: Uint8Array.from(hexToBytes(challenge)),
        rpId: window.location.hostname,
        allowCredentials: [{ id: base64URLStringToBuffer(credentialId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 120_000,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
      throw new PasskeyCancelledError();
    }
    throw error;
  }
  if (!credential || !(credential instanceof PublicKeyCredential)) throw new PasskeyCancelledError();
  const response = credential.response;
  if (!(response instanceof AuthenticatorAssertionResponse)) throw new PasskeyCancelledError();
  return {
    authenticatorData: response.authenticatorData,
    clientDataJSON: response.clientDataJSON,
    signature: response.signature,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Build → sponsor → sign → send
// ---------------------------------------------------------------------------------------------------------------

export type SubmitStage = 'building' | 'sponsoring' | 'signing' | 'sending' | 'sent';

export interface SubmitResult {
  readonly userOpHash: Hex;
  readonly safeOpHash: Hex;
  readonly sponsoredUserOp: JsonUserOp;
}

interface SubmitInput {
  readonly wallet: LocalWallet;
  readonly unsignedUserOp: ChainUserOp;
  readonly decision: PolicyDecision;
  readonly onStage?: (stage: SubmitStage) => void;
}

/** Sponsor (bank) → passkey signs the SafeOp EIP-712 hash → relay (bank). Never signs before sponsoring. */
export async function sponsorSignAndSend(input: SubmitInput): Promise<SubmitResult> {
  const { wallet, decision, onStage } = input;
  const owner = ownerOf(wallet);

  onStage?.('sponsoring');
  const sponsored = await api.userops.sponsor({
    decisionId: decision.decisionId,
    userOp: toJsonUserOp(input.unsignedUserOp),
  });
  const sponsoredUserOp = fromJsonUserOp(sponsored.userOp);

  onStage?.('signing');
  const challenge = safeOpHash(sponsoredUserOp, env.chainId);
  const assertion = await assertWithPasskey(challenge, wallet.credentialId);
  const signedUserOp = signUserOpWithPasskey(sponsoredUserOp, assertion, owner);

  onStage?.('sending');
  const sent = await api.userops.send({
    userOp: toJsonUserOp(signedUserOp),
    decisionId: decision.decisionId,
  });
  onStage?.('sent');
  return { userOpHash: sent.userOpHash as Hex, safeOpHash: challenge, sponsoredUserOp: sponsored.userOp };
}

/**
 * Build the userOp from the calls the policy decision covers (the bank recomputes them for `protect` and echoes the
 * validated transfer call; /userops/sponsor compares the userOp's callData against `decision.callsHash`).
 */
export function buildOpFromDecision(wallet: LocalWallet, decision: PolicyDecision): Promise<ChainUserOp> {
  const txs: MetaTransaction[] = decision.calls.map((c) => ({
    to: getAddress(c.to),
    value: BigInt(c.value),
    data: c.data,
  }));
  return buildUserOp(accountFor(wallet), txs, endpoints, { sponsored: true });
}

export function buildProtectOp(wallet: LocalWallet, guardians: readonly Address[]): Promise<ChainUserOp> {
  return buildCreateAndProtectUserOp(
    accountFor(wallet),
    { guardians, threshold: 2, recoveryModule: env.recoveryModule },
    endpoints,
  );
}

export function buildTransferOp(wallet: LocalWallet, to: Address, amountUsdc: number): Promise<ChainUserOp> {
  return buildTransferUserOp(
    accountFor(wallet),
    { token: env.usdcAddress, to, amount: parseUnits(amountUsdc.toFixed(6), 6) },
    endpoints,
  );
}

/** The ERC-20 call as the policy engine expects it (`calls` in PolicyRequest). */
export function transferCall(to: Address, amountUsdc: number): { to: Address; value: string; data: Hex } {
  const tx = transferTransaction({
    token: env.usdcAddress,
    to,
    amount: parseUnits(amountUsdc.toFixed(6), 6),
  });
  return { to: tx.to as Address, value: '0', data: (tx.data ?? '0x') as Hex };
}

// ---------------------------------------------------------------------------------------------------------------
// Polling the bank for inclusion (2 s, back-off to 6 s)
// ---------------------------------------------------------------------------------------------------------------

export type PollStatus = Awaited<ReturnType<typeof api.userops.status>>;

export async function pollUserOp(
  userOpHash: string,
  onUpdate: (status: PollStatus) => void,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PollStatus> {
  const started = Date.now();
  const timeout = options.timeoutMs ?? 180_000;
  let delay = 2_000;
  for (;;) {
    if (options.signal?.aborted) throw new DOMException('Polling aborted', 'AbortError');
    const status = await api.userops.status(userOpHash);
    onUpdate(status);
    if (status.status === 'confirmed' || status.status === 'failed') return status;
    if (status.status === 'included' && status.txHash) return status;
    if (Date.now() - started > timeout) return status;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay + 1_000, 6_000);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------------------

export async function readUsdcBalance(address: Address): Promise<number> {
  const raw = await publicClient.readContract({
    address: env.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
  return Number(formatUnits(raw, 6));
}

/** Circle EURC on Base Sepolia (DECISIONS #27, verified; 6 decimals). */
export const EURC_ADDRESS: Address = '0x808456652fdb597867f38412077A9182bf77359F';

export interface AssetBalances {
  readonly USDC: number;
  readonly EURC: number;
  readonly ETH: number;
}

/** USDC, EURC and ETH held by the Safe, read from chain (Home v2 asset rows). */
export async function readAssetBalances(address: Address): Promise<AssetBalances> {
  const [usdc, eurc, eth] = await Promise.all([
    readUsdcBalance(address),
    publicClient
      .readContract({ address: EURC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      .then((raw) => Number(formatUnits(raw, 6))),
    publicClient.getBalance({ address }).then((raw) => Number(formatUnits(raw, 18))),
  ]);
  return { USDC: usdc, EURC: eurc, ETH: eth };
}

export function txUrl(txHash: string): string {
  return explorerTxUrl(env.chainId, txHash);
}

export function addressUrl(address: string): string {
  return `${env.explorer}/address/${address}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Ownership attestation (SPEC F1.6): the passkey signs the Safe's ERC-1271 message hash of the EIP-712 attestation
// ---------------------------------------------------------------------------------------------------------------

export async function signAttestation(
  wallet: LocalWallet,
  fields: { clientId: string; nonce: string },
): Promise<Hex> {
  const challenge = attestationChallenge({
    clientId: fields.clientId,
    wallet: getAddress(wallet.address),
    chainId: env.chainId,
    nonce: fields.nonce as Hex,
  });
  const assertion = await assertWithPasskey(challenge, wallet.credentialId);
  return attestationSignatureFromPasskey(assertion, ownerOf(wallet));
}

// ---------------------------------------------------------------------------------------------------------------
// Recovery (SPEC F3/F4b): client recoverers sign the module's EIP-712 ExecuteRecovery hash with viem; the owner
// cancels with a sponsored userOp from the Safe itself. Reads go straight to the SocialRecoveryModule.
// ---------------------------------------------------------------------------------------------------------------

export interface RecoverySignature {
  readonly guardianAddress: Address;
  readonly signature: Hex;
  readonly nonce: string;
}

/**
 * Sign `ExecuteRecovery(wallet, [newOwnerProxy], 1, nonce)` with a secp256k1 key the client holds (Safety key from
 * IndexedDB, or the Emergency card key pasted and dropped). The bank publishes the exact typed data it will relay
 * (`GET /recoveries/:id/typed-data`); we recompute it with `@keyline/chain.recoveryTypedData` and refuse to sign if
 * the two hashes differ — the recoverer only ever signs a request for THIS wallet and THIS new key. Without the bank
 * endpoint (501) the module nonce is read from chain and the local typed data is signed.
 */
export async function signRecoveryConfirmation(input: {
  privateKey: Hex;
  recoveryId: string;
  wallet: Address;
  newOwnerProxy: Address;
}): Promise<RecoverySignature> {
  const account = privateKeyToAccount(input.privateKey);
  let nonce: bigint;
  let bankHash: Hex | undefined;
  try {
    const published = await api.recoveries.typedData(input.recoveryId);
    nonce = BigInt(published.nonce);
    bankHash = hashTypedData({
      domain: {
        ...published.typedData.domain,
        verifyingContract: getAddress(published.typedData.domain.verifyingContract),
      },
      types: published.typedData.types,
      primaryType: published.typedData.primaryType,
      message: {
        wallet: getAddress(published.typedData.message.wallet),
        newOwners: published.typedData.message.newOwners.map((o) => getAddress(o)),
        newThreshold: BigInt(published.typedData.message.newThreshold),
        nonce: BigInt(published.typedData.message.nonce),
      },
    });
  } catch (error) {
    if (!(isApiError(error) && (error.notImplemented || error.status === 404))) throw error;
    nonce = await recoveryNonce(publicClient, env.recoveryModule, getAddress(input.wallet));
  }
  const typedData = recoveryTypedData({
    wallet: getAddress(input.wallet),
    newOwners: [getAddress(input.newOwnerProxy)],
    threshold: 1n,
    nonce,
    chainId: env.chainId,
    module: env.recoveryModule,
  });
  const localHash = hashTypedData(typedData);
  if (bankHash !== undefined && bankHash !== localHash) throw new RecoveryMismatchError(bankHash, localHash);
  const signature = await account.signTypedData(typedData);
  return { guardianAddress: account.address, signature, nonce: nonce.toString() };
}

/** The bank asked the recoverer to sign something other than a recovery of this wallet to this new key. */
export class RecoveryMismatchError extends Error {
  constructor(
    readonly bankHash: Hex,
    readonly localHash: Hex,
  ) {
    super('Recovery typed data from the bank does not match the local request');
    this.name = 'RecoveryMismatchError';
  }
}

/** Live module state for a wallet: pending request, `executeAfter`, approvals, guardian set. */
export function readRecoveryStatus(wallet: Address): Promise<RecoveryStatus> {
  return recovery.status(publicClient, env.recoveryModule, getAddress(wallet));
}

/** `cancelRecovery()` called by the Safe (owner veto during the waiting period); sponsored like every other op. */
export function buildCancelOp(wallet: LocalWallet): Promise<ChainUserOp> {
  return buildCancelRecoveryUserOp(accountFor(wallet), env.recoveryModule, endpoints);
}

/** The signer-proxy address a passkey would own the Safe through (cross-check against the bank's answer only). */
export function signerProxyFor(pubKeyX: Hex, pubKeyY: Hex): Address {
  return passkeySignerAddress({ x: BigInt(pubKeyX), y: BigInt(pubKeyY) });
}
