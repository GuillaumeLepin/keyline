// The real RecoveryChainPort over @keyline/chain and Base Sepolia. One file, two write paths:
//  - confirmAsGuardian → `confirmRecovery` from the guardian EOA itself (the module checks msg.sender;
//    needs ETH on the EOA; only used in GUARDIAN_CONFIRM_MODE=onchain).
//  - finalize → `finalizeRecovery` from whichever submitter can pay: the guardian EOA when it holds
//    ≥ 0.002 ETH, otherwise the guardian's OWN Candide-sponsored relayer Safe (VERIFIED §11–§13).
// Everything else is a read. There is no generic Safe transaction here and never will be.
import {
  eoaSubmitter,
  recovery,
  socialRecoveryModuleAbi,
  sponsoredRelayer,
  type TxSubmitter,
} from '@keyline/chain';
import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  type Hex,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { type RecoveryChainPort, type SubmitterInfo, stubChainPort } from './chain-port';
import type { GuardianConfig } from './config';

export interface RealChainPortOptions {
  rpcUrl: string;
  chainId: number;
  module: Address;
  /** The guardian key: signs `confirmRecovery` txs (onchain mode) and owns the sponsored relayer Safe. */
  privateKey: Hex;
  /** Candide bundler+paymaster URL. Without it, finalize requires ETH on the guardian EOA. */
  candideUrl?: string;
  /** Below this balance the sponsored Safe pays for finalize. Default 0.002 ETH. */
  minEoaBalanceWei?: bigint;
  /** How long a submitter decision (one `eth_getBalance`) is reused. Default 15 s. */
  submitterCacheMs?: number;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

export interface RealChainPort extends RecoveryChainPort {
  readonly kind: 'real';
  readonly guardianAddress: Address;
}

export const DEFAULT_MIN_EOA_BALANCE_WEI = parseEther('0.002');

function chainFor(chainId: number, rpcUrl: string): Chain {
  if (chainId === baseSepolia.id) return baseSepolia;
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export function realChainPort(opts: RealChainPortOptions): RealChainPort {
  const log = opts.log ?? (() => {});
  const minBalance = opts.minEoaBalanceWei ?? DEFAULT_MIN_EOA_BALANCE_WEI;
  const cacheMs = opts.submitterCacheMs ?? 15_000;
  const chain = chainFor(opts.chainId, opts.rpcUrl);
  const account = privateKeyToAccount(opts.privateKey);
  const transport = http(opts.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const module = getAddress(opts.module);
  const base = { address: module, abi: socialRecoveryModuleAbi } as const;

  let sponsored: TxSubmitter | undefined;
  const sponsoredSubmitter = (): TxSubmitter => {
    if (!opts.candideUrl) {
      throw new Error(
        `guardian EOA ${account.address} holds less than ${formatEther(minBalance)} ETH and GUARDIAN_CANDIDE_URL is not set: no submitter can pay for the transaction`,
      );
    }
    sponsored ??= sponsoredRelayer({
      ownerPrivateKey: opts.privateKey,
      endpoints: {
        chainId: BigInt(opts.chainId),
        rpcUrl: opts.rpcUrl,
        bundlerUrl: opts.candideUrl,
        paymasterUrl: opts.candideUrl,
      },
    });
    return sponsored;
  };

  let cached: { at: number; submitter: TxSubmitter; balanceWei: bigint } | undefined;
  const pickSubmitter = async (): Promise<{ submitter: TxSubmitter; balanceWei: bigint }> => {
    if (cached && Date.now() - cached.at < cacheMs) return cached;
    const balanceWei = await publicClient.getBalance({ address: account.address });
    const submitter = balanceWei >= minBalance ? eoaSubmitter(walletClient) : sponsoredSubmitter();
    cached = { at: Date.now(), submitter, balanceWei };
    return cached;
  };

  const waitIfEoa = async (submitter: TxSubmitter, txHash: Hex): Promise<void> => {
    // The sponsored Safe already waits for inclusion; a plain EOA send returns at broadcast.
    if (submitter.kind !== 'eoa') return;
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') throw new Error(`transaction ${txHash} reverted`);
  };

  return {
    kind: 'real',
    guardianAddress: account.address,
    async isGuardian(wallet, guardian) {
      return publicClient.readContract({ ...base, functionName: 'isGuardian', args: [wallet, guardian] });
    },
    async threshold(wallet) {
      return Number(await publicClient.readContract({ ...base, functionName: 'threshold', args: [wallet] }));
    },
    async approvals(wallet, newOwners, newThreshold) {
      return Number(
        await publicClient.readContract({
          ...base,
          functionName: 'getRecoveryApprovals',
          args: [wallet, newOwners, BigInt(newThreshold)],
        }),
      );
    },
    nonce(wallet) {
      return recovery.recoveryNonce(publicClient, module, wallet);
    },
    async status(wallet) {
      const s = await recovery.status(publicClient, module, wallet);
      if (!s.pending || !s.executeAfter) return { pending: false };
      return {
        pending: true,
        executeAfter: Math.floor(s.executeAfter.getTime() / 1000),
        newOwners: s.newOwners ? [...s.newOwners] : undefined,
      };
    },
    async describeSubmitter(): Promise<SubmitterInfo> {
      const { submitter } = await pickSubmitter();
      return { kind: submitter.kind, address: submitter.address };
    },
    async confirmAsGuardian(p) {
      // `confirmRecovery` requires msg.sender == guardian: only the EOA itself can send this.
      const balanceWei = await publicClient.getBalance({ address: account.address });
      if (balanceWei < minBalance) {
        throw new Error(
          `onchain confirm needs the guardian EOA ${account.address} to pay gas; it holds ${formatEther(balanceWei)} ETH (< ${formatEther(minBalance)}). Use GUARDIAN_CONFIRM_MODE=signature.`,
        );
      }
      const submitter = eoaSubmitter(walletClient);
      const txHash = await recovery.confirmAsGuardian({
        client: submitter,
        module,
        wallet: p.wallet,
        newOwners: p.newOwners,
        threshold: BigInt(p.newThreshold),
        execute: p.execute,
      });
      log('confirmRecovery sent from the guardian EOA', {
        wallet: p.wallet,
        execute: p.execute,
        txHash,
        simulated: false,
      });
      await waitIfEoa(submitter, txHash);
      return { txHash };
    },
    async finalize(p) {
      const { submitter, balanceWei } = await pickSubmitter();
      log(
        'finalizeRecovery via ' +
          (submitter.kind === 'eoa' ? 'guardian EOA' : "guardian's sponsored relayer Safe"),
        {
          wallet: p.wallet,
          submitter: submitter.kind,
          submitterAddress: submitter.address,
          guardianEoaBalanceEth: formatEther(balanceWei),
          simulated: false,
        },
      );
      const txHash = await recovery.finalize({ client: submitter, module, wallet: p.wallet });
      await waitIfEoa(submitter, txHash);
      log('finalizeRecovery included', {
        wallet: p.wallet,
        txHash,
        submitter: submitter.kind,
        simulated: false,
      });
      return { txHash, submitter: submitter.kind };
    },
  };
}

/** Entry-point helper: the real adapter whenever RPC_URL is set; the SIMULATED stub only without one. */
export function chainPortFromConfig(
  config: GuardianConfig,
  log?: (msg: string, data?: Record<string, unknown>) => void,
): RecoveryChainPort {
  if (!config.rpcUrl) return stubChainPort({ log });
  return realChainPort({
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    module: config.recoveryModuleAddress,
    privateKey: config.privateKey,
    candideUrl: config.candideUrl,
    log,
  });
}
