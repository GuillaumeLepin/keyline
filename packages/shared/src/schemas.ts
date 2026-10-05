// HTTP contract for every Keyline service and the client (SPEC §2 entities, SPEC §4 bodies).
// Owned by bank-backend. Extend freely; never rename or remove a field without telling the orchestrator.
import { z } from 'zod';
import { Address, Hex, IdentityVerdictSchema } from './guardian';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** 32-byte hex (tx hash, userOp hash, decision hash). */
export const Hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'bytes32');
/** ISO-8601 timestamp as produced by `new Date().toISOString()`. */
export const IsoDate = z.string().datetime({ offset: true });
/** Unsigned integer encoded as a decimal string (wei / token base units; avoids JSON number precision). */
export const WeiString = z.string().regex(/^\d+$/, 'decimal integer string');
/** Hex or decimal string — userOp gas fields arrive in both forms depending on the SDK. */
export const HexOrDecString = z.string().regex(/^(0x[0-9a-fA-F]+|\d+)$/, 'hex or decimal string');

export const KycLevelSchema = z.enum(['full']);
export const WalletStatusSchema = z.enum(['pending', 'deployed', 'recovering']);
export const RecoveryModeSchema = z.enum(['default', 'assisted']);
export type RecoveryMode = z.infer<typeof RecoveryModeSchema>;
export const GuardianKindSchema = z.enum(['safety-key', 'emergency-card', 'swissquote', 'partner']);
export type GuardianKind = z.infer<typeof GuardianKindSchema>;
/** Guardian kinds that are held by the client and can co-sign (step-up / recovery confirm). */
export const ClientGuardianKindSchema = z.enum(['safety-key', 'emergency-card']);
export const PolicyVerdictSchema = z.enum(['approve', 'step-up', 'cooling', 'block']);
export const TierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const RiskSchema = z.enum(['none', 'warn', 'danger']);
export const RecoveryStatusSchema = z.enum([
  'identity-pending',
  'identity-refused',
  'awaiting-guardians',
  'executed-waiting',
  'finalized',
  'cancelled',
]);
export const UserOpStatusValueSchema = z.enum(['pending', 'included', 'confirmed', 'failed']);
export type UserOpStatusValue = z.infer<typeof UserOpStatusValueSchema>;
export const OperatorActionSchema = z.enum(['approve', 'refuse', 'override']);
export const ServiceNameSchema = z.enum(['bank', 'sq-guardian', 'partner-guardian', 'wallet']);

// ---------------------------------------------------------------------------
// SPEC §2 entities
// ---------------------------------------------------------------------------

export const ClientSchema = z.object({
  id: z.string().min(1), // Swissquote client id, e.g. SQ-48213-LK
  name: z.string().min(1),
  email: z.string().email(),
  kycLevel: KycLevelSchema,
  createdAt: IsoDate,
});
export type Client = z.infer<typeof ClientSchema>;

export const WalletSchema = z.object({
  address: Address,
  clientId: z.string().min(1),
  chainId: z.number().int().positive(),
  ownerCredentialId: z.string().min(1), // base64url credential id of the owner passkey
  status: WalletStatusSchema,
  recoveryMode: RecoveryModeSchema,
  createdAt: IsoDate,
  deployTxHash: Hash32.optional(),
  /** True once POST /attestations verified ownership (ERC-1271). Top-ups require it (Travel Rule). */
  attested: z.boolean().default(false),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const PasskeySchema = z.object({
  credentialId: z.string().min(1), // base64url, as returned by @simplewebauthn
  walletAddress: Address.optional(), // unset until POST /wallets binds the passkey to a Safe
  role: z.literal('owner'),
  pubKeyX: Hex, // 0x-prefixed 32-byte P-256 coordinate
  pubKeyY: Hex,
  signerProxyAddress: Address.optional(),
  deviceLabel: z.string().min(1),
  createdAt: IsoDate,
  revokedAt: IsoDate.optional(),
});
export type Passkey = z.infer<typeof PasskeySchema>;

export const GuardianSchema = z.object({
  walletAddress: Address,
  kind: GuardianKindSchema,
  address: Address,
  addedTxHash: Hash32.optional(), // unset until the protect userOp is confirmed
});
export type Guardian = z.infer<typeof GuardianSchema>;

export const AttestationSchema = z.object({
  walletAddress: Address,
  clientId: z.string().min(1),
  nonce: z.string().min(1),
  chainId: z.number().int().positive(),
  signature: Hex,
  verifiedAt: IsoDate,
  method: z.literal('erc1271'),
});
export type Attestation = z.infer<typeof AttestationSchema>;

export const ContactSchema = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1),
  address: Address,
  firstSeenAt: IsoDate,
  verifiedOwnership: z.boolean(),
  /** Present (and true) only on the seeded sanctioned test contact. */
  simulated: z.literal(true).optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const DappSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  allowlisted: z.boolean(),
  contracts: z.array(Address),
  /** True for DemoSwap and anything else that is not a real deployed protocol. */
  simulated: z.literal(true).optional(),
});
export type Dapp = z.infer<typeof DappSchema>;

