// Environment is loaded by `tsx --env-file=.env` (package script). This module never reads another .env.
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

const PrivateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'private key (0x + 64 hex)');
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'address');
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const EnvSchema = z.object({
  CHAIN_ID: z.coerce.number().int().positive().default(84532),
  RPC_URL: z.string().url(),
  USDC_ADDRESS: Address,
  /**
   * The seeded "Sanctioned test address" (SIMULATED hit). Fixed so every bank instance (dev :4000, QA :4100, fresh
   * DBs) and DemoSwap agree on it; a random viem EOA generated once, never a real SDN entry. Empty → random per DB.
   */
  BANK_SANCTIONED_TEST_ADDRESS: z.preprocess(
    emptyToUndefined,
    Address.optional().default('0x42b16056ee5e2C9bDE34Db76fdb2FA7554Ab0A73'),
  ),
  /** Circle EURC on Base Sepolia (6 decimals, DECISIONS #27). */
  EURC_ADDRESS: Address.default('0x808456652fdb597867f38412077A9182bf77359F'),
  RECOVERY_MODULE_ADDRESS: Address,
  DEMO_FAST_MODE: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional())
    .transform((v) => v === 'true'),

  BANK_PORT: z.coerce.number().int().positive().default(4000),
  BANK_HOST: z.string().default('127.0.0.1'),
  // The key is optional: the public Candide endpoint sponsors on testnet (DECISIONS #11). The URL decides.
  BANK_CANDIDE_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  BANK_CANDIDE_BUNDLER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  BANK_CANDIDE_PAYMASTER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  BANK_VERDICT_PRIVATE_KEY: PrivateKey,
  BANK_RELAYER_PRIVATE_KEY: PrivateKey,
  BANK_FUNDER_PRIVATE_KEY: PrivateKey,
  BANK_JWT_SECRET: z.string().min(16, 'BANK_JWT_SECRET must be at least 16 characters'),
  BANK_DB_PATH: z.string().min(1).default('./data/bank.sqlite'),
  DESK_OPERATOR_TOKEN: z.string().min(8),

  SQ_GUARDIAN_URL: z.string().url().default('http://localhost:4001'),
  PARTNER_GUARDIAN_URL: z.string().url().default('http://localhost:4002'),

  WALLET_RP_ID: z.string().min(1).default('localhost'),
  WALLET_ORIGIN: z.string().url().default('http://localhost:3000'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.string().optional(),
});
export type Env = z.infer<typeof EnvSchema>;

export type BankConfig = Env & {
  paymasterEnabled: boolean;
  /** One Candide URL serves bundler + paymaster; each falls back to the other when only one is set. */
  bundlerUrl: string | undefined;
  paymasterUrl: string | undefined;
  explorerUrl: string;
  /** Public addresses only — safe to log and to return from /health. */
  addresses: { verdict: `0x${string}`; relayer: `0x${string}`; funder: `0x${string}` };
  sessionTtlSeconds: number;
  challengeTtlSeconds: number;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): BankConfig => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid bank environment — ${issues}`);
  }
  const e = parsed.data;
  const explorerUrl = e.CHAIN_ID === 84532 ? 'https://sepolia.basescan.org' : 'https://sepolia.etherscan.io';
  return {
    ...e,
    paymasterEnabled: Boolean(e.BANK_CANDIDE_PAYMASTER_URL || e.BANK_CANDIDE_BUNDLER_URL),
    bundlerUrl: e.BANK_CANDIDE_BUNDLER_URL ?? e.BANK_CANDIDE_PAYMASTER_URL,
    paymasterUrl: e.BANK_CANDIDE_PAYMASTER_URL ?? e.BANK_CANDIDE_BUNDLER_URL,
    explorerUrl,
    addresses: {
      verdict: privateKeyToAccount(e.BANK_VERDICT_PRIVATE_KEY as `0x${string}`).address,
      relayer: privateKeyToAccount(e.BANK_RELAYER_PRIVATE_KEY as `0x${string}`).address,
      funder: privateKeyToAccount(e.BANK_FUNDER_PRIVATE_KEY as `0x${string}`).address,
    },
    sessionTtlSeconds: 15 * 60,
    challengeTtlSeconds: 5 * 60,
  };
};
