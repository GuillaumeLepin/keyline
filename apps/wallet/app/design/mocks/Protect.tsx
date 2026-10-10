'use client';

import { ActionButton, type ActionStatus, DrawnCheck, formatInteger, ProtectionRing } from '@keyline/ui';
import { CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useState } from 'react';
import { protect } from '../copy';
import { Phone, Stepper } from '../Device';

export type ProtectPhase = 'idle' | 'signing' | 0 | 1 | 2 | 3 | 'protected';

/** Which arcs are registered in a phase (each arc = one on-chain event). */
export function registeredIn(phase: ProtectPhase): 0 | 1 | 2 | 3 {
  if (phase === 'idle' || phase === 'signing') return 0;
  if (phase === 'protected') return 3;
  return phase;
}

export function ProtectMock({ phase, onProtect }: { phase: ProtectPhase; onProtect?: () => void }) {
  const n = registeredIn(phase);
  const done = phase === 'protected';
  const running = phase !== 'idle' && !done;
  // The success check holds for a beat, then the button settles to its next action ("Continue").
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!done) {
      setSettled(false);
      return;
    }
    const t = setTimeout(() => setSettled(true), 1200);
    return () => clearTimeout(t);
  }, [done]);
  const status: ActionStatus = done ? (settled ? 'idle' : 'success') : running ? 'loading' : 'idle';
  return (
    <Phone persona={protect.device} label={protect.stepper}>
      <div className="dz-scroll">
        <Stepper label={protect.stepper} current={5} total={6} />
        <div style={{ display: 'grid', gap: 8 }}>
          <h3 className="dz-t28">{done ? protect.titleDone : protect.title}</h3>
          <p className="dz-body">{done ? protect.bodyDone : protect.body}</p>
        </div>
        <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0' }}>
          <ProtectionRing
            state={done ? 'protected' : n === 0 ? 'empty' : 'registering'}
            registered={n}
            size={200}
          >
            {done ? (
              <DrawnCheck size={40} />
            ) : (
              <>
                <span className="dz-t28">{n} of 3</span>
                <span className="dz-meta">{protect.ringSub}</span>
              </>
            )}
          </ProtectionRing>
        </div>
        <div className="dz-list">
          {protect.rows.map((r, i) => {
            const state = i < n ? 'added' : running && i === n ? 'adding' : 'waiting';
            return (
              <div key={r.name} className="dz-row">
                <span className="dz-row__label">
                  {r.name}
                  <span className="dz-row__meta">{r.where}</span>
                </span>
                <span
                  className={[
                    'dz-state',
                    state === 'added' ? 'dz-state--ok' : state === 'adding' ? 'dz-state--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {state === 'added' ? (
                    <CheckCircle size={16} aria-hidden="true" />
                  ) : (
                    <span className={`dz-dot ${state === 'adding' ? 'dz-dot--arc' : 'dz-dot--track'}`} />
                  )}
                  {state === 'added' ? protect.added : state === 'adding' ? protect.adding : protect.waiting}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="dz-dock">
        <ActionButton
          full
          label={done ? protect.ctaDone : protect.cta}
          status={status}
          successLabel={protect.titleDone}
          onClick={phase === 'idle' ? onProtect : undefined}
        />
        <span className="dz-dock__note">{done ? protect.block(formatInteger(6812334)) : protect.fee}</span>
      </div>
    </Phone>
  );
}
