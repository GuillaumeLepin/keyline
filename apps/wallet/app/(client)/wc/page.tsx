'use client';

import { useEffect, useState } from 'react';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copyWc } from '@/src/copy';
import { useLocalWallet } from '@/src/lib/hooks';
import { Note, Skeleton } from '@/src/ui';
import { ConnectCard } from '@/src/wc/ConnectCard';
import { ConnectedApps, RequestInbox } from '@/src/wc/ConnectedApps';

/**
 * SPEC §11.4 Connect — `/wc?uri=wc:…` (a WalletConnect deep link) connects at once; otherwise paste or scan. The
 * search param is read after mount (no Suspense boundary needed; the link is never server-rendered).
 */
export default function WcPage() {
  const { wallet } = useLocalWallet();
  const [uri, setUri] = useState<string | undefined>(undefined);
  const [read, setRead] = useState(false);
  useEffect(() => {
    setUri(new URLSearchParams(window.location.search).get('uri') ?? undefined);
    setRead(true);
  }, []);

  return (
    <>
      <ScreenHeader title={copyWc.connect.title} backHref="/dapps" />
      {wallet === undefined || !read ? (
        <Skeleton kind="block" height={200} />
      ) : wallet === null || wallet.status !== 'deployed' ? (
        <Note tone="info">{copyWc.proposal.needsWallet}</Note>
      ) : (
        <>
          <RequestInbox />
          <ConnectCard initialUri={uri} />
          <ConnectedApps />
        </>
      )}
    </>
  );
}
