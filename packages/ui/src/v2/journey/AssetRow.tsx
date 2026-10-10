import type { ReactNode } from 'react';
import { RowAction, type RowActionProps } from './RowAction';

export type AssetRowProps = {
  /** "USD Coin" */
  name: string;
  /** "USDC" */
  symbol: string;
  /** Pre-formatted quantity without the symbol, e.g. "120.00" (the row appends the symbol). */
  quantity: string;
  /** Pre-formatted CHF value, e.g. formatCHF(96). Omit when no rate is known. */
  value?: string;
  /** Optional chip after the CHF value (e.g. <Chip/> when the rate is simulated). One per group is preferred. */
  valueChip?: ReactNode;
  /** Optional per-row action ("Move to Keyline", "Back to Swissquote") or an unavailable action with a reason. */
  action?: RowActionProps;
  /** Loading skeleton in the row's exact shape. */
  loading?: boolean;
};

/**
 * One asset on a statement-style list: 56 px minimum, hairline below, name over symbol on the left,
 * quantity over CHF value on the right (tabular). An action sits on its own line, right-aligned,
 * so the numbers keep one right edge at 390 px.
 */
export function AssetRow({
  name,
  symbol,
  quantity,
  value,
  valueChip,
  action,
  loading = false,
}: AssetRowProps) {
  if (loading) {
    return (
      <div className="kl2-asset" aria-busy="true">
        <span className="kl2-asset__main">
          <span className="kl2-skel" style={{ width: 120, height: 16 }} />
          <span className="kl2-skel" style={{ width: 48, height: 12 }} />
        </span>
        <span className="kl2-asset__nums">
          <span className="kl2-skel" style={{ width: 96, height: 16 }} />
          <span className="kl2-skel" style={{ width: 72, height: 12 }} />
        </span>
      </div>
    );
  }
  return (
    <div className="kl2-asset">
      <span className="kl2-asset__main">
        <span className="kl2-asset__name">{name}</span>
        <span className="kl2-asset__sym">{symbol}</span>
      </span>
      <span className="kl2-asset__nums">
        <span className="kl2-asset__qty">
          {quantity}
          {' '}
          {symbol}
        </span>
        {value ? (
          <span className="kl2-asset__val">
            {value}
            {valueChip}
          </span>
        ) : null}
      </span>
      {action ? (
        <span className="kl2-asset__act">
          <RowAction {...action} />
        </span>
      ) : null}
    </div>
  );
}
