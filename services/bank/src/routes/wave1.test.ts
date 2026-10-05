// Wave 1 HTTP flows through fastify.inject with the network edges stubbed (no chain result is faked in prod code).
import {
  counterfactualAddress,
  createPasskeyAccount,
  decodeCalls,
  dummySignature,
  encodeCallData,
  initOwnerTransactions,
  protectTransactions,
  transferTransaction,
} from '@keyline/chain';
import { PolicyDecisionSchema } from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import { type Address, getAddress, type Hex, keccak256 } from 'viem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { metaTransactionToCall, protectCallData } from '../chain/calldata';
import { toSimulation } from '../chain/decode';
import type { ChainDeps } from '../deps';
import { testConfig } from '../test-env';

// Fixed test passkey coordinates (NOT a real credential): deterministic counterfactual address.
const X = `0x${'1234'.repeat(16)}` as Hex;
const Y = `0x${'abcd'.repeat(16)}` as Hex;
const CRED = 'test-cred-wave1';
const SQ_GUARDIAN = '0x01Bb0000000000000000000000000000000004dE8'.slice(0, 42) as Address;
const SAFETY = '0xCA70000000000000000000000000000000000000' as Address;
const EMERGENCY = '0xd8f4000000000000000000000000000000000000' as Address;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const MODULE = '0x949d01d424bE050D09C16025dd007CB59b3A8c66' as Address;
const H = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const dev = { 'x-device-label': 'Lea · phone' };

const pk = createPasskeyAccount({ pubKeyX: BigInt(X), pubKeyY: BigInt(Y) });

const state = {
  verifyOk: true,
  status: { status: 'pending' } as Awaited<ReturnType<ChainDeps['userOpStatus']>>,
  funder: {
    eth: 10n ** 18n,
    usdc: 1_000_000_000n,
    address: '0x0000000000000000000000000000000000000f0d' as Address,
  },
};
const chainStub: Partial<ChainDeps> = {
  walletHasCode: async () => false,
  onchainGuardians: async () => [],
  // Decode-only simulation so the suite never touches the RPC (the real eth_simulateV1 path is smoke-tested).
  simulate: async ({ from, calls }) =>
    toSimulation({
      ok: true,
      assetChanges: [],
      decodedCalls: decodeCalls(calls, { wallet: from }),
      gasEstimate: '90000',
      provider: 'fallback',
      simulated: true,
    }),
  guardianIdentity: async (kind) => ({ kind, guardianAddress: getAddress(SQ_GUARDIAN), chainId: 84532 }),
  sponsor: async (_pk, userOp) => ({
    userOp: {
      ...userOp,
      paymaster: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
      paymasterData: '0x1234',
      paymasterVerificationGasLimit: 50_000n,
      paymasterPostOpGasLimit: 10_000n,
    },
  }),
  sendUserOp: async () =>
    ({ userOperationHash: H(0x6687) }) as unknown as Awaited<ReturnType<ChainDeps['sendUserOp']>>,
  userOpStatus: async () => state.status,
  verifyAttestation: async () =>
    state.verifyOk
      ? { ok: true, method: 'erc1271' }
      : { ok: false, method: 'erc1271', reason: 'wrong signer' },
  funderBalances: async () => state.funder,
  funderTransferUsdc: async () => H(0x70b),
};

const baseOp = (callData: Hex, init: boolean, signature?: Hex) => ({
  sender: pk.address,
  nonce: init ? '0x0' : '0x1',
  factory: init ? '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67' : undefined,
  factoryData: init ? '0x1688f0b9' : undefined,
  callData,
  callGasLimit: '0x5e1dd',
  verificationGasLimit: '0xa9bcb',
  preVerificationGas: '0x11876',
  maxFeePerGas: '0xf4240',
  maxPriorityFeePerGas: '0xf4240',
  signature: signature ?? dummySignature(pk.owner, init),
});

