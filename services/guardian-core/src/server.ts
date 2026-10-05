// The whole HTTP surface of a guardian process. Eight routes. The only two that can produce a
// transaction go through RecoveryChainPort.confirmAsGuardian / .finalize — there is no other path.
// In the default 'signature' mode (DECISIONS #15, Option A) POST /recoveries produces NO transaction
// at all: it returns an EIP-712 signature the bank relayer submits.
import { basename } from 'node:path';
import {
  type GuardianIdentity,
  GuardianIdentitySchema,
  GuardianRecoveryRequestSchema,
  type GuardianRecoveryResponse,
} from '@keyline/shared';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type { Address, Hex } from 'viem';
import { z } from 'zod';
import type { RecoveryChainPort } from './chain-port';
import type { GuardianConfig } from './config';
import type { GuardianDb } from './db';
import { evaluateRecoveryRequest } from './rules';
import { signRecoveryConfirmation } from './signer';

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

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Body of POST /recoveries/:id/executed — the bank reporting its multiConfirmRecovery(execute=true) tx. */
export const RecoveryExecutedBodySchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte tx hash'),
  /** unix seconds, as read from `status(wallet).executeAfter`; must match what we read ourselves. */
  executeAfter: z.number().int().positive(),
});
export type RecoveryExecutedBody = z.infer<typeof RecoveryExecutedBodySchema>;

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

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

  const refuse = (
    reply: FastifyReply,
    status: number,
    type: string,
    reasons: string[],
    extra: { recoveryRequestId?: string; wallet?: Address } = {},
  ) => {
    db.appendEvent({
      type,
      walletAddress: extra.wallet,
      payload: { recoveryRequestId: extra.recoveryRequestId, status, reasons },
    });
    return reply.code(status).send({ confirmed: false, reasons } satisfies RefusalBody);
  };

  app.get(
    '/identity',
    async (): Promise<GuardianIdentity> =>
      GuardianIdentitySchema.parse({
        kind: config.kind,
        guardianAddress: config.guardianAddress,
        chainId: config.chainId,
      }),
  );

  app.get('/health', async () => {
    let submitter: string;
    let submitterAddress: Address | null = null;
    let submitterError: string | undefined;
    try {
      const info = await chain.describeSubmitter();
      submitter = info.kind;
      submitterAddress = info.address;
    } catch (err) {
      submitter = 'none';
      submitterError = errMsg(err);
    }
    return {
      ok: true,
      service: config.kind,
      guardianAddress: config.guardianAddress,
      dbPath: basename(config.dbPath),
      chainPort: chain.kind,
      confirmMode: config.confirmMode,
      submitter,
      submitterAddress,
      ...(submitterError ? { submitterError } : {}),
    };
  });

  app.get('/events', async (req) => {
    const q = req.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 200) || 200, 1000);
    return { events: db.listEvents(limit) };
  });

  app.post('/recoveries', async (req, reply) => {
    const parsed = GuardianRecoveryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const reasons = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      return refuse(reply, 400, 'recovery.rejected', reasons);
    }
    const body = parsed.data;
    const wallet = body.wallet as Address;
    const newOwners = body.newOwners as Address[];

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
        mode: config.confirmMode,
      },
    });

    let decision: Awaited<ReturnType<typeof evaluateRecoveryRequest>>;
    try {
      decision = await evaluateRecoveryRequest(body, {
        guardianAddress: config.guardianAddress,
        bankVerdictAddress: config.bankVerdictAddress,
        chainId: config.chainId,
        chain,
        lastExecutedConfirmation: (w) => db.lastExecutedConfirmation(w),
        now,
      });
    } catch (err) {
      const reason = `chain read failed while evaluating the request: ${errMsg(err)}`;
      db.appendEvent({
        type: 'recovery.chain_error',
        walletAddress: wallet,
        payload: { recoveryRequestId: body.recoveryRequestId, reason },
      });
      return reply.code(502).send({ confirmed: false, reasons: [reason] } satisfies RefusalBody);
    }

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
        mode: config.confirmMode,
        execute: config.confirmMode === 'onchain' ? decision.execute : false,
        approvals: decision.approvals,
        threshold: decision.threshold,
        reasons: decision.reasons,
      },
    });

    if (config.confirmMode === 'signature') {
      // Option A: read the module nonce, sign ExecuteRecovery with viem, hand the signature to the bank.
      let nonce: bigint;
      let signed: Awaited<ReturnType<typeof signRecoveryConfirmation>>;
      try {
        nonce = await chain.nonce(wallet);
        signed = await signRecoveryConfirmation({
          privateKey: config.privateKey,
          module: config.recoveryModuleAddress,
          chainId: config.chainId,
          wallet,
          newOwners,
          newThreshold: body.newThreshold,
          nonce,
        });
      } catch (err) {
        const reason = `could not sign the recovery confirmation: ${errMsg(err)}`;
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
        newOwner: newOwners[0] ?? '',
        mode: 'signature',
        executed: false,
        txHash: null,
        signature: signed.signature,
        nonce: nonce.toString(),
      });
      const response: GuardianRecoveryResponse = {
        confirmed: true,
        mode: 'signature',
        guardianAddress: signed.guardianAddress,
        signature: signed.signature,
        nonce: nonce.toString(),
        executed: false,
      };
      db.appendEvent({
        type: 'recovery.signed',
        walletAddress: wallet,
        payload: {
          recoveryRequestId: body.recoveryRequestId,
          guardianAddress: signed.guardianAddress,
          module: config.recoveryModuleAddress,
          nonce: nonce.toString(),
          recoveryHash: signed.recoveryHash,
          approvalsBefore: decision.approvals,
          threshold: decision.threshold,
          executed: false,
          simulated: chain.kind === 'stub',
        },
      });
      db.rememberRequest(body.recoveryRequestId, 200, response);
      return reply.code(200).send(response);
    }

    // 'onchain' mode: the guardian EOA sends confirmRecovery itself (needs ETH).
    let txHash: Hex;
    try {
      ({ txHash } = await chain.confirmAsGuardian({
        wallet,
        newOwners,
        newThreshold: body.newThreshold,
        execute: decision.execute,
      }));
    } catch (err) {
      const reason = `chain confirmRecovery failed: ${errMsg(err)}`;
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
      newOwner: newOwners[0] ?? '',
      mode: 'onchain',
      executed: decision.execute,
      txHash,
    });
    const response: GuardianRecoveryResponse = {
      confirmed: true,
      mode: 'onchain',
      txHash,
      executed: decision.execute,
    };
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

  // Desk / bank read: what this guardian decided and recorded for one request id.
  app.get('/recoveries/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const confirmation = db.getConfirmation(id) ?? null;
    const seen = db.getSeenRequest(id) ?? null;
    if (!confirmation && !seen) {
      return reply.code(404).send({ confirmed: false, reasons: [`unknown recovery request ${id}`] });
    }
    const events = db
      .listEvents(1000)
      .filter((e) => {
        const p = e.payload as { recoveryRequestId?: unknown } | null;
        return p !== null && typeof p === 'object' && p.recoveryRequestId === id;
      })
      .reverse();
    return {
      recoveryRequestId: id,
      confirmation,
      decision: seen ? { status: seen.status, response: seen.response, at: seen.at } : null,
      events,
    };
  });

  // The bank reports that its relayed multiConfirmRecovery(execute=true) landed. We only believe the
  // chain: status(wallet) must show a pending recovery with the same executeAfter and new owner.
  // Recording this is what arms the one-executed-recovery-per-24h rule in signature mode.
  app.post('/recoveries/:id/executed', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = RecoveryExecutedBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const reasons = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      return refuse(reply, 400, 'executed.rejected', reasons, { recoveryRequestId: id });
    }
    const { txHash, executeAfter } = parsed.data;
    const row = db.getConfirmation(id);
    if (!row) {
      return refuse(
        reply,
        404,
        'executed.rejected',
        [`unknown recovery request ${id}: this guardian never confirmed it`],
        { recoveryRequestId: id },
      );
    }
    const wallet = row.wallet as Address;
    const done = (r: typeof row, alreadyRecorded: boolean) =>
      reply.code(200).send({
        recoveryRequestId: id,
        wallet: r.wallet,
        executed: true,
        txHash: r.txHash,
        executeAfter: r.executeAfter,
        executedAt: r.executedAt,
        alreadyRecorded,
      });
    if (row.executed) {
      if (row.txHash?.toLowerCase() === txHash.toLowerCase()) return done(row, true);
      return refuse(
        reply,
        409,
        'executed.rejected',
        [`request ${id} is already recorded as executed by tx ${row.txHash}`],
        { recoveryRequestId: id, wallet },
      );
    }

    let status: Awaited<ReturnType<RecoveryChainPort['status']>>;
    try {
      status = await chain.status(wallet);
    } catch (err) {
      const reason = `chain read failed: ${errMsg(err)}`;
      db.appendEvent({
        type: 'executed.chain_error',
        walletAddress: wallet,
        payload: { recoveryRequestId: id, reason },
      });
      return reply.code(502).send({ confirmed: false, reasons: [reason] } satisfies RefusalBody);
    }
    const reasons: string[] = [];
    if (!status.pending) reasons.push('no executed recovery is pending on-chain for this wallet');
    else {
      if (status.executeAfter !== executeAfter)
        reasons.push(`executeAfter mismatch: on-chain ${status.executeAfter}, reported ${executeAfter}`);
      const onChainOwners = (status.newOwners ?? []).map((o) => o.toLowerCase());
      if (onChainOwners.length > 0 && !onChainOwners.includes(row.newOwner.toLowerCase()))
        reasons.push('the pending on-chain recovery names a different new owner than the one we signed for');
    }
    if (reasons.length > 0)
      return refuse(reply, 409, 'executed.rejected', reasons, { recoveryRequestId: id, wallet });

    db.markExecuted(id, { txHash, executeAfter });
    const updated = db.getConfirmation(id) ?? row;
    db.appendEvent({
      type: 'recovery.executed',
      walletAddress: wallet,
      payload: {
        recoveryRequestId: id,
        txHash,
        executeAfter,
        mode: row.mode,
        simulated: chain.kind === 'stub',
      },
    });
    return done(updated, false);
  });

  app.post('/recoveries/:id/finalize', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (config.kind !== 'swissquote') {
      return refuse(reply, 403, 'finalize.refused', ['only the swissquote guardian finalizes recoveries'], {
        recoveryRequestId: id,
      });
    }
    // SPEC §4 sends no body: resolve the wallet from the confirmation we ourselves recorded for this
    // request id. An explicit `wallet` (body or query) is accepted as an override for ops/tests.
    const q = req.query as { wallet?: string };
    const b = (req.body ?? {}) as { wallet?: string };
    const walletRaw = b.wallet ?? q.wallet ?? db.getConfirmation(id)?.wallet;
    if (!walletRaw || !ADDRESS_RE.test(walletRaw)) {
      return refuse(
        reply,
        404,
        'finalize.refused',
        [`unknown recovery request ${id}: this guardian never confirmed it, and no wallet was given`],
        { recoveryRequestId: id },
      );
    }
    const wallet = walletRaw as Address;

    let status: Awaited<ReturnType<RecoveryChainPort['status']>>;
    try {
      status = await chain.status(wallet);
    } catch (err) {
      const reason = `chain read failed: ${errMsg(err)}`;
      db.appendEvent({
        type: 'finalize.chain_error',
        walletAddress: wallet,
        payload: { recoveryRequestId: id, reason },
      });
      return reply.code(502).send({ confirmed: false, reasons: [reason] } satisfies RefusalBody);
    }
    const nowSec = Math.floor(now() / 1000);
    if (!status.pending || status.executeAfter === undefined) {
      return refuse(reply, 409, 'finalize.refused', ['no executed recovery is pending for this wallet'], {
        recoveryRequestId: id,
        wallet,
      });
    }
    if (nowSec < status.executeAfter) {
      return refuse(
        reply,
        409,
        'finalize.refused',
        [`grace period not over: executeAfter=${status.executeAfter}, now=${nowSec}`],
        { recoveryRequestId: id, wallet },
      );
    }

    let result: Awaited<ReturnType<RecoveryChainPort['finalize']>>;
    try {
      result = await chain.finalize({ wallet });
    } catch (err) {
      const reason = `chain finalizeRecovery failed: ${errMsg(err)}`;
      db.appendEvent({
        type: 'finalize.chain_error',
        walletAddress: wallet,
        payload: { recoveryRequestId: id, reason },
      });
      return reply.code(502).send({ confirmed: false, reasons: [reason] } satisfies RefusalBody);
    }
    db.markFinalized(wallet, result.txHash);
    db.appendEvent({
      type: 'finalize.sent',
      walletAddress: wallet,
      payload: {
        recoveryRequestId: id,
        txHash: result.txHash,
        submitter: result.submitter,
        simulated: chain.kind === 'stub',
      },
    });
    return reply.code(200).send({ txHash: result.txHash, submitter: result.submitter });
  });

  return app;
}
