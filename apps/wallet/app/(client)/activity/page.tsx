'use client';

import { ScreenHeader } from '@/src/components/ScreenHeader';
import { useCopy } from '@/src/copy';
import { formatFiat } from '@/src/i18n/money';
import { useLocalTransfers, useLocalWallet } from '@/src/lib/hooks';
import {
  Button,
  CrossFade,
  EmptyState,
  formatShortDateTime,
  formatSignedUSDC,
  Skeleton,
  StatementRow,
} from '@/src/ui';

/** D9 Activity: every transfer this device signed, newest first; each row opens its receipt. */
export default function ActivityListPage() {
  const t = useCopy();
  const a = t.copyC.activity;
  const { wallet } = useLocalWallet();
  const { transfers, topups } = useLocalTransfers();
  const ready = wallet !== undefined;
  const rows = [
    ...transfers.map((x) => ({
      key: x.userOpHash,
      label: x.toLabel,
      meta: formatShortDateTime(new Date(x.at)),
      amount: formatSignedUSDC(-x.amountUsdc),
      amountSub: formatFiat(x.amountChf),
      status: (x.status === 'failed'
        ? 'danger'
        : x.status === 'confirmed' || x.status === 'included'
          ? 'ok'
          : 'pending') as 'ok' | 'pending' | 'danger',
      word:
        x.status === 'failed'
          ? t.copy.home.status.failed
          : x.status === 'confirmed' || x.status === 'included'
            ? t.copy.home.status.confirmed
            : t.copy.home.status.sent,
      href: `/activity/${x.userOpHash}`,
      at: new Date(x.at).getTime(),
    })),
    ...topups.map((x) => ({
      key: x.txHash,
      label: t.copy.home.topUpRow,
      meta: formatShortDateTime(new Date(x.at)),
      amount: formatSignedUSDC(x.amountUsdc),
      amountSub: formatFiat(x.amountChf),
      status: 'ok' as const,
      word: t.copy.home.status.confirmed,
      href: undefined,
      at: new Date(x.at).getTime(),
    })),
  ].sort((p, q) => q.at - p.at);

  return (
    <>
      <ScreenHeader title={a.title} backHref="/" />
      <CrossFade stateKey={ready ? (rows.length ? 'list' : 'empty') : 'loading'}>
        {!ready ? (
          <Skeleton kind="row" count={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={a.emptyTitle}
            body={a.emptyBody}
            action={
              <Button variant="secondary" href="/">
                {a.backHome}
              </Button>
            }
          />
        ) : (
          <div data-testid="activity-list">
            {rows.map((r) => (
              <StatementRow
                key={r.key}
                label={r.label}
                meta={r.meta}
                amount={r.amount}
                amountSub={r.amountSub}
                status={r.status}
                statusWord={r.word}
                href={r.href}
                chevron={Boolean(r.href)}
              />
            ))}
          </div>
        )}
      </CrossFade>
    </>
  );
}
