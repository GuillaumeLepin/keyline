import { formatUnits, maxUint256 } from 'viem';
import { USDC_DECIMALS } from './constants';

export const formatAmount = (v: bigint) =>
  v === maxUint256 ? 'unlimited (2^256 − 1)' : `${formatUnits(v, USDC_DECIMALS)} USDC`;

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
