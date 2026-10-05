export type SimulatedBadgeProps = {
  label?: string;
  tooltip?: string;
  className?: string;
};

export const SIMULATED_TOOLTIP = 'Mocked for the prototype — see README';

/** Dashed honest-mock marker. Placed inline right after the thing it qualifies. */
export function SimulatedBadge({
  label = 'SIMULATED',
  tooltip = SIMULATED_TOOLTIP,
  className,
}: SimulatedBadgeProps) {
  return (
    <span
      className={['kl-sim', className ?? ''].filter(Boolean).join(' ')}
      role="img"
      title={tooltip}
      aria-label={`${label}: ${tooltip}`}
    >
      {label}
    </span>
  );
}
