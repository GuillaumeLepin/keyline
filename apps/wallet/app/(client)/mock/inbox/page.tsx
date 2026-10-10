'use client';

import { EnvelopeSimple } from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy } from '@/src/copy';
import { api } from '@/src/lib/api';
import { Button, EmptyState, formatClock, SimulatedBadge, Skeleton, StatementRow, TextField } from '@/src/ui';

const DEFAULT_EMAIL = 'lea.keller@example.ch';

/** SIMULATED email inbox (SPEC §4 `GET /mock/inbox/:email`). Shows the recovery codes the bank "sent". */
export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton kind="row" count={2} />}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? DEFAULT_EMAIL);
  const [active, setActive] = useState(email);
  const inbox = useQuery({
    queryKey: ['inbox', active],
    queryFn: () => api.mock.inbox(active),
    refetchInterval: 3_000,
    retry: false,
  });
  return (
    <>
      <ScreenHeader
        title={copy.mock.inboxTitle(active)}
        backHref="/recover"
        aside={<SimulatedBadge tooltip={copy.mock.inboxBody} />}
      />
      <p className="kl-lead">{copy.mock.inboxBody}</p>
      <div className="flex items-end gap-2">
        <div className="grow">
          <TextField
            label={copy.mock.inboxEmail}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setActive(email);
            }}
          />
        </div>
        <Button variant="secondary" onClick={() => setActive(email)}>
          {copy.mock.inboxShow}
        </Button>
      </div>
      {inbox.isPending ? (
        <Skeleton kind="row" count={2} />
      ) : inbox.isError ? (
        <ApiErrorState error={inbox.error} body={copy.common.errorBody} onRetry={() => inbox.refetch()} />
      ) : inbox.data.length === 0 ? (
        <EmptyState title={copy.mock.inboxEmpty} body={copy.mock.inboxBody} />
      ) : (
        <ul className="kl-list">
          {inbox.data.map((m) => (
            <StatementRow
              key={m.id}
              icon={<EnvelopeSimple size={20} aria-hidden="true" />}
              label={m.otp ? copy.mock.inboxRow(m.otp) : m.subject}
              meta={`${copy.brand} · ${formatClock(new Date(m.sentAt), false)}`}
              amount={m.otp ? <span className="kl-mono">{m.otp}</span> : undefined}
              chevron={false}
            />
          ))}
        </ul>
      )}
    </>
  );
}
