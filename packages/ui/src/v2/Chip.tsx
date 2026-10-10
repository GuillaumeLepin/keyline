import { useId } from 'react';

export const CHIP_SIMULATED_TOOLTIP = 'Simulated for the prototype. See the README’s Real / Simulated table.';

export type ChipProps = {
  /** Default "SIMULATED". */
  label?: string;
  tooltip?: string;
  className?: string;
};

/**
 * v2 honesty marker: a quiet 20 px dashed chip, no fill, inline after the value it qualifies.
 * Focusable so the tooltip is reachable by keyboard and touch (tap focuses it).
 */
export function Chip({ label = 'SIMULATED', tooltip = CHIP_SIMULATED_TOOLTIP, className }: ChipProps) {
  const id = useId();
  return (
    <span className={['kl2-chip', className ?? ''].filter(Boolean).join(' ')}>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the chip carries a tooltip that must be reachable by keyboard */}
      <span className="kl2-chip__mark" tabIndex={0} aria-describedby={id}>
        {label}
      </span>
      <span role="tooltip" id={id} className="kl2-chip__tip">
        {tooltip}
      </span>
    </span>
  );
}
