import { useReducedMotion as useMotionReducedMotion } from 'motion/react';
import { INSTANT } from './motion';

/**
 * `true` when the user asked for reduced motion (OS setting). Use it for any custom motion outside the
 * primitives: replace movement with an instant change or a 180 ms cross-fade (DESIGN.md v2 §6).
 * Always a boolean (motion's own hook returns `null` before hydration; we treat that as "no").
 */
export function useReducedMotion(): boolean {
  return useMotionReducedMotion() ?? false;
}

/** `reduce ? INSTANT : transition` — the one-liner every custom motion needs. */
export function motionOrInstant<T>(reduce: boolean, transition: T): T | typeof INSTANT {
  return reduce ? INSTANT : transition;
}
