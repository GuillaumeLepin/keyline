'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { DeskLayout } from '@/src/ui';
import { copy } from '../copy';
import { bootstrapPersona } from '../lib/device';
import { deskTokenStore } from '../lib/storage';
import { OfflineBanner } from './OfflineBanner';

/** Swissquote desk chrome. The operator token (SIMULATED SSO) lives in sessionStorage; no token → /desk login. */
export function DeskShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    bootstrapPersona('desk');
    setToken(deskTokenStore.get());
  }, []);
  const signOut = useCallback(() => {
    deskTokenStore.clear();
    setToken(null);
    router.push('/desk');
  }, [router]);
  const signedIn = Boolean(token);
  return (
    <DeskLayout
      operator={signedIn ? copy.desk.operatorName : undefined}
      onSignOut={signedIn ? signOut : undefined}
      footer={copy.desk.footer}
      nav={
        signedIn
          ? [
              {
                label: copy.desk.navQueue,
                href: '/desk/queue',
                current: pathname.startsWith('/desk/queue') || pathname.startsWith('/desk/requests'),
              },
              {
                label: copy.desk.navAudit,
                href: '/desk/audit',
                current: pathname.startsWith('/desk/audit'),
              },
            ]
          : undefined
      }
    >
      <DeskTokenContext.Provider value={{ token: token ?? null, ready: token !== undefined, setToken }}>
        <OfflineBanner />
        {children}
      </DeskTokenContext.Provider>
    </DeskLayout>
  );
}

const DeskTokenContext = createContext<{
  token: string | null;
  ready: boolean;
  setToken: (t: string | null) => void;
}>({ token: null, ready: false, setToken: () => undefined });

/** Current operator token; redirects to the login when the desk is opened without one. */
export function useDeskToken(requireAuth = true): {
  token: string | null;
  ready: boolean;
  save: (t: string) => void;
} {
  const ctx = useContext(DeskTokenContext);
  const router = useRouter();
  useEffect(() => {
    if (requireAuth && ctx.ready && !ctx.token) router.replace('/desk');
  }, [requireAuth, ctx.ready, ctx.token, router]);
  const save = useCallback(
    (t: string) => {
      deskTokenStore.set(t);
      ctx.setToken(t);
    },
    [ctx],
  );
  return { token: ctx.token, ready: ctx.ready, save };
}
