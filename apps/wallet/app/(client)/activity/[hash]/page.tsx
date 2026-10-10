'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyC } from '@/src/copy';
import { formatFiat } from '@/src/i18n/money';
import { api, isApiError } from '@/src/lib/api';
import { txUrl } from '@/src/lib/chain';
import { useNow } from '@/src/lib/hooks';
import { type LocalTransfer, pendingSendStore, transferStore } from '@/src/lib/storage';
import {
  Address,
  Button,
  Disclosure,
  DrawnCheck,
  EmptyState,
  formatClock,
  formatDateTime,
  formatInteger,
  formatSignedUSDC,
  haptic,
  Note,
  Panel,
  ProtectionRing,
  Skeleton,
  StatusSequence,
  type StatusStep,
} from '@/src/ui';

export default function ActivityPage() {
  const params = useParams<{ hash: string }>();
  const router = useRouter();
  const hash = params.hash;
  const [local, setLocal] = useState<LocalTransfer | null | undefined>(undefined);
  useEffect(() => setLocal(transferStore.get(hash)), [hash]);
  // A transfer this device already saw confirmed (or failed) needs no polling: its receipt is final.
  const settled = local?.status === 'confirmed' || local?.status === 'failed';
  const now = useNow(!settled);

  const status = useQuery({
    queryKey: ['userop', hash],
    queryFn: () => api.userops.status(hash),
    enabled: /^0x[0-9a-fA-F]{64}$/.test(hash) && local !== undefined && !settled,
    retry: false,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === 'confirmed' || s === 'failed') return false;
      if (s === 'included') return 4_000;
      return 2_000;
    },
  });

  // One vibration when the transfer lands (or is refused), not on every reload of a finished receipt.
  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const st = status.data?.status;
    if (!st) return;
    if (lastStatus.current && lastStatus.current !== st) {
      if (st === 'confirmed') haptic('success');
      if (st === 'failed') haptic('refusal');
    }
    lastStatus.current = st;
  }, [status.data?.status]);

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

  if (local === undefined) return <ReceiptSkeleton />;

  const s = status.data;
  const current = s?.status ?? local?.status ?? 'sent';
  const failed = current === 'failed';
  const confirmed = current === 'confirmed';
  const txHash = s?.txHash ?? local?.txHash;
  const blockNumber = s?.blockNumber ?? local?.blockNumber;
  const steps = receiptSteps(local, current, blockNumber);
  const r = copyC.receipt;
  const a = copyC.activity;
  const word = failed ? r.failed : confirmed ? copy.home.status.confirmed : r.waitingBlock;
  const reason = failureReason(s) ?? r.unknownReason;
  // Pending: the inner stroke shortens over ~30 s from "Sent" (a typical inclusion on Base Sepolia), then holds.
  const sentAt = local?.timeline.sentAt ? new Date(local.timeline.sentAt).getTime() : now;
  const remaining = Math.max(0.08, 1 - (now - sentAt) / 30_000);
  const isDapp = Boolean(local && local.amountUsdc === 0 && local.summary);

  function retry() {
    if (!local) return;
    // Same transfer, fresh policy decision: the review screen re-evaluates and re-signs.
    pendingSendStore.set({
      to: local.to as `0x${string}`,
      toLabel: local.toLabel,
      knownContact: false,
      amountChf: local.amountChf,
      amountUsdc: local.amountUsdc,
    });
    router.push('/send/review');
  }

  if (!local)
    return (
      <>
        <ScreenHeader title={r.title} backHref="/" />
        <EmptyState
          title={copy.activity.notFoundTitle}
          body={copy.activity.notFoundBody}
          action={
            <Button variant="secondary" href="/activity">
              {a.title}
            </Button>
          }
        />
        <Disclosure summary={copy.common.technicalDetails}>
          <pre className="kl-code">userOpHash {hash}</pre>
        </Disclosure>
      </>
    );

  return (
    <>
      <ScreenHeader title={r.title} backHref="/" />
      <section className="grid justify-items-center gap-2 text-center" data-testid="receipt">
        <ProtectionRing
          size={64}
          state={failed ? 'revoked' : confirmed ? 'success' : 'counting'}
          lit={[true, true, current === 'included']}
          progress={remaining}
          label={word}
        >
          {confirmed ? (
            <span className="text-ok">
              <DrawnCheck size={24} />
            </span>
          ) : null}
        </ProtectionRing>
        <p className="m-0 flex items-center gap-1 text-14 font-semibold" data-testid="receipt-status">
          {word}
        </p>
        <p className="kl-balance__amount m-0">
          {isDapp ? local.toLabel : formatSignedUSDC(-local.amountUsdc)}
        </p>
        <p className="kl-balance__secondary m-0">
          {isDapp ? local.summary : r.line(formatFiat(local.amountChf), local.toLabel)}
        </p>
      </section>

      <StatusSequence steps={steps} />
      {!failed && !confirmed ? (
        <p className="m-0 text-14 text-ink-2" data-testid="receipt-pending">
          {r.waitingBody}
        </p>
      ) : null}
      {failed ? (
        <Note tone="danger" title={copy.activity.failedStep}>
          <span className="grid gap-1" data-testid="receipt-failed">
            <span>
              {r.reason}: {reason}
            </span>
            <span>{r.failedBody}</span>
          </span>
        </Note>
      ) : null}
      {status.isError && !confirmed && !failed ? (
        <Note tone="info">
          {isApiError(status.error) && status.error.offline
            ? copy.common.offlineTitle
            : copy.common.errorTitle}{' '}
          <button type="button" className="kl2-textbtn" onClick={() => status.refetch()}>
            {copy.common.tryAgain}
          </button>
        </Note>
      ) : null}

      <Panel
        rows={[
          ...(isDapp
            ? []
            : [
                { label: a.amount, value: formatSignedUSDC(-local.amountUsdc) },
                { label: a.value, value: formatFiat(local.amountChf) },
              ]),
          { label: a.status, value: word },
          { label: a.date, value: formatDateTime(new Date(local.at)) },
          { label: a.from, value: a.yourWallet },
          { label: copy.activity.to, value: <Address value={local.to} /> },
          { label: a.fee, value: a.feeValue },
          ...(blockNumber ? [{ label: a.block, value: formatInteger(blockNumber) }] : []),
          {
            label: copy.activity.transaction,
            value: txHash ? (
              <Address value={txHash} explorerUrl={txUrl(txHash)} labels={{ show: a.showFullHash }} />
            ) : (
              '—'
            ),
          },
          { label: copy.activity.network, value: copy.activity.networkName },
        ]}
      />
      <Disclosure summary={copy.common.technicalDetails}>
        <pre className="kl-code">
          {a.userOp} {hash}
          {local.decisionId ? `\ndecisionId ${local.decisionId}` : ''}
          {s ? `\nstatus ${s.status}` : ''}
        </pre>
      </Disclosure>
      <div className="kl-actions">
        {failed && !isDapp ? (
          <Button variant="primary" full onClick={retry} data-testid="receipt-retry">
            {r.retry}
          </Button>
        ) : null}
        <Button variant={failed && !isDapp ? 'ghost' : 'primary'} full href="/">
          {r.done}
        </Button>
        {isDapp || failed ? null : (
          <Button variant="ghost" full href={`/contacts?add=1&address=${local.to}`}>
            {a.saveContact}
          </Button>
        )}
      </div>
    </>
  );
}

function ReceiptSkeleton() {
  return (
    <>
      <ScreenHeader title={copyC.receipt.title} backHref="/" />
      <div className="grid justify-items-center gap-2">
        <Skeleton kind="line" width={64} height={64} />
        <Skeleton kind="amount" />
      </div>
      <Skeleton kind="row" count={4} />
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

/** A human reason when the bank or bundler sent one with the failed status; never invented. */
function failureReason(s: Record<string, unknown> | undefined): string | undefined {
  if (!s) return undefined;
  for (const k of ['reason', 'revertReason', 'error', 'message']) {
    const v = s[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}
