// POST /policy/evaluate — the only way to obtain a decisionId that /userops/sponsor will honour.
// `protect` / `cancel-recovery` calls are built by the bank (never trusted from the client); `transfer` must be one
// ERC-20 transfer on USDC whose CHF value the bank recomputes; `dapp` is the dApp's own calls, checked against the
// allowlist. Every evaluation runs sanctions screening and eth_simulateV1 (8 s → decode-only fallback).
// Tier 2: POST /policy/:id/step-up (Safety-key EIP-712 signature). Tier 3: cooling with POST /policy/:id/cancel.
import {
  createPasskeyAccount,
  decodeCalls,
  loadPasskeyAccount,
  protectTransactions,
  socialRecoveryModuleAbi,
  suggestedApprovalCap,
} from '@keyline/chain';
import {
  type Call,
  type Dapp,
  DappsResponseSchema,
  PendingApprovalsResponseSchema,
  PolicyDecisionSchema,
  PolicyRequestSchema,
  policyStepUpTypedData,
  type Screening,
  type Simulation,
  StepUpBodySchema,
  type SuggestedCap,
} from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  isAddressEqual,
  maxUint256,
  verifyTypedData,
} from 'viem';
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
import type { ChainDeps } from '../deps';
import { conflict, forbidden, notFound, policyRefused, validationError } from '../errors';
import type { EventStore } from '../events';
import { loadDecision, type StoredDecision, stripStored } from '../policy/decisions';
import { evaluate, satisfyStepUp } from '../policy/engine';
import { usdcToChf } from '../policy/rates';
import type { Repo } from '../repo';
import type { ScreeningService } from '../screening';
import { loadAllowlist } from '../seed';
import { GUARDIAN_THRESHOLD, type Store } from '../store';
import { syncWalletStatus } from '../wallet-sync';

type Deps = {
  config: BankConfig;
  db: Db;
  events: EventStore;
  repo: Repo;
  store: Store;
  chain: Pick<ChainDeps, 'simulate' | 'walletHasCode' | 'onchainGuardians'>;
  screening: ScreeningService;
};
const IdParam = z.object({ id: z.string().min(1) });
const AddressParam = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

/** "Approve 100 USDC instead" — the cap the review screen offers for an unlimited USDC approve. */
export const SUGGESTED_CAP_USDC = '100';

