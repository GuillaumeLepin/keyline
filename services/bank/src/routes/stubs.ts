// SPEC §4 routes not yet implemented. They exist so the client agent can discover shapes;
// each answers 501 { error: 'not-implemented-yet', wave: 2 } and names the request/response schema it will honour.
import type { FastifyInstance } from 'fastify';

export type Stub = {
  method: 'GET' | 'POST';
  url: string;
  body?: string;
  response: string;
  operator?: boolean;
};

/** Still 501 after Wave 1: recovery orchestration, step-up, contacts write, desk queue, mock e-ID (Wave 2/3). */
export const WAVE1_STUBS: Stub[] = [
  { method: 'POST', url: '/policy/:id/step-up', body: 'StepUpBodySchema', response: 'PolicyDecisionSchema' },
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
          wave: 2,
          contract: { body: stub.body, response: stub.response },
        }),
    });
  }
};
