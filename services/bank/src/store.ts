// Wave 1 persistence helpers shared by the wallet, policy, userop, attestation and top-up routes.
import {
  type Guardian,
  type GuardianKind,
  GuardianSchema,
  type PolicyDecision,
  PolicyDecisionSchema,
  type RecoveryMode,
} from '@keyline/shared';
import { getAddress } from 'viem';
import { type Db, newId, nowIso } from './db';

/** Guardian order is part of the protect callData, so it is fixed per mode (SPEC §1 guardian sets). */
export const GUARDIAN_ORDER = {
  default: ['safety-key', 'emergency-card', 'swissquote'],
  assisted: ['safety-key', 'swissquote', 'partner'],
} as const satisfies Record<RecoveryMode, readonly GuardianKind[]>;
export const GUARDIAN_THRESHOLD = 2 as const;

type GuardianRow = { wallet_address: string; kind: string; address: string; added_tx_hash: string | null };
type DecisionRow = {
  id: string;
  wallet_address: string;
  decision_json: string;
  verdict: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};
export type UserOpRow = {
  user_op_hash: string;
  wallet_address: string;
  decision_id: string | null;
  status: string;
  tx_hash: string | null;
  block_number: number | null;
  user_op_json: string;
  created_at: string;
  updated_at: string;
};
type PasskeyKeyRow = { credential_id: string; pub_key_x: string; pub_key_y: string; device_label: string };

/** UTC midnight — the daily limit and the sponsorship cap reset there. */
export const dayStartIso = (now = new Date()): string =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

const rowToGuardian = (r: GuardianRow): Guardian =>
  GuardianSchema.parse({
    walletAddress: r.wallet_address,
    kind: r.kind,
    address: r.address,
    addedTxHash: r.added_tx_hash ?? undefined,
  });

