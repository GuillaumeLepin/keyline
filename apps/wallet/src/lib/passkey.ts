// Passkey ceremonies with @simplewebauthn/browser against the bank's options. Registration returns the public
// key (x, y) the bank extracted; login returns the session + wallet so a device can rebuild its local profile.
import type { Passkey, Wallet } from '@keyline/shared';
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { api } from './api';
import { getDeviceLabel } from './device';
import { GESTURE_REFUSAL_MS, PasskeyCancelledError, PasskeyGestureError } from './reads';
import type { LocalWallet } from './storage';

export class PasskeyUnsupportedError extends Error {
  constructor() {
    super('WebAuthn is not available in this browser');
    this.name = 'PasskeyUnsupportedError';
  }
}

function translate(error: unknown, started: number): never {
  // Safari refuses a WebAuthn call outside a fresh tap instantly; a person dismissing the prompt takes longer.
  const fast = Date.now() - started < GESTURE_REFUSAL_MS;
  const cause = error instanceof WebAuthnError ? error.cause : error;
  if (cause instanceof DOMException && cause.name === 'SecurityError') throw new PasskeyGestureError();
  if (fast && cause instanceof DOMException && cause.name === 'NotAllowedError')
    throw new PasskeyGestureError();
  if (fast && error instanceof WebAuthnError && error.name === 'NotAllowedError')
    throw new PasskeyGestureError();
  if (error instanceof WebAuthnError) {
    if (error.code === 'ERROR_CEREMONY_ABORTED' || error.name === 'NotAllowedError')
      throw new PasskeyCancelledError();
    if (
      error.code === 'ERROR_AUTHENTICATOR_GENERAL_ERROR' ||
      error.code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'
    ) {
      if (error.cause instanceof DOMException && error.cause.name === 'NotAllowedError')
        throw new PasskeyCancelledError();
    }
  }
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
    throw new PasskeyCancelledError();
  }
  throw error;
}

// Safari: the bank's options are fetched BEFORE the tap (prefetch* on screen show), so the tap's first await is the
// WebAuthn call. Challenges live 5 min on the bank; a prefetched one is used for at most 4.
const OPTIONS_FRESH_MS = 4 * 60_000;
let registerCache: {
  label: string;
  at: number;
  options: Promise<PublicKeyCredentialCreationOptionsJSON>;
} | null = null;
let loginCache: { at: number; options: Promise<PublicKeyCredentialRequestOptionsJSON> } | null = null;

/** Fetch registration options ahead of the tap (idempotent while fresh). */
export function prefetchRegisterOptions(): void {
  const label = getDeviceLabel();
  if (registerCache && registerCache.label === label && Date.now() - registerCache.at < OPTIONS_FRESH_MS)
    return;
  const options = api.auth.registerOptions(
    label,
  ) as unknown as Promise<PublicKeyCredentialCreationOptionsJSON>;
  registerCache = { label, at: Date.now(), options };
  options.catch(() => {
    if (registerCache?.options === options) registerCache = null;
  });
}

/** Fetch login options ahead of the tap (idempotent while fresh). */
export function prefetchLoginOptions(): void {
  if (loginCache && Date.now() - loginCache.at < OPTIONS_FRESH_MS) return;
  const options = api.auth.loginOptions() as unknown as Promise<PublicKeyCredentialRequestOptionsJSON>;
  loginCache = { at: Date.now(), options };
  options.catch(() => {
    if (loginCache?.options === options) loginCache = null;
  });
}

export async function registerPasskey(): Promise<Passkey> {
  if (!browserSupportsWebAuthn()) throw new PasskeyUnsupportedError();
  const deviceLabel = getDeviceLabel();
  const cached =
    registerCache && registerCache.label === deviceLabel && Date.now() - registerCache.at < OPTIONS_FRESH_MS
      ? registerCache.options
      : null;
  // A resolved promise adds only a microtask: still inside the tap's activation.
  const options = await (cached ??
    (api.auth.registerOptions(deviceLabel) as unknown as Promise<PublicKeyCredentialCreationOptionsJSON>));
  let credential: Awaited<ReturnType<typeof startRegistration>>;
  const started = Date.now();
  try {
    credential = await startRegistration({ optionsJSON: options });
  } catch (error) {
    // Keep a refused-for-gesture challenge for the retry tap; a used or cancelled one is dropped.
    if (!(error instanceof WebAuthnError) || Date.now() - started >= GESTURE_REFUSAL_MS) registerCache = null;
    translate(error, started);
  }
  registerCache = null;
  const { passkey } = await api.auth.registerVerify({
    credential: { ...credential, clientExtensionResults: { ...credential.clientExtensionResults } },
    deviceLabel,
  });
  return passkey;
}

export interface LoginResult {
  readonly passkey: Passkey;
  readonly wallet: Wallet | null;
}

export async function loginWithPasskey(): Promise<LoginResult> {
  if (!browserSupportsWebAuthn()) throw new PasskeyUnsupportedError();
  const cached = loginCache && Date.now() - loginCache.at < OPTIONS_FRESH_MS ? loginCache.options : null;
  const options = await (cached ??
    (api.auth.loginOptions() as unknown as Promise<PublicKeyCredentialRequestOptionsJSON>));
  let credential: Awaited<ReturnType<typeof startAuthentication>>;
  const started = Date.now();
  try {
    credential = await startAuthentication({ optionsJSON: options });
  } catch (error) {
    if (!(error instanceof WebAuthnError) || Date.now() - started >= GESTURE_REFUSAL_MS) loginCache = null;
    translate(error, started);
  }
  loginCache = null;
  const result = await api.auth.loginVerify({
    credential: { ...credential, clientExtensionResults: { ...credential.clientExtensionResults } },
  });
  return { passkey: result.passkey, wallet: result.wallet };
}

/** Rebuild the per-device profile from what the bank knows about this passkey (login on a device with no local state). */
export function localWalletFromLogin(login: LoginResult): LocalWallet | null {
  if (!login.wallet) return null;
  return {
    address: login.wallet.address,
    credentialId: login.passkey.credentialId,
    pubKeyX: login.passkey.pubKeyX,
    pubKeyY: login.passkey.pubKeyY,
    deviceLabel: getDeviceLabel(),
    status: login.wallet.status === 'pending' ? 'pending' : 'deployed',
    protectTxHash: login.wallet.deployTxHash,
    attested: login.wallet.attested,
    recoveryMode: login.wallet.recoveryMode,
    guardians: {},
    onboardingStep: login.wallet.status === 'pending' ? 2 : 7,
  };
}
