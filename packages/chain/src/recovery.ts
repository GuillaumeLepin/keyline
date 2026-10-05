/**
 * Candide SocialRecoveryModule (deployed version 0.0.1) — guardian confirmations, execute / finalize / cancel.
 *
 * Verified from the deployed source (Sourcify exact match, docs/VERIFIED.md):
 *  - `confirmRecovery` requires `msg.sender` to be a guardian (EOA guardians such as sq-guardian call it directly).
 *  - `multiConfirmRecovery` can be called by ANYONE (the bank relayer): each `{signer, signature}` is checked with
 *    OpenZeppelin `SignatureChecker.isValidSignatureNow(signer, recoveryHash, signature)` (65-byte ECDSA or
 *    ERC-1271) and `signer` must be a guardian. Signers must be strictly ascending by address. An EMPTY signature
 *    means "msg.sender confirms" (then `msg.sender` must equal `signer` and be a guardian).
 *  - The hash is EIP-712: domain { name "Social Recovery Module", version "0.0.1", chainId, verifyingContract =
 *    module }, type `ExecuteRecovery(address wallet,address[] newOwners,uint256 newThreshold,uint256 nonce)`.
 *    `nonce` is the module's `nonce(wallet)`.
 */
import type { Account, Address, Chain, Client, Hex, Transport, TypedDataDefinition } from 'viem';
import { getAddress, hashTypedData } from 'viem';
import { readContract, sendTransaction, writeContract } from 'viem/actions';
import { safeWebAuthnSignerFactoryAbi } from './abi/safeWebAuthnSignerFactory.js';
import { socialRecoveryModuleAbi } from './abi/socialRecoveryModule.js';
import { deploySignerProxyTx, type PasskeyPublicKey, passkeySignerAddress } from './account.js';
import { KNOWN_GRACE_PERIODS_SECONDS, WEBAUTHN_SIGNER_FACTORY } from './constants.js';

export const RECOVERY_DOMAIN_NAME = 'Social Recovery Module';
export const RECOVERY_DOMAIN_VERSION = '0.0.1';

