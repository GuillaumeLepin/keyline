'use client';

import {
  formatCHF,
  HandoffTile,
  type PositionGroup,
  PositionsTable,
  ProtectionRing,
  RowAction,
  WebShell,
} from '@keyline/ui';
import { useEffect, useState } from 'react';
import { journeyLab, sqNav, sqPositionsCopy, sqTileCopy, sqWebShell } from '../copy';
import { fmtQty } from '../mocks/fmt';

/**
 * Swissquote web at phone width (Phase C): WebShell + PositionsTable + HandoffTile stacked, so the narrow
 * layout of the laptop primitives can be checked at 390 px. Nothing here may clip or scroll the page.
 */
export default function NarrowWebPage() {
  const [expiresAt, setExpiresAt] = useState<number | undefined>(undefined);
  useEffect(() => setExpiresAt(Date.now() + 292_000), []);
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
      <RowAction label={journeyLab.move} disabledReason={journeyLab.btcReason} onWhy={() => {}} />
    ),
  });
  const groups: PositionGroup[] = [
    {
      id: 'cash',
      label: 'Cash',
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
      id: 'crypto',
      label: 'Crypto',
      rows: [crypto('BTC', 'Bitcoin', 0.42, 4, 88400, false), crypto('USDC', 'USD Coin', 2400, 2, 0.8, true)],
    },
  ];
  return (
    <WebShell
      copy={sqWebShell}
      nav={sqNav}
      client="Lea Keller"
      account="Account 4821 3307"
      onSignOut={() => {}}
    >
      <div style={{ display: 'grid', gap: 'var(--space-8)' }}>
        <PositionsTable groups={groups} copy={sqPositionsCopy} total={formatCHF(28_036.43)} />
        <HandoffTile
          state="waiting"
          copy={sqTileCopy}
          code="482137"
          qrValue="https://keyline.app/start#482137"
          expiresAt={expiresAt}
        />
        <HandoffTile state="protected" copy={sqTileCopy} registered={3}>
          <ProtectionRing state="protected" size={24} />
        </HandoffTile>
      </div>
    </WebShell>
  );
}
