import type { ReactNode } from 'react';
import { ErrorState } from '@/src/ui';
import { copy, useCopy } from '../copy';
import { errorDetail, isApiError } from '../lib/api';
import { sendRejection } from '../lib/failure';

/**
 * One mapping from thrown errors to the ErrorState copy: 501 → "Not available yet", network → offline copy,
 * everything else → the screen's own body (DESIGN.md §9). Never a bare code.
 */
export function ApiErrorState({
  error,
  body,
  title,
  onRetry,
  actions,
}: {
  error: unknown;
  /** Screen-specific body for ordinary failures. */
  body: ReactNode;
  title?: string;
  onRetry?: () => void;
  actions?: ReactNode;
}) {
  const t = useCopy();
  const detail = errorDetail(error);
  // A bundler rejection (502 from POST /userops/send) carries the bank's plain sentence: say what happened, in the
  // active language when we know its code; `code` + `bundlerMessage` stay under Technical details (`detail`).
  const rejected = sendRejection(t, error);
  if (isApiError(error) && error.notImplemented) {
    return (
      <ErrorState
        title={copy.common.notAvailableTitle}
        body={copy.common.notAvailableBody}
        detail={detail}
        onRetry={onRetry}
        retryLabel={copy.common.tryAgain}
        actions={actions}
      />
    );
  }
  if (isApiError(error) && error.offline) {
    return (
      <ErrorState
        title={copy.common.offlineTitle}
        body={copy.common.offlineBody}
        detail={detail}
        onRetry={onRetry}
        retryLabel={copy.common.tryAgain}
        actions={actions}
      />
    );
  }
  return (
    <ErrorState
      title={title ?? copy.common.errorTitle}
      body={
        rejected ? (
          <>
            <span className="block" data-testid="send-rejection">
              {rejected}
            </span>
            <span className="block">{body}</span>
          </>
        ) : (
          body
        )
      }
      detail={detail}
      onRetry={onRetry}
      retryLabel={copy.common.tryAgain}
      actions={actions}
    />
  );
}
