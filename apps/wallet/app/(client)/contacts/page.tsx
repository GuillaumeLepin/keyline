'use client';

import type { Contact } from '@keyline/shared';
import { Plus, ShieldCheck, Trash } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAddress } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { StackPage } from '@/src/components/StackPage';
import { useCopy, usePrefs } from '@/src/copy';
import { api } from '@/src/lib/api';
import { contactLabel } from '@/src/lib/contactLabel';
import { useContacts } from '@/src/lib/hooks';
import { addressUrl } from '@/src/lib/reads';
import {
  ActionButton,
  Address,
  Button,
  Chip,
  CrossFade,
  EmptyState,
  formatDateTime,
  Note,
  SheetV2,
  Skeleton,
  StatementRow,
  shortAddress,
  TextField,
  Toggle,
} from '@/src/ui';

type View = { kind: 'list' } | { kind: 'add' } | { kind: 'detail'; id: string };

/** E1/E2 Contacts: list (trusted first) → add, or → detail (trusted toggle, verify ownership, delete). */
export default function ContactsPage() {
  const t = useCopy();
  const c = t.copyC.contacts;
  const router = useRouter();
  const contacts = useContacts();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [dir, setDir] = useState<1 | -1>(1);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get('id');
    if (id) setView({ kind: 'detail', id });
    else if (q.get('add') === '1') setView({ kind: 'add' });
  }, []);

  const push = (v: View) => {
    setDir(1);
    setView(v);
  };
  const pop = () => {
    setDir(-1);
    setView({ kind: 'list' });
  };

  const title = view.kind === 'list' ? c.title : view.kind === 'add' ? c.add : c.detailTitle;
  const key = view.kind === 'detail' ? `detail-${view.id}` : view.kind;

  return (
    <StackPage
      testId={`contacts-${view.kind}`}
      screenKey={key}
      direction={dir}
      title={title}
      onBack={view.kind === 'list' ? () => router.back() : pop}
    >
      {view.kind === 'list' ? (
        <ContactList
          contacts={contacts}
          onOpen={(id) => push({ kind: 'detail', id })}
          onAdd={() => push({ kind: 'add' })}
        />
      ) : view.kind === 'add' ? (
        <AddContact existing={contacts.data ?? []} onSaved={(id) => push({ kind: 'detail', id })} />
      ) : (
        <ContactDetail contacts={contacts} id={view.id} onDeleted={pop} />
      )}
    </StackPage>
  );
}

