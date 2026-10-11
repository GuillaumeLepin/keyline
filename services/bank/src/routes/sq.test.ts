// SPEC §10 bank additions through fastify.inject, network edges stubbed (nothing on-chain is faked in prod code).
import {
  decodeCalls,
  dummySignature,
  encodeCallData,
  loadPasskeyAccount,
  transferTransaction,
} from '@keyline/chain';
import type { FastifyInstance } from 'fastify';
import { type Address, encodeErrorResult, getAddress, type Hex, keccak256, parseAbi } from 'viem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { metaTransactionToCall } from '../chain/calldata';
import { toSimulation } from '../chain/decode';
import { openDb } from '../db';
import type { ChainDeps } from '../deps';
import { evaluate, REASON_OWN_ACCOUNT, REASON_OWN_ACCOUNT_TRAVEL_RULE } from '../policy/engine';
import { createSqLedger, formatChfCents, toBaseUnits, valueCents } from '../sq/ledger';
import { testConfig } from '../test-env';
import { createFailureLimiter } from './sq';

const X = `0x${'5a17'.repeat(16)}` as Hex;
const Y = `0x${'9c3e'.repeat(16)}` as Hex;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const EURC = '0x808456652fdb597867f38412077A9182bf77359F' as Address;
const SAFETY = getAddress('0xCA70000000000000000000000000000000000001');
const H = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const config = testConfig({ BANK_CANDIDE_BUNDLER_URL: 'https://api.candide.dev/public/v3/84532' });
const DEPOSIT = getAddress(config.addresses.funder);

