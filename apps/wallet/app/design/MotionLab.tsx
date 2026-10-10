'use client';

import {
  ActionButton,
  type ActionStatus,
  Chip,
  CrossFade,
  formatCHF,
  formatSignedUSDC,
  formatUSDC,
  NumberTicker,
  SheetV2,
  StackView,
  StatementRow,
} from '@keyline/ui';
import { IdentificationCard, Key, Laptop } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useRef, useState } from 'react';
import { btcWhy, page } from './copy';

const m = page.motion;

const KEYS = [
  {
    id: 'safety',
    name: 'Safety key',
    where: 'On your laptop',
    can: 'Co-approves transfers above CHF 1’000 a day and helps restore access. Cannot spend alone.',
    icon: <Laptop size={20} aria-hidden="true" />,
  },
  {
    id: 'card',
    name: 'Emergency card',
    where: 'On paper, with you',
    can: 'Helps restore access after a waiting period you will see. Cannot spend your money.',
    icon: <IdentificationCard size={20} aria-hidden="true" />,
  },
  {
    id: 'sq',
    name: 'Swissquote',
    where: 'Swiss data centre',
    can: 'Helps restore access after an identity check. Cannot spend, and cannot act alone.',
    icon: <Key size={20} aria-hidden="true" />,
  },
] as const;

function StackDemo() {
  const [open, setOpen] = useState<string | null>(null);
  const k = KEYS.find((x) => x.id === open);
  return (
    <div className="dz-lab__stage" data-testid="stack-demo">
      <StackView
        screenKey={k ? k.id : 'list'}
        direction={k ? 1 : -1}
        title={k ? k.name : 'Your recoverers'}
        onBack={k ? () => setOpen(null) : undefined}
      >
        {k ? (
          <div className="dz-scroll">
            <span className="dz-eyebrow">{k.where}</span>
            <p className="dz-body">{k.can}</p>
          </div>
        ) : (
          <div style={{ padding: '0 16px' }}>
            {KEYS.map((x) => (
              <StatementRow
                key={x.id}
                icon={x.icon}
                label={x.name}
                meta={x.where}
                onClick={() => setOpen(x.id)}
              />
            ))}
          </div>
        )}
      </StackView>
    </div>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="dz-lab__stage">
      <div className="dz-scroll">
        <span className="dz-eyebrow">Bitcoin · 0.4200 BTC</span>
        <p className="dz-small">Stays in your Swissquote account.</p>
        <div>
          <button
            type="button"
            className="kl-btn kl-btn--secondary"
            onClick={() => setOpen(true)}
            data-testid="sheet-open"
          >
            {m.openSheet}
          </button>
        </div>
      </div>
      <SheetV2 open={open} title={btcWhy.title} onClose={() => setOpen(false)} contained>
        <p className="dz-body">{btcWhy.body[0]}</p>
        <p className="dz-body">{btcWhy.body[1]}</p>
      </SheetV2>
    </div>
  );
}

function TickerDemo() {
  const [usdc, setUsdc] = useState(120);
  return (
    <div className="dz-lab__stage dz-lab__stage--short">
      <span className="dz-eyebrow">Balance</span>
      <span className="dz-amount" data-testid="ticker">
        <NumberTicker value={usdc * 0.8} format={formatCHF} />
      </span>
      <span className="dz-small">
        <NumberTicker value={usdc} format={formatUSDC} />
      </span>
      <div className="dz-lab__controls">
        <button
          type="button"
          className="kl-btn kl-btn--secondary kl-btn--sm"
          onClick={() => setUsdc((u) => u + 120)}
          data-testid="ticker-up"
        >
          {m.receive}
        </button>
        <button
          type="button"
          className="kl-btn kl-btn--secondary kl-btn--sm"
          onClick={() => setUsdc((u) => Math.max(0, u - 25))}
          data-testid="ticker-down"
        >
          {m.send}
        </button>
      </div>
    </div>
  );
}

