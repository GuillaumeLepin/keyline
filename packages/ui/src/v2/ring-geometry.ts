/**
 * Protection ring geometry (docs/DESIGN.md v2 §5). Three equal arcs, one per recoverer, clockwise
 * from 12 o'clock: Safety key, Emergency card, Swissquote. Gaps are centred on 12, 4 and 8 o'clock.
 * Angles are degrees clockwise from 12 o'clock. Pure functions — tested in ring-geometry.test.ts.
 */
export const RECOVERERS = ['safety-key', 'emergency-card', 'swissquote'] as const;
export type Recoverer = (typeof RECOVERERS)[number];

export const RECOVERER_LABEL: Record<Recoverer, string> = {
  'safety-key': 'Safety key',
  'emergency-card': 'Emergency card',
  swissquote: 'Swissquote',
};

/** Canonical sizes: 24 (home indicator), 64 (receipt), 200 (onboarding, countdown). */
export const RING_SIZES = { indicator: 24, receipt: 64, hero: 200 } as const;

/** Smallest gap the eye reads as a gap, measured on the arc's inner edge (px). */
const MIN_INNER_GAP_PX = 1.5;
const BASE_GAP_DEG = 4;

export type RingSpec = {
  size: number;
  centre: number;
  /** Stroke width of the three recoverer arcs. */
  stroke: number;
  /** Radius of the arcs' centre line. */
  r: number;
  gapDeg: number;
  arcDeg: number;
  /** The thin countdown stroke drawn inside the arcs (state `counting`). */
  innerR: number;
  innerStroke: number;
};

export function strokeFor(size: number): number {
  if (size <= 32) return 2.5;
  if (size <= 96) return 4;
  return 6;
}

export function ringSpec(size: number): RingSpec {
  const stroke = strokeFor(size);
  const r = (size - stroke) / 2;
  const innerEdge = r - stroke / 2;
  // 4° at ≥ 64 px; widened at small sizes so the three recoverers still read as three.
  const minDeg = Math.ceil((MIN_INNER_GAP_PX / innerEdge) * (180 / Math.PI));
  const gapDeg = Math.max(BASE_GAP_DEG, minDeg);
  const arcDeg = (360 - 3 * gapDeg) / 3;
  const innerStroke = size >= 96 ? 2 : 1.5;
  const innerR = r - stroke / 2 - (size >= 96 ? 8 : 4) - innerStroke / 2;
  return { size, centre: size / 2, stroke, r, gapDeg, arcDeg, innerR, innerStroke };
}

export type ArcAngles = { recoverer: Recoverer; start: number; end: number };

/** Start/end angle of each arc for a given gap (the gap animates to 0 when the ring closes). */
export function arcAngles(gapDeg: number): ArcAngles[] {
  const arc = (360 - 3 * gapDeg) / 3;
  return RECOVERERS.map((recoverer, i) => {
    const start = gapDeg / 2 + i * (arc + gapDeg);
    return { recoverer, start, end: start + arc };
  });
}

export function polar(centre: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: centre + r * Math.sin(rad), y: centre - r * Math.cos(rad) };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** SVG path for a clockwise arc. Arcs here are always < 180°, so large-arc-flag is 0. */
export function arcPath(centre: number, r: number, start: number, end: number): string {
  const a = polar(centre, r, start);
  const b = polar(centre, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${round(a.x)} ${round(a.y)} A ${round(r)} ${round(r)} 0 ${large} 1 ${round(b.x)} ${round(b.y)}`;
}

export function arcLength(r: number, deg: number): number {
  return (r * deg * Math.PI) / 180;
}

/** Full-circle path starting at 12 o'clock, clockwise — the countdown stroke and the closed ring. */
export function circlePath(centre: number, r: number): string {
  const top = round(centre - r);
  const bottom = round(centre + r);
  const c = round(centre);
  return `M ${c} ${top} A ${round(r)} ${round(r)} 0 1 1 ${c} ${bottom} A ${round(r)} ${round(r)} 0 1 1 ${c} ${top}`;
}
