import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as D from './dapps';
import { GuardianIdentitySchema, GuardianRecoveryRequestSchema, IdentityVerdictSchema } from './guardian';
import * as S from './schemas';
import * as Q from './sq';

const addr = '0x0000000000000000000000000000000000000001';
const addr2 = '0x00000000000000000000000000000000000000a2';
const hash = `0x${'ab'.repeat(32)}`;
const hex32 = `0x${'cd'.repeat(32)}`;
const sig = `0x${'ef'.repeat(65)}`;
const at = '2026-10-05T15:00:00.000Z';

const simulation: z.input<typeof S.SimulationSchema> = {
  ok: true,
  assetChanges: [{ token: addr2, symbol: 'USDC', before: '1000000', after: '0', delta: '-1000000' }],
  decodedCalls: [
    {
      to: addr2,
      fn: 'transfer(address,uint256)',
      args: [addr, '1000000'],
      humanText: 'Send 1 USDC',
      risk: 'none',
    },
  ],
  gasEstimate: '120000',
  provider: 'eth_simulateV1',
};
const screening: z.input<typeof S.ScreeningSchema> = {
  counterparty: addr,
  listsChecked: ['OFAC-SDN', 'SECO'],
  hit: false,
  simulatedHit: false,
  simulated: true,
};
const identityVerdict: z.input<typeof IdentityVerdictSchema> = {
  recoveryRequestId: 'rec_1',
  wallet: addr,
  newOwner: addr2,
  method: 'eid-simulated',
  emailOtpPassed: true,
  idCheckPassed: true,
  livenessPassed: true,
  verdict: 'pass',
  signedBy: 'bank',
  issuedAt: 1_759_676_400,
  signature: sig,
  simulated: true,
};
const passkey: z.input<typeof S.PasskeySchema> = {
  credentialId: 'Y3JlZA',
  walletAddress: addr,
  role: 'owner',
  pubKeyX: hex32,
  pubKeyY: hex32,
  deviceLabel: 'Lea · phone',
  createdAt: at,
};
const wallet: z.input<typeof S.WalletSchema> = {
  address: addr,
  clientId: 'SQ-48213-LK',
  chainId: 84532,
  ownerCredentialId: 'Y3JlZA',
  status: 'deployed',
  recoveryMode: 'default',
  createdAt: at,
  deployTxHash: hash,
};
const client: z.input<typeof S.ClientSchema> = {
  id: 'SQ-48213-LK',
  name: 'Lea Keller',
  email: 'lea.keller@example.ch',
  kycLevel: 'full',
  createdAt: at,
};
const userOp: z.input<typeof S.UserOperationV7Schema> = {
  sender: addr,
  nonce: '0x0',
  callData: '0x',
  callGasLimit: '0x1',
  verificationGasLimit: '100000',
  preVerificationGas: '0x1',
  maxFeePerGas: '0x1',
  maxPriorityFeePerGas: '0x1',
  signature: '0x',
};
const recovery: z.input<typeof S.RecoveryRequestSchema> = {
  id: 'rec_1',
  walletAddress: addr,
  clientId: 'SQ-48213-LK',
  email: 'lea.keller@example.ch',
  newOwner: { pubKeyX: hex32, pubKeyY: hex32, credentialId: 'bmV3', signerProxyAddress: addr2 },
  requestedFrom: { deviceLabel: 'Lea · new phone', ip: '127.0.0.1', userAgent: 'test' },
  identity: identityVerdict,
  guardianConfirmations: [{ kind: 'swissquote', txHash: hash, at }],
  onchain: { executedTxHash: hash, executeAfter: at },
  status: 'executed-waiting',
  recoveryMode: 'default',
  createdAt: at,
  updatedAt: at,
};
const decision: z.input<typeof S.PolicyDecisionSchema> = {
  requestId: 'req_1',
  decisionId: 'req_1',
  walletAddress: addr,
  kind: 'transfer',
  calls: [{ to: addr2, value: '0', data: '0xa9059cbb' }],
  verdict: 'approve',
  tier: 1,
  reasons: ["Within your CHF 1'000 daily limit · no second approval needed"],
  simulation,
  screening,
  sponsorship: { sponsored: true, remainingToday: 19 },
  callsHash: hash,
  chfValue: 80,
  fx: { pair: 'USDC/CHF', rate: 0.8, simulated: true },
  expiresAt: at,
  decidedAt: at,
};
const registrationCredential: z.input<typeof S.WebAuthnRegistrationCredentialSchema> = {
  id: 'Y3JlZA',
  rawId: 'Y3JlZA',
  type: 'public-key',
  response: { clientDataJSON: 'e30', attestationObject: 'oA' },
  clientExtensionResults: {},
};
const authenticationCredential: z.input<typeof S.WebAuthnAuthenticationCredentialSchema> = {
  id: 'Y3JlZA',
  rawId: 'Y3JlZA',
  type: 'public-key',
  response: { clientDataJSON: 'e30', authenticatorData: 'oA', signature: 'oA' },
  clientExtensionResults: {},
};
const inboxMessage: z.input<typeof S.InboxMessageSchema> = {
  id: 'msg_1',
  to: 'lea.keller@example.ch',
  subject: 'Your Keyline recovery code',
  body: 'Code: 123456',
  otp: '123456',
  recoveryRequestId: 'rec_1',
  sentAt: at,
  channel: 'email-simulated',
  simulated: true,
};
const eid: z.input<typeof S.EidPayloadSchema> = {
  name: 'Lea Keller',
  dateOfBirth: '1991-04-12',
  documentNumber: 'C1234567',
  liveness: true,
};

