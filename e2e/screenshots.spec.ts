// `pnpm screenshots` — every reachable screen and state of the wallet at 2× into docs/screens/<route>-<state>.png,
// for the design audit. No chain, no real bank: the bank API and the RPC are mocked per screenshot with fixtures
// that satisfy the @keyline/shared schemas, and the per-profile localStorage is seeded to put each screen in the
// state we want (pending / deployed / empty / rows / error / loading). Only the wallet dev server must be running.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type BrowserContext, type Page, type Route, test } from '@playwright/test';
import { PERSONA_LABEL, type Persona } from './fixtures/personas';

const OUT = resolve(import.meta.dirname, '../docs/screens');
const WALLET_URL = process.env.E2E_WALLET_URL ?? 'http://localhost:3000';
const BANK_URL = process.env.E2E_BANK_URL ?? 'http://localhost:4000';

// ---------------------------------------------------------------------------------------------------------------
// Fixtures (shapes = packages/shared/src/schemas.ts)
// ---------------------------------------------------------------------------------------------------------------

const SAFE = '0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482'; // the Gate 1 Safe — Basescan links resolve
const SAFETY_KEY = '0x52dAe4d3a08C6E3A3b4bB4A4E1b17C19ab78F0f6';
const EMERGENCY_CARD = '0x745C7a2d2B0A9d1E3F4b5C6D7E8f9A0b1c2d1926';
const SWISSQUOTE = '0x01Bbd43cd140a7BfcA7836e577470Af2B1d04dE8';
const LUKAS = '0x1111111111111111111111111111111111111111';
const MARTA = '0x2222222222222222222222222222222222222222';
const SANCTIONED = '0x3333333333333333333333333333333333333333';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const TX = '0xa40c042a5774cd1fec93c9832d00311611fd6bd34896ef0b3a21be7e1850d425';
const USEROP = '0x7b1e4c4f1e9a3d2b8c6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b';
const NOW = new Date('2026-10-06T09:30:00.000Z');
const iso = (offsetMs = 0) => new Date(NOW.getTime() + offsetMs).toISOString();

const wallet = (over: Partial<Record<string, unknown>> = {}) => ({
  address: SAFE,
  credentialId: 'W7eFRrEDRfe_H23mBEY09FrCfWsYYnEkNUd0VT5UN0o',
  pubKeyX: '0x055928fbcaec6848effdd53e1596cf9ac0b4735dfbe0d2fb25b03e679efd0d51',
  pubKeyY: '0x4bb1118fd04a0d1ab738729aea9b30cf872b9e1faf1b26242a2f4c8f5721156b',
  deviceLabel: 'Lea · phone',
  status: 'deployed',
  protectTxHash: TX,
  attested: true,
  recoveryMode: 'default',
  guardians: { safetyKey: SAFETY_KEY, emergencyCard: EMERGENCY_CARD, swissquote: SWISSQUOTE },
  onboardingStep: 7,
  ...over,
});

const contacts = [
  {
    id: `ct_${LUKAS.slice(2).toLowerCase()}`,
    clientId: 'SQ-48213-LK',
    label: 'Lukas Meier',
    address: LUKAS,
    trusted: true,
    firstSeenAt: iso(-86_400_000 * 40),
    verifiedOwnership: true,
  },
  {
    id: `ct_${MARTA.slice(2).toLowerCase()}`,
    clientId: 'SQ-48213-LK',
    label: 'Marta Rossi',
    address: MARTA,
    firstSeenAt: iso(-86_400_000),
    verifiedOwnership: false,
  },
  {
    id: `ct_${SANCTIONED.slice(2).toLowerCase()}`,
    clientId: 'SQ-48213-LK',
    label: 'Sanctioned test address',
    address: SANCTIONED,
    firstSeenAt: iso(-86_400_000),
    verifiedOwnership: false,
    simulated: true,
  },
];

const me = {
  client: {
    id: 'SQ-48213-LK',
    name: 'Lea Keller',
    email: 'lea.keller@example.ch',
    kycLevel: 'full',
    createdAt: iso(-86_400_000 * 400),
  },
  account: { currency: 'CHF', balance: 12_492, sponsoredToday: 2, sponsoredDailyCap: 20, simulated: true },
  wallet: null,
  auth: 'device-label',
};

const guardian = (kind: string, address: string) => ({ walletAddress: SAFE, kind, address, addedTxHash: TX });

const events = [
  {
    id: 'evt_1',
    service: 'bank',
    type: 'wallet.created',
    walletAddress: SAFE,
    payload: {},
    at: iso(-3_600_000),
  },
  {
    id: 'evt_2',
    service: 'bank',
    type: 'guardian.paired',
    walletAddress: SAFE,
    payload: { kind: 'safety-key' },
    at: iso(-3_500_000),
  },
  {
    id: 'evt_3',
    service: 'bank',
    type: 'attestation.verified',
    walletAddress: SAFE,
    payload: {},
    at: iso(-3_000_000),
  },
];

