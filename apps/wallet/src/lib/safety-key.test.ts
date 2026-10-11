import { describe, expect, it } from 'vitest';
import { normalizeSafetyKey, type StoredSafetyKey } from './storage';

const base = {
  id: 'safety-key',
  privateKey: `0x${'11'.repeat(32)}`,
  address: '0x1111111111111111111111111111111111111111',
  label: 'prototype: software key',
  createdAt: '2026-10-11T00:00:00.000Z',
} as const;
const A = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const B = '0xbBbBBBBBbbBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';

describe('normalizeSafetyKey', () => {
  it('migrates a legacy single walletAddress into walletAddresses', () => {
    const r = normalizeSafetyKey({ ...base, walletAddress: A } as StoredSafetyKey);
    expect(r.walletAddresses).toEqual([A]);
    expect('walletAddress' in r).toBe(false);
    expect(r.address).toBe(base.address);
  });
  it('keeps the list, de-duplicated case-insensitively', () => {
    const r = normalizeSafetyKey({
      ...base,
      walletAddresses: [A, B],
      walletAddress: A.toLowerCase(),
    } as StoredSafetyKey);
    expect(r.walletAddresses).toEqual([A, B]);
  });
});
