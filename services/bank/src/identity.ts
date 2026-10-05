// SIMULATED identity check (SPEC §7 persona rules) + the REAL EIP-712 verdict signature.
// The *check* is scripted (thief label / name mismatch → fail); the *signature* is a genuine viem `signTypedData`
// by BANK_VERDICT_PRIVATE_KEY that both guardian processes verify against BANK_VERDICT_ADDRESS. The verdict key is
// not a guardian key: a verdict alone can never move a Safe.
import {
  IDENTITY_VERDICT_TYPES,
  type IdentityVerdict,
  IdentityVerdictSchema,
  identityVerdictDomain,
} from '@keyline/shared';
import { type Address, getAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const REASON_NAME_MISMATCH = 'ID document name mismatch';
export const REASON_LIVENESS = 'liveness check failed';
export const REASON_OTP = 'email code does not match';

export type PersonaInput = {
  /** Label of the device that started the recovery (the thief persona is "Thief · stolen phone"). */
  deviceLabel: string;
  /** Name typed into the simulated e-ID form. */
  eidName: string;
  /** Name on the client's Swissquote file. */
  clientName: string;
  liveness: boolean;
};

export type PersonaResult = {
  verdict: 'pass' | 'fail';
  idCheckPassed: boolean;
  livenessPassed: boolean;
  reasons: string[];
  /** What tripped the rule, for the desk's "identity signals". */
  signals: string[];
};

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * SPEC §7, case-insensitive: `deviceLabel` contains "thief" OR eidPayload.name ≠ client name → fail with
 * ["ID document name mismatch", "liveness check failed"]; otherwise pass. Pure; no I/O.
 */
export const evaluatePersona = (input: PersonaInput): PersonaResult => {
  const thief = norm(input.deviceLabel).includes('thief');
  const nameMismatch = norm(input.eidName) !== norm(input.clientName);
  const signals: string[] = [];
  if (thief) signals.push(`Device label contains "thief" (${input.deviceLabel})`);
  if (nameMismatch) signals.push(`Name on ID "${input.eidName}" ≠ client "${input.clientName}"`);
  if (!input.liveness) signals.push('Liveness toggle was off');
  if (thief || nameMismatch) {
    return {
      verdict: 'fail',
      idCheckPassed: false,
      livenessPassed: false,
      reasons: [REASON_NAME_MISMATCH, REASON_LIVENESS],
      signals,
    };
  }
  if (!input.liveness) {
    return {
      verdict: 'fail',
      idCheckPassed: true,
      livenessPassed: false,
      reasons: [REASON_LIVENESS],
      signals,
    };
  }
  signals.push('Name on ID matches the client file', 'Liveness passed');
  return { verdict: 'pass', idCheckPassed: true, livenessPassed: true, reasons: [], signals };
};

export type VerdictInput = {
  recoveryRequestId: string;
  wallet: Address;
  /** The new passkey's SafeWebAuthnSignerProxy — the guardian checks this binding. */
  newOwner: Address;
  method: IdentityVerdict['method'];
  verdict: 'pass' | 'fail';
  emailOtpPassed: boolean;
  idCheckPassed: boolean;
  livenessPassed: boolean;
  operatorNote?: string;
  /** unix seconds; defaults to now. */
  issuedAt?: number;
};

export const verdictMessage = (v: {
  recoveryRequestId: string;
  wallet: string;
  newOwner: string;
  method: string;
  verdict: string;
  issuedAt: number;
}) => ({
  recoveryRequestId: v.recoveryRequestId,
  wallet: getAddress(v.wallet),
  newOwner: getAddress(v.newOwner),
  method: v.method,
  verdict: v.verdict,
  issuedAt: BigInt(v.issuedAt),
});

/** Signs the pinned typed data (packages/shared/src/typed-data.ts) with the verdict key. */
export const signIdentityVerdict = async (
  verdictPrivateKey: Hex,
  chainId: number,
  input: VerdictInput,
): Promise<IdentityVerdict> => {
  const account = privateKeyToAccount(verdictPrivateKey);
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000);
  const signature = await account.signTypedData({
    domain: identityVerdictDomain(chainId),
    types: IDENTITY_VERDICT_TYPES,
    primaryType: 'IdentityVerdict',
    message: verdictMessage({ ...input, issuedAt }),
  });
  return IdentityVerdictSchema.parse({
    recoveryRequestId: input.recoveryRequestId,
    wallet: getAddress(input.wallet),
    newOwner: getAddress(input.newOwner),
    method: input.method,
    emailOtpPassed: input.emailOtpPassed,
    idCheckPassed: input.idCheckPassed,
    livenessPassed: input.livenessPassed,
    operatorNote: input.operatorNote,
    verdict: input.verdict,
    signedBy: 'bank',
    issuedAt,
    signature,
    simulated: true,
  });
};
