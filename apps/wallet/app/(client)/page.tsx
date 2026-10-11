'use client';

import type { Event } from '@keyline/shared';
import { Bell, GearSix } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ReceiveSheet } from '@/src/components/ReceiveSheet';
import { copy, copyC, copyV2, usePrefs } from '@/src/copy';
import { env } from '@/src/env';
import { formatFiat } from '@/src/i18n/money';
import type { Lang } from '@/src/i18n/prefs';
import { api } from '@/src/lib/api';
import { usePersona } from '@/src/lib/device';
import { decimalsFor, formatQty } from '@/src/lib/format';
import {
  useAlerts,
  useAssetBalances,
  useLocalTransfers,
  useLocalWallet,
  useMe,
  useSqPositions,
  useUsdcBalance,
  useWalletEvents,
} from '@/src/lib/hooks';
import { localWalletFromLogin, loginWithPasskey } from '@/src/lib/passkey';
import { addressUrl, PasskeyCancelledError } from '@/src/lib/reads';
import { type LocalWallet, topupStore } from '@/src/lib/storage';
import {
  AmountField,
  AssetRow,
  Button,
  Chip,
  EmptyState,
  formatCHF,
  formatShortDateTime,
  formatSignedUSDC,
  Note,
  NumberTicker,
  ProtectionRing,
  SheetV2,
  SimulatedBadge,
  Skeleton,
  StatementRow,
  TestnetStrip,
} from '@/src/ui';

