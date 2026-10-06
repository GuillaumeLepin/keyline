import { ErrorState } from '@keyline/ui';
import type { ReactNode } from 'react';
import { copy } from '../copy';
import { errorDetail, isApiError } from '../lib/api';

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
  const detail = errorDetail(error);
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
      body={body}
      detail={detail}
      onRetry={onRetry}
      retryLabel={copy.common.tryAgain}
      actions={actions}
    />
  );
}
