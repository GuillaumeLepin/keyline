import { IDENTITY_VERDICT_TYPES, type IdentityVerdict, identityVerdictDomain } from '@keyline/shared';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { afterEach, describe, expect, it } from 'vitest';
import { type StubChainPort, stubChainPort } from './chain-port';
import { type GuardianConfig, GuardianConfigError, loadGuardianConfig } from './config';
import { type GuardianDb, openGuardianDb } from './db';
import { buildGuardianServer } from './server';

// Throwaway keys: one standing in for the bank verdict key, one for this guardian process.
const bankKey = generatePrivateKey();
const bank = privateKeyToAccount(bankKey);
const forger = privateKeyToAccount(generatePrivateKey());
const guardianKey = generatePrivateKey();
const guardian = privateKeyToAccount(guardianKey);

const CHAIN_ID = 84532;
const WALLET: Address = '0x1111111111111111111111111111111111111111';
const NEW_OWNER: Address = '0x2222222222222222222222222222222222222222';

const config: GuardianConfig = {
  kind: 'swissquote',
  port: 0,
  privateKey: guardianKey,
  guardianAddress: guardian.address,
  dbPath: ':memory:',
  bankVerdictAddress: bank.address,
  chainId: CHAIN_ID,
  rpcUrl: 'http://localhost:8545',
  recoveryModuleAddress: '0x949d01d424bE050D09C16025dd007CB59b3A8c66',
};

async function signVerdict(
  overrides: Partial<IdentityVerdict> & { signer?: typeof bank } = {},
): Promise<IdentityVerdict> {
  const { signer = bank, ...rest } = overrides;
  const base: Omit<IdentityVerdict, 'signature'> = {
    recoveryRequestId: 'req-1',
    wallet: WALLET,
    newOwner: NEW_OWNER,
    method: 'eid-simulated',
    emailOtpPassed: true,
    idCheckPassed: true,
    livenessPassed: true,
    verdict: 'pass',
    signedBy: 'bank',
    issuedAt: Math.floor(Date.now() / 1000),
    simulated: true,
    ...rest,
  };
  const signature = await signer.signTypedData({
    domain: identityVerdictDomain(CHAIN_ID),
    types: IDENTITY_VERDICT_TYPES,
    primaryType: 'IdentityVerdict',
    message: {
      recoveryRequestId: base.recoveryRequestId,
      wallet: base.wallet as Address,
      newOwner: base.newOwner as Address,
      method: base.method,
      verdict: base.verdict,
      issuedAt: BigInt(base.issuedAt),
    },
  });
  return { ...base, signature };
}

interface Harness {
  app: ReturnType<typeof buildGuardianServer>;
  db: GuardianDb;
  chain: StubChainPort;
  clock: { now: number };
}

const open: Harness[] = [];
afterEach(async () => {
  for (const h of open.splice(0)) {
    await h.app.close();
    h.db.close();
  }
});

function harness(
  opts: { guardians?: Address[]; approvals?: number; kind?: GuardianConfig['kind'] } = {},
): Harness {
  const clock = { now: Date.UTC(2026, 9, 5, 12, 0, 0) };
  const now = () => clock.now;
  const chain = stubChainPort({
    guardians: { [WALLET]: opts.guardians ?? [guardian.address] },
    threshold: 2,
    approvals: opts.approvals
      ? { [`${WALLET.toLowerCase()}|${NEW_OWNER.toLowerCase()}|1`]: opts.approvals }
      : {},
    now,
  });
  const db = openGuardianDb({ path: ':memory:', kind: opts.kind ?? 'swissquote', now });
  const app = buildGuardianServer({
    config: { ...config, kind: opts.kind ?? 'swissquote' },
    db,
    chain,
    now,
    logger: false,
  });
  const h = { app, db, chain, clock };
  open.push(h);
  return h;
}

async function post(h: Harness, verdict: IdentityVerdict, body: Record<string, unknown> = {}) {
  return h.app.inject({
    method: 'POST',
    url: '/recoveries',
    payload: {
      recoveryRequestId: verdict.recoveryRequestId,
      wallet: WALLET,
      newOwners: [NEW_OWNER],
      newThreshold: 1,
      identityVerdict: verdict,
      ...body,
    },
  });
}

