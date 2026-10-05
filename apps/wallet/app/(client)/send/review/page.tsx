'use client';

import type { PolicyDecision } from '@keyline/shared';
import {
  Address,
  Button,
  CountdownRing,
  Disclosure,
  EmptyState,
  ErrorState,
  formatCHF,
  formatInteger,
  formatUSDC,
  Note,
  Panel,
  type PanelRow,
  PolicyLine,
  SimulatedBadge,
  Skeleton,
  StatusSequence,
  type StatusStep,
} from '@keyline/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatUnits, getAddress } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps } from '@/src/copy';
import { env } from '@/src/env';
import { api } from '@/src/lib/api';
import {
  addressUrl,
  buildOpFromDecision,
  PasskeyCancelledError,
  type SubmitStage,
  sponsorSignAndSend,
  transferCall,
} from '@/src/lib/chain';
import { getDeviceLabel } from '@/src/lib/device';
import { useLocalWallet, useUsdcBalance } from '@/src/lib/hooks';
import { type PendingSend, pendingSendStore, transferStore } from '@/src/lib/storage';

export default function ReviewPage() {
  const router = useRouter();
  const { wallet } = useLocalWallet();
  const [draft, setDraft] = useState<PendingSend | null | undefined>(undefined);
  useEffect(() => setDraft(pendingSendStore.get()), []);

  if (wallet === undefined || draft === undefined) return <Skeleton kind="amount" />;
  if (wallet === null) {
    router.replace('/');
    return null;
  }
  if (draft === null) {
    return (
      <>
        <ScreenHeader title={copy.review.title} backHref="/send" />
        <EmptyState
          title={copyGaps.reviewMissingTitle}
          body={copyGaps.reviewMissingBody}
          action={
            <Button variant="secondary" href="/send">
              {copy.common.back}
            </Button>
          }
        />
      </>
    );
  }
  return <Review wallet={wallet} draft={draft} />;
}

