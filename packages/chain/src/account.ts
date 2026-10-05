/**
 * Passkey-owned Safe (Safe 1.4.1 + Safe4337Module v0.3.0, EntryPoint v0.7) on Base Sepolia via abstractionkit.
 *
 * Signing order (EntryPoint v0.7, non-negotiable): build (dummy signature) → sponsor → sign SafeOp hash → send.
 * Every cryptographic step is a library call (abstractionkit / viem); nothing here parses WebAuthn output by hand.
 */
import {
  Bundler,
  CandidePaymaster,
  type MetaTransaction,
  Operation,
  SafeAccountV0_3_0,
  type SendUseroperationResponse,
  type SignerSignaturePair,
  SocialRecoveryModule,
  type SponsorMetadata,
  type UserOperationReceiptResult,
  type UserOperationV7,
  type WebauthnPublicKey,
  webauthnSignatureFromAssertion,
} from 'abstractionkit';
import {
  type Address,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  hexToBigInt,
  hexToNumber,
  size,
  slice,
} from 'viem';
import {
  P256_PRECOMPILE,
  WEBAUTHN_CONTRACT_VERIFIER,
  WEBAUTHN_OVERRIDES,
  WEBAUTHN_SHARED_SIGNER,
} from './constants.js';

export interface PasskeyPublicKey {
  readonly x: bigint;
  readonly y: bigint;
}

export interface PasskeyAccount {
  readonly account: SafeAccountV0_3_0;
  readonly address: Address;
  readonly owner: PasskeyPublicKey;
}

export interface ChainEndpoints {
  readonly chainId: bigint;
  readonly rpcUrl: string;
  /** Candide URL (bundler + paymaster share it). Sponsorship needs the authenticated form. */
  readonly bundlerUrl: string;
}

/** The browser's `AuthenticatorAssertionResponse` fields (or their base64url/hex/bytes forms). */
export interface WebAuthnAssertion {
  readonly authenticatorData: ArrayBuffer | Uint8Array | string;
  readonly clientDataJSON: ArrayBuffer | Uint8Array | string;
  /** Raw r||s or DER bytes from the authenticator, or already-split (r, s). abstractionkit parses it. */
  readonly signature: ArrayBuffer | Uint8Array | { r: bigint; s: bigint };
}

export class ChainError extends Error {
  constructor(
    readonly code: 'MISSING_PAYMASTER' | 'USEROP_FAILED' | 'RECEIPT_TIMEOUT' | 'BAD_INPUT',
    message: string,
  ) {
    super(message);
    this.name = 'ChainError';
  }
}

function toWebauthnPublicKey(owner: PasskeyPublicKey): WebauthnPublicKey {
  return { x: owner.x, y: owner.y };
}

const INIT_OVERRIDES = {
  eip7212WebAuthnPrecompileVerifierForSharedSigner: P256_PRECOMPILE,
  eip7212WebAuthnContractVerifierForSharedSigner: WEBAUTHN_CONTRACT_VERIFIER,
  webAuthnSharedSigner: WEBAUTHN_SHARED_SIGNER,
} as const;

/** Counterfactual Safe for a passkey (x, y). Deterministic: same key → same address, before any deployment. */
export function createPasskeyAccount(input: { pubKeyX: bigint; pubKeyY: bigint }): PasskeyAccount {
  const owner: PasskeyPublicKey = { x: input.pubKeyX, y: input.pubKeyY };
  const account = SafeAccountV0_3_0.initializeNewAccount([toWebauthnPublicKey(owner)], INIT_OVERRIDES);
  return { account, address: getAddress(account.accountAddress), owner };
}

/** Attach to an already-deployed Safe (after the first userOp the owner is the passkey's signer proxy). */
export function loadPasskeyAccount(address: Address, owner: PasskeyPublicKey): PasskeyAccount {
  return { account: new SafeAccountV0_3_0(address), address: getAddress(address), owner };
}

