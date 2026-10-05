// Contract between services/bank (caller) and services/sq-guardian | partner-guardian (SPEC §4).
import { z } from 'zod';

export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'address');
export const Hex = z.string().regex(/^0x[0-9a-fA-F]*$/, 'hex');

export const IdentityVerdictSchema = z.object({
  recoveryRequestId: z.string().min(1),
  wallet: Address,
  newOwner: Address, // the new passkey's SafeWebAuthnSignerProxy address
  method: z.enum(['eid-simulated', 'kyc-reverify-simulated']),
  emailOtpPassed: z.boolean(),
  idCheckPassed: z.boolean(),
  livenessPassed: z.boolean(),
  operatorNote: z.string().optional(),
  verdict: z.enum(['pass', 'fail']),
  signedBy: z.literal('bank'),
  issuedAt: z.number().int().nonnegative(), // unix seconds, part of the signed message
  signature: Hex, // EIP-712 over IDENTITY_VERDICT_TYPES (see typed-data.ts)
  simulated: z.literal(true),
});
export type IdentityVerdict = z.infer<typeof IdentityVerdictSchema>;

export const GuardianRecoveryRequestSchema = z.object({
  recoveryRequestId: z.string().min(1),
  wallet: Address,
  newOwners: z.array(Address).length(1),
  newThreshold: z.literal(1),
  identityVerdict: IdentityVerdictSchema,
});
export type GuardianRecoveryRequest = z.infer<typeof GuardianRecoveryRequestSchema>;

export const GuardianRecoveryResponseSchema = z.object({
  confirmed: z.literal(true),
  txHash: Hex.optional(),
  executed: z.boolean(),
});
export type GuardianRecoveryResponse = z.infer<typeof GuardianRecoveryResponseSchema>;

export const GuardianIdentitySchema = z.object({
  kind: z.enum(['swissquote', 'partner']),
  guardianAddress: Address,
  chainId: z.number().int(),
});
export type GuardianIdentity = z.infer<typeof GuardianIdentitySchema>;
