'use client';

import type { UserOperationV7 } from '@keyline/chain';
import type { PolicyDecision } from '@keyline/shared';
import { useEffect, useRef, useState } from 'react';
import { type PreparedOp, preparedOp, prepareOp } from './chain';

/**
 * Safari: prepare (build + sponsor) as soon as the decision can be signed, so the confirm tap opens the passkey prompt
 * first. Re-prepares shortly before the prepared op ages out. Failures are silent: the tap then prepares itself.
 */
export function useWarmOp(
  decision: PolicyDecision | undefined,
  build: () => Promise<UserOperationV7>,
  enabled: boolean,
): PreparedOp | undefined {
  const [ready, setReady] = useState<PreparedOp | undefined>(undefined);
  const buildRef = useRef(build);
  buildRef.current = build;
  const id = decision?.decisionId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the decision id, not the object identity
  useEffect(() => {
    if (!decision || !enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const warm = () => {
      prepareOp({ decision, build: () => buildRef.current() })
        .then((op) => {
          if (cancelled) return;
          setReady(op);
          timer = setTimeout(warm, Math.max(5_000, op.validUntil - Date.now() - 5_000));
        })
        .catch(() => undefined);
    };
    const existing = preparedOp(decision.decisionId);
    if (existing) setReady(existing);
    warm();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, enabled]);
  return ready && ready.decisionId === id ? ready : undefined;
}
