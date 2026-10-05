// Config loader for a guardian process. Reads ONLY this process's environment (the package script
// passes --env-file=.env). The private key stays in memory and is never logged or returned.

import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

export type GuardianKind = 'swissquote' | 'partner';

export interface GuardianConfig {
  kind: GuardianKind;
  port: number;
  /** Secret. Only ever handed to the chain adapter; never serialised. */
  privateKey: Hex;
  /** The on-chain guardian EOA derived from the private key. */
  guardianAddress: Address;
  dbPath: string;
  bankVerdictAddress: Address;
  chainId: number;
  rpcUrl: string;
  recoveryModuleAddress: Address;
}

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte hex address');
const PrivateKeySchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex private key');

const EnvSchema = z.object({
  GUARDIAN_KIND: z.enum(['swissquote', 'partner']),
  GUARDIAN_PORT: z.coerce.number().int().min(1).max(65535),
  GUARDIAN_PRIVATE_KEY: PrivateKeySchema,
  GUARDIAN_DB_PATH: z.string().min(1),
  BANK_VERDICT_ADDRESS: AddressSchema,
  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URL: z.string().url(),
  RECOVERY_MODULE_ADDRESS: AddressSchema,
});

/**
 * Variables a guardian must never see (CLAUDE.md non-negotiable #3). BANK_VERDICT_ADDRESS is the
 * one BANK_* value that is legitimately ours (a public address), so it is allow-listed.
 */
const FORBIDDEN_PREFIXES = ['BANK_', 'WALLET_', 'NEXT_PUBLIC_', 'DESK_'] as const;
const ALLOWED_BANK_KEYS = new Set(['BANK_VERDICT_ADDRESS']);

export class GuardianConfigError extends Error {
  override readonly name = 'GuardianConfigError';
}

export function assertNoForeignSecrets(env: NodeJS.ProcessEnv): void {
  const offending = Object.keys(env).filter(
    (k) => FORBIDDEN_PREFIXES.some((p) => k.startsWith(p)) && !ALLOWED_BANK_KEYS.has(k),
  );
  if (offending.length > 0) {
    // Names only, never values.
    throw new GuardianConfigError(
      `guardian environment must not contain bank/wallet variables: ${offending.sort().join(', ')}`,
    );
  }
}

export function loadGuardianConfig(env: NodeJS.ProcessEnv = process.env): GuardianConfig {
  assertNoForeignSecrets(env);
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // zod issue paths name the variable; values are not echoed for the private key because the
    // regex failure message is static.
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new GuardianConfigError(`invalid guardian environment: ${issues}`);
  }
  const e = parsed.data;
  const privateKey = e.GUARDIAN_PRIVATE_KEY as Hex;
  const guardianAddress = privateKeyToAccount(privateKey).address;
  return {
    kind: e.GUARDIAN_KIND,
    port: e.GUARDIAN_PORT,
    privateKey,
    guardianAddress,
    dbPath: e.GUARDIAN_DB_PATH,
    bankVerdictAddress: e.BANK_VERDICT_ADDRESS as Address,
    chainId: e.CHAIN_ID,
    rpcUrl: e.RPC_URL,
    recoveryModuleAddress: e.RECOVERY_MODULE_ADDRESS as Address,
  };
}

/** What is safe to show in logs / health: everything except the key. */
export function publicConfig(config: GuardianConfig): Omit<GuardianConfig, 'privateKey'> {
  const { privateKey: _secret, ...rest } = config;
  return rest;
}
