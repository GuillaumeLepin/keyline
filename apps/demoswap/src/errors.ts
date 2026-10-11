import { BaseError, UserRejectedRequestError } from 'viem';

export type DescribedError = { title: string; detail?: string; code?: number };

/**
 * Turns a viem/wagmi/WalletConnect error into what the page shows. Keyline answers both a user decline
 * and a policy block with a rejection (4001 / WalletConnect 5000) whose message carries the reason, so
 * the wallet's own sentence (`details`) is always shown verbatim.
 */
export function describeError(e: unknown): DescribedError {
  if (e instanceof BaseError) {
    const withCode = e.walk((x) => typeof (x as { code?: unknown }).code === 'number') as {
      code: number;
    } | null;
    const code = withCode?.code;
    const rejected =
      e.walk((x) => x instanceof UserRejectedRequestError) !== null || code === 4001 || code === 5000;
    const detail = e.details && e.details !== e.shortMessage ? e.details : undefined;
    return {
      title: rejected
        ? `Refused by the wallet${code ? ` (code ${code})` : ''}: declined by the user or blocked by its policy`
        : e.shortMessage,
      ...(detail ? { detail } : {}),
      ...(code !== undefined ? { code } : {}),
    };
  }
  if (e instanceof Error) return { title: e.message };
  return { title: String(e) };
}

export const errorLine = (d: DescribedError) => (d.detail ? `${d.title} — ${d.detail}` : d.title);
