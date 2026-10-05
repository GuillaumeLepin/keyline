// Pure policy engine (SPEC §0 tiers, F1.5 protect, F2.3 transfer). No I/O: the route gathers the context.
// Wave 1 rules: protect → Tier 1 approve; cancel-recovery → Tier 1 approve; USDC transfer ≤ CHF 1'000/day → approve, above → step-up;
// sponsorship 20/day; screening hit → block; simulation revert → block. Tier 3 / dApps / allowlist: Wave 3.
import type {
  Call,
  Contact,
  Dapp,
  Fx,
  PolicyDecision,
  PolicyKind,
  Screening,
  Simulation,
} from '@keyline/shared';
import type { Address } from 'viem';
import { FX, formatChf } from './rates';

export const TIER1_DAILY_LIMIT_CHF = 1_000;
export const TIER3_THRESHOLD_CHF = 10_000;
export const SPONSORED_DAILY_CAP = 20;
export const DECISION_TTL_MS = 10 * 60 * 1000;

export type PolicyInput = {
  id: string;
  kind: PolicyKind;
  walletAddress: Address;
  /** Already validated/recomputed by the caller (protect: bank-built; transfer: the single ERC-20 call). */
  calls: Call[];
  /** CHF value of the transfer (0 for protect), computed by the caller from the decoded amount. */
  chfValue: number;
  recipientAddress: Address;
  dappId?: string;
  deviceLabel: string;
  requestedAt: Date;
};

export type PolicyContext = {
  dailySpentChf: number;
  sponsoredToday: number;
  contacts: Contact[];
  allowlist: Dapp[];
  screening: Screening;
  simulation: Simulation;
  callsHash: `0x${string}`;
  fx?: Fx;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const evaluate = (input: PolicyInput, ctx: PolicyContext): PolicyDecision => {
  const reasons: string[] = [];
  const remainingToday = Math.max(0, SPONSORED_DAILY_CAP - ctx.sponsoredToday);
  const sponsored = remainingToday > 0;
  let verdict: PolicyDecision['verdict'] = 'approve';
  let tier: PolicyDecision['tier'] = 1;

  if (input.kind === 'protect') {
    reasons.push('Protecting your wallet · network fee paid by Swissquote');
  } else if (input.kind === 'cancel-recovery') {
    // F4b: the owner stops a recovery they did not start. Never gated — the attacker's clock is running.
    reasons.push('Cancelling a recovery you did not start · network fee paid by Swissquote');
  } else {
    const total = round2(ctx.dailySpentChf + input.chfValue);
    if (!ctx.simulation.ok) {
      verdict = 'block';
      reasons.push(
        `This transfer would fail${ctx.simulation.revertReason ? `: ${ctx.simulation.revertReason}` : ''} · nothing was sent`,
      );
    } else if (ctx.screening.hit) {
      verdict = 'block';
      reasons.push(
        ctx.screening.simulatedHit
          ? 'Counterparty appears on the OFAC SDN list — simulated test entry'
          : 'Counterparty appears on a sanctions list · transfer refused',
      );
    } else if (ctx.simulation.decodedCalls.some((c) => c.risk === 'danger')) {
      verdict = 'step-up';
      tier = 2;
      reasons.push('This action needs a second approval from your Safety key');
    } else if (total > TIER1_DAILY_LIMIT_CHF) {
      verdict = 'step-up';
      tier = 2;
      reasons.push(
        `Above your ${formatChf(TIER1_DAILY_LIMIT_CHF)} daily limit (${formatChf(total)} today) · approve on your laptop with your Safety key`,
      );
      reasons.push('Policy-layer enforcement in the prototype (simulated)');
    } else {
      reasons.push(`Within your ${formatChf(TIER1_DAILY_LIMIT_CHF)} daily limit · no second approval needed`);
      const known = ctx.contacts.some(
        (c) => c.address.toLowerCase() === input.recipientAddress.toLowerCase(),
      );
      if (!known) reasons.push('First transfer to this address · double-check it with the recipient');
    }
    reasons.push(`Indicative rate 1 USDC = CHF ${(ctx.fx ?? FX).rate.toFixed(2)} (simulated)`);
  }

  if (verdict !== 'block') {
    reasons.push(
      sponsored
        ? `Network fee paid by Swissquote · ${remainingToday - 1} of ${SPONSORED_DAILY_CAP} free transactions left today`
        : `You used today's ${SPONSORED_DAILY_CAP} free transactions · the network fee is yours this time`,
    );
  }

  const decidedAt = input.requestedAt;
  return {
    requestId: input.id,
    decisionId: input.id,
    walletAddress: input.walletAddress,
    kind: input.kind,
    calls: input.calls,
    verdict,
    tier,
    reasons,
    simulation: ctx.simulation,
    screening: ctx.screening,
    sponsorship: {
      sponsored: verdict !== 'block' && sponsored,
      remainingToday: verdict !== 'block' && sponsored ? remainingToday - 1 : remainingToday,
      dailyCap: SPONSORED_DAILY_CAP,
    },
    callsHash: ctx.callsHash,
    chfValue: round2(input.chfValue),
    fx: ctx.fx ?? FX,
    expiresAt: new Date(decidedAt.getTime() + DECISION_TTL_MS).toISOString(),
    decidedAt: decidedAt.toISOString(),
  };
};
