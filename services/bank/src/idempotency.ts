// Same Idempotency-Key (header) or body.requestId on the same route → the stored response is replayed verbatim.
// Opt in per route with `config: { idempotent: true }`.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { type Db, nowIso } from './db';

type IdemRow = { status: number; response: string };

declare module 'fastify' {
  interface FastifyContextConfig {
    idempotent?: boolean;
    operator?: boolean;
    session?: boolean;
  }
  interface FastifyRequest {
    idempotencyKey?: string;
  }
}

export const idempotencyKeyOf = (req: FastifyRequest): string | undefined => {
  const header = req.headers['idempotency-key'];
  if (typeof header === 'string' && header.length > 0) return header;
  const body = req.body as { requestId?: unknown } | undefined;
  if (body && typeof body.requestId === 'string' && body.requestId.length > 0) return body.requestId;
  return undefined;
};

export const registerIdempotency = (app: FastifyInstance, db: Db): void => {
  const find = db.prepare(`SELECT status, response FROM idempotency WHERE key = ? AND route = ?`);
  const store = db.prepare(
    `INSERT OR IGNORE INTO idempotency (key, route, status, response, created_at) VALUES (?, ?, ?, ?, ?)`,
  );

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.routeOptions.config.idempotent) return;
    const key = idempotencyKeyOf(req);
    if (!key) return;
    req.idempotencyKey = key;
    const route = `${req.method} ${req.routeOptions.url}`;
    const hit = find.get(key, route) as IdemRow | undefined;
    if (hit) {
      reply.header('idempotent-replayed', 'true');
      return reply.status(hit.status).type('application/json').send(hit.response);
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (!req.idempotencyKey || reply.getHeader('idempotent-replayed')) return payload;
    // Only successful side effects are memoised; a failed attempt may legitimately be retried.
    if (reply.statusCode >= 400 || typeof payload !== 'string') return payload;
    const route = `${req.method} ${req.routeOptions.url}`;
    store.run(req.idempotencyKey, route, reply.statusCode, payload, nowIso());
    return payload;
  });
};