export const CallSchema = z.object({
  to: Address,
  value: WeiString, // wei, decimal string
  data: Hex,
});
export type Call = z.infer<typeof CallSchema>;

/**
 * What the client is asking the policy engine about.
 * - `protect`: the first userOp (deploy + enable recovery module + add guardians). The bank RECOMPUTES the calls
 *   from the wallet's registered guardians; `calls` may be empty and is ignored.
 * - `transfer`: exactly one ERC-20 `transfer` on USDC; `chfValue` is recomputed by the bank from the amount.
 */
export const PolicyKindSchema = z.enum(['protect', 'transfer']);
export type PolicyKind = z.infer<typeof PolicyKindSchema>;

export const PolicyRequestSchema = z.object({
  /** Client-generated id (uuid). Becomes the decisionId. Generated server-side when omitted. */
  id: z.string().min(1).optional(),
  kind: PolicyKindSchema.default('transfer'),
  walletAddress: Address,
  calls: z.array(CallSchema).default([]),
  /** Client's estimate; the bank recomputes it from the decoded amount and the (simulated) rate. */
  chfValue: z.number().nonnegative().default(0),
  /** Defaults to the wallet itself for `protect`; must equal the decoded ERC-20 recipient for `transfer`. */
  recipientAddress: Address.optional(),
  dappId: z.string().min(1).optional(),
  deviceLabel: z.string().min(1),
  requestedAt: IsoDate.optional(),
});
export type PolicyRequest = z.infer<typeof PolicyRequestSchema>;

export const AssetChangeSchema = z.object({
  token: Address,
  symbol: z.string().min(1),
  before: WeiString,
  after: WeiString,
  delta: z.string().regex(/^-?\d+$/, 'signed decimal integer string'),
});
export type AssetChange = z.infer<typeof AssetChangeSchema>;

export const DecodedCallSchema = z.object({
  to: Address,
  fn: z.string().min(1), // e.g. "transfer(address,uint256)" or "unknown"
  args: z.array(z.string()),
  humanText: z.string(),
  risk: RiskSchema,
});
export type DecodedCall = z.infer<typeof DecodedCallSchema>;

export const SimulationSchema = z.object({
  ok: z.boolean(),
  assetChanges: z.array(AssetChangeSchema),
  decodedCalls: z.array(DecodedCallSchema),
  gasEstimate: WeiString,
  provider: z.enum(['eth_simulateV1', 'fallback']),
  revertReason: z.string().optional(),
  /** Present (true) when provider is `fallback` (decode only, no state simulation). */
  simulated: z.literal(true).optional(),
});
export type Simulation = z.infer<typeof SimulationSchema>;

export const ScreeningSchema = z.object({
  counterparty: Address,
  listsChecked: z.tuple([z.literal('OFAC-SDN'), z.literal('SECO')]),
  hit: z.boolean(),
  source: z.string().optional(), // which list / entry matched
  simulatedHit: z.boolean(), // true when the hit is our seeded test address
  /** SECO publishes names, not addresses — that part of the screening is always simulated. */
  simulated: z.literal(true),
  note: z.string().optional(),
});
export type Screening = z.infer<typeof ScreeningSchema>;