export const registerPolicyRoutes = (
  app: FastifyInstance,
  { config, db, events, repo, store, chain, screening }: Deps,
): void => {
  const usdc = getAddress(config.USDC_ADDRESS);
  const recoveryModule = getAddress(config.RECOVERY_MODULE_ADDRESS);
  const depositAddress = getAddress(config.addresses.funder);
  const ownAccountScreening = (): Screening => ({
    counterparty: depositAddress,
    listsChecked: ['OFAC-SDN', 'SECO'],
    hit: false,
    simulatedHit: false,
    simulated: true,
    note: 'Not screened: your own Swissquote account (bank deposit address)',
  });

  const ownedDecision = (req: Parameters<typeof clientOf>[0], id: string): StoredDecision => {
    const d = loadDecision(store, events, id);
    if (!d) throw notFound('Decision');
    const wallet = repo.walletByAddress(d.walletAddress);
    if (!wallet || wallet.clientId !== clientOf(req).clientId)
      throw forbidden('This decision belongs to another client');
    return d;
  };
  const publicDecision = (d: StoredDecision) => PolicyDecisionSchema.parse(stripStored(d));

  /** The addresses a set of calls hands value or permissions to: transfer recipients, approve spenders, targets. */
  const counterpartiesOf = (calls: Call[], wallet: Address): Address[] => {
    const out: Address[] = [];
    const push = (a: string) => {
      const addr = getAddress(a);
      if (!out.some((x) => isAddressEqual(x, addr))) out.push(addr);
    };
    decodeCalls(calls, { wallet }).forEach((d, i) => {
      if (/^(transfer|approve)\(/.test(d.fn) && d.args[0]) push(d.args[0]);
      else if (d.fn === 'transferFrom(address,address,uint256)' && d.args[1]) push(d.args[1]);
      const call = calls[i];
      if (call) push(call.to);
    });
    return out;
  };

  /** Screen every counterparty; a hit anywhere is the decision's screening, otherwise the primary one. */
  const screenAll = (counterparties: Address[]): Screening => {
    const results = counterparties.map((a) => screening.screen(a));
    return results.find((r) => r.hit) ?? results[0] ?? screening.screen(counterparties[0] as Address);
  };

  const simulateOrFallback = async (
    wallet: Address,
    calls: Call[],
    deployed: boolean,
  ): Promise<Simulation> => {
    const fallback = fallbackSimulation(calls, { usdc, recoveryModule, wallet });
    if (!deployed) return fallback; // eth_simulateV1 from an undeployed Safe would not reflect the deploy+protect op
    try {
      return await chain.simulate({ from: wallet, calls, tokens: [usdc] });
    } catch (err) {
      app.log.warn({ err }, 'simulate failed — decode-only fallback');
      return fallback;
    }
  };

  const suggestedCapFor = (calls: Call[], sim: Simulation): SuggestedCap | undefined => {
    const i = sim.decodedCalls.findIndex(
      (d) =>
        d.risk === 'danger' && d.fn === 'approve(address,uint256)' && isAddressEqual(getAddress(d.to), usdc),
    );
    const call = i >= 0 ? calls[i] : undefined;
    if (!call) return undefined;
    const capped = suggestedApprovalCap(call, SUGGESTED_CAP_USDC);
    return {
      call: metaTransactionToCall(capped),
      amount: SUGGESTED_CAP_USDC,
      symbol: 'USDC',
      humanText: `Approve ${Number(SUGGESTED_CAP_USDC).toFixed(2)} USDC instead`,
    };
  };

  app.post('/policy/evaluate', { config: { client: true } }, async (req, reply) => {
    const body = PolicyRequestSchema.parse(req.body);
    const client = clientOf(req);
    const id = body.id ?? newId('dec');
    const existing = loadDecision(store, events, id);
    if (existing) return publicDecision(existing); // idempotent on the client's request id

    const registered = repo.walletByAddress(body.walletAddress);
    if (!registered) throw notFound('Wallet');
    if (registered.clientId !== client.clientId) throw forbidden('This wallet belongs to another client');
    // A Safe deployed outside the bank's relay still reads `pending` here — check the chain before refusing.
    const wallet =
      body.kind === 'protect' ? registered : await syncWalletStatus({ db, repo, events, chain }, registered);
    const key = store.passkeyKeyForWallet(wallet.address);
    if (!key) throw conflict('Wallet has no owner passkey');
    // DECISIONS #16: after a recovery the live passkey no longer derives the Safe address, so the counterfactual
    // check only applies to the protect op of a still-undeployed wallet; otherwise the stored address is the truth.
    const walletAddress = getAddress(wallet.address);
    const pk = loadPasskeyAccount(walletAddress, { x: BigInt(key.pub_key_x), y: BigInt(key.pub_key_y) });
    if (wallet.status === 'pending') {
      const derived = createPasskeyAccount({
        pubKeyX: BigInt(key.pub_key_x),
        pubKeyY: BigInt(key.pub_key_y),
      });
      if (!isAddressEqual(derived.address, walletAddress))
        throw conflict('Registered passkey does not derive this wallet address');
    }

    let calls: Call[];
    let callData: Hex;
    let chfValue = 0;
    let counterparties: Address[] = [walletAddress];
    let kind = body.kind;

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
    } else if (body.kind === 'cancel-recovery') {
      // F4b: one `cancelRecovery()` on the module, built by the bank. Only the Safe itself may call it.
      if (wallet.status === 'pending') throw conflict('This wallet is not protected yet — nothing to cancel');
      const data = encodeFunctionData({ abi: socialRecoveryModuleAbi, functionName: 'cancelRecovery' });
      calls = [{ to: recoveryModule, value: '0', data }];
      callData = encodeCallData([callToMetaTransaction(calls[0] as Call)]);
    } else if (body.kind === 'transfer' || body.kind === 'to-own-account') {
      if (wallet.status === 'pending') throw conflict('Protect your wallet before sending');
      if (body.calls.length !== 1) throw validationError('A transfer is exactly one call (USDC transfer)');
      const call = body.calls[0] as Call;
      const transfer = parseErc20Transfer(call, usdc);
      if (!transfer)
        throw validationError('Only an ERC-20 transfer on USDC is supported for kind "transfer"', { usdc });
      if (body.recipientAddress && !isAddressEqual(getAddress(body.recipientAddress), transfer.to))
        throw validationError('recipientAddress does not match the transfer recipient');
      counterparties = [transfer.to];
      chfValue = usdcToChf(transfer.amount);
      // SPEC §10 "Back to Swissquote": a transfer to the bank deposit address is the client's own account.
      const toOwnAccount = isAddressEqual(transfer.to, depositAddress);
      if (body.kind === 'to-own-account' && !toOwnAccount)
        throw validationError('kind "to-own-account" must send to GET /sq/deposit-address', {
          depositAddress,
        });
      kind = toOwnAccount ? 'to-own-account' : 'transfer';
      calls = [{ to: usdc, value: '0', data: call.data }];
      callData = encodeCallData([callToMetaTransaction(call)]);
    } else {
      // kind: 'dapp' — the dApp's calls as requested; the engine checks every target against the allowlist.
      if (wallet.status === 'pending') throw conflict('Protect your wallet before using apps');
      if (!body.dappId) throw validationError('dappId is required for kind "dapp"');
      if (body.calls.length === 0) throw validationError('A dApp request needs at least one call');
      calls = body.calls.map((c) => ({ to: getAddress(c.to), value: c.value, data: c.data }));
      callData = encodeCallData(calls.map(callToMetaTransaction));
      counterparties = counterpartiesOf(calls, walletAddress);
      chfValue = calls.reduce((sum, c) => {
        const t = parseErc20Transfer(c, usdc);
        return t ? sum + usdcToChf(t.amount) : sum;
      }, 0);
    }

    const simulation = await simulateOrFallback(walletAddress, calls, wallet.status !== 'pending');
    const recipient = counterparties[0] ?? walletAddress;
    const decision = evaluate(
      {
        id,
        kind,
        walletAddress,
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
        // Own account: no counterparty to screen (the deposit address is Swissquote's).
        screening: kind === 'to-own-account' ? ownAccountScreening() : screenAll(counterparties),
        simulation,
        callsHash: callsHashOf(callData),
        suggestedCap: suggestedCapFor(calls, simulation),
      },
    );
    store.saveDecision(decision, body);
    events.recordEvent('policy.decided', wallet.address, {
      decisionId: id,
      kind,
      dappId: body.dappId,
      verdict: decision.verdict,
      tier: decision.tier,
      chfValue: decision.chfValue,
      sponsored: decision.sponsorship.sponsored,
      screeningHit: decision.screening.hit,
      simulationProvider: decision.simulation.provider,
      coolingUntil: decision.coolingUntil,
      deviceLabel: body.deviceLabel,
    });
    return reply.status(201).send(PolicyDecisionSchema.parse(decision));
  });

  app.get('/policy/:id', { config: { client: true } }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return publicDecision(ownedDecision(req, id));
  });

  /** Tier 2: the laptop's Safety key co-approves. EIP-712 `KeylinePolicyStepUp` over (decisionId, wallet, callsHash, chfValueCents). */
  app.post('/policy/:id/step-up', { config: { client: true } }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = StepUpBodySchema.parse(req.body);
    const d = ownedDecision(req, id);
    if (d.status === 'cancelled') throw conflict('This request was cancelled');
    if (d.consumedAt) throw conflict('This decision was already used to send a transaction');
    if (d.verdict !== 'step-up')
      throw conflict(`Nothing to approve — this decision is "${d.verdict}"`, { verdict: d.verdict });
    if (new Date(d.expiresAt).getTime() < Date.now())
      throw policyRefused('This approval expired — review the transfer again', { expiresAt: d.expiresAt });
    const safetyKey = store.guardians(d.walletAddress).find((g) => g.kind === 'safety-key');
    if (!safetyKey) throw conflict('No Safety key is registered for this wallet');
    const signer = getAddress(safetyKey.address);
    if (body.guardianAddress && !isAddressEqual(getAddress(body.guardianAddress), signer))
      throw policyRefused("That key is not this wallet's Safety key", { expected: signer });
    const ok = await verifyTypedData({
      address: signer,
      ...policyStepUpTypedData(config.CHAIN_ID, d),
      signature: body.signature as Hex,
    });
    if (!ok) throw policyRefused('Signature is not from your Safety key', { expected: signer });
    const updated = satisfyStepUp(stripStored(d), {
      signature: body.signature as Hex,
      guardianAddress: signer,
      at: new Date(),
    });
    store.updateDecision(updated);
    events.recordEvent('policy.step-up.satisfied', d.walletAddress, {
      decisionId: id,
      guardianAddress: signer,
      chfValue: d.chfValue,
      deviceLabel: (req.headers['x-device-label'] as string | undefined) ?? 'laptop',
    });
    return PolicyDecisionSchema.parse(updated);
  });

  /** Tier 3 cancel (also lets the laptop refuse a pending step-up). Idempotent. */
  app.post('/policy/:id/cancel', { config: { client: true } }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const d = ownedDecision(req, id);
    if (d.status === 'cancelled') return publicDecision(d);
    if (d.consumedAt) throw conflict('This transaction was already sent — it cannot be cancelled');
    if (d.verdict !== 'cooling' && d.verdict !== 'step-up')
      throw conflict(`Only waiting or step-up requests can be cancelled (this one is "${d.verdict}")`);
    const at = new Date().toISOString();
    const updated = {
      ...stripStored(d),
      status: 'cancelled' as const,
      cancelledAt: at,
      reasons: ['Cancelled · nothing was sent', ...d.reasons],
    };
    store.updateDecision(updated);
    events.recordEvent('policy.cancelled', d.walletAddress, {
      decisionId: id,
      verdict: d.verdict,
      chfValue: d.chfValue,
      deviceLabel: (req.headers['x-device-label'] as string | undefined) ?? undefined,
    });
    return PolicyDecisionSchema.parse(updated);
  });

  /** What the laptop's /approve screen polls: step-up decisions still waiting for the Safety key. */
  app.get('/wallets/:address/pending-approvals', { config: { client: true } }, async (req) => {
    const { address } = AddressParam.parse(req.params);
    const wallet = repo.walletByAddress(address);
    if (!wallet) throw notFound('Wallet');
    if (wallet.clientId !== clientOf(req).clientId) throw forbidden('This wallet belongs to another client');
    const decisions = store
      .pendingStepUps(wallet.address)
      .filter((d) => d.status !== 'cancelled' && !d.stepUp?.satisfiedBy)
      .map(publicDecision);
    return PendingApprovalsResponseSchema.parse({ decisions });
  });

  /** Allowlist for the /dapps screen; mock dApps carry the canned request the client can submit as kind 'dapp'. */
  app.get('/dapps', async () => {
    // Provenance notes live only in the JSON (not in the table).
    const notes = new Map(loadAllowlist().map((d) => [d.id, d.note] as const));
    const dapps: Dapp[] = repo.dapps().map((row) => {
      const d: Dapp = { ...row, note: notes.get(row.id) };
      const [firstContract] = d.contracts;
      if (!firstContract) return d;
      if (d.id === 'demoswap') {
        const spender = getAddress(
          d.contracts.find((c) => !isAddressEqual(getAddress(c), usdc)) ?? firstContract,
        );
        return {
          ...d,
          demoRequest: {
            calls: [
              {
                to: usdc,
                value: '0',
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [spender, maxUint256],
                }),
              },
            ],
            description: 'DemoSwap asks for permission to spend your USDC — unlimited amount, no expiry',
          },
        };
      }
      if (!d.allowlisted) {
        return {
          ...d,
          demoRequest: {
            calls: [{ to: getAddress(firstContract), value: '0', data: '0xdeadbeef' }],
            description: `${d.name} asks your wallet to call a contract Swissquote has not reviewed`,
          },
        };
      }
      return d;
    });
    return DappsResponseSchema.parse({ dapps });
  });

  /** Which lists are loaded (Security centre / desk). */
  app.get('/policy/screening', async () => screening.status());
};
