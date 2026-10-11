'use client';

import type { DecodedCall, PolicyDecision } from '@keyline/shared';
import { CheckCircle, Prohibit, Warning } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatUnits, getAddress } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { GestureRetry } from '@/src/components/GestureRetry';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps, copyWc } from '@/src/copy';
import { env } from '@/src/env';
import { api, isApiError } from '@/src/lib/api';
import {
  addressUrl,
  buildOpFromDecision,
  PasskeyCancelledError,
  PasskeyGestureError,
  type SubmitStage,
  signPreparedAndSend,
  transferCall,
} from '@/src/lib/chain';
import { getDeviceLabel } from '@/src/lib/device';
import { useLocalWallet, useNow, useUsdcBalance } from '@/src/lib/hooks';
import { useWarmOp } from '@/src/lib/prepare';
import { PENDING_SEND_EVENT, type PendingSend, pendingSendStore, transferStore } from '@/src/lib/storage';
import {
  Address,
  Button,
  CountdownRing,
  DappIdentityRow,
  Disclosure,
  EmptyState,
  ErrorState,
  formatCHF,
  formatClock,
  formatDuration,
  formatInteger,
  formatUSDC,
  haptic,
  Note,
  Panel,
  type PanelRow,
  PolicyLine,
  SimulatedBadge,
  Skeleton,
  StatusSequence,
  type StatusStep,
} from '@/src/ui';
import { useWc } from '@/src/wc/context';
import {
  logRequest,
  respondBlocked,
  respondError,
  respondRejected,
  respondResult,
  waitForInclusion,
} from '@/src/wc/respond';

export default function ReviewPage() {
  const router = useRouter();
  const { wallet } = useLocalWallet();
  const [draft, setDraft] = useState<PendingSend | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setDraft(pendingSendStore.get());
    read();
    // A WalletConnect request opened while this page is already showing another one.
    window.addEventListener(PENDING_SEND_EVENT, read);
    return () => window.removeEventListener(PENDING_SEND_EVENT, read);
  }, []);

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
  return <Review key={draft.dapp?.wc?.requestId ?? 'draft'} wallet={wallet} draft={draft} />;
}

type Wallet = NonNullable<ReturnType<typeof useLocalWallet>['wallet']>;

type DraftCall = { to: string; value: string; data: string };

