/**
 * Stage truth panel (SPEC §10.1 "On-chain"): one cheap read of everything the stage shows about a wallet,
 * polled every 2 s from the browser. No indexer: state comes from one multicall, recent transactions from
 * `eth_getLogs` scanned newest-first in 5 000-block chunks and cached per wallet in memory.
 *
 * Log-range caveat (VERIFIED §19): the public `https://sepolia.base.org` caps `eth_getLogs` at **200 blocks**
 * (error -32614 "eth_getLogs is limited to a 200 range"). That cap is why the bank's old `findCancelTx`
 * (one 5 000-block query on that RPC) returned null every time. When the given client refuses the range on
 * Base Sepolia, the log scan falls back to `BASE_SEPOLIA_LOGS_RPC_URL` (publicnode, CORS `*`, 20 000+ block
 * ranges verified); pass `logsClient` to choose another log-capable RPC explicitly.
 */
import {
  type Address,
  type Chain,
  type Client,
  createClient,
  erc20Abi,
  formatUnits,
  getAddress,
  type Hex,
  http,
  numberToHex,
  pad,
  parseAbi,
  type RpcLog,
  type Transport,
  toEventSelector,
} from 'viem';
import { getBlock, getBlockNumber, getChainId, getCode, multicall, readContract } from 'viem/actions';
import { socialRecoveryModuleAbi } from './abi/socialRecoveryModule.js';
import { type PasskeyPublicKey, passkeySignerAddress } from './account.js';
import {
  ENTRYPOINT_V07,
  explorerTxUrl,
  KNOWN_GRACE_PERIODS_SECONDS,
  RECOVERY_MODULE_3_MINUTES,
  WEBAUTHN_SIGNER_FACTORY,
} from './constants.js';

type ReadClient = Client<Transport, Chain | undefined>;

/** Circle USDC on Base Sepolia (same as `KNOWN_TOKENS` in simulate.ts). */
export const USDC_BASE_SEPOLIA: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
/** Log-capable public Base Sepolia RPC used when the given client caps `eth_getLogs` ranges. */
export const BASE_SEPOLIA_LOGS_RPC_URL = 'https://base-sepolia-rpc.publicnode.com';
const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

export const STAGE_TRUTH_LOOKBACK_BLOCKS = 20_000n;
export const STAGE_TRUTH_CHUNK_BLOCKS = 5_000n;
/** Re-scan this many blocks below the last scanned head on every poll (load-balanced RPC nodes can lag a block or two). */
const RESCAN_OVERLAP_BLOCKS = 20n;
/** sepolia.base.org's eth_getLogs cap (VERIFIED §19). */
const SMALL_RANGE_BLOCKS = 200n;
const MAX_PARALLEL_CHUNKS = 4;
const RECENT_TX_COUNT = 3;

export type StageTxKind =
  | 'protect'
  | 'transfer'
  | 'recovery-execute'
  | 'recovery-finalize'
  | 'recovery-cancel'
  | 'signer-deploy'
  | 'other';

export interface StageTx {
  readonly hash: Hex;
  readonly kind: StageTxKind;
  readonly blockNumber: number;
  /** Block timestamp (unix seconds). */
  readonly at?: number;
  readonly explorerUrl: string;
}

export interface StageRecoveryTruth {
  readonly pending: boolean;
  /** Unix seconds. */
  readonly executeAfter?: number;
  readonly newOwners?: Address[];
  readonly approvals?: number;
  readonly graceSeconds: number;
  readonly secondsRemaining?: number;
}

export interface StageTruth {
  readonly wallet: Address;
  readonly deployed: boolean;
  readonly owners: Address[];
  readonly guardians: Address[];
  /** Recovery (guardian) threshold from the module — the "2 of 3" on the panel. */
  readonly threshold: number;
  readonly recovery: StageRecoveryTruth;
  /** 6-decimals human string, e.g. "12.5". */
  readonly usdcBalance: string;
  /** Last 3, newest first. */
  readonly recentTxs: StageTx[];
  /** Unix milliseconds. */
  readonly readAt: number;
}