export function counterfactualAddress(owner: PasskeyPublicKey): Address {
  return getAddress(SafeAccountV0_3_0.createAccountAddress([toWebauthnPublicKey(owner)], INIT_OVERRIDES));
}

/**
 * Address of the SafeWebAuthnSignerProxy for a passkey — the Safe owner after the first userOp, and the
 * `newOwners[0]` of a recovery. Deterministic (CREATE2 from the factory); deploy it with `deploySignerProxyTx`.
 */
export function passkeySignerAddress(owner: PasskeyPublicKey): Address {
  return getAddress(
    SafeAccountV0_3_0.createWebAuthnSignerVerifierAddress(owner.x, owner.y, WEBAUTHN_OVERRIDES),
  );
}

/** Plain transaction `{to: factory, data: createSigner(x, y, verifiers)}` anyone can send (idempotent on-chain). */
export function deploySignerProxyTx(owner: PasskeyPublicKey): MetaTransaction {
  return SafeAccountV0_3_0.createDeployWebAuthnVerifierMetaTransaction(owner.x, owner.y, {
    eip7212WebAuthnPrecompileVerifier: P256_PRECOMPILE,
    eip7212WebAuthnContractVerifier: WEBAUTHN_CONTRACT_VERIFIER,
    webAuthnSignerFactory: WEBAUTHN_OVERRIDES.webAuthnSignerFactory,
  });
}

/** `factory != null` ⇔ this userOp deploys the Safe ⇔ the shared signer is the owner being checked. */
export function isInitUserOp(userOp: UserOperationV7): boolean {
  return userOp.factory != null && userOp.factory !== '0x';
}

/** Dummy WebAuthn-shaped signature so bundler / paymaster gas estimation sees the real signature size. */
export function dummySignature(owner: PasskeyPublicKey, isInit: boolean): Hex {
  const pairs: SignerSignaturePair[] = SafeAccountV0_3_0.createDummySignerSignaturePairForExpectedSigners(
    [toWebauthnPublicKey(owner)],
    { isInit, ...WEBAUTHN_OVERRIDES },
  );
  return SafeAccountV0_3_0.formatSignaturesToUseroperationSignature(pairs, {
    isInit,
    ...WEBAUTHN_OVERRIDES,
  }) as Hex;
}

export interface BuildOptions {
  /** When the op will be sponsored, skip the bundler's self-paid estimation (the paymaster re-estimates). */
  readonly sponsored?: boolean;
}

/**
 * Build a userOp for the Safe with a dummy signature. For the first userOp abstractionkit prepends
 * `factory.createSigner` + `swapOwner(sharedSigner → proxy)` automatically, so the Safe ends up owned by
 * the passkey's signer proxy.
 */
export async function buildUserOp(
  pk: PasskeyAccount,
  transactions: MetaTransaction[],
  endpoints: ChainEndpoints,
  options: BuildOptions = {},
): Promise<UserOperationV7> {
  if (transactions.length === 0)
    throw new ChainError('BAD_INPUT', 'buildUserOp needs at least one transaction');
  const userOp = await pk.account.createUserOperation(transactions, endpoints.rpcUrl, endpoints.bundlerUrl, {
    expectedSigners: [toWebauthnPublicKey(pk.owner)],
    skipGasEstimation: options.sponsored === true,
    ...WEBAUTHN_OVERRIDES,
  });
  userOp.signature = dummySignature(pk.owner, isInitUserOp(userOp));
  return userOp;
}

export interface CreateAndProtectInput {
  readonly guardians: readonly Address[];
  readonly threshold: number;
  readonly recoveryModule: Address;
}

