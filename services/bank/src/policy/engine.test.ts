import type { Contact, Dapp, Screening, Simulation } from '@keyline/shared';
import { describe, expect, it } from 'vitest';
import { contactIdOf } from '../repo';
import {
  COOLING_MS,
  evaluate,
  type PolicyContext,
  type PolicyInput,
  promoteCooling,
  SPONSORED_DAILY_CAP,
  satisfyStepUp,
} from './engine';

const wallet = '0x39ECE2fA9262408426E78c71A9dED95ddD42967D' as const;
const usdc = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const lukas = '0x1111111111111111111111111111111111111111' as const;
const marta = '0x2222222222222222222222222222222222222222' as const;
const sanctioned = '0x3333333333333333333333333333333333333333' as const;
const stranger = '0x4444444444444444444444444444444444444444' as const;
const demoswap = '0xDe305AA9000000000000000000000000000000dE' as const;
const bad = '0x0000000000000000000000000000000000000BAD' as const;
const hash = `0x${'ab'.repeat(32)}` as const;
const at = new Date('2026-10-05T20:00:00.000Z');

const screening = (hit: boolean, simulatedHit = hit): Screening => ({
  counterparty: hit ? sanctioned : lukas,
  listsChecked: ['OFAC-SDN', 'SECO'],
  hit,
  source: hit ? (simulatedHit ? 'seeded-test' : 'OFAC-SDN') : undefined,
  simulatedHit,
  simulated: true,
});
const simulation = (over: Partial<Simulation> = {}): Simulation => ({
  ok: true,
  assetChanges: [],
  decodedCalls: [
    { to: usdc, fn: 'transfer(address,uint256)', args: [], humanText: 'Send 100 USDC', risk: 'none' },
  ],
  gasEstimate: '0',
  provider: 'fallback',
  simulated: true,
  ...over,
});
const dangerSim = simulation({
  decodedCalls: [
    { to: usdc, fn: 'approve(address,uint256)', args: [], humanText: 'Approve ∞', risk: 'danger' },
  ],
});
const contacts: Contact[] = [
  {
    id: contactIdOf(lukas),
    clientId: 'SQ-48213-LK',
    label: 'Lukas Meier',
    address: lukas,
    firstSeenAt: at.toISOString(),
    verifiedOwnership: true,
    trusted: true,
  },
  {
    id: contactIdOf(marta),
    clientId: 'SQ-48213-LK',
    label: 'Marta Rossi',
    address: marta,
    firstSeenAt: at.toISOString(),
    verifiedOwnership: false,
    trusted: false,
  },
];
const allowlist: Dapp[] = [
  {
    id: 'demoswap',
    name: 'DemoSwap',
    url: 'http://localhost:3000/dapps/demoswap',
    allowlisted: true,
    contracts: [usdc, demoswap],
    simulated: true,
  },
  {
    id: 'unknown-dapp',
    name: 'Unknown dApp',
    url: 'http://localhost:3000/dapps/unknown',
    allowlisted: false,
    contracts: [bad],
    simulated: true,
  },
];
const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  dailySpentChf: 0,
  sponsoredToday: 0,
  contacts,
  allowlist,
  screening: screening(false),
  simulation: simulation(),
  callsHash: hash,
  ...over,
});
const transfer = (chfValue: number, recipient: `0x${string}` = lukas): PolicyInput => ({
  id: 'req_1',
  kind: 'transfer',
  walletAddress: wallet,
  calls: [{ to: usdc, value: '0', data: '0xa9059cbb' }],
  chfValue,
  recipientAddress: recipient,
  deviceLabel: 'Lea · phone',
  requestedAt: at,
});
const dapp = (dappId: string, to: `0x${string}` = usdc, chfValue = 0): PolicyInput => ({
  ...transfer(chfValue, to),
  kind: 'dapp',
  dappId,
  calls: [{ to, value: '0', data: '0x095ea7b3' }],
});
const protect: PolicyInput = { ...transfer(0, wallet), kind: 'protect', calls: [] };
const cancel: PolicyInput = { ...transfer(0, wallet), kind: 'cancel-recovery', calls: [] };

