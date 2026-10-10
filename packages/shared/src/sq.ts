// SPEC §10 — Swissquote web (SIMULATED SSO + ledger), handoff to the phone, laptop Safety key, moves to/from Keyline.
// Owned by bank-backend. Everything here except the on-chain transfer hashes is SIMULATED (`simulated: true`).
//
// Shapes (bank route → response):
//   SqLoginBody            POST /sq/login { username }                → SqSession (sets httpOnly cookie `sq_web`, 2 h)
//   SqSession              POST /sq/login · GET /sq/me                → { client: SqClient, expiresAt, simulated }
//                          POST /sq/logout                            → { ok: true }
//   SqClient               { id, firstName, name, email }
//   SqPosition             one row of the portfolio table
//   SqPositionsResponse    GET /sq/positions (sq_web OR wallet session) → { client, cashChf, investedChf, totalChf, valuedAt, positions[], simulated }
//   Handoff                POST /handoff (sq_web) · GET /handoff/:code → { code, expiresAt, status, qrUrl, client?, walletAddress?, claimedAt? }
//   ClaimHandoffResponse   POST /handoff/:code/claim (no session)     → { client: SqClient, onboardingToken, expiresAt }
//                          The phone sends `X-Onboarding-Token: <onboardingToken>` to /auth/passkey/register/* and POST /wallets.
//   SafetyKeyRequest       GET /sq/safety-key-request (sq_web)        → { walletAddress | null, status, requestedAt? }
//   SafetyKeyBody          POST /sq/safety-key { address } (sq_web)   → Guardian (kind 'safety-key')
//   SqAsset                'USDC' | 'EURC' | 'ETH' (the movable assets; BTC is roadmap)
//   MoveBody               POST /sq/moves { asset, amount, requestId? } (sq_web, idempotent) → Move (201)
//   Move                   one move (Swissquote → Keyline, on-chain from the bank funder)
//   MovesResponse          GET /sq/moves (sq_web)                     → { moves: Move[] }
//   DepositAddressResponse GET /sq/deposit-address                   → { address, label, verified: true }
//   SqCredit               ledger credit after a "Back to Swissquote" userOp is included (event `sq.credit`)
import { z } from 'zod';
import { Address } from './guardian';

/** Non-negative decimal string in human units, e.g. "2400", "0.42", "12480.35". */
export const DecimalString = z.string().regex(/^\d+(\.\d+)?$/, 'decimal string');
const IsoDate = z.string().datetime({ offset: true });
const TxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'bytes32');

export const SqClientSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
});
export type SqClient = z.infer<typeof SqClientSchema>;

export const SqLoginBodySchema = z.object({ username: z.string().trim().min(1).max(128) });
export type SqLoginBody = z.infer<typeof SqLoginBodySchema>;

export const SqSessionSchema = z.object({
  client: SqClientSchema,
  expiresAt: IsoDate,
  /** SIMULATED SSO: no password check. */
  simulated: z.literal(true),
});
export type SqSession = z.infer<typeof SqSessionSchema>;

export const SqAssetSchema = z.enum(['USDC', 'EURC', 'ETH']);
export type SqAsset = z.infer<typeof SqAssetSchema>;

export const SqPositionKindSchema = z.enum(['cash', 'security', 'crypto']);

export const SqPositionSchema = z.object({
  id: z.string().min(1), // 'chf-cash' | 'smi-etf' | 'btc' | 'eth' | 'usdc' | 'eurc'
  name: z.string().min(1),
  symbol: z.string().min(1),
  kind: SqPositionKindSchema,
  quantity: DecimalString,
  priceChf: DecimalString,
  valueChf: DecimalString,
  /** True only for USDC / EURC / ETH — the rows with a "Move to Keyline" button. */
  movable: z.boolean(),
  /** Only on BTC: the UI shows the "Why?" sheet. Absent on CHF cash / the ETF (no button at all). */
  notMovableReason: z.literal('bitcoin-roadmap').optional(),
  simulated: z.literal(true),
});
export type SqPosition = z.infer<typeof SqPositionSchema>;