export const SponsorshipSchema = z.object({
  sponsored: z.boolean(),
  remainingToday: z.number().int().nonnegative(),
  dailyCap: z.number().int().positive().optional(),
});
export type Sponsorship = z.infer<typeof SponsorshipSchema>;

export const StepUpStateSchema = z.object({
  satisfiedBy: z.literal('safety-key').optional(),
  signature: Hex.optional(),
  satisfiedAt: IsoDate.optional(),
});
export type StepUpState = z.infer<typeof StepUpStateSchema>;

/** Static CHF conversion used by the policy engine (SIMULATED market data). */
export const FxSchema = z.object({
  pair: z.literal('USDC/CHF'),
  rate: z.number().positive(),
  simulated: z.literal(true),
});
export type Fx = z.infer<typeof FxSchema>;

export const PolicyDecisionSchema = z.object({
  requestId: z.string().min(1),
  /** Same as requestId; exposed so clients can pass `decisionId` to /userops/sponsor without ambiguity. */
  decisionId: z.string().min(1),
  walletAddress: Address,
  kind: PolicyKindSchema,
  /**
   * The calls the decision covers — for `protect` these are recomputed by the bank (enableModule + addGuardian×n,
   * thresholds 1,2,2) and the client MUST build its userOp from them; for `transfer` they echo the validated call.
   */
  calls: z.array(CallSchema),
  verdict: PolicyVerdictSchema,
  tier: TierSchema,
  reasons: z.array(z.string()),
  simulation: SimulationSchema,
  screening: ScreeningSchema,
  sponsorship: SponsorshipSchema,
  stepUp: StepUpStateSchema.optional(),
  /** keccak256 of the ABI-encoded calls; /userops/sponsor checks the userOp's callData against it. */
  callsHash: Hash32,
  /** For `cooling` verdicts: when the client may proceed. */
  coolingUntil: IsoDate.optional(),
  chfValue: z.number().nonnegative(),
  fx: FxSchema,
  expiresAt: IsoDate,
  decidedAt: IsoDate,
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const NewOwnerSchema = z.object({
  pubKeyX: Hex,
  pubKeyY: Hex,
  credentialId: z.string().min(1),
  signerProxyAddress: Address,
});
export type NewOwner = z.infer<typeof NewOwnerSchema>;

export const RequestedFromSchema = z.object({
  deviceLabel: z.string().min(1),
  ip: z.string(),
  userAgent: z.string(),
});
export type RequestedFrom = z.infer<typeof RequestedFromSchema>;

export const GuardianConfirmationSchema = z.object({
  kind: GuardianKindSchema,
  txHash: Hash32.optional(),
  signature: Hex.optional(),
  at: IsoDate,
});
export type GuardianConfirmation = z.infer<typeof GuardianConfirmationSchema>;

export const RecoveryOnchainSchema = z.object({
  executedTxHash: Hash32.optional(),
  executeAfter: IsoDate.optional(),
  finalizedTxHash: Hash32.optional(),
  cancelledTxHash: Hash32.optional(),
});
export type RecoveryOnchain = z.infer<typeof RecoveryOnchainSchema>;

/** Identity state before the verdict is signed (status identity-pending). */
export const IdentityPendingSchema = z.object({
  emailOtpPassed: z.boolean(),
  idCheckPassed: z.boolean().optional(),
  livenessPassed: z.boolean().optional(),
  operatorNote: z.string().optional(),
  verdict: z.literal('pending'),
  simulated: z.literal(true),
});
export type IdentityPending = z.infer<typeof IdentityPendingSchema>;

export const RecoveryRequestSchema = z.object({
  id: z.string().min(1),
  walletAddress: Address,
  newOwner: NewOwnerSchema,
  requestedFrom: RequestedFromSchema,
  identity: z.union([IdentityVerdictSchema, IdentityPendingSchema]),
  guardianConfirmations: z.array(GuardianConfirmationSchema),
  onchain: RecoveryOnchainSchema,
  status: RecoveryStatusSchema,
  recoveryMode: RecoveryModeSchema,
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type RecoveryRequest = z.infer<typeof RecoveryRequestSchema>;

export const EventSchema = z.object({
  id: z.string().min(1),
  service: ServiceNameSchema,
  type: z.string().min(1), // dotted, e.g. "passkey.registered", "recovery.executed"
  walletAddress: Address.optional(),
  payload: z.record(z.string(), z.unknown()),
  at: IsoDate,
});
export type Event = z.infer<typeof EventSchema>;

// ---------------------------------------------------------------------------
// SPEC §4 — bank request / response bodies
// ---------------------------------------------------------------------------

/** Loose WebAuthn JSON wire shapes (what @simplewebauthn/browser returns). Validated for real by the server lib. */
export const WebAuthnRegistrationCredentialSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: z.string().min(1),
    attestationObject: z.string().min(1),
    authenticatorData: z.string().optional(),
    transports: z.array(z.string()).optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: z.string().optional(),
  }),
  authenticatorAttachment: z.string().optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
});
export type WebAuthnRegistrationCredential = z.infer<typeof WebAuthnRegistrationCredentialSchema>;

export const WebAuthnAuthenticationCredentialSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: z.string().min(1),
    authenticatorData: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().optional(),
  }),
  authenticatorAttachment: z.string().optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
});
export type WebAuthnAuthenticationCredential = z.infer<typeof WebAuthnAuthenticationCredentialSchema>;

export const RegisterOptionsBodySchema = z.object({ deviceLabel: z.string().min(1).max(64) });
export type RegisterOptionsBody = z.infer<typeof RegisterOptionsBodySchema>;

export const RegisterVerifyBodySchema = z.object({
  credential: WebAuthnRegistrationCredentialSchema,
  deviceLabel: z.string().min(1).max(64),
});
export type RegisterVerifyBody = z.infer<typeof RegisterVerifyBodySchema>;

export const RegisterVerifyResponseSchema = z.object({ passkey: PasskeySchema });
export type RegisterVerifyResponse = z.infer<typeof RegisterVerifyResponseSchema>;

export const LoginVerifyBodySchema = z.object({ credential: WebAuthnAuthenticationCredentialSchema });
export type LoginVerifyBody = z.infer<typeof LoginVerifyBodySchema>;

export const SessionSchema = z.object({
  clientId: z.string().min(1),
  credentialId: z.string().min(1),
  expiresAt: IsoDate,
});
export type Session = z.infer<typeof SessionSchema>;

export const LoginVerifyResponseSchema = z.object({
  session: SessionSchema,
  wallet: WalletSchema.nullable(), // null when the passkey has no Safe yet (onboarding not finished)
  passkey: PasskeySchema,
});
export type LoginVerifyResponse = z.infer<typeof LoginVerifyResponseSchema>;

export const CreateWalletBodySchema = z.object({
  pubKeyX: Hex,
  pubKeyY: Hex,
  credentialId: z.string().min(1),
  /** Used when the passkey was not registered through /auth (E2E / curl); defaults to the session device. */
  deviceLabel: z.string().min(1).max(64).optional(),
  recoveryMode: RecoveryModeSchema.default('default'),
  requestId: z.string().min(1).optional(),
});
export type CreateWalletBody = z.infer<typeof CreateWalletBodySchema>;

export const CreateWalletResponseSchema = z.object({ address: Address, wallet: WalletSchema });
export type CreateWalletResponse = z.infer<typeof CreateWalletResponseSchema>;

export const AddGuardianBodySchema = z
  .object({
    kind: GuardianKindSchema,
    /** Required for client guardians; for `swissquote` / `partner` the bank reads the public address from that process. */
    address: Address.optional(),
    requestId: z.string().min(1).optional(),
  })
  .refine((b) => b.kind === 'swissquote' || b.kind === 'partner' || b.address != null, {
    message: 'address is required for safety-key and emergency-card',
    path: ['address'],
  });
