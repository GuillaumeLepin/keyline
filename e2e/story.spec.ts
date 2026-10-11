// The Keyline story v2 (SPEC §10), end to end, against a live stack and Base Sepolia:
//   F0 Lea · laptop signs in to Swissquote web (SIMULATED) → portfolio (Bitcoin not movable, "Why?") → Keyline tile
//   → 6-digit handoff code → F1 Lea · phone claims it on /start → "Hi Lea" → phone key (passkey) → the laptop
//   confirms "Make this computer your Safety key?" → Emergency card → mode → PROTECT (real sponsored userOp; the ring
//   draws 3 of 3) → prove ownership (ERC-1271) → "Move your first funds" → Home v2 → F1.7 Move to Keyline (real funder
//   transfer) → F2 send (real sponsored USDC transfer) → F3 lose the phone (virtual authenticator removed) → new phone
//   /recover → laptop /approve → 180 s on-chain grace → finalize → "Welcome back, Lea" → send again → F3.5 Back to
//   Swissquote. F4 / F4b: attacker.spec.ts, fraud-cancel.spec.ts.
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
import {
  claimOnPhone,
  confirmSafetyKeyOnLaptop,
  createPhoneKey,
  openHandoff,
  protect,
  proveAndGoHome,
  readEmergencyCardKey,
  signInToSwissquote,
} from './fixtures/onboard';
import {
  bankGet,
  bankUrl,
  bodyText,
  openPersona,
  type PersonaSession,
  readLocalWallet,
  waitForRecovery,
  warmRoutes,
} from './fixtures/personas';
import { type RecoveryView, startRecoveryToIdentity, submitIdentity } from './fixtures/recover';

const SCREENS = resolve(import.meta.dirname, '../docs/screens');
const MOVE_USDC = 10; // = CHF 8.00 at the static SIMULATED price 0.80
const SEND_CHF = 2; // = 2.50 USDC to Lukas Meier
const BACK_CHF = 2; // = 2.50 USDC back to the Swissquote deposit address

