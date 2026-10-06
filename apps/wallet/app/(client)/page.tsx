'use client';

import type { Event } from '@keyline/shared';
import {
  Address,
  AmountField,
  Button,
  EmptyState,
  formatCHF,
  formatShortDateTime,
  formatSignedUSDC,
  formatUSDC,
  Note,
  PolicyLine,
  Sheet,
  SimulatedBadge,
  Skeleton,
  StatementRow,
  TestnetStrip,
} from '@keyline/ui';
import { Bell, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy } from '@/src/copy';
import { env } from '@/src/env';
import { api } from '@/src/lib/api';
import { addressUrl, PasskeyCancelledError } from '@/src/lib/chain';
import { usePersona } from '@/src/lib/device';
import {
  useAlerts,
  useLocalTransfers,
  useLocalWallet,
  useMe,
  useUsdcBalance,
  useWalletEvents,
} from '@/src/lib/hooks';
import { localWalletFromLogin, loginWithPasskey } from '@/src/lib/passkey';
import { type LocalWallet, topupStore } from '@/src/lib/storage';

const STEP_TITLES = [
  copy.onboarding.s1.step,
  copy.onboarding.s2.step,
  copy.onboarding.s3.step,
  copy.onboarding.s4.step,
  copy.onboarding.s5.step,
  copy.onboarding.s6.step,
] as const;

export default function HomePage() {
  const persona = usePersona();
  const { wallet, save } = useLocalWallet();

  if (wallet === undefined || persona === null) return <HomeSkeleton />;
  if (persona === 'thief') return <NoKeyHome />;
  if (wallet === null) return <NoWalletHome onLoggedIn={save} />;
  return <WalletHome wallet={wallet} />;
}

function HomeSkeleton() {
  return (
    <>
      <header className="kl-topbar">
        <h1 className="kl-topbar__title">{copy.brand}</h1>
      </header>
      <Skeleton kind="amount" />
      <Skeleton kind="row" count={3} />
    </>
  );
}

/** Thief persona: the device has the URL but no credential (SPEC F4.1). */
function NoKeyHome() {
  return (
    <>
      <header className="kl-topbar">
        <h1 className="kl-topbar__title">{copy.brand}</h1>
      </header>
      <Note tone="danger" title={copy.home.noKeyTitle}>
        {copy.home.noKeyBody}
      </Note>
      <div className="kl-actions">
        <Button variant="secondary" full href="/recover">
          {copy.home.lostPhone}
        </Button>
      </div>
      <TestnetStrip explorerUrl={env.explorer} />
    </>
  );
}

/** No local profile: create a wallet, or sign in with an existing passkey (login = WebAuthn get, SPEC F2.1). */
function NoWalletHome({ onLoggedIn }: { onLoggedIn: (wallet: LocalWallet) => void }) {
  const router = useRouter();
  const [cancelled, setCancelled] = useState(false);
  const login = useMutation({
    mutationFn: loginWithPasskey,
    onSuccess: (result) => {
      const local = localWalletFromLogin(result);
      if (local) onLoggedIn(local);
      else router.push('/onboarding');
    },
    onError: (error) => setCancelled(error instanceof PasskeyCancelledError),
  });
  return (
    <>
      <header className="kl-topbar">
        <h1 className="kl-topbar__title">{copy.brand}</h1>
      </header>
      <EmptyState title={copy.home.noWalletTitle} body={copy.home.noWalletBody} />
      {cancelled ? <Note tone="warn">{copy.onboarding.s1.cancelled}</Note> : null}
      {login.isError && !cancelled ? (
        <ApiErrorState error={login.error} body={copy.common.errorBody} onRetry={() => login.mutate()} />
      ) : null}
      <div className="kl-actions">
        <Button variant="primary" full href="/onboarding">
          {copy.home.createWallet}
        </Button>
        <Button variant="ghost" full loading={login.isPending} onClick={() => login.mutate()}>
          {copy.onboarding.s1.signIn}
        </Button>
      </div>
      <TestnetStrip explorerUrl={env.explorer} />
    </>
  );
}

