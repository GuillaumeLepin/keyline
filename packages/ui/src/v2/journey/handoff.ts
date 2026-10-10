/**
 * Pure helpers for the Swissquote → phone handoff (SPEC §10 F0.3). Tested in handoff.test.ts.
 */

/** "482137" → ["482", "137"]. Non-digits are dropped; anything but 6 digits returns null. */
export function splitCode6(code: string): readonly [string, string] | null {
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 6) return null;
  return [digits.slice(0, 3), digits.slice(3)];
}

/** "482137" → "482 137" (thin grouping for display; screen readers get the digits spaced out). */
export function formatCode6(code: string): string {
  const g = splitCode6(code);
  return g ? `${g[0]} ${g[1]}` : code;
}

/** Digits read one by one: "4 8 2 1 3 7". */
export function spokenCode6(code: string): string {
  return code.replace(/\D/g, '').split('').join(' ');
}

/** Remaining time as m:ss (the code lives 10 min, so never hours). Clamped at 0:00. */
export function expiryClock(expiresAt: number, now: number): string {
  const total = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
