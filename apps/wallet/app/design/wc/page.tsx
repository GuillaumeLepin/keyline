'use client';

import {
  ConnectPanel,
  type ConnectPanelState,
  DappIdentityRow,
  type DappIdentityRowProps,
  DappPermissionsList,
  formatDateTime,
  InboxBadge,
  MessageBlock,
  Panel,
  PolicyLine,
  RequestSheet,
  type RequestSheetProps,
  SiweSummary,
  ThemeSwitch,
  TypedDataRows,
  typedDataRows,
  UINT256_MAX,
  useThemePreference,
} from '@keyline/ui';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { copyWc as c } from './copy';

const SAFE = '0x12AB4c5d6E7f8091a2B3c4D5e6F708192A3b9F3C';
const lab: DappIdentityRowProps = {
  name: 'AppKit Lab',
  url: 'https://lab.reown.com',
  iconUrl: 'https://lab.reown.com/favicon.ico',
  verification: 'verified',
  copy: c.identity,
};
const aave: DappIdentityRowProps = {
  name: 'Aave',
  url: 'https://app.aave.com',
  verification: 'verified',
  copy: c.identity,
};
const unknown: DappIdentityRowProps = {
  name: 'DemoSwap',
  url: 'http://localhost:3100',
  verification: 'unverified',
  copy: c.identity,
};
const flagged: DappIdentityRowProps = {
  name: 'Uniswap Rewards',
  url: 'https://uniswap-claim.xyz',
  iconUrl: 'https://broken.invalid/icon.png',
  verification: 'flagged',
  copy: c.identity,
};

const mail = typedDataRows(
  {
    types: {
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' },
      ],
    },
    primaryType: 'Mail',
    message: {
      from: { name: 'Lea', wallet: SAFE },
      to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
      contents: 'Hello, Bob!',
    },
  },
  c.request.typed.rows,
  { formatTime: (t) => formatDateTime(t * 1000) },
);
const permit = typedDataRows(
  {
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: {
      owner: SAFE,
      spender: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      value: UINT256_MAX.toString(),
      nonce: 0,
      deadline: '1760187600',
    },
  },
  c.request.typed.rows,
  { formatTime: (t) => formatDateTime(t * 1000) },
);

/** A 390 × 760 phone screen holding one open sheet. */
function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="dzw-frame">
      <figcaption className="dzw-cap">{label}</figcaption>
      <div className="dzw-screen">{children}</div>
    </figure>
  );
}

function Sheet(
  p: Omit<RequestSheetProps, 'open' | 'onClose' | 'onDecline' | 'copy'> & { onDecline?: () => void },
) {
  return (
    <RequestSheet
      open
      onClose={() => {}}
      onDecline={p.onDecline ?? (() => {})}
      copy={{
        decline: c.request.decline,
        close: c.request.close,
        retry: c.request.retry,
        expiredTitle: c.request.expiredTitle,
        expiredBody: c.request.expiredBody,
      }}
      {...p}
    />
  );
}

const txReview = (
  <>
    <PolicyLine
      verdict="step-up"
      word={c.request.tx.firstTime}
      reason="Your laptop will be asked to confirm."
    />
    <Panel
      title="What will happen"
      rows={[
        { label: 'You send', value: '25.00 USDC', tone: 'em' },
        { label: 'To', value: 'Aave Pool · 0x07eA…5Fd4' },
        { label: 'Network fee', value: 'Paid by Swissquote' },
        { label: 'Sanctions check', value: 'Clear · OFAC, SECO', tone: 'ok' },
      ]}
      footnote="This can’t be undone."
    />
  </>
);

const CONNECT_STATES: ConnectPanelState[] = [
  'idle',
  'invalid',
  'scanning',
  'camera-denied',
  'pairing',
  'expired',
];

