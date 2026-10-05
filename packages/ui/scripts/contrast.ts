/**
 * WCAG 2.x contrast check for every text/background pair in tokens.css.
 * Run: pnpm --filter @keyline/ui contrast
 * Exit code 1 if any pair falls below its threshold (4.5:1 normal text, 3:1 large text / UI).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/tokens.css'), 'utf8');

const tokens = new Map<string, string>();
for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  tokens.set(m[1] as string, (m[2] as string).toLowerCase());
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (lin[0] as number) + 0.7152 * (lin[1] as number) + 0.0722 * (lin[2] as number);
}

export function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (a + 0.05) / (b + 0.05);
}

type Pair = { fg: string; bg: string; min: 4.5 | 3; use: string };

// Every place a token is used as text (or as a meaningful UI edge) on a background token.
const pairs: Pair[] = [
  { fg: 'ink', bg: 'bg', min: 4.5, use: 'body text on paper' },
  { fg: 'ink', bg: 'surface', min: 4.5, use: 'body text on white' },
  { fg: 'ink-2', bg: 'bg', min: 4.5, use: 'secondary text on paper' },
  { fg: 'ink-2', bg: 'surface', min: 4.5, use: 'secondary text on white' },
  { fg: 'ink-3', bg: 'bg', min: 4.5, use: 'meta text on paper' },
  { fg: 'ink-3', bg: 'surface', min: 4.5, use: 'meta text on white' },
  { fg: 'ink-3', bg: 'surface-2', min: 4.5, use: 'meta text on surface-2 (table header)' },
  { fg: 'on-ink', bg: 'ink', min: 4.5, use: 'primary button label' },
  { fg: 'accent-text', bg: 'bg', min: 4.5, use: 'links on paper' },
  { fg: 'accent-text', bg: 'surface', min: 4.5, use: 'links on white' },
  { fg: 'accent', bg: 'ink', min: 4.5, use: 'links on dark (desk header, device bar)' },
  { fg: 'accent', bg: 'surface', min: 3, use: 'focus ring / countdown ring (UI component, large)' },
  { fg: 'ok', bg: 'bg', min: 4.5, use: 'status ok on paper' },
  { fg: 'ok', bg: 'ok-bg', min: 4.5, use: 'status ok on its tint' },
  { fg: 'pending', bg: 'bg', min: 4.5, use: 'status pending on paper' },
  { fg: 'pending', bg: 'pending-bg', min: 4.5, use: 'status pending on its tint' },
  { fg: 'danger', bg: 'bg', min: 4.5, use: 'status danger on paper' },
  { fg: 'danger', bg: 'danger-bg', min: 4.5, use: 'status danger on its tint' },
  { fg: 'on-ink', bg: 'danger-bar', min: 4.5, use: 'Thief device bar label' },
  { fg: 'on-ink', bg: 'danger', min: 4.5, use: 'danger button label' },
  { fg: 'simulated-text', bg: 'simulated-bg', min: 4.5, use: 'SIMULATED badge' },
  { fg: 'simulated-border', bg: 'simulated-bg', min: 3, use: 'SIMULATED badge dashed border (UI)' },
  { fg: 'line-strong', bg: 'surface', min: 3, use: 'input border (UI component)' },
];

let failed = 0;
const rows: string[] = [];
for (const p of pairs) {
  const fg = tokens.get(p.fg);
  const bg = tokens.get(p.bg);
  if (!fg || !bg) {
    rows.push(`MISSING  ${p.fg} on ${p.bg}`);
    failed++;
    continue;
  }
  const ratio = contrast(fg, bg);
  const ok = ratio >= p.min;
  if (!ok) failed++;
  rows.push(
    `${ok ? 'ok  ' : 'FAIL'}  ${ratio.toFixed(2).padStart(6)}:1  (min ${p.min})  --${p.fg} ${fg} on --${p.bg} ${bg}  — ${p.use}`,
  );
}

console.info(rows.join('\n'));
console.info(`\n${pairs.length - failed}/${pairs.length} pairs pass.`);
if (failed > 0) process.exit(1);
