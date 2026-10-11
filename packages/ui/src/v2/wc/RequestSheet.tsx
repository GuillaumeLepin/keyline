'use client';

import { Clock, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';
import { ActionButton } from '../ActionButton';
import { DrawnCheck, ProtectionRing } from '../ProtectionRing';
import { SheetV2 } from '../SheetV2';
import { DappIdentityRow, type DappIdentityRowProps } from './DappIdentityRow';

export type RequestSheetState = 'review' | 'pending' | 'success' | 'error' | 'expired' | 'refused';

export type RequestSheetCopy = {
  /** "Not now" — answers the app with a refusal. */
  decline: string;
  /** "Close" */
  close: string;
  /** "Try again" */
  retry: string;
  /** "This request expired" */
  expiredTitle: string;
  /** "{app} stopped waiting. Nothing was signed or sent. Ask the app to try again." */
  expiredBody: string;
};

export const REQUEST_SHEET_COPY: RequestSheetCopy = {
  decline: 'Not now',
  close: 'Close',
  retry: 'Try again',
  expiredTitle: 'This request expired',
  expiredBody: 'The app stopped waiting. Nothing was signed or sent. Ask the app to try again.',
};

export type RequestSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Sheet title — what is being asked, e.g. "Approve a transaction", "Sign in". */
  title: string;
  dapp: DappIdentityRowProps;
  state: RequestSheetState;
  /** The request's content (SiweSummary, MessageBlock, TypedDataRows, the review panel…). */
  children: ReactNode;
  /** [P] e.g. "Approve with Face ID", "Sign in", "Sign". Omit when the request cannot be approved (refused). */
  primaryLabel?: string;
  /** `danger` for a flagged request the person may still approve (unlimited permit). */
  primaryVariant?: 'primary' | 'danger';
  primaryDisabled?: boolean;
  onApprove?: () => void;
  onDecline: () => void;
  /** Under the button while `pending`, e.g. "Signed · Sent · Waiting for the block". */
  pendingLine?: string;
  /** `success`: the word under the ring ("Sent", "Signed", "Signed in") and one line ("The app has the result."). */
  successTitle?: string;
  successBody?: string;
  /** Announced (not shown) on success, e.g. "Signed". */
  successAnnounce?: string;
  /** `error`: what happened and what didn't ("Not sent. Nothing left your wallet."). */
  errorTitle?: string;
  errorBody?: string;
  copy?: Partial<RequestSheetCopy>;
  /** Extra action under the primary (e.g. "Approve with a transaction instead" on an EOA-only permit). */
  secondaryAction?: ReactNode;
};

/**
 * The one frame every dApp request uses: SheetV2, the app's identity row on top (who is asking), the
 * request content, one primary and `Not now`. States: review → pending (button loading, line below) →
 * success (the receipt treatment: closed --ok ring with a drawn check) or error (danger note, retry);
 * `expired` (the app stopped waiting) and `refused` (the request can't be approved: chain switch,
 * unsupported method) close with a single `Close`. Decline is always available until the result.
 */
export function RequestSheet({
  open,
  onClose,
  title,
  dapp,
  state,
  children,
  primaryLabel,
  primaryVariant = 'primary',
  primaryDisabled = false,
  onApprove,
  onDecline,
  pendingLine,
  successTitle,
  successBody,
  successAnnounce,
  errorTitle,
  errorBody,
  copy,
  secondaryAction,
}: RequestSheetProps) {
  const t = { ...REQUEST_SHEET_COPY, ...copy };
  const done = state === 'success';
  const ends = done || state === 'expired' || state === 'refused';
  return (
    <SheetV2 open={open} title={title} onClose={onClose} contained closeLabel={t.close}>
      <div className="kl2-req" data-state={state}>
        <DappIdentityRow {...dapp} />

        {done ? (
          <div className="kl2-req__result" role="status">
            <ProtectionRing state="success" size={64} label={successTitle}>
              <DrawnCheck size={24} />
            </ProtectionRing>
            {successTitle ? <p className="kl2-req__result-title">{successTitle}</p> : null}
            {successBody ? <p className="kl2-req__result-body">{successBody}</p> : null}
          </div>
        ) : state === 'expired' ? (
          <div className="kl2-req__result" role="status">
            <span className="kl2-req__glyph" aria-hidden="true">
              <Clock size={32} />
            </span>
            <p className="kl2-req__result-title">{t.expiredTitle}</p>
            <p className="kl2-req__result-body">{t.expiredBody}</p>
          </div>
        ) : (
          <div className="kl2-req__content" aria-busy={state === 'pending' || undefined}>
            {children}
          </div>
        )}

        {state === 'error' ? (
          <div className="kl-note kl-note--danger" role="alert">
            <span className="kl-note__icon">
              <WarningCircle size={20} aria-hidden="true" />
            </span>
            <span className="kl-note__body">
              {errorTitle ? <span className="kl-note__title">{errorTitle}</span> : null}
              {errorBody}
            </span>
          </div>
        ) : null}

        <div className="kl2-req__actions">
          {ends ? (
            <button type="button" className="kl-btn kl-btn--secondary kl-btn--full" onClick={onClose}>
              {t.close}
            </button>
          ) : (
            <>
              {primaryLabel ? (
                <ActionButton
                  label={state === 'error' ? t.retry : primaryLabel}
                  variant={primaryVariant}
                  status={state === 'pending' ? 'loading' : 'idle'}
                  successLabel={successAnnounce}
                  full
                  disabled={primaryDisabled}
                  onClick={onApprove}
                />
              ) : null}
              {state === 'pending' && pendingLine ? (
                <p className="kl2-req__pending" role="status">
                  {pendingLine}
                </p>
              ) : null}
              {secondaryAction}
              <button
                type="button"
                className="kl-btn kl-btn--ghost kl-btn--full"
                onClick={onDecline}
                disabled={state === 'pending'}
              >
                {t.decline}
              </button>
            </>
          )}
        </div>
      </div>
    </SheetV2>
  );
}