function CrossFadeDemo() {
  const [loading, setLoading] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const reload = () => {
    setLoading(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => setLoading(false), 1200);
  };
  return (
    <div className="dz-lab__stage dz-lab__stage--short">
      <CrossFade stateKey={loading ? 'loading' : 'ready'}>
        {loading ? (
          <div aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="kl-row">
                <span className="kl-row__main dz-skel">
                  <span className="dz-skel__bar" style={{ width: '55%' }} />
                  <span className="dz-skel__bar" style={{ width: '35%', height: 12 }} />
                </span>
                <span className="dz-skel" style={{ justifyItems: 'end' }}>
                  <span className="dz-skel__bar" style={{ width: 96 }} />
                  <span className="dz-skel__bar" style={{ width: 64, height: 12 }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <StatementRow
              label="Lukas Meier"
              meta="10 Oct, 14:32"
              status="ok"
              statusWord="Confirmed"
              amount={formatSignedUSDC(-25)}
              amountSub={formatCHF(20)}
            />
            <StatementRow
              label="Top up from Swissquote"
              meta="10 Oct, 14:20"
              status="ok"
              statusWord="Confirmed"
              amount={formatSignedUSDC(120)}
              amountSub={formatCHF(96)}
            />
          </div>
        )}
      </CrossFade>
      <div className="dz-lab__controls">
        <button type="button" className="kl-btn kl-btn--secondary kl-btn--sm" onClick={reload}>
          {m.reload}
        </button>
      </div>
    </div>
  );
}

function ActionDemo() {
  const [status, setStatus] = useState<ActionStatus>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = () => {
    setStatus('loading');
    timers.current.push(setTimeout(() => setStatus('success'), 1200));
    timers.current.push(setTimeout(() => setStatus('idle'), 3200));
  };
  return (
    <div className="dz-lab__stage dz-lab__stage--short">
      <ActionButton
        full
        label="Confirm with Face ID"
        status={status}
        successLabel="Sent"
        onClick={status === 'idle' ? run : undefined}
        data-testid="action-run"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <ActionButton label={m.actionIdle} variant="secondary" />
        <ActionButton label={m.actionLoading} variant="secondary" status="loading" />
        <ActionButton label={m.actionSuccess} status="success" />
        <ActionButton label={m.actionDisabled} disabled />
      </div>
    </div>
  );
}

function ChipDemo() {
  return (
    <div className="dz-lab__stage dz-lab__stage--short">
      <p className="dz-small" style={{ paddingTop: 48 }}>
        Swissquote account balance: {formatCHF(4210.35)}
        <Chip />
      </p>
      <p className="dz-small">
        Rate 1 USDC = CHF 0.80
        <Chip />
      </p>
    </div>
  );
}

export function MotionLab() {
  return (
    <div className="dz-labgrid">
      <section className="dz-lab">
        <h3 className="dz-h3">{m.stack}</h3>
        <p className="dz-meta">{m.stackNote}</p>
        <StackDemo />
      </section>
      <section className="dz-lab">
        <h3 className="dz-h3">{m.sheet}</h3>
        <p className="dz-meta">{m.sheetNote}</p>
        <SheetDemo />
      </section>
      <section className="dz-lab">
        <h3 className="dz-h3">{m.ticker}</h3>
        <p className="dz-meta">{m.tickerNote}</p>
        <TickerDemo />
      </section>
      <section className="dz-lab">
        <h3 className="dz-h3">{m.crossfade}</h3>
        <p className="dz-meta">{m.crossfadeNote}</p>
        <CrossFadeDemo />
      </section>
      <section className="dz-lab">
        <h3 className="dz-h3">{m.action}</h3>
        <p className="dz-meta">{m.actionNote}</p>
        <ActionDemo />
      </section>
      <section className="dz-lab">
        <h3 className="dz-h3">{m.chip}</h3>
        <p className="dz-meta">{m.chipNote}</p>
        <ChipDemo />
      </section>
    </div>
  );
}
