// SPEC §11.3 — WalletConnect dApp sessions as the bank records them (identity + Verify context + request log).
// Owned by bank-backend.
//
// Shapes (bank route → response):
//   DappVerify               Reown Verify context of a proposal: { validation, isScam, origin, verifyUrl? }
//   ProposeSessionBody       POST /dapp-sessions { topic, walletAddress, name, url, icons, description?, verify }
//   ProposeSessionResponse   → { session: DappSession, verdict: 'allow'|'block', reasons[] }  (201; idempotent per topic)
//                            POST /dapp-sessions/:topic/approve · /refuse        → DappSession
//                            DELETE /dapp-sessions/:topic (disconnect)          → DappSession
//   DappSessionsResponse     GET /dapp-sessions?wallet=0x…                      → { sessions: DappSession[] }
//   DappRequestEventBody     POST /dapp-sessions/:topic/events { topic, method, summary, outcome, txHash?, userOpHash? }
//                                                                                → DappSession (requests + 1)
//   DappSessionDetail        GET /dapp-sessions/:topic                          → { session, requests: DappRequestLogEntry[] }
//   DappSession              one session (status proposed → active | refused; active → disconnected)
// Client routes: passkey session, X-Onboarding-Token or (DEMO_FAST_MODE) X-Device-Label, like POST /contacts.
// Policy: POST /policy/evaluate { kind: 'dapp', topic (or dappId = topic), calls } uses the recorded session.
import { z } from 'zod';
import { Address } from './guardian';

const IsoDate = z.string().datetime({ offset: true });
const Hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'bytes32');

export const DappValidationSchema = z.enum(['VALID', 'INVALID', 'UNKNOWN']);
export type DappValidation = z.infer<typeof DappValidationSchema>;

export const DappVerifySchema = z.object({
  validation: DappValidationSchema,
  isScam: z.boolean().default(false),
  /** Origin Reown Verify attests for the page that proposed (e.g. "https://app.uniswap.org"). */
  origin: z.string().min(1),
  verifyUrl: z.string().optional(),
});
export type DappVerify = z.infer<typeof DappVerifySchema>;

export const DappSessionStatusSchema = z.enum(['proposed', 'active', 'refused', 'disconnected']);
export type DappSessionStatus = z.infer<typeof DappSessionStatusSchema>;

export const DappVerdictSchema = z.enum(['allow', 'block']);
export type DappVerdict = z.infer<typeof DappVerdictSchema>;

/** WalletConnect topic: 64 hex chars (no 0x). Kept loose (any non-empty token) for tests and future formats. */
export const DappTopic = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, 'session topic');

export const DappSessionSchema = z.object({
  topic: DappTopic,
  walletAddress: Address,
  name: z.string().min(1),
  url: z.string().min(1),
  icons: z.array(z.string()).default([]),
  description: z.string().optional(),
  verify: DappVerifySchema,
  status: DappSessionStatusSchema,
  /** The bank's identity verdict at proposal time; `block` = no Connect button. */
  verdict: DappVerdictSchema,
  reasons: z.array(z.string()),
  /** Allowlist entry matched by url host (policy/allowlist.json), if any. */
  dappId: z.string().optional(),
  allowlisted: z.boolean(),
  createdAt: IsoDate,
  updatedAt: IsoDate.optional(),
  lastRequestAt: IsoDate.optional(),
  requests: z.number().int().nonnegative(),
});
export type DappSession = z.infer<typeof DappSessionSchema>;

export const ProposeSessionBodySchema = z.object({
  topic: DappTopic,
  walletAddress: Address,
  name: z.string().min(1).max(200),
  url: z.string().min(1).max(500),
  icons: z.array(z.string().max(2000)).max(10).default([]),
  description: z.string().max(1000).optional(),
  verify: DappVerifySchema,
});
export type ProposeSessionBody = z.infer<typeof ProposeSessionBodySchema>;

export const ProposeSessionResponseSchema = z.object({
  session: DappSessionSchema,
  verdict: DappVerdictSchema,
  reasons: z.array(z.string()),
});
export type ProposeSessionResponse = z.infer<typeof ProposeSessionResponseSchema>;

export const DappSessionsResponseSchema = z.object({ sessions: z.array(DappSessionSchema) });
export type DappSessionsResponse = z.infer<typeof DappSessionsResponseSchema>;

export const DappRequestOutcomeSchema = z.enum(['approved', 'declined', 'blocked', 'expired', 'failed']);
export type DappRequestOutcome = z.infer<typeof DappRequestOutcomeSchema>;

export const DappRequestEventBodySchema = z.object({
  topic: DappTopic,
  /** JSON-RPC method, e.g. eth_sendTransaction, personal_sign, wallet_sendCalls. */
  method: z.string().min(1).max(64),
  /** One plain-language line, e.g. "Approve 100 USDC for DemoSwap". */
  summary: z.string().min(1).max(500),
  outcome: DappRequestOutcomeSchema,
  txHash: Hash32.optional(),
  userOpHash: Hash32.optional(),
  /** WalletConnect request id, for de-duplication in the log. */
  requestId: z.union([z.string(), z.number()]).optional(),
});
export type DappRequestEventBody = z.infer<typeof DappRequestEventBodySchema>;

/** One logged dApp request (the "activity the app caused" on the Connected apps detail screen). */
export const DappRequestLogEntrySchema = z.object({
  id: z.string().min(1),
  topic: DappTopic,
  method: z.string().min(1),
  summary: z.string().min(1),
  outcome: DappRequestOutcomeSchema,
  txHash: Hash32.optional(),
  userOpHash: Hash32.optional(),
  requestId: z.string().optional(),
  at: IsoDate,
});
export type DappRequestLogEntry = z.infer<typeof DappRequestLogEntrySchema>;

export const DappSessionDetailSchema = z.object({
  session: DappSessionSchema,
  requests: z.array(DappRequestLogEntrySchema),
});
export type DappSessionDetail = z.infer<typeof DappSessionDetailSchema>;

/**
 * POST /policy/evaluate { kind: 'dapp-signature', topic, origin, walletAddress, deviceLabel, signature } — what the dApp
 * asks the wallet to sign. personal_sign: `message` (hex as received, or text); SIWE: `siwe` (parsed by the wallet; the
 * bank also parses `message`); typed data: `typedData` ({ domain, types, primaryType, message }).
 */
export const DappSignatureRequestSchema = z
  .object({
    method: z.enum(['personal_sign', 'eth_signTypedData', 'eth_signTypedData_v4']),
    message: z.string().max(20_000).optional(),
    typedData: z.record(z.string(), z.unknown()).optional(),
    siwe: z
      .object({
        domain: z.string().min(1),
        uri: z.string().optional(),
        chainId: z.number().int().optional(),
        address: z.string().optional(),
      })
      .optional(),
  })
  .refine((s) => (s.method === 'personal_sign' ? s.message !== undefined : s.typedData !== undefined), {
    message: 'personal_sign needs `message`; eth_signTypedData(_v4) needs `typedData`',
  });
export type DappSignatureRequest = z.infer<typeof DappSignatureRequestSchema>;
