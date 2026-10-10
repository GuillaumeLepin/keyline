// The Keyline story, end to end, against a live stack and Base Sepolia:
//   F1 create wallet (phone) → pair the Safety key (laptop) → Emergency card → mode → PROTECT (real sponsored
//   userOp) → prove ownership (ERC-1271) → top up → F2 send (real sponsored USDC transfer)
//   → F3 lose the phone (virtual authenticator removed) → new phone /recover → laptop /approve → 180 s on-chain grace
//   → finalize → "Welcome back, Lea" → send again from the new phone. F4 / F4b: attacker.spec.ts, fraud-cancel.spec.ts.
//
// Every "it worked" is checked on-chain (e2e/chain.ts), not only on UI copy. Serial: later tests reuse the wallet
// the first test created. Run: `pnpm e2e` (defaults: wallet :3000, bank :4000) or with E2E_WALLET_URL/E2E_BANK_URL.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Request, test } from '@playwright/test';
import type { Address, Hex } from 'viem';
import { getAddress, parseUnits } from 'viem';
import {
  addressUrl,
  chainEnv,
  formatUsdc,
  gracePeriodSeconds,
  guardianSet,
  hasCode,
  recoveryStatus,
  safeOwners,
  txHashFromUrl,
  txSucceeded,
  txUrl,
  usdcBalance,
} from './chain';
import { readEmergencyCardKey } from './fixtures/onboard';
import {
  bankGet,
  bodyText,
  openPersona,
  type PersonaSession,
  readLocalWallet,
  waitForRecovery,
} from './fixtures/personas';
import { type RecoveryView, startRecoveryToIdentity, submitIdentity } from './fixtures/recover';

const SCREENS = resolve(import.meta.dirname, '../docs/screens');
const PROTECT_TIMEOUT = 240_000; // bundler inclusion + 2 confirmations; usually 20–60 s on Base Sepolia
const TOPUP_CHF = 8; // = 10 USDC at the static CHF 0.80 rate
const SEND_CHF = 2; // = 2.50 USDC to Lukas Meier

