// F4b — fraud while Lea still has her phone (SPEC §3 F4b): the bank is "fooled" (desk override) AND the thief has
// photographed the Emergency card → 2 of 3 → executed, waiting period running. Lea's phone gets the alert and cancels
// with a sponsored owner userOp (the Safe calls cancelRecovery on the module itself). On-chain: pending → false,
// owners unchanged. Independent wallet (fixtures/onboard.ts), like attacker.spec.ts.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Hex } from 'viem';
import { recoveryStatus, safeOwners, txHashFromUrl, txSucceeded, txUrl } from './chain';
import { createProtectedWallet, type ProtectedWallet } from './fixtures/onboard';
import {
  bodyText,
  openPersona,
  operatorToken,
  type PersonaSession,
  waitForRecovery,
} from './fixtures/personas';
import { type RecoveryView, startRecoveryToIdentity, submitIdentity } from './fixtures/recover';

const SCREENS = resolve(import.meta.dirname, '../docs/screens');

const state: {
  phone?: PersonaSession;
  laptop?: PersonaSession;
  thief?: PersonaSession;
  desk?: PersonaSession;
  wallet?: ProtectedWallet;
  recoveryId?: string;
  ownersBefore?: string[];
  txs: Record<string, string>;
} = { txs: {} };

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`${what} missing (earlier step failed)`);
  return v;
}
async function shot(session: PersonaSession, name: string): Promise<void> {
  mkdirSync(SCREENS, { recursive: true });
  await session.page.screenshot({ path: resolve(SCREENS, `fraud-${name}.png`) });
}

test.describe.configure({ mode: 'serial' });

