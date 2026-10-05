/**
 * Formatting helpers. Conventions (documented in docs/DESIGN.md §8):
 * - Grouping separator is U+2019 (’), as `de-CH` ICU emits. We normalise explicitly so the output
 *   does not depend on the ICU build (some emit U+0027 or U+02BC).
 * - Currency code first for CHF, after for USDC; the gap is a non-breaking space (U+00A0) so a
 *   line never breaks between code and number.
 */

const APOSTROPHE = '’';
const NBSP = ' ';

const twoDecimals = new Intl.NumberFormat('de-CH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

const noDecimals = new Intl.NumberFormat('de-CH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

function normaliseGrouping(s: string): string {
  // ICU variants for de-CH grouping: ' (U+0027), ʼ (U+02BC), ’ (U+2019), or a thin space in some builds.
  return s.replace(/['ʼ’  ]/g, APOSTROPHE);
}

/** `formatCHF(1234.5)` → `CHF 1’234.50` */
export function formatCHF(amount: number): string {
  return `CHF${NBSP}${normaliseGrouping(twoDecimals.format(amount))}`;
}

/** `formatUSDC(25)` → `25.00 USDC`; `formatUSDC(-25)` → `−25.00 USDC` (true minus U+2212) */
export function formatUSDC(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  return `${sign}${normaliseGrouping(twoDecimals.format(Math.abs(amount)))}${NBSP}USDC`;
}

/** Signed variant for statement rows: `+ 120.00 USDC` / `− 25.00 USDC`. */
export function formatSignedUSDC(amount: number): string {
  const sign = amount < 0 ? '−' : '+';
  return `${sign}${NBSP}${normaliseGrouping(twoDecimals.format(Math.abs(amount)))}${NBSP}USDC`;
}

/** Block numbers and other integers: `6812334` → `6’812’334` */
export function formatInteger(n: number): string {
  return normaliseGrouping(noDecimals.format(n));
}

/** `1 USDC = CHF 0.80` */
export function formatRate(chfPerUsdc: number): string {
  return `1${NBSP}USDC = ${formatCHF(chfPerUsdc)}`;
}

/** `0x7a1F…3c9E` — first and last 4 hex characters after the prefix. */
export function shortAddress(address: string, visible = 4): string {
  const body = address.startsWith('0x') ? address.slice(2) : address;
  if (body.length <= visible * 2) return address;
  return `0x${body.slice(0, visible)}…${body.slice(-visible)}`;
}

/** Splits a hex string (with or without 0x) into groups of 4 for reading aloud / checking. */
export function groupHex(hex: string, groupSize = 4): string[] {
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += groupSize) groups.push(body.slice(i, i + groupSize));
  return groups;
}

/** `14:32:10` — exact finish times for countdowns. */
export function formatClock(date: Date | number, withSeconds = true): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(d);
}

/** `5 Oct 2026, 14:32` */
export function formatDateTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return `${day}, ${formatClock(d, false)}`;
}

/** `5 Oct, 14:32` — statement rows in the current year. */
export function formatShortDateTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
  return `${day}, ${formatClock(d, false)}`;
}

/** `just now` · `2 minutes ago` · `3 hours ago` · falls back to the date. */
export function formatRelative(date: Date | number, now: number = Date.now()): string {
  const t = typeof date === 'number' ? date : date.getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  return formatDateTime(t);
}

/** `mm:ss` for remaining durations (`02:41`); hours added only when needed (`1:02:41`). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
