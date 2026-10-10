'use client';

import type { DeskQueueItem } from '@keyline/shared';
import { useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { useDeskToken } from '@/src/components/DeskShell';
import { DeskSignedOut } from '@/src/components/DeskSignedOut';
import { copy } from '@/src/copy';
import { shortId, statusLabel, statusTone, useDeskQueue, waitingForLabel } from '@/src/lib/desk';
import { useNow } from '@/src/lib/hooks';
import { Button, CrossFade, EmptyState, formatRelative, Skeleton, StatementRow } from '@/src/ui';

type Filter = 0 | 1 | 2; // Open · Refused · Finished (copy.desk.filters)

function matches(item: DeskQueueItem, filter: Filter): boolean {
  const s = item.recovery.status;
  if (filter === 1) return s === 'identity-refused';
  if (filter === 2) return s === 'finalized' || s === 'cancelled';
  return s === 'identity-pending' || s === 'awaiting-guardians' || s === 'executed-waiting';
}

export default function DeskQueuePage() {
  const s = copy.desk;
  const { token, ready } = useDeskToken();
  const queue = useDeskQueue(token);
  const [filter, setFilter] = useState<Filter>(0);
  const now = useNow();

  if (ready && !token) return <DeskSignedOut />;
  if (!ready || queue.isPending) {
    return (
      <section className="kl-stack">
        <div className="kl-section">
          <h1 className="kl-section__title">{s.queue}</h1>
        </div>
        <Skeleton kind="row" count={3} />
      </section>
    );
  }
  if (queue.isError) {
    return (
      <ApiErrorState
        error={queue.error}
        body={copy.common.errorBody}
        onRetry={() => queue.refetch()}
        actions={
          <Button variant="ghost" href="/desk/audit">
            {s.navAudit}
          </Button>
        }
      />
    );
  }
  const items = queue.data.items.filter((i) => matches(i, filter));
  return (
    <CrossFade stateKey="ready">
      <section className="kl-stack">
        <div className="kl-section flex-wrap gap-4">
          <h1 className="kl-section__title">{s.queue}</h1>
          <div className="flex gap-2" role="tablist" aria-label={s.queue}>
            {s.filters.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={filter === i}
                className={`kl-chip ${filter === i ? 'kl-chip--neutral' : ''}`}
                onClick={() => setFilter(i as Filter)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState title={s.queueEmptyTitle} body={s.queueEmptyBody} />
        ) : (
          <ul className="kl-list">
            {items.map((item) => {
              const r = item.recovery;
              const waiting = waitingForLabel(item);
              return (
                <StatementRow
                  key={r.id}
                  href={`/desk/requests/${r.id}`}
                  label={`${item.client.name} · ${item.client.id}`}
                  meta={
                    <>
                      <span>{r.requestedFrom.deviceLabel}</span>
                      {waiting && waiting !== statusLabel(r.status) ? (
                        <span>
                          {' '}
                          · {copy.desk.waitingFor}: {waiting}
                        </span>
                      ) : null}
                    </>
                  }
                  status={statusTone(r.status)}
                  statusWord={statusLabel(r.status)}
                  amount={<span className="kl-mono text-ink-2">#{shortId(r.id)}</span>}
                  amountSub={formatRelative(new Date(r.createdAt), now)}
                />
              );
            })}
          </ul>
        )}
      </section>
    </CrossFade>
  );
}
