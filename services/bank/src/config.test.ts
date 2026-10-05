import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';
import { TEST_ENV } from './test-env';

describe('config', () => {
  it('rejects a missing JWT secret', () => {
    const { BANK_JWT_SECRET: _omit, ...env } = TEST_ENV;
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/BANK_JWT_SECRET/);
  });

  it('rejects a malformed private key', () => {
    expect(() => loadConfig({ ...TEST_ENV, BANK_VERDICT_PRIVATE_KEY: '0xabc' })).toThrow(
      /BANK_VERDICT_PRIVATE_KEY/,
    );
  });

  it('treats an empty Candide key as paymaster disabled, never as an error', () => {
    const cfg = loadConfig(TEST_ENV);
    expect(cfg.paymasterEnabled).toBe(false);
    expect(cfg.BANK_CANDIDE_API_KEY).toBeUndefined();
  });

  it('enables the paymaster only when a key and a URL are both present', () => {
    const cfg = loadConfig({
      ...TEST_ENV,
      BANK_CANDIDE_API_KEY: 'k',
      BANK_CANDIDE_PAYMASTER_URL: 'https://api.candide.dev/paymaster/v3/base-sepolia/k',
    });
    expect(cfg.paymasterEnabled).toBe(true);
  });

  it('derives public addresses and never exposes the keys on them', () => {
    const cfg = loadConfig(TEST_ENV);
    expect(cfg.addresses.verdict).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(Object.values(cfg.addresses)).not.toContain(TEST_ENV.BANK_VERDICT_PRIVATE_KEY);
  });
});
