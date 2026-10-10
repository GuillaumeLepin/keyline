'use client';

import { ActionButton, Chip, TextField } from '@keyline/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyV2 } from '@/src/copy';
import { api, isApiError } from '@/src/lib/api';

/** A1 · Sign in to Swissquote (SIMULATED SSO: Lea pre-filled, one click). */
export default function SqSignInPage() {
  const router = useRouter();
  const s = copyV2.sqWeb.signIn;
  const [username, setUsername] = useState<string>(s.usernameValue);
  // Already signed in on this laptop → straight to the portfolio.
  const me = useQuery({ queryKey: ['sq', 'me'], queryFn: api.sq.me, retry: false });
  useEffect(() => {
    if (me.isSuccess) router.replace('/swissquote/portfolio');
  }, [me.isSuccess, router]);

  const login = useMutation({
    mutationFn: () => api.sq.login(username.trim()),
    onSuccess: () => router.push('/swissquote/portfolio'),
  });
  const rejected =
    login.isError && isApiError(login.error) && (login.error.status === 401 || login.error.status === 400);

  return (
    <div className="mx-auto grid max-w-[400px] gap-6 pt-12">
      <div className="grid gap-2">
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s.lead}</p>
        <p className="text-14 text-ink-2">
          {s.note} <Chip />
        </p>
      </div>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <TextField
          label={s.username}
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
          error={rejected ? s.error : undefined}
        />
        <TextField
          label={s.password}
          type="password"
          autoComplete="current-password"
          defaultValue="prototype"
          readOnly
        />
        <ActionButton
          type="submit"
          full
          label={s.primary}
          status={login.isPending ? 'loading' : login.isSuccess ? 'success' : 'idle'}
          disabled={username.trim().length === 0}
          data-testid="sq-sign-in"
        />
      </form>
      {login.isError && !rejected ? (
        <ApiErrorState error={login.error} body={copy.common.errorBody} onRetry={() => login.mutate()} />
      ) : null}
    </div>
  );
}
