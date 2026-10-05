// Pure policy engine v2 (SPEC §0 tiers, STRATEGY §5, F2.3–F2.5). No I/O: the route gathers the context.
// Precedence: sanctions hit → block; simulation revert → block; dApp not allowlisted → block;
// Tier 3 (first transfer to a new address, or > CHF 10'000) → cooling 60 s (prod 24 h), cancellable;
// danger decoded call (unlimited approve / setApprovalForAll / unknown module) → step-up at minimum;
// Tier 2 (> CHF 1'000 / day) → step-up with the Safety key; else Tier 1 approve.
// protect / cancel-recovery are never gated. Sponsorship: 20 userOps / client / day.
// Prototype enforcement is at the policy layer (the reasons say so); production: Safe allowance / delay modules.
import type {
  Call,
  Contact,
  Dapp,
  Fx,
  PolicyDecision,
  PolicyKind,
  Screening,
  Simulation,
  SuggestedCap,
} from '@keyline/shared';
import { type Address, isAddressEqual } from 'viem';
import { FX, formatChf } from './rates';

export const TIER1_DAILY_LIMIT_CHF = 1_000;
export const TIER3_THRESHOLD_CHF = 10_000;
export const SPONSORED_DAILY_CAP = 20;
export const DECISION_TTL_MS = 10 * 60 * 1000;
/** Cooling delay in the prototype; production would be 24 h (STRATEGY §5). */
export const COOLING_MS = 60 * 1000;
export const COOLING_PROD_LABEL = '24 h';

export const REASON_STEP_UP_SATISFIED =
  'Approved by your Safety key · policy-layer enforcement in the prototype';
export const REASON_SPONSORSHIP_EXHAUSTED = 'Free transactions used up today — pay the network fee yourself';
export const REASON_UNKNOWN_DAPP = 'Unknown dApp — request a review';
export const REASON_UNLIMITED_APPROVAL = 'Unlimited approvals need your Safety key';
export const REASON_PROTOTYPE = 'Policy-layer enforcement in the prototype (simulated)';

export type PolicyInput = {
  id: string;
  kind: PolicyKind;
  walletAddress: Address;
  /** Already validated/recomputed by the caller (protect: bank-built; transfer: the single ERC-20 call; dapp: as requested). */
  calls: Call[];
  /** CHF value of the transfer (0 for protect / pure approvals), computed by the caller from the decoded amount. */
  chfValue: number;
  /** Transfer recipient, or the dApp contract for `dapp`, or the wallet itself for protect / cancel. */
  recipientAddress: Address;
  dappId?: string;
  deviceLabel: string;
  requestedAt: Date;
};