export type AddGuardianBody = z.infer<typeof AddGuardianBodySchema>;

export const GuardiansResponseSchema = z.object({
  walletAddress: Address,
  recoveryMode: RecoveryModeSchema,
  /** Kinds this mode needs before the protect op can be evaluated. */
  requiredKinds: z.array(GuardianKindSchema),
  guardians: z.array(GuardianSchema),
  threshold: z.literal(2),
  complete: z.boolean(),
});
export type GuardiansResponse = z.infer<typeof GuardiansResponseSchema>;

export const WalletDetailSchema = WalletSchema.extend({
  guardians: z.array(GuardianSchema),
  passkey: PasskeySchema.optional(),
});
export type WalletDetail = z.infer<typeof WalletDetailSchema>;

// ---- Safety-key pairing (SPEC F1 step 2, bank-mediated, SIMULATED) ----
export const PairingStatusSchema = z.enum(['open', 'claimed', 'expired']);
export type PairingStatus = z.infer<typeof PairingStatusSchema>;

export const CreatePairingBodySchema = z.object({
  wallet: Address,
  requestId: z.string().min(1).optional(),
});
export type CreatePairingBody = z.infer<typeof CreatePairingBodySchema>;

export const PairingSchema = z.object({
  code: z.string().regex(/^\d{6}$/, '6 digits'),
  walletAddress: Address,
  status: PairingStatusSchema,
  /** Present once the laptop claimed the code. */
  guardian: GuardianSchema.optional(),
  createdAt: IsoDate,
  expiresAt: IsoDate,
  claimedAt: IsoDate.optional(),
  /** Production would use a device-pairing protocol; here the bank relays a 6-digit code. */
  simulated: z.literal(true),
});
export type Pairing = z.infer<typeof PairingSchema>;

export const ClaimPairingBodySchema = z.object({
  kind: z.literal('safety-key'),
  address: Address,
  requestId: z.string().min(1).optional(),
});
export type ClaimPairingBody = z.infer<typeof ClaimPairingBodySchema>;

export const SetModeBodySchema = z.object({
  recoveryMode: RecoveryModeSchema,
  requestId: z.string().min(1).optional(),
});
export type SetModeBody = z.infer<typeof SetModeBodySchema>;

export const AttestationBodySchema = z.object({
  wallet: Address,
  clientId: z.string().min(1),
  nonce: z.string().min(1),
  signature: Hex,
  requestId: z.string().min(1).optional(),
});
export type AttestationBody = z.infer<typeof AttestationBodySchema>;

export const AttestationResponseSchema = z.object({
  verified: z.literal(true),
  method: z.literal('erc1271'),
  attestation: AttestationSchema,
});
export type AttestationResponse = z.infer<typeof AttestationResponseSchema>;

/**
 * EIP-712 payload the passkey signs through the Safe (ERC-1271) — the JSON form of
 * `@keyline/chain.attestationTypedData(fields)` (domain `Keyline Ownership Attestation`, verifyingContract = the Safe,
 * nonce = bytes32 issued by the bank). `message.chainId` is a number here; pass it as a uint256 when hashing.
 */
export const AttestationTypedDataSchema = z.object({
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number().int().positive(),
    verifyingContract: Address,
  }),
  types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() }))),
  primaryType: z.literal('Attestation'),
  message: z.object({
    clientId: z.string(),
    wallet: Address,
    chainId: z.number().int().positive(),
    nonce: Hash32,
  }),
});
export type AttestationTypedData = z.infer<typeof AttestationTypedDataSchema>;

export const AttestationChallengeResponseSchema = z.object({
  nonce: Hash32,
  typedData: AttestationTypedDataSchema,
  expiresAt: IsoDate,
});
export type AttestationChallengeResponse = z.infer<typeof AttestationChallengeResponseSchema>;

