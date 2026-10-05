// Operator token guard (/desk/*, /recoveries/:id/operator) and passkey session (JWT in httpOnly cookie).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BankConfig } from './config';
import { forbidden, unauthorized } from './errors';
import { LEA } from './seed';

export const SESSION_COOKIE = 'keyline_session';
export const DEVICE_LABEL_HEADER = 'x-device-label';

export type SessionClaims = { sub: string; cid: string; exp: number };

/** Who is calling a client route. `credentialId` is undefined for the DEMO_FAST_MODE device-label fallback. */
export type ClientIdentity = {
  clientId: string;
  credentialId?: string;
  deviceLabel?: string;
  auth: 'session' | 'device-label';
};

declare module 'fastify' {
  interface FastifyRequest {
    client?: ClientIdentity;
  }
}

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

/**
 * Client routes accept the passkey session cookie. With DEMO_FAST_MODE=true they ALSO accept an
 * `X-Device-Label` header (curl / E2E drive the registry without a browser ceremony). docs/MOCKS.md lists this.
 */
export const requireClient =
  (config: BankConfig) =>
  async (req: FastifyRequest): Promise<ClientIdentity> => {
    try {
      const claims = await req.jwtVerify<SessionClaims>();
      return { clientId: claims.cid, credentialId: claims.sub, auth: 'session' };
    } catch {
      const label = req.headers[DEVICE_LABEL_HEADER];
      if (config.DEMO_FAST_MODE && typeof label === 'string' && label.trim().length > 0) {
        return { clientId: LEA.id, deviceLabel: label.trim(), auth: 'device-label' };
      }
      throw unauthorized('Session missing or expired — log in with your passkey');
    }
  };

/** Route-level guards wired from `config: { operator | session | client: true }`. */
export const registerGuards = (app: FastifyInstance, config: BankConfig): void => {
  const operatorGuard = requireOperator(config);
  const clientGuard = requireClient(config);
  app.addHook('preHandler', async (req) => {
    if (req.routeOptions.config.operator) await operatorGuard(req);
    if (req.routeOptions.config.session) await requireSession(req);
    if (req.routeOptions.config.client) req.client = await clientGuard(req);
  });
};

export const clientOf = (req: FastifyRequest): ClientIdentity => {
  if (!req.client) throw unauthorized('Client route without guard');
  return req.client;
};
