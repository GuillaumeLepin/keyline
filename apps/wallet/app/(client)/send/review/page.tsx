'use client';

import type { DecodedCall, PolicyDecision } from '@keyline/shared';
import {
  Address,
  Button,
  CountdownRing,
  Disclosure,
  EmptyState,
  ErrorState,
  formatCHF,
  formatDuration,
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
import { CheckCircle, Prohibit, Warning } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
import { useLocalWallet, useNow, useUsdcBalance } from '@/src/lib/hooks';
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
          title={copy.review.missingTitle}
          body={copy.review.missingBody}
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

type Wallet = NonNullable<ReturnType<typeof useLocalWallet>['wallet']>;

type DraftCall = { to: string; value: string; data: string };

function evaluateDraft(wallet: Wallet, draft: PendingSend, calls?: readonly DraftCall[]) {
  if (draft.dapp) {
    return api.policy.evaluate({
      kind: 'dapp',
      walletAddress: wallet.address,
      dappId: draft.dapp.id,
      chfValue: 0,
      calls: (calls ?? draft.dapp.calls).map((c) => ({
        to: getAddress(c.to),
        value: c.value,
        data: c.data as `0x${string}`,
      })),
      deviceLabel: getDeviceLabel(),
    });
  }
  return api.policy.evaluate({
    kind: 'transfer',
    walletAddress: wallet.address,
    calls: [transferCall(getAddress(draft.to), draft.amountUsdc)],
    chfValue: draft.amountChf,
    recipientAddress: draft.to,
    deviceLabel: getDeviceLabel(),
  });
}

/** True once the bank lets the client proceed (step-up signed on the laptop, or the cooling period elapsed). */
function cleared(d: PolicyDecision): boolean {
  return d.status !== 'cancelled' && (d.verdict === 'approve' || d.stepUp?.satisfiedBy === 'safety-key');
}

function Review({ wallet, draft }: { wallet: Wallet; draft: PendingSend }) {
  const router = useRouter();
  const backHref = draft.dapp ? '/dapps' : '/send';
  const balance = useUsdcBalance(wallet.address);
  const evaluated = useQuery({
    queryKey: ['decision', wallet.address, draft.to, draft.amountUsdc, draft.dapp?.id],
    queryFn: () => evaluateDraft(wallet, draft),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // "Approve 100 USDC instead" replaces the decision under review with the capped one.
  const [capped, setCapped] = useState<PolicyDecision | null>(null);
  const [capAmount, setCapAmount] = useState<string | null>(null);
  const base = capped ?? evaluated.data;
  const waiting =
    base !== undefined && !cleared(base) && (base.verdict === 'step-up' || base.verdict === 'cooling');
  // Step-up and cooling are resolved by the bank (laptop signature / clock): poll until it clears.
  const polled = useQuery({
    queryKey: ['policy', base?.decisionId],
    queryFn: () => api.policy.get(base?.decisionId as string),
    enabled: Boolean(base) && waiting,
    refetchInterval: 2_000,
    retry: false,
  });
  const d: PolicyDecision | undefined = polled.data ?? base;
  // Only the decision that was actually waiting (step-up / cooling) may auto-continue once it clears.
  const waitingId = useRef<string | null>(null);
  const [stage, setStage] = useState<SubmitStage | null>(null);
  const [expired, setExpired] = useState(false);
  const [userOpHash, setUserOpHash] = useState<string | null>(null);

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
      setUserOpHash(result.userOpHash);
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
        summary: draft.dapp ? dec.simulation.decodedCalls[0]?.humanText : undefined,
      });
      pendingSendStore.clear();
      return result.userOpHash;
    },
    onSuccess: (hash) => router.push(`/activity/${hash}`),
    onError: () => setStage(null),
  });

  // Auto-continue: the moment a step-up / cooling decision clears, run the usual sponsor → sign → send.
  const confirmMutate = confirm.mutate;
  useEffect(() => {
    if (!d) return;
    if (!cleared(d)) {
      if (d.verdict === 'step-up' || d.verdict === 'cooling') waitingId.current = d.decisionId;
      return;
    }
    if (waitingId.current === d.decisionId && !confirm.isPending && !confirm.isSuccess && !confirm.isError) {
      waitingId.current = null;
      confirmMutate(d);
    }
  }, [d, confirm.isPending, confirm.isSuccess, confirm.isError, confirmMutate]);

  const cancelDecision = useMutation({
    mutationFn: (id: string) => api.policy.cancel(id),
    onSuccess: () => {
      pendingSendStore.clear();
      router.push(backHref);
    },
  });

  const applyCap = useMutation({
    mutationFn: (dec: PolicyDecision) => {
      const call = dec.suggestedCap?.call;
      if (!call) throw new Error('no cap');
      return evaluateDraft(wallet, draft, [call]);
    },
    onSuccess: (dec, source) => {
      waitingId.current = null;
      setCapAmount(source.suggestedCap?.amount ?? null);
      setCapped(dec);
    },
  });

  const verdict = d?.verdict;
  const isCleared = d !== undefined && cleared(d);
  const cancelled = confirm.error instanceof PasskeyCancelledError;
  const insufficient = !draft.dapp && balance.data !== undefined && draft.amountUsdc > balance.data;
  const danger = d?.simulation.decodedCalls.find((c) => c.risk === 'danger');
  const cap = d?.suggestedCap;
  const unknownDapp = verdict === 'block' && Boolean(draft.dapp) && !d?.screening.hit;
  const canConfirm = d !== undefined && !expired && !insufficient && isCleared && !(danger && cap);
  const rows = whatWillHappen(d, draft, balance.data);

  return (
    <>
      <ScreenHeader title={copy.review.title} backHref={backHref} />
      <section className="kl-balance">
        {draft.dapp ? (
          <>
            <p className="kl-balance__amount text-28">{copyGaps.review.dappTitle(draft.dapp.name)}</p>
            <p className="kl-balance__secondary">{draft.dapp.description}</p>
          </>
        ) : (
          <>
            <p className="kl-balance__amount">{formatCHF(draft.amountChf)}</p>
            <p className="kl-balance__secondary">
              {copy.review.toLine(formatUSDC(draft.amountUsdc), draft.toLabel)}
            </p>
          </>
        )}
        <Address value={draft.to} explorerUrl={addressUrl(draft.to)} />
      </section>

      {evaluated.isPending || applyCap.isPending ? (
        <div className="kl-stack kl-stack--tight">
          <Skeleton kind="line" count={2} />
          {applyCap.isPending ? <p className="text-12 text-ink-3">{copyGaps.review.dappEvaluating}</p> : null}
        </div>
      ) : null}
      {d ? (
        <Verdict
          decision={d}
          unknownDapp={unknownDapp}
          capAmount={capAmount}
          continuing={confirm.isPending}
        />
      ) : null}
      {insufficient && verdict !== 'block' ? (
        <Note tone="danger">{copy.send.errFunds(formatUSDC(balance.data ?? 0))}</Note>
      ) : null}

      {expired && !confirm.isPending ? (
        <ErrorState
          title={copy.review.expiredTitle}
          body={copy.review.expiredBody}
          onRetry={() => {
            setExpired(false);
            setCapped(null);
            evaluated.refetch();
          }}
          retryLabel={copy.review.reviewAgain}
        />
      ) : null}

      <Panel
        title={copy.review.panelTitle}
        rows={rows}
        footnote={copy.common.cantUndo}
        tone={verdict === 'block' || danger ? 'danger' : 'default'}
      />
      {danger && d ? (
        <Note tone="danger">
          {cap ? copy.review.dappDangerNote(draft.dapp?.name ?? draft.toLabel) : danger.humanText}
        </Note>
      ) : null}
      {verdict === 'block' ? (
        <p className="text-14 text-ink-2">
          {unknownDapp ? copyGaps.review.dappUnknownBody : copy.review.blockBody}
        </p>
      ) : null}
      {evaluated.isError ? (
        <ApiErrorState
          error={evaluated.error}
          body={copy.common.errorBody}
          onRetry={() => evaluated.refetch()}
        />
      ) : null}
      {applyCap.isError ? (
        <ApiErrorState
          error={applyCap.error}
          body={copy.common.errorBody}
          onRetry={() => d && applyCap.mutate(d)}
        />
      ) : null}
      {polled.isError ? (
        <ApiErrorState error={polled.error} body={copy.common.errorBody} onRetry={() => polled.refetch()} />
      ) : null}

      {d ? <TechnicalDetails decision={d} userOpHash={userOpHash} /> : null}

      {cancelled ? <Note tone="warn">{copy.review.passkeyCancelled}</Note> : null}
      {confirm.isError && !cancelled ? (
        <ApiErrorState
          error={confirm.error}
          body={copy.activity.failedBody}
          onRetry={() => d && confirm.mutate(d)}
        />
      ) : null}
      {cancelDecision.isError ? (
        <ApiErrorState
          error={cancelDecision.error}
          body={copy.common.errorBody}
          onRetry={() => d && cancelDecision.mutate(d.decisionId)}
        />
      ) : null}
      {stage ? <StatusSequence steps={sendingSequence(stage)} /> : null}

      <div className="kl-actions">
        {verdict === 'block' ? (
          <>
            {unknownDapp ? (
              <Button variant="secondary" full disabled>
                {copy.dapps.requestReview}
              </Button>
            ) : null}
            <Button variant="ghost" full href={backHref} onClick={() => pendingSendStore.clear()}>
              {copy.common.back}
            </Button>
          </>
        ) : danger && cap && d ? (
          <>
            <Button variant="primary" full loading={applyCap.isPending} onClick={() => applyCap.mutate(d)}>
              {copy.review.dappCap(`${formatUSDC(Number(cap.amount))}`)}
            </Button>
            <Button
              variant="ghost"
              full
              loading={cancelDecision.isPending}
              onClick={() => cancelDecision.mutate(d.decisionId)}
            >
              {copy.review.dappReject}
            </Button>
          </>
        ) : d && !isCleared && (verdict === 'cooling' || verdict === 'step-up') ? (
          <Button
            variant="secondary"
            full
            loading={cancelDecision.isPending}
            onClick={() => cancelDecision.mutate(d.decisionId)}
          >
            {verdict === 'cooling' ? copy.review.coolingCancel : copy.common.cancel}
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
            {draft.dapp && !confirm.isPending ? (
              <Button variant="ghost" full href={backHref} onClick={() => pendingSendStore.clear()}>
                {copy.review.dappReject}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/** One PolicyLine per verdict with the bank's `reasons[]`, plus the step-up / cooling sub-states (DESIGN.md §10). */
function Verdict({
  decision,
  unknownDapp,
  capAmount,
  continuing,
}: {
  decision: PolicyDecision;
  unknownDapp: boolean;
  capAmount: string | null;
  continuing: boolean;
}) {
  const p = copy.review.policy;
  const first = decision.reasons[0];
  const reasons = <Reasons reasons={decision.reasons} except={first ? [first] : []} />;
  if (cleared(decision)) {
    const viaLaptop = decision.stepUp?.satisfiedBy === 'safety-key';
    const reason = capAmount
      ? copyGaps.review.dappCapApplied(`${formatUSDC(Number(capAmount))}`)
      : viaLaptop
        ? copyGaps.review.stepUpDone
        : (decision.reasons[0] ?? p.ok.reason);
    return (
      <div className="kl-stack kl-stack--tight">
        <PolicyLine verdict="ok" word={p.ok.word} reason={continuing ? copyGaps.review.continuing : reason} />
        {viaLaptop ? (
          <StatusSequence
            steps={copy.review.stepUpSequence.map((label) => ({ label, state: 'done' as const }))}
          />
        ) : null}
      </div>
    );
  }
  switch (decision.verdict) {
    case 'approve':
      return <PolicyLine verdict="ok" word={p.ok.word} reason={decision.reasons[0] ?? p.ok.reason} />;
    case 'step-up': {
      const steps: StatusStep[] = [
        { label: copy.review.stepUpSequence[0], state: 'done' },
        { label: copy.review.stepUpSequence[1], state: 'active' },
        { label: copy.review.stepUpSequence[2], state: 'todo' },
      ];
      return (
        <div className="kl-stack">
          <PolicyLine
            verdict="step-up"
            word={p.stepUp.word}
            reason={decision.reasons[0] ?? p.stepUp.reason}
          />
          {reasons}
          <StatusSequence steps={steps} />
          <Note tone="info">
            {copyGaps.review.stepUpWaiting}. {copyGaps.review.stepUpWaitingNote}
          </Note>
        </div>
      );
    }
    case 'cooling':
      return <CoolingVerdict decision={decision} />;
    case 'block':
      return (
        <div className="kl-stack kl-stack--tight">
          <PolicyLine
            verdict="block"
            word={p.block.word}
            reason={
              unknownDapp
                ? copyGaps.review.dappUnknownBlock
                : decision.screening.hit
                  ? p.block.reason
                  : (decision.reasons[0] ?? copy.common.policyRefused)
            }
            trailing={decision.screening.simulatedHit ? <SimulatedBadge /> : undefined}
          />
          <Reasons
            reasons={decision.reasons}
            except={[first ?? '', ...decision.reasons.filter((r) => r.startsWith('Swissquote won'))]}
          />
        </div>
      );
  }
}

function Reasons({ reasons, except = [] }: { reasons: readonly string[]; except?: readonly string[] }) {
  const shown = reasons.filter((r) => !except.includes(r));
  if (shown.length === 0) return null;
  return (
    <ul className="kl-stack kl-stack--tight pl-4 text-12 text-ink-3" aria-label={copyGaps.review.reasons}>
      {shown.map((r) => (
        <li key={r} className="list-disc">
          {r}
        </li>
      ))}
    </ul>
  );
}

/** Countdown from the bank's `coolingUntil`; the "you can cancel for m:ss" sentence ticks with the ring. */
function CoolingVerdict({ decision }: { decision: PolicyDecision }) {
  const p = copy.review.policy;
  const now = useNow();
  const endsAt = decision.coolingUntil ? new Date(decision.coolingUntil).getTime() : Date.now() + 60_000;
  const finishes = new Date(endsAt).toLocaleTimeString('de-CH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <div className="kl-stack items-center">
      <PolicyLine
        verdict="cooling"
        word={p.cooling.word}
        reason={p.cooling.reason(formatDuration(Math.max(0, endsAt - now)))}
      />
      <Reasons reasons={decision.reasons} except={decision.reasons[0] ? [decision.reasons[0]] : []} />
      <CountdownRing
        endsAt={endsAt}
        durationMs={60_000}
        size={96}
        caption={`${copyGaps.review.coolingFinishes(finishes)} · ${copy.demo.cooling}`}
      />
    </div>
  );
}

const riskIcon: Record<DecodedCall['risk'], React.ReactNode> = {
  none: <CheckCircle size={14} aria-hidden="true" />,
  warn: <Warning size={14} aria-hidden="true" />,
  danger: <Prohibit size={14} aria-hidden="true" />,
};

function RiskWord({ risk }: { risk: DecodedCall['risk'] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {riskIcon[risk]}
      {copyGaps.review.riskWord[risk] ?? risk}
    </span>
  );
}

function whatWillHappen(
  d: PolicyDecision | undefined,
  draft: PendingSend,
  balance: number | undefined,
): PanelRow[] {
  const rows: PanelRow[] = [];
  const change = d?.simulation.assetChanges.find(
    (a) => a.token.toLowerCase() === env.usdcAddress.toLowerCase(),
  );
  const before = change ? Number(formatUnits(BigInt(change.before), 6)) : balance;
  const after = change
    ? Number(formatUnits(BigInt(change.after), 6))
    : before !== undefined
      ? before - draft.amountUsdc
      : undefined;
  if (!draft.dapp) {
    const usdc = formatUSDC(draft.amountUsdc);
    rows.push({ label: copy.review.youSend, value: usdc, tone: 'em' });
    rows.push({ label: copy.review.receives(draft.toLabel), value: usdc });
  }
  rows.push({
    label: copy.review.yourBalance,
    value:
      before !== undefined && after !== undefined && after >= 0 && after !== before
        ? `${formatUSDC(before)} → ${formatUSDC(after)}`
        : before !== undefined
          ? formatUSDC(before)
          : '—',
  });
  if (d) {
    for (const c of d.simulation.decodedCalls) {
      rows.push({
        label: <RiskWord risk={c.risk} />,
        value: c.humanText,
        tone: c.risk === 'danger' ? 'danger' : undefined,
      });
    }
  }
  rows.push({
    label: copy.review.networkFee,
    value:
      d && !d.sponsorship.sponsored
        ? d.verdict !== 'block' && d.sponsorship.remainingToday === 0
          ? copyGaps.review.feeCapExhausted
          : copyGaps.review.feeNotSponsored
        : copy.common.networkFeePaid,
  });
  if (d) {
    rows.push({
      label: copyGaps.review.screened,
      value: d.screening.hit ? (
        <>
          {copyGaps.review.screenedHit} {d.screening.simulatedHit ? <SimulatedBadge /> : null}
        </>
      ) : (
        <>
          {copyGaps.review.screenedLists} <SimulatedBadge />
        </>
      ),
      tone: d.screening.hit ? 'danger' : 'ok',
    });
  }
  return rows;
}

function TechnicalDetails({
  decision: d,
  userOpHash,
}: {
  decision: PolicyDecision;
  userOpHash: string | null;
}) {
  const fallback = d.simulation.provider === 'fallback';
  return (
    <Disclosure summary={copy.common.technicalDetails}>
      <div className="kl-stack kl-stack--tight">
        <p className="text-12 text-ink-3">
          {copyGaps.review.simulationProvider}:{' '}
          {fallback ? copyGaps.review.providerFallback : copyGaps.review.providerLive}{' '}
          {fallback ? <SimulatedBadge /> : null}
        </p>
        {d.simulation.decodedCalls.map((c) => (
          <pre key={`${c.to}${c.fn}${c.args.join()}`} className="kl-code">
            {c.to}
            {'\n'}
            {c.fn}({c.args.join(', ')}){'\n'}
            {c.humanText}
          </pre>
        ))}
        <pre className="kl-code">
          decisionId {d.decisionId}
          {'\n'}tier {d.tier} · verdict {d.verdict}
          {d.status ? ` · ${d.status}` : ''}
          {'\n'}callsHash {d.callsHash}
          {'\n'}expires {d.expiresAt}
          {d.coolingUntil ? `\ncoolingUntil ${d.coolingUntil}` : ''}
          {d.stepUp?.guardianAddress ? `\nstepUp ${d.stepUp.guardianAddress}` : ''}
          {'\n'}sponsored {String(d.sponsorship.sponsored)} · {d.sponsorship.remainingToday} left today
          {userOpHash ? `\n${copyGaps.review.userOpHash} ${userOpHash}` : ''}
        </pre>
      </div>
    </Disclosure>
  );
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
