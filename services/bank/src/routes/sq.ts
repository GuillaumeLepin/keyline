// SPEC §10 — Swissquote web (SIMULATED SSO), ledger + positions, handoff to the phone, laptop Safety key,
// moves Swissquote → Keyline (real on-chain transfers from the bank funder) and the deposit address.
import { randomInt } from 'node:crypto';
import { explorerTxUrl } from '@keyline/chain';
import {
  ClaimHandoffResponseSchema,
  DepositAddressResponseSchema,
  type Handoff,
  HandoffSchema,
  type Move,
  MoveBodySchema,
  MoveSchema,
  MovesResponseSchema,
  SafetyKeyBodySchema,
  type SafetyKeyRequest,
  SafetyKeyRequestSchema,
  type SqAsset,
  type SqClient,
  SqLoginBodySchema,
  SqPositionsResponseSchema,
  SqSessionSchema,
} from '@keyline/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { type Address, formatUnits, getAddress, type Hex } from 'viem';
import { z } from 'zod';
import {
  ONBOARDING_TTL_SECONDS,
  requireClient,
  requireSqWeb,
  SQ_WEB_COOKIE,
  SQ_WEB_TTL_SECONDS,
  sqWebSessionOf,
} from '../auth';
import type { BankConfig } from '../config';
import { type Db, newId, nowIso } from '../db';
import type { ChainDeps } from '../deps';
import { conflict, notFound, policyRefused, unauthorized, upstream, validationError } from '../errors';
import type { EventStore } from '../events';
import type { GuardianRegistrar } from '../guardians';
import type { Repo } from '../repo';
import { LEA } from '../seed';
import { SQ_ASSETS, type SqLedger, toBaseUnits } from '../sq/ledger';
import type { Store } from '../store';
import { syncWalletStatus } from '../wallet-sync';

type Deps = {
  config: BankConfig;
  db: Db;
  events: EventStore;
  repo: Repo;
  store: Store;
  chain: ChainDeps;
  ledger: SqLedger;
  addGuardian: GuardianRegistrar;
};

export const HANDOFF_TTL_MS = 10 * 60 * 1000;
/** Gas headroom the funder keeps for one transfer on Base Sepolia. */
export const MIN_FUNDER_GAS_WEI = 200_000_000_000_000n; // 0.0002 ETH
const CodeParam = z.object({ code: z.string().regex(/^\d{6}$/) });

