/**
 * The one motion family (docs/DESIGN.md v2 §6). Movement = a damped spring with no visible overshoot
 * (damping ratio ζ = 40 / (2·√(420·1)) ≈ 0.98, settles in ≈ 200 ms). Opacity/colour = 180 ms on the
 * standard curve. Strokes (arcs, checks) draw in 220–240 ms.
 */
export const SPRING = { type: 'spring', stiffness: 420, damping: 40, mass: 1 } as const;
export const EASE_STANDARD = [0.2, 0.8, 0.2, 1] as const;
export const DURATION = { fade: 0.18, move: 0.2, check: 0.22, draw: 0.24 } as const;
export const FADE = { duration: DURATION.fade, ease: EASE_STANDARD } as const;
export const DRAW = { duration: DURATION.draw, ease: EASE_STANDARD } as const;
export const INSTANT = { duration: 0 } as const;

/** Damping ratio of SPRING — pinned by a test so nobody makes it bouncy. */
export function dampingRatio(s: { stiffness: number; damping: number; mass: number } = SPRING): number {
  return s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
}
