'use client';

import { contrastRatio } from '@keyline/ui';
import { type RefObject, useEffect, useState } from 'react';

const SURFACES = ['bg', 'surface', 'surface-2', 'line', 'line-strong'] as const;
const TEXT = ['ink', 'ink-2', 'ink-3', 'accent-text', 'ok', 'pending', 'danger', 'simulated-text'] as const;
const MARKS = ['ring-arc', 'accent'] as const;

const TYPE = [
  { cls: 'dz-amount', spec: '44 / 48 · 600 · −0.025em', sample: 'CHF 1’234.50' },
  { cls: 'dz-t28', spec: '28 / 32 · 600 · −0.015em', sample: 'Access restores at 14:35:12' },
  { cls: 'dz-t20', spec: '20 / 28 · 600', sample: 'Why can’t I move Bitcoin?' },
  {
    cls: 'dz-body',
    spec: '16 / 24 · 400 · ≤ 65 ch',
    sample: 'Any 2 of your 3 recoverers can restore access after a waiting period you will see.',
  },
  { cls: 'dz-small', spec: '14 / 20 · 400 · 600', sample: 'Network fee paid by Swissquote' },
  { cls: 'dz-meta', spec: '12 / 16 · 400', sample: '10 Oct 2026, 14:32 · Confirmed' },
];

export function TokensLab({ scope, themeKey }: { scope: RefObject<HTMLElement | null>; themeKey: string }) {
  const [values, setValues] = useState<Record<string, string>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeKey is the trigger to re-read computed tokens
  useEffect(() => {
    const el = scope.current;
    if (!el) return;
    const read = () => {
      const cs = getComputedStyle(el);
      const next: Record<string, string> = {};
      for (const t of [...SURFACES, ...TEXT, ...MARKS]) next[t] = cs.getPropertyValue(`--${t}`).trim();
      setValues(next);
    };
    // Wait one frame so the new data-theme has been applied.
    const raf = requestAnimationFrame(read);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener('change', read);
    };
  }, [scope, themeKey]);

  const bg = values.bg ?? '#f7f6f3';
  const ratio = (fg?: string) => (fg?.startsWith('#') ? `${contrastRatio(fg, bg).toFixed(2)}:1` : '—');

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <div className="dz-labgrid">
        <section className="dz-lab">
          <h3 className="dz-h3">Surfaces and hairlines</h3>
          <div className="dz-list">
            {SURFACES.map((t) => (
              <div key={t} className="dz-row dz-row--icon">
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: `var(--${t})`,
                    border: '1px solid var(--line)',
                  }}
                />
                <span className="dz-row__label">--{t}</span>
                <span className="dz-row__end dz-label">{values[t]}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="dz-lab">
          <h3 className="dz-h3">Text on paper</h3>
          <div className="dz-list">
            {TEXT.map((t) => (
              <div key={t} className="dz-row dz-row--icon">
                <span style={{ color: `var(--${t})`, fontWeight: 600 }}>Aa</span>
                <span className="dz-row__label" style={{ color: `var(--${t})` }}>
                  --{t}
                </span>
                <span className="dz-row__end dz-label">
                  {values[t]} · {ratio(values[t])}
                </span>
              </div>
            ))}
            {MARKS.map((t) => (
              <div key={t} className="dz-row dz-row--icon">
                <span style={{ width: 24, height: 4, background: `var(--${t})` }} />
                <span className="dz-row__label">--{t} (mark, ≥ 3:1)</span>
                <span className="dz-row__end dz-label">
                  {values[t]} · {ratio(values[t])}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="dz-lab">
        <h3 className="dz-h3">
          {'Type · Hanken Grotesk (UI, tabular figures) + JetBrains Mono (addresses, hashes)'}
        </h3>
        <div className="dz-list">
          {TYPE.map((t) => (
            <div key={t.spec} className="dz-row">
              <span className={t.cls}>{t.sample}</span>
              <span className="dz-row__end dz-label">{t.spec}</span>
            </div>
          ))}
          <div className="dz-row">
            <span className="kl-mono" style={{ fontSize: 'var(--text-14)' }}>
              0x12AB 4c5d 6E7f 8091 a2B3 c4D5 e6F7 0819 2A3b 9F3C
            </span>
            <span className="dz-row__end dz-label">Mono 14 / 20 · zero</span>
          </div>
        </div>
      </section>
    </div>
  );
}
