import type { ReactNode } from 'react';

export type StatusStepState = 'done' | 'active' | 'todo' | 'failed';

export type StatusStep = {
  label: ReactNode;
  state: StatusStepState;
  /** Right-aligned meta: a time, a block number, a tx link. */
  meta?: ReactNode;
};

export type StatusSequenceProps = {
  steps: StatusStep[];
  className?: string;
};

/** Signed → Sent → In block 6’812’334 → Confirmed. Vertical, hairline connectors, no animation. */
export function StatusSequence({ steps, className }: StatusSequenceProps) {
  return (
    <ol className={['kl-seq', className ?? ''].filter(Boolean).join(' ')}>
      {steps.map((s, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: sequence is positional
          key={i}
          className={`kl-seq__item kl-seq__item--${s.state}`}
          aria-current={s.state === 'active' ? 'step' : undefined}
        >
          <span className="kl-seq__dot" aria-hidden="true" />
          <span className="kl-seq__label">{s.label}</span>
          <span className="kl-seq__meta">{s.meta}</span>
        </li>
      ))}
    </ol>
  );
}
