'use client';

import { Camera, ClipboardText, QrCode, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';
import { useId } from 'react';
import { ActionButton } from '../ActionButton';

export type ConnectPanelState = 'idle' | 'invalid' | 'scanning' | 'camera-denied' | 'pairing' | 'expired';

export type ConnectPanelCopy = {
  /** "Connect to an app" */
  title: string;
  /** "On the app's website choose WalletConnect, then copy its link or show its QR code." */
  body: string;
  /** "WalletConnect link" */
  fieldLabel: string;
  /** "wc:…" */
  placeholder: string;
  paste: string;
  scan: string;
  /** "Stop scanning" */
  stopScan: string;
  /** [P] "Connect" */
  connect: string;
  /** "Connecting…" (announced while pairing) */
  connecting: string;
  /** "Waiting for the app…" under the button while pairing */
  pairingLine: string;
  /** "This isn’t a WalletConnect link. It starts with wc:" */
  invalid: string;
  /** "Point the camera at the app's QR code." */
  scanHint: string;
  /** "Camera access is off" */
  cameraDeniedTitle: string;
  /** "Paste the link instead, or allow the camera for this site in your browser settings." */
  cameraDeniedBody: string;
  /** "This link has expired. Ask the app for a new one." */
  expired: string;
};

export const CONNECT_PANEL_COPY: ConnectPanelCopy = {
  title: 'Connect to an app',
  body: 'On the app’s website choose WalletConnect, then copy its link or show its QR code.',
  fieldLabel: 'WalletConnect link',
  placeholder: 'wc:…',
  paste: 'Paste',
  scan: 'Scan QR code',
  stopScan: 'Stop scanning',
  connect: 'Connect',
  connecting: 'Connecting…',
  pairingLine: 'Waiting for the app to answer…',
  invalid: 'This isn’t a WalletConnect link. It starts with wc:',
  scanHint: 'Point the camera at the app’s QR code.',
  cameraDeniedTitle: 'Camera access is off',
  cameraDeniedBody: 'Paste the link instead, or allow the camera for this site in your browser settings.',
  expired: 'This link has expired. Ask the app for a new one.',
};

export type ConnectPanelProps = {
  state: ConnectPanelState;
  value: string;
  onChange: (v: string) => void;
  onConnect: () => void;
  onPaste?: () => void;
  onScan?: () => void;
  onStopScan?: () => void;
  /** The camera view while `scanning` (the wallet owns the decoder). */
  scanner?: ReactNode;
  copy?: Partial<ConnectPanelCopy>;
};

/**
 * Connect: paste a `wc:` link or scan the app's QR. One primary (`Connect`), the two ways in as
 * equal secondaries; the camera being refused is a calm note that points back to pasting, never a dead end.
 */
export function ConnectPanel({
  state,
  value,
  onChange,
  onConnect,
  onPaste,
  onScan,
  onStopScan,
  scanner,
  copy,
}: ConnectPanelProps) {
  const t = { ...CONNECT_PANEL_COPY, ...copy };
  const id = useId();
  const errId = `${id}-err`;
  const pairing = state === 'pairing';
  const error = state === 'invalid' ? t.invalid : state === 'expired' ? t.expired : undefined;
  return (
    <section className="kl2-connect" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="kl2-connect__title">
        {t.title}
      </h2>
      <p className="kl2-connect__body">{t.body}</p>

      {state === 'scanning' ? (
        <div className="kl2-connect__scan">
          <div className="kl2-connect__viewport">{scanner ?? <QrCode size={48} aria-hidden="true" />}</div>
          <p className="kl2-connect__hint">{t.scanHint}</p>
          <button type="button" className="kl2-textbtn" onClick={onStopScan}>
            {t.stopScan}
          </button>
        </div>
      ) : null}

      {state === 'camera-denied' ? (
        <div className="kl-note kl-note--warn" role="note">
          <span className="kl-note__icon">
            <Camera size={20} aria-hidden="true" />
          </span>
          <span className="kl-note__body">
            <span className="kl-note__title">{t.cameraDeniedTitle}</span>
            {t.cameraDeniedBody}
          </span>
        </div>
      ) : null}

      <div className={['kl-field', error ? 'kl-field--error' : ''].filter(Boolean).join(' ')}>
        <label className="kl-field__label" htmlFor={id}>
          {t.fieldLabel}
        </label>
        <div className="kl-field__control">
          <input
            id={id}
            className="kl-field__input kl-field__input--mono"
            value={value}
            placeholder={t.placeholder}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={pairing}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
          />
        </div>
        {error ? (
          <p id={errId} className="kl-field__error">
            <WarningCircle size={14} aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </div>

      <div className="kl2-connect__ways">
        <button type="button" className="kl-btn kl-btn--secondary" onClick={onPaste} disabled={pairing}>
          <ClipboardText size={20} aria-hidden="true" />
          {t.paste}
        </button>
        <button
          type="button"
          className="kl-btn kl-btn--secondary"
          onClick={onScan}
          disabled={pairing || state === 'scanning'}
        >
          <QrCode size={20} aria-hidden="true" />
          {t.scan}
        </button>
      </div>

      <div className="kl2-connect__go">
        <ActionButton
          label={pairing ? t.connecting : t.connect}
          status={pairing ? 'loading' : 'idle'}
          full
          disabled={!value.trim() || state === 'invalid' || state === 'expired'}
          onClick={onConnect}
        />
        {pairing ? (
          <p className="kl2-connect__pairing" role="status">
            {t.pairingLine}
          </p>
        ) : null}
      </div>
    </section>
  );
}