function decision(verdict: 'approve' | 'step-up' | 'cooling' | 'block', amountUsdc: number, to = LUKAS) {
  const units = BigInt(Math.round(amountUsdc * 1_000_000));
  // Large sends (step-up) need a balance that covers them: asset deltas must stay non-negative (WeiString).
  const before = units > 120_000_000n ? 3_000_000_000n : 120_000_000n;
  const hit = verdict === 'block';
  return {
    requestId: 'dec_01HZX7Q2M9',
    decisionId: 'dec_01HZX7Q2M9',
    walletAddress: SAFE,
    kind: 'transfer',
    calls: [{ to: USDC, value: '0', data: '0xa9059cbb' }],
    verdict,
    tier: verdict === 'approve' ? 1 : verdict === 'step-up' ? 2 : 3,
    reasons:
      verdict === 'approve'
        ? ['Within your CHF 1’000 daily limit', '18 of 20 free transactions left today']
        : verdict === 'step-up'
          ? [
              'Above CHF 1’000 today — Safety key approval required',
              'Policy-layer enforcement in the prototype (simulated)',
            ]
          : verdict === 'cooling'
            ? ['First transfer to a new address — 60 s waiting period (prod 24 h)']
            : ['Counterparty appears on the OFAC SDN list — simulated test entry'],
    simulation: {
      ok: !hit,
      assetChanges: [
        {
          token: USDC,
          symbol: 'USDC',
          before: before.toString(),
          after: (before - units).toString(),
          delta: `-${units}`,
        },
      ],
      decodedCalls: [
        {
          to: USDC,
          fn: 'transfer(address,uint256)',
          args: [to, units.toString()],
          humanText: `Send ${amountUsdc} USDC`,
          risk: 'none',
        },
      ],
      gasEstimate: '65000',
      provider: 'fallback',
      simulated: true,
    },
    screening: {
      counterparty: to,
      listsChecked: ['OFAC-SDN', 'SECO'],
      hit,
      source: hit ? 'seeded-test' : undefined,
      simulatedHit: hit,
      simulated: true,
    },
    sponsorship: { sponsored: !hit, remainingToday: 18, dailyCap: 20 },
    stepUp: verdict === 'step-up' ? {} : undefined,
    callsHash: '0x5b0f7d6a1e2c3b4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6',
    coolingUntil: verdict === 'cooling' ? iso(45_000) : undefined,
    chfValue: amountUsdc * 0.8,
    fx: { pair: 'USDC/CHF', rate: 0.8, simulated: true },
    expiresAt: iso(10 * 60_000),
    decidedAt: iso(),
  };
}

const userOpStatus = (status: 'pending' | 'included' | 'confirmed' | 'failed') => ({
  userOpHash: USEROP,
  status,
  txHash: status === 'pending' ? undefined : TX,
  blockNumber: status === 'pending' ? undefined : 32_118_204,
  explorerUrl: status === 'pending' ? undefined : `https://sepolia.basescan.org/tx/${TX}`,
  walletAddress: SAFE,
});

const transfer = (status: 'sent' | 'confirmed' | 'failed') => ({
  userOpHash: USEROP,
  to: LUKAS,
  toLabel: 'Lukas Meier',
  amountUsdc: 25,
  amountChf: 20,
  at: iso(-120_000),
  status,
  txHash: status === 'sent' ? undefined : TX,
  blockNumber: status === 'sent' ? undefined : 32_118_204,
  timeline: {
    signedAt: iso(-120_000),
    sentAt: iso(-119_000),
    includedAt: status === 'sent' ? undefined : iso(-116_000),
    confirmedAt: status === 'confirmed' ? iso(-110_000) : undefined,
  },
  decisionId: 'dec_01HZX7Q2M9',
});

const topups = [{ txHash: TX, amountUsdc: 150, amountChf: 120, at: iso(-86_400_000) }];

// ---- v2 (SPEC §10): Swissquote web, handoff, laptop Safety key, moves — all SIMULATED except the chain ----
const FUNDER = '0x482B512e50e6FB886A70D027DF20b1D55369458A';
const sqClient = { id: 'SQ-48213-LK', firstName: 'Lea', name: 'Lea Keller', email: 'lea.keller@example.ch' };
const sqSession = { client: sqClient, expiresAt: iso(3_600_000), simulated: true };
const pos = (
  id: string,
  name: string,
  symbol: string,
  kind: 'cash' | 'security' | 'crypto',
  quantity: string,
  priceChf: string,
  valueChf: string,
  extra: Record<string, unknown> = {},
) => ({ id, name, symbol, kind, quantity, priceChf, valueChf, movable: false, simulated: true, ...extra });
const sqPositions = {
  client: sqClient,
  cashChf: '12480.35',
  investedChf: '65694.00',
  totalChf: '78174.35',
  valuedAt: iso(),
  positions: [
    pos('chf-cash', 'Swiss franc', 'CHF', 'cash', '12480.35', '1', '12480.35'),
    pos('smi-etf', 'iShares SMI ETF', 'CSSMI', 'security', '120', '128.40', '15408.00'),
    pos('btc', 'Bitcoin', 'BTC', 'crypto', '0.42', '88400', '37128.00', {
      notMovableReason: 'bitcoin-roadmap',
    }),
    pos('eth', 'Ether', 'ETH', 'crypto', '3.15', '3120', '9828.00', { movable: true }),
    pos('usdc', 'USD Coin', 'USDC', 'crypto', '2400', '0.80', '1920.00', { movable: true }),
    pos('eurc', 'Euro Coin', 'EURC', 'crypto', '1500', '0.94', '1410.00', { movable: true }),
  ],
  simulated: true,
};
const handoff = (status: 'open' | 'claimed' | 'expired', walletAddress?: string) => ({
  code: '482913',
  expiresAt: iso(status === 'expired' ? -1 : 9 * 60_000),
  status,
  qrUrl: `${WALLET_URL}/start?code=482913`,
  client: status === 'claimed' ? sqClient : undefined,
  claimedAt: status === 'claimed' ? iso() : undefined,
  walletAddress,
});
const skr = (status: 'none' | 'waiting' | 'done') => ({
  walletAddress: status === 'none' ? null : SAFE,
  status,
  requestedAt: status === 'none' ? undefined : iso(-30_000),
  safetyKeyAddress: status === 'done' ? SAFETY_KEY : undefined,
});
const move = (status: 'sent' | 'confirmed') => ({
  id: 'mov_01',
  asset: 'USDC',
  amount: '10',
  valueChf: '8.00',
  walletAddress: SAFE,
  txHash: TX,
  status,
  explorerUrl: `https://sepolia.basescan.org/tx/${TX}`,
  ledgerSimulated: true,
  at: iso(-60_000),
});
const SQ_WEB: BankMap = {
  'GET /sq/me': { body: sqSession },
  'GET /sq/safety-key-request': { body: skr('none') },
  'GET /sq/moves': { body: { moves: [] } },
  'POST /handoff': { status: 201, body: handoff('open') },
  'GET /handoff/482913': { body: handoff('open') },
};
const guardiansBody = (kinds: string[]) => ({
  walletAddress: SAFE,
  recoveryMode: 'default',
  threshold: 2,
  requiredKinds: ['safety-key', 'emergency-card', 'swissquote'],
  guardians: [
    guardian('safety-key', SAFETY_KEY),
    guardian('emergency-card', EMERGENCY_CARD),
    guardian('swissquote', SWISSQUOTE),
  ].filter((g) => kinds.includes(g.kind)),
  complete: kinds.length === 3,
});