export const createStore = (db: Db) => {
  const guardiansStmt = db.prepare('SELECT * FROM guardians WHERE lower(wallet_address) = lower(?)');
  const insertGuardian = db.prepare(
    'INSERT INTO guardians (wallet_address, kind, address, added_tx_hash, created_at) VALUES (?, ?, ?, NULL, ?)',
  );
  const setGuardianTx = db.prepare(
    'UPDATE guardians SET added_tx_hash = ? WHERE lower(wallet_address) = lower(?)',
  );
  const passkeyForWallet = db.prepare(
    'SELECT credential_id, pub_key_x, pub_key_y, device_label FROM passkeys WHERE lower(wallet_address) = lower(?) AND revoked_at IS NULL ORDER BY created_at LIMIT 1',
  );
  const decisionById = db.prepare('SELECT * FROM policy_decisions WHERE id = ?');
  const insertDecision = db.prepare(
    `INSERT INTO policy_decisions (id, wallet_address, request_json, decision_json, verdict, chf_value, calls_hash, expires_at, consumed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  );
  const consumeDecision = db.prepare(
    'UPDATE policy_decisions SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL',
  );
  const dailySpent = db.prepare(
    `SELECT COALESCE(SUM(chf_value), 0) AS total FROM policy_decisions
     WHERE lower(wallet_address) = lower(?) AND verdict = 'approve' AND consumed_at IS NOT NULL AND created_at >= ?`,
  );
  const sponsoredToday = db.prepare(
    `SELECT COUNT(DISTINCT decision_id) AS n FROM sponsorships WHERE lower(wallet_address) = lower(?) AND created_at >= ?`,
  );
  const sponsoredTodayClient = db.prepare(
    `SELECT COUNT(DISTINCT s.decision_id) AS n FROM sponsorships s JOIN wallets w ON lower(w.address) = lower(s.wallet_address)
     WHERE w.client_id = ? AND s.created_at >= ?`,
  );
  const insertSponsorship = db.prepare(
    'INSERT INTO sponsorships (id, decision_id, wallet_address, user_op_hash, created_at) VALUES (?, ?, ?, NULL, ?)',
  );
  const insertUserOp = db.prepare(
    `INSERT INTO userops (user_op_hash, wallet_address, decision_id, status, tx_hash, block_number, user_op_json, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', NULL, NULL, ?, ?, ?)`,
  );
  const userOpByHash = db.prepare('SELECT * FROM userops WHERE lower(user_op_hash) = lower(?)');
  const updateUserOp = db.prepare(
    'UPDATE userops SET status = ?, tx_hash = ?, block_number = ?, updated_at = ? WHERE lower(user_op_hash) = lower(?)',
  );
  const setWalletDeployed = db.prepare(
    "UPDATE wallets SET status = 'deployed', deploy_tx_hash = ? WHERE lower(address) = lower(?)",
  );
  const setWalletMode = db.prepare('UPDATE wallets SET recovery_mode = ? WHERE lower(address) = lower(?)');
  const balanceStmt = db.prepare('SELECT account_balance_chf AS b FROM clients WHERE id = ?');
  const debitStmt = db.prepare(
    'UPDATE clients SET account_balance_chf = account_balance_chf - ? WHERE id = ? AND account_balance_chf >= ?',
  );

  return {
    guardians(wallet: string): Guardian[] {
      return (guardiansStmt.all(wallet) as GuardianRow[]).map(rowToGuardian);
    },
    /** Guardians in protect order; null when a required kind is missing. */
    orderedGuardians(wallet: string, mode: RecoveryMode): Guardian[] | null {
      const have = this.guardians(wallet);
      const ordered: Guardian[] = [];
      for (const kind of GUARDIAN_ORDER[mode]) {
        const g = have.find((x) => x.kind === kind);
        if (!g) return null;
        ordered.push(g);
      }
      return ordered;
    },
    addGuardian(wallet: string, kind: GuardianKind, address: string): Guardian {
      insertGuardian.run(getAddress(wallet), kind, getAddress(address), nowIso());
      return rowToGuardian({
        wallet_address: getAddress(wallet),
        kind,
        address: getAddress(address),
        added_tx_hash: null,
      });
    },
    markGuardiansAdded(wallet: string, txHash: string): void {
      setGuardianTx.run(txHash, wallet);
    },
    passkeyKeyForWallet(wallet: string): PasskeyKeyRow | undefined {
      return passkeyForWallet.get(wallet) as PasskeyKeyRow | undefined;
    },

    decision(id: string): (PolicyDecision & { consumedAt?: string }) | null {
      const row = decisionById.get(id) as DecisionRow | undefined;
      if (!row) return null;
      const decision = PolicyDecisionSchema.parse(JSON.parse(row.decision_json));
      return { ...decision, expiresAt: row.expires_at, consumedAt: row.consumed_at ?? undefined };
    },
    saveDecision(decision: PolicyDecision, request: unknown): void {
      insertDecision.run(
        decision.decisionId,
        getAddress(decision.walletAddress),
        JSON.stringify(request),
        JSON.stringify(decision),
        decision.verdict,
        decision.chfValue,
        decision.callsHash,
        decision.expiresAt,
        decision.decidedAt,
      );
    },
    consumeDecision(id: string): void {
      consumeDecision.run(nowIso(), id);
    },
    dailySpentChf(wallet: string): number {
      return (dailySpent.get(wallet, dayStartIso()) as { total: number }).total;
    },
    sponsoredToday(wallet: string): number {
      return (sponsoredToday.get(wallet, dayStartIso()) as { n: number }).n;
    },
    sponsoredTodayForClient(clientId: string): number {
      return (sponsoredTodayClient.get(clientId, dayStartIso()) as { n: number }).n;
    },
    recordSponsorship(decisionId: string, wallet: string): void {
      insertSponsorship.run(newId('spn'), decisionId, getAddress(wallet), nowIso());
    },

    insertUserOp(hash: string, wallet: string, decisionId: string | null, userOpJson: unknown): void {
      const at = nowIso();
      insertUserOp.run(hash, getAddress(wallet), decisionId, JSON.stringify(userOpJson), at, at);
    },
    userOp(hash: string): UserOpRow | undefined {
      return userOpByHash.get(hash) as UserOpRow | undefined;
    },
    updateUserOp(hash: string, status: string, txHash: string | null, blockNumber: number | null): void {
      updateUserOp.run(status, txHash, blockNumber, nowIso(), hash);
    },
    markWalletDeployed(wallet: string, txHash: string): void {
      setWalletDeployed.run(txHash, wallet);
    },
    setWalletMode(wallet: string, mode: RecoveryMode): void {
      setWalletMode.run(mode, wallet);
    },

    accountBalanceChf(clientId: string): number {
      return (balanceStmt.get(clientId) as { b: number } | undefined)?.b ?? 0;
    },
    /** Returns false when the SIMULATED account cannot cover the debit. */
    debitAccount(clientId: string, chf: number): boolean {
      return debitStmt.run(chf, clientId, chf).changes === 1;
    },
  };
};
export type Store = ReturnType<typeof createStore>;