const stepTitles = () =>
  [
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

/** Static SIMULATED prices (SPEC §10 F0.2), used only until `GET /sq/positions` answers with the bank's own. */
const FALLBACK_CHF = { USDC: env.chfPerUsdc, EURC: 0.94, ETH: 3120 } as const;
const ASSETS = [
  { symbol: 'USDC', name: 'USD Coin', decimals: 2 },
  { symbol: 'EURC', name: 'Euro Coin', decimals: 2 },
  { symbol: 'ETH', name: 'Ether', decimals: 4 },
] as const;

function WalletHome({ wallet }: { wallet: LocalWallet }) {
  const balances = useAssetBalances(wallet.address);
  const balance = useUsdcBalance(wallet.address);
  const events = useWalletEvents(wallet.address);
  const positions = useSqPositions();
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
  // Legacy E2E only: the v1 top-up stays reachable at `/?sheet=topup`; it is not offered on home (DECISIONS #26).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('sheet') === 'topup') setSheet('topup');
  }, []);
  const v = copyV2.home;
  const money = usePrefs();
  const onboardingPending = wallet.onboardingStep < 7;
  const protectedNow = wallet.status === 'deployed';

  const price = (symbol: 'USDC' | 'EURC' | 'ETH'): number => {
    const p = positions.data?.positions.find((x) => x.symbol === symbol);
    return p ? Number(p.priceChf) : FALLBACK_CHF[symbol];
  };
  const totalChf = balances.data
    ? ASSETS.reduce((sum, a) => sum + balances.data[a.symbol] * price(a.symbol), 0)
    : 0;
  const rows = buildStatement(transfers, topups, events.data ?? [], money.prefs.lang);

  return (
    <>
      <header className="kl-topbar">
        <h1 className="kl-topbar__title">{copy.brand}</h1>
        <div className="flex items-center gap-1">
          {protectedNow ? (
            <Link
              href="/security"
              className="flex min-h-11 items-center gap-2 px-2 text-14 font-semibold text-ink no-underline"
              data-testid="home-protected"
            >
              <ProtectionRing state="protected" size={24} label={v.protectionTitle} />
              {v.protected}
            </Link>
          ) : null}
          {alerts.data && alerts.data.length > 0 ? (
            <Link
              href="/alerts"
              className="kl-btn kl-btn--ghost kl-btn--sm kl-btn--icon"
              aria-label={copy.alerts.title}
            >
              <Bell size={20} aria-hidden="true" />
            </Link>
          ) : null}
          <Link href="/settings" className="kl2-iconbtn" aria-label={v.settings} data-testid="home-settings">
            <GearSix size={20} aria-hidden="true" />
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
            stepTitles()[wallet.onboardingStep - 1] ?? '',
          )}
          meta={copy.common.continue}
          status="pending"
          href="/onboarding"
        />
      ) : null}

      <section className="grid gap-1" aria-label={v.balance} data-testid="home-balance">
        <p className="kl-eyebrow">{v.balance}</p>
        {balances.isPending ? (
          <Skeleton kind="amount" />
        ) : balances.isError ? (
          <ApiErrorState
            error={balances.error}
            body={copy.common.errorBody}
            onRetry={() => balances.refetch()}
          />
        ) : (
          <>
            <p className="m-0 text-44 font-semibold tracking-[-0.025em]">
              <NumberTicker value={money.toDisplay(totalChf)} format={money.displayFormat} />
            </p>
            <p className="m-0 text-12 text-ink-3">{copyC.home.totalNote(money.prefs.currency)}</p>
            <p className="m-0 flex items-center gap-1 text-12 text-ink-3" data-testid="home-rate">
              {money.rate(price('USDC'))}
              <Chip />
            </p>
          </>
        )}
      </section>

      <div className="kl-actions mt-0 gap-2" data-testid="home-actions">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" full href="/send" disabled={!protectedNow}>
            {v.send}
          </Button>
          <Button variant="secondary" full onClick={() => setSheet('receive')}>
            {v.receive}
          </Button>
        </div>
        <Button variant="secondary" full href="/back" disabled={!protectedNow}>
          {copyV2.home.backToSq}
        </Button>
      </div>

      <section aria-label={copyV2.home.assets} data-testid="home-assets">
        <div className="kl-section">
          <h2 className="kl-section__title">{copyV2.home.assets}</h2>
        </div>
        <div>
          {ASSETS.map((a) => (
            <AssetRow
              key={a.symbol}
              loading={balances.isPending}
              name={a.name}
              symbol={a.symbol}
              quantity={balances.data ? formatQty(balances.data[a.symbol], a.decimals) : ''}
              value={balances.data ? money.fiat(balances.data[a.symbol] * price(a.symbol)) : undefined}
            />
          ))}
        </div>
      </section>

      <section className="kl-stack" aria-label={copy.home.statement}>
        <div className="kl-section">
          <h2 className="kl-section__title">{copy.home.statement}</h2>
          <Link className="kl2-link text-14" href="/activity" data-testid="home-all">
            {copy.home.all}
          </Link>
        </div>
        {events.isPending && rows.length === 0 ? (
          <Skeleton kind="row" count={3} />
        ) : rows.length === 0 && events.isError ? null : rows.length === 0 ? (
          <EmptyState title={copy.home.emptyTitle} body={copyC.activity.emptyBody} />
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

      <section aria-label={v.sq} data-testid="home-sq">
        <div className="kl-section flex-wrap gap-2">
          <h2 className="kl-section__title flex items-center gap-1 whitespace-nowrap">
            {v.sq}
            <Chip />
          </h2>
          <Link className="kl2-link whitespace-nowrap text-14" href="/swissquote/portfolio">
            {v.sqOpen}
          </Link>
        </div>
        <p className="m-0 text-12 text-ink-3">{v.sqNote}</p>
        {positions.isPending ? (
          <Skeleton kind="row" count={3} />
        ) : positions.isError ? (
          <ApiErrorState
            error={positions.error}
            body={copy.common.errorBody}
            onRetry={() => positions.refetch()}
          />
        ) : (
          <div>
            {positions.data.positions.map((p) => (
              <StatementRow
                key={p.id}
                label={(copyC.positions as Record<string, string>)[p.id] ?? p.name}
                meta={
                  p.kind === 'cash'
                    ? copyV2.sqWeb.portfolio.cashMeta
                    : p.kind === 'crypto'
                      ? copyV2.sqWeb.portfolio.groups.crypto
                      : copyV2.sqWeb.portfolio.groups.securities
                }
                amount={formatCHF(Number(p.valueChf))}
                amountSub={
                  p.kind === 'cash'
                    ? undefined
                    : formatQty(Number(p.quantity), decimalsFor(p.symbol), p.symbol)
                }
                chevron={false}
              />
            ))}
          </div>
        )}
      </section>

      <TestnetStrip explorerUrl={addressUrl(wallet.address)} />

      <ReceiveSheet open={sheet === 'receive'} address={wallet.address} onClose={() => setSheet('none')} />

      <SheetV2
        contained
        open={sheet === 'topup'}
        title={copy.home.topUpTitle}
        onClose={() => setSheet('none')}
      >
        <TopUpForm
          wallet={wallet}
          onDone={() => {
            refresh();
            balance.refetch();
            balances.refetch();
            setSheet('none');
          }}
        />
      </SheetV2>
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
      <Button variant="primary" full loading={topup.isPending} onClick={submit}>
        {copy.home.topUp}
      </Button>
      {topup.isError ? (
        <ApiErrorState error={topup.error} body={copy.common.errorBody} onRetry={submit} />
      ) : null}
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
  lang: Lang,
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
      meta: formatShortDateTime(new Date(t.at), lang),
      amount: formatSignedUSDC(-t.amountUsdc),
      amountSub: formatFiat(t.amountChf),
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
      meta: formatShortDateTime(new Date(t.at), lang),
      amount: formatSignedUSDC(t.amountUsdc),
      amountSub: formatFiat(t.amountChf),
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
      meta: formatShortDateTime(new Date(e.at), lang),
      amount: formatSignedUSDC(amountUsdc),
      amountSub: formatFiat(amountUsdc * env.chfPerUsdc),
      status: 'ok',
      statusWord: copy.home.status.confirmed,
      at: new Date(e.at).getTime(),
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}
