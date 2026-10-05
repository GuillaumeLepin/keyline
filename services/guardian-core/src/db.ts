// Each guardian process owns one SQLite file (CLAUDE.md non-negotiable #3). Plain SQL, no ORM:
// three tables a judge can read in a minute.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { GuardianKind } from './config';

export interface ConfirmationRow {
  recoveryRequestId: string;
  wallet: string;
  newOwner: string;
  executed: boolean;
  txHash: string | null;
  at: number; // unix ms
}

export interface EventRow {
  id: number;
  service: GuardianKind;
  type: string;
  walletAddress: string | null;
  payload: unknown;
  at: number;
}

export interface SeenRequestRow {
  recoveryRequestId: string;
  status: number;
  response: unknown;
  at: number;
}

export interface GuardianDb {
  readonly path: string;
  recordConfirmation(row: Omit<ConfirmationRow, 'at'>): void;
  /** Most recent EXECUTED confirmation for this wallet, if any (SPEC §4: waiting/refused do not count). */
  lastExecutedConfirmation(wallet: string): ConfirmationRow | undefined;
  getConfirmation(recoveryRequestId: string): ConfirmationRow | undefined;
  markFinalized(wallet: string, txHash: string): void;
  appendEvent(e: { type: string; walletAddress?: string; payload: unknown }): EventRow;
  listEvents(limit?: number): EventRow[];
  getSeenRequest(recoveryRequestId: string): SeenRequestRow | undefined;
  rememberRequest(recoveryRequestId: string, status: number, response: unknown): void;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS confirmations (
  recovery_request_id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  new_owner TEXT NOT NULL,
  executed INTEGER NOT NULL DEFAULT 0,
  tx_hash TEXT,
  finalized_tx_hash TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS confirmations_wallet_at ON confirmations (wallet, at DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  type TEXT NOT NULL,
  wallet_address TEXT,
  payload TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seen_requests (
  recovery_request_id TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  response TEXT NOT NULL,
  at INTEGER NOT NULL
);
`;

interface RawConfirmation {
  recovery_request_id: string;
  wallet: string;
  new_owner: string;
  executed: number;
  tx_hash: string | null;
  at: number;
}
interface RawEvent {
  id: number;
  service: string;
  type: string;
  wallet_address: string | null;
  payload: string;
  at: number;
}
interface RawSeen {
  recovery_request_id: string;
  status: number;
  response: string;
  at: number;
}

export function openGuardianDb(opts: { path: string; kind: GuardianKind; now?: () => number }): GuardianDb {
  const now = opts.now ?? Date.now;
  if (opts.path !== ':memory:') mkdirSync(dirname(opts.path), { recursive: true });
  const db = new Database(opts.path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const insertConfirmation = db.prepare(
    `INSERT INTO confirmations (recovery_request_id, wallet, new_owner, executed, tx_hash, at)
     VALUES (@recoveryRequestId, @wallet, @newOwner, @executed, @txHash, @at)
     ON CONFLICT(recovery_request_id) DO UPDATE SET executed = excluded.executed, tx_hash = excluded.tx_hash`,
  );
  const selectLastExecuted = db.prepare(
    `SELECT * FROM confirmations WHERE wallet = ? COLLATE NOCASE AND executed = 1 ORDER BY at DESC LIMIT 1`,
  );
  const updateFinalized = db.prepare(
    `UPDATE confirmations SET finalized_tx_hash = ? WHERE wallet = ? COLLATE NOCASE AND executed = 1 AND finalized_tx_hash IS NULL`,
  );
  const insertEvent = db.prepare(
    `INSERT INTO events (service, type, wallet_address, payload, at) VALUES (?, ?, ?, ?, ?)`,
  );
  const selectEvents = db.prepare(`SELECT * FROM events ORDER BY id DESC LIMIT ?`);
  const selectSeen = db.prepare(`SELECT * FROM seen_requests WHERE recovery_request_id = ?`);
  const insertSeen = db.prepare(
    `INSERT OR REPLACE INTO seen_requests (recovery_request_id, status, response, at) VALUES (?, ?, ?, ?)`,
  );

  const toConfirmation = (r: RawConfirmation): ConfirmationRow => ({
    recoveryRequestId: r.recovery_request_id,
    wallet: r.wallet,
    newOwner: r.new_owner,
    executed: r.executed === 1,
    txHash: r.tx_hash,
    at: r.at,
  });
  const toEvent = (r: RawEvent): EventRow => ({
    id: r.id,
    service: r.service as GuardianKind,
    type: r.type,
    walletAddress: r.wallet_address,
    payload: JSON.parse(r.payload) as unknown,
    at: r.at,
  });

  return {
    path: opts.path,
    recordConfirmation(row) {
      insertConfirmation.run({
        recoveryRequestId: row.recoveryRequestId,
        wallet: row.wallet,
        newOwner: row.newOwner,
        executed: row.executed ? 1 : 0,
        txHash: row.txHash,
        at: now(),
      });
    },
    getConfirmation(recoveryRequestId) {
      const r = db
        .prepare(`SELECT * FROM confirmations WHERE recovery_request_id = ?`)
        .get(recoveryRequestId) as RawConfirmation | undefined;
      return r ? toConfirmation(r) : undefined;
    },
    lastExecutedConfirmation(wallet) {
      const r = selectLastExecuted.get(wallet) as RawConfirmation | undefined;
      return r ? toConfirmation(r) : undefined;
    },
    markFinalized(wallet, txHash) {
      updateFinalized.run(txHash, wallet);
    },
    appendEvent(e) {
      const at = now();
      const info = insertEvent.run(opts.kind, e.type, e.walletAddress ?? null, JSON.stringify(e.payload), at);
      return {
        id: Number(info.lastInsertRowid),
        service: opts.kind,
        type: e.type,
        walletAddress: e.walletAddress ?? null,
        payload: e.payload,
        at,
      };
    },
    listEvents(limit = 200) {
      return (selectEvents.all(limit) as RawEvent[]).map(toEvent);
    },
    getSeenRequest(recoveryRequestId) {
      const r = selectSeen.get(recoveryRequestId) as RawSeen | undefined;
      return r
        ? {
            recoveryRequestId: r.recovery_request_id,
            status: r.status,
            response: JSON.parse(r.response),
            at: r.at,
          }
        : undefined;
    },
    rememberRequest(recoveryRequestId, status, response) {
      insertSeen.run(recoveryRequestId, status, JSON.stringify(response), now());
    },
    close() {
      db.close();
    },
  };
}
