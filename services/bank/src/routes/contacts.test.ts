// Phase C contacts screen: stable ids, trusted flag, rename, delete, SIMULATED counterparty-VASP verification.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { openDb } from '../db';
import { createEventStore } from '../events';
import { seed } from '../seed';
import { testConfig } from '../test-env';

const dev = { 'x-device-label': 'Lea · phone' };
const MARTA_NEW = '0x00000000000000000000000000000000000000c7';
type C = {
  id: string;
  label: string;
  address: string;
  trusted: boolean;
  verifiedOwnership: boolean;
  simulated?: true;
};

describe('contacts management', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp(testConfig(), { logger: false, finalizer: false, screeningOffline: true });
  });
  afterAll(async () => {
    await app.close();
  });
  const list = async () => (await app.inject({ method: 'GET', url: '/contacts' })).json().contacts as C[];
  const byLabel = async (label: string) => (await list()).find((c) => c.label === label) as C;

  it('contacts carry a stable id and trusted; seeded Lukas is trusted, the others are not', async () => {
    const all = await list();
    for (const c of all) expect(c.id).toBe(`ct_${c.address.toLowerCase().slice(2)}`);
    expect((await byLabel('Lukas Meier')).trusted).toBe(true);
    expect((await byLabel('Marta Rossi')).trusted).toBe(false);
    expect((await byLabel('Sanctioned test address')).trusted).toBe(false);
    const created = await app.inject({
      method: 'POST',
      url: '/contacts',
      headers: dev,
      payload: { label: 'Nina', address: MARTA_NEW },
    });
    expect(created.json()).toMatchObject({ id: `ct_${MARTA_NEW.slice(2)}`, trusted: false });
  });

  it('PATCH renames and toggles trusted; needs a session/device label; 404 for an unknown id; 400 for an empty body', async () => {
    const marta = await byLabel('Marta Rossi');
    expect(
      (await app.inject({ method: 'PATCH', url: `/contacts/${marta.id}`, payload: { trusted: true } }))
        .statusCode,
    ).toBe(401);
    const res = await app.inject({
      method: 'PATCH',
      url: `/contacts/${marta.id}`,
      headers: dev,
      payload: { label: 'Marta R.', trusted: true },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      id: marta.id,
      label: 'Marta R.',
      trusted: true,
      verifiedOwnership: false,
    });
    const off = await app.inject({
      method: 'PATCH',
      url: `/contacts/${marta.id}`,
      headers: dev,
      payload: { trusted: false },
    });
    expect(off.json()).toMatchObject({ label: 'Marta R.', trusted: false });
    expect(
      (await app.inject({ method: 'PATCH', url: `/contacts/${marta.id}`, headers: dev, payload: {} }))
        .statusCode,
    ).toBe(400);
    const unknown = `ct_${'ab'.repeat(20)}`;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/contacts/${unknown}`,
          headers: dev,
          payload: { trusted: true },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('POST /contacts/:id/verify is a SIMULATED counterparty-VASP proof: verifiedOwnership true + event', async () => {
    const marta = await byLabel('Marta R.');
    const res = await app.inject({ method: 'POST', url: `/contacts/${marta.id}/verify`, headers: dev });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      verifiedOwnership: true,
      method: 'counterparty-vasp-simulated',
      simulated: true,
      contact: { id: marta.id, verifiedOwnership: true },
    });
    expect((await byLabel('Marta R.')).verifiedOwnership).toBe(true);
    const ev = await app.inject({
      method: 'GET',
      url: '/desk/events',
      headers: { 'x-operator-token': 'desk-test-token' },
    });
    const verified = (ev.json().events as { type: string; payload: Record<string, unknown> }[]).find(
      (e) => e.type === 'contact.verified',
    );
    expect(verified?.payload).toMatchObject({
      contactId: marta.id,
      method: 'counterparty-vasp-simulated',
      simulated: true,
    });
  });

  it('DELETE removes a contact (seeded ones too); the seed brings seeded ones back on the next start', async () => {
    const sanctioned = await byLabel('Sanctioned test address');
    const res = await app.inject({ method: 'DELETE', url: `/contacts/${sanctioned.id}`, headers: dev });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true, id: sanctioned.id });
    expect((await list()).some((c) => c.id === sanctioned.id)).toBe(false);
    expect(
      (await app.inject({ method: 'DELETE', url: `/contacts/${sanctioned.id}`, headers: dev })).statusCode,
    ).toBe(404);
    // Re-running the seed (what a restart / demo reset does) restores it.
    seed(app.db, createEventStore(app.db));
    const back = await byLabel('Sanctioned test address');
    expect(back).toMatchObject({ simulated: true, trusted: false });
  });

  it('migration: an existing DB without contacts.trusted gets the column, with Lukas trusted', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'keyline-contacts-')), 'old.sqlite');
    const old = new Database(path);
    old.exec(`CREATE TABLE contacts (
      client_id TEXT NOT NULL, label TEXT NOT NULL, address TEXT NOT NULL, first_seen_at TEXT NOT NULL,
      verified_ownership INTEGER NOT NULL DEFAULT 0, simulated INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (client_id, address))`);
    old
      .prepare(
        "INSERT INTO contacts VALUES ('C', 'Lukas Meier', '0x01', 'x', 1, 0), ('C', 'Marta Rossi', '0x02', 'x', 0, 0)",
      )
      .run();
    old.close();
    const db = openDb(path);
    expect(db.prepare('SELECT label, trusted FROM contacts ORDER BY label').all()).toEqual([
      { label: 'Lukas Meier', trusted: 1 },
      { label: 'Marta Rossi', trusted: 0 },
    ]);
    db.close();
    expect(() => openDb(path).close()).not.toThrow(); // idempotent on the next start
  });
});
