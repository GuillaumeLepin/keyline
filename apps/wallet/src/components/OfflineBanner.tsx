'use client';

import { WifiSlash } from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useCopy } from '../copy';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** `true` while the browser reports a network connection (always `true` on the server). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Shown on every route while offline. Queries keep their last data (TanStack pauses them offline), so the
 * screen stays readable; "Try again" refetches everything once the connection is back.
 */
export function OfflineBanner() {
  const online = useOnline();
  const t = useCopy();
  const qc = useQueryClient();
  if (online) return null;
  return (
    <div className="kl-note kl-note--warn flex items-center gap-2" role="status" data-testid="offline-banner">
      <WifiSlash size={18} aria-hidden="true" />
      <span className="flex-1 text-14">{t.copyC.offline.banner}</span>
      <button type="button" className="kl2-textbtn" onClick={() => qc.refetchQueries()}>
        {t.copyC.offline.retry}
      </button>
    </div>
  );
}
