'use client';

import { useCopy } from '../copy';
import { Button, EmptyState } from '../ui';

/** Desk route opened without an operator session: say so and lead back to the sign-in (never an endless skeleton). */
export function DeskSignedOut() {
  const t = useCopy();
  return (
    <EmptyState
      title={t.copy.desk.signedOut}
      body={t.copyC.states.sessionExpired}
      action={
        <Button variant="primary" href="/desk">
          {t.copyC.states.signIn}
        </Button>
      }
    />
  );
}
