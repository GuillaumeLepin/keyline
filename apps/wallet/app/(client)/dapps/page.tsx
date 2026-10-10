'use client';

import type { Dapp } from '@keyline/shared';
import { ArrowSquareOut, Plugs, Prohibit } from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps } from '@/src/copy';
import { api } from '@/src/lib/api';
import { useLocalWallet } from '@/src/lib/hooks';
import { pendingSendStore } from '@/src/lib/storage';
import { Button, EmptyState, Note, SheetV2, SimulatedBadge, Skeleton, StatementRow } from '@/src/ui';

/**
 * Reviewed apps from the bank's allowlist (SPEC F5). A mock app's `demoRequest` is what the app "asks"; the client
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
      <p className="kl-lead">{copy.dapps.body}</p>
      {wallet === null ? <Note tone="info">{copy.home.noWalletBody}</Note> : null}
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
        {dapps.map((d) => {
          const host = safeHost(d.url);
          const blocked = !d.allowlisted;
          return (
            <StatementRow
              key={d.id}
              label={d.name}
              meta={
                <>
                  <span>{host}</span>
                  {d.simulated ? <SimulatedBadge /> : null}
                </>
              }
              icon={
                blocked ? <Prohibit size={20} aria-hidden="true" /> : <Plugs size={20} aria-hidden="true" />
              }
              status={blocked ? 'danger' : 'ok'}
              statusWord={blocked ? copy.dapps.blocked : copy.dapps.reviewedMeta}
              amount={d.demoRequest ? copyGaps.dapps.connect : undefined}
              chevron={Boolean(d.demoRequest)}
              onClick={d.demoRequest ? () => onSelect(d) : undefined}
              href={d.demoRequest ? undefined : d.url}
              amountSub={d.demoRequest ? undefined : <ArrowSquareOut size={14} aria-hidden="true" />}
            />
          );
        })}
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
