import { CaretDown, Info, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';
import { Button } from './Button';

/* ---------- EmptyState ---------- */

export type EmptyStateProps = {
  title: string;
  body?: ReactNode;
  /** A Button or link. */
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({ title, body, action, icon }: EmptyStateProps) {
  return (
    <div className="kl-empty">
      {icon ? <span className="kl-empty__icon">{icon}</span> : null}
      <p className="kl-empty__title">{title}</p>
      {body ? <p className="kl-empty__body">{body}</p> : null}
      {action ? <div className="kl-empty__action">{action}</div> : null}
    </div>
  );
}

/* ---------- Skeleton ---------- */

export type SkeletonProps = {
  kind?: 'row' | 'amount' | 'block' | 'line';
  /** Number of rows/lines (default 3 for rows, 1 otherwise). */
  count?: number;
  width?: number | string;
  height?: number;
};

/** Static `--surface-2` blocks in the shape of the content. No shimmer. */
export function Skeleton({ kind = 'line', count, width, height }: SkeletonProps) {
  const n = count ?? (kind === 'row' ? 3 : 1);
  const items = Array.from({ length: n }, (_, i) => i);
  if (kind === 'row') {
    return (
      <div className="kl-skel" aria-hidden="true">
        {items.map((i) => (
          <div key={i} className="kl-skel__row">
            <div style={{ flex: 1 }}>
              <span className="kl-skel__bar" style={{ width: '55%' }} />
              <span className="kl-skel__bar" style={{ width: '35%', height: 12 }} />
            </div>
            <div style={{ alignItems: 'flex-end' }}>
              <span className="kl-skel__bar" style={{ width: 88 }} />
              <span className="kl-skel__bar" style={{ width: 56, height: 12 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'amount') {
    return (
      <div className="kl-skel" aria-hidden="true">
        <span className="kl-skel__bar" style={{ width: 64, height: 12 }} />
        <span className="kl-skel__bar" style={{ width: width ?? 200, height: 44 }} />
        <span className="kl-skel__bar" style={{ width: 120, height: 16 }} />
      </div>
    );
  }
  if (kind === 'block') {
    return (
      <div className="kl-skel" aria-hidden="true">
        <span
          className="kl-skel__bar"
          style={{ width: width ?? '100%', height: height ?? 120, borderRadius: 'var(--radius-sheet)' }}
        />
      </div>
    );
  }
  return (
    <div className="kl-skel" aria-hidden="true">
      {items.map((i) => (
        <span
          key={i}
          className="kl-skel__bar"
          style={{ width: width ?? (i === n - 1 ? '60%' : '100%'), height: height ?? 16 }}
        />
      ))}
    </div>
  );
}

/* ---------- ErrorState ---------- */

export type ErrorStateProps = {
  title?: string;
  body: ReactNode;
  /** Shows a "Try again" secondary button. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Raw error text, collapsed under "Technical details". */
  detail?: string;
  /** Extra action(s) next to retry. */
  actions?: ReactNode;
};

/** Always a sentence that says what did and did not happen. Never a bare code. */
export function ErrorState({
  title = 'Something didn’t work',
  body,
  onRetry,
  retryLabel = 'Try again',
  detail,
  actions,
}: ErrorStateProps) {
  return (
    <div className="kl-error" role="alert">
      <p className="kl-error__title">
        <WarningCircle size={20} aria-hidden="true" />
        {title}
      </p>
      <p className="kl-error__body">{body}</p>
      {onRetry || actions ? (
        <div className="kl-error__actions">
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {actions}
        </div>
      ) : null}
      {detail ? (
        <Disclosure summary="Technical details">
          <pre className="kl-code">{detail}</pre>
        </Disclosure>
      ) : null}
    </div>
  );
}

/* ---------- Note ---------- */

export type NoteProps = {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/** Inline notice: 1 px border, icon + text. Danger is the only tone with a fill. */
export function Note({ tone = 'info', title, children, icon, className }: NoteProps) {
  const defaultIcon =
    tone === 'info' ? <Info size={20} aria-hidden="true" /> : <WarningCircle size={20} aria-hidden="true" />;
  return (
    <div
      className={['kl-note', tone !== 'info' ? `kl-note--${tone}` : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      role={tone === 'danger' ? 'alert' : 'note'}
    >
      <span className="kl-note__icon">{icon ?? defaultIcon}</span>
      <span>
        {title ? <span className="kl-note__title">{title}</span> : null}
        {children}
      </span>
    </div>
  );
}

/* ---------- Disclosure ---------- */

export type DisclosureProps = {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

/** "Technical details" pattern — native <details>, closed by default. */
export function Disclosure({ summary, children, defaultOpen = false }: DisclosureProps) {
  return (
    <details className="kl-disclosure" open={defaultOpen || undefined}>
      <summary>
        {summary}
        <span className="kl-disclosure__chev">
          <CaretDown size={16} aria-hidden="true" />
        </span>
      </summary>
      <div className="kl-disclosure__body">{children}</div>
    </details>
  );
}