type Case = {
  name: string;
  input: PolicyInput;
  ctx: PolicyContext;
  verdict: 'approve' | 'step-up' | 'cooling' | 'block';
  tier: 1 | 2 | 3;
  sponsored: boolean;
  remaining: number;
  reason: RegExp;
};

const cases: Case[] = [
  // --- never gated
  {
    name: 'protect op is Tier 1 approve, sponsored',
    input: protect,
    ctx: ctx(),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /Protecting your wallet · network fee paid by Swissquote/,
  },
  {
    name: 'protect ignores daily spend',
    input: protect,
    ctx: ctx({ dailySpentChf: 5_000 }),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /Protecting your wallet/,
  },
  {
    name: 'cancel-recovery is never gated (F4b)',
    input: cancel,
    ctx: ctx({ dailySpentChf: 50_000 }),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /Cancelling a recovery you did not start/,
  },
  // --- Tier 1
  {
    name: 'CHF 80 to a known contact → approve',
    input: transfer(80),
    ctx: ctx(),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /Within your CHF 1'000.00 daily limit/,
  },
  {
    name: 'exactly CHF 1000 is still Tier 1',
    input: transfer(1_000),
    ctx: ctx(),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /Within your/,
  },
  {
    name: 'daily sum under limit: 600 spent + 400 → approve',
    input: transfer(400),
    ctx: ctx({ dailySpentChf: 600 }),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /Within your/,
  },
  {
    name: 'unverified contact (Marta) stays Tier 1 with a double-check notice',
    input: transfer(50, marta),
    ctx: ctx(),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /Marta Rossi has not proved they own this address/,
  },
  {
    name: 'rate line is present on transfers',
    input: transfer(50),
    ctx: ctx(),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /Indicative rate 1 USDC = CHF 0.80 \(simulated\)/,
  },
  // --- Tier 2
  {
    name: 'CHF 1000.01 → step-up Tier 2',
    input: transfer(1_000.01),
    ctx: ctx(),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason:
      /Above your CHF 1'000.00 daily limit \(CHF 1'000.01 today\) · confirm on your laptop with your Safety key/,
  },
  {
    name: 'CHF 2000 → step-up with Swiss number formatting',
    input: transfer(2_000),
    ctx: ctx(),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /CHF 2'000.00 today/,
  },
  {
    name: 'daily sum counts: 600 spent + 500 → step-up',
    input: transfer(500),
    ctx: ctx({ dailySpentChf: 600 }),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /CHF 1'100.00 today/,
  },
  {
    name: 'step-up is labelled prototype policy-layer enforcement',
    input: transfer(1_500),
    ctx: ctx(),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /Policy-layer enforcement in the prototype/,
  },
  {
    name: 'exactly CHF 10000 to a known contact is Tier 2, not 3',
    input: transfer(10_000),
    ctx: ctx(),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /Above your CHF 1'000.00/,
  },
  // --- Tier 3
  {
    name: 'first transfer to a new address → cooling Tier 3',
    input: transfer(50, stranger),
    ctx: ctx(),
    verdict: 'cooling',
    tier: 3,
    sponsored: true,
    remaining: 19,
    reason: /First transfer to a new address · 60 s waiting period, you can cancel/,
  },
  {
    name: 'cooling carries the demo-acceleration caption',
    input: transfer(50, stranger),
    ctx: ctx(),
    verdict: 'cooling',
    tier: 3,
    sponsored: true,
    remaining: 19,
    reason: /accelerated for the demo: 60 s instead of 24 h/,
  },
  {
    name: 'CHF 10000.01 to a known contact → cooling Tier 3',
    input: transfer(10_000.01),
    ctx: ctx(),
    verdict: 'cooling',
    tier: 3,
    sponsored: true,
    remaining: 19,
    reason: /Above CHF 10'000.00 \(CHF 10'000.01 today\)/,
  },
  {
    name: 'daily sum crosses 10k: 9500 spent + 600 → cooling',
    input: transfer(600),
    ctx: ctx({ dailySpentChf: 9_500 }),
    verdict: 'cooling',
    tier: 3,
    sponsored: true,
    remaining: 19,
    reason: /CHF 10'100.00 today/,
  },
  {
    name: 'new address wins over the amount tier (small amount still cools)',
    input: transfer(5, stranger),
    ctx: ctx({ dailySpentChf: 2_000 }),
    verdict: 'cooling',
    tier: 3,
    sponsored: true,
    remaining: 19,
    reason: /First transfer to a new address/,
  },
  // --- blocks
  {
    name: 'seeded sanctioned counterparty → block, simulated copy',
    input: transfer(50, sanctioned),
    ctx: ctx({ screening: screening(true) }),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /^Counterparty appears on the OFAC SDN list — simulated test entry$/,
  },
  {
    name: 'real OFAC hit → block, real copy',
    input: transfer(50, sanctioned),
    ctx: ctx({ screening: screening(true, false) }),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /^Counterparty appears on the OFAC SDN list$/,
  },
  {
    name: 'sanctions block beats the new-address cooling',
    input: transfer(50, sanctioned),
    ctx: ctx({ screening: screening(true) }),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /OFAC/,
  },
  {
    name: 'simulation revert → block with the reason',
    input: transfer(50),
    ctx: ctx({
      simulation: simulation({ ok: false, revertReason: 'ERC20: transfer amount exceeds balance' }),
    }),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /This transaction would fail: ERC20: transfer amount exceeds balance/,
  },
  {
    name: 'screening beats a simulation revert (compliance reason shown first)',
    input: transfer(50, sanctioned),
    ctx: ctx({ screening: screening(true), simulation: simulation({ ok: false, revertReason: 'x' }) }),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /^Counterparty appears on the OFAC SDN list — simulated test entry$/,
  },
  // --- dApps
  {
    name: 'DemoSwap approve(∞) → step-up with the unlimited-approval reason',
    input: dapp('demoswap'),
    ctx: ctx({ simulation: dangerSim }),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /^Unlimited approvals need your Safety key$/,
  },
  {
    name: 'DemoSwap step-up carries the suggested cap copy',
    input: dapp('demoswap'),
    ctx: ctx({
      simulation: dangerSim,
      suggestedCap: {
        call: { to: usdc, value: '0', data: '0x095ea7b3' },
        amount: '100',
        symbol: 'USDC',
        humanText: 'Approve 100.00 USDC instead',
      },
    }),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /Approve 100.00 USDC instead/,
  },
  {
    name: 'DemoSwap capped approve (warn) → Tier 1 approve',
    input: dapp('demoswap'),
    ctx: ctx({
      simulation: simulation({
        decodedCalls: [
          { to: usdc, fn: 'approve(address,uint256)', args: [], humanText: 'Allow 100 USDC', risk: 'warn' },
        ],
      }),
    }),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /DemoSwap is reviewed by Swissquote/,
  },
  {
    name: 'Unknown dApp (not allowlisted) → block "request a review"',
    input: dapp('unknown-dapp', bad),
    ctx: ctx(),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /^Unknown dApp — request a review$/,
  },
  {
    name: 'unknown dappId → block',
    input: dapp('nope'),
    ctx: ctx(),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /Unknown dApp — request a review/,
  },
  {
    name: 'allowlisted dApp calling a contract outside its list → block',
    input: dapp('demoswap', bad),
    ctx: ctx(),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /DemoSwap asked your wallet to call a contract Swissquote has not reviewed/,
  },
  {
    name: 'danger on a transfer to a known contact → step-up even under the limit',
    input: transfer(50),
    ctx: ctx({ simulation: dangerSim }),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /Unlimited approvals need your Safety key/,
  },
  {
    name: 'danger + new address → cooling (Tier 3) still mentions the Safety key',
    input: transfer(50, stranger),
    ctx: ctx({ simulation: dangerSim }),
    verdict: 'cooling',
    tier: 3,
    sponsored: true,
    remaining: 19,
    reason: /Unlimited approvals need your Safety key/,
  },
  // --- sponsorship
  {
    name: '19 sponsored today → last free one',
    input: transfer(50),
    ctx: ctx({ sponsoredToday: 19 }),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 0,
    reason: /0 of 20 free transactions left/,
  },
  {
    name: '20 sponsored today → approve but not sponsored',
    input: transfer(50),
    ctx: ctx({ sponsoredToday: SPONSORED_DAILY_CAP }),
    verdict: 'approve',
    tier: 1,
    sponsored: false,
    remaining: 0,
    reason: /^Free transactions used up today — pay the network fee yourself$/,
  },
  {
    name: 'sponsorship cap also applies to protect',
    input: protect,
    ctx: ctx({ sponsoredToday: 25 }),
    verdict: 'approve',
    tier: 1,
    sponsored: false,
    remaining: 0,
    reason: /Free transactions used up today/,
  },
  {
    name: 'step-up decisions still report sponsorship',
    input: transfer(3_000),
    ctx: ctx({ sponsoredToday: 3 }),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 16,
    reason: /16 of 20 free transactions left today/,
  },
];

