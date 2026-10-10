// Wave 0 live routes: health, events, auth (passkeys), contacts, dapps, mock inbox.
import {
  ContactSchema,
  ContactVerifyResponseSchema,
  CreateContactBodySchema,
  DeleteContactResponseSchema,
  EventsResponseSchema,
  HealthSchema,
  InboxResponseSchema,
  LoginVerifyBodySchema,
  LoginVerifyResponseSchema,
  MeResponseSchema,
  RegisterOptionsBodySchema,
  RegisterVerifyBodySchema,
  RegisterVerifyResponseSchema,
  UpdateContactBodySchema,
} from '@keyline/shared';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { FastifyInstance } from 'fastify';
import { getAddress } from 'viem';
import { z } from 'zod';
import { clientOf, onboardingClaimsOf, SESSION_COOKIE } from '../auth';
import type { BankConfig } from '../config';
import { type Db, nowIso } from '../db';
import { notFound, validationError } from '../errors';
import type { EventStore } from '../events';
import { SPONSORED_DAILY_CAP } from '../policy/engine';
import type { Repo } from '../repo';
import { LEA } from '../seed';
import type { Store } from '../store';
import type { WebAuthnService } from '../webauthn';

type Deps = {
  config: BankConfig;
  db: Db;
  events: EventStore;
  repo: Repo;
  webauthn: WebAuthnService;
  store: Store;
};

const AddressParam = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });
const EmailParam = z.object({ email: z.string().email() });
const ContactIdParam = z.object({ id: z.string().regex(/^ct_[0-9a-fA-F]{40}$/) });

export const registerCoreRoutes = (
  app: FastifyInstance,
  { config, db, events, repo, webauthn, store }: Deps,
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

  // ---- passkeys ----
  app.post('/auth/passkey/register/options', async (req) => {
    const { deviceLabel } = RegisterOptionsBodySchema.parse(req.body ?? {});
    // SPEC §10: with X-Onboarding-Token (from a claimed handoff) the passkey is bound to that client; else Lea.
    const onboarding = onboardingClaimsOf(req);
    return webauthn.registrationOptions(deviceLabel, onboarding?.cid);
  });

  app.post('/auth/passkey/register/verify', async (req) => {
    const { credential, deviceLabel } = RegisterVerifyBodySchema.parse(req.body);
    // The zod schema is a loose wire check; the library does the real validation of the attestation.
    const onboarding = onboardingClaimsOf(req);
    const passkey = await webauthn.verifyRegistration(
      credential as RegistrationResponseJSON,
      deviceLabel,
      onboarding?.cid,
    );
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

  // ---- client profile + SIMULATED account ----
  app.get('/me', { config: { client: true } }, async (req) => {
    const client = clientOf(req);
    const profile = repo.client(client.clientId);
    if (!profile) throw validationError('Unknown client');
    const wallet = client.credentialId
      ? repo.walletByOwnerCredential(client.credentialId)
      : (repo.walletsForClient(client.clientId)[0] ?? null);
    return MeResponseSchema.parse({
      client: profile,
      account: {
        currency: 'CHF',
        balance: store.accountBalanceChf(client.clientId),
        sponsoredToday: store.sponsoredTodayForClient(client.clientId),
        sponsoredDailyCap: SPONSORED_DAILY_CAP,
        simulated: true,
      },
      wallet,
      auth: client.auth,
    });
  });

  // ---- reads that already have data in Wave 0 ----
  app.get('/contacts', async () => ({ contacts: repo.contacts(LEA.id) }));
  app.post('/contacts', { config: { client: true, idempotent: true } }, async (req, reply) => {
    const body = CreateContactBodySchema.parse(req.body);
    const client = clientOf(req);
    const address = getAddress(body.address);
    const existing = repo
      .contacts(client.clientId)
      .find((c) => c.address.toLowerCase() === address.toLowerCase());
    if (existing) return reply.status(200).send(ContactSchema.parse(existing));
    db.prepare(
      `INSERT INTO contacts (client_id, label, address, first_seen_at, verified_ownership, simulated) VALUES (?, ?, ?, ?, 0, 0)`,
    ).run(client.clientId, body.label, address, nowIso());
    events.recordEvent('contact.added', undefined, { clientId: client.clientId, label: body.label, address });
    const created = repo
      .contacts(client.clientId)
      .find((c) => c.address.toLowerCase() === address.toLowerCase());
    return reply.status(201).send(ContactSchema.parse(created));
  });

  // ---- contact management (Phase C contacts screen) ----
  const ownedContact = (clientId: string, id: string) => {
    const contact = repo.contacts(clientId).find((c) => c.id === id);
    if (!contact) throw notFound('Contact');
    return contact;
  };

  app.patch('/contacts/:id', { config: { client: true } }, async (req) => {
    const { id } = ContactIdParam.parse(req.params);
    const body = UpdateContactBodySchema.parse(req.body ?? {});
    const client = clientOf(req);
    const contact = ownedContact(client.clientId, id);
    db.prepare(
      'UPDATE contacts SET label = COALESCE(?, label), trusted = COALESCE(?, trusted) WHERE client_id = ? AND address = ?',
    ).run(
      body.label ?? null,
      body.trusted === undefined ? null : body.trusted ? 1 : 0,
      client.clientId,
      contact.address,
    );
    events.recordEvent('contact.updated', undefined, {
      clientId: client.clientId,
      contactId: id,
      address: contact.address,
      label: body.label,
      trusted: body.trusted,
    });
    return ContactSchema.parse(ownedContact(client.clientId, id));
  });

  app.delete('/contacts/:id', { config: { client: true } }, async (req) => {
    const { id } = ContactIdParam.parse(req.params);
    const client = clientOf(req);
    const contact = ownedContact(client.clientId, id);
    db.prepare('DELETE FROM contacts WHERE client_id = ? AND address = ?').run(
      client.clientId,
      contact.address,
    );
    // Seeded contacts (incl. the sanctioned test address) come back on the next demo reset / restart seed.
    events.recordEvent('contact.deleted', undefined, {
      clientId: client.clientId,
      contactId: id,
      address: contact.address,
      label: contact.label,
    });
    return DeleteContactResponseSchema.parse({ ok: true, id });
  });

  /** SIMULATED: the counterparty's VASP confirms its client owns this address (Travel Rule ownership proof). */
  app.post('/contacts/:id/verify', { config: { client: true, idempotent: true } }, async (req) => {
    const { id } = ContactIdParam.parse(req.params);
    const client = clientOf(req);
    const contact = ownedContact(client.clientId, id);
    db.prepare('UPDATE contacts SET verified_ownership = 1 WHERE client_id = ? AND address = ?').run(
      client.clientId,
      contact.address,
    );
    events.recordEvent('contact.verified', undefined, {
      clientId: client.clientId,
      contactId: id,
      address: contact.address,
      label: contact.label,
      method: 'counterparty-vasp-simulated',
      simulated: true,
    });
    return ContactVerifyResponseSchema.parse({
      verifiedOwnership: true,
      method: 'counterparty-vasp-simulated',
      simulated: true,
      contact: ownedContact(client.clientId, id),
    });
  });

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
