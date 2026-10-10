'use client';

import { ActionButton, DrawnCheck, ProtectionRing, type ProtectionRingProps } from '@keyline/ui';
import { useEffect, useRef, useState } from 'react';
import { page } from './copy';

type Cell = { name: string; props: Omit<ProtectionRingProps, 'size'>; centre?: 'check' | 'time' };

const CELLS: Cell[] = [
  { name: page.ring.states.empty, props: { state: 'empty' } },
  { name: page.ring.states.r1, props: { state: 'registering', registered: 1 } },
  { name: page.ring.states.r2, props: { state: 'registering', registered: 2 } },
  { name: page.ring.states.r3, props: { state: 'registering', registered: 3 } },
  { name: page.ring.states.protected, props: { state: 'protected' } },
  {
    name: page.ring.states.counting,
    props: { state: 'counting', lit: [true, false, true], progress: 0.62 },
    centre: 'time',
  },
  { name: page.ring.states.success, props: { state: 'success' }, centre: 'check' },
  { name: page.ring.states.revoked, props: { state: 'revoked' } },
];

/** Demo timer standing in for the three on-chain events (documented in DESIGN.md §5). */
export function useProtectSequence(stepMs = 700) {
  const [step, setStep] = useState(0); // 0 idle, 1 signing, 2..4 arcs 1..3, 5 protected
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => {
    const list = timers;
    return () => {
      for (const t of list.current) clearTimeout(t);
    };
  }, []);
  const play = () => {
    clear();
    setStep(1);
    for (let i = 2; i <= 5; i++) timers.current.push(setTimeout(() => setStep(i), stepMs * (i - 1)));
  };
  const reset = () => {
    clear();
    setStep(0);
  };
  return { step, play, reset };
}

export function RingLab() {
  const { step, play } = useProtectSequence();
  const registered = Math.max(0, Math.min(3, step - 1)) as 0 | 1 | 2 | 3;
  const done = step === 5;
  return (
    <>
      <div className="dz-play">
        <ProtectionRing
          state={done ? 'protected' : registered === 0 ? 'empty' : 'registering'}
          registered={registered}
          size={200}
        >
          {done ? <DrawnCheck size={40} /> : <span className="dz-t28">{registered} of 3</span>}
        </ProtectionRing>
        <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
          <ol className="dz-seq" aria-live="polite">
            {page.ring.sequence.map((s, i) => (
              <li key={s} data-on={step > i || undefined}>
                <span className="dz-seq__dot" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ol>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <ActionButton
              label={step === 0 ? page.ring.play : page.ring.replay}
              variant="secondary"
              onClick={play}
              data-testid="ring-play"
            />
            <ProtectionRing state={done ? 'protected' : 'registering'} registered={registered} size={24} />
            <ProtectionRing state={done ? 'protected' : 'registering'} registered={registered} size={64} />
          </div>
          <p className="dz-meta">{page.ring.demoNote}</p>
        </div>
      </div>
      <div className="dz-ringgrid" data-testid="ring-states">
        {CELLS.map((c) => (
          <div key={c.name} className="dz-ringcell">
            <span className="dz-h3">{c.name}</span>
            <span className="dz-label">
              state=&quot;{c.props.state}&quot;
              {c.props.registered !== undefined ? ` registered={${c.props.registered}}` : ''}
            </span>
            <div className="dz-ringcell__row">
              <ProtectionRing {...c.props} size={24} />
              <ProtectionRing {...c.props} size={64}>
                {c.centre === 'check' ? <DrawnCheck size={24} /> : null}
              </ProtectionRing>
              <ProtectionRing {...c.props} size={120}>
                {c.centre === 'check' ? <DrawnCheck size={32} /> : null}
                {c.centre === 'time' ? <span className="dz-t20">01:08</span> : null}
              </ProtectionRing>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
