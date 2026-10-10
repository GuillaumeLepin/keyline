'use client';

import type { Contact } from '@keyline/shared';
import { ArrowsDownUp, ClipboardText, Plus, QrCode as QrIcon } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { StackPage } from '@/src/components/StackPage';
import { useCopy, usePrefs } from '@/src/copy';
import { env } from '@/src/env';
import { toChf } from '@/src/i18n/money';
import { useContacts, useLocalWallet, useUsdcBalance } from '@/src/lib/hooks';
import { pendingSendStore } from '@/src/lib/storage';
import {
  Address,
  Button,
  Chip,
  CrossFade,
  EmptyState,
  formatUSDC,
  Note,
  NumberTicker,
  Skeleton,
  StatementRow,
  shortAddress,
  TextField,
} from '@/src/ui';

type Recipient = { address: `0x${string}`; label: string; contact: Contact | null };
type Screen = 'to' | 'new' | 'amount';
const ORDER: Record<Screen, number> = { to: 0, new: 1, amount: 2 };

/** D6 Send: recipient (contacts or a new address) → amount (CHF ↔ USDC) → /send/review. */
export default function SendPage() {
  const t = useCopy();
  const s = t.copyC.send;
  const router = useRouter();
  const { wallet } = useLocalWallet();
  const contacts = useContacts();
  const [screen, setScreen] = useState<Screen>('to');
  const [dir, setDir] = useState<1 | -1>(1);
  const [recipient, setRecipient] = useState<Recipient | null>(null);

  const go = (next: Screen) => {
    setDir(ORDER[next] >= ORDER[screen] ? 1 : -1);
    setScreen(next);
  };

  // `/send?to=0x…` (from a contact's detail): jump straight to the amount.
  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get('to');
    if (!to || !isAddress(to) || recipient) return;
    const address = getAddress(to);
    const contact = contacts.data?.find((c) => c.address.toLowerCase() === address.toLowerCase()) ?? null;
    if (!contacts.data && !contacts.isError) return;
    setRecipient({ address, label: contact?.label ?? shortAddress(address), contact });
    setScreen('amount');
  }, [contacts.data, contacts.isError, recipient]);

  if (wallet === undefined) return <Skeleton kind="row" count={4} />;
  if (wallet === null)
    return (
      <EmptyState
        title={t.copy.home.noWalletTitle}
        body={s.noWallet}
        action={
          <Button variant="primary" href="/">
            {t.copyC.states.goHome}
          </Button>
        }
      />
    );

  const titles: Record<Screen, string> = { to: s.title, new: s.newRecipient, amount: s.amountTitle };
  const back =
    screen === 'to'
      ? () => router.push('/')
      : screen === 'new'
        ? () => go('to')
        : () => go(recipient?.contact ? 'to' : 'new');

  return (
    <StackPage
      testId={`send-screen-${screen}`}
      screenKey={screen}
      direction={dir}
      title={titles[screen]}
      onBack={back}
    >
      {screen === 'to' ? (
        <RecipientList
          contacts={contacts}
          onPick={(c) => {
            setRecipient({ address: c.address as `0x${string}`, label: c.label, contact: c });
            go('amount');
          }}
          onNew={() => go('new')}
        />
      ) : screen === 'new' ? (
        <NewRecipient
          contacts={contacts.data ?? []}
          initial={recipient && !recipient.contact ? recipient : null}
          onUse={(r) => {
            setRecipient(r);
            go('amount');
          }}
        />
      ) : recipient ? (
        <AmountStep
          walletAddress={wallet.address}
          recipient={recipient}
          onChange={() => go(recipient.contact ? 'to' : 'new')}
          onReview={(amountUsdc, amountChf) => {
            pendingSendStore.set({
              to: recipient.address,
              toLabel: recipient.label,
              knownContact: recipient.contact?.verifiedOwnership ?? false,
              amountChf,
              amountUsdc,
            });
            router.push('/send/review');
          }}
        />
      ) : null}
    </StackPage>
  );
}

