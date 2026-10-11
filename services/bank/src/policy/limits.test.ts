// DECISIONS #27 — demo-scale tier limits (DEMO_FAST_MODE only), passed to the pure engine through context.
import { decodeCalls, transferTransaction } from '@keyline/chain';
import type { FastifyInstance } from 'fastify';
import { type Address, getAddress, type Hex } from 'viem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { metaTransactionToCall } from '../chain/calldata';
import { toSimulation } from '../chain/decode';
import { policyLimitsOf } from '../config';
import type { ChainDeps } from '../deps';
import { testConfig } from '../test-env';
import { evaluate, type PolicyLimits, PRODUCTION_LIMITS } from './engine';

const LUKAS = getAddress('0x00000000000000000000000000000000000001ec');
const DEMO: PolicyLimits = { ...PRODUCTION_LIMITS, dailyChf: 5, coolingChf: 50, demo: true };

describe('policyLimitsOf', () => {
  it.each([
    ['fast mode off ignores overrides', false, 5, 50, PRODUCTION_LIMITS],
    ['fast mode on + overrides', true, 5, 50, DEMO],
    ['fast mode on, no overrides', true, undefined, undefined, PRODUCTION_LIMITS],
    [
      'fast mode on, only the daily limit',
      true,
      5,
      undefined,
      { ...PRODUCTION_LIMITS, dailyChf: 5, demo: true },
    ],
  ])('%s', (_name, fast, daily, cooling, expected) => {
    expect(
      policyLimitsOf({
        DEMO_FAST_MODE: fast,
        POLICY_DAILY_LIMIT_CHF: daily,
        POLICY_COOLING_THRESHOLD_CHF: cooling,
      }),
    ).toEqual(expected);
  });
  it('testConfig wiring: env strings are parsed; fast mode off never overrides', () => {
    expect(
      testConfig({ POLICY_DAILY_LIMIT_CHF: '5', POLICY_COOLING_THRESHOLD_CHF: '50' }).policyLimits,
    ).toEqual(DEMO);
    expect(
      testConfig({ DEMO_FAST_MODE: 'false', POLICY_DAILY_LIMIT_CHF: '5', POLICY_COOLING_THRESHOLD_CHF: '50' })
        .policyLimits,
    ).toEqual(PRODUCTION_LIMITS);
  });
});

describe('engine tiers under both configurations', () => {
  const run = (limits: PolicyLimits | undefined, chfValue: number) =>
    evaluate(
      {
        id: 'd',
        kind: 'transfer',
        walletAddress: getAddress('0x00000000000000000000000000000000000a11ce'),
        calls: [],
        chfValue,
        recipientAddress: LUKAS,
        deviceLabel: 'p',
        requestedAt: new Date(),
      },
      {
        dailySpentChf: 0,
        sponsoredToday: 0,
        contacts: [
          {
            id: `ct_${LUKAS.slice(2).toLowerCase()}`,
            clientId: 'SQ-48213-LK',
            label: 'Lukas Meier',
            address: LUKAS,
            firstSeenAt: new Date().toISOString(),
            verifiedOwnership: true,
            trusted: true,
          },
        ],
        allowlist: [],
        screening: {
          counterparty: LUKAS,
          listsChecked: ['OFAC-SDN', 'SECO'],
          hit: false,
          simulatedHit: false,
          simulated: true,
        },
        simulation: { ok: true, assetChanges: [], decodedCalls: [], gasEstimate: '0', provider: 'fallback' },
        callsHash: `0x${'00'.repeat(32)}` as Hex,
        limits,
      },
    );

  it.each([
    // [config, CHF, verdict, tier, first reason]
    [
      'production',
      undefined,
      4,
      'approve',
      1,
      "Within your CHF 1'000.00 daily limit · no second approval needed",
    ],
    [
      'production',
      undefined,
      800,
      'approve',
      1,
      "Within your CHF 1'000.00 daily limit · no second approval needed",
    ],
    [
      'production',
      undefined,
      1_200,
      'step-up',
      2,
      "Above your CHF 1'000.00 daily limit (CHF 1'200.00 today) · confirm on your laptop with your Safety key",
    ],
    [
      'production',
      undefined,
      12_000,
      'cooling',
      3,
      "Above CHF 10'000.00 (CHF 12'000.00 today) · 60 s waiting period, you can cancel",
    ],
    [
      'demo',
      DEMO,
      4,
      'approve',
      1,
      "Within your demo daily limit of CHF 5.00 (production CHF 1'000.00) · no second approval needed",
    ],
    [
      'demo',
      DEMO,
      8,
      'step-up',
      2,
      "Above your demo daily limit of CHF 5.00 (production CHF 1'000.00) · CHF 8.00 today · your laptop must approve",
    ],
    [
      'demo',
      DEMO,
      60,
      'cooling',
      3,
      "Above the demo waiting-period threshold of CHF 50.00 (production CHF 10'000.00) · CHF 60.00 today · 60 s waiting period, you can cancel",
    ],
  ] as const)('%s · CHF %s → %s', (_c, limits, chf, verdict, tier, reason) => {
    const d = run(limits, chf);
    expect(d).toMatchObject({ verdict, tier });
    expect(d.reasons[0]).toBe(reason);
  });

  it('first transfer to a NEW address still cools in demo mode', () => {
    const d = evaluate(
      {
        id: 'n',
        kind: 'transfer',
        walletAddress: getAddress('0x00000000000000000000000000000000000a11ce'),
        calls: [],
        chfValue: 1,
        recipientAddress: getAddress('0x00000000000000000000000000000000000b0b00'),
        deviceLabel: 'p',
        requestedAt: new Date(),
      },
      {
        dailySpentChf: 0,
        sponsoredToday: 0,
        contacts: [],
        allowlist: [],
        screening: {
          counterparty: LUKAS,
          listsChecked: ['OFAC-SDN', 'SECO'],
          hit: false,
          simulatedHit: false,
          simulated: true,
        },
        simulation: { ok: true, assetChanges: [], decodedCalls: [], gasEstimate: '0', provider: 'fallback' },
        callsHash: `0x${'00'.repeat(32)}` as Hex,
        limits: DEMO,
      },
    );
    expect(d).toMatchObject({ verdict: 'cooling', tier: 3 });
    expect(d.reasons[0]).toMatch(/^First transfer to a new address/);
  });
});

