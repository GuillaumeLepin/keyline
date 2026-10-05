/**
 * TEST HARNESS ONLY — never shipped to the app.
 *
 * A software P-256 key (Node WebCrypto) stands in for the phone's passkey and produces a WebAuthn-shaped assertion
 * the way the Candide docs describe for testing. The signature bytes are handed to abstractionkit
 * (`webauthnSignatureFromAssertion` → `createWebAuthnSignature`), never parsed by hand.
 *
 * Keyfile format (`--keyfile <path>`, mode 0600):
 *   { "passkey": <private JWK>, "guardians": { "safetyKey": "0x…", "emergencyCard": "0x…" }, "safe"?: "0x…" }
 * `safe` is recorded once the Safe is deployed: after a recovery the owner passkey changes, so the Safe address can
 * no longer be derived from the current key (`loadPasskeyAccount(safe, owner)` instead of `createPasskeyAccount`).
 * Legacy files that contain a bare JWK are still read (guardians are then generated and the file upgraded).
 */
import { webcrypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { PasskeyPublicKey, WebAuthnAssertion } from '@keyline/chain';
import { type Address, bytesToHex, getAddress, type Hex, hexToBytes, isAddress } from 'viem';
import { generatePrivateKey } from 'viem/accounts';

export interface SoftPasskey {
  readonly publicKey: PasskeyPublicKey;
  sign(challenge: Hex): Promise<WebAuthnAssertion>;
  /** Private JWK, so a spike can persist the key that now owns a Safe (test only). */
  exportJwk(): Promise<JsonWebKey>;
}

export interface GuardianKeys {
  readonly safetyKey: Hex;
  readonly emergencyCard: Hex;
}

export interface TestKeyfile {
  readonly passkey: JsonWebKey;
  readonly guardians: GuardianKeys;
  readonly safe?: Address;
}

export interface TestKeys {
  readonly passkey: SoftPasskey;
  readonly guardians: GuardianKeys;
  /** Deployed Safe this keyfile controls (undefined until the first run records it). */
  readonly safe?: Address;
  /** Persist a new state (deployed Safe address and/or the passkey that now owns it). */
  save(update: { passkey?: SoftPasskey; safe?: Address }): Promise<void>;
}

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value);
}

function parseKeyfile(raw: string): { passkey: JsonWebKey; guardians: GuardianKeys | null; safe?: Address } {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if ('passkey' in parsed && typeof parsed.passkey === 'object' && parsed.passkey !== null) {
    const guardians = parsed.guardians as Record<string, unknown> | undefined;
    const ok = guardians && isHex(guardians.safetyKey) && isHex(guardians.emergencyCard);
    const safe =
      typeof parsed.safe === 'string' && isAddress(parsed.safe) ? getAddress(parsed.safe) : undefined;
    return {
      passkey: parsed.passkey as JsonWebKey,
      guardians: ok
        ? { safetyKey: guardians.safetyKey as Hex, emergencyCard: guardians.emergencyCard as Hex }
        : null,
      safe,
    };
  }
  // legacy: the file is the private JWK itself
  return { passkey: parsed as JsonWebKey, guardians: null };
}

async function importKeyPair(jwk: JsonWebKey): Promise<webcrypto.CryptoKeyPair> {
  const privateKey = await webcrypto.subtle.importKey('jwk', jwk, ALGORITHM, true, ['sign']);
  const { d: _d, ...publicJwk } = jwk;
  const publicKey = await webcrypto.subtle.importKey(
    'jwk',
    { ...publicJwk, key_ops: ['verify'] },
    ALGORITHM,
    true,
    ['verify'],
  );
  return { privateKey, publicKey };
}