export const EXECUTE_RECOVERY_TYPES = {
  ExecuteRecovery: [
    { name: 'wallet', type: 'address' },
    { name: 'newOwners', type: 'address[]' },
    { name: 'newThreshold', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

export interface RecoveryRequestInput {
  readonly wallet: Address;
  readonly newOwners: readonly Address[];
  readonly threshold: bigint;
  readonly nonce: bigint;
  readonly chainId: bigint | number;
  readonly module: Address;
}

export type RecoveryTypedData = TypedDataDefinition<typeof EXECUTE_RECOVERY_TYPES, 'ExecuteRecovery'>;

/** What the Safety key / Emergency card sign with viem `signTypedData`. Equals the module's `getRecoveryHash`. */
export function recoveryTypedData(input: RecoveryRequestInput): RecoveryTypedData {
  return {
    domain: {
      name: RECOVERY_DOMAIN_NAME,
      version: RECOVERY_DOMAIN_VERSION,
      chainId: Number(input.chainId),
      verifyingContract: getAddress(input.module),
    },
    types: EXECUTE_RECOVERY_TYPES,
    primaryType: 'ExecuteRecovery',
    message: {
      wallet: getAddress(input.wallet),
      newOwners: input.newOwners.map((owner) => getAddress(owner)),
      newThreshold: input.threshold,
      nonce: input.nonce,
    },
  };
}

/** Local (viem) EIP-712 hash — must equal the on-chain `getRecoveryHash`; there is a test and a spike check for it. */
export function recoveryHash(input: RecoveryRequestInput): Hex {
  return hashTypedData(recoveryTypedData(input));
}

type ReadClient = Client<Transport, Chain | undefined>;
type WriteClient = Client<Transport, Chain, Account>;

export function recoveryNonce(client: ReadClient, module: Address, wallet: Address): Promise<bigint> {
  return readContract(client, {
    address: module,
    abi: socialRecoveryModuleAbi,
    functionName: 'nonce',
    args: [wallet],
  });
}

export function recoveryHashOnChain(client: ReadClient, input: RecoveryRequestInput): Promise<Hex> {
  return readContract(client, {
    address: input.module,
    abi: socialRecoveryModuleAbi,
    functionName: 'getRecoveryHash',
    args: [input.wallet, [...input.newOwners], input.threshold, input.nonce],
  });
}

export interface GuardianSignature {
  readonly signer: Address;
  readonly signature: Hex;
}

/** The module requires strictly ascending signer addresses. */
export function sortGuardianSignatures(signatures: readonly GuardianSignature[]): GuardianSignature[] {
  return [...signatures].sort((a, b) => {
    const x = BigInt(a.signer);
    const y = BigInt(b.signer);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export interface ConfirmAsGuardianInput {
  readonly client: WriteClient;
  readonly module: Address;
  readonly wallet: Address;
  readonly newOwners: readonly Address[];
  readonly threshold: bigint;
  readonly execute: boolean;
}

/** EOA guardian (sq-guardian, partner) confirms by itself; `execute: true` starts the grace period if threshold reached. */
export function confirmAsGuardian(input: ConfirmAsGuardianInput): Promise<Hex> {
  return writeContract(input.client, {
    address: input.module,
    abi: socialRecoveryModuleAbi,
    functionName: 'confirmRecovery',
    args: [input.wallet, [...input.newOwners], input.threshold, input.execute],
  });
}

export interface ConfirmWithSignaturesInput {
  /** The relayer — does not need to be a guardian. */
  readonly client: WriteClient;
  readonly module: Address;
  readonly wallet: Address;
  readonly newOwners: readonly Address[];
  readonly threshold: bigint;
  readonly signatures: readonly GuardianSignature[];
  readonly execute: boolean;
}

/** Relayed `multiConfirmRecovery` with the Safety key's / Emergency card's EIP-712 signatures. */
export function confirmWithSignatures(input: ConfirmWithSignaturesInput): Promise<Hex> {
  const sorted = sortGuardianSignatures(input.signatures).map((s) => ({
    signer: s.signer,
    signature: s.signature,
  }));
  return writeContract(input.client, {
    address: input.module,
    abi: socialRecoveryModuleAbi,
    functionName: 'multiConfirmRecovery',
    args: [input.wallet, [...input.newOwners], input.threshold, sorted, input.execute],
  });
}

/** Anyone can execute once approvals ≥ threshold (used when confirmations were sent with `execute: false`). */
export function executeRecovery(input: Omit<ConfirmAsGuardianInput, 'execute'>): Promise<Hex> {
  return writeContract(input.client, {
    address: input.module,
    abi: socialRecoveryModuleAbi,
    functionName: 'executeRecovery',
    args: [input.wallet, [...input.newOwners], input.threshold],
  });
}

/** Anyone can finalize after `executeAfter`. */
export function finalize(input: { client: WriteClient; module: Address; wallet: Address }): Promise<Hex> {
  return writeContract(input.client, {
    address: input.module,
    abi: socialRecoveryModuleAbi,
    functionName: 'finalizeRecovery',
    args: [input.wallet],
  });
}

export interface RecoveryStatus {
  readonly pending: boolean;
  readonly executeAfter?: Date;
  readonly newOwners?: readonly Address[];
  readonly newThreshold?: bigint;
  readonly approvals: bigint;
  readonly nonce: bigint;
  readonly guardians: readonly Address[];
  readonly guardianThreshold: bigint;
}

export async function status(client: ReadClient, module: Address, wallet: Address): Promise<RecoveryStatus> {
  const base = { address: module, abi: socialRecoveryModuleAbi } as const;
  const [request, nonce, guardians, guardianThreshold] = await Promise.all([
    readContract(client, { ...base, functionName: 'getRecoveryRequest', args: [wallet] }),
    readContract(client, { ...base, functionName: 'nonce', args: [wallet] }),
    readContract(client, { ...base, functionName: 'getGuardians', args: [wallet] }),
    readContract(client, { ...base, functionName: 'threshold', args: [wallet] }),
  ]);
  const pending = request.executeAfter > 0n;
  return {
    pending,
    executeAfter: pending ? new Date(Number(request.executeAfter) * 1000) : undefined,
    newOwners: pending ? request.newOwners.map((o) => getAddress(o)) : undefined,
    newThreshold: pending ? request.newThreshold : undefined,
    approvals: request.guardiansApprovalCount,
    nonce,
    guardians: guardians.map((g) => getAddress(g)),
    guardianThreshold,
  };
}

/**
 * The module has NO getter for its grace period (it is an `internal immutable`). The value below was read from the
 * deployed bytecode; `status().executeAfter` is the live, on-chain form once a recovery is executed.
 */
export function gracePeriodSeconds(module: Address): number {
  const value = KNOWN_GRACE_PERIODS_SECONDS[module.toLowerCase()];
  if (value === undefined)
    throw new Error(`Unknown SocialRecoveryModule ${module}: grace period not verified`);
  return value;
}

/** Deploys the SafeWebAuthnSignerProxy for a new passkey (idempotent: returns null if it already exists). */
export async function deploySignerProxy(input: {
  client: WriteClient;
  owner: PasskeyPublicKey;
}): Promise<{ address: Address; txHash: Hex | null }> {
  const address = passkeySignerAddress(input.owner);
  const code = await input.client.request({ method: 'eth_getCode', params: [address, 'latest'] });
  if (code && code !== '0x') return { address, txHash: null };
  const tx = deploySignerProxyTx(input.owner);
  const txHash = await sendTransaction(input.client, {
    account: input.client.account,
    chain: input.client.chain,
    to: getAddress(tx.to),
    data: tx.data as Hex,
    value: tx.value,
  });
  return { address, txHash };
}

/** Precomputed proxy address straight from the factory (cross-check for `passkeySignerAddress`). */
export function signerAddressFromFactory(
  client: ReadClient,
  owner: PasskeyPublicKey,
  verifiers: bigint,
): Promise<Address> {
  return readContract(client, {
    address: WEBAUTHN_SIGNER_FACTORY,
    abi: safeWebAuthnSignerFactoryAbi,
    functionName: 'getSigner',
    args: [owner.x, owner.y, verifiers],
  });
}
