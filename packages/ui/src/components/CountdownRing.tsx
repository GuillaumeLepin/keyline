'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { formatClock, formatDuration } from '../format';

/**
 * A 1 s clock as an external store. The server snapshot is `null` so SSR and the hydrating client
 * render the same full ring; the real time arrives on the first client re-render — no hydration mismatch.
 */
function useClock(active: boolean): number | null {
  const now = useRef<number>(Date.now());
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => undefined;
      const t = setInterval(() => {
        now.current = Date.now();
        onChange();
      }, 1000);
      return () => clearInterval(t);
    },
    [active],
  );
  return useSyncExternalStore(
    subscribe,
    () => now.current,
    () => null,
  );
}

export type CountdownRingProps = {
  /** Exact end time (ms epoch or Date) — read from the chain, never computed client-side. */
  endsAt: Date | number;
  /** Total period in ms, used for the arc proportion (e.g. 3 min grace, 60 s cooling). */
  durationMs: number;
  /** Outer diameter in px (default 200). */
  size?: number;
  /** Small caption under the ring, e.g. the demo-acceleration sentence. */
  caption?: string;
  /** Word shown under the remaining time (default "remaining"). */
  subLabel?: string;
  /** Word under the centre once the countdown has finished (default "Ready to finish"); the centre itself reads 00:00. */
  doneLabel?: string;
  /** Show the "Finishes at HH:MM:SS" line under the ring (default true). Pass false when the screen title already states the time. */
  showFinish?: boolean;
  /** Translated finish line, e.g. FR `(t, done) => (done ? `Terminé à ${t}` : `Se termine à ${t}`)`. */
  finishText?: (clock: string, done: boolean) => string;
  onDone?: () => void;
  className?: string;
};

/**
 * The one signature animation. SVG arc driven by `stroke-dashoffset` with a 1 s linear CSS transition;
 * `prefers-reduced-motion` removes the tween (components.css). Always shows the exact finish time.
 */
export function CountdownRing({
  endsAt,
  durationMs,
  size = 200,
  caption,
  subLabel = 'remaining',
  doneLabel = 'Ready to finish',
  showFinish = true,
  finishText,
  onDone,
  className,
}: CountdownRingProps) {
  const end = typeof endsAt === 'number' ? endsAt : endsAt.getTime();
  const clock = useClock(true);
  // Before hydration completes the clock is null: show the full period rather than a server-side time.
  const remaining = clock === null ? durationMs : Math.max(0, end - clock);
  const done = clock !== null && remaining === 0;

  useEffect(() => {
    if (done) onDone?.();
  }, [done, onDone]);

  const stroke = Math.max(4, Math.round(size / 25));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = durationMs > 0 ? Math.min(1, remaining / durationMs) : 0;
  const offset = c * (1 - fraction);
  const remainingSize = size >= 160 ? 'var(--text-44)' : size >= 100 ? 'var(--text-28)' : 'var(--text-16)';
  const remainingLine =
    size >= 160 ? 'var(--leading-44)' : size >= 100 ? 'var(--leading-28)' : 'var(--leading-16)';

  return (
    <div
      className={['kl-ring', done ? 'kl-ring--done' : '', className ?? ''].filter(Boolean).join(' ')}
      role="timer"
      aria-live="polite"
      aria-label={
        done ? doneLabel : `${formatDuration(remaining)} remaining, finishes at ${formatClock(end)}`
      }
    >
      <div className="kl-ring__box" style={{ width: size, height: size }}>
        <svg
          className="kl-ring__svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <circle className="kl-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
          <circle
            className="kl-ring__arc"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="kl-ring__center">
          <span className="kl-ring__remaining" style={{ fontSize: remainingSize, lineHeight: remainingLine }}>
            {done ? '00:00' : formatDuration(remaining)}
          </span>
          {size >= 100 ? <span className="kl-ring__sub">{done ? doneLabel : subLabel}</span> : null}
        </div>
      </div>
      {showFinish ? (
        <p className="kl-ring__finish">
          {finishText
            ? finishText(formatClock(end), done)
            : done
              ? `Finished at ${formatClock(end)}`
              : `Finishes at ${formatClock(end)}`}
        </p>
      ) : null}
      {caption ? <p className="kl-ring__caption">{caption}</p> : null}
    </div>
  );
}
