// Operator token guard (/desk/*, /recoveries/:id/operator) and passkey session (JWT in httpOnly cookie).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BankConfig } from './config';
import { forbidden, unauthorized } from './errors';
import { LEA } from './seed';

export const SESSION_COOKIE = 'keyline_session';
export const DEVICE_LABEL_HEADER = 'x-device-label';
/** SPEC §10: the simulated Swissquote web session (laptop), separate from the wallet's passkey session. */
export const SQ_WEB_COOKIE = 'sq_web';
export const SQ_WEB_TTL_SECONDS = 2 * 60 * 60;
/** SPEC §10: bearer the phone got from POST /handoff/:code/claim; binds the new passkey + wallet to that client. */
export const ONBOARDING_TOKEN_HEADER = 'x-onboarding-token';
export const ONBOARDING_TTL_SECONDS = 30 * 60;

export type SessionClaims = { sub: string; cid: string; exp: number; typ?: string };
export type SqWebClaims = { typ: 'sq-web'; cid: string; sid: string; exp: number };
export type OnboardingClaims = { typ: 'onboarding'; cid: string; hc: string; exp: number };

/** Who is calling a client route. `credentialId` is undefined for the DEMO_FAST_MODE device-label fallback. */
export type ClientIdentity = {
  clientId: string;
  credentialId?: string;
  deviceLabel?: string;
  auth: 'session' | 'device-label' | 'onboarding-token';
  /** Handoff code the onboarding token was issued for (auth: 'onboarding-token'). */
  handoffCode?: string;
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

/** The passkey session cookie only — an sq_web / onboarding token pasted into it is rejected by `typ`. */
const verifyWalletSession = async (req: FastifyRequest): Promise<SessionClaims> => {
  const claims = await req.jwtVerify<SessionClaims>();
  if (claims.typ !== undefined) throw new Error('not a wallet session');
  return claims;
};

export const requireSession = async (req: FastifyRequest): Promise<SessionClaims> => {
  try {
    return await verifyWalletSession(req);
  } catch {
    throw unauthorized('Session missing or expired — log in with your passkey');
  }
};

/** The Swissquote web session (cookie `sq_web`), or null when absent / expired / not an sq-web token. */
export const sqWebSessionOf = (req: FastifyRequest): SqWebClaims | null => {
  const token = req.cookies?.[SQ_WEB_COOKIE];
  if (!token) return null;
  try {
    const claims = req.server.jwt.verify<SqWebClaims>(token);
    return claims.typ === 'sq-web' && typeof claims.cid === 'string' ? claims : null;
  } catch {
    return null;
  }
};

export const requireSqWeb = (req: FastifyRequest): SqWebClaims => {
  const claims = sqWebSessionOf(req);
  if (!claims) throw unauthorized('Swissquote session missing or expired — log in to Swissquote');
  return claims;
};

/** `undefined` when no header was sent; throws 401 when one was sent but is invalid or expired. */
export const onboardingClaimsOf = (req: FastifyRequest): OnboardingClaims | undefined => {
  const token = req.headers[ONBOARDING_TOKEN_HEADER];
  if (typeof token !== 'string' || token.length === 0) return undefined;
  try {
    const claims = req.server.jwt.verify<OnboardingClaims>(token);
    if (claims.typ === 'onboarding' && typeof claims.cid === 'string') return claims;
  } catch {
    /* fall through */
  }
  throw unauthorized('This onboarding link expired — enter a new code from Swissquote');
};

/**
 * Client routes accept the passkey session cookie. With DEMO_FAST_MODE=true they ALSO accept an
 * `X-Device-Label` header (curl / E2E drive the registry without a browser ceremony). docs/MOCKS.md lists this.
 * Between the two: the handoff `X-Onboarding-Token` (SPEC §10) — the phone has no passkey session yet.
 */
export const requireClient =
  (config: BankConfig) =>
  async (req: FastifyRequest): Promise<ClientIdentity> => {
    try {
      const claims = await verifyWalletSession(req);
      return { clientId: claims.cid, credentialId: claims.sub, auth: 'session' };
    } catch {
      const onboarding = onboardingClaimsOf(req);
      if (onboarding)
        return {
          clientId: onboarding.cid,
          auth: 'onboarding-token',
          handoffCode: onboarding.hc,
          deviceLabel: deviceLabelOf(req),
        };
      const label = req.headers[DEVICE_LABEL_HEADER];
      if (config.DEMO_FAST_MODE && typeof label === 'string' && label.trim().length > 0) {
        return { clientId: LEA.id, deviceLabel: label.trim(), auth: 'device-label' };
      }
      throw unauthorized('Session missing or expired — log in with your passkey');
    }
  };

const deviceLabelOf = (req: FastifyRequest): string | undefined => {
  const label = req.headers[DEVICE_LABEL_HEADER];
  return typeof label === 'string' && label.trim().length > 0 ? label.trim() : undefined;
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
