'use client';

import { AnimatePresence, motion } from 'motion/react';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from 'react';
import { haptic } from './haptics';
import { FADE, INSTANT, SPRING } from './motion';
import { DrawnCheck } from './ProtectionRing';
import { useReducedMotion } from './reduced-motion';

/** `error` is a colour change only (no shake, no motion); pair it with a sentence next to the button. */
export type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

export type ActionButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'
> & {
  label: string;
  status?: ActionStatus;
  /** Announced (not shown) when the action succeeds, e.g. "Sent". */
  successLabel?: string;
  /** Announced (not shown) when status turns `error`, e.g. "Not sent". Defaults to nothing (the page's
   * own error sentence is usually the alert). */
  errorLabel?: string;
  /** `danger`: the confirm of an irreversible or destructive step (delete, cancel recovery). */
  variant?: 'primary' | 'secondary' | 'danger';
  full?: boolean;
  icon?: ReactNode;
};

/**
 * The one primary action. Pressed: scales to 0.98 on the spring. Loading: the label stays, a small
 * ring turns beside it, `aria-busy`. Success: the label folds to the centre and a check draws in its
 * place (220 ms), with a short vibration. Width never changes between states.
 */
export function ActionButton({
  label,
  status = 'idle',
  successLabel = 'Done',
  errorLabel,
  variant = 'primary',
  full = false,
  icon,
  className,
  disabled,
  type = 'button',
  ...rest
}: ActionButtonProps) {
  const reduce = useReducedMotion();
  const prev = useRef(status);
  useEffect(() => {
    if (status === 'success' && prev.current !== 'success') haptic('success');
    prev.current = status;
  }, [status]);

  const busy = status === 'loading';
  const success = status === 'success';
  return (
    <motion.button
      type={type}
      className={['kl2-action', `kl2-action--${variant}`, full ? 'kl2-action--full' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-status={status}
      whileTap={reduce || disabled || busy || success ? undefined : { scale: 0.98 }}
      transition={SPRING}
      {...rest}
    >
      {/* The label keeps the button's width in every state. */}
      <motion.span
        className="kl2-action__label"
        initial={false}
        animate={success ? { opacity: 0, scaleX: 0.2 } : { opacity: 1, scaleX: 1 }}
        transition={reduce ? INSTANT : { ...FADE, duration: 0.14 }}
      >
        {busy ? <span className="kl2-action__spinner" aria-hidden="true" /> : icon}
        {label}
      </motion.span>
      <AnimatePresence>
        {success ? (
          <motion.span
            key="check"
            className="kl2-action__check"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? INSTANT : FADE}
          >
            <DrawnCheck size={24} />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <span className="kl2-sr" aria-live="polite">
        {success ? successLabel : status === 'error' ? (errorLabel ?? '') : ''}
      </span>
    </motion.button>
  );
}
