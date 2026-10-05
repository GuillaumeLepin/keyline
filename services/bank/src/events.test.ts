import { describe, expect, it } from 'vitest';
import { openDb } from './db';
import { createEventStore } from './events';

describe('events (append-only)', () => {
  it('exposes only record + read operations', () => {
    const store = createEventStore(openDb(':memory:'));
    const names = Object.keys(store);
    expect(names.sort()).toEqual(['listAll', 'listForWallet', 'recordEvent']);
    expect(names.some((n) => /update|delete|remove|clear/i.test(n))).toBe(false);
  });

  it('records and reads back a schema-valid event', () => {
    const store = createEventStore(openDb(':memory:'));
    const wallet = '0x0000000000000000000000000000000000000001';
    const ev = store.recordEvent('passkey.registered', wallet, { deviceLabel: 'Lea · phone' });
    expect(ev.service).toBe('bank');
    expect(store.listForWallet(wallet)).toHaveLength(1);
    expect(store.listAll()[0]?.id).toBe(ev.id);
  });

  it('the database itself refuses UPDATE and DELETE on events', () => {
    const db = openDb(':memory:');
    const store = createEventStore(db);
    const ev = store.recordEvent('seed.applied', undefined, {});
    expect(() => db.prepare('UPDATE events SET type = ? WHERE id = ?').run('x', ev.id)).toThrow(
      /append-only/,
    );
    expect(() => db.prepare('DELETE FROM events WHERE id = ?').run(ev.id)).toThrow(/append-only/);
    expect(store.listAll()).toHaveLength(1);
  });
});