function evaluateDraft(wallet: Wallet, draft: PendingSend, calls?: readonly DraftCall[]) {
  if (draft.dapp) {
    const wc = draft.dapp.wc;
    return api.policy.evaluate({
      kind: 'dapp',
      walletAddress: wallet.address,
      // SPEC §11.3: a WalletConnect request is evaluated against its recorded session (topic + Verify origin).
      ...(wc ? { topic: wc.topic, origin: wc.origin ?? wc.url } : { dappId: draft.dapp.id }),
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
    // Every WalletConnect request is its own decision (same app + same token contract must not share one).
    queryKey: [
      'decision',
      wallet.address,
      draft.to,
      draft.amountUsdc,
      draft.dapp?.id,
      draft.dapp?.wc?.requestId,
      JSON.stringify(draft.dapp?.calls ?? []),
    ],
    queryFn: () => evaluateDraft(wallet, draft),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // "Approve 100 USDC instead" replaces the decision under review with the capped one.
  const [capped, setCapped] = useState<PolicyDecision | null>(null);
  const [capAmount, setCapAmount] = useState<string | null>(null);
  const base = capped ?? evaluated.data;
  // DESIGN-AUDIT WC-17: an unlimited approval with a suggested cap is first an offer — the cap (primary) or the
  // unlimited path (secondary). Nothing waits on the laptop and nothing auto-continues until one is chosen.
  const [choice, setChoice] = useState<'cap' | 'full' | null>(null);
  const offer =
    !capped &&
    base?.verdict !== 'block' &&
    Boolean(base?.suggestedCap) &&
    Boolean(base?.simulation.decodedCalls.some((c) => c.risk === 'danger'));
  const offerOpen = offer && choice !== 'full';
  const waiting =
    !offerOpen &&
    base !== undefined &&
    !cleared(base) &&
    (base.verdict === 'step-up' || base.verdict === 'cooling');
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
  // SPEC §11.2: the WalletConnect request this review answers (absent for in-app transfers and mock dApps).
  const wcCtx = useWc();
  const wcReq = draft.dapp?.wc;
  const wcRef = wcReq ? { topic: wcReq.topic, id: wcReq.requestId, method: wcReq.method } : null;
  const wcExpired = wcReq ? Boolean(wcCtx?.find(wcReq.requestId)?.expired) : false;
  const wcAnswered = useRef(false);
  const [wcLine, setWcLine] = useState<string | null>(null);
  const answerWc = async (fn: () => Promise<void>) => {
    if (!wcRef || wcAnswered.current) return;
    wcAnswered.current = true;
    await fn().catch(() => undefined);
    wcCtx?.resolve(wcRef.id);
  };
  const declineWc = () =>
    wcRef &&
    answerWc(async () => {
      await respondRejected(wcRef, 'Declined in Keyline. Nothing was signed or sent.');
      logRequest(wcRef, draft.dapp?.description ?? wcRef.method, 'declined');
    });

  useEffect(() => {
    if (!d) return;
    const ms = new Date(d.expiresAt).getTime() - Date.now();
    const t = setTimeout(() => setExpired(true), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [d]);

  const confirm = useMutation({
    mutationFn: async (dec: PolicyDecision) => {
      setStage('building');
      // Safari: prepared ahead (useWarmOp below), so the first await here is the passkey prompt.
      const result = await signPreparedAndSend({
        wallet,
        decision: dec,
        build: () => buildOpFromDecision(wallet, dec),
        onStage: setStage,
      });
      setUserOpHash(result.userOpHash);
      if (wcRef) {
        const summary = dec.simulation.decodedCalls[0]?.humanText ?? draft.dapp?.description ?? wcRef.method;
        if (wcRef.method === 'wallet_sendCalls') {
          // EIP-5792: answer with the call-bundle id at once; the app polls wallet_getCallsStatus.
          await answerWc(async () => {
            await respondResult(wcRef, { id: result.userOpHash });
            logRequest(wcRef, summary, 'approved', { userOpHash: result.userOpHash });
          });
        } else {
          // eth_sendTransaction answers with the bundle tx hash, which exists once the userOp is included (~4 s).
          setWcLine(copyWc.request.tx.waitingBlock);
          const included = await waitForInclusion(result.userOpHash as `0x${string}`).catch(() => null);
          await answerWc(async () => {
            if (included?.success) {
              await respondResult(wcRef, included.txHash);
              logRequest(wcRef, summary, 'approved', {
                txHash: included.txHash,
                userOpHash: result.userOpHash,
              });
            } else {
              await respondError(wcRef, {
                code: -32603,
                message: included
                  ? `The transaction failed on the network (tx ${included.txHash}).`
                  : 'Sent from Keyline, but not included in time. Check the wallet activity.',
              });
              logRequest(wcRef, summary, 'failed', {
                userOpHash: result.userOpHash,
                ...(included ? { txHash: included.txHash } : {}),
              });
            }
          });
          setWcLine(included?.success ? copyWc.request.tx.answered : copyWc.request.tx.reverted);
        }
      }
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
        dapp:
          draft.dapp && wcReq
            ? {
                amount: heroAmount(dec.simulation.decodedCalls),
                unlimited: heroAmount(dec.simulation.decodedCalls) === copyWc.request.typed.rows.unlimited,
                name: draft.dapp.name,
                url: wcReq.url,
                icon: wcReq.icon,
                verification: wcReq.verification,
              }
            : undefined,
      });
      pendingSendStore.clear();
      return result.userOpHash;
    },
    onSuccess: (hash) => router.push(`/activity/${hash}`),
    onError: (error) => {
      setStage(null);
      // A cancelled passkey can be retried here; any other failure (sponsor refused, bundler down) is final for the
      // app's request — answer it now with the reason instead of leaving it waiting until it expires.
      if (wcRef && !(error instanceof PasskeyCancelledError)) {
        const reason = isApiError(error)
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
        answerWc(async () => {
          await respondError(wcRef, { code: -32603, message: `Not sent by Keyline: ${reason}` });
          logRequest(wcRef, draft.dapp?.description ?? wcRef.method, 'failed');
        });
      }
    },
  });

  // Auto-continue: the moment a step-up / cooling decision clears, run the usual sponsor → sign → send.
  const confirmMutate = confirm.mutate;
  useEffect(() => {
    if (!d || offerOpen) return;
    if (!cleared(d)) {
      if (d.verdict === 'step-up' || d.verdict === 'cooling') waitingId.current = d.decisionId;
      return;
    }
    if (waitingId.current === d.decisionId && !confirm.isPending && !confirm.isSuccess && !confirm.isError) {
      waitingId.current = null;
      // DESIGN.md §8: the step-up approved on the laptop is a confirmation on this phone — one short vibration.
      if (d.stepUp?.satisfiedBy === 'safety-key') haptic('success');
      confirmMutate(d);
    }
  }, [d, offerOpen, confirm.isPending, confirm.isSuccess, confirm.isError, confirmMutate]);

  const cancelDecision = useMutation({
    mutationFn: (id: string) => api.policy.cancel(id),
    onSuccess: () => {
      declineWc();
      pendingSendStore.clear();
      router.push(backHref);
    },
  });

  const applyCap = useMutation({
    onMutate: () => setChoice('cap'),
    mutationFn: (dec: PolicyDecision) => {
      const call = dec.suggestedCap?.call;
      if (!call) throw new Error('no cap');
      return evaluateDraft(wallet, draft, [call]);
    },
    onSuccess: (dec, source) => {
      // The unlimited decision is replaced: withdraw it so it never waits on the laptop.
      if (source.decisionId !== dec.decisionId) api.policy.cancel(source.decisionId).catch(() => undefined);
      waitingId.current = null;
      setCapAmount(source.suggestedCap?.amount ?? null);
      setCapped(dec);
    },
  });

  const verdict = d?.verdict;
  // DESIGN.md §8: a policy block vibrates once (24-60-24), per decision, never on re-render.
  const buzzedBlock = useRef<string | null>(null);
  useEffect(() => {
    if (d?.verdict === 'block' && buzzedBlock.current !== d.decisionId) {
      buzzedBlock.current = d.decisionId;
      haptic('refusal');
    }
  }, [d?.verdict, d?.decisionId]);
  // A policy block answers the app at once with the bank's reason (SPEC §11.2: error 4001 + reason).
  useEffect(() => {
    if (!wcRef || !d || d.verdict !== 'block' || wcAnswered.current) return;
    const reason = d.reasons[0] ?? copy.common.policyRefused;
    answerWc(async () => {
      await respondBlocked(wcRef, `Blocked by Keyline: ${reason}`);
      logRequest(wcRef, d.simulation.decodedCalls[0]?.humanText ?? wcRef.method, 'blocked');
    });
  });
  const isCleared = d !== undefined && cleared(d);
  const cancelled = confirm.error instanceof PasskeyCancelledError;
  const insufficient = !draft.dapp && balance.data !== undefined && draft.amountUsdc > balance.data;
  const danger = d?.simulation.decodedCalls.find((c) => c.risk === 'danger');
  const cap = d?.suggestedCap;
  // Mock (allowlist) dApps only: a WalletConnect block always shows the bank's own reason.
  const unknownDapp = verdict === 'block' && Boolean(draft.dapp) && !wcReq && !d?.screening.hit;
  const canConfirm = d !== undefined && !expired && !wcExpired && !insufficient && isCleared && !offerOpen;
  useWarmOp(d, () => buildOpFromDecision(wallet, d as PolicyDecision), canConfirm && !confirm.isPending);
  const rows = whatWillHappen(d, draft, balance.data);

  return (
    <>
      <ScreenHeader title={copy.review.title} backHref={backHref} />
      <section className="kl-balance">
        {wcReq && draft.dapp ? (
          // DESIGN-AUDIT WC-1/WC-3: what is asked, then who asks; one Contract row says where (no hex sentence).
          <div className="kl-stack kl-stack--tight w-full text-left">
            <p className="kl-balance__amount text-28">
              {verdict === 'block'
                ? copyWc.request.blockedTitle
                : wcReq.method === 'wallet_sendCalls'
                  ? copyWc.request.batch.title
                  : copyWc.request.tx.title}
            </p>
            <DappIdentityRow
              name={draft.dapp.name}
              url={wcReq.url}
              iconUrl={wcReq.icon}
              verification={wcReq.verification}
              copy={copyWc.identity}
            />
            {wcReq.method === 'wallet_sendCalls' ? (
              <p className="m-0 text-14 text-ink-2">{copyWc.request.batch.lead(draft.dapp.calls.length)}</p>
            ) : null}
            <p className="m-0 text-12 text-ink-3">{copyWc.request.tx.contract}</p>
          </div>
        ) : draft.dapp ? (
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
      {/* An expired approval replaces the verdict: never show "Approved" next to "Approval expired". */}
      {d && !offerOpen && !(expired && !confirm.isPending) ? (
        <Verdict
          decision={d}
          unknownDapp={unknownDapp}
          capAmount={capAmount}
          continuing={confirm.isPending}
          blockReason={wcReq && d.verdict === 'block' ? plainBlockReason(d, balance.data) : undefined}
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
        footnote={wcReq && verdict === 'block' ? undefined : copy.common.cantUndo}
        tone={verdict === 'block' || danger ? 'danger' : 'default'}
      />
      {danger && d ? (
        <Note tone="danger">
          {cap ? copy.review.dappDangerNote(draft.dapp?.name ?? draft.toLabel) : danger.humanText}
        </Note>
      ) : null}
      {verdict === 'block' ? (
        <p className="text-14 text-ink-2">
          {wcReq
            ? copyWc.request.blocked.body('').trim()
            : unknownDapp
              ? copyGaps.review.dappUnknownBody
              : copy.review.blockBody}
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

      {d ? (
        <TechnicalDetails
          decision={d}
          userOpHash={userOpHash}
          allReasons={Boolean(wcReq) && verdict === 'block'}
        />
      ) : null}

      <GestureRetry
        error={confirm.error}
        loading={confirm.isPending}
        onRetry={() => d && confirm.mutate(d)}
      />
      {cancelled && !(confirm.error instanceof PasskeyGestureError) ? (
        <Note tone="warn">{copy.review.passkeyCancelled}</Note>
      ) : null}
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
      {wcLine ? (
        <p className="text-14 text-ink-2" role="status" data-testid="wc-tx-line">
          {wcLine}
        </p>
      ) : null}
      {wcExpired ? (
        <Note tone="warn">
          {copyWc.request.expiredTitle}. {copyWc.request.expiredBody}
        </Note>
      ) : null}

      <div className="kl-actions">
        {verdict === 'block' ? (
          <>
            {unknownDapp ? (
              <Button variant="secondary" full disabled>
                {copy.dapps.requestReview}
              </Button>
            ) : null}
            <Button
              variant={wcReq ? 'secondary' : 'ghost'}
              full
              href={backHref}
              onClick={() => {
                declineWc();
                pendingSendStore.clear();
              }}
            >
              {wcReq ? copyWc.request.close : copy.common.back}
            </Button>
          </>
        ) : offerOpen && cap && d ? (
          // Once one option is chosen only that option stays, with its own pending state.
          <>
            <Button variant="primary" full loading={applyCap.isPending} onClick={() => applyCap.mutate(d)}>
              {copy.review.dappCap(`${formatUSDC(Number(cap.amount))}`)}
            </Button>
            {choice === null ? (
              <>
                <Button
                  variant="secondary"
                  full
                  onClick={() => setChoice('full')}
                  data-testid="approve-unlimited"
                >
                  {copyWc.request.tx.approveUnlimited}
                </Button>
                <Button
                  variant="ghost"
                  full
                  loading={cancelDecision.isPending}
                  onClick={() => cancelDecision.mutate(d.decisionId)}
                >
                  {wcReq ? copyWc.request.decline : copy.review.dappReject}
                </Button>
              </>
            ) : null}
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
              {wcReq
                ? wcReq.method === 'wallet_sendCalls'
                  ? copyWc.request.batch.approve
                  : copyWc.request.tx.approve
                : copy.review.confirm}
            </Button>
            {draft.dapp && !confirm.isPending ? (
              <Button
                variant="ghost"
                full
                href={backHref}
                onClick={() => {
                  declineWc();
                  pendingSendStore.clear();
                }}
              >
                {wcReq ? copyWc.request.decline : copy.review.dappReject}
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
  blockReason,
}: {
  decision: PolicyDecision;
  unknownDapp: boolean;
  capAmount: string | null;
  continuing: boolean;
  /** DESIGN-AUDIT WC-21: a plain-language block reason (the raw one goes to Technical details). */
  blockReason?: string;
}) {
  const p = copy.review.policy;
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
              blockReason
                ? blockReason
                : unknownDapp
                  ? copyGaps.review.dappUnknownBlock
                  : decision.screening.hit
                    ? p.block.reason
                    : (decision.reasons[0] ?? copy.common.policyRefused)
            }
            trailing={decision.screening.simulatedHit ? <SimulatedBadge /> : undefined}
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
          {r.replace(/\s*\(simulated\)/i, '')}
          {/\(simulated\)/i.test(r) ? (
            <>
              {' '}
              <SimulatedBadge />
            </>
          ) : null}
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
  const finishes = formatClock(endsAt);
  return (
    <div className="kl-stack items-center">
      <PolicyLine
        verdict="cooling"
        word={p.cooling.word}
        reason={p.cooling.reason(formatDuration(Math.max(0, endsAt - now)))}
      />
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
      // A plain transfer is already stated by "You send"; its decoded call only earns a row when it carries a risk.
      if (!draft.dapp && c.risk === 'none') continue;
      rows.push(
        draft.dapp
          ? fieldRow(c)
          : {
              label: <RiskWord risk={c.risk} />,
              value: c.humanText,
              tone: c.risk === 'danger' ? 'danger' : undefined,
            },
      );
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
      // DESIGN-AUDIT WC-5: the SIMULATED chip sits on the label line, the value stays one line.
      label: (
        <span>
          {copyGaps.review.screened}
          {!d.screening.hit || d.screening.simulatedHit ? (
            <>
              {' '}
              <SimulatedBadge />
            </>
          ) : null}
        </span>
      ),
      value: d.screening.hit ? copyGaps.review.screenedHit : copyGaps.review.screenedLists,
      tone: d.screening.hit ? 'danger' : 'ok',
    });
  }
  return rows;
}

/** WC-21: "Not enough USDC · You have 0.00 USDC, this needs 1.00 USDC" instead of the raw ERC-20 revert. */
function plainBlockReason(d: PolicyDecision, balance: number | undefined): string | undefined {
  const raw = d.reasons[0] ?? '';
  if (!/exceeds balance|insufficient/i.test(raw)) return undefined;
  const need = d.simulation.decodedCalls
    .filter((c) => c.fn.startsWith('transfer(') && c.to.toLowerCase() === env.usdcAddress.toLowerCase())
    .reduce((sum, c) => sum + Number(formatUnits(BigInt(c.args[1] ?? '0'), 6)), 0);
  if (need <= 0) return undefined;
  return copyWc.request.notEnough(formatUSDC(balance ?? 0), formatUSDC(need));
}

/**
 * A dApp call as a field row (DESIGN-AUDIT WC-5, the TypedDataRows rule): `approve` → "Spending limit · Unlimited"
 * (danger) or the capped amount; `transfer` → "You send · 1.00 USDC"; anything else keeps the bank's sentence.
 */
function fieldRow(c: DecodedCall): PanelRow {
  const tone = c.risk === 'danger' ? ('danger' as const) : undefined;
  const t = copyWc.request.tx;
  const amount = (raw: string | undefined) => {
    if (raw === undefined) return '—';
    try {
      const v = BigInt(raw);
      if (v >= 1n << 255n) return copyWc.request.typed.rows.unlimited;
      return c.to.toLowerCase() === env.usdcAddress.toLowerCase()
        ? formatUSDC(Number(formatUnits(v, 6)))
        : raw;
    } catch {
      return raw;
    }
  };
  if (c.fn.startsWith('approve(')) return { label: t.spendingLimit, value: amount(c.args[1]), tone };
  if (c.fn.startsWith('transfer(')) return { label: t.youSend, value: amount(c.args[1]), tone };
  return { label: c.fn.split('(')[0] || c.fn, value: c.humanText, tone };
}

/** The receipt hero for a dApp operation: the first call's amount or limit, as the review's field row shows it. */
function heroAmount(calls: readonly DecodedCall[]): string | undefined {
  const first = calls[0];
  if (!first) return undefined;
  const v = fieldRow(first).value;
  if (typeof v !== 'string' || v === '—') return undefined;
  return first.fn.startsWith('transfer(') ? `– ${v}` : v;
}

function TechnicalDetails({
  decision: d,
  userOpHash,
  allReasons = false,
}: {
  decision: PolicyDecision;
  userOpHash: string | null;
  /** The headline shows a rewritten reason: keep the bank's raw first reason here too. */
  allReasons?: boolean;
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
        <Reasons reasons={d.reasons} except={!allReasons && d.reasons[0] ? [d.reasons[0]] : []} />
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
