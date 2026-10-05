// Verifies the bank's EIP-712 IdentityVerdict with viem. The typed-data definition is imported from
// @keyline/shared so the hash the bank signs and the hash we verify can never drift.
import { IDENTITY_VERDICT_TYPES, type IdentityVerdict, identityVerdictDomain } from '@keyline/shared';
import type { Address, Hex } from 'viem';
import { verifyTypedData } from 'viem';

export type VerdictCheck = { ok: true } | { ok: false; reason: string };

export async function verifyIdentityVerdict(
  verdict: IdentityVerdict,
  bankVerdictAddress: Address,
  chainId: number,
): Promise<VerdictCheck> {
  try {
    const valid = await verifyTypedData({
      address: bankVerdictAddress,
      domain: identityVerdictDomain(chainId),
      types: IDENTITY_VERDICT_TYPES,
      primaryType: 'IdentityVerdict',
      message: {
        recoveryRequestId: verdict.recoveryRequestId,
        wallet: verdict.wallet as Address,
        newOwner: verdict.newOwner as Address,
        method: verdict.method,
        verdict: verdict.verdict,
        issuedAt: BigInt(verdict.issuedAt),
      },
      signature: verdict.signature as Hex,
    });
    return valid
      ? { ok: true }
      : { ok: false, reason: 'identity verdict signature does not recover to the bank verdict address' };
  } catch (err) {
    return {
      ok: false,
      reason: `identity verdict signature malformed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
