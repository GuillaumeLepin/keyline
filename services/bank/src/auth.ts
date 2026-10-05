// Operator token guard (/desk/*, /recoveries/:id/operator) and passkey session (JWT in httpOnly cookie).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BankConfig } from './config';
import { forbidden, unauthorized } from './errors';

export const SESSION_COOKIE = 'keyline_session';

export type SessionClaims = { sub: string; cid: string; exp: number };

export const requireOperator = (config: BankConfig) => async (req: FastifyRequest) => {
  const token = req.headers['x-operator-token'];
  if (typeof token !== 'string' || token.length === 0) throw unauthorized('X-Operator-Token header required');
  if (token !== config.DESK_OPERATOR_TOKEN) throw forbidden('Invalid operator token');
};

export const requireSession = async (req: FastifyRequest): Promise<SessionClaims> => {
  try {
    return await req.jwtVerify<SessionClaims>();
  } catch {
    throw unauthorized('Session missing or expired — log in with your passkey');
  }
};

/** Route-level guards wired from `config: { operator: true }` / `config: { session: true }`. */
export const registerGuards = (app: FastifyInstance, config: BankConfig): void => {
  const operatorGuard = requireOperator(config);
  app.addHook('preHandler', async (req) => {
    if (req.routeOptions.config.operator) await operatorGuard(req);
    if (req.routeOptions.config.session) await requireSession(req);
  });
};