interface Story {
  phone: PersonaSession;
  laptop: PersonaSession;
  newPhone: PersonaSession;
  safe: Address;
  ownersBefore: Address[];
  handoffCode: string;
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

test.describe('Keyline story v2 — F0 Swissquote web, F1 handoff + protect + prove, move, F2 send, F3 lose & recover', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await warmRoutes();
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

  // ---------------------------------------------------------------------------------------------------------------
  // F0 — Swissquote web on the laptop (SIMULATED account and prices; the handoff code is real bank state)
  // ---------------------------------------------------------------------------------------------------------------

  test('F0.1 Lea · laptop signs in to Swissquote web → portfolio (SIMULATED), Bitcoin not movable with its Why sheet', async () => {
    const l = laptop();
    await l.goto('/swissquote');
    await expect(l.page.getByRole('heading', { name: 'Sign in to Swissquote' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(l.page.getByLabel('Username')).toHaveValue('lea.keller');
    await shot(l, '00-sq-sign-in');
    await signInToSwissquote(l);
    const positions = l.page.getByTestId('positions');
    // Static SIMULATED positions (SPEC §10 F0.2) and the chips that say so.
    for (const text of ['USDC', 'EURC', 'ETH', 'BTC']) await expect(positions).toContainText(text);
    await expect(l.page.locator('.kl2-chip__mark', { hasText: 'SIMULATED' }).first()).toBeVisible();
    expect(await l.page.locator('.kl2-chip__mark', { hasText: 'SIMULATED' }).count()).toBeGreaterThanOrEqual(
      2,
    );
    // Movable rows have a button; Bitcoin is greyed out (aria-disabled) with "Not movable yet" and a Why? link.
    await expect(positions.getByRole('button', { name: 'Move USDC to Keyline' })).toBeVisible();
    await expect(positions.getByRole('button', { name: 'Move ETH to Keyline' })).toBeVisible();
    await expect(positions.getByRole('button', { name: 'Move BTC to Keyline' })).toHaveCount(0);
    const btcOff = positions.locator('[aria-disabled="true"]', { hasText: 'Not movable yet' });
    await expect(btcOff).toHaveCount(1);
    await shot(l, '00-sq-portfolio');
    await positions.getByRole('button', { name: 'Why?' }).click();
    const why = l.page.getByRole('dialog', { name: 'Why can’t I move Bitcoin?' });
    await expect(why).toBeVisible();
    await expect(why.getByTestId('why-sheet')).toContainText(
      'Keyline moves an asset only when it can give it the same protection: your key, two of three recoverers, a public waiting period.',
    );
    await expect(why.getByRole('link', { name: 'Roadmap: Bitcoin' })).toBeVisible();
    await shot(l, '00-sq-why-btc');
    await why.getByRole('button', { name: 'Close' }).click();
    await expect(why).toBeHidden();
  });

  test('F0.2 Keyline tile → 6-digit handoff code (POST /handoff), waiting for the phone', async () => {
    const l = laptop();
    story.handoffCode = await openHandoff(l);
    if (!test.info().annotations.some((a) => a.type === 'handoff-via-api')) {
      await expect(l.page.getByText('Waiting for your phone')).toBeVisible();
      await expect(l.page.getByRole('img', { name: 'QR code to continue on your phone' })).toBeVisible();
    }
    const view = await l.context.request.get(`${bankUrl()}/handoff/${story.handoffCode}`);
    expect(((await view.json()) as { status: string }).status).toBe('open');
    console.info(`handoff code ${story.handoffCode}`);
    await shot(l, '01-sq-handoff-code');
  });

  // ---------------------------------------------------------------------------------------------------------------
  // F1 v2 — onboarding on the phone, the Safety key confirmed on the laptop's Swissquote page
  // ---------------------------------------------------------------------------------------------------------------

  test('F1.1 Lea · phone claims the code on /start → "Hi Lea" → phone key (passkey → counterfactual Safe)', async () => {
    const p = phone();
    const l = laptop();
    if (!story.handoffCode) throw new Error('no handoff code (F0.2 failed)');
    await p.goto('/start');
    await expect(p.page.getByText('Lea · phone').first()).toBeVisible();
    await expect(p.page.getByRole('heading', { name: 'Continue on your phone' })).toBeVisible({
      timeout: 60_000,
    });
    await shot(p, '01-start');
    await claimOnPhone(p, story.handoffCode);
    await shot(p, '01-onboarding-hi');
    story.safe = await createPhoneKey(p);
    // The laptop's tile follows the claim and the new wallet by itself.
    await expect(l.page.getByTestId('keyline-tile')).toHaveAttribute('data-state', 'claimed', {
      timeout: 20_000,
    });
    await expect(l.page.getByText('Phone connected')).toBeVisible();
    await shot(l, '01-sq-phone-connected');

    const local = await readLocalWallet(p.page);
    expect(local, 'the phone stored its wallet profile').not.toBeNull();
    if (!local) return;
    expect(local.status).toBe('pending');
    expect(local.credentialId.length).toBeGreaterThan(10);
    // A counterfactual Safe: an address, no code yet.
    expect(await hasCode(safe())).toBe(false);
    console.info('Safe (counterfactual):', addressUrl(safe()));
    // A handoff code works once.
    const again = await fetch(`${bankUrl()}/handoff/${story.handoffCode}/claim`, { method: 'POST' });
    expect(again.status, 'a claimed code cannot be claimed again').toBe(409);
  });

  test('F1.2 Lea · laptop confirms "Make this computer your Safety key?" on Swissquote web; the phone sees it', async () => {
    const p = phone();
    const l = laptop();
    await shot(p, '02-onboarding-safety-key-waiting');
    story.safetyKey = await confirmSafetyKeyOnLaptop(l, p, safe(), () => shot(l, '02-sq-safety-key-prompt'));
    await shot(l, '02-sq-safety-key-done');
    await shot(p, '02-onboarding-safety-key-confirmed');

    const guardians = await bankGet<{ guardians: { kind: string; address: string }[] }>(
      `/wallets/${safe()}/guardians`,
    );
    expect(guardians.status).toBe(200);
    const sk = guardians.body.guardians.find((g) => g.kind === 'safety-key');
    expect(sk?.address.toLowerCase(), 'bank registered the laptop key as the Safety key').toBe(
      story.safetyKey.toLowerCase(),
    );
    await p.page.getByTestId('safety-key-continue').click();
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

  test('F1.5 Protect — one sponsored userOp deploys the Safe; the ring draws 3 of 3; 3 recoverers / threshold 2 on-chain', async () => {
    const p = phone();
    await expect(p.page.getByText('One signature protects your wallet')).toBeVisible();
    await expect(p.page.getByTestId('protect-ring')).toContainText('0 of 3');
    await shot(p, '05-onboarding-protect');
    const started = Date.now();
    // Sample the ring while it draws: the arcs are chained on the receipt (1 → 2 → 3), never all at once.
    const seen = new Set<string>();
    const sampler = setInterval(() => {
      p.page
        .getByTestId('protect-ring')
        .getAttribute('data-registered', { timeout: 500 })
        .then((v) => {
          if (v) seen.add(v);
        })
        .catch(() => undefined);
    }, 100);
    let tx: Hex | null;
    try {
      tx = await protect(p);
    } finally {
      clearInterval(sampler);
    }
    console.info(
      `protect: ring closed ${Math.round((Date.now() - started) / 1000)} s after the tap (registered seen: ${[...seen].sort().join(',')})`,
    );
    await expect(p.page.getByTestId('protect-ring')).toHaveAttribute('data-closed', 'true');
    await expect(p.page.getByText('Any 2 of your 3 recoverers can restore access.')).toBeVisible();
    for (const row of ['Safety key', 'Emergency card', 'Swissquote'])
      await expect(
        p.page.locator('li').filter({ hasText: row }).filter({ hasText: 'Added' }).first(),
      ).toBeVisible();
    await shot(p, '05-onboarding-protected');
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
  });

  test('F1.6 Prove ownership (ERC-1271) → "Move your first funds" → Home v2; the laptop tile turns Protected', async () => {
    const p = phone();
    const l = laptop();
    await proveAndGoHome(p, async () => {
      await expect(
        p.page.getByText('Open Swissquote on your laptop and choose “Move to Keyline”'),
      ).toBeVisible();
      await shot(p, '06-onboarding-first-funds');
    });
    const attestation = await bankGet<{ walletAddress: string; method: string; verifiedAt: string }>(
      `/attestations/${safe()}`,
    );
    expect(attestation.status).toBe(200);
    expect(attestation.body.method).toBe('erc1271');
    expect(attestation.body.walletAddress.toLowerCase()).toBe(safe().toLowerCase());
    story.attested = true;

    // Home v2: protected indicator, assets read from chain, the SIMULATED Swissquote section, Back to Swissquote.
    await expect(p.page.getByTestId('home-protected')).toContainText('Protected');
    const assets = p.page.getByTestId('home-assets');
    for (const symbol of ['USDC', 'EURC', 'ETH']) await expect(assets).toContainText(symbol);
    const sq = p.page.getByTestId('home-sq');
    await expect(sq).toContainText('In your Swissquote account');
    await expect(sq).toContainText(/12.480\.35/);
    await expect(sq.locator('.kl-error')).toHaveCount(0);
    await expect(p.page.getByRole('link', { name: 'Back to Swissquote' })).toBeVisible();
    await shot(p, '07-home-v2');

    // Read from chain on the laptop too (Safe deployed) — never from the bank.
    await expect(l.page.getByTestId('keyline-tile')).toHaveAttribute('data-state', 'protected', {
      timeout: 30_000,
    });
    await expect(l.page.getByText('Protected · 2 of 3 recoverers')).toBeVisible();
    await shot(l, '07-sq-tile-protected');
  });

  test('F1.7 Move to Keyline — 10 USDC from Swissquote web (real funder transfer, or the honest refusal)', async () => {
    const l = laptop();
    const before = await usdcBalance(safe());
    await l.page.getByTestId('positions').getByRole('button', { name: 'Move USDC to Keyline' }).click();
    const sheet = l.page.getByRole('dialog', { name: 'Move USDC to Keyline' });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByText('No ownership check needed: this wallet is verified as yours.'),
    ).toBeVisible();
    await sheet.getByTestId('move-amount').fill(String(MOVE_USDC));
    await expect(sheet).toContainText(/CHF\s?8\.00/);
    await shot(l, '08-sq-move-sheet');
    const response = l.page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/sq/moves',
      { timeout: 90_000 },
    );
    await sheet.getByTestId('move-submit').click();
    const res = await response;
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      txHash?: string;
      status?: string;
    };

    if (res.status() >= 400) {
      // The bank refuses with the real funder balance — never a fake hash, nothing debited (docs/MOCKS.md).
      const reason = `${res.status()} ${body.message ?? ''}`;
      console.info('move refused:', reason);
      await expect(sheet.getByTestId('move-funder-empty')).toBeVisible();
      await expect(sheet).toContainText('Nothing was moved and nothing was debited.');
      await shot(l, '08-sq-move-funder-empty');
      story.funderHasUsdc = false;
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toBeHidden();
      test.skip(true, `funder cannot move USDC — ${reason}`);
      return;
    }

    expect(res.status()).toBe(201);
    story.funderHasUsdc = true;
    await expect(sheet.getByTestId('move-result')).toBeVisible();
    if (body.txHash) story.txs.moveTx = txUrl(body.txHash);
    const after = await expect
      .poll(async () => usdcBalance(safe()), { timeout: 90_000, message: 'USDC balance reflects the move' })
      .toBeGreaterThan(before)
      .then(() => usdcBalance(safe()));
    expect(after - before).toBe(parseUnits(String(MOVE_USDC), 6));
    console.info(`move: ${formatUsdc(before)} → ${formatUsdc(after)} USDC`);
    await shot(l, '08-sq-moved');
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(phone().page.getByTestId('home-assets')).toContainText(/10\.00/, { timeout: 30_000 });
    await shot(phone(), '08-home-funds-arrived');
  });

  test('F2 Send 2.50 USDC to Lukas Meier — policy approve → sponsor → passkey signs → confirmed on-chain', async () => {
    test.skip(!story.funderHasUsdc, 'funder has no USDC — the wallet holds nothing to send');
    const p = phone();
    const before = await usdcBalance(safe());
    const amountUsdc = parseUnits((SEND_CHF / 0.8).toFixed(6), 6);
    expect(before >= amountUsdc, 'wallet holds enough USDC').toBe(true);

    await p.page.getByRole('link', { name: 'Send' }).click();
    await p.page.waitForURL(/\/send$/, { timeout: 10_000 });
    // Phase C send: recipient list → amount screen (CHF, toggle to USDC) → review.
    await p.page.getByText('Lukas Meier').first().click();
    await expect(p.page.getByTestId('send-amount')).toBeVisible();
    await p.page.getByTestId('send-amount').fill(String(SEND_CHF));
    await shot(p, '09-send');
    await p.page.getByTestId('send-review').click();
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
    await expect(l.page.getByRole('heading', { name: 'Confirmed on this laptop' })).toBeVisible({
      timeout: 240_000,
    });
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
    await np.page.getByTestId('send-amount').fill(String(SEND_CHF));
    await np.page.getByTestId('send-review').click();
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

  test('F3.5 Back to Swissquote — Tier 1 to the verified deposit address, credited (SIMULATED ledger)', async () => {
    test.skip(!story.funderHasUsdc, 'funder has no USDC — the wallet holds nothing to send back');
    const np = newPhone();
    const before = await usdcBalance(safe());
    const amountUsdc = parseUnits((BACK_CHF / 0.8).toFixed(6), 6);
    test.skip(before < amountUsdc, `wallet holds ${formatUsdc(before)} USDC — not enough to send back`);
    await np.goto('/back');
    await expect(np.page.getByRole('heading', { name: 'Back to Swissquote' })).toBeVisible({
      timeout: 60_000,
    });
    await np.page.getByTestId('back-amount').fill(String(BACK_CHF));
    await np.page.getByTestId('back-review').click();
    await expect(np.page.getByTestId('back-review-screen')).toBeVisible();
    await expect(np.page.getByText('Your Swissquote account · verified').first()).toBeVisible();
    await expect(np.page.getByText('Approved', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(
      np.page.getByText('No ownership check needed: this account is verified as yours.'),
    ).toBeVisible();
    await shot(np, '18-back-review');
    await np.page.getByTestId('back-confirm').click();
    await np.page.waitForURL(/\/activity\/0x[0-9a-fA-F]{64}$/, { timeout: 120_000 });
    const confirmed = np.page.getByText('Confirmed', { exact: true });
    const failed = np.page.getByText('Not accepted by the network');
    await expect(confirmed.or(failed)).toBeVisible({ timeout: 180_000 });
    if (await failed.isVisible()) throw new Error(`back to Swissquote failed: ${await bodyText(np.page)}`);
    const tx = txHashFromUrl(
      await np.page.getByRole('link', { name: 'View on Basescan' }).getAttribute('href'),
    );
    if (tx) {
      story.txs.backTx = txUrl(tx);
      expect(await txSucceeded(tx)).toBe(true);
    }
    expect(before - (await usdcBalance(safe()))).toBe(amountUsdc);
    await shot(np, '18-back-sent');
  });
});
