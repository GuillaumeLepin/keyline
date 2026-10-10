// Everything that touches the network, in one injectable bag so tests can stub it (no fake chain results
// in production code: each default talks to the real bundler / paymaster / RPC / guardian process).

import type {
  GuardianSignature,
  PasskeyAccount,
  PasskeyPublicKey,
  RecoveryStatus,
  SendUseroperationResponse,
  TxSubmitter,
  UserOperationV7,
} from '@keyline/chain';
import * as chain from '@keyline/chain';
import {
  type Call,
  type GuardianIdentity,
  GuardianIdentitySchema,
  type GuardianRecoveryRequest,
  type GuardianRecoveryResponse,
  GuardianRecoveryResponseSchema,
  type Simulation,
} from '@keyline/shared';
import { type Address, erc20Abi, getAddress, type Hex, parseAbi, parseEther } from 'viem';
import { type BankPublicClient, funderClientFor, publicClientFor, relayerClientFor } from './chain/clients';
import { toSimulation } from './chain/decode';
import type { BankConfig } from './config';
import { upstream } from './errors';

export type FunderBalances = { eth: bigint; usdc: bigint; address: Address };
export type UserOpChainStatus = {
  status: 'pending' | 'included' | 'failed';
  txHash?: Hex;
  blockNumber?: number;
  /** EntryPoint revert data from the bundler receipt (`reason`) when `success: false`. */
  revertData?: Hex;
};
export type AttestationVerifyInput = {
  client: BankPublicClient;
  wallet: Address;
  fields: chain.AttestationFields;
  signature: Hex;
};
export type AttestationVerify = (
  input: AttestationVerifyInput,
) => Promise<{ ok: boolean; method: 'erc1271'; reason?: string }>;

/** What a guardian process answered to POST /recoveries (or why it could not be asked). */
export type GuardianCallResult =
  | { ok: true; status: number; body: GuardianRecoveryResponse }
  | { ok: false; status: number; reasons: string[] };

export type GuardianEventRow = {
  id: number;
  service: string;
  type: string;
  walletAddress?: string | null;
  payload: unknown;
  at: number;
};

/** HTTP client for the sq-guardian process (SPEC §4). The bank only ever sees public data and signatures. */
export type GuardianClient = {
  requestConfirmation: (body: GuardianRecoveryRequest) => Promise<GuardianCallResult>;
  /** Tells the guardian the relayed execute landed (arms its 24 h rule). `executeAfter` in unix seconds. */
  reportExecuted: (
    recoveryRequestId: string,
    input: { txHash: Hex; executeAfter: number },
  ) => Promise<GuardianCallResult>;
  finalize: (
    recoveryRequestId: string,
  ) => Promise<{ ok: true; txHash: Hex } | { ok: false; status: number; reasons: string[] }>;
  events: (limit?: number) => Promise<GuardianEventRow[]>;
};

/** Relayer-side chain operations for recovery (DECISIONS #15 Option A). Submitter = sponsored relayer Safe at 0 ETH. */
export type RecoveryChainDeps = {
  recoveryStatus: (wallet: Address) => Promise<RecoveryStatus>;
  recoveryNonce: (wallet: Address) => Promise<bigint>;
  /** Deploys the new passkey's SafeWebAuthnSignerProxy through the bank relayer; `txHash` null when it already exists. */
  deploySignerProxy: (
    owner: PasskeyPublicKey,
  ) => Promise<{ address: Address; txHash: Hex | null; submitter: TxSubmitter['kind'] | null }>;
  /** ONE `multiConfirmRecovery(..., execute=true)` carrying every collected guardian signature. Returns the tx hash. */
  confirmWithSignatures: (input: {
    wallet: Address;
    newOwners: readonly Address[];
    signatures: readonly GuardianSignature[];
  }) => Promise<{ txHash: Hex; submitter: TxSubmitter['kind'] }>;
  /** Safe `getOwners()` — distinguishes "finalized elsewhere" from "cancelled" once the module shows no request. */
  safeOwners: (wallet: Address) => Promise<Address[]>;
  /** Looks for the module's `RecoveryCanceled(wallet)` log since `fromBlock`; null when not found. */
  findCancelTx: (wallet: Address, fromBlock: bigint | undefined) => Promise<Hex | null>;
  sqGuardian: GuardianClient;
};