export const SqPositionsResponseSchema = z.object({
  client: SqClientSchema,
  cashChf: DecimalString,
  investedChf: DecimalString,
  totalChf: DecimalString,
  valuedAt: IsoDate,
  positions: z.array(SqPositionSchema),
  simulated: z.literal(true),
});
export type SqPositionsResponse = z.infer<typeof SqPositionsResponseSchema>;

export const HandoffStatusSchema = z.enum(['open', 'claimed', 'expired']);
export type HandoffStatus = z.infer<typeof HandoffStatusSchema>;

export const HandoffSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  expiresAt: IsoDate,
  status: HandoffStatusSchema,
  /** `${WALLET_ORIGIN}/start?code=…` — the laptop renders it as a QR code. */
  qrUrl: z.string().url(),
  /** Present once claimed. */
  client: SqClientSchema.optional(),
  claimedAt: IsoDate.optional(),
  /** Present once the phone created its wallet with the onboarding token. */
  walletAddress: Address.optional(),
});
export type Handoff = z.infer<typeof HandoffSchema>;

export const ClaimHandoffResponseSchema = z.object({
  client: SqClientSchema,
  /** Short-lived (15 min) bearer for `X-Onboarding-Token` on /auth/passkey/register/* and POST /wallets. */
  onboardingToken: z.string().min(1),
  expiresAt: IsoDate,
});
export type ClaimHandoffResponse = z.infer<typeof ClaimHandoffResponseSchema>;

export const SafetyKeyRequestStatusSchema = z.enum(['none', 'waiting', 'done']);

export const SafetyKeyRequestSchema = z.object({
  /** The client's newest wallet; null when the phone has not created one yet (status 'none'). */
  walletAddress: Address.nullable(),
  status: SafetyKeyRequestStatusSchema,
  /** When the phone created the wallet that waits for a Safety key. */
  requestedAt: IsoDate.optional(),
  /** Present when status is 'done'. */
  safetyKeyAddress: Address.optional(),
});
export type SafetyKeyRequest = z.infer<typeof SafetyKeyRequestSchema>;

export const SafetyKeyBodySchema = z.object({ address: Address });
export type SafetyKeyBody = z.infer<typeof SafetyKeyBodySchema>;

export const MoveBodySchema = z.object({
  asset: SqAssetSchema,
  /** Human units, e.g. "100" USDC or "0.01" ETH (≤ 6 decimals for USDC/EURC, ≤ 18 for ETH). */
  amount: DecimalString,
  /** Optional idempotency key (or the Idempotency-Key header). */
  requestId: z.string().min(1).optional(),
});
export type MoveBody = z.infer<typeof MoveBodySchema>;

export const MoveStatusSchema = z.enum(['pending', 'sent', 'confirmed', 'failed']);

export const MoveSchema = z.object({
  id: z.string().min(1),
  asset: SqAssetSchema,
  amount: DecimalString,
  valueChf: DecimalString,
  /** Destination: the client's attested Keyline Safe. */
  walletAddress: Address.optional(),
  txHash: TxHash.optional(),
  status: MoveStatusSchema,
  explorerUrl: z.string().url().optional(),
  error: z.string().optional(),
  /** The CHF/asset ledger debited on the Swissquote side is SIMULATED; the transfer is real. */
  ledgerSimulated: z.literal(true),
  at: IsoDate,
});
export type Move = z.infer<typeof MoveSchema>;

export const MovesResponseSchema = z.object({ moves: z.array(MoveSchema) });
export type MovesResponse = z.infer<typeof MovesResponseSchema>;

export const DepositAddressResponseSchema = z.object({
  address: Address,
  label: z.literal('Your Swissquote account'),
  verified: z.literal(true),
});
export type DepositAddressResponse = z.infer<typeof DepositAddressResponseSchema>;

/** Payload of the `sq.credit` event (a "Back to Swissquote" userOp was included). */
export const SqCreditSchema = z.object({
  asset: SqAssetSchema,
  amount: DecimalString,
  valueChf: DecimalString,
  userOpHash: TxHash,
  txHash: TxHash.optional(),
  ledgerSimulated: z.literal(true),
});
export type SqCredit = z.infer<typeof SqCreditSchema>;
