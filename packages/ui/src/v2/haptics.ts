/** Short vibration on success and refusal (docs/DESIGN.md v2 §8). No-op where unsupported (iOS Safari, desktop). */
export type HapticKind = 'success' | 'refusal';

const PATTERN: Record<HapticKind, number | number[]> = {
  success: 12,
  refusal: [24, 60, 24],
};

export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERN[kind]);
  } catch {
    // Some embedded browsers throw instead of returning false; a missing buzz is never an error.
  }
}