describe('demo limits over HTTP', () => {
  let app: FastifyInstance;
  let wallet: Address;
  const dev = { 'x-device-label': 'Lea · phone' };
  const USDC = getAddress('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
  const chainStub: Partial<ChainDeps> = {
    walletHasCode: async () => true,
    onchainGuardians: async () => [],
    simulate: async ({ from, calls }) =>
      toSimulation({
        ok: true,
        assetChanges: [],
        decodedCalls: decodeCalls(calls, { wallet: from }),
        gasEstimate: '1',
        provider: 'fallback',
        simulated: true,
      }),
  };
  beforeAll(async () => {
    app = await buildApp(testConfig({ POLICY_DAILY_LIMIT_CHF: '5', POLICY_COOLING_THRESHOLD_CHF: '50' }), {
      logger: false,
      finalizer: false,
      screeningOffline: true,
      chain: chainStub,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: dev,
      payload: {
        pubKeyX: `0x${'0d0e'.repeat(16)}`,
        pubKeyY: `0x${'a11b'.repeat(16)}`,
        credentialId: 'cred-lim',
      },
    });
    wallet = res.json().address;
    app.db.prepare("UPDATE wallets SET status = 'deployed' WHERE address = ?").run(wallet);
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /me exposes the limits in force', async () => {
    const me = await app.inject({ method: 'GET', url: '/me', headers: dev });
    expect(me.json().limits).toEqual({
      dailyChf: 5,
      coolingChf: 50,
      productionDailyChf: 1000,
      productionCoolingChf: 10000,
      demo: true,
    });
  });

  it('a CHF 8 transfer to Lukas (known contact) is a step-up with both values in the reason', async () => {
    const lukas = (await app.inject({ method: 'GET', url: '/contacts' }))
      .json()
      .contacts.find((c: { label: string }) => c.label === 'Lukas Meier');
    const call = metaTransactionToCall(
      transferTransaction({ token: USDC, to: lukas.address, amount: 10_000_000n }),
    ); // 10 USDC = CHF 8
    const res = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: { kind: 'transfer', walletAddress: wallet, calls: [call], deviceLabel: 'Lea · phone' },
    });
    expect(res.json()).toMatchObject({ verdict: 'step-up', tier: 2, chfValue: 8 });
    expect(res.json().reasons[0]).toBe(
      "Above your demo daily limit of CHF 5.00 (production CHF 1'000.00) · CHF 8.00 today · your laptop must approve",
    );
  });
});