function RecipientList({
  contacts,
  onPick,
  onNew,
}: {
  contacts: ReturnType<typeof useContacts>;
  onPick: (c: Contact) => void;
  onNew: () => void;
}) {
  const t = useCopy();
  const s = t.copyC.send;
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...(contacts.data ?? [])].sort((a, b) => Number(b.trusted) - Number(a.trusted));
    return q
      ? all.filter((c) => c.label.toLowerCase().includes(q) || c.address.toLowerCase().includes(q))
      : all;
  }, [contacts.data, query]);

  return (
    <div className="kl-stack gap-4">
      <TextField
        label={s.toTitle}
        placeholder={t.copy.send.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <StatementRow
        icon={<Plus size={20} aria-hidden="true" />}
        label={s.newRecipient}
        meta={s.newRecipientBody}
        onClick={onNew}
      />
      <section aria-label={s.contacts}>
        <div className="kl-section">
          <h2 className="kl-section__title">{s.contacts}</h2>
          <Link className="kl2-link text-14" href="/contacts">
            {s.manage}
          </Link>
        </div>
        <CrossFade stateKey={contacts.isPending ? 'loading' : contacts.isError ? 'error' : 'ready'}>
          {contacts.isPending ? (
            <Skeleton kind="row" count={3} />
          ) : contacts.isError ? (
            <ApiErrorState error={contacts.error} body={s.contactsError} onRetry={() => contacts.refetch()} />
          ) : list.length === 0 ? (
            <p className="m-0 py-4 text-14 text-ink-2">{s.contactsEmpty}</p>
          ) : (
            <div>
              {list.map((c) => (
                <StatementRow
                  key={c.id}
                  label={
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {c.simulated ? <Chip /> : null}
                    </span>
                  }
                  meta={<span className="kl-mono">{shortAddress(c.address)}</span>}
                  status={c.trusted || c.verifiedOwnership ? 'ok' : 'pending'}
                  statusWord={c.trusted ? s.trusted : c.verifiedOwnership ? t.copyC.contacts.verified : s.new}
                  onClick={() => onPick(c)}
                />
              ))}
            </div>
          )}
        </CrossFade>
      </section>
    </div>
  );
}

function NewRecipient({
  contacts,
  initial,
  onUse,
}: {
  contacts: Contact[];
  initial: Recipient | null;
  onUse: (r: Recipient) => void;
}) {
  const t = useCopy();
  const s = t.copyC.send;
  const [address, setAddress] = useState(initial?.address ?? '');
  const [name, setName] = useState(
    initial && initial.label !== shortAddress(initial.address) ? initial.label : '',
  );
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | null>(null);
  const trimmed = address.trim();
  const valid = isAddress(trimmed);
  const existing = valid
    ? contacts.find((c) => c.address.toLowerCase() === trimmed.toLowerCase())
    : undefined;

  async function paste() {
    try {
      setAddress((await navigator.clipboard.readText()).trim());
      setError(undefined);
    } catch {
      setNote(s.pasteFailed);
    }
  }

  function use() {
    if (!valid) {
      setError(t.copy.send.errAddress);
      return;
    }
    const checksummed = getAddress(trimmed);
    onUse({
      address: checksummed,
      label: existing?.label ?? (name.trim() || shortAddress(checksummed)),
      contact: existing ?? null,
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <TextField
        label={s.addressField}
        mono
        placeholder="0x…"
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
          setError(undefined);
        }}
        onBlur={() => {
          if (trimmed && !valid) setError(t.copy.send.errAddress);
        }}
        error={error}
        autoComplete="off"
        spellCheck={false}
        data-testid="send-address"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<ClipboardText size={18} aria-hidden="true" />} onClick={paste}>
          {s.paste}
        </Button>
        <Button
          variant="secondary"
          icon={<QrIcon size={18} aria-hidden="true" />}
          onClick={() => setNote(s.scanUnavailable)}
        >
          {s.scan}
        </Button>
      </div>
      {note ? <Note tone="info">{note}</Note> : null}
      {existing ? (
        <Note tone="info">{t.copyC.contacts.alreadyThere(existing.label)}</Note>
      ) : (
        <TextField
          label={s.nameField}
          placeholder={s.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      )}
      {valid && !existing ? <Note tone="warn">{s.firstTime}</Note> : null}
      <div className="kl-actions mt-auto">
        <Button variant="primary" full onClick={use} disabled={!trimmed}>
          {s.useAddress}
        </Button>
      </div>
    </div>
  );
}

