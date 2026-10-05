// HTTP-level tests through fastify.inject (no port). The WebAuthn round-trip builds a synthetic platform
// authenticator with Node's crypto (P-256 keys, DER ECDSA) and the library's CBOR helper — no custom crypto.
import { createHash, generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { HealthSchema, LoginVerifyResponseSchema, RegisterVerifyResponseSchema } from '@keyline/shared';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { WAVE1_STUBS } from './routes/stubs';
import { testConfig } from './test-env';

const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();
const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:3000';

/** A fake platform authenticator: one P-256 credential, counter we control. */
const makeAuthenticator = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const credentialId = Buffer.from(`cred-${Date.now()}`);
  return { privateKey, x, y, credentialId };
};

const authDataFor = (flags: number, counter: number, attested?: Uint8Array) => {
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(counter);
  return Buffer.concat([sha256(RP_ID), Buffer.from([flags]), counterBuf, attested ?? Buffer.alloc(0)]);
};

const registrationResponse = (auth: ReturnType<typeof makeAuthenticator>, challenge: string) => {
  const cosePublicKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, new Uint8Array(auth.x)],
      [-3, new Uint8Array(auth.y)],
    ]),
  );
  const idLen = Buffer.alloc(2);
  idLen.writeUInt16BE(auth.credentialId.length);
  const attestedCredentialData = Buffer.concat([
    Buffer.alloc(16),
    idLen,
    auth.credentialId,
    Buffer.from(cosePublicKey),
  ]);
  // flags: UP (0x01) | UV (0x04) | AT (0x40)
  const authData = authDataFor(0x45, 0, attestedCredentialData);
  const attStmt = new Map<string, never>();
  const attestationObject = isoCBOR.encode(
    new Map<string, string | Map<string, never> | Uint8Array<ArrayBuffer>>([
      ['fmt', 'none'],
      ['attStmt', attStmt],
      ['authData', new Uint8Array(authData)],
    ]),
  );
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN, crossOrigin: false }),
  );
  return {
    id: b64url(auth.credentialId),
    rawId: b64url(auth.credentialId),
    type: 'public-key',
    response: {
      clientDataJSON: b64url(clientDataJSON),
      attestationObject: b64url(attestationObject),
      transports: ['internal'],
    },
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
  };
};

const authenticationResponse = (
  auth: { privateKey: KeyObject; credentialId: Buffer },
  challenge: string,
  counter: number,
) => {
  const authData = authDataFor(0x05, counter); // UP | UV
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: 'webauthn.get', challenge, origin: ORIGIN, crossOrigin: false }),
  );
  const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), {
    key: auth.privateKey,
    dsaEncoding: 'der',
  });
  return {
    id: b64url(auth.credentialId),
    rawId: b64url(auth.credentialId),
    type: 'public-key',
    response: {
      clientDataJSON: b64url(clientDataJSON),
      authenticatorData: b64url(authData),
      signature: b64url(signature),
    },
    clientExtensionResults: {},
  };
};

