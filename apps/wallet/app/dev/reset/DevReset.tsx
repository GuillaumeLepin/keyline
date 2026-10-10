'use client';

import { Button, Note } from '@keyline/ui';
import { useState } from 'react';
import { devResetCopy as s } from '../../../src/copy';
import { env } from '../../../src/env';

// Every IndexedDB database this app creates (the laptop's Safety key lives in 'keyline').
const DATABASES = ['keyline'];

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve) => {
    const req = window.indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

export function DevReset({ rpId }: { rpId: string }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [removed, setRemoved] = useState<string[]>([]);
  const [cookieFailed, setCookieFailed] = useState(false);

  const run = async () => {
    setState('running');
    const items: string[] = [];
    const localKeys = Object.keys(window.localStorage).filter((k) => k.startsWith('keyline'));
    for (const k of localKeys) window.localStorage.removeItem(k);
    if (localKeys.length) items.push(s.localItems(localKeys.length));
    const sessionKeys = Object.keys(window.sessionStorage).filter((k) => k.startsWith('keyline'));
    for (const k of sessionKeys) window.sessionStorage.removeItem(k);
    if (sessionKeys.length) items.push(s.sessionItems(sessionKeys.length));
    for (const db of DATABASES) await deleteDatabase(db);
    items.push(s.safetyKeyItem);
    // The session cookie is httpOnly: only the bank can clear it.
    try {
      const res = await fetch(`${env.bankUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      items.push(s.cookieItem);
      setCookieFailed(false);
    } catch {
      setCookieFailed(true);
    }
    setRemoved(items);
    setState('done');
  };

  return (
    <main className="kl-stack mx-auto my-12 max-w-[560px] px-4">
      <h1 className="kl-title">{s.title}</h1>
      <p className="kl-lead">{s.body}</p>
      <Button variant="primary" onClick={run} loading={state === 'running'} disabled={state === 'running'}>
        {state === 'done' ? s.done : state === 'running' ? s.running : s.run}
      </Button>
      {state === 'done' ? <Note tone="ok">{s.cleared(removed.join(', '))}</Note> : null}
      {cookieFailed ? <Note tone="warn">{s.cookieFailed}</Note> : null}
      <Note tone="info" title={s.passkeyTitle}>
        {s.passkeyBefore} <span className="kl-mono whitespace-nowrap">{s.passkeyUrl}</span>{' '}
        {s.passkeyAfter(rpId)} {s.next}
      </Note>
    </main>
  );
}