// ---------------------------------------------------------------------------------------------------------------
// Mock layer
// ---------------------------------------------------------------------------------------------------------------

type Reply = { status?: number; body: unknown } | 'offline' | 'hang';
type BankMap = Record<string, Reply | (() => Reply)>;

const DEFAULT_BANK: BankMap = {
  'GET /me': { body: me },
  'GET /contacts': { body: { contacts } },
  'GET /dapps': { body: { dapps: [] } },
  [`GET /wallets/${SAFE}/events`]: { body: { events } },
  [`GET /wallets/${SAFE}/guardians`]: {
    body: guardiansBody(['safety-key', 'emergency-card', 'swissquote']),
  },
  'GET /sq/positions': { body: sqPositions },
  'GET /sq/deposit-address': { body: { address: FUNDER, label: 'Your Swissquote account', verified: true } },
};

async function mockBank(page: Page, map: BankMap): Promise<void> {
  const merged = { ...DEFAULT_BANK, ...map };
  await page.route(`${BANK_URL}/**`, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const origin = request.headers().origin ?? WALLET_URL;
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, accept, x-device-label, idempotency-key',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const key = `${request.method()} ${url.pathname}`;
    const entry = merged[key];
    const reply = typeof entry === 'function' ? entry() : entry;
    if (reply === undefined) {
      return route.fulfill({
        status: 404,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'not-found', message: `screenshot mock: no fixture for ${key}` }),
      });
    }
    if (reply === 'offline') return route.abort('connectionrefused');
    if (reply === 'hang') return new Promise(() => {}); // keep the skeleton on screen
    return route.fulfill({
      status: reply.status ?? 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify(reply.body),
    });
  });
}

/**
 * The wallet reads balances with viem: `eth_call balanceOf` (USDC and EURC) answers `usdcUnits`, `eth_getBalance`
 * `ethWei`, `eth_getCode` a non-empty bytecode when `deployed` (the Swissquote tile reads "protected" from chain).
 */
async function mockRpc(
  page: Page,
  usdcUnits: bigint | 'hang' = 0n,
  { ethWei = 0n, deployed = false }: { ethWei?: bigint; deployed?: boolean } = {},
): Promise<void> {
  await page.route(
    /sepolia\.base\.org|base-sepolia|127\.0\.0\.1:8545|localhost:8545/,
    async (route: Route) => {
      if (usdcUnits === 'hang') return new Promise(() => {});
      const raw = route.request().postData() ?? '{}';
      const parsed = JSON.parse(raw) as { id: number; method: string } | { id: number; method: string }[];
      const answer = (call: { id: number; method: string }) => ({
        jsonrpc: '2.0',
        id: call.id,
        result:
          call.method === 'eth_chainId'
            ? '0x14a34'
            : call.method === 'eth_blockNumber'
              ? '0x1ea1f4c'
              : call.method === 'eth_call'
                ? `0x${usdcUnits.toString(16).padStart(64, '0')}`
                : call.method === 'eth_getBalance'
                  ? `0x${ethWei.toString(16)}`
                  : call.method === 'eth_getCode'
                    ? deployed
                      ? '0x6080604052'
                      : '0x'
                    : '0x',
      });
      const body = Array.isArray(parsed) ? parsed.map(answer) : answer(parsed);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    },
  );
}

interface Scene {
  readonly name: string;
  readonly path: string;
  readonly persona?: Persona;
  readonly storage?: Record<string, unknown>;
  readonly bank?: BankMap;
  readonly usdc?: bigint | 'hang';
  /** Interactions after load, before the shot. */
  readonly act?: (page: Page) => Promise<void>;
  /** Wait for this text before shooting (default: network idle + 400 ms). */
  readonly waitFor?: string;
  readonly settleMs?: number;
  readonly fullPage?: boolean;
  /** Virtual authenticator that refuses user verification → "passkey prompt was closed" states. */
  readonly refusingAuthenticator?: boolean;
  /** sessionStorage seed (e.g. the handoff's first name for "Hi Lea"). */
  readonly session?: Record<string, string>;
  /** Forced colour scheme: `prefers-color-scheme` emulated + the app's own preference (`keyline.theme`). */
  readonly theme?: 'light' | 'dark';
  readonly ethWei?: bigint;
  /** `eth_getCode` answers bytecode (Safe deployed). */
  readonly deployed?: boolean;
}

