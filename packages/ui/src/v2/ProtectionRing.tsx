'use client';

import { animate, type MotionValue, motion, useMotionValue, useTransform } from 'motion/react';
import { type ReactNode, useEffect, useRef } from 'react';
import { DRAW, DURATION, EASE_STANDARD, FADE, INSTANT, SPRING } from './motion';
import { useReducedMotion } from './reduced-motion';
import { arcAngles, arcPath, circlePath, RECOVERER_LABEL, RECOVERERS, ringSpec } from './ring-geometry';

export type ProtectionRingState = 'empty' | 'registering' | 'protected' | 'counting' | 'success' | 'revoked';

export type ProtectionRingProps = {
  state: ProtectionRingState;
  /** How many recoverers are registered (state `registering`): lights arcs in order Safety key → Emergency card → Swissquote. */
  registered?: 0 | 1 | 2 | 3;
  /** Which arcs are lit, when not "the first n" (e.g. recovery confirmations: Safety key + Swissquote). */
  lit?: readonly [boolean, boolean, boolean];
  /** State `counting`: fraction of the waiting period still to run, 1 → 0. Drawn as the thin inner stroke. */
  progress?: number;
  /** Outer diameter: 24 (home indicator), 64 (receipt), 200 (onboarding, countdown). */
  size?: number;
  /** Called once per arc when its draw finishes (index 0..2). Drives the next on-chain step in demos only. */
  onDrawn?: (index: number) => void;
  /** Increment to play one soft pulse (the countdown's last second landing). */
  pulseKey?: number;
  /** Centre content (time, check, nothing). */
  children?: ReactNode;
  /** Accessible description; defaults to a sentence derived from the state. */
  label?: string;
  /** Translated hidden per-recoverer list (default "Safety key: yes, Emergency card: not yet, …"). */
  detail?: string;
  className?: string;
};

function defaultLabel(state: ProtectionRingState, litCount: number): string {
  switch (state) {
    case 'empty':
      return 'Not protected yet · 0 of 3 recoverers';
    case 'registering':
      return `${litCount} of 3 recoverers added`;
    case 'protected':
      return 'Protected · 2 of 3 recoverers can restore access';
    case 'counting':
      return `Waiting period running · ${litCount} of 3 recoverers confirmed`;
    case 'success':
      return 'Done';
    case 'revoked':
      return 'Protection removed';
  }
}

function Arc({
  index,
  centre,
  r,
  stroke,
  gap,
  lit,
  tone,
  reduce,
  onDrawn,
}: {
  index: number;
  centre: number;
  r: number;
  stroke: number;
  gap: MotionValue<number>;
  lit: boolean;
  tone: 'accent' | 'ok' | 'danger' | 'quiet';
  reduce: boolean;
  onDrawn?: (index: number) => void;
}) {
  const d = useTransform(gap, (g) => {
    const a = arcAngles(g)[index];
    return a ? arcPath(centre, r, a.start, a.end) : '';
  });
  // Arcs lit at mount appear drawn; only an arc that lights up later draws in (240 ms).
  const litAtMount = useRef(lit);
  return (
    <motion.path
      d={d}
      fill="none"
      strokeWidth={stroke}
      strokeLinecap="butt"
      className={`kl2-ring__arc kl2-ring__arc--${tone}`}
      initial={{ pathLength: litAtMount.current ? 1 : 0, opacity: litAtMount.current ? 1 : 0 }}
      animate={{ pathLength: lit ? 1 : 0, opacity: lit ? 1 : 0 }}
      transition={
        reduce
          ? INSTANT
          : {
              pathLength: lit ? DRAW : { duration: DURATION.fade, ease: EASE_STANDARD },
              opacity: { duration: 0.01 },
            }
      }
      onAnimationComplete={() => {
        if (lit && !litAtMount.current) onDrawn?.(index);
      }}
    />
  );
}

/**
 * The protection ring — Keyline's only motif. One SVG, three arcs for the three recoverers, used as the
 * onboarding progress, the home indicator, the recovery countdown and the receipt's success state.
 * Geometry: ring-geometry.ts. Motion: motion.ts. Honours prefers-reduced-motion (no draw, no pulse).
 */
