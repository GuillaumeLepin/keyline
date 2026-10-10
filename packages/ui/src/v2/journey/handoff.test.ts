import { describe, expect, it } from 'vitest';
import { expiryClock, formatCode6, splitCode6, spokenCode6 } from './handoff';

describe('handoff code', () => {
  it('splits a 6-digit code into two groups of three', () => {
    expect(splitCode6('482137')).toEqual(['482', '137']);
    expect(splitCode6('482 137')).toEqual(['482', '137']);
    expect(splitCode6('48213')).toBeNull();
    expect(splitCode6('4821370')).toBeNull();
  });
  it('formats for display and for screen readers', () => {
    expect(formatCode6('482137')).toBe('482 137');
    expect(spokenCode6('482 137')).toBe('4 8 2 1 3 7');
  });
  it('counts down as m:ss, rounding up, clamped at 0:00', () => {
    expect(expiryClock(10 * 60_000, 0)).toBe('10:00');
    expect(expiryClock(292_000, 0)).toBe('4:52');
    expect(expiryClock(291_001, 0)).toBe('4:52');
    expect(expiryClock(1000, 5000)).toBe('0:00');
  });
});
