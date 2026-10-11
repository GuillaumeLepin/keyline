// SPEC §11 — Keyline as a WalletConnect wallet for a real dApp, end to end on the LIVE stack:
//   wallet :3000 · bank :4000 · sq-guardian :4001 · DemoSwap :3100 (Reown AppKit + wagmi) · the public Reown relay ·
//   Base Sepolia.
//
// Lea's phone (a persona context with a virtual passkey) gets a protected wallet from the onboarding fixture. A third
// browser context plays the laptop screen running DemoSwap: it opens the AppKit modal, copies the WalletConnect link
// ("Copy link" → the clipboard), and the phone pastes it into Keyline's Connect card. Then, one test per demo beat:
//   connect (verification chip) → SIWE (ERC-1271, verified by DemoSwap with viem) → approve(∞) flagged → capped at
//   100 USDC (allowance read on-chain) → swap (hash, or the honest 4001 when the wallet holds no USDC) → sanctioned
//   recipient (blocked, 4001) → phone reload keeps the session → Disconnect from the phone → DemoSwap disconnected.
// Plus the negative case: a proposal whose identity does not hold is refused with no Connect button (see the test).
//
// Nothing here is mocked except the passkeys (CDP virtual authenticators) and what the bank itself simulates.
import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import { type Address, createPublicClient, erc20Abi, getAddress, type Hex, http, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { chainEnv, txSucceeded, txUrl, usdcBalance } from './chain';
import { createProtectedWallet, type ProtectedWallet } from './fixtures/onboard';
import { bankUrl, openPersona, type PersonaSession, warmRoutes } from './fixtures/personas';

const DEMOSWAP = process.env.E2E_DEMOSWAP_URL ?? 'http://localhost:3100';
const DEMO_SPENDER = getAddress('0xde305aa9000000000000000000000000000000de');
const MOVE_USDC = 2;
/** The bank's seeded sanctioned test entry (services/bank seed; screening.source 'seeded-test'). */
const SANCTIONED = getAddress('0x42b16056ee5e2C9bDE34Db76fdb2FA7554Ab0A73');
const SANCTIONS_REASON = 'Counterparty appears on the OFAC SDN list — simulated test entry';
const HASH = /0x[0-9a-f]{64}/;

const client = createPublicClient({ chain: baseSepolia, transport: http(chainEnv.rpcUrl) });

const s: {
  phone?: PersonaSession;
  laptop?: PersonaSession;
  demoCtx?: BrowserContext;
  demo?: Page;
  wallet?: ProtectedWallet;
  funded: boolean;
  connected: boolean;
  txs: Record<string, string>;
} = { funded: false, connected: false, txs: {} };

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`${what} missing (earlier step failed)`);
  return v;
}
const phone = () => need(s.phone, 'phone').page;
const demo = () => need(s.demo, 'DemoSwap page');
const safe = () => need(s.wallet, 'wallet').safe;

/** A DemoSwap action card (its <section> with the numbered <h2>). */
const card = (p: Page, title: string) =>
  p.locator('section').filter({ has: p.getByRole('heading', { name: title }) });
const outcome = (title: string) => card(demo(), title).getByRole('status');

/** DemoSwap's "Copy link" → the laptop clipboard; the QR element's `uri` attribute as a fallback. */
async function copyWalletConnectUri(page: Page): Promise<{ uri: string; via: string }> {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  const qr = page.locator('wui-qr-code');
  if (!(await qr.isVisible({ timeout: 10_000 }).catch(() => false))) {
    // Some AppKit layouts open on a wallet list first.
    await page.getByText('WalletConnect', { exact: true }).first().click();
  }
  await expect(qr).toBeVisible({ timeout: 30_000 });
  // The link exists once the QR has its uri (pairing created on the relay).
  await expect.poll(async () => (await qr.getAttribute('uri')) ?? '', { timeout: 30_000 }).toMatch(/^wc:/);
  const qrUri = (await qr.getAttribute('uri')) as string;
  const copy = page.getByText('Copy link', { exact: true }).first();
  if (await copy.isVisible().catch(() => false)) {
    await page.evaluate(() => navigator.clipboard.writeText('')).catch(() => undefined);
    await copy.click();
    const pasted = await expect
      .poll(async () => page.evaluate(() => navigator.clipboard.readText()).catch(() => ''), {
        timeout: 10_000,
      })
      .toMatch(/^wc:/)
      .then(() => page.evaluate(() => navigator.clipboard.readText()))
      .catch(() => '');
    if (pasted.startsWith('wc:')) {
      expect(pasted, 'the copied link is the QR link').toBe(qrUri);
      return { uri: pasted, via: 'Copy link → clipboard' };
    }
  }
  return { uri: qrUri, via: 'wui-qr-code[uri] (Copy link not readable)' };
}

