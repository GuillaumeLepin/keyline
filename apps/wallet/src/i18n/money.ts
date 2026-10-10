// Fiat secondaries in the display currency chosen in Settings. Every amount that the wallet values in fiat
// (a CHF figure from the bank or from a static SIMULATED price) goes through `fiat()`; on-chain quantities never do.
import { formatCHF } from '@keyline/ui';
import { type Currency, getPrefs, RATES_PER_CHF } from './prefs';

const NBSP = ' ';

/** CHF → the display currency, unrounded. */
export function chfTo(currency: Currency, chf: number): number {
  return chf * RATES_PER_CHF[currency];
}

/** Display currency → CHF (the policy engine and the bank always reason in CHF). */
export function toChf(currency: Currency, amount: number): number {
  return amount / RATES_PER_CHF[currency];
}

/** `fiat(96)` → `CHF 96.00`, or `EUR 102.13` / `USD 120.00` per Settings (same grouping as formatCHF). */
export function formatFiat(chf: number, currency: Currency = getPrefs().currency): string {
  const s = formatCHF(chfTo(currency, chf));
  return currency === 'CHF' ? s : s.replace(/^CHF/, currency);
}

/** A formatter for an amount already expressed in `currency` (NumberTicker on a converted value). */
export function fiatFormatter(currency: Currency): (amount: number) => string {
  return (amount: number) => {
    const s = formatCHF(amount);
    return currency === 'CHF' ? s : s.replace(/^CHF/, currency);
  };
}

/** `1 USDC = CHF 0.80` in the display currency. */
export function formatUsdcRate(chfPerUsdc: number, currency: Currency = getPrefs().currency): string {
  return `1${NBSP}USDC = ${formatFiat(chfPerUsdc, currency)}`;
}
