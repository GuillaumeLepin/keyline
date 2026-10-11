// F4 — the attacker is refused (SPEC §3 F4, CLAUDE.md #6). Independent of story.spec.ts: it creates its own protected
// wallet (fixtures/onboard.ts), then:
//   Thief · stolen phone → Home shows no key → /recover (he has Lea's inbox, so the email code passes) → e-ID with his
//   own name → the bank's persona rules refuse → /refused. Desk: identity-refused with reasons → Override ("assume the
//   bank was fooled") → Swissquote confirms alone → status stays awaiting-guardians, waitingFor second-recoverer.
//   On-chain: nothing pending, owners unchanged. Lea's phone /alerts: "Recovery attempt refused".
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { recoveryStatus, safeOwners } from './chain';
import { createProtectedWallet, type ProtectedWallet } from './fixtures/onboard';
import {
  bankOperatorGet,
  openPersona,
  operatorToken,
  type PersonaSession,
  waitForRecovery,
  warmRoutes,
} from './fixtures/personas';
import { type RecoveryView, startRecoveryToIdentity, submitIdentity } from './fixtures/recover';

const SCREENS = resolve(import.meta.dirname, '../docs/screens');
const THIEF_NAME = 'Max Muster';

const state: {
  phone?: PersonaSession;
  laptop?: PersonaSession;
  thief?: PersonaSession;
  desk?: PersonaSession;
  wallet?: ProtectedWallet;
  recoveryId?: string;
  ownersBefore?: string[];
} = {};

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`${what} missing (earlier step failed)`);
  return v;
}
async function shot(session: PersonaSession, name: string): Promise<void> {
  mkdirSync(SCREENS, { recursive: true });
  await session.page.screenshot({ path: resolve(SCREENS, `attacker-${name}.png`) });
}

test.describe.configure({ mode: 'serial' });

