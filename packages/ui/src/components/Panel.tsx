import type { ReactNode } from 'react';

export type PanelRow = {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'em' | 'danger' | 'ok';
};

export type PanelProps = {
  /** Eyebrow title, e.g. "What will happen". */
  title?: string;
  rows: PanelRow[];
  /** Footnote under a hairline, e.g. "This can’t be undone." */
  footnote?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
};

/** Label/value list on a 10 px sheet. Values are tabular and right-aligned. */
export function Panel({ title, rows, footnote, tone = 'default', className }: PanelProps) {
  return (
    <section
      className={['kl-panel', tone === 'danger' ? 'kl-panel--danger' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      {title ? <h3 className="kl-panel__title">{title}</h3> : null}
      <dl className="kl-panel__rows">
        {rows.map((r, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            key={i}
            className="kl-panel__row"
          >
            <dt className="kl-panel__label">{r.label}</dt>
            <dd
              className={[
                'kl-panel__value',
                r.tone && r.tone !== 'default' ? `kl-panel__value--${r.tone}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      {footnote ? <p className="kl-panel__foot">{footnote}</p> : null}
    </section>
  );
}
