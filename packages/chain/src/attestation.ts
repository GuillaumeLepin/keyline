/**
 * EIP-712 ownership attestation ("this Safe belongs to Swissquote client X"), signed by the passkey THROUGH the Safe
 * and verified with ERC-1271 (`Safe.isValidSignature(bytes32, bytes)`, served by the Safe4337Module acting as the
 * CompatibilityFallbackHandler). The attestation is signed after deployment, so no ERC-6492 wrapping is needed
 * (ERC-6492 would be the production refinement for counterfactual Safes).
 *
 * What the passkey actually signs — verified against Safe 1.4.1 `CompatibilityFallbackHandler.isValidSignature`:
 *   dataHash    = hashTypedData(Attestation)                               (`attestationDigest`)
 *   messageData = 0x1901 ‖ safe.domainSeparator() ‖ keccak256(abi.encode(SAFE_MSG_TYPEHASH, keccak256(abi.encode(dataHash))))
 *   challenge   = keccak256(messageData) = hashTypedData(SafeMessage{ message: dataHash }) with domain { chainId, safe }
 * The Safe then calls `owner.isValidSignature(messageData, contractSignature)` on the passkey's SafeWebAuthnSignerProxy,
 * which hashes `messageData` and checks the WebAuthn assertion over that hash — so the WebAuthn challenge is `challenge`.
 * The signature bytes are the bare Safe signature (v = 0 contract signature pointing at the proxy), built only with
 * abstractionkit helpers; the Safe4337Module `validAfter/validUntil` prefix used for userOps is NOT part of it.
 */
import {
  SAFE_MESSAGE_MODULE_TYPE,
  SafeAccountV0_3_0,
  type SignerSignaturePair,
  webauthnSignatureFromAssertion,
} from 'abstractionkit';
import type { Address, Chain, Client, Hex, Transport, TypedDataDefinition } from 'viem';
import { getAddress, hashTypedData, isHex, size } from 'viem';
import { verifyTypedData } from 'viem/actions';
import type { PasskeyPublicKey, WebAuthnAssertion } from './account.js';
import { WEBAUTHN_OVERRIDES } from './constants.js';

export const ATTESTATION_DOMAIN_NAME = 'Keyline Ownership Attestation';
export const ATTESTATION_DOMAIN_VERSION = '1';

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: 'clientId', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'chainId', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export interface AttestationFields {
  readonly clientId: string;
  readonly wallet: Address;
  readonly chainId: bigint | number;
  /** 32-byte random nonce issued by the bank (replay protection); `0x` + 64 hex chars. */
  readonly nonce: Hex;
}

export type AttestationTypedData = TypedDataDefinition<typeof ATTESTATION_TYPES, 'Attestation'>;

function assertNonce(nonce: Hex): void {
  if (!isHex(nonce) || size(nonce) !== 32)
    throw new RangeError('attestation nonce must be 32 bytes (bytes32)');
}

/** Typed data the client displays and the Safe signs; `verifyingContract` is the Safe itself. */
export function attestationTypedData(fields: AttestationFields): AttestationTypedData {
  assertNonce(fields.nonce);
  const wallet = getAddress(fields.wallet);
  return {
    domain: {
      name: ATTESTATION_DOMAIN_NAME,
      version: ATTESTATION_DOMAIN_VERSION,
      chainId: Number(fields.chainId),
      verifyingContract: wallet,
    },
    types: ATTESTATION_TYPES,
    primaryType: 'Attestation',
    message: {
      clientId: fields.clientId,
      wallet,
      chainId: BigInt(fields.chainId),
      nonce: fields.nonce,
    },
  };
}

/** EIP-712 digest of the attestation = the `dataHash` handed to `Safe.isValidSignature(bytes32, bytes)`. */
export function attestationDigest(input: AttestationFields | AttestationTypedData): Hex {
  return hashTypedData(isTypedData(input) ? input : attestationTypedData(input));
}

function isTypedData(input: AttestationFields | AttestationTypedData): input is AttestationTypedData {
  return 'primaryType' in input;
}

