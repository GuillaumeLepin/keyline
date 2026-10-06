'use client';

import { Button, SimulatedBadge, Skeleton, TextField } from '@keyline/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { useDeskToken } from '@/src/components/DeskShell';
import { copy } from '@/src/copy';
import { api, isApiError } from '@/src/lib/api';

/** Operator sign-in: the token is checked by calling the queue once; a 401 is "That token isn’t valid." */
export default function DeskLoginPage() {
  const s = copy.desk;
  const router = useRouter();
  const { token, ready, save } = useDeskToken(false);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (ready && token) router.replace('/desk/queue');
  }, [ready, token, router]);
  const login = useMutation({
    mutationFn: async (t: string) => {
      await api.desk.queue(t);
      return t;
    },
    onSuccess: (t) => {
      save(t);
      router.push('/desk/queue');
    },
  });
  const invalid =
    login.isError && isApiError(login.error) && (login.error.status === 401 || login.error.status === 403);
  if (!ready) return <Skeleton kind="block" height={120} />;
  return (
    <div className="kl-stack max-w-[480px]">
      <h1 className="kl-title">{s.loginTitle}</h1>
      <p className="kl-lead">
        {s.loginBody} <SimulatedBadge />
      </p>
      <TextField
        label={s.loginField}
        mono
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={invalid ? s.loginError : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) login.mutate(value.trim());
        }}
      />
      {login.isError && !invalid ? (
        <ApiErrorState
          error={login.error}
          body={copy.common.errorBody}
          onRetry={() => login.mutate(value.trim())}
        />
      ) : null}
      <div>
        <Button
          variant="primary"
          disabled={!value.trim()}
          loading={login.isPending}
          onClick={() => login.mutate(value.trim())}
        >
          {s.loginPrimary}
        </Button>
      </div>
    </div>
  );
}
