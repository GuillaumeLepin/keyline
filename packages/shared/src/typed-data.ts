// Cross-service EIP-712 definitions. The bank SIGNS these; the guardian processes VERIFY them.
// Both sides import from here so the hash can never drift. Do not rename fields without the orchestrator.
import type { TypedDataDomain } from 'viem';

/** Signed by BANK_VERDICT_PRIVATE_KEY (a verdict key, NOT a guardian key). SIMULATED identity check. */
export const IDENTITY_VERDICT_TYPES = {
  IdentityVerdict: [
    { name: 'recoveryRequestId', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'newOwner', type: 'address' },
    { name: 'method', type: 'string' },
    { name: 'verdict', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
  ],
} as const;

export const identityVerdictDomain = (chainId: number): TypedDataDomain => ({
  name: 'KeylineIdentityVerdict',
  version: '1',
  chainId,
});