function Review({
  wallet,
  draft,
}: {
  wallet: NonNullable<ReturnType<typeof useLocalWallet>['wallet']>;
  draft: PendingSend;
}) {
  const router = useRouter();
  const balance = useUsdcBalance(wallet.address);
  const decision = useQuery({
    queryKey: ['decision', wallet.address, draft.to, draft.amountUsdc],
    queryFn: async () => {
      return api.policy.evaluate({
        kind: 'transfer',
        walletAddress: wallet.address,
        calls: [transferCall(getAddress(draft.to), draft.amountUsdc)],
        chfValue: draft.amountChf,
        recipientAddress: draft.to,
        deviceLabel: getDeviceLabel(),
      });
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [stage, setStage] = useState<SubmitStage | null>(null);
  const [coolingDone, setCoolingDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const d = decision.data;

  useEffect(() => {
    if (!d) return;
    const ms = new Date(d.expiresAt).getTime() - Date.now();
    const t = setTimeout(() => setExpired(true), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [d]);

  const confirm = useMutation({
    mutationFn: async (dec: PolicyDecision) => {
      setStage('building');
      const unsigned = await buildOpFromDecision(wallet, dec);
      const result = await sponsorSignAndSend({
        wallet,
        unsignedUserOp: unsigned,
        decision: dec,
        onStage: setStage,
      });
      const now = new Date().toISOString();
      transferStore.upsert({
        userOpHash: result.userOpHash,
        to: draft.to,
        toLabel: draft.toLabel,
        amountUsdc: draft.amountUsdc,
        amountChf: draft.amountChf,
        at: now,
        status: 'sent',
        timeline: { signedAt: now, sentAt: now },
        decisionId: dec.decisionId,
      });
      pendingSendStore.clear();
      return result.userOpHash;
    },
    onSuccess: (hash) => router.push(`/activity/${hash}`),
    onError: () => setStage(null),
  });

  const rows = whatWillHappen(d, draft, balance.data);
  const verdict = d?.verdict;
  const cancelled = confirm.error instanceof PasskeyCancelledError;
  const canConfirm =
    d !== undefined && !expired && (verdict === 'approve' || (verdict === 'cooling' && coolingDone));

  return (
    <>
      <ScreenHeader title={copy.review.title} backHref="/send" />
      <section className="kl-balance">
        <p className="kl-balance__amount">{formatCHF(draft.amountChf)}</p>
        <p className="kl-balance__secondary">
          {copy.review.toLine(formatUSDC(draft.amountUsdc), draft.toLabel)}
        </p>
        <Address value={draft.to} explorerUrl={addressUrl(draft.to)} />
      </section>

      {decision.isPending ? <Skeleton kind="line" count={2} /> : null}
      {decision.isError ? (
        <ApiErrorState
          error={decision.error}
          body={copy.common.offlineBody}
          onRetry={() => decision.refetch()}
        />
      ) : null}
      {d ? <Verdict decision={d} onCoolingDone={() => setCoolingDone(true)} /> : null}

      {expired ? (
        <ErrorState
          title={copy.review.expiredTitle}
          body={copy.review.expiredBody}
          onRetry={() => {
            setExpired(false);
            decision.refetch();
          }}
          retryLabel={copy.review.reviewAgain}
        />
      ) : null}

      <Panel
        title={copy.review.panelTitle}
        rows={rows}
        footnote={copy.common.cantUndo}
        tone={verdict === 'block' ? 'danger' : 'default'}
      />
      {verdict === 'block' ? <p className="text-14 text-ink-2">{copy.review.blockBody}</p> : null}

      {d ? (
        <Disclosure summary={copy.common.technicalDetails}>
          <div className="kl-stack kl-stack--tight">
            {d.simulation.decodedCalls.map((c) => (
              <pre key={`${c.to}${c.fn}`} className="kl-code">
                {c.to}
                {'\n'}
                {c.fn}({c.args.join(', ')}){'\n'}
                {c.humanText}
              </pre>
            ))}
            <pre className="kl-code">
              decisionId {d.decisionId}
              {'\n'}callsHash {d.callsHash}
              {'\n'}expires {d.expiresAt}
              {'\n'}simulation {d.simulation.provider}
              {d.simulation.simulated ? ' (simulated)' : ''}
              {'\n'}sponsored {String(d.sponsorship.sponsored)} · {d.sponsorship.remainingToday} left today
            </pre>
          </div>
        </Disclosure>
      ) : null}

      {cancelled ? <Note tone="warn">{copy.review.passkeyCancelled}</Note> : null}
      {confirm.isError && !cancelled ? (
        <ApiErrorState
          error={confirm.error}
          body={copy.activity.failedBody}
          onRetry={() => d && confirm.mutate(d)}
        />
      ) : null}
      {stage ? <StatusSequence steps={sendingSequence(stage)} /> : null}

      <div className="kl-actions">
        {verdict === 'block' ? (
          <Button variant="ghost" full href="/send">
            {copy.common.back}
          </Button>
        ) : verdict === 'cooling' && !coolingDone ? (
          <Button variant="secondary" full href="/send" onClick={() => pendingSendStore.clear()}>
            {copy.review.coolingCancel}
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              full
              disabled={!canConfirm}
              loading={confirm.isPending}
              onClick={() => d && confirm.mutate(d)}
            >
              {copy.review.confirm}
            </Button>
            {verdict === 'step-up' ? (
              <Button variant="secondary" full href="/send" onClick={() => pendingSendStore.clear()}>
                {copy.common.cancel}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/** One PolicyLine per verdict, with the step-up / cooling / block sub-states (DESIGN.md §10 /send/review). */
function Verdict({ decision, onCoolingDone }: { decision: PolicyDecision; onCoolingDone: () => void }) {
  const p = copy.review.policy;
  switch (decision.verdict) {
    case 'approve':
      return <PolicyLine verdict="ok" word={p.ok.word} reason={p.ok.reason} />;
    case 'step-up': {
      const satisfied = decision.stepUp?.satisfiedBy === 'safety-key';
      const steps: StatusStep[] = [
        { label: copy.review.stepUpSequence[0], state: 'done' },
        { label: copy.review.stepUpSequence[1], state: satisfied ? 'done' : 'active' },
        { label: copy.review.stepUpSequence[2], state: satisfied ? 'done' : 'todo' },
      ];
      return (
        <div className="kl-stack">
          <PolicyLine verdict="step-up" word={p.stepUp.word} reason={p.stepUp.reason} />
          <StatusSequence steps={steps} />
        </div>
      );
    }
    case 'cooling': {
      const endsAt = decision.coolingUntil ? new Date(decision.coolingUntil).getTime() : Date.now() + 60_000;
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      return (
        <div className="kl-stack items-center">
          <PolicyLine
            verdict="cooling"
            word={p.cooling.word}
            reason={p.cooling.reason(`0:${String(remaining).padStart(2, '0')}`)}
          />
          <CountdownRing
            endsAt={endsAt}
            durationMs={60_000}
            size={96}
            caption={copy.demo.cooling}
            onDone={onCoolingDone}
          />
        </div>
      );
    }
    case 'block':
      return (
        <PolicyLine
          verdict="block"
          word={p.block.word}
          reason={decision.screening.hit ? p.block.reason : decision.reasons.join(' · ')}
          trailing={decision.screening.simulatedHit ? <SimulatedBadge /> : undefined}
        />
      );
  }
}

function whatWillHappen(
  d: PolicyDecision | undefined,
  draft: PendingSend,
  balance: number | undefined,
): PanelRow[] {
  const usdc = formatUSDC(draft.amountUsdc);
  const change = d?.simulation.assetChanges.find(
    (a) => a.token.toLowerCase() === env.usdcAddress.toLowerCase(),
  );
  const before = change ? Number(formatUnits(BigInt(change.before), 6)) : balance;
  const after = change
    ? Number(formatUnits(BigInt(change.after), 6))
    : before !== undefined
      ? before - draft.amountUsdc
      : undefined;
  const rows: PanelRow[] = [
    { label: copy.review.youSend, value: usdc, tone: 'em' },
    { label: copy.review.receives(draft.toLabel), value: usdc },
    {
      label: copy.review.yourBalance,
      value:
        before !== undefined && after !== undefined ? `${formatUSDC(before)} → ${formatUSDC(after)}` : '—',
    },
    { label: copy.review.networkFee, value: copy.common.networkFeePaid },
  ];
  if (d) {
    rows.push({
      label: copy.review.sanctions,
      value: d.screening.hit ? (
        <>
          {copy.review.policy.block.word} {d.screening.simulatedHit ? <SimulatedBadge /> : null}
        </>
      ) : (
        <>
          {copy.review.sanctionsClear} <SimulatedBadge />
        </>
      ),
      tone: d.screening.hit ? 'danger' : 'ok',
    });
    for (const c of d.simulation.decodedCalls) {
      if (c.risk === 'danger')
        rows.push({ label: copy.review.permission, value: c.humanText, tone: 'danger' });
    }
  }
  return rows;
}

function sendingSequence(stage: SubmitStage): StatusStep[] {
  const labels = copy.review.sequence;
  const signed = stage === 'sending' || stage === 'sent';
  const sent = stage === 'sent';
  return [
    { label: labels[0], state: signed ? 'done' : 'active' },
    { label: labels[1], state: sent ? 'done' : signed ? 'active' : 'todo' },
    { label: copy.review.inBlock(formatInteger(0)).replace(formatInteger(0), '…'), state: 'todo' },
    { label: labels[3], state: 'todo' },
  ];
}