/** Lea pastes the link into Keyline's Connect card (/dapps) and presses Connect. */
async function pasteOnPhone(p: Page, uri: string): Promise<void> {
  await need(s.phone, 'phone').goto('/dapps');
  const connect = p.getByTestId('wc-connect');
  await expect(connect).toBeVisible({ timeout: 60_000 });
  await connect.getByRole('textbox').fill(uri);
  await connect.getByRole('button', { name: 'Connect', exact: true }).click();
}

/** The sheet's own "Close" button (the scrim and the ✕ icon are also buttons named Close). */
async function closeSheet(sheet: Locator): Promise<void> {
  const close = sheet.locator('.kl-btn', { hasText: /^Close$/ });
  if (await close.isVisible().catch(() => false)) await close.click();
}

const APPROVE = /^Approve (all )?with Face ID$/;

/**
 * A DemoSwap transaction request arrives on the phone as /send/review?wc=<id>. Waits for the review to settle and
 * returns what it shows: 'offer' (the unlimited-approval cap offer), 'blocked', or 'ready' (approve enabled).
 */
async function settledReview(p: Page, before: string): Promise<'offer' | 'blocked' | 'ready'> {
  await expect
    .poll(() => p.url(), { timeout: 90_000, message: 'a new request opens on the phone' })
    .not.toBe(before);
  await p.waitForURL(/\/send\/review/, { timeout: 90_000 });
  const approve = p.getByRole('button', { name: APPROVE });
  const cap = p.getByRole('button', { name: /instead$/ });
  const blocked = p.getByText('Blocked', { exact: true });
  let state: 'offer' | 'blocked' | 'ready' | '' = '';
  await expect
    .poll(
      async () => {
        state = (await cap.isVisible())
          ? 'offer'
          : (await blocked.first().isVisible())
            ? 'blocked'
            : (await approve.isEnabled().catch(() => false))
              ? 'ready'
              : '';
        return state;
      },
      { timeout: 90_000, message: 'the review settles (offer, block or approve)' },
    )
    .not.toBe('');
  return state as 'offer' | 'blocked' | 'ready';
}

