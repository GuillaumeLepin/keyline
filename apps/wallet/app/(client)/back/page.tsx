'use client';

import type { PolicyDecision } from '@keyline/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type Address as Addr, getAddress } from 'viem';
import { AmountEntry } from '@/src/components/AmountEntry';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { GestureRetry } from '@/src/components/GestureRetry';
import { StackPage } from '@/src/components/StackPage';
import { copy, copyV2 } from '@/src/copy';
import { formatFiat } from '@/src/i18n/money';
import { api } from '@/src/lib/api';
import {
  addressUrl,
  buildOpFromDecision,
  PasskeyCancelledError,
  PasskeyGestureError,
  signPreparedAndSend,
  transferCall,
} from '@/src/lib/chain';
import { getDeviceLabel } from '@/src/lib/device';
import { useLocalWallet, useUsdcBalance } from '@/src/lib/hooks';
import { useWarmOp } from '@/src/lib/prepare';
import { type LocalWallet, transferStore } from '@/src/lib/storage';
import {
  ActionButton,
  Address,
  CrossFade,
  formatUSDC,
  Note,
  Panel,
  PolicyLine,
  Skeleton,
  StatementRow,
  TravelRuleLine,
} from '@/src/ui';

/** D5 · Back to Swissquote: USDC to the bank deposit address (Lea's own account, verified) — always Tier 1. */
export default function BackToSwissquotePage() {
  const router = useRouter();
  const { wallet } = useLocalWallet();
  if (wallet === undefined) return <Skeleton kind="amount" />;
  if (wallet === null) {
    router.replace('/');
    return null;
  }
  return <Back wallet={wallet} />;
}

function Back({ wallet }: { wallet: LocalWallet }) {
  const router = useRouter();
  const s = copyV2.back;
  const balance = useUsdcBalance(wallet.address);
  const deposit = useQuery({
    queryKey: ['sq', 'deposit-address'],
    queryFn: api.sq.depositAddress,
    retry: false,
  });
  const [draft, setDraft] = useState<{ amountUsdc: number; amountChf: number } | null>(null);

  return (
    <StackPage
      testId={draft ? 'back-review-step' : 'back-amount-step'}
      screenKey={draft ? 'review' : 'amount'}
      direction={draft ? 1 : -1}
      title={draft ? copyV2.back.review.title : s.title}
      onBack={() => (draft ? setDraft(null) : router.push('/'))}
    >
      {draft ? (
        <CrossFade stateKey={deposit.isPending ? 'loading' : deposit.isError ? 'error' : 'ready'}>
          {deposit.isPending ? (
            <Skeleton kind="block" />
          ) : deposit.isError ? (
            <ApiErrorState
              error={deposit.error}
              body={copy.common.errorBody}
              onRetry={() => deposit.refetch()}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <Review
                wallet={wallet}
                to={getAddress(deposit.data.address)}
                amountUsdc={draft.amountUsdc}
                amountChf={draft.amountChf}
                balanceUsdc={balance.data}
                onSent={(hash) => router.push(`/activity/${hash}`)}
              />
            </div>
          )}
        </CrossFade>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <p className="kl-lead m-0">{s.body}</p>
          <StatementRow label={s.asset} amount="USDC" amountSub="Base Sepolia" chevron={false} />
          <AmountEntry
            walletAddress={wallet.address}
            primaryLabel={s.primary}
            testIdPrefix="back"
            onSubmit={setDraft}
          />
        </div>
      )}
    </StackPage>
  );
}

