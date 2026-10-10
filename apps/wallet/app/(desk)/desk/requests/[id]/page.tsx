'use client';

import type { DeskQueueItem, GuardianConfirmation, GuardianKind } from '@keyline/shared';
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { useDeskToken } from '@/src/components/DeskShell';
import { copy } from '@/src/copy';
import { api } from '@/src/lib/api';
import { addressUrl, txUrl } from '@/src/lib/chain';
import { shortId, statusLabel, useDeskQueue } from '@/src/lib/desk';
import {
  Address,
  Button,
  CountdownRing,
  Disclosure,
  EmptyState,
  formatClock,
  formatDateTime,
  Note,
  Panel,
  type PanelRow,
  SheetV2,
  SimulatedBadge,
  Skeleton,
  TextField,
} from '@/src/ui';

const GRACE_MS = 180_000;
const CLIENT_KINDS: readonly GuardianKind[] = ['swissquote', 'safety-key', 'emergency-card'];

export default function DeskRequestPage() {
  const params = useParams<{ id: string }>();
  const { token, ready } = useDeskToken();
  const queue = useDeskQueue(token);
  if (!ready || !token || queue.isPending) return <Skeleton kind="block" height={240} />;
  if (queue.isError)
    return <ApiErrorState error={queue.error} body={copy.common.errorBody} onRetry={() => queue.refetch()} />;
  const item = queue.data.items.find((i) => i.recovery.id === params.id);
  if (!item) {
    return (
      <EmptyState
        title={copy.desk.notFound}
        body={copy.desk.queueEmptyBody}
        action={
          <Button variant="secondary" href="/desk/queue">
            {copy.desk.back}
          </Button>
        }
      />
    );
  }
  return <RequestDetail item={item} token={token} />;
}

