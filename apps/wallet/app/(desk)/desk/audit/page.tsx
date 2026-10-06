'use client';

import type { Event } from '@keyline/shared';
import { EmptyState, formatClock, Skeleton } from '@keyline/ui';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { useDeskToken } from '@/src/components/DeskShell';
import { copy, copyGaps } from '@/src/copy';
import { useDeskEvents } from '@/src/lib/desk';

/** Append-only feed merged from the bank and the guardian processes (`GET /desk/events`). */
export default function DeskAuditPage() {
  const s = copy.desk;
  const { token, ready } = useDeskToken();
  const events = useDeskEvents(token);
  if (!ready || !token || events.isPending) {
    return (
      <section className="kl-stack">
        <div className="kl-section">
          <h1 className="kl-section__title">{s.audit}</h1>
        </div>
        <Skeleton kind="row" count={4} />
      </section>
    );
  }
  if (events.isError)
    return (
      <ApiErrorState error={events.error} body={copy.common.errorBody} onRetry={() => events.refetch()} />
    );
  const rows = events.data.events;
  const sources = events.data.sources;
  return (
    <section className="kl-section">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="kl-section__title">{s.audit}</h1>
        {sources ? (
          <p className="text-12 text-ink-3">
            {copyGaps.desk.sources}:{' '}
            {Object.entries(sources)
              .map(([name, state]) => `${name} ${state === 'ok' ? '✓' : copyGaps.desk.unreachable}`)
              .join(' · ')}
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={s.auditEmpty} body={s.queueEmptyBody} />
      ) : (
        <table className="kl-table">
          <thead>
            <tr>
              {s.auditCols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="kl-mono">{formatClock(new Date(e.at))}</td>
                <td>{e.service}</td>
                <td>{e.type}</td>
                <td>{who(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function who(e: Event): string {
  const p = e.payload;
  for (const key of ['operator', 'by', 'deviceLabel', 'submitter', 'kind', 'guardianAddress']) {
    const v = p[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return e.service;
}
