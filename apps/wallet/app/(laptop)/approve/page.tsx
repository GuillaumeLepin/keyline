'use client';

import { type PolicyDecision, policyStepUpTypedData, type RecoveryRequest } from '@keyline/shared';
import {
  Address,
  Button,
  Disclosure,
  EmptyState,
  formatCHF,
  formatClock,
  formatRelative,
  formatUSDC,
  Note,
  Panel,
  type PanelRow,
  SimulatedBadge,
  Skeleton,
} from '@keyline/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyGaps } from '@/src/copy';
import { env } from '@/src/env';
import { api } from '@/src/lib/api';
import { addressUrl, signRecoveryConfirmation } from '@/src/lib/chain';
import { useNow } from '@/src/lib/hooks';
import { type SafetyKeyRecord, safetyKeyStore } from '@/src/lib/storage';

/**
 * Laptop persona: two queues for the one Safety key it holds.
 * 1. Tier-2 transfers (SPEC F2.4): the key signs the `KeylinePolicyStepUp` EIP-712 message of the decision it is shown
 *    and the bank verifies it — policy-layer enforcement in the prototype.
 * 2. Recovery (SPEC F3.3): the key signs the SocialRecoveryModule's ExecuteRecovery hash — nothing else.
 */
export default function ApprovePage() {
  const [key, setKey] = useState<SafetyKeyRecord | null | undefined>(undefined);
  useEffect(() => {
    safetyKeyStore
      .get()
      .then(setKey)
      .catch(() => setKey(null));
  }, []);

  if (key === undefined) return <Skeleton kind="block" height={160} />;
  if (key === null) {
    return (
      <EmptyState
        title={copy.approve.emptyTitle}
        body={copy.approve.noSafetyKey}
        action={
          <Button variant="secondary" href="/pair">
            {copy.approve.pairLink}
          </Button>
        }
      />
    );
  }
  return (
    <div className="kl-stack">
      <section className="kl-stack">
        <div className="kl-section">
          <h2 className="kl-section__title">{copyGaps.approveTransfer.section}</h2>
        </div>
        <TransferQueue safetyKey={key} />
      </section>
      <section className="kl-stack">
        <div className="kl-section">
          <h2 className="kl-section__title">{copyGaps.approveTransfer.recoverySection}</h2>
        </div>
        <RecoveryQueue safetyKey={key} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Tier-2 transfers
// ---------------------------------------------------------------------------------------------------------------

function TransferQueue({ safetyKey }: { safetyKey: SafetyKeyRecord }) {
  const [settled, setSettled] = useState<Record<string, 'approved' | 'refused'>>({});
  const pending = useQuery({
    queryKey: ['pending-approvals', safetyKey.walletAddress],
    queryFn: () => api.policy.pendingApprovals(safetyKey.walletAddress),
    refetchInterval: 2_000,
    retry: false,
  });
  if (pending.isPending) return <Skeleton kind="block" height={120} />;
  if (pending.isError) {
    return (
      <ApiErrorState error={pending.error} body={copy.common.errorBody} onRetry={() => pending.refetch()} />
    );
  }
  const open = pending.data.filter(
    (d) => d.verdict === 'step-up' && d.status !== 'cancelled' && !d.stepUp?.satisfiedBy,
  );
  const settledIds = Object.keys(settled);
  if (open.length === 0 && settledIds.length === 0) {
    return <EmptyState title={copy.approve.emptyTitle} body={copy.approve.emptyBody} />;
  }
  return (
    <div className="kl-stack">
      {settledIds.map((id) => (
        <Note key={id} tone={settled[id] === 'approved' ? 'ok' : 'info'}>
          {settled[id] === 'approved' ? copyGaps.approveTransfer.approved : copy.approve.refused}
        </Note>
      ))}
      {open
        .filter((d) => !settled[d.decisionId])
        .map((d) => (
          <TransferPrompt
            key={d.decisionId}
            decision={d}
            safetyKey={safetyKey}
            onSettled={(outcome) => setSettled((s) => ({ ...s, [d.decisionId]: outcome }))}
          />
        ))}
    </div>
  );
}

function TransferPrompt({
  decision,
  safetyKey,
  onSettled,
}: {
  decision: PolicyDecision;
  safetyKey: SafetyKeyRecord;
  onSettled: (outcome: 'approved' | 'refused') => void;
}) {
  const now = useNow();
  const queryClient = useQueryClient();
  const approve = useMutation({
    mutationFn: async () => {
      const account = privateKeyToAccount(safetyKey.privateKey);
      const signature = await account.signTypedData(policyStepUpTypedData(Number(env.chainId), decision));
      return api.policy.stepUp(decision.decisionId, {
        kind: 'safety-key',
        signature,
        guardianAddress: account.address,
      });
    },
    onSuccess: () => {
      onSettled('approved');
      queryClient.invalidateQueries({ queryKey: ['pending-approvals', safetyKey.walletAddress] });
    },
  });
  const refuse = useMutation({
    mutationFn: () => api.policy.cancel(decision.decisionId),
    onSuccess: () => {
      onSettled('refused');
      queryClient.invalidateQueries({ queryKey: ['pending-approvals', safetyKey.walletAddress] });
    },
  });

  const recipient =
    decision.recipientLabel ?? (decision.recipientAddress ? shortLabel(decision.recipientAddress) : '—');
  const usdcChange = decision.simulation.assetChanges.find(
    (a) => a.token.toLowerCase() === env.usdcAddress.toLowerCase(),
  );
  const amountUsdc = usdcChange ? Math.abs(Number(formatUnits(BigInt(usdcChange.delta), 6))) : undefined;
  const rows: PanelRow[] = [];
  if (amountUsdc !== undefined && amountUsdc > 0) {
    rows.push({ label: copy.review.youSend, value: formatUSDC(amountUsdc), tone: 'em' });
    rows.push({ label: copy.review.receives(recipient), value: formatUSDC(amountUsdc) });
  }
  if (usdcChange && usdcChange.before !== usdcChange.after) {
    rows.push({
      label: copy.review.yourBalance,
      value: `${formatUSDC(Number(formatUnits(BigInt(usdcChange.before), 6)))} → ${formatUSDC(
        Number(formatUnits(BigInt(usdcChange.after), 6)),
      )}`,
    });
  }
  for (const c of decision.simulation.decodedCalls) {
    rows.push({
      label: c.risk === 'danger' ? copy.review.permission : (c.fn.split('(')[0] ?? c.fn),
      value: c.humanText,
      tone: c.risk === 'danger' ? 'danger' : undefined,
    });
  }
  rows.push({
    label: copy.review.networkFee,
    value: decision.sponsorship.sponsored ? copy.common.networkFeePaid : copyGaps.review.feeCapExhausted,
  });

  return (
    <div className="kl-stack">
      <div className="kl-stack kl-stack--tight">
        <h1 className="kl-title">
          {decision.kind === 'dapp'
            ? copyGaps.approveTransfer.dappTitle(
                decision.simulation.decodedCalls[0]?.humanText ?? decision.dappId ?? '',
              )
            : copy.approve.title(formatCHF(decision.chfValue), recipient)}
        </h1>
        <p className="kl-lead">
          {copy.approve.requested(
            decision.deviceLabel ?? copy.device['lea-phone'],
            formatRelative(new Date(decision.decidedAt), now),
          )}
        </p>
      </div>
      <Panel title={copyGaps.approveTransfer.decodedTitle} rows={rows} />
      <Note tone="info">{copy.approve.note}</Note>
      {approve.isError ? (
        <ApiErrorState error={approve.error} body={copy.common.errorBody} onRetry={() => approve.mutate()} />
      ) : null}
      {refuse.isError ? (
        <ApiErrorState error={refuse.error} body={copy.common.errorBody} onRetry={() => refuse.mutate()} />
      ) : null}
      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={() => refuse.mutate()}
          loading={refuse.isPending}
          disabled={approve.isPending}
        >
          {copy.approve.refuse}
        </Button>
        <Button variant="primary" loading={approve.isPending} onClick={() => approve.mutate()}>
          {copy.approve.approve}
        </Button>
      </div>
      <Disclosure summary={copy.common.technicalDetails}>
        <div className="kl-stack kl-stack--tight">
          <p className="text-12 text-ink-3">{copy.onboarding.s2.keyName}</p>
          <Address value={safetyKey.address} explorerUrl={addressUrl(safetyKey.address)} />
          <pre className="kl-code">
            decisionId {decision.decisionId}
            {'\n'}
            {copyGaps.approveTransfer.callsHash} {decision.callsHash}
            {'\n'}chfValueCents {Math.round(decision.chfValue * 100)}
            {'\n'}EIP-712 KeylinePolicyStepUp · chainId {String(env.chainId)}
          </pre>
          <p className="text-12 text-ink-3">
            {decision.screening.hit ? copyGaps.review.screenedHit : copyGaps.review.screenedLists}{' '}
            <SimulatedBadge />
          </p>
        </div>
      </Disclosure>
    </div>
  );
}

function shortLabel(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Recovery (Wave 2)
// ---------------------------------------------------------------------------------------------------------------

function RecoveryQueue({ safetyKey }: { safetyKey: SafetyKeyRecord }) {
  const [confirmedHere, setConfirmedHere] = useState<string | null>(null);
  // The bank has no "recoveries by wallet" route; the wallet's event feed names the request id.
  const events = useQuery({
    queryKey: ['wallet-events', safetyKey.walletAddress],
    queryFn: () => api.wallets.events(safetyKey.walletAddress),
    refetchInterval: 3_000,
    retry: false,
  });
  const recoveryId = latestRecoveryId(events.data);
  const recovery = useQuery({
    queryKey: ['recovery', recoveryId],
    queryFn: () => api.recoveries.get(recoveryId as string),
    enabled: Boolean(recoveryId),
    refetchInterval: 3_000,
    retry: false,
  });

  if (events.isPending) return <Skeleton kind="block" height={120} />;
  if (events.isError) {
    return (
      <ApiErrorState error={events.error} body={copy.common.errorBody} onRetry={() => events.refetch()} />
    );
  }
  const r = recovery.data;
  // Once this laptop confirmed, keep showing the result even after the bank relays and the status moves on.
  if (r && (r.status === 'awaiting-guardians' || confirmedHere === r.id)) {
    return <RecoveryPrompt recovery={r} safetyKey={safetyKey} onConfirmed={() => setConfirmedHere(r.id)} />;
  }
  return <EmptyState title={copyGaps.approveTransfer.noPending} />;
}

function latestRecoveryId(
  events: { type: string; payload: Record<string, unknown>; at: string }[] | undefined,
) {
  if (!events) return undefined;
  const candidates = events
    .filter((e) => e.type.startsWith('recovery.') && typeof e.payload.recoveryRequestId === 'string')
    .sort((a, b) => b.at.localeCompare(a.at));
  return candidates[0]?.payload.recoveryRequestId as string | undefined;
}

function RecoveryPrompt({
  recovery,
  safetyKey,
  onConfirmed,
}: {
  recovery: RecoveryRequest;
  safetyKey: SafetyKeyRecord;
  onConfirmed: () => void;
}) {
  const s = copy.recover;
  const queryClient = useQueryClient();
  const now = useNow();
  const [refused, setRefused] = useState(false);
  const confirm = useMutation({
    mutationFn: async () => {
      const signed = await signRecoveryConfirmation({
        privateKey: safetyKey.privateKey,
        recoveryId: recovery.id,
        wallet: getAddress(recovery.walletAddress),
        newOwnerProxy: getAddress(recovery.newOwner.signerProxyAddress),
      });
      return api.recoveries.confirm(recovery.id, {
        kind: 'safety-key',
        guardianAddress: signed.guardianAddress,
        signature: signed.signature,
        nonce: signed.nonce,
      });
    },
    onSuccess: (next) => {
      onConfirmed();
      queryClient.setQueryData(['recovery', recovery.id], next);
    },
  });

  if (refused) {
    return <Note tone="info">{copy.approve.recoveryRefused}</Note>;
  }
  if (confirm.isSuccess) {
    return (
      <>
        <h1 className="kl-title">{copy.approve.confirmedTitle}</h1>
        <Note tone="ok">
          {recovery.onchain.executeAfter
            ? copy.approve.waitingBody(formatClock(new Date(recovery.onchain.executeAfter)))
            : copy.approve.recoveryConfirmed}
        </Note>
        <Panel
          rows={[
            { label: copy.desk.statusCol, value: copy.desk.status[recovery.status] },
            {
              label: copy.recover.newKey,
              value: (
                <Address
                  value={recovery.newOwner.signerProxyAddress}
                  explorerUrl={addressUrl(recovery.newOwner.signerProxyAddress)}
                />
              ),
            },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <div className="kl-stack">
        <h1 className="kl-title">{s.laptopPrompt(formatRelative(new Date(recovery.createdAt), now))}</h1>
        <p className="kl-lead">{copy.approve.recoveryBody}</p>
      </div>
      <Panel
        title={copy.approve.signingTitle}
        rows={[
          {
            label: copy.recover.walletLabel,
            value: (
              <Address value={recovery.walletAddress} explorerUrl={addressUrl(recovery.walletAddress)} />
            ),
          },
          { label: copy.desk.device, value: recovery.requestedFrom.deviceLabel },
          {
            label: copy.recover.newKey,
            value: (
              <Address
                value={recovery.newOwner.signerProxyAddress}
                explorerUrl={addressUrl(recovery.newOwner.signerProxyAddress)}
              />
            ),
          },
          {
            label: copy.security.swissquote.name,
            value: recovery.guardianConfirmations.some((c) => c.kind === 'swissquote' && !c.void)
              ? copy.desk.conf.confirmed('')
              : copy.desk.conf.pending,
          },
        ]}
      />
      {confirm.isError ? (
        <ApiErrorState error={confirm.error} body={copy.common.errorBody} onRetry={() => confirm.mutate()} />
      ) : null}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setRefused(true)} disabled={confirm.isPending}>
          {s.laptopRefuse}
        </Button>
        <Button variant="primary" loading={confirm.isPending} onClick={() => confirm.mutate()}>
          {s.laptopConfirm}
        </Button>
      </div>
      <Disclosure summary={copy.common.technicalDetails}>
        <div className="kl-stack kl-stack--tight">
          <p className="text-12 text-ink-3">{copy.onboarding.s2.keyName}</p>
          <Address value={safetyKey.address} explorerUrl={addressUrl(safetyKey.address)} />
        </div>
      </Disclosure>
    </>
  );
}
