// The only place that talks HTTP to the bank. Every response is parsed with a @keyline/shared schema;
// error bodies `{ error, message }` become typed ApiErrors; 501 "not implemented yet" is its own kind so screens
// can show "Not available yet" instead of crashing (SPEC §4, services/bank/README.md).
import {
  type AddGuardianBody,
  ApiErrorSchema,
  type AttestationBody,
  AttestationChallengeResponseSchema,
  AttestationResponseSchema,
  AttestationSchema,
  type ClaimPairingBody,
  ContactSchema,
  type CreateWalletBody,
  CreateWalletResponseSchema,
  DappSchema,
  EventsResponseSchema,
  GuardianSchema,
  GuardiansResponseSchema,
  HealthSchema,
  type LoginVerifyBody,
  LoginVerifyResponseSchema,
  MeResponseSchema,
  NotImplementedSchema,
  PairingSchema,
  PasskeySchema,
  PolicyDecisionSchema,
  type PolicyRequest,
  type RegisterVerifyBody,
  RegisterVerifyResponseSchema,
  type SendUserOpBody,
  SendUserOpResponseSchema,
  type SetModeBody,
  type SponsorBody,
  SponsorResponseSchema,
  type TopupBody,
  TopupResponseSchema,
  UserOpStatusSchema,
  WalletSchema,
} from '@keyline/shared';
import { z } from 'zod';
import { env } from '../env';
import { getDeviceLabel } from './device';

export type ApiErrorKind = 'not-implemented' | 'offline' | 'http' | 'schema';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get notImplemented(): boolean {
    return this.kind === 'not-implemented';
  }
  get offline(): boolean {
    return this.kind === 'offline';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** What to put under "Technical details". */
export function errorDetail(error: unknown): string {
  if (isApiError(error)) {
    const extra = error.details === undefined ? '' : `\n${JSON.stringify(error.details, null, 2)}`;
    return `${error.status} ${error.code}: ${error.message}${extra}`;
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Device-Label': getDeviceLabel() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`${env.bankUrl}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError('offline', 0, 'network', error instanceof Error ? error.message : 'fetch failed');
  }
  const text = await response.text();
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  if (!response.ok) {
    if (response.status === 501) {
      const ni = NotImplementedSchema.safeParse(json);
      const err = ApiErrorSchema.safeParse(json);
      throw new ApiError(
        'not-implemented',
        501,
        'not-implemented-yet',
        err.success ? err.data.message : `Not implemented yet (wave ${ni.success ? ni.data.wave : '?'})`,
        json,
      );
    }
    const err = ApiErrorSchema.safeParse(json);
    if (err.success)
      throw new ApiError('http', response.status, err.data.error, err.data.message, err.data.details);
    throw new ApiError('http', response.status, 'http', `${response.status} ${response.statusText}`, json);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('schema', response.status, 'schema', `Unexpected response shape from ${path}`, {
      issues: parsed.error.issues,
      received: json,
    });
  }
  return parsed.data;
}

// ---- lenient wrappers where the bank's wire shape is still settling (always a superset of the shared schema) ----

const ContactsResponse = z.object({ contacts: z.array(ContactSchema) });
const DappsResponse = z.object({ dapps: z.array(DappSchema) });
const WalletDetailLenient = WalletSchema.extend({
  guardians: z.array(GuardianSchema).optional(),
  passkey: PasskeySchema.optional(),
});
const GuardiansLenient = z.union([GuardiansResponseSchema, z.array(GuardianSchema)]);
const ClaimResponse = z.union([
  PairingSchema,
  z.object({ guardian: GuardianSchema, status: z.string().optional() }),
]);
/** @simplewebauthn options JSON: the server library owns the shape; we only check it is an object with a challenge. */
const WebAuthnOptions = z.object({ challenge: z.string().min(1) }).passthrough();

export type WalletDetailLenient = z.infer<typeof WalletDetailLenient>;

export const api = {
  health: () => request('GET', '/health', HealthSchema),

  auth: {
    registerOptions: (deviceLabel: string) =>
      request('POST', '/auth/passkey/register/options', WebAuthnOptions, { deviceLabel }),
    registerVerify: (body: RegisterVerifyBody) =>
      request('POST', '/auth/passkey/register/verify', RegisterVerifyResponseSchema, body),
    loginOptions: () => request('POST', '/auth/passkey/login/options', WebAuthnOptions, {}),
    loginVerify: (body: LoginVerifyBody) =>
      request('POST', '/auth/passkey/login/verify', LoginVerifyResponseSchema, body),
    session: () => request('GET', '/auth/session', LoginVerifyResponseSchema),
  },

  me: () => request('GET', '/me', MeResponseSchema),
  contacts: async () => (await request('GET', '/contacts', ContactsResponse)).contacts,
  dapps: async () => (await request('GET', '/dapps', DappsResponse)).dapps,

  wallets: {
    create: (body: CreateWalletBody) => request('POST', '/wallets', CreateWalletResponseSchema, body),
    get: (address: string) => request('GET', `/wallets/${address}`, WalletDetailLenient),
    events: async (address: string) =>
      (await request('GET', `/wallets/${address}/events`, EventsResponseSchema)).events,
    addGuardian: (address: string, body: AddGuardianBody) =>
      request('POST', `/wallets/${address}/guardians`, GuardianSchema, body),
    guardians: async (address: string) => {
      const result = await request('GET', `/wallets/${address}/guardians`, GuardiansLenient);
      return Array.isArray(result) ? result : result.guardians;
    },
    setMode: (address: string, body: SetModeBody) =>
      request('POST', `/wallets/${address}/mode`, WalletSchema, body),
  },

  pairings: {
    create: (wallet: string) => request('POST', '/pairings', PairingSchema, { wallet }),
    get: (code: string) => request('GET', `/pairings/${code}`, PairingSchema),
    claim: (code: string, body: ClaimPairingBody) =>
      request('POST', `/pairings/${code}/claim`, ClaimResponse, body),
  },

  policy: {
    evaluate: (body: PolicyRequest) => request('POST', '/policy/evaluate', PolicyDecisionSchema, body),
  },

  userops: {
    sponsor: (body: SponsorBody) => request('POST', '/userops/sponsor', SponsorResponseSchema, body),
    send: (body: SendUserOpBody) => request('POST', '/userops/send', SendUserOpResponseSchema, body),
    status: (hash: string) => request('GET', `/userops/${hash}`, UserOpStatusSchema),
  },

  attestations: {
    challenge: (wallet: string) =>
      request('GET', `/attestations/${wallet}/challenge`, AttestationChallengeResponseSchema),
    submit: (body: AttestationBody) => request('POST', '/attestations', AttestationResponseSchema, body),
    get: (wallet: string) => request('GET', `/attestations/${wallet}`, AttestationSchema),
  },

  topups: {
    create: (body: TopupBody) => request('POST', '/topups', TopupResponseSchema, body),
  },
} as const;
