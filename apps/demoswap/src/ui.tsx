import type { ReactNode } from 'react';
import { txUrl } from './constants';

export type Phase = 'idle' | 'pending' | 'ok' | 'error';

export type Outcome = {
  phase: Phase;
  /** What is happening / what came back, one sentence per line. */
  lines: string[];
  error?: { title: string; detail?: string };
  hash?: `0x${string}`;
};

export const IDLE: Outcome = { phase: 'idle', lines: [] };

const PHASE_STYLE: Record<Phase, string> = {
  idle: 'text-ink-3',
  pending: 'text-pending',
  ok: 'text-ok',
  error: 'text-danger',
};

export function ActionCard({
  n,
  title,
  description,
  sends,
  children,
  outcome,
  tag,
}: {
  n: number;
  title: string;
  description: ReactNode;
  sends: string;
  children: ReactNode;
  outcome: Outcome;
  tag?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-sheet border border-line bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <h2 className="m-0 text-16 font-semibold">
          <span className="mr-2 font-mono text-14 text-ink-3">{n}</span>
          {title}
        </h2>
        {tag}
      </header>
      <p className="m-0 text-14 text-ink-2">{description}</p>
      <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-all rounded-control bg-surface-2 px-3 py-2 font-mono text-12 text-ink-2">
        {sends}
      </pre>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <OutcomeView outcome={outcome} />
    </section>
  );
}

export function OutcomeView({ outcome }: { outcome: Outcome }) {
  if (outcome.phase === 'idle' && outcome.lines.length === 0) return null;
  return (
    <div className={`text-14 ${PHASE_STYLE[outcome.phase]}`} role="status" aria-live="polite">
      {outcome.lines.map((l) => (
        <p key={l} className="m-0 break-words">
          {l}
        </p>
      ))}
      {outcome.hash ? (
        <p className="m-0 break-all font-mono text-12">
          <a className="text-ink underline" href={txUrl(outcome.hash)} target="_blank" rel="noreferrer">
            {outcome.hash} ↗ Basescan
          </a>
        </p>
      ) : null}
      {outcome.error ? (
        <div className="mt-1 rounded-control bg-danger-bg px-3 py-2 text-danger">
          <p className="m-0 font-semibold">{outcome.error.title}</p>
          {outcome.error.detail ? <p className="m-0 break-words">{outcome.error.detail}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const look =
    variant === 'primary'
      ? 'bg-ink text-on-ink border-ink'
      : variant === 'danger'
        ? 'bg-surface text-danger border-danger'
        : 'bg-surface text-ink border-line-strong';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-10 cursor-pointer rounded-control border px-4 text-14 font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${look}`}
    >
      {children}
    </button>
  );
}
