/**
 * Prints the ETH (and USDC for the funder) balances of the demo EOAs and compares them
 * with the minimums the demo needs. Reads the root `.env` explicitly so it works from any cwd.
 *
 * Run: pnpm --filter @keyline/scripts check-balances
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { http, createPublicClient, erc20Abi, formatEther, formatUnits, getAddress, parseEther, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';

config({ path: resolve(import.meta.dirname, '../.env') });

const FAUCETS = [
  'Coinbase CDP faucet   https://portal.cdp.coinbase.com/products/faucet',
  'Superchain faucet     https://console.optimism.io/faucet',
  'thirdweb faucet       https://thirdweb.com/base-sepolia-testnet',
  'Circle USDC faucet    https://faucet.circle.com (Base Sepolia → USDC)',
] as const;

interface Target {
  readonly label: string;
  readonly envVar: string;
  readonly minEth: bigint;
  readonly minUsdc: bigint;
}

const TARGETS: readonly Target[] = [
  { label: 'Swissquote guardian', envVar: 'SQ_GUARDIAN_ADDRESS', minEth: parseEther('0.05'), minUsdc: 0n },
  { label: 'Partner guardian', envVar: 'PARTNER_GUARDIAN_ADDRESS', minEth: parseEther('0.05'), minUsdc: 0n },
  { label: 'Bank relayer', envVar: 'BANK_RELAYER_ADDRESS', minEth: parseEther('0.05'), minUsdc: 0n },
  { label: 'Bank funder', envVar: 'BANK_FUNDER_ADDRESS', minEth: parseEther('0.02'), minUsdc: parseUnits('10', 6) },
  { label: 'Bank verdict signer', envVar: 'BANK_VERDICT_ADDRESS', minEth: 0n, minUsdc: 0n },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing in root .env`);
  return value;
}

async function main(): Promise<void> {
  const rpcUrl = requireEnv('RPC_URL');
  const usdc = getAddress(requireEnv('USDC_ADDRESS'));
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await client.getChainId();
  console.info(`Keyline balance check · chainId ${chainId} · ${rpcUrl} · ${new Date().toISOString()}\n`);

  let short = false;
  for (const target of TARGETS) {
    const address = getAddress(requireEnv(target.envVar));
    const eth = await client.getBalance({ address });
    const ethOk = eth >= target.minEth;
    const lines = [
      `${ethOk ? '✓' : '✗'} ${target.label.padEnd(20)} ${address}`,
      `    ETH  ${formatEther(eth).padStart(12)}  (min ${formatEther(target.minEth)})`,
    ];
    if (target.minUsdc > 0n) {
      const bal = await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
      const usdcOk = bal >= target.minUsdc;
      lines.push(`    USDC ${formatUnits(bal, 6).padStart(12)}  (min ${formatUnits(target.minUsdc, 6)}) ${usdcOk ? '✓' : '✗'}`);
      if (!usdcOk) short = true;
    }
    if (!ethOk) short = true;
    console.info(lines.join('\n'));
  }

  if (short) {
    console.info('\nSome accounts are below their minimum. Faucets:');
    for (const faucet of FAUCETS) console.info(`  - ${faucet}`);
    process.exitCode = 1;
  } else {
    console.info('\nAll accounts funded.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
