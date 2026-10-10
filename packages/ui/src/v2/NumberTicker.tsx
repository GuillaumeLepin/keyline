'use client';

import { AnimatePresence, motion } from 'motion/react';
import { FADE, INSTANT, SPRING } from './motion';
import { useReducedMotion } from './reduced-motion';
import { digitOffsetPercent, tickerCells } from './ticker';

export type NumberTickerProps = {
  value: number;
  /** Formatter — always one of the package formatters (formatCHF, formatUSDC…). */
  format: (n: number) => string;
  className?: string;
};

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Amount changes roll digit by digit, like a mechanical counter (spring, ≈ 200 ms, no overshoot).
 * Separators and currency codes never move. Screen readers get the final string only.
 */
export function NumberTicker({ value, format, className }: NumberTickerProps) {
  const reduce = useReducedMotion();
  const text = format(value);
  if (reduce) {
    return <span className={['kl2-tick', className ?? ''].filter(Boolean).join(' ')}>{text}</span>;
  }
  const cells = tickerCells(text);
  return (
    <span className={['kl2-tick', className ?? ''].filter(Boolean).join(' ')}>
      <span className="kl2-sr">{text}</span>
      <span className="kl2-tick__cells" aria-hidden="true">
        <AnimatePresence initial={false} mode="popLayout">
          {cells.map((c) =>
            c.digit === null ? (
              <motion.span
                key={`${c.key}-${c.char}`}
                className="kl2-tick__static"
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE}
              >
                {c.char}
              </motion.span>
            ) : (
              <motion.span
                key={c.key}
                className="kl2-tick__cell"
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ ...SPRING, opacity: FADE }}
              >
                <span className="kl2-tick__ghost">0</span>
                <motion.span
                  className="kl2-tick__strip"
                  initial={false}
                  animate={{ y: digitOffsetPercent(c.digit) }}
                  transition={reduce ? INSTANT : SPRING}
                >
                  {DIGITS.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </motion.span>
              </motion.span>
            ),
          )}
        </AnimatePresence>
      </span>
    </span>
  );
}
