// Display preferences for this browser profile: language and display currency (DESIGN.md v2 §11 I1).
// Stored in localStorage (per profile) and mirrored into cookies so the server renders the same language and
// currency as the client (no hydration mismatch, no flash). Theme is owned by `useThemePreference` (@keyline/ui);
// we only mirror it into a cookie so <html data-theme> is right on the first paint.

export const LANGS = ['en', 'fr', 'de'] as const;
export type Lang = (typeof LANGS)[number];

export const CURRENCIES = ['CHF', 'EUR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Prefs = { lang: Lang; currency: Currency };

export const PREFS_STORAGE_KEY = 'keyline.prefs';
export const COOKIE = { lang: 'kl_lang', currency: 'kl_ccy', theme: 'kl_theme' } as const;
export const THEME_STORAGE_KEY = 'keyline.theme';

export const DEFAULT_PREFS: Prefs = { lang: 'en', currency: 'CHF' };

/**
 * SIMULATED display rates: units of the display currency per 1 CHF. Static for the prototype (README: Real /
 * Simulated). Consistent with the static Swissquote prices: 1 USDC = CHF 0.80 → 1 CHF = USD 1.25; 1 EURC = CHF 0.94.
 */
export const RATES_PER_CHF: Record<Currency, number> = { CHF: 1, EUR: 1 / 0.94, USD: 1.25 };

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}
export function isCurrency(v: unknown): v is Currency {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}

/** First language from the browser that we ship; English otherwise. */
export function langFromNavigator(languages: readonly string[] | undefined): Lang {
  for (const l of languages ?? []) {
    const base = l.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

// ---- the active preferences (module state, set synchronously by <PrefsRoot> before its children render) ----
let active: Prefs = DEFAULT_PREFS;

export function getPrefs(): Prefs {
  return active;
}
export function setActivePrefs(p: Prefs): void {
  active = p;
}

export function readStoredPrefs(): Partial<Prefs> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...(isLang(v.lang) ? { lang: v.lang } : {}),
      ...(isCurrency(v.currency) ? { currency: v.currency } : {}),
    };
  } catch {
    return null;
  }
}

export function storePrefs(p: Prefs): void {
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: the cookie below still carries the choice for this session.
  }
  writeCookie(COOKIE.lang, p.lang);
  writeCookie(COOKIE.currency, p.currency);
}

export function writeCookie(name: string, value: string): void {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: a one-value preference cookie; no Cookie Store API in Safari.
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // ignore
  }
}

const THEME_COLOR = { light: '#F7F6F3', dark: '#141311' } as const;

/** Browser chrome / PWA status bar follows an explicit Light or Dark choice; System keeps the media-query metas. */
export function applyThemeColor(theme: string | null): void {
  try {
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    for (const m of metas) {
      if (!m.dataset.media) m.dataset.media = m.media || '';
      if (theme === 'light' || theme === 'dark') {
        m.media = '';
        m.content = THEME_COLOR[theme];
      } else {
        m.media = m.dataset.media;
        m.content = m.dataset.media.includes('dark') ? THEME_COLOR.dark : THEME_COLOR.light;
      }
    }
  } catch {
    // ignore
  }
}
