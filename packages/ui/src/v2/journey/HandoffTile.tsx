'use client';

import { CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ActionButton } from '../ActionButton';
import { ProtectionRing } from '../ProtectionRing';
import { QrCode } from '../QrCode';
import { expiryClock, splitCode6, spokenCode6 } from './handoff';

export type HandoffState = 'idle' | 'starting' | 'waiting' | 'expired' | 'claimed' | 'protected';

export type HandoffTileCopy = {
  /** "Keyline" */
  eyebrow: string;
  /** "A wallet only you can spend from" */
  title: string;
  body: string;
  /** [P] "Set up Keyline on my phone" */
  start: string;
  /** "Scan with your phone’s camera, or open keyline.app/start and type this code:" */
  scan: string;
  /** QR accessible name, e.g. "QR code to continue on your phone" */
  qrLabel: string;
  /** (m:ss) => "Code expires in 4:52" */
  expiresIn: (clock: string) => string;
  /** "Waiting for your phone" */
  waiting: string;
  /** "Code expired" */
  expired: string;
  /** "Show a new code" */
  renew: string;
  /** "Phone connected" */
  claimed: string;
  /** "Continue on your phone. This page updates by itself." */
  claimedBody: string;
  /** "Protected · 2 of 3 recoverers" */
  protectedTitle: string;
};

export type HandoffTileProps = {
  state: HandoffState;
  copy: HandoffTileCopy;
  /** 6 digits from `POST /handoff`. Required in `waiting`. */
  code?: string;
  /** What the QR encodes (`qrUrl`). */
  qrValue?: string;
  /** Epoch ms (`expiresAt`). Drives the countdown in `waiting`. */
  expiresAt?: number;
  /** [P] in `idle`. */
  onStart?: () => void;
  /** In `expired`. */
  onRenew?: () => void;
  /** Fired once when the countdown reaches 0:00 in `waiting`. */
  onExpire?: () => void;
  /** Recoverers registered so far, mirrored from the phone while it onboards (0 → empty ring). */
  registered?: 0 | 1 | 2 | 3;
  /** Extra content in `protected`, e.g. the wallet balance and a link. */
  children?: ReactNode;
};

function useClock(active: boolean, expiresAt: number | undefined, onExpire?: () => void) {
  const [now, setNow] = useState<number | null>(null);
  const fired = useRef(false);
  const cb = useRef(onExpire);
  cb.current = onExpire;
  useEffect(() => {
    fired.current = false;
    if (!active || expiresAt === undefined) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= expiresAt && !fired.current) {
        fired.current = true;
        cb.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, expiresAt]);
  // null on the server render, so hydration agrees; the first effect fills it in.
  return now;
}

/**
 * The Keyline tile on Swissquote web — a true object (card). Ring, title, body; then by state:
 * the [P] to start; the QR + 6-digit code in two groups + expiry countdown + "Waiting for your phone";
 * expired with "Show a new code"; claimed ("Phone connected"); protected (closed ring + children).
 */
export function HandoffTile({
  state,
  copy,
  code,
  qrValue,
  expiresAt,
  onStart,
  onRenew,
  onExpire,
  registered = 0,
  children,
}: HandoffTileProps) {
  const titleId = useId();
  const now = useClock(state === 'waiting', expiresAt, onExpire);
  const groups = code ? splitCode6(code) : null;
  const ring =
    state === 'protected' ? (
      <ProtectionRing state="protected" size={64} />
    ) : registered > 0 ? (
      <ProtectionRing state="registering" registered={registered} size={64} />
    ) : (
      <ProtectionRing state="empty" size={64} />
    );

  return (
    <section className="kl2-tile" aria-labelledby={titleId} data-state={state}>
      <div className="kl2-tile__head">
        {ring}
        <div className="kl2-tile__titles">
          <span className="kl2-eyebrow">{copy.eyebrow}</span>
          <h2 id={titleId} className="kl2-tile__title">
            {state === 'protected' ? copy.protectedTitle : copy.title}
          </h2>
        </div>
      </div>
      {state !== 'protected' ? <p className="kl2-tile__body">{copy.body}</p> : null}

      {state === 'idle' || state === 'starting' ? (
        <ActionButton
          label={copy.start}
          status={state === 'starting' ? 'loading' : 'idle'}
          onClick={onStart}
          full
        />
      ) : null}

      {state === 'waiting' && groups ? (
        <div className="kl2-tile__handoff">
          {qrValue ? <QrCode value={qrValue} size={112} label={copy.qrLabel} /> : null}
          <div className="kl2-tile__codecol">
            <p className="kl2-tile__small">{copy.scan}</p>
            <span className="kl2-code6">
              <span aria-hidden="true">{groups[0]}</span>
              <span aria-hidden="true">{groups[1]}</span>
              <span className="kl2-sr">{spokenCode6(code ?? '')}</span>
            </span>
            <span className="kl2-tile__meta" aria-live="off">
              {expiresAt !== undefined && now !== null ? copy.expiresIn(expiryClock(expiresAt, now)) : ' '}
            </span>
          </div>
        </div>
      ) : null}

      {state === 'waiting' ? (
        <span className="kl2-status" role="status">
          <span className="kl2-status__dot" aria-hidden="true" />
          {copy.waiting}
        </span>
      ) : null}

      {state === 'expired' ? (
        <div className="kl2-tile__expired">
          <span className="kl2-status" role="status">
            {copy.expired}
          </span>
          <ActionButton label={copy.renew} variant="secondary" onClick={onRenew} />
        </div>
      ) : null}

      {state === 'claimed' ? (
        <div className="kl2-tile__claimed" role="status">
          <span className="kl2-status kl2-status--ok">
            <CheckCircle size={20} weight="fill" aria-hidden="true" />
            {copy.claimed}
          </span>
          <p className="kl2-tile__small">{copy.claimedBody}</p>
        </div>
      ) : null}

      {state === 'protected' ? children : null}
    </section>
  );
}
