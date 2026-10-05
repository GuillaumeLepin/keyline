// Static CHF conversion (SPEC §0 "Rates (SIMULATED)"). No market data in the prototype.
import type { Fx } from '@keyline/shared';

export const USDC_CHF_RATE = 0.8;
export const FX: Fx = { pair: 'USDC/CHF', rate: USDC_CHF_RATE, simulated: true };

/** USDC base units (6 decimals) → CHF, rounded to the rappen. */
export const usdcToChf = (baseUnits: bigint): number => {
  const usdc = Number(baseUnits) / 1_000_000;
  return Math.round(usdc * USDC_CHF_RATE * 100) / 100;
};

export const chfToUsdc = (chf: number): number => Math.round((chf / USDC_CHF_RATE) * 100) / 100;

/** Swiss number formatting for copy: 1'000.00 */
export const formatChf = (value: number): string => {
  const [int, frac] = value.toFixed(2).split('.');
  const grouped = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `CHF ${grouped}.${frac ?? '00'}`;
};