/** The Safe's `SafeMessage(bytes message)` EIP-712 hash over an arbitrary 32-byte `dataHash` (Safe 1.4.1 layout). */
export function safeMessageHash(safe: Address, chainId: bigint | number, dataHash: Hex): Hex {
  return hashTypedData({
    domain: { chainId: Number(chainId), verifyingContract: getAddress(safe) },
    types: SAFE_MESSAGE_MODULE_TYPE,
    primaryType: 'SafeMessage',
    message: { message: dataHash },
  });
}

/** The exact 32 bytes the passkey signs (WebAuthn `challenge`) so that the Safe's ERC-1271 check passes. */
export function attestationChallenge(input: AttestationFields | AttestationTypedData): Hex {
  const typedData = isTypedData(input) ? input : attestationTypedData(input);
  const safe = typedData.domain?.verifyingContract;
  const chainId = typedData.domain?.chainId;
  if (safe === undefined || chainId === undefined) throw new RangeError('attestation domain is incomplete');
  return safeMessageHash(safe, chainId, hashTypedData(typedData));
}

/**
 * Safe-formatted contract signature for the passkey owner (its SafeWebAuthnSignerProxy, v = 0), built with
 * abstractionkit only: `webauthnSignatureFromAssertion` → `createWebAuthnSignature` →
 * `buildSignaturesFromSingerSignaturePairs` (the bare Safe signature, without the 4337 validity-timestamp prefix).
 */
export function attestationSignatureFromPasskey(assertion: WebAuthnAssertion, owner: PasskeyPublicKey): Hex {
  const signatureData = webauthnSignatureFromAssertion(assertion);
  const webauthnSignature = SafeAccountV0_3_0.createWebAuthnSignature(signatureData);
  const pairs: SignerSignaturePair[] = [{ signer: { x: owner.x, y: owner.y }, signature: webauthnSignature }];
  return SafeAccountV0_3_0.buildSignaturesFromSingerSignaturePairs(pairs, {
    isInit: false,
    ...WEBAUTHN_OVERRIDES,
  }) as Hex;
}

export interface VerifyAttestationInput {
  readonly client: Client<Transport, Chain | undefined>;
  readonly wallet: Address;
  readonly signature: Hex;
  readonly typedData?: AttestationTypedData;
  readonly fields?: AttestationFields;
}

export interface VerifyAttestationResult {
  readonly ok: boolean;
  readonly method: 'erc1271';
  readonly digest: Hex;
  readonly reason?: string;
}

/**
 * Bank-side verification: viem `verifyTypedData` with `address = wallet` — for a contract address viem performs the
 * ERC-1271 `isValidSignature(digest, signature)` call on-chain (through its universal validator), so a signature from
 * anyone but the Safe's current owner, or over a different nonce / wallet / clientId, yields `ok: false`.
 */
export async function verify(input: VerifyAttestationInput): Promise<VerifyAttestationResult> {
  const typedData = input.typedData ?? (input.fields ? attestationTypedData(input.fields) : undefined);
  if (!typedData) throw new RangeError('verify needs typedData or fields');
  const wallet = getAddress(input.wallet);
  const digest = hashTypedData(typedData);
  if (
    typedData.domain?.verifyingContract === undefined ||
    getAddress(typedData.domain.verifyingContract) !== wallet
  ) {
    return { ok: false, method: 'erc1271', digest, reason: 'typed data verifyingContract is not the wallet' };
  }
  if (getAddress(typedData.message.wallet) !== wallet) {
    return { ok: false, method: 'erc1271', digest, reason: 'typed data message.wallet is not the wallet' };
  }
  try {
    const ok = await verifyTypedData(input.client, {
      ...typedData,
      address: wallet,
      signature: input.signature,
    });
    return ok
      ? { ok, method: 'erc1271', digest }
      : { ok, method: 'erc1271', digest, reason: 'Safe.isValidSignature rejected the signature' };
  } catch (error) {
    return {
      ok: false,
      method: 'erc1271',
      digest,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
