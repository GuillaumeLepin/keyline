// The five demo personas as isolated browser contexts, each with its own CDP virtual WebAuthn authenticator.
//
// A context = a Chrome profile: its own localStorage (`keyline.wallet`, `keyline.device`), its own IndexedDB (the
// laptop's Safety key) and its own authenticator (the phone's passkey). "Losing the phone" is
// `WebAuthn.removeVirtualAuthenticator` on Lea's phone — the credential is gone, exactly like a lost device.
// Virtual authenticators exist only for the lifetime of the CDP session; the live demo uses real platform passkeys.
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';

export type Persona = 'lea-phone' | 'lea-laptop' | 'lea-new-phone' | 'thief' | 'desk';

export const PERSONAS: readonly Persona[] = ['lea-phone', 'lea-laptop', 'lea-new-phone', 'thief', 'desk'];

/** Exact DeviceBar labels (apps/wallet/src/copy.ts `device`). */
export const PERSONA_LABEL: Readonly<Record<Persona, string>> = {
  'lea-phone': 'Lea · phone',
  'lea-laptop': 'Lea · laptop — Safety key',
  'lea-new-phone': 'Lea · new phone',
  thief: 'Thief · stolen phone',
  desk: 'Swissquote desk (simulated)',
};

/** Personas that own a passkey-capable device. The thief has the phone but cannot pass biometrics (no credential). */
const WITH_AUTHENTICATOR: ReadonlySet<Persona> = new Set(['lea-phone', 'lea-laptop', 'lea-new-phone']);

export interface PersonaSession {
  readonly persona: Persona;
  readonly label: string;
  readonly context: BrowserContext;
  readonly page: Page;
  /** Null for personas without a device key (thief, desk). */
  readonly authenticatorId: string | null;
  /** `path` gets `?device=<persona>` appended so the DeviceBar + `X-Device-Label` match this profile. */
  goto(path: string): Promise<void>;
  /** Lost / wiped device: the credential disappears with the authenticator. */
  loseDevice(): Promise<void>;
  /** Console + page errors collected since the context opened (assert empty at the end of a step). */
  readonly errors: string[];
  close(): Promise<void>;
}

export interface OpenPersonaOptions {
  /** Record video into this directory (Playwright `recordVideo`). */
  readonly videoDir?: string;
  /** Default 1280×960: the phone frame plus the DeviceBar, readable in the demo video. */
  readonly viewport?: { width: number; height: number };
}

export async function openPersona(
  browser: Browser,
  persona: Persona,
  options: OpenPersonaOptions = {},
): Promise<PersonaSession> {
  const viewport = options.viewport ?? { width: 1280, height: 960 };
  const context = await browser.newContext({
    viewport,
    locale: 'en-CH',
    timezoneId: 'Europe/Zurich',
    recordVideo: options.videoDir ? { dir: options.videoDir, size: viewport } : undefined,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`[pageerror ${persona}] ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console ${persona}] ${message.text().slice(0, 400)}`);
  });

  let cdp: CDPSession | null = null;
  let authenticatorId: string | null = null;
  if (WITH_AUTHENTICATOR.has(persona)) {
    cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const added = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    authenticatorId = added.authenticatorId;
  }

  const base = process.env.E2E_WALLET_URL ?? 'http://localhost:3000';
  return {
    persona,
    label: PERSONA_LABEL[persona],
    context,
    page,
    authenticatorId,
    errors,
    async goto(path: string): Promise<void> {
      const url = new URL(path, base);
      url.searchParams.set('device', persona);
      await page.goto(url.toString(), { waitUntil: 'networkidle' });
    },
    async loseDevice(): Promise<void> {
      if (!cdp || !authenticatorId) return;
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
      authenticatorId = null;
    },
    close: () => context.close(),
  };
}

/** Bank base URL for direct API assertions (`GET /attestations/:wallet`, …). */
export function bankUrl(): string {
  return process.env.E2E_BANK_URL ?? 'http://localhost:4000';
}

/** Header values must be ISO-8859-1; the laptop label carries an em dash (same rule as apps/wallet/src/lib/api.ts). */
function headerSafe(label: string): string {
  return Array.from(label, (ch) => (ch.charCodeAt(0) > 0xff ? '-' : ch)).join('');
}

/** Client routes accept `X-Device-Label` instead of the passkey session while DEMO_FAST_MODE=true (docs/MOCKS.md). */
export async function bankGet<T>(
  path: string,
  persona: Persona = 'lea-phone',
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${bankUrl()}${path}`, {
    headers: {
      Accept: 'application/json',
      'X-Device-Label': headerSafe(PERSONA_LABEL[persona]),
    },
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}

/** The wallet profile the app keeps in localStorage (apps/wallet/src/lib/storage.ts `LocalWalletSchema`). */
export interface LocalWallet {
  address: string;
  credentialId: string;
  pubKeyX: string;
  pubKeyY: string;
  deviceLabel: string;
  status: 'pending' | 'deployed';
  protectTxHash?: string;
  attested: boolean;
  recoveryMode: 'default' | 'assisted';
  guardians: { safetyKey?: string; emergencyCard?: string; swissquote?: string };
  onboardingStep: number;
}

export async function readLocalWallet(page: Page): Promise<LocalWallet | null> {
  const raw = await page.evaluate(() => window.localStorage.getItem('keyline.wallet'));
  return raw ? (JSON.parse(raw) as LocalWallet) : null;
}

export async function writeLocalWallet(page: Page, wallet: LocalWallet): Promise<void> {
  await page.evaluate((w) => window.localStorage.setItem('keyline.wallet', JSON.stringify(w)), wallet);
}

/** Visible text of the phone frame, newlines collapsed — handy in failure messages. */
export async function bodyText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
}