describe('policy engine v2', () => {
  it(`table has ≥ 25 cases (${cases.length})`, () => expect(cases.length).toBeGreaterThanOrEqual(25));
  for (const c of cases) {
    it(c.name, () => {
      const d = evaluate(c.input, c.ctx);
      expect(d.verdict).toBe(c.verdict);
      expect(d.tier).toBe(c.tier);
      expect(d.sponsorship.sponsored).toBe(c.sponsored);
      expect(d.sponsorship.remainingToday).toBe(c.remaining);
      expect(d.sponsorship.dailyCap).toBe(SPONSORED_DAILY_CAP);
      expect(
        d.reasons.some((r) => c.reason.test(r)),
        d.reasons.join(' | '),
      ).toBe(true);
      expect(d.status).toBe('open');
      if (c.verdict === 'cooling')
        expect(new Date(d.coolingUntil ?? 0).getTime()).toBe(at.getTime() + COOLING_MS);
      else expect(d.coolingUntil).toBeUndefined();
      if (c.verdict === 'step-up') expect(d.stepUp).toEqual({});
      else expect(d.stepUp).toBeUndefined();
    });
  }

  it('is pure: same input → same decision, with a 10-minute expiry and the simulated rate', () => {
    const a = evaluate(transfer(80), ctx());
    const b = evaluate(transfer(80), ctx());
    expect(a).toEqual(b);
    expect(new Date(a.expiresAt).getTime() - at.getTime()).toBe(10 * 60 * 1000);
    expect(a.fx).toEqual({ pair: 'USDC/CHF', rate: 0.8, simulated: true });
    expect(a.callsHash).toBe(hash);
    expect(a.decisionId).toBe(a.requestId);
    expect(a.recipientLabel).toBe('Lukas Meier');
    expect(a.deviceLabel).toBe('Lea · phone');
  });

  it('cooling decisions expire 60 s later than normal ones so the window survives the wait', () => {
    const d = evaluate(transfer(50, stranger), ctx());
    expect(new Date(d.expiresAt).getTime() - at.getTime()).toBe(10 * 60 * 1000 + COOLING_MS);
  });

  it('satisfyStepUp turns step-up into approve with the Safety-key reason first', () => {
    const d = evaluate(transfer(2_000), ctx());
    const later = new Date(at.getTime() + 30_000);
    const ok = satisfyStepUp(d, { signature: '0xabcd', guardianAddress: lukas, at: later });
    expect(ok.verdict).toBe('approve');
    expect(ok.tier).toBe(2);
    expect(ok.reasons[0]).toBe('Approved by your Safety key · policy-layer enforcement in the prototype');
    expect(ok.stepUp).toEqual({
      satisfiedBy: 'safety-key',
      signature: '0xabcd',
      guardianAddress: lukas,
      satisfiedAt: later.toISOString(),
    });
    expect(new Date(ok.expiresAt).getTime()).toBe(later.getTime() + 10 * 60 * 1000);
  });

  it('promoteCooling: only after coolingUntil, never when cancelled, never for other verdicts', () => {
    const d = evaluate(transfer(50, stranger), ctx());
    expect(promoteCooling(d, at)).toBeNull();
    expect(promoteCooling(d, new Date(at.getTime() + COOLING_MS - 1))).toBeNull();
    const done = promoteCooling(d, new Date(at.getTime() + COOLING_MS));
    expect(done?.verdict).toBe('approve');
    expect(done?.reasons[0]).toMatch(/Waiting period over/);
    expect(promoteCooling({ ...d, status: 'cancelled' }, new Date(at.getTime() + COOLING_MS))).toBeNull();
    expect(promoteCooling(evaluate(transfer(50), ctx()), new Date(at.getTime() + COOLING_MS))).toBeNull();
  });
});
