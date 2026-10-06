// F1 in one call, for the specs that need a protected wallet before their own story starts (attacker, fraud-cancel).
// Same selectors as story.spec.ts F1.1–F1.5; no screenshots, on-chain checks kept to the essentials.
import { expect } from '@playwright/test';
import { type Address, getAddress, type Hex } from 'viem';
import { guardianSet, hasCode, txHashFromUrl } from '../chain';
import { bankGet, bodyText, type PersonaSession, readLocalWallet } from './personas';

export interface ProtectedWallet {
  safe: Address;
  safetyKey: Address;
  emergencyCard: Address;
  /** The card's private key as shown once on the phone — the test keeps it like Lea's drawer does (F4b). */
  emergencyCardKey: Hex;
  swissquote: Address;
  protectTx: Hex | null;
}

const PROTECT_TIMEOUT = 240_000;

/** Scrape the card hex from the Emergency card (groups of 4 in `.kl-ecard__hex`). */
export async function readEmergencyCardKey(phone: PersonaSession): Promise<Hex> {
  const text = await phone.page.locator('.kl-ecard__hex').innerText();
  const hex = text.replace(/[^0-9a-fA-F]/g, '');
  const key = hex.slice(-64);
  if (key.length !== 64) throw new Error(`Emergency card hex not readable (${hex.length} hex chars)`);
  return `0x${key}` as Hex;
}

export async function createProtectedWallet(
  phone: PersonaSession,
  laptop: PersonaSession,
): Promise<ProtectedWallet> {
  await phone.goto('/onboarding');
  await phone.page.getByRole('button', { name: 'Create with Face ID / fingerprint' }).click();
  await expect(phone.page.getByText('Step 2 of 6')).toBeVisible({ timeout: 30_000 });
  const local = await readLocalWallet(phone.page);
  if (!local) throw new Error('phone stored no wallet profile');
  const safe = getAddress(local.address);

  // Pair the Safety key.
  const code = (await phone.page.locator('.kl-pairing-code').innerText()).replace(/\s/g, '');
  await laptop.goto('/pair');
  await laptop.page.getByLabel('6-digit code').fill(code);
  await laptop.page.getByRole('button', { name: 'Pair' }).click();
  await expect(laptop.page.getByText('Paired. This laptop now holds')).toBeVisible({ timeout: 20_000 });
  const next = phone.page.locator('button.kl-btn--primary:not([disabled])', { hasText: 'Continue' });
  await expect(next).toBeVisible({ timeout: 15_000 });
  await next.click();
  await expect(phone.page.getByText('Step 3 of 6')).toBeVisible({ timeout: 10_000 });

  // Emergency card — read the hex once, like Lea writing it down.
  await expect(phone.page.getByText('KEYLINE EMERGENCY CARD')).toBeVisible();
  const emergencyCardKey = await readEmergencyCardKey(phone);
  await phone.page.getByRole('button', { name: 'I stored it' }).click();
  await phone.page.getByRole('button', { name: 'Yes, I stored it' }).click();
  await expect(phone.page.getByText('Step 4 of 6')).toBeVisible({ timeout: 20_000 });
  await phone.page.getByRole('button', { name: 'Continue' }).click();
  await expect(phone.page.getByText('Step 5 of 6')).toBeVisible({ timeout: 20_000 });

  // Protect.
  await phone.page.getByRole('button', { name: 'Protect my wallet' }).click();
  const done = phone.page.getByText('Your phone key signs.');
  const failed = phone.page.locator('.kl-error');
  await expect(done.or(failed)).toBeVisible({ timeout: PROTECT_TIMEOUT });
  if (await failed.isVisible()) throw new Error(`protect failed: ${await bodyText(phone.page)}`);
  const protectTx = txHashFromUrl(
    await phone.page.getByRole('link', { name: 'View on Basescan' }).getAttribute('href'),
  );
  expect(await hasCode(safe)).toBe(true);

  const guardians = await bankGet<{ guardians: { kind: string; address: string }[] }>(
    `/wallets/${safe}/guardians`,
  );
  const byKind = (kind: string) => {
    const g = guardians.body.guardians.find((x) => x.kind === kind);
    if (!g) throw new Error(`bank has no ${kind} recoverer for ${safe}`);
    return getAddress(g.address);
  };
  const after = await readLocalWallet(phone.page);
  const wallet: ProtectedWallet = {
    safe,
    safetyKey: byKind('safety-key'),
    emergencyCard: byKind('emergency-card'),
    emergencyCardKey,
    swissquote: after?.guardians.swissquote ? getAddress(after.guardians.swissquote) : byKind('swissquote'),
    protectTx,
  };
  const set = await guardianSet(safe, [wallet.safetyKey, wallet.emergencyCard, wallet.swissquote]);
  expect(
    set.ok,
    `on-chain guardian set ${set.guardians.join(',')} threshold ${set.threshold} missing ${set.missing.join(',')}`,
  ).toBe(true);

  // Step 6 (ownership proof) → Home, so the phone is a normal protected wallet.
  await phone.page.getByRole('button', { name: 'Continue' }).click();
  await expect(phone.page.getByText('Step 6 of 6')).toBeVisible({ timeout: 10_000 });
  await phone.page.getByRole('button', { name: 'Sign the proof' }).click();
  await expect(phone.page.getByText('Ownership proven')).toBeVisible({ timeout: 60_000 });
  await phone.page.getByRole('button', { name: 'Go to my wallet' }).click();
  await phone.page.waitForURL(/\/(\?.*)?$/, { timeout: 10_000 });
  return wallet;
}