test.describe('F4 Attacker refused — Swissquote cannot finish a recovery alone', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await warmRoutes();
    const videoDir = testInfo.outputPath('videos');
    state.phone = await openPersona(browser, 'lea-phone', { videoDir });
    state.laptop = await openPersona(browser, 'lea-laptop', { videoDir });
    // The stolen phone can enrol a *new* passkey (the thief's face); it has no credential for Lea's wallet.
    state.thief = await openPersona(browser, 'thief', { videoDir, withAuthenticator: true });
    state.desk = await openPersona(browser, 'desk', { videoDir, viewport: { width: 1440, height: 960 } });
  });

  test.afterAll(async () => {
    await Promise.all([state.phone, state.laptop, state.thief, state.desk].map((s) => s?.close()));
    console.info('\n== attacker result');
    console.info(
      JSON.stringify(
        { safe: state.wallet?.safe, recoveryId: state.recoveryId, protectTx: state.wallet?.protectTx },
        null,
        2,
      ),
    );
  });

  test('F4.0 Lea has a protected wallet (F1 compressed)', async () => {
    state.wallet = await createProtectedWallet(need(state.phone, 'phone'), need(state.laptop, 'laptop'));
    state.ownersBefore = await safeOwners(state.wallet.safe);
    console.info('attacker spec wallet:', state.wallet.safe, 'protect tx', state.wallet.protectTx);
  });

  test('F4.1 Thief · stolen phone: Home shows no key, no Send', async () => {
    const t = need(state.thief, 'thief');
    await t.goto('/');
    await expect(t.page.getByText('This device has no key for this wallet.')).toBeVisible();
    await expect(t.page.getByRole('link', { name: 'Send' })).toHaveCount(0);
    await shot(t, '01-thief-home');
  });

  test('F4.2 Thief: email code passes (he has the inbox), identity check fails → /refused', async () => {
    const t = need(state.thief, 'thief');
    const { recoveryId } = await startRecoveryToIdentity(t);
    state.recoveryId = recoveryId;
    await shot(t, '02-thief-identity');
    await submitIdentity(t, THIEF_NAME);
    await t.page.waitForURL(/\/refused/, { timeout: 60_000 });
    await expect(t.page.getByText('Recovery can’t start')).toBeVisible();
    await expect(t.page.getByText('The identity check failed. The owner has been notified.')).toBeVisible();
    await shot(t, '03-thief-refused');

    const r = await waitForRecovery<RecoveryView>(recoveryId, (x) => x.status === 'identity-refused');
    expect(r.reasons.length).toBeGreaterThan(0);
    console.info('refusal reasons:', r.reasons.join(' · '));
    const status = await recoveryStatus(need(state.wallet, 'wallet').safe);
    expect(status.pending).toBe(false);
    expect(status.approvals).toBe(0n);
  });

  test('F4.3 Lea · phone /alerts: "Recovery attempt refused"', async () => {
    const p = need(state.phone, 'phone');
    await p.goto('/alerts');
    await expect(p.page.getByText('Recovery attempt refused')).toBeVisible({ timeout: 30_000 });
    await expect(p.page.getByText(/device labelled “Thief · stolen phone”/)).toBeVisible();
    await shot(p, '04-lea-alert-refused');
  });

  test('F4.4 Desk: operator signs in, queue shows the refused request with its reasons', async () => {
    const d = need(state.desk, 'desk');
    const id = need(state.recoveryId, 'recoveryId');
    await d.goto('/desk');
    await d.page.getByRole('textbox', { name: 'Operator token' }).fill(operatorToken());
    await d.page.getByRole('button', { name: 'Sign in' }).click();
    await d.page.waitForURL(/\/desk\/queue/, { timeout: 90_000 }); // first visit compiles the route on next dev
    await d.page.getByRole('tab', { name: 'Refused' }).click();
    const row = d.page.locator('.kl-list a', { hasText: 'Thief · stolen phone' }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('Refused');
    await shot(d, '05-desk-queue-refused');
    await row.click();
    await d.page.waitForURL(new RegExp(`/desk/requests/${id}`), { timeout: 30_000 });
    await expect(d.page.getByText('Reasons', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(d.page.getByText('Name mismatch', { exact: true })).toBeVisible();
    await expect(d.page.getByText('Fail', { exact: true })).toBeVisible();
    await shot(d, '06-desk-request-refused');

    const queue = await bankOperatorGet<{ items: { recovery: RecoveryView }[] }>('/desk/queue');
    expect(queue.status).toBe(200);
    const item = queue.body.items.find((i) => i.recovery.id === id);
    expect(item?.recovery.status).toBe('identity-refused');
  });

  test('F4.5 Desk override: Swissquote confirms alone → still awaiting-guardians; nothing executed on-chain', async () => {
    const d = need(state.desk, 'desk');
    const id = need(state.recoveryId, 'recoveryId');
    await d.page.getByRole('button', { name: 'Override (demo: assume the bank was fooled)' }).click();
    await expect(d.page.getByText('Override the identity check?')).toBeVisible();
    await shot(d, '07-desk-override-sheet');
    await d.page.getByRole('dialog').getByRole('button', { name: 'Override', exact: true }).click();
    await expect(d.page.getByText('Swissquote confirmed. Status stays')).toBeVisible({ timeout: 120_000 });
    await expect(d.page.getByText('Waiting for a 2nd recoverer').first()).toBeVisible();
    await shot(d, '08-desk-override-stuck');

    const r = await waitForRecovery<RecoveryView>(id, (x) => x.status === 'awaiting-guardians');
    expect(r.waitingFor).toBe('second-recoverer');
    expect(r.guardianConfirmations.filter((c) => !c.void).map((c) => c.kind)).toEqual(['swissquote']);
    // The custody claim, verified: one institution's confirmation never moves the wallet.
    const safe = need(state.wallet, 'wallet').safe;
    const status = await recoveryStatus(safe);
    expect(status.pending).toBe(false);
    expect((await safeOwners(safe)).map((o) => o.toLowerCase())).toEqual(
      (state.ownersBefore ?? []).map((o) => o.toLowerCase()),
    );
    // Thief's screen: still "waiting for a second recoverer", with Swissquote's refusal history visible.
    const t = need(state.thief, 'thief');
    await t.goto('/recover');
    await expect(t.page.getByText('Waiting for a second recoverer')).toBeVisible({ timeout: 30_000 });
    await shot(t, '09-thief-waiting-forever');
  });
});
