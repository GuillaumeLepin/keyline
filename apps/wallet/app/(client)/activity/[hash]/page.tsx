'use client';

import { Clock, XCircle } from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { bundleFor, copy, copyC, copyWc, usePrefs } from '@/src/copy';
import { formatFiat } from '@/src/i18n/money';
import { api, isApiError } from '@/src/lib/api';
import { failureSentence, statusFailure } from '@/src/lib/failure';
import { txUrl } from '@/src/lib/reads';
import { type LocalTransfer, pendingSendStore, transferStore } from '@/src/lib/storage';
import {
  Address,
  Button,
  DappIdentityRow,
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
  const { lang } = usePrefs().prefs;
  const params = useParams<{ hash: string }>();
  const router = useRouter();
  const hash = params.hash;
  const [local, setLocal] = useState<LocalTransfer | null | undefined>(undefined);
  useEffect(() => setLocal(transferStore.get(hash)), [hash]);
  // A transfer this device already saw confirmed (or failed) needs no polling: its receipt is final.
  const settled = local?.status === 'confirmed' || local?.status === 'failed';

  const status = useQuery({
    queryKey: ['userop', hash],
    queryFn: () => api.userops.status(hash),
    // A failed receipt still asks once (no polling) so the bank's `reason` shows after a reload too.
    enabled:
      /^0x[0-9a-fA-F]{64}$/.test(hash) && local !== undefined && (!settled || local?.status === 'failed'),
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
  // DESIGN-AUDIT WC-13: once in a block the header says "In block N" (clock); only confirmed gets the ring + check.
  const included = current === 'included' && Boolean(txHash);
  const word = failed
    ? r.failed
    : confirmed
      ? copy.home.status.confirmed
      : included
        ? blockNumber
          ? copy.review.inBlock(formatInteger(blockNumber))
          : copy.home.status.confirmed
        : r.waitingBlock;
  const fail = statusFailure(s as Record<string, unknown> | undefined);
  // Only the bank's own sentence adds information; the generic fallback would just repeat the title (D-7).
  const bankReason = failureSentence(bundleFor(lang), fail.code, fail.reason);
  const reason = bankReason && bankReason !== r.unknownReason ? bankReason : undefined;
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
        {/* Audit D-6 / D-8: the ring means protection, never "transfer failed" or "waiting". Failed = XCircle,
            pending = a static Clock (icon + word); only a confirmed transfer gets the closed --ok ring (M13). */}
        {confirmed ? (
          <ProtectionRing size={64} state="success" label={word}>
            <span className="text-ok">
              <DrawnCheck size={24} />
            </span>
          </ProtectionRing>
        ) : failed ? (
          <XCircle size={48} className="text-danger" aria-hidden="true" data-testid="receipt-icon-failed" />
        ) : (
          <Clock size={48} className="text-pending" aria-hidden="true" data-testid="receipt-icon-pending" />
        )}
        <p className="m-0 flex items-center gap-1 text-14 font-semibold" data-testid="receipt-status">
          {word}
        </p>
        {/* DESIGN-AUDIT WC-14: the amount (or the limit granted) is the hero; the app that asked sits under it. */}
        {/* The hero comes from the decoded calldata of the userOp that was signed and sent (never the cap offer). */}
        <p
          className={`kl-balance__amount m-0 ${failed ? 'text-ink-3 line-through' : local.dapp?.unlimited ? 'text-danger' : ''}`}
        >
          {isDapp ? (local.dapp?.amount ?? local.toLabel) : formatSignedUSDC(-local.amountUsdc)}
        </p>
        {local.dapp ? (
          // DESIGN-AUDIT WC-20: the identity row is left-aligned under the amount.
          <div className="w-full justify-self-stretch text-left">
            <DappIdentityRow
              name={local.dapp.name}
              url={local.dapp.url}
              iconUrl={local.dapp.icon}
              verification={local.dapp.verification}
              copy={copyWc.identity}
              compact
            />
          </div>
        ) : null}
        {local.dapp?.unlimited ? (
          <Note tone="danger">{copy.review.dappDangerNote(local.dapp.name)}</Note>
        ) : null}
        {local.dapp?.unlimited ? null : (
          <p className="kl-balance__secondary m-0 [overflow-wrap:anywhere]">
            {isDapp ? local.summary : r.line(formatFiat(local.amountChf), local.toLabel)}
          </p>
        )}
      </section>

      <StatusSequence steps={steps} />
      {!failed && !confirmed && !included ? (
        <p className="m-0 text-14 text-ink-2" data-testid="receipt-pending">
          {r.waitingBody}
        </p>
      ) : null}
      {failed ? (
        <Note tone="danger" title={copy.activity.failedStep}>
          <span className="grid gap-1" data-testid="receipt-failed">
            {reason ? <span>{r.reasonLine(reason)}</span> : null}
            <span>{r.failedBody}</span>
          </span>
        </Note>
      ) : null}
      {status.isError && !confirmed && !failed ? (
        <Note tone="info">
          <span className="block">
            {isApiError(status.error) && status.error.offline
              ? copy.common.offlineTitle
              : copy.common.errorTitle}
          </span>
          <Button variant="ghost" size="sm" onClick={() => status.refetch()}>
            {copy.common.tryAgain}
          </Button>
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
          { label: a.date, value: formatDateTime(new Date(local.at), lang) },
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
          {typeof s?.code === 'string' && s.code ? `\ncode ${s.code}` : ''}
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
      state: status === 'failed' ? 'failed' : rank >= 3 ? 'done' : 'todo',
      meta: meta(t.includedAt),
    },
    {
      label: labels[3],
      state: rank === 4 ? 'done' : status === 'failed' ? 'todo' : rank === 3 ? 'active' : 'todo',
      // (with the block step marked done below when included, so exactly one step is current)
      meta: meta(t.confirmedAt),
    },
  ];
}