const state = {
  funder: { eth: 10n ** 18n, usdc: 10_000_000_000n, address: DEPOSIT },
  token: 10_000_000_000n,
  transferFails: false,
  transfers: [] as { kind: string; to: Address; amount: bigint; token?: Address }[],
  tx: 'pending' as 'pending' | 'confirmed' | 'failed',
  userOp: { status: 'pending' } as Awaited<ReturnType<ChainDeps['userOpStatus']>>,
  sendError: undefined as string | undefined,
};
const chainStub: Partial<ChainDeps> = {
  walletHasCode: async () => false,
  onchainGuardians: async () => [],
  simulate: async ({ from, calls }) =>
    toSimulation({
      ok: true,
      assetChanges: [],
      decodedCalls: decodeCalls(calls, { wallet: from }),
      gasEstimate: '90000',
      provider: 'fallback',
      simulated: true,
    }),
  funderBalances: async () => state.funder,
  funderTokenBalance: async () => state.token,
  funderTransferErc20: async (token, to, amount) => {
    if (state.transferFails) throw new Error('nonce too low');
    state.transfers.push({ kind: 'erc20', token, to, amount });
    return H(0xe20 + state.transfers.length);
  },
  funderTransferEth: async (to, amount) => {
    state.transfers.push({ kind: 'eth', to, amount });
    return H(0xe70 + state.transfers.length);
  },
  txStatus: async () => state.tx,
  sponsor: async (_pk, userOp) => ({
    userOp: { ...userOp, paymaster: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba', paymasterData: '0x1234' },
  }),
  sendUserOp: async () => {
    if (state.sendError) throw new Error(state.sendError);
    return { userOperationHash: H(0x5c0) } as unknown as Awaited<ReturnType<ChainDeps['sendUserOp']>>;
  },
  userOpStatus: async () => state.userOp,
};

const cookieOf = (res: { headers: Record<string, unknown> }): string => {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return String(first).split(';')[0] as string;
};

describe('SPEC §10 — Swissquote web, handoff, Safety key, moves', () => {
  let app: FastifyInstance;
  let web: { cookie: string };
  let code: string;
  let onboardingToken: string;
  let wallet: Address;

  beforeAll(async () => {
    app = await buildApp(config, {
      logger: false,
      chain: chainStub,
      screeningOffline: true,
      finalizer: false,
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const positions = async () =>
    (await app.inject({ method: 'GET', url: '/sq/positions', headers: web })).json() as {
      positions: {
        id: string;
        quantity: string;
        valueChf: string;
        movable: boolean;
        notMovableReason?: string;
      }[];
      cashChf: string;
      investedChf: string;
      totalChf: string;
    };
  const qty = async (id: string) => (await positions()).positions.find((p) => p.id === id)?.quantity;

  it('SIMULATED SSO: unknown username refused; Lea gets an httpOnly sq_web cookie separate from the wallet session', async () => {
    const bad = await app.inject({ method: 'POST', url: '/sq/login', payload: { username: 'mallory' } });
    expect(bad.statusCode).toBe(401);
    const res = await app.inject({ method: 'POST', url: '/sq/login', payload: { username: 'lea.keller' } });
    expect(res.statusCode, res.body).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/^sq_web=.*HttpOnly/);
    expect(res.json()).toMatchObject({ client: { id: 'SQ-48213-LK', firstName: 'Lea' }, simulated: true });
    web = { cookie: cookieOf(res) };
    const me = await app.inject({ method: 'GET', url: '/sq/me', headers: web });
    expect(me.json().client.name).toBe('Lea Keller');
    expect((await app.inject({ method: 'GET', url: '/sq/me' })).statusCode).toBe(401);
    // The sq_web token is not a wallet session.
    const asWallet = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie: `keyline_session=${web.cookie.split('=')[1]}` },
    });
    expect(asWallet.statusCode).toBe(401);
  });

  it('positions: exactly the F0.2 numbers; BTC not movable (roadmap); CHF cash and ETF have no button', async () => {
    const p = await positions();
    expect(p).toMatchObject({ cashChf: '12480.35', investedChf: '65694.00', totalChf: '78174.35' });
    const by = Object.fromEntries(p.positions.map((x) => [x.id, x]));
    expect(by['smi-etf']).toMatchObject({ quantity: '120', valueChf: '15408.00', movable: false });
    expect(by['smi-etf']?.notMovableReason).toBeUndefined();
    expect(by['chf-cash']).toMatchObject({ quantity: '12480.35', movable: false });
    expect(by['chf-cash']?.notMovableReason).toBeUndefined();
    expect(by.btc).toMatchObject({
      quantity: '0.42',
      valueChf: '37128.00',
      movable: false,
      notMovableReason: 'bitcoin-roadmap',
    });
    expect(by.eth).toMatchObject({ quantity: '3.15', valueChf: '9828.00', movable: true });
    expect(by.usdc).toMatchObject({ quantity: '2400', valueChf: '1920.00', movable: true });
    expect(by.eurc).toMatchObject({ quantity: '1500', valueChf: '1410.00', movable: true });
    // Wallet session (here the DEMO_FAST_MODE device label) reads it too; nobody else does.
    const dev = await app.inject({
      method: 'GET',
      url: '/sq/positions',
      headers: { 'x-device-label': 'Lea · phone' },
    });
    expect(dev.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/sq/positions' })).statusCode).toBe(401);
  });

  it('safety-key request is "none" before the phone created a wallet', async () => {
    const r = await app.inject({ method: 'GET', url: '/sq/safety-key-request', headers: web });
    expect(r.json()).toEqual({ walletAddress: null, status: 'none' });
  });

  it('handoff: web session required, one open code per session, 6 digits, QR to /start', async () => {
    expect((await app.inject({ method: 'POST', url: '/handoff' })).statusCode).toBe(401);
    const res = await app.inject({ method: 'POST', url: '/handoff', headers: web });
    expect(res.statusCode, res.body).toBe(201);
    code = res.json().code;
    expect(code).toMatch(/^\d{6}$/);
    expect(res.json()).toMatchObject({ status: 'open', qrUrl: `http://localhost:3000/start?code=${code}` });
    const again = await app.inject({ method: 'POST', url: '/handoff', headers: web });
    expect(again.statusCode).toBe(200);
    expect(again.json().code).toBe(code);
    const status = await app.inject({ method: 'GET', url: `/handoff/${code}` });
    expect(status.json().status).toBe('open');
  });

  it('handoff claim: single use, returns the client + an onboarding token; the tile sees "claimed"', async () => {
    const claim = await app.inject({ method: 'POST', url: `/handoff/${code}/claim` });
    expect(claim.statusCode, claim.body).toBe(200);
    expect(claim.json().client).toEqual({
      id: 'SQ-48213-LK',
      firstName: 'Lea',
      name: 'Lea Keller',
      email: 'lea.keller@example.ch',
    });
    onboardingToken = claim.json().onboardingToken;
    const twice = await app.inject({ method: 'POST', url: `/handoff/${code}/claim` });
    expect(twice.statusCode).toBe(409);
    const tile = await app.inject({ method: 'GET', url: `/handoff/${code}`, headers: web });
    expect(tile.json()).toMatchObject({ status: 'claimed', client: { id: 'SQ-48213-LK' } });
    // Without the opening session the identity is not echoed.
    expect((await app.inject({ method: 'GET', url: `/handoff/${code}` })).json().client).toBeUndefined();
    const events = await app.inject({
      method: 'GET',
      url: '/desk/events',
      headers: { 'x-operator-token': 'desk-test-token' },
    });
    const types = (events.json().events as { type: string }[]).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['sq.login', 'handoff.opened', 'handoff.claimed']));
  });

  it('handoff expiry: an expired code cannot be claimed and reads "expired"', async () => {
    const fresh = await app.inject({ method: 'POST', url: '/sq/login', payload: { username: 'lea' } });
    const other = { cookie: cookieOf(fresh) };
    const h = await app.inject({ method: 'POST', url: '/handoff', headers: other });
    const c = h.json().code as string;
    expect(c).not.toBe(code);
    app.db.prepare('UPDATE handoffs SET expires_at = ? WHERE code = ?').run('2020-01-01T00:00:00.000Z', c);
    expect((await app.inject({ method: 'GET', url: `/handoff/${c}` })).json().status).toBe('expired');
    const claim = await app.inject({ method: 'POST', url: `/handoff/${c}/claim` });
    expect(claim.statusCode).toBe(409);
    expect(claim.json().message).toMatch(/expired/);
    expect((await app.inject({ method: 'POST', url: '/handoff/999999/claim' })).statusCode).toBe(404);
  });

  it('claim brute force: the 6th wrong code from one IP is 429 for the window; another IP still claims', async () => {
    const attacker = '203.0.113.7';
    const fresh = await app.inject({ method: 'POST', url: '/sq/login', payload: { username: 'lea' } });
    const h = await app.inject({ method: 'POST', url: '/handoff', headers: { cookie: cookieOf(fresh) } });
    const good = h.json().code as string;
    const wrong = good === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const r = await app.inject({ method: 'POST', url: `/handoff/${wrong}/claim`, remoteAddress: attacker });
      expect(r.statusCode).toBe(404);
    }
    const sixth = await app.inject({
      method: 'POST',
      url: `/handoff/${wrong}/claim`,
      remoteAddress: attacker,
    });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({
      error: 'too-many-attempts',
      message: 'Too many wrong codes. Ask for a new code on your computer.',
    });
    // Blocked for the rest of the window, even with the right code.
    const blocked = await app.inject({
      method: 'POST',
      url: `/handoff/${good}/claim`,
      remoteAddress: attacker,
    });
    expect(blocked.statusCode).toBe(429);
    const phone = await app.inject({
      method: 'POST',
      url: `/handoff/${good}/claim`,
      remoteAddress: '198.51.100.20',
    });
    expect(phone.statusCode, phone.body).toBe(200);
    expect(phone.json().client.id).toBe('SQ-48213-LK');
  });

  it('the onboarding token binds the new wallet to the client and to the handoff; a bad token is 401', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: { 'x-onboarding-token': 'nope', 'x-device-label': 'Lea · phone' },
      payload: { pubKeyX: X, pubKeyY: Y, credentialId: 'cred-sq-v2' },
    });
    expect(bad.statusCode).toBe(401);
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-onboarding-token': onboardingToken },
    });
    expect(me.json()).toMatchObject({ auth: 'onboarding-token', client: { id: 'SQ-48213-LK' } });
    const res = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: { 'x-onboarding-token': onboardingToken },
      payload: { pubKeyX: X, pubKeyY: Y, credentialId: 'cred-sq-v2', deviceLabel: 'Lea · phone' },
    });
    expect(res.statusCode, res.body).toBe(201);
    wallet = res.json().address;
    expect(res.json().wallet.clientId).toBe('SQ-48213-LK');
    const tile = await app.inject({ method: 'GET', url: `/handoff/${code}`, headers: web });
    expect(tile.json().walletAddress).toBe(wallet);
  });

  it('Safety key on the laptop: waiting → POST /sq/safety-key registers the guardian → done', async () => {
    const waiting = await app.inject({ method: 'GET', url: '/sq/safety-key-request', headers: web });
    expect(waiting.json()).toMatchObject({ walletAddress: wallet, status: 'waiting' });
    expect(waiting.json().requestedAt).toBeDefined();
    expect(
      (await app.inject({ method: 'POST', url: '/sq/safety-key', payload: { address: SAFETY } })).statusCode,
    ).toBe(401);
    const reg = await app.inject({
      method: 'POST',
      url: '/sq/safety-key',
      headers: web,
      payload: { address: SAFETY },
    });
    expect(reg.statusCode, reg.body).toBe(201);
    expect(reg.json()).toMatchObject({ kind: 'safety-key', address: SAFETY, walletAddress: wallet });
    const done = await app.inject({ method: 'GET', url: '/sq/safety-key-request', headers: web });
    expect(done.json()).toMatchObject({ status: 'done', safetyKeyAddress: SAFETY });
    const g = await app.inject({
      method: 'GET',
      url: `/wallets/${wallet}/guardians`,
      headers: { 'x-device-label': 'x' },
    });
    expect(g.json().guardians).toHaveLength(1);
  });

  it('moves are refused for a wallet that is not deployed + attested (Travel Rule)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'USDC', amount: '100' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe("This wallet hasn't proven ownership yet");
    expect(state.transfers).toHaveLength(0);
    expect(await qty('usdc')).toBe('2400');
    // BTC is not a movable asset at all.
    const btc = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'BTC', amount: '0.1' },
    });
    expect(btc.statusCode).toBe(400);
  });

  it('moves debit the ledger exactly and send real transfers from the funder (USDC, EURC, ETH)', async () => {
    app.db
      .prepare("UPDATE wallets SET status = 'deployed', deploy_tx_hash = ? WHERE address = ?")
      .run(H(0xd1), wallet);
    app.db
      .prepare(
        "INSERT INTO attestations (wallet_address, client_id, nonce, chain_id, signature, verified_at, method) VALUES (?, 'SQ-48213-LK', 'n-sq', 84532, '0x', ?, 'erc1271')",
      )
      .run(wallet, new Date().toISOString());

    const usdc = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: { ...web, 'idempotency-key': 'mv-1' },
      payload: { asset: 'USDC', amount: '100.5' },
    });
    expect(usdc.statusCode, usdc.body).toBe(201);
    expect(usdc.json()).toMatchObject({
      asset: 'USDC',
      amount: '100.5',
      valueChf: '80.40',
      status: 'sent',
      ledgerSimulated: true,
    });
    expect(usdc.json().explorerUrl).toMatch(/^https:\/\/sepolia\.basescan\.org\/tx\/0x/);
    expect(state.transfers[0]).toEqual({ kind: 'erc20', token: USDC, to: wallet, amount: 100_500_000n });
    // Idempotent replay: no second transfer, no second debit.
    const replay = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: { ...web, 'idempotency-key': 'mv-1' },
      payload: { asset: 'USDC', amount: '100.5' },
    });
    expect(replay.json().id).toBe(usdc.json().id);
    expect(state.transfers).toHaveLength(1);
    expect(await qty('usdc')).toBe('2299.5');

    const eurc = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'EURC', amount: '0.000001' },
    });
    expect(eurc.statusCode, eurc.body).toBe(201);
    expect(state.transfers[1]).toMatchObject({ token: getAddress(EURC), amount: 1n });
    expect(await qty('eurc')).toBe('1499.999999');

    const eth = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'ETH', amount: '0.15' },
    });
    expect(eth.statusCode, eth.body).toBe(201);
    expect(eth.json().valueChf).toBe('468.00');
    expect(state.transfers[2]).toEqual({ kind: 'eth', to: wallet, amount: 150_000_000_000_000_000n });
    expect(await qty('eth')).toBe('3');
    expect((await positions()).investedChf).toBe(String((65694 - 80.4 - 0 - 468).toFixed(2)));
  });

  it('moves refuse more than the ledger holds, too many decimals, and an underfunded funder (502, no hash, no debit)', async () => {
    const tooMuch = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'USDC', amount: '5000' },
    });
    expect(tooMuch.statusCode).toBe(403);
    expect(tooMuch.json().message).toMatch(
      /Not enough USDC on your Swissquote account \(2299\.5 available\)/,
    );
    const decimals = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'USDC', amount: '1.0000001' },
    });
    expect(decimals.statusCode).toBe(400);

    state.token = 1_000_000n;
    const poor = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'USDC', amount: '10' },
    });
    expect(poor.statusCode).toBe(502);
    expect(poor.json().message).toMatch(/holds 1 USDC/);
    expect(poor.json().txHash).toBeUndefined();
    state.token = 10_000_000_000n;

    state.funder = { ...state.funder, eth: 1n };
    const noGas = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'ETH', amount: '0.01' },
    });
    expect(noGas.statusCode).toBe(502);
    expect(noGas.json().message).toMatch(/not enough to pay for this transfer and the network fee$/);
    expect(noGas.json().message).not.toMatch(/this the/);
    state.funder = { ...state.funder, eth: 10n ** 18n };

    state.transferFails = true;
    const fail = await app.inject({
      method: 'POST',
      url: '/sq/moves',
      headers: web,
      payload: { asset: 'USDC', amount: '10' },
    });
    expect(fail.statusCode).toBe(502);
    expect(fail.json().message).toMatch(/nonce too low/);
    state.transferFails = false;
    expect(await qty('usdc')).toBe('2299.5'); // refunded
  });

  it('GET /sq/moves lists moves and follows receipts (sent → confirmed)', async () => {
    state.tx = 'confirmed';
    const res = await app.inject({ method: 'GET', url: '/sq/moves', headers: web });
    const moves = res.json().moves as { status: string; asset: string }[];
    expect(moves).toHaveLength(4);
    expect(moves.filter((m) => m.status === 'confirmed')).toHaveLength(3);
    expect(moves.filter((m) => m.status === 'failed')).toHaveLength(1);
  });

  it("deposit address = the funder, labelled as the client's own verified account", async () => {
    const res = await app.inject({ method: 'GET', url: '/sq/deposit-address' });
    expect(res.json()).toEqual({ address: DEPOSIT, label: 'Your Swissquote account', verified: true });
  });

  it('Back to Swissquote: a USDC transfer to the deposit address is to-own-account, Tier 1 at any amount, credited on inclusion', async () => {
    const tx = transferTransaction({ token: USDC, to: DEPOSIT, amount: 50_000_000_000n }); // 50'000 USDC = CHF 40'000
    const dev = { 'x-device-label': 'Lea · phone' };
    const res = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'transfer',
        walletAddress: wallet,
        calls: [metaTransactionToCall(tx)],
        deviceLabel: 'Lea · phone',
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const d = res.json();
    expect(d).toMatchObject({ kind: 'to-own-account', verdict: 'approve', tier: 1, chfValue: 40000 });
    expect(d.reasons).toEqual([REASON_OWN_ACCOUNT, REASON_OWN_ACCOUNT_TRAVEL_RULE]);
    expect(d.sponsorship.sponsored).toBe(true);
    expect(d.recipientLabel).toBe('Your Swissquote account');
    expect(d.screening.note).toMatch(/Not screened/);

    // kind 'to-own-account' to someone else is refused.
    const wrong = transferTransaction({ token: USDC, to: SAFETY, amount: 1n });
    const bad = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'to-own-account',
        walletAddress: wallet,
        calls: [metaTransactionToCall(wrong)],
        deviceLabel: 'x',
      },
    });
    expect(bad.statusCode).toBe(400);

    const key = app.db
      .prepare('SELECT pub_key_x, pub_key_y FROM passkeys WHERE credential_id = ?')
      .get('cred-sq-v2') as {
      pub_key_x: string;
      pub_key_y: string;
    };
    const pk = loadPasskeyAccount(wallet, { x: BigInt(key.pub_key_x), y: BigInt(key.pub_key_y) });
    const callData = encodeCallData([tx]);
    expect(keccak256(callData)).toBe(d.callsHash);
    const op = {
      sender: wallet,
      nonce: '0x1',
      callData,
      callGasLimit: '0x5e1dd',
      verificationGasLimit: '0xa9bcb',
      preVerificationGas: '0x11876',
      maxFeePerGas: '0xf4240',
      maxPriorityFeePerGas: '0xf4240',
      signature: dummySignature(pk.owner, false),
    };
    const sponsor = await app.inject({
      method: 'POST',
      url: '/userops/sponsor',
      payload: { decisionId: d.decisionId, userOp: op },
    });
    expect(sponsor.statusCode, sponsor.body).toBe(200);
    // Phase D: a bundler rejection is never included — plain sentence + AA code + raw message; decision stays usable.
    state.sendError = 'UserOperation reverted during simulation with reason: AA25 invalid account nonce';
    const rejected = await app.inject({
      method: 'POST',
      url: '/userops/send',
      payload: {
        decisionId: d.decisionId,
        userOp: { ...sponsor.json().userOp, signature: `0x${'77'.repeat(120)}` },
      },
    });
    expect(rejected.statusCode).toBe(502);
    expect(rejected.json()).toMatchObject({
      message: 'This transaction was already sent or is out of order — try again.',
      details: { code: 'AA25', bundlerMessage: state.sendError },
    });
    state.sendError = undefined;
    const send = await app.inject({
      method: 'POST',
      url: '/userops/send',
      payload: {
        decisionId: d.decisionId,
        userOp: { ...sponsor.json().userOp, signature: `0x${'77'.repeat(120)}` },
      },
    });
    expect(send.statusCode, send.body).toBe(200);
    const before = await qty('usdc');
    expect((await app.inject({ method: 'GET', url: `/userops/${H(0x5c0)}` })).json().status).toBe('pending');
    expect(await qty('usdc')).toBe(before);
    state.userOp = { status: 'included', txHash: H(0x5c1), blockNumber: 7 };
    await app.inject({ method: 'GET', url: `/userops/${H(0x5c0)}` });
    await app.inject({ method: 'GET', url: `/userops/${H(0x5c0)}` }); // second read: no double credit
    expect(await qty('usdc')).toBe('52299.5');
    const ev = await app.inject({ method: 'GET', url: `/wallets/${wallet}/events` });
    const credits = (ev.json().events as { type: string; payload: Record<string, unknown> }[]).filter(
      (e) => e.type === 'sq.credit',
    );
    expect(credits).toHaveLength(1);
    expect(credits[0]?.payload).toMatchObject({
      asset: 'USDC',
      amount: '50000',
      valueChf: '40000.00',
      ledgerSimulated: true,
    });
    // Own-account transfers do not eat the daily limit: CHF 40'000 went back today, a CHF 80 transfer is still Tier 1.
    await app.inject({
      method: 'POST',
      url: '/contacts',
      headers: dev,
      payload: { label: 'Safety', address: SAFETY },
    });
    const small = transferTransaction({ token: USDC, to: SAFETY, amount: 100_000_000n });
    const next = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'transfer',
        walletAddress: wallet,
        calls: [metaTransactionToCall(small)],
        deviceLabel: 'p',
      },
    });
    expect(next.json()).toMatchObject({ kind: 'transfer', verdict: 'approve', tier: 1 });
  });

  it('GET /userops/:hash on a failed receipt returns the decoded reason + code, persisted', async () => {
    const insert = (hash: Hex) =>
      app.db
        .prepare(
          "INSERT INTO userops (user_op_hash, wallet_address, decision_id, status, user_op_json, created_at, updated_at) VALUES (?, ?, NULL, 'pending', '{}', ?, ?)",
        )
        .run(hash, wallet, new Date().toISOString(), new Date().toISOString());
    const hash = H(0xfa11);
    insert(hash);
    state.userOp = {
      status: 'failed',
      txHash: H(0xfa12),
      blockNumber: 9,
      revertData: encodeErrorResult({
        abi: parseAbi(['error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)']),
        errorName: 'ERC20InsufficientBalance',
        args: [wallet, 0n, 1n],
      }),
    };
    const res = await app.inject({ method: 'GET', url: `/userops/${hash}` });
    expect(res.json()).toMatchObject({
      status: 'failed',
      reason: 'Not enough funds in your wallet for this transfer.',
      code: 'ERC20InsufficientBalance',
    });
    state.userOp = { status: 'pending' };
    const again = await app.inject({ method: 'GET', url: `/userops/${hash}` }); // read back from the DB
    expect(again.json()).toMatchObject({ status: 'failed', code: 'ERC20InsufficientBalance' });
    // No revert data → the generic sentence; an included op carries no reason.
    const h2 = H(0xfa13);
    insert(h2);
    state.userOp = { status: 'failed', txHash: H(0xfa14), blockNumber: 10 };
    expect((await app.inject({ method: 'GET', url: `/userops/${h2}` })).json().reason).toBe(
      'The transfer reverted on-chain',
    );
    expect((await app.inject({ method: 'GET', url: `/userops/${H(0x5c0)}` })).json().reason).toBeUndefined();
  });

  it('logout clears the web session', async () => {
    const res = await app.inject({ method: 'POST', url: '/sq/logout', headers: web });
    expect(res.json()).toEqual({ ok: true });
    expect(String(res.headers['set-cookie'])).toMatch(/sq_web=;/);
  });
});

