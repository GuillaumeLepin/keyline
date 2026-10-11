// ERC-1271 signatures for dApps (SPEC §11.2, VERIFIED §20.1): the passkey signs the Safe's `SafeMessage` hash and the
// dApp receives the Safe's contract signature, which `isValidSignature` / viem `verifyMessage` accept. Nothing here
// is homemade cryptography: hashes are @keyline/chain (viem), the signature layout is abstractionkit's.
import {
  contractSignatureFromPasskey,
  probeSignatureScheme,
  type SignatureScheme,
  safeMessageHashForMessage,
  safeMessageHashForTypedData,
} from '@keyline/chain';
import { getAddress, type Hex, type TypedDataDefinition } from 'viem';
import { env } from '../env';
import { assertWithPasskey, ownerOf, publicClient } from '../lib/chain';
import type { LocalWallet } from '../lib/storage';
import type { TypedDataPayload } from './requests';

/** viem wants numeric chain ids; dApps often send "84532" or "0x14a34". */
export function normalizeTypedData(td: TypedDataPayload): TypedDataDefinition {
  const domain = td.domain ? { ...td.domain } : undefined;
  if (domain && typeof domain.chainId === 'string') domain.chainId = Number(BigInt(domain.chainId));
  if (domain?.verifyingContract) domain.verifyingContract = getAddress(domain.verifyingContract);
  const { EIP712Domain: _ignored, ...types } = td.types;
  return {
    domain,
    types,
    primaryType: td.primaryType,
    message: td.message,
  } as unknown as TypedDataDefinition;
}

export async function signMessageForDapp(wallet: LocalWallet, hex: Hex): Promise<Hex> {
  const challenge = safeMessageHashForMessage({
    safe: getAddress(wallet.address),
    chainId: env.chainId,
    message: { raw: hex },
  });
  const assertion = await assertWithPasskey(challenge, wallet.credentialId);
  return contractSignatureFromPasskey(assertion, ownerOf(wallet));
}

export async function signTypedDataForDapp(wallet: LocalWallet, td: TypedDataPayload): Promise<Hex> {
  const challenge = safeMessageHashForTypedData({
    safe: getAddress(wallet.address),
    chainId: env.chainId,
    typedData: normalizeTypedData(td),
  });
  const assertion = await assertWithPasskey(challenge, wallet.credentialId);
  return contractSignatureFromPasskey(assertion, ownerOf(wallet));
}

/** Can the consumer of this typed data accept a smart-account (ERC-1271) signature? Reads token bytecode if needed. */
export function signatureSchemeOf(td: TypedDataPayload): Promise<SignatureScheme> {
  return probeSignatureScheme(publicClient, {
    domain: td.domain,
    types: td.types,
    primaryType: td.primaryType,
  });
}
