/**
 * Prints the ETH balances of the EOAs that pay gas (guardians, relayer, funder) and tops them up from
 * BANK_FUNDER_PRIVATE_KEY when the funder has ETH; otherwise prints faucet instructions.
 * Sponsored userOps (client Safe, sponsored relayer Safe) need none of this — only direct EOA calls do.
 *
 * Usage: pnpm --filter @keyline/scripts fund-guardians [--target 0.05] [--dry-run]
 */
import { explorerTxUrl } from '@keyline/chain';
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  type Hex,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { arg, env, hasFlag, log, requireEnv } from './src/cli.js';

const FAUCETS = [
  'https://portal.cdp.coinbase.com/products/faucet (Coinbase Developer Platform, Base Sepolia, 0.1 ETH/day)',
  'https://console.optimism.io/faucet (Superchain faucet)',
  'https://thirdweb.com/base-sepolia-testnet (thirdweb)',
  'https://www.alchemy.com/faucets/base-sepolia (Alchemy)',
  'USDC: https://faucet.circle.com (Base Sepolia → funder address)',
];

interface Target {
  readonly name: string;
  readonly address: Address;
  readonly minEth: string;
}

async function main(): Promise<void> {
  const chainId = BigInt(requireEnv('CHAIN_ID'));
  const client = createPublicClient({ chain: baseSepolia, transport: http(requireEnv('RPC_URL')) });
  const target = parseEther(arg('--target') ?? '0.05');
  const funderKey = env('BANK_FUNDER_PRIVATE_KEY') as Hex | undefined;
  const funder = funderKey ? privateKeyToAccount(funderKey) : undefined;
  const funderAddress = getAddress(funder?.address ?? requireEnv('BANK_FUNDER_ADDRESS'));

  const targets: Target[] = [
    { name: 'sq-guardian', address: getAddress(requireEnv('SQ_GUARDIAN_ADDRESS')), minEth: '0.05' },
    { name: 'partner-guardian', address: getAddress(requireEnv('PARTNER_GUARDIAN_ADDRESS')), minEth: '0.05' },
    { name: 'bank-relayer', address: getAddress(requireEnv('BANK_RELAYER_ADDRESS')), minEth: '0.05' },
  ];

  const funderBalance = await client.getBalance({ address: funderAddress });
  log('funder', { address: funderAddress, balanceEth: formatEther(funderBalance), hasKey: Boolean(funder) });

  const needs: { target: Target; missing: bigint }[] = [];
  for (const t of targets) {
    const balance = await client.getBalance({ address: t.address });
    const missing = balance >= target ? 0n : target - balance;
    log(t.name, {
      address: t.address,
      balanceEth: formatEther(balance),
      minEth: t.minEth,
      topUpEth: formatEther(missing),
    });
    if (missing > 0n) needs.push({ target: t, missing });
  }
  if (needs.length === 0) {
    log('all gas EOAs are at or above the target', formatEther(target));
    return;
  }

  const totalNeeded = needs.reduce((sum, n) => sum + n.missing, 0n) + parseEther('0.002');
  if (!funder || funderBalance < totalNeeded) {
    log('cannot top up', {
      reason: funder
        ? `funder holds ${formatEther(funderBalance)} ETH, needs ${formatEther(totalNeeded)}`
        : 'no BANK_FUNDER_PRIVATE_KEY',
      sendEthTo: funderAddress,
      faucets: FAUCETS,
      meanwhile:
        'recovery works with zero ETH via the Candide-sponsored relayer Safe (packages/chain/src/relayer.ts)',
    });
    process.exit(2);
  }
  if (hasFlag('--dry-run')) {
    log(
      'dry run — would send',
      needs.map((n) => ({ to: n.target.name, eth: formatEther(n.missing) })),
    );
    return;
  }
  const wallet = createWalletClient({
    account: funder,
    chain: baseSepolia,
    transport: http(requireEnv('RPC_URL')),
  });
  for (const n of needs) {
    const hash = await wallet.sendTransaction({ to: n.target.address, value: n.missing });
    await client.waitForTransactionReceipt({ hash });
    log(`funded ${n.target.name}`, { eth: formatEther(n.missing), tx: explorerTxUrl(chainId, hash) });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
