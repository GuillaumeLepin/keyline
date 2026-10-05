// SPEC §4 routes not yet implemented. They exist so the client agent can discover shapes;
// each answers 501 { error: 'not-implemented-yet', wave: 3 } and names the request/response schema it will honour.
import type { FastifyInstance } from 'fastify';

export type Stub = {
  method: 'GET' | 'POST';
  url: string;
  body?: string;
  response: string;
  operator?: boolean;
};

/** Wave 3: nothing left — step-up, cancel, pending approvals and /dapps are live in routes/policy.ts. */
export const WAVE1_STUBS: Stub[] = [];

export const registerStubs = (app: FastifyInstance): void => {
  for (const stub of WAVE1_STUBS) {
    app.route({
      method: stub.method,
      url: stub.url,
      config: { operator: stub.operator ?? false },
      handler: async (_req, reply) =>
        reply.status(501).send({
          error: 'not-implemented-yet',
          wave: 3,
          contract: { body: stub.body, response: stub.response },
        }),
    });
  }
};