export interface ReadStageTruthInput {
  readonly client: ReadClient;
  readonly wallet: Address;
  readonly module?: Address;
  readonly usdc?: Address;
  /** Lowest block scanned for recent txs. Default `latest - 20 000` (~11 h on Base). */
  readonly fromBlock?: bigint;
  /** Upper bound of the log scan (tests on old history). Setting it bypasses the per-wallet cache. */
  readonly toBlock?: bigint;
  /** Client used for `eth_getLogs` only. Default: `client`, falling back to publicnode on a range cap. */
  readonly logsClient?: ReadClient;
}

const safeAbi = parseAbi([
  'function getOwners() view returns (address[])',
  'function isOwner(address owner) view returns (bool)',
]);

const T = {
  recoveryExecuted: toEventSelector('RecoveryExecuted(address,address[],uint256,uint256,uint64,uint256)'),
  recoveryFinalized: toEventSelector('RecoveryFinalized(address,address[],uint256,uint256)'),
  recoveryCanceled: toEventSelector('RecoveryCanceled(address,uint256)'),
  guardianAdded: toEventSelector('GuardianAdded(address,address)'),
  enabledModule: toEventSelector('EnabledModule(address)'),
  accountDeployed: toEventSelector('AccountDeployed(bytes32,address,address,address)'),
  transfer: toEventSelector('Transfer(address,address,uint256)'),
  signerCreated: toEventSelector('Created(address,uint256,uint256,uint176)'),
} as const;

// ───────────────────────────── log scanning ─────────────────────────────

interface LogQuery {
  readonly address: Address | Address[];
  readonly topics?: (Hex | Hex[] | null)[];
}

const logsClientCache = new WeakMap<ReadClient, ReadClient>();
const chainIdCache = new WeakMap<ReadClient, number>();

async function chainIdOf(client: ReadClient): Promise<number> {
  const known = client.chain?.id ?? chainIdCache.get(client);
  if (known !== undefined) return known;
  const id = await getChainId(client);
  chainIdCache.set(client, id);
  return id;
}