export type ChainDeps = RecoveryChainDeps & {
  publicClient: BankPublicClient;
  /** eth_simulateV1 (viem simulateCalls) with an 8 s timeout → decode-only fallback. Never throws for chain reasons. */
  simulate: (input: { from: Address; calls: Call[]; tokens?: Address[] }) => Promise<Simulation>;
  /** `eth_getCode(address) !== 0x` — the Safe was deployed (possibly outside the bank's relay). */
  walletHasCode: (address: Address) => Promise<boolean>;
  /** `SocialRecoveryModule.getGuardians(wallet)` — the recoverers the chain actually holds. */
  onchainGuardians: (wallet: Address) => Promise<Address[]>;
  sponsor: (pk: PasskeyAccount, userOp: UserOperationV7) => Promise<{ userOp: UserOperationV7 }>;
  sendUserOp: (pk: PasskeyAccount, userOp: UserOperationV7) => Promise<SendUseroperationResponse>;
  userOpStatus: (userOpHash: Hex) => Promise<UserOpChainStatus>;
  verifyAttestation: AttestationVerify;
  /** Reads `GET /identity` from the guardian process — the bank only learns the PUBLIC address. */
  guardianIdentity: (kind: 'swissquote' | 'partner') => Promise<GuardianIdentity>;
  funderBalances: () => Promise<FunderBalances>;
  /** Funder EOA → wallet ERC-20 transfer. Returns the real tx hash or throws. */
  funderTransferUsdc: (to: Address, amount: bigint) => Promise<Hex>;
  /** SPEC §10 moves: funder ERC-20 balance (USDC / EURC). */
  funderTokenBalance: (token: Address) => Promise<bigint>;
  /** SPEC §10 moves: funder EOA → `to` ERC-20 `transfer` (USDC / EURC). Real tx hash or throws. */
  funderTransferErc20: (token: Address, to: Address, amount: bigint) => Promise<Hex>;
  /** SPEC §10 moves: funder EOA → `to` native ETH. Real tx hash or throws. */
  funderTransferEth: (to: Address, amount: bigint) => Promise<Hex>;
  /** Receipt of a plain transaction: 'pending' while not mined. */
  txStatus: (hash: Hex) => Promise<'pending' | 'confirmed' | 'failed'>;
};

/** Relayer EOA balance at which a plain EOA transaction is preferred over the sponsored relayer Safe. */
export const RELAYER_EOA_MIN_ETH = parseEther('0.002');

const safeOwnersAbi = parseAbi(['function getOwners() view returns (address[])']);

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const createGuardianClient = (baseUrl: string, kind: 'swissquote' | 'partner'): GuardianClient => {
  const post = async (
    path: string,
    body: unknown,
  ): Promise<{ status: number; json: unknown } | { error: string }> => {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      return { status: res.status, json };
    } catch (err) {
      return { error: `${kind} guardian unreachable at ${baseUrl}: ${errMsg(err)}` };
    }
  };
  const reasonsOf = (json: unknown, status: number): string[] => {
    const r = (json as { reasons?: unknown } | null)?.reasons;
    if (Array.isArray(r) && r.every((x) => typeof x === 'string')) return r as string[];
    const m = (json as { message?: unknown } | null)?.message;
    return [typeof m === 'string' ? m : `${kind} guardian answered ${status}`];
  };

  return {
    async requestConfirmation(body) {
      const res = await post('/recoveries', body);
      if ('error' in res) return { ok: false, status: 502, reasons: [res.error] };
      if (res.status !== 200)
        return { ok: false, status: res.status, reasons: reasonsOf(res.json, res.status) };
      const parsed = GuardianRecoveryResponseSchema.safeParse(res.json);
      if (!parsed.success)
        return { ok: false, status: 502, reasons: [`${kind} guardian answered an unexpected body`] };
      return { ok: true, status: 200, body: parsed.data };
    },
    async reportExecuted(id, input) {
      const res = await post(`/recoveries/${encodeURIComponent(id)}/executed`, input);
      if ('error' in res) return { ok: false, status: 502, reasons: [res.error] };
      if (res.status !== 200)
        return { ok: false, status: res.status, reasons: reasonsOf(res.json, res.status) };
      // The executed acknowledgement is not a GuardianRecoveryResponse; surface it as an onchain-style record.
      return {
        ok: true,
        status: 200,
        body: { confirmed: true, mode: 'onchain', txHash: input.txHash, executed: true },
      };
    },
    async finalize(id) {
      const res = await post(`/recoveries/${encodeURIComponent(id)}/finalize`, {});
      if ('error' in res) return { ok: false, status: 502, reasons: [res.error] };
      const tx = (res.json as { txHash?: unknown } | null)?.txHash;
      if (res.status !== 200 || typeof tx !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(tx))
        return { ok: false, status: res.status, reasons: reasonsOf(res.json, res.status) };
      return { ok: true, txHash: tx as Hex };
    },
    async events(limit = 500) {
      const res = await fetch(`${baseUrl}/events?limit=${limit}`);
      if (!res.ok) throw upstream(`${kind} guardian /events answered ${res.status}`);
      const body = (await res.json()) as { events?: GuardianEventRow[] };
      return body.events ?? [];
    },
  };
};

