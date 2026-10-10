'use client';

import { ActionButton, TextField } from '@keyline/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyV2 } from '@/src/copy';
import { api, isApiError } from '@/src/lib/api';
import { rememberClaim } from '@/src/lib/handoff';

/** B1 · Continue on your phone: the code from the laptop (typed, or `?code=` from the QR) → claim → onboarding v2. */
export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <Start />
    </Suspense>
  );
}

function Start() {
  const router = useRouter();
  const params = useSearchParams();
  const s = copyV2.start;
  const [code, setCode] = useState('');
  const claim = useMutation({
    mutationFn: (c: string) => api.handoff.claim(c),
    onSuccess: (result) => {
      rememberClaim(result);
      router.push('/onboarding');
    },
  });
  // Scanned: the QR carries `?code=`; claim it once without asking.
  const auto = useRef(false);
  const claimMutate = claim.mutate;
  useEffect(() => {
    const fromQr = (params.get('code') ?? '').replace(/\D/g, '');
    if (!auto.current && /^\d{6}$/.test(fromQr)) {
      auto.current = true;
      setCode(fromQr);
      claimMutate(fromQr);
    }
  }, [params, claimMutate]);

  const status = isApiError(claim.error) ? claim.error.status : 0;
  const wrong =
    claim.isError &&
    (status === 404 || status === 409) &&
    !(isApiError(claim.error) && claim.error.notImplemented);
  const expired = claim.isError && status === 410;
  // Too many wrong codes from this network (bank: 5 per IP in 10 min) — show the bank's own sentence.
  const throttled = claim.isError && status === 429 && isApiError(claim.error);
  const valid = /^\d{6}$/.test(code);
  const shown = code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  return (
    <>
      <div className="kl-stack">
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s.body}</p>
      </div>
      <form
        className="kl-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) claim.mutate(code);
        }}
      >
        <TextField
          label={copyV2.start.field}
          mono
          inputMode="numeric"
          autoComplete="one-time-code"
          value={shown}
          maxLength={7}
          className="text-28 tracking-[0.08em]"
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          error={
            wrong
              ? s.wrong
              : expired
                ? s.expired
                : throttled && isApiError(claim.error)
                  ? claim.error.message
                  : undefined
          }
          data-testid="start-code"
        />
        {claim.isError && !wrong && !expired && !throttled ? (
          <ApiErrorState
            error={claim.error}
            body={copy.common.errorBody}
            onRetry={() => claim.mutate(code)}
          />
        ) : null}
        <div className="kl-actions">
          <ActionButton
            type="submit"
            full
            label={s.primary}
            disabled={!valid}
            status={claim.isPending ? 'loading' : claim.isSuccess ? 'success' : 'idle'}
            data-testid="start-continue"
          />
        </div>
      </form>
    </>
  );
}
