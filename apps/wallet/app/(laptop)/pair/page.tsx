'use client';

import { Skeleton } from '@keyline/ui';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { bootstrapPersona } from '@/src/lib/device';

/**
 * DECISIONS #28: the 6-digit pairing flow is gone. The laptop signed in to Swissquote web becomes the Safety key with
 * one confirmation there, so `/pair` (and `/pair?device=…`, which still pins the persona) redirects to `/swissquote`.
 */
export default function PairRedirect() {
  const router = useRouter();
  useEffect(() => {
    bootstrapPersona('lea-laptop');
    router.replace('/swissquote');
  }, [router]);
  return <Skeleton kind="block" height={96} />;
}
