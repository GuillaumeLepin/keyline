'use client';

import { X } from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, type PanInfo, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { FADE, INSTANT, SPRING } from './motion';

export type SheetV2Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Positioned inside the nearest positioned ancestor (the phone screen) instead of the viewport. */
  contained?: boolean;
};

/**
 * Bottom sheet: the scrim fades (180 ms), the panel rises on the spring. Escape, the scrim, the close
 * button or a downward drag (> 96 px or a flick) close it. Focus moves into the panel and back to the
 * opener on close. The only surface with a shadow.
 */
export function SheetV2({ open, title, onClose, children, contained = false }: SheetV2Props) {
  const reduce = useReducedMotion() ?? false;
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 96 || info.velocity.y > 600) onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className={['kl2-sheet', contained ? 'kl2-sheet--contained' : ''].filter(Boolean).join(' ')}>
          <motion.button
            type="button"
            className="kl2-sheet__scrim"
            aria-label="Close"
            tabIndex={-1}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? INSTANT : FADE}
          />
          <motion.div
            ref={panel}
            className="kl2-sheet__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={reduce ? FADE : SPRING}
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <span className="kl2-sheet__grip" aria-hidden="true" />
            <div className="kl2-sheet__head">
              <h2 id={titleId} className="kl2-sheet__title">
                {title}
              </h2>
              <button type="button" className="kl2-iconbtn" onClick={onClose} aria-label="Close">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="kl2-sheet__body">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
