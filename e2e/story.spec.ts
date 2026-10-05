// The Keyline story, end to end, against a live stack and Base Sepolia:
//   F1 create wallet (phone) → pair the Safety key (laptop) → Emergency card → mode → PROTECT (real sponsored
//   userOp) → prove ownership (ERC-1271) → top up → F2 send (real sponsored USDC transfer)
//   F3 lose the phone & recover and F4 attacker refused are `test.fixme` until Wave 2/3 ship their screens.
//
// Every "it worked" is checked on-chain (e2e/chain.ts), not only on UI copy. Serial: later tests reuse the wallet
// the first test created. Run: `pnpm e2e` (defaults: wallet :3000, bank :4000) or with E2E_WALLET_URL/E2E_BANK_URL.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Address, Hex } from 'viem';
import { getAddress, parseUnits } from 'viem';
import {
  addressUrl,
  chainEnv,
  formatUsdc,
  guardianSet,
  hasCode,
  recoveryStatus,
  txHashFromUrl,
  txSucceeded,
  txUrl,
  usdcBalance,
} from './chain';
import { bankGet, bodyText, openPersona, type PersonaSession, readLocalWallet } from './fixtures/personas';

const SCREENS = resolve(import.meta.dirname, '../docs/screens');
const PROTECT_TIMEOUT = 240_000; // bundler inclusion + 2 confirmations; usually 20–60 s on Base Sepolia
const TOPUP_CHF = 8; // = 10 USDC at the static CHF 0.80 rate
const SEND_CHF = 2; // = 2.50 USDC to Lukas Meier

interface Story {
  phone: PersonaSession;
  laptop: PersonaSession;
  safe: Address;
  safetyKey?: Address;
  emergencyCard?: Address;
  swissquote?: Address;
  protectTx?: Hex;
  attested: boolean;
  funderHasUsdc: boolean;
  balanceBeforeSend?: bigint;
  transferTx?: Hex;
  txs: Record<string, string>;
}

const story: Partial<Story> & { txs: Record<string, string>; attested: boolean; funderHasUsdc: boolean } = {
  txs: {},
  attested: false,
  funderHasUsdc: false,
};

async function shot(session: PersonaSession, name: string): Promise<void> {
  mkdirSync(SCREENS, { recursive: true });
  await session.page.screenshot({ path: resolve(SCREENS, `story-${name}.png`) });
}

function phone(): PersonaSession {
  if (!story.phone) throw new Error('phone persona not open');
  return story.phone;
}
function laptop(): PersonaSession {
  if (!story.laptop) throw new Error('laptop persona not open');
  return story.laptop;
}
function safe(): Address {
  if (!story.safe) throw new Error('wallet not created yet (earlier step failed)');
  return story.safe;
}

test.describe.configure({ mode: 'serial' });

