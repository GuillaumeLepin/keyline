// Wave 0 live routes: health, events, auth (passkeys), contacts, dapps, mock inbox.
import {
  EventsResponseSchema,
  HealthSchema,
  InboxResponseSchema,
  LoginVerifyBodySchema,
  LoginVerifyResponseSchema,
  RegisterOptionsBodySchema,
  RegisterVerifyBodySchema,
  RegisterVerifyResponseSchema,
} from '@keyline/shared';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SESSION_COOKIE } from '../auth';
import type { BankConfig } from '../config';
import type { Db } from '../db';
import { validationError } from '../errors';
import type { EventStore } from '../events';
import type { Repo } from '../repo';
import { LEA } from '../seed';
import type { WebAuthnService } from '../webauthn';

type Deps = { config: BankConfig; db: Db; events: EventStore; repo: Repo; webauthn: WebAuthnService };

const AddressParam = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });
const EmailParam = z.object({ email: z.string().email() });

export const registerCoreRoutes = (
  app: FastifyInstance,
  { config, db, events, repo, webauthn }: Deps,
): void => {
  app.get('/health', async () =>
    HealthSchema.parse({
      ok: true,
      service: 'bank',
      chainId: config.CHAIN_ID,
      paymasterEnabled: config.paymasterEnabled,
      addresses: config.addresses,
    }),
  );

  // ---- events (append-only feed) ----
  app.get('/wallets/:address/events', async (req) => {
    const { address } = AddressParam.parse(req.params);
    return EventsResponseSchema.parse({ events: events.listForWallet(address) });
  });
  app.get('/desk/events', { config: { operator: true } }, async () =>
    EventsResponseSchema.parse({ events: events.listAll() }),
  );

  // ---- passkeys ----
  app.post('/auth/passkey/register/options', async (req) => {
    const { deviceLabel } = RegisterOptionsBodySchema.parse(req.body ?? {});
    return webauthn.registrationOptions(deviceLabel);
  });

  app.post('/auth/passkey/register/verify', async (req) => {
    const { credential, deviceLabel } = RegisterVerifyBodySchema.parse(req.body);
    // The zod schema is a loose wire check; the library does the real validation of the attestation.
    const passkey = await webauthn.verifyRegistration(credential as RegistrationResponseJSON, deviceLabel);
    return RegisterVerifyResponseSchema.parse({ passkey });
  });

  app.post('/auth/passkey/login/options', async () => webauthn.authenticationOptions());

  app.post('/auth/passkey/login/verify', async (req, reply) => {
    const { credential } = LoginVerifyBodySchema.parse(req.body);
    const { passkey } = await webauthn.verifyAuthentication(credential as AuthenticationResponseJSON);
    const wallet = repo.walletByOwnerCredential(passkey.credentialId);
    const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString();
    const token = await reply.jwtSign(
      { sub: passkey.credentialId, cid: LEA.id },
      { expiresIn: `${config.sessionTtlSeconds}s` },
    );
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.WALLET_ORIGIN.startsWith('https://'),
      path: '/',
      maxAge: config.sessionTtlSeconds,
    });
    return LoginVerifyResponseSchema.parse({
      session: { clientId: LEA.id, credentialId: passkey.credentialId, expiresAt },
      wallet,
      passkey,
    });
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/session', { config: { session: true } }, async (req) => {
    const claims = req.user as { sub: string; cid: string; exp: number };
    const passkey = webauthn.getPasskey(claims.sub);
    if (!passkey) throw validationError('Session refers to an unknown passkey');
    return LoginVerifyResponseSchema.parse({
      session: {
        clientId: claims.cid,
        credentialId: claims.sub,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
      },
      wallet: repo.walletByOwnerCredential(claims.sub),
      passkey,
    });
  });

  // ---- reads that already have data in Wave 0 ----
  app.get('/contacts', async () => ({ contacts: repo.contacts(LEA.id) }));
  app.get('/dapps', async () => ({ dapps: repo.dapps() }));

  app.get('/mock/inbox/:email', async (req) => {
    const { email } = EmailParam.parse(req.params);
    const rows = db
      .prepare('SELECT * FROM inbox WHERE lower(to_email) = lower(?) ORDER BY sent_at DESC LIMIT 50')
      .all(email) as {
      id: string;
      to_email: string;
      subject: string;
      body: string;
      otp: string | null;
      recovery_request_id: string | null;
      sent_at: string;
    }[];
    return InboxResponseSchema.parse({
      simulated: true,
      messages: rows.map((r) => ({
        id: r.id,
        to: r.to_email,
        subject: r.subject,
        body: r.body,
        otp: r.otp ?? undefined,
        recoveryRequestId: r.recovery_request_id ?? undefined,
        sentAt: r.sent_at,
        channel: 'email-simulated',
        simulated: true,
      })),
    });
  });
};