export const TopupBodySchema = z.object({
  wallet: Address,
  amountUsdc: z.number().positive(), // whole USDC, e.g. 25.5 (converted to 6-decimals server-side)
  requestId: z.string().min(1).optional(),
});
export type TopupBody = z.infer<typeof TopupBodySchema>;

export const TopupResponseSchema = z.object({
  txHash: Hash32,
  explorerUrl: z.string().url(),
  amountUsdc: z.number().positive(),
  /** CHF debited from the SIMULATED account at the static rate. */
  amountChf: z.number().positive(),
  /** Remaining SIMULATED Swissquote account balance, in CHF. */
  accountBalanceChf: z.number(),
  fx: FxSchema,
  simulated: z.literal(true),
});
export type TopupResponse = z.infer<typeof TopupResponseSchema>;

/** GET /me — the signed-in client, their SIMULATED account and their wallet (if any). */
export const MeResponseSchema = z.object({
  client: ClientSchema,
  account: z.object({
    currency: z.literal('CHF'),
    balance: z.number(),
    sponsoredToday: z.number().int().nonnegative(),
    sponsoredDailyCap: z.number().int().positive(),
    simulated: z.literal(true),
  }),
  wallet: WalletSchema.nullable(),
  /** How the caller was authenticated: passkey session, or the DEMO_FAST_MODE X-Device-Label header. */
  auth: z.enum(['session', 'device-label']),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const StepUpBodySchema = z.object({
  kind: z.literal('safety-key'),
  signature: Hex, // Safety key EIP-191/712 signature over the decision hash
  requestId: z.string().min(1).optional(),
});
export type StepUpBody = z.infer<typeof StepUpBodySchema>;

/** ERC-4337 EntryPoint v0.7 userOp as JSON; all numeric fields are strings (hex or decimal). */
export const UserOperationV7Schema = z.object({
  sender: Address,
  nonce: HexOrDecString,
  factory: Address.optional(),
  factoryData: Hex.optional(),
  callData: Hex,
  callGasLimit: HexOrDecString,
  verificationGasLimit: HexOrDecString,
  preVerificationGas: HexOrDecString,
  maxFeePerGas: HexOrDecString,
  maxPriorityFeePerGas: HexOrDecString,
  paymaster: Address.optional(),
  paymasterVerificationGasLimit: HexOrDecString.optional(),
  paymasterPostOpGasLimit: HexOrDecString.optional(),
  paymasterData: Hex.optional(),
  signature: Hex,
});
export type UserOperationV7 = z.infer<typeof UserOperationV7Schema>;

export const SponsorBodySchema = z.object({
  decisionId: z.string().min(1),
  userOp: UserOperationV7Schema,
  requestId: z.string().min(1).optional(),
});
export type SponsorBody = z.infer<typeof SponsorBodySchema>;

export const SponsorResponseSchema = z.object({
  userOp: UserOperationV7Schema,
  sponsorship: SponsorshipSchema,
});
export type SponsorResponse = z.infer<typeof SponsorResponseSchema>;

export const SendUserOpBodySchema = z.object({
  userOp: UserOperationV7Schema,
  decisionId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
});
export type SendUserOpBody = z.infer<typeof SendUserOpBodySchema>;

export const SendUserOpResponseSchema = z.object({ userOpHash: Hash32 });
export type SendUserOpResponse = z.infer<typeof SendUserOpResponseSchema>;

export const UserOpStatusSchema = z.object({
  userOpHash: Hash32,
  status: UserOpStatusValueSchema,
  txHash: Hash32.optional(),
  blockNumber: z.number().int().nonnegative().optional(),
  explorerUrl: z.string().url().optional(),
  walletAddress: Address.optional(),
  decisionId: z.string().optional(),
  /** Set when the included op was the wallet's protect op. */
  walletStatus: WalletStatusSchema.optional(),
});
export type UserOpStatus = z.infer<typeof UserOpStatusSchema>;

export const CreateRecoveryBodySchema = z.object({
  wallet: Address,
  newOwner: NewOwnerSchema,
  device: z.object({ deviceLabel: z.string().min(1) }), // ip / userAgent filled server-side
  requestId: z.string().min(1).optional(),
});
export type CreateRecoveryBody = z.infer<typeof CreateRecoveryBodySchema>;

export const EidPayloadSchema = z.object({
  name: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  documentNumber: z.string().min(1),
  liveness: z.boolean(),
});
export type EidPayload = z.infer<typeof EidPayloadSchema>;

export const RecoveryIdentityBodySchema = z.object({
  emailOtp: z.string().regex(/^\d{6}$/, '6 digits'),
  eidPayload: EidPayloadSchema,
  requestId: z.string().min(1).optional(),
});
export type RecoveryIdentityBody = z.infer<typeof RecoveryIdentityBodySchema>;

export const RecoveryConfirmBodySchema = z.object({
  kind: ClientGuardianKindSchema,
  signature: Hex, // over packages/chain.recovery.recoveryHash typed data
  guardianAddress: Address,
  requestId: z.string().min(1).optional(),
});
export type RecoveryConfirmBody = z.infer<typeof RecoveryConfirmBodySchema>;

export const OperatorActionBodySchema = z.object({
  action: OperatorActionSchema,
  note: z.string().max(500).default(''),
  requestId: z.string().min(1).optional(),
});
export type OperatorActionBody = z.infer<typeof OperatorActionBodySchema>;

export const CreateContactBodySchema = z.object({
  label: z.string().min(1).max(64),
  address: Address,
  requestId: z.string().min(1).optional(),
});
export type CreateContactBody = z.infer<typeof CreateContactBodySchema>;

export const DeskQueueItemSchema = z.object({
  recovery: RecoveryRequestSchema,
  client: ClientSchema,
  /** Human-readable identity signals for the operator (persona rule hits, mismatches). */
  signals: z.array(z.string()),
});
export type DeskQueueItem = z.infer<typeof DeskQueueItemSchema>;

export const DeskQueueResponseSchema = z.object({
  items: z.array(DeskQueueItemSchema),
  counts: z.partialRecord(RecoveryStatusSchema, z.number().int().nonnegative()),
});
export type DeskQueueResponse = z.infer<typeof DeskQueueResponseSchema>;

export const EventsResponseSchema = z.object({ events: z.array(EventSchema) });
export type EventsResponse = z.infer<typeof EventsResponseSchema>;

export const InboxMessageSchema = z.object({
  id: z.string().min(1),
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
  /** The 6-digit OTP when the message is a recovery code. */
  otp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  recoveryRequestId: z.string().optional(),
  sentAt: IsoDate,
  channel: z.literal('email-simulated'),
  simulated: z.literal(true),
});
export type InboxMessage = z.infer<typeof InboxMessageSchema>;

export const InboxResponseSchema = z.object({
  messages: z.array(InboxMessageSchema),
  simulated: z.literal(true),
});
export type InboxResponse = z.infer<typeof InboxResponseSchema>;

/** POST /mock/eid: the simulated swiyu e-ID form echoes a signed-looking payload the client forwards to /recoveries/:id/identity. */
export const EidResponseSchema = z.object({
  eidPayload: EidPayloadSchema,
  issuer: z.literal('swiyu-simulated'),
  issuedAt: IsoDate,
  simulated: z.literal(true),
});
export type EidResponse = z.infer<typeof EidResponseSchema>;

export const HealthSchema = z.object({
  ok: z.literal(true),
  service: z.literal('bank'),
  chainId: z.number().int().positive(),
  paymasterEnabled: z.boolean(),
  addresses: z.object({ verdict: Address, relayer: Address, funder: Address }),
});
export type Health = z.infer<typeof HealthSchema>;

/** Shape of every error body returned by the bank. */
export const ApiErrorSchema = z.object({
  error: z.string().min(1), // machine code, e.g. 'validation', 'unauthorized', 'policy-refused'
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const NotImplementedSchema = z.object({
  error: z.literal('not-implemented-yet'),
  wave: z.number().int().positive(),
});
export type NotImplemented = z.infer<typeof NotImplementedSchema>;
