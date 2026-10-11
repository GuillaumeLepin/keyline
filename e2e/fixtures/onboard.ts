// F0 + F1 v2 (SPEC §10) in reusable steps: Lea · laptop signs in to Swissquote web and opens the Keyline tile →
// Lea · phone claims the 6-digit code on /start → "Hi Lea" → phone key → the laptop confirms the Safety key on its
// Swissquote page → Emergency card → mode → Protect (ring 3 of 3) → proof → "Move your first funds" → Home.
// `createProtectedWallet` runs it in one call for attacker/fraud-cancel; story.spec.ts calls the steps one by one.
import { expect, type Page, test } from '@playwright/test';
import { type Address, getAddress, type Hex } from 'viem';
import { guardianSet, hasCode, txHashFromUrl } from '../chain';
import { bankGet, bankUrl, bodyText, type PersonaSession, readLocalWallet } from './personas';

export interface ProtectedWallet {
  safe: Address;
  safetyKey: Address;
  emergencyCard: Address;
  /** The card's private key as shown once on the phone — the test keeps it like Lea's drawer does (F4b). */
  emergencyCardKey: Hex;
  swissquote: Address;
  protectTx: Hex | null;
}

export const PROTECT_TIMEOUT = 240_000;

/** Scrape the card hex from the Emergency card (groups of 4 in `.kl-ecard__hex`). */
export async function readEmergencyCardKey(phone: PersonaSession): Promise<Hex> {
  const text = await phone.page.locator('.kl-ecard__hex').innerText();
  const hex = text.replace(/[^0-9a-fA-F]/g, '');
  const key = hex.slice(-64);
  if (key.length !== 64) throw new Error(`Emergency card hex not readable (${hex.length} hex chars)`);
  return `0x${key}` as Hex;
}

/** F0.1 — `/swissquote`, Lea pre-filled, one click → `/swissquote/portfolio` with the positions table. */
export async function signInToSwissquote(laptop: PersonaSession): Promise<void> {
  await laptop.goto('/swissquote');
  await expect(laptop.page.getByRole('heading', { name: 'Sign in to Swissquote' })).toBeVisible({
    timeout: 60_000,
  });
  await laptop.page.getByTestId('sq-sign-in').click();
  await laptop.page.waitForURL(/\/swissquote\/portfolio/, { timeout: 60_000 });
  await expect(laptop.page.getByTestId('positions')).toBeVisible({ timeout: 30_000 });
  await expect(laptop.page.getByTestId('keyline-tile')).toBeVisible({ timeout: 30_000 });
}

/**
 * F0.3 — the Keyline tile → `POST /handoff` → the 6-digit code (read from the response and checked on screen).
 *
 * Known app limitation (reported, not fixed here): the tile reads Lea's *newest* wallet from the bank; once she has a
 * protected Keyline (an earlier spec in the same run, or `demo:predeploy`), it shows "Protected · 2 of 3" and offers
 * no "Set up Keyline on my phone". Then — and only then — the code is opened with the laptop's own web session
 * through the same endpoint the tile calls, and the test is annotated `handoff-via-api`.
 */
export async function openHandoff(laptop: PersonaSession): Promise<string> {
  const tile = laptop.page.getByTestId('keyline-tile');
  const start = tile.getByRole('button', { name: 'Set up Keyline on my phone' });
  // The tile follows the bank's `GET /sq/safety-key-request` (Lea's newest wallet): ask the same question first.
  const existing = await laptopSafetyKeyRequest(laptop);
  if (existing.walletAddress) {
    await expect(tile).toHaveAttribute('data-state', /protected|claimed/, { timeout: 30_000 });
    const state = await tile.getAttribute('data-state');
    await expect(start).toHaveCount(0);
    console.warn(
      `keyline tile is "${state}" (Lea already has Keyline ${existing.walletAddress}) — opening the handoff via POST /handoff`,
    );
    test.info().annotations.push({
      type: 'handoff-via-api',
      description: `tile "${state}" for ${existing.walletAddress}: no "Set up Keyline on my phone" once the client has a wallet`,
    });
    const res = await laptop.context.request.post(`${bankUrl()}/handoff`, { data: {} });
    expect(res.status(), 'POST /handoff with the web session').toBeLessThan(300);
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^\d{6}$/);
    return code;
  }
  const response = laptop.page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/handoff',
    { timeout: 30_000 },
  );
  // Once Lea already holds a protected Keyline (an earlier spec in the same run) the tile shows "Protected" and
  // offers "Set up Keyline on another phone" instead — the same POST /handoff.
  const another = tile.getByRole('button', { name: 'Set up Keyline on another phone' });
  await expect(start.or(another)).toBeVisible({ timeout: 30_000 });
  if (await start.isVisible()) await start.click();
  else {
    test
      .info()
      .annotations.push({ type: 'handoff-another-phone', description: 'tile Protected → "another phone"' });
    await another.click();
  }
  const res = await response;
  expect(res.status(), 'POST /handoff').toBeLessThan(300);
  const { code } = (await res.json()) as { code: string };
  expect(code).toMatch(/^\d{6}$/);
  await expect(tile).toHaveAttribute('data-state', 'waiting', { timeout: 15_000 });
  const shown = (await tile.locator('.kl2-code6 [aria-hidden="true"]').allInnerTexts())
    .join('')
    .replace(/\s/g, '');
  expect(shown, 'the tile shows the same code').toBe(code);
  return code;
}

