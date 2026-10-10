import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyInstance } from 'fastify';
import { getAddress } from 'viem';
import { registerGuards, SESSION_COOKIE } from './auth';
import type { BankConfig } from './config';
import { type Db, openDb } from './db';
import { type ChainDeps, createChainDeps } from './deps';
import { errorHandler } from './errors';
import { createEventStore } from './events';
import { createGuardianRegistrar } from './guardians';
import { registerIdempotency } from './idempotency';
import { createRecoveryService, type RecoveryService } from './recovery-service';
import { createRecoveryStore } from './recovery-store';
import { createRepo } from './repo';
import { registerAttestationRoutes } from './routes/attestations';
import { registerCoreRoutes } from './routes/core';
import { registerDeskRoutes } from './routes/desk';
import { registerPolicyRoutes } from './routes/policy';
import { registerRecoveryRoutes } from './routes/recoveries';
import { registerSqRoutes } from './routes/sq';
import { registerStubs } from './routes/stubs';
import { registerTopupRoutes } from './routes/topups';
import { registerUserOpRoutes } from './routes/userops';
import { registerWalletRoutes } from './routes/wallets';
import { createScreening, type ScreeningService } from './screening';
import { LEA, sanctionedSeedAddress, seed } from './seed';
import { createSqLedger } from './sq/ledger';
import { createStore } from './store';
import { createWebAuthnService } from './webauthn';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    /** Recovery orchestration (exposed for tests and the finalizer). */
    recoveryService: RecoveryService;
  }
}

/** Finalizer cadence: executed-waiting requests are checked against the module every 5 s. */
export const FINALIZER_INTERVAL_MS = 5_000;

export const buildApp = async (
  config: BankConfig,
  opts: {
    dbPath?: string;
    logger?: boolean;
    chain?: Partial<ChainDeps>;
    finalizer?: boolean;
    /** Tests: skip the live OFAC fetch and use the vendored snapshot. */
    screeningOffline?: boolean;
    screening?: ScreeningService;
  } = {},
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
  const recoveries = createRecoveryStore(db);
  const service = createRecoveryService({ config, events, repo, recoveries, chain, log: app.log });

  await app.register(cors, {
    origin: [config.WALLET_ORIGIN, 'http://localhost:3000'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Idempotency-Key',
      'X-Operator-Token',
      'X-Device-Label',
      'X-Onboarding-Token',
    ],
    exposedHeaders: ['Idempotent-Replayed'],
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.BANK_JWT_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  });

  // Seed first: the screening module binds the seeded 'Sanctioned test address' contact at startup.
  const { seededNow } = seed(db, events);
  if (seededNow) app.log.info({ clientId: 'SQ-48213-LK' }, 'demo seed applied');
  // SPEC §10 F0.2: the SIMULATED Swissquote portfolio (idempotent, never resets an existing ledger).
  const ledger = createSqLedger(db);
  ledger.seed(LEA.id);
  const sanctioned = sanctionedSeedAddress(db);
  const screening =
    opts.screening ??
    (await createScreening({
      sanctionedTestAddress: sanctioned ? getAddress(sanctioned) : undefined,
      offline: opts.screeningOffline,
    }));
  app.log.info(screening.status().ofac, 'sanctions screening ready (OFAC SDN ETH list)');

  app.setErrorHandler(errorHandler);
  registerGuards(app, config);
  registerIdempotency(app, db);
  registerCoreRoutes(app, { config, db, events, repo, webauthn, store });
  registerWalletRoutes(app, { config, db, events, repo, store, chain });
  registerPolicyRoutes(app, { config, db, events, repo, store, chain, screening });
  registerUserOpRoutes(app, { config, events, repo, store, chain, ledger, db });
  registerAttestationRoutes(app, { config, db, events, repo, chain });
  registerTopupRoutes(app, { config, db, events, repo, store, chain });
  registerRecoveryRoutes(app, { config, events, repo, store, recoveries, chain, service });
  registerDeskRoutes(app, { events, repo, recoveries, chain, service });
  registerSqRoutes(app, {
    config,
    db,
    events,
    repo,
    store,
    chain,
    ledger,
    addGuardian: createGuardianRegistrar({ config, events, repo, store, chain }),
  });
  registerStubs(app);

  app.decorate('db', db);
  app.decorate('recoveryService', service);

  // Finalizer loop (SPEC F3 step 5): idempotent, one pass in flight at a time, stopped with the server.
  let timer: NodeJS.Timeout | undefined;
  if (opts.finalizer !== false) {
    let running = false;
    const pass = async () => {
      if (running) return;
      running = true;
      try {
        await service.tick();
      } catch (err) {
        app.log.warn({ err }, 'finalizer pass failed');
      } finally {
        running = false;
      }
    };
    timer = setInterval(() => void pass(), FINALIZER_INTERVAL_MS);
    timer.unref();
  }

  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
    db.close();
  });

  return app;
};