function ContactList({
  contacts,
  onOpen,
  onAdd,
}: {
  contacts: ReturnType<typeof useContacts>;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const t = useCopy();
  const c = t.copyC.contacts;
  const all = contacts.data ?? [];
  const trusted = all.filter((x) => x.trusted);
  const others = all.filter((x) => !x.trusted);
  const row = (x: Contact) => (
    <StatementRow
      key={x.id}
      label={
        <span className="inline-flex items-center gap-1">
          {contactLabel(x)}
          {x.simulated ? <Chip /> : null}
        </span>
      }
      meta={<span className="kl-mono">{shortAddress(x.address)}</span>}
      status={x.verifiedOwnership ? 'ok' : x.simulated ? 'danger' : 'pending'}
      statusWord={x.verifiedOwnership ? c.verified : x.simulated ? c.sanctioned : c.new}
      onClick={() => onOpen(x.id)}
    />
  );

  return (
    <div className="kl-stack gap-4">
      <CrossFade stateKey={contacts.isPending ? 'loading' : contacts.isError ? 'error' : 'ready'}>
        {contacts.isPending ? (
          <Skeleton kind="row" count={4} />
        ) : contacts.isError ? (
          <ApiErrorState error={contacts.error} body={c.loadError} onRetry={() => contacts.refetch()} />
        ) : all.length === 0 ? (
          <EmptyState
            title={c.emptyTitle}
            body={c.emptyBody}
            action={
              <Button variant="primary" onClick={onAdd}>
                {c.add}
              </Button>
            }
          />
        ) : (
          <div className="kl-stack gap-4">
            {trusted.length > 0 ? (
              <section aria-label={c.trustedSection}>
                <div className="kl-section">
                  <h2 className="kl-section__title">{c.trustedSection}</h2>
                </div>
                {trusted.map(row)}
              </section>
            ) : null}
            {others.length > 0 ? (
              <section aria-label={c.othersSection}>
                <div className="kl-section">
                  <h2 className="kl-section__title">{trusted.length > 0 ? c.othersSection : c.title}</h2>
                </div>
                {others.map(row)}
              </section>
            ) : null}
          </div>
        )}
      </CrossFade>
      {all.length > 0 ? (
        <div className="kl-actions">
          <Button variant="secondary" full icon={<Plus size={18} aria-hidden="true" />} onClick={onAdd}>
            {c.add}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AddContact({ existing, onSaved }: { existing: Contact[]; onSaved: (id: string) => void }) {
  const t = useCopy();
  const c = t.copyC.contacts;
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<{ label?: string; address?: string }>({});
  const save = useMutation({
    mutationFn: () =>
      api.contact.create({ label: label.trim() || t.copyC.send.newAddress, address: address.trim() }),
    onSuccess: (contact) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onSaved(contact.id); // the stack push is the feedback — no timer, no haptic (§8 reserves it)
    },
  });
  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get('address');
    if (prefill) setAddress(prefill);
  }, []);
  const dup = isAddress(address.trim())
    ? existing.find((x) => x.address.toLowerCase() === address.trim().toLowerCase())
    : undefined;

  function submit() {
    const next: typeof errors = {};
    if (!isAddress(address.trim())) next.address = c.invalidAddress;
    setErrors(next);
    if (next.label || next.address || dup) return;
    save.mutate();
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <TextField
        label={t.copyC.send.nameField}
        placeholder={t.copyC.send.namePlaceholder}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        error={errors.label}
        autoComplete="off"
        maxLength={64}
        data-testid="contact-name"
      />
      <TextField
        label={c.address}
        mono
        placeholder="0x…"
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
          setErrors((x) => ({ ...x, address: undefined }));
        }}
        onBlur={() => {
          if (address.trim() && !isAddress(address.trim()))
            setErrors((x) => ({ ...x, address: c.invalidAddress }));
        }}
        error={errors.address}
        autoComplete="off"
        spellCheck={false}
        data-testid="contact-address"
      />
      {dup ? <Note tone="info">{c.alreadyThere(dup.label)}</Note> : null}
      {save.isError ? (
        <ApiErrorState error={save.error} body={t.copy.common.errorBody} onRetry={() => save.mutate()} />
      ) : null}
      <div className="kl-actions mt-auto">
        <ActionButton
          label={c.save}
          successLabel={c.saved}
          disabled={!isAddress(address.trim()) || Boolean(dup)}
          status={save.isPending ? 'loading' : save.isSuccess ? 'success' : 'idle'}
          variant="primary"
          full
          onClick={submit}
          data-testid="contact-save"
        />
      </div>
    </div>
  );
}

