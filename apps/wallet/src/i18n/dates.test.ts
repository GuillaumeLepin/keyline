import { describe, expect, it } from 'vitest';
import { formatClock, formatDateTime, formatRelative, formatShortDateTime } from './dates';

// 5 Oct 2026 12:32:10 UTC = 14:32:10 in Zürich (CEST).
const T = Date.UTC(2026, 9, 5, 12, 32, 10);

describe('dates in the active language', () => {
  it('uses Swiss time and a 24-hour clock in every language', () => {
    expect(formatClock(T, true, 'en')).toBe('14:32:10');
    expect(formatClock(T, false, 'de')).toBe('14:32');
    expect(formatClock(T, false, 'fr')).toBe('14:32');
  });
  it('formats dates per locale', () => {
    expect(formatDateTime(T, 'en')).toBe('5 Oct 2026, 14:32');
    expect(formatDateTime(T, 'de')).toMatch(/^5\. Okt\. 2026/);
    expect(formatDateTime(T, 'fr')).toMatch(/^5 oct\. 2026/);
    expect(formatShortDateTime(T, 'en')).toBe('5 Oct, 14:32');
  });
  it('formats relative times with Intl.RelativeTimeFormat', () => {
    expect(formatRelative(T, T + 10_000, 'en')).toBe('now');
    expect(formatRelative(T, T + 120_000, 'en')).toBe('2 minutes ago');
    expect(formatRelative(T, T + 120_000, 'fr')).toBe('il y a 2 minutes');
    expect(formatRelative(T, T + 3 * 3_600_000, 'de')).toBe('vor 3 Stunden');
    expect(formatRelative(T, T + 2 * 86_400_000, 'en')).toBe('5 Oct 2026, 14:32');
  });
});