// One valid fixture per exported schema. Adding a schema without a fixture fails the "coverage" test below.
const fixtures: Record<string, [z.ZodType, unknown]> = {
  ClientSchema: [S.ClientSchema, client],
  WalletSchema: [S.WalletSchema, wallet],
  PasskeySchema: [S.PasskeySchema, passkey],
  GuardianSchema: [
    S.GuardianSchema,
    { walletAddress: addr, kind: 'safety-key', address: addr2, addedTxHash: hash },
  ],
  AttestationSchema: [
    S.AttestationSchema,
    {
      walletAddress: addr,
      clientId: 'SQ-48213-LK',
      nonce: 'n1',
      chainId: 84532,
      signature: sig,
      verifiedAt: at,
      method: 'erc1271',
    },
  ],
  ContactSchema: [
    S.ContactSchema,
    {
      id: `ct_${addr2.slice(2)}`,
      clientId: 'SQ-48213-LK',
      label: 'Lukas Meier',
      address: addr2,
      firstSeenAt: at,
      verifiedOwnership: true,
      trusted: true,
    },
  ],
  UpdateContactBodySchema: [S.UpdateContactBodySchema, { trusted: true }],
  DeleteContactResponseSchema: [S.DeleteContactResponseSchema, { ok: true, id: `ct_${addr2.slice(2)}` }],
  ContactVerifyResponseSchema: [
    S.ContactVerifyResponseSchema,
    {
      verifiedOwnership: true,
      method: 'counterparty-vasp-simulated',
      simulated: true,
      contact: {
        id: `ct_${addr2.slice(2)}`,
        clientId: 'SQ-48213-LK',
        label: 'Marta Rossi',
        address: addr2,
        firstSeenAt: at,
        verifiedOwnership: true,
        trusted: false,
      },
    },
  ],
  DappSchema: [
    S.DappSchema,
    {
      id: 'demoswap',
      name: 'DemoSwap',
      url: 'https://demoswap.example',
      allowlisted: true,
      contracts: [addr2],
      simulated: true,
    },
  ],
  CallSchema: [S.CallSchema, { to: addr, value: '0', data: '0x' }],
  DappDemoRequestSchema: [
    S.DappDemoRequestSchema,
    { calls: [{ to: addr2, value: '0', data: '0x095ea7b3' }], description: 'Approve USDC for swapping' },
  ],
  SuggestedCapSchema: [
    S.SuggestedCapSchema,
    {
      call: { to: addr2, value: '0', data: '0x095ea7b3' },
      amount: '100',
      symbol: 'USDC',
      humanText: 'Approve 100.00 USDC instead',
    },
  ],
  PendingApprovalsResponseSchema: [S.PendingApprovalsResponseSchema, { decisions: [] }],
  DappsResponseSchema: [S.DappsResponseSchema, { dapps: [] }],
  PolicyRequestSchema: [
    S.PolicyRequestSchema,
    {
      id: 'req_1',
      walletAddress: addr,
      calls: [{ to: addr2, value: '0', data: '0xa9059cbb' }],
      chfValue: 80,
      recipientAddress: addr2,
      deviceLabel: 'Lea · phone',
      requestedAt: at,
    },
  ],
  AssetChangeSchema: [S.AssetChangeSchema, simulation.assetChanges[0]],
  DecodedCallSchema: [S.DecodedCallSchema, simulation.decodedCalls[0]],
  SimulationSchema: [S.SimulationSchema, simulation],
  ScreeningSchema: [S.ScreeningSchema, screening],
  SponsorshipSchema: [S.SponsorshipSchema, { sponsored: true, remainingToday: 19 }],
  StepUpStateSchema: [S.StepUpStateSchema, { satisfiedBy: 'safety-key', signature: sig, satisfiedAt: at }],
  PolicyDecisionSchema: [S.PolicyDecisionSchema, decision],
  NewOwnerSchema: [S.NewOwnerSchema, recovery.newOwner],
  RequestedFromSchema: [S.RequestedFromSchema, recovery.requestedFrom],
  GuardianConfirmationSchema: [S.GuardianConfirmationSchema, recovery.guardianConfirmations[0]],
  RecoveryOnchainSchema: [S.RecoveryOnchainSchema, recovery.onchain],
  IdentityPendingSchema: [
    S.IdentityPendingSchema,
    { emailOtpPassed: false, verdict: 'pending', simulated: true },
  ],
  RecoveryRequestSchema: [S.RecoveryRequestSchema, recovery],
  EventSchema: [
    S.EventSchema,
    {
      id: 'evt_1',
      service: 'bank',
      type: 'passkey.registered',
      walletAddress: addr,
      payload: { deviceLabel: 'x' },
      at,
    },
  ],
  WebAuthnRegistrationCredentialSchema: [S.WebAuthnRegistrationCredentialSchema, registrationCredential],
  WebAuthnAuthenticationCredentialSchema: [
    S.WebAuthnAuthenticationCredentialSchema,
    authenticationCredential,
  ],
  RegisterOptionsBodySchema: [S.RegisterOptionsBodySchema, { deviceLabel: 'Lea · phone' }],
  RegisterVerifyBodySchema: [
    S.RegisterVerifyBodySchema,
    { credential: registrationCredential, deviceLabel: 'Lea · phone' },
  ],
  RegisterVerifyResponseSchema: [S.RegisterVerifyResponseSchema, { passkey }],
  LoginVerifyBodySchema: [S.LoginVerifyBodySchema, { credential: authenticationCredential }],
  SessionSchema: [S.SessionSchema, { clientId: 'SQ-48213-LK', credentialId: 'Y3JlZA', expiresAt: at }],
  LoginVerifyResponseSchema: [
    S.LoginVerifyResponseSchema,
    { session: { clientId: 'SQ-48213-LK', credentialId: 'Y3JlZA', expiresAt: at }, wallet, passkey },
  ],
  CreateWalletBodySchema: [
    S.CreateWalletBodySchema,
    { pubKeyX: hex32, pubKeyY: hex32, credentialId: 'Y3JlZA' },
  ],
  CreateWalletResponseSchema: [S.CreateWalletResponseSchema, { address: addr, wallet }],
  AddGuardianBodySchema: [S.AddGuardianBodySchema, { kind: 'emergency-card', address: addr2 }],
  GuardiansResponseSchema: [
    S.GuardiansResponseSchema,
    {
      walletAddress: addr,
      recoveryMode: 'default',
      requiredKinds: ['safety-key', 'emergency-card', 'swissquote'],
      guardians: [],
      threshold: 2,
      complete: false,
    },
  ],
  WalletDetailSchema: [S.WalletDetailSchema, { ...wallet, guardians: [] }],
  PairingStatusSchema: [S.PairingStatusSchema, 'open'],
  CreatePairingBodySchema: [S.CreatePairingBodySchema, { wallet: addr }],
  PairingSchema: [
    S.PairingSchema,
    { code: '123456', walletAddress: addr, status: 'open', createdAt: at, expiresAt: at, simulated: true },
  ],
  ClaimPairingBodySchema: [S.ClaimPairingBodySchema, { kind: 'safety-key', address: addr2 }],
  PolicyKindSchema: [S.PolicyKindSchema, 'protect'],
  FxSchema: [S.FxSchema, { pair: 'USDC/CHF', rate: 0.8, simulated: true }],
  AttestationTypedDataSchema: [
    S.AttestationTypedDataSchema,
    {
      domain: {
        name: 'Keyline Ownership Attestation',
        version: '1',
        chainId: 84532,
        verifyingContract: addr,
      },
      types: { Attestation: [{ name: 'clientId', type: 'string' }] },
      primaryType: 'Attestation',
      message: { clientId: 'SQ-48213-LK', wallet: addr, chainId: 84532, nonce: hash },
    },
  ],
  AttestationChallengeResponseSchema: [
    S.AttestationChallengeResponseSchema,
    {
      nonce: hash,
      expiresAt: at,
      typedData: {
        domain: {
          name: 'Keyline Ownership Attestation',
          version: '1',
          chainId: 84532,
          verifyingContract: addr,
        },
        types: { Attestation: [{ name: 'clientId', type: 'string' }] },
        primaryType: 'Attestation',
        message: { clientId: 'SQ-48213-LK', wallet: addr, chainId: 84532, nonce: hash },
      },
    },
  ],
  MeResponseSchema: [
    S.MeResponseSchema,
    {
      client,
      account: { currency: 'CHF', balance: 12500, sponsoredToday: 0, sponsoredDailyCap: 20, simulated: true },
      wallet: null,
      auth: 'session',
    },
  ],
  SetModeBodySchema: [S.SetModeBodySchema, { recoveryMode: 'assisted' }],
  AttestationBodySchema: [
    S.AttestationBodySchema,
    { wallet: addr, clientId: 'SQ-48213-LK', nonce: 'n1', signature: sig },
  ],
  AttestationResponseSchema: [
    S.AttestationResponseSchema,
    {
      verified: true,
      method: 'erc1271',
      attestation: {
        walletAddress: addr,
        clientId: 'SQ-48213-LK',
        nonce: 'n1',
        chainId: 84532,
        signature: sig,
        verifiedAt: at,
        method: 'erc1271',
      },
    },
  ],
  TopupBodySchema: [S.TopupBodySchema, { wallet: addr, amountUsdc: 25 }],
  TopupResponseSchema: [
    S.TopupResponseSchema,
    {
      txHash: hash,
      explorerUrl: `https://sepolia.basescan.org/tx/${hash}`,
      amountUsdc: 25,
      amountChf: 20,
      accountBalanceChf: 12480,
      fx: { pair: 'USDC/CHF', rate: 0.8, simulated: true },
      simulated: true,
    },
  ],
  StepUpBodySchema: [S.StepUpBodySchema, { kind: 'safety-key', signature: sig }],
  UserOperationV7Schema: [S.UserOperationV7Schema, userOp],
  SponsorBodySchema: [S.SponsorBodySchema, { decisionId: 'req_1', userOp }],
  SponsorResponseSchema: [
    S.SponsorResponseSchema,
    {
      userOp: { ...userOp, paymaster: addr2, paymasterData: '0x' },
      sponsorship: { sponsored: true, remainingToday: 18 },
    },
  ],
  SendUserOpBodySchema: [S.SendUserOpBodySchema, { userOp }],
  SendUserOpResponseSchema: [S.SendUserOpResponseSchema, { userOpHash: hash }],
  UserOpStatusSchema: [
    S.UserOpStatusSchema,
    {
      userOpHash: hash,
      status: 'failed',
      txHash: hash,
      blockNumber: 12,
      reason: 'Not enough funds in your wallet for this transfer.',
      code: 'ERC20InsufficientBalance',
    },
  ],
  CreateRecoveryBodySchema: [
    S.CreateRecoveryBodySchema,
    { wallet: addr, newOwner: recovery.newOwner, device: { deviceLabel: 'Lea · new phone' } },
  ],
  EidPayloadSchema: [S.EidPayloadSchema, eid],
  RecoveryIdentityBodySchema: [S.RecoveryIdentityBodySchema, { emailOtp: '123456', eidPayload: eid }],
  RecoveryConfirmBodySchema: [
    S.RecoveryConfirmBodySchema,
    { kind: 'safety-key', signature: sig, guardianAddress: addr2 },
  ],
  OperatorActionBodySchema: [S.OperatorActionBodySchema, { action: 'refuse', note: 'ID name mismatch' }],
  CreateContactBodySchema: [S.CreateContactBodySchema, { label: 'Marta Rossi', address: addr2 }],
  DeskQueueItemSchema: [
    S.DeskQueueItemSchema,
    {
      recovery,
      client,
      signals: ['device label contains "thief"'],
      confirmations: { have: 2, need: 2 },
      timer: { executeAfter: at, remainingSeconds: 0 },
    },
  ],
  DeskQueueResponseSchema: [
    S.DeskQueueResponseSchema,
    {
      items: [{ recovery, client, signals: [], confirmations: { have: 1, need: 2 } }],
      counts: { 'executed-waiting': 1 },
    },
  ],
  GuardianRefusalSchema: [
    S.GuardianRefusalSchema,
    { kind: 'swissquote', status: 409, reasons: ['a recovery was executed 0.5 h ago'], at },
  ],
  CreateRecoveryNewOwnerSchema: [
    S.CreateRecoveryNewOwnerSchema,
    { pubKeyX: hex32, pubKeyY: hex32, credentialId: 'bmV3' },
  ],
  RecoveryTypedDataResponseSchema: [
    S.RecoveryTypedDataResponseSchema,
    {
      recoveryRequestId: 'rec_1',
      nonce: '0',
      typedData: {
        domain: {
          name: 'Social Recovery Module',
          version: '0.0.1',
          chainId: 84532,
          verifyingContract: addr2,
        },
        types: {
          ExecuteRecovery: [
            { name: 'wallet', type: 'address' },
            { name: 'newOwners', type: 'address[]' },
            { name: 'newThreshold', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
          ],
        },
        primaryType: 'ExecuteRecovery',
        message: { wallet: addr, newOwners: [addr2], newThreshold: '1', nonce: '0' },
      },
    },
  ],
  AlertSchema: [
    S.AlertSchema,
    {
      id: 'alert_rec_1_started',
      kind: 'recovery-started',
      recoveryRequestId: 'rec_1',
      walletAddress: addr,
      title: 'Recovery started from a new device',
      body: 'Recovery started from “Lea · new phone”.',
      requestedFrom: { deviceLabel: 'Lea · new phone', ip: '127.0.0.1', userAgent: 'test' },
      executeAfter: at,
      txHash: hash,
      at,
    },
  ],
  AlertsResponseSchema: [S.AlertsResponseSchema, { walletAddress: addr, alerts: [] }],
  MockEidBodySchema: [S.MockEidBodySchema, { name: 'Lea Keller', dateOfBirth: '1990-04-12' }],
  EventsResponseSchema: [S.EventsResponseSchema, { events: [] }],
  InboxMessageSchema: [S.InboxMessageSchema, inboxMessage],
  InboxResponseSchema: [S.InboxResponseSchema, { messages: [inboxMessage], simulated: true }],
  EidResponseSchema: [
    S.EidResponseSchema,
    { eidPayload: eid, issuer: 'swiyu-simulated', issuedAt: at, simulated: true },
  ],
  HealthSchema: [
    S.HealthSchema,
    {
      ok: true,
      service: 'bank',
      chainId: 84532,
      paymasterEnabled: false,
      addresses: { verdict: addr, relayer: addr2, funder: addr },
    },
  ],
  ApiErrorSchema: [S.ApiErrorSchema, { error: 'validation', message: 'bad body' }],
  NotImplementedSchema: [S.NotImplementedSchema, { error: 'not-implemented-yet', wave: 1 }],
  // Pinned by the orchestrator in guardian.ts — exercised here so a schema change there is caught too.
  IdentityVerdictSchema: [IdentityVerdictSchema, identityVerdict],
  GuardianRecoveryRequestSchema: [
    GuardianRecoveryRequestSchema,
    { recoveryRequestId: 'rec_1', wallet: addr, newOwners: [addr2], newThreshold: 1, identityVerdict },
  ],
  GuardianIdentitySchema: [
    GuardianIdentitySchema,
    { kind: 'swissquote', guardianAddress: addr2, chainId: 84532 },
  ],
};

// SPEC §10 (sq.ts) — one fixture per exported schema, same coverage rule.
const sqClient = { id: 'SQ-48213-LK', firstName: 'Lea', name: 'Lea Keller', email: 'lea.keller@example.ch' };
const sqPosition: z.input<typeof Q.SqPositionSchema> = {
  id: 'btc',
  name: 'Bitcoin',
  symbol: 'BTC',
  kind: 'crypto',
  quantity: '0.42',
  priceChf: '88400.00',
  valueChf: '37128.00',
  movable: false,
  notMovableReason: 'bitcoin-roadmap',
  simulated: true,
};
const move: z.input<typeof Q.MoveSchema> = {
  id: 'mov_1',
  asset: 'USDC',
  amount: '100',
  valueChf: '80.00',
  walletAddress: addr,
  txHash: hash,
  status: 'sent',
  explorerUrl: `https://sepolia.basescan.org/tx/${hash}`,
  ledgerSimulated: true,
  at,
};
const sqFixtures: Record<string, [z.ZodTypeAny, unknown]> = {
  DecimalString: [Q.DecimalString, '12480.35'],
  SqClientSchema: [Q.SqClientSchema, sqClient],
  SqLoginBodySchema: [Q.SqLoginBodySchema, { username: 'lea.keller' }],
  SqSessionSchema: [Q.SqSessionSchema, { client: sqClient, expiresAt: at, simulated: true }],
  SqAssetSchema: [Q.SqAssetSchema, 'EURC'],
  SqPositionKindSchema: [Q.SqPositionKindSchema, 'security'],
  SqPositionSchema: [Q.SqPositionSchema, sqPosition],
  SqPositionsResponseSchema: [
    Q.SqPositionsResponseSchema,
    {
      client: sqClient,
      cashChf: '12480.35',
      investedChf: '65694.00',
      totalChf: '78174.35',
      valuedAt: at,
      positions: [sqPosition, { ...sqPosition, id: 'chf-cash', kind: 'cash', notMovableReason: undefined }],
      simulated: true,
    },
  ],
  HandoffStatusSchema: [Q.HandoffStatusSchema, 'claimed'],
  HandoffSchema: [
    Q.HandoffSchema,
    {
      code: '048213',
      expiresAt: at,
      status: 'claimed',
      qrUrl: 'http://localhost:3000/start?code=048213',
      client: sqClient,
      claimedAt: at,
    },
  ],
  ClaimHandoffResponseSchema: [
    Q.ClaimHandoffResponseSchema,
    { client: sqClient, onboardingToken: 'eyJ.x.y', expiresAt: at },
  ],
  SafetyKeyRequestStatusSchema: [Q.SafetyKeyRequestStatusSchema, 'waiting'],
  SqKeylineWalletSchema: [
    Q.SqKeylineWalletSchema,
    { address: addr, status: 'deployed', protected: true, createdAt: at },
  ],
  SqCurrentSetupSchema: [Q.SqCurrentSetupSchema, { code: '123456', status: 'claimed', walletAddress: addr2 }],
  SqKeylineStateSchema: [
    Q.SqKeylineStateSchema,
    {
      wallets: [{ address: addr, status: 'deployed', protected: true, createdAt: at }],
      currentSetup: { code: '123456', status: 'open' },
    },
  ],
  SafetyKeyRequestSchema: [
    Q.SafetyKeyRequestSchema,
    { walletAddress: addr, status: 'waiting', requestedAt: at },
  ],
  SafetyKeyBodySchema: [Q.SafetyKeyBodySchema, { address: addr2 }],
  MoveBodySchema: [Q.MoveBodySchema, { asset: 'ETH', amount: '0.001' }],
  MoveStatusSchema: [Q.MoveStatusSchema, 'confirmed'],
  MoveSchema: [Q.MoveSchema, move],
  MovesResponseSchema: [Q.MovesResponseSchema, { moves: [move] }],
  DepositAddressResponseSchema: [
    Q.DepositAddressResponseSchema,
    { address: addr2, label: 'Your Swissquote account', verified: true },
  ],
  SqCreditSchema: [
    Q.SqCreditSchema,
    { asset: 'USDC', amount: '10', valueChf: '8.00', userOpHash: hash, txHash: hex32, ledgerSimulated: true },
  ],
};

describe('sq schemas (SPEC §10)', () => {
  for (const [name, [schema, fixture]] of Object.entries(sqFixtures)) {
    it(`${name} accepts its fixture`, () => {
      const result = schema.safeParse(fixture);
      if (!result.success) throw new Error(`${name}: ${result.error.message}`);
      expect(result.success).toBe(true);
    });
  }

  it('every schema exported from sq.ts has a fixture', () => {
    const exported = Object.keys(Q).filter((k) => k.endsWith('Schema') || k === 'DecimalString');
    expect(exported.filter((k) => !(k in sqFixtures))).toEqual([]);
  });

  it('BTC is not movable and only carries the roadmap reason', () => {
    expect(Q.SqPositionSchema.safeParse({ ...sqPosition, notMovableReason: 'other' }).success).toBe(false);
    expect(Q.MoveBodySchema.safeParse({ asset: 'BTC', amount: '0.1' }).success).toBe(false);
  });

  it('rejects a non-decimal amount and a non-6-digit handoff code', () => {
    expect(Q.MoveBodySchema.safeParse({ asset: 'USDC', amount: '-1' }).success).toBe(false);
    expect(Q.MoveBodySchema.safeParse({ asset: 'USDC', amount: '1e3' }).success).toBe(false);
    expect(
      Q.HandoffSchema.safeParse({ code: '12345', expiresAt: at, status: 'open', qrUrl: 'http://x/start' })
        .success,
    ).toBe(false);
  });
});

// SPEC §11.3 (dapps.ts) — one fixture per exported schema.
const topic = 'a1'.repeat(32);
const verify = { validation: 'VALID', isScam: false, origin: 'http://localhost:3100' } as const;
const dappSession = {
  topic,
  walletAddress: addr,
  name: 'DemoSwap',
  url: 'http://localhost:3100',
  icons: ['http://localhost:3100/icon.png'],
  verify,
  status: 'active',
  verdict: 'allow',
  reasons: [],
  dappId: 'demoswap',
  allowlisted: true,
  createdAt: at,
  lastRequestAt: at,
  requests: 2,
};
const dappFixtures: Record<string, [z.ZodTypeAny, unknown]> = {
  DappValidationSchema: [D.DappValidationSchema, 'UNKNOWN'],
  DappVerifySchema: [D.DappVerifySchema, { ...verify, verifyUrl: 'https://verify.walletconnect.org' }],
  DappSessionStatusSchema: [D.DappSessionStatusSchema, 'proposed'],
  DappVerdictSchema: [D.DappVerdictSchema, 'block'],
  DappTopic: [D.DappTopic, topic],
  DappSessionSchema: [D.DappSessionSchema, dappSession],
  ProposeSessionBodySchema: [
    D.ProposeSessionBodySchema,
    { topic, walletAddress: addr, name: 'DemoSwap', url: 'http://localhost:3100', icons: [], verify },
  ],
  ProposeSessionResponseSchema: [
    D.ProposeSessionResponseSchema,
    { session: dappSession, verdict: 'allow', reasons: [] },
  ],
  DappSessionsResponseSchema: [D.DappSessionsResponseSchema, { sessions: [dappSession] }],
  DappRequestOutcomeSchema: [D.DappRequestOutcomeSchema, 'expired'],
  DappRequestLogEntrySchema: [
    D.DappRequestLogEntrySchema,
    {
      id: 'dreq_1',
      topic,
      method: 'personal_sign',
      summary: 'Sign in to localhost:3100',
      outcome: 'approved',
      at,
    },
  ],
  DappSessionDetailSchema: [
    D.DappSessionDetailSchema,
    {
      session: dappSession,
      requests: [
        { id: 'dreq_1', topic, method: 'eth_sendTransaction', summary: 'Swap', outcome: 'blocked', at },
      ],
    },
  ],
  DappRequestEventBodySchema: [
    D.DappRequestEventBodySchema,
    {
      topic,
      method: 'eth_sendTransaction',
      summary: 'Approve 100 USDC',
      outcome: 'approved',
      txHash: hash,
      userOpHash: hex32,
    },
  ],
};

describe('dapps schemas (SPEC §11.3)', () => {
  for (const [name, [schema, fixture]] of Object.entries(dappFixtures)) {
    it(`${name} accepts its fixture`, () => {
      const result = schema.safeParse(fixture);
      if (!result.success) throw new Error(`${name}: ${result.error.message}`);
      expect(result.success).toBe(true);
    });
  }
  it('every schema exported from dapps.ts has a fixture', () => {
    const exported = Object.keys(D).filter((k) => k.endsWith('Schema') || k === 'DappTopic');
    expect(exported.filter((k) => !(k in dappFixtures))).toEqual([]);
  });
  it('rejects an unknown outcome and a validation outside the Verify enum', () => {
    expect(
      D.DappRequestEventBodySchema.safeParse({ topic, method: 'x', summary: 'y', outcome: 'ok' }).success,
    ).toBe(false);
    expect(D.DappVerifySchema.safeParse({ ...verify, validation: 'MAYBE' }).success).toBe(false);
  });
});

describe('shared schemas', () => {
  for (const [name, [schema, fixture]] of Object.entries(fixtures)) {
    it(`${name} accepts its fixture`, () => {
      const result = schema.safeParse(fixture);
      if (!result.success) throw new Error(`${name}: ${result.error.message}`);
      expect(result.success).toBe(true);
    });
  }

  it('every object schema exported from schemas.ts has a fixture', () => {
    const exported = Object.keys(S).filter((k) => k.endsWith('Schema'));
    const primitiveEnums = new Set([
      'DecisionStatusSchema',
      'KycLevelSchema',
      'WalletStatusSchema',
      'RecoveryModeSchema',
      'GuardianKindSchema',
      'ClientGuardianKindSchema',
      'PolicyVerdictSchema',
      'TierSchema',
      'RiskSchema',
      'RecoveryStatusSchema',
      'UserOpStatusValueSchema',
      'OperatorActionSchema',
      'ServiceNameSchema',
      'RecoveryWaitingForSchema',
      'AlertKindSchema',
    ]);
    const missing = exported.filter((k) => !primitiveEnums.has(k) && !(k in fixtures));
    expect(missing).toEqual([]);
  });

  it('contacts: trusted defaults to false, an empty PATCH is refused, ids are ct_<address>', () => {
    const c = S.ContactSchema.parse({
      id: `ct_${addr2.slice(2)}`,
      clientId: 'C',
      label: 'x',
      address: addr2,
      firstSeenAt: at,
      verifiedOwnership: false,
    });
    expect(c.trusted).toBe(false);
    expect(S.UpdateContactBodySchema.safeParse({}).success).toBe(false);
    expect(S.ContactSchema.safeParse({ ...c, id: 'c1' }).success).toBe(false);
  });

  it('rejects a recovery status outside the SPEC enum', () => {
    expect(S.RecoveryStatusSchema.safeParse('pending').success).toBe(false);
  });

  it('rejects a Call whose value is not a decimal wei string', () => {
    expect(S.CallSchema.safeParse({ to: addr, value: '0x10', data: '0x' }).success).toBe(false);
  });

  it('requires simulated: true on mocked payloads', () => {
    expect(S.ScreeningSchema.safeParse({ ...screening, simulated: false }).success).toBe(false);
    expect(S.InboxMessageSchema.safeParse({ ...inboxMessage, simulated: undefined }).success).toBe(false);
  });
});
