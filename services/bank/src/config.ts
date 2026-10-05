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
  RECOVERY_MODULE_ADDRESS: Address,
  DEMO_FAST_MODE: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional())
    .transform((v) => v === 'true'),

  BANK_PORT: z.coerce.number().int().positive().default(4000),
  BANK_HOST: z.string().default('127.0.0.1'),
  // The Candide key may be empty during Wave 0; sponsorship is then disabled, never faked.
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
    paymasterEnabled: Boolean(
      e.BANK_CANDIDE_API_KEY && (e.BANK_CANDIDE_PAYMASTER_URL || e.BANK_CANDIDE_BUNDLER_URL),
    ),
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
