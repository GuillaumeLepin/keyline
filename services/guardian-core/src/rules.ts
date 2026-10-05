// SPEC §4 guardian rules as one pure function. Every refusal lists ALL failed reasons so the event
// log (and the desk) explains the decision. Idempotency (same request id twice) is handled by the
// server before this runs; here an id is either new or it is not our problem.
import type { GuardianRecoveryRequest } from '@keyline/shared';
import type { Address } from 'viem';
import type { RecoveryChainPort } from './chain-port';
import type { ConfirmationRow } from './db';
import { verifyIdentityVerdict } from './verdict';

export const EXECUTED_RECOVERY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface RuleContext {
  guardianAddress: Address;
  bankVerdictAddress: Address;
  chainId: number;
  chain: Pick<RecoveryChainPort, 'isGuardian' | 'threshold' | 'approvals'>;
  /** DB lookup: most recent EXECUTED confirmation for the wallet (waiting/refused do not count). */
  lastExecutedConfirmation: (wallet: string) => ConfirmationRow | undefined;
  now?: () => number;
}

export type RuleDecision =
  | { allow: true; execute: boolean; approvals: number; threshold: number; reasons: string[] }
  | { allow: false; status: 403 | 409; reasons: string[] };

export async function evaluateRecoveryRequest(
  req: GuardianRecoveryRequest,
  ctx: RuleContext,
): Promise<RuleDecision> {
  const now = ctx.now ?? Date.now;
  const forbidden: string[] = [];
  const conflicts: string[] = [];
  const wallet = req.wallet as Address;
  const newOwners = req.newOwners as Address[];
  const v = req.identityVerdict;

  // 1. The verdict must be signed by the bank's verdict key (viem verifyTypedData, nothing homemade).
  const sig = await verifyIdentityVerdict(v, ctx.bankVerdictAddress, ctx.chainId);
  if (!sig.ok) forbidden.push(sig.reason);

  // 2. The verdict must be a pass.
  if (v.verdict !== 'pass') forbidden.push(`identity verdict is '${v.verdict}', not 'pass'`);

  // 2b. The verdict must be about THIS request, wallet and new owner — otherwise a pass issued for
  // Lea's real recovery could be replayed to install an attacker's key.
  if (v.recoveryRequestId !== req.recoveryRequestId)
    forbidden.push('identity verdict is for a different request id');
  if (v.wallet.toLowerCase() !== req.wallet.toLowerCase())
    forbidden.push('identity verdict is for a different wallet');
  if (newOwners.length === 1 && v.newOwner.toLowerCase() !== newOwners[0]?.toLowerCase()) {
    forbidden.push('identity verdict names a different new owner');
  }

  // 3. Exactly one new owner (the new passkey's signer proxy).
  if (newOwners.length !== 1) forbidden.push(`expected exactly 1 new owner, got ${newOwners.length}`);

  // 4. This process must be a guardian of the wallet ON-CHAIN. The module's guardian list — not this
  // code — is what makes "Swissquote + partner" impossible in default mode.
  const isGuardian = await ctx.chain.isGuardian(wallet, ctx.guardianAddress);
  if (!isGuardian) forbidden.push(`${ctx.guardianAddress} is not an on-chain guardian of wallet ${wallet}`);

  // 5. One EXECUTED recovery per wallet per 24 h. A thief's refused/waiting attempt must not block Lea.
  const last = ctx.lastExecutedConfirmation(req.wallet);
  if (last && now() - last.at < EXECUTED_RECOVERY_COOLDOWN_MS) {
    const hoursAgo = ((now() - last.at) / 3_600_000).toFixed(1);
    conflicts.push(
      `a recovery for this wallet was executed ${hoursAgo} h ago (request ${last.recoveryRequestId}); limit is one per 24 h`,
    );
  }

  if (forbidden.length > 0) return { allow: false, status: 403, reasons: forbidden };
  if (conflicts.length > 0) return { allow: false, status: 409, reasons: conflicts };

  // 6. Execute only if this confirmation reaches the threshold.
  const [threshold, approvals] = await Promise.all([
    ctx.chain.threshold(wallet),
    ctx.chain.approvals(wallet, newOwners, req.newThreshold),
  ]);
  const execute = approvals + 1 >= threshold;
  return {
    allow: true,
    execute,
    approvals,
    threshold,
    reasons: [
      'identity verdict signed by the bank verdict key',
      "identity verdict is 'pass' and matches request, wallet and new owner",
      'this process is an on-chain guardian of the wallet',
      'no recovery executed for this wallet in the last 24 h',
      `${approvals} of ${threshold} confirmations on-chain before ours; execute=${execute}`,
    ],
  };
}
