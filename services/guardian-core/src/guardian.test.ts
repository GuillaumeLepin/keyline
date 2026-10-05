import { recoveryTypedData } from '@keyline/chain';
import { IDENTITY_VERDICT_TYPES, type IdentityVerdict, identityVerdictDomain } from '@keyline/shared';
import type { Address, Hex } from 'viem';
import { recoverTypedDataAddress, verifyTypedData } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { afterEach, describe, expect, it } from 'vitest';
import { type StubChainPort, stubChainPort } from './chain-port';
import { chainPortFromConfig } from './chain-real';
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
const MODULE: Address = '0x949d01d424bE050D09C16025dd007CB59b3A8c66';
const WALLET: Address = '0x1111111111111111111111111111111111111111';
const NEW_OWNER: Address = '0x2222222222222222222222222222222222222222';
const TX: Hex = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const config: GuardianConfig = {
  kind: 'swissquote',
  port: 0,
  privateKey: guardianKey,
  guardianAddress: guardian.address,
  dbPath: ':memory:',
  bankVerdictAddress: bank.address,
  chainId: CHAIN_ID,
  rpcUrl: 'http://localhost:8545',
  recoveryModuleAddress: MODULE,
  confirmMode: 'onchain',
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
  opts: {
    guardians?: Address[];
    approvals?: number;
    kind?: GuardianConfig['kind'];
    mode?: GuardianConfig['confirmMode'];
    nonce?: bigint;
  } = {},
): Harness {
  const clock = { now: Date.UTC(2026, 9, 5, 12, 0, 0) };
  const now = () => clock.now;
  const chain = stubChainPort({
    guardians: { [WALLET]: opts.guardians ?? [guardian.address] },
    threshold: 2,
    approvals: opts.approvals
      ? { [`${WALLET.toLowerCase()}|${NEW_OWNER.toLowerCase()}|1`]: opts.approvals }
      : {},
    nonces: opts.nonce !== undefined ? { [WALLET]: opts.nonce } : {},
    now,
  });
  const db = openGuardianDb({ path: ':memory:', kind: opts.kind ?? 'swissquote', now });
  const app = buildGuardianServer({
    config: { ...config, kind: opts.kind ?? 'swissquote', confirmMode: opts.mode ?? 'onchain' },
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

describe('POST /recoveries — onchain mode (GUARDIAN_CONFIRM_MODE=onchain)', () => {
  it('below threshold → execute:false and the port received exactly the expected call', async () => {
    const h = harness({ approvals: 0 });
    const res = await post(h, await signVerdict());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.confirmed).toBe(true);
    expect(body.mode).toBe('onchain');
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

describe('POST /recoveries — signature mode (default, DECISIONS #15 Option A)', () => {
  it('returns an EIP-712 ExecuteRecovery signature that recovers to the guardian address, no tx', async () => {
    const h = harness({ mode: 'signature', nonce: 7n });
    const res = await post(h, await signVerdict());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      confirmed: true,
      mode: 'signature',
      guardianAddress: guardian.address,
      nonce: '7',
      executed: false,
    });
    expect(body.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(body.txHash).toBeUndefined();
    expect(h.chain.confirmCalls).toHaveLength(0);

    // Exactly the typed data the module hashes in getRecoveryHash (same helper the bank relayer uses).
    const typed = recoveryTypedData({
      wallet: WALLET,
      newOwners: [NEW_OWNER],
      threshold: 1n,
      nonce: BigInt(body.nonce),
      chainId: CHAIN_ID,
      module: MODULE,
    });
    expect(await verifyTypedData({ ...typed, address: guardian.address, signature: body.signature })).toBe(
      true,
    );
    expect(await recoverTypedDataAddress({ ...typed, signature: body.signature })).toBe(guardian.address);
    // Bound to the nonce: the same signature is invalid for nonce+1.
    const stale = recoveryTypedData({
      ...typed.message,
      threshold: 1n,
      nonce: 8n,
      chainId: CHAIN_ID,
      module: MODULE,
    });
    expect(await verifyTypedData({ ...stale, address: guardian.address, signature: body.signature })).toBe(
      false,
    );

    const row = h.db.getConfirmation('req-1');
    expect(row).toMatchObject({
      mode: 'signature',
      executed: false,
      txHash: null,
      nonce: '7',
      signature: body.signature,
    });
    expect(h.db.lastExecutedConfirmation(WALLET)).toBeUndefined();
    const signed = h.db.listEvents().find((e) => e.type === 'recovery.signed');
    expect(signed?.payload).toMatchObject({ guardianAddress: guardian.address, nonce: '7', executed: false });
  });

  it('GET /recoveries/:id shows the signed confirmation and its events; unknown id → 404', async () => {
    const h = harness({ mode: 'signature' });
    await post(h, await signVerdict());
    const res = await h.app.inject({ method: 'GET', url: '/recoveries/req-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.confirmation).toMatchObject({
      recoveryRequestId: 'req-1',
      mode: 'signature',
      executed: false,
    });
    expect(body.decision.status).toBe(200);
    expect(body.events.map((e: { type: string }) => e.type)).toEqual([
      'recovery.received',
      'recovery.confirming',
      'recovery.signed',
    ]);
    expect(JSON.stringify(body)).not.toContain(guardianKey.slice(2));
    expect((await h.app.inject({ method: 'GET', url: '/recoveries/nope' })).statusCode).toBe(404);
  });

  it('a signed-but-not-executed confirmation does not arm the 24 h rule; a refused one is 404 for /executed', async () => {
    const h = harness({ mode: 'signature' });
    expect((await post(h, await signVerdict({ recoveryRequestId: 'a' }))).statusCode).toBe(200);
    expect((await post(h, await signVerdict({ recoveryRequestId: 'b' }))).statusCode).toBe(200);
    const res = await h.app.inject({
      method: 'POST',
      url: '/recoveries/never/executed',
      payload: { txHash: TX, executeAfter: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /recoveries/:id/executed', () => {
  it('rejects a txHash while status().pending is false; accepts once the chain shows the execution; then 24 h rule arms', async () => {
    const h = harness({ mode: 'signature' });
    expect((await post(h, await signVerdict())).statusCode).toBe(200);
    const nowSec = Math.floor(h.clock.now / 1000);

    const early = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/executed',
      payload: { txHash: TX, executeAfter: nowSec + 180 },
    });
    expect(early.statusCode).toBe(409);
    expect(early.json().reasons.join(' ')).toMatch(/no executed recovery is pending on-chain/);
    expect(h.db.getConfirmation('req-1')?.executed).toBe(false);

    h.chain.setExecuted(WALLET, [NEW_OWNER], nowSec + 180);
    const wrongTime = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/executed',
      payload: { txHash: TX, executeAfter: nowSec + 999 },
    });
    expect(wrongTime.statusCode).toBe(409);
    expect(wrongTime.json().reasons.join(' ')).toMatch(/executeAfter mismatch/);

    const ok = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/executed',
      payload: { txHash: TX, executeAfter: nowSec + 180 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      executed: true,
      txHash: TX,
      executeAfter: nowSec + 180,
      alreadyRecorded: false,
    });
    expect(h.db.lastExecutedConfirmation(WALLET)?.recoveryRequestId).toBe('req-1');

    // Idempotent on the same tx; a different tx for the same id is a conflict.
    const again = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/executed',
      payload: { txHash: TX, executeAfter: nowSec + 180 },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().alreadyRecorded).toBe(true);
    const other = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/executed',
      payload: { txHash: TX.replace(/a/g, 'b'), executeAfter: nowSec + 180 },
    });
    expect(other.statusCode).toBe(409);

    // The recorded execution is what the 24 h rule keys on in signature mode.
    h.clock.now += 60 * 60 * 1000;
    const blocked = await post(h, await signVerdict({ recoveryRequestId: 'req-2' }));
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().reasons.join(' ')).toMatch(/executed .* ago \(request req-1\)/);
  });

  it('new owner on-chain differs from the one we signed for → 409; bad body → 400', async () => {
    const h = harness({ mode: 'signature' });
    expect((await post(h, await signVerdict())).statusCode).toBe(200);
    const nowSec = Math.floor(h.clock.now / 1000);
    h.chain.setExecuted(WALLET, ['0x3333333333333333333333333333333333333333'], nowSec + 180);
    const res = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/executed',
      payload: { txHash: TX, executeAfter: nowSec + 180 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().reasons.join(' ')).toMatch(/different new owner/);
    const bad = await h.app.inject({
      method: 'POST',
      url: '/recoveries/req-1/executed',
      payload: { txHash: 'x' },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('POST /recoveries/:id/finalize', () => {
  it('before executeAfter → 409; after → 200 with txHash and the submitter the port used', async () => {
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
    expect(late.json()).toEqual({ txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/), submitter: 'stub' });
    expect(h.chain.finalizeCalls).toEqual([{ wallet: WALLET }]);
    const sent = h.db.listEvents().find((e) => e.type === 'finalize.sent');
    expect(sent?.payload).toMatchObject({ submitter: 'stub', simulated: true });
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

  it('signature mode end to end: sign → bank executes → /executed → wait → finalize through the port', async () => {
    const h = harness({ mode: 'signature' });
    expect((await post(h, await signVerdict({ recoveryRequestId: 'sig-1' }))).statusCode).toBe(200);
    const nowSec = Math.floor(h.clock.now / 1000);
    h.chain.setExecuted(WALLET, [NEW_OWNER], nowSec + 180); // the bank's relayed multiConfirmRecovery
    const rec = await h.app.inject({
      method: 'POST',
      url: '/recoveries/sig-1/executed',
      payload: { txHash: TX, executeAfter: nowSec + 180 },
    });
    expect(rec.statusCode).toBe(200);
    const early = await h.app.inject({ method: 'POST', url: '/recoveries/sig-1/finalize' });
    expect(early.statusCode).toBe(409);
    h.clock.now += 181 * 1000;
    const done = await h.app.inject({ method: 'POST', url: '/recoveries/sig-1/finalize' });
    expect(done.statusCode).toBe(200);
    expect(h.chain.finalizeCalls).toEqual([{ wallet: WALLET }]);
    expect(h.db.getConfirmation('sig-1')?.finalizedTxHash).toBe(done.json().txHash);
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
  it('/identity matches the schema and never leaks the key; /health names the stub and the mode', async () => {
    const h = harness({ mode: 'signature' });
    const id = await h.app.inject({ method: 'GET', url: '/identity' });
    expect(id.json()).toEqual({ kind: 'swissquote', guardianAddress: guardian.address, chainId: CHAIN_ID });
    expect(JSON.stringify(id.json())).not.toContain(guardianKey.slice(2));
    const health = await h.app.inject({ method: 'GET', url: '/health' });
    expect(health.json()).toMatchObject({
      ok: true,
      service: 'swissquote',
      chainPort: 'stub',
      submitter: 'stub',
      confirmMode: 'signature',
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
    RECOVERY_MODULE_ADDRESS: MODULE,
  };

  it('parses a clean environment and derives the guardian address; signature mode is the default', () => {
    const c = loadGuardianConfig(goodEnv);
    expect(c.guardianAddress).toBe(guardian.address);
    expect(c.port).toBe(4001);
    expect(c.confirmMode).toBe('signature');
    expect(c.candideUrl).toBeUndefined();
  });

  it('accepts GUARDIAN_CANDIDE_URL (with a trailing inline comment) and GUARDIAN_CONFIRM_MODE=onchain', () => {
    const c = loadGuardianConfig({
      ...goodEnv,
      GUARDIAN_CANDIDE_URL: 'https://api.candide.dev/public/v3/84532   # public bundler+paymaster',
      GUARDIAN_CONFIRM_MODE: 'onchain',
    });
    expect(c.candideUrl).toBe('https://api.candide.dev/public/v3/84532');
    expect(c.confirmMode).toBe('onchain');
    expect(() => loadGuardianConfig({ ...goodEnv, GUARDIAN_CONFIRM_MODE: 'yolo' })).toThrow(
      /GUARDIAN_CONFIRM_MODE/,
    );
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

  it('chainPortFromConfig: real adapter when RPC_URL is set, stub without one (no network at construction)', () => {
    const real = chainPortFromConfig(loadGuardianConfig(goodEnv));
    expect(real.kind).toBe('real');
    const { RPC_URL: _omit, ...noRpc } = goodEnv;
    expect(chainPortFromConfig(loadGuardianConfig(noRpc)).kind).toBe('stub');
  });
});
