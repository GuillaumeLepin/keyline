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
import { PasskeyCancelledError } from './chain';
import { getDeviceLabel } from './device';
import type { LocalWallet } from './storage';

export class PasskeyUnsupportedError extends Error {
  constructor() {
    super('WebAuthn is not available in this browser');
    this.name = 'PasskeyUnsupportedError';
  }
}

function translate(error: unknown): never {
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

export async function registerPasskey(): Promise<Passkey> {
  if (!browserSupportsWebAuthn()) throw new PasskeyUnsupportedError();
  const deviceLabel = getDeviceLabel();
  const options = (await api.auth.registerOptions(
    deviceLabel,
  )) as unknown as PublicKeyCredentialCreationOptionsJSON;
  let credential: Awaited<ReturnType<typeof startRegistration>>;
  try {
    credential = await startRegistration({ optionsJSON: options });
  } catch (error) {
    translate(error);
  }
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
  const options = (await api.auth.loginOptions()) as unknown as PublicKeyCredentialRequestOptionsJSON;
  let credential: Awaited<ReturnType<typeof startAuthentication>>;
  try {
    credential = await startAuthentication({ optionsJSON: options });
  } catch (error) {
    translate(error);
  }
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
