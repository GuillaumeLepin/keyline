/**
 * ERC-1271 signatures for dApp requests (WalletConnect `personal_sign`, `eth_signTypedData(_v4)`), produced by the
 * passkey THROUGH the Safe — the generalisation of the ownership attestation (`attestation.ts`, VERIFIED §10/§20).
 *
 * A verifier (viem `verifyMessage` / `verifyTypedData`, a SIWE backend, Permit2, USDC `permit(…, bytes)`) calls
 * `Safe.isValidSignature(bytes32 dataHash, bytes signature)` where
 *   dataHash = hashMessage(message)            for personal_sign (EIP-191)
 *   dataHash = hashTypedData(typedData)        for eth_signTypedData_v4 (EIP-712)
 * Safe 1.4.1's CompatibilityFallbackHandler (served by the Safe4337Module) wraps it as
 * `SafeMessage(bytes message = abi.encode(dataHash))` under the domain `{ chainId, verifyingContract: safe }` and asks
 * the owner (the passkey's SafeWebAuthnSignerProxy) to validate a WebAuthn assertion over that wrapped hash. So the
 * WebAuthn challenge is `safeMessageHash(safe, chainId, dataHash)`, and the signature returned to the dApp is the bare
 * Safe contract signature (v = 0, pointing at the proxy) — no 4337 validity prefix, no ERC-6492 wrapper (the Safe is
 * deployed before it connects to any dApp).
 */
import {
  SAFE_MESSAGE_MODULE_TYPE,
  SafeAccountV0_3_0,
  type SignerSignaturePair,
  webauthnSignatureFromAssertion,
} from 'abstractionkit';
import type { Address, Hex, SignableMessage, TypedData, TypedDataDefinition } from 'viem';
import { getAddress, hashMessage, hashTypedData, isAddressEqual } from 'viem';
import type { PasskeyPublicKey, WebAuthnAssertion } from './account.js';
import { WEBAUTHN_OVERRIDES } from './constants.js';

/** `bytes4(keccak256("isValidSignature(bytes32,bytes)"))` — what a valid ERC-1271 check returns. */
export const ERC1271_MAGIC_VALUE = '0x1626ba7e' as const;

