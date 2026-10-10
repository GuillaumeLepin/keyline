'use client';

import type { DeskQueueItem, RecoveryRequest } from '@keyline/shared';
import { useQuery } from '@tanstack/react-query';
import type { StatementRowStatus } from '@/src/ui';
import { copy } from '../copy';
import { api } from './api';

export function useDeskQueue(token: string | null, pollMs = 3_000) {
  return useQuery({
    queryKey: ['desk-queue', token],
    queryFn: () => api.desk.queue(token as string),
    enabled: Boolean(token),
    refetchInterval: pollMs,
    retry: false,
  });
}

export function useDeskEvents(token: string | null) {
  return useQuery({
    queryKey: ['desk-events', token],
    queryFn: () => api.desk.events(token as string),
    enabled: Boolean(token),
    refetchInterval: 5_000,
    retry: false,
  });
}

export function statusTone(status: RecoveryRequest['status']): StatementRowStatus | undefined {
  switch (status) {
    case 'finalized':
      return 'ok';
    case 'identity-refused':
      return 'danger';
    case 'cancelled':
      return undefined;
    default:
      return 'pending';
  }
}

export function waitingForLabel(item: DeskQueueItem): string | undefined {
  const w = item.recovery.waitingFor;
  return w ? copy.desk.waitingForValues[w] : undefined;
}

export function statusLabel(status: RecoveryRequest['status']): string {
  return copy.desk.status[status];
}

/** Short request id for titles: the last 6 characters, upper-cased (ids are uuids). */
export function shortId(id: string): string {
  return id.replace(/-/g, '').slice(-6).toUpperCase();
}
