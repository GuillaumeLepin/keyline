import { describe, expect, it } from 'vitest';
import {
  formatCHF,
  formatDuration,
  formatInteger,
  formatRate,
  formatRelative,
  formatSignedUSDC,
  formatUSDC,
  groupHex,
  shortAddress,
} from './format';

const NBSP = ' ';
const APOS = '’';

describe('formatCHF', () => {
  it('uses the de-CH grouping apostrophe U+2019 and a non-breaking space after the code', () => {
    expect(formatCHF(1234.5)).toBe(`CHF${NBSP}1${APOS}234.50`);
  });
  it('always shows two decimals', () => {
    expect(formatCHF(20)).toBe(`CHF${NBSP}20.00`);
    expect(formatCHF(0)).toBe(`CHF${NBSP}0.00`);
  });
  it('groups millions', () => {
    expect(formatCHF(1234567.891)).toBe(`CHF${NBSP}1${APOS}234${APOS}567.89`);
  });
});

describe('formatUSDC', () => {
  it('puts the code after the amount', () => {
    expect(formatUSDC(25)).toBe(`25.00${NBSP}USDC`);
    expect(formatUSDC(2500)).toBe(`2${APOS}500.00${NBSP}USDC`);
  });
  it('uses a true minus sign for negatives', () => {
    expect(formatUSDC(-25)).toBe(`−25.00${NBSP}USDC`);
    expect(formatSignedUSDC(-25)).toBe(`−${NBSP}25.00${NBSP}USDC`);
    expect(formatSignedUSDC(120)).toBe(`+${NBSP}120.00${NBSP}USDC`);
  });
});

describe('integers, rates, addresses', () => {
  it('formats block numbers', () => {
    expect(formatInteger(6812334)).toBe(`6${APOS}812${APOS}334`);
  });
  it('formats the static rate', () => {
    expect(formatRate(0.8)).toBe(`1${NBSP}USDC = CHF${NBSP}0.80`);
  });
  it('shortens addresses to first/last 4 with an ellipsis', () => {
    expect(shortAddress('0x7a1F00000000000000000000000000000000c39E')).toBe('0x7a1F…c39E');
  });
  it('groups hex in fours', () => {
    expect(groupHex('0xa1b2c3d4e5f6')).toEqual(['a1b2', 'c3d4', 'e5f6']);
    expect(groupHex('abcde', 4)).toEqual(['abcd', 'e']);
  });
});

describe('time', () => {
  it('formats durations as mm:ss', () => {
    expect(formatDuration(161_000)).toBe('02:41');
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(3_761_000)).toBe('1:02:41');
  });
  it('formats relative times in plain words', () => {
    const now = 1_000_000_000;
    expect(formatRelative(now - 10_000, now)).toBe('just now');
    expect(formatRelative(now - 120_000, now)).toBe('2 minutes ago');
    expect(formatRelative(now - 3_600_000, now)).toBe('1 hour ago');
  });
});
