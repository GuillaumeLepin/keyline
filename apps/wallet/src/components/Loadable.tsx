'use client';

import type { ReactNode } from 'react';
import { useCopy } from '../copy';
import { Button, CrossFade, EmptyState } from '../ui';
import { ApiErrorState } from './ApiErrorState';

export type Exit = { label: string; href: string };

/**
 * Every data-backed region of every route, the same way (DESIGN.md v2 §11 global states):
 * skeleton in the content's shape → CrossFade into content; an error says what failed, offers Try again and
 * a way out; an empty result says so and offers the next action. Never a dead end.
 */
export function Loadable<T>({
  query,
  skeleton,
  errorBody,
  exit,
  isEmpty,
  empty,
  children,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: T | undefined;
    refetch: () => unknown;
  };
  skeleton: ReactNode;
  errorBody?: ReactNode;
  /** The way back shown with the error (and the empty state when `empty.action` is absent). */
  exit?: Exit;
  isEmpty?: (data: T) => boolean;
  empty?: { title: string; body?: string; action?: Exit };
  children: (data: T) => ReactNode;
}) {
  const t = useCopy();
  const data = query.data;
  const state = query.isPending
    ? 'loading'
    : query.isError || data === undefined
      ? 'error'
      : isEmpty?.(data)
        ? 'empty'
        : 'ready';
  const exitButton = (e: Exit | undefined, variant: 'secondary' | 'ghost' = 'secondary') =>
    e ? (
      <Button variant={variant} href={e.href}>
        {e.label}
      </Button>
    ) : null;

  return (
    <CrossFade stateKey={state}>
      {state === 'loading' ? (
        <div role="status" aria-busy="true" aria-label={t.copyC.states.loading}>
          {skeleton}
        </div>
      ) : state === 'error' ? (
        <ApiErrorState
          error={query.error}
          body={errorBody ?? t.copy.common.errorBody}
          onRetry={() => query.refetch()}
          actions={exitButton(exit, 'ghost')}
        />
      ) : state === 'empty' && empty ? (
        <EmptyState title={empty.title} body={empty.body} action={exitButton(empty.action ?? exit)} />
      ) : (
        children(data as T)
      )}
    </CrossFade>
  );
}
