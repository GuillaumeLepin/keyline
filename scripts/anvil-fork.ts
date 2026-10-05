/**
 * Offline fallback: an Anvil fork of Base Sepolia on http://127.0.0.1:8545 with the same chainId (84532) and the
 * same contract addresses, so every READ in the app (balances, guardian set, recovery status, Basescan links) and
 * every plain EOA transaction (guardian confirmRecovery/finalize with a funded EOA, funder USDC top-up) keep working
 * when the venue Wi-Fi dies.
 *
 * What does NOT work on a fork — say so to the judges, do not fake it:
 *   - ERC-4337 userOps: there is no bundler and no Candide paymaster on the fork, so "Protect my wallet", Send and
 *     the owner's cancelRecovery (all sponsored userOps) cannot be submitted. Use the pre-deployed Safe
 *     (`pnpm demo:predeploy`) and narrate those steps from the backup video.
 *   - The sponsored relayer Safe (0 ETH path). On the fork the guardian / relayer EOAs can be funded for free with
 *     `anvil_setBalance`, so the scripts' `--relayer eoa` path works offline.
 *
 * Usage: pnpm --filter @keyline/scripts anvil-fork [--port 8545] [--block-time 2] [--fund]
 *   --fund   setBalance 10 ETH on the five demo EOAs (root .env addresses) once the fork is up.
 *
 * Then switch every process to the fork (60 s):
 *   RPC_URL=http://127.0.0.1:8545 in services/bank/.env + services/sq-guardian/.env
 *   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 in apps/wallet/.env.local
 *   restart `pnpm dev`. `.env.anvil` (git-ignored) is written next to the root .env with exactly these lines.
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createPublicClient, http, parseEther, toHex } from 'viem';
import { arg, env, hasFlag, log, requireEnv, sleep } from './src/cli.js';

const ANVIL = resolve(homedir(), '.foundry/bin/anvil');
const ROOT = resolve(import.meta.dirname, '..');

const DEMO_EOAS = [
  'SQ_GUARDIAN_ADDRESS',
  'PARTNER_GUARDIAN_ADDRESS',
  'BANK_RELAYER_ADDRESS',
  'BANK_FUNDER_ADDRESS',
  'BANK_VERDICT_ADDRESS',
] as const;

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await response.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

async function main(): Promise<void> {
  if (!existsSync(ANVIL)) {
    console.error(
      `anvil not found at ${ANVIL}. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup`,
    );
    process.exit(2);
  }
  const forkUrl = requireEnv('RPC_URL');
  const chainId = requireEnv('CHAIN_ID');
  const port = arg('--port') ?? '8545';
  const blockTime = arg('--block-time') ?? '2';
  const localUrl = `http://127.0.0.1:${port}`;

  log('anvil fork', { forkUrl, chainId, port, blockTime });
  const child = spawn(
    ANVIL,
    ['--fork-url', forkUrl, '--chain-id', chainId, '--port', port, '--block-time', blockTime, '--silent'],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  child.on('exit', (code) => {
    console.error(`anvil exited with code ${code}`);
    process.exit(code ?? 1);
  });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));

  // Wait for the fork to answer, then prove the addresses are really there.
  const client = createPublicClient({ transport: http(localUrl) });
  for (let i = 0; i < 60; i += 1) {
    try {
      await client.getChainId();
      break;
    } catch {
      await sleep(1000);
    }
  }
  const head = await client.getBlockNumber();
  const moduleCode = await client.getCode({
    address: requireEnv('RECOVERY_MODULE_ADDRESS') as `0x${string}`,
  });
  log('fork ready', {
    url: localUrl,
    chainId: await client.getChainId(),
    forkedAtBlock: head.toString(),
    recoveryModuleHasCode: moduleCode !== undefined && moduleCode !== '0x',
  });

  if (hasFlag('--fund')) {
    for (const name of DEMO_EOAS) {
      const address = env(name);
      if (!address) continue;
      await rpc(localUrl, 'anvil_setBalance', [address, toHex(parseEther('10'))]);
      log(`funded 10 ETH (fork only) → ${name}`, address);
    }
  }

  const envAnvil = resolve(ROOT, '.env.anvil');
  writeFileSync(
    envAnvil,
    [
      '# Offline fallback — Anvil fork of Base Sepolia (scripts/anvil-fork.ts). Same chainId, same addresses.',
      '# Copy these lines over the matching ones in services/bank/.env, services/sq-guardian/.env and',
      '# apps/wallet/.env.local, then restart `pnpm dev`. Reads + EOA txs work; sponsored userOps do NOT (no bundler).',
      `RPC_URL=${localUrl}`,
      `NEXT_PUBLIC_RPC_URL=${localUrl}`,
      `CHAIN_ID=${chainId}`,
      `NEXT_PUBLIC_CHAIN_ID=${chainId}`,
      '',
    ].join('\n'),
  );
  log('switch written', envAnvil);
  console.info(`
If Wi-Fi dies (60 s):
  1. sed -i '' 's#^RPC_URL=.*#RPC_URL=${localUrl}#' services/bank/.env services/sq-guardian/.env
  2. sed -i '' 's#^NEXT_PUBLIC_RPC_URL=.*#NEXT_PUBLIC_RPC_URL=${localUrl}#' apps/wallet/.env.local
  3. restart pnpm dev — balances, recoverers and the recovery countdown read from the fork.
  4. Tell the judges: "local fork of Base Sepolia, same addresses; sponsored transactions need the live bundler,
     so those steps are from the recording." Revert the two sed lines when the network is back.
Anvil keeps running in this terminal (Ctrl-C stops it).`);
  await new Promise<never>(() => {});
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
