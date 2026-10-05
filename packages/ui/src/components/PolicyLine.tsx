import { CheckCircle, Hourglass, Laptop, Prohibit } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';

export type PolicyVerdict = 'ok' | 'step-up' | 'cooling' | 'block';

export type PolicyLineProps = {
  verdict: PolicyVerdict;
  /** The word is fixed per verdict unless overridden (Approved / Needs your laptop / Waiting period / Blocked). */
  word?: string;
  reason: ReactNode;
  detail?: ReactNode;
  /** Trailing inline element, e.g. <SimulatedBadge/> for the seeded sanctions hit. */
  trailing?: ReactNode;
  className?: string;
};

const defaults: Record<PolicyVerdict, { word: string; icon: ReactNode }> = {
  ok: { word: 'Approved', icon: <CheckCircle size={20} aria-hidden="true" /> },
  'step-up': { word: 'Needs your laptop', icon: <Laptop size={20} aria-hidden="true" /> },
  cooling: { word: 'Waiting period', icon: <Hourglass size={20} aria-hidden="true" /> },
  block: { word: 'Blocked', icon: <Prohibit size={20} aria-hidden="true" /> },
};

/** Policy verdict as icon AND word AND reason — never colour alone. */
export function PolicyLine({ verdict, word, reason, detail, trailing, className }: PolicyLineProps) {
  const d = defaults[verdict];
  return (
    <div
      className={['kl-policy', `kl-policy--${verdict}`, className ?? ''].filter(Boolean).join(' ')}
      role="status"
    >
      <span className="kl-policy__icon">{d.icon}</span>
      <span>
        <span className="kl-policy__word">{word ?? d.word}</span>
        <span className="kl-policy__reason"> · {reason}</span>
        {trailing ? <> {trailing}</> : null}
        {detail ? <span className="kl-policy__detail">{detail}</span> : null}
      </span>
    </div>
  );
}
