// The bank's failure sentences (GET /userops/:hash `reason`, POST /userops/send 502 `message` / `details.reason`)
// are plain English. Show them in the active language when we have a translation for their `code` (or for the
// exact English sentence when the bank sent no code); otherwise show the bank's English sentence as is.
import type { CopyBundle } from '../copy';
import { bundleFor } from '../copy';

type ReasonKey = keyof CopyBundle['copyC']['receipt']['reasons'];

function keyFor(code: string | undefined, english: string | undefined): ReasonKey | undefined {
  const en = bundleFor('en').copyC.receipt.reasons as Record<string, string>;
  if (code) {
    if (code in en) return code as ReasonKey;
    if (/^AA(40|41|51)$/.test(code)) return 'feeLimits';
    if (/^ERC20Invalid/.test(code)) return 'ERC20Invalid';
  }
  const text = english?.trim().replace(/\.$/, '');
  if (!text) return undefined;
  return (Object.keys(en) as ReasonKey[]).find((k) => en[k]?.replace(/\.$/, '') === text);
}

/** The bank's sentence in the active language (or English), `undefined` when the bank sent none. */
export function failureSentence(t: CopyBundle, code?: string, english?: string): string | undefined {
  const key = keyFor(code, english);
  if (key) return t.copyC.receipt.reasons[key];
  return english?.trim() || undefined;
}

/** `{ reason, code }` from a failed status payload (lenient: also `revertReason` / `error` / `message`). */
export function statusFailure(s: Record<string, unknown> | undefined): { reason?: string; code?: string } {
  if (!s) return {};
  const code = typeof s.code === 'string' && s.code ? s.code : undefined;
  for (const k of ['reason', 'revertReason', 'error', 'message']) {
    const v = s[k];
    if (typeof v === 'string' && v.trim()) return { reason: v.trim(), code };
  }
  return { code };
}

/** A bundler rejection on send (502 with `details: { reason, code, bundlerMessage }`), localized. */
export function sendRejection(t: CopyBundle, error: unknown): string | undefined {
  // Duck-typed ApiError (importing ./api would pull env into unit tests).
  const e = error as { status?: unknown; message?: unknown; details?: unknown } | null;
  if (!e || typeof e !== 'object' || e.status !== 502) return undefined;
  const d = (e.details ?? {}) as Record<string, unknown>;
  const reason =
    typeof d.reason === 'string' ? d.reason : typeof e.message === 'string' ? e.message : undefined;
  const code = typeof d.code === 'string' ? d.code : undefined;
  return failureSentence(t, code, reason);
}
