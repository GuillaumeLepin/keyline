// Persistence for recovery requests (table recovery_requests: the full RecoveryRequest lives in request_json,
// status + wallet are mirrored as columns for the desk queries), the SIMULATED OTP inbox, the new passkey row and
// the owner swap at finalize. No chain access here.
import { randomInt } from 'node:crypto';
import {
  type Passkey,
  type RecoveryRequest,
  RecoveryRequestSchema,
  type RecoveryStatus,
} from '@keyline/shared';
import { getAddress } from 'viem';
import { type Db, newId, nowIso } from './db';
import { rowToPasskey } from './webauthn';

type RecoveryRow = {
  id: string;
  wallet_address: string;
  status: string;
  request_json: string;
  email_otp: string | null;
  created_at: string;
  updated_at: string;
};

const rowToRequest = (r: RecoveryRow): RecoveryRequest =>
  RecoveryRequestSchema.parse(JSON.parse(r.request_json));

export const OPEN_RECOVERY_STATUSES: readonly RecoveryStatus[] = [
  'identity-pending',
  'awaiting-guardians',
  'executed-waiting',
];

export const createRecoveryStore = (db: Db) => {
  const insert = db.prepare(
    `INSERT INTO recovery_requests (id, wallet_address, status, request_json, email_otp, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    'UPDATE recovery_requests SET status = ?, request_json = ?, updated_at = ? WHERE id = ?',
  );
  const byId = db.prepare('SELECT * FROM recovery_requests WHERE id = ?');
  const otpById = db.prepare('SELECT email_otp FROM recovery_requests WHERE id = ?');
  const all = db.prepare('SELECT * FROM recovery_requests ORDER BY created_at DESC, rowid DESC LIMIT ?');
  const byStatus = db.prepare('SELECT * FROM recovery_requests WHERE status = ? ORDER BY created_at ASC');
  const byWallet = db.prepare(
    'SELECT * FROM recovery_requests WHERE lower(wallet_address) = lower(?) ORDER BY created_at DESC, rowid DESC',
  );
  const insertInbox = db.prepare(
    `INSERT INTO inbox (id, to_email, subject, body, otp, recovery_request_id, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const passkeyById = db.prepare('SELECT * FROM passkeys WHERE credential_id = ?');
  const insertPasskey = db.prepare(
    `INSERT INTO passkeys (credential_id, client_id, wallet_address, role, public_key, pub_key_x, pub_key_y, counter, transports, device_label, signer_proxy_address, created_at)
     VALUES (?, ?, ?, 'owner', ?, ?, ?, 0, '[]', ?, ?, ?)`,
  );
  const setProxy = db.prepare(
    'UPDATE passkeys SET signer_proxy_address = ?, wallet_address = COALESCE(wallet_address, ?) WHERE credential_id = ?',
  );
  const revokePasskey = db.prepare(
    'UPDATE passkeys SET revoked_at = ? WHERE credential_id = ? AND revoked_at IS NULL',
  );
  const setOwner = db.prepare(
    'UPDATE wallets SET owner_credential_id = ?, status = ? WHERE lower(address) = lower(?)',
  );
  const setWalletStatus = db.prepare('UPDATE wallets SET status = ? WHERE lower(address) = lower(?)');

  return {
    create(request: RecoveryRequest, emailOtp: string): RecoveryRequest {
      const parsed = RecoveryRequestSchema.parse(request);
      insert.run(
        parsed.id,
        getAddress(parsed.walletAddress),
        parsed.status,
        JSON.stringify(parsed),
        emailOtp,
        parsed.createdAt,
        parsed.updatedAt,
      );
      return parsed;
    },
    get(id: string): RecoveryRequest | null {
      const row = byId.get(id) as RecoveryRow | undefined;
      return row ? rowToRequest(row) : null;
    },
    otp(id: string): string | null {
      return (otpById.get(id) as { email_otp: string | null } | undefined)?.email_otp ?? null;
    },
    /** Replaces the stored request (status column mirrored). Returns the normalised copy. */
    save(request: RecoveryRequest): RecoveryRequest {
      const parsed = RecoveryRequestSchema.parse({ ...request, updatedAt: nowIso() });
      update.run(parsed.status, JSON.stringify(parsed), parsed.updatedAt, parsed.id);
      return parsed;
    },
    list(limit = 200): RecoveryRequest[] {
      return (all.all(limit) as RecoveryRow[]).map(rowToRequest);
    },
    listByStatus(status: RecoveryStatus): RecoveryRequest[] {
      return (byStatus.all(status) as RecoveryRow[]).map(rowToRequest);
    },
    listForWallet(wallet: string): RecoveryRequest[] {
      return (byWallet.all(wallet) as RecoveryRow[]).map(rowToRequest);
    },

    /** SIMULATED e-mail: the 6-digit code lands in the mock inbox the UI reads at /mock/inbox. */
    sendOtpEmail(toEmail: string, recoveryRequestId: string): string {
      const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
      insertInbox.run(
        newId('msg'),
        toEmail,
        'Your Keyline recovery code',
        `Your recovery code is ${otp}. It is valid for this recovery request only. If you did not start a recovery, open Keyline on a device you still have and cancel it.`,
        otp,
        recoveryRequestId,
        nowIso(),
      );
      return otp;
    },

    /** The new phone's passkey (role owner, bound to the wallet, proxy recorded). Idempotent on credential id. */
    upsertNewOwnerPasskey(input: {
      credentialId: string;
      clientId: string;
      wallet: string;
      pubKeyX: string;
      pubKeyY: string;
      deviceLabel: string;
      signerProxyAddress: string;
    }): Passkey {
      const existing = passkeyById.get(input.credentialId) as Parameters<typeof rowToPasskey>[0] | undefined;
      if (existing) {
        setProxy.run(getAddress(input.signerProxyAddress), getAddress(input.wallet), input.credentialId);
      } else {
        insertPasskey.run(
          input.credentialId,
          input.clientId,
          getAddress(input.wallet),
          Buffer.alloc(0),
          input.pubKeyX,
          input.pubKeyY,
          input.deviceLabel,
          getAddress(input.signerProxyAddress),
          nowIso(),
        );
      }
      return rowToPasskey(passkeyById.get(input.credentialId) as Parameters<typeof rowToPasskey>[0]);
    },
    passkey(credentialId: string): Passkey | null {
      const row = passkeyById.get(credentialId) as Parameters<typeof rowToPasskey>[0] | undefined;
      return row ? rowToPasskey(row) : null;
    },

    markWalletRecovering(wallet: string): void {
      setWalletStatus.run('recovering', wallet);
    },
    markWalletDeployed(wallet: string): void {
      setWalletStatus.run('deployed', wallet);
    },
    /** Finalize: the old passkey is revoked, the new credential becomes the wallet owner, status back to deployed. */
    swapOwner(wallet: string, oldCredentialId: string, newCredentialId: string): void {
      db.transaction(() => {
        revokePasskey.run(nowIso(), oldCredentialId);
        setOwner.run(newCredentialId, 'deployed', wallet);
      })();
    },
  };
};
export type RecoveryStore = ReturnType<typeof createRecoveryStore>;
