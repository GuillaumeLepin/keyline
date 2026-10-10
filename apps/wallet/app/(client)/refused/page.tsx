'use client';

import { Prohibit } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useState } from 'react';
import { copy } from '@/src/copy';
import { useRecovery } from '@/src/lib/hooks';
import { type PendingRecovery, recoveryStore } from '@/src/lib/storage';
import { Button, Panel, SimulatedBadge, Skeleton } from '@/src/ui';

/** SPEC F4.2: the identity check failed. No primary action — only the way back. */
export default function RefusedPage() {
  const s = copy.refused;
  const [pending, setPending] = useState<PendingRecovery | null | undefined>(undefined);
  useEffect(() => {
    setPending(recoveryStore.get());
  }, []);
  const recovery = useRecovery(pending?.recoveryId, 0);
  const reasons = recovery.data?.reasons ?? pending?.reasons ?? [];
  const emailPassed = recovery.data ? recovery.data.identity.emailOtpPassed : true;

  if (pending === undefined) {
    return (
      <>
        <Skeleton kind="line" count={2} />
        <Skeleton kind="block" />
      </>
    );
  }

  return (
    <>
      <div className="kl-stack">
        <p className="text-danger">
          <Prohibit size={32} aria-hidden="true" />
        </p>
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s.body}</p>
      </div>
      <Panel
        tone="danger"
        rows={[
          {
            label: s.rows.email,
            value: emailPassed ? s.passed : s.failed,
            tone: emailPassed ? 'ok' : 'danger',
          },
          {
            label: s.rows.identity,
            value: (
              <>
                {s.failed} <SimulatedBadge />
              </>
            ),
            tone: 'danger',
          },
          { label: s.rows.sq, value: s.didNotAct },
        ]}
        footnote={reasons.length > 0 ? `${s.reasons}: ${reasons.join(' · ')}` : undefined}
      />
      <div className="kl-actions">
        <Button
          variant="ghost"
          full
          href="/"
          onClick={() => {
            recoveryStore.clear();
          }}
        >
          {s.back}
        </Button>
      </div>
    </>
  );
}
