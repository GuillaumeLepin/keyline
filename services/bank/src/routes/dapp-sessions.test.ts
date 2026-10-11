// SPEC §11.3 — WalletConnect sessions: identity verdict, approve/refuse/disconnect, request log, and the policy rules.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeCalls, transferTransaction } from '@keyline/chain';
import type { FastifyInstance } from 'fastify';
import { type Address, encodeFunctionData, erc20Abi, getAddress, type Hex, parseAbi } from 'viem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { metaTransactionToCall } from '../chain/calldata';
import { toSimulation } from '../chain/decode';
import { openDb } from '../db';
import type { ChainDeps } from '../deps';
import { createEventStore } from '../events';
import {
  dappIdentity,
  hostOf,
  REASON_DAPP_FIRST_TIME,
  REASON_DAPP_IDENTITY,
  REASON_DAPP_UNVERIFIED,
} from '../policy/dapp-identity';
import { evaluate } from '../policy/engine';
import { loadAllowlist, sanctionedSeedAddress, seed } from '../seed';
import { testConfig } from '../test-env';

const USDC = getAddress('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
const RECIPIENT = getAddress('0x00000000000000000000000000000000000c0FFE');
const dev = { 'x-device-label': 'Lea · phone' };
const topicOf = (n: number) => n.toString(16).padStart(64, '0');
const sim = { revert: undefined as string | undefined };
const chainStub: Partial<ChainDeps> = {
  walletHasCode: async () => true,
  onchainGuardians: async () => [],
  simulate: async ({ from, calls }) =>
    toSimulation({
      ok: sim.revert === undefined,
      revertReason: sim.revert,
      assetChanges: [],
      decodedCalls: decodeCalls(calls, { wallet: from }),
      gasEstimate: '90000',
      provider: 'fallback',
      simulated: true,
    }),
};

describe('dApp identity (pure)', () => {
  const allowlist = loadAllowlist();
  const verify = (validation: 'VALID' | 'INVALID' | 'UNKNOWN', origin: string, isScam = false) => ({
    validation,
    origin,
    isScam,
  });
  it('hosts compare with ports, case-insensitively', () => {
    expect(hostOf('http://localhost:3100/swap')).toBe('localhost:3100');
    expect(hostOf('HTTPS://Lab.Reown.com')).toBe('lab.reown.com');
    expect(hostOf('not a url at all')).toBeNull();
  });
  it('allowlisted by url host (DemoSwap :3100, Reown Lab, AppKit Lab) even when Verify says UNKNOWN', () => {
    for (const url of ['http://localhost:3100', 'https://lab.reown.com', 'https://appkit-lab.reown.com']) {
      const id = dappIdentity({ name: 'X', url, verify: verify('UNKNOWN', url) }, allowlist);
      expect(id).toMatchObject({ level: 'allowlisted', verdict: 'allow', allowlisted: true });
    }
  });
  it('VALID not allowlisted → verified ("First time"); UNKNOWN → unverified', () => {
    const v = dappIdentity(
      { name: 'X', url: 'https://x.example', verify: verify('VALID', 'https://x.example') },
      allowlist,
    );
    expect(v).toMatchObject({ level: 'verified', verdict: 'allow', reasons: [REASON_DAPP_FIRST_TIME] });
    const u = dappIdentity(
      { name: 'X', url: 'https://x.example', verify: verify('UNKNOWN', 'https://x.example') },
      allowlist,
    );
    expect(u).toMatchObject({ level: 'unverified', verdict: 'allow', reasons: [REASON_DAPP_UNVERIFIED] });
  });
  it('INVALID, isScam, origin mismatch → blocked, even for an allowlisted url', () => {
    const cases = [
      verify('INVALID', 'http://localhost:3100'),
      verify('VALID', 'http://localhost:3100', true),
      verify('VALID', 'https://evil.example'),
    ];
    for (const c of cases) {
      const id = dappIdentity({ name: 'DemoSwap', url: 'http://localhost:3100', verify: c }, allowlist);
      expect(id.verdict).toBe('block');
      expect(id.reasons[0]).toBe(REASON_DAPP_IDENTITY);
    }
  });
  it('engine: a blocked identity blocks; allowlisted is tier by amount; others are Tier 2', () => {
    const base = {
      id: 'd',
      kind: 'dapp' as const,
      walletAddress: RECIPIENT,
      calls: [],
      chfValue: 10,
      recipientAddress: RECIPIENT,
      deviceLabel: 'p',
      requestedAt: new Date(),
    };
    const ctx = {
      dailySpentChf: 0,
      sponsoredToday: 0,
      contacts: [],
      allowlist,
      screening: {
        counterparty: RECIPIENT,
        listsChecked: ['OFAC-SDN', 'SECO'] as ['OFAC-SDN', 'SECO'],
        hit: false,
        simulatedHit: false,
        simulated: true as const,
      },
      simulation: {
        ok: true,
        assetChanges: [],
        decodedCalls: [],
        gasEstimate: '0',
        provider: 'fallback' as const,
      },
      callsHash: `0x${'00'.repeat(32)}` as Hex,
    };
    const blocked = dappIdentity(
      { name: 'Bad', url: 'https://bad.example', verify: verify('INVALID', 'https://bad.example') },
      allowlist,
    );
    expect(evaluate(base, { ...ctx, session: { name: 'Bad', identity: blocked } })).toMatchObject({
      verdict: 'block',
      reasons: expect.arrayContaining([REASON_DAPP_IDENTITY]),
      sponsorship: { sponsored: false },
    });
    const ok = dappIdentity(
      { name: 'DemoSwap', url: 'http://localhost:3100', verify: verify('UNKNOWN', 'http://localhost:3100') },
      allowlist,
    );
    expect(evaluate(base, { ...ctx, session: { name: 'DemoSwap', identity: ok } })).toMatchObject({
      verdict: 'approve',
      tier: 1,
    });
    expect(
      evaluate({ ...base, chfValue: 2_000 }, { ...ctx, session: { name: 'DemoSwap', identity: ok } }),
    ).toMatchObject({
      verdict: 'step-up',
      tier: 2,
    });
    expect(
      evaluate({ ...base, chfValue: 20_000 }, { ...ctx, session: { name: 'DemoSwap', identity: ok } }),
    ).toMatchObject({
      verdict: 'cooling',
      tier: 3,
    });
  });
});

describe('dApp sessions over HTTP (SPEC §11.3)', () => {
  let app: FastifyInstance;
  let wallet: Address;

  const propose = (n: number, url: string, verify: Record<string, unknown>, name = 'App') =>
    app.inject({
      method: 'POST',
      url: '/dapp-sessions',
      headers: dev,
      payload: { topic: topicOf(n), walletAddress: wallet, name, url, icons: [`${url}/icon.png`], verify },
    });
  const evaluateDapp = (topic: string, calls: { to: string; value: string; data: string }[]) =>
    app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: { kind: 'dapp', topic, walletAddress: wallet, calls, deviceLabel: 'Lea · phone' },
    });
  const usdcTransfer = (amount: bigint, to: Address = RECIPIENT) =>
    metaTransactionToCall(transferTransaction({ token: USDC, to, amount }));

  beforeAll(async () => {
    app = await buildApp(testConfig(), {
      logger: false,
      chain: chainStub,
      screeningOffline: true,
      finalizer: false,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: dev,
      payload: {
        pubKeyX: `0x${'7e57'.repeat(16)}`,
        pubKeyY: `0x${'d4a9'.repeat(16)}`,
        credentialId: 'cred-wc',
      },
    });
    wallet = res.json().address;
    app.db.prepare("UPDATE wallets SET status = 'deployed' WHERE address = ?").run(wallet);
  });
  afterAll(async () => {
    await app.close();
  });

  it('proposal of an allowlisted app → allow; idempotent per topic; needs a client', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/dapp-sessions',
          payload: {
            topic: topicOf(1),
            walletAddress: wallet,
            name: 'x',
            url: 'http://x',
            verify: { validation: 'VALID', origin: 'http://x' },
          },
        })
      ).statusCode,
    ).toBe(401);
    const verify = { validation: 'UNKNOWN', isScam: false, origin: 'http://localhost:3100' };
    const res = await propose(1, 'http://localhost:3100', verify, 'DemoSwap');
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      verdict: 'allow',
      session: {
        status: 'proposed',
        allowlisted: true,
        dappId: 'demoswap-wc',
        requests: 0,
        name: 'DemoSwap',
      },
    });
    const again = await propose(1, 'http://localhost:3100', verify, 'DemoSwap');
    expect(again.statusCode).toBe(200);
  });

  it('scam / INVALID / origin mismatch → block with the SPEC reason; approve is refused', async () => {
    const cases = [
      { validation: 'VALID', isScam: true, origin: 'https://scam.example' },
      { validation: 'INVALID', isScam: false, origin: 'https://scam.example' },
      { validation: 'VALID', isScam: false, origin: 'https://evil.example' },
    ];
    for (const [i, verify] of cases.entries()) {
      const res = await propose(10 + i, 'https://scam.example', verify);
      expect(res.json().verdict).toBe('block');
      expect(res.json().reasons[0]).toBe("This app's identity could not be verified");
      const approve = await app.inject({
        method: 'POST',
        url: `/dapp-sessions/${topicOf(10 + i)}/approve`,
        headers: dev,
      });
      expect(approve.statusCode).toBe(403);
      expect(approve.json().message).toBe("This app's identity could not be verified");
    }
  });

  it('approve → active; refuse → refused (cannot be approved later); unknown topic 404', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: `/dapp-sessions/${topicOf(1)}/approve`,
      headers: dev,
    });
    expect(ok.json()).toMatchObject({ status: 'active' });
    await propose(2, 'https://first.example', { validation: 'VALID', origin: 'https://first.example' });
    const refused = await app.inject({
      method: 'POST',
      url: `/dapp-sessions/${topicOf(2)}/refuse`,
      headers: dev,
    });
    expect(refused.json().status).toBe('refused');
    expect(
      (await app.inject({ method: 'POST', url: `/dapp-sessions/${topicOf(2)}/approve`, headers: dev }))
        .statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ method: 'POST', url: `/dapp-sessions/${topicOf(999)}/approve`, headers: dev }))
        .statusCode,
    ).toBe(404);
  });

  it('policy: allowlisted session → tier by amount (Tier 1 small, Tier 2 above the daily limit), sponsored', async () => {
    const small = await evaluateDapp(topicOf(1), [usdcTransfer(100_000_000n)]); // CHF 80
    expect(small.statusCode, small.body).toBe(201);
    expect(small.json()).toMatchObject({
      verdict: 'approve',
      tier: 1,
      topic: topicOf(1),
      dappName: 'DemoSwap',
    });
    expect(small.json().reasons[0]).toMatch(/^DemoSwap is reviewed by Swissquote/);
    expect(small.json().sponsorship.sponsored).toBe(true);
    const big = await evaluateDapp(topicOf(1), [usdcTransfer(1_500_000_000n)]); // CHF 1'200
    expect(big.json()).toMatchObject({ verdict: 'step-up', tier: 2 });
    // dappId = topic is accepted too (SPEC §11.2 wording).
    const viaDappId = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'dapp',
        dappId: topicOf(1),
        walletAddress: wallet,
        calls: [usdcTransfer(1n)],
        deviceLabel: 'p',
      },
    });
    expect(viaDappId.json()).toMatchObject({ verdict: 'approve', topic: topicOf(1) });
  });

  it('policy: VALID not allowlisted → Tier 2 "First time with this app"; UNKNOWN → Tier 2 "domain isn\'t verified"', async () => {
    await propose(3, 'https://new.example', { validation: 'VALID', origin: 'https://new.example' }, 'NewApp');
    await app.inject({ method: 'POST', url: `/dapp-sessions/${topicOf(3)}/approve`, headers: dev });
    const first = await evaluateDapp(topicOf(3), [usdcTransfer(1_000_000n)]);
    expect(first.json()).toMatchObject({ verdict: 'step-up', tier: 2 });
    expect(first.json().reasons[0]).toBe('First time with this app');
    expect(first.json().sponsorship.sponsored).toBe(true);

    await propose(4, 'https://unknown.example', { validation: 'UNKNOWN', origin: 'https://unknown.example' });
    await app.inject({ method: 'POST', url: `/dapp-sessions/${topicOf(4)}/approve`, headers: dev });
    const unknown = await evaluateDapp(topicOf(4), [usdcTransfer(1_000_000n)]);
    expect(unknown.json()).toMatchObject({ verdict: 'step-up', tier: 2 });
    expect(unknown.json().reasons[0]).toBe("This app's domain isn't verified");
  });

  it('policy: a sanctioned address anywhere in the calldata blocks — decoded args AND unknown-ABI words', async () => {
    const sanctioned = getAddress(sanctionedSeedAddress(app.db) as string);
    const approve = {
      to: USDC,
      value: '0',
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [sanctioned, 1n] }),
    };
    const a = await evaluateDapp(topicOf(1), [approve]);
    expect(a.json().verdict).toBe('block');
    expect(a.json().screening).toMatchObject({ hit: true, counterparty: sanctioned });
    // An ABI the bank does not know: the address sits in the 3rd word of a multicall-ish payload.
    const opaque = {
      to: getAddress('0x00000000000000000000000000000000000BEEF1'),
      value: '0',
      data: encodeFunctionData({
        abi: parseAbi(['function route(uint256 amount, uint256 deadline, address[] path)']),
        functionName: 'route',
        args: [5n, 1_900_000_000n, [USDC, sanctioned]],
      }),
    };
    const b = await evaluateDapp(topicOf(1), [opaque]);
    expect(b.json().verdict).toBe('block');
    expect(b.json().reasons[0]).toMatch(/OFAC SDN/);
    // Unsanctioned opaque payload from the same allowlisted app is fine.
    const clean = {
      ...opaque,
      data: opaque.data.replace(sanctioned.slice(2).toLowerCase(), RECIPIENT.slice(2).toLowerCase()),
    };
    expect((await evaluateDapp(topicOf(1), [clean])).json().verdict).toBe('approve');
  });

  it('live bug: DemoSwap eth_sendTransaction USDC transfer to the seeded sanctioned address — sanctions block wins over a revert', async () => {
    // Exactly the live request: the configured seeded test address, 1 USDC, insufficient balance in the simulation.
    const sanctioned = getAddress('0x42b16056ee5e2C9bDE34Db76fdb2FA7554Ab0A73');
    expect(getAddress(sanctionedSeedAddress(app.db) as string)).toBe(sanctioned);
    sim.revert = 'ERC20: transfer amount exceeds balance';
    const res = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'dapp',
        topic: topicOf(1),
        origin: 'http://localhost:3100',
        walletAddress: wallet,
        calls: [usdcTransfer(1_000_000n, sanctioned)],
        deviceLabel: 'Lea · phone',
      },
    });
    sim.revert = undefined;
    expect(res.statusCode, res.body).toBe(201);
    const d = res.json();
    expect(d.verdict).toBe('block');
    expect(d.reasons[0]).toBe('Counterparty appears on the OFAC SDN list — simulated test entry');
    expect(d.reasons.join(' ')).not.toMatch(/would fail/);
    expect(d.screening).toMatchObject({
      hit: true,
      counterparty: sanctioned,
      source: 'seeded-test',
      simulatedHit: true,
    });
    expect(d.recipientAddress).toBe(sanctioned);
    expect(d.sponsorship.sponsored).toBe(false);
  });

  it('a bank whose DB holds an older random test address still flags the configured one (QA :4100 vs dev :4000)', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'keyline-sanctioned-')), 'old.sqlite');
    const old = openDb(path);
    seed(old, createEventStore(old)); // legacy behaviour: random address
    const legacy = getAddress(sanctionedSeedAddress(old) as string);
    old.close();
    const other = await buildApp(testConfig(), {
      dbPath: path,
      logger: false,
      chain: chainStub,
      screeningOffline: true,
      finalizer: false,
    });
    try {
      const status = await other.inject({ method: 'GET', url: '/policy/screening' });
      const seeded = (status.json().seeded as { address: string }[]).map((s) => s.address);
      expect(seeded).toEqual(expect.arrayContaining([legacy, '0x42b16056ee5e2C9bDE34Db76fdb2FA7554Ab0A73']));
    } finally {
      await other.close();
    }
  });

  it('request log: counts, de-duplicates by requestId, lists in the detail; topic mismatch 400', async () => {
    const body = {
      topic: topicOf(1),
      method: 'eth_sendTransaction',
      summary: 'Send 0.10 USDC',
      outcome: 'approved',
      requestId: 42,
      txHash: `0x${'ab'.repeat(32)}`,
    };
    const one = await app.inject({
      method: 'POST',
      url: `/dapp-sessions/${topicOf(1)}/events`,
      headers: dev,
      payload: body,
    });
    expect(one.statusCode, one.body).toBe(200);
    expect(one.json()).toMatchObject({ requests: 1 });
    expect(one.json().lastRequestAt).toBeDefined();
    const dup = await app.inject({
      method: 'POST',
      url: `/dapp-sessions/${topicOf(1)}/events`,
      headers: dev,
      payload: body,
    });
    expect(dup.json().requests).toBe(1);
    await app.inject({
      method: 'POST',
      url: `/dapp-sessions/${topicOf(1)}/events`,
      headers: dev,
      payload: {
        topic: topicOf(1),
        method: 'personal_sign',
        summary: 'Sign in to localhost:3100',
        outcome: 'expired',
      },
    });
    const bad = await app.inject({
      method: 'POST',
      url: `/dapp-sessions/${topicOf(1)}/events`,
      headers: dev,
      payload: { ...body, topic: topicOf(2) },
    });
    expect(bad.statusCode).toBe(400);
    const detail = await app.inject({ method: 'GET', url: `/dapp-sessions/${topicOf(1)}`, headers: dev });
    expect(detail.json().session.requests).toBe(2);
    expect(detail.json().requests.map((r: { outcome: string }) => r.outcome)).toEqual([
      'expired',
      'approved',
    ]);
  });

  it('disconnect → later requests are refused; list by wallet; every step is a bank event', async () => {
    const del = await app.inject({ method: 'DELETE', url: `/dapp-sessions/${topicOf(1)}`, headers: dev });
    expect(del.json().status).toBe('disconnected');
    const after = await evaluateDapp(topicOf(1), [usdcTransfer(1n)]);
    expect(after.statusCode).toBe(403);
    expect(after.json().message).toMatch(/not connected/);
    const list = await app.inject({ method: 'GET', url: `/dapp-sessions?wallet=${wallet}`, headers: dev });
    const byTopic = Object.fromEntries(
      (list.json().sessions as { topic: string; status: string; verdict: string }[]).map((s) => [s.topic, s]),
    );
    expect(byTopic[topicOf(1)]).toMatchObject({ status: 'disconnected' });
    expect(byTopic[topicOf(2)]).toMatchObject({ status: 'refused' });
    expect(byTopic[topicOf(10)]).toMatchObject({ status: 'proposed', verdict: 'block' });
    const other = `0x${'12'.repeat(20)}`;
    expect(
      (await app.inject({ method: 'GET', url: `/dapp-sessions?wallet=${other}`, headers: dev })).statusCode,
    ).toBe(404);

    const ev = await app.inject({
      method: 'GET',
      url: '/desk/events',
      headers: { 'x-operator-token': 'desk-test-token' },
    });
    const types = new Set((ev.json().events as { type: string }[]).map((e) => e.type));
    for (const t of [
      'dapp.proposed',
      'dapp.approved',
      'dapp.refused',
      'dapp.approve-refused',
      'dapp.request',
      'dapp.disconnected',
    ])
      expect(types.has(t), t).toBe(true);
  });
});
