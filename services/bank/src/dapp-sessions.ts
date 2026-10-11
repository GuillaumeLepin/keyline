// SPEC §11.3 — persistence of WalletConnect dApp sessions and their request log. The identity verdict is
// recomputed on every read from the stored Verify context + url and the CURRENT allowlist (policy/dapp-identity.ts).
import {
  type DappRequestEventBody,
  type DappRequestLogEntry,
  DappRequestLogEntrySchema,
  type DappSession,
  DappSessionSchema,
  type DappSessionStatus,
  type DappVerify,
  type ProposeSessionBody,
} from '@keyline/shared';
import { getAddress } from 'viem';
import { type Db, newId, nowIso } from './db';
import { type DappIdentity, dappIdentity } from './policy/dapp-identity';
import type { Repo } from './repo';

type SessionRow = {
  topic: string;
  wallet_address: string;
  client_id: string;
  name: string;
  url: string;
  icons: string;
  description: string | null;
  verify: string;
  status: string;
  requests: number;
  last_request_at: string | null;
  created_at: string;
  updated_at: string;
};
type RequestRow = {
  id: string;
  topic: string;
  method: string;
  summary: string;
  outcome: string;
  tx_hash: string | null;
  user_op_hash: string | null;
  request_id: string | null;
  created_at: string;
};

export type StoredDappSession = DappSession & { clientId: string; identity: DappIdentity };

export const createDappSessionStore = (db: Db, repo: Repo) => {
  const byTopic = db.prepare('SELECT * FROM dapp_sessions WHERE topic = ?');
  const insert = db.prepare(
    `INSERT INTO dapp_sessions (topic, wallet_address, client_id, name, url, icons, description, verify, status, requests, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', 0, ?, ?)`,
  );
  const setStatus = db.prepare('UPDATE dapp_sessions SET status = ?, updated_at = ? WHERE topic = ?');
  const bump = db.prepare(
    'UPDATE dapp_sessions SET requests = requests + 1, last_request_at = ?, updated_at = ? WHERE topic = ?',
  );
  const insertRequest = db.prepare(
    `INSERT INTO dapp_requests (id, topic, method, summary, outcome, tx_hash, user_op_hash, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const findRequest = db.prepare(
    'SELECT id FROM dapp_requests WHERE topic = ? AND request_id = ? AND outcome = ? LIMIT 1',
  );
  const requestsFor = db.prepare(
    'SELECT * FROM dapp_requests WHERE topic = ? ORDER BY created_at DESC, rowid DESC LIMIT 100',
  );
  const forClient = db.prepare('SELECT * FROM dapp_sessions WHERE client_id = ? ORDER BY created_at DESC');
  const forWallet = db.prepare(
    'SELECT * FROM dapp_sessions WHERE client_id = ? AND lower(wallet_address) = lower(?) ORDER BY created_at DESC',
  );

  const view = (r: SessionRow): StoredDappSession => {
    const verify = JSON.parse(r.verify) as DappVerify;
    const identity = dappIdentity({ name: r.name, url: r.url, verify }, repo.dapps());
    const session = DappSessionSchema.parse({
      topic: r.topic,
      walletAddress: r.wallet_address,
      name: r.name,
      url: r.url,
      icons: JSON.parse(r.icons) as string[],
      description: r.description ?? undefined,
      verify,
      status: r.status,
      verdict: identity.verdict,
      reasons: identity.reasons,
      dappId: identity.dappId,
      allowlisted: identity.allowlisted,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastRequestAt: r.last_request_at ?? undefined,
      requests: r.requests,
    });
    return { ...session, clientId: r.client_id, identity };
  };

  const requestView = (r: RequestRow): DappRequestLogEntry =>
    DappRequestLogEntrySchema.parse({
      id: r.id,
      topic: r.topic,
      method: r.method,
      summary: r.summary,
      outcome: r.outcome,
      txHash: r.tx_hash ?? undefined,
      userOpHash: r.user_op_hash ?? undefined,
      requestId: r.request_id ?? undefined,
      at: r.created_at,
    });

  return {
    get(topic: string): StoredDappSession | null {
      const row = byTopic.get(topic) as SessionRow | undefined;
      return row ? view(row) : null;
    },
    /** Inserts a proposal; returns null (nothing written) when the topic already exists. */
    propose(clientId: string, body: ProposeSessionBody): StoredDappSession | null {
      if (byTopic.get(body.topic)) return null;
      const at = nowIso();
      insert.run(
        body.topic,
        getAddress(body.walletAddress),
        clientId,
        body.name,
        body.url,
        JSON.stringify(body.icons),
        body.description ?? null,
        JSON.stringify(body.verify),
        at,
        at,
      );
      return this.get(body.topic);
    },
    setStatus(topic: string, status: DappSessionStatus): StoredDappSession | null {
      setStatus.run(status, nowIso(), topic);
      return this.get(topic);
    },
    /** Appends to the log; a repeated (requestId, outcome) is not counted twice. Returns false on a duplicate. */
    logRequest(topic: string, body: DappRequestEventBody): boolean {
      const requestId = body.requestId === undefined ? null : String(body.requestId);
      if (requestId && findRequest.get(topic, requestId, body.outcome)) return false;
      const at = nowIso();
      db.transaction(() => {
        insertRequest.run(
          newId('dreq'),
          topic,
          body.method,
          body.summary,
          body.outcome,
          body.txHash ?? null,
          body.userOpHash ?? null,
          requestId,
          at,
        );
        bump.run(at, at, topic);
      })();
      return true;
    },
    requests(topic: string): DappRequestLogEntry[] {
      return (requestsFor.all(topic) as RequestRow[]).map(requestView);
    },
    list(clientId: string, wallet?: string): StoredDappSession[] {
      const rows = (wallet ? forWallet.all(clientId, wallet) : forClient.all(clientId)) as SessionRow[];
      return rows.map(view);
    },
  };
};
export type DappSessionStore = ReturnType<typeof createDappSessionStore>;

/** The public shape (drops the bank-only fields). */
export const publicSession = ({ clientId: _c, identity: _i, ...session }: StoredDappSession): DappSession =>
  DappSessionSchema.parse(session);