async function shoot(browser: Browser, scene: Scene): Promise<void> {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor: 2,
    locale: 'en-CH',
    timezoneId: 'Europe/Zurich',
  });
  const persona = scene.persona ?? 'lea-phone';
  const storage: Record<string, unknown> = {
    'keyline.device': persona,
    ...(scene.theme ? { 'keyline.theme': scene.theme } : {}),
    ...(scene.storage ?? {}),
  };
  await context.addInitScript(
    ({ seed, session }: { seed: Record<string, unknown>; session: Record<string, string> }) => {
      for (const [key, value] of Object.entries(seed)) {
        window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
      for (const [key, value] of Object.entries(session)) window.sessionStorage.setItem(key, value);
    },
    { seed: storage, session: scene.session ?? {} },
  );
  if (scene.theme) {
    // The server renders <html data-theme> from this cookie (no flash); the client mirrors localStorage.
    await context.addCookies([{ name: 'kl_theme', value: scene.theme, url: WALLET_URL }]);
  }
  const page = await context.newPage();
  if (scene.theme) await page.emulateMedia({ colorScheme: scene.theme });
  // Fixtures are dated around NOW (decision expiresAt, coolingUntil, recovery executeAfter…): pin Date.now() to it.
  // Fixed time only — setTimeout/setInterval keep running, so the app's polling still fires.
  await page.clock.setFixedTime(NOW);
  if (scene.refusingAuthenticator) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: false,
        automaticPresenceSimulation: true,
      },
    });
  }
  await mockRpc(page, scene.usdc ?? 0n, { ethWei: scene.ethWei, deployed: scene.deployed });
  await mockBank(page, scene.bank ?? {});
  const url = new URL(scene.path, WALLET_URL);
  url.searchParams.set('device', persona);
  // A hanging mock keeps the network busy forever: wait for the DOM only and let the skeleton show.
  const hangs = scene.usdc === 'hang' || Object.values(scene.bank ?? {}).includes('hang');
  await page.goto(url.toString(), { waitUntil: hangs ? 'domcontentloaded' : 'networkidle' });
  if (scene.waitFor) await page.getByText(scene.waitFor).first().waitFor({ timeout: 15_000 });
  if (scene.act) await scene.act(page);
  if (scene.theme) {
    const applied = await page.evaluate(() => document.documentElement.dataset.theme ?? '');
    if (applied !== scene.theme)
      throw new Error(`theme ${scene.theme} not applied (data-theme="${applied}")`);
  }
  await page.waitForTimeout(scene.settleMs ?? 400);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: resolve(OUT, `${scene.name}.png`), fullPage: scene.fullPage ?? true });
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------
// Scenes — one per screen × state
// ---------------------------------------------------------------------------------------------------------------

const step = (n: number, over: Record<string, unknown> = {}) =>
  wallet({
    status: 'pending',
    protectTxHash: undefined,
    attested: false,
    guardians: {},
    onboardingStep: n,
    ...over,
  });

const registerOptions = {
  challenge: 'c2NyZWVuc2hvdC1jaGFsbGVuZ2U',
  rp: { name: 'Keyline', id: 'localhost' },
  user: { id: 'bGVh', name: 'lea.keller@example.ch', displayName: 'Lea Keller' },
  pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
  authenticatorSelection: {
    authenticatorAttachment: 'platform',
    residentKey: 'required',
    userVerification: 'required',
  },
  timeout: 60_000,
  attestation: 'none',
};

