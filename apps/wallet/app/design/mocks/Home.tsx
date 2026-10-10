'use client';

import {
  Chip,
  formatCHF,
  formatSignedUSDC,
  formatUSDC,
  NumberTicker,
  ProtectionRing,
  StatementRow,
} from '@keyline/ui';
import { GearSix } from '@phosphor-icons/react/dist/ssr';
import { home } from '../copy';
import { Phone } from '../Device';
import { fmtQty } from './fmt';

const RATE = 0.8; // CHF per USDC — SIMULATED

export function HomeMock({ usdc = 120 }: { usdc?: number }) {
  return (
    <Phone persona={home.device} label={home.brand}>
      <div className="dz-scroll">
        <div className="dz-homehead">
          <span className="dz-t20">{home.brand}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button type="button" className="dz-protected">
              <ProtectionRing state="protected" size={24} />
              {home.protectedLink}
            </button>
            <button type="button" className="kl2-iconbtn" aria-label={home.settings}>
              <GearSix size={20} aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="dz-balance">
          <span className="dz-eyebrow">{home.balance}</span>
          <span className="dz-balance__amount">
            <NumberTicker value={usdc * RATE} format={formatCHF} />
          </span>
          <span className="dz-small">
            <NumberTicker value={usdc} format={formatUSDC} />
          </span>
          <span className="dz-meta">
            {home.rate}
            <Chip />
          </span>
        </div>
        <div className="dz-actions3">
          <button type="button" className="kl-btn kl-btn--primary">
            {home.send}
          </button>
          <button type="button" className="kl-btn kl-btn--secondary">
            {home.receive}
          </button>
          <button type="button" className="kl-btn kl-btn--secondary">
            {home.topUp}
          </button>
        </div>
        <section aria-label={home.statement}>
          <div className="dz-sechead">
            <h4 className="dz-sechead__title">{home.statement}</h4>
            <a className="kl2-link" href="#screens">
              {home.all}
            </a>
          </div>
          <div className="dz-list">
            {home.rows.map((r) => (
              <StatementRow
                key={r.label}
                label={r.label}
                meta={r.meta}
                status="ok"
                statusWord={r.status}
                amount={formatSignedUSDC(r.amount)}
                amountSub={formatCHF(Math.abs(r.amount) * RATE)}
              />
            ))}
          </div>
        </section>
        <section aria-label={home.sq}>
          <div className="dz-sechead">
            <h4 className="dz-sechead__title">
              {home.sq}
              <Chip />
            </h4>
            <a className="kl2-link" href="#screens">
              {home.sqOpen}
            </a>
          </div>
          <div className="dz-list">
            <div className="dz-row">
              <span className="dz-row__label">
                Bitcoin<span className="dz-row__meta">{fmtQty(0.42, 4, 'BTC')}</span>
              </span>
              <span className="dz-row__end">{formatCHF(37128)}</span>
            </div>
            <div className="dz-row">
              <span className="dz-row__label">
                Ether<span className="dz-row__meta">{fmtQty(3.15, 4, 'ETH')}</span>
              </span>
              <span className="dz-row__end">{formatCHF(9828)}</span>
            </div>
            <div className="dz-row">
              <span className="dz-row__label">
                Swiss franc<span className="dz-row__meta">Cash</span>
              </span>
              <span className="dz-row__end">{formatCHF(12480.35)}</span>
            </div>
          </div>
        </section>
        <p className="dz-testnet">{home.testnet}</p>
      </div>
    </Phone>
  );
}
