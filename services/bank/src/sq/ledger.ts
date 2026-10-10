// SIMULATED Swissquote ledger (SPEC §10 F0.2): the client's portfolio at static prices. Quantities are exact
// (bigint base units per position); the ledger table is append-only (trigger) and every change writes one row.
// Moves to Keyline debit it; "Back to Swissquote" userOps credit it on inclusion.
import type { SqAsset, SqPosition } from '@keyline/shared';
import { formatUnits, parseUnits } from 'viem';
import { type Db, newId, nowIso } from '../db';

type PositionSeed = {
  id: string;
  name: string;
  symbol: string;
  kind: SqPosition['kind'];
  decimals: number;
  quantity: string;
  priceChf: string;
};

/** SPEC §10 F0.2 — exactly these numbers (static, SIMULATED). */
export const SQ_POSITIONS_SEED: readonly PositionSeed[] = [
  {
    id: 'chf-cash',
    name: 'Swiss franc cash',
    symbol: 'CHF',
    kind: 'cash',
    decimals: 2,
    quantity: '12480.35',
    priceChf: '1.00',
  },
  {
    id: 'smi-etf',
    name: 'SMI index ETF',
    symbol: 'SMI ETF',
    kind: 'security',
    decimals: 0,
    quantity: '120',
    priceChf: '128.40',
  },
  {
    id: 'btc',
    name: 'Bitcoin',
    symbol: 'BTC',
    kind: 'crypto',
    decimals: 8,
    quantity: '0.42',
    priceChf: '88400.00',
  },
  {
    id: 'eth',
    name: 'Ether',
    symbol: 'ETH',
    kind: 'crypto',
    decimals: 18,
    quantity: '3.15',
    priceChf: '3120.00',
  },
  {
    id: 'usdc',
    name: 'USD Coin',
    symbol: 'USDC',
    kind: 'crypto',
    decimals: 6,
    quantity: '2400',
    priceChf: '0.80',
  },
  {
    id: 'eurc',
    name: 'Euro Coin',
    symbol: 'EURC',
    kind: 'crypto',
    decimals: 6,
    quantity: '1500',
    priceChf: '0.94',
  },
];

/** The movable assets, their ledger row and their on-chain decimals. */
export const SQ_ASSETS: Record<SqAsset, { positionId: string; decimals: number }> = {
  USDC: { positionId: 'usdc', decimals: 6 },
  EURC: { positionId: 'eurc', decimals: 6 },
  ETH: { positionId: 'eth', decimals: 18 },
};
const MOVABLE = new Set(Object.values(SQ_ASSETS).map((a) => a.positionId));

type PositionRow = {
  client_id: string;
  id: string;
  name: string;
  symbol: string;
  kind: string;
  decimals: number;
  quantity: string;
  price_chf: string;
  sort: number;
};

/** Rappen (bigint) → "1234.50". */
export const formatChfCents = (cents: bigint): string => {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
};

/** quantity (base units, `decimals`) × price (CHF string) → rappen, rounded half up. */
export const valueCents = (quantity: bigint, decimals: number, priceChf: string): bigint => {
  const scale = 10n ** BigInt(decimals);
  return (quantity * parseUnits(priceChf, 2) + scale / 2n) / scale;
};

/** Human decimal string → base units; throws on more decimals than the asset has. */
export const toBaseUnits = (amount: string, decimals: number): bigint => {
  const frac = amount.split('.')[1] ?? '';
  if (frac.length > decimals) throw new RangeError(`at most ${decimals} decimals`);
  return parseUnits(amount, decimals);
};

export type LedgerChange = { quantityAfter: bigint; entryId: string };

