'use client';

import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { FADE, INSTANT, SPRING } from './motion';

export type StackViewProps = {
  /** Identity of the current screen; changing it slides. */
  screenKey: string;
  /** 1 = push (new screen enters from the right), -1 = pop. */
  direction: 1 | -1;
  /** Shared header title — cross-fades, never slides. */
  title: string;
  onBack?: () => void;
  backLabel?: string;
  /** Right side of the shared header (one ghost icon button at most). */
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
};

const variants = {
  enter: (dir: 1 | -1) => ({ x: dir > 0 ? '100%' : '-24%', opacity: dir > 0 ? 1 : 0.6 }),
  centre: { x: '0%', opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: dir > 0 ? '-24%' : '100%', opacity: dir > 0 ? 0.6 : 1 }),
};

/**
 * Stack navigation: the header stays put (its title cross-fades), the content slides on the spring.
 * The incoming screen covers the outgoing one; the outgoing one moves a quarter and dims, like a page
 * turning under a hand. Reduced motion: content cross-fades only.
 */
export function StackView({
  screenKey,
  direction,
  title,
  onBack,
  backLabel = 'Back',
  trailing,
  children,
  className,
}: StackViewProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className={['kl2-stack', className ?? ''].filter(Boolean).join(' ')}>
      <header className="kl2-stack__head">
        <span className="kl2-stack__lead">
          {onBack ? (
            <button type="button" className="kl2-iconbtn" onClick={onBack} aria-label={backLabel}>
              <CaretLeft size={20} aria-hidden="true" />
            </button>
          ) : null}
        </span>
        <span className="kl2-stack__title-slot">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.h2
              key={title}
              className="kl2-stack__title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduce ? INSTANT : FADE}
            >
              {title}
            </motion.h2>
          </AnimatePresence>
        </span>
        <span className="kl2-stack__trail">{trailing}</span>
      </header>
      <div className="kl2-stack__viewport">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={screenKey}
            className="kl2-stack__screen"
            custom={direction}
            variants={
              reduce ? { enter: { opacity: 0 }, centre: { opacity: 1 }, exit: { opacity: 0 } } : variants
            }
            initial="enter"
            animate="centre"
            exit="exit"
            transition={reduce ? FADE : { x: SPRING, opacity: FADE }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