/** Guardian meta-transactions: the module requires threshold ≤ guardian count at each step, hence 1, 2, 2… */
export function protectTransactions(pk: PasskeyAccount, input: CreateAndProtectInput): MetaTransaction[] {
  if (input.threshold < 1 || input.threshold > input.guardians.length) {
    throw new ChainError(
      'BAD_INPUT',
      `threshold ${input.threshold} must be within 1..${input.guardians.length}`,
    );
  }
  const module = new SocialRecoveryModule(input.recoveryModule);
  const txs: MetaTransaction[] = [module.createEnableModuleMetaTransaction(pk.address)];
  input.guardians.forEach((guardian, index) => {
    const stepThreshold = BigInt(Math.min(index + 1, input.threshold));
    txs.push(module.createAddGuardianWithThresholdMetaTransaction(getAddress(guardian), stepThreshold));
  });
  return txs;
}

/** Deploy + enable recovery module + add guardians, in one sponsored userOp. */
export function buildCreateAndProtectUserOp(
  pk: PasskeyAccount,
  input: CreateAndProtectInput,
  endpoints: ChainEndpoints,
  options: BuildOptions = { sponsored: true },
): Promise<UserOperationV7> {
  return buildUserOp(pk, protectTransactions(pk, input), endpoints, options);
}

export interface TransferInput {
  readonly token: Address;
  readonly to: Address;
  readonly amount: bigint;
}

export function transferTransaction(input: TransferInput): MetaTransaction {
  return {
    to: getAddress(input.token),
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [getAddress(input.to), input.amount],
    }),
  };
}

export function buildTransferUserOp(
  pk: PasskeyAccount,
  input: TransferInput,
  endpoints: ChainEndpoints,
  options: BuildOptions = { sponsored: true },
): Promise<UserOperationV7> {
  return buildUserOp(pk, [transferTransaction(input)], endpoints, options);
}

/** `cancelRecovery()` must be called by the Safe itself — the owner's veto during the grace period. */
export function buildCancelRecoveryUserOp(
  pk: PasskeyAccount,
  recoveryModule: Address,
  endpoints: ChainEndpoints,
  options: BuildOptions = { sponsored: true },
): Promise<UserOperationV7> {
  const module = new SocialRecoveryModule(recoveryModule);
  return buildUserOp(pk, [module.createCancelRecoveryMetaTransaction()], endpoints, options);
}

export interface SponsorInput {
  /** Authenticated Candide URL — bank-side only, never in the client. */
  readonly paymasterUrl: string;
  readonly bundlerUrl: string;
  readonly sponsorshipPolicyId?: string;
}

/** Bank-side: attach paymaster fields (and gas limits). Must run BEFORE the passkey signs. */
export async function sponsor(
  pk: PasskeyAccount,
  userOp: UserOperationV7,
  input: SponsorInput,
): Promise<{ userOp: UserOperationV7; sponsorMetadata?: SponsorMetadata }> {
  if (!input.paymasterUrl)
    throw new ChainError('MISSING_PAYMASTER', 'paymasterUrl is empty — BANK_CANDIDE_API_KEY missing?');
  const paymaster = new CandidePaymaster(input.paymasterUrl);
  const result = await paymaster.createSponsorPaymasterUserOperation(
    pk.account,
    userOp,
    input.bundlerUrl,
    input.sponsorshipPolicyId,
  );
  return { userOp: result.userOperation, sponsorMetadata: result.sponsorMetadata };
}

/** The WebAuthn challenge: Safe4337Module's EIP-712 SafeOp hash (NOT the EntryPoint userOpHash). */
export function safeOpHash(userOp: UserOperationV7, chainId: bigint): Hex {
  return SafeAccountV0_3_0.getUserOperationEip712Hash(userOp, chainId) as Hex;
}

export interface SafeOpTypedData {
  readonly domain: { chainId: number; verifyingContract: string };
  readonly types: Record<string, { name: string; type: string }[]>;
  readonly messageValue: Record<string, string | bigint>;
}

/** Full typed data of the SafeOp, for display / audit. */
export function safeOpTypedData(userOp: UserOperationV7, chainId: bigint): SafeOpTypedData {
  const data = SafeAccountV0_3_0.getUserOperationEip712Data(userOp, chainId);
  return { domain: data.domain, types: data.types, messageValue: { ...data.messageValue } };
}

