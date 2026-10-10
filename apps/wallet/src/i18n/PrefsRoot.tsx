'use client';

import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { bundleFor, type CopyBundle } from '../copy';
import { chfTo, fiatFormatter, formatFiat, formatUsdcRate } from './money';
import {
  applyThemeColor,
  COOKIE,
  type Currency,
  isLang,
  type Lang,
  langFromNavigator,
  type Prefs,
  readStoredPrefs,
  setActivePrefs,
  storePrefs,
  THEME_STORAGE_KEY,
  writeCookie,
} from './prefs';

type PrefsApi = {
  prefs: Prefs;
  setLang: (lang: Lang) => void;
  setCurrency: (currency: Currency) => void;
  /** CHF → display currency, formatted (`EUR 102.13`). */
  fiat: (chf: number) => string;
  /** CHF → display currency, as a number (for NumberTicker). */
  toDisplay: (chf: number) => number;
  /** Formatter for numbers already in the display currency. */
  displayFormat: (amount: number) => string;
  /** `1 USDC = EUR 0.85`. */
  rate: (chfPerUsdc: number) => string;
};

const CopyContext = createContext<CopyBundle | null>(null);
const PrefsContext = createContext<PrefsApi | null>(null);

/**
 * Root of every route: sets the active language and currency *before* children render (server and client agree
 * because the server reads the same cookies), provides `useCopy()` / `usePrefs()`, and remounts the tree when the
 * language or currency changes so every string and amount — including the named `copy` views — switches at once.
 */
export function PrefsRoot({ initial, children }: { initial: Prefs; children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  setActivePrefs(prefs);

  // First visit on this profile: adopt what was stored, else the browser's language. Mirror to cookies.
  useEffect(() => {
    const stored = readStoredPrefs();
    const lang =
      stored?.lang ??
      (isLang(initial.lang) && hasCookie(COOKIE.lang)
        ? initial.lang
        : langFromNavigator(navigator.languages));
    const next: Prefs = { lang, currency: stored?.currency ?? initial.currency };
    storePrefs(next);
    try {
      const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (theme) writeCookie(COOKIE.theme, theme);
      applyThemeColor(theme);
    } catch {
      // ignore
    }
    if (next.lang !== initial.lang || next.currency !== initial.currency) setPrefs(next);
  }, [initial]);

  useEffect(() => {
    document.documentElement.lang = prefs.lang === 'fr' ? 'fr-CH' : 'en-CH';
  }, [prefs.lang]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      storePrefs(next);
      setActivePrefs(next);
      return next;
    });
  }, []);

  const api = useMemo<PrefsApi>(
    () => ({
      prefs,
      setLang: (lang) => update({ lang }),
      setCurrency: (currency) => update({ currency }),
      fiat: (chf) => formatFiat(chf, prefs.currency),
      toDisplay: (chf) => chfTo(prefs.currency, chf),
      displayFormat: fiatFormatter(prefs.currency),
      rate: (chfPerUsdc) => formatUsdcRate(chfPerUsdc, prefs.currency),
    }),
    [prefs, update],
  );

  return (
    <PrefsContext.Provider value={api}>
      <CopyContext.Provider value={bundleFor(prefs.lang)}>
        <Fragment key={`${prefs.lang}.${prefs.currency}`}>{children}</Fragment>
      </CopyContext.Provider>
    </PrefsContext.Provider>
  );
}

function hasCookie(name: string): boolean {
  try {
    return document.cookie.split('; ').some((c) => c.startsWith(`${name}=`));
  } catch {
    return false;
  }
}

/** The active language's strings: `const t = useCopy(); t.copyC.settings.title`. */
export function useCopy(): CopyBundle {
  return useContext(CopyContext) ?? bundleFor('en');
}

/** Display preferences + fiat formatting in the chosen currency. */
export function usePrefs(): PrefsApi {
  const ctx = useContext(PrefsContext);
  if (ctx) return ctx;
  const prefs: Prefs = { lang: 'en', currency: 'CHF' };
  return {
    prefs,
    setLang: () => undefined,
    setCurrency: () => undefined,
    fiat: (chf) => formatFiat(chf, 'CHF'),
    toDisplay: (chf) => chf,
    displayFormat: fiatFormatter('CHF'),
    rate: (r) => formatUsdcRate(r, 'CHF'),
  };
}