function isRangeCapError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${(err as { details?: string }).details ?? ''}` : '';
  return /limited to|block range|range (is )?too|exceed|too many blocks|-32614|not supported on free plan/i.test(
    text,
  );
}

async function rawGetLogs(client: ReadClient, q: LogQuery, from: bigint, to: bigint): Promise<RpcLog[]> {
  const request = client.request as unknown as (args: {
    method: 'eth_getLogs';
    params: [{ address: Address | Address[]; topics?: (Hex | Hex[] | null)[]; fromBlock: Hex; toBlock: Hex }];
  }) => Promise<RpcLog[]>;
  return request({
    method: 'eth_getLogs',
    params: [
      { address: q.address, topics: q.topics, fromBlock: numberToHex(from), toBlock: numberToHex(to) },
    ],
  });
}

/** `eth_getLogs` on `client`; on a Base Sepolia range cap, switch (once, remembered) to the publicnode RPC. */
async function getLogsWithFallback(
  client: ReadClient,
  explicit: ReadClient | undefined,
  q: LogQuery,
  from: bigint,
  to: bigint,
): Promise<RpcLog[]> {
  // Small (incremental-poll) ranges stay on the caller's RPC: it is ~10x faster than the fallback and every
  // public RPC we measured accepts ≥ 200 blocks. Only wide scans use the remembered fallback.
  const small = to - from < SMALL_RANGE_BLOCKS;
  const chosen = explicit ?? (small ? client : (logsClientCache.get(client) ?? client));
  try {
    return await rawGetLogs(chosen, q, from, to);
  } catch (err) {
    if (explicit || chosen !== client || !isRangeCapError(err)) throw err;
    if ((await chainIdOf(client)) !== 84532) throw err;
    const fallback = createClient({ chain: client.chain, transport: http(BASE_SEPOLIA_LOGS_RPC_URL) });
    logsClientCache.set(client, fallback);
    return rawGetLogs(fallback, q, from, to);
  }
}

/** Ranges [from, to] split into `STAGE_TRUTH_CHUNK_BLOCKS` chunks, newest first. */
function chunksNewestFirst(from: bigint, to: bigint): [bigint, bigint][] {
  const out: [bigint, bigint][] = [];
  for (let hi = to; hi >= from; hi -= STAGE_TRUTH_CHUNK_BLOCKS) {
    const lo = hi - STAGE_TRUTH_CHUNK_BLOCKS + 1n > from ? hi - STAGE_TRUTH_CHUNK_BLOCKS + 1n : from;
    out.push([lo, hi]);
    if (lo === from) break;
  }
  return out;
}

/**
 * Scans [from, to] newest-first in parallel windows of chunks and stops after the window in which
 * `enough(found)` became true. Returns the lowest block actually scanned.
 */
async function scanNewestFirst<R>(
  from: bigint,
  to: bigint,
  scanChunk: (lo: bigint, hi: bigint) => Promise<R[]>,
  enough: (found: R[]) => boolean,
): Promise<{ found: R[]; lowestScanned: bigint }> {
  const chunks = chunksNewestFirst(from, to);
  const found: R[] = [];
  let lowestScanned = to + 1n;
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL_CHUNKS) {
    const window = chunks.slice(i, i + MAX_PARALLEL_CHUNKS);
    const results = await Promise.all(window.map(([lo, hi]) => scanChunk(lo, hi)));
    for (const r of results) found.push(...r);
    lowestScanned = window[window.length - 1]?.[0] ?? lowestScanned;
    if (enough(found)) break;
  }
  return { found, lowestScanned };
}

// ───────────────────────────── classification ─────────────────────────────

interface FoundTx {
  readonly hash: Hex;
  readonly kind: StageTxKind;
  readonly blockNumber: bigint;
  readonly logIndex: number;
}

const KIND_PRIORITY: readonly StageTxKind[] = [
  'recovery-cancel',
  'recovery-finalize',
  'recovery-execute',
  'protect',
  'signer-deploy',
  'transfer',
  'other',
];

/** Kind of a single log, or null when the log does not concern the wallet (e.g. someone else's signer). */
function logKind(
  log: RpcLog,
  ctx: { wallet: string; module: string; usdc: string; signers: ReadonlySet<string> },
): StageTxKind | null {
  const address = log.address.toLowerCase();
  const t0 = log.topics[0];
  if (address === ctx.module) {
    if (t0 === T.recoveryCanceled) return 'recovery-cancel';
    if (t0 === T.recoveryFinalized) return 'recovery-finalize';
    if (t0 === T.recoveryExecuted) return 'recovery-execute';
    if (t0 === T.guardianAdded) return 'protect';
    return 'other';
  }
  if (address === WEBAUTHN_SIGNER_FACTORY.toLowerCase()) {
    if (t0 !== T.signerCreated) return null;
    // Created(address signer, uint256 x, uint256 y, uint176 verifiers) — nothing indexed; signer is word 0.
    const signer = `0x${log.data.slice(26, 66)}`.toLowerCase();
    return ctx.signers.has(signer) ? 'signer-deploy' : null;
  }
  if (address === ENTRYPOINT_V07.toLowerCase()) {
    return t0 === T.accountDeployed ? 'protect' : 'other';
  }
  if (address === ctx.usdc) return t0 === T.transfer ? 'transfer' : 'other';
  if (address === ctx.wallet) {
    if (t0 === T.enabledModule && `0x${log.data.slice(26, 66)}`.toLowerCase() === ctx.module)
      return 'protect';
    return 'other';
  }
  return 'other';
}

function classify(
  logs: readonly RpcLog[],
  ctx: { wallet: string; module: string; usdc: string; signers: ReadonlySet<string> },
): FoundTx[] {
  const byTx = new Map<Hex, { kinds: Set<StageTxKind>; blockNumber: bigint; logIndex: number }>();
  for (const log of logs) {
    if (!log.transactionHash || log.blockNumber == null) continue;
    const kind = logKind(log, ctx);
    if (kind === null) continue;
    const entry = byTx.get(log.transactionHash) ?? {
      kinds: new Set<StageTxKind>(),
      blockNumber: BigInt(log.blockNumber),
      logIndex: log.logIndex == null ? 0 : Number(log.logIndex),
    };
    entry.kinds.add(kind);
    byTx.set(log.transactionHash, entry);
  }
  return [...byTx.entries()].map(([hash, e]) => ({
    hash,
    kind: KIND_PRIORITY.find((k) => e.kinds.has(k)) ?? 'other',
    blockNumber: e.blockNumber,
    logIndex: e.logIndex,
  }));
}

function newestFirst(a: FoundTx, b: FoundTx): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
  return b.logIndex - a.logIndex;
}

/** The three queries per chunk that cover every wallet-related event (see VERIFIED §19 for the mapping). */
function walletQueries(wallet: Address, module: Address, usdc: Address): LogQuery[] {
  const w = pad(wallet.toLowerCase() as Hex);
  return [
    // Safe events (AddedOwner/RemovedOwner/ChangedThreshold/EnabledModule/ExecutionFromModule*) + signer proxy creations.
    { address: [wallet, WEBAUTHN_SIGNER_FACTORY] },
    // Recovery module events (wallet is topic 1) + USDC Transfer from the wallet.
    { address: [module, usdc], topics: [null, w] },
    // USDC Transfer to the wallet + EntryPoint UserOperationEvent / AccountDeployed with sender = wallet.
    { address: [usdc, ENTRYPOINT_V07], topics: [null, null, w] },
  ];
}

// ───────────────────────────── per-wallet cache ─────────────────────────────

interface WalletScanCache {
  low: bigint;
  high: bigint;
  logs: RpcLog[];
}

const scanCache = new Map<string, WalletScanCache>();
const blockTimeCache = new Map<string, number>();
const coldScans = new Map<string, Promise<RpcLog[]>>();

/** For tests and "Reset story": forget every cached scan. */
export function clearStageTruthCache(): void {
  scanCache.clear();
}

function dedupeLogs(logs: readonly RpcLog[]): RpcLog[] {
  const seen = new Map<string, RpcLog>();
  for (const l of logs) seen.set(`${l.transactionHash}:${l.logIndex}`, l);
  return [...seen.values()];
}

/**
 * Raw logs for the recent-tx list: first call per wallet scans [fromBlock, latest] newest-first and stops once
 * 3 txs are found; later calls only re-scan from the cached head (minus a small overlap) to `latest`.
 * Runs in parallel with the state reads, so signer-proxy matching happens later in `classify`; the early-stop
 * test ignores proxy creations (conservative: may scan one window further, never stops too early).
 */
async function scanRecentLogs(args: {
  input: ReadStageTruthInput;
  chainId: number;
  latest: bigint;
  wallet: Address;
  module: Address;
  usdc: Address;
}): Promise<RpcLog[]> {
  const { input, chainId, latest, wallet, module, usdc } = args;
  const head = input.toBlock ?? latest;
  const lookbackFloor = head > STAGE_TRUTH_LOOKBACK_BLOCKS ? head - STAGE_TRUTH_LOOKBACK_BLOCKS : 0n;
  const fromBlock = input.fromBlock ?? lookbackFloor;
  const queries = walletQueries(wallet, module, usdc);
  const scanCtx = {
    wallet: wallet.toLowerCase(),
    module: module.toLowerCase(),
    usdc: usdc.toLowerCase(),
    signers: new Set<string>(),
  };
  const scanChunk = async (lo: bigint, hi: bigint): Promise<RpcLog[]> =>
    (
      await Promise.all(queries.map((q) => getLogsWithFallback(input.client, input.logsClient, q, lo, hi)))
    ).flat();
  const enough = (logs: RpcLog[]): boolean => classify(logs, scanCtx).length >= RECENT_TX_COUNT;

  const cacheKey = `${chainId}:${wallet}:${module}:${usdc}`;
  const useCache = input.toBlock === undefined;
  const cached = useCache ? scanCache.get(cacheKey) : undefined;
  if (!cached || fromBlock > cached.high) {
    // The cold scan can take seconds; a 2 s poller must not start a second one for the same wallet.
    const running = useCache ? coldScans.get(cacheKey) : undefined;
    if (running) return running;
    const cold = scanNewestFirst(fromBlock, head, scanChunk, enough).then((scan) => {
      const logs = dedupeLogs(scan.found);
      if (useCache) scanCache.set(cacheKey, { low: scan.lowestScanned, high: head, logs });
      return logs;
    });
    if (!useCache) return cold;
    coldScans.set(cacheKey, cold);
    try {
      return await cold;
    } finally {
      coldScans.delete(cacheKey);
    }
  }
  const restart = cached.high > RESCAN_OVERLAP_BLOCKS ? cached.high - RESCAN_OVERLAP_BLOCKS : 0n;
  const newer = head >= restart ? (await scanNewestFirst(restart, head, scanChunk, () => false)).found : [];
  let logs = dedupeLogs([...cached.logs, ...newer]);
  let low = cached.low;
  if (!enough(logs) && fromBlock < cached.low) {
    const older = await scanNewestFirst(fromBlock, cached.low - 1n, scanChunk, (f) =>
      enough([...logs, ...f]),
    );
    logs = dedupeLogs([...logs, ...older.found]);
    low = older.lowestScanned;
  }
  scanCache.set(cacheKey, { low, high: head > cached.high ? head : cached.high, logs });
  return logs;
}

// ───────────────────────────── public API ─────────────────────────────

export async function readStageTruth(input: ReadStageTruthInput): Promise<StageTruth> {
  const { client } = input;
  const wallet = getAddress(input.wallet);
  const module = getAddress(input.module ?? RECOVERY_MODULE_3_MINUTES);
  const usdc = getAddress(input.usdc ?? USDC_BASE_SEPOLIA);
  const graceSeconds = KNOWN_GRACE_PERIODS_SECONDS[module.toLowerCase()] ?? 0;

  const moduleBase = { address: module, abi: socialRecoveryModuleAbi } as const;
  const [chainId, latest] = await Promise.all([chainIdOf(client), getBlockNumber(client, { cacheTime: 0 })]);
  const [code, reads, logs] = await Promise.all([
    getCode(client, { address: wallet }),
    multicall(client, {
      multicallAddress: MULTICALL3,
      allowFailure: true,
      contracts: [
        { address: wallet, abi: safeAbi, functionName: 'getOwners' },
        { ...moduleBase, functionName: 'getGuardians', args: [wallet] },
        { ...moduleBase, functionName: 'threshold', args: [wallet] },
        { ...moduleBase, functionName: 'getRecoveryRequest', args: [wallet] },
        { address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] },
      ],
    }),
    scanRecentLogs({ input, chainId, latest, wallet, module, usdc }),
  ]);
  const [ownersR, guardiansR, thresholdR, requestR, balanceR] = reads;
  const deployed = code !== undefined && code !== '0x';
  const owners = ownersR.status === 'success' ? ownersR.result.map((o) => getAddress(o)) : [];
  const guardians = guardiansR.status === 'success' ? guardiansR.result.map((g) => getAddress(g)) : [];
  const threshold = thresholdR.status === 'success' ? Number(thresholdR.result) : 0;
  const balance = balanceR.status === 'success' ? balanceR.result : 0n;

  const nowSeconds = Math.floor(Date.now() / 1000);
  let recovery: StageRecoveryTruth = { pending: false, graceSeconds };
  if (requestR.status === 'success' && requestR.result.executeAfter > 0n) {
    const executeAfter = Number(requestR.result.executeAfter);
    recovery = {
      pending: true,
      executeAfter,
      newOwners: requestR.result.newOwners.map((o) => getAddress(o)),
      approvals: Number(requestR.result.guardiansApprovalCount),
      graceSeconds,
      secondsRemaining: Math.max(0, executeAfter - nowSeconds),
    };
  } else if (requestR.status === 'success' && requestR.result.guardiansApprovalCount > 0n) {
    recovery = { pending: false, approvals: Number(requestR.result.guardiansApprovalCount), graceSeconds };
  }

  // A signer-proxy creation counts only when the proxy is (or is about to become) an owner of this wallet.
  const signers = new Set([...owners, ...(recovery.newOwners ?? [])].map((a) => a.toLowerCase()));
  const ctx = {
    wallet: wallet.toLowerCase(),
    module: module.toLowerCase(),
    usdc: usdc.toLowerCase(),
    signers,
  };
  const top = classify(logs, ctx).sort(newestFirst).slice(0, RECENT_TX_COUNT);
  const times = await Promise.all(
    top.map(async (tx) => {
      const key = `${chainId}:${tx.blockNumber}`;
      const hit = blockTimeCache.get(key);
      if (hit !== undefined) return hit;
      const block = await getBlock(client, { blockNumber: tx.blockNumber }).catch(() => null);
      if (!block) return undefined;
      const at = Number(block.timestamp);
      blockTimeCache.set(key, at);
      return at;
    }),
  );
  const recentTxs: StageTx[] = top.map((tx, i) => ({
    hash: tx.hash,
    kind: tx.kind,
    blockNumber: Number(tx.blockNumber),
    at: times[i],
    explorerUrl: explorerTxUrl(chainId, tx.hash),
  }));

  return {
    wallet,
    deployed,
    owners,
    guardians,
    threshold,
    recovery,
    usdcBalance: formatUnits(balance, 6),
    recentTxs,
    readAt: Date.now(),
  };
}

/**
 * "Try the old phone" (SPEC §10.1): is this passkey's SafeWebAuthnSignerProxy an owner of the Safe right now?
 * `signer` is the proxy address, or the passkey public key (the proxy address is derived, no RPC).
 * An undeployed wallet has no owners → false.
 */
export async function isOwner(input: {
  client: ReadClient;
  wallet: Address;
  signer: Address | PasskeyPublicKey;
}): Promise<boolean> {
  const signer = typeof input.signer === 'string' ? input.signer : passkeySignerAddress(input.signer);
  try {
    return await readContract(input.client, {
      address: getAddress(input.wallet),
      abi: safeAbi,
      functionName: 'isOwner',
      args: [getAddress(signer)],
    });
  } catch (err) {
    const code = await getCode(input.client, { address: getAddress(input.wallet) });
    if (code === undefined || code === '0x') return false;
    throw err;
  }
}

/**
 * Hash of the newest `RecoveryCanceled(wallet)` tx on the module, or null. Scans newest-first from `latest`
 * down to `fromBlock` (default `latest - 20 000`) in 5 000-block chunks, with the same range-cap fallback as
 * `readStageTruth`. The bank's `deps.findCancelTx(wallet, fromBlock)` should delegate here.
 */
export async function findCancelTx(input: {
  client: ReadClient;
  wallet: Address;
  module?: Address;
  fromBlock?: bigint;
  toBlock?: bigint;
  logsClient?: ReadClient;
}): Promise<Hex | null> {
  const module = getAddress(input.module ?? RECOVERY_MODULE_3_MINUTES);
  const head = input.toBlock ?? (await getBlockNumber(input.client, { cacheTime: 0 }));
  const fromBlock =
    input.fromBlock ?? (head > STAGE_TRUTH_LOOKBACK_BLOCKS ? head - STAGE_TRUTH_LOOKBACK_BLOCKS : 0n);
  const query: LogQuery = {
    address: module,
    topics: [T.recoveryCanceled, pad(getAddress(input.wallet).toLowerCase() as Hex)],
  };
  const { found } = await scanNewestFirst(
    fromBlock,
    head,
    (lo, hi) => getLogsWithFallback(input.client, input.logsClient, query, lo, hi),
    (f) => f.length > 0,
  );
  const newest = found
    .filter((l) => l.transactionHash && l.blockNumber != null)
    .sort((a, b) => {
      const d = BigInt(b.blockNumber ?? '0x0') - BigInt(a.blockNumber ?? '0x0');
      return d !== 0n ? (d > 0n ? 1 : -1) : Number(b.logIndex ?? '0x0') - Number(a.logIndex ?? '0x0');
    })[0];
  return newest?.transactionHash ?? null;
}
