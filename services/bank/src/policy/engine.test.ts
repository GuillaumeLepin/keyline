import type { Contact, Screening, Simulation } from '@keyline/shared';
import { describe, expect, it } from 'vitest';
import { evaluate, type PolicyContext, type PolicyInput, SPONSORED_DAILY_CAP } from './engine';

const wallet = '0x39ECE2fA9262408426E78c71A9dED95ddD42967D' as const;
const usdc = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const lukas = '0x1111111111111111111111111111111111111111' as const;
const marta = '0x2222222222222222222222222222222222222222' as const;
const sanctioned = '0x3333333333333333333333333333333333333333' as const;
const hash = `0x${'ab'.repeat(32)}` as const;
const at = new Date('2026-10-05T20:00:00.000Z');

const screening = (hit: boolean): Screening => ({
  counterparty: hit ? sanctioned : lukas,
  listsChecked: ['OFAC-SDN', 'SECO'],
  hit,
  simulatedHit: hit,
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
const contacts: Contact[] = [
  {
    clientId: 'SQ-48213-LK',
    label: 'Lukas Meier',
    address: lukas,
    firstSeenAt: at.toISOString(),
    verifiedOwnership: true,
  },
];
const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  dailySpentChf: 0,
  sponsoredToday: 0,
  contacts,
  allowlist: [],
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
const protect: PolicyInput = { ...transfer(0, wallet), kind: 'protect', calls: [] };

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
    name: 'CHF 1000.01 → step-up Tier 2',
    input: transfer(1_000.01),
    ctx: ctx(),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /Above your CHF 1'000.00 daily limit/,
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
    name: 'new recipient gets a first-time notice but stays Tier 1',
    input: transfer(50, marta),
    ctx: ctx(),
    verdict: 'approve',
    tier: 1,
    sponsored: true,
    remaining: 19,
    reason: /First transfer to this address/,
  },
  {
    name: 'sanctioned counterparty → block',
    input: transfer(50, sanctioned),
    ctx: ctx({ screening: screening(true) }),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /OFAC SDN list — simulated test entry/,
  },
  {
    name: 'simulation revert → block',
    input: transfer(50),
    ctx: ctx({
      simulation: simulation({ ok: false, revertReason: 'ERC20: transfer amount exceeds balance' }),
    }),
    verdict: 'block',
    tier: 1,
    sponsored: false,
    remaining: 20,
    reason: /would fail: ERC20/,
  },
  {
    name: 'danger decoded call → step-up Tier 2',
    input: transfer(50),
    ctx: ctx({
      simulation: simulation({
        decodedCalls: [
          { to: usdc, fn: 'approve(address,uint256)', args: [], humanText: 'Approve ∞', risk: 'danger' },
        ],
      }),
    }),
    verdict: 'step-up',
    tier: 2,
    sponsored: true,
    remaining: 19,
    reason: /second approval/,
  },
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
    reason: /network fee is yours this time/,
  },
  {
    name: 'sponsorship cap also applies to protect',
    input: protect,
    ctx: ctx({ sponsoredToday: 25 }),
    verdict: 'approve',
    tier: 1,
    sponsored: false,
    remaining: 0,
    reason: /network fee is yours/,
  },
];

describe('policy engine v1', () => {
  for (const c of cases) {
    it(c.name, () => {
      const d = evaluate(c.input, c.ctx);
      expect(d.verdict).toBe(c.verdict);
      expect(d.tier).toBe(c.tier);
      expect(d.sponsorship.sponsored).toBe(c.sponsored);
      expect(d.sponsorship.remainingToday).toBe(c.remaining);
      expect(d.reasons.some((r) => c.reason.test(r))).toBe(true);
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
  });
});
