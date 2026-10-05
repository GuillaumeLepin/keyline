// Recovery endpoints (SPEC §4, F3/F4/F4b). Unauthenticated by design: the new phone has no key yet — the gates are
// the OTP, the identity verdict and, above all, the two recoverer signatures the module checks on-chain.
import { passkeySignerAddress } from '@keyline/chain';
import {
  type Alert,
  AlertKindSchema,
  AlertSchema,
  AlertsResponseSchema,
  CreateRecoveryBodySchema,
  EidResponseSchema,
  type Event,
  type GuardianConfirmation,
  MockEidBodySchema,
  OperatorActionBodySchema,
  RecoveryConfirmBodySchema,
  RecoveryIdentityBodySchema,
  type RecoveryRequest,
  RecoveryRequestSchema,
  RecoveryTypedDataResponseSchema,
} from '@keyline/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getAddress, type Hex, isAddressEqual, verifyTypedData } from 'viem';
import { z } from 'zod';
import type { BankConfig } from '../config';
import { newId, nowIso } from '../db';
import type { ChainDeps } from '../deps';
import { conflict, forbidden, notFound, upstream, validationError } from '../errors';
import type { EventStore } from '../events';
import { evaluatePersona } from '../identity';
import type { RecoveryService } from '../recovery-service';
import { COPY } from '../recovery-service';
import type { RecoveryStore } from '../recovery-store';
import type { Repo } from '../repo';
import type { Store } from '../store';

type Deps = {
  config: BankConfig;
  events: EventStore;
  repo: Repo;
  store: Store;
  recoveries: RecoveryStore;
  chain: ChainDeps;
  service: RecoveryService;
};

const IdParam = z.object({ id: z.string().min(1) });
const AddressParam = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

const requestedFromOf = (req: FastifyRequest, deviceLabel: string) => ({
  deviceLabel,
  ip: req.ip || 'unknown',
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : 'unknown',
});

/**
 * Owner-facing alerts = the SIMULATED pushes recorded as `notification.sent` events (append-only), newest first.
 * Derived from events rather than the current status so a refused attempt stays visible after a desk override.
 */
export const alertsFor = (events: Event[]): Alert[] =>
  events
    .filter((e) => e.type === 'notification.sent')
    .flatMap((e) => {
      const p = e.payload as {
        kind?: string;
        title?: string;
        body?: string;
        recoveryRequestId?: string;
        requestedFrom?: Alert['requestedFrom'];
        executeAfter?: string;
        txHash?: string | null;
        reasons?: string[];
      };
      const kind = AlertKindSchema.safeParse(p.kind);
      if (!kind.success || !e.walletAddress || !p.recoveryRequestId || !p.requestedFrom) return [];
      return [
        AlertSchema.parse({
          id: e.id,
          kind: kind.data,
          recoveryRequestId: p.recoveryRequestId,
          walletAddress: e.walletAddress,
          title: p.title ?? '',
          body: p.body ?? '',
          requestedFrom: p.requestedFrom,
          executeAfter: p.executeAfter,
          txHash: p.txHash ?? undefined,
          reasons: p.reasons ?? [],
          at: e.at,
        }),
      ];
    });

