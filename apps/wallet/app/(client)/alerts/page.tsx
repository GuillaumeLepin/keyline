'use client';

import type { Alert, PolicyDecision } from '@keyline/shared';
import {
  Button,
  CountdownRing,
  EmptyState,
  formatClock,
  formatInteger,
  formatRelative,
  Note,
  Skeleton,
  StatusSequence,
  type StatusStep,
} from '@keyline/ui';
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { Hex } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps } from '@/src/copy';
import { api } from '@/src/lib/api';
import {
  buildOpFromDecision,
  PasskeyCancelledError,
  pollUserOp,
  type SubmitStage,
  sponsorSignAndSend,
  txUrl,
} from '@/src/lib/chain';
import { getDeviceLabel } from '@/src/lib/device';
import { useAlerts, useLocalWallet, useNow } from '@/src/lib/hooks';
import type { LocalWallet } from '@/src/lib/storage';

const GRACE_MS = 180_000;

/** Lea's existing devices: a recovery started elsewhere is the one thing the owner must be able to veto (F4b). */
export default function AlertsPage() {
  const { wallet } = useLocalWallet();
  const alerts = useAlerts(wallet?.address);

  return (
    <>
      <ScreenHeader title={copy.alerts.title} backHref="/" />
      {wallet === undefined || (wallet && alerts.isPending) ? (
        <Skeleton kind="row" count={2} />
      ) : wallet === null ? (
        <EmptyState title={copy.alerts.emptyTitle} body={copyGaps.alerts.noWallet} />
      ) : alerts.isError || !alerts.data ? (
        <ApiErrorState error={alerts.error} body={copy.common.errorBody} onRetry={() => alerts.refetch()} />
      ) : alerts.data.length === 0 ? (
        <EmptyState title={copy.alerts.emptyTitle} body={copy.alerts.emptyBody} />
      ) : (
        <div className="kl-stack">
          {alerts.data.map((alert) => (
            <AlertCard key={alert.id} alert={alert} wallet={wallet} />
          ))}
        </div>
      )}
    </>
  );
}

function AlertCard({ alert, wallet }: { alert: Alert; wallet: LocalWallet }) {
  const now = useNow(alert.kind === 'recovery-started');
  const ago = formatRelative(new Date(alert.at), now);
  switch (alert.kind) {
    case 'recovery-started':
      return <StartedAlert alert={alert} wallet={wallet} ago={ago} />;
    case 'recovery-refused':
      return (
        <Note tone="info" title={copy.alerts.refusedTitle}>
          <p>
            {copy.alerts.refusedBody(alert.requestedFrom.deviceLabel, formatClock(new Date(alert.at), false))}
          </p>
          <Button variant="ghost" size="sm" href="/security">
            {copy.alerts.seeLog}
          </Button>
        </Note>
      );
    case 'recovery-cancelled':
      return (
        <Note tone="ok" title={copyGaps.alerts.cancelledTitle}>
          {copy.alerts.cancelled}
          {alert.txHash ? <TxLink hash={alert.txHash} /> : null}
        </Note>
      );
    case 'recovery-finalized':
      return (
        <Note tone="warn" title={copyGaps.alerts.finalizedTitle}>
          {alert.body}
          {alert.txHash ? <TxLink hash={alert.txHash} /> : null}
        </Note>
      );
    default:
      return null;
  }
}

type CancelPhase =
  | { kind: 'idle' }
  | { kind: 'running'; stage: SubmitStage | 'policy' }
  | { kind: 'sent'; userOpHash: Hex }
  | { kind: 'included'; userOpHash: Hex; txHash: Hex; blockNumber?: number }
  | { kind: 'cancelled'; txHash: Hex; blockNumber?: number }
  | { kind: 'refused'; decision: PolicyDecision }
  | { kind: 'error'; error: unknown; cancelled: boolean };