export type PolicyContext = {
  /** CHF already sent today (UTC) from this wallet — userOps relayed through /userops/send. */
  dailySpentChf: number;
  sponsoredToday: number;
  contacts: Contact[];
  allowlist: Dapp[];
  screening: Screening;
  simulation: Simulation;
  callsHash: `0x${string}`;
  /** Pre-computed by the caller when a decoded call is an unlimited approve (needs the chain helper). */
  suggestedCap?: SuggestedCap;
  fx?: Fx;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const sameAddress = (a: string, b: string) => isAddressEqual(a as Address, b as Address);

const screeningReason = (s: Screening): string =>
  s.simulatedHit
    ? 'Counterparty appears on the OFAC SDN list — simulated test entry'
    : 'Counterparty appears on the OFAC SDN list';

/** Every call must target one of the dApp's allowlisted contracts; the dApp itself must be allowlisted. */
export const dappAllowed = (dapp: Dapp | undefined, calls: Call[]): boolean =>
  dapp?.allowlisted === true &&
  calls.length > 0 &&
  calls.every((c) => dapp.contracts.some((x) => sameAddress(x, c.to)));

export const evaluate = (input: PolicyInput, ctx: PolicyContext): PolicyDecision => {
  const reasons: string[] = [];
  const remainingToday = Math.max(0, SPONSORED_DAILY_CAP - ctx.sponsoredToday);
  const sponsored = remainingToday > 0;
  let verdict: PolicyDecision['verdict'] = 'approve';
  let tier: PolicyDecision['tier'] = 1;
  let coolingUntil: string | undefined;
  let stepUp: PolicyDecision['stepUp'];
  const contact = ctx.contacts.find((c) => sameAddress(c.address, input.recipientAddress));
  const dapp = input.dappId ? ctx.allowlist.find((d) => d.id === input.dappId) : undefined;

  if (input.kind === 'protect') {
    reasons.push('Protecting your wallet · network fee paid by Swissquote');
  } else if (input.kind === 'cancel-recovery') {
    // F4b: the owner stops a recovery they did not start. Never gated — the attacker's clock is running.
    reasons.push('Cancelling a recovery you did not start · network fee paid by Swissquote');
  } else {
    const total = round2(ctx.dailySpentChf + input.chfValue);
    const danger = ctx.simulation.decodedCalls.some((c) => c.risk === 'danger');
    const isDapp = input.kind === 'dapp';
    // Known = a saved contact (any contact, verified or not) or an allowlisted dApp target.
    const knownRecipient = isDapp ? dappAllowed(dapp, input.calls) : contact != null;

    // Compliance first: a sanctions hit is the reason the client must see even when the call would also revert.
    if (ctx.screening.hit) {
      verdict = 'block';
      reasons.push(screeningReason(ctx.screening));
      reasons.push("Swissquote won't pay the network fee for this transfer and recommends you don't send it");
    } else if (!ctx.simulation.ok) {
      verdict = 'block';
      reasons.push(
        `This transaction would fail${ctx.simulation.revertReason ? `: ${ctx.simulation.revertReason}` : ''} · nothing was sent`,
      );
    } else if (isDapp && !dappAllowed(dapp, input.calls)) {
      verdict = 'block';
      reasons.push(REASON_UNKNOWN_DAPP);
      reasons.push(
        dapp?.allowlisted
          ? `${dapp.name} asked your wallet to call a contract Swissquote has not reviewed`
          : "Blocked apps can't ask your wallet for anything through Keyline",
      );
    } else if (!knownRecipient || total > TIER3_THRESHOLD_CHF) {
      verdict = 'cooling';
      tier = 3;
      coolingUntil = new Date(input.requestedAt.getTime() + COOLING_MS).toISOString();
      reasons.push(
        !knownRecipient
          ? `First transfer to a new address · ${COOLING_MS / 1000} s waiting period, you can cancel`
          : `Above ${formatChf(TIER3_THRESHOLD_CHF)} (${formatChf(total)} today) · ${COOLING_MS / 1000} s waiting period, you can cancel`,
      );
      reasons.push(
        `Waiting period accelerated for the demo: ${COOLING_MS / 1000} s instead of ${COOLING_PROD_LABEL}`,
      );
      if (danger) reasons.push(REASON_UNLIMITED_APPROVAL);
    } else if (danger) {
      verdict = 'step-up';
      tier = 2;
      stepUp = {};
      reasons.push(REASON_UNLIMITED_APPROVAL);
      if (ctx.suggestedCap) reasons.push(ctx.suggestedCap.humanText);
      if (total > TIER1_DAILY_LIMIT_CHF)
        reasons.push(
          `Above your ${formatChf(TIER1_DAILY_LIMIT_CHF)} daily limit (${formatChf(total)} today)`,
        );
      reasons.push(REASON_PROTOTYPE);
    } else if (total > TIER1_DAILY_LIMIT_CHF) {
      verdict = 'step-up';
      tier = 2;
      stepUp = {};
      reasons.push(
        `Above your ${formatChf(TIER1_DAILY_LIMIT_CHF)} daily limit (${formatChf(total)} today) · confirm on your laptop with your Safety key`,
      );
      reasons.push(REASON_PROTOTYPE);
    } else {
      reasons.push(
        isDapp && dapp
          ? `${dapp.name} is reviewed by Swissquote · within your ${formatChf(TIER1_DAILY_LIMIT_CHF)} daily limit`
          : `Within your ${formatChf(TIER1_DAILY_LIMIT_CHF)} daily limit · no second approval needed`,
      );
      if (contact && !contact.verifiedOwnership && !isDapp)
        reasons.push(`${contact.label} has not proved they own this address · double-check it with them`);
    }
    if (input.chfValue > 0)
      reasons.push(`Indicative rate 1 USDC = CHF ${(ctx.fx ?? FX).rate.toFixed(2)} (simulated)`);
  }

  if (verdict !== 'block') {
    reasons.push(
      sponsored
        ? `Network fee paid by Swissquote · ${remainingToday - 1} of ${SPONSORED_DAILY_CAP} free transactions left today`
        : REASON_SPONSORSHIP_EXHAUSTED,
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
    stepUp,
    callsHash: ctx.callsHash,
    coolingUntil,
    chfValue: round2(input.chfValue),
    fx: ctx.fx ?? FX,
    expiresAt: new Date(
      decidedAt.getTime() + DECISION_TTL_MS + (coolingUntil ? COOLING_MS : 0),
    ).toISOString(),
    decidedAt: decidedAt.toISOString(),
    status: 'open',
    suggestedCap: ctx.suggestedCap,
    dappId: input.dappId,
    deviceLabel: input.deviceLabel,
    recipientLabel: contact?.label,
    recipientAddress: input.recipientAddress,
  };
};

/** The Safety key co-approved a `step-up` decision: it becomes `approve` (tier stays 2, reasons say why). */
export const satisfyStepUp = (
  decision: PolicyDecision,
  stepUp: { signature: `0x${string}`; guardianAddress: Address; at: Date },
): PolicyDecision => ({
  ...decision,
  verdict: 'approve',
  reasons: [REASON_STEP_UP_SATISFIED, ...decision.reasons.filter((r) => r !== REASON_PROTOTYPE)],
  stepUp: {
    satisfiedBy: 'safety-key',
    signature: stepUp.signature,
    guardianAddress: stepUp.guardianAddress,
    satisfiedAt: stepUp.at.toISOString(),
  },
  // The laptop may have taken a while: the client gets a fresh 10-minute window to sponsor and send.
  expiresAt: new Date(stepUp.at.getTime() + DECISION_TTL_MS).toISOString(),
});

/** A `cooling` decision whose waiting period has passed (and that was not cancelled) becomes `approve`. */
export const promoteCooling = (decision: PolicyDecision, now: Date): PolicyDecision | null => {
  if (decision.verdict !== 'cooling' || decision.status === 'cancelled' || !decision.coolingUntil)
    return null;
  if (new Date(decision.coolingUntil).getTime() > now.getTime()) return null;
  return {
    ...decision,
    verdict: 'approve',
    reasons: ['Waiting period over · you can send now', ...decision.reasons],
  };
};
