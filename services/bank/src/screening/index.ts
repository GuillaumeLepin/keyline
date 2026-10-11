// Sanctions screening: the real OFAC SDN ETH address list (0xB10C, live fetch → vendored snapshot) plus the one
// seeded test entry (seeded-sanctioned.json → the 'Sanctioned test address' contact) flagged `simulatedHit: true`.
// SECO (Switzerland) publishes sanctioned persons by name, not by address, so it appears in `listsChecked` but can
// only ever be a name check in production — in the prototype it is a no-op, hence `simulated: true` on every result.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Screening } from '@keyline/shared';
import { type Address, getAddress, isAddressEqual } from 'viem';
import { z } from 'zod';
import { type FetchLike, loadOfacList, loadSnapshot, type OfacList } from './ofac';

export const SCREENING_REASON_SEEDED = 'Counterparty appears on the OFAC SDN list — simulated test entry';
export const SCREENING_REASON_REAL = 'Counterparty appears on the OFAC SDN list';
const SECO_NOTE = 'SECO publishes names, not addresses — that part of the screening is simulated.';

const SeededFile = z.object({
  entries: z.array(
    z.object({
      contactLabel: z.string().min(1),
      source: z.literal('seeded-test'),
      simulatedHit: z.literal(true),
      reason: z.string().min(1),
    }),
  ),
});
export type SeededEntry = z.infer<typeof SeededFile>['entries'][number];

export const loadSeededEntries = (): SeededEntry[] => {
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'seeded-sanctioned.json'), 'utf8');
  return SeededFile.parse(JSON.parse(raw)).entries;
};

export type ScreeningContext = {
  /** The seeded 'Sanctioned test address' contact's address (resolved from the DB; random, never a real SDN entry). */
  sanctionedTestAddress?: Address;
  /** Further seeded test entries (the configured BANK_SANCTIONED_TEST_ADDRESS when the DB holds an older random one). */
  extraSanctionedTestAddresses?: readonly Address[];
  /** Lowercase OFAC SDN ETH addresses. Omitted → only the seeded test entry can hit. */
  ofac?: ReadonlySet<string>;
  ofacSource?: OfacList['source'];
};

/** Pure lookup. The seeded test entry wins over the real list so the demo hit is always labelled simulated. */
export const screen = (counterparty: Address, ctx: ScreeningContext = {}): Screening => {
  const address = getAddress(counterparty);
  const seededHit =
    (ctx.sanctionedTestAddress != null && isAddressEqual(address, ctx.sanctionedTestAddress)) ||
    (ctx.extraSanctionedTestAddresses ?? []).some((a) => isAddressEqual(address, a));
  const realHit = !seededHit && (ctx.ofac?.has(address.toLowerCase()) ?? false);
  const hit = seededHit || realHit;
  return {
    counterparty: address,
    listsChecked: ['OFAC-SDN', 'SECO'],
    hit,
    source: seededHit ? 'seeded-test' : realHit ? 'OFAC-SDN' : undefined,
    simulatedHit: seededHit,
    simulated: true,
    note: ctx.ofac
      ? `OFAC SDN ETH list: ${ctx.ofac.size} addresses (${ctx.ofacSource ?? 'snapshot'}). ${SECO_NOTE}`
      : `OFAC SDN list not loaded — seeded test entry only. ${SECO_NOTE}`,
  };
};

/** The block-reason copy for a hit (DESIGN /send/review `block`). */
export const screeningReason = (s: Screening): string =>
  s.simulatedHit ? SCREENING_REASON_SEEDED : SCREENING_REASON_REAL;

export type ScreeningService = {
  screen: (counterparty: Address) => Screening;
  status: () => {
    ofac: { source: OfacList['source']; count: number; retrievedAt: string; url: string };
    seeded: { label: string; address?: Address }[];
    listsChecked: ['OFAC-SDN', 'SECO'];
    simulated: true;
  };
};

/** Startup wiring: fetch the live list (5 s) or fall back to the snapshot; bind the seeded test address. */
export const createScreening = async (opts: {
  sanctionedTestAddress?: Address;
  extraSanctionedTestAddresses?: readonly Address[];
  fetch?: FetchLike;
  /** Tests: skip the network entirely. */
  offline?: boolean;
}): Promise<ScreeningService> => {
  const list = opts.offline ? loadSnapshot() : await loadOfacList({ fetch: opts.fetch });
  const seeded = loadSeededEntries();
  const ctx: ScreeningContext = {
    sanctionedTestAddress: opts.sanctionedTestAddress,
    extraSanctionedTestAddresses: opts.extraSanctionedTestAddresses,
    ofac: list.addresses,
    ofacSource: list.source,
  };
  return {
    screen: (counterparty) => screen(counterparty, ctx),
    status: () => ({
      ofac: { source: list.source, count: list.addresses.size, retrievedAt: list.retrievedAt, url: list.url },
      seeded: [
        ...seeded.map((e) => ({ label: e.contactLabel, address: opts.sanctionedTestAddress })),
        ...(opts.extraSanctionedTestAddresses ?? [])
          .filter((a) => !opts.sanctionedTestAddress || !isAddressEqual(a, opts.sanctionedTestAddress))
          .map((address) => ({ label: 'Sanctioned test address (configured)', address })),
      ],
      listsChecked: ['OFAC-SDN', 'SECO'],
      simulated: true,
    }),
  };
};