test.describe('F4b Fraud while Lea still has her phone — the owner cancels an executed recovery', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const videoDir = testInfo.outputPath('videos');
    state.phone = await openPersona(browser, 'lea-phone', { videoDir });
    state.laptop = await openPersona(browser, 'lea-laptop', { videoDir });
    state.thief = await openPersona(browser, 'thief', { videoDir, withAuthenticator: true });
    state.desk = await openPersona(browser, 'desk', { videoDir, viewport: { width: 1440, height: 960 } });
  });

  test.afterAll(async () => {
    await Promise.all([state.phone, state.laptop, state.thief, state.desk].map((s) => s?.close()));
    console.info('\n== fraud-cancel result');
    console.info(
      JSON.stringify({ safe: state.wallet?.safe, recoveryId: state.recoveryId, ...state.txs }, null, 2),
    );
  });

  test('F4b.0 Lea has a protected wallet; the test keeps the Emergency card hex like a photo of the card', async () => {
    state.wallet = await createProtectedWallet(need(state.phone, 'phone'), need(state.laptop, 'laptop'));
    state.ownersBefore = await safeOwners(state.wallet.safe);
    expect(state.wallet.emergencyCardKey).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  test('F4b.1 Thief refused, desk overrides (the bank was fooled)', async () => {
    const t = need(state.thief, 'thief');
    const { recoveryId } = await startRecoveryToIdentity(t);
    state.recoveryId = recoveryId;
    await submitIdentity(t, 'Max Muster');
    await t.page.waitForURL(/\/refused/, { timeout: 60_000 });
    await waitForRecovery<RecoveryView>(recoveryId, (x) => x.status === 'identity-refused');

    const d = need(state.desk, 'desk');
    await d.goto('/desk');
    await d.page.getByRole('textbox', { name: 'Operator token' }).fill(operatorToken());
    await d.page.getByRole('button', { name: 'Sign in' }).click();
    await d.page.waitForURL(/\/desk\/queue/, { timeout: 30_000 });
    await d.goto(`/desk/requests/${recoveryId}`);
    await d.page.getByRole('button', { name: 'Override (demo: assume the bank was fooled)' }).click();
    await d.page.locator('.kl-sheet__panel').getByRole('button', { name: 'Override', exact: true }).click();
    await expect(d.page.getByText('Swissquote confirmed. Status stays')).toBeVisible({ timeout: 120_000 });
    const r = await waitForRecovery<RecoveryView>(recoveryId, (x) => x.status === 'awaiting-guardians');
    expect(r.waitingFor).toBe('second-recoverer');
    expect((await recoveryStatus(need(state.wallet, 'wallet').safe)).pending).toBe(false);
  });

  test('F4b.2 Thief pastes the Emergency card → 2 of 3 → executed, waiting period running on-chain', async () => {
    const t = need(state.thief, 'thief');
    const w = need(state.wallet, 'wallet');
    const id = need(state.recoveryId, 'recoveryId');
    await t.goto('/recover');
    await expect(t.page.getByText('Waiting for a second recoverer')).toBeVisible({ timeout: 30_000 });
    await t.page.getByRole('textbox', { name: 'Emergency card key' }).fill(w.emergencyCardKey);
    await shot(t, '01-thief-card-pasted');
    await t.page.getByRole('button', { name: 'Use Emergency card' }).click();
    const waiting = t.page.getByText(/Access restores at \d{2}:\d{2}/);
    const error = t.page.locator('.kl-error, .kl-field__error');
    await expect(waiting.or(error)).toBeVisible({ timeout: 240_000 });
    if (!(await waiting.isVisible()))
      throw new Error(`Emergency card confirm failed: ${await bodyText(t.page)}`);
    await shot(t, '02-thief-waiting-period');

    const r = await waitForRecovery<RecoveryView>(id, (x) => x.status === 'executed-waiting');
    if (r.onchain.executedTxHash) {
      state.txs.executeTx = txUrl(r.onchain.executedTxHash);
      expect(await txSucceeded(r.onchain.executedTxHash as Hex)).toBe(true);
    }
    const status = await recoveryStatus(w.safe);
    expect(status.pending).toBe(true);
    expect(status.newOwners?.map((o) => o.toLowerCase())).toEqual([
      r.newOwner.signerProxyAddress.toLowerCase(),
    ]);
  });

  test('F4b.3 Lea · phone /alerts → "Cancel recovery — it wasn’t me" (sponsored owner userOp) → cancelled on-chain', async () => {
    const p = need(state.phone, 'phone');
    const w = need(state.wallet, 'wallet');
    const id = need(state.recoveryId, 'recoveryId');
    await p.goto('/alerts');
    await expect(p.page.getByText('Recovery started from a new device')).toBeVisible({ timeout: 30_000 });
    await shot(p, '03-lea-alert-started');
    const started = Date.now();
    await p.page.getByRole('button', { name: 'Cancel recovery — it wasn’t me' }).click();
    const cancelled = p.page.getByText('Recovery cancelled. Your phone remains the only key.');
    const failed = p.page.locator('.kl-error');
    await expect(cancelled.or(failed)).toBeVisible({ timeout: 240_000 });
    if (await failed.isVisible()) throw new Error(`owner cancel failed: ${await bodyText(p.page)}`);
    console.info(`cancel confirmed in the UI after ${Math.round((Date.now() - started) / 1000)} s`);
    await shot(p, '04-lea-cancelled');
    const link = p.page.getByRole('link', { name: 'View on Basescan' }).last();
    const tx = txHashFromUrl(await link.getAttribute('href'));
    if (tx) {
      state.txs.cancelTx = txUrl(tx);
      expect(await txSucceeded(tx)).toBe(true);
    }

    const status = await recoveryStatus(w.safe);
    expect(status.pending).toBe(false);
    expect((await safeOwners(w.safe)).map((o) => o.toLowerCase())).toEqual(
      (state.ownersBefore ?? []).map((o) => o.toLowerCase()),
    );
    // The bank's finalizer notices the module has nothing pending and marks the request cancelled.
    const r = await waitForRecovery<RecoveryView>(
      id,
      (x) => x.status === 'cancelled' || x.status === 'finalized',
      {
        timeoutMs: 120_000,
        label: 'cancelled',
      },
    );
    expect(r.status).toBe('cancelled');
    // The fraudster's screen says so.
    const t = need(state.thief, 'thief');
    await expect(t.page.getByText('Recovery cancelled by the owner.')).toBeVisible({ timeout: 60_000 });
    await shot(t, '05-thief-cancelled');
  });
});