function ContactDetail({
  contacts,
  id,
  onDeleted,
}: {
  contacts: ReturnType<typeof useContacts>;
  id: string;
  onDeleted: () => void;
}) {
  const { lang } = usePrefs().prefs;
  const t = useCopy();
  const c = t.copyC.contacts;
  const qc = useQueryClient();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const contact = contacts.data?.find((x) => x.id === id);

  const refresh = () => qc.invalidateQueries({ queryKey: ['contacts'] });
  const trust = useMutation({
    mutationFn: (trusted: boolean) => api.contact.update(id, { trusted }),
    onSuccess: refresh,
  });
  const verify = useMutation({
    mutationFn: () => api.contact.verify(id),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.contact.remove(id),
    onSuccess: () => {
      setConfirmDelete(false);
      refresh();
      onDeleted();
    },
  });

  if (contacts.isPending) return <Skeleton kind="row" count={4} />;
  if (contacts.isError)
    return <ApiErrorState error={contacts.error} body={c.loadError} onRetry={() => contacts.refetch()} />;
  if (!contact)
    return (
      <EmptyState
        title={c.notFoundTitle}
        body={c.notFoundBody}
        action={
          <Button variant="secondary" onClick={onDeleted}>
            {c.backToList}
          </Button>
        }
      />
    );

  const trusted = trust.isPending ? (trust.variables ?? contact.trusted) : contact.trusted;

  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="contact-detail">
      <div>
        <p className="m-0 flex items-center gap-2 text-28 font-semibold tracking-[-0.015em]">
          {contactLabel(contact)}
          {contact.simulated ? <Chip /> : null}
        </p>
        <p className="m-0 text-12 text-ink-3">
          {c.addedOn} {formatDateTime(new Date(contact.firstSeenAt), lang)}
        </p>
      </div>
      <Address value={contact.address} expanded explorerUrl={addressUrl(contact.address)} />

      <section className="kl-stack gap-2" aria-label={c.trustedToggle}>
        <Toggle
          label={c.trustedToggle}
          description={c.trustedDesc}
          checked={trusted}
          onChange={(v: boolean) => trust.mutate(v)}
        />
        {trust.isError ? (
          <ApiErrorState
            error={trust.error}
            body={t.copy.common.errorBody}
            onRetry={() => trust.mutate(!contact.trusted)}
          />
        ) : null}
      </section>

      <section className="kl-stack gap-2" aria-labelledby="ct-own">
        <h2 id="ct-own" className="kl-section__title m-0 flex items-center gap-1">
          {c.ownership}
          <Chip />
        </h2>
        {contact.verifiedOwnership ? (
          <StatementRow
            icon={<ShieldCheck size={20} aria-hidden="true" />}
            label={c.verifyDone}
            meta={c.ownershipMeta}
            status="ok"
            chevron={false}
          />
        ) : (
          <>
            <p className="m-0 text-14 text-ink-2">{c.verifyBody}</p>
            <ActionButton
              label={c.verify}
              successLabel={c.verifyDone}
              status={verify.isPending ? 'loading' : verify.isSuccess ? 'success' : 'idle'}
              onClick={() => verify.mutate()}
              data-testid="contact-verify"
            />
            {verify.isError ? (
              <ApiErrorState
                error={verify.error}
                body={t.copy.common.errorBody}
                onRetry={() => verify.mutate()}
              />
            ) : null}
          </>
        )}
      </section>

      <div className="kl-actions mt-auto">
        <Button variant="primary" full onClick={() => router.push(`/send?to=${contact.address}`)}>
          {c.send(contactLabel(contact))}
        </Button>
        <Button
          variant="danger-text"
          full
          icon={<Trash size={18} aria-hidden="true" />}
          onClick={() => setConfirmDelete(true)}
        >
          {c.delete}
        </Button>
      </div>

      <SheetV2
        open={confirmDelete}
        title={c.deleteTitle(contactLabel(contact))}
        onClose={() => setConfirmDelete(false)}
        contained
      >
        <div className="kl-stack gap-4">
          <p className="m-0 text-16 text-ink-2">{c.deleteBody}</p>
          {remove.isError ? (
            <ApiErrorState
              error={remove.error}
              body={t.copy.common.errorBody}
              onRetry={() => remove.mutate()}
            />
          ) : null}
          <ActionButton
            label={c.deleteYes}
            variant="danger"
            status={remove.isPending ? 'loading' : 'idle'}
            full
            onClick={() => remove.mutate()}
            data-testid="contact-delete-confirm"
          />
          <Button variant="ghost" full onClick={() => setConfirmDelete(false)}>
            {c.deleteNo}
          </Button>
        </div>
      </SheetV2>
    </div>
  );
}
