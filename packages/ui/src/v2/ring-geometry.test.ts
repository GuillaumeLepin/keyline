import { describe, expect, it } from 'vitest';
import { dampingRatio, SPRING } from './motion';
import {
  arcAngles,
  arcLength,
  arcPath,
  circlePath,
  polar,
  RECOVERERS,
  RING_SIZES,
  ringSpec,
} from './ring-geometry';

describe('protection ring geometry', () => {
  it('uses three 116° arcs with 4° gaps at the receipt and hero sizes', () => {
    for (const size of [RING_SIZES.receipt, RING_SIZES.hero]) {
      const s = ringSpec(size);
      expect(s.gapDeg).toBe(4);
      expect(s.arcDeg).toBe(116);
    }
  });

  it('arcs + gaps always cover exactly 360°', () => {
    for (const size of [24, 32, 48, 64, 120, 200, 320]) {
      const s = ringSpec(size);
      expect(3 * s.arcDeg + 3 * s.gapDeg).toBeCloseTo(360, 10);
    }
  });

  it('keeps a visible gap (≥ 1.5 px on the inner edge) at the 24 px home indicator', () => {
    const s = ringSpec(RING_SIZES.indicator);
    const innerEdge = s.r - s.stroke / 2;
    expect(arcLength(innerEdge, s.gapDeg)).toBeGreaterThanOrEqual(1.5);
    expect(s.gapDeg).toBeGreaterThan(4);
  });

  it('orders the arcs clockwise from 12 o’clock: Safety key, Emergency card, Swissquote', () => {
    expect(RECOVERERS).toEqual(['safety-key', 'emergency-card', 'swissquote']);
    const a = arcAngles(4);
    expect(a.map((x) => x.recoverer)).toEqual(['safety-key', 'emergency-card', 'swissquote']);
    expect(a[0]).toMatchObject({ start: 2, end: 118 });
    expect(a[1]).toMatchObject({ start: 122, end: 238 });
    expect(a[2]).toMatchObject({ start: 242, end: 358 });
  });

  it('centres the gaps on 12, 4 and 8 o’clock', () => {
    const a = arcAngles(4);
    const gaps = [
      (a[2]?.end ?? 0) + 2 - 360,
      ((a[0]?.end ?? 0) + (a[1]?.start ?? 0)) / 2,
      ((a[1]?.end ?? 0) + (a[2]?.start ?? 0)) / 2,
    ];
    expect(gaps).toEqual([0, 120, 240]);
  });

  it('gives every arc the same length, and the closed ring (gap 0) the full circumference', () => {
    const s = ringSpec(200);
    const lengths = arcAngles(s.gapDeg).map((x) => arcLength(s.r, x.end - x.start));
    expect(new Set(lengths.map((l) => l.toFixed(6))).size).toBe(1);
    expect(lengths[0]).toBeCloseTo(arcLength(s.r, 116), 10);
    const closed = arcAngles(0).reduce((sum, x) => sum + arcLength(s.r, x.end - x.start), 0);
    expect(closed).toBeCloseTo(2 * Math.PI * s.r, 10);
  });

  it('draws the first arc from just right of 12 o’clock, clockwise (sweep flag 1)', () => {
    const s = ringSpec(200);
    const d = arcPath(s.centre, s.r, 2, 118);
    const start = polar(s.centre, s.r, 2);
    expect(start.y).toBeLessThan(s.centre); // upper half
    expect(start.x).toBeGreaterThan(s.centre); // just right of 12
    expect(d).toMatch(/^M [\d.]+ [\d.]+ A 97 97 0 0 1 /);
  });

  it('keeps the countdown stroke inside the arcs without touching them', () => {
    for (const size of [64, 120, 200]) {
      const s = ringSpec(size);
      expect(s.innerR + s.innerStroke / 2).toBeLessThan(s.r - s.stroke / 2);
      expect(circlePath(s.centre, s.innerR).startsWith(`M ${s.centre} `)).toBe(true);
    }
  });

  it('uses a spring with no visible overshoot', () => {
    expect(dampingRatio(SPRING)).toBeGreaterThan(0.95);
    expect(dampingRatio(SPRING)).toBeLessThanOrEqual(1);
  });
});
