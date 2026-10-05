/**
 * `pnpm demo:reset` — back to a clean demo state (SPEC §8).
 *
 *   1. Wipe every service database: services/{bank,sq-guardian,partner-guardian}/data/*.sqlite (+ -wal/-shm).
 *      The services re-create and re-seed (Lea, contacts, dApps, sanctioned address) on their next start.
 *      With `--keep-db` nothing is deleted; only the bank's sponsorship counters are cleared (SPEC §0: 20/day).
 *   2. Print the five demo EOAs with ETH/USDC balances (same thresholds as check-balances.ts) + faucet URLs.
 *   3. Print the pre-deployed fallback wallets from data/demo-state.json if present (`--all` removes it too).
 *
 * It NEVER touches a `.env` file: the only files it may delete match `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`
 * under services/\*\/data/, plus data/demo-state.json with --all.
 *
 * Usage: pnpm --filter @keyline/scripts demo:reset [--keep-db] [--all] [--db <path>]... [--only]
 *   --db    extra SQLite file(s) to include (e.g. an isolated e2e DB: --db services/bank/data/e2e-bank.sqlite)
 *   --only  touch ONLY the --db files, leave the services' default databases alone (shared machine, other stacks)
 *   Services should be stopped first; a running service keeps writing to the deleted inode (warned, not fatal).
 */
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Address } from 'viem';
import {
  basescanAddress,
  DEMO_STATE_PATH,
  demoBalances,
  printBalances,
  printFaucets,
  ROOT,
  readDemoState,
} from './demo-lib.js';
import { hasFlag, log } from './src/cli.js';

const SERVICES = ['bank', 'sq-guardian', 'partner-guardian'] as const;
const SQLITE_FILE = /\.sqlite(-wal|-shm|-journal)?$/;

function extraDbArgs(): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === '--db' && process.argv[i + 1])
      out.push(resolve(ROOT, process.argv[i + 1] as string));
  }
  return out;
}

function sqliteFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => SQLITE_FILE.test(name))
    .map((name) => resolve(dir, name));
}

async function listening(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function assertSafeToDelete(path: string): void {
  const name = basename(path);
  if (name.startsWith('.env') || !SQLITE_FILE.test(name)) {
    throw new Error(`refusing to delete ${path}: only *.sqlite(-wal|-shm|-journal) files are ever removed`);
  }
}

function wipeDatabases(): void {
  const only = hasFlag('--only');
  if (only && extraDbArgs().length === 0) throw new Error('--only needs at least one --db <path>');
  const files = [
    ...(only ? [] : SERVICES.flatMap((s) => sqliteFilesUnder(resolve(ROOT, 'services', s, 'data')))),
    ...extraDbArgs()
      .flatMap((p) => [p, `${p}-wal`, `${p}-shm`, `${p}-journal`])
      .filter((p) => existsSync(p)),
  ];
  if (files.length === 0) {
    log('databases', 'nothing to delete (fresh checkout)');
    return;
  }
  for (const file of files) {
    assertSafeToDelete(file);
    const size = statSync(file).size;
    unlinkSync(file);
    log('deleted', `${file.replace(`${ROOT}/`, '')} (${size} bytes)`);
  }
}

/** --keep-db: clear today's sponsorship counter without touching anything else (events stay append-only). */
function clearSponsorshipCounters(): void {
  const candidates = [
    ...(hasFlag('--only') ? [] : [resolve(ROOT, 'services/bank/data/bank.sqlite')]),
    ...extraDbArgs(),
  ].filter((p) => existsSync(p));
  for (const path of candidates) {
    const db = new DatabaseSync(path);
    try {
      const before = db.prepare('SELECT COUNT(*) AS n FROM sponsorships').get() as { n: number };
      db.exec('DELETE FROM sponsorships');
      log('sponsorship counters cleared', { db: path.replace(`${ROOT}/`, ''), removed: before.n });
    } finally {
      db.close();
    }
  }
}

async function main(): Promise<void> {
  log('demo-reset', {
    keepDb: hasFlag('--keep-db'),
    all: hasFlag('--all'),
    only: hasFlag('--only'),
    extraDbs: extraDbArgs(),
  });

  const running = hasFlag('--only')
    ? []
    : (
        await Promise.all([4000, 4001, 4002].map(async (port) => ((await listening(port)) ? port : null)))
      ).filter((p): p is number => p !== null);
  if (running.length > 0 && !hasFlag('--keep-db')) {
    console.warn(
      `⚠ services still listening on ${running.join(', ')} — stop \`pnpm dev\` first, or they keep writing to the deleted file.`,
    );
  }

  if (hasFlag('--keep-db')) clearSponsorshipCounters();
  else wipeDatabases();

  if (hasFlag('--all') && existsSync(DEMO_STATE_PATH)) {
    unlinkSync(DEMO_STATE_PATH);
    log('deleted', DEMO_STATE_PATH.replace(`${ROOT}/`, ''));
  }

  const state = hasFlag('--all') ? null : readDemoState();
  const extra: { label: string; address: Address }[] = state
    ? [
        { label: 'Lea fallback Safe', address: state.lea.addresses.safe },
        { label: 'Twin Safe', address: state.twin.addresses.safe },
      ]
    : [];

  log('balances');
  const { lines, ok } = await demoBalances(extra);
  printBalances(lines);
  if (!ok) printFaucets();
  else console.info('\nAll demo EOAs funded.');

  if (state) {
    log('pre-deployed fallback (data/demo-state.json)', {
      lea: basescanAddress(state.lea.addresses.safe),
      twin: basescanAddress(state.twin.addresses.safe),
      twinRecoveryStaged: state.twin.pendingRecovery?.executeAfter ?? 'no',
    });
  } else {
    log('pre-deployed fallback', 'none — run `pnpm demo:predeploy` before the pitch');
  }
  console.info('\nNext: `pnpm dev` (services re-seed on start) · `pnpm demo:predeploy` · `pnpm demo:open`.');
  process.exitCode = ok ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
