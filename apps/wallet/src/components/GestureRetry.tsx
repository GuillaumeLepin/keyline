'use client';

import { HandTap } from '@phosphor-icons/react/dist/ssr';
import { copySafari } from '../copy';
import { PasskeyGestureError } from '../lib/reads';
import { Button } from '../ui';

/**
 * Safety net for Safari / WebKit: the browser refused the passkey prompt because it was not opened right after a
 * tap. The operation is already prepared, so this button's tap goes straight to the passkey prompt.
 */
export function GestureRetry({
  error,
  onRetry,
  loading = false,
}: {
  error: unknown;
  onRetry: () => void;
  loading?: boolean;
}) {
  if (!(error instanceof PasskeyGestureError)) return null;
  return (
    <div className="kl-stack kl-stack--tight" data-testid="gesture-retry">
      <p className="m-0 flex items-center gap-2 text-14 font-semibold">
        <HandTap size={20} aria-hidden="true" />
        {copySafari.title}
      </p>
      <p className="m-0 text-14 text-ink-2">{copySafari.body}</p>
      <Button variant="primary" full loading={loading} onClick={onRetry}>
        {copySafari.retry}
      </Button>
    </div>
  );
}