describe('POST /recoveries — refusals', () => {
  it('forged verdict (wrong signer) → 403 and no chain call', async () => {
    const h = harness();
    const res = await post(h, await signVerdict({ signer: forger }));
    expect(res.statusCode).toBe(403);
    expect(res.json().reasons.join(' ')).toMatch(/does not recover to the bank verdict address/);
    expect(h.chain.confirmCalls).toHaveLength(0);
    expect(h.db.listEvents().map((e) => e.type)).toContain('recovery.refused');
  });

  it("verdict 'fail' (correctly signed) → 403", async () => {
    const h = harness();
    const res = await post(h, await signVerdict({ verdict: 'fail' }));
    expect(res.statusCode).toBe(403);
    expect(res.json().reasons.join(' ')).toMatch(/'fail', not 'pass'/);
    expect(h.chain.confirmCalls).toHaveLength(0);
  });

  it('verdict for another new owner cannot be replayed → 403', async () => {
    const h = harness();
    const v = await signVerdict({ newOwner: '0x3333333333333333333333333333333333333333' });
    const res = await post(h, v);
    expect(res.statusCode).toBe(403);
    expect(res.json().reasons.join(' ')).toMatch(/different new owner/);
  });

  it('this process not in the on-chain guardian list → 403', async () => {
    const h = harness({ guardians: [forger.address] });
    const res = await post(h, await signVerdict());
    expect(res.statusCode).toBe(403);
    expect(res.json().reasons.join(' ')).toMatch(/not an on-chain guardian/);
    expect(h.chain.confirmCalls).toHaveLength(0);
  });

  it('second request for the same wallet within 24 h after an EXECUTED one → 409; after 24 h → 200', async () => {
    const h = harness({ approvals: 1 }); // 1 + ours = threshold 2 → executes
    const first = await post(h, await signVerdict({ recoveryRequestId: 'req-A' }));
    expect(first.statusCode).toBe(200);
    expect(first.json().executed).toBe(true);

    h.clock.now += 60 * 60 * 1000; // 1 h later
    const second = await post(h, await signVerdict({ recoveryRequestId: 'req-B' }));
    expect(second.statusCode).toBe(409);
    expect(second.json().reasons.join(' ')).toMatch(/executed .* ago/);
    expect(h.chain.confirmCalls).toHaveLength(1);

    h.clock.now += 24 * 60 * 60 * 1000; // past the window
    const third = await post(h, await signVerdict({ recoveryRequestId: 'req-C' }));
    expect(third.statusCode).toBe(200);
  });

  it('a refused (not executed) attempt does NOT block a later real request', async () => {
    const h = harness();
    const thief = await post(h, await signVerdict({ recoveryRequestId: 'thief', verdict: 'fail' }));
    expect(thief.statusCode).toBe(403);
    const lea = await post(h, await signVerdict({ recoveryRequestId: 'lea' }));
    expect(lea.statusCode).toBe(200);
  });

  it('malformed body → 400', async () => {
    const h = harness();
    const res = await h.app.inject({ method: 'POST', url: '/recoveries', payload: { wallet: 'nope' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /recoveries — happy paths', () => {
  it('below threshold → execute:false and the port received exactly the expected call', async () => {
    const h = harness({ approvals: 0 });
    const res = await post(h, await signVerdict());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.confirmed).toBe(true);
    expect(body.executed).toBe(false);
    expect(body.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(h.chain.confirmCalls).toEqual([
      { wallet: WALLET, newOwners: [NEW_OWNER], newThreshold: 1, execute: false },
    ]);
    const confirmed = h.db.listEvents().find((e) => e.type === 'recovery.confirmed');
    expect(confirmed?.payload).toMatchObject({ simulated: true, executed: false });
  });

  it('reaching threshold → execute:true', async () => {
    const h = harness({ approvals: 1 });
    const res = await post(h, await signVerdict());
    expect(res.statusCode).toBe(200);
    expect(res.json().executed).toBe(true);
    expect(h.chain.confirmCalls[0]?.execute).toBe(true);
    expect(h.db.lastExecutedConfirmation(WALLET)?.executed).toBe(true);
  });

  it('same request id twice → identical 200, one chain call (idempotent)', async () => {
    const h = harness();
    const v = await signVerdict();
    const a = await post(h, v);
    const b = await post(h, v);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual(a.json());
    expect(h.chain.confirmCalls).toHaveLength(1);
    expect(h.db.listEvents().map((e) => e.type)).toContain('recovery.replayed');
  });
});

describe('POST /recoveries/:id/finalize', () => {
  it('before executeAfter → 409; after → 200 with txHash', async () => {
    const h = harness();
    const nowSec = Math.floor(h.clock.now / 1000);
    h.chain.setExecuted(WALLET, [NEW_OWNER], nowSec + 180);

    const early = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/finalize',
      payload: { wallet: WALLET },
    });
    expect(early.statusCode).toBe(409);
    expect(early.json().reasons.join(' ')).toMatch(/grace period not over/);
    expect(h.chain.finalizeCalls).toHaveLength(0);

    h.clock.now += 181 * 1000;
    const late = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/finalize',
      payload: { wallet: WALLET },
    });
    expect(late.statusCode).toBe(200);
    expect(late.json().txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(h.chain.finalizeCalls).toEqual([{ wallet: WALLET }]);
  });

  it('no body: wallet resolved from our own confirmation row; unknown id → 404', async () => {
    const h = harness({ approvals: 1 });
    const v = await signVerdict({ recoveryRequestId: 'req-exec' });
    expect((await post(h, v)).json().executed).toBe(true);
    h.clock.now += 181 * 1000;
    const ok = await h.app.inject({ method: 'POST', url: '/recoveries/req-exec/finalize' });
    expect(ok.statusCode).toBe(200);
    expect(h.chain.finalizeCalls).toEqual([{ wallet: WALLET }]);
    const unknown = await h.app.inject({ method: 'POST', url: '/recoveries/never-seen/finalize' });
    expect(unknown.statusCode).toBe(404);
  });

  it('nothing pending → 409', async () => {
    const h = harness();
    const res = await h.app.inject({
      method: 'POST',
      url: '/recoveries/x/finalize',
      payload: { wallet: WALLET },
    });
    expect(res.statusCode).toBe(409);
  });

  it('partner kind cannot finalize → 403', async () => {
    const h = harness({ kind: 'partner' });
    const res = await h.app.inject({
      method: 'POST',
      url: '/recoveries/x/finalize',
      payload: { wallet: WALLET },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('read endpoints', () => {
  it('/identity matches the schema and never leaks the key; /health names the stub', async () => {
    const h = harness();
    const id = await h.app.inject({ method: 'GET', url: '/identity' });
    expect(id.json()).toEqual({ kind: 'swissquote', guardianAddress: guardian.address, chainId: CHAIN_ID });
    expect(JSON.stringify(id.json())).not.toContain(guardianKey.slice(2));
    const health = await h.app.inject({ method: 'GET', url: '/health' });
    expect(health.json()).toMatchObject({
      ok: true,
      service: 'swissquote',
      chainPort: 'stub',
      dbPath: ':memory:',
    });
  });
});

describe('config loader', () => {
  const goodEnv: NodeJS.ProcessEnv = {
    GUARDIAN_KIND: 'swissquote',
    GUARDIAN_PORT: '4001',
    GUARDIAN_PRIVATE_KEY: guardianKey,
    GUARDIAN_DB_PATH: './data/test.sqlite',
    BANK_VERDICT_ADDRESS: bank.address,
    CHAIN_ID: '84532',
    RPC_URL: 'https://sepolia.base.org',
    RECOVERY_MODULE_ADDRESS: '0x949d01d424bE050D09C16025dd007CB59b3A8c66',
  };

  it('parses a clean environment and derives the guardian address', () => {
    const c = loadGuardianConfig(goodEnv);
    expect(c.guardianAddress).toBe(guardian.address);
    expect(c.port).toBe(4001);
  });

  it('throws when BANK_VERDICT_PRIVATE_KEY is present, without echoing its value', () => {
    const secret: Hex = generatePrivateKey();
    const bad = { ...goodEnv, BANK_VERDICT_PRIVATE_KEY: secret };
    let caught: unknown;
    try {
      loadGuardianConfig(bad);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GuardianConfigError);
    expect((caught as Error).message).toContain('BANK_VERDICT_PRIVATE_KEY');
    expect((caught as Error).message).not.toContain(secret.slice(2));
  });

  it('throws on WALLET_* variables too', () => {
    expect(() => loadGuardianConfig({ ...goodEnv, WALLET_RP_ID: 'localhost' })).toThrow(/WALLET_RP_ID/);
  });
});
