'use client';

import {
  Address,
  Button,
  Disclosure,
  EmptyState,
  ErrorState,
  formatCHF,
  formatClock,
  formatInteger,
  formatSignedUSDC,
  Panel,
  Skeleton,
  StatusSequence,
  type StatusStep,
} from '@keyline/ui';
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy } from '@/src/copy';
import { api } from '@/src/lib/api';
import { addressUrl, txUrl } from '@/src/lib/chain';
import { type LocalTransfer, transferStore } from '@/src/lib/storage';

export default function ActivityPage() {
  const params = useParams<{ hash: string }>();
  const hash = params.hash;
  const [local, setLocal] = useState<LocalTransfer | null | undefined>(undefined);
  useEffect(() => setLocal(transferStore.get(hash)), [hash]);

  const status = useQuery({
    queryKey: ['userop', hash],
    queryFn: () => api.userops.status(hash),
    enabled: /^0x[0-9a-fA-F]{64}$/.test(hash),
    retry: false,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === 'confirmed' || s === 'failed') return false;
      if (s === 'included') return 4_000;
      return 2_000;
    },
  });

  // Persist what the bank reports so the Home statement and this receipt agree after a reload.
  useEffect(() => {
    if (!status.data || !local) return;
    const s = status.data;
    const now = new Date().toISOString();
    const next: LocalTransfer = {
      ...local,
      status: s.status === 'pending' ? 'sent' : s.status,
      txHash: s.txHash ?? local.txHash,
      blockNumber: s.blockNumber ?? local.blockNumber,
      timeline: {
        ...local.timeline,
        includedAt:
          s.status === 'included' || s.status === 'confirmed'
            ? (local.timeline.includedAt ?? now)
            : local.timeline.includedAt,
        confirmedAt:
          s.status === 'confirmed' ? (local.timeline.confirmedAt ?? now) : local.timeline.confirmedAt,
      },
    };
    if (JSON.stringify(next) !== JSON.stringify(local)) {
      transferStore.upsert(next);
      setLocal(next);
    }
  }, [status.data, local]);

  if (local === undefined) return <Skeleton kind="amount" />;

  const s = status.data;
  const failed = s?.status === 'failed';
  const txHash = s?.txHash ?? local?.txHash;
  const blockNumber = s?.blockNumber ?? local?.blockNumber;
  const steps = receiptSteps(local, s?.status ?? local?.status ?? 'sent', blockNumber);

  return (
    <>
      <ScreenHeader title={copy.activity.title} backHref="/" />
      {local ? (
        <section className="kl-balance">
          <p className="kl-balance__amount">
            {local.amountUsdc === 0 && local.summary ? local.toLabel : formatSignedUSDC(-local.amountUsdc)}
          </p>
          <p className="kl-balance__secondary">
            {local.amountUsdc === 0 && local.summary
              ? local.summary
              : copy.review.toLine(formatCHF(local.amountChf), local.toLabel)}
          </p>
        </section>
      ) : (
        <EmptyState title={copy.activity.notFoundTitle} body={copy.activity.notFoundBody} />
      )}

      <StatusSequence steps={steps} />
      {failed ? <ErrorState title={copy.activity.failedStep} body={copy.activity.failedBody} /> : null}
      {status.isError ? (
        <ApiErrorState error={status.error} body={copy.common.errorBody} onRetry={() => status.refetch()} />
      ) : null}

      <Panel
        rows={[
          ...(local
            ? [
                {
                  label: copy.activity.to,
                  value: <Address value={local.to} explorerUrl={addressUrl(local.to)} />,
                },
              ]
            : []),
          { label: copy.review.networkFee, value: copy.common.networkFeePaid },
          {
            label: copy.activity.transaction,
            value: txHash ? <Address value={txHash} explorerUrl={txUrl(txHash)} /> : '—',
          },
          { label: copy.activity.network, value: copy.activity.networkName },
        ]}
      />
      {txHash ? (
        <a className="kl-link" href={txUrl(txHash)} target="_blank" rel="noreferrer">
          {copy.common.viewOnBasescan}
          <ArrowSquareOut size={16} aria-hidden="true" />
        </a>
      ) : null}
      <Disclosure summary={copy.common.technicalDetails}>
        <pre className="kl-code">
          userOpHash {hash}
          {local?.decisionId ? `\ndecisionId ${local.decisionId}` : ''}
          {s ? `\nstatus ${s.status}` : ''}
        </pre>
      </Disclosure>
      <div className="kl-actions">
        <Button variant="primary" full href="/">
          {copy.common.done}
        </Button>
      </div>
    </>
  );
}

function receiptSteps(
  local: LocalTransfer | null,
  status: 'pending' | 'sent' | 'signed' | 'included' | 'confirmed' | 'failed',
  blockNumber: number | undefined,
): StatusStep[] {
  const labels = copy.review.sequence;
  const t = local?.timeline ?? {};
  const meta = (iso?: string) => (iso ? formatClock(new Date(iso)) : undefined);
  const rank = status === 'confirmed' ? 4 : status === 'included' ? 3 : status === 'failed' ? 2 : 2;
  const blockLabel = blockNumber ? copy.review.inBlock(formatInteger(blockNumber)) : labels[2];
  return [
    { label: labels[0], state: 'done', meta: meta(t.signedAt) },
    {
      label: labels[1],
      state: rank > 2 ? 'done' : status === 'failed' ? 'done' : 'active',
      meta: meta(t.sentAt),
    },
    {
      label: status === 'failed' ? copy.activity.failedStep : blockLabel,
      state: status === 'failed' ? 'failed' : rank > 3 ? 'done' : rank === 3 ? 'active' : 'todo',
      meta: meta(t.includedAt),
    },
    {
      label: labels[3],
      state: rank === 4 ? 'done' : status === 'failed' ? 'todo' : rank === 3 ? 'active' : 'todo',
      meta: meta(t.confirmedAt),
    },
  ];
}