export default function WalletConnectLab() {
  const root = useRef<HTMLDivElement>(null);
  const target = useCallback(() => root.current, []);
  const [theme, setTheme] = useThemePreference(target);
  const [uri, setUri] = useState('wc:7f6e…@2?relay-protocol=irn&symKey=…');
  const s = c.request;
  return (
    <div ref={root} className="dzw">
      <header className="dzw-top">
        <h1 className="dzw-h1">WalletConnect — every state</h1>
        <ThemeSwitch value={theme} onChange={setTheme} />
      </header>

      <section className="dzw-sec">
        <h2 className="dzw-h2">Identity, permissions, inbox badge</h2>
        <div className="dzw-col">
          <DappIdentityRow {...lab} />
          <DappIdentityRow {...aave} />
          <DappIdentityRow {...unknown} />
          <DappIdentityRow {...flagged} />
          <DappIdentityRow {...lab} compact trailing={<CaretRight size={16} aria-hidden="true" />} />
          <DappPermissionsList copy={c.proposal.permissions} />
          <p className="dzw-inline">
            Apps <InboxBadge count={2} label={c.inbox.badge(2)} /> · Alerts{' '}
            <InboxBadge count={12} label={c.inbox.badge(12)} /> · none <InboxBadge count={0} label="" />
          </p>
        </div>
      </section>

      <section className="dzw-sec">
        <h2 className="dzw-h2">Connect</h2>
        <div className="dzw-grid">
          {CONNECT_STATES.map((st) => (
            <Frame key={st} label={st}>
              <div className="dzw-pad">
                <ConnectPanel
                  state={st}
                  value={st === 'idle' ? '' : st === 'invalid' ? 'https://lab.reown.com' : uri}
                  onChange={setUri}
                  onConnect={() => {}}
                  copy={c.connect}
                />
              </div>
            </Frame>
          ))}
        </div>
      </section>

      <section className="dzw-sec">
        <h2 className="dzw-h2">Connection request</h2>
        <div className="dzw-grid">
          <Frame label="verified">
            <Sheet title={c.proposal.title} dapp={lab} state="review" primaryLabel={c.proposal.connect}>
              <DappPermissionsList copy={c.proposal.permissions} />
              <Panel
                rows={[
                  { label: c.proposal.network, value: c.proposal.networkValue },
                  { label: c.proposal.account, value: '0x12AB…9F3C' },
                ]}
              />
            </Sheet>
          </Frame>
          <Frame label="unverified">
            <Sheet title={c.proposal.title} dapp={unknown} state="review" primaryLabel={c.proposal.connect}>
              <div className="kl-note kl-note--warn" role="note">
                <span className="kl-note__body">{c.proposal.unverifiedNote}</span>
              </div>
              <DappPermissionsList copy={c.proposal.permissions} />
            </Sheet>
          </Frame>
          <Frame label="flagged (no Connect)">
            <Sheet title={c.proposal.title} dapp={flagged} state="refused">
              <div className="kl-note kl-note--danger" role="alert">
                <span className="kl-note__body">
                  <span className="kl-note__title">{c.proposal.flaggedTitle}</span>
                  {c.proposal.flaggedBody}
                </span>
              </div>
            </Sheet>
          </Frame>
          <Frame label="connected">
            <Sheet
              title={c.proposal.title}
              dapp={lab}
              state="success"
              successTitle={c.proposal.connectedTitle}
              successBody={c.proposal.connectedBody('AppKit Lab')}
            >
              {null}
            </Sheet>
          </Frame>
        </div>
      </section>

      <section className="dzw-sec">
        <h2 className="dzw-h2">Transaction · batch</h2>
        <div className="dzw-grid">
          <Frame label="review">
            <Sheet title={s.tx.title} dapp={aave} state="review" primaryLabel={s.tx.approve}>
              {txReview}
            </Sheet>
          </Frame>
          <Frame label="pending">
            <Sheet
              title={s.tx.title}
              dapp={aave}
              state="pending"
              primaryLabel={s.tx.approve}
              pendingLine={`${s.tx.steps.signed} · ${s.tx.steps.sent} · ${s.tx.steps.waiting}`}
            >
              {txReview}
            </Sheet>
          </Frame>
          <Frame label="success">
            <Sheet
              title={s.tx.title}
              dapp={aave}
              state="success"
              successTitle={s.tx.successTitle}
              successBody={s.tx.successBody}
            >
              {null}
            </Sheet>
          </Frame>
          <Frame label="error">
            <Sheet
              title={s.tx.title}
              dapp={aave}
              state="error"
              primaryLabel={s.tx.approve}
              errorTitle={s.tx.errorTitle}
              errorBody={s.tx.errorBody}
            >
              {txReview}
            </Sheet>
          </Frame>
          <Frame label="batch">
            <Sheet title={s.batch.title} dapp={lab} state="review" primaryLabel={s.batch.approve}>
              <p className="dzw-body">{s.batch.lead(2)}</p>
              <Panel
                title={s.batch.item(1)}
                rows={[{ label: 'Approve', value: 'USDC · 0 to 0xdEaD…dEaD' }]}
              />
              <Panel title={s.batch.item(2)} rows={[{ label: 'Approve', value: 'USDC · 0 to 0x0000…BA3' }]} />
            </Sheet>
          </Frame>
          <Frame label="blocked by policy">
            <Sheet title={s.blocked.title} dapp={unknown} state="refused">
              <PolicyLine
                verdict="block"
                word="Blocked"
                reason="Counterparty appears on the OFAC SDN list — simulated test entry."
              />
              <p className="dzw-body">{s.blocked.body('Swissquote won’t sponsor this transfer.')}</p>
            </Sheet>
          </Frame>
        </div>
      </section>

      <section className="dzw-sec">
        <h2 className="dzw-h2">Sign-in · message · typed data</h2>
        <div className="dzw-grid">
          <Frame label="sign-in (SIWE)">
            <Sheet title={s.signIn.title} dapp={lab} state="review" primaryLabel={s.signIn.approve}>
              <SiweSummary
                domain="lab.reown.com"
                appHost="lab.reown.com"
                address={SAFE}
                expiresAt="11 Oct 2026, 14:42"
                issuedAt="11 Oct 2026, 14:32"
                statement="Sign in to AppKit Lab."
                network="Base Sepolia"
                nonce="8kH2qZt1"
                uri="https://lab.reown.com"
                copy={s.signIn.siwe}
              />
            </Sheet>
          </Frame>
          <Frame label="sign-in · domain mismatch">
            <Sheet title={s.signIn.title} dapp={unknown} state="refused">
              <SiweSummary
                domain="app.aave.com"
                appHost="localhost:3100"
                address={SAFE}
                expiresAt="11 Oct 2026, 14:42"
                copy={s.signIn.siwe}
              />
            </Sheet>
          </Frame>
          <Frame label="sign-in · success">
            <Sheet
              title={s.signIn.title}
              dapp={lab}
              state="success"
              successTitle={s.signIn.successTitle}
              successBody={s.signIn.successBody}
            >
              {null}
            </Sheet>
          </Frame>
          <Frame label="message">
            <Sheet title={s.message.title} dapp={lab} state="review" primaryLabel={s.message.approve}>
              <MessageBlock
                text={'Hello Keyline\n\nPlease sign this message to confirm you own this wallet.'}
                hex="0x48656c6c6f204b65796c696e65"
                copy={s.message.block}
                noMoney={s.message.noMoney}
              />
            </Sheet>
          </Frame>
          <Frame label="message · unreadable">
            <Sheet title={s.message.title} dapp={unknown} state="review" primaryLabel={s.message.approve}>
              <MessageBlock
                hex="0x19457468657265756d205369676e6564204d6573736167653a0a3332a1b2c3d4e5f6"
                copy={s.message.block}
              />
            </Sheet>
          </Frame>
          <Frame label="typed data (Mail)">
            <Sheet title={s.typed.title} dapp={lab} state="review" primaryLabel={s.typed.approve}>
              <TypedDataRows
                title="Mail"
                domain={s.typed.domain('Ether Mail', 'Base Sepolia', '0xCcCC…cCCC')}
                rows={mail}
              />
            </Sheet>
          </Frame>
          <Frame label="permit · unlimited (danger)">
            <Sheet
              title={s.typed.permitTitle}
              dapp={unknown}
              state="review"
              primaryLabel={s.typed.approveDanger}
              primaryVariant="danger"
            >
              <PolicyLine
                verdict="block"
                word="Unlimited"
                reason={s.typed.permitBody('Permit2 · 0x0000…8BA3')}
              />
              <TypedDataRows
                title="Permit"
                domain={s.typed.domain('USDC', 'Base Sepolia', '0x036C…CF7e')}
                rows={permit}
              />
            </Sheet>
          </Frame>
          <Frame label="EOA-only permit">
            <Sheet
              title={s.eoaOnly.title}
              dapp={unknown}
              state="review"
              secondaryAction={
                <button type="button" className="kl-btn kl-btn--primary kl-btn--full">
                  {s.eoaOnly.alternative}
                </button>
              }
            >
              <p className="dzw-body">{s.eoaOnly.body}</p>
              <p className="dzw-meta">{s.eoaOnly.alternativeBody}</p>
            </Sheet>
          </Frame>
        </div>
      </section>

      <section className="dzw-sec">
        <h2 className="dzw-h2">Refusals · expired</h2>
        <div className="dzw-grid">
          <Frame label="chain switch">
            <Sheet title={s.chainSwitch.title} dapp={lab} state="refused">
              <p className="dzw-body">{s.chainSwitch.body('Ethereum mainnet')}</p>
            </Sheet>
          </Frame>
          <Frame label="unsupported method">
            <Sheet title={s.unsupported.title} dapp={unknown} state="refused">
              <p className="dzw-body">{s.unsupported.body('eth_sign')}</p>
            </Sheet>
          </Frame>
          <Frame label="expired">
            <Sheet title={s.tx.title} dapp={aave} state="expired">
              {null}
            </Sheet>
          </Frame>
        </div>
      </section>
    </div>
  );
}