export const ERC1271_ABI = [
  {
    type: 'function',
    name: 'isValidSignature',
    stateMutability: 'view',
    inputs: [
      { name: '_dataHash', type: 'bytes32' },
      { name: '_signature', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes4' }],
  },
] as const;

/** The Safe's `SafeMessage(bytes message)` EIP-712 hash over an arbitrary 32-byte `dataHash` (Safe 1.4.1 layout). */
export function safeMessageHash(safe: Address, chainId: bigint | number, dataHash: Hex): Hex {
  return hashTypedData({
    domain: { chainId: Number(chainId), verifyingContract: getAddress(safe) },
    types: SAFE_MESSAGE_MODULE_TYPE,
    primaryType: 'SafeMessage',
    message: { message: dataHash },
  });
}

export interface SafeMessageInput {
  readonly safe: Address;
  readonly chainId: bigint | number;
}

/**
 * `personal_sign`: the WebAuthn challenge for `message` (a string, or `{ raw }` for the hex the dApp sent).
 * WalletConnect `personal_sign` params are `[messageHex, address]`; pass `{ raw: messageHex }` so the bytes are
 * hashed exactly as the dApp's verifier will (`hashMessage` = EIP-191 `\x19Ethereum Signed Message:\n<len>`).
 */
export function safeMessageHashForMessage(
  input: SafeMessageInput & { readonly message: SignableMessage },
): Hex {
  return safeMessageHash(input.safe, input.chainId, hashMessage(input.message));
}

/** `eth_signTypedData_v4`: the WebAuthn challenge for an EIP-712 payload (viem `hashTypedData` → SafeMessage). */
export function safeMessageHashForTypedData<
  const typedData extends TypedData | Record<string, unknown>,
  primaryType extends keyof typedData | 'EIP712Domain',
>(input: SafeMessageInput & { readonly typedData: TypedDataDefinition<typedData, primaryType> }): Hex {
  return safeMessageHash(input.safe, input.chainId, hashTypedData(input.typedData));
}

/**
 * The bare Safe contract signature for the passkey's signer proxy, built with abstractionkit only:
 * `webauthnSignatureFromAssertion` → `createWebAuthnSignature` → `buildSignaturesFromSingerSignaturePairs`
 * (`isInit: false` — the Safe is deployed and owned by the proxy). Layout: `r = proxy, s = 0x41, v = 0` then
 * `len ‖ abi.encode(authenticatorData, clientDataFields, [r, s])` — 417 bytes for a typical assertion.
 * This is what `personal_sign` / `eth_signTypedData_v4` return to the dApp.
 */
export function contractSignatureFromPasskey(assertion: WebAuthnAssertion, owner: PasskeyPublicKey): Hex {
  const signatureData = webauthnSignatureFromAssertion(assertion);
  const webauthnSignature = SafeAccountV0_3_0.createWebAuthnSignature(signatureData);
  const pairs: SignerSignaturePair[] = [{ signer: { x: owner.x, y: owner.y }, signature: webauthnSignature }];
  return SafeAccountV0_3_0.buildSignaturesFromSingerSignaturePairs(pairs, {
    isInit: false,
    ...WEBAUTHN_OVERRIDES,
  }) as Hex;
}

// ---------------------------------------------------------------------------------------------------------------
// Which typed-data signatures can a smart account produce in a way the consuming contract will accept?
// Facts established on Base Sepolia (VERIFIED §20), not guesses:
//  • USDC 0x036C…CF7e = FiatTokenV2_2 behind a proxy (impl 0xd74c…c5b5). It exposes `permit(owner, spender, value,
//    deadline, bytes signature)` (0x9fd5a6cf) + `transferWithAuthorization(…, bytes)`, which use SignatureChecker →
//    ERC-1271 for contract owners. A live `simulateContract(permit(…, bytes))` with the Safe's signature succeeds.
//    The (v, r, s) overload cannot carry a 417-byte Safe signature — the dApp must submit the `bytes` overload.
//  • Permit2 0x0000…78BA3: SignatureVerification.verify calls IERC1271 when `claimedSigner.code.length > 0`;
//    a live simulation of `permit(owner, PermitSingle, bytes)` with the Safe's signature succeeds.
//  • DAI-style permit (`holder`, `allowed`) uses bare `ecrecover` — no contract owner can ever satisfy it.
//  • A plain EIP-2612 `permit(v, r, s)` (OpenZeppelin ERC20Permit ≤ 4.x/5.x: `ECDSA.recover`) is EOA-only; whether
//    a given token has the `bytes` overload is an on-chain fact → `probeSignatureScheme` checks the bytecode.
// ---------------------------------------------------------------------------------------------------------------

export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;
export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
/** `permit(address,address,uint256,uint256,bytes)` — the ERC-1271-capable overload (FiatTokenV2_2, ERC-7598). */
export const PERMIT_BYTES_SELECTOR = '0x9fd5a6cf' as const;
/** `permit(address,address,uint256,uint256,uint8,bytes32,bytes32)` — the classic EIP-2612 entry point. */
export const PERMIT_VRS_SELECTOR = '0xd505accf' as const;

/** Tokens verified on-chain to accept ERC-1271 signatures in `permit` / `*WithAuthorization` (chainId → address). */
export const ERC1271_PERMIT_TOKENS: Readonly<Record<number, readonly Address[]>> = {
  84532: [USDC_BASE_SEPOLIA],
};

export type SignatureSchemeKind = 'erc1271-ok' | 'eoa-only' | 'unknown';

export interface SignatureScheme {
  readonly kind: SignatureSchemeKind;
  /** Which family the payload belongs to, for the review sheet. */
  readonly family:
    | 'permit2'
    | 'eip2612-permit'
    | 'dai-permit'
    | 'eip3009-authorization'
    | 'siwe-or-generic'
    | 'other';
  readonly reason: string;
}

const PERMIT2_PRIMARY_TYPES = new Set([
  'PermitSingle',
  'PermitBatch',
  'PermitTransferFrom',
  'PermitBatchTransferFrom',
  'PermitWitnessTransferFrom',
  'PermitBatchWitnessTransferFrom',
]);

const EIP3009_PRIMARY_TYPES = new Set([
  'TransferWithAuthorization',
  'ReceiveWithAuthorization',
  'CancelAuthorization',
]);

interface TypedDataLike {
  readonly domain?: {
    readonly name?: string;
    readonly version?: string;
    readonly chainId?: number | bigint | string;
    readonly verifyingContract?: string;
  };
  readonly types?: Record<string, readonly { readonly name: string; readonly type: string }[] | undefined>;
  readonly primaryType?: string;
}

function fieldNames(typedData: TypedDataLike, type: string): Set<string> {
  return new Set((typedData.types?.[type] ?? []).map((field) => field.name));
}

function isKnownErc1271Token(chainId: number | undefined, token: string | undefined): boolean {
  if (chainId === undefined || token === undefined) return false;
  return (ERC1271_PERMIT_TOKENS[chainId] ?? []).some((known) => isAddressEqual(known, token as Address));
}

/**
 * Classify an `eth_signTypedData_v4` payload for a passkey-owned Safe. Pure (no RPC): uses only the verified table
 * above. `unknown` means "the signature is a valid ERC-1271 signature of the Safe; whether the consumer checks
 * ERC-1271 is not known here" — call `probeSignatureScheme` to settle EIP-2612 permits from the token's bytecode.
 */
export function detectSignatureScheme(typedData: TypedDataLike): SignatureScheme {
  const primaryType = typedData.primaryType ?? '';
  const verifyingContract = typedData.domain?.verifyingContract;
  const chainId = typedData.domain?.chainId === undefined ? undefined : Number(typedData.domain.chainId);

  if (verifyingContract && isAddressEqual(verifyingContract as Address, PERMIT2_ADDRESS)) {
    return {
      kind: 'erc1271-ok',
      family: 'permit2',
      reason:
        'Permit2 verifies contract owners with ERC-1271 (SignatureVerification: code.length > 0 → isValidSignature); ' +
        'simulated with the Safe signature on Base Sepolia.',
    };
  }

  if (primaryType === 'Permit') {
    const fields = fieldNames(typedData, 'Permit');
    if (fields.has('holder') && fields.has('allowed')) {
      return {
        kind: 'eoa-only',
        family: 'dai-permit',
        reason:
          'DAI-style permit checks `holder == ecrecover(digest, v, r, s)`; a smart account cannot satisfy it.',
      };
    }
    if (isKnownErc1271Token(chainId, verifyingContract)) {
      return {
        kind: 'erc1271-ok',
        family: 'eip2612-permit',
        reason:
          'This token (Circle FiatTokenV2_2) has permit(owner, spender, value, deadline, bytes) using ERC-1271; ' +
          'the app must submit that overload, not the (v, r, s) one.',
      };
    }
    return {
      kind: 'unknown',
      family: 'eip2612-permit',
      reason:
        'EIP-2612 permit: ERC-1271 support depends on the token (probe its bytecode for permit(…, bytes)).',
    };
  }

  if (EIP3009_PRIMARY_TYPES.has(primaryType)) {
    return isKnownErc1271Token(chainId, verifyingContract)
      ? {
          kind: 'erc1271-ok',
          family: 'eip3009-authorization',
          reason: 'FiatTokenV2_2 *WithAuthorization(…, bytes) checks contract signers with ERC-1271.',
        }
      : {
          kind: 'unknown',
          family: 'eip3009-authorization',
          reason: 'EIP-3009 authorization: ERC-1271 support depends on the token.',
        };
  }

  if (PERMIT2_PRIMARY_TYPES.has(primaryType)) {
    return {
      kind: 'unknown',
      family: 'permit2',
      reason: 'Permit2-shaped payload for a contract that is not the canonical Permit2 deployment.',
    };
  }

  return {
    kind: 'unknown',
    family: 'other',
    reason: 'Valid ERC-1271 signature of the Safe; the consumer must verify it with isValidSignature.',
  };
}

/** Minimal reader so the probe works with any viem client (or a stub in tests). */
export interface CodeReader {
  getCode(args: { address: Address }): Promise<Hex | undefined>;
  getStorageAt(args: { address: Address; slot: Hex }): Promise<Hex | undefined>;
}

/** EIP-1967 implementation slot and the older ZeppelinOS slot (Circle's FiatToken proxy). */
const IMPLEMENTATION_SLOTS: readonly Hex[] = [
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3',
];

/** Does the contract's dispatcher (or its proxy implementation's) contain `PUSH4 <selector>`? */
export async function hasSelector(client: CodeReader, address: Address, selector: Hex): Promise<boolean> {
  const needle = `63${selector.slice(2).toLowerCase()}`;
  const codes: Hex[] = [];
  const own = await client.getCode({ address });
  if (own) codes.push(own);
  for (const slot of IMPLEMENTATION_SLOTS) {
    const raw = await client.getStorageAt({ address, slot });
    if (!raw || /^0x0*$/.test(raw)) continue;
    const impl = getAddress(`0x${raw.slice(-40)}`);
    const code = await client.getCode({ address: impl });
    if (code) codes.push(code);
  }
  return codes.some((code) => code.toLowerCase().includes(needle));
}

/**
 * `detectSignatureScheme`, refined on-chain for EIP-2612 permits of tokens outside the verified table: a token with
 * the `permit(…, bytes)` overload accepts the Safe's ERC-1271 signature; a token with only `permit(v, r, s)` cannot
 * receive a 417-byte contract signature at all → `eoa-only`.
 */
export async function probeSignatureScheme(
  client: CodeReader,
  typedData: TypedDataLike,
): Promise<SignatureScheme> {
  const pure = detectSignatureScheme(typedData);
  const token = typedData.domain?.verifyingContract;
  if (pure.kind !== 'unknown' || pure.family !== 'eip2612-permit' || !token) return pure;
  const address = getAddress(token);
  if (await hasSelector(client, address, PERMIT_BYTES_SELECTOR)) {
    return {
      kind: 'erc1271-ok',
      family: 'eip2612-permit',
      reason:
        'The token has permit(owner, spender, value, deadline, bytes) (ERC-1271-capable); submit that overload.',
    };
  }
  if (await hasSelector(client, address, PERMIT_VRS_SELECTOR)) {
    return {
      kind: 'eoa-only',
      family: 'eip2612-permit',
      reason:
        'The token only has permit(v, r, s): a smart-account signature cannot fit in (v, r, s). Approve with a transaction instead.',
    };
  }
  return { ...pure, reason: 'No permit entry point found in the token bytecode.' };
}
