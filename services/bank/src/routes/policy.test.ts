// Wave 3 policy flows through fastify.inject: screening block, Tier-2 step-up with a real EIP-712 Safety-key
// signature (happy / wrong signer / wrong decision), Tier-3 cooling (cancel + auto-promote), dApp requests, /dapps.
import { counterfactualAddress, decodeCalls, transferTransaction } from '@keyline/chain';
import { DappsResponseSchema, PolicyDecisionSchema, policyStepUpTypedData } from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import { type Address, encodeFunctionData, erc20Abi, getAddress, type Hex, maxUint256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { metaTransactionToCall } from '../chain/calldata';
import { toSimulation } from '../chain/decode';
import type { ChainDeps } from '../deps';
import { testConfig } from '../test-env';

const X = `0x${'5678'.repeat(16)}` as Hex;
const Y = `0x${'dcba'.repeat(16)}` as Hex;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const DEMOSWAP = '0xDe305AA9000000000000000000000000000000dE' as Address;
const BAD = '0x0000000000000000000000000000000000000BAD' as Address;
const SQ_GUARDIAN = '0x01Bb0000000000000000000000000000000004dE' as Address;
const EMERGENCY = '0xd8f4000000000000000000000000000000000000' as Address;
const safetyKey = privateKeyToAccount(`0x${'44'.repeat(32)}`); // throwaway test vector
const otherKey = privateKeyToAccount(`0x${'55'.repeat(32)}`);
const phone = { 'x-device-label': 'Lea · phone' };
const laptop = { 'x-device-label': 'Lea · laptop' };

const state = { revert: undefined as string | undefined, codeAt: new Set<string>() };
const chainStub: Partial<ChainDeps> = {
  walletHasCode: async (a) => state.codeAt.has(a.toLowerCase()),
  onchainGuardians: async () => [EMERGENCY, SQ_GUARDIAN],
  simulate: async ({ from, calls }) =>
    toSimulation({
      ok: state.revert === undefined,
      revertReason: state.revert,
      assetChanges: [],
      decodedCalls: decodeCalls(calls, { wallet: from }),
      gasEstimate: '90000',
      provider: 'eth_simulateV1',
    }),
  guardianIdentity: async (kind) => ({ kind, guardianAddress: getAddress(SQ_GUARDIAN), chainId: 84532 }),
};

const transferCall = (to: Address, usdc: bigint) =>
  metaTransactionToCall(transferTransaction({ token: USDC, to, amount: usdc }));

describe('Wave 3 policy flows', () => {
  let app: FastifyInstance;
  let wallet: Address;
  let lukas: Address;
  let sanctioned: Address;

  const evaluate = (payload: Record<string, unknown>, headers = phone) =>
    app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers,
      payload: { deviceLabel: 'Lea · phone', ...payload },
    });

  beforeAll(async () => {
    app = await buildApp(testConfig(), {
      logger: false,
      chain: chainStub,
      screeningOffline: true,
      finalizer: false,
    });
    const w = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: phone,
      payload: { pubKeyX: X, pubKeyY: Y, credentialId: 'test-cred-wave3', deviceLabel: 'Lea · phone' },
    });
    wallet = w.json().address;
    expect(wallet).toBe(counterfactualAddress({ x: BigInt(X), y: BigInt(Y) }));
    // Recoverers: Safety key (laptop EOA we control), Emergency card, Swissquote.
    for (const payload of [
      { kind: 'safety-key', address: safetyKey.address },
      { kind: 'emergency-card', address: EMERGENCY },
      { kind: 'swissquote' },
    ]) {
      const g = await app.inject({
        method: 'POST',
        url: `/wallets/${wallet}/guardians`,
        headers: phone,
        payload,
      });
      expect(g.statusCode, g.body).toBe(201);
    }
    // The protect op is covered by the Wave 1 suite; here the Safe is "deployed" so transfers are allowed.
    app.db.prepare("UPDATE wallets SET status = 'deployed' WHERE lower(address) = lower(?)").run(wallet);
    const contacts = (await app.inject({ method: 'GET', url: '/contacts' })).json().contacts as {
      label: string;
      address: Address;
    }[];
    lukas = contacts.find((c) => c.label === 'Lukas Meier')?.address as Address;
    sanctioned = contacts.find((c) => c.label === 'Sanctioned test address')?.address as Address;
    expect(lukas).toBeDefined();
    expect(sanctioned).toBeDefined();
  });
  afterAll(async () => {
    await app.close();
  });

  it('screening: the seeded sanctioned contact → block, simulated test entry', async () => {
    const res = await evaluate({
      kind: 'transfer',
      walletAddress: wallet,
      calls: [transferCall(sanctioned, 50_000_000n)],
    });
    expect(res.statusCode, res.body).toBe(201);
    const d = PolicyDecisionSchema.parse(res.json());
    expect(d.verdict).toBe('block');
    expect(d.screening).toMatchObject({
      hit: true,
      source: 'seeded-test',
      simulatedHit: true,
      simulated: true,
    });
    expect(d.reasons[0]).toBe('Counterparty appears on the OFAC SDN list — simulated test entry');
    expect(d.sponsorship.sponsored).toBe(false);
    expect(d.simulation.provider).toBe('eth_simulateV1');
  });

  it('screening status endpoint reports the loaded list', async () => {
    const res = await app.inject({ method: 'GET', url: '/policy/screening' });
    expect(res.json()).toMatchObject({
      ofac: { source: 'snapshot' },
      listsChecked: ['OFAC-SDN', 'SECO'],
      simulated: true,
    });
    expect(res.json().ofac.count).toBeGreaterThanOrEqual(100);
  });

  it('simulation revert → block with the reason', async () => {
    state.revert = 'ERC20: transfer amount exceeds balance';
    const res = await evaluate({
      kind: 'transfer',
      walletAddress: wallet,
      calls: [transferCall(lukas, 50_000_000n)],
    });
    state.revert = undefined;
    expect(res.json()).toMatchObject({ verdict: 'block' });
    expect(res.json().reasons[0]).toBe(
      'This transaction would fail: ERC20: transfer amount exceeds balance · nothing was sent',
    );
  });

  describe('Tier 2 step-up', () => {
    let decisionId: string;

    it('CHF 2000 to Lukas → step-up, listed in pending-approvals', async () => {
      const res = await evaluate({
        kind: 'transfer',
        walletAddress: wallet,
        calls: [transferCall(lukas, 2_500_000_000n)],
      });
      expect(res.statusCode, res.body).toBe(201);
      const d = PolicyDecisionSchema.parse(res.json());
      expect(d).toMatchObject({
        verdict: 'step-up',
        tier: 2,
        chfValue: 2000,
        stepUp: {},
        status: 'open',
        recipientLabel: 'Lukas Meier',
      });
      expect(d.reasons[0]).toMatch(/Above your CHF 1'000.00 daily limit \(CHF 2'000.00 today\)/);
      decisionId = d.decisionId;
      const pending = await app.inject({
        method: 'GET',
        url: `/wallets/${wallet}/pending-approvals`,
        headers: laptop,
      });
      expect(pending.statusCode, pending.body).toBe(200);
      expect(pending.json().decisions.map((x: { decisionId: string }) => x.decisionId)).toContain(decisionId);
    });

    it('wrong signer (not the registered Safety key) → 403, decision unchanged', async () => {
      const d = (await app.inject({ method: 'GET', url: `/policy/${decisionId}`, headers: laptop })).json();
      const signature = await otherKey.signTypedData(policyStepUpTypedData(84532, d));
      const res = await app.inject({
        method: 'POST',
        url: `/policy/${decisionId}/step-up`,
        headers: laptop,
        payload: { kind: 'safety-key', signature, guardianAddress: otherKey.address },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/not this wallet's Safety key/);
      const bad = await otherKey.signTypedData(policyStepUpTypedData(84532, d));
      const res2 = await app.inject({
        method: 'POST',
        url: `/policy/${decisionId}/step-up`,
        headers: laptop,
        payload: { kind: 'safety-key', signature: bad },
      });
      expect(res2.statusCode).toBe(403);
      expect(res2.json().message).toBe('Signature is not from your Safety key');
      expect(
        (await app.inject({ method: 'GET', url: `/policy/${decisionId}`, headers: laptop })).json().verdict,
      ).toBe('step-up');
    });

    it('signature over a different decision → 403', async () => {
      const d = (await app.inject({ method: 'GET', url: `/policy/${decisionId}`, headers: laptop })).json();
      const signature = await safetyKey.signTypedData(
        policyStepUpTypedData(84532, { ...d, decisionId: 'dec_other' }),
      );
      const res = await app.inject({
        method: 'POST',
        url: `/policy/${decisionId}/step-up`,
        headers: laptop,
        payload: { kind: 'safety-key', signature },
      });
      expect(res.statusCode).toBe(403);
      // And the amount is bound too.
      const sig2 = await safetyKey.signTypedData(policyStepUpTypedData(84532, { ...d, chfValue: 20 }));
      const res2 = await app.inject({
        method: 'POST',
        url: `/policy/${decisionId}/step-up`,
        headers: laptop,
        payload: { kind: 'safety-key', signature: sig2 },
      });
      expect(res2.statusCode).toBe(403);
    });

    it('happy path: the Safety key signs KeylinePolicyStepUp → approve, satisfiedBy safety-key', async () => {
      const d = (await app.inject({ method: 'GET', url: `/policy/${decisionId}`, headers: laptop })).json();
      const signature = await safetyKey.signTypedData(policyStepUpTypedData(84532, d));
      const res = await app.inject({
        method: 'POST',
        url: `/policy/${decisionId}/step-up`,
        headers: laptop,
        payload: { kind: 'safety-key', signature, guardianAddress: safetyKey.address },
      });
      expect(res.statusCode, res.body).toBe(200);
      const ok = PolicyDecisionSchema.parse(res.json());
      expect(ok.verdict).toBe('approve');
      expect(ok.tier).toBe(2);
      expect(ok.stepUp).toMatchObject({
        satisfiedBy: 'safety-key',
        signature,
        guardianAddress: safetyKey.address,
      });
      expect(ok.reasons[0]).toBe('Approved by your Safety key · policy-layer enforcement in the prototype');
      expect(ok.callsHash).toBe(d.callsHash);
      // Persisted, out of the pending queue, and a second step-up is a 409.
      expect(
        (await app.inject({ method: 'GET', url: `/policy/${decisionId}`, headers: phone })).json().verdict,
      ).toBe('approve');
      const pending = await app.inject({
        method: 'GET',
        url: `/wallets/${wallet}/pending-approvals`,
        headers: laptop,
      });
      expect(pending.json().decisions.map((x: { decisionId: string }) => x.decisionId)).not.toContain(
        decisionId,
      );
      const again = await app.inject({
        method: 'POST',
        url: `/policy/${decisionId}/step-up`,
        headers: laptop,
        payload: { kind: 'safety-key', signature },
      });
      expect(again.statusCode).toBe(409);
    });

    it('step-up on a Tier-1 decision → 409 (nothing to approve)', async () => {
      const res = await evaluate({
        kind: 'transfer',
        walletAddress: wallet,
        calls: [transferCall(lukas, 10_000_000n)],
      });
      expect(res.json().verdict).toBe('approve');
      const d = res.json();
      const signature = await safetyKey.signTypedData(policyStepUpTypedData(84532, d));
      const up = await app.inject({
        method: 'POST',
        url: `/policy/${d.decisionId}/step-up`,
        headers: laptop,
        payload: { kind: 'safety-key', signature },
      });
      expect(up.statusCode).toBe(409);
    });
  });

  describe('Tier 3 cooling', () => {
    const stranger = '0x7777777777777777777777777777777777777777' as Address;

    it('first transfer to a new address → cooling 60 s; cancel → status cancelled, refused by /userops', async () => {
      const res = await evaluate({
        kind: 'transfer',
        walletAddress: wallet,
        calls: [transferCall(stranger, 5_000_000n)],
      });
      expect(res.statusCode, res.body).toBe(201);
      const d = PolicyDecisionSchema.parse(res.json());
      expect(d).toMatchObject({ verdict: 'cooling', tier: 3, status: 'open' });
      expect(new Date(d.coolingUntil ?? 0).getTime() - new Date(d.decidedAt).getTime()).toBe(60_000);
      expect(d.reasons[0]).toMatch(/First transfer to a new address · 60 s waiting period, you can cancel/);

      const cancel = await app.inject({
        method: 'POST',
        url: `/policy/${d.decisionId}/cancel`,
        headers: phone,
      });
      expect(cancel.statusCode, cancel.body).toBe(200);
      expect(cancel.json()).toMatchObject({ status: 'cancelled', verdict: 'cooling' });
      expect(cancel.json().cancelledAt).toBeDefined();
      // Idempotent, and never promotes afterwards even once coolingUntil has passed.
      app.db
        .prepare(
          "UPDATE policy_decisions SET decision_json = json_set(decision_json, '$.coolingUntil', ?) WHERE id = ?",
        )
        .run(new Date(Date.now() - 1000).toISOString(), d.decisionId);
      const again = await app.inject({
        method: 'POST',
        url: `/policy/${d.decisionId}/cancel`,
        headers: phone,
      });
      expect(again.statusCode).toBe(200);
      const read = await app.inject({ method: 'GET', url: `/policy/${d.decisionId}`, headers: phone });
      expect(read.json()).toMatchObject({ status: 'cancelled', verdict: 'cooling' });
      const sponsor = await app.inject({
        method: 'POST',
        url: '/userops/sponsor',
        headers: phone,
        payload: {
          decisionId: d.decisionId,
          userOp: {
            sender: wallet,
            nonce: '0x1',
            callData: '0x',
            callGasLimit: '0x1',
            verificationGasLimit: '0x1',
            preVerificationGas: '0x1',
            maxFeePerGas: '0x1',
            maxPriorityFeePerGas: '0x1',
            signature: '0x',
          },
        },
      });
      expect(sponsor.statusCode).toBe(403);
      expect(sponsor.json().message).toMatch(/cancelled/);
    });

    it('cooling auto-promotes to approve once coolingUntil has passed (on read)', async () => {
      const res = await evaluate({
        kind: 'transfer',
        walletAddress: wallet,
        calls: [transferCall(stranger, 6_000_000n)],
      });
      const d = PolicyDecisionSchema.parse(res.json());
      expect(d.verdict).toBe('cooling');
      expect(
        (await app.inject({ method: 'GET', url: `/policy/${d.decisionId}`, headers: phone })).json().verdict,
      ).toBe('cooling');
      app.db
        .prepare(
          "UPDATE policy_decisions SET decision_json = json_set(decision_json, '$.coolingUntil', ?) WHERE id = ?",
        )
        .run(new Date(Date.now() - 1000).toISOString(), d.decisionId);
      const read = await app.inject({ method: 'GET', url: `/policy/${d.decisionId}`, headers: phone });
      expect(read.json()).toMatchObject({ verdict: 'approve', tier: 3, status: 'open' });
      expect(read.json().reasons[0]).toMatch(/Waiting period over/);
      // Persisted: the verdict column is updated too, and the event is recorded.
      const row = app.db.prepare('SELECT verdict FROM policy_decisions WHERE id = ?').get(d.decisionId) as {
        verdict: string;
      };
      expect(row.verdict).toBe('approve');
      const ev = await app.inject({ method: 'GET', url: `/wallets/${wallet}/events`, headers: phone });
      expect(JSON.stringify(ev.json())).toMatch(/policy.cooling-elapsed/);
      // Cancel is refused once approved.
      const cancel = await app.inject({
        method: 'POST',
        url: `/policy/${d.decisionId}/cancel`,
        headers: phone,
      });
      expect(cancel.statusCode).toBe(409);
    });

    it('> CHF 10 000 to a known contact → cooling Tier 3', async () => {
      const res = await evaluate({
        kind: 'transfer',
        walletAddress: wallet,
        calls: [transferCall(lukas, 13_000_000_000n)],
      });
      expect(res.json()).toMatchObject({ verdict: 'cooling', tier: 3, chfValue: 10400 });
      expect(res.json().reasons[0]).toMatch(/Above CHF 10'000.00 \(CHF 10'400.00 today\)/);
    });
  });

  describe('dApps', () => {
    it('GET /dapps lists the allowlist with DemoSwap approve(∞) and the blocked Unknown dApp', async () => {
      const res = await app.inject({ method: 'GET', url: '/dapps' });
      const { dapps } = DappsResponseSchema.parse(res.json());
      const demo = dapps.find((d) => d.id === 'demoswap');
      expect(demo).toMatchObject({ allowlisted: true, simulated: true });
      expect(demo?.demoRequest?.calls[0]?.to).toBe(USDC);
      expect(demo?.demoRequest?.calls[0]?.data).toBe(
        encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [DEMOSWAP, maxUint256] }),
      );
      const unknown = dapps.find((d) => d.id === 'unknown-dapp');
      expect(unknown).toMatchObject({ allowlisted: false, simulated: true });
      expect(unknown?.demoRequest?.calls[0]?.to).toBe(getAddress(BAD));
      expect(dapps.find((d) => d.id === 'uniswap')?.allowlisted).toBe(true);
    });

    it('DemoSwap approve(∞) → step-up with the danger decode and a 100 USDC suggested cap', async () => {
      const { dapps } = (await app.inject({ method: 'GET', url: '/dapps' })).json();
      const demo = dapps.find((d: { id: string }) => d.id === 'demoswap');
      const res = await evaluate({
        kind: 'dapp',
        dappId: 'demoswap',
        walletAddress: wallet,
        calls: demo.demoRequest.calls,
      });
      expect(res.statusCode, res.body).toBe(201);
      const d = PolicyDecisionSchema.parse(res.json());
      expect(d).toMatchObject({ verdict: 'step-up', tier: 2, kind: 'dapp', dappId: 'demoswap', chfValue: 0 });
      expect(d.simulation.decodedCalls[0]).toMatchObject({ fn: 'approve(address,uint256)', risk: 'danger' });
      expect(d.simulation.decodedCalls[0]?.humanText).toMatch(/unlimited amount of USDC/);
      expect(d.reasons[0]).toBe('Unlimited approvals need your Safety key');
      expect(d.reasons).toContain('Approve 100.00 USDC instead');
      expect(d.suggestedCap).toMatchObject({
        amount: '100',
        symbol: 'USDC',
        humanText: 'Approve 100.00 USDC instead',
      });
      expect(d.suggestedCap?.call.to).toBe(USDC);
      expect(d.suggestedCap?.call.data).toBe(
        encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [DEMOSWAP, 100_000_000n] }),
      );
      // Screening looked at the spender, not only the token contract.
      expect(d.screening.counterparty).toBe(DEMOSWAP);
    });

    it('the suggested cap resubmitted → Tier 1 approve', async () => {
      const { dapps } = (await app.inject({ method: 'GET', url: '/dapps' })).json();
      const demo = dapps.find((d: { id: string }) => d.id === 'demoswap');
      const first = await evaluate({
        kind: 'dapp',
        dappId: 'demoswap',
        walletAddress: wallet,
        calls: demo.demoRequest.calls,
      });
      const res = await evaluate({
        kind: 'dapp',
        dappId: 'demoswap',
        walletAddress: wallet,
        calls: [first.json().suggestedCap.call],
      });
      expect(res.json()).toMatchObject({ verdict: 'approve', tier: 1 });
      expect(res.json().simulation.decodedCalls[0]).toMatchObject({ risk: 'warn' });
      expect(res.json().suggestedCap).toBeUndefined();
      expect(res.json().reasons[0]).toMatch(/DemoSwap is reviewed by Swissquote/);
    });

    it('Unknown dApp → block "request a review"; allowlisted dApp calling a foreign contract → block', async () => {
      const { dapps } = (await app.inject({ method: 'GET', url: '/dapps' })).json();
      const unknown = dapps.find((d: { id: string }) => d.id === 'unknown-dapp');
      const res = await evaluate({
        kind: 'dapp',
        dappId: 'unknown-dapp',
        walletAddress: wallet,
        calls: unknown.demoRequest.calls,
      });
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json()).toMatchObject({ verdict: 'block', sponsorship: { sponsored: false } });
      expect(res.json().reasons[0]).toBe('Unknown dApp — request a review');
      const foreign = await evaluate({
        kind: 'dapp',
        dappId: 'demoswap',
        walletAddress: wallet,
        calls: [{ to: BAD, value: '0', data: '0xdeadbeef' }],
      });
      expect(foreign.json().verdict).toBe('block');
      const missing = await evaluate({
        kind: 'dapp',
        walletAddress: wallet,
        calls: unknown.demoRequest.calls,
      });
      expect(missing.statusCode).toBe(400);
    });
  });

  it('a Safe deployed outside the bank relay is detected via eth_getCode before refusing (qa-demo fix)', async () => {
    const X2 = `0x${'9999'.repeat(16)}` as Hex;
    const Y2 = `0x${'8888'.repeat(16)}` as Hex;
    const w = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: phone,
      payload: { pubKeyX: X2, pubKeyY: Y2, credentialId: 'test-cred-external', deviceLabel: 'Lea · phone' },
    });
    const external = w.json().address as Address;
    // Still pending in the registry and no code on chain → 409 as before.
    const before = await app.inject({
      method: 'GET',
      url: `/attestations/${external}/challenge`,
      headers: phone,
    });
    expect(before.statusCode).toBe(409);
    expect(before.json().message).toMatch(/Protect your wallet first/);
    // The Safe appears on chain (deployed by another relay) → the registry catches up and the challenge is issued.
    state.codeAt.add(external.toLowerCase());
    const after = await app.inject({
      method: 'GET',
      url: `/attestations/${external}/challenge`,
      headers: phone,
    });
    expect(after.statusCode, after.body).toBe(200);
    expect(after.json().nonce).toMatch(/^0x[0-9a-f]{64}$/);
    const row = app.db
      .prepare('SELECT status FROM wallets WHERE lower(address) = lower(?)')
      .get(external) as { status: string };
    expect(row.status).toBe('deployed');
    const ev = await app.inject({ method: 'GET', url: `/wallets/${external}/events`, headers: phone });
    expect(JSON.stringify(ev.json())).toMatch(/wallet.deployed-externally/);
    expect(JSON.stringify(ev.json())).toContain(getAddress(EMERGENCY));
    // Transfers are no longer refused with "Protect your wallet before sending".
    const t = await evaluate({
      kind: 'transfer',
      walletAddress: external,
      calls: [transferCall(lukas, 1_000_000n)],
    });
    expect(t.statusCode, t.body).toBe(201);
  });

  it('every decision carries the sponsorship counter and GET /me agrees', async () => {
    const res = await evaluate({
      kind: 'transfer',
      walletAddress: wallet,
      calls: [transferCall(lukas, 1_000_000n)],
    });
    expect(res.json().sponsorship).toEqual({ sponsored: true, remainingToday: 19, dailyCap: 20 });
    const me = await app.inject({ method: 'GET', url: '/me', headers: phone });
    expect(me.json().account).toMatchObject({ sponsoredToday: 0, sponsoredDailyCap: 20 });
  });
});
