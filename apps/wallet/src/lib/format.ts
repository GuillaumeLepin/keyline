// Quantities with fixed decimals and U+2019 grouping (same convention as @keyline/ui format.ts).
const APOSTROPHE = '’';
const NBSP = ' ';

export function formatQty(n: number, decimals: number, code?: string): string {
  const s = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(n)
    .replace(/,/g, APOSTROPHE);
  return code ? `${s}${NBSP}${code}` : s;
}

/** Display decimals per asset: crypto with 4, stablecoins and cash with 2, fund units with 0. */
export function decimalsFor(symbol: string): number {
  if (symbol === 'BTC' || symbol === 'ETH') return 4;
  if (symbol === 'USDC' || symbol === 'EURC' || symbol === 'CHF') return 2;
  return 0;
}

/** "10 Oct 2026, 17:30" in Zürich time. */
export function formatValuation(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Zurich',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Zurich',
  }).format(d);
  return `${date}, ${time}`;
}
