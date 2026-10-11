// Paymaster gateway + relay (SPEC F1.5 / F2.4, DECISIONS #14). The bank never signs: it attaches paymaster data
// to an UNSIGNED op whose callData hash matches an approved decision, and forwards the client-signed op.
import {
  dummySignature,
  explorerTxUrl,
  isInitUserOp,
  loadPasskeyAccount,
  userOpToJson,
} from '@keyline/chain';
import {
  type PolicyDecision,
  SendUserOpBodySchema,
  SendUserOpResponseSchema,
  SponsorBodySchema,
  SponsorResponseSchema,
  UserOpStatusSchema,
  type UserOpStatusValue,
} from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import { type Address, formatUnits, getAddress, type Hex, isAddressEqual, keccak256 } from 'viem';
import { z } from 'zod';
import { parseErc20Transfer } from '../chain/decode';
import { fromChainUserOp, toChainUserOp } from '../chain/userop-codec';
import {
  decodeRevertReason,
  type FailureReason,
  GENERIC_REVERT,
  mapBundlerError,
} from '../chain/userop-errors';
import type { BankConfig } from '../config';
import { type Db, nowIso } from '../db';
import type { ChainDeps } from '../deps';
import { conflict, notFound, policyRefused, upstream } from '../errors';
import type { EventStore } from '../events';
import { loadDecision } from '../policy/decisions';
import type { Repo } from '../repo';
import type { SqLedger } from '../sq/ledger';
import type { Store } from '../store';

type Deps = {
  config: BankConfig;
  events: EventStore;
  repo: Repo;
  store: Store;
  chain: ChainDeps;
  ledger: SqLedger;
  db: Db;
};
const HashParam = z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

