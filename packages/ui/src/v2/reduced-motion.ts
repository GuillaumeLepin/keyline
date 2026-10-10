'use client';

import { useSyncExternalStore } from 'react';
import { INSTANT } from './motion';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const getSnapshot = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
/** The server cannot know the OS setting: it renders full motion, and hydration uses the same value. */
const getServerSnapshot = (): boolean => false;

/**
 * `true` when the user asked for reduced motion (OS setting). Hydration-safe: the server render and the
 * first client render both read `false` (React's server snapshot), then the real value applies right
 * after hydration — so motion props never differ between SSR and the client (Phase C: StackView's
 * `{opacity:1}` vs `{opacity:"1",transform:"none"}` mismatch). Every primitive uses this hook; use it for
 * any custom motion too: replace movement with an instant change or a 180 ms cross-fade (DESIGN.md §6).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `reduce ? INSTANT : transition` — the one-liner every custom motion needs. */
export function motionOrInstant<T>(reduce: boolean, transition: T): T | typeof INSTANT {
  return reduce ? INSTANT : transition;
}
