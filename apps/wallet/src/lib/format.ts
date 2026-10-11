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

// Dates: see src/i18n/dates.ts (active language, Zürich time).

/** Which ring arcs to light during a waiting period: the recoverers that actually confirmed (Safety key, card, SQ). */
export function litFromConfirmations(
  confirmations: readonly { kind: string; void?: boolean }[] | undefined,
): readonly [boolean, boolean, boolean] | undefined {
  if (!confirmations?.length) return undefined;
  const has = (k: string) => confirmations.some((c) => c.kind === k && !c.void);
  return [has('safety-key'), has('emergency-card'), has('swissquote')];
}

/** `formatUnits` for display: exact integer part, fraction rounded by Number (display only). */
export function units(raw: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals);
  return Number(raw / base) + Number(raw % base) / Number(base);
}