interface Story {
  phone: PersonaSession;
  laptop: PersonaSession;
  newPhone: PersonaSession;
  safe: Address;
  ownersBefore: Address[];
  recoveryId: string;
  newProxy: Address;
  executeAfter: Date;
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
function newPhone(): PersonaSession {
  if (!story.newPhone) throw new Error('new phone persona not open');
  return story.newPhone;
}
function safe(): Address {
  if (!story.safe) throw new Error('wallet not created yet (earlier step failed)');
  return story.safe;
}
function recoveryId(): string {
  if (!story.recoveryId) throw new Error('no recovery started (F3.1 failed)');
  return story.recoveryId;
}
function newProxy(): Address {
  if (!story.newProxy) throw new Error('new signer proxy unknown (F3.1 failed)');
  return story.newProxy;
}

test.describe.configure({ mode: 'serial' });

test.describe('Keyline story — F1 create + protect + prove, top-up, F2 send, F3 lose & recover', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const videoDir = testInfo.outputPath('videos');
    story.phone = await openPersona(browser, 'lea-phone', { videoDir });
    story.laptop = await openPersona(browser, 'lea-laptop', { videoDir });
    story.newPhone = await openPersona(browser, 'lea-new-phone', { videoDir });
  });

  test.afterAll(async () => {
    const pageErrors = [
      ...(story.phone?.errors ?? []),
      ...(story.laptop?.errors ?? []),
      ...(story.newPhone?.errors ?? []),
    ].filter((e) => e.startsWith('[pageerror'));
    for (const [name, session] of Object.entries({
      phone: story.phone,
      laptop: story.laptop,
      newPhone: story.newPhone,
    })) {
      const video = await session?.page
        .video()
        ?.path()
        .catch(() => undefined);
      if (video) console.info(`video ${name}: ${video}`);
    }
    await story.phone?.close();
    await story.laptop?.close();
    await story.newPhone?.close();
    console.info('\n== story result');
    console.info(
      JSON.stringify(
        {
          safe: story.safe,
          recoveryId: story.recoveryId,
          newProxy: story.newProxy,
          executeAfter: story.executeAfter?.toISOString(),
          ...story.txs,
          funderHasUsdc: story.funderHasUsdc,
        },
        null,
        2,
      ),
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
    await expect(
      p.page
        .getByText(
          'This card cannot spend your money. It can only help restore access after a waiting period you will see.',
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await expect(p.page.locator('.kl-ecard__qr')).toBeVisible();

    // "Never persisted": from the moment the card shows its hex until step 4, the phone must not send it anywhere
    // and must not keep it in any web storage, IndexedDB record or cookie.
    const cardKey = await readEmergencyCardKey(p);
    const bodies: string[] = [];
    const onRequest = (req: Request): void => {
      const body = req.postData();
      if (body) bodies.push(`${req.method()} ${req.url()}\n${body}`);
    };
    p.context.on('request', onRequest);

    await shot(p, '03-onboarding-emergency-card');
    await p.page.getByRole('button', { name: 'I stored it' }).click();
    await expect(p.page.getByText('Have you really stored it?')).toBeVisible();
    await shot(p, '03-onboarding-emergency-card-confirm');
    await p.page.getByRole('button', { name: 'Yes, I stored it' }).click();
    await expect(p.page.getByText('Step 4 of 6')).toBeVisible({ timeout: 20_000 });
    p.context.off('request', onRequest);

    const needles = [cardKey.toLowerCase(), cardKey.toLowerCase().slice(2)];
    const leaks = (haystack: string): boolean => needles.some((n) => haystack.toLowerCase().includes(n));
    expect(
      bodies.filter(leaks).map((b) => b.split('\n')[0]),
      `card hex in none of the ${bodies.length} request bodies`,
    ).toEqual([]);
    const persisted = await p.page.evaluate(async () => {
      const dump = (st: Storage): string[] => {
        const out: string[] = [];
        for (let i = 0; i < st.length; i++) {
          const k = st.key(i) ?? '';
          out.push(`${k}=${st.getItem(k) ?? ''}`);
        }
        return out;
      };
      const idb: string[] = [];
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
          const keys = await new Promise<unknown[]>((res, rej) => {
            const r = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
          const ser = (v: unknown): string => {
            try {
              return JSON.stringify(v, (_k, x) =>
                x instanceof ArrayBuffer || ArrayBuffer.isView(x)
                  ? Array.from(new Uint8Array(x instanceof ArrayBuffer ? x : x.buffer))
                      .map((b) => b.toString(16).padStart(2, '0'))
                      .join('')
                  : typeof x === 'bigint'
                    ? x.toString(16)
                    : x,
              );
            } catch {
              return String(v);
            }
          };
          idb.push(`${info.name}/${store}: ${ser(keys)} ${ser(rows)}`);
        }
        db.close();
      }
      return {
        localStorage: dump(localStorage),
        sessionStorage: dump(sessionStorage),
        indexedDB: idb,
        idbDatabases: dbs.map((d) => d.name ?? ''),
        cookie: document.cookie,
      };
    });
    console.info(
      `F1.3 never-persisted: ${bodies.length} request bodies, ${persisted.localStorage.length} localStorage, ` +
        `${persisted.sessionStorage.length} sessionStorage, IndexedDB [${persisted.idbDatabases.join(', ')}] ` +
        `(${persisted.indexedDB.length} stores), cookie ${persisted.cookie.length} chars`,
    );
    expect(persisted.localStorage.filter(leaks), 'card hex in no localStorage value').toEqual([]);
    expect(persisted.sessionStorage.filter(leaks), 'card hex in no sessionStorage value').toEqual([]);
    expect(persisted.indexedDB.filter(leaks), 'card hex in no IndexedDB record').toEqual([]);
    expect(leaks(persisted.cookie), 'card hex not in document.cookie').toBe(false);

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
      // One bundler rejection in four runs this morning ("The network didn’t accept the request"): the UI offers
      // Try again and the presenter would tap it — so does the test, once.
      await shot(p, '05-onboarding-protect-error');
      console.warn(`protect rejected once, retrying: ${await bodyText(p.page)}`);
      await p.page.getByRole('button', { name: 'Try again' }).click();
      await expect(protectedTitle.or(failed)).toBeVisible({ timeout: PROTECT_TIMEOUT });
      if (await failed.isVisible()) {
        await failed
          .getByText('Technical details')
          .click()
          .catch(() => undefined);
        throw new Error(`protect failed twice: ${await bodyText(p.page)}`);
      }
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
  // F3 — lose the phone & recover (SPEC §3 F3.1–F3.5). F4 / F4b live in attacker.spec.ts / fraud-cancel.spec.ts.
  // ---------------------------------------------------------------------------------------------------------------

  test('F3.1 Lea loses her phone; her new phone starts a recovery (email code → e-ID → new key)', async () => {
    story.ownersBefore = await safeOwners(safe());
    expect(story.ownersBefore, 'the Safe has exactly one owner (the passkey signer proxy)').toHaveLength(1);
    await phone().loseDevice();
    const np = newPhone();
    // Step 1 (new key) + step 2 (email → bank deploys the signer → code from the SIMULATED inbox).
    const { recoveryId } = await startRecoveryToIdentity(np);
    story.recoveryId = recoveryId;
    await shot(np, '11-recover-identity');
    // Step 3: swiyu e-ID (SIMULATED) prefilled with Lea's file → the bank's persona rules pass → verdict signed.
    await submitIdentity(np);
    await expect(np.page.getByText('Waiting for a second recoverer')).toBeVisible({ timeout: 120_000 });
    await expect(np.page.getByText('Swissquote has confirmed.')).toBeVisible();
    await shot(np, '12-recover-recoverers');

    const r = await waitForRecovery<RecoveryView>(recoveryId, (x) => x.status === 'awaiting-guardians');
    expect(r.waitingFor).toBe('second-recoverer');
    expect(r.guardianConfirmations.some((c) => c.kind === 'swissquote' && !c.void)).toBe(true);
    story.newProxy = getAddress(r.newOwner.signerProxyAddress);
    expect(await hasCode(story.newProxy), 'new signer proxy deployed by the bank relayer').toBe(true);
    const events = await bankGet<{ events: { type: string; payload: Record<string, unknown> }[] }>(
      `/wallets/${safe()}/events`,
    );
    const deployed = events.body.events.find((e) => e.type === 'recovery.signer-deployed');
    if (deployed && typeof deployed.payload.txHash === 'string')
      story.txs.signerDeployTx = txUrl(deployed.payload.txHash);
    // Swissquote alone: nothing is pending on the module yet (its signature is held, DECISIONS #15).
    const status = await recoveryStatus(safe());
    expect(status.pending).toBe(false);
  });

  test('F3.2 Lea · laptop confirms with the Safety key → multiConfirmRecovery(execute) → 180 s waiting period on-chain', async () => {
    const l = laptop();
    const np = newPhone();
    const id = recoveryId();
    await l.goto('/approve');
    await expect(l.page.getByText('Restore access on a new phone?')).toBeVisible({ timeout: 30_000 });
    await expect(l.page.getByText('Lea · new phone')).toBeVisible();
    await shot(l, '13-laptop-approve');
    const started = Date.now();
    await l.page.getByRole('button', { name: 'Confirm with Safety key' }).click();
    await expect(l.page.getByText('Confirmed. The waiting period starts')).toBeVisible({ timeout: 240_000 });
    await shot(l, '13-laptop-confirmed');

    const r = await waitForRecovery<RecoveryView>(id, (x) => x.status === 'executed-waiting', {
      label: 'executed-waiting',
    });
    console.info(`executed ${Math.round((Date.now() - started) / 1000)} s after the laptop's click`);
    expect(r.onchain.executedTxHash).toBeTruthy();
    if (r.onchain.executedTxHash) {
      story.txs.executeTx = txUrl(r.onchain.executedTxHash);
      expect(await txSucceeded(r.onchain.executedTxHash as Hex)).toBe(true);
    }

    // On-chain truth: pending, newOwners = [new proxy], executeAfter ≈ now + 180 s (module grace, VERIFIED).
    const status = await recoveryStatus(safe());
    expect(status.pending).toBe(true);
    expect(status.newOwners?.map((o) => o.toLowerCase())).toEqual([newProxy().toLowerCase()]);
    expect(status.executeAfter).toBeDefined();
    if (status.executeAfter) {
      const ahead = (status.executeAfter.getTime() - Date.now()) / 1000;
      console.info(`executeAfter ${status.executeAfter.toISOString()} (${Math.round(ahead)} s ahead)`);
      expect(ahead).toBeGreaterThan(gracePeriodSeconds() - 120);
      expect(ahead).toBeLessThanOrEqual(gracePeriodSeconds() + 5);
      story.executeAfter = status.executeAfter;
    }

    await expect(np.page.getByText(/Access restores at \d{2}:\d{2}/)).toBeVisible({ timeout: 30_000 });
    await expect(np.page.getByText('Waiting period accelerated for the demo')).toBeVisible();
    await shot(np, '14-recover-waiting');
  });

  test('F3.3 After the waiting period the bank finalizer rotates the owner — "Welcome back, Lea" (on-chain)', async () => {
    const np = newPhone();
    const id = recoveryId();
    const until = (story.executeAfter?.getTime() ?? Date.now()) - Date.now();
    console.info(`waiting ${Math.max(0, Math.round(until / 1000))} s for the on-chain grace period…`);
    // Finalizer loop every 5 s + sponsored finalize tx: allow 5 min after executeAfter.
    const r = await waitForRecovery<RecoveryView>(id, (x) => x.status === 'finalized', {
      timeoutMs: Math.max(0, until) + 300_000,
      label: 'finalized',
    });
    expect(r.onchain.finalizedTxHash).toBeTruthy();
    if (r.onchain.finalizedTxHash) {
      story.txs.finalizeTx = txUrl(r.onchain.finalizedTxHash);
      expect(await txSucceeded(r.onchain.finalizedTxHash as Hex)).toBe(true);
    }

    await expect(np.page.getByText(/Welcome back, Lea|You’re back in, Lea/)).toBeVisible({ timeout: 60_000 });
    await shot(np, '15-recover-welcome');
    const owners = await safeOwners(safe());
    expect(owners.map((o) => o.toLowerCase())).toEqual([newProxy().toLowerCase()]);
    for (const old of story.ownersBefore ?? [])
      expect(owners.map((o) => o.toLowerCase())).not.toContain(old.toLowerCase());
    expect((await recoveryStatus(safe())).pending).toBe(false);
    console.info(`owners: ${story.ownersBefore?.join(',')} → ${owners.join(',')}`);

    await np.page.getByRole('button', { name: 'Go to my wallet' }).click();
    await np.page.waitForURL(/\/(\?.*)?$/, { timeout: 10_000 });
    const local = await readLocalWallet(np.page);
    expect(local?.address.toLowerCase()).toBe(safe().toLowerCase());
    expect(local?.status).toBe('deployed');
    await shot(np, '16-home-recovered');
  });

  test('F3.4 The new phone spends: 2.50 USDC to Lukas Meier proves control after recovery', async () => {
    test.skip(!story.funderHasUsdc, 'funder has no USDC — the wallet holds nothing to send');
    const np = newPhone();
    const before = await usdcBalance(safe());
    const amountUsdc = parseUnits((SEND_CHF / 0.8).toFixed(6), 6);
    test.skip(before < amountUsdc, `wallet holds ${formatUsdc(before)} USDC — not enough to send`);
    await np.goto('/send');
    await np.page.getByText('Lukas Meier').first().click();
    await np.page.locator('.kl-amount__input').fill(String(SEND_CHF));
    await np.page.getByRole('button', { name: 'Review' }).click();
    await expect(np.page.getByText('Approved', { exact: true })).toBeVisible({ timeout: 30_000 });
    await np.page.getByRole('button', { name: 'Confirm with Face ID' }).click();
    await np.page.waitForURL(/\/activity\/0x[0-9a-fA-F]{64}$/, { timeout: 120_000 });
    const confirmed = np.page.getByText('Confirmed', { exact: true });
    const failed = np.page.getByText('Not accepted by the network');
    await expect(confirmed.or(failed)).toBeVisible({ timeout: 180_000 });
    if (await failed.isVisible())
      throw new Error(`transfer after recovery failed: ${await bodyText(np.page)}`);
    const tx = txHashFromUrl(
      await np.page.getByRole('link', { name: 'View on Basescan' }).getAttribute('href'),
    );
    if (tx) {
      story.txs.transferAfterRecoveryTx = txUrl(tx);
      expect(await txSucceeded(tx)).toBe(true);
    }
    expect(before - (await usdcBalance(safe()))).toBe(amountUsdc);
    await shot(np, '17-activity-after-recovery');
  });
});
