import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerGuards, SESSION_COOKIE } from './auth';
import type { BankConfig } from './config';
import { type Db, openDb } from './db';
import { type ChainDeps, createChainDeps } from './deps';
import { errorHandler } from './errors';
import { createEventStore } from './events';
import { registerIdempotency } from './idempotency';
import { createRepo } from './repo';
import { registerAttestationRoutes } from './routes/attestations';
import { registerCoreRoutes } from './routes/core';
import { registerPolicyRoutes } from './routes/policy';
import { registerStubs } from './routes/stubs';
import { registerTopupRoutes } from './routes/topups';
import { registerUserOpRoutes } from './routes/userops';
import { registerWalletRoutes } from './routes/wallets';
import { seed } from './seed';
import { createStore } from './store';
import { createWebAuthnService } from './webauthn';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export const buildApp = async (
  config: BankConfig,
  opts: { dbPath?: string; logger?: boolean; chain?: Partial<ChainDeps> } = {},
): Promise<FastifyInstance> => {
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: ['req.headers.cookie', 'req.headers["x-operator-token"]', 'req.headers.authorization'],
            transport: config.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
          },
  });

  const db = openDb(opts.dbPath ?? config.BANK_DB_PATH);
  const events = createEventStore(db);
  const repo = createRepo(db);
  const store = createStore(db);
  const webauthn = createWebAuthnService(db, config, events);
  // Tests inject stubs for the network edges; production always talks to the real bundler/paymaster/RPC.
  const chain: ChainDeps = { ...createChainDeps(config), ...opts.chain };

  await app.register(cors, {
    origin: [config.WALLET_ORIGIN, 'http://localhost:3000'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Operator-Token', 'X-Device-Label'],
    exposedHeaders: ['Idempotent-Replayed'],
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.BANK_JWT_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  });

  app.setErrorHandler(errorHandler);
  registerGuards(app, config);
  registerIdempotency(app, db);
  registerCoreRoutes(app, { config, db, events, repo, webauthn, store });
  registerWalletRoutes(app, { config, db, events, repo, store, chain });
  registerPolicyRoutes(app, { config, db, events, repo, store });
  registerUserOpRoutes(app, { config, events, repo, store, chain });
  registerAttestationRoutes(app, { config, db, events, repo, chain });
  registerTopupRoutes(app, { config, db, events, repo, store, chain });
  registerStubs(app);

  const { seededNow } = seed(db, events);
  if (seededNow) app.log.info({ clientId: 'SQ-48213-LK' }, 'demo seed applied');

  app.decorate('db', db);
  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
};
