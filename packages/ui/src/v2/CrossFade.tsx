'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { FADE, INSTANT } from './motion';

export type CrossFadeProps = {
  /** Change this key to cross-fade (e.g. 'loading' → 'ready'). */
  stateKey: string;
  children: ReactNode;
  className?: string;
};

/**
 * Skeleton → content (and any other in-place swap): the two overlap in one grid cell and cross-fade
 * in 180 ms, so the layout never jumps. Skeletons must already have the content's exact shape.
 */
export function CrossFade({ stateKey, children, className }: CrossFadeProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className={['kl2-xfade', className ?? ''].filter(Boolean).join(' ')}>
      <AnimatePresence initial={false}>
        <motion.div
          key={stateKey}
          className="kl2-xfade__layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? INSTANT : FADE}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