test.describe('Keyline story — Wave 1 scope (F1 create + protect + prove, top-up, F2 send)', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const videoDir = testInfo.outputPath('videos');
    story.phone = await openPersona(browser, 'lea-phone', { videoDir });
    story.laptop = await openPersona(browser, 'lea-laptop', { videoDir });
  });

  test.afterAll(async () => {
    const pageErrors = [...(story.phone?.errors ?? []), ...(story.laptop?.errors ?? [])].filter((e) =>
      e.startsWith('[pageerror'),
    );
    await story.phone?.close();
    await story.laptop?.close();
    console.info('\n== story result');
    console.info(
      JSON.stringify({ safe: story.safe, ...story.txs, funderHasUsdc: story.funderHasUsdc }, null, 2),
    );
    expect(pageErrors, 'no uncaught page errors in any persona').toEqual([]);
  });

  test('F1.1 Lea · phone creates her Keyline (passkey → counterfactual Safe)', async () => {
    const p = phone();
    await p.goto('/onboarding');
    await expect(p.page.getByText('Lea · phone').first()).toBeVisible();
    await shot(p, '01-onboarding-create');
    await p.page.getByRole('button', { name: 'Create with Face ID / fingerprint' }).click();
    await expect(p.page.getByText('Step 2 of 6')).toBeVisible({ timeout: 30_000 });

    const local = await readLocalWallet(p.page);
    expect(local, 'the phone stored its wallet profile').not.toBeNull();
    if (!local) return;
    story.safe = getAddress(local.address);
    expect(local.status).toBe('pending');
    expect(local.credentialId.length).toBeGreaterThan(10);
    // A counterfactual Safe: an address, no code yet.
    expect(await hasCode(story.safe)).toBe(false);
    console.info('Safe (counterfactual):', addressUrl(story.safe));
  });

  test('F1.2 Lea · laptop pairs as the Safety key with the 6-digit code', async () => {
    const p = phone();
    const l = laptop();
    await expect(p.page.locator('.kl-pairing-code')).toBeVisible();
    const code = (await p.page.locator('.kl-pairing-code').innerText()).replace(/\s/g, '');
    expect(code).toMatch(/^\d{6}$/);
    await shot(p, '02-onboarding-pairing-code');

    await l.goto('/pair');
    await l.page.getByLabel('6-digit code').fill(code);
    await l.page.getByRole('button', { name: 'Pair' }).click();
    await expect(l.page.getByText('Paired. This laptop now holds')).toBeVisible({ timeout: 20_000 });
    await shot(l, '02-laptop-paired');

    // The phone polls the pairing every 2 s and enables Continue once the laptop claimed it.
    const next = p.page.locator('button.kl-btn--primary:not([disabled])', { hasText: 'Continue' });
    await expect(next).toBeVisible({ timeout: 15_000 });
    await shot(p, '02-onboarding-paired');

    const guardians = await bankGet<{ guardians: { kind: string; address: string }[] }>(
      `/wallets/${safe()}/guardians`,
    );
    expect(guardians.status).toBe(200);
    const sk = guardians.body.guardians.find((g) => g.kind === 'safety-key');
    expect(sk, 'bank registered the Safety key').toBeDefined();
    if (sk) story.safetyKey = getAddress(sk.address);
    await next.click();
    await expect(p.page.getByText('Step 3 of 6')).toBeVisible({ timeout: 10_000 });
  });

  test('F1.3 Emergency card shown once, confirmed, registered as recoverer', async () => {
    const p = phone();
    await expect(p.page.getByText('KEYLINE EMERGENCY CARD')).toBeVisible();
    await expect(p.page.getByText('This card cannot spend your money')).toBeVisible();
    await shot(p, '03-onboarding-emergency-card');
    await p.page.getByRole('button', { name: 'I stored it' }).click();
    await expect(p.page.getByText('Have you really stored it?')).toBeVisible();
    await shot(p, '03-onboarding-emergency-card-confirm');
    await p.page.getByRole('button', { name: 'Yes, I stored it' }).click();
    await expect(p.page.getByText('Step 4 of 6')).toBeVisible({ timeout: 20_000 });

    const local = await readLocalWallet(p.page);
    expect(local?.guardians.emergencyCard, 'card address kept locally (public), key dropped').toBeTruthy();
    if (local?.guardians.emergencyCard) story.emergencyCard = getAddress(local.guardians.emergencyCard);
    const guardians = await bankGet<{ guardians: { kind: string; address: string }[] }>(
      `/wallets/${safe()}/guardians`,
    );
    expect(guardians.body.guardians.some((g) => g.kind === 'emergency-card')).toBe(true);
  });

  test('F1.4 Recovery mode: Default (Assisted greyed out, SIMULATED partner)', async () => {
    const p = phone();
    await expect(p.page.getByText('Default — recommended')).toBeVisible();
    await expect(p.page.getByText('Not in this prototype')).toBeVisible();
    await shot(p, '04-onboarding-mode');
    await p.page.getByRole('button', { name: 'Continue' }).click();
    await expect(p.page.getByText('Step 5 of 6')).toBeVisible({ timeout: 20_000 });
  });

  test('F1.5 Protect my wallet — one sponsored userOp deploys the Safe with 3 recoverers / threshold 2 (on-chain)', async () => {
    const p = phone();
    await expect(p.page.getByText('One signature sets everything up')).toBeVisible();
    await shot(p, '05-onboarding-protect');
    const started = Date.now();
    await p.page.getByRole('button', { name: 'Protect my wallet' }).click();

    const protectedTitle = p.page.getByText('Your phone key signs.');
    const failed = p.page.locator('.kl-error');
    await expect(protectedTitle.or(failed)).toBeVisible({ timeout: PROTECT_TIMEOUT });
    if (await failed.isVisible()) {
      await shot(p, '05-onboarding-protect-error');
      throw new Error(`protect failed: ${await bodyText(p.page)}`);
    }
    console.info(`protect confirmed in the UI after ${Math.round((Date.now() - started) / 1000)} s`);
    await shot(p, '05-onboarding-protected');

    const link = p.page.getByRole('link', { name: 'View on Basescan' });
    await expect(link).toBeVisible();
    const tx = txHashFromUrl(await link.getAttribute('href'));
    expect(tx, 'Basescan link carries the protect tx hash').not.toBeNull();
    if (tx) {
      story.protectTx = tx;
      story.txs.protectTx = txUrl(tx);
      expect(await txSucceeded(tx)).toBe(true);
    }

    // On-chain truth, SPEC F1.5 / CLAUDE.md #6: Safe deployed, {Safety key, Emergency card, Swissquote}, threshold 2.
    expect(await hasCode(safe()), 'Safe has code').toBe(true);
    const local = await readLocalWallet(p.page);
    expect(local?.status).toBe('deployed');
    story.swissquote = local?.guardians.swissquote
      ? getAddress(local.guardians.swissquote)
      : chainEnv.sqGuardian;
    const expected = [story.safetyKey, story.emergencyCard, story.swissquote].filter(
      (a): a is Address => a !== undefined,
    );
    expect(expected, 'the three recoverer addresses are known').toHaveLength(3);
    const set = await guardianSet(safe(), expected);
    console.info('on-chain guardians', set);
    expect(set.threshold).toBe(2n);
    expect(set.guardians).toHaveLength(3);
    expect(set.missing).toEqual([]);
    if (chainEnv.sqGuardian)
      expect(set.guardians.map((g) => g.toLowerCase())).toContain(chainEnv.sqGuardian.toLowerCase());
    const status = await recoveryStatus(safe());
    expect(status.pending).toBe(false);

    await p.page.getByRole('button', { name: 'Continue' }).click();
    await expect(p.page.getByText('Step 6 of 6')).toBeVisible({ timeout: 10_000 });
  });

  test('F1.6 Prove ownership to Swissquote — ERC-1271 attestation verified by the bank', async () => {
    const p = phone();
    await expect(p.page.getByText('One more signature, no screenshots')).toBeVisible();
    await shot(p, '06-onboarding-prove');
    await p.page.getByRole('button', { name: 'Sign the proof' }).click();
    await expect(p.page.getByText('Ownership proven')).toBeVisible({ timeout: 60_000 });
    await shot(p, '06-onboarding-proven');

    const attestation = await bankGet<{ walletAddress: string; method: string; verifiedAt: string }>(
      `/attestations/${safe()}`,
    );
    expect(attestation.status).toBe(200);
    expect(attestation.body.method).toBe('erc1271');
    expect(attestation.body.walletAddress.toLowerCase()).toBe(safe().toLowerCase());
    story.attested = true;

    await p.page.getByRole('button', { name: 'Go to my wallet' }).click();
    await p.page.waitForURL(/\/(\?.*)?$/, { timeout: 10_000 });
    await expect(p.page.getByText('Protected · 2 of 3 recoverers')).toBeVisible({ timeout: 15_000 });
    await shot(p, '07-home-protected');
  });

  test('F1.7 Top up from my Swissquote account (real USDC from the bank funder, or an honest 502)', async () => {
    const p = phone();
    const before = await usdcBalance(safe());
    await p.page.getByRole('button', { name: 'Top up', exact: true }).click();
    const sheet = p.page.locator('.kl-sheet__panel');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Accepted instantly: this wallet is verified as yours.')).toBeVisible();
    await shot(p, '08-home-topup-sheet');
    await sheet.locator('.kl-amount__input').fill(String(TOPUP_CHF));
    await sheet.getByRole('button', { name: 'Top up', exact: true }).click();

    const error = sheet.locator('.kl-error');
    const row = p.page.getByText('Top up from Swissquote', { exact: true });
    await expect(error.or(row)).toBeVisible({ timeout: 90_000 });

    if (await error.isVisible()) {
      // The bank refuses with 502 and the real funder balance — never a fake hash (docs/MOCKS.md).
      await expect(error).toContainText('Something didn’t work');
      await error.getByText('Technical details').click();
      const detail = await error.locator('pre.kl-code').innerText();
      console.info('top-up refused:', detail.replace(/\s+/g, ' '));
      expect(detail).toMatch(/502/);
      await shot(p, '08-home-topup-error-funder-empty');
      story.funderHasUsdc = !/holds 0(\.0+)? USDC/.test(detail);
      // Close the sheet so Send is clickable (the sheet backdrop intercepts pointer events otherwise).
      await sheet.locator('.kl-sheet__head button[aria-label="Close"]').click();
      await expect(sheet).toBeHidden();
      test.skip(!story.funderHasUsdc, 'funder has no USDC — top-up legitimately refused with 502');
      return;
    }

    story.funderHasUsdc = true;
    await expect(row).toBeVisible();
    const after = await expect
      .poll(async () => usdcBalance(safe()), { timeout: 60_000, message: 'USDC balance reflects the top-up' })
      .toBeGreaterThan(before)
      .then(() => usdcBalance(safe()));
    const expectedDelta = parseUnits((TOPUP_CHF / 0.8).toFixed(6), 6);
    expect(after - before).toBe(expectedDelta);
    console.info(`top-up: ${formatUsdc(before)} → ${formatUsdc(after)} USDC`);
    await shot(p, '08-home-topped-up');
  });

  test('F2 Send 2.50 USDC to Lukas Meier — policy approve → sponsor → passkey signs → confirmed on-chain', async () => {
    test.skip(!story.funderHasUsdc, 'funder has no USDC — the wallet holds nothing to send');
    const p = phone();
    const before = await usdcBalance(safe());
    const amountUsdc = parseUnits((SEND_CHF / 0.8).toFixed(6), 6);
    expect(before >= amountUsdc, 'wallet holds enough USDC').toBe(true);

    await p.page.getByRole('link', { name: 'Send' }).click();
    await p.page.waitForURL(/\/send$/, { timeout: 10_000 });
    await p.page.getByText('Lukas Meier').first().click();
    await p.page.locator('.kl-amount__input').fill(String(SEND_CHF));
    await shot(p, '09-send');
    await p.page.getByRole('button', { name: 'Review' }).click();
    await p.page.waitForURL(/\/send\/review$/, { timeout: 10_000 });
    await expect(p.page.getByText('Approved', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(p.page.getByText('Paid by Swissquote').first()).toBeVisible();
    await shot(p, '09-send-review');

    await p.page.getByRole('button', { name: 'Confirm with Face ID' }).click();
    await p.page.waitForURL(/\/activity\/0x[0-9a-fA-F]{64}$/, { timeout: 120_000 });
    const confirmed = p.page.getByText('Confirmed', { exact: true });
    const failed = p.page.getByText('Not accepted by the network');
    await expect(confirmed.or(failed)).toBeVisible({ timeout: 180_000 });
    if (await failed.isVisible()) throw new Error(`transfer failed: ${await bodyText(p.page)}`);
    await shot(p, '10-activity-confirmed');

    const link = p.page.getByRole('link', { name: 'View on Basescan' });
    const tx = txHashFromUrl(await link.getAttribute('href'));
    expect(tx).not.toBeNull();
    if (tx) {
      story.transferTx = tx;
      story.txs.transferTx = txUrl(tx);
      expect(await txSucceeded(tx)).toBe(true);
    }
    const after = await usdcBalance(safe());
    expect(before - after).toBe(amountUsdc);
    console.info(`transfer: ${formatUsdc(before)} → ${formatUsdc(after)} USDC`);

    await p.page.getByRole('button', { name: 'Done' }).click();
    await p.page.waitForURL(/\/(\?.*)?$/, { timeout: 10_000 });
    await expect(p.page.getByText('Lukas Meier')).toBeVisible();
    await shot(p, '10-home-after-send');
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Wave 2/3 — exact SPEC §3 steps, enabled when the screens exist. "Losing the phone" = phone.loseDevice().
  // ---------------------------------------------------------------------------------------------------------------

  test.fixme('F3 Lose the phone & recover (Lea · new phone + Lea · laptop)', async () => {
    // 1. phone.loseDevice() (WebAuthn.removeVirtualAuthenticator) — the old passkey is gone for good.
    //    newPhone = openPersona('lea-new-phone') → /recover → "I lost my phone" → email code from /mock/inbox
    //    (SIMULATED) → swiyu e-ID form with "Lea Keller" (SIMULATED, persona rules SPEC §7) → create the new passkey
    //    → chain.deploySignerProxy → POST /recoveries → status identity-pending → awaiting-guardians once `pass`.
    // 2. Bank signs IdentityVerdict → sq-guardian validates (signature, mode, 24-h rule, guardian set from chain) →
    //    returns its ExecuteRecovery signature (Option A, DECISIONS #15) → confirmation 1 shown with the tx hash.
    //    Assert: recoveryStatus(safe).approvals === 1n after the relayer submits it alone (execute=false).
    // 3. laptop: /approve shows "Restore access on a new phone? Requested … from Zürich." → "Confirm with Safety key"
    //    → Safety key signs the module's EIP-712 hash → POST /recoveries/:id/confirm → relayer multiConfirmRecovery
    //    (execute=true). Assert on-chain: recoveryStatus(safe).pending === true, newOwners = [new proxy],
    //    executeAfter ≈ now + gracePeriodSeconds() (180 s).
    // 4. New phone: countdown ring shows the exact `executeAfter` read from chain + caption "Waiting period
    //    accelerated for the demo: 3 min instead of 72 h". Desk (/desk) shows states + audit log.
    // 5. After executeAfter (poll the chain head): sq-guardian finalizeRecovery → safeOwners(safe) = [new proxy],
    //    recoveryStatus(safe).pending === false → "Welcome back, Lea" → F2 transfer from the new phone proves control
    //    (balance delta on-chain).
  });

  test.fixme('F4 Attacker refused (Thief · stolen phone) — Swissquote cannot finish a recovery alone', async () => {
    // 1. thief = openPersona('thief') → / shows "This device has no key for this wallet." — no Send button.
    // 2. thief → /recover → email code passes (he has the inbox) → identity check fails (deviceLabel contains
    //    "thief", SPEC §7) → /refused: "Recovery can't start: the identity check failed. The owner has been notified."
    //    Desk: identity-refused with reasons. Lea's devices (/alerts): "Recovery attempt refused."
    //    Assert on-chain: recoveryStatus(safe).approvals === 0n, pending === false.
    // 3. Desk "Override (demo: assume the bank was fooled)" → sq-guardian confirms alone → status stays
    //    awaiting-guardians ("Waiting for a second recoverer — Swissquote cannot finish this alone").
    //    Assert on-chain: approvals === 1n, pending === false, safeOwners unchanged — the custody claim, verified.
  });

  test.fixme('F4b Fraud while Lea still has her phone — owner cancels the executed recovery', async () => {
    // Override + pasted Emergency card key → 2 of 3 → executed (pending === true) → Lea · phone /alerts
    // "Recovery started from a new device — wasn't you?" → "Cancel recovery — it wasn't me" (sponsored owner userOp,
    // buildCancelRecoveryUserOp) → recoveryStatus(safe).pending === false, owners unchanged; fraudster sees
    // "Recovery cancelled by the owner."
  });
});
