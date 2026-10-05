// Append-only event log. This module exports only insert + read; the DB also has triggers refusing UPDATE/DELETE.
import { type Event, EventSchema } from '@keyline/shared';
import { type Db, newId, nowIso } from './db';

type EventRow = {
  id: string;
  service: string;
  type: string;
  wallet_address: string | null;
  payload: string;
  at: string;
};

const rowToEvent = (r: EventRow): Event =>
  EventSchema.parse({
    id: r.id,
    service: r.service,
    type: r.type,
    walletAddress: r.wallet_address ?? undefined,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    at: r.at,
  });

export const createEventStore = (db: Db) => {
  const insert = db.prepare(
    `INSERT INTO events (id, service, type, wallet_address, payload, at) VALUES (?, 'bank', ?, ?, ?, ?)`,
  );
  const byWallet = db.prepare(
    `SELECT * FROM events WHERE wallet_address = ? ORDER BY at DESC, rowid DESC LIMIT ?`,
  );
  const all = db.prepare(`SELECT * FROM events ORDER BY at DESC, rowid DESC LIMIT ?`);

  return {
    recordEvent(type: string, walletAddress: string | undefined, payload: Record<string, unknown>): Event {
      const event: Event = {
        id: newId('evt'),
        service: 'bank',
        type,
        walletAddress,
        payload,
        at: nowIso(),
      };
      insert.run(event.id, event.type, walletAddress ?? null, JSON.stringify(payload), event.at);
      return event;
    },
    listForWallet(walletAddress: string, limit = 200): Event[] {
      return (byWallet.all(walletAddress, limit) as EventRow[]).map(rowToEvent);
    },
    listAll(limit = 500): Event[] {
      return (all.all(limit) as EventRow[]).map(rowToEvent);
    },
  };
};
export type EventStore = ReturnType<typeof createEventStore>;
