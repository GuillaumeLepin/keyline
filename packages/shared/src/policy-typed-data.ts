// EIP-712 definition of the Tier-2 step-up: the laptop's Safety key signs the policy decision it co-approves and the
// bank verifies it (viem `verifyTypedData`) against the wallet's registered `safety-key` guardian.
// Policy-layer enforcement in the prototype — in production the Safe itself requires this key above the allowance.
// Lives next to (not inside) typed-data.ts, which is pinned for the guardian processes.
import type { Address, Hex, TypedDataDomain } from 'viem';

export const POLICY_STEP_UP_DOMAIN_NAME = 'Keyline Policy';
export const POLICY_STEP_UP_DOMAIN_VERSION = '1';

export const POLICY_STEP_UP_TYPES = {
  KeylinePolicyStepUp: [
    { name: 'decisionId', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'callsHash', type: 'bytes32' },
    { name: 'chfValueCents', type: 'uint256' },
  ],
} as const;

export const policyStepUpDomain = (chainId: number): TypedDataDomain => ({
  name: POLICY_STEP_UP_DOMAIN_NAME,
  version: POLICY_STEP_UP_DOMAIN_VERSION,
  chainId,
});

export type PolicyStepUpMessage = {
  decisionId: string;
  wallet: Address;
  callsHash: Hex;
  chfValueCents: bigint;
};

/** CHF → integer rappen so the signed value is exact (CHF 1'234.50 → 123450n). */
export const chfToCents = (chf: number): bigint => BigInt(Math.round(chf * 100));

/** The message both sides sign/verify, built from the decision the laptop is shown. */
export const policyStepUpMessage = (decision: {
  decisionId: string;
  walletAddress: string;
  callsHash: string;
  chfValue: number;
}): PolicyStepUpMessage => ({
  decisionId: decision.decisionId,
  wallet: decision.walletAddress as Address,
  callsHash: decision.callsHash as Hex,
  chfValueCents: chfToCents(decision.chfValue),
});

/** Everything `signTypedData` / `verifyTypedData` need, minus the signer. */
export const policyStepUpTypedData = (
  chainId: number,
  decision: Parameters<typeof policyStepUpMessage>[0],
) => ({
  domain: policyStepUpDomain(chainId),
  types: POLICY_STEP_UP_TYPES,
  primaryType: 'KeylinePolicyStepUp' as const,
  message: policyStepUpMessage(decision),
});
