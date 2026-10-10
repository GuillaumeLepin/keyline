import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'policy-refused'
  | 'not-found'
  | 'conflict'
  | 'upstream'
  | 'too-many-attempts'
  | 'not-implemented-yet'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  'policy-refused': 403,
  'not-found': 404,
  conflict: 409,
  upstream: 502,
  'too-many-attempts': 429,
  'not-implemented-yet': 501,
  internal: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = STATUS[code];
  }
}

export const validationError = (message: string, details?: unknown) =>
  new ApiError('validation', message, details);
export const unauthorized = (message = 'Authentication required') => new ApiError('unauthorized', message);
export const forbidden = (message = 'Not allowed') => new ApiError('forbidden', message);
export const notFound = (what: string) => new ApiError('not-found', `${what} not found`);
export const conflict = (message: string, details?: unknown) => new ApiError('conflict', message, details);
export const upstream = (message: string, details?: unknown) => new ApiError('upstream', message, details);
export const tooManyAttempts = (message: string) => new ApiError('too-many-attempts', message);
/** 403 with the policy copy the UI shows verbatim. */
export const policyRefused = (message: string, details?: unknown) =>
  new ApiError('policy-refused', message, details);

const isZodError = (err: unknown): err is ZodError =>
  err instanceof ZodError || (err as { name?: string })?.name === 'ZodError';

export const errorHandler = (
  err: FastifyError | ApiError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
): void => {
  if (err instanceof ApiError) {
    if (err.status >= 500) req.log.error({ err }, err.message);
    else req.log.info({ code: err.code }, err.message);
    reply.status(err.status).send({ error: err.code, message: err.message, details: err.details });
    return;
  }
  if (isZodError(err)) {
    reply
      .status(400)
      .send({ error: 'validation', message: 'Request did not match the schema', details: err.issues });
    return;
  }
  const fastifyErr = err as FastifyError;
  if (typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode < 500) {
    reply.status(fastifyErr.statusCode).send({
      error: fastifyErr.statusCode === 401 ? 'unauthorized' : 'validation',
      message: err.message,
    });
    return;
  }
  req.log.error({ err }, 'unhandled error');
  reply.status(500).send({ error: 'internal', message: 'Internal error' });
};