function AmountStep({
  walletAddress,
  recipient,
  onChange,
  onReview,
}: {
  walletAddress: string;
  recipient: Recipient;
  onChange: () => void;
  onReview: (amountUsdc: number, amountChf: number) => void;
}) {
  const t = useCopy();
  const s = t.copyC.send;
  const money = usePrefs();
  const ccy = money.prefs.currency;
  const balance = useUsdcBalance(walletAddress);
  const [unit, setUnit] = useState<'fiat' | 'usdc'>('fiat');
  const [raw, setRaw] = useState('');
  const [touched, setTouched] = useState(false);

  const value = Number.parseFloat(raw.replace(/[’'\s]/g, '').replace(',', '.'));
  const entered = Number.isFinite(value) && value > 0 ? value : 0;
  const usdc = unit === 'usdc' ? entered : toChf(ccy, entered) / env.chfPerUsdc;
  const usdcRounded = Math.round(usdc * 100) / 100;
  const chf = Math.round(usdcRounded * env.chfPerUsdc * 100) / 100;
  const available = balance.data;
  const insufficient = available !== undefined && usdcRounded > available;
  const empty = entered <= 0;
  const isNew = !recipient.contact?.verifiedOwnership && !recipient.contact?.trusted;

  function toggle() {
    // Keep the same money when switching units: re-express the current amount in the other unit.
    if (entered > 0) {
      const next = unit === 'fiat' ? usdcRounded : money.toDisplay(chf);
      setRaw(next.toFixed(2));
    }
    setUnit(unit === 'fiat' ? 'usdc' : 'fiat');
  }

  function max() {
    if (available === undefined) return;
    setRaw((unit === 'usdc' ? available : money.toDisplay(available * env.chfPerUsdc)).toFixed(2));
    setUnit(unit);
  }

  const error =
    insufficient && available !== undefined
      ? s.insufficient(formatUSDC(available))
      : touched && empty
        ? s.errAmount
        : undefined;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <StatementRow
        label={s.to(recipient.contact ? recipient.label : s.newAddress)}
        meta={<Address value={recipient.address} copy={false} />}
        amount={
          <button type="button" className="kl2-textbtn" onClick={onChange}>
            {s.change}
          </button>
        }
        chevron={false}
      />
      {isNew ? <Note tone="warn">{s.firstTime}</Note> : null}

      <TextField
        label={unit === 'fiat' ? s.inFiat(ccy) : s.inUsdc}
        inputMode="decimal"
        placeholder="0.00"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setTouched(false);
        }}
        onBlur={() => {
          setTouched(true);
          if (entered > 0) setRaw(groupAmount(entered));
        }}
        onFocus={() => {
          if (entered > 0) setRaw(String(entered));
        }}
        prefix={unit === 'fiat' ? ccy : undefined}
        suffix={unit === 'usdc' ? 'USDC' : undefined}
        error={error}
        className="text-28"
        data-testid="send-amount"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-16 text-ink-2" aria-live="polite" data-testid="send-converted">
          ≈{' '}
          {unit === 'fiat' ? (
            <NumberTicker value={usdcRounded} format={formatUSDC} />
          ) : (
            <NumberTicker value={money.toDisplay(chf)} format={money.displayFormat} />
          )}
        </p>
        <button
          type="button"
          className="kl2-textbtn inline-flex items-center gap-1"
          onClick={toggle}
          data-testid="send-toggle"
        >
          <ArrowsDownUp size={16} aria-hidden="true" />
          {s.switchTo(unit === 'fiat' ? 'USDC' : ccy)}
        </button>
      </div>
      <p className="m-0 flex flex-wrap items-center gap-1 text-12 text-ink-3">
        {money.rate(env.chfPerUsdc)}
        <Chip />
      </p>

      <div className="flex items-center justify-between gap-2 border-line border-t pt-3 text-14">
        <span className="text-ink-2">
          {available === undefined
            ? balance.isError
              ? t.copy.common.errorTitle
              : s.balanceLoading
            : s.available(formatUSDC(available))}
        </span>
        <button type="button" className="kl2-textbtn" onClick={max} disabled={available === undefined}>
          {s.max}
        </button>
      </div>
      {balance.isError ? (
        <ApiErrorState
          error={balance.error}
          body={t.copy.common.errorBody}
          onRetry={() => balance.refetch()}
        />
      ) : null}

      <section className="kl-stack gap-1" aria-label={s.asset}>
        <StatementRow
          label={s.asset}
          meta={s.assetNote}
          amount="USDC"
          amountSub="Base Sepolia"
          chevron={false}
        />
      </section>

      <div className="kl-actions mt-auto">
        <Button
          variant="primary"
          full
          disabled={empty || insufficient}
          onClick={() => {
            setTouched(true);
            if (!empty && !insufficient) onReview(usdcRounded, chf);
          }}
          data-testid="send-review"
        >
          {s.review}
        </Button>
      </div>
    </div>
  );
}

/** `999999` → `999’999`, `20.5` → `20.50` (Swiss grouping, shown once the field loses focus). */
function groupAmount(n: number): string {
  const [int, dec] = n.toFixed(2).split('.');
  const grouped = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return dec === '00' ? grouped : `${grouped}.${dec}`;
}
