// DECISIONS #30 — dApp signature requests (personal_sign, SIWE, EIP-712) go through policy: identity, screening,
// SIWE domain hard stop, unlimited permits → laptop approval; never simulated, never sponsored.
import type { FastifyInstance } from 'fastify';
import { type Address, getAddress, hashMessage, keccak256, maxUint256, toHex } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { analyseSignature, NO_EXPIRY } from '../policy/signature-analysis';
import { testConfig } from '../test-env';

const dev = { 'x-device-label': 'Lea · phone' };
const SANCTIONED = getAddress('0x42b16056ee5e2C9bDE34Db76fdb2FA7554Ab0A73');
const USDC = getAddress('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
const SPENDER = getAddress('0x000000000022D473030F116dDEE9F6B43aC78BA3');
const T = (n: number) => `5${n.toString(16).padStart(63, '0')}`;
const permit = (wallet: Address, value: bigint, deadline: bigint, spender: Address = SPENDER) => ({
  domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC },
  types: {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Permit',
  message: { owner: wallet, spender, value: value.toString(), nonce: '0', deadline: deadline.toString() },
});
const permit2 = (amount: bigint, expiration: bigint) => ({
  domain: { name: 'Permit2', chainId: 84532, verifyingContract: SPENDER },
  types: {
    PermitSingle: [
      { name: 'details', type: 'PermitDetails' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' },
    ],
    PermitDetails: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  primaryType: 'PermitSingle',
  message: {
    details: { token: USDC, amount: amount.toString(), expiration: expiration.toString(), nonce: '0' },
    spender: getAddress('0x00000000000000000000000000000000000Fe3e1'),
    sigDeadline: String(Math.floor(Date.now() / 1000) + 600),
  },
});

describe('kind: dapp-signature', () => {
  let app: FastifyInstance;
  let wallet: Address;
  const soon = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const sign = (topic: string, signature: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'dapp-signature',
        topic,
        origin: 'http://localhost:3100',
        walletAddress: wallet,
        deviceLabel: 'Lea · phone',
        signature,
      },
    });
  const siwe = (domain: string) =>
    createSiweMessage({
      domain,
      uri: `http://${domain}`,
      address: wallet,
      chainId: 84532,
      nonce: 'abcdef123456',
      version: '1',
      issuedAt: new Date(),
    });

  beforeAll(async () => {
    app = await buildApp(testConfig(), { logger: false, finalizer: false, screeningOffline: true });
    const res = await app.inject({
      method: 'POST',
      url: '/wallets',
      headers: dev,
      payload: {
        pubKeyX: `0x${'51a9'.repeat(16)}`,
        pubKeyY: `0x${'3e7c'.repeat(16)}`,
        credentialId: 'cred-sig',
      },
    });
    wallet = res.json().address;
    app.db.prepare("UPDATE wallets SET status = 'deployed' WHERE address = ?").run(wallet);
    const propose = async (n: number, url: string, verify: Record<string, unknown>, approve = true) => {
      await app.inject({
        method: 'POST',
        url: '/dapp-sessions',
        headers: dev,
        payload: { topic: T(n), walletAddress: wallet, name: `App ${n}`, url, icons: [], verify },
      });
      if (approve) await app.inject({ method: 'POST', url: `/dapp-sessions/${T(n)}/approve`, headers: dev });
    };
    await propose(1, 'http://localhost:3100', { validation: 'UNKNOWN', origin: 'http://localhost:3100' });
    await propose(2, 'https://new.example', { validation: 'VALID', origin: 'https://new.example' });
    // An active session whose stored identity is (now) invalid — written directly, the API never activates one.
    app.db
      .prepare(
        `INSERT INTO dapp_sessions (topic, wallet_address, client_id, name, url, icons, verify, status, requests, created_at, updated_at)
         VALUES (?, ?, 'SQ-48213-LK', 'Shady', 'https://shady.example', '[]', ?, 'active', 0, ?, ?)`,
      )
      .run(
        T(3),
        wallet,
        JSON.stringify({ validation: 'INVALID', isScam: false, origin: 'https://shady.example' }),
        new Date().toISOString(),
        new Date().toISOString(),
      );
  });
  afterAll(async () => {
    await app.close();
  });

  it('personal_sign → Tier 1 approve, no simulation, NOT sponsored, bound to the EIP-191 digest', async () => {
    const message = toHex('Hello Keyline');
    const res = await sign(T(1), { method: 'personal_sign', message });
    expect(res.statusCode, res.body).toBe(201);
    const d = res.json();
    expect(d).toMatchObject({ kind: 'dapp-signature', verdict: 'approve', tier: 1, calls: [], chfValue: 0 });
    expect(d.reasons).toEqual([
      'Sign a message · this does not move money',
      'No network fee for a signature',
    ]);
    expect(d.sponsorship.sponsored).toBe(false);
    expect(d.sponsorship.remainingToday).toBe(20);
    expect(d.simulation).toMatchObject({ provider: 'fallback', decodedCalls: [] });
    expect(d.callsHash).toBe(keccak256(hashMessage({ raw: message })));
    // A signature decision can never relay a transaction.
    const op = await app.inject({
      method: 'POST',
      url: '/userops/sponsor',
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
    expect(op.statusCode).toBe(403);
    expect(op.json().message).toMatch(/signature, not a transaction/);
  });

  it('SIWE for the session\'s own host → approve "Sign in to localhost:3100"; another host → block (hard stop)', async () => {
    const ok = await sign(T(1), { method: 'personal_sign', message: toHex(siwe('localhost:3100')) });
    expect(ok.json()).toMatchObject({ verdict: 'approve', tier: 1 });
    expect(ok.json().reasons[0]).toBe('Sign in to localhost:3100 · this does not move money');

    const evil = await sign(T(1), { method: 'personal_sign', message: siwe('evil.example') });
    expect(evil.json().verdict).toBe('block');
    expect(evil.json().reasons).toEqual(['This sign-in is for another website']);
    // The wallet's parsed `siwe` field is honoured too, and a port difference counts as another site.
    const declared = await sign(T(1), {
      method: 'personal_sign',
      message: toHex('Sign in please'),
      siwe: { domain: 'localhost:3000', chainId: 84532 },
    });
    expect(declared.json().reasons[0]).toBe('This sign-in is for another website');
  });

  it('Permit / Permit2 with unlimited amount or no expiry → step-up "Unlimited spending permission"; finite → approve', async () => {
    const unlimited = await sign(T(1), {
      method: 'eth_signTypedData_v4',
      typedData: permit(wallet, maxUint256, soon),
    });
    expect(unlimited.json()).toMatchObject({ verdict: 'step-up', tier: 2, recipientAddress: SPENDER });
    expect(unlimited.json().reasons[0]).toBe('Unlimited spending permission');
    expect(unlimited.json().sponsorship.sponsored).toBe(false);

    const forever = await sign(T(1), {
      method: 'eth_signTypedData_v4',
      typedData: permit2(10_000_000n, 2n ** 48n - 1n),
    });
    expect(forever.json()).toMatchObject({ verdict: 'step-up', tier: 2 });

    const finite = await sign(T(1), {
      method: 'eth_signTypedData_v4',
      typedData: permit(wallet, 5_000_000n, soon),
    });
    expect(finite.json()).toMatchObject({ verdict: 'approve', tier: 1 });
    expect(finite.json().reasons[0]).toBe('Sign Permit · this does not move money');
  });

  it('a sanctioned address anywhere in the payload blocks (typed-data spender, plain message text)', async () => {
    const typed = await sign(T(1), {
      method: 'eth_signTypedData_v4',
      typedData: permit(wallet, 1n, soon, SANCTIONED),
    });
    expect(typed.json().verdict).toBe('block');
    expect(typed.json().reasons[0]).toBe('Counterparty appears on the OFAC SDN list — simulated test entry');
    expect(typed.json().screening).toMatchObject({
      hit: true,
      counterparty: SANCTIONED,
      source: 'seeded-test',
    });

    const text = await sign(T(1), {
      method: 'personal_sign',
      message: toHex(`I authorise payouts to ${SANCTIONED.toLowerCase()}`),
    });
    expect(text.json().verdict).toBe('block');
    expect(text.json().screening.counterparty).toBe(SANCTIONED);
  });

  it('identity applies: blocked identity → block; verified-but-new app signing a message → Tier 1 approve', async () => {
    const shady = await sign(T(3), { method: 'personal_sign', message: toHex('hi') });
    expect(shady.json().verdict).toBe('block');
    expect(shady.json().reasons[0]).toBe("This app's identity could not be verified");
    const fresh = await sign(T(2), { method: 'personal_sign', message: toHex('hi') });
    expect(fresh.json()).toMatchObject({ verdict: 'approve', tier: 1, dappName: 'App 2' });
  });

  it('session must be active; topic + payload are required', async () => {
    await app.inject({ method: 'DELETE', url: `/dapp-sessions/${T(2)}`, headers: dev });
    const gone = await sign(T(2), { method: 'personal_sign', message: toHex('hi') });
    expect(gone.statusCode).toBe(403);
    expect(gone.json().message).toMatch(/not connected/);
    const noTopic = await app.inject({
      method: 'POST',
      url: '/policy/evaluate',
      headers: dev,
      payload: {
        kind: 'dapp-signature',
        walletAddress: wallet,
        deviceLabel: 'p',
        signature: { method: 'personal_sign', message: 'x' },
      },
    });
    expect(noTopic.statusCode).toBe(400);
    expect((await sign(T(1), { method: 'eth_signTypedData_v4' })).statusCode).toBe(400);
  });

  it('analysis: order shapes, expiry thresholds, binary personal_sign payloads', () => {
    const order = analyseSignature({
      method: 'eth_signTypedData_v4',
      typedData: {
        domain: { name: 'Seaport', chainId: 84532, verifyingContract: SPENDER },
        types: { OrderComponents: [{ name: 'endTime', type: 'uint256' }] },
        primaryType: 'OrderComponents',
        message: { endTime: NO_EXPIRY.toString() },
      },
    });
    expect(order.unlimited?.why).toBe('expiry');
    const mail = analyseSignature({
      method: 'eth_signTypedData_v4',
      typedData: {
        domain: {},
        types: { Mail: [] },
        primaryType: 'Mail',
        message: { contents: 'value 999999999999999999999999999999999999999' },
      },
    });
    expect(mail.unlimited).toBeUndefined(); // not a permit/order shape
    const binary = analyseSignature({ method: 'personal_sign', message: '0x0001020304' });
    expect(binary.summary).toBe('Sign a message');
    expect(binary.addresses).toEqual([]);
  });
});
