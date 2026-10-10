import type { ReactNode } from 'react';

export type RowActionProps = {
  /** e.g. "Move to Keyline". Rendered as an ink, underlined text button (44 px target). */
  label: string;
  onClick?: () => void;
  /** Present and non-empty → the action is unavailable; the reason is shown next to it. */
  disabledReason?: string;
  /** Opens the explanation (e.g. the Bitcoin "Why?" sheet). Only shown with `disabledReason`. */
  onWhy?: () => void;
  /** Default "Why?". */
  whyLabel?: string;
  /** Accessible name when the visible label is ambiguous in a table, e.g. "Move ETH to Keyline". */
  ariaLabel?: string;
  /** In flight (e.g. a move request): the label stays, the button is busy. */
  busy?: boolean;
  icon?: ReactNode;
};

/**
 * The per-row action of `AssetRow` and `PositionsTable`. Ink + underline like every link (v2 §3);
 * when unavailable the label is greyed with `aria-disabled` and a "Why?" link explains it.
 */
export function RowAction({
  label,
  onClick,
  disabledReason,
  onWhy,
  whyLabel = 'Why?',
  ariaLabel,
  busy = false,
  icon,
}: RowActionProps) {
  if (disabledReason) {
    return (
      <span className="kl2-rowact">
        <span className="kl2-rowact__off" aria-disabled="true">
          {label}
          <span className="kl2-sr">: {disabledReason}</span>
        </span>
        {onWhy ? (
          <button type="button" className="kl2-textbtn" onClick={onWhy}>
            {whyLabel}
          </button>
        ) : null}
      </span>
    );
  }
  return (
    <span className="kl2-rowact">
      <button
        type="button"
        className="kl2-textbtn"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-busy={busy || undefined}
        disabled={busy}
      >
        {icon}
        {label}
      </button>
    </span>
  );
}
