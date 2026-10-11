// All UI strings, per language. EN (`copy.en.ts`) is the source of truth (DESIGN.md appendices); FR
// (`copy.fr.ts`) is typed against it with `Widen<>`, so a missing or extra FR key fails `pnpm typecheck`.
//
// Two ways to read copy:
// - `useCopy()` (preferred in new code): the active bundle; re-renders when the language changes.
// - the named exports below (`copy`, `copyV2`, …): live views of the active bundle. <PrefsRoot> sets the
//   language before any child renders and remounts the tree when it changes, so they are always current.
//   Never capture them in module-level constants (that would freeze the language at import time).

import * as de from './copy.de';
import * as en from './copy.en';
import * as fr from './copy.fr';
import { getPrefs, type Lang } from './i18n/prefs';

/** Literal strings → string, functions keep their parameters; tuples keep their length. */
export type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T;

export type CopyBundle = { readonly [K in keyof typeof en]: Widen<(typeof en)[K]> };

const BUNDLES: Record<Lang, CopyBundle> = { en, fr, de };

export function bundleFor(lang: Lang): CopyBundle {
  return BUNDLES[lang];
}

/** A view of one export of the active bundle (typed as the EN literal type for existing call sites). */
function live<K extends keyof typeof en>(key: K): (typeof en)[K] {
  // biome-ignore lint/performance/noDynamicNamespaceImportAccess: eleven fixed keys, all bundled anyway.
  return new Proxy(en[key] as object, {
    get: (_t, prop) => Reflect.get(BUNDLES[getPrefs().lang][key] as object, prop),
    has: (_t, prop) => Reflect.has(BUNDLES[getPrefs().lang][key] as object, prop),
  }) as (typeof en)[K];
}

export const copy = live('copy');
export const copyGaps = live('copyGaps');
export const devResetCopy = live('devResetCopy');
export const sqWebShell = live('sqWebShell');
export const sqPositionsCopy = live('sqPositionsCopy');
export const sqTileCopy = live('sqTileCopy');
export const sqSafetyKeyCopy = live('sqSafetyKeyCopy');
export const btcPolicyCopy = live('btcPolicyCopy');
export const copyV2 = live('copyV2');
export const copyJourney = live('copyJourney');
export const copyC = live('copyC');
export const copyWc = live('copyWc');

// `useCopy()` lives in ./i18n/PrefsRoot (client-only: it needs React context).
export { useCopy, usePrefs } from './i18n/PrefsRoot';
