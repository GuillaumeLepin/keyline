// SQLite via better-sqlite3 (native build OK on Node 24). Plain SQL, idempotent migrations.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, kyc_level TEXT NOT NULL,
    account_balance_chf REAL NOT NULL DEFAULT 12500, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS wallets (
    address TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), chain_id INTEGER NOT NULL,
    owner_credential_id TEXT NOT NULL, status TEXT NOT NULL, recovery_mode TEXT NOT NULL,
    deploy_tx_hash TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS passkeys (
    credential_id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), wallet_address TEXT,
    role TEXT NOT NULL DEFAULT 'owner', public_key BLOB NOT NULL, pub_key_x TEXT NOT NULL, pub_key_y TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '[]', device_label TEXT NOT NULL,
    signer_proxy_address TEXT, created_at TEXT NOT NULL, revoked_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS guardians (
    wallet_address TEXT NOT NULL, kind TEXT NOT NULL, address TEXT NOT NULL, added_tx_hash TEXT,
    created_at TEXT NOT NULL, PRIMARY KEY (wallet_address, kind))`,
  `CREATE TABLE IF NOT EXISTS attestations (
    wallet_address TEXT PRIMARY KEY, client_id TEXT NOT NULL, nonce TEXT NOT NULL UNIQUE, chain_id INTEGER NOT NULL,
    signature TEXT NOT NULL, verified_at TEXT NOT NULL, method TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS contacts (
    client_id TEXT NOT NULL, label TEXT NOT NULL, address TEXT NOT NULL, first_seen_at TEXT NOT NULL,
    verified_ownership INTEGER NOT NULL DEFAULT 0, simulated INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (client_id, address))`,
  `CREATE TABLE IF NOT EXISTS dapps (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, allowlisted INTEGER NOT NULL,
    contracts TEXT NOT NULL, simulated INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS policy_decisions (
    id TEXT PRIMARY KEY, wallet_address TEXT NOT NULL, request_json TEXT NOT NULL, decision_json TEXT NOT NULL,
    verdict TEXT NOT NULL, chf_value REAL NOT NULL, calls_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
    consumed_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sponsorships (
    id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, wallet_address TEXT NOT NULL, user_op_hash TEXT,
    created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS userops (
    user_op_hash TEXT PRIMARY KEY, wallet_address TEXT NOT NULL, decision_id TEXT, status TEXT NOT NULL,
    tx_hash TEXT, block_number INTEGER, user_op_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS recovery_requests (
    id TEXT PRIMARY KEY, wallet_address TEXT NOT NULL, status TEXT NOT NULL, request_json TEXT NOT NULL,
    email_otp TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inbox (
    id TEXT PRIMARY KEY, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, otp TEXT,
    recovery_request_id TEXT, sent_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, service TEXT NOT NULL DEFAULT 'bank', type TEXT NOT NULL, wallet_address TEXT,
    payload TEXT NOT NULL, at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS events_wallet_idx ON events(wallet_address, at)`,
  `CREATE TABLE IF NOT EXISTS idempotency (
    key TEXT PRIMARY KEY, route TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, challenge TEXT NOT NULL, client_id TEXT, device_label TEXT,
    expires_at TEXT NOT NULL, used_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS pairings (
    code TEXT PRIMARY KEY, wallet_address TEXT NOT NULL, client_id TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, claimed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS attestation_nonces (
    nonce TEXT PRIMARY KEY, wallet_address TEXT NOT NULL, client_id TEXT NOT NULL, created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, used_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS topups (
    id TEXT PRIMARY KEY, wallet_address TEXT NOT NULL, client_id TEXT NOT NULL, amount_usdc REAL NOT NULL,
    amount_chf REAL NOT NULL, tx_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS decisions_wallet_idx ON policy_decisions(wallet_address, created_at)`,
  `CREATE INDEX IF NOT EXISTS sponsorships_wallet_idx ON sponsorships(wallet_address, created_at)`,
  // Append-only guarantee enforced in the database itself, not only by the TS module surface.
  `CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
    BEGIN SELECT RAISE(ABORT, 'events is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
    BEGIN SELECT RAISE(ABORT, 'events is append-only'); END`,
];

export const openDb = (path: string): Db => {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.transaction(() => {
    for (const sql of MIGRATIONS) db.exec(sql);
  })();
  return db;
};

export const nowIso = (): string => new Date().toISOString();
export const newId = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