/** Cancel = the Safe calls `cancelRecovery()` itself: policy (`cancel-recovery`) → sponsor → passkey → send. */
function StartedAlert({ alert, wallet, ago }: { alert: Alert; wallet: LocalWallet; ago: string }) {
  const s = copy.alerts;
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<CancelPhase>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const executeAfter = alert.executeAfter ? new Date(alert.executeAfter) : undefined;

  const run = useCallback(async () => {
    try {
      setPhase({ kind: 'running', stage: 'policy' });
      const decision = await api.policy.evaluate({
        kind: 'cancel-recovery',
        walletAddress: wallet.address,
        calls: [],
        chfValue: 0,
        recipientAddress: wallet.address,
        deviceLabel: getDeviceLabel(),
      });
      if (decision.verdict !== 'approve') {
        setPhase({ kind: 'refused', decision });
        return;
      }
      setPhase({ kind: 'running', stage: 'building' });
      const unsigned = await buildOpFromDecision(wallet, decision);
      const result = await sponsorSignAndSend({
        wallet,
        unsignedUserOp: unsigned,
        decision,
        onStage: (stage) => setPhase({ kind: 'running', stage }),
      });
      setPhase({ kind: 'sent', userOpHash: result.userOpHash });
      const final = await pollUserOp(result.userOpHash, (st) => {
        if (st.status === 'included' && st.txHash)
          setPhase({
            kind: 'included',
            userOpHash: result.userOpHash,
            txHash: st.txHash as Hex,
            blockNumber: st.blockNumber,
          });
      });
      if (final.status === 'failed' || !final.txHash) {
        setPhase({ kind: 'error', error: new Error(copy.activity.failedStep), cancelled: false });
        return;
      }
      setPhase({ kind: 'cancelled', txHash: final.txHash as Hex, blockNumber: final.blockNumber });
      queryClient.invalidateQueries({ queryKey: ['alerts', wallet.address] });
    } catch (error) {
      setPhase({ kind: 'error', error, cancelled: error instanceof PasskeyCancelledError });
    }
  }, [wallet, queryClient]);

  if (dismissed) return null;

  if (phase.kind === 'cancelled') {
    return (
      <Note tone="ok" title={copyGaps.alerts.cancelledTitle}>
        <p>{s.cancelled}</p>
        <StatusSequence steps={cancelSequence(phase)} />
        <TxLink hash={phase.txHash} />
      </Note>
    );
  }

  const busy = phase.kind === 'running' || phase.kind === 'sent' || phase.kind === 'included';
  return (
    <Note tone="danger" title={s.startedTitle}>
      <p>{s.startedBody('Zürich', ago, executeAfter ? formatClock(executeAfter) : '—')}</p>
      {executeAfter ? (
        <div className="flex justify-center">
          <CountdownRing
            endsAt={executeAfter}
            durationMs={GRACE_MS}
            size={120}
            doneLabel={copy.desk.status.finalized}
          />
        </div>
      ) : null}
      {phase.kind === 'refused' ? <p>{copy.common.policyRefused}</p> : null}
      {phase.kind === 'error' && phase.cancelled ? <p>{copy.review.passkeyCancelled}</p> : null}
      {phase.kind === 'error' && !phase.cancelled ? (
        <ApiErrorState error={phase.error} body={copy.activity.failedBody} onRetry={run} />
      ) : null}
      {busy ? <StatusSequence steps={cancelSequence(phase)} /> : null}
      <div className="kl-actions">
        <Button variant="danger" full loading={busy} onClick={run}>
          {s.cancel}
        </Button>
        <Button variant="ghost" full disabled={busy} onClick={() => setDismissed(true)}>
          {s.itWasMe}
        </Button>
      </div>
      {alert.txHash ? <TxLink hash={alert.txHash} /> : null}
    </Note>
  );
}

function cancelSequence(phase: CancelPhase): StatusStep[] {
  const labels = copyGaps.alerts.cancelSequence;
  const idx =
    phase.kind === 'running'
      ? phase.stage === 'sending' || phase.stage === 'sent'
        ? 1
        : 0
      : phase.kind === 'sent'
        ? 2
        : phase.kind === 'included'
          ? 3
          : 4;
  const blockLabel =
    (phase.kind === 'included' || phase.kind === 'cancelled') && phase.blockNumber
      ? copy.review.inBlock(formatInteger(phase.blockNumber))
      : labels[2];
  return [
    { label: labels[0], state: idx > 0 ? 'done' : 'active' },
    { label: labels[1], state: idx > 1 ? 'done' : idx === 1 ? 'active' : 'todo' },
    { label: blockLabel, state: idx > 2 ? 'done' : idx === 2 ? 'active' : 'todo' },
    { label: labels[3], state: idx > 3 ? 'done' : idx === 3 ? 'active' : 'todo' },
  ];
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a className="kl-link" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {copy.common.viewOnBasescan}
      <ArrowSquareOut size={16} aria-hidden="true" />
    </a>
  );
}