const SCENES: Scene[] = [
  // ---- Home ----
  { name: 'home-no-wallet', path: '/' },
  { name: 'home-thief-no-key', path: '/', persona: 'thief' },
  { name: 'home-pending-onboarding', path: '/', storage: { 'keyline.wallet': step(3) } },
  {
    name: 'home-deployed-empty',
    path: '/',
    storage: { 'keyline.wallet': wallet() },
    bank: { [`GET /wallets/${SAFE}/events`]: { body: { events: [] } } },
  },
  {
    name: 'home-deployed-statement',
    path: '/',
    storage: {
      'keyline.wallet': wallet(),
      'keyline.transfers': [transfer('confirmed')],
      'keyline.topups': topups,
    },
    usdc: 95_000_000n,
  },
  {
    name: 'home-loading',
    path: '/',
    storage: { 'keyline.wallet': wallet() },
    usdc: 'hang',
    bank: { [`GET /wallets/${SAFE}/events`]: 'hang' },
    settleMs: 800,
  },
  {
    name: 'home-offline',
    path: '/',
    storage: { 'keyline.wallet': wallet() },
    bank: { [`GET /wallets/${SAFE}/events`]: 'offline' },
    usdc: 120_000_000n,
  },
  {
    name: 'home-receive-sheet',
    path: '/',
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    act: (page) => page.getByRole('button', { name: 'Receive' }).click(),
  },
  {
    name: 'home-topup-sheet',
    path: '/?sheet=topup',
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    act: async (page) => {
      await page.getByRole('dialog').locator('.kl-amount__input').fill('100');
    },
  },
  {
    name: 'home-topup-error-funder-empty',
    path: '/?sheet=topup',
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    bank: {
      'POST /topups': {
        status: 502,
        body: {
          error: 'upstream',
          message:
            'Bank funder 0x482B512e50e6FB886A70D027DF20b1D55369458A holds 0 USDC — fund it at faucet.circle.com',
          details: { funder: '0x482B512e50e6FB886A70D027DF20b1D55369458A', usdc: '0' },
        },
      },
    },
    act: async (page) => {
      await page.getByRole('dialog').locator('.kl-amount__input').fill('100');
      await page.getByRole('dialog').getByRole('button', { name: 'Top up', exact: true }).click();
      await page.getByRole('dialog').locator('.kl-error').waitFor();
    },
  },
  // ---- Onboarding ----
  { name: 'onboarding-1-create', path: '/onboarding' },
  {
    name: 'onboarding-1-passkey-cancelled',
    path: '/onboarding',
    refusingAuthenticator: true,
    bank: { 'POST /auth/passkey/register/options': { body: registerOptions } },
    act: async (page) => {
      await page.getByRole('button', { name: 'Create with Face ID / fingerprint' }).click();
      await page
        .locator('.kl-note, .kl-error')
        .first()
        .waitFor({ timeout: 15_000 })
        .catch(() => undefined);
    },
    settleMs: 600,
  },
  {
    name: 'onboarding-2-safety-key-waiting',
    path: '/onboarding',
    storage: { 'keyline.wallet': step(2) },
    bank: { [`GET /wallets/${SAFE}/guardians`]: { body: guardiansBody([]) } },
    waitFor: 'Waiting for your laptop',
  },
  {
    name: 'onboarding-2-safety-key-confirmed',
    path: '/onboarding',
    storage: { 'keyline.wallet': step(2) },
    bank: { [`GET /wallets/${SAFE}/guardians`]: { body: guardiansBody(['safety-key']) } },
    waitFor: 'Confirmed on your laptop',
  },
  {
    name: 'onboarding-2-offline',
    path: '/onboarding',
    storage: { 'keyline.wallet': step(2) },
    bank: { [`GET /wallets/${SAFE}/guardians`]: 'offline' },
    waitFor: 'Swissquote isn’t reachable',
  },
  {
    name: 'onboarding-3-emergency-card',
    path: '/onboarding',
    storage: { 'keyline.wallet': step(3, { guardians: { safetyKey: SAFETY_KEY } }) },
    waitFor: 'KEYLINE EMERGENCY CARD',
  },
  {
    name: 'onboarding-3-emergency-card-confirm',
    path: '/onboarding',
    storage: { 'keyline.wallet': step(3, { guardians: { safetyKey: SAFETY_KEY } }) },
    waitFor: 'KEYLINE EMERGENCY CARD',
    act: (page) => page.getByRole('button', { name: 'I stored it' }).click(),
  },
  {
    name: 'onboarding-4-mode',
    path: '/onboarding',
    storage: {
      'keyline.wallet': step(4, { guardians: { safetyKey: SAFETY_KEY, emergencyCard: EMERGENCY_CARD } }),
    },
  },
  {
    name: 'onboarding-5-protect',
    path: '/onboarding',
    storage: {
      'keyline.wallet': step(5, { guardians: { safetyKey: SAFETY_KEY, emergencyCard: EMERGENCY_CARD } }),
    },
  },
  {
    name: 'onboarding-5-protect-refused',
    path: '/onboarding',
    storage: {
      'keyline.wallet': step(5, { guardians: { safetyKey: SAFETY_KEY, emergencyCard: EMERGENCY_CARD } }),
    },
    bank: {
      [`POST /wallets/${SAFE}/guardians`]: { status: 201, body: guardian('swissquote', SWISSQUOTE) },
      'POST /policy/evaluate': {
        status: 201,
        body: {
          ...decision('block', 0, SAFE),
          kind: 'protect',
          reasons: ['Sponsorship cap reached: 20 of 20 free transactions used today'],
        },
      },
    },
    act: async (page) => {
      await page.getByRole('button', { name: 'Protect my wallet' }).click();
      await page.getByText('Blocked').first().waitFor({ timeout: 10_000 });
    },
  },
  {
    name: 'onboarding-5-protect-error',
    path: '/onboarding',
    storage: {
      'keyline.wallet': step(5, { guardians: { safetyKey: SAFETY_KEY, emergencyCard: EMERGENCY_CARD } }),
    },
    bank: {
      [`POST /wallets/${SAFE}/guardians`]: {
        status: 502,
        body: { error: 'upstream', message: 'sq-guardian unreachable' },
      },
    },
    act: async (page) => {
      await page.getByRole('button', { name: 'Protect my wallet' }).click();
      await page.locator('.kl-error').waitFor({ timeout: 10_000 });
    },
  },
  {
    name: 'onboarding-5-protected',
    path: '/onboarding',
    storage: { 'keyline.wallet': wallet({ onboardingStep: 5, attested: false }) },
    waitFor: 'Protected',
  },
  {
    name: 'onboarding-6-prove',
    path: '/onboarding',
    storage: { 'keyline.wallet': wallet({ onboardingStep: 6, attested: false }) },
  },
  // ---- Laptop ----
  {
    name: 'pair-redirects-to-swissquote',
    path: '/pair',
    persona: 'lea-laptop',
    bank: { 'GET /sq/me': { status: 401, body: { error: 'unauthorized', message: 'Sign in' } } },
    waitFor: 'Sign in to Swissquote',
  },
  { name: 'approve-empty', path: '/approve', persona: 'lea-laptop' },
  // ---- Send ----
  {
    name: 'send-contacts',
    path: '/send',
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    waitFor: 'Lukas Meier',
  },
  {
    name: 'send-contacts-loading',
    path: '/send',
    storage: { 'keyline.wallet': wallet() },
    bank: { 'GET /contacts': 'hang' },
    settleMs: 800,
  },
  {
    name: 'send-contacts-offline',
    path: '/send',
    storage: { 'keyline.wallet': wallet() },
    bank: { 'GET /contacts': 'offline' },
    waitFor: 'Swissquote isn’t reachable',
  },
  // Phase C send: recipient list → amount (CHF ⇄ USDC toggle) → review; `/send?to=` jumps to the amount.
  {
    name: 'send-picked-known',
    path: '/send',
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    waitFor: 'Lukas Meier',
    act: async (page) => {
      await page.getByText('Lukas Meier').first().click();
      await page.getByTestId('send-amount').fill('20');
    },
    settleMs: 700,
  },
  {
    name: 'send-picked-new-address',
    path: '/send',
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    waitFor: 'Marta Rossi',
    act: async (page) => {
      await page.getByText('Marta Rossi').first().click();
      await page.getByTestId('send-amount').fill('20');
    },
    settleMs: 700,
  },
  {
    name: 'send-amount-toggled-usdc',
    path: `/send?to=${LUKAS}`,
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    act: async (page) => {
      await page.getByTestId('send-amount').fill('20');
      await page.getByTestId('send-toggle').click();
    },
    settleMs: 900,
  },
  {
    name: 'send-error-insufficient',
    path: `/send?to=${LUKAS}`,
    storage: { 'keyline.wallet': wallet() },
    usdc: 12_000_000n,
    act: async (page) => {
      await page.getByTestId('send-amount').fill('500');
      await page.getByTestId('send-amount').blur();
    },
    settleMs: 700,
  },
  {
    name: 'send-amount-empty',
    path: `/send?to=${LUKAS}`,
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    act: (page) => page.getByTestId('send-amount').waitFor(),
    settleMs: 700,
  },
  {
    name: 'send-new-address',
    path: '/send',
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
    waitFor: 'Lukas Meier',
    act: async (page) => {
      await page.getByText('New recipient', { exact: true }).click();
      await page.getByTestId('send-address').fill('0x2222222222222222222222222222222222222222');
    },
    settleMs: 700,
  },
  // ---- Review ----
  ...(['approve', 'step-up', 'cooling', 'block'] as const).map(
    (verdict): Scene => ({
      name: `send-review-${verdict}`,
      path: '/send/review',
      storage: {
        'keyline.wallet': wallet(),
        'keyline.pendingSend': {
          to: verdict === 'block' ? SANCTIONED : verdict === 'cooling' ? MARTA : LUKAS,
          toLabel:
            verdict === 'block'
              ? 'Sanctioned test address'
              : verdict === 'cooling'
                ? 'Marta Rossi'
                : 'Lukas Meier',
          knownContact: verdict === 'approve' || verdict === 'step-up',
          amountChf: verdict === 'step-up' ? 2000 : 20,
          amountUsdc: verdict === 'step-up' ? 2500 : 25,
        },
      },
      usdc: verdict === 'step-up' ? 3_000_000_000n : 120_000_000n,
      bank: {
        'POST /policy/evaluate': {
          status: 201,
          body: decision(
            verdict,
            verdict === 'step-up' ? 2500 : 25,
            verdict === 'block' ? SANCTIONED : verdict === 'cooling' ? MARTA : LUKAS,
          ),
        },
        // Step-up and cooling poll GET /policy/:id every 2 s until the bank clears them; keep them waiting.
        'GET /policy/dec_01HZX7Q2M9': {
          body: decision(
            verdict,
            verdict === 'step-up' ? 2500 : 25,
            verdict === 'block' ? SANCTIONED : verdict === 'cooling' ? MARTA : LUKAS,
          ),
        },
      },
      waitFor:
        verdict === 'approve'
          ? 'Approved'
          : verdict === 'step-up'
            ? 'Needs your laptop'
            : verdict === 'cooling'
              ? 'Waiting period'
              : 'Blocked',
      act: (page) => page.getByText('Technical details').first().click(),
    }),
  ),
  {
    name: 'send-review-offline',
    path: '/send/review',
    storage: {
      'keyline.wallet': wallet(),
      'keyline.pendingSend': {
        to: LUKAS,
        toLabel: 'Lukas Meier',
        knownContact: true,
        amountChf: 20,
        amountUsdc: 25,
      },
    },
    usdc: 120_000_000n,
    bank: { 'POST /policy/evaluate': 'offline' },
    waitFor: 'Swissquote isn’t reachable',
  },
  {
    name: 'send-review-missing-draft',
    path: '/send/review',
    storage: { 'keyline.wallet': wallet() },
    usdc: 120_000_000n,
  },
  // ---- Activity ----
  {
    name: 'activity-confirmed',
    path: `/activity/${USEROP}`,
    storage: { 'keyline.wallet': wallet(), 'keyline.transfers': [transfer('confirmed')] },
    bank: { [`GET /userops/${USEROP}`]: { body: userOpStatus('confirmed') } },
    waitFor: 'In block',
  },
  {
    name: 'activity-pending',
    path: `/activity/${USEROP}`,
    storage: { 'keyline.wallet': wallet(), 'keyline.transfers': [transfer('sent')] },
    bank: { [`GET /userops/${USEROP}`]: { body: userOpStatus('pending') } },
  },
  {
    name: 'activity-included',
    path: `/activity/${USEROP}`,
    storage: { 'keyline.wallet': wallet(), 'keyline.transfers': [transfer('sent')] },
    bank: { [`GET /userops/${USEROP}`]: { body: userOpStatus('included') } },
    waitFor: 'In block',
  },
  {
    name: 'activity-failed',
    path: `/activity/${USEROP}`,
    storage: { 'keyline.wallet': wallet(), 'keyline.transfers': [transfer('failed')] },
    bank: { [`GET /userops/${USEROP}`]: { body: userOpStatus('failed') } },
    waitFor: 'Not accepted by the network',
  },
  {
    name: 'activity-not-found',
    path: `/activity/${USEROP}`,
    storage: { 'keyline.wallet': wallet() },
    bank: {
      [`GET /userops/${USEROP}`]: { status: 404, body: { error: 'not-found', message: 'UserOp not found' } },
    },
  },
  // ---- Placeholders / other routes ----
  { name: 'security-placeholder', path: '/security', storage: { 'keyline.wallet': wallet() } },
  // Phase C routes
  {
    name: 'activity-list',
    path: '/activity',
    storage: {
      'keyline.wallet': wallet(),
      'keyline.transfers': [transfer('confirmed')],
      'keyline.topups': topups,
    },
    usdc: 95_000_000n,
    settleMs: 800,
  },
  {
    name: 'contacts-list',
    path: '/contacts',
    storage: { 'keyline.wallet': wallet() },
    waitFor: 'Lukas Meier',
  },
  { name: 'settings', path: '/settings', storage: { 'keyline.wallet': wallet() }, settleMs: 600 },
  { name: 'help', path: '/help', storage: { 'keyline.wallet': wallet() }, settleMs: 600 },
  { name: 'alerts-empty', path: '/alerts', storage: { 'keyline.wallet': wallet() } },
  { name: 'recover-placeholder', path: '/recover', persona: 'lea-new-phone' },
  { name: 'refused-placeholder', path: '/refused', persona: 'thief' },
  { name: 'dapps-placeholder', path: '/dapps', storage: { 'keyline.wallet': wallet() } },
  { name: 'design-kitchen-sink', path: '/design', fullPage: true, settleMs: 800 },
];

