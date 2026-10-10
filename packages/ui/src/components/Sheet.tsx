'use client';

import { X } from '@phosphor-icons/react/dist/ssr';
import { type ReactNode, useEffect, useRef } from 'react';
import { Button } from './Button';

export type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Translated accessible name of the close controls (default "Close"). */
  closeLabel?: string;
  children: ReactNode;
  /** Render inline (no backdrop, no fixed positioning) — used by /design. */
  inline?: boolean;
};

/**
 * Bottom sheet in the phone, centred modal on desk. The only element allowed a shadow.
 * Escape and the backdrop close it; focus moves to the panel on open.
 */
export function Sheet({ open, title, onClose, children, inline = false, closeLabel = 'Close' }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || inline) return;
    panel.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, inline, onClose]);

  if (!open) return null;

  return (
    <div className={['kl-sheet', inline ? 'kl-sheet--inline' : ''].filter(Boolean).join(' ')}>
      {inline ? null : (
        <button
          type="button"
          className="kl-sheet__backdrop"
          aria-label={closeLabel}
          tabIndex={-1}
          onClick={onClose}
        />
      )}
      <div
        ref={panel}
        className="kl-sheet__panel"
        role="dialog"
        aria-modal={inline ? undefined : true}
        aria-label={title}
        tabIndex={-1}
      >
        <div className="kl-sheet__head">
          <h2 className="kl-sheet__title">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={closeLabel}
            onClick={onClose}
            icon={<X size={20} aria-hidden="true" />}
          />
        </div>
        {children}
      </div>
    </div>
  );
}