function RequestDetail({ item, token }: { item: DeskQueueItem; token: string }) {
  const s = copy.desk;
  const r = item.recovery;
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [lastAction, setLastAction] = useState<'approve' | 'refuse' | 'override' | null>(null);
  const act = useMutation({
    mutationFn: (action: 'approve' | 'refuse' | 'override') =>
      api.desk.operator(token, r.id, { action, note: note.trim() }),
    onSuccess: (_next, action) => {
      setLastAction(action);
      setOverriding(false);
      queryClient.invalidateQueries({ queryKey: ['desk-queue'] });
      queryClient.invalidateQueries({ queryKey: ['desk-events'] });
    },
  });

  const identity = r.identity;
  const verdict = identity.verdict;
  const pending = verdict === 'pending';
  // Override (demo): the bank re-signs a pass, but the operator's screen must keep the failed checks visible
  // (CLAUDE.md §2). The original signals tell which check failed; the verdict row says who overrode it.
  const overridden = !pending && (identity.operatorNote ?? '').toLowerCase().startsWith('override');
  const signalText = item.signals.join(' ').toLowerCase();
  const livenessFailedOriginally = /liveness/.test(signalText);
  const nameFailedOriginally = /name|mismatch|document/.test(signalText) || !livenessFailedOriginally;
  const idCheck = overridden ? !nameFailedOriginally : identity.idCheckPassed;
  const liveness = overridden ? !livenessFailedOriginally : identity.livenessPassed;
  const signalRows: PanelRow[] = [
    {
      label: s.sig.email,
      value: identity.emailOtpPassed
        ? s.sigValues.passed
        : pending
          ? copy.common.pending
          : s.sigValues.failed,
      tone: identity.emailOtpPassed ? 'ok' : pending ? 'default' : 'danger',
    },
    {
      label: s.sig.doc,
      value:
        idCheck === undefined
          ? copy.common.pending
          : idCheck
            ? s.sigValues.nameMatch
            : s.sigValues.nameMismatch,
      tone: idCheck === undefined ? 'default' : idCheck ? 'ok' : 'danger',
    },
    {
      label: s.sig.liveness,
      value:
        liveness === undefined ? copy.common.pending : liveness ? s.sigValues.passed : s.sigValues.failed,
      tone: liveness === undefined ? 'default' : liveness ? 'ok' : 'danger',
    },
    {
      label: s.sig.verdict,
      value: pending
        ? copy.common.pending
        : overridden
          ? s.sigValues.verdictOverridden
          : verdict === 'pass'
            ? s.sigValues.verdictPass
            : s.sigValues.verdictFail,
      tone: pending ? 'default' : overridden ? 'default' : verdict === 'pass' ? 'ok' : 'danger',
    },
  ];
  if (overridden) {
    const at = 'issuedAt' in identity ? new Date(identity.issuedAt * 1000) : undefined;
    signalRows.push({
      label: s.operatorRow,
      value: `${s.operatorName}${at ? ` · ${formatClock(at)}` : ''}${identity.operatorNote ? ` · ${identity.operatorNote}` : ''}`,
    });
  }

  const confirmationRows: PanelRow[] = CLIENT_KINDS.map((kind) => {
    const c = r.guardianConfirmations.find((x) => x.kind === kind && !x.void);
    return { label: copy.desk.kinds[kind], value: confirmationValue(kind, c, r.status) };
  });

  const timer = item.timer;
  const canApprove = r.status === 'identity-pending' && r.waitingFor === 'operator';
  const canRefuse = r.status === 'identity-pending' || r.status === 'awaiting-guardians';
  const canOverride = r.status === 'identity-refused';
  const overrideStuck = lastAction === 'override' && r.status === 'awaiting-guardians';

  return (
    <div className="kl-stack">
      <div className="kl-stack kl-stack--tight">
        <div className="self-start">
          <Button variant="ghost" size="sm" href="/desk/queue">
            {copy.desk.back}
          </Button>
        </div>
        <h1 className="kl-title">{s.detailTitle(item.client.name, shortId(r.id))}</h1>
        <p className="kl-eyebrow">
          {s.requestedFrom(
            r.requestedFrom.deviceLabel,
            copy.demo.city,
            formatDateTime(new Date(r.createdAt)),
          )}{' '}
          · {statusLabel(r.status)}
        </p>
      </div>

      <div className="kl-desk__grid">
        <section className="kl-stack col-span-12 lg:col-span-6">
          <div className="kl-section">
            <h2 className="kl-section__title">
              {s.identitySignals} <SimulatedBadge />
            </h2>
          </div>
          <Panel rows={signalRows} />
          {r.reasons.length > 0 ? (
            <Note tone="danger" title={copy.desk.reasons}>
              {r.reasons.join(' · ')}
            </Note>
          ) : null}
        </section>

        <section className="kl-stack col-span-12 lg:col-span-6">
          <div className="kl-section">
            <h2 className="kl-section__title">{s.confirmations}</h2>
          </div>
          <Panel
            rows={confirmationRows}
            footnote={s.confOf(item.confirmations.have, item.confirmations.need)}
          />
          {r.guardianRefusals.length > 0 ? (
            <Note tone="warn" title={copy.desk.refusals}>
              {r.guardianRefusals
                .map((g) => `${copy.desk.kinds[g.kind]}: ${g.reasons.join(', ')}`)
                .join(' · ')}
            </Note>
          ) : null}
        </section>

        <section className="kl-stack col-span-12 lg:col-span-6">
          <div className="kl-section">
            <h2 className="kl-section__title">{s.timer}</h2>
          </div>
          {timer ? (
            <div className="flex items-center gap-4">
              <CountdownRing
                endsAt={new Date(timer.executeAfter)}
                durationMs={GRACE_MS}
                size={64}
                doneLabel=""
              />
              <div className="kl-stack kl-stack--tight">
                <p className="text-16">{s.timerEnds(formatClock(new Date(timer.executeAfter)))}</p>
                <p className="text-12 text-ink-3">{s.timerSource}</p>
                {r.onchain.executedTxHash ? <TxLink hash={r.onchain.executedTxHash} /> : null}
                {r.onchain.finalizedTxHash ? <TxLink hash={r.onchain.finalizedTxHash} /> : null}
              </div>
            </div>
          ) : r.status === 'awaiting-guardians' ? (
            <p className="text-14 text-ink-2">{s.timerNone}</p>
          ) : r.onchain.cancelledTxHash ? (
            <TxLink hash={r.onchain.cancelledTxHash} />
          ) : (
            <p className="text-14 text-ink-3">—</p>
          )}
        </section>

        <section className="kl-stack col-span-12 lg:col-span-6">
          <div className="kl-section">
            <h2 className="kl-section__title">{copy.desk.wallet}</h2>
          </div>
          <Panel
            rows={[
              {
                label: copy.desk.wallet,
                value: <Address value={r.walletAddress} explorerUrl={addressUrl(r.walletAddress)} />,
              },
              {
                label: copy.desk.newOwner,
                value: (
                  <Address
                    value={r.newOwner.signerProxyAddress}
                    explorerUrl={addressUrl(r.newOwner.signerProxyAddress)}
                  />
                ),
              },
              { label: copy.desk.client, value: `${item.client.name} · ${item.client.id}` },
            ]}
          />
        </section>
      </div>

      {overrideStuck ? <Note tone="warn">{s.overrideResult}</Note> : null}
      {lastAction && !overrideStuck ? <Note tone="ok">{copy.desk.actionDone}</Note> : null}
      {act.isError ? (
        <ApiErrorState
          error={act.error}
          body={copy.common.errorBody}
          onRetry={() => lastAction && act.mutate(lastAction)}
        />
      ) : null}

      {canApprove || canRefuse || canOverride ? (
        <section className="kl-stack max-w-[560px]">
          {canRefuse ? (
            <TextField label={s.refuseNote} value={note} onChange={(e) => setNote(e.target.value)} />
          ) : null}
          <div className="flex gap-3 flex-wrap">
            {canApprove ? (
              <Button variant="primary" loading={act.isPending} onClick={() => act.mutate('approve')}>
                {s.approve}
              </Button>
            ) : null}
            {canRefuse ? (
              <Button
                variant="secondary"
                disabled={note.trim().length === 0}
                loading={act.isPending}
                onClick={() => act.mutate('refuse')}
              >
                {s.refuse}
              </Button>
            ) : null}
            {canOverride ? (
              <Button variant="danger-text" onClick={() => setOverriding(true)}>
                {s.override}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <SheetV2 open={overriding} title={s.overrideTitle} onClose={() => setOverriding(false)}>
        <div className="kl-stack">
          <p className="kl-lead">{s.overrideBody}</p>
          <TextField label={copy.desk.noteField} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="danger" full loading={act.isPending} onClick={() => act.mutate('override')}>
            {s.overrideYes}
          </Button>
          <Button variant="ghost" full onClick={() => setOverriding(false)}>
            {s.overrideNo}
          </Button>
        </div>
      </SheetV2>

      <Disclosure summary={copy.common.technicalDetails}>
        {item.signals.length > 0 ? <pre className="kl-code">{item.signals.join('\n')}</pre> : null}
        <pre className="kl-code">
          {JSON.stringify(
            { id: r.id, status: r.status, waitingFor: r.waitingFor, onchain: r.onchain },
            null,
            2,
          )}
        </pre>
      </Disclosure>
    </div>
  );
}

function confirmationValue(
  kind: GuardianKind,
  c: GuardianConfirmation | undefined,
  status: DeskQueueItem['recovery']['status'],
) {
  const s = copy.desk;
  if (!c) {
    if (
      status === 'finalized' ||
      status === 'executed-waiting' ||
      status === 'cancelled' ||
      status === 'identity-refused'
    )
      return s.conf.notUsed;
    return kind === 'swissquote' ? s.conf.pending : s.conf.pending;
  }
  return (
    <span className="kl-stack kl-stack--tight">
      <span>{s.conf.confirmed(formatClock(new Date(c.at)))}</span>
      {c.txHash ? (
        <TxLink hash={c.txHash} />
      ) : c.mode === 'signature' ? (
        <span className="text-12 text-ink-3">{copy.desk.heldSignature}</span>
      ) : null}
    </span>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a className="kl-link" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {copy.common.viewOnBasescan}
      <ArrowSquareOut size={16} aria-hidden="true" />
    </a>
  );
}