// ---------------------------------------------------------------------------------------------------------------
// v2 journey (SPEC §10) — every scene in light and dark: <name>-light.png / <name>-dark.png
// ---------------------------------------------------------------------------------------------------------------

const toOwnAccount = () => ({
  ...decision('approve', 2.5, FUNDER),
  kind: 'to-own-account',
  tier: 1,
  reasons: ['Your Swissquote account · verified'],
});
const signedOut: BankMap = {
  'GET /sq/me': { status: 401, body: { error: 'unauthorized', message: 'Sign in' } },
};
const hi = { 'keyline.handoffClient': 'Lea' };
const V2_SCENES: Scene[] = [
  // ---- Swissquote web (laptop) ----
  {
    name: 'v2-sq-sign-in',
    path: '/swissquote',
    persona: 'lea-laptop',
    bank: signedOut,
    waitFor: 'Lea’s details',
  },
  {
    name: 'v2-sq-portfolio',
    path: '/swissquote/portfolio',
    persona: 'lea-laptop',
    bank: SQ_WEB,
    waitFor: 'Set up Keyline on my phone',
  },
  {
    name: 'v2-sq-handoff-code',
    path: '/swissquote/portfolio',
    persona: 'lea-laptop',
    bank: SQ_WEB,
    act: async (page) => {
      await page.getByRole('button', { name: 'Set up Keyline on my phone' }).click();
      await page.getByText('Waiting for your phone').waitFor();
    },
  },
  {
    name: 'v2-sq-why-btc',
    path: '/swissquote/portfolio',
    persona: 'lea-laptop',
    bank: SQ_WEB,
    act: async (page) => {
      await page.getByRole('button', { name: 'Why?' }).click();
      await page.getByTestId('why-sheet').waitFor();
    },
    settleMs: 700,
  },
  {
    name: 'v2-sq-move-sheet',
    path: '/swissquote/portfolio',
    persona: 'lea-laptop',
    bank: { ...SQ_WEB, 'GET /sq/safety-key-request': { body: skr('done') } },
    deployed: true,
    act: async (page) => {
      await page.getByRole('button', { name: 'Move USDC to Keyline' }).click();
      await page.getByTestId('move-amount').fill('10');
    },
    settleMs: 700,
  },
  {
    name: 'v2-sq-move-funder-empty',
    path: '/swissquote/portfolio',
    persona: 'lea-laptop',
    bank: {
      ...SQ_WEB,
      'GET /sq/safety-key-request': { body: skr('done') },
      'POST /sq/moves': {
        status: 502,
        body: {
          error: 'upstream',
          message: `Bank funder ${FUNDER} holds 0 USDC — fund it at faucet.circle.com`,
          details: { funder: FUNDER, balance: '0' },
        },
      },
    },
    deployed: true,
    act: async (page) => {
      await page.getByRole('button', { name: 'Move USDC to Keyline' }).click();
      await page.getByTestId('move-amount').fill('10');
      await page.getByTestId('move-submit').click();
      await page.getByTestId('move-funder-empty').waitFor();
    },
    settleMs: 700,
  },
  {
    name: 'v2-sq-safety-key-prompt',
    path: '/swissquote/portfolio',
    persona: 'lea-laptop',
    bank: {
      ...SQ_WEB,
      'GET /sq/safety-key-request': { body: skr('waiting') },
      'GET /handoff/482913': { body: handoff('claimed', SAFE) },
    },
    waitFor: 'Make this computer your Safety key?',
  },
  {
    name: 'v2-sq-tile-protected',
    path: '/swissquote/portfolio',
    persona: 'lea-laptop',
    bank: {
      ...SQ_WEB,
      'GET /sq/safety-key-request': { body: skr('done') },
      'GET /sq/moves': { body: { moves: [move('confirmed')] } },
    },
    deployed: true,
    usdc: 10_000_000n,
    waitFor: 'Protected · 2 of 3 recoverers',
  },
  { name: 'v2-sq-bitcoin-roadmap', path: '/swissquote/bitcoin', persona: 'lea-laptop', bank: SQ_WEB },
  // ---- Phone: /start and onboarding v2 ----
  { name: 'v2-start', path: '/start', waitFor: 'Continue on your phone' },
  {
    name: 'v2-start-wrong-code',
    path: '/start',
    bank: {
      'POST /handoff/000000/claim': { status: 404, body: { error: 'not-found', message: 'Code not found' } },
    },
    act: async (page) => {
      await page.getByTestId('start-code').fill('000000');
      await page.getByTestId('start-continue').click();
      await page.getByText('That code doesn’t match').waitFor();
    },
  },
  { name: 'v2-onboarding-hi', path: '/onboarding', session: hi, waitFor: 'Hi Lea' },
  {
    name: 'v2-onboarding-key',
    path: '/onboarding',
    session: hi,
    act: async (page) => {
      await page.getByTestId('hi-continue').click();
      await page.getByRole('heading', { name: 'A key that stays on this phone' }).waitFor();
    },
    settleMs: 700,
  },
  {
    name: 'v2-onboarding-safety-key-waiting',
    path: '/onboarding',
    storage: { 'keyline.wallet': step(2) },
    bank: { [`GET /wallets/${SAFE}/guardians`]: { body: guardiansBody([]) } },
    waitFor: 'Waiting for your laptop',
  },
  {
    name: 'v2-onboarding-safety-key-confirmed',
    path: '/onboarding',
    storage: { 'keyline.wallet': step(2) },
    bank: { [`GET /wallets/${SAFE}/guardians`]: { body: guardiansBody(['safety-key']) } },
    waitFor: 'Confirmed on your laptop',
  },
  {
    name: 'v2-onboarding-protect',
    path: '/onboarding',
    storage: {
      'keyline.wallet': step(5, { guardians: { safetyKey: SAFETY_KEY, emergencyCard: EMERGENCY_CARD } }),
    },
    waitFor: 'One signature protects your wallet',
  },
  {
    name: 'v2-onboarding-protected',
    path: '/onboarding',
    storage: { 'keyline.wallet': wallet({ onboardingStep: 5, attested: false }) },
    waitFor: 'Any 2 of your 3 recoverers',
    settleMs: 1_000,
  },
  {
    name: 'v2-onboarding-first-funds',
    path: '/onboarding',
    storage: { 'keyline.wallet': wallet({ onboardingStep: 6, attested: true }) },
    waitFor: 'Move your first funds',
  },
  // ---- Phone: home v2, Back to Swissquote, roadmap ----
  {
    name: 'v2-home',
    path: '/',
    storage: { 'keyline.wallet': wallet(), 'keyline.transfers': [transfer('confirmed')] },
    usdc: 10_000_000n,
    ethWei: 10n ** 16n,
    waitFor: 'In your Swissquote account',
    settleMs: 1_200,
  },
  {
    name: 'v2-home-empty',
    path: '/',
    storage: { 'keyline.wallet': wallet() },
    bank: { [`GET /wallets/${SAFE}/events`]: { body: { events: [] } } },
    waitFor: 'In your Swissquote account',
    settleMs: 1_000,
  },
  {
    name: 'v2-back-amount',
    path: '/back',
    storage: { 'keyline.wallet': wallet() },
    usdc: 10_000_000n,
    waitFor: 'Sends to your own Swissquote account',
  },
  {
    name: 'v2-back-review',
    path: '/back',
    storage: { 'keyline.wallet': wallet() },
    usdc: 10_000_000n,
    bank: { 'POST /policy/evaluate': { status: 201, body: toOwnAccount() } },
    act: async (page) => {
      await page.getByTestId('back-amount').fill('2');
      await page.getByTestId('back-review').click();
      await page.getByText('Approved', { exact: true }).waitFor();
    },
    settleMs: 700,
  },
  {
    name: 'v2-security-roadmap-bitcoin',
    path: '/security/bitcoin',
    storage: { 'keyline.wallet': wallet() },
    waitFor: 'Roadmap: Bitcoin',
  },
];

for (const scene of V2_SCENES)
  for (const theme of ['light', 'dark'] as const)
    SCENES.push({ ...scene, name: `qa-${scene.name}-${theme}`, theme });

// Independent scenes: one broken screen must not skip the rest (no serial mode).
test.describe('screens', () => {
  for (const scene of SCENES) {
    test(scene.name, async ({ browser }) => {
      await shoot(browser, scene);
    });
  }
});

export { PERSONA_LABEL };
