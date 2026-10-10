'use client';

import { DeviceBar, type WebLinkProps, WebShell } from '@keyline/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { copyJourney, copyV2 } from '../copy';
import { api } from '../lib/api';
import { bootstrapPersona, personaLabel, usePersona } from '../lib/device';

function NextLink({ href, className, children, ...rest }: WebLinkProps) {
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Simulated Swissquote web (laptop persona) on `WebShell`: text wordmark, the one SIMULATED chip for the area
 * (DECISIONS #26). `Approvals` links to /approve (Tier-2 and recovery confirmations with the Safety key).
 */
export function SqWebShell({ children }: { children: ReactNode }) {
  const persona = usePersona();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    bootstrapPersona('lea-laptop');
  }, []);
  const effective = persona ?? 'lea-laptop';
  const signInPage = pathname === '/swissquote';
  const me = useQuery({ queryKey: ['sq', 'me'], queryFn: api.sq.me, retry: false, enabled: !signInPage });

  async function signOut() {
    try {
      await api.sq.logout();
    } finally {
      queryClient.removeQueries({ queryKey: ['sq'] });
      queryClient.removeQueries({ queryKey: ['sq-positions'] });
      router.push('/swissquote');
    }
  }

  const nav = signInPage
    ? []
    : [
        {
          label: copyV2.sqWeb.nav.portfolio,
          href: '/swissquote/portfolio',
          current: pathname === '/swissquote/portfolio',
        },
        { label: copyV2.sqWeb.approvals, href: '/approve' },
      ];

  return (
    <div className="kl-sqweb min-h-dvh bg-bg">
      <DeviceBar persona={effective} label={personaLabel(effective)} />
      <WebShell
        copy={copyJourney.webShell}
        nav={nav}
        client={signInPage ? undefined : me.data?.client.name}
        account={signInPage || !me.data ? undefined : copyV2.sqWeb.account(me.data.client.id)}
        onSignOut={signInPage ? undefined : signOut}
        linkAs={NextLink}
      >
        {children}
      </WebShell>
    </div>
  );
}
