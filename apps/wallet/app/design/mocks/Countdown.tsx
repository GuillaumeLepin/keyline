'use client';

import { formatClock, ProtectionCountdown } from '@keyline/ui';
import { ArrowSquareOut, CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { countdown } from '../copy';
import { Phone, Stepper } from '../Device';

export function CountdownMock({ endsAt, durationMs }: { endsAt: number; durationMs: number }) {
  return (
    <Phone
      persona={countdown.device}
      personaTone="new"
      label={countdown.stepper}
      time={formatClock(endsAt - durationMs + 25_000).slice(0, 5)}
    >
      <div className="dz-scroll">
        <Stepper label={countdown.stepper} current={5} total={5} />
        <h3 className="dz-t28">{countdown.title(formatClock(endsAt))}</h3>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
          <ProtectionCountdown endsAt={endsAt} durationMs={durationMs} doneLabel={countdown.done} />
          <p className="dz-meta" style={{ textAlign: 'center' }}>
            {countdown.caption}
          </p>
        </div>
        <p className="dz-body">{countdown.body}</p>
        <div className="dz-list">
          {countdown.rows.map((r, i) => (
            <div key={r.name} className="dz-row">
              <span className="dz-row__label">{r.name}</span>
              <span className={['dz-state', i < 2 ? 'dz-state--ok' : ''].filter(Boolean).join(' ')}>
                {i < 2 ? (
                  <CheckCircle size={16} aria-hidden="true" />
                ) : (
                  <span className="dz-dot dz-dot--track" />
                )}
                {i === 0
                  ? countdown.confirmedAt(formatClock(endsAt - durationMs - 88_000))
                  : i === 1
                    ? countdown.confirmedAt(formatClock(endsAt - durationMs))
                    : r.state}
              </span>
            </div>
          ))}
        </div>
        <a className="kl2-link" href="#screens">
          {countdown.watch}
          <ArrowSquareOut size={14} aria-hidden="true" />
        </a>
      </div>
    </Phone>
  );
}
