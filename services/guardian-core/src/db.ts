// Each guardian process owns one SQLite file (CLAUDE.md non-negotiable #3). Plain SQL, no ORM:
// three tables a judge can read in a minute.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { GuardianKind } from './config';

export type ConfirmationMode = 'signature' | 'onchain';

export interface ConfirmationRow {
  recoveryRequestId: string;
  wallet: string;
  newOwner: string;
  mode: ConfirmationMode;
  /** True once the recovery is executed on-chain (grace period running). This is what the 24 h rule keys on. */
  executed: boolean;
  /** 'onchain': our confirmRecovery tx. 'signature': the bank's multiConfirmRecovery tx once reported. */
  txHash: string | null;
  /** 'signature' mode: the EIP-712 signature we returned and the module nonce it is bound to. */
  signature: string | null;
  nonce: string | null;
  /** unix seconds, from `status(wallet)` at the time execution was recorded. */
  executeAfter: number | null;
  finalizedTxHash: string | null;
  at: number; // unix ms — when we confirmed/signed
  executedAt: number | null; // unix ms — when execution was recorded
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
  recordConfirmation(row: {
    recoveryRequestId: string;
    wallet: string;
    newOwner: string;
    mode: ConfirmationMode;
    executed: boolean;
    txHash: string | null;
    signature?: string | null;
    nonce?: string | null;
    executeAfter?: number | null;
  }): void;
  /** Bank told us (and chain confirmed) the recovery was executed: flips `executed`, stamps `executedAt`. */
  markExecuted(recoveryRequestId: string, p: { txHash: string; executeAfter: number }): void;
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

/** Wave 2 columns, added in place so a Wave 0 SQLite file keeps working. */
const CONFIRMATION_COLUMNS: Record<string, string> = {
  mode: "TEXT NOT NULL DEFAULT 'onchain'",
  signature: 'TEXT',
  nonce: 'TEXT',
  execute_after: 'INTEGER',
  executed_at: 'INTEGER',
};

interface RawConfirmation {
  recovery_request_id: string;
  wallet: string;
  new_owner: string;
  mode: string;
  executed: number;
  tx_hash: string | null;
  signature: string | null;
  nonce: string | null;
  execute_after: number | null;
  finalized_tx_hash: string | null;
  at: number;
  executed_at: number | null;
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
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(confirmations)`).all() as { name: string }[]).map((c) => c.name),
  );
  for (const [column, ddl] of Object.entries(CONFIRMATION_COLUMNS)) {
    if (!existing.has(column)) db.exec(`ALTER TABLE confirmations ADD COLUMN ${column} ${ddl}`);
  }

  const insertConfirmation = db.prepare(
    `INSERT INTO confirmations (recovery_request_id, wallet, new_owner, mode, executed, tx_hash, signature, nonce, execute_after, at, executed_at)
     VALUES (@recoveryRequestId, @wallet, @newOwner, @mode, @executed, @txHash, @signature, @nonce, @executeAfter, @at, @executedAt)
     ON CONFLICT(recovery_request_id) DO UPDATE SET
       executed = excluded.executed, tx_hash = excluded.tx_hash, signature = excluded.signature,
       nonce = excluded.nonce, execute_after = excluded.execute_after, executed_at = excluded.executed_at`,
  );
  const updateExecuted = db.prepare(
    `UPDATE confirmations SET executed = 1, tx_hash = @txHash, execute_after = @executeAfter, executed_at = @executedAt
     WHERE recovery_request_id = @recoveryRequestId`,
  );
  const selectOne = db.prepare(`SELECT * FROM confirmations WHERE recovery_request_id = ?`);
  const selectLastExecuted = db.prepare(
    `SELECT * FROM confirmations WHERE wallet = ? COLLATE NOCASE AND executed = 1
     ORDER BY COALESCE(executed_at, at) DESC LIMIT 1`,
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
    mode: r.mode === 'signature' ? 'signature' : 'onchain',
    executed: r.executed === 1,
    txHash: r.tx_hash,
    signature: r.signature,
    nonce: r.nonce,
    executeAfter: r.execute_after,
    finalizedTxHash: r.finalized_tx_hash,
    at: r.at,
    executedAt: r.executed_at,
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
      const at = now();
      insertConfirmation.run({
        recoveryRequestId: row.recoveryRequestId,
        wallet: row.wallet,
        newOwner: row.newOwner,
        mode: row.mode,
        executed: row.executed ? 1 : 0,
        txHash: row.txHash,
        signature: row.signature ?? null,
        nonce: row.nonce ?? null,
        executeAfter: row.executeAfter ?? null,
        at,
        executedAt: row.executed ? at : null,
      });
    },
    markExecuted(recoveryRequestId, p) {
      updateExecuted.run({
        recoveryRequestId,
        txHash: p.txHash,
        executeAfter: p.executeAfter,
        executedAt: now(),
      });
    },
    getConfirmation(recoveryRequestId) {
      const r = selectOne.get(recoveryRequestId) as RawConfirmation | undefined;
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
