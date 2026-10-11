// Passkey ceremonies with @simplewebauthn/server. No hand-rolled CBOR/COSE: the (x,y) coordinates
// come from the library's decodeCredentialPublicKey + cose helpers.

import type { Passkey } from '@keyline/shared';
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { cose, decodeCredentialPublicKey, isoBase64URL } from '@simplewebauthn/server/helpers';
import { bytesToHex } from 'viem';
import type { BankConfig } from './config';
import { type Db, newId, nowIso } from './db';
import { conflict, notFound, unauthorized, validationError } from './errors';
import type { EventStore } from './events';
import { LEA } from './seed';

type PasskeyRow = {
  credential_id: string;
  client_id: string;
  wallet_address: string | null;
  role: 'owner';
  public_key: Buffer;
  pub_key_x: string;
  pub_key_y: string;
  counter: number;
  transports: string;
  device_label: string;
  signer_proxy_address: string | null;
  created_at: string;
  revoked_at: string | null;
};

export const rowToPasskey = (r: PasskeyRow): Passkey => ({
  credentialId: r.credential_id,
  walletAddress: r.wallet_address ?? undefined,
  role: 'owner',
  pubKeyX: r.pub_key_x,
  pubKeyY: r.pub_key_y,
  signerProxyAddress: r.signer_proxy_address ?? undefined,
  deviceLabel: r.device_label,
  createdAt: r.created_at,
  revokedAt: r.revoked_at ?? undefined,
});

/** P-256 affine coordinates of a COSE EC2 key, as 0x-hex. Throws on any other key type (we only accept ES256). */
export const extractP256Coordinates = (
  credentialPublicKey: Uint8Array<ArrayBuffer>,
): { pubKeyX: `0x${string}`; pubKeyY: `0x${string}` } => {
  const key = decodeCredentialPublicKey(credentialPublicKey);
  if (!cose.isCOSEPublicKeyEC2(key)) throw validationError('Passkey must be a P-256 (ES256) credential');
  const crv = key.get(cose.COSEKEYS.crv);
  if (crv !== cose.COSECRV.P256) throw validationError('Passkey curve must be P-256');
  const x = key.get(cose.COSEKEYS.x);
  const y = key.get(cose.COSEKEYS.y);
  if (!x || !y || x.length !== 32 || y.length !== 32) throw validationError('Malformed P-256 public key');
  return { pubKeyX: bytesToHex(x), pubKeyY: bytesToHex(y) };
};