export const createChainDeps = (config: BankConfig): ChainDeps => {
  const publicClient = publicClientFor(config);
  const funder = funderClientFor(config);
  const relayer = relayerClientFor(config);
  const usdc = config.USDC_ADDRESS as Address;
  const module = getAddress(config.RECOVERY_MODULE_ADDRESS);
  let sponsored: chain.SponsoredRelayer | null = null;

  /** EOA when it holds ≥ 0.002 ETH, else the Candide-sponsored relayer Safe (zero-ETH path, VERIFIED §11). */
  const pickSubmitter = async (): Promise<TxSubmitter> => {
    const balance = await publicClient.getBalance({ address: relayer.account.address });
    if (balance >= RELAYER_EOA_MIN_ETH) return chain.eoaSubmitter(relayer.client);
    if (!config.bundlerUrl || !config.paymasterUrl)
      throw upstream(
        'Relayer EOA has no ETH and no Candide URL is configured — set BANK_CANDIDE_BUNDLER_URL / BANK_CANDIDE_PAYMASTER_URL',
      );
    sponsored ??= chain.sponsoredRelayer({
      ownerPrivateKey: config.BANK_RELAYER_PRIVATE_KEY as Hex,
      endpoints: {
        chainId: BigInt(config.CHAIN_ID),
        rpcUrl: config.RPC_URL,
        bundlerUrl: config.bundlerUrl,
        paymasterUrl: config.paymasterUrl,
      },
    });
    return sponsored;
  };

  const requireUrl = (): { paymasterUrl: string; bundlerUrl: string } => {
    if (!config.paymasterUrl || !config.bundlerUrl)
      throw upstream('Paymaster not configured — set BANK_CANDIDE_BUNDLER_URL / BANK_CANDIDE_PAYMASTER_URL');
    return { paymasterUrl: config.paymasterUrl, bundlerUrl: config.bundlerUrl };
  };

  return {
    publicClient,
    walletHasCode: async (address) => {
      const code = await publicClient.getCode({ address });
      return code !== undefined && code !== '0x';
    },
    onchainGuardians: async (wallet) =>
      [
        ...(await publicClient.readContract({
          address: module,
          abi: chain.socialRecoveryModuleAbi,
          functionName: 'getGuardians',
          args: [wallet],
        })),
      ].map((g) => getAddress(g)),
    simulate: async ({ from, calls, tokens }) =>
      toSimulation(
        await chain.simulate({
          client: publicClient,
          from,
          calls,
          tokens,
          timeoutMs: 8_000,
          decode: { wallet: from },
        }),
      ),
    recoveryStatus: (wallet) => chain.recovery.status(publicClient, module, wallet),
    recoveryNonce: (wallet) => chain.recoveryNonce(publicClient, module, wallet),
    deploySignerProxy: async (owner) => {
      const address = chain.passkeySignerAddress(owner);
      const code = await publicClient.getCode({ address });
      if (code && code !== '0x') return { address, txHash: null, submitter: null };
      const submitter = await pickSubmitter();
      const result = await chain.recovery.deploySignerProxy({
        client: submitter,
        reader: publicClient,
        owner,
      });
      return { address: result.address, txHash: result.txHash, submitter: submitter.kind };
    },
    confirmWithSignatures: async ({ wallet, newOwners, signatures }) => {
      const submitter = await pickSubmitter();
      const txHash = await chain.recovery.confirmWithSignatures({
        client: submitter,
        module,
        wallet,
        newOwners,
        threshold: 1n,
        signatures: chain.sortGuardianSignatures(signatures),
        execute: true,
      });
      return { txHash, submitter: submitter.kind };
    },
    safeOwners: async (wallet) =>
      (
        await publicClient.readContract({ address: wallet, abi: safeOwnersAbi, functionName: 'getOwners' })
      ).map((o) => getAddress(o)),
    // @keyline/chain pages eth_getLogs in ≤ 200-block windows (sepolia.base.org caps the range).
    findCancelTx: (wallet, fromBlock) =>
      chain.findCancelTx({ client: publicClient, wallet, module, fromBlock: fromBlock ?? undefined }),
    sqGuardian: createGuardianClient(config.SQ_GUARDIAN_URL, 'swissquote'),
    sponsor: (pk, userOp) => chain.sponsor(pk, userOp, requireUrl()),
    sendUserOp: (pk, userOp) => chain.sendUserOp(pk, userOp, requireUrl().bundlerUrl),
    // Raw eth_getUserOperationReceipt (not @keyline/chain.getUserOpStatus) so the receipt's revert `reason` is kept.
    userOpStatus: async (hash) => {
      const res = await fetch(requireUrl().bundlerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getUserOperationReceipt',
          params: [hash],
        }),
      }).catch((err: unknown) => {
        throw upstream(`Bundler unreachable: ${errMsg(err)}`);
      });
      const body = (await res.json().catch(() => null)) as {
        result?: {
          success: boolean;
          reason?: Hex;
          receipt: { transactionHash: Hex; blockNumber: Hex | string | number };
        } | null;
        error?: { message?: string };
      } | null;
      if (!res.ok || !body || body.error)
        throw upstream(`Bundler receipt lookup failed: ${body?.error?.message ?? `HTTP ${res.status}`}`);
      const r = body.result;
      if (!r) return { status: 'pending' };
      return {
        status: r.success ? 'included' : 'failed',
        txHash: r.receipt.transactionHash,
        blockNumber: Number(BigInt(r.receipt.blockNumber)),
        revertData: r.success ? undefined : r.reason,
      };
    },
    // ERC-1271 against the deployed Safe through viem — a library call, nothing hand-rolled (see packages/chain).
    verifyAttestation: (input) => chain.attestation.verify(input),
    guardianIdentity: async (kind) => {
      const base = kind === 'swissquote' ? config.SQ_GUARDIAN_URL : config.PARTNER_GUARDIAN_URL;
      const res = await fetch(`${base}/identity`).catch((err: unknown) => {
        throw upstream(
          `${kind} guardian unreachable at ${base}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      if (!res.ok) throw upstream(`${kind} guardian answered ${res.status}`);
      const identity = GuardianIdentitySchema.parse(await res.json());
      if (identity.kind !== kind)
        throw upstream(`${base}/identity reports kind ${identity.kind}, expected ${kind}`);
      return identity;
    },
    funderBalances: async () => {
      const [eth, usdcBal] = await Promise.all([
        publicClient.getBalance({ address: funder.account.address }),
        publicClient.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [funder.account.address],
        }),
      ]);
      return { eth, usdc: usdcBal, address: funder.account.address };
    },
    funderTokenBalance: (token) =>
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [funder.account.address],
      }),
    funderTransferErc20: (token, to, amount) =>
      funder.client.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, amount],
      }),
    funderTransferEth: (to, amount) => funder.client.sendTransaction({ to, value: amount }),
    txStatus: async (hash) => {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash });
        return receipt.status === 'success' ? 'confirmed' : 'failed';
      } catch {
        return 'pending'; // not mined yet (TransactionReceiptNotFoundError) or RPC hiccup: ask again later
      }
    },
    funderTransferUsdc: (to, amount) =>
      funder.client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, amount],
      }),
  };
};
