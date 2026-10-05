// Idempotent demo seed (SPEC §0): Lea Keller, three contacts, dApps from policy/allowlist.json.
// Contact addresses are generated once with viem and persisted — never hard-coded, never re-generated.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Dapp, DappSchema } from '@keyline/shared';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { type Db, nowIso } from './db';
import type { EventStore } from './events';

export const LEA = {
  id: 'SQ-48213-LK',
  name: 'Lea Keller',
  email: 'lea.keller@example.ch',
  kycLevel: 'full',
  accountBalanceChf: 5000,
} as const;

export const SEEDED_CONTACTS = [
  { label: 'Lukas Meier', verifiedOwnership: true, simulated: false },
  { label: 'Marta Rossi', verifiedOwnership: false, simulated: false },
  // The screening module flags this address with simulatedHit: true (docs/MOCKS.md).
  { label: 'Sanctioned test address', verifiedOwnership: false, simulated: true },
] as const;

const AllowlistFile = z.object({ dapps: z.array(DappSchema) });

export const loadAllowlist = (): Dapp[] => {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, '..', 'policy', 'allowlist.json'), 'utf8');
  return AllowlistFile.parse(JSON.parse(raw)).dapps;
};

/** Fresh EOA address via viem (the only sanctioned way to generate randomness in this repo). */
const freshAddress = (): string => privateKeyToAccount(generatePrivateKey()).address;

export const seed = (db: Db, events: EventStore): { seededNow: boolean } => {
  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(LEA.id);
  const at = nowIso();
  let seededNow = false;

  db.transaction(() => {
    if (!existing) {
      db.prepare(
        `INSERT INTO clients (id, name, email, kyc_level, account_balance_chf, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(LEA.id, LEA.name, LEA.email, LEA.kycLevel, LEA.accountBalanceChf, at);
      seededNow = true;
    }

    const hasContact = db.prepare('SELECT 1 FROM contacts WHERE client_id = ? AND label = ?');
    const insertContact = db.prepare(
      `INSERT INTO contacts (client_id, label, address, first_seen_at, verified_ownership, simulated) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const c of SEEDED_CONTACTS) {
      if (hasContact.get(LEA.id, c.label)) continue;
      insertContact.run(
        LEA.id,
        c.label,
        freshAddress(),
        at,
        c.verifiedOwnership ? 1 : 0,
        c.simulated ? 1 : 0,
      );
      seededNow = true;
    }

    // dApps are re-synced from the JSON on every start so an allowlist edit is picked up without a reset.
    const upsertDapp = db.prepare(
      `INSERT INTO dapps (id, name, url, allowlisted, contracts, simulated) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, allowlisted = excluded.allowlisted,
         contracts = excluded.contracts, simulated = excluded.simulated`,
    );
    for (const d of loadAllowlist()) {
      upsertDapp.run(
        d.id,
        d.name,
        d.url,
        d.allowlisted ? 1 : 0,
        JSON.stringify(d.contracts),
        d.simulated ? 1 : 0,
      );
    }
  })();

  if (seededNow) {
    events.recordEvent('seed.applied', undefined, {
      clientId: LEA.id,
      contacts: SEEDED_CONTACTS.map((c) => c.label),
      simulated: true,
    });
  }
  return { seededNow };
};

export const sanctionedSeedAddress = (db: Db): string | undefined => {
  const row = db
    .prepare('SELECT address FROM contacts WHERE client_id = ? AND simulated = 1 LIMIT 1')
    .get(LEA.id) as { address: string } | undefined;
  return row?.address;
};
