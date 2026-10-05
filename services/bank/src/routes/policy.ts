// POST /policy/evaluate — the only way to obtain a decisionId that /userops/sponsor will honour.
// `protect` calls are recomputed by the bank from the registered recoverers (never trusted from the client);
// `transfer` must be one ERC-20 transfer on USDC whose CHF value the bank recomputes.
import { createPasskeyAccount, protectTransactions } from '@keyline/chain';
import { type Call, PolicyDecisionSchema, PolicyRequestSchema } from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import { type Address, getAddress, isAddressEqual } from 'viem';
import { z } from 'zod';
import { clientOf } from '../auth';
import {
  callsHashOf,
  callToMetaTransaction,
  encodeCallData,
  metaTransactionToCall,
  protectCallData,
} from '../chain/calldata';
import { fallbackSimulation, parseErc20Transfer } from '../chain/decode';
import type { BankConfig } from '../config';
import { type Db, newId } from '../db';
import { conflict, forbidden, notFound, policyRefused, validationError } from '../errors';
import type { EventStore } from '../events';
import { evaluate } from '../policy/engine';
import { usdcToChf } from '../policy/rates';
import type { Repo } from '../repo';
import { screen } from '../screening';
import { sanctionedSeedAddress } from '../seed';
import { GUARDIAN_THRESHOLD, type Store } from '../store';

type Deps = { config: BankConfig; db: Db; events: EventStore; repo: Repo; store: Store };
const IdParam = z.object({ id: z.string().min(1) });

export const registerPolicyRoutes = (
  app: FastifyInstance,
  { config, db, events, repo, store }: Deps,
): void => {
  const usdc = getAddress(config.USDC_ADDRESS);
  const recoveryModule = getAddress(config.RECOVERY_MODULE_ADDRESS);

  app.post('/policy/evaluate', { config: { client: true } }, async (req, reply) => {
    const body = PolicyRequestSchema.parse(req.body);
    const client = clientOf(req);
    const id = body.id ?? newId('dec');
    const existing = store.decision(id);
    if (existing) {
      // Idempotent on the client's request id.
      const { consumedAt: _c, ...decision } = existing;
      return PolicyDecisionSchema.parse(decision);
    }

    const wallet = repo.walletByAddress(body.walletAddress);
    if (!wallet) throw notFound('Wallet');
    if (wallet.clientId !== client.clientId) throw forbidden('This wallet belongs to another client');
    const key = store.passkeyKeyForWallet(wallet.address);
    if (!key) throw conflict('Wallet has no owner passkey');
    const pk = createPasskeyAccount({ pubKeyX: BigInt(key.pub_key_x), pubKeyY: BigInt(key.pub_key_y) });
    if (!isAddressEqual(pk.address, wallet.address as Address))
      throw conflict('Registered passkey does not derive this wallet address');

    let calls: Call[];
    let callData: `0x${string}`;
    let chfValue = 0;
    let recipient: Address = getAddress(wallet.address);

    if (body.kind === 'protect') {
      if (wallet.status !== 'pending') throw conflict('This wallet is already protected');
      const guardians = store.orderedGuardians(wallet.address, wallet.recoveryMode);
      if (!guardians) throw policyRefused('Add all three recoverers before protecting your wallet');
      const txs = protectTransactions(pk, {
        guardians: guardians.map((g) => getAddress(g.address)),
        threshold: GUARDIAN_THRESHOLD,
        recoveryModule,
      });
      calls = txs.map(metaTransactionToCall);
      callData = protectCallData(pk, txs, false);
    } else {
      if (wallet.status === 'pending') throw conflict('Protect your wallet before sending');
      if (body.calls.length !== 1)
        throw validationError('Exactly one call is supported in this wave (USDC transfer)');
      const call = body.calls[0] as Call;
      const transfer = parseErc20Transfer(call, usdc);
      if (!transfer)
        throw validationError('Only an ERC-20 transfer on USDC is supported in this wave', { usdc });
      if (body.recipientAddress && !isAddressEqual(getAddress(body.recipientAddress), transfer.to))
        throw validationError('recipientAddress does not match the transfer recipient');
      recipient = transfer.to;
      chfValue = usdcToChf(transfer.amount);
      calls = [{ to: usdc, value: '0', data: call.data }];
      callData = encodeCallData([callToMetaTransaction(call)]);
    }

    const sanctioned = sanctionedSeedAddress(db);
    const decision = evaluate(
      {
        id,
        kind: body.kind,
        walletAddress: getAddress(wallet.address),
        calls,
        chfValue,
        recipientAddress: recipient,
        dappId: body.dappId,
        deviceLabel: body.deviceLabel,
        requestedAt: new Date(),
      },
      {
        dailySpentChf: store.dailySpentChf(wallet.address),
        sponsoredToday: store.sponsoredTodayForClient(client.clientId),
        contacts: repo.contacts(client.clientId),
        allowlist: repo.dapps(),
        screening: screen(recipient, {
          sanctionedTestAddress: sanctioned ? getAddress(sanctioned) : undefined,
        }),
        simulation: fallbackSimulation(calls, { usdc, recoveryModule, wallet: getAddress(wallet.address) }),
        callsHash: callsHashOf(callData),
      },
    );
    store.saveDecision(decision, body);
    events.recordEvent('policy.decided', wallet.address, {
      decisionId: id,
      kind: body.kind,
      verdict: decision.verdict,
      tier: decision.tier,
      chfValue: decision.chfValue,
      sponsored: decision.sponsorship.sponsored,
      deviceLabel: body.deviceLabel,
    });
    return reply.status(201).send(PolicyDecisionSchema.parse(decision));
  });

  app.get('/policy/:id', { config: { client: true } }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const d = store.decision(id);
    if (!d) throw notFound('Decision');
    const wallet = repo.walletByAddress(d.walletAddress);
    if (!wallet || wallet.clientId !== clientOf(req).clientId)
      throw forbidden('This decision belongs to another client');
    const { consumedAt: _c, ...decision } = d;
    return PolicyDecisionSchema.parse(decision);
  });
};
