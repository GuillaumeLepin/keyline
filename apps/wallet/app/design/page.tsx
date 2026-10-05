'use client';

import {
  Address,
  AmountField,
  Button,
  CountdownRing,
  DeskLayout,
  DeviceBar,
  Disclosure,
  EmergencyCard,
  EmptyState,
  ErrorState,
  formatCHF,
  formatInteger,
  formatRate,
  formatSignedUSDC,
  formatUSDC,
  KeyCard,
  Note,
  Panel,
  PhoneFrame,
  PolicyLine,
  RadioCard,
  Sheet,
  SimulatedBadge,
  Skeleton,
  StatementRow,
  StatusSequence,
  Stepper,
  TestnetStrip,
  TextField,
  Toggle,
} from '@keyline/ui';
import {
  Bank,
  DeviceMobile,
  IdentificationCard,
  Key,
  Laptop,
  Printer,
  ShieldCheck,
} from '@phosphor-icons/react/dist/ssr';
import { type ReactNode, useMemo, useState } from 'react';

const WALLET = '0x12AB4c5d6E7f8091a2B3c4D5e6F708192A3b9F3C';
const LUKAS = '0x7a1F3b2c4D5e6F708192a3B4c5D6e7F8091a3c9E';
const TX = '0x9c41e2d7f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f506172839a4b';
const CARD_KEY = '0x4f3c2b1a09e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d6c5b4a39281706f5e4';
const CARD_ADDR = '0xC4Rd00000000000000000000000000000000Ab12'.replace('R', 'a');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="kl-stack" aria-label={title}>
      <div className="kl-section">
        <h2 className="kl-section__title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function DesignPage() {
  const [amount, setAmount] = useState('20');
  const [amountErr, setAmountErr] = useState('');
  const [toggle, setToggle] = useState(false);
  const [mode, setMode] = useState('default');
  const [sheet, setSheet] = useState(true);
  const endsIn3 = useMemo(() => Date.now() + 161_000, []);
  const endsIn45 = useMemo(() => Date.now() + 45_000, []);
  const ended = useMemo(() => Date.now() - 5_000, []);

  return (
    <div className="kl-stack" style={{ gap: 0 }}>
      <header style={{ padding: '24px 16px 0', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <p className="kl-eyebrow">Keyline design system</p>
        <h1 className="kl-title">Kitchen sink</h1>
        <p className="kl-lead">
          Every primitive in every state. Phone frame first, desk layout below. Tokens:{' '}
          <code className="kl-mono">packages/ui/src/tokens.css</code>.
        </p>
      </header>

      <PhoneFrame persona="lea-phone" className="kl-phone--tall">
        <Section title="Type scale">
          <p className="kl-balance__amount">{formatCHF(1234.5)}</p>
          <p className="kl-title">Protected · 2 of 3 recoverers</p>
          <p className="kl-topbar__title">Screen title 20/28</p>
          <p>
            Body 16/24 — You’ll send {formatUSDC(25)} (≈ {formatCHF(20)}) to Lukas Meier. This can’t be
            undone.
          </p>
          <p style={{ fontSize: 'var(--text-14)', lineHeight: 'var(--leading-14)', color: 'var(--ink-2)' }}>
            Secondary 14/20 — Swissquote can’t move your money, alone or with anyone.
          </p>
          <p className="kl-eyebrow">Eyebrow 12/16</p>
          <p className="kl-mono" style={{ fontSize: 'var(--text-14)' }}>
            Mono 0x7a1F 3b2c 4D5e · block {formatInteger(6812334)}
          </p>
        </Section>

        <Section title="Button">
          <Button variant="primary" full>
            Confirm with Face ID
          </Button>
          <Button variant="secondary" full>
            Cancel transfer
          </Button>
          <Button variant="ghost" full>
            Skip for now — add it later
          </Button>
          <Button variant="danger" full>
            Cancel recovery — it wasn’t me
          </Button>
          <Button variant="danger-text" full>
            Override (demo: assume the bank was fooled)
          </Button>
          <div className="kl-actions kl-actions--row" style={{ marginTop: 0 }}>
            <Button variant="primary" loading>
              Protect my wallet
            </Button>
            <Button variant="secondary" disabled>
              Continue
            </Button>
          </div>
          <div className="kl-actions kl-actions--row" style={{ marginTop: 0 }}>
            <Button variant="secondary" size="sm" icon={<Printer size={16} aria-hidden="true" />}>
              Print
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Security"
              icon={<ShieldCheck size={20} aria-hidden="true" />}
            />
            <Button variant="secondary" size="sm" href="/">
              Link button
            </Button>
          </div>
        </Section>

        <Section title="TextField">
          <TextField
            label="Email"
            type="email"
            placeholder="lea.keller@example.ch"
            hint="The email on your Swissquote file."
          />
          <TextField label="6-digit code" mono inputMode="numeric" defaultValue="482137" />
          <TextField
            label="6-digit code"
            mono
            defaultValue="482138"
            error="That code doesn’t match. Check the phone and try again."
          />
          <TextField label="Platform (VASP)" defaultValue="Swissquote" disabled />
          <TextField
            label="Search"
            placeholder="Search contacts or paste an address"
            prefix={<DeviceMobile size={16} aria-hidden="true" />}
          />
        </Section>

        <Section title="AmountField">
          <AmountField value={amount} onChange={setAmount} rate={0.8} error={amountErr || undefined} />
          <p className="kl-field__hint">
            {formatRate(0.8)} <SimulatedBadge />
          </p>
          <div className="kl-actions kl-actions--row" style={{ marginTop: 0 }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAmountErr('Not enough USDC. You have 120.00 USDC.')}
            >
              Show error
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAmountErr('')}>
              Clear
            </Button>
          </div>
        </Section>

        <Section title="StatementRow">
          <StatementRow
            label="Lukas Meier"
            meta="5 Oct, 14:32"
            status="ok"
            statusWord="Confirmed"
            amount={formatSignedUSDC(-25)}
            amountSub={formatCHF(20)}
            href="#"
          />
          <StatementRow
            label="Top up from Swissquote"
            meta="5 Oct, 14:20"
            status="pending"
            statusWord="Sent"
            amount={formatSignedUSDC(120)}
            amountSub={formatCHF(96)}
            href="#"
          />
          <StatementRow
            label="Sanctioned test address"
            meta="5 Oct, 14:40"
            status="danger"
            statusWord="Blocked"
            amount={formatSignedUSDC(-50)}
            amountSub={formatCHF(40)}
          />
          <StatementRow
            label="Prove this wallet is yours"
            icon={<IdentificationCard size={20} aria-hidden="true" />}
            onClick={() => undefined}
          />
          <StatementRow label="Wallet created" meta="5 Oct, 14:02 · bank" />
        </Section>

        <Section title="Address">
          <Address value={LUKAS} label="Lukas Meier" />
          <Address value={WALLET} explorerUrl={`https://sepolia.basescan.org/address/${WALLET}`} />
          <Address value={TX} expanded explorerUrl={`https://sepolia.basescan.org/tx/${TX}`} />
        </Section>

        <Section title="Stepper">
          <Stepper current={1} total={6} label="Create your Keyline" />
          <Stepper current={3} total={6} label="Print your Emergency card" />
          <Stepper current={6} total={6} label="Prove ownership to Swissquote" />
        </Section>

        <Section title="StatusSequence">
          <StatusSequence
            steps={[
              { label: 'Signed', state: 'done', meta: '14:32:04' },
              { label: 'Sent', state: 'done', meta: '14:32:05' },
              { label: `In block ${formatInteger(6812334)}`, state: 'active', meta: '14:32:07' },
              { label: 'Confirmed', state: 'todo' },
            ]}
          />
          <StatusSequence
            steps={[
              { label: 'Sent to your laptop', state: 'done' },
              { label: 'Waiting for the Safety key', state: 'failed', meta: 'Refused' },
              { label: 'Approved', state: 'todo' },
            ]}
          />
        </Section>

        <Section title="CountdownRing">
          <CountdownRing
            endsAt={endsIn3}
            durationMs={180_000}
            caption="Waiting period accelerated for the demo: 3 min instead of 72 h."
          />
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <CountdownRing endsAt={endsIn45} durationMs={60_000} size={96} />
            <CountdownRing endsAt={ended} durationMs={180_000} size={64} />
          </div>
        </Section>

        <Section title="Panel">
          <Panel
            title="What will happen"
            rows={[
              { label: 'You send', value: formatUSDC(25), tone: 'em' },
              { label: 'Lukas receives', value: formatUSDC(25) },
              { label: 'Your balance', value: `${formatUSDC(120)} → ${formatUSDC(95)}` },
              { label: 'Network fee', value: 'Paid by Swissquote' },
              { label: 'Sanctions check', value: 'Clear · OFAC, SECO', tone: 'ok' },
            ]}
            footnote="This can’t be undone."
          />
          <Panel
            tone="danger"
            rows={[
              { label: 'Permission', value: 'DemoSwap could spend all your USDC, forever', tone: 'danger' },
              { label: 'Network fee', value: 'Paid by Swissquote' },
            ]}
          />
        </Section>

        <Section title="PolicyLine">
          <PolicyLine verdict="ok" reason="Within your CHF 1’000 daily limit." />
          <PolicyLine verdict="step-up" reason="Above CHF 1’000 today. Confirm on Lea · laptop." />
          <PolicyLine verdict="cooling" reason="First transfer to a new address. You can cancel for 0:60." />
          <PolicyLine
            verdict="block"
            reason="Counterparty appears on the OFAC SDN list — simulated test entry."
            trailing={<SimulatedBadge />}
            detail="Swissquote won’t pay the network fee for this transfer and recommends you don’t send it."
          />
        </Section>

        <Section title="SimulatedBadge">
          <p>
            Identity check <SimulatedBadge /> · Swissquote account balance: {formatCHF(4210.35)}{' '}
            <SimulatedBadge />
          </p>
        </Section>

        <Section title="KeyCard">
          <KeyCard
            name="Phone key"
            where="This phone"
            can="Signs every transfer"
            icon={<DeviceMobile size={20} aria-hidden="true" />}
          />
          <KeyCard
            name="Safety key"
            where="Lea’s laptop"
            can="Co-approves above CHF 1’000 · helps restore"
            cannot="Cannot spend alone"
            icon={<Laptop size={20} aria-hidden="true" />}
            status="pending"
            statusWord="Waiting for your laptop"
          />
          <KeyCard
            name="Emergency card"
            where="On paper, with you"
            can="Helps restore after a waiting period"
            cannot="Cannot spend"
            icon={<IdentificationCard size={20} aria-hidden="true" />}
          />
          <KeyCard
            name="Swissquote"
            where="Swiss data centre"
            can="Helps restore after identity check"
            cannot="Cannot spend, cannot act alone"
            icon={<Bank size={20} aria-hidden="true" />}
            status="active"
            statusWord="Confirmed 14:30:12"
            action={
              <Button size="sm" variant="secondary" href="#">
                View on Basescan
              </Button>
            }
          />
          <KeyCard
            name="Old phone key"
            where="Lost phone"
            can="Removed after recovery"
            icon={<Key size={20} aria-hidden="true" />}
            status="revoked"
          />
        </Section>

        <Section title="EmergencyCard">
          <EmergencyCard
            privateKeyHex={CARD_KEY}
            address={CARD_ADDR}
            walletAddress={WALLET}
            onStored={() => undefined}
          />
        </Section>

        <Section title="EmptyState · Skeleton · ErrorState">
          <EmptyState
            title="Nothing yet"
            body="Your first top-up will appear here."
            action={<Button size="sm">Top up from my Swissquote account</Button>}
          />
          <Skeleton kind="amount" />
          <Skeleton kind="row" count={2} />
          <Skeleton kind="line" count={3} />
          <ErrorState
            title="Swissquote isn’t reachable"
            body="Your keys and your money are unaffected. The bank service answers policy checks and pays network fees; try again in a moment."
            onRetry={() => undefined}
            detail="FetchError: connect ECONNREFUSED 127.0.0.1:4000"
          />
          <ErrorState body="Nothing was sent. Your balance is unchanged." />
        </Section>

        <Section title="Note · Disclosure">
          <Note>Prototype: a software key in this browser. In production this is a hardware key.</Note>
          <Note tone="warn">
            First transfer to this address. A short waiting period will apply and your laptop will be asked to
            confirm.
          </Note>
          <Note tone="danger" title="This device has no key for this wallet.">
            Sending is not possible from here. If this is your phone and you lost access, start a recovery.
          </Note>
          <Note tone="ok">Ownership proven — Travel Rule check done.</Note>
          <Disclosure summary="Technical details">
            <pre className="kl-code">{`to       ${LUKAS}\nvalue    25000000 (6 decimals)\nnonce    14\nhash     ${TX}`}</pre>
          </Disclosure>
        </Section>

        <Section title="Toggle · RadioCard">
          <Toggle
            checked={toggle}
            onChange={setToggle}
            label="Pay my own network fee"
            description="Uses ETH in this wallet instead of Swissquote’s sponsorship."
          />
          <Toggle checked onChange={() => undefined} label="Liveness check passed" disabled />
          <RadioCard
            name="mode"
            value="default"
            checked={mode === 'default'}
            onChange={setMode}
            title="Default — recommended"
            body="Your Safety key, your Emergency card and Swissquote. Any 2 of the 3. Swissquote can never act alone or with another institution."
            meta="Waiting period: 72 h (demo: 3 min)"
          />
          <RadioCard
            name="mode"
            value="assisted"
            checked={mode === 'assisted'}
            onChange={setMode}
            title="Assisted"
            body="Your Safety key, Swissquote and an independent recovery partner. For clients who don’t want paper."
            meta={
              <>
                Waiting period: 14 days. <SimulatedBadge label="Simulated partner" /> Not in this prototype
              </>
            }
            disabled
          />
        </Section>

        <Section title="Sheet (inline preview — the only shadow)">
          {sheet ? (
            <Sheet open inline title="Have you really stored it?" onClose={() => setSheet(false)}>
              <p className="kl-lead">
                Keyline keeps no copy. If you lose both your phone and your laptop, this card is the only
                thing that can help.
              </p>
              <div className="kl-actions" style={{ marginTop: 0 }}>
                <Button variant="primary" full>
                  Yes, I stored it
                </Button>
                <Button variant="ghost" full>
                  Go back
                </Button>
              </div>
            </Sheet>
          ) : (
            <Button size="sm" onClick={() => setSheet(true)}>
              Reopen sheet
            </Button>
          )}
        </Section>

        <TestnetStrip />
      </PhoneFrame>

      <section
        className="kl-stack"
        style={{ padding: '32px 16px', maxWidth: 1200, margin: '0 auto', width: '100%' }}
        aria-label="Device bars"
      >
        <div className="kl-section">
          <h2 className="kl-section__title">DeviceBar — five personas</h2>
        </div>
        <DeviceBar persona="lea-phone" />
        <DeviceBar persona="lea-laptop" />
        <DeviceBar persona="lea-new-phone" />
        <DeviceBar persona="thief" />
        <DeviceBar persona="desk" />
      </section>

      <DeskLayout
        title="Recovery requests"
        operator="M. Keller"
        onSignOut={() => undefined}
        nav={[
          { label: 'Queue', href: '#', current: true },
          { label: 'Audit log', href: '#' },
        ]}
      >
        <div className="kl-desk__grid">
          <div style={{ gridColumn: 'span 4' }} className="kl-stack">
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="kl-chip kl-chip--neutral">Open</span>
              <span className="kl-chip kl-chip--neutral" style={{ borderColor: 'var(--line)' }}>
                Refused
              </span>
              <span className="kl-chip kl-chip--neutral" style={{ borderColor: 'var(--line)' }}>
                Finished
              </span>
            </div>
            <StatementRow
              label="Lea Keller · SQ-48213-LK"
              meta="2 min ago"
              amount={<span className="kl-chip kl-chip--pending">Waiting for a 2nd recoverer</span>}
              onClick={() => undefined}
            />
            <StatementRow
              label="Lea Keller · SQ-48213-LK"
              meta="14 min ago · Thief · stolen phone"
              amount={<span className="kl-chip kl-chip--danger">Refused</span>}
              onClick={() => undefined}
            />
            <StatementRow
              label="Twin wallet · SQ-48213-LK"
              meta="1 h ago"
              amount={<span className="kl-chip kl-chip--ok">Finished</span>}
              onClick={() => undefined}
            />
            <EmptyState title="No recovery requests" body="New requests appear here within a few seconds." />
          </div>
          <div style={{ gridColumn: 'span 8' }} className="kl-stack">
            <div>
              <h2 className="kl-topbar__title">Lea Keller — recovery #R-2041</h2>
              <p className="kl-field__hint">Requested from Lea · new phone · Zürich · 5 Oct 2026, 14:28</p>
            </div>
            <Panel
              title="Identity signals"
              rows={[
                { label: 'Email code', value: 'Passed', tone: 'ok' },
                { label: 'ID document', value: 'Name matches', tone: 'ok' },
                { label: 'Liveness', value: 'Passed', tone: 'ok' },
                {
                  label: 'Verdict',
                  value: (
                    <>
                      Pass, signed by the bank <SimulatedBadge />
                    </>
                  ),
                },
              ]}
            />
            <Panel
              title="Recoverer confirmations"
              rows={[
                {
                  label: 'Swissquote',
                  value: (
                    <Address
                      value={TX}
                      label="Confirmed 14:30:12 ·"
                      expandable={false}
                      copy={false}
                      explorerUrl="#"
                    />
                  ),
                },
                { label: 'Safety key', value: 'Pending', tone: 'em' },
                { label: 'Emergency card', value: 'Not used' },
              ]}
            />
            <div className="kl-panel">
              <h3 className="kl-panel__title">On-chain timer</h3>
              <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                <CountdownRing endsAt={endsIn3} durationMs={180_000} size={64} />
                <p className="kl-field__hint">read from the SocialRecoveryModule</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary">Approve identity</Button>
              <Button variant="secondary">Refuse</Button>
              <Button variant="danger-text">Override (demo: assume the bank was fooled)</Button>
            </div>
            <Note>
              Swissquote confirmed. Status stays “Waiting for a 2nd recoverer” — Swissquote cannot finish this
              alone.
            </Note>
          </div>
        </div>
        <div className="kl-stack">
          <div className="kl-section">
            <h2 className="kl-section__title">Audit log · append-only</h2>
          </div>
          <table className="kl-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Service</th>
                <th>Event</th>
                <th>Who</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="kl-mono">14:30:12</td>
                <td>sq-guardian</td>
                <td>Recovery confirmed (1 of 2)</td>
                <td>Swissquote recoverer</td>
              </tr>
              <tr>
                <td className="kl-mono">14:29:40</td>
                <td>bank</td>
                <td>Identity verdict: pass</td>
                <td>Operator M. Keller</td>
              </tr>
              <tr>
                <td className="kl-mono">14:28:02</td>
                <td>bank</td>
                <td>Recovery requested</td>
                <td>Lea · new phone</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DeskLayout>
    </div>
  );
}
