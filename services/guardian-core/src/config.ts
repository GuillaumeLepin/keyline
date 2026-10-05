// Config loader for a guardian process. Reads ONLY this process's environment (the package script
// passes --env-file=.env). The private key stays in memory and is never logged or returned.

import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

export type GuardianKind = 'swissquote' | 'partner';

/**
 * How `POST /recoveries` confirms (docs/DECISIONS.md #15):
 *  - 'signature' (default, Option A): return an EIP-712 ExecuteRecovery signature; the bank relayer submits it.
 *  - 'onchain': the guardian EOA sends `confirmRecovery` itself (requires ETH on the guardian EOA).
 */
export type GuardianConfirmMode = 'signature' | 'onchain';

export interface GuardianConfig {
  kind: GuardianKind;
  port: number;
  /** Secret. Only ever handed to the chain adapter / the typed-data signer; never serialised. */
  privateKey: Hex;
  /** The on-chain guardian EOA derived from the private key. */
  guardianAddress: Address;
  dbPath: string;
  bankVerdictAddress: Address;
  chainId: number;
  /** Absent → the entry point falls back to the SIMULATED stub (tests / offline dev only). */
  rpcUrl?: string;
  recoveryModuleAddress: Address;
  /** Candide bundler+paymaster URL for the guardian's OWN sponsored relayer Safe (finalize with 0 ETH). */
  candideUrl?: string;
  confirmMode: GuardianConfirmMode;
}

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte hex address');
const PrivateKeySchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex private key');
/** `.env` lines may carry a trailing `# comment`; strip it before validating a URL. */
const UrlSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/\s+#.*$/, '').trim() : v),
  z.string().url(),
);

const EnvSchema = z.object({
  GUARDIAN_KIND: z.enum(['swissquote', 'partner']),
  GUARDIAN_PORT: z.coerce.number().int().min(1).max(65535),
  GUARDIAN_PRIVATE_KEY: PrivateKeySchema,
  GUARDIAN_DB_PATH: z.string().min(1),
  BANK_VERDICT_ADDRESS: AddressSchema,
  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URL: UrlSchema.optional(),
  RECOVERY_MODULE_ADDRESS: AddressSchema,
  GUARDIAN_CANDIDE_URL: UrlSchema.optional(),
  GUARDIAN_CONFIRM_MODE: z.enum(['signature', 'onchain']).default('signature'),
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
  const config: GuardianConfig = {
    kind: e.GUARDIAN_KIND,
    port: e.GUARDIAN_PORT,
    privateKey,
    guardianAddress,
    dbPath: e.GUARDIAN_DB_PATH,
    bankVerdictAddress: e.BANK_VERDICT_ADDRESS as Address,
    chainId: e.CHAIN_ID,
    recoveryModuleAddress: e.RECOVERY_MODULE_ADDRESS as Address,
    confirmMode: e.GUARDIAN_CONFIRM_MODE,
  };
  if (e.RPC_URL) config.rpcUrl = e.RPC_URL;
  if (e.GUARDIAN_CANDIDE_URL) config.candideUrl = e.GUARDIAN_CANDIDE_URL;
  return config;
}

/** What is safe to show in logs / health: everything except the key. */
export function publicConfig(config: GuardianConfig): Omit<GuardianConfig, 'privateKey'> {
  const { privateKey: _secret, ...rest } = config;
  return rest;
}
