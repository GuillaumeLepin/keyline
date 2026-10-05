'use client';

import { ArrowSquareOut, Check, Copy } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useState } from 'react';
import { groupHex } from '../format';

export type AddressProps = {
  value: string;
  /** Optional human label shown before the address (e.g. "Lukas Meier"). */
  label?: string;
  /** Number of hex characters emphasised at each end (default 4). */
  emphasis?: number;
  /** Start expanded (full address). */
  expanded?: boolean;
  /** Allow expanding to the full address (default true). The full value must always be reachable. */
  expandable?: boolean;
  copy?: boolean;
  explorerUrl?: string;
  className?: string;
};

/**
 * Mono, groups of 4, first/last 4 emphasised; compact shows 0x + first 4 … last 4,
 * expanded shows every group. Copy and explorer actions are 24 px minimum hit areas inside a row.
 */
export function Address({
  value,
  label,
  emphasis = 4,
  expanded: initialExpanded = false,
  expandable = true,
  copy = true,
  explorerUrl,
  className,
}: AddressProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const groups = groupHex(value);
  const body = value.startsWith('0x') ? value.slice(2) : value;
  const first = body.slice(0, emphasis);
  const last = body.slice(-emphasis);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context); the full value is still visible on expand.
      setExpanded(true);
    }
  }

  return (
    <span className={['kl-addr', className ?? ''].filter(Boolean).join(' ')}>
      {label ? <span className="kl-addr__label">{label}</span> : null}
      {expanded ? (
        <span className="kl-addr__groups" title={value}>
          <span className="kl-addr__group--em">0x</span>
          {groups.map((g, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: groups are positional and static
              key={i}
              className={i === 0 || i === groups.length - 1 ? 'kl-addr__group--em' : undefined}
            >
              {g}
            </span>
          ))}
        </span>
      ) : (
        <span className="kl-addr__groups" title={value}>
          <span className="kl-addr__group--em">0x{first}</span>
          <span>…</span>
          <span className="kl-addr__group--em">{last}</span>
        </span>
      )}
      {expandable ? (
        <button
          type="button"
          className="kl-addr__btn"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : 'Show full address'}
        </button>
      ) : null}
      {copy ? (
        <button type="button" className="kl-addr__btn" onClick={onCopy} aria-label="Copy address">
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      ) : null}
      {explorerUrl ? (
        <a className="kl-addr__btn" href={explorerUrl} target="_blank" rel="noreferrer">
          <ArrowSquareOut size={14} aria-hidden="true" />
          View on Basescan
        </a>
      ) : null}
    </span>
  );
}