describe('qa-demo fix: a second phone setup while Lea already has wallets', () => {
  let app: FastifyInstance;
  let web: { cookie: string };
  const dev = { 'x-device-label': 'Lea · old phone' };
  const key = (n: number) => `0x${n.toString(16).padStart(4, '0').repeat(16)}` as Hex;
  const createWallet = async (n: number, headers: Record<string, string>) => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers,
      payload: { pubKeyX: key(n), pubKeyY: key(n + 1), credentialId: `cred-${n}`, deviceLabel: 'phone' },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().address as Address;
  };

  beforeAll(async () => {
    app = await buildApp(config, {
      logger: false,
      chain: chainStub,
      screeningOffline: true,
      finalizer: false,
    });
    const login = await app.inject({ method: 'POST', url: '/sq/login', payload: { username: 'lea.keller' } });
    web = { cookie: cookieOf(login) };
  });
  afterAll(async () => {
    await app.close();
  });

  it('existing wallets (one protected, one half-built) do not create a Safety-key prompt for this session', async () => {
    const protectedWallet = await createWallet(0x1001, dev);
    app.db.prepare("UPDATE wallets SET status = 'deployed' WHERE address = ?").run(protectedWallet);
    await createWallet(0x2001, dev); // pending, no Safety key — the old code prompted for THIS one
    const req = await app.inject({ method: 'GET', url: '/sq/safety-key-request', headers: web });
    expect(req.json()).toEqual({ walletAddress: null, status: 'none' });
    const state = await app.inject({ method: 'GET', url: '/sq/keyline', headers: web });
    expect(state.statusCode).toBe(200);
    const wallets = state.json().wallets as { address: string; protected: boolean; status: string }[];
    expect(wallets).toHaveLength(2);
    expect(wallets.find((w) => w.address === protectedWallet)).toMatchObject({
      status: 'deployed',
      protected: true,
    });
    expect(wallets.filter((w) => !w.protected)).toHaveLength(1);
    expect(state.json().currentSetup).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: '/sq/keyline' })).statusCode).toBe(401);
  });

  it("POST /handoff is always allowed; the Safety key follows the wallet made with THIS session's code, not the newest", async () => {
    const h = await app.inject({ method: 'POST', url: '/handoff', headers: web });
    expect(h.statusCode, h.body).toBe(201);
    const code = h.json().code as string;
    expect(h.json().keyline.currentSetup).toEqual({ code, status: 'open' });
    expect(h.json().keyline.wallets).toHaveLength(2);

    const claim = await app.inject({ method: 'POST', url: `/handoff/${code}/claim` });
    // Claimed, no wallet yet → still 'none'.
    expect(
      (await app.inject({ method: 'GET', url: '/sq/safety-key-request', headers: web })).json().status,
    ).toBe('none');
    const fresh = await createWallet(0x3001, { 'x-onboarding-token': claim.json().onboardingToken });
    const newer = await createWallet(0x4001, dev); // created later by another device: must NOT be picked

    const req = await app.inject({ method: 'GET', url: '/sq/safety-key-request', headers: web });
    expect(req.json()).toMatchObject({ walletAddress: fresh, status: 'waiting' });
    const reg = await app.inject({
      method: 'POST',
      url: '/sq/safety-key',
      headers: web,
      payload: { address: SAFETY },
    });
    expect(reg.statusCode, reg.body).toBe(201);
    expect(reg.json().walletAddress).toBe(fresh);
    const g = await app.inject({ method: 'GET', url: `/wallets/${newer}/guardians`, headers: dev });
    expect(g.json().guardians).toHaveLength(0);

    const tile = await app.inject({ method: 'GET', url: `/handoff/${code}`, headers: web });
    expect(tile.json()).toMatchObject({
      status: 'claimed',
      walletAddress: fresh,
      keyline: { currentSetup: { code, status: 'claimed', walletAddress: fresh } },
    });
    expect(tile.json().keyline.wallets).toHaveLength(4);
    expect((await app.inject({ method: 'GET', url: `/handoff/${code}` })).json().keyline).toBeUndefined();
    expect(
      (await app.inject({ method: 'GET', url: '/sq/safety-key-request', headers: web })).json(),
    ).toMatchObject({
      status: 'done',
      safetyKeyAddress: SAFETY,
    });
  });

  it('after a finished setup a new code starts another one; other web sessions see no setup of their own', async () => {
    const again = await app.inject({ method: 'POST', url: '/handoff', headers: web });
    expect(again.statusCode).toBe(201);
    const state = await app.inject({ method: 'GET', url: '/sq/keyline', headers: web });
    expect(state.json().currentSetup).toEqual({ code: again.json().code, status: 'open' });

    const other = await app.inject({ method: 'POST', url: '/sq/login', payload: { username: 'lea' } });
    const otherWeb = { cookie: cookieOf(other) };
    expect(
      (await app.inject({ method: 'GET', url: '/sq/safety-key-request', headers: otherWeb })).json(),
    ).toEqual({
      walletAddress: null,
      status: 'none',
    });
    const otherState = await app.inject({ method: 'GET', url: '/sq/keyline', headers: otherWeb });
    expect(otherState.json().currentSetup).toBeUndefined();
    expect(otherState.json().wallets).toHaveLength(4);
    const refused = await app.inject({
      method: 'POST',
      url: '/sq/safety-key',
      headers: otherWeb,
      payload: { address: SAFETY },
    });
    expect(refused.statusCode).toBe(409);
  });
});