export const createSqLedger = (db: Db) => {
  const insertPosition = db.prepare(
    `INSERT OR IGNORE INTO sq_positions (client_id, id, name, symbol, kind, decimals, quantity, price_chf, sort, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const positionsStmt = db.prepare('SELECT * FROM sq_positions WHERE client_id = ? ORDER BY sort');
  const positionStmt = db.prepare('SELECT * FROM sq_positions WHERE client_id = ? AND id = ?');
  const setQuantity = db.prepare(
    'UPDATE sq_positions SET quantity = ?, updated_at = ? WHERE client_id = ? AND id = ?',
  );
  const insertEntry = db.prepare(
    `INSERT INTO sq_ledger (id, client_id, position_id, delta, quantity_after, reason, ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const row = (clientId: string, positionId: string): PositionRow => {
    const r = positionStmt.get(clientId, positionId) as PositionRow | undefined;
    if (!r) throw new Error(`No ${positionId} position for ${clientId}`);
    return r;
  };

  /** Applies `delta` (base units, signed). Returns null when a debit would go below zero. Atomic. */
  const apply = db.transaction(
    (clientId: string, positionId: string, delta: bigint, reason: string, ref: string | null) => {
      const r = row(clientId, positionId);
      const after = parseUnits(r.quantity, r.decimals) + delta;
      if (after < 0n) return null;
      const at = nowIso();
      setQuantity.run(formatUnits(after, r.decimals), at, clientId, positionId);
      const entryId = newId('led');
      insertEntry.run(
        entryId,
        clientId,
        positionId,
        formatUnits(delta, r.decimals),
        formatUnits(after, r.decimals),
        reason,
        ref,
        at,
      );
      return { quantityAfter: after, entryId } satisfies LedgerChange;
    },
  );

  return {
    /** Idempotent: inserts the F0.2 portfolio once per client; never resets an existing ledger. */
    seed(clientId: string): void {
      const at = nowIso();
      db.transaction(() => {
        SQ_POSITIONS_SEED.forEach((p, i) => {
          insertPosition.run(
            clientId,
            p.id,
            p.name,
            p.symbol,
            p.kind,
            p.decimals,
            p.quantity,
            p.priceChf,
            i,
            at,
          );
        });
      })();
    },

    positions(clientId: string): SqPosition[] {
      return (positionsStmt.all(clientId) as PositionRow[]).map((r) => {
        const qty = parseUnits(r.quantity, r.decimals);
        const movable = MOVABLE.has(r.id);
        return {
          id: r.id,
          name: r.name,
          symbol: r.symbol,
          kind: r.kind as SqPosition['kind'],
          quantity: r.quantity,
          priceChf: r.price_chf,
          valueChf: formatChfCents(valueCents(qty, r.decimals, r.price_chf)),
          movable,
          ...(r.id === 'btc' ? { notMovableReason: 'bitcoin-roadmap' as const } : {}),
          simulated: true as const,
        };
      });
    },

    /** cash / invested / total in rappen. */
    totals(clientId: string): { cashCents: bigint; investedCents: bigint; totalCents: bigint } {
      let cashCents = 0n;
      let investedCents = 0n;
      for (const r of positionsStmt.all(clientId) as PositionRow[]) {
        const v = valueCents(parseUnits(r.quantity, r.decimals), r.decimals, r.price_chf);
        if (r.kind === 'cash') cashCents += v;
        else investedCents += v;
      }
      return { cashCents, investedCents, totalCents: cashCents + investedCents };
    },

    quantity(clientId: string, asset: SqAsset): bigint {
      const r = row(clientId, SQ_ASSETS[asset].positionId);
      return parseUnits(r.quantity, r.decimals);
    },

    /** CHF value of `amount` base units of `asset` at the static price, as "80.00". */
    valueChf(clientId: string, asset: SqAsset, amount: bigint): string {
      const r = row(clientId, SQ_ASSETS[asset].positionId);
      return formatChfCents(valueCents(amount, r.decimals, r.price_chf));
    },

    debit(
      clientId: string,
      asset: SqAsset,
      amount: bigint,
      reason: string,
      ref?: string,
    ): LedgerChange | null {
      if (amount <= 0n) throw new RangeError('debit amount must be positive');
      return apply(clientId, SQ_ASSETS[asset].positionId, -amount, reason, ref ?? null);
    },

    credit(clientId: string, asset: SqAsset, amount: bigint, reason: string, ref?: string): LedgerChange {
      if (amount <= 0n) throw new RangeError('credit amount must be positive');
      const change = apply(clientId, SQ_ASSETS[asset].positionId, amount, reason, ref ?? null);
      if (!change) throw new Error('credit cannot underflow');
      return change;
    },
  };
};
export type SqLedger = ReturnType<typeof createSqLedger>;