export const createWebAuthnService = (db: Db, config: BankConfig, events: EventStore) => {
  const RP_NAME = 'Keyline by Swissquote';
  // Lea is the only client in the prototype; her stable user handle lets the authenticator dedupe credentials.

  const insertChallenge = db.prepare(
    `INSERT INTO webauthn_challenges (id, kind, challenge, client_id, device_label, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const findChallenge = db.prepare(
    `SELECT id, kind, client_id, device_label, expires_at, used_at FROM webauthn_challenges WHERE challenge = ? AND kind = ?`,
  );
  const consumeChallenge = db.prepare(
    `UPDATE webauthn_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL`,
  );
  const purgeExpired = db.prepare(`DELETE FROM webauthn_challenges WHERE expires_at < ?`);

  const findPasskey = db.prepare(`SELECT * FROM passkeys WHERE credential_id = ?`);
  const insertPasskey = db.prepare(
    `INSERT INTO passkeys (credential_id, client_id, wallet_address, role, public_key, pub_key_x, pub_key_y, counter, transports, device_label, created_at)
     VALUES (?, ?, NULL, 'owner', ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateCounter = db.prepare(`UPDATE passkeys SET counter = ? WHERE credential_id = ?`);
  const findWallet = db.prepare(`SELECT * FROM wallets WHERE owner_credential_id = ?`);

  const storeChallenge = (
    kind: 'registration' | 'authentication',
    challenge: string,
    deviceLabel?: string,
    clientId: string = LEA.id,
  ) => {
    purgeExpired.run(nowIso());
    const expiresAt = new Date(Date.now() + config.challengeTtlSeconds * 1000).toISOString();
    insertChallenge.run(newId('chal'), kind, challenge, clientId, deviceLabel ?? null, expiresAt);
  };

  /** Single-use + TTL check. The challenge string is what the browser signed (base64url, from clientDataJSON). */
  const takeChallenge = (kind: 'registration' | 'authentication', challenge: string) => {
    const row = findChallenge.get(challenge, kind) as
      | {
          id: string;
          client_id: string | null;
          device_label: string | null;
          expires_at: string;
          used_at: string | null;
        }
      | undefined;
    if (!row) throw unauthorized('Unknown challenge');
    if (row.used_at) throw unauthorized('Challenge already used');
    if (row.expires_at < nowIso()) throw unauthorized('Challenge expired');
    const res = consumeChallenge.run(nowIso(), row.id);
    if (res.changes !== 1) throw unauthorized('Challenge already used');
    return row;
  };

  const challengeFromClientData = (clientDataJSON: string): string => {
    const parsed = JSON.parse(isoBase64URL.toUTF8String(clientDataJSON)) as { challenge?: unknown };
    if (typeof parsed.challenge !== 'string') throw validationError('clientDataJSON has no challenge');
    return parsed.challenge;
  };

  return {
    /** `clientId` comes from a handoff onboarding token (SPEC §10); Lea is the fallback (old flows / E2E). */
    async registrationOptions(
      deviceLabel: string,
      clientId: string = LEA.id,
    ): Promise<PublicKeyCredentialCreationOptionsJSON> {
      // Each passkey gets its own WebAuthn user handle and a device label, and no credential is excluded. Browsers
      // that share one keychain across profiles (Safari + iCloud Keychain) would otherwise refuse the new phone's
      // key ("already registered") or overwrite Lea's original key. Login never relies on the handle: passkeys are
      // looked up by credential id.
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: config.WALLET_RP_ID,
        userID: globalThis.crypto.getRandomValues(new Uint8Array(16)),
        userName: `${LEA.email} · ${deviceLabel}`,
        userDisplayName: `${LEA.name} · ${deviceLabel}`,
        attestationType: 'none',
        excludeCredentials: [],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        // ES256 only: the Safe WebAuthn signer verifies P-256 through the RIP-7212 precompile.
        supportedAlgorithmIDs: [-7],
      });
      storeChallenge('registration', options.challenge, deviceLabel, clientId);
      return options;
    },

    async verifyRegistration(
      credential: RegistrationResponseJSON,
      deviceLabel: string,
      expectedClientId?: string,
    ): Promise<Passkey> {
      const challenge = challengeFromClientData(credential.response.clientDataJSON);
      const challengeRow = takeChallenge('registration', challenge);
      const clientId = challengeRow.client_id ?? LEA.id;
      if (expectedClientId && expectedClientId !== clientId)
        throw unauthorized('This passkey challenge was issued for another client');
      // The library reports a bad attestation by throwing a plain Error; surface it as 401, not 500.
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: config.WALLET_ORIGIN,
        expectedRPID: config.WALLET_RP_ID,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7],
      }).catch((err: unknown) => {
        throw unauthorized(
          `Passkey registration failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      if (!verification.verified || !verification.registrationInfo)
        throw unauthorized('Passkey registration failed');
      const info = verification.registrationInfo;
      if (findPasskey.get(info.credential.id)) throw conflict('This passkey is already registered');

      const { pubKeyX, pubKeyY } = extractP256Coordinates(info.credential.publicKey);
      const createdAt = nowIso();
      insertPasskey.run(
        info.credential.id,
        clientId,
        Buffer.from(info.credential.publicKey),
        pubKeyX,
        pubKeyY,
        info.credential.counter,
        JSON.stringify(info.credential.transports ?? []),
        deviceLabel,
        createdAt,
      );
      events.recordEvent('passkey.registered', undefined, {
        clientId,
        credentialId: info.credential.id,
        deviceLabel,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        aaguid: info.aaguid,
      });
      return rowToPasskey(findPasskey.get(info.credential.id) as PasskeyRow);
    },

    async authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
      const options = await generateAuthenticationOptions({
        rpID: config.WALLET_RP_ID,
        userVerification: 'required',
        allowCredentials: [], // discoverable credential: the authenticator picks Lea's passkey
      });
      storeChallenge('authentication', options.challenge);
      return options;
    },

    async verifyAuthentication(
      credential: AuthenticationResponseJSON,
    ): Promise<{ passkey: Passkey; wallet: unknown }> {
      const challenge = challengeFromClientData(credential.response.clientDataJSON);
      takeChallenge('authentication', challenge);
      const row = findPasskey.get(credential.id) as PasskeyRow | undefined;
      if (!row) throw notFound('Passkey');
      if (row.revoked_at) throw unauthorized('This passkey was revoked');
      // The library enforces the signature counter itself (a counter that does not advance → throws).
      // Platform authenticators that always report 0 are accepted by the library (0 → 0 is allowed).
      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: config.WALLET_ORIGIN,
        expectedRPID: config.WALLET_RP_ID,
        requireUserVerification: true,
        credential: {
          id: row.credential_id,
          publicKey: new Uint8Array(row.public_key),
          counter: row.counter,
          transports: JSON.parse(row.transports) as WebAuthnCredential['transports'],
        },
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (/counter/i.test(message)) {
          // Clone detection: the desk sees this in the event feed.
          events.recordEvent('passkey.counter-anomaly', row.wallet_address ?? undefined, {
            credentialId: row.credential_id,
            stored: row.counter,
            detail: message,
          });
          throw unauthorized('Passkey counter anomaly — possible cloned authenticator');
        }
        throw unauthorized(`Passkey assertion failed: ${message}`);
      });
      if (!verification.verified) throw unauthorized('Passkey assertion failed');
      updateCounter.run(verification.authenticationInfo.newCounter, row.credential_id);
      events.recordEvent('session.login', row.wallet_address ?? undefined, {
        credentialId: row.credential_id,
        deviceLabel: row.device_label,
      });
      return { passkey: rowToPasskey(row), wallet: findWallet.get(row.credential_id) ?? null };
    },

    getPasskey(credentialId: string): Passkey | undefined {
      const row = findPasskey.get(credentialId) as PasskeyRow | undefined;
      return row ? rowToPasskey(row) : undefined;
    },
  };
};
export type WebAuthnService = ReturnType<typeof createWebAuthnService>;
