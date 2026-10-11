// SPEC §11.3 — WalletConnect session registry: proposal (identity verdict), approve / refuse, disconnect, list,
// request log. Every step is a bank event on the wallet (the desk's event feed shows them).
import {
  DappRequestEventBodySchema,
  DappSessionDetailSchema,
  DappSessionsResponseSchema,
  ProposeSessionBodySchema,
  ProposeSessionResponseSchema,
} from '@keyline/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { clientOf } from '../auth';
import { type DappSessionStore, publicSession, type StoredDappSession } from '../dapp-sessions';
import { conflict, forbidden, notFound, policyRefused, validationError } from '../errors';
import type { EventStore } from '../events';
import { REASON_DAPP_IDENTITY } from '../policy/dapp-identity';
import type { Repo } from '../repo';

type Deps = { events: EventStore; repo: Repo; sessions: DappSessionStore };
const TopicParam = z.object({ topic: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) });
const WalletQuery = z.object({
  wallet: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
});

export const registerDappSessionRoutes = (app: FastifyInstance, { events, repo, sessions }: Deps): void => {
  const owned = (req: FastifyRequest, topic: string): StoredDappSession => {
    const session = sessions.get(topic);
    if (!session) throw notFound('dApp session');
    if (session.clientId !== clientOf(req).clientId)
      throw forbidden('This app session belongs to another client');
    return session;
  };
  const log = (type: string, s: StoredDappSession, extra: Record<string, unknown> = {}) =>
    events.recordEvent(type, s.walletAddress, {
      topic: s.topic,
      name: s.name,
      url: s.url,
      origin: s.verify.origin,
      validation: s.verify.validation,
      isScam: s.verify.isScam,
      verdict: s.verdict,
      allowlisted: s.allowlisted,
      ...extra,
    });

  app.post('/dapp-sessions', { config: { client: true } }, async (req, reply) => {
    const body = ProposeSessionBodySchema.parse(req.body);
    const client = clientOf(req);
    const wallet = repo.walletByAddress(body.walletAddress);
    if (!wallet) throw notFound('Wallet');
    if (wallet.clientId !== client.clientId) throw forbidden('This wallet belongs to another client');
    const created = sessions.propose(client.clientId, body);
    const session = created ?? owned(req, body.topic); // same topic again → idempotent read
    if (created) log('dapp.proposed', session, { reasons: session.reasons, deviceLabel: client.deviceLabel });
    return reply.status(created ? 201 : 200).send(
      ProposeSessionResponseSchema.parse({
        session: publicSession(session),
        verdict: session.verdict,
        reasons: session.reasons,
      }),
    );
  });

  app.post('/dapp-sessions/:topic/approve', { config: { client: true } }, async (req) => {
    const { topic } = TopicParam.parse(req.params);
    const session = owned(req, topic);
    if (session.verdict === 'block') {
      log('dapp.approve-refused', session, { reasons: session.reasons });
      throw policyRefused(REASON_DAPP_IDENTITY, { reasons: session.reasons });
    }
    if (session.status === 'active') return publicSession(session);
    if (session.status !== 'proposed')
      throw conflict(`This connection was ${session.status} — connect again from the app`);
    const updated = sessions.setStatus(topic, 'active') as StoredDappSession;
    log('dapp.approved', updated);
    return publicSession(updated);
  });

  app.post('/dapp-sessions/:topic/refuse', { config: { client: true } }, async (req) => {
    const { topic } = TopicParam.parse(req.params);
    const session = owned(req, topic);
    if (session.status === 'refused') return publicSession(session);
    if (session.status !== 'proposed') throw conflict(`This connection is already ${session.status}`);
    const updated = sessions.setStatus(topic, 'refused') as StoredDappSession;
    log('dapp.refused', updated);
    return publicSession(updated);
  });

  app.delete('/dapp-sessions/:topic', { config: { client: true } }, async (req) => {
    const { topic } = TopicParam.parse(req.params);
    const session = owned(req, topic);
    if (session.status === 'disconnected') return publicSession(session);
    const updated = sessions.setStatus(topic, 'disconnected') as StoredDappSession;
    log('dapp.disconnected', updated, { previousStatus: session.status });
    return publicSession(updated);
  });

  app.get('/dapp-sessions', { config: { client: true } }, async (req) => {
    const { wallet } = WalletQuery.parse(req.query ?? {});
    const client = clientOf(req);
    if (wallet) {
      const w = repo.walletByAddress(wallet);
      if (!w) throw notFound('Wallet');
      if (w.clientId !== client.clientId) throw forbidden('This wallet belongs to another client');
    }
    return DappSessionsResponseSchema.parse({
      sessions: sessions.list(client.clientId, wallet).map(publicSession),
    });
  });

  app.get('/dapp-sessions/:topic', { config: { client: true } }, async (req) => {
    const { topic } = TopicParam.parse(req.params);
    const session = owned(req, topic);
    return DappSessionDetailSchema.parse({
      session: publicSession(session),
      requests: sessions.requests(topic),
    });
  });

  app.post('/dapp-sessions/:topic/events', { config: { client: true } }, async (req) => {
    const { topic } = TopicParam.parse(req.params);
    const body = DappRequestEventBodySchema.parse(req.body);
    if (body.topic !== topic) throw validationError('body.topic does not match the URL');
    const session = owned(req, topic);
    const counted = sessions.logRequest(topic, body);
    if (counted)
      log('dapp.request', session, {
        method: body.method,
        summary: body.summary,
        outcome: body.outcome,
        txHash: body.txHash,
        userOpHash: body.userOpHash,
        requestId: body.requestId,
      });
    return publicSession(sessions.get(topic) as StoredDappSession);
  });
};
