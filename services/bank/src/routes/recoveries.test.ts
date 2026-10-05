// Wave 2 recovery flows through fastify.inject. The chain edge is stubbed (no fake chain result in prod code);
// every signature in here is a REAL viem signature verified by the bank with verifyTypedData.
import { createPasskeyAccount, passkeySignerAddress, recoveryTypedData } from '@keyline/chain';
import {
  IDENTITY_VERDICT_TYPES,
  identityVerdictDomain,
  type RecoveryRequest,
  RecoveryRequestSchema,
} from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import { type Address, getAddress, type Hex, toFunctionSelector, verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import type { ChainDeps } from '../deps';
import { evaluatePersona, signIdentityVerdict, verdictMessage } from '../identity';
import { testConfig } from '../test-env';

const X = `0x${'1234'.repeat(16)}` as Hex;
const Y = `0x${'abcd'.repeat(16)}` as Hex;
const NEW_X = `0x${'5678'.repeat(16)}` as Hex;
const NEW_Y = `0x${'ef01'.repeat(16)}` as Hex;
const MODULE = '0x949d01d424bE050D09C16025dd007CB59b3A8c66' as Address;
const H = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const dev = { 'x-device-label': 'Lea · phone' };
const operator = { 'x-operator-token': 'desk-test-token' };

// Throwaway recoverer keys (never funded, never used elsewhere).
const safety = privateKeyToAccount(`0x${'44'.repeat(32)}`);
const emergency = privateKeyToAccount(`0x${'55'.repeat(32)}`);
const sq = privateKeyToAccount(`0x${'66'.repeat(32)}`);
const stranger = privateKeyToAccount(`0x${'77'.repeat(32)}`);
const verdictAddress = privateKeyToAccount(`0x${'11'.repeat(32)}`).address;

const pk = createPasskeyAccount({ pubKeyX: BigInt(X), pubKeyY: BigInt(Y) });
const newOwner = { x: BigInt(NEW_X), y: BigInt(NEW_Y) };
const newProxy = passkeySignerAddress(newOwner);

const state = {
  nonce: 0n,
  pending: false as boolean,
  executeAfter: undefined as Date | undefined,
  owners: [] as Address[],
  guardianAnswer: 'sign' as 'sign' | 'refuse-409' | 'down',
  executedReports: [] as { id: string; txHash: Hex; executeAfter: number }[],
  finalizeCalls: [] as string[],
};

const signAsGuardian = (account: typeof sq, wallet: Address, nonce: bigint) =>
  account.signTypedData(
    recoveryTypedData({
      wallet,
      newOwners: [newProxy],
      threshold: 1n,
      nonce,
      chainId: 84532,
      module: MODULE,
    }),
  );

const confirmWithSignatures = vi.fn(async () => {
  // The module bumps the nonce at execute and opens the grace period (VERIFIED §12).
  state.nonce += 1n;
  state.pending = true;
  state.executeAfter = new Date(Date.now() + 180_000);
  return { txHash: H(0xe8ec), submitter: 'sponsored-safe' as const };
});

const chainStub: Partial<ChainDeps> = {
  walletHasCode: async () => false,
  onchainGuardians: async () => [],
  guardianIdentity: async (kind) => ({ kind, guardianAddress: sq.address, chainId: 84532 }),
  recoveryNonce: async () => state.nonce,
  recoveryStatus: async () => ({
    pending: state.pending,
    executeAfter: state.pending ? state.executeAfter : undefined,
    newOwners: state.pending ? [newProxy] : undefined,
    newThreshold: state.pending ? 1n : undefined,
    approvals: state.pending ? 2n : 0n,
    nonce: state.nonce,
    guardians: [sq.address, emergency.address, safety.address],
    guardianThreshold: 2n,
  }),
  deploySignerProxy: async (owner) => ({
    address: passkeySignerAddress(owner),
    txHash: H(0xdeb),
    submitter: 'sponsored-safe',
  }),
  confirmWithSignatures,
  safeOwners: async () => state.owners,
  findCancelTx: async () => H(0xca9c),
  sqGuardian: {
    async requestConfirmation(body) {
      if (state.guardianAnswer === 'down')
        return { ok: false, status: 502, reasons: ['swissquote guardian unreachable'] };
      if (state.guardianAnswer === 'refuse-409')
        return {
          ok: false,
          status: 409,
          reasons: ['a recovery for this wallet was executed 0.1 h ago; limit is one per 24 h'],
        };
      // The guardian only signs a verified pass verdict (its own rules.ts); mirror the essential check here.
      const okVerdict = await verifyTypedData({
        address: verdictAddress,
        domain: identityVerdictDomain(84532),
        types: IDENTITY_VERDICT_TYPES,
        primaryType: 'IdentityVerdict',
        message: verdictMessage(body.identityVerdict),
        signature: body.identityVerdict.signature as Hex,
      });
      if (!okVerdict || body.identityVerdict.verdict !== 'pass')
        return { ok: false, status: 403, reasons: ['identity verdict rejected'] };
      const signature = await signAsGuardian(sq, body.wallet as Address, state.nonce);
      return {
        ok: true,
        status: 200,
        body: {
          confirmed: true,
          mode: 'signature',
          guardianAddress: sq.address,
          signature,
          nonce: state.nonce.toString(),
          executed: false,
        },
      };
    },
    async reportExecuted(id, input) {
      state.executedReports.push({ id, ...input });
      return {
        ok: true,
        status: 200,
        body: { confirmed: true, mode: 'onchain', txHash: input.txHash, executed: true },
      };
    },
    async finalize(id) {
      state.finalizeCalls.push(id);
      state.pending = false;
      state.owners = [newProxy];
      return { ok: true, txHash: H(0xf1a) };
    },
    async events() {
      return [
        {
          id: 1,
          service: 'swissquote',
          type: 'recovery.signed',
          walletAddress: null,
          payload: { x: 1 },
          at: Date.now(),
        },
      ];
    },
  },
};

describe('identity persona rules (SPEC §7)', () => {
  const base = { clientName: 'Lea Keller', eidName: 'Lea Keller', liveness: true };
  it.each([
    ['thief label', { ...base, deviceLabel: 'Thief · stolen phone' }, 'fail'],
    ['THIEF anywhere, any case', { ...base, deviceLabel: 'my tHiEf device' }, 'fail'],
    ['name mismatch', { ...base, deviceLabel: 'Lea · new phone', eidName: 'Lea Müller' }, 'fail'],
    [
      'pass (case/space-insensitive name)',
      { ...base, deviceLabel: 'Lea · new phone', eidName: '  lea   KELLER ' },
      'pass',
    ],
  ] as const)('%s', (_label, input, expected) => {
    const r = evaluatePersona(input);
    expect(r.verdict).toBe(expected);
    if (expected === 'fail')
      expect(r.reasons).toEqual(['ID document name mismatch', 'liveness check failed']);
    else expect(r.reasons).toEqual([]);
  });
});

describe('identity verdict signature', () => {
  it('verifies against the verdict address with the pinned typed data, and binds request/wallet/newOwner', async () => {
    const v = await signIdentityVerdict(`0x${'11'.repeat(32)}`, 84532, {
      recoveryRequestId: 'rec_test',
      wallet: pk.address,
      newOwner: newProxy,
      method: 'eid-simulated',
      verdict: 'pass',
      emailOtpPassed: true,
      idCheckPassed: true,
      livenessPassed: true,
      issuedAt: 1_760_000_000,
    });
    expect(v.signedBy).toBe('bank');
    expect(v.simulated).toBe(true);
    const check = (message: ReturnType<typeof verdictMessage>) =>
      verifyTypedData({
        address: verdictAddress,
        domain: { name: 'KeylineIdentityVerdict', version: '1', chainId: 84532 },
        types: IDENTITY_VERDICT_TYPES,
        primaryType: 'IdentityVerdict',
        message,
        signature: v.signature as Hex,
      });
    await expect(check(verdictMessage(v))).resolves.toBe(true);
    await expect(check(verdictMessage({ ...v, newOwner: stranger.address }))).resolves.toBe(false);
    await expect(check(verdictMessage({ ...v, verdict: 'fail' }))).resolves.toBe(false);
    await expect(check(verdictMessage({ ...v, recoveryRequestId: 'rec_other' }))).resolves.toBe(false);
  });
});

describe('Wave 2 recovery flows', () => {
  let app: FastifyInstance;
  let wallet: Address;
  let leaRecovery: RecoveryRequest;

  const otpFor = async (id: string): Promise<string> => {
    const res = await app.inject({ method: 'GET', url: '/mock/inbox/lea.keller@example.ch' });
    const msg = res.json().messages.find((m: { recoveryRequestId?: string }) => m.recoveryRequestId === id);
    return msg.otp;
  };
  const startRecovery = async (deviceLabel: string, credentialId: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/recoveries',
      headers: { 'user-agent': 'vitest' },
      payload: {
        wallet,
        newOwner: { pubKeyX: NEW_X, pubKeyY: NEW_Y, credentialId },
        device: { deviceLabel },
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return RecoveryRequestSchema.parse(res.json());
  };
  const submitIdentity = async (id: string, name: string, otp?: string) =>
    app.inject({
      method: 'POST',
      url: `/recoveries/${id}/identity`,
      payload: {
        emailOtp: otp ?? (await otpFor(id)),
        eidPayload: { name, dateOfBirth: '1990-04-12', documentNumber: 'SIM-1', liveness: true },
      },
    });
  const confirm = async (
    id: string,
    kind: string,
    guardianAddress: Address,
    signature: Hex,
    nonce?: string,
  ) =>
    app.inject({
      method: 'POST',
      url: `/recoveries/${id}/confirm`,
      payload: { kind, guardianAddress, signature, nonce },
    });

  beforeAll(async () => {
    app = await buildApp(testConfig(), { logger: false, chain: chainStub, finalizer: false });
    const created = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: dev,
      payload: { pubKeyX: X, pubKeyY: Y, credentialId: 'lea-old-phone', deviceLabel: 'Lea · phone' },
    });
    wallet = getAddress(created.json().address);
    for (const g of [
      { kind: 'safety-key', address: safety.address },
      { kind: 'emergency-card', address: emergency.address },
      { kind: 'swissquote' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: `/wallets/${wallet}/guardians`,
        headers: dev,
        payload: g,
      });
      expect(res.statusCode, res.body).toBe(201);
    }
    // The protect op is covered by wave1.test.ts; here the wallet is simply marked deployed.
    app.db
      .prepare("UPDATE wallets SET status = 'deployed', deploy_tx_hash = ? WHERE address = ?")
      .run(H(0xde01), wallet);
  });
  afterAll(async () => {
    await app.close();
  });

  it('POST /mock/eid echoes a SIMULATED swiyu payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mock/eid',
      payload: { name: 'Lea Keller', dateOfBirth: '1990-04-12' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      issuer: 'swiyu-simulated',
      simulated: true,
      eidPayload: { liveness: true },
    });
  });

  it('thief persona: OTP mismatch → 403; name mismatch + thief label → identity-refused with reasons, owner alerted', async () => {
    const r = await startRecovery('Thief · stolen phone', 'thief-cred');
    expect(r).toMatchObject({ status: 'identity-pending', waitingFor: 'identity', recoveryMode: 'default' });
    expect(getAddress(r.newOwner.signerProxyAddress)).toBe(newProxy);
    expect(r.requestedFrom).toMatchObject({ deviceLabel: 'Thief · stolen phone', userAgent: 'vitest' });

    const wrong = await submitIdentity(r.id, 'Lea Keller', '000000');
    expect([403, 400]).toContain(wrong.statusCode); // 400 only if the OTP happened to be 000000 and failed elsewhere
    if (wrong.statusCode === 403) expect(wrong.json().message).toMatch(/code/i);

    const refused = await submitIdentity(r.id, 'Someone Else');
    expect(refused.statusCode, refused.body).toBe(200);
    const body = RecoveryRequestSchema.parse(refused.json());
    expect(body.status).toBe('identity-refused');
    expect(body.reasons).toEqual(['ID document name mismatch', 'liveness check failed']);
    expect(body.identity).toMatchObject({
      verdict: 'fail',
      signedBy: 'bank',
      simulated: true,
      emailOtpPassed: true,
    });
    expect(body.guardianConfirmations).toEqual([]);

    // Recoverers cannot confirm a refused request.
    const sig = await signAsGuardian(safety, wallet, state.nonce);
    expect((await confirm(r.id, 'safety-key', safety.address, sig)).statusCode).toBe(403);

    const alerts = await app.inject({ method: 'GET', url: `/wallets/${wallet}/alerts` });
    expect(alerts.json().alerts[0]).toMatchObject({ kind: 'recovery-refused', recoveryRequestId: r.id });
    const inbox = await app.inject({ method: 'GET', url: '/mock/inbox/lea.keller@example.ch' });
    expect(inbox.json().messages[0]).toMatchObject({ simulated: true, channel: 'email-simulated' });
  });

  it('operator override leaves the status at awaiting-guardians (Swissquote alone cannot finish)', async () => {
    const r = await startRecovery('Thief · stolen phone', 'thief-cred-2');
    await submitIdentity(r.id, 'Someone Else');
    const res = await app.inject({
      method: 'POST',
      url: `/recoveries/${r.id}/operator`,
      headers: operator,
      payload: { action: 'override', note: 'demo' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = RecoveryRequestSchema.parse(res.json());
    expect(body.status).toBe('awaiting-guardians');
    expect(body.waitingFor).toBe('second-recoverer');
    expect(body.identity).toMatchObject({ verdict: 'pass', method: 'kyc-reverify-simulated' });
    expect((body.identity as { operatorNote?: string }).operatorNote).toMatch(/override/);
    expect(body.guardianConfirmations).toHaveLength(1);
    expect(body.guardianConfirmations[0]).toMatchObject({
      kind: 'swissquote',
      mode: 'signature',
      nonce: '0',
    });
    expect(confirmWithSignatures).not.toHaveBeenCalled();
  });

  it('operator endpoints need the operator token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/recoveries/x/operator',
      payload: { action: 'approve' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('Lea persona: pass → awaiting-guardians with a Swissquote signature bound to the current nonce', async () => {
    const r = await startRecovery('Lea · new phone', 'lea-new-phone');
    const res = await submitIdentity(r.id, 'Lea Keller');
    expect(res.statusCode, res.body).toBe(200);
    leaRecovery = RecoveryRequestSchema.parse(res.json());
    expect(leaRecovery.status).toBe('awaiting-guardians');
    expect(leaRecovery.waitingFor).toBe('second-recoverer');
    expect(leaRecovery.identity).toMatchObject({
      verdict: 'pass',
      method: 'eid-simulated',
      emailOtpPassed: true,
    });
    const sqConf = leaRecovery.guardianConfirmations.find((c) => c.kind === 'swissquote');
    expect(sqConf).toMatchObject({ mode: 'signature', guardianAddress: sq.address, nonce: '0' });
    // The stored signature really is sq's ExecuteRecovery signature.
    const td = recoveryTypedData({
      wallet,
      newOwners: [newProxy],
      threshold: 1n,
      nonce: 0n,
      chainId: 84532,
      module: MODULE,
    });
    await expect(
      verifyTypedData({ address: sq.address, ...td, signature: sqConf?.signature as Hex }),
    ).resolves.toBe(true);
  });

  it('GET /recoveries/:id/typed-data returns what the Safety key must sign', async () => {
    const res = await app.inject({ method: 'GET', url: `/recoveries/${leaRecovery.id}/typed-data` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      nonce: '0',
      typedData: {
        primaryType: 'ExecuteRecovery',
        domain: {
          name: 'Social Recovery Module',
          version: '0.0.1',
          chainId: 84532,
          verifyingContract: MODULE,
        },
        message: { wallet, newOwners: [newProxy], newThreshold: '1', nonce: '0' },
      },
    });
  });

  it('confirm: wrong signer → 403, unknown recoverer → 403, kind mismatch → 403, stale nonce → 409', async () => {
    const id = leaRecovery.id;
    const forged = await signAsGuardian(stranger, wallet, state.nonce); // stranger signs, claims to be the Safety key
    expect((await confirm(id, 'safety-key', safety.address, forged)).statusCode).toBe(403);
    const strangerSig = await signAsGuardian(stranger, wallet, state.nonce);
    expect((await confirm(id, 'safety-key', stranger.address, strangerSig)).statusCode).toBe(403);
    const good = await signAsGuardian(safety, wallet, state.nonce);
    expect((await confirm(id, 'emergency-card', safety.address, good)).statusCode).toBe(403);
    expect((await confirm(id, 'safety-key', safety.address, good, '7')).statusCode).toBe(409);
    expect(confirmWithSignatures).not.toHaveBeenCalled();
  });

  it('two valid signatures trigger exactly one relayed multiConfirmRecovery → executed-waiting, timer from chain', async () => {
    const id = leaRecovery.id;
    const good = await signAsGuardian(safety, wallet, state.nonce);
    const res = await confirm(id, 'safety-key', safety.address, good, '0');
    expect(res.statusCode, res.body).toBe(200);
    const body = RecoveryRequestSchema.parse(res.json());
    expect(confirmWithSignatures).toHaveBeenCalledTimes(1);
    const call = confirmWithSignatures.mock.calls[0] as unknown as [
      { wallet: Address; newOwners: Address[]; signatures: { signer: Address }[] },
    ];
    expect(call[0].newOwners).toEqual([newProxy]);
    expect(call[0].signatures.map((s) => s.signer).sort()).toEqual([sq.address, safety.address].sort());
    expect(body.status).toBe('executed-waiting');
    expect(body.waitingFor).toBe('grace-period');
    expect(body.onchain).toMatchObject({ executedTxHash: H(0xe8ec), nonce: '1' });
    expect(body.onchain.executeAfter).toBe(state.executeAfter?.toISOString());
    expect(state.executedReports).toEqual([
      { id, txHash: H(0xe8ec), executeAfter: Math.floor((state.executeAfter?.getTime() ?? 0) / 1000) },
    ]);
    const alerts = await app.inject({ method: 'GET', url: `/wallets/${wallet}/alerts` });
    expect(alerts.json().alerts[0]).toMatchObject({
      kind: 'recovery-started',
      executeAfter: body.onchain.executeAfter,
    });
    const w = await app.inject({ method: 'GET', url: `/wallets/${wallet}`, headers: dev });
    expect(w.json().status).toBe('recovering');
    // A late confirmation is refused: the request is already executing.
    const late = await signAsGuardian(emergency, wallet, state.nonce);
    expect((await confirm(id, 'emergency-card', emergency.address, late)).statusCode).toBe(409);
  });

  it('finalizer: after executeAfter the bank asks sq-guardian to finalize, swaps the owner passkey', async () => {
    state.executeAfter = new Date(Date.now() - 1000);
    await app.recoveryService.tick();
    const res = await app.inject({ method: 'GET', url: `/recoveries/${leaRecovery.id}` });
    const body = RecoveryRequestSchema.parse(res.json());
    expect(body.status).toBe('finalized');
    expect(body.onchain.finalizedTxHash).toBe(H(0xf1a));
    expect(state.finalizeCalls).toEqual([leaRecovery.id]);
    const w = app.db
      .prepare('SELECT owner_credential_id, status FROM wallets WHERE address = ?')
      .get(wallet) as {
      owner_credential_id: string;
      status: string;
    };
    expect(w).toEqual({ owner_credential_id: 'lea-new-phone', status: 'deployed' });
    const old = app.db
      .prepare('SELECT revoked_at FROM passkeys WHERE credential_id = ?')
      .get('lea-old-phone') as {
      revoked_at: string | null;
    };
    expect(old.revoked_at).toBeTruthy();
    // A second tick is a no-op.
    await app.recoveryService.tick();
    expect(state.finalizeCalls).toHaveLength(1);
  });

  it('operator refuse supersedes a stored Swissquote confirmation (voided, never relayed)', async () => {
    state.pending = false;
    const r = await startRecovery('Lea · new phone', 'lea-new-phone-2');
    const passed = RecoveryRequestSchema.parse((await submitIdentity(r.id, 'Lea Keller')).json());
    expect(passed.status).toBe('awaiting-guardians');
    expect(passed.guardianConfirmations).toHaveLength(1);
    const res = await app.inject({
      method: 'POST',
      url: `/recoveries/${r.id}/operator`,
      headers: operator,
      payload: { action: 'refuse', note: 'Caller could not answer the security questions' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = RecoveryRequestSchema.parse(res.json());
    expect(body.status).toBe('identity-refused');
    expect(body.identity).toMatchObject({
      verdict: 'fail',
      operatorNote: 'Caller could not answer the security questions',
    });
    expect(body.guardianConfirmations).toHaveLength(1);
    expect(body.guardianConfirmations[0]?.void).toBe(true);
    expect(body.reasons[0]).toMatch(/Refused by the Swissquote desk/);
    const sig = await signAsGuardian(safety, wallet, state.nonce);
    expect((await confirm(r.id, 'safety-key', safety.address, sig)).statusCode).toBe(403);
    expect(confirmWithSignatures).toHaveBeenCalledTimes(1);
  });

  it('a guardian refusal (409 reasons) is recorded and the request stays open for the two client recoverers', async () => {
    state.guardianAnswer = 'refuse-409';
    const r = await startRecovery('Lea · new phone', 'lea-new-phone-3');
    const body = RecoveryRequestSchema.parse((await submitIdentity(r.id, 'Lea Keller')).json());
    state.guardianAnswer = 'sign';
    expect(body.status).toBe('awaiting-guardians');
    expect(body.guardianConfirmations).toEqual([]);
    expect(body.guardianRefusals[0]).toMatchObject({ kind: 'swissquote', status: 409 });
    expect(body.guardianRefusals[0]?.reasons[0]).toMatch(/24 h/);
  });

  it('finalizer detects an on-chain cancellation', async () => {
    const r = await startRecovery('Lea · new phone', 'lea-new-phone-4');
    const passed = RecoveryRequestSchema.parse((await submitIdentity(r.id, 'Lea Keller')).json());
    const nonce = state.nonce;
    const a = await signAsGuardian(safety, wallet, nonce);
    const executed = RecoveryRequestSchema.parse(
      (await confirm(r.id, 'safety-key', safety.address, a)).json(),
    );
    expect(executed.status).toBe('executed-waiting');
    expect(passed.status).toBe('awaiting-guardians');
    // Owner cancelled: module shows no pending request, owners unchanged (old proxy, not the new one).
    state.pending = false;
    state.owners = ['0x000000000000000000000000000000000000dEaD'];
    await app.recoveryService.tick();
    const body = RecoveryRequestSchema.parse(
      (await app.inject({ method: 'GET', url: `/recoveries/${r.id}` })).json(),
    );
    expect(body.status).toBe('cancelled');
    expect(body.onchain.cancelledTxHash).toBe(H(0xca9c));
    const alerts = await app.inject({ method: 'GET', url: `/wallets/${wallet}/alerts` });
    expect(alerts.json().alerts[0]).toMatchObject({ kind: 'recovery-cancelled', recoveryRequestId: r.id });
  });

  it('GET /desk/queue lists requests newest first with signals and counts; /desk/events merges the guardian feed', async () => {
    const q = await app.inject({ method: 'GET', url: '/desk/queue', headers: operator });
    expect(q.statusCode, q.body).toBe(200);
    const { items, counts } = q.json();
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items[0].recovery.status).toBe('cancelled');
    // thief #1 refused, thief #2 overridden (awaiting), Lea #1 finalized, Lea #2 refused by the desk, Lea #3 awaiting, Lea #4 cancelled
    expect(counts).toEqual({ 'identity-refused': 2, 'awaiting-guardians': 2, finalized: 1, cancelled: 1 });
    const refusedThief = items.find((i: { recovery: RecoveryRequest }) =>
      i.recovery.requestedFrom.deviceLabel.includes('Thief'),
    );
    expect(refusedThief.signals.join(' | ')).toMatch(/thief/i);
    expect(refusedThief.client.name).toBe('Lea Keller');
    const e = await app.inject({ method: 'GET', url: '/desk/events', headers: operator });
    expect(e.statusCode).toBe(200);
    expect(e.json().sources).toEqual({ 'sq-guardian': 'ok' });
    expect(e.json().events.some((x: { service: string }) => x.service === 'sq-guardian')).toBe(true);
    expect(e.json().events.some((x: { type: string }) => x.type === 'recovery.executed')).toBe(true);
  });

  it('policy: cancel-recovery is Tier 1 approve with the F4b reason and a bank-built cancelRecovery() call', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: { kind: 'cancel-recovery', walletAddress: wallet, deviceLabel: 'Lea · phone' },
    });
    expect(res.statusCode, res.body).toBe(201);
    const d = res.json();
    expect(d).toMatchObject({ verdict: 'approve', tier: 1, kind: 'cancel-recovery' });
    expect(d.reasons[0]).toBe('Cancelling a recovery you did not start · network fee paid by Swissquote');
    expect(d.calls).toHaveLength(1);
    expect(d.calls[0]).toMatchObject({
      to: MODULE,
      value: '0',
      data: toFunctionSelector('cancelRecovery()'),
    });
    expect(d.simulation.decodedCalls[0]).toMatchObject({ fn: 'cancelRecovery()', risk: 'none' });
  });

  it('POST /contacts adds a contact for the signed-in client', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contacts',
      headers: dev,
      payload: { label: 'Nina Berger', address: stranger.address },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      label: 'Nina Berger',
      address: stranger.address,
      verifiedOwnership: false,
    });
    const again = await app.inject({
      method: 'POST',
      url: '/contacts',
      headers: dev,
      payload: { label: 'Nina', address: stranger.address },
    });
    expect(again.statusCode).toBe(200);
  });
});