/**
 * Turn the authenticator's assertion into the Safe signature. abstractionkit does the DER → (r, s) and
 * clientDataJSON handling; we only pick the right owner address (shared signer during init, proxy after).
 */
export function signUserOpWithPasskey(
  userOp: UserOperationV7,
  assertion: WebAuthnAssertion,
  owner: PasskeyPublicKey,
): UserOperationV7 {
  const signatureData = webauthnSignatureFromAssertion(assertion);
  const webauthnSignature = SafeAccountV0_3_0.createWebAuthnSignature(signatureData);
  const pairs: SignerSignaturePair[] = [{ signer: toWebauthnPublicKey(owner), signature: webauthnSignature }];
  const signature = SafeAccountV0_3_0.formatSignaturesToUseroperationSignature(pairs, {
    isInit: isInitUserOp(userOp),
    ...WEBAUTHN_OVERRIDES,
  });
  return { ...userOp, signature };
}

export function sendUserOp(
  pk: PasskeyAccount,
  userOp: UserOperationV7,
  bundlerUrl: string,
): Promise<SendUseroperationResponse> {
  return pk.account.sendUserOperation(userOp, bundlerUrl);
}

export type UserOpReceipt = NonNullable<UserOperationReceiptResult>;

/** Polls the bundler (3 s default — Candide allows 10 req/s) until inclusion; throws on timeout or on-chain failure. */
export async function waitForReceipt(
  response: SendUseroperationResponse,
  options: { timeoutSeconds?: number; intervalSeconds?: number } = {},
): Promise<UserOpReceipt> {
  const receipt = await response.included(options.timeoutSeconds ?? 180, options.intervalSeconds ?? 3);
  if (receipt == null) {
    throw new ChainError('RECEIPT_TIMEOUT', `userOp ${response.userOperationHash} not included in time`);
  }
  if (!receipt.success) {
    throw new ChainError(
      'USEROP_FAILED',
      `userOp ${response.userOperationHash} reverted in tx ${receipt.receipt.transactionHash}`,
    );
  }
  return receipt;
}

/** JSON-safe view of a userOp (bigint → decimal string) for logs and the desk event feed. */
export function userOpToJson(userOp: UserOperationV7): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(userOp)) {
    out[key] = value == null ? null : typeof value === 'bigint' ? value.toString() : String(value);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// callData encoding / decoding — the bank recomputes `encodeCallData(calls)` and compares it with the client's userOp
// (DECISIONS #14). Both sides go through the same abstractionkit statics `buildUserOp` uses internally, so they can't
// drift: 1 tx → `executeUserOpWithErrorString(to, value, data, Call)`; n txs → the same wrapper around a delegatecall to
// MultiSend 1.4.1 `multiSend(bytes)`.
// ---------------------------------------------------------------------------------------------------------------

/** Exactly the `callData` that `buildUserOp(pk, txs)` produces for a non-init userOp (pure, no RPC). */
export function encodeCallData(transactions: readonly MetaTransaction[]): Hex {
  if (transactions.length === 0)
    throw new ChainError('BAD_INPUT', 'encodeCallData needs at least one transaction');
  const txs = transactions.map((tx) => ({ ...tx, value: tx.value ?? 0n, data: tx.data ?? '0x' }));
  const first = txs[0];
  if (txs.length === 1 && first !== undefined) {
    return SafeAccountV0_3_0.createAccountCallDataSingleTransaction(first) as Hex;
  }
  return SafeAccountV0_3_0.createAccountCallDataBatchTransactions(txs) as Hex;
}

/**
 * The two meta-transactions abstractionkit prepends to the FIRST userOp of a passkey Safe:
 * `factory.createSigner(x, y, verifiers)` + `safe.swapOwner(sentinel, sharedSigner, proxy)`. The bank needs them to
 * reproduce the create+protect callData: `encodeCallData([...initOwnerTransactions(owner, safe), ...protectTxs])`.
 */
export function initOwnerTransactions(owner: PasskeyPublicKey, safe: Address): MetaTransaction[] {
  const swapOwner = encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'swapOwner',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'prevOwner', type: 'address' },
          { name: 'oldOwner', type: 'address' },
          { name: 'newOwner', type: 'address' },
        ],
        outputs: [],
      },
    ] as const,
    functionName: 'swapOwner',
    args: ['0x0000000000000000000000000000000000000001', WEBAUTHN_SHARED_SIGNER, passkeySignerAddress(owner)],
  });
  return [deploySignerProxyTx(owner), { to: getAddress(safe), value: 0n, data: swapOwner }];
}

