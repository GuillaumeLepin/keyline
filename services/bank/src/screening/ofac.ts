// OFAC SDN — Ethereum addresses, from 0xB10C's nightly extraction of the SDN list (GitHub, branch `lists`).
// Live fetch at startup with a 5 s timeout; the vendored snapshot next to this file is the offline fallback.
// This is the one real list in the screening module; SECO publishes names, not addresses (see index.ts).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OFAC_ETH_LIST_URL =
  'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.txt';
export const OFAC_FETCH_TIMEOUT_MS = 5_000;

export type OfacListSource = 'live' | 'snapshot';
export type OfacList = {
  addresses: ReadonlySet<string>; // lowercase 0x…
  source: OfacListSource;
  /** When the live list was fetched, or the snapshot's retrieval date from its header. */
  retrievedAt: string;
  url: string;
};

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Parses the 0xB10C text format (one address per line) — comments and blanks are ignored, addresses lowercased. */
export const parseAddressList = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (ADDRESS_RE.test(line)) out.add(line.toLowerCase());
  }
  return out;
};

export const snapshotPath = (): string =>
  join(dirname(fileURLToPath(import.meta.url)), 'ofac-eth.snapshot.txt');

export const loadSnapshot = (): OfacList => {
  const text = readFileSync(snapshotPath(), 'utf8');
  const retrieved = /# Retrieved: (\S+)\./.exec(text)?.[1] ?? 'unknown';
  return {
    addresses: parseAddressList(text),
    source: 'snapshot',
    retrievedAt: retrieved,
    url: OFAC_ETH_LIST_URL,
  };
};

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; text(): Promise<string> }>;

/** Live list, or the snapshot when the network does not answer within the timeout / returns garbage. */
export const loadOfacList = async (
  opts: { fetch?: FetchLike; timeoutMs?: number; url?: string } = {},
): Promise<OfacList> => {
  const f = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
  if (!f) return loadSnapshot();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? OFAC_FETCH_TIMEOUT_MS);
  try {
    const res = await f(opts.url ?? OFAC_ETH_LIST_URL, { signal: controller.signal });
    if (!res.ok) throw new Error('bad status');
    const addresses = parseAddressList(await res.text());
    // A real list has well over 100 entries; anything smaller is a truncated / wrong response — keep the snapshot.
    if (addresses.size < 100) throw new Error(`suspiciously short list (${addresses.size})`);
    return {
      addresses,
      source: 'live',
      retrievedAt: new Date().toISOString(),
      url: opts.url ?? OFAC_ETH_LIST_URL,
    };
  } catch {
    return loadSnapshot();
  } finally {
    clearTimeout(timer);
  }
};
