'use client';

import { useEffect, useRef, useState } from 'react';
import { formatClock, formatDuration } from '../format';
import { haptic } from './haptics';
import { ProtectionRing } from './ProtectionRing';

export type ProtectionCountdownProps = {
  /** Exact end of the waiting period (ms epoch or Date) — read from the chain. */
  endsAt: Date | number;
  durationMs: number;
  /** Recoverers that confirmed (lit arcs). Default: Safety key + Swissquote. */
  lit?: readonly [boolean, boolean, boolean];
  size?: number;
  subLabel?: string;
  doneLabel?: string;
  onDone?: () => void;
};

/**
 * The recovery countdown as the protection ring in state `counting`: the inner stroke sweeps in real
 * time (one frame at a time, not 1 s steps); the time in the centre changes once per second; the last
 * second lands with one soft pulse and a short vibration. Reduced motion: the stroke steps per second.
 */
export function ProtectionCountdown({
  endsAt,
  durationMs,
  lit = [true, false, true],
  size = 200,
  subLabel = 'remaining',
  doneLabel = 'Ready to finish',
  onDone,
}: ProtectionCountdownProps) {
  const end = typeof endsAt === 'number' ? endsAt : endsAt.getTime();
  const [now, setNow] = useState<number | null>(null);
  const [pulse, setPulse] = useState(0);
  const fired = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      setNow(Date.now());
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    if (reduce) timer = setInterval(tick, 1000);
    tick();
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
    };
  }, []);

  const remaining = now === null ? durationMs : Math.max(0, end - now);
  const done = now !== null && remaining === 0;
  // Reset when the end moves (the demo replays the last seconds).
  useEffect(() => {
    if (end > Date.now()) fired.current = false;
  }, [end]);
  useEffect(() => {
    if (done && !fired.current) {
      fired.current = true;
      setPulse((p) => p + 1);
      haptic('success');
      onDone?.();
    }
  }, [done, onDone]);

  const big = size >= 160;
  return (
    <ProtectionRing
      state="counting"
      lit={lit}
      progress={durationMs > 0 ? remaining / durationMs : 0}
      size={size}
      pulseKey={pulse}
      label={done ? doneLabel : `${formatDuration(remaining)} remaining, finishes at ${formatClock(end)}`}
    >
      <span className={big ? 'kl2-ring__time' : 'kl2-ring__time kl2-ring__time--sm'} aria-hidden="true">
        {done ? '00:00' : formatDuration(Math.ceil(remaining / 1000) * 1000)}
      </span>
      {big ? (
        <span className="kl2-ring__sub" aria-hidden="true">
          {done ? doneLabel : subLabel}
        </span>
      ) : null}
    </ProtectionRing>
  );
}