export interface DecodedInnerCall {
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly operation: 'call' | 'delegatecall';
}

const MULTISEND_ABI = [
  {
    type: 'function',
    name: 'multiSend',
    stateMutability: 'payable',
    inputs: [{ name: 'transactions', type: 'bytes' }],
    outputs: [],
  },
] as const;

/**
 * Inverse of `encodeCallData`: the list of inner calls a Safe4337Module `executeUserOp*` callData will run (the bank
 * evaluates THESE, not what the client claims). MultiSend's packed layout is
 * `operation(1) ‖ to(20) ‖ value(32) ‖ dataLength(32) ‖ data` per call (plain ABI slicing — no cryptography).
 */
export function decodeCallData(callData: Hex): DecodedInnerCall[] {
  const [outer] = SafeAccountV0_3_0.decodeAccountCallData(callData);
  const outerData = outer.data as Hex;
  const isMultiSend =
    outer.operation === Operation.Delegate &&
    getAddress(outer.to) === getAddress(SafeAccountV0_3_0.DEFAULT_MULTISEND_CONTRACT_ADDRESS) &&
    outerData.toLowerCase().startsWith('0x8d80ff0a');
  if (!isMultiSend) {
    return [
      {
        to: getAddress(outer.to),
        value: outer.value,
        data: outerData,
        operation: outer.operation === Operation.Delegate ? 'delegatecall' : 'call',
      },
    ];
  }
  const { args } = decodeFunctionData({ abi: MULTISEND_ABI, data: outerData });
  const packed = args[0];
  const calls: DecodedInnerCall[] = [];
  let offset = 0;
  const total = size(packed);
  while (offset < total) {
    const operation = hexToNumber(slice(packed, offset, offset + 1));
    const to = getAddress(slice(packed, offset + 1, offset + 21));
    const value = hexToBigInt(slice(packed, offset + 21, offset + 53));
    const dataLength = Number(hexToBigInt(slice(packed, offset + 53, offset + 85)));
    const data = dataLength === 0 ? ('0x' as Hex) : slice(packed, offset + 85, offset + 85 + dataLength);
    calls.push({ to, value, data, operation: operation === 1 ? 'delegatecall' : 'call' });
    offset += 85 + dataLength;
  }
  return calls;
}

// ---------------------------------------------------------------------------------------------------------------
// Cheap status lookup for the bank's `GET /userops/:hash` — one `eth_getUserOperationReceipt`, no polling.
// ---------------------------------------------------------------------------------------------------------------

export interface UserOpStatus {
  readonly status: 'pending' | 'included' | 'failed';
  readonly txHash?: Hex;
  readonly blockNumber?: bigint;
  readonly actualGasUsed?: bigint;
}

export async function getUserOpStatus(bundlerUrl: string, userOpHash: Hex): Promise<UserOpStatus> {
  const receipt = await new Bundler(bundlerUrl).getUserOperationReceipt(userOpHash);
  if (receipt == null) return { status: 'pending' };
  return {
    status: receipt.success ? 'included' : 'failed',
    txHash: receipt.receipt.transactionHash as Hex,
    blockNumber: BigInt(receipt.receipt.blockNumber),
    actualGasUsed: BigInt(receipt.actualGasUsed),
  };
}