async function softPasskeyFromKeyPair(keyPair: webcrypto.CryptoKeyPair): Promise<SoftPasskey> {
  const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  if (!jwk.x || !jwk.y) throw new Error('WebCrypto did not export P-256 coordinates');
  const publicKey: PasskeyPublicKey = {
    x: BigInt(bytesToHex(Buffer.from(jwk.x, 'base64url'))),
    y: BigInt(bytesToHex(Buffer.from(jwk.y, 'base64url'))),
  };
  // Minimal authenticatorData: 32-byte rpIdHash + flags (UP|UV = 0x05) + 4-byte counter, as a real authenticator emits.
  const rpIdHash = new Uint8Array(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('localhost')),
  );
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(rpIdHash, 0);
  authenticatorData[32] = 0x05;

  return {
    publicKey,
    exportJwk: () => webcrypto.subtle.exportKey('jwk', keyPair.privateKey),
    async sign(challenge: Hex): Promise<WebAuthnAssertion> {
      const clientDataJSON = new TextEncoder().encode(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: base64url(hexToBytes(challenge)),
          origin: 'http://localhost:3000',
          crossOrigin: false,
        }),
      );
      const clientDataHash = new Uint8Array(await webcrypto.subtle.digest('SHA-256', clientDataJSON));
      const signedPayload = new Uint8Array(authenticatorData.length + clientDataHash.length);
      signedPayload.set(authenticatorData, 0);
      signedPayload.set(clientDataHash, authenticatorData.length);
      // Browsers return DER (which abstractionkit parses); Node WebCrypto returns IEEE P1363 r||s (2 × 32 bytes).
      // Splitting the two fixed-width integers is not parsing or cryptography — abstractionkit takes {r, s} as is.
      const raw = new Uint8Array(
        await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signedPayload),
      );
      const signature = { r: BigInt(bytesToHex(raw.slice(0, 32))), s: BigInt(bytesToHex(raw.slice(32, 64))) };
      return { authenticatorData, clientDataJSON, signature };
    },
  };
}

/** A fresh software passkey that is NOT persisted (e.g. the "new phone" in the recovery spike before rotation). */
export async function createEphemeralPasskey(): Promise<{ passkey: SoftPasskey; jwk: JsonWebKey }> {
  const keyPair = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  return {
    passkey: await softPasskeyFromKeyPair(keyPair),
    jwk: await webcrypto.subtle.exportKey('jwk', keyPair.privateKey),
  };
}

/** Load (or create) the test passkey + the two stand-in guardian keys; persists to `keyfile` when given. */
export async function loadTestKeys(keyfile?: string): Promise<TestKeys> {
  let jwk: JsonWebKey;
  let guardians: GuardianKeys | null = null;
  let safe: Address | undefined;
  if (keyfile && existsSync(keyfile)) {
    const parsed = parseKeyfile(readFileSync(keyfile, 'utf8'));
    jwk = parsed.passkey;
    guardians = parsed.guardians;
    safe = parsed.safe;
  } else {
    const keyPair = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
    jwk = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey);
  }
  const fixedGuardians: GuardianKeys = guardians ?? {
    safetyKey: generatePrivateKey(),
    emergencyCard: generatePrivateKey(),
  };
  const persist = (passkeyJwk: JsonWebKey, safeAddress: Address | undefined): void => {
    if (!keyfile) return;
    const file: TestKeyfile = { passkey: passkeyJwk, guardians: fixedGuardians, safe: safeAddress };
    writeFileSync(keyfile, JSON.stringify(file, null, 2), { mode: 0o600 });
  };
  persist(jwk, safe);
  const passkey = await softPasskeyFromKeyPair(await importKeyPair(jwk));
  const state = { jwk, safe };
  return {
    passkey,
    guardians: fixedGuardians,
    get safe() {
      return state.safe;
    },
    async save(update) {
      if (update.passkey) state.jwk = await update.passkey.exportJwk();
      if (update.safe) state.safe = getAddress(update.safe);
      persist(state.jwk, state.safe);
    },
  };
}

export async function passkeyFromJwk(jwk: JsonWebKey): Promise<SoftPasskey> {
  return softPasskeyFromKeyPair(await importKeyPair(jwk));
}
