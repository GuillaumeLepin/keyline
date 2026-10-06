// Public, non-secret configuration (NEXT_PUBLIC_* only — nothing here is a key).
import type { Address } from 'viem';

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) throw new Error(`Missing ${name} in apps/wallet/.env.local`);
  return value;
}

export const env = {
  bankUrl: required('NEXT_PUBLIC_BANK_URL', process.env.NEXT_PUBLIC_BANK_URL),
  chainId: BigInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? '84532'),
  rpcUrl: required('NEXT_PUBLIC_RPC_URL', process.env.NEXT_PUBLIC_RPC_URL),
  /** Candide public endpoint: gas estimation only (no key). Sponsorship happens in the bank. */
  bundlerUrl: required('NEXT_PUBLIC_BUNDLER_URL', process.env.NEXT_PUBLIC_BUNDLER_URL),
  usdcAddress: required('NEXT_PUBLIC_USDC_ADDRESS', process.env.NEXT_PUBLIC_USDC_ADDRESS) as Address,
  recoveryModule: required(
    'NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS',
    process.env.NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS,
  ) as Address,
  explorer: process.env.NEXT_PUBLIC_EXPLORER ?? 'https://sepolia.basescan.org',
  demoFastMode: process.env.NEXT_PUBLIC_DEMO_FAST_MODE === 'true',
  /** SIMULATED static rate (SPEC §0): CHF per 1 USDC. */
  chfPerUsdc: 0.8,
  /** Server-render fallback for the pairing sentence; the client replaces it with `window.location.host`. */
  pairUrl: 'localhost:3000/pair',
  clientId: 'SQ-48213-LK',
} as const;
