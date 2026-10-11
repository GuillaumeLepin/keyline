export type InboxBadgeProps = {
  count: number;
  /** Screen-reader sentence, e.g. "2 requests waiting". Required: the number alone means nothing. */
  label: string;
};

/** Pending-request count on the dApps tab / alerts row. Ink, not accent (accent is focus, active, ring). Nothing at 0; `9+` above 9. */
export function InboxBadge({ count, label }: InboxBadgeProps) {
  if (count <= 0) return null;
  return (
    <span className="kl2-badge" role="status" aria-label={label}>
      <span aria-hidden="true">{count > 9 ? '9+' : count}</span>
    </span>
  );
}
