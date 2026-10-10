const APOSTROPHE = '’';
const NBSP = ' ';

/** Quantities with fixed decimals and U+2019 grouping (same output convention as @keyline/ui format.ts). */
export function fmtQty(n: number, decimals: number, code?: string): string {
  const s = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(n)
    .replace(/,/g, APOSTROPHE);
  return code ? `${s}${NBSP}${code}` : s;
}