/** F1 · `/start` → type the code → claim → onboarding "Hi Lea" → continue to the phone key. */
export async function claimOnPhone(phone: PersonaSession, code: string): Promise<void> {
  await phone.goto('/start');
  await expect(phone.page.getByRole('heading', { name: 'Continue on your phone' })).toBeVisible({
    timeout: 60_000,
  });
  await phone.page.getByTestId('start-code').fill(code);
  await phone.page.getByTestId('start-continue').click();
  await phone.page.waitForURL(/\/onboarding/, { timeout: 60_000 });
  await expect(phone.page.getByTestId('hi-title')).toHaveText('Hi Lea', { timeout: 30_000 });
}

/** "Hi Lea" → Continue → "A key that stays on this phone" → passkey → step 2 (Safety key). Returns the Safe. */
export async function createPhoneKey(phone: PersonaSession): Promise<Address> {
  await phone.page.getByTestId('hi-continue').click();
  await expect(phone.page.getByRole('heading', { name: 'A key that stays on this phone' })).toBeVisible();
  await phone.page.getByTestId('create-key').click();
  await expect(phone.page.getByText('Step 2 of 6')).toBeVisible({ timeout: 60_000 });
  const local = await readLocalWallet(phone.page);
  if (!local) throw new Error('phone stored no wallet profile');
  return getAddress(local.address);
}

interface SafetyKeyRequestView {
  walletAddress: string | null;
  status: 'none' | 'waiting' | 'done';
  safetyKeyAddress?: string;
}

/** The laptop's own view of `GET /sq/safety-key-request` (its `sq_web` cookie, shared with the page). */
export async function laptopSafetyKeyRequest(laptop: PersonaSession): Promise<SafetyKeyRequestView> {
  const res = await laptop.context.request.get(`${bankUrl()}/sq/safety-key-request`);
  expect(res.status(), 'GET /sq/safety-key-request with the web session').toBe(200);
  return (await res.json()) as SafetyKeyRequestView;
}

/**
 * F0.5 — the laptop's Swissquote page shows "Make this computer your Safety key?" for exactly this Safe; confirm →
 * key in the laptop profile's IndexedDB → `POST /sq/safety-key`. The phone's step 2 turns "Confirmed on your laptop".
 */
export async function confirmSafetyKeyOnLaptop(
  laptop: PersonaSession,
  phone: PersonaSession,
  safe: Address,
  onPrompt?: () => Promise<void>,
): Promise<Address> {
  // Never confirm for another (older, pending) wallet of Lea's: wait until the bank asks for *this* Safe.
  await expect
    .poll(
      async () => {
        const r = await laptopSafetyKeyRequest(laptop);
        return `${r.status}:${(r.walletAddress ?? '').toLowerCase()}`;
      },
      { timeout: 30_000, message: 'bank asks the laptop for a Safety key for this Safe' },
    )
    .toBe(`waiting:${safe.toLowerCase()}`);
  await expect(phone.page.getByTestId('safety-key-waiting')).toBeVisible();
  const prompt = laptop.page.getByTestId('safety-key-prompt');
  await expect(prompt).toHaveAttribute('data-state', 'ask', { timeout: 30_000 });
  await expect(prompt.getByText('Make this computer your Safety key?')).toBeVisible();
  if (onPrompt) await onPrompt();
  await prompt.getByRole('button', { name: 'Make this computer my Safety key' }).click();
  await expect(prompt).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(prompt.getByText('This computer is your Safety key')).toBeVisible();
  const after = await laptopSafetyKeyRequest(laptop);
  expect(after.status).toBe('done');
  if (!after.safetyKeyAddress) throw new Error('bank did not echo the Safety key address');
  // The phone polls the recoverers every 2 s.
  await expect(phone.page.getByTestId('safety-key-confirmed')).toBeVisible({ timeout: 20_000 });
  await expect(phone.page.getByText('Confirmed on your laptop')).toBeVisible();
  // The private key stays in the laptop profile (IndexedDB), the same store /approve signs with.
  const keyAddress = getAddress(after.safetyKeyAddress);
  const inIdb = await idbContains(laptop.page, keyAddress.toLowerCase().slice(2));
  expect(inIdb, 'Safety key record in the laptop profile IndexedDB').toBe(true);
  return keyAddress;
}

/** True when any IndexedDB record of this page's origin mentions `needle` (case-insensitive). */
async function idbContains(page: Page, needle: string): Promise<boolean> {
  return page.evaluate(async (n) => {
    const dbs = await indexedDB.databases();
    for (const info of dbs) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(info.name as string);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((res, rej) => {
          const r = db.transaction(store, 'readonly').objectStore(store).getAll();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        if (JSON.stringify(rows).toLowerCase().includes(n)) {
          db.close();
          return true;
        }
      }
      db.close();
    }
    return false;
  }, needle);
}

