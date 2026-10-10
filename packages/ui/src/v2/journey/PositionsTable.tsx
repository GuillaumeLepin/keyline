import type { ReactNode } from 'react';

export type Position = {
  id: string;
  /** "Ether" */
  name: string;
  /** Second line under the name: "ETH" or "CHF · SIX". */
  code: string;
  /** Pre-formatted, e.g. "3.1500". */
  quantity: string;
  /** Pre-formatted CHF price; empty for cash. */
  price?: string;
  /** Pre-formatted CHF value. */
  value: string;
  /** Row action slot — usually <RowAction/>. */
  action?: ReactNode;
};

export type PositionGroup = {
  id: 'cash' | 'securities' | 'crypto' | (string & {});
  /** "Cash", "Securities", "Crypto" */
  label: string;
  rows: Position[];
};

export type PositionsTableCopy = {
  /** Accessible table name, e.g. "Positions". */
  caption: string;
  position: string;
  quantity: string;
  price: string;
  value: string;
  /** Header of the action column, visually hidden, e.g. "Keyline". */
  action: string;
  /** Footer label, e.g. "Total value". Shown only with `total`. */
  total?: string;
};

export type PositionsTableProps = {
  groups: PositionGroup[];
  copy: PositionsTableCopy;
  /** Pre-formatted CHF total for the footer row. */
  total?: string;
  /** Skeleton rows in the table's exact shape. */
  loading?: boolean;
};

/**
 * Desktop positions table in the style of a Swissquote statement: grouped (Cash / Securities /
 * Crypto) with an uppercase group row, 56 px rows, hairlines, numbers right-aligned and tabular,
 * a right-hand action slot. Wide content scrolls inside its own container, never the page.
 */
export function PositionsTable({ groups, copy, total, loading = false }: PositionsTableProps) {
  return (
    <div className="kl2-ptable-wrap">
      <table className="kl2-ptable" aria-busy={loading || undefined}>
        <caption className="kl2-sr">{copy.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.position}</th>
            <th scope="col" className="kl2-num">
              {copy.quantity}
            </th>
            <th scope="col" className="kl2-num">
              {copy.price}
            </th>
            <th scope="col" className="kl2-num">
              {copy.value}
            </th>
            <th scope="col" className="kl2-num">
              <span className="kl2-sr">{copy.action}</span>
            </th>
          </tr>
        </thead>
        {loading ? (
          <tbody>
            {[0, 1, 2, 3].map((i) => (
              <tr key={i}>
                <td>
                  <span className="kl2-skel" style={{ width: 140, height: 16 }} />
                </td>
                <td className="kl2-num">
                  <span className="kl2-skel" style={{ width: 64, height: 14 }} />
                </td>
                <td className="kl2-num">
                  <span className="kl2-skel" style={{ width: 72, height: 14 }} />
                </td>
                <td className="kl2-num">
                  <span className="kl2-skel" style={{ width: 88, height: 14 }} />
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        ) : (
          groups.map((g) => (
            <tbody key={g.id}>
              <tr className="kl2-ptable__group">
                <th scope="colgroup" colSpan={5}>
                  {g.label}
                </th>
              </tr>
              {g.rows.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <span className="kl2-ptable__pos">
                      <span className="kl2-ptable__name">{p.name}</span>
                      <span className="kl2-ptable__code">{p.code}</span>
                    </span>
                  </th>
                  <td className="kl2-num">{p.quantity}</td>
                  <td className="kl2-num">{p.price ?? ''}</td>
                  <td className="kl2-num kl2-ptable__value">{p.value}</td>
                  <td className="kl2-num kl2-ptable__act">{p.action}</td>
                </tr>
              ))}
            </tbody>
          ))
        )}
        {total && copy.total && !loading ? (
          <tfoot className="kl2-ptable__foot">
            <tr>
              <th scope="row">{copy.total}</th>
              <td />
              <td />
              <td className="kl2-num kl2-ptable__value">{total}</td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
