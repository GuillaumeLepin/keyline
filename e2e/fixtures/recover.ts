// The /recover screen driven step by step (SPEC F3.1–F3.2 / F4.2), shared by the story, attacker and fraud specs.
import { expect } from '@playwright/test';
import { bodyText, inboxOtp, LEA_EMAIL, type PersonaSession } from './personas';

/** Minimal shape of `GET /recoveries/:id` the specs assert on (full schema in @keyline/shared). */
export interface RecoveryView {
  id: string;
  status:
    | 'identity-pending'
    | 'identity-refused'
    | 'awaiting-guardians'
    | 'executed-waiting'
    | 'finalized'
    | 'cancelled';
  waitingFor?: string;
  walletAddress: string;
  reasons: string[];
  newOwner: { signerProxyAddress: string; credentialId: string };
  guardianConfirmations: { kind: string; txHash?: string; void?: boolean; at: string }[];
  onchain: {
    executedTxHash?: string;
    executeAfter?: string;
    finalizedTxHash?: string;
    cancelledTxHash?: string;
  };
}

/** Steps 1–2: new passkey on this device → email → the bank opens the request (deploys the signer) → code entered. */
export async function startRecoveryToIdentity(
  device: PersonaSession,
  { email = LEA_EMAIL }: { email?: string } = {},
): Promise<{ recoveryId: string; otp: string }> {
  const page = device.page;
  await device.goto('/recover');
  await expect(page.getByText('Create a key on this phone')).toBeVisible();
  await page.getByRole('button', { name: 'Create with Face ID / fingerprint' }).click();
  await expect(page.getByText('Key created on this phone.')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  const started = Date.now();
  await page.getByRole('button', { name: 'Send code' }).click();
  // POST /recoveries deploys the new signer proxy through the sponsored relayer: 10–90 s on Base Sepolia.
  const codeField = page.getByRole('textbox', { name: '6-digit code' });
  const error = page.locator('.kl-error');
  await expect(codeField.or(error)).toBeVisible({ timeout: 240_000 });
  if (await error.isVisible()) throw new Error(`recovery could not start: ${await bodyText(page)}`);
  console.info(`recovery opened (signer deployed) after ${Math.round((Date.now() - started) / 1000)} s`);

  const pending = await page.evaluate(() => window.localStorage.getItem('keyline.recovery'));
  const recoveryId = pending ? (JSON.parse(pending) as { recoveryId?: string }).recoveryId : undefined;
  if (!recoveryId) throw new Error(`no recoveryId in localStorage (${pending})`);
  const otp = await inboxOtp(email, recoveryId);
  await codeField.fill(otp);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Confirm it’s you')).toBeVisible({ timeout: 20_000 });
  return { recoveryId, otp };
}

/** Step 3: the SIMULATED swiyu form. Lea's name is prefilled for Lea; the thief types his own. */
export async function submitIdentity(device: PersonaSession, name?: string): Promise<void> {
  const page = device.page;
  if (name !== undefined) await page.getByRole('textbox', { name: 'Name on ID' }).fill(name);
  await page.getByRole('button', { name: 'Submit identity check' }).click();
}