describe('handoff claim failure limiter', () => {
  it('slides: failures older than the window stop counting', () => {
    let t = 0;
    const limiter = createFailureLimiter(5, 10 * 60 * 1000, () => t);
    for (let i = 0; i < 5; i += 1) {
      limiter.fail('ip');
      t += 60_000;
    }
    expect(limiter.blocked('ip')).toBe(true); // 5 failures at t = 0…4 min
    expect(limiter.blocked('other')).toBe(false);
    t = 10 * 60 * 1000 + 1; // the t=0 failure left the window
    expect(limiter.blocked('ip')).toBe(false);
    limiter.fail('ip');
    expect(limiter.blocked('ip')).toBe(true);
  });
});

describe('SQ ledger arithmetic', () => {
  it('values, debits and credits exactly, never below zero', () => {
    expect(formatChfCents(valueCents(toBaseUnits('0.42', 8), 8, '88400.00'))).toBe('37128.00');
    expect(formatChfCents(valueCents(toBaseUnits('0.000001', 6), 6, '0.80'))).toBe('0.00');
    expect(formatChfCents(valueCents(toBaseUnits('0.00001', 6), 6, '0.94'))).toBe('0.00');
    expect(formatChfCents(valueCents(toBaseUnits('1.005', 6), 6, '1.00'))).toBe('1.01'); // half up
    expect(() => toBaseUnits('1.1234567', 6)).toThrow();
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO clients (id, name, email, kyc_level, created_at) VALUES ('C1', 'A B', 'a@b.ch', 'full', '2026-10-10T00:00:00.000Z')",
    ).run();
    const ledger = createSqLedger(db);
    ledger.seed('C1');
    ledger.seed('C1'); // idempotent
    expect(ledger.quantity('C1', 'USDC')).toBe(2_400_000_000n);
    expect(ledger.debit('C1', 'USDC', 2_400_000_001n, 'test')).toBeNull();
    expect(ledger.debit('C1', 'USDC', 400_000_000n, 'test')?.quantityAfter).toBe(2_000_000_000n);
    expect(ledger.credit('C1', 'USDC', 1n, 'test').quantityAfter).toBe(2_000_000_001n);
    expect(ledger.positions('C1').find((p) => p.id === 'usdc')?.quantity).toBe('2000.000001');
    const rows = db
      .prepare("SELECT delta, quantity_after FROM sq_ledger WHERE client_id = 'C1' ORDER BY rowid")
      .all();
    expect(rows).toEqual([
      { delta: '-400', quantity_after: '2000' },
      { delta: '0.000001', quantity_after: '2000.000001' },
    ]);
    expect(() => db.prepare("UPDATE sq_ledger SET delta = '0'").run()).toThrow(/append-only/);
    expect(ledger.totals('C1').totalCents).toBe(7_817_435n - 32_000n);
    db.close();
  });

  it('engine: to-own-account is Tier 1 approve regardless of amount, with the SPEC reasons', () => {
    const decision = evaluate(
      {
        id: 'd1',
        kind: 'to-own-account',
        walletAddress: '0x0000000000000000000000000000000000000001',
        calls: [],
        chfValue: 999_999,
        recipientAddress: DEPOSIT,
        deviceLabel: 'p',
        requestedAt: new Date(),
      },
      {
        dailySpentChf: 50_000,
        sponsoredToday: 0,
        contacts: [],
        allowlist: [],
        screening: {
          counterparty: DEPOSIT,
          listsChecked: ['OFAC-SDN', 'SECO'],
          hit: false,
          simulatedHit: false,
          simulated: true,
        },
        simulation: {
          ok: true,
          assetChanges: [],
          decodedCalls: [],
          gasEstimate: '0',
          provider: 'fallback',
          simulated: true,
        },
        callsHash: H(1),
      },
    );
    expect(decision).toMatchObject({ verdict: 'approve', tier: 1, kind: 'to-own-account' });
    expect(decision.reasons).toEqual([REASON_OWN_ACCOUNT, REASON_OWN_ACCOUNT_TRAVEL_RULE]);
    expect(decision.sponsorship.sponsored).toBe(true);
  });
});
