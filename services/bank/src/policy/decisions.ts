// Reading a decision applies the time-based transition: a `cooling` decision whose waiting period has passed
// becomes `approve` (persisted + event). Used by every route that loads a decision, including /userops/*.
import type { PolicyDecision } from '@keyline/shared';
import type { EventStore } from '../events';
import type { Store } from '../store';
import { promoteCooling } from './engine';

export type StoredDecision = PolicyDecision & { consumedAt?: string };

/** Strips the read-only `consumedAt` before a decision is written back. */
export const stripStored = (d: StoredDecision): PolicyDecision => {
  const { consumedAt: _c, ...decision } = d;
  return decision;
};

export const loadDecision = (
  store: Store,
  events: EventStore,
  id: string,
  now: Date = new Date(),
): StoredDecision | null => {
  const stored = store.decision(id);
  if (!stored) return null;
  const promoted = promoteCooling(stored, now);
  if (!promoted) return stored;
  store.updateDecision(stripStored(promoted));
  events.recordEvent('policy.cooling-elapsed', stored.walletAddress, {
    decisionId: id,
    coolingUntil: stored.coolingUntil,
    chfValue: stored.chfValue,
  });
  return { ...promoted, consumedAt: stored.consumedAt };
};
