// "Top up from my Swissquote account": the funder EOA sends real USDC on-chain to a wallet that proved ownership.
// Refusing unattested wallets IS the Travel Rule check. The CHF account it debits is SIMULATED.
import { explorerTxUrl } from '@keyline/chain';
import { TopupBodySchema, TopupResponseSchema } from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import { formatUnits, getAddress, parseUnits } from 'viem';
import { clientOf } from '../auth';
import type { BankConfig } from '../config';
import { type Db, newId, nowIso } from '../db';
import type { ChainDeps } from '../deps';
import { forbidden, notFound, policyRefused, upstream } from '../errors';
import type { EventStore } from '../events';
import { FX, USDC_CHF_RATE } from '../policy/rates';
import type { Repo } from '../repo';
import type { Store } from '../store';

type Deps = { config: BankConfig; db: Db; events: EventStore; repo: Repo; store: Store; chain: ChainDeps };
/** Enough for one ERC-20 transfer on Base Sepolia with margin. */
const MIN_FUNDER_ETH_WEI = 200_000_000_000_000n; // 0.0002 ETH

export const registerTopupRoutes = (
  app: FastifyInstance,
  { config, db, events, repo, store, chain }: Deps,
): void => {
  const insertTopup = db.prepare(
    'INSERT INTO topups (id, wallet_address, client_id, amount_usdc, amount_chf, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  app.post('/topups', { config: { client: true, idempotent: true } }, async (req, reply) => {
    const body = TopupBodySchema.parse(req.body);
    const client = clientOf(req);
    const wallet = repo.walletByAddress(body.wallet);
    if (!wallet) throw notFound('Wallet');
    if (wallet.clientId !== client.clientId) throw forbidden('This wallet belongs to another client');
    if (!wallet.attested)
      throw policyRefused("This wallet hasn't proven ownership yet", { travelRule: true });

    const amountChf = Math.round(body.amountUsdc * USDC_CHF_RATE * 100) / 100;
    const amount = parseUnits(body.amountUsdc.toFixed(6), 6);
    const balance = store.accountBalanceChf(client.clientId);
    if (balance < amountChf)
      throw policyRefused(`Not enough on your Swissquote account (CHF ${balance.toFixed(2)} available)`, {
        simulated: true,
      });

    const funder = await chain.funderBalances().catch((err: unknown) => {
      throw upstream(`RPC unreachable: ${err instanceof Error ? err.message : String(err)}`);
    });
    if (funder.usdc < amount)
      throw upstream(
        `Bank funder ${funder.address} holds ${formatUnits(funder.usdc, 6)} USDC — fund it at faucet.circle.com`,
        {
          funder: funder.address,
          usdc: funder.usdc.toString(),
        },
      );
    if (funder.eth < MIN_FUNDER_ETH_WEI)
      throw upstream(
        `Bank funder ${funder.address} holds ${formatUnits(funder.eth, 18)} ETH — not enough for the network fee`,
        {
          funder: funder.address,
          eth: funder.eth.toString(),
        },
      );

    const txHash = await chain
      .funderTransferUsdc(getAddress(wallet.address), amount)
      .catch((err: unknown) => {
        throw upstream(`USDC transfer failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    // Debit only after the chain accepted the transaction; the CHF account is simulated, the USDC is not.
    if (!store.debitAccount(client.clientId, amountChf))
      throw upstream('Account debit failed after the transfer was sent', { txHash });
    insertTopup.run(
      newId('top'),
      getAddress(wallet.address),
      client.clientId,
      body.amountUsdc,
      amountChf,
      txHash,
      nowIso(),
    );
    events.recordEvent('topup.sent', wallet.address, {
      txHash,
      amountUsdc: body.amountUsdc,
      amountChf,
      accountBalanceChf: store.accountBalanceChf(client.clientId),
      funder: funder.address,
      simulatedAccount: true,
    });
    return reply.status(201).send(
      TopupResponseSchema.parse({
        txHash,
        explorerUrl: explorerTxUrl(config.CHAIN_ID, txHash),
        amountUsdc: body.amountUsdc,
        amountChf,
        accountBalanceChf: store.accountBalanceChf(client.clientId),
        fx: FX,
        simulated: true,
      }),
    );
  });
};
