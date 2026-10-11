/** One displayed line of EIP-712 data. `depth` indents nested structs; `danger` flags what can take money. */
export type TypedRow = {
  label: string;
  value: string;
  depth: number;
  /** A struct header (no value of its own), e.g. `details`. */
  group?: boolean;
  danger?: boolean;
  /** Short reason shown under a danger row, e.g. "No limit — the spender can take all of it". */
  note?: string;
  mono?: boolean;
};

type Field = { name: string; type: string };
export type TypedDataInput = {
  types: Record<string, readonly Field[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export const UINT256_MAX = (1n << 256n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT48_MAX = (1n << 48n) - 1n;

export type TypedRowsCopy = {
  /** Displayed for 2^256−1 / 2^160−1 amounts. "Unlimited" */
  unlimited: string;
  /** "No limit — the spender can take all of it, now and later." */
  unlimitedNote: string;
  /** Displayed for max uint48 / far-future expirations. "Never" */
  never: string;
  /** "Never expires." */
  neverNote: string;
};

export const TYPED_ROWS_COPY: TypedRowsCopy = {
  unlimited: 'Unlimited',
  unlimitedNote: 'No limit — the spender can take all of it, now and later.',
  never: 'Never',
  neverNote: 'This permission never expires.',
};

/** `spendingLimit` → `Spending limit`. Keeps acronyms (`tokenID` → `Token ID`). */
export function humanLabel(name: string): string {
  const spaced = name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
  return (
    spaced.charAt(0).toUpperCase() +
    spaced
      .slice(1)
      .toLowerCase()
      .replace(/\b(id|url|nft|erc\d*)\b/g, (m) => m.toUpperCase())
  );
}

function asBigInt(v: unknown): bigint | undefined {
  try {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
    if (typeof v === 'string' && /^(0x[0-9a-f]+|\d+)$/i.test(v)) return BigInt(v);
  } catch {
    // not a number
  }
  return undefined;
}

/**
 * Flatten EIP-712 data into label/value rows, depth-first in type order. Amount fields at
 * 2^256−1 / 2^160−1 read `Unlimited` and are flagged `danger`; expirations at max uint48 read `Never`
 * and are flagged. Arrays are listed `item 1`, `item 2`… Pure; strings are passed in.
 */
export type TypedRowsOptions = {
  /** Formats a unix time (seconds) found in a deadline / expiration / validity field. Default: ISO-like UTC. */
  formatTime?: (unixSeconds: number) => string;
};

const defaultTime = (s: number) => new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 16);

export function typedDataRows(
  data: TypedDataInput,
  copy: Partial<TypedRowsCopy> = {},
  opts: TypedRowsOptions = {},
): TypedRow[] {
  const t = { ...TYPED_ROWS_COPY, ...copy };
  const fmt = opts.formatTime ?? defaultTime;
  const rows: TypedRow[] = [];
  const walk = (type: string, value: unknown, label: string, depth: number) => {
    const arr = type.match(/^(.*)\[\d*\]$/);
    if (arr && Array.isArray(value)) {
      rows.push({ label, value: '', depth, group: true });
      value.forEach((v, i) => {
        walk(arr[1] as string, v, `${i + 1}`, depth + 1);
      });
      return;
    }
    const fields = data.types[type];
    if (fields && value && typeof value === 'object') {
      rows.push({ label, value: '', depth, group: true });
      for (const f of fields)
        walk(f.type, (value as Record<string, unknown>)[f.name], humanLabel(f.name), depth + 1);
      return;
    }
    const n = /^u?int/.test(type) ? asBigInt(value) : undefined;
    if (n !== undefined && (n === UINT256_MAX || n === UINT160_MAX)) {
      rows.push({ label, value: t.unlimited, depth, danger: true, note: t.unlimitedNote });
      return;
    }
    if (n !== undefined && n === UINT48_MAX && /expir|deadline|valid/i.test(label)) {
      rows.push({ label, value: t.never, depth, danger: true, note: t.neverNote });
      return;
    }
    if (
      n !== undefined &&
      /expir|deadline|valid|until|after|before/i.test(label) &&
      n > 1_000_000_000n &&
      n < 100_000_000_000n
    ) {
      rows.push({ label, value: fmt(Number(n)), depth });
      return;
    }
    const s = typeof value === 'bigint' ? value.toString() : String(value ?? '');
    rows.push({ label, value: s, depth, mono: type === 'address' || /^bytes/.test(type) });
  };
  const fields = data.types[data.primaryType] ?? [];
  for (const f of fields) walk(f.type, data.message[f.name], humanLabel(f.name), 0);
  return rows;
}
