// The whole HTTP surface of a guardian process. Five routes. The only two that can produce a
// transaction go through RecoveryChainPort.confirmAsGuardian / .finalize — there is no other path.
import { basename } from 'node:path';
import {
  type GuardianIdentity,
  GuardianIdentitySchema,
  GuardianRecoveryRequestSchema,
  type GuardianRecoveryResponse,
} from '@keyline/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Address } from 'viem';
import type { RecoveryChainPort } from './chain-port';
import type { GuardianConfig } from './config';
import type { GuardianDb } from './db';
import { evaluateRecoveryRequest } from './rules';

export interface GuardianServerDeps {
  config: GuardianConfig;
  db: GuardianDb;
  chain: RecoveryChainPort;
  now?: () => number;
  /** Pass `false` in tests. */
  logger?: boolean;
}

export interface RefusalBody {
  confirmed: false;
  reasons: string[];
}

export function buildGuardianServer(deps: GuardianServerDeps): FastifyInstance {
  const { config, db, chain } = deps;
  const now = deps.now ?? Date.now;
  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            level: 'info',
            // Belt and braces: the key never reaches a log line even if someone logs the config object.
            redact: {
              paths: ['privateKey', '*.privateKey', 'GUARDIAN_PRIVATE_KEY', '*.GUARDIAN_PRIVATE_KEY'],
              censor: '[REDACTED]',
            },
          },
  });

  const chainLog = (msg: string, data?: Record<string, unknown>) => app.log.warn(data ?? {}, msg);
  if (chain.kind === 'stub')
    chainLog('chain port is the SIMULATED stub — no transaction reaches Base Sepolia');

  app.get(
    '/identity',
    async (): Promise<GuardianIdentity> =>
      GuardianIdentitySchema.parse({
        kind: config.kind,
        guardianAddress: config.guardianAddress,
        chainId: config.chainId,
      }),
  );

  app.get('/health', async () => ({
    ok: true,
    service: config.kind,
    guardianAddress: config.guardianAddress,
    dbPath: basename(config.dbPath),
    chainPort: chain.kind,
  }));

  app.get('/events', async (req) => {
    const q = req.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 200) || 200, 1000);
    return { events: db.listEvents(limit) };
  });

  app.post('/recoveries', async (req, reply) => {
    const parsed = GuardianRecoveryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const reasons = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      db.appendEvent({ type: 'recovery.rejected', payload: { status: 400, reasons } });
      return reply.code(400).send({ confirmed: false, reasons } satisfies RefusalBody);
    }
    const body = parsed.data;
    const wallet = body.wallet as Address;

    // Idempotent: a repeat of an id we already answered gets the stored answer, whatever it was.
    const seen = db.getSeenRequest(body.recoveryRequestId);
    if (seen) {
      db.appendEvent({
        type: 'recovery.replayed',
        walletAddress: wallet,
        payload: { recoveryRequestId: body.recoveryRequestId, status: seen.status },
      });
      return reply.code(seen.status).send(seen.response);
    }

    db.appendEvent({
      type: 'recovery.received',
      walletAddress: wallet,
      payload: {
        recoveryRequestId: body.recoveryRequestId,
        newOwners: body.newOwners,
        verdict: body.identityVerdict.verdict,
        method: body.identityVerdict.method,
        simulatedIdentity: body.identityVerdict.simulated,
      },
    });

    const decision = await evaluateRecoveryRequest(body, {
      guardianAddress: config.guardianAddress,
      bankVerdictAddress: config.bankVerdictAddress,
      chainId: config.chainId,
      chain,
      lastExecutedConfirmation: (w) => db.lastExecutedConfirmation(w),
      now,
    });

    if (!decision.allow) {
      const response: RefusalBody = { confirmed: false, reasons: decision.reasons };
      db.appendEvent({
        type: 'recovery.refused',
        walletAddress: wallet,
        payload: {
          recoveryRequestId: body.recoveryRequestId,
          status: decision.status,
          reasons: decision.reasons,
        },
      });
      db.rememberRequest(body.recoveryRequestId, decision.status, response);
      return reply.code(decision.status).send(response);
    }

    db.appendEvent({
      type: 'recovery.confirming',
      walletAddress: wallet,
      payload: {
        recoveryRequestId: body.recoveryRequestId,
        execute: decision.execute,
        approvals: decision.approvals,
        threshold: decision.threshold,
        reasons: decision.reasons,
      },
    });

    let txHash: `0x${string}`;
    try {
      ({ txHash } = await chain.confirmAsGuardian({
        wallet,
        newOwners: body.newOwners as Address[],
        newThreshold: body.newThreshold,
        execute: decision.execute,
      }));
    } catch (err) {
      const reason = `chain confirmRecovery failed: ${err instanceof Error ? err.message : String(err)}`;
      db.appendEvent({
        type: 'recovery.chain_error',
        walletAddress: wallet,
        payload: { recoveryRequestId: body.recoveryRequestId, reason },
      });
      // Not remembered: the bank may retry once the chain is reachable again.
      return reply.code(502).send({ confirmed: false, reasons: [reason] } satisfies RefusalBody);
    }

    db.recordConfirmation({
      recoveryRequestId: body.recoveryRequestId,
      wallet: body.wallet,
      newOwner: body.newOwners[0] ?? '',
      executed: decision.execute,
      txHash,
    });
    const response: GuardianRecoveryResponse = { confirmed: true, txHash, executed: decision.execute };
    db.appendEvent({
      type: 'recovery.confirmed',
      walletAddress: wallet,
      payload: {
        recoveryRequestId: body.recoveryRequestId,
        txHash,
        executed: decision.execute,
        simulated: chain.kind === 'stub',
      },
    });
    db.rememberRequest(body.recoveryRequestId, 200, response);
    return reply.code(200).send(response);
  });

  app.post('/recoveries/:id/finalize', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (config.kind !== 'swissquote') {
      const reasons = ['only the swissquote guardian finalizes recoveries'];
      db.appendEvent({ type: 'finalize.refused', payload: { recoveryRequestId: id, status: 403, reasons } });
      return reply.code(403).send({ confirmed: false, reasons } satisfies RefusalBody);
    }
    // SPEC §4 sends no body: resolve the wallet from the confirmation we ourselves recorded for this
    // request id. An explicit `wallet` (body or query) is accepted as an override for ops/tests.
    const q = req.query as { wallet?: string };
    const b = (req.body ?? {}) as { wallet?: string };
    const walletRaw = b.wallet ?? q.wallet ?? db.getConfirmation(id)?.wallet;
    if (!walletRaw || !/^0x[0-9a-fA-F]{40}$/.test(walletRaw)) {
      const reasons = [
        `unknown recovery request ${id}: this guardian never confirmed it, and no wallet was given`,
      ];
      db.appendEvent({ type: 'finalize.refused', payload: { recoveryRequestId: id, status: 404, reasons } });
      return reply.code(404).send({ confirmed: false, reasons } satisfies RefusalBody);
    }
    const wallet = walletRaw as Address;

    const status = await chain.status(wallet);
    const nowSec = Math.floor(now() / 1000);
    if (!status.pending || status.executeAfter === undefined) {
      const reasons = ['no executed recovery is pending for this wallet'];
      db.appendEvent({
        type: 'finalize.refused',
        walletAddress: wallet,
        payload: { recoveryRequestId: id, status: 409, reasons },
      });
      return reply.code(409).send({ confirmed: false, reasons } satisfies RefusalBody);
    }
    if (nowSec < status.executeAfter) {
      const reasons = [`grace period not over: executeAfter=${status.executeAfter}, now=${nowSec}`];
      db.appendEvent({
        type: 'finalize.refused',
        walletAddress: wallet,
        payload: { recoveryRequestId: id, status: 409, reasons },
      });
      return reply.code(409).send({ confirmed: false, reasons } satisfies RefusalBody);
    }

    let txHash: `0x${string}`;
    try {
      ({ txHash } = await chain.finalize({ wallet }));
    } catch (err) {
      const reason = `chain finalizeRecovery failed: ${err instanceof Error ? err.message : String(err)}`;
      db.appendEvent({
        type: 'finalize.chain_error',
        walletAddress: wallet,
        payload: { recoveryRequestId: id, reason },
      });
      return reply.code(502).send({ confirmed: false, reasons: [reason] } satisfies RefusalBody);
    }
    db.markFinalized(wallet, txHash);
    db.appendEvent({
      type: 'finalize.sent',
      walletAddress: wallet,
      payload: { recoveryRequestId: id, txHash, simulated: chain.kind === 'stub' },
    });
    return reply.code(200).send({ txHash });
  });

  return app;
}