describe('bank app', () => {
  let app: FastifyInstance;
  let calls = 0;

  beforeAll(async () => {
    app = await buildApp(testConfig(), { dbPath: ':memory:', logger: false });
    app.post('/__test/idempotent', { config: { idempotent: true } }, async () => ({ n: ++calls }));
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns a schema-valid body', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthSchema.parse(res.json());
    expect(body.paymasterEnabled).toBe(false);
    expect(body.chainId).toBe(84532);
  });

  it('seeds Lea, three contacts and the dApp allowlist', async () => {
    const contacts = (await app.inject({ method: 'GET', url: '/contacts' })).json<{
      contacts: { label: string; simulated?: true }[];
    }>();
    expect(contacts.contacts.map((c) => c.label).sort()).toEqual([
      'Lukas Meier',
      'Marta Rossi',
      'Sanctioned test address',
    ]);
    expect(contacts.contacts.find((c) => c.label === 'Sanctioned test address')?.simulated).toBe(true);
    const dapps = (await app.inject({ method: 'GET', url: '/dapps' })).json<{
      dapps: { id: string; allowlisted: boolean }[];
    }>();
    expect(dapps.dapps.find((d) => d.id === 'demoswap')?.allowlisted).toBe(true);
    expect(dapps.dapps.find((d) => d.id === 'unknown-dapp')?.allowlisted).toBe(false);
  });

  it('desk routes require the operator token', async () => {
    expect((await app.inject({ method: 'GET', url: '/desk/events' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/desk/events', headers: { 'x-operator-token': 'wrong' } }))
        .statusCode,
    ).toBe(403);
    const ok = await app.inject({
      method: 'GET',
      url: '/desk/events',
      headers: { 'x-operator-token': 'desk-test-token' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ events: { type: string }[] }>().events.some((e) => e.type === 'seed.applied')).toBe(
      true,
    );
  });

  it('every Wave-1 stub answers 501 not-implemented-yet', async () => {
    for (const stub of WAVE1_STUBS) {
      const res = await app.inject({
        method: stub.method,
        url: stub.url
          .replace(':address', '0x0000000000000000000000000000000000000001')
          .replace(/:(id|wallet|hash)/, 'x'),
        headers: stub.operator ? { 'x-operator-token': 'desk-test-token' } : {},
        payload: stub.method === 'POST' ? {} : undefined,
      });
      expect(res.statusCode, `${stub.method} ${stub.url}`).toBe(501);
      expect(res.json()).toMatchObject({ error: 'not-implemented-yet', wave: 3 });
    }
  });

  it('maps zod failures to 400 with issues', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/passkey/register/options', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation' });
  });

  it('replays the same response for the same Idempotency-Key', async () => {
    const h = { 'idempotency-key': 'k-1' };
    const a = await app.inject({ method: 'POST', url: '/__test/idempotent', headers: h, payload: {} });
    const b = await app.inject({ method: 'POST', url: '/__test/idempotent', headers: h, payload: {} });
    const c = await app.inject({ method: 'POST', url: '/__test/idempotent', payload: { requestId: 'k-2' } });
    expect(a.json()).toEqual(b.json());
    expect(b.headers['idempotent-replayed']).toBe('true');
    expect(c.json()).not.toEqual(a.json());
  });

  it('registers a passkey, logs in, refuses replay and counter regression', async () => {
    const auth = makeAuthenticator();

    const opts = await app.inject({
      method: 'POST',
      url: '/auth/passkey/register/options',
      payload: { deviceLabel: 'Lea · phone' },
    });
    expect(opts.statusCode).toBe(200);
    const options = opts.json<{ challenge: string; authenticatorSelection: Record<string, string> }>();
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    });

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/passkey/register/verify',
      payload: { credential: registrationResponse(auth, options.challenge), deviceLabel: 'Lea · phone' },
    });
    expect(reg.statusCode, reg.body).toBe(200);
    const { passkey } = RegisterVerifyResponseSchema.parse(reg.json());
    expect(passkey.pubKeyX).toBe(`0x${auth.x.toString('hex')}`);
    expect(passkey.pubKeyY).toBe(`0x${auth.y.toString('hex')}`);
    expect(passkey.credentialId).toBe(b64url(auth.credentialId));

    // Replaying the registration (same challenge) must fail: challenges are single-use.
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/passkey/register/verify',
      payload: { credential: registrationResponse(auth, options.challenge), deviceLabel: 'Lea · phone' },
    });
    expect(replay.statusCode).toBe(401);

    const loginOpts = (await app.inject({ method: 'POST', url: '/auth/passkey/login/options' })).json<{
      challenge: string;
      allowCredentials?: unknown[];
    }>();
    expect(loginOpts.allowCredentials ?? []).toEqual([]);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/passkey/login/verify',
      payload: { credential: authenticationResponse(auth, loginOpts.challenge, 1) },
    });
    expect(login.statusCode, login.body).toBe(200);
    const body = LoginVerifyResponseSchema.parse(login.json());
    expect(body.wallet).toBeNull();
    expect(body.session.credentialId).toBe(passkey.credentialId);
    const cookie = login.cookies.find((c) => c.name === 'keyline_session');
    expect(cookie?.httpOnly).toBe(true);

    // The session cookie authenticates /auth/session.
    const session = await app.inject({
      method: 'GET',
      url: '/auth/session',
      cookies: { keyline_session: cookie?.value ?? '' },
    });
    expect(session.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/auth/session' })).statusCode).toBe(401);

    // Counter going backwards → cloned authenticator suspicion → 401 and an event.
    const loginOpts2 = (await app.inject({ method: 'POST', url: '/auth/passkey/login/options' })).json<{
      challenge: string;
    }>();
    const regress = await app.inject({
      method: 'POST',
      url: '/auth/passkey/login/verify',
      payload: { credential: authenticationResponse(auth, loginOpts2.challenge, 0) },
    });
    expect(regress.statusCode).toBe(401);
    const desk = await app.inject({
      method: 'GET',
      url: '/desk/events',
      headers: { 'x-operator-token': 'desk-test-token' },
    });
    const types = desk.json<{ events: { type: string }[] }>().events.map((e) => e.type);
    expect(types).toContain('passkey.registered');
    expect(types).toContain('session.login');
    expect(types).toContain('passkey.counter-anomaly');
  });
});