describe('Wave 1 bank flows', () => {
  let app: FastifyInstance;
  let wallet: Address;
  let protectDecisionId: string;
  let protectCallDataHex: Hex;

  beforeAll(async () => {
    app = await buildApp(
      testConfig({ BANK_CANDIDE_BUNDLER_URL: 'https://api.candide.dev/public/v3/84532' }),
      {
        logger: false,
        chain: chainStub,
        screeningOffline: true,
      },
    );
  });
  afterAll(async () => {
    await app.close();
  });

  it('protectCallData prepends createSigner + swapOwner for an undeployed Safe', () => {
    const txs = protectTransactions(pk, {
      guardians: [SAFETY, EMERGENCY, SQ_GUARDIAN],
      threshold: 2,
      recoveryModule: MODULE,
    });
    expect(protectCallData(pk, txs, false)).toBe(
      encodeCallData([...initOwnerTransactions(pk.owner, pk.address), ...txs]),
    );
    expect(protectCallData(pk, txs, true)).toBe(encodeCallData(txs));
    expect(protectCallData(pk, txs, false)).not.toBe(protectCallData(pk, txs, true));
  });

  it('refuses client routes without a session or device label', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallets',
      payload: { pubKeyX: X, pubKeyY: Y, credentialId: CRED },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /wallets returns the counterfactual Safe address for (x, y) and is idempotent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: dev,
      payload: { pubKeyX: X, pubKeyY: Y, credentialId: CRED, deviceLabel: 'Lea · phone' },
    });
    expect(res.statusCode, res.body).toBe(201);
    wallet = res.json().address;
    expect(wallet).toBe(counterfactualAddress({ x: BigInt(X), y: BigInt(Y) }));
    expect(res.json().wallet).toMatchObject({ status: 'pending', recoveryMode: 'default', attested: false });
    const again = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: dev,
      payload: { pubKeyX: X, pubKeyY: Y, credentialId: CRED },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().address).toBe(wallet);
  });

  it('protect is refused until all three recoverers are registered', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: { kind: 'protect', walletAddress: wallet, deviceLabel: 'Lea · phone' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/Add all three recoverers/);
  });

  it('registers the Safety key through a pairing code, the Emergency card directly, Swissquote from sq-guardian', async () => {
    const pairing = await app.inject({ method: 'POST', url: '/pairings', headers: dev, payload: { wallet } });
    expect(pairing.statusCode).toBe(201);
    const { code } = pairing.json();
    expect(code).toMatch(/^\d{6}$/);
    expect(pairing.json().simulated).toBe(true);
    const same = await app.inject({ method: 'POST', url: '/pairings', headers: dev, payload: { wallet } });
    expect(same.json().code).toBe(code);

    const poll1 = await app.inject({ method: 'GET', url: `/pairings/${code}` });
    expect(poll1.json().status).toBe('open');
    const claim = await app.inject({
      method: 'POST',
      url: `/pairings/${code}/claim`,
      payload: { kind: 'safety-key', address: SAFETY },
    });
    expect(claim.statusCode, claim.body).toBe(201);
    expect(claim.json()).toMatchObject({ kind: 'safety-key', address: getAddress(SAFETY) });
    const poll2 = await app.inject({ method: 'GET', url: `/pairings/${code}` });
    expect(poll2.json().status).toBe('claimed');
    expect(poll2.json().guardian.address).toBe(getAddress(SAFETY));
    const reclaim = await app.inject({
      method: 'POST',
      url: `/pairings/${code}/claim`,
      payload: { kind: 'safety-key', address: EMERGENCY },
    });
    expect(reclaim.statusCode).toBe(409);

    const em = await app.inject({
      method: 'POST',
      url: `/wallets/${wallet}/guardians`,
      headers: dev,
      payload: { kind: 'emergency-card', address: EMERGENCY },
    });
    expect(em.statusCode).toBe(201);
    const dup = await app.inject({
      method: 'POST',
      url: `/wallets/${wallet}/guardians`,
      headers: dev,
      payload: { kind: 'emergency-card', address: SAFETY },
    });
    expect(dup.statusCode).toBe(409);
    const sq = await app.inject({
      method: 'POST',
      url: `/wallets/${wallet}/guardians`,
      headers: dev,
      payload: { kind: 'swissquote' },
    });
    expect(sq.statusCode, sq.body).toBe(201);
    expect(sq.json().address).toBe(getAddress(SQ_GUARDIAN));

    const list = await app.inject({ method: 'GET', url: `/wallets/${wallet}/guardians`, headers: dev });
    expect(list.json()).toMatchObject({
      complete: true,
      threshold: 2,
      requiredKinds: ['safety-key', 'emergency-card', 'swissquote'],
    });
    expect(list.json().guardians).toHaveLength(3);
  });

  it('POST /policy/evaluate protect → Tier 1 approve with bank-recomputed calls and the init-prefixed callsHash', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: { kind: 'protect', walletAddress: wallet, deviceLabel: 'Lea · phone' },
    });
    expect(res.statusCode, res.body).toBe(201);
    const decision = PolicyDecisionSchema.parse(res.json());
    expect(decision).toMatchObject({
      verdict: 'approve',
      tier: 1,
      kind: 'protect',
      sponsorship: { sponsored: true, remainingToday: 19 },
    });
    expect(decision.reasons[0]).toBe('Protecting your wallet · network fee paid by Swissquote');
    expect(decision.calls).toHaveLength(4); // enableModule + 3 × addGuardianWithThreshold
    const txs = protectTransactions(pk, {
      guardians: [SAFETY, EMERGENCY, SQ_GUARDIAN],
      threshold: 2,
      recoveryModule: MODULE,
    });
    expect(decision.calls).toEqual(txs.map(metaTransactionToCall));
    protectCallDataHex = protectCallData(pk, txs, false);
    expect(decision.callsHash).toBe(keccak256(protectCallDataHex));
    expect(decision.simulation.decodedCalls.map((c) => c.fn)).toEqual([
      'enableModule(address)',
      'addGuardianWithThreshold(address,uint256)',
      'addGuardianWithThreshold(address,uint256)',
      'addGuardianWithThreshold(address,uint256)',
    ]);
    protectDecisionId = decision.decisionId;
  });

  it('refuses sponsorship without a decision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/userops/sponsor',
      payload: { decisionId: 'dec_missing', userOp: baseOp(protectCallDataHex, true) },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'policy-refused' });
    expect(res.json().message).toMatch(/No policy decision/);
  });

  it('refuses sponsorship when the callData does not match the evaluated calls', async () => {
    const other = encodeCallData([transferTransaction({ token: USDC, to: SAFETY, amount: 1n })]);
    const res = await app.inject({
      method: 'POST',
      url: '/userops/sponsor',
      payload: { decisionId: protectDecisionId, userOp: baseOp(other, true) },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/callData does not match/);
    expect(res.json().details.expected).toBe(keccak256(protectCallDataHex));
  });

  it('refuses sponsorship of an already-signed op', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/userops/sponsor',
      payload: {
        decisionId: protectDecisionId,
        userOp: baseOp(protectCallDataHex, true, `0x${'99'.repeat(65)}`),
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/must be unsigned/);
  });

  it('refuses sponsorship with an expired decision', async () => {
    app.db
      .prepare("UPDATE policy_decisions SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?")
      .run(protectDecisionId);
    const res = await app.inject({
      method: 'POST',
      url: '/userops/sponsor',
      payload: { decisionId: protectDecisionId, userOp: baseOp(protectCallDataHex, true) },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/expired/);
    app.db
      .prepare('UPDATE policy_decisions SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() + 600_000).toISOString(), protectDecisionId);
  });

  it('sponsors a valid unsigned op, relays the signed one and marks the wallet deployed once included', async () => {
    const sponsor = await app.inject({
      method: 'POST',
      url: '/userops/sponsor',
      payload: { decisionId: protectDecisionId, userOp: baseOp(protectCallDataHex, true) },
    });
    expect(sponsor.statusCode, sponsor.body).toBe(200);
    expect(sponsor.json().userOp.paymaster).toBe('0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba');
    expect(sponsor.json().sponsorship).toMatchObject({ sponsored: true, remainingToday: 19 });

    const unsigned = await app.inject({
      method: 'POST',
      url: '/userops/send',
      payload: { decisionId: protectDecisionId, userOp: sponsor.json().userOp },
    });
    expect(unsigned.statusCode).toBe(403);
    expect(unsigned.json().message).toMatch(/not signed/);

    const signed = { ...sponsor.json().userOp, signature: `0x${'77'.repeat(120)}` };
    const send = await app.inject({
      method: 'POST',
      url: '/userops/send',
      payload: { decisionId: protectDecisionId, userOp: signed },
    });
    expect(send.statusCode, send.body).toBe(200);
    const { userOpHash } = send.json();
    expect(userOpHash).toBe(H(0x6687));

    const resend = await app.inject({
      method: 'POST',
      url: '/userops/sponsor',
      payload: { decisionId: protectDecisionId, userOp: baseOp(protectCallDataHex, true) },
    });
    expect(resend.statusCode).toBe(403);
    expect(resend.json().message).toMatch(/already used/);

    const pending = await app.inject({ method: 'GET', url: `/userops/${userOpHash}` });
    expect(pending.json()).toMatchObject({ status: 'pending', walletStatus: 'pending' });

    state.status = { status: 'included', txHash: H(0x61a4), blockNumber: 31_337 };
    const done = await app.inject({ method: 'GET', url: `/userops/${userOpHash}` });
    expect(done.json()).toMatchObject({
      status: 'included',
      txHash: H(0x61a4),
      blockNumber: 31_337,
      walletStatus: 'deployed',
    });
    expect(done.json().explorerUrl).toBe(`https://sepolia.basescan.org/tx/${H(0x61a4)}`);
    const w = await app.inject({ method: 'GET', url: `/wallets/${wallet}`, headers: dev });
    expect(w.json()).toMatchObject({ status: 'deployed', deployTxHash: H(0x61a4) });
    expect(w.json().guardians.every((g: { addedTxHash?: string }) => g.addedTxHash === H(0x61a4))).toBe(true);
  });

  it('evaluates a USDC transfer: 100 USDC = CHF 80 → Tier 1 approve, 1300 USDC → step-up', async () => {
    // Wave 3: a first transfer to an unknown address is Tier 3 (cooling) — save the recipient as a contact first.
    const saved = await app.inject({
      method: 'POST',
      url: '/contacts',
      headers: dev,
      payload: { label: 'Emergency card holder', address: EMERGENCY },
    });
    expect(saved.statusCode, saved.body).toBe(201);
    const tx = transferTransaction({ token: USDC, to: EMERGENCY, amount: 100_000_000n });
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
    expect(res.json()).toMatchObject({ verdict: 'approve', tier: 1, chfValue: 80, kind: 'transfer' });
    expect(res.json().callsHash).toBe(keccak256(encodeCallData([tx])));
    expect(res.json().simulation.decodedCalls[0].humanText).toMatch(/Send 100 USDC/);
    expect(res.json().screening).toMatchObject({
      hit: false,
      listsChecked: ['OFAC-SDN', 'SECO'],
      simulated: true,
    });

    const big = transferTransaction({ token: USDC, to: EMERGENCY, amount: 1_300_000_000n });
    const up = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'transfer',
        walletAddress: wallet,
        calls: [metaTransactionToCall(big)],
        deviceLabel: 'Lea · phone',
      },
    });
    expect(up.json()).toMatchObject({ verdict: 'step-up', tier: 2, chfValue: 1040 });

    const bad = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'transfer',
        walletAddress: wallet,
        calls: [{ to: EMERGENCY, value: '0', data: '0x' }],
        deviceLabel: 'Lea · phone',
      },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('top-up is refused while the wallet has not proven ownership (Travel Rule)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/topups',
      headers: dev,
      payload: { wallet, amountUsdc: 25 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe("This wallet hasn't proven ownership yet");
  });

  it('attestation: wrong signer rejected, valid accepted, replayed nonce 409', async () => {
    const ch = await app.inject({ method: 'GET', url: `/attestations/${wallet}/challenge`, headers: dev });
    expect(ch.statusCode, ch.body).toBe(200);
    const { nonce, typedData } = ch.json();
    expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(typedData).toMatchObject({
      primaryType: 'Attestation',
      domain: { name: 'Keyline Ownership Attestation', chainId: 84532, verifyingContract: wallet },
      message: { clientId: 'SQ-48213-LK', wallet, chainId: 84532, nonce },
    });

    state.verifyOk = false;
    const bad = await app.inject({
      method: 'POST',
      url: '/attestations',
      headers: dev,
      payload: { wallet, clientId: 'SQ-48213-LK', nonce, signature: '0xdead' },
    });
    expect(bad.statusCode).toBe(403);
    expect(bad.json().message).toMatch(/wrong signer/);

    state.verifyOk = true;
    const other = await app.inject({
      method: 'POST',
      url: '/attestations',
      headers: dev,
      payload: { wallet, clientId: 'SQ-00000-XX', nonce, signature: '0xbeef' },
    });
    expect(other.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'POST',
      url: '/attestations',
      headers: dev,
      payload: { wallet, clientId: 'SQ-48213-LK', nonce, signature: '0xbeef' },
    });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json()).toMatchObject({
      verified: true,
      method: 'erc1271',
      attestation: { walletAddress: wallet, nonce },
    });

    const replay = await app.inject({
      method: 'POST',
      url: '/attestations',
      headers: dev,
      payload: { wallet, clientId: 'SQ-48213-LK', nonce, signature: '0xbeef' },
    });
    expect(replay.statusCode).toBe(409);

    const get = await app.inject({ method: 'GET', url: `/attestations/${wallet}` });
    expect(get.json().method).toBe('erc1271');
    const w = await app.inject({ method: 'GET', url: `/wallets/${wallet}`, headers: dev });
    expect(w.json().attested).toBe(true);
  });

  it('top-up sends USDC from the funder and debits the simulated CHF account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/topups',
      headers: dev,
      payload: { wallet, amountUsdc: 25 },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      txHash: H(0x70b),
      amountUsdc: 25,
      amountChf: 20,
      accountBalanceChf: 12_480,
      simulated: true,
    });

    state.funder = { ...state.funder, usdc: 0n };
    const dry = await app.inject({
      method: 'POST',
      url: '/topups',
      headers: dev,
      payload: { wallet, amountUsdc: 25 },
    });
    expect(dry.statusCode).toBe(502);
    expect(dry.json().message).toMatch(/holds 0 USDC/);

    const me = await app.inject({ method: 'GET', url: '/me', headers: dev });
    expect(me.json()).toMatchObject({
      account: { balance: 12_480, sponsoredToday: 1, simulated: true },
      auth: 'device-label',
    });
    expect(me.json().wallet.address).toBe(wallet);
  });
});