function Review({
  wallet,
  to,
  amountUsdc,
  amountChf,
  balanceUsdc,
  onSent,
}: {
  wallet: LocalWallet;
  to: Addr;
  amountUsdc: number;
  amountChf: number;
  balanceUsdc: number | undefined;
  onSent: (userOpHash: string) => void;
}) {
  const g = copyV2.back.review;
  const decision = useQuery({
    queryKey: ['decision', 'to-own-account', wallet.address, amountUsdc],
    queryFn: () =>
      api.policy.evaluate({
        kind: 'to-own-account',
        walletAddress: wallet.address,
        calls: [transferCall(to, amountUsdc)],
        chfValue: amountChf,
        recipientAddress: to,
        deviceLabel: getDeviceLabel(),
      }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const send = useMutation({
    mutationFn: async (dec: PolicyDecision) => {
      // Safari: prepared ahead (useWarmOp), so the tap's first await is the passkey prompt.
      const result = await signPreparedAndSend({
        wallet,
        decision: dec,
        build: () => buildOpFromDecision(wallet, dec),
      });
      const now = new Date().toISOString();
      transferStore.upsert({
        userOpHash: result.userOpHash,
        to,
        toLabel: g.recipient,
        amountUsdc,
        amountChf,
        at: now,
        status: 'sent',
        timeline: { signedAt: now, sentAt: now },
        decisionId: dec.decisionId,
      });
      return result.userOpHash;
    },
    onSuccess: onSent,
  });
  const d = decision.data;
  const insufficient = balanceUsdc !== undefined && amountUsdc > balanceUsdc;
  const approved = d?.verdict === 'approve';
  const cancelled =
    send.error instanceof PasskeyCancelledError && !(send.error instanceof PasskeyGestureError);
  useWarmOp(
    d,
    () => buildOpFromDecision(wallet, d as PolicyDecision),
    approved && !insufficient && !send.isPending,
  );

  return (
    <>
      <section className="grid gap-1" data-testid="back-review-screen">
        <p className="m-0 text-44 font-semibold tracking-[-0.025em]">{formatFiat(amountChf)}</p>
        <p className="m-0 text-16 text-ink-2">{`${formatUSDC(amountUsdc)} ${g.to}`}</p>
        <Address value={to} explorerUrl={addressUrl(to)} />
      </section>
      {decision.isPending ? <Skeleton kind="line" count={2} /> : null}
      {d ? (
        approved ? (
          <PolicyLine verdict="ok" word={g.policy.word} reason={g.policy.reason} />
        ) : (
          <PolicyLine verdict="block" reason={d.reasons[0] ?? copy.common.policyRefused} />
        )
      ) : null}
      <TravelRuleLine text={g.travelRule} />
      <Panel
        title={g.panel}
        rows={[
          { label: g.rows.send, value: formatUSDC(amountUsdc) },
          { label: g.rows.to, value: g.recipient },
          ...(balanceUsdc !== undefined
            ? [{ label: g.rows.balance, value: formatUSDC(Math.max(0, balanceUsdc - amountUsdc)) }]
            : []),
          { label: g.rows.fee, value: g.rows.feeValue },
        ]}
        footnote={g.footnote}
      />
      {insufficient ? <Note tone="danger">{copy.send.errFunds(formatUSDC(balanceUsdc ?? 0))}</Note> : null}
      {decision.isError ? (
        <ApiErrorState
          error={decision.error}
          body={copy.common.errorBody}
          onRetry={() => decision.refetch()}
        />
      ) : null}
      <GestureRetry error={send.error} loading={send.isPending} onRetry={() => d && send.mutate(d)} />
      {cancelled ? <Note tone="warn">{copy.review.passkeyCancelled}</Note> : null}
      {send.isError && !cancelled ? (
        <ApiErrorState
          error={send.error}
          body={copy.activity.failedBody}
          onRetry={() => d && send.mutate(d)}
        />
      ) : null}
      <div className="kl-actions">
        <ActionButton
          full
          label={copyV2.back.review.cta}
          disabled={!approved || insufficient}
          status={send.isPending ? 'loading' : send.isSuccess ? 'success' : 'idle'}
          onClick={() => d && send.mutate(d)}
          data-testid="back-confirm"
        />
      </div>
    </>
  );
}
