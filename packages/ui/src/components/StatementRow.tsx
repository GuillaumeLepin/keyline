import { CaretRight, CheckCircle, Clock, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';

export type StatementRowStatus = 'ok' | 'pending' | 'danger';

export type StatementRowProps = {
  label: ReactNode;
  /** Secondary line: date, status word, counterparty… */
  meta?: ReactNode;
  /** Right column, primary line (already formatted, e.g. `− 25.00 USDC`). */
  amount?: ReactNode;
  /** Right column, secondary line (e.g. `CHF 20.00`). */
  amountSub?: ReactNode;
  status?: StatementRowStatus;
  /** Adds the status icon + word to the meta line. */
  statusWord?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Show a chevron on pressable rows (default true). */
  chevron?: boolean;
};

const statusIcon: Record<StatementRowStatus, ReactNode> = {
  ok: <CheckCircle size={14} aria-hidden="true" />,
  pending: <Clock size={14} aria-hidden="true" />,
  danger: <WarningCircle size={14} aria-hidden="true" />,
};

/**
 * Lists, not cards. Hairline separators, 56 px minimum, amount right-aligned and tabular.
 */
export function StatementRow({
  label,
  meta,
  amount,
  amountSub,
  status,
  statusWord,
  icon,
  href,
  onClick,
  chevron = true,
}: StatementRowProps) {
  const pressable = Boolean(href || onClick);
  const classes = [
    'kl-row',
    pressable ? 'kl-row--pressable' : '',
    status === 'pending' ? 'kl-row--pending' : '',
    status === 'danger' ? 'kl-row--danger' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      {icon ? <span className="kl-row__icon">{icon}</span> : null}
      <span className="kl-row__main">
        <span className="kl-row__label">{label}</span>
        {meta || statusWord ? (
          <span className="kl-row__meta">
            {meta}
            {statusWord && status ? (
              <>
                {meta ? <span aria-hidden="true">·</span> : null}
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  className={`kl-chip--${status === 'danger' ? 'danger' : status}`}
                >
                  {statusIcon[status]}
                  {statusWord}
                </span>
              </>
            ) : null}
          </span>
        ) : null}
      </span>
      {amount !== undefined ? (
        <span className="kl-row__amount">
          <span className="kl-row__amount-main">{amount}</span>
          {amountSub !== undefined ? <span className="kl-row__amount-sub">{amountSub}</span> : null}
        </span>
      ) : null}
      {pressable && chevron ? (
        <span className="kl-row__chevron">
          <CaretRight size={16} aria-hidden="true" />
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <a className={classes} href={href}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
