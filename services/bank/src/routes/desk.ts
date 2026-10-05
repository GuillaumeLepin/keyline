// Swissquote recovery desk reads (X-Operator-Token): the queue with identity signals, and the merged append-only
// audit feed (bank events + sq-guardian events, each tagged with its service). The desk cannot move funds.
import {
  DeskQueueResponseSchema,
  type Event,
  EventsResponseSchema,
  type RecoveryRequest,
  type RecoveryStatus,
} from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import type { ChainDeps, GuardianEventRow } from '../deps';
import type { EventStore } from '../events';
import type { RecoveryService } from '../recovery-service';
import { usableSignatures } from '../recovery-service';
import type { RecoveryStore } from '../recovery-store';
import type { Repo } from '../repo';
import { GUARDIAN_THRESHOLD } from '../store';

type Deps = {
  events: EventStore;
  repo: Repo;
  recoveries: RecoveryStore;
  chain: ChainDeps;
  service: RecoveryService;
};

/** Human-readable identity signals for one request (persona rule hits, mismatches, recoverer state). */
export const signalsOf = (r: RecoveryRequest, clientName: string): string[] => {
  const out: string[] = [];
  const label = r.requestedFrom.deviceLabel;
  if (label.toLowerCase().includes('thief')) out.push(`Device label contains "thief" (${label})`);
  out.push(r.identity.emailOtpPassed ? 'Email code passed' : 'Email code not entered yet');
  if (r.eidPayload) {
    const mismatch = r.eidPayload.name.trim().toLowerCase() !== clientName.trim().toLowerCase();
    out.push(
      mismatch
        ? `ID document: name "${r.eidPayload.name}" ≠ client "${clientName}"`
        : 'ID document: name matches',
    );
    out.push(r.eidPayload.liveness ? 'Liveness: passed (simulated)' : 'Liveness: failed (simulated)');
  }
  if (r.identity.verdict === 'pass') out.push(`Verdict: pass, signed by the bank (${r.identity.method})`);
  else if (r.identity.verdict === 'fail')
    out.push(`Verdict: fail, signed by the bank (${r.identity.method})`);
  else out.push('Verdict: pending');
  if (r.identity.operatorNote) out.push(`Operator: ${r.identity.operatorNote}`);
  for (const c of r.guardianConfirmations) {
    if (c.void) out.push(`${c.kind}: confirmation voided by the desk`);
    else if (c.mode === 'signature') out.push(`${c.kind}: signed (nonce ${c.nonce ?? '?'})`);
    else out.push(`${c.kind}: confirmed on-chain ${c.txHash ?? ''}`.trim());
  }
  for (const g of r.guardianRefusals) out.push(`${g.kind} refused (${g.status}): ${g.reasons.join('; ')}`);
  if (r.status === 'awaiting-guardians')
    out.push('Waiting for a second recoverer — Swissquote cannot finish this alone');
  return out;
};

const guardianEventToEvent = (e: GuardianEventRow): Event => ({
  id: `sq_${e.id}`,
  service: 'sq-guardian',
  type: e.type,
  walletAddress: e.walletAddress ?? undefined,
  payload:
    e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload)
      ? (e.payload as Record<string, unknown>)
      : { value: e.payload },
  at: new Date(e.at).toISOString(),
});

export const registerDeskRoutes = (app: FastifyInstance, { events, repo, recoveries, chain }: Deps): void => {
  app.get('/desk/queue', { config: { operator: true } }, async () => {
    const counts: Partial<Record<RecoveryStatus, number>> = {};
    const items = recoveries.list().map((r) => {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      const client = repo.client(r.clientId);
      const have =
        r.status === 'executed-waiting' || r.status === 'finalized' || r.status === 'cancelled'
          ? GUARDIAN_THRESHOLD
          : Math.min(GUARDIAN_THRESHOLD, r.onchain.nonce ? usableSignatures(r, r.onchain.nonce).length : 0);
      const timer = r.onchain.executeAfter
        ? {
            executeAfter: r.onchain.executeAfter,
            remainingSeconds: Math.max(
              0,
              Math.ceil((new Date(r.onchain.executeAfter).getTime() - Date.now()) / 1000),
            ),
          }
        : undefined;
      return {
        recovery: { ...r, waitingFor: r.waitingFor },
        client: client ?? {
          id: r.clientId,
          name: 'Unknown client',
          email: r.email,
          kycLevel: 'full',
          createdAt: r.createdAt,
        },
        signals: signalsOf(r, client?.name ?? ''),
        confirmations: { have, need: GUARDIAN_THRESHOLD },
        timer,
      };
    });
    return DeskQueueResponseSchema.parse({ items, counts });
  });

  app.get('/desk/events', { config: { operator: true } }, async () => {
    const bank = events.listAll();
    const sources: Record<string, 'ok' | 'unreachable'> = {};
    let remote: Event[] = [];
    try {
      remote = (await chain.sqGuardian.events(500)).map(guardianEventToEvent);
      sources['sq-guardian'] = 'ok';
    } catch {
      sources['sq-guardian'] = 'unreachable';
    }
    const merged = [...bank, ...remote].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return EventsResponseSchema.parse({ events: merged, sources });
  });
};