/** Step 5 · Protect: one sponsored userOp; waits for the ring to close (3 of 3 drawn) or the error, retries once. */
export async function protect(phone: PersonaSession, onRing?: () => Promise<void>): Promise<Hex | null> {
  const p = phone.page;
  await expect(p.getByText('Step 5 of 6')).toBeVisible({ timeout: 20_000 });
  await expect(p.getByTestId('protect-ring')).toHaveAttribute('data-registered', '0');
  const ring = p.locator('[data-testid="protect-ring"][data-closed="true"]');
  const failed = p.locator('.kl-error');
  for (let attempt = 0; ; attempt += 1) {
    if (attempt === 0) await p.getByTestId('protect-primary').click();
    else await failed.getByRole('button', { name: 'Try again' }).click();
    if (onRing && attempt === 0) await onRing();
    await expect(ring.or(failed)).toBeVisible({ timeout: PROTECT_TIMEOUT });
    if (await ring.isVisible()) break;
    // One bundler rejection in four runs (6 Oct): the UI offers Try again and the presenter would tap it — once.
    if (attempt >= 1) {
      await failed
        .getByText('Technical details')
        .click()
        .catch(() => undefined);
      throw new Error(`protect failed twice: ${await bodyText(p)}`);
    }
    console.warn(`protect rejected once, retrying: ${await bodyText(p)}`);
  }
  await expect(p.getByTestId('protect-ring')).toHaveAttribute('data-registered', '3');
  await expect(p.getByTestId('protect-title')).toHaveText('Protected');
  const link = p.getByTestId('protect-status').getByRole('link');
  await expect(link).toBeVisible();
  return txHashFromUrl(await link.getAttribute('href'));
}

/** Steps 3–4: Emergency card (hex read once) → "Yes, I stored it" → Default mode → step 5. */
export async function emergencyCardAndMode(phone: PersonaSession): Promise<Hex> {
  const p = phone.page;
  await expect(p.getByText('Step 3 of 6')).toBeVisible({ timeout: 10_000 });
  await expect(p.getByText('KEYLINE EMERGENCY CARD')).toBeVisible();
  const key = await readEmergencyCardKey(phone);
  await p.getByRole('button', { name: 'I stored it' }).click();
  await p.getByRole('button', { name: 'Yes, I stored it' }).click();
  await expect(p.getByText('Step 4 of 6')).toBeVisible({ timeout: 20_000 });
  await p.getByRole('button', { name: 'Continue' }).click();
  await expect(p.getByText('Step 5 of 6')).toBeVisible({ timeout: 20_000 });
  return key;
}

/** Step 6 · proof (ERC-1271) → "Go to my wallet" → "Move your first funds" → Home. */
export async function proveAndGoHome(
  phone: PersonaSession,
  onFirstFunds?: () => Promise<void>,
): Promise<void> {
  const p = phone.page;
  // "Continue" only once the ring has closed and settled (before that the button has no action).
  await expect(p.getByTestId('protect-primary')).toContainText('Continue', { timeout: 15_000 });
  await p.getByTestId('protect-primary').click();
  await expect(p.getByText('Step 6 of 6')).toBeVisible({ timeout: 10_000 });
  await p.getByRole('button', { name: 'Sign the proof' }).click();
  await expect(p.getByText('Ownership proven')).toBeVisible({ timeout: 60_000 });
  await p.getByRole('button', { name: 'Go to my wallet' }).click();
  await expect(p.getByRole('heading', { name: 'Move your first funds' })).toBeVisible({ timeout: 10_000 });
  if (onFirstFunds) await onFirstFunds();
  await p.getByTestId('first-funds-home').click();
  const home = await p
    .waitForURL(/\/(\?.*)?$/, { timeout: 30_000, waitUntil: 'commit' })
    .then(() => true)
    .catch(() => false);
  if (!home) {
    // Seen twice: `next dev` restarted itself ("approaching the used memory threshold") while compiling `/`, and the
    // client-side push never committed. The step is already saved (onboardingStep 7) — reload like a user would.
    console.warn('push to / did not commit within 30 s (dev server restart?) — reloading /');
    test.info().annotations.push({ type: 'home-reload', description: 'router.push("/") stalled; reloaded' });
    await phone.goto('/');
  }
  await expect(p.getByTestId('home-protected')).toBeVisible({ timeout: 20_000 });
}

export async function createProtectedWallet(
  phone: PersonaSession,
  laptop: PersonaSession,
): Promise<ProtectedWallet> {
  await signInToSwissquote(laptop);
  const code = await openHandoff(laptop);
  await claimOnPhone(phone, code);
  const safe = await createPhoneKey(phone);
  await expect(laptop.page.getByTestId('keyline-tile')).toHaveAttribute('data-state', 'claimed', {
    timeout: 20_000,
  });

  await confirmSafetyKeyOnLaptop(laptop, phone, safe);
  await phone.page.getByTestId('safety-key-continue').click();
  const emergencyCardKey = await emergencyCardAndMode(phone);
  const protectTx = await protect(phone);
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

  await proveAndGoHome(phone);
  return wallet;
}