export const registerRecoveryRoutes = (
  app: FastifyInstance,
  { config, events, repo, store, recoveries, chain, service }: Deps,
): void => {
  const load = (id: string): RecoveryRequest => {
    const r = recoveries.get(id);
    if (!r) throw notFound('Recovery request');
    return r;
  };

  // ---- POST /recoveries — new phone starts a recovery ----
  app.post('/recoveries', { config: { idempotent: true } }, async (req, reply) => {
    const body = CreateRecoveryBodySchema.parse(req.body);
    if (!HEX32.test(body.newOwner.pubKeyX) || !HEX32.test(body.newOwner.pubKeyY))
      throw validationError('pubKeyX / pubKeyY must be 32-byte hex');
    const wallet = repo.walletByAddress(body.wallet);
    if (!wallet) throw notFound('Wallet');
    const client = repo.client(wallet.clientId);
    if (!client) throw notFound('Client');
    if (wallet.status === 'pending')
      throw conflict('This wallet is not protected yet — there is nothing to recover');
    if (wallet.ownerCredentialId === body.newOwner.credentialId)
      throw conflict('This passkey already owns the wallet — no recovery needed');

    const owner = { x: BigInt(body.newOwner.pubKeyX), y: BigInt(body.newOwner.pubKeyY) };
    const signerProxyAddress = passkeySignerAddress(owner);
    if (
      body.newOwner.signerProxyAddress &&
      !isAddressEqual(getAddress(body.newOwner.signerProxyAddress), signerProxyAddress)
    )
      throw validationError('signerProxyAddress does not match the passkey public key', {
        expected: signerProxyAddress,
      });

    // Real transaction through the bank relayer (sponsored relayer Safe at 0 ETH, EOA when funded). Idempotent on-chain.
    const deployed = await chain.deploySignerProxy(owner).catch((err: unknown) => {
      throw upstream(`Could not deploy the signer for the new key: ${errMsg(err)}`);
    });

    const id = newId('rec');
    const otp = recoveries.sendOtpEmail(client.email, id);
    const at = nowIso();
    const request = recoveries.create(
      RecoveryRequestSchema.parse({
        id,
        walletAddress: getAddress(wallet.address),
        clientId: client.id,
        newOwner: {
          pubKeyX: body.newOwner.pubKeyX,
          pubKeyY: body.newOwner.pubKeyY,
          credentialId: body.newOwner.credentialId,
          signerProxyAddress,
        },
        requestedFrom: requestedFromOf(req, body.device.deviceLabel),
        identity: { emailOtpPassed: false, verdict: 'pending', simulated: true },
        reasons: [],
        guardianConfirmations: [],
        guardianRefusals: [],
        onchain: {},
        status: 'identity-pending',
        waitingFor: 'identity',
        recoveryMode: wallet.recoveryMode,
        email: client.email,
        createdAt: at,
        updatedAt: at,
      }),
      otp,
    );
    recoveries.upsertNewOwnerPasskey({
      credentialId: body.newOwner.credentialId,
      clientId: client.id,
      wallet: wallet.address,
      pubKeyX: body.newOwner.pubKeyX,
      pubKeyY: body.newOwner.pubKeyY,
      deviceLabel: body.device.deviceLabel,
      signerProxyAddress,
    });
    events.recordEvent('recovery.requested', wallet.address, {
      recoveryRequestId: id,
      requestedFrom: request.requestedFrom,
      newOwnerProxy: signerProxyAddress,
      credentialId: body.newOwner.credentialId,
      recoveryMode: wallet.recoveryMode,
      otpSentTo: client.email,
      otpChannel: 'email-simulated',
    });
    if (deployed.txHash) {
      events.recordEvent('recovery.signer-deployed', wallet.address, {
        recoveryRequestId: id,
        signerProxyAddress,
        txHash: deployed.txHash,
        submitter: deployed.submitter,
      });
    }
    service.notifyOwner(
      request,
      'recovery-requested',
      COPY.requested.title,
      COPY.requested.body(body.device.deviceLabel),
    );
    return reply.status(201).send(service.view(request));
  });

  app.get('/recoveries/:id', async (req) => service.view(load(IdParam.parse(req.params).id)));

  /** What the Safety key / Emergency card must sign (nonce read live from the module). */
  app.get('/recoveries/:id/typed-data', async (req) => {
    const r = load(IdParam.parse(req.params).id);
    const { nonce, typedData } = await service.typedDataFor(r);
    return RecoveryTypedDataResponseSchema.parse({
      recoveryRequestId: r.id,
      nonce: nonce.toString(),
      typedData: {
        domain: typedData.domain,
        types: typedData.types,
        primaryType: 'ExecuteRecovery',
        message: {
          wallet: typedData.message.wallet,
          newOwners: typedData.message.newOwners,
          newThreshold: typedData.message.newThreshold.toString(),
          nonce: typedData.message.nonce.toString(),
        },
      },
    });
  });

  // ---- POST /recoveries/:id/identity — OTP + SIMULATED e-ID (persona rules §7) ----
  app.post('/recoveries/:id/identity', async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = RecoveryIdentityBodySchema.parse(req.body);
    const r = load(id);
    if (r.status !== 'identity-pending')
      throw conflict(`Identity was already decided for this request (${r.status})`, { status: r.status });
    if (r.identity.verdict === 'pending' && r.identity.emailOtpPassed && r.identity.idCheckPassed)
      throw conflict('Identity check already submitted — waiting for the Swissquote desk', {
        waitingFor: 'operator',
      });
    const client = repo.client(r.clientId);
    if (!client) throw notFound('Client');

    if (recoveries.otp(id) !== body.emailOtp) {
      events.recordEvent('recovery.otp-rejected', r.walletAddress, {
        recoveryRequestId: id,
        simulated: true,
      });
      throw forbidden('That code doesn’t match.');
    }
    r.eidPayload = body.eidPayload;
    const persona = evaluatePersona({
      deviceLabel: r.requestedFrom.deviceLabel,
      eidName: body.eidPayload.name,
      clientName: client.name,
      liveness: body.eidPayload.liveness,
    });
    events.recordEvent('recovery.identity-checked', r.walletAddress, {
      recoveryRequestId: id,
      method: 'eid-simulated',
      issuer: 'swiyu-simulated',
      verdict: persona.verdict,
      signals: persona.signals,
      reasons: persona.reasons,
      simulated: true,
    });

    if (persona.verdict === 'fail') {
      return service.view(
        await service.refuseIdentity(r, {
          method: 'eid-simulated',
          reasons: persona.reasons,
          emailOtpPassed: true,
          idCheckPassed: persona.idCheckPassed,
          livenessPassed: persona.livenessPassed,
          by: 'persona-rules',
        }),
      );
    }
    if (!config.DEMO_FAST_MODE) {
      // Desk approval required: the verdict is only signed when an operator approves.
      r.identity = {
        emailOtpPassed: true,
        idCheckPassed: true,
        livenessPassed: true,
        verdict: 'pending',
        simulated: true,
      };
      return service.view(service.save(r));
    }
    return service.view(await service.passIdentity(r, { method: 'eid-simulated', emailOtpPassed: true }));
  });

  // ---- POST /recoveries/:id/operator — desk approve / refuse / override ----
  app.post('/recoveries/:id/operator', { config: { operator: true } }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = OperatorActionBodySchema.parse(req.body);
    const r = load(id);
    const note = body.note.trim();
    const emailOtpPassed = r.identity.emailOtpPassed;
    events.recordEvent('recovery.operator-action', r.walletAddress, {
      recoveryRequestId: id,
      action: body.action,
      note,
      statusBefore: r.status,
    });

    if (body.action === 'approve') {
      if (r.status !== 'identity-pending')
        throw conflict(`Cannot approve a request in status ${r.status}`, { status: r.status });
      return service.view(
        await service.passIdentity(r, {
          method: 'kyc-reverify-simulated',
          operatorNote: note || 'Approved by the Swissquote desk',
          emailOtpPassed,
        }),
      );
    }
    if (body.action === 'refuse') {
      if (r.status === 'executed-waiting' || r.status === 'finalized' || r.status === 'cancelled')
        throw conflict(
          `Too late to refuse: the recovery is ${r.status} on-chain — the owner can still cancel`,
          {
            status: r.status,
          },
        );
      if (r.status === 'identity-refused') return service.view(r);
      // Supersedes everything: any Swissquote signature we hold is voided and never relayed. sq-guardian is not told —
      // it never executed anything, and its 24 h rule only counts executed recoveries.
      return service.view(
        await service.refuseIdentity(r, {
          method: 'kyc-reverify-simulated',
          reasons: [note ? `Refused by the Swissquote desk: ${note}` : 'Refused by the Swissquote desk'],
          operatorNote: note || undefined,
          emailOtpPassed,
          idCheckPassed: false,
          livenessPassed: false,
          by: 'operator',
        }),
      );
    }
    // override — "demo: assume the bank was fooled". Swissquote confirms alone; the status cannot leave
    // awaiting-guardians because the module needs a second signature the bank does not have.
    if (r.status !== 'identity-refused' && r.status !== 'identity-pending')
      throw conflict(`Cannot override a request in status ${r.status}`, { status: r.status });
    return service.view(
      await service.passIdentity(r, {
        method: 'kyc-reverify-simulated',
        operatorNote: `override (demo: assume the bank was fooled)${note ? `: ${note}` : ''}`,
        emailOtpPassed,
      }),
    );
  });

  // ---- POST /recoveries/:id/confirm — Safety key / Emergency card signature ----
  app.post('/recoveries/:id/confirm', async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = RecoveryConfirmBodySchema.parse(req.body);
    const r = load(id);
    if (r.status === 'identity-pending')
      throw conflict('The identity check has not passed yet', { status: r.status });
    if (r.status === 'identity-refused')
      throw forbidden('This recovery was refused — recoverers cannot confirm it');
    if (r.status !== 'awaiting-guardians')
      throw conflict(`This recovery is already ${r.status}`, { status: r.status });

    const wallet = getAddress(r.walletAddress);
    const guardianAddress = getAddress(body.guardianAddress);
    // Registered recoverers: the bank's registry, or the module's guardian list when the bank has none on file.
    const registered = store.guardians(wallet);
    const match = registered.find((g) => isAddressEqual(getAddress(g.address), guardianAddress));
    if (registered.length > 0) {
      if (!match) throw forbidden('This address is not a registered recoverer of the wallet');
      if (match.kind !== body.kind)
        throw forbidden(`This address is the ${match.kind}, not the ${body.kind}`);
    } else {
      const onchain = await chain.recoveryStatus(wallet);
      if (!onchain.guardians.some((g) => isAddressEqual(g, guardianAddress)))
        throw forbidden('This address is not a recoverer of the wallet on-chain');
    }

    const nonce = await chain.recoveryNonce(wallet);
    if (body.nonce && body.nonce !== nonce.toString())
      throw conflict('Stale signature: the module nonce changed — sign again', {
        expectedNonce: nonce.toString(),
        got: body.nonce,
      });
    const { typedData } = await service.typedDataFor(r);
    const ok = await verifyTypedData({
      address: guardianAddress,
      ...typedData,
      signature: body.signature as Hex,
    }).catch(() => false);
    if (!ok)
      throw forbidden(`Signature does not verify for this recoverer (module nonce ${nonce.toString()})`);

    const confirmation: GuardianConfirmation = {
      kind: body.kind,
      guardianAddress,
      mode: 'signature',
      signature: body.signature,
      nonce: nonce.toString(),
      at: nowIso(),
    };
    r.guardianConfirmations = [
      ...r.guardianConfirmations.filter((c) => c.kind !== body.kind || c.void),
      confirmation,
    ];
    events.recordEvent('recovery.guardian-confirmed', wallet, {
      recoveryRequestId: id,
      kind: body.kind,
      mode: 'signature',
      guardianAddress,
      nonce: nonce.toString(),
    });
    service.save(r);
    const updated = await service.maybeExecute(r).catch((err: unknown) => {
      throw upstream(`The chain rejected the request: ${errMsg(err)}`, { recoveryRequestId: id });
    });
    return service.view(updated);
  });

  // ---- owner-facing alerts ----
  app.get('/wallets/:address/alerts', async (req) => {
    const { address } = AddressParam.parse(req.params);
    const wallet = repo.walletByAddress(address);
    if (!wallet) throw notFound('Wallet');
    return AlertsResponseSchema.parse({
      walletAddress: wallet.address,
      alerts: alertsFor(events.listForWallet(wallet.address)),
    });
  });

  // ---- SIMULATED swiyu e-ID form backend ----
  app.post('/mock/eid', async (req) => {
    const body = MockEidBodySchema.parse(req.body ?? {});
    const issuedAt = nowIso();
    const eidPayload = {
      name: body.name,
      dateOfBirth: body.dateOfBirth,
      documentNumber: body.documentNumber ?? `SIM-${newId('eid').slice(4, 12).toUpperCase()}`,
      liveness: body.liveness ?? true,
    };
    events.recordEvent('mock.eid-issued', undefined, {
      name: eidPayload.name,
      issuer: 'swiyu-simulated',
      simulated: true,
    });
    return EidResponseSchema.parse({ eidPayload, issuer: 'swiyu-simulated', issuedAt, simulated: true });
  });
};
