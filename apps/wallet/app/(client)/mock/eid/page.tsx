'use client';

import { Button, Note, SimulatedBadge, TextField, Toggle } from '@keyline/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy } from '@/src/copy';
import { api } from '@/src/lib/api';

/**
 * SIMULATED swiyu e-ID (SPEC §4 `POST /mock/eid`). The issuer only echoes a payload; the pass/fail verdict is the
 * bank's (persona rules, §7) and is produced when /recover forwards the form — this page never shows a verdict.
 */
export default function MockEidPage() {
  const s = copy.mock;
  const [name, setName] = useState('Lea Keller');
  const [dob, setDob] = useState('1991-03-14');
  const [liveness, setLiveness] = useState(true);
  const issue = useMutation({
    mutationFn: () => api.mock.eid({ name: name.trim(), dateOfBirth: dob, liveness }),
  });
  return (
    <>
      <ScreenHeader title={s.eidTitle} backHref="/recover" aside={<SimulatedBadge />} />
      <p className="kl-lead">{s.eidBody}</p>
      <TextField label={copy.recover.idName} value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label={copy.recover.idDob}
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
      />
      <Toggle checked={liveness} onChange={setLiveness} label={copy.recover.idLiveness} />
      {issue.isSuccess ? (
        <Note tone="info">
          {copy.mock.eidIssued(issue.data.issuer)} <SimulatedBadge />
          <pre className="kl-code">{JSON.stringify(issue.data.eidPayload, null, 2)}</pre>
        </Note>
      ) : null}
      {issue.isError ? (
        <ApiErrorState error={issue.error} body={copy.common.errorBody} onRetry={() => issue.mutate()} />
      ) : null}
      <Note tone="info">{copy.mock.eidNote}</Note>
      <div className="kl-actions">
        <Button variant="primary" full loading={issue.isPending} onClick={() => issue.mutate()}>
          {s.eidSubmit}
        </Button>
        <Button variant="ghost" full href="/recover">
          {copy.mock.eidBack}
        </Button>
      </div>
    </>
  );
}