export function ProtectionRing({
  state,
  registered = 0,
  lit,
  progress = 1,
  size = 200,
  onDrawn,
  pulseKey = 0,
  children,
  label,
  detail,
  className,
}: ProtectionRingProps) {
  const reduce = useReducedMotion();
  const s = ringSpec(size);
  const closed = state === 'protected' || state === 'success';

  const litArcs: readonly [boolean, boolean, boolean] =
    lit ??
    (state === 'empty'
      ? [false, false, false]
      : state === 'registering'
        ? [registered >= 1, registered >= 2, registered >= 3]
        : [true, true, true]);
  const litCount = litArcs.filter(Boolean).length;

  // The gap closes (4° → 0) when the ring becomes "protected": the three arcs join into one line.
  const gap = useMotionValue(closed ? 0 : s.gapDeg);
  useEffect(() => {
    const target = closed ? 0 : s.gapDeg;
    if (reduce) {
      gap.set(target);
      return;
    }
    const controls = animate(gap, target, SPRING);
    return () => controls.stop();
  }, [closed, s.gapDeg, reduce, gap]);

  // One soft pulse per pulseKey increment (the countdown's last second landing). Never on mount.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pulseKey === 0 || reduce || !root.current) return;
    const controls = animate(
      root.current,
      { scale: [1, 1.04, 1] },
      { duration: DURATION.draw, ease: EASE_STANDARD },
    );
    return () => controls.stop();
  }, [pulseKey, reduce]);

  const tone: 'accent' | 'ok' | 'danger' | 'quiet' =
    state === 'success' ? 'ok' : state === 'revoked' ? 'danger' : state === 'counting' ? 'quiet' : 'accent';

  return (
    <div
      className={['kl2-ring', `kl2-ring--${state}`, className ?? ''].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? defaultLabel(state, litCount)}
      data-state={state}
      data-registered={litCount}
      ref={root}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="kl2-ring__svg"
        aria-hidden="true"
        focusable="false"
      >
        {/* Track: the three arcs at rest, hairline colour. */}
        {arcAngles(s.gapDeg).map((a) => (
          <path
            key={`track-${a.recoverer}`}
            d={arcPath(s.centre, s.r, a.start, a.end)}
            fill="none"
            strokeWidth={s.stroke}
            className="kl2-ring__track"
          />
        ))}
        <g className={tone === 'accent' ? 'kl2-ring__glow' : undefined}>
          {/* Seam cover for the closed ring: a full circle fades in under the joined arcs. */}
          <motion.path
            d={circlePath(s.centre, s.r)}
            fill="none"
            strokeWidth={s.stroke}
            className={`kl2-ring__arc kl2-ring__arc--${tone}`}
            initial={false}
            animate={{ opacity: closed ? 1 : 0 }}
            transition={reduce ? INSTANT : { ...FADE, delay: closed ? DURATION.move : 0 }}
          />
          {state === 'revoked'
            ? // Revoked is broken, not recoloured: dashed arcs read as "no longer in force" in any theme.
              arcAngles(s.gapDeg).map((a) => (
                <path
                  key={`revoked-${a.recoverer}`}
                  d={arcPath(s.centre, s.r, a.start, a.end)}
                  fill="none"
                  strokeWidth={s.stroke}
                  strokeDasharray={size >= 48 ? '4 4' : '2 2'}
                  className="kl2-ring__arc kl2-ring__arc--danger"
                />
              ))
            : null}
          {RECOVERERS.map((rec, i) => (
            <Arc
              key={rec}
              index={i}
              centre={s.centre}
              r={s.r}
              stroke={s.stroke}
              gap={gap}
              lit={state !== 'revoked' && (litArcs[i] ?? false)}
              tone={tone}
              reduce={reduce}
              onDrawn={onDrawn}
            />
          ))}
        </g>
        {state === 'counting' && size >= 48 ? (
          <>
            <path
              d={circlePath(s.centre, s.innerR)}
              fill="none"
              strokeWidth={s.innerStroke}
              className="kl2-ring__inner-track"
            />
            <path
              d={circlePath(s.centre, s.innerR)}
              fill="none"
              strokeWidth={s.innerStroke}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - Math.max(0, Math.min(1, progress))}
              className="kl2-ring__inner kl2-ring__glow"
            />
          </>
        ) : null}
      </svg>
      {children ? <div className="kl2-ring__centre">{children}</div> : null}
      <span className="kl2-sr">
        {detail ??
          RECOVERERS.map((rec, i) => `${RECOVERER_LABEL[rec]}: ${litArcs[i] ? 'yes' : 'not yet'}`).join(', ')}
      </span>
    </div>
  );
}

/** The success check, drawn in 220 ms. Used inside the ring (receipt) and by ActionButton. */
export function DrawnCheck({ size = 24, className }: { size?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={['kl2-check', className ?? ''].filter(Boolean).join(' ')}
    >
      <motion.path
        d="M5 12.5 L10 17.5 L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={reduce ? INSTANT : { duration: DURATION.check, ease: EASE_STANDARD }}
      />
    </svg>
  );
}
