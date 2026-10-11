import { describe, expect, it } from 'vitest';
import { units } from './format';

describe('units (display formatUnits)', () => {
  it('matches viem formatUnits for display values', () => {
    expect(units(95_000_000n, 6)).toBe(95);
    expect(units(1_234_567n, 6)).toBeCloseTo(1.234567, 9);
    expect(units(10n ** 18n / 4n, 18)).toBe(0.25);
    expect(units(0n, 6)).toBe(0);
  });
});
