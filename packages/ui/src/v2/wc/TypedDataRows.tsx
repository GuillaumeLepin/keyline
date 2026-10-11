import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Address } from '../../components/Address';
import type { TypedRow } from './typed-data';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type TypedDataRowsProps = {
  rows: readonly TypedRow[];
  /** Eyebrow, e.g. the primary type in words: "Permit" / "Order". */
  title?: string;
  /** Who defines the data, e.g. "USDC · Base Sepolia · 0x036C…CF7e" (12 px under the title). */
  domain?: string;
  /** Translated `Show full address` / `Hide` for address values. */
  addressLabels?: { show?: string; hide?: string };
};

/**
 * EIP-712 data as label/value rows on the statement grid: nested structs are indented 16 px per level
 * under their (uppercase, meta) header; values right-aligned, addresses in mono; a danger row (an
 * unlimited allowance, a permission that never expires) is red with an icon and its reason under it.
 */
export function TypedDataRows({ rows, title, domain, addressLabels }: TypedDataRowsProps) {
  return (
    <section className="kl2-typed" aria-label={title}>
      {title ? <p className="kl2-typed__title">{title}</p> : null}
      {domain ? <p className="kl2-typed__domain">{domain}</p> : null}
      <dl className="kl2-typed__rows">
        {rows.map((r, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional (same label can repeat)
            key={i}
            className={[
              'kl2-typed__row',
              r.group ? 'kl2-typed__row--group' : '',
              r.danger ? 'kl2-typed__row--danger' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ paddingLeft: r.depth * 16 }}
          >
            <dt>{r.label}</dt>
            {r.group ? (
              <dd />
            ) : (
              <dd className={r.mono ? 'kl2-typed__mono' : undefined}>
                {r.danger ? <WarningCircle size={16} weight="bold" aria-hidden="true" /> : null}
                {ADDRESS.test(r.value) ? (
                  <Address value={r.value} copy={false} labels={addressLabels} />
                ) : (
                  r.value
                )}
              </dd>
            )}
            {r.danger && r.note ? <p className="kl2-typed__note">{r.note}</p> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
