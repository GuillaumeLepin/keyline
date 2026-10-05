// Option A (docs/DECISIONS.md #15): the guardian does not send a transaction, it SIGNS the module's
// EIP-712 `ExecuteRecovery` hash with viem and hands the signature to the bank relayer, which puts it
// into one `multiConfirmRecovery` next to the client guardian's signature. The typed data comes from
// @keyline/chain so the hash we sign is exactly `module.getRecoveryHash(...)` — nothing homemade.
import { type RecoveryTypedData, recoveryHash, recoveryTypedData } from '@keyline/chain';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface SignRecoveryInput {
  privateKey: Hex;
  module: Address;
  chainId: number;
  wallet: Address;
  newOwners: Address[];
  newThreshold: number;
  /** `module.nonce(wallet)` read moments before signing; the signature is only valid for that nonce. */
  nonce: bigint;
}

export interface SignedRecoveryConfirmation {
  guardianAddress: Address;
  /** 65-byte ECDSA signature — what the module's `SignatureChecker` accepts for an EOA guardian. */
  signature: Hex;
  /** Local EIP-712 hash, equal to the on-chain `getRecoveryHash` (verified in packages/chain tests). */
  recoveryHash: Hex;
  typedData: RecoveryTypedData;
}

export async function signRecoveryConfirmation(
  input: SignRecoveryInput,
): Promise<SignedRecoveryConfirmation> {
  const account = privateKeyToAccount(input.privateKey);
  const request = {
    wallet: input.wallet,
    newOwners: input.newOwners,
    threshold: BigInt(input.newThreshold),
    nonce: input.nonce,
    chainId: input.chainId,
    module: input.module,
  } as const;
  const typedData = recoveryTypedData(request);
  const signature = await account.signTypedData(typedData);
  return { guardianAddress: account.address, signature, recoveryHash: recoveryHash(request), typedData };
}
