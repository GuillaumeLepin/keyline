import { describe, expect, it } from 'vitest';
import { formatCHF, formatUSDC } from '../format';
import { digitOffsetPercent, tickerCells } from './ticker';

describe('NumberTicker cells', () => {
  it('splits a CHF amount into digit columns and static separators', () => {
    const cells = tickerCells(formatCHF(1234.5)); // "CHF 1’234.50"
    expect(cells.map((c) => c.char).join('')).toBe('CHF\u00a01’234.50');
    expect(cells.filter((c) => c.digit !== null).map((c) => c.digit)).toEqual([1, 2, 3, 4, 5, 0]);
    expect(cells.find((c) => c.char === '’')?.digit).toBeNull();
    expect(cells.find((c) => c.char === '.')?.digit).toBeNull();
    expect(cells.find((c) => c.char === ' ')?.digit).toBeNull();
  });

  it('keys cells from the right so the units column survives a new leading digit', () => {
    const before = tickerCells(formatCHF(99.8)); // CHF 99.80
    const after = tickerCells(formatCHF(120)); // CHF 120.00
    const last = (cs: ReturnType<typeof tickerCells>) => cs[cs.length - 1];
    expect(last(before)?.key).toBe('r0');
    expect(last(after)?.key).toBe('r0');
    expect(after.length).toBe(before.length + 1);
    // The decimal point sits at the same key on both sides.
    expect(before.find((c) => c.char === '.')?.key).toBe(after.find((c) => c.char === '.')?.key);
  });

  it('handles USDC with a true minus sign and suffix code', () => {
    const cells = tickerCells(formatUSDC(-25));
    expect(cells[0]?.char).toBe('−');
    expect(cells.map((c) => c.char).join('')).toBe('−25.00 USDC');
  });

  it('maps a digit to its column offset (10 % per digit)', () => {
    expect(digitOffsetPercent(0)).toBe('0%');
    expect(digitOffsetPercent(7)).toBe('-70%');
  });
});
