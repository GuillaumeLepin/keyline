import { CheckCircle, Clock, XCircle } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';

export type KeyCardStatus = 'active' | 'pending' | 'revoked';

export type KeyCardProps = {
  /** "Phone key", "Safety key", "Emergency card", "Swissquote". */
  name: string;
  /** Where it lives: "This phone", "Lea’s laptop", "On paper, with you", "Swiss data centre". */
  where: string;
  /** What it can do. */
  can: string;
  /** What it cannot do — rendered after an em dash. */
  cannot?: string;
  icon?: ReactNode;
  status?: KeyCardStatus;
  /** Overrides the status word (e.g. "Confirmed 14:30:12", "Waiting for your laptop"). */
  statusWord?: string;
  /** Inline badges after the name (e.g. <SimulatedBadge/>). */
  nameTrailing?: ReactNode;
  /** Optional action rendered under the text (a Button or a link). */
  action?: ReactNode;
};

const statusDefaults: Record<KeyCardStatus, { word: string; icon: ReactNode }> = {
  active: { word: 'Active', icon: <CheckCircle size={14} aria-hidden="true" /> },
  pending: { word: 'Pending', icon: <Clock size={14} aria-hidden="true" /> },
  revoked: { word: 'Removed', icon: <XCircle size={14} aria-hidden="true" /> },
};

/** Key name · where it lives · what it can (and cannot) do. A row, not a card with a shadow. */
export function KeyCard({
  name,
  where,
  can,
  cannot,
  icon,
  status = 'active',
  statusWord,
  nameTrailing,
  action,
}: KeyCardProps) {
  const s = statusDefaults[status];
  return (
    <div
      className={[
        'kl-key',
        status === 'pending' ? 'kl-key--pending' : '',
        status === 'revoked' ? 'kl-key--revoked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="kl-key__icon">{icon}</span>
      <span className="kl-key__name">
        {name}
        {nameTrailing}
      </span>
      <div className="kl-key__body">
        <span className="kl-key__where">{where}</span>
        <span className="kl-key__can">
          {can}
          {cannot ? <span className="kl-key__cannot">{cannot}</span> : null}
        </span>
      </div>
      <span className={`kl-key__status kl-key__status--${status}`}>
        {s.icon}
        {statusWord ?? s.word}
      </span>
      {action ? <div className="kl-key__action">{action}</div> : null}
    </div>
  );
}
