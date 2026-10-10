'use client';

import { CheckCircle, Key, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { useId } from 'react';
import { ActionButton } from '../ActionButton';

export type ConfirmPromptState = 'ask' | 'confirming' | 'done' | 'already' | 'error';

export type ConfirmPromptCopy = {
  /** "Request from your phone" */
  context: string;
  /** "Make this computer your Safety key?" */
  title: string;
  body: string;
  /** "It can" */
  canTitle: string;
  can: readonly string[];
  /** "It can’t" */
  cannotTitle: string;
  cannot: readonly string[];
  /** [P] "Make this computer my Safety key" */
  confirm: string;
  /** "Not now" */
  decline: string;
  /** Announced on success, e.g. "Safety key added" */
  confirmed: string;
  /** "This computer is your Safety key" */
  doneTitle: string;
  doneBody: string;
  /** "This computer is already your Safety key" */
  alreadyTitle: string;
  alreadyBody: string;
  /** "The Safety key wasn’t added" */
  errorTitle: string;
  errorBody: string;
  /** "Try again" */
  retry: string;
};

export type ConfirmPromptProps = {
  state: ConfirmPromptState;
  copy: ConfirmPromptCopy;
  onConfirm: () => void;
  onDecline?: () => void;
};

/**
 * The laptop's one-confirmation panel (SPEC §10 F0.5): a true object with a key mark, what the
 * Safety key can and can’t do, one primary and a quiet "Not now". One click, nothing to type.
 */
export function ConfirmPrompt({ state, copy, onConfirm, onDecline }: ConfirmPromptProps) {
  const titleId = useId();
  if (state === 'done' || state === 'already') {
    const title = state === 'done' ? copy.doneTitle : copy.alreadyTitle;
    const body = state === 'done' ? copy.doneBody : copy.alreadyBody;
    return (
      <section className="kl2-confirm" aria-labelledby={titleId} data-state={state}>
        <span className="kl2-status kl2-status--ok" role="status">
          <CheckCircle size={20} weight="fill" aria-hidden="true" />
          <span id={titleId} className="kl2-confirm__title">
            {title}
          </span>
        </span>
        <p className="kl2-confirm__body">{body}</p>
      </section>
    );
  }
  return (
    <section className="kl2-confirm" aria-labelledby={titleId} data-state={state}>
      <div className="kl2-confirm__head">
        <span className="kl2-confirm__mark" aria-hidden="true">
          <Key size={20} />
        </span>
        <div className="kl2-confirm__titles">
          <span className="kl2-eyebrow">{copy.context}</span>
          <h2 id={titleId} className="kl2-confirm__title">
            {copy.title}
          </h2>
        </div>
      </div>
      <p className="kl2-confirm__body">{copy.body}</p>
      <div className="kl2-confirm__lists">
        <div>
          <h3 className="kl2-confirm__listhead">{copy.canTitle}</h3>
          <ul className="kl2-confirm__list">
            {copy.can.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="kl2-confirm__listhead">{copy.cannotTitle}</h3>
          <ul className="kl2-confirm__list">
            {copy.cannot.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
      {state === 'error' ? (
        <div className="kl2-confirm__error" role="alert">
          <WarningCircle size={20} weight="fill" aria-hidden="true" />
          <span>
            <strong>{copy.errorTitle}</strong> {copy.errorBody}
          </span>
        </div>
      ) : null}
      <div className="kl2-confirm__actions">
        <ActionButton
          label={state === 'error' ? copy.retry : copy.confirm}
          status={state === 'confirming' ? 'loading' : 'idle'}
          successLabel={copy.confirmed}
          onClick={onConfirm}
        />
        {onDecline && state !== 'confirming' ? (
          <button type="button" className="kl2-textbtn" onClick={onDecline}>
            {copy.decline}
          </button>
        ) : null}
      </div>
    </section>
  );
}
