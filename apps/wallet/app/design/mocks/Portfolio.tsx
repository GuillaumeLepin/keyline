'use client';

import { Chip, formatCHF, ProtectionRing, QrCode, SheetV2 } from '@keyline/ui';
import { useState } from 'react';
import { btcWhy, sqWeb } from '../copy';
import { Browser } from '../Device';
import { fmtQty } from './fmt';

type Position = {
  name: string;
  code: string;
  qty: number;
  decimals: number;
  priceChf: number;
  movable?: boolean;
  blocked?: boolean;
};

// All SIMULATED: the Swissquote account, its balances and prices are mocks in the prototype.
const CASH_CHF = 12480.35;
const SECURITIES: Position[] = [
  { name: 'SMI index ETF', code: 'CHF · SIX', qty: 120, decimals: 0, priceChf: 128.4 },
];
const CRYPTO: Position[] = [
  { name: 'Bitcoin', code: 'BTC', qty: 0.42, decimals: 4, priceChf: 88400, blocked: true },
  { name: 'Ether', code: 'ETH', qty: 3.15, decimals: 4, priceChf: 3120, movable: true },
  { name: 'USD Coin', code: 'USDC', qty: 2400, decimals: 2, priceChf: 0.8, movable: true },
  { name: 'Euro Coin', code: 'EURC', qty: 1500, decimals: 2, priceChf: 0.94, movable: true },
];
const invested = [...SECURITIES, ...CRYPTO].reduce((s, p) => s + p.qty * p.priceChf, 0);

function Row({ p, onWhy }: { p: Position; onWhy: () => void }) {
  return (
    <tr>
      <td>
        <span className="dz-asset">
          <span className="dz-asset__name">{p.name}</span>
          <span className="dz-asset__code">{p.code}</span>
        </span>
      </td>
      <td className="num">{fmtQty(p.qty, p.decimals)}</td>
      <td className="num">{formatCHF(p.priceChf)}</td>
      <td className="num">
        <strong>{formatCHF(p.qty * p.priceChf)}</strong>
      </td>
      <td className="num">
        {p.movable ? (
          <button type="button" className="dz-linkbtn">
            {sqWeb.move}
          </button>
        ) : p.blocked ? (
          <span className="dz-rowact">
            <span className="dz-state" aria-disabled="true">
              {sqWeb.move}
            </span>
            <button type="button" className="dz-linkbtn" onClick={onWhy}>
              {sqWeb.why}
            </button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

export function PortfolioMock() {
  const [why, setWhy] = useState(false);
  return (
    <Browser
      label={sqWeb.title}
      url={
        <>
          {sqWeb.url}
          <Chip />
        </>
      }
    >
      <div className="dz-sq" style={{ position: 'relative' }}>
        <header className="dz-sq__top">
          <span className="dz-sq__brand">{sqWeb.brand}</span>
          <nav className="dz-sq__nav" aria-label="Swissquote">
            {sqWeb.nav.map((n, i) => (
              <span key={n} data-active={i === 0 || undefined}>
                {n}
              </span>
            ))}
          </nav>
          <span className="dz-sq__client">{sqWeb.client}</span>
        </header>
        <main className="dz-sq__main">
          <div className="dz-sq__head">
            <div style={{ display: 'grid', gap: 4 }}>
              <h3 className="dz-t28">{sqWeb.title}</h3>
              <p className="dz-meta">
                {sqWeb.valuation}
                <Chip />
              </p>
            </div>
            <div className="dz-sq__figures">
              <div className="dz-fig">
                <span className="dz-eyebrow">{sqWeb.cash}</span>
                <span className="dz-fig__value">{formatCHF(CASH_CHF)}</span>
              </div>
              <div className="dz-fig">
                <span className="dz-eyebrow">{sqWeb.invested}</span>
                <span className="dz-fig__value">{formatCHF(invested)}</span>
              </div>
              <div className="dz-fig">
                <span className="dz-eyebrow">{sqWeb.total}</span>
                <span className="dz-balance__amount">{formatCHF(CASH_CHF + invested)}</span>
              </div>
            </div>
          </div>
          <section className="dz-sq__table" aria-label={sqWeb.title}>
            <table className="dz-table">
              <thead>
                <tr>
                  <th>{sqWeb.cols.position}</th>
                  <th className="num">{sqWeb.cols.quantity}</th>
                  <th className="num">{sqWeb.cols.price}</th>
                  <th className="num">{sqWeb.cols.value}</th>
                  <th className="num">
                    <span className="kl2-sr">Keyline</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="group">
                  <td colSpan={5}>{sqWeb.groups.cash}</td>
                </tr>
                <tr>
                  <td>
                    <span className="dz-asset">
                      <span className="dz-asset__name">Swiss franc</span>
                      <span className="dz-asset__code">CHF</span>
                    </span>
                  </td>
                  <td className="num">{fmtQty(CASH_CHF, 2)}</td>
                  <td className="num" />
                  <td className="num">
                    <strong>{formatCHF(CASH_CHF)}</strong>
                  </td>
                  <td />
                </tr>
                <tr className="group">
                  <td colSpan={5}>{sqWeb.groups.securities}</td>
                </tr>
                {SECURITIES.map((p) => (
                  <Row key={p.name} p={p} onWhy={() => setWhy(true)} />
                ))}
                <tr className="group">
                  <td colSpan={5}>{sqWeb.groups.crypto}</td>
                </tr>
                {CRYPTO.map((p) => (
                  <Row key={p.code} p={p} onWhy={() => setWhy(true)} />
                ))}
              </tbody>
            </table>
          </section>
          <aside className="dz-sq__aside" aria-label={sqWeb.keyline.eyebrow}>
            <div className="dz-tile">
              <div className="dz-tile__head">
                <ProtectionRing state="empty" size={64} />
                <div style={{ display: 'grid', gap: 4 }}>
                  <span className="dz-eyebrow">{sqWeb.keyline.eyebrow}</span>
                  <h4 className="dz-t20 kl2-balance">{sqWeb.keyline.title}</h4>
                </div>
              </div>
              <p className="dz-small">{sqWeb.keyline.body}</p>
              <div className="dz-qr">
                <QrCode value="https://keyline.app/start#482137" size={112} label={sqWeb.keyline.scan} />
                <div style={{ display: 'grid', gap: 8 }}>
                  <p className="dz-small">{sqWeb.keyline.scan}</p>
                  <span className="dz-code6">{sqWeb.keyline.code}</span>
                  <span className="dz-meta">{sqWeb.keyline.expires}</span>
                </div>
              </div>
              <span className="dz-state">
                <span className="dz-dot dz-dot--track" />
                {sqWeb.keyline.waiting}
              </span>
            </div>
          </aside>
        </main>
        <SheetV2 open={why} title={btcWhy.title} onClose={() => setWhy(false)} contained>
          {btcWhy.body.map((p) => (
            <p key={p} className="dz-body">
              {p}
            </p>
          ))}
          <a className="kl2-link" href="#ring">
            {btcWhy.link}
          </a>
        </SheetV2>
      </div>
    </Browser>
  );
}
