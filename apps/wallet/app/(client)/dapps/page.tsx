'use client';

import type { Dapp } from '@keyline/shared';
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps, copyWc } from '@/src/copy';
import { api } from '@/src/lib/api';
import { useLocalWallet } from '@/src/lib/hooks';
import { pendingSendStore } from '@/src/lib/storage';
import { Button, DappIdentityRow, EmptyState, Note, SheetV2, SimulatedBadge, Skeleton } from '@/src/ui';
import { ConnectCard } from '@/src/wc/ConnectCard';
import { ConnectedApps, RequestInbox } from '@/src/wc/ConnectedApps';

/**
 * SPEC §11.4: WalletConnect first — requests waiting for an answer, Connect (paste / scan), connected apps.
 * Below, reviewed apps from the bank's allowlist (SPEC F5). A mock app's `demoRequest` is what the app "asks"; the client
 * submits it as `POST /policy/evaluate { kind: 'dapp' }` from /send/review, where the bank's decode is shown — the
 * app's own description is never trusted as the review.
 */
export default function DappsPage() {
  const { wallet } = useLocalWallet();
  const router = useRouter();
  const [selected, setSelected] = useState<Dapp | null>(null);
  const dapps = useQuery({ queryKey: ['dapps'], queryFn: api.dapps, retry: false });

  const connect = (dapp: Dapp) => {
    if (!dapp.demoRequest) return;
    const first = dapp.demoRequest.calls[0];
    if (!first) return;
    pendingSendStore.set({
      to: first.to,
      toLabel: dapp.name,
      knownContact: dapp.allowlisted,
      amountChf: 0,
      amountUsdc: 0,
      dapp: {
        id: dapp.id,
        name: dapp.name,
        description: dapp.demoRequest.description,
        calls: dapp.demoRequest.calls,
      },
    });
    router.push('/send/review');
  };

  return (
    <>
      <ScreenHeader title={copy.dapps.title} backHref="/" />
      {wallet === null ? <Note tone="info">{copy.home.noWalletBody}</Note> : null}
      {wallet?.status === 'deployed' ? (
        <>
          <RequestInbox />
          <ConnectedApps />
          <ConnectCard />
        </>
      ) : wallet ? (
        <Note tone="info">{copyWc.request.notDeployed}</Note>
      ) : null}
      {dapps.isPending ? (
        <Skeleton kind="row" count={4} />
      ) : dapps.isError ? (
        <ApiErrorState error={dapps.error} body={copyGaps.dapps.loadError} onRetry={() => dapps.refetch()} />
      ) : dapps.data.length === 0 ? (
        <EmptyState title={copyGaps.dapps.empty} />
      ) : (
        <>
          <DappSection
            title={copy.dapps.reviewed}
            dapps={dapps.data.filter((d) => d.allowlisted)}
            onSelect={setSelected}
          />
          <DappSection
            title={copy.dapps.notReviewed}
            dapps={dapps.data.filter((d) => !d.allowlisted)}
            onSelect={setSelected}
          />
          <Note tone="info">{copy.dapps.note}</Note>
        </>
      )}
      <SheetV2
        contained
        open={selected !== null}
        title={selected ? copyGaps.dapps.requestTitle(selected.name) : ''}
        onClose={() => setSelected(null)}
      >
        {selected?.demoRequest ? (
          <div className="kl-stack">
            <p className="kl-lead">{copyGaps.dapps.requestBody}</p>
            <blockquote className="kl-code">{selected.demoRequest.description}</blockquote>
            {selected.simulated ? (
              <p className="text-12 text-ink-3">
                {copyGaps.dapps.simulatedApp} <SimulatedBadge />
              </p>
            ) : null}
            <Button variant="primary" full disabled={!wallet} onClick={() => connect(selected)}>
              {copyGaps.dapps.review}
            </Button>
            <Button variant="ghost" full onClick={() => setSelected(null)}>
              {copy.common.cancel}
            </Button>
          </div>
        ) : null}
      </SheetV2>
    </>
  );
}

function DappSection({
  title,
  dapps,
  onSelect,
}: {
  title: string;
  dapps: Dapp[];
  onSelect: (d: Dapp) => void;
}) {
  if (dapps.length === 0) return null;
  return (
    <section className="kl-stack">
      <div className="kl-section">
        <h2 className="kl-section__title">{title}</h2>
      </div>
      <ul className="kl-list">
        {dapps.map((d) => (
          <li key={d.id} className="border-b border-line py-2">
            <DappIdentityRow
              name={d.name}
              url={d.url}
              verification={d.allowlisted ? 'verified' : 'flagged'}
              copy={copyWc.identity}
              compact
              trailing={
                d.demoRequest ? (
                  <button type="button" className="kl2-textbtn" onClick={() => onSelect(d)}>
                    {copyGaps.dapps.connect}
                  </button>
                ) : (
                  <a
                    className="kl2-iconbtn"
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${d.name} (${safeHost(d.url)})`}
                  >
                    <ArrowSquareOut size={20} aria-hidden="true" />
                  </a>
                )
              }
            />
            {/* WC-18: the chip belongs right after the name; DappIdentityRow has no badge slot yet (asked of
                design-system), so it sits directly under the name for now. */}
            {d.simulated ? (
              <span className="ml-[52px] inline-block">
                <SimulatedBadge />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
