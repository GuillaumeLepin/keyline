'use client';

import {
  AssetRow,
  BitcoinPolicyDiagram,
  ConfirmPrompt,
  type ConfirmPromptState,
  formatCHF,
  type HandoffState,
  HandoffTile,
  type PositionGroup,
  PositionsTable,
  RowAction,
  SheetV2,
  TravelRuleLine,
  WebShell,
} from '@keyline/ui';
import { useEffect, useState } from 'react';
import {
  btcPolicyCopy,
  journeyLab,
  sqNav,
  sqPositionsCopy,
  sqSafetyKeyCopy,
  sqTileCopy,
  sqWeb,
  sqWebShell,
} from './copy';
import { fmtQty } from './mocks/fmt';

const TILE_STATES: HandoffState[] = ['idle', 'starting', 'waiting', 'expired', 'claimed', 'protected'];
const CONFIRM_STATES: ConfirmPromptState[] = ['ask', 'confirming', 'error', 'done', 'already'];

export function JourneyLab() {
  const [why, setWhy] = useState(false);
  // Client-only so the server render and hydration agree.
  const [expiresAt, setExpiresAt] = useState<number | undefined>(undefined);
  useEffect(() => setExpiresAt(Date.now() + 292_000), []);
  const openWhy = () => setWhy(true);

  const crypto = (code: string, name: string, qty: number, d: number, price: number, movable: boolean) => ({
    id: code,
    name,
    code,
    quantity: fmtQty(qty, d),
    price: formatCHF(price),
    value: formatCHF(qty * price),
    action: movable ? (
      <RowAction label={journeyLab.move} ariaLabel={`Move ${code} to Keyline`} />
    ) : (
      <RowAction label={journeyLab.move} disabledReason={journeyLab.btcReason} onWhy={openWhy} />
    ),
  });
  const groups: PositionGroup[] = [
    {
      id: 'cash',
      label: sqWeb.groups.cash,
      rows: [
        {
          id: 'chf',
          name: 'Swiss franc',
          code: 'CHF',
          quantity: fmtQty(12480.35, 2),
          value: formatCHF(12480.35),
        },
      ],
    },
    {
      id: 'securities',
      label: sqWeb.groups.securities,
      rows: [
        {
          id: 'smi',
          name: 'SMI index ETF',
          code: 'CHF · SIX',
          quantity: '120',
          price: formatCHF(128.4),
          value: formatCHF(120 * 128.4),
        },
      ],
    },
    {
      id: 'crypto',
      label: sqWeb.groups.crypto,
      rows: [
        crypto('BTC', 'Bitcoin', 0.42, 4, 88400, false),
        crypto('ETH', 'Ether', 3.15, 4, 3120, true),
        crypto('USDC', 'USD Coin', 2400, 2, 0.8, true),
        crypto('EURC', 'Euro Coin', 1500, 2, 0.94, true),
      ],
    },
  ];

  return (
    <div className="dz-jl">
      <div className="dz-jl__block" data-testid="jl-web">
        <h3 className="dz-h3">{journeyLab.webShell}</h3>
        <div className="dz-jl__frame">
          <WebShell
            copy={sqWebShell}
            nav={sqNav}
            client="Lea Keller"
            account="Account 4821 3307"
            onSignOut={() => {}}
          >
            <div className="dz-jl__web">
              <PositionsTable groups={groups} copy={sqPositionsCopy} total={formatCHF(28_036.43)} />
              <HandoffTile
                state="waiting"
                copy={sqTileCopy}
                code="482137"
                qrValue="https://keyline.app/start#482137"
                expiresAt={expiresAt}
              />
            </div>
          </WebShell>
          <SheetV2 open={why} title={journeyLab.btcWhyTitle} onClose={() => setWhy(false)} contained>
            <p className="dz-body">{journeyLab.btcWhy}</p>
            <BitcoinPolicyDiagram copy={btcPolicyCopy} />
          </SheetV2>
        </div>
        <div className="dz-jl__frame dz-jl__narrow">
          <PositionsTable groups={[]} copy={sqPositionsCopy} loading />
        </div>
      </div>

      <div className="dz-jl__block" data-testid="jl-tile">
        <h3 className="dz-h3">{journeyLab.tile}</h3>
        <div className="dz-jl__grid">
          {TILE_STATES.map((s) => (
            <div key={s} className="dz-jl__cell">
              <span className="dz-eyebrow">{journeyLab.states[s]}</span>
              <HandoffTile
                state={s}
                copy={sqTileCopy}
                code="482137"
                qrValue="https://keyline.app/start#482137"
                expiresAt={expiresAt}
                registered={s === 'claimed' ? 1 : 0}
              >
                <AssetRow name={journeyLab.balance} symbol="USDC" quantity="120.00" value={formatCHF(96)} />
              </HandoffTile>
            </div>
          ))}
        </div>
      </div>

      <div className="dz-jl__block" data-testid="jl-confirm">
        <h3 className="dz-h3">{journeyLab.confirm}</h3>
        <div className="dz-jl__grid">
          {CONFIRM_STATES.map((s) => (
            <div key={s} className="dz-jl__cell">
              <span className="dz-eyebrow">{journeyLab.states[s]}</span>
              <ConfirmPrompt state={s} copy={sqSafetyKeyCopy} onConfirm={() => {}} onDecline={() => {}} />
            </div>
          ))}
        </div>
      </div>

      <div className="dz-jl__row">
        <div className="dz-jl__block dz-jl__phonecol" data-testid="jl-assets">
          <h3 className="dz-h3">{journeyLab.assets}</h3>
          <div>
            <AssetRow name="USD Coin" symbol="USDC" quantity="120.00" value={formatCHF(96)} />
            <AssetRow name="Euro Coin" symbol="EURC" quantity="50.00" value={formatCHF(47)} />
            <AssetRow
              name="Ether"
              symbol="ETH"
              quantity="0.0100"
              value={formatCHF(31.2)}
              action={{ label: journeyLab.back }}
            />
            <AssetRow
              name="Bitcoin"
              symbol="BTC"
              quantity="0.4200"
              value={formatCHF(37128)}
              action={{ label: journeyLab.move, disabledReason: journeyLab.btcReason, onWhy: openWhy }}
            />
            <AssetRow name="" symbol="" quantity="" loading />
          </div>
          <h3 className="dz-h3">{journeyLab.travel}</h3>
          <TravelRuleLine />
        </div>
        <div className="dz-jl__block dz-jl__phonecol" data-testid="jl-diagram">
          <h3 className="dz-h3">{journeyLab.diagram}</h3>
          <BitcoinPolicyDiagram copy={btcPolicyCopy} />
        </div>
      </div>
    </div>
  );
}
