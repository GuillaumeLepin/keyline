// Deterministic environment for tests. These keys are throwaway test vectors, never funded, never used elsewhere.
import { type BankConfig, loadConfig } from './config';

export const TEST_ENV: NodeJS.ProcessEnv = {
  CHAIN_ID: '84532',
  RPC_URL: 'https://sepolia.base.org',
  USDC_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  RECOVERY_MODULE_ADDRESS: '0x949d01d424bE050D09C16025dd007CB59b3A8c66',
  DEMO_FAST_MODE: 'true',
  BANK_PORT: '4000',
  BANK_CANDIDE_API_KEY: '',
  BANK_CANDIDE_BUNDLER_URL: '',
  BANK_CANDIDE_PAYMASTER_URL: '',
  BANK_VERDICT_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
  BANK_RELAYER_PRIVATE_KEY: `0x${'22'.repeat(32)}`,
  BANK_FUNDER_PRIVATE_KEY: `0x${'33'.repeat(32)}`,
  BANK_JWT_SECRET: 'test-secret-with-enough-entropy-0123456789',
  BANK_DB_PATH: ':memory:',
  DESK_OPERATOR_TOKEN: 'desk-test-token',
  WALLET_RP_ID: 'localhost',
  WALLET_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
};

export const testConfig = (overrides: NodeJS.ProcessEnv = {}): BankConfig =>
  loadConfig({ ...TEST_ENV, ...overrides });