function WalletHome({ wallet }: { wallet: LocalWallet }) {
  const balance = useUsdcBalance(wallet.address);
  const events = useWalletEvents(wallet.address);
  const { transfers, topups, refresh } = useLocalTransfers();
  const alerts = useAlerts(wallet.address);
  const attack = (alerts.data ?? []).some(
    (a) =>
      a.kind === 'recovery-started' &&
      !(alerts.data ?? []).some(
        (o) =>
          o.recoveryRequestId === a.recoveryRequestId &&
          (o.kind === 'recovery-finalized' || o.kind === 'recovery-cancelled'),
      ),
  );
  const [sheet, setSheet] = useState<'none' | 'receive' | 'topup'>('none');
  const [protectionWord, protectionReason] = copy.home.protection.split(' · ');
  const usdc = balance.data ?? 0;
  const onboardingPending = wallet.onboardingStep < 7;

  const rows = buildStatement(transfers, topups, events.data ?? []);

  return (
    <>
      <header className="kl-topbar">
        <h1 className="kl-topbar__title">{copy.brand}</h1>
        <div className="flex items-center gap-1">
          {alerts.data && alerts.data.length > 0 ? (
            <Link
              href="/alerts"
              className="kl-btn kl-btn--ghost kl-btn--sm kl-btn--icon"
              aria-label={copy.alerts.title}
            >
              <Bell size={20} aria-hidden="true" />
            </Link>
          ) : null}
          <Link
            href="/security"
            className="kl-btn kl-btn--ghost kl-btn--sm kl-btn--icon"
            aria-label={copy.security.title}
          >
            <ShieldCheck size={20} aria-hidden="true" />
          </Link>
        </div>
      </header>
      {attack ? (
        <Note tone="danger" title={copy.alerts.startedTitle}>
          <Button variant="danger" size="sm" href="/alerts">
            {copy.alerts.open}
          </Button>
        </Note>
      ) : null}

      {onboardingPending ? (
        <StatementRow
          label={copy.onboarding.stepLabel(
            wallet.onboardingStep,
            6,
            STEP_TITLES[wallet.onboardingStep - 1] ?? '',
          )}
          meta={copy.common.continue}
          status="pending"
          href="/onboarding"
        />
      ) : null}

      <section className="kl-balance" aria-label={copy.home.balance}>
        <p className="kl-eyebrow">{copy.home.balance}</p>
        {balance.isPending ? (
          <Skeleton kind="amount" />
        ) : balance.isError ? (
          <ApiErrorState
            error={balance.error}
            body={copy.common.errorBody}
            onRetry={() => balance.refetch()}
          />
        ) : (
          <>
            <p className="kl-balance__amount">{formatCHF(usdc * env.chfPerUsdc)}</p>
            <p className="kl-balance__secondary">{formatUSDC(usdc)}</p>
            <p className="text-12 text-ink-3">
              {copy.send.rate(formatCHF(env.chfPerUsdc))} <SimulatedBadge />
            </p>
          </>
        )}
        {wallet.status === 'deployed' ? (
          <Link href="/security" className="no-underline">
            <PolicyLine verdict="ok" word={protectionWord} reason={protectionReason} />
          </Link>
        ) : null}
      </section>

      <div className="kl-actions kl-actions--row mt-0">
        <Button variant="primary" href="/send" disabled={wallet.status !== 'deployed'}>
          {copy.home.send}
        </Button>
        <Button variant="secondary" onClick={() => setSheet('receive')}>
          {copy.home.receive}
        </Button>
        <Button variant="secondary" onClick={() => setSheet('topup')}>
          {copy.home.topUp}
        </Button>
      </div>

      <section className="kl-stack" aria-label={copy.home.statement}>
        <div className="kl-section">
          <h2 className="kl-section__title">{copy.home.statement}</h2>
        </div>
        {events.isPending && rows.length === 0 ? (
          <Skeleton kind="row" count={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={copy.home.emptyTitle}
            body={copy.home.emptyBody}
            action={
              <Button variant="secondary" onClick={() => setSheet('topup')}>
                {copy.home.emptyAction}
              </Button>
            }
          />
        ) : (
          <div>
            {rows.map((r) => (
              <StatementRow
                key={r.key}
                label={r.label}
                meta={r.meta}
                amount={r.amount}
                amountSub={r.amountSub}
                status={r.status}
                statusWord={r.statusWord}
                href={r.href}
                chevron={Boolean(r.href)}
              />
            ))}
          </div>
        )}
        {events.isError ? (
          <ApiErrorState error={events.error} body={copy.common.errorBody} onRetry={() => events.refetch()} />
        ) : null}
      </section>

      <TestnetStrip explorerUrl={addressUrl(wallet.address)} />

      <Sheet open={sheet === 'receive'} title={copy.home.receiveTitle} onClose={() => setSheet('none')}>
        <div className="kl-stack">
          <Address value={wallet.address} expanded explorerUrl={addressUrl(wallet.address)} />
          <p className="text-14 text-ink-2">{copy.home.receiveNote}</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'topup'} title={copy.home.topUpTitle} onClose={() => setSheet('none')}>
        <TopUpForm
          wallet={wallet}
          onDone={() => {
            refresh();
            balance.refetch();
            setSheet('none');
          }}
        />
      </Sheet>
    </>
  );
}