/** Approve with Face ID → inclusion → the receipt on /activity/… */
async function approveAndWaitReceipt(p: Page): Promise<void> {
  const approve = p.getByRole('button', { name: APPROVE });
  await expect(approve).toBeEnabled({ timeout: 90_000 });
  await approve.click();
  await p.waitForURL(/\/activity\//, { timeout: 180_000 });
  await expect(p.getByTestId('receipt')).toBeVisible({ timeout: 60_000 });
}

async function clickAction(title: string, button: string): Promise<string> {
  const before = phone().url();
  const btn = card(demo(), title).getByRole('button', { name: button });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
  return before;
}

test.describe
  .serial('WalletConnect — DemoSwap ⇄ Keyline (live relay, Base Sepolia)', () => {
    test.beforeAll(async ({ browser }) => {
      await warmRoutes([
        ...['/', '/start', '/dapps', '/wc', '/send/review', '/swissquote', '/swissquote/portfolio'],
      ]);
      s.laptop = await openPersona(browser, 'lea-laptop');
      s.phone = await openPersona(browser, 'lea-phone');
      s.demoCtx = await browser.newContext({
        viewport: { width: 1280, height: 960 },
        locale: 'en-CH',
        timezoneId: 'Europe/Zurich',
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      s.demo = await s.demoCtx.newPage();
    });

    test.afterAll(async () => {
      console.info('walletconnect txs:', JSON.stringify(s.txs, null, 2));
      await s.demoCtx?.close();
      await s.phone?.close();
      await s.laptop?.close();
    });

    test('setup — protected wallet (onboarding fixture) + Move 2 USDC to Keyline (or the honest refusal)', async () => {
      const laptop = need(s.laptop, 'laptop');
      s.wallet = await createProtectedWallet(need(s.phone, 'phone'), laptop);
      console.info(`protected Safe ${s.wallet.safe}`);
      if (s.wallet.protectTx) s.txs.protect = txUrl(s.wallet.protectTx);

      await laptop.goto('/swissquote/portfolio');
      const l = laptop.page;
      await l.getByTestId('positions').getByRole('button', { name: 'Move USDC to Keyline' }).click();
      const sheet = l.getByRole('dialog', { name: 'Move USDC to Keyline' });
      await sheet.getByTestId('move-amount').fill(String(MOVE_USDC));
      const response = l.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/sq/moves',
        { timeout: 90_000 },
      );
      const before = await usdcBalance(s.wallet.safe);
      await sheet.getByTestId('move-submit').click();
      const res = await response;
      const body = (await res.json().catch(() => ({}))) as { txHash?: string; message?: string };
      if (res.status() >= 400) {
        test
          .info()
          .annotations.push({ type: 'unfunded', description: `${res.status()} ${body.message ?? ''}` });
        console.info('move refused:', res.status(), body.message);
      } else {
        await expect
          .poll(async () => usdcBalance(safe()), { timeout: 90_000, message: 'USDC arrives in the Safe' })
          .toBeGreaterThanOrEqual(before + parseUnits(String(MOVE_USDC), 6));
        s.funded = true;
        if (body.txHash) s.txs.move = txUrl(body.txHash);
      }
      await sheet.getByRole('button', { name: 'Close' }).click();
    });

    test('connect — DemoSwap "Copy link" → paste in Keyline → Verified DemoSwap → Connect → DemoSwap shows the Safe', async () => {
      const d = demo();
      await d.goto(DEMOSWAP);
      await expect(d.getByText('DemoSwap', { exact: true }).first()).toBeVisible();
      const { uri, via } = await copyWalletConnectUri(d);
      test.info().annotations.push({ type: 'uri-source', description: via });
      console.info(`WalletConnect link via ${via}: ${uri.slice(0, 24)}…`);

      const p = phone();
      await pasteOnPhone(p, uri);
      const proposal = p.getByTestId('wc-proposal');
      await expect(proposal).toHaveAttribute('data-state', 'review', { timeout: 60_000 });
      await expect(proposal).toContainText('DemoSwap');
      await expect(proposal).toContainText('localhost:3100');
      // The verification chip (Verify API + the bank's allowlist): DemoSwap is a verified, reviewed app.
      await expect(proposal.getByText(/^(Verified domain|Unverified|Flagged)$/).first()).toBeVisible();
      const chip = (
        await proposal
          .getByText(/^(Verified domain|Unverified|Flagged)$/)
          .first()
          .innerText()
      ).trim();
      test.info().annotations.push({ type: 'verification-chip', description: chip });
      expect(chip, 'DemoSwap is not flagged').not.toBe('Flagged');

      await proposal.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(proposal).toHaveAttribute('data-state', 'success', { timeout: 60_000 });
      await expect(d.getByRole('button', { name: 'Disconnect' })).toBeVisible({ timeout: 60_000 });
      await expect(d.locator('header a[title]').first()).toHaveAttribute('title', safe());
      await expect(d.getByText(safe(), { exact: true })).toBeVisible();
      await expect(d.getByText(/Base Sepolia \(84532\)/)).toBeVisible();
      s.connected = true;
      await closeSheet(proposal);
    });

    test('sign in (SIWE) — phone sheet → passkey → DemoSwap verifies the ERC-1271 signature', async () => {
      test.skip(!s.connected, 'not connected');
      const p = phone();
      await clickAction('Sign in (SIWE)', 'Sign in');
      const req = p.getByTestId('wc-request');
      await expect(req).toHaveAttribute('data-kind', 'message', { timeout: 60_000 });
      await expect(req).toContainText('localhost:3100');
      await req.getByRole('button', { name: 'Sign in with Face ID' }).click();
      await expect(req).toHaveAttribute('data-state', 'success', { timeout: 90_000 });
      await expect(outcome('Sign in (SIWE)')).toContainText('Signed in', { timeout: 60_000 });
      await expect(outcome('Sign in (SIWE)')).toContainText(safe());
      await expect(outcome('Sign in (SIWE)')).toContainText('verifyMessage → true');
      // A Safe contract signature (417+ bytes), not a 65-byte ECDSA one: verifyMessage went through isValidSignature.
      const text = await outcome('Sign in (SIWE)').innerText();
      const bytes = Number(text.match(/(\d+)-byte signature/)?.[1] ?? 0);
      expect(bytes, text).toBeGreaterThan(65);
      // DemoSwap labels the account from getCode (retried) or, failing that, from the signature length.
      await expect(outcome('Sign in (SIWE)')).toContainText('(smart account, ERC-1271)');
      test.info().annotations.push({ type: 'siwe', description: text.replace(/\s+/g, ' ') });
      await closeSheet(req);
    });

    test('approve(∞) — the phone flags it and offers 100 USDC → capped approve included → allowance = 100 USDC on-chain', async () => {
      test.skip(!s.connected, 'not connected');
      const p = phone();
      const before = await clickAction('Approve unlimited USDC', 'Approve unlimited');
      expect(await settledReview(p, before)).toBe('offer');
      // The danger offer: the unlimited option is there but secondary; the cap is the primary action.
      await expect(p.getByTestId('approve-unlimited')).toBeVisible();
      const cap = p.getByRole('button', { name: 'Approve 100.00 USDC instead' });
      await expect(cap).toBeVisible();
      await cap.click();
      await approveAndWaitReceipt(p);

      const o = outcome('Approve unlimited USDC');
      await expect(o).toContainText(HASH, { timeout: 120_000 });
      await expect(o).toContainText('Confirmed', { timeout: 120_000 });
      await expect(o).toContainText('value = 100 USDC');
      const hash = ((await o.innerText()).match(HASH) as RegExpMatchArray)[0] as Hex;
      s.txs.approveCapped = txUrl(hash);
      expect(await txSucceeded(hash)).toBe(true);
      const allowance = await client.readContract({
        address: chainEnv.usdc,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [safe() as Address, DEMO_SPENDER],
      });
      expect(allowance).toBe(100_000_000n);
    });

    test('swap (test) — hash in DemoSwap when funded, else the honest block reaches DemoSwap as 4001', async () => {
      test.skip(!s.connected, 'not connected');
      const p = phone();
      const funded = (await usdcBalance(safe())) >= 1_000_000n;
      test.info().annotations.push({ type: 'funded', description: String(funded) });
      const before = await clickAction('Swap (test)', 'Swap 1 USDC (test)');
      const review = await settledReview(p, before);
      const o = outcome('Swap (test)');
      if (funded) {
        expect(review).toBe('ready');
        await approveAndWaitReceipt(p);
        await expect(o).toContainText(HASH, { timeout: 120_000 });
        await expect(o).toContainText('Confirmed', { timeout: 120_000 });
        const hash = ((await o.innerText()).match(HASH) as RegExpMatchArray)[0] as Hex;
        s.txs.swap = txUrl(hash);
        expect(await txSucceeded(hash)).toBe(true);
      } else {
        expect(review).toBe('blocked');
        await expect(o).toContainText('code 4001', { timeout: 60_000 });
        await expect(o).toContainText('Blocked by Keyline: This transaction would fail');
      }
    });

    test('sanctioned recipient — the phone shows the sanctions block and DemoSwap receives 4001', async () => {
      test.skip(!s.connected, 'not connected');
      const p = phone();
      // DemoSwap reads the sanctioned test address from the same bank (:4000) the wallet uses.
      await expect(card(demo(), 'Send to sanctioned recipient')).toContainText(
        `${SANCTIONED} (from the bank, GET /contacts)`,
        { timeout: 30_000 },
      );
      const decisionRes = p.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/policy/evaluate',
        { timeout: 90_000 },
      );
      const before = await clickAction('Send to sanctioned recipient', 'Send 1 USDC');
      const decision = await (await decisionRes).json().catch(() => null);
      console.info('sanctioned decision:', JSON.stringify(decision));
      test
        .info()
        .annotations.push({ type: 'decision', description: JSON.stringify(decision).slice(0, 1500) });
      expect(await settledReview(p, before)).toBe('blocked');
      const o = outcome('Send to sanctioned recipient');
      await expect(o).toContainText('code 4001', { timeout: 60_000 });
      await expect(o).toContainText('Blocked by Keyline');
      // Screening runs on every calldata counterparty before simulation, so the sanctions reason wins even with 0 USDC.
      await expect(p.getByText(SANCTIONS_REASON).first()).toBeVisible({ timeout: 30_000 });
      await expect(o).toContainText(SANCTIONS_REASON);
      test
        .info()
        .annotations.push({ type: 'demoswap-4001', description: (await o.innerText()).slice(0, 400) });
    });

    test('reload the phone → DemoSwap still under Connected apps → Disconnect → DemoSwap disconnected', async () => {
      test.skip(!s.connected, 'not connected');
      const p = phone();
      await need(s.phone, 'phone').goto('/dapps');
      await p.reload({ waitUntil: 'domcontentloaded' });
      const sessions = p.getByTestId('wc-sessions');
      await expect(sessions).toContainText('Connected apps', { timeout: 60_000 });
      const row = p.getByTestId('wc-session').filter({ hasText: 'DemoSwap' }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.click();
      await expect(p.getByTestId('wc-session-detail')).toBeVisible();
      await p.getByTestId('wc-disconnect').click();
      await p.getByTestId('wc-disconnect-yes').click();
      await expect(demo().getByRole('button', { name: 'Connect wallet' })).toBeVisible({ timeout: 60_000 });
      await expect(demo().getByText('Not connected')).toBeVisible();
      await expect(p.getByTestId('wc-session').filter({ hasText: 'DemoSwap' })).toHaveCount(0, {
        timeout: 30_000,
      });
      s.connected = false;
    });

    test('negative — the bank blocks a proposal whose Verify context is INVALID, isScam, or origin ≠ metadata url', async () => {
      // Real part: the bank's verdict for a proposal whose Verify context is INVALID / isScam / origin ≠ metadata url.
      const wallet = safe();
      const headers = { 'Content-Type': 'application/json', 'X-Device-Label': 'Lea · phone' };
      const cases = [
        {
          verify: { validation: 'INVALID', isScam: false, origin: 'https://demoswap.example' },
          url: 'https://demoswap.example',
        },
        {
          verify: { validation: 'VALID', isScam: true, origin: 'https://demoswap.example' },
          url: 'https://demoswap.example',
        },
        {
          verify: { validation: 'VALID', isScam: false, origin: 'https://evil.example' },
          url: 'https://demoswap.example',
        },
      ];
      for (const [i, c] of cases.entries()) {
        const res = await fetch(`${bankUrl()}/dapp-sessions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            topic: `e2eneg${Date.now()}x${i}`,
            walletAddress: wallet,
            name: 'Fake DemoSwap',
            url: c.url,
            icons: [],
            verify: c.verify,
          }),
        });
        const body = (await res.json()) as { verdict?: string; reasons?: string[]; message?: string };
        expect(res.status, JSON.stringify(body)).toBe(201);
        expect(body.verdict, JSON.stringify(c.verify)).toBe('block');
        expect(body.reasons ?? []).toContain("This app's identity could not be verified");
      }
    });

    test('negative — the wallet sheet for a refused identity: no Connect button, the dApp is rejected over the relay', async ({
      browser,
    }) => {
      // What is real: a fresh DemoSwap proposal over the Reown relay, the wallet's sheet, its rejectSession on the
      // relay, and the bank's own refusal record. What is substituted: the bank's verdict for THIS proposal. Reown
      // Verify attests DemoSwap's localhost origin as VALID, and rewriting DemoSwap's metadata url in its bundle did not
      // change the url the proposal carries (tried, see docs/DEMO.md) — so the phone's POST /dapp-sessions answer is
      // rewritten to the verdict the bank returns for INVALID/isScam/mismatch (proven by the previous test).
      const p = phone();
      await p.route(`${bankUrl()}/dapp-sessions`, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const response = await route.fetch();
        const body = (await response.json()) as {
          session: Record<string, unknown>;
          verdict: string;
          reasons: string[];
        };
        const reasons = ["This app's identity could not be verified"];
        await route.fulfill({
          response,
          json: {
            ...body,
            verdict: 'block',
            reasons,
            session: { ...body.session, verdict: 'block', reasons },
          },
        });
      });
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 960 },
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      try {
        const d = await ctx.newPage();
        await d.goto(DEMOSWAP);
        const { uri } = await copyWalletConnectUri(d);
        await pasteOnPhone(p, uri);
        const proposal = p.getByTestId('wc-proposal');
        await expect(proposal).toHaveAttribute('data-state', 'refused', { timeout: 60_000 });
        await expect(proposal).toContainText('This app’s identity could not be verified');
        await expect(proposal.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0);
        // The wallet rejected the proposal on the relay: DemoSwap never connects.
        await d.waitForTimeout(5_000);
        await expect(d.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
        await expect(d.getByText('Not connected')).toBeVisible();
        await closeSheet(proposal);
      } finally {
        await p.unroute(`${bankUrl()}/dapp-sessions`);
        await ctx.close();
      }
    });
  });
