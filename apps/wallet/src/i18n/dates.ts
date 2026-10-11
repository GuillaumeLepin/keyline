// Dates and times in the active language (DESIGN.md v2 §9). Every date or time the wallet shows goes through
// these helpers — never `toLocale*String` or a hard-coded locale at the call site.
//
// Locale per language (Swiss conventions, 24-hour clock everywhere):
//   en → `en-GB`  `5 Oct 2026, 14:32` · `2 minutes ago`   (en-GB, not en-US: day-month order, 24 h)
//   fr → `fr-CH`  `5 oct. 2026, 14:32` · `il y a 2 minutes`
//   de → `de-CH`  `5. Okt. 2026, 14:32` · `vor 2 Minuten`
// Time zone: Europe/Zurich, always. The bank, the desk and the demo all run on Swiss time, and a fixed zone
// keeps the server render and the client render identical (no hydration mismatch on a machine in UTC).
import { getPrefs, type Lang } from './prefs';

export const DATE_LOCALE: Record<Lang, string> = { en: 'en-GB', fr: 'fr-CH', de: 'de-CH' };
export const TIME_ZONE = 'Europe/Zurich';

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(lang: Lang, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${lang}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(DATE_LOCALE[lang], { timeZone: TIME_ZONE, hourCycle: 'h23', ...opts });
    cache.set(key, f);
  }
  return f;
}

const toDate = (d: Date | number | string) => (d instanceof Date ? d : new Date(d));

/** `14:32:10` (or `14:32`) — exact finish times. */
export function formatClock(
  date: Date | number | string,
  withSeconds = true,
  lang: Lang = getPrefs().lang,
): string {
  return dtf(lang, {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  }).format(toDate(date));
}

/** `5 Oct 2026, 14:32` · `5 oct. 2026, 14:32` · `5. Okt. 2026, 14:32` */
export function formatDateTime(date: Date | number | string, lang: Lang = getPrefs().lang): string {
  return dtf(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate(date));
}

/** `5 Oct, 14:32` — statement rows. */
export function formatShortDateTime(date: Date | number | string, lang: Lang = getPrefs().lang): string {
  return dtf(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    toDate(date),
  );
}

/** Swissquote valuation stamp — same shape as `formatDateTime`. */
export function formatValuation(iso: string, lang: Lang = getPrefs().lang): string {
  return formatDateTime(iso, lang);
}

/** `just now`→`now` · `2 minutes ago` · `3 hours ago` (Intl.RelativeTimeFormat); after a day, the date. */
export function formatRelative(
  date: Date | number | string,
  now: number = Date.now(),
  lang: Lang = getPrefs().lang,
): string {
  const t = toDate(date).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  const rtf = new Intl.RelativeTimeFormat(DATE_LOCALE[lang], { numeric: 'auto' });
  if (s < 45) return rtf.format(0, 'second');
  const m = Math.round(s / 60);
  if (m < 60) return rtf.format(-m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  return formatDateTime(t, lang);
}
