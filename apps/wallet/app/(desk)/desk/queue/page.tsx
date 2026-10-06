'use client';

import type { DeskQueueItem } from '@keyline/shared';
import { EmptyState, formatRelative, Skeleton, StatementRow } from '@keyline/ui';
import { useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { useDeskToken } from '@/src/components/DeskShell';
import { copy, copyGaps } from '@/src/copy';
import { shortId, statusLabel, statusTone, useDeskQueue, waitingForLabel } from '@/src/lib/desk';
import { useNow } from '@/src/lib/hooks';

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

  if (!ready || !token || queue.isPending) {
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
    return <ApiErrorState error={queue.error} body={copy.common.errorBody} onRetry={() => queue.refetch()} />;
  }
  const items = queue.data.items.filter((i) => matches(i, filter));
  return (
    <section className="kl-section">
      <div className="flex items-center justify-between gap-4 flex-wrap">
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
                    {waiting ? (
                      <span>
                        {' '}
                        · {copyGaps.desk.waitingFor}: {waiting}
                      </span>
                    ) : null}
                  </>
                }
                status={statusTone(r.status)}
                statusWord={statusLabel(r.status)}
                amount={`#${shortId(r.id)}`}
                amountSub={formatRelative(new Date(r.createdAt), now)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