function TopUpForm({ wallet, onDone }: { wallet: LocalWallet; onDone: () => void }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [chf, setChf] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const topup = useMutation({
    mutationFn: (amountUsdc: number) => api.topups.create({ wallet: wallet.address, amountUsdc }),
    onSuccess: (result) => {
      topupStore.add({
        txHash: result.txHash,
        amountUsdc: result.amountUsdc,
        amountChf: result.amountChf,
        at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      onDone();
    },
  });

  function submit() {
    const value = Number.parseFloat(chf);
    if (!Number.isFinite(value) || value <= 0) {
      setFieldError(copy.send.errAmount);
      return;
    }
    setFieldError(undefined);
    topup.mutate(Number((value / env.chfPerUsdc).toFixed(2)));
  }

  return (
    <div className="kl-stack gap-4">
      <AmountField value={chf} onChange={setChf} rate={env.chfPerUsdc} error={fieldError} />
      <Note tone="info">{copy.home.topUpNote}</Note>
      <p className="text-14 text-ink-2">
        {me.isSuccess
          ? copy.home.topUpBalance(formatCHF(me.data.account.balance))
          : copy.home.topUpBalance('—')}{' '}
        <SimulatedBadge />
      </p>
      {topup.isError ? (
        <ApiErrorState error={topup.error} body={copy.common.errorBody} onRetry={submit} />
      ) : null}
      <Button variant="primary" full loading={topup.isPending} onClick={submit}>
        {copy.home.topUp}
      </Button>
    </div>
  );
}

type Row = {
  key: string;
  label: string;
  meta: string;
  amount: string;
  amountSub: string;
  status: 'ok' | 'pending' | 'danger';
  statusWord: string;
  href?: string;
  at: number;
};

function buildStatement(
  transfers: ReturnType<typeof useLocalTransfers>['transfers'],
  topups: ReturnType<typeof useLocalTransfers>['topups'],
  events: Event[],
): Row[] {
  const rows: Row[] = [];
  for (const t of transfers) {
    const status =
      t.status === 'confirmed' || t.status === 'included'
        ? 'ok'
        : t.status === 'failed'
          ? 'danger'
          : 'pending';
    rows.push({
      key: t.userOpHash,
      label: t.toLabel,
      meta: formatShortDateTime(new Date(t.at)),
      amount: formatSignedUSDC(-t.amountUsdc),
      amountSub: formatCHF(t.amountChf),
      status,
      statusWord:
        status === 'ok'
          ? copy.home.status.confirmed
          : status === 'danger'
            ? copy.home.status.failed
            : copy.home.status.sent,
      href: `/activity/${t.userOpHash}`,
      at: new Date(t.at).getTime(),
    });
  }
  const seenTx = new Set<string>();
  for (const t of topups) {
    seenTx.add(t.txHash.toLowerCase());
    rows.push({
      key: t.txHash,
      label: copy.home.topUpRow,
      meta: formatShortDateTime(new Date(t.at)),
      amount: formatSignedUSDC(t.amountUsdc),
      amountSub: formatCHF(t.amountChf),
      status: 'ok',
      statusWord: copy.home.status.confirmed,
      at: new Date(t.at).getTime(),
    });
  }
  // Top-ups recorded by the bank (e.g. from another device of the same client) that this device has not seen.
  for (const e of events) {
    if (!e.type.startsWith('topup')) continue;
    const txHash = typeof e.payload.txHash === 'string' ? e.payload.txHash.toLowerCase() : undefined;
    if (!txHash || seenTx.has(txHash)) continue;
    const amountUsdc = typeof e.payload.amountUsdc === 'number' ? e.payload.amountUsdc : 0;
    rows.push({
      key: e.id,
      label: copy.home.topUpRow,
      meta: formatShortDateTime(new Date(e.at)),
      amount: formatSignedUSDC(amountUsdc),
      amountSub: formatCHF(amountUsdc * env.chfPerUsdc),
      status: 'ok',
      statusWord: copy.home.status.confirmed,
      at: new Date(e.at).getTime(),
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}
