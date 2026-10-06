// The only place that talks HTTP to the bank. Every response is parsed with a @keyline/shared schema;
// error bodies `{ error, message }` become typed ApiErrors; 501 "not implemented yet" is its own kind so screens
// can show "Not available yet" instead of crashing (SPEC §4, services/bank/README.md).
import {
  type AddGuardianBody,
  AlertsResponseSchema,
  ApiErrorSchema,
  type AttestationBody,
  AttestationChallengeResponseSchema,
  AttestationResponseSchema,
  AttestationSchema,
  type ClaimPairingBody,
  ContactSchema,
  type CreateRecoveryBody,
  type CreateWalletBody,
  CreateWalletResponseSchema,
  DappSchema,
  DeskQueueResponseSchema,
  EidResponseSchema,
  EventsResponseSchema,
  GuardianSchema,
  GuardiansResponseSchema,
  HealthSchema,
  InboxResponseSchema,
  type LoginVerifyBody,
  LoginVerifyResponseSchema,
  MeResponseSchema,
  type MockEidBody,
  NotImplementedSchema,
  type OperatorActionBody,
  PairingSchema,
  PasskeySchema,
  PendingApprovalsResponseSchema,
  PolicyDecisionSchema,
  type PolicyRequest,
  type RecoveryConfirmBody,
  type RecoveryIdentityBody,
  RecoveryRequestSchema,
  RecoveryTypedDataResponseSchema,
  type RegisterVerifyBody,
  RegisterVerifyResponseSchema,
  type SendUserOpBody,
  SendUserOpResponseSchema,
  type SetModeBody,
  type SponsorBody,
  SponsorResponseSchema,
  type StepUpBody,
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

/**
 * HTTP header values must be ISO-8859-1; `fetch` throws on anything else. "Lea · laptop — Safety key" carries an
 * em dash (U+2014), so the header gets an ASCII dash while JSON bodies keep the exact label.
 */
function headerSafe(label: string): string {
  return Array.from(label, (ch) => (ch.charCodeAt(0) > 0xff ? '-' : ch)).join('');
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Device-Label': headerSafe(getDeviceLabel()),
    ...extraHeaders,
  };
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
/** `POST /pairings/:code/claim` answers with the Guardian it registered (201); older drafts wrapped it. */
const ClaimResponse = z.union([GuardianSchema, PairingSchema, z.object({ guardian: GuardianSchema })]);
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
    /** Re-read a decision: `cooling` auto-promotes to `approve` once `coolingUntil` passed; step-up shows `stepUp`. */
    get: (id: string) => request('GET', `/policy/${id}`, PolicyDecisionSchema),
    stepUp: (id: string, body: StepUpBody) =>
      request('POST', `/policy/${id}/step-up`, PolicyDecisionSchema, body),
    cancel: (id: string) => request('POST', `/policy/${id}/cancel`, PolicyDecisionSchema, {}),
    pendingApprovals: async (wallet: string) =>
      (await request('GET', `/wallets/${wallet}/pending-approvals`, PendingApprovalsResponseSchema))
        .decisions,
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

  // ---- F3 / F4 recovery (bank orchestrates; the client only signs with its own recoverers) ----
  recoveries: {
    create: (body: CreateRecoveryBody) => request('POST', '/recoveries', RecoveryRequestSchema, body),
    get: (id: string) => request('GET', `/recoveries/${id}`, RecoveryRequestSchema),
    identity: (id: string, body: RecoveryIdentityBody) =>
      request('POST', `/recoveries/${id}/identity`, RecoveryRequestSchema, body),
    confirm: (id: string, body: RecoveryConfirmBody) =>
      request('POST', `/recoveries/${id}/confirm`, RecoveryRequestSchema, body),
    typedData: (id: string) =>
      request('GET', `/recoveries/${id}/typed-data`, RecoveryTypedDataResponseSchema),
  },

  alerts: async (address: string) =>
    (await request('GET', `/wallets/${address}/alerts`, AlertsResponseSchema)).alerts,

  mock: {
    inbox: async (email: string) =>
      (await request('GET', `/mock/inbox/${encodeURIComponent(email)}`, InboxResponseSchema)).messages,
    eid: (body: MockEidBody) => request('POST', '/mock/eid', EidResponseSchema, body),
  },

  /** Operator console. The token lives in sessionStorage on the desk profile and is sent as `X-Operator-Token`. */
  desk: {
    queue: (token: string) =>
      request('GET', '/desk/queue', DeskQueueResponseSchema, undefined, { 'X-Operator-Token': token }),
    events: (token: string) =>
      request('GET', '/desk/events', EventsResponseSchema, undefined, { 'X-Operator-Token': token }),
    operator: (token: string, id: string, body: OperatorActionBody) =>
      request('POST', `/recoveries/${id}/operator`, RecoveryRequestSchema, body, {
        'X-Operator-Token': token,
      }),
  },
} as const;
