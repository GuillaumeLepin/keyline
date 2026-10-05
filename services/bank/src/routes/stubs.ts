// SPEC §4 routes not yet implemented (Wave 1). They exist so the client agent can discover shapes;
// each answers 501 { error: 'not-implemented-yet', wave: 1 } and names the request/response schema it will honour.
import type { FastifyInstance } from 'fastify';

export type Stub = {
  method: 'GET' | 'POST';
  url: string;
  body?: string;
  response: string;
  operator?: boolean;
};

export const WAVE1_STUBS: Stub[] = [
  { method: 'POST', url: '/wallets', body: 'CreateWalletBodySchema', response: 'CreateWalletResponseSchema' },
  { method: 'GET', url: '/wallets/:address', response: 'WalletSchema' },
  {
    method: 'POST',
    url: '/wallets/:address/guardians',
    body: 'AddGuardianBodySchema',
    response: 'GuardianSchema',
  },
  { method: 'GET', url: '/wallets/:address/guardians', response: 'GuardianSchema[]' },
  { method: 'POST', url: '/wallets/:address/mode', body: 'SetModeBodySchema', response: 'WalletSchema' },
  {
    method: 'POST',
    url: '/attestations',
    body: 'AttestationBodySchema',
    response: 'AttestationResponseSchema',
  },
  { method: 'GET', url: '/attestations/:wallet', response: 'AttestationSchema' },
  { method: 'POST', url: '/topups', body: 'TopupBodySchema', response: 'TopupResponseSchema' },
  { method: 'POST', url: '/policy/evaluate', body: 'PolicyRequestSchema', response: 'PolicyDecisionSchema' },
  { method: 'POST', url: '/policy/:id/step-up', body: 'StepUpBodySchema', response: 'PolicyDecisionSchema' },
  { method: 'POST', url: '/userops/sponsor', body: 'SponsorBodySchema', response: 'SponsorResponseSchema' },
  {
    method: 'POST',
    url: '/userops/send',
    body: 'SendUserOpBodySchema',
    response: 'SendUserOpResponseSchema',
  },
  { method: 'GET', url: '/userops/:hash', response: 'UserOpStatusSchema' },
  { method: 'POST', url: '/recoveries', body: 'CreateRecoveryBodySchema', response: 'RecoveryRequestSchema' },
  { method: 'GET', url: '/recoveries/:id', response: 'RecoveryRequestSchema' },
  {
    method: 'POST',
    url: '/recoveries/:id/identity',
    body: 'RecoveryIdentityBodySchema',
    response: 'RecoveryRequestSchema',
  },
  {
    method: 'POST',
    url: '/recoveries/:id/confirm',
    body: 'RecoveryConfirmBodySchema',
    response: 'RecoveryRequestSchema',
  },
  {
    method: 'POST',
    url: '/recoveries/:id/operator',
    body: 'OperatorActionBodySchema',
    response: 'RecoveryRequestSchema',
    operator: true,
  },
  { method: 'POST', url: '/contacts', body: 'CreateContactBodySchema', response: 'ContactSchema' },
  { method: 'GET', url: '/desk/queue', response: 'DeskQueueResponseSchema', operator: true },
  { method: 'POST', url: '/mock/eid', body: 'EidPayloadSchema', response: 'EidResponseSchema' },
];

export const registerStubs = (app: FastifyInstance): void => {
  for (const stub of WAVE1_STUBS) {
    app.route({
      method: stub.method,
      url: stub.url,
      config: { operator: stub.operator ?? false },
      handler: async (_req, reply) =>
        reply.status(501).send({
          error: 'not-implemented-yet',
          wave: 1,
          contract: { body: stub.body, response: stub.response },
        }),
    });
  }
};