export const registerUserOpRoutes = (
  app: FastifyInstance,
  { config, events, repo, store, chain, ledger, db }: Deps,
): void => {
  const usdc = getAddress(config.USDC_ADDRESS);
  /** SPEC §10: a "Back to Swissquote" userOp was included → credit the SIMULATED ledger once (event `sq.credit`). */
  const creditOwnAccount = (
    row: { user_op_hash: string; wallet_address: string },
    decision: PolicyDecision,
    txHash: string | undefined,
  ) => {
    const transfer = decision.calls[0] ? parseErc20Transfer(decision.calls[0], usdc) : null;
    const wallet = repo.walletByAddress(row.wallet_address);
    if (!transfer || !wallet) return;
    const amount = formatUnits(transfer.amount, 6);
    const valueChf = ledger.valueChf(wallet.clientId, 'USDC', transfer.amount);
    const inserted = insertCredit.run(
      row.user_op_hash,
      wallet.clientId,
      wallet.address,
      'USDC',
      amount,
      valueChf,
      txHash ?? null,
      nowIso(),
    );
    if (inserted.changes !== 1) return; // already credited
    ledger.seed(wallet.clientId);
    ledger.credit(wallet.clientId, 'USDC', transfer.amount, 'back-to-swissquote', row.user_op_hash);
    events.recordEvent('sq.credit', wallet.address, {
      asset: 'USDC',
      amount,
      valueChf,
      userOpHash: row.user_op_hash,
      txHash,
      ledgerSimulated: true,
    });
  };
  const insertCredit = db.prepare(
    `INSERT OR IGNORE INTO sq_credits (user_op_hash, client_id, wallet_address, asset, amount, value_chf, tx_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const passkeyAccount = (wallet: Address) => {
    const key = store.passkeyKeyForWallet(wallet);
    if (!key) throw conflict('Wallet has no owner passkey');
    return loadPasskeyAccount(wallet, { x: BigInt(key.pub_key_x), y: BigInt(key.pub_key_y) });
  };

  /** The checks both /sponsor and /send apply to (decisionId, userOp). */
  const approvedDecisionFor = (decisionId: string, sender: Address, callData: Hex) => {
    const decision = loadDecision(store, events, decisionId);
    if (!decision) throw policyRefused('No policy decision for this id — call POST /policy/evaluate first');
    if (decision.status === 'cancelled') throw policyRefused('This request was cancelled — nothing was sent');
    if (decision.kind === 'dapp-signature')
      throw policyRefused(
        'This decision covers a signature, not a transaction — nothing can be sent with it',
      );
    if (decision.verdict !== 'approve')
      throw policyRefused(`This action was not approved (${decision.verdict})`, {
        reasons: decision.reasons,
      });
    if (new Date(decision.expiresAt).getTime() < Date.now())
      throw policyRefused('This approval expired — ask for a new decision', {
        expiresAt: decision.expiresAt,
      });
    if (!isAddressEqual(getAddress(decision.walletAddress), sender))
      throw policyRefused('userOp.sender is not the wallet this decision was made for');
    const got = keccak256(callData);
    if (got.toLowerCase() !== decision.callsHash.toLowerCase())
      throw policyRefused('userOp.callData does not match the evaluated calls', {
        expected: decision.callsHash,
        got,
      });
    return decision;
  };

  app.post('/userops/sponsor', async (req) => {
    const body = SponsorBodySchema.parse(req.body);
    const sender = getAddress(body.userOp.sender);
    const decision = approvedDecisionFor(body.decisionId, sender, body.userOp.callData as Hex);
    if (decision.consumedAt) throw policyRefused('This decision was already used to send a transaction');
    if (!decision.sponsorship.sponsored)
      throw policyRefused(
        "You used today's free transactions · the network fee is yours this time",
        decision.sponsorship,
      );
    if (!config.paymasterEnabled) throw upstream('Paymaster not configured on the bank');

    const pk = passkeyAccount(sender);
    const op = toChainUserOp(body.userOp);
    const expectedDummy = dummySignature(pk.owner, isInitUserOp(op));
    if (op.signature.toLowerCase() !== expectedDummy.toLowerCase())
      throw policyRefused(
        'userOp must be unsigned (dummy signature) — sponsor first, then sign the SafeOp hash',
      );
    if (op.paymaster != null && op.paymaster !== '0x')
      throw policyRefused('userOp already carries paymaster data');

    const sponsored = await chain.sponsor(pk, op).catch((err: unknown) => {
      throw upstream(`Paymaster refused: ${err instanceof Error ? err.message : String(err)}`);
    });
    store.recordSponsorship(decision.decisionId, sender);
    const remaining = decision.sponsorship.remainingToday;
    events.recordEvent('userop.sponsored', sender, {
      decisionId: decision.decisionId,
      kind: decision.kind,
      paymaster: sponsored.userOp.paymaster,
      callsHash: decision.callsHash,
    });
    return SponsorResponseSchema.parse({
      userOp: fromChainUserOp(sponsored.userOp),
      sponsorship: { sponsored: true, remainingToday: remaining, dailyCap: decision.sponsorship.dailyCap },
    });
  });

  app.post('/userops/send', async (req) => {
    const body = SendUserOpBodySchema.parse(req.body);
    const sender = getAddress(body.userOp.sender);
    if (!body.decisionId) throw policyRefused('decisionId is required to relay a transaction');
    const decision = approvedDecisionFor(body.decisionId, sender, body.userOp.callData as Hex);
    if (decision.consumedAt) throw policyRefused('This decision was already used to send a transaction');
    const pk = passkeyAccount(sender);
    const op = toChainUserOp(body.userOp);
    if (op.signature.toLowerCase() === dummySignature(pk.owner, isInitUserOp(op)).toLowerCase())
      throw policyRefused('userOp is not signed — the passkey must sign the SafeOp hash before sending');
    if (!config.bundlerUrl) throw upstream('Bundler not configured on the bank');

    const response = await chain.sendUserOp(pk, op).catch((err: unknown) => {
      // Never included: keep the bundler's message for Technical details, show a plain sentence.
      const bundlerMessage = err instanceof Error ? err.message : String(err);
      const mapped = mapBundlerError(bundlerMessage);
      events.recordEvent('userop.rejected', sender, {
        decisionId: decision.decisionId,
        ...mapped,
        bundlerMessage,
      });
      throw upstream(mapped.reason, { reason: mapped.reason, code: mapped.code, bundlerMessage });
    });
    const userOpHash = response.userOperationHash as Hex;
    store.insertUserOp(userOpHash, sender, decision.decisionId, userOpToJson(op));
    store.consumeDecision(decision.decisionId);
    events.recordEvent('userop.sent', sender, {
      userOpHash,
      decisionId: decision.decisionId,
      kind: decision.kind,
    });
    return SendUserOpResponseSchema.parse({ userOpHash });
  });

  app.get('/userops/:hash', async (req) => {
    const { hash } = HashParam.parse(req.params);
    const row = store.userOp(hash);
    if (!row) throw notFound('userOp');
    let status = row.status as UserOpStatusValue;
    let txHash = row.tx_hash ?? undefined;
    let blockNumber = row.block_number ?? undefined;
    let failure: FailureReason | undefined =
      row.status === 'failed' && row.reason
        ? { reason: row.reason, code: row.reason_code ?? undefined }
        : undefined;

    if (status === 'pending') {
      const live = await chain.userOpStatus(hash as Hex);
      if (live.status !== 'pending') {
        status = live.status;
        txHash = live.txHash;
        blockNumber = live.blockNumber;
        if (status === 'failed') failure = decodeRevertReason(live.revertData);
        store.updateUserOp(hash, status, txHash ?? null, blockNumber ?? null, failure);
        events.recordEvent(status === 'included' ? 'userop.included' : 'userop.failed', row.wallet_address, {
          userOpHash: hash,
          txHash,
          blockNumber,
          decisionId: row.decision_id,
          ...(failure ? { reason: failure.reason, code: failure.code } : {}),
        });
        const decision = row.decision_id ? store.decision(row.decision_id) : null;
        if (status === 'included' && decision?.kind === 'to-own-account')
          creditOwnAccount(row, decision, txHash);
        if (status === 'included' && decision?.kind === 'protect' && txHash) {
          store.markWalletDeployed(row.wallet_address, txHash);
          store.markGuardiansAdded(row.wallet_address, txHash);
          events.recordEvent('wallet.deployed', row.wallet_address, {
            txHash,
            guardians: store.guardians(row.wallet_address).map((g) => ({ kind: g.kind, address: g.address })),
            threshold: 2,
          });
        }
      }
    }
    const wallet = repo.walletByAddress(row.wallet_address);
    return UserOpStatusSchema.parse({
      userOpHash: hash,
      status,
      reason: status === 'failed' ? (failure?.reason ?? GENERIC_REVERT) : undefined,
      code: status === 'failed' ? failure?.code : undefined,
      txHash,
      blockNumber,
      explorerUrl: txHash ? explorerTxUrl(config.CHAIN_ID, txHash) : undefined,
      walletAddress: row.wallet_address,
      decisionId: row.decision_id ?? undefined,
      walletStatus: wallet?.status,
    });
  });
};
