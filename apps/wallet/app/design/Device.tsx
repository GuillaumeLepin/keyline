import type { ReactNode } from 'react';

/** 390×844 phone, drawn for the proposal page only (the app's PhoneFrame is unchanged). */
export function Phone({
  persona,
  personaTone,
  children,
  label,
  time = '14:32',
}: {
  time?: string;
  persona: string;
  personaTone?: 'new';
  children: ReactNode;
  label: string;
}) {
  return (
    <figure className="dz-phone" aria-label={label}>
      <div className="dz-phone__screen">
        <div className="dz-status" aria-hidden="true">
          <span>{time}</span>
          <span className="dz-status__right">
            <span>5G</span>
            <span className="dz-battery" />
          </span>
        </div>
        <div
          className={['dz-persona', personaTone === 'new' ? 'dz-persona--new' : ''].filter(Boolean).join(' ')}
        >
          {persona}
        </div>
        <div className="dz-phone__body">{children}</div>
      </div>
    </figure>
  );
}

export function Browser({ url, children, label }: { url: ReactNode; children: ReactNode; label: string }) {
  return (
    <div className="dz-laptop-scroll">
      <figure className="dz-browser" aria-label={label}>
        <div className="dz-browser__bar" aria-hidden="true">
          <span className="dz-browser__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="dz-browser__url">{url}</span>
        </div>
        {children}
      </figure>
    </div>
  );
}

export function Stepper({ label, current, total }: { label: string; current: number; total: number }) {
  return (
    <div className="dz-stepper">
      <span className="dz-eyebrow">{label}</span>
      <span className="dz-stepper__track" style={{ ['--n' as string]: total }} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: positional track
            key={i}
            data-done={i + 1 < current || undefined}
            data-current={i + 1 === current || undefined}
          />
        ))}
      </span>
    </div>
  );
}