type HandoffRow = {
  code: string;
  client_id: string;
  session_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
  wallet_address: string | null;
};
type MoveRow = {
  id: string;
  client_id: string;
  wallet_address: string;
  asset: string;
  amount: string;
  value_chf: string;
  tx_hash: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

/** SIMULATED SSO: these usernames all mean Lea (the only persona). No password. */
const LEA_USERNAMES = new Set([
  'lea',
  'lea.keller',
  'lea keller',
  LEA.email.toLowerCase(),
  LEA.id.toLowerCase(),
]);

export const registerSqRoutes = (
  app: FastifyInstance,
  { config, db, events, repo, chain, ledger, addGuardian, store }: Deps,
): void => {
  const clientGuard = requireClient(config);
  const funderAddress = getAddress(config.addresses.funder);
  const tokenOf: Record<Exclude<SqAsset, 'ETH'>, Address> = {
    USDC: getAddress(config.USDC_ADDRESS),
    EURC: getAddress(config.EURC_ADDRESS),
  };

  const handoffByCode = db.prepare('SELECT * FROM handoffs WHERE code = ?');
  const openHandoffForSession = db.prepare(
    "SELECT * FROM handoffs WHERE session_id = ? AND status = 'open' AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
  );
  const insertHandoff = db.prepare(
    "INSERT INTO handoffs (code, client_id, session_id, status, created_at, expires_at) VALUES (?, ?, ?, 'open', ?, ?)",
  );
  const claimHandoff = db.prepare(
    "UPDATE handoffs SET status = 'claimed', claimed_at = ? WHERE code = ? AND status = 'open' AND expires_at > ?",
  );
  const insertMove = db.prepare(
    `INSERT INTO sq_moves (id, client_id, wallet_address, asset, amount, value_chf, tx_hash, status, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const movesForClient = db.prepare(
    'SELECT * FROM sq_moves WHERE client_id = ? ORDER BY created_at DESC LIMIT 50',
  );
  const moveById = db.prepare('SELECT * FROM sq_moves WHERE id = ?');
  const setMoveStatus = db.prepare('UPDATE sq_moves SET status = ?, error = ?, updated_at = ? WHERE id = ?');

  const sqClient = (clientId: string): SqClient => {
    const c = repo.client(clientId);
    if (!c) throw unauthorized('Unknown client');
    return { id: c.id, firstName: c.name.split(' ')[0] ?? c.name, name: c.name, email: c.email };
  };

  const handoffView = (row: HandoffRow, req: FastifyRequest): Handoff => {
    const expired = row.status === 'open' && row.expires_at <= nowIso();
    // The client's identity is only echoed to the session that opened the code.
    const viewer = sqWebSessionOf(req);
    const showClient = row.status === 'claimed' && viewer?.cid === row.client_id;
    return HandoffSchema.parse({
      code: row.code,
      expiresAt: row.expires_at,
      status: expired ? 'expired' : row.status,
      qrUrl: `${config.WALLET_ORIGIN.replace(/\/$/, '')}/start?code=${row.code}`,
      client: showClient ? sqClient(row.client_id) : undefined,
      claimedAt: row.claimed_at ?? undefined,
      walletAddress: showClient && row.wallet_address ? row.wallet_address : undefined,
    });
  };

  const moveView = (r: MoveRow): Move =>
    MoveSchema.parse({
      id: r.id,
      asset: r.asset,
      amount: r.amount,
      valueChf: r.value_chf,
      walletAddress: r.wallet_address,
      txHash: r.tx_hash ?? undefined,
      status: r.status,
      explorerUrl: r.tx_hash ? explorerTxUrl(config.CHAIN_ID, r.tx_hash as Hex) : undefined,
      error: r.error ?? undefined,
      ledgerSimulated: true,
      at: r.created_at,
    });

  /** The client's newest Keyline wallet (the one onboarding is building), or null. */
  const newestWallet = (clientId: string) => repo.walletsForClient(clientId)[0] ?? null;

  // ---- SIMULATED SSO ----
  app.post('/sq/login', async (req, reply) => {
    const { username } = SqLoginBodySchema.parse(req.body ?? {});
    if (!LEA_USERNAMES.has(username.toLowerCase()))
      throw unauthorized('Unknown Swissquote username (simulated login: use lea.keller)');
    const sid = newId('sqs');
    const token = app.jwt.sign({ typ: 'sq-web', cid: LEA.id, sid }, { expiresIn: `${SQ_WEB_TTL_SECONDS}s` });
    reply.setCookie(SQ_WEB_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.WALLET_ORIGIN.startsWith('https://'),
      path: '/',
      maxAge: SQ_WEB_TTL_SECONDS,
    });
    events.recordEvent('sq.login', undefined, { clientId: LEA.id, sessionId: sid, simulated: true });
    return SqSessionSchema.parse({
      client: sqClient(LEA.id),
      expiresAt: new Date(Date.now() + SQ_WEB_TTL_SECONDS * 1000).toISOString(),
      simulated: true,
    });
  });

  app.post('/sq/logout', async (req, reply) => {
    const claims = sqWebSessionOf(req);
    reply.clearCookie(SQ_WEB_COOKIE, { path: '/' });
    if (claims) events.recordEvent('sq.logout', undefined, { clientId: claims.cid, sessionId: claims.sid });
    return { ok: true };
  });

  app.get('/sq/me', async (req) => {
    const claims = requireSqWeb(req);
    return SqSessionSchema.parse({
      client: sqClient(claims.cid),
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      simulated: true,
    });
  });

  // ---- ledger: web session OR wallet session ----
  app.get('/sq/positions', async (req) => {
    const web = sqWebSessionOf(req);
    const clientId = web ? web.cid : (await clientGuard(req)).clientId;
    ledger.seed(clientId); // no-op once seeded
    const t = ledger.totals(clientId);
    const fmt = (c: bigint) => `${c / 100n}.${(c % 100n).toString().padStart(2, '0')}`;
    return SqPositionsResponseSchema.parse({
      client: sqClient(clientId),
      cashChf: fmt(t.cashCents),
      investedChf: fmt(t.investedCents),
      totalChf: fmt(t.totalCents),
      valuedAt: nowIso(),
      positions: ledger.positions(clientId),
      simulated: true,
    });
  });

  // ---- handoff (laptop → phone) ----
  app.post('/handoff', async (req, reply) => {
    const claims = requireSqWeb(req);
    const open = openHandoffForSession.get(claims.sid, nowIso()) as HandoffRow | undefined;
    if (open) return handoffView(open, req);
    let code = '';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      if (!handoffByCode.get(code)) break;
      code = '';
    }
    if (!code) throw conflict('Could not allocate a code — try again');
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
    insertHandoff.run(code, claims.cid, claims.sid, createdAt, expiresAt);
    events.recordEvent('handoff.opened', undefined, { clientId: claims.cid, expiresAt, simulated: true });
    return reply.status(201).send(handoffView(handoffByCode.get(code) as HandoffRow, req));
  });

  app.get('/handoff/:code', async (req) => {
    const { code } = CodeParam.parse(req.params);
    const row = handoffByCode.get(code) as HandoffRow | undefined;
    if (!row) throw notFound('Code');
    return handoffView(row, req);
  });

  app.post('/handoff/:code/claim', async (req) => {
    const { code } = CodeParam.parse(req.params);
    const row = handoffByCode.get(code) as HandoffRow | undefined;
    if (!row) throw notFound('Code');
    if (row.status === 'claimed') throw conflict('This code was already used — ask Swissquote for a new one');
    if (row.expires_at <= nowIso()) throw conflict('This code has expired — show a new one on Swissquote');
    const at = nowIso();
    if (claimHandoff.run(at, code, at).changes !== 1)
      throw conflict('This code was already used — ask Swissquote for a new one');
    const onboardingToken = app.jwt.sign(
      { typ: 'onboarding', cid: row.client_id, hc: code },
      { expiresIn: `${ONBOARDING_TTL_SECONDS}s` },
    );
    events.recordEvent('handoff.claimed', undefined, {
      clientId: row.client_id,
      code,
      userAgent: req.headers['user-agent'],
      simulated: true,
    });
    return ClaimHandoffResponseSchema.parse({
      client: sqClient(row.client_id),
      onboardingToken,
      expiresAt: new Date(Date.now() + ONBOARDING_TTL_SECONDS * 1000).toISOString(),
    });
  });

  // ---- laptop Safety key ----
  const safetyKeyRequest = (clientId: string): SafetyKeyRequest => {
    const wallet = newestWallet(clientId);
    if (!wallet) return { walletAddress: null, status: 'none' };
    const key = store.guardians(wallet.address).find((g) => g.kind === 'safety-key');
    if (key) return { walletAddress: wallet.address, status: 'done', safetyKeyAddress: key.address };
    if (wallet.status !== 'pending') return { walletAddress: wallet.address, status: 'none' };
    return { walletAddress: wallet.address, status: 'waiting', requestedAt: wallet.createdAt };
  };

  app.get('/sq/safety-key-request', async (req) => {
    const claims = requireSqWeb(req);
    return SafetyKeyRequestSchema.parse(safetyKeyRequest(claims.cid));
  });

  app.post('/sq/safety-key', { config: { idempotent: true } }, async (req, reply) => {
    const claims = requireSqWeb(req);
    const body = SafetyKeyBodySchema.parse(req.body);
    const request = safetyKeyRequest(claims.cid);
    if (!request.walletAddress || request.status === 'none')
      throw conflict('No Keyline wallet is waiting for a Safety key — continue on your phone first');
    const guardian = await addGuardian(
      request.walletAddress,
      'safety-key',
      body.address,
      `sq-web:${claims.sid}`,
    );
    events.recordEvent('guardian.paired', request.walletAddress, {
      kind: 'safety-key',
      address: guardian.address,
      via: 'sq-web',
      simulated: true,
    });
    return reply.status(request.status === 'done' ? 200 : 201).send(guardian);
  });

  // ---- moves: Swissquote → Keyline ----
  app.post('/sq/moves', { config: { idempotent: true } }, async (req, reply) => {
    const claims = requireSqWeb(req);
    const body = MoveBodySchema.parse(req.body);
    const clientId = claims.cid;
    const { decimals } = SQ_ASSETS[body.asset];
    let amount: bigint;
    try {
      amount = toBaseUnits(body.amount, decimals);
    } catch {
      throw validationError(`${body.asset} has at most ${decimals} decimals`);
    }
    if (amount <= 0n) throw validationError('amount must be greater than zero');

    const registered = newestWallet(clientId);
    if (!registered) throw conflict('Create your Keyline wallet on your phone first');
    const wallet = await syncWalletStatus({ db, repo, events, chain }, registered);
    if (wallet.status !== 'deployed' || !wallet.attested)
      throw policyRefused("This wallet hasn't proven ownership yet", {
        travelRule: true,
        deployed: wallet.status === 'deployed',
        attested: wallet.attested,
      });

    ledger.seed(clientId);
    const available = ledger.quantity(clientId, body.asset);
    if (available < amount)
      throw policyRefused(
        `Not enough ${body.asset} on your Swissquote account (${formatUnits(available, decimals)} available)`,
        { simulated: true },
      );

    // Real balances first: never a fake hash, the 502 carries the real reason.
    const { eth: ethBalance } = await chain.funderBalances().catch((err: unknown) => {
      throw upstream(`RPC unreachable: ${err instanceof Error ? err.message : String(err)}`);
    });
    const ethNeeded = MIN_FUNDER_GAS_WEI + (body.asset === 'ETH' ? amount : 0n);
    if (ethBalance < ethNeeded)
      throw upstream(
        `Bank funder ${funderAddress} holds ${formatUnits(ethBalance, 18)} ETH — not enough for this ${body.asset === 'ETH' ? 'transfer and ' : ''}the network fee`,
        { funder: funderAddress, eth: ethBalance.toString() },
      );
    if (body.asset !== 'ETH') {
      const token = tokenOf[body.asset];
      const bal = await chain.funderTokenBalance(token).catch((err: unknown) => {
        throw upstream(`RPC unreachable: ${err instanceof Error ? err.message : String(err)}`);
      });
      if (bal < amount)
        throw upstream(
          `Bank funder ${funderAddress} holds ${formatUnits(bal, decimals)} ${body.asset} — fund it at faucet.circle.com`,
          { funder: funderAddress, balance: bal.toString(), token },
        );
    }

    const id = newId('mov');
    const valueChf = ledger.valueChf(clientId, body.asset, amount);
    // Debit first (atomic, cannot go negative), refund if the chain refuses the transaction.
    if (!ledger.debit(clientId, body.asset, amount, 'move-to-keyline', id))
      throw policyRefused(`Not enough ${body.asset} on your Swissquote account`, { simulated: true });
    const to = getAddress(wallet.address);
    const at = nowIso();
    let txHash: Hex;
    try {
      txHash =
        body.asset === 'ETH'
          ? await chain.funderTransferEth(to, amount)
          : await chain.funderTransferErc20(tokenOf[body.asset], to, amount);
    } catch (err) {
      const message = `${body.asset} transfer failed: ${err instanceof Error ? err.message : String(err)}`;
      ledger.credit(clientId, body.asset, amount, 'move-refund', id);
      insertMove.run(id, clientId, to, body.asset, body.amount, valueChf, null, 'failed', message, at, at);
      events.recordEvent('sq.move.failed', to, {
        moveId: id,
        asset: body.asset,
        amount: body.amount,
        error: message,
      });
      throw upstream(message, { moveId: id });
    }
    insertMove.run(id, clientId, to, body.asset, body.amount, valueChf, txHash, 'sent', null, at, at);
    events.recordEvent('sq.move.sent', to, {
      moveId: id,
      asset: body.asset,
      amount: body.amount,
      valueChf,
      txHash,
      funder: funderAddress,
      ledgerSimulated: true,
    });
    return reply.status(201).send(moveView(moveById.get(id) as MoveRow));
  });

  app.get('/sq/moves', async (req) => {
    const claims = requireSqWeb(req);
    const rows = movesForClient.all(claims.cid) as MoveRow[];
    for (const r of rows) {
      if (r.status !== 'sent' || !r.tx_hash) continue;
      const live = await chain.txStatus(r.tx_hash as Hex).catch(() => 'pending' as const);
      if (live === 'pending') continue;
      setMoveStatus.run(live, live === 'failed' ? 'Transaction reverted on-chain' : null, nowIso(), r.id);
      r.status = live;
      if (live === 'failed') {
        r.error = 'Transaction reverted on-chain';
        const asset = r.asset as SqAsset;
        ledger.credit(
          r.client_id,
          asset,
          toBaseUnits(r.amount, SQ_ASSETS[asset].decimals),
          'move-refund',
          r.id,
        );
      }
      events.recordEvent(`sq.move.${live}`, r.wallet_address, { moveId: r.id, txHash: r.tx_hash });
    }
    return MovesResponseSchema.parse({ moves: rows.map(moveView) });
  });

  // ---- Back to Swissquote ----
  app.get('/sq/deposit-address', async () =>
    DepositAddressResponseSchema.parse({
      address: funderAddress,
      label: 'Your Swissquote account',
      verified: true,
    }),
  );
};
