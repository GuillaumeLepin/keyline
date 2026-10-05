/** Shared CLI helpers for the spike scripts (env, args, logging). */
import { resolve } from 'node:path';
import { candideEndpoint } from '@keyline/chain';
import { config } from 'dotenv';

config({ path: resolve(import.meta.dirname, '../../.env') });

export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} missing in root .env`);
  return value;
}

export function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function log(title: string, value?: unknown): void {
  console.info(
    value === undefined
      ? `\n== ${title}`
      : `${title}: ${typeof value === 'string' ? value : JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2)}`,
  );
}

export interface SpikeEndpoints {
  readonly chainId: bigint;
  readonly rpcUrl: string;
  readonly bundlerUrl: string;
  readonly paymasterUrl: string | undefined;
}

/** Candide URLs from .env; `--public` falls back to the public endpoint (sponsors on testnet, dev only). */
export function spikeEndpoints(): SpikeEndpoints {
  const chainId = BigInt(requireEnv('CHAIN_ID'));
  const apiKey = env('BANK_CANDIDE_API_KEY');
  const usePublic = hasFlag('--public');
  const bundlerUrl = env('BANK_CANDIDE_BUNDLER_URL') ?? candideEndpoint(chainId, apiKey);
  const paymasterUrl =
    env('BANK_CANDIDE_PAYMASTER_URL') ?? (apiKey || usePublic ? candideEndpoint(chainId, apiKey) : undefined);
  return { chainId, rpcUrl: requireEnv('RPC_URL'), bundlerUrl, paymasterUrl };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
