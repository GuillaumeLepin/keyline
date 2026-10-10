/**
 * WCAG 2.x contrast check for every text/background pair in tokens.css — light (:root) AND dark
 * ([data-theme="dark"], which overrides :root). Run: pnpm --filter @keyline/ui contrast
 * Exit code 1 if any pair falls below its threshold (4.5:1 normal text, 3:1 large text / UI).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio } from '../src/v2/color';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/tokens.css'), 'utf8');

function readHexTokens(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    map.set(m[1] as string, (m[2] as string).toLowerCase());
  }
  return map;
}

/** Every `selector { … }` block, concatenated (these blocks never nest). */
function blocks(selector: string): string {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(`${selector} {`, from);
    if (start < 0) break;
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    out.push(css.slice(open + 1, close));
    from = close;
  }
  if (out.length === 0) throw new Error(`block ${selector} not found in tokens.css`);
  return out.join('\n');
}

const light = readHexTokens(blocks(':root'));
const dark = new Map([...light, ...readHexTokens(blocks('[data-theme="dark"]'))]);

export function contrast(fg: string, bg: string): number {
  return contrastRatio(fg, bg);
}

type Pair = { fg: string; bg: string; min: 4.5 | 3; use: string; themes?: ('light' | 'dark')[] };

// Every place a token is used as text (or as a meaningful UI edge) on a background token.
const pairs: Pair[] = [
  { fg: 'ink', bg: 'bg', min: 4.5, use: 'body text on paper' },
  { fg: 'ink', bg: 'surface', min: 4.5, use: 'body text on surface' },
  { fg: 'ink', bg: 'surface-2', min: 4.5, use: 'body text on surface-2 (pressed rows)' },
  { fg: 'ink-2', bg: 'bg', min: 4.5, use: 'secondary text on paper' },
  { fg: 'ink-2', bg: 'surface', min: 4.5, use: 'secondary text on surface' },
  { fg: 'ink-3', bg: 'bg', min: 4.5, use: 'meta text on paper' },
  { fg: 'ink-3', bg: 'surface', min: 4.5, use: 'meta text on surface' },
  { fg: 'ink-3', bg: 'surface-2', min: 4.5, use: 'meta text on surface-2 (table header)' },
  { fg: 'on-ink', bg: 'ink', min: 4.5, use: 'primary button label' },
  // v2: links are --ink + underline (covered by the ink pairs above). --accent-text is legacy only.
  { fg: 'accent-text', bg: 'bg', min: 4.5, use: 'legacy accent words on paper' },
  { fg: 'accent-text', bg: 'surface', min: 4.5, use: 'legacy accent words on surface' },
  { fg: 'on-ink', bg: 'ink', min: 4.5, use: 'links on the desk header (on-ink, underlined)' },
  { fg: 'accent', bg: 'surface', min: 3, use: 'focus ring (drawn on a 2 px surface halo) (UI)' },
  { fg: 'ring-arc', bg: 'bg', min: 3, use: 'protection ring arcs on paper (UI)' },
  { fg: 'ring-arc', bg: 'surface', min: 3, use: 'protection ring arcs on surface (UI)' },
  { fg: 'ok', bg: 'bg', min: 4.5, use: 'status ok on paper' },
  { fg: 'ok', bg: 'ok-bg', min: 4.5, use: 'status ok on its tint' },
  { fg: 'pending', bg: 'bg', min: 4.5, use: 'status pending on paper' },
  { fg: 'pending', bg: 'pending-bg', min: 4.5, use: 'status pending on its tint' },
  { fg: 'danger', bg: 'bg', min: 4.5, use: 'status danger on paper' },
  { fg: 'danger', bg: 'danger-bg', min: 4.5, use: 'status danger on its tint' },
  { fg: 'danger', bg: 'surface', min: 4.5, use: 'status danger on surface (sheets, Swissquote web)' },
  { fg: 'on-ink', bg: 'danger', min: 4.5, use: 'danger button label' },
  { fg: 'simulated-text', bg: 'simulated-bg', min: 4.5, use: 'SIMULATED chip' },
  { fg: 'simulated-text', bg: 'bg', min: 4.5, use: 'SIMULATED chip (v2: no fill) on paper' },
  { fg: 'simulated-text', bg: 'surface', min: 4.5, use: 'SIMULATED chip (v2: no fill) on surface' },
  { fg: 'simulated-border', bg: 'simulated-bg', min: 3, use: 'SIMULATED dashed border (UI)' },
  { fg: 'line-strong', bg: 'surface', min: 3, use: 'input border (UI component)' },
  { fg: 'line-strong', bg: 'bg', min: 3, use: 'input border on paper (UI component)' },

  // ---- Phase C: every pair the v1 primitives use, so they are dark-ready ----
  // Text on the pressed / hover / skeleton surface.
  {
    fg: 'ink-2',
    bg: 'surface-2',
    min: 4.5,
    use: 'Address / StatementRow icon + secondary on hover (surface-2)',
  },
  { fg: 'ok', bg: 'surface', min: 4.5, use: 'Panel value ok / KeyCard status on surface' },
  { fg: 'pending', bg: 'surface', min: 4.5, use: 'Panel / KeyCard pending status on surface' },
  // Tinted panels: PolicyLine cooling/block, ErrorState, Note danger.
  { fg: 'ink', bg: 'danger-bg', min: 4.5, use: 'ErrorState body, PolicyLine block reason, Note danger' },
  { fg: 'ink-2', bg: 'danger-bg', min: 4.5, use: 'PolicyLine block secondary on its tint' },
  { fg: 'ink-3', bg: 'danger-bg', min: 4.5, use: 'PolicyLine block detail on its tint' },
  { fg: 'ink', bg: 'pending-bg', min: 4.5, use: 'PolicyLine cooling text on its tint' },
  { fg: 'ink-2', bg: 'pending-bg', min: 4.5, use: 'PolicyLine cooling reason on its tint' },
  { fg: 'ink-3', bg: 'pending-bg', min: 4.5, use: 'PolicyLine cooling detail on its tint' },
  { fg: 'danger', bg: 'surface-2', min: 4.5, use: 'danger-text button pressed (surface-2)' },
  // Status edges (Panel danger, PolicyLine, Note, ErrorState borders): UI 3:1.
  { fg: 'ok', bg: 'surface', min: 3, use: 'ok border (PolicyLine, Note) (UI)' },
  { fg: 'pending', bg: 'surface', min: 3, use: 'pending border (PolicyLine, Note) (UI)' },
  { fg: 'danger', bg: 'surface', min: 3, use: 'danger border (Panel, ErrorState, field error) (UI)' },
  // Marks: StatusSequence / Stepper dots and the seq rail.
  { fg: 'ink', bg: 'bg', min: 3, use: 'StatusSequence done dot / Stepper done segment (UI)' },
  { fg: 'ring-arc', bg: 'bg', min: 3, use: 'StatusSequence active dot / Stepper current segment (UI)' },
  { fg: 'danger', bg: 'bg', min: 3, use: 'StatusSequence failed dot (UI)' },
  { fg: 'line-strong', bg: 'surface', min: 3, use: 'StatusSequence todo dot ring (UI)' },
  { fg: 'accent', bg: 'bg', min: 3, use: 'focus ring on its bg halo (dark --focus-ring)', themes: ['dark'] },
  // Filled buttons in every state (Button, ActionButton).
  { fg: 'on-ink', bg: 'ink-hover', min: 4.5, use: 'primary button label on hover' },
  { fg: 'on-ink', bg: 'ink-active', min: 4.5, use: 'primary button label pressed' },
  { fg: 'on-ink', bg: 'danger-hover', min: 4.5, use: 'danger button / ActionButton error label on hover' },
  { fg: 'danger', bg: 'danger-bg', min: 4.5, use: 'danger-text button hover (danger on its tint)' },
  // Chrome (dark in both themes): DeviceBar personas, desk header, phone bezel.
  { fg: 'on-chrome', bg: 'chrome', min: 4.5, use: 'DeviceBar Lea · phone / desk; desk header text' },
  { fg: 'on-chrome-2', bg: 'chrome', min: 4.5, use: 'desk nav + operator on chrome' },
  { fg: 'on-chrome-2', bg: 'chrome', min: 3, use: 'desk SIMULATED chip border on chrome (UI)' },
  { fg: 'accent', bg: 'chrome', min: 3, use: 'desk bar accent rule / active nav underline on chrome (UI)' },
  { fg: 'on-chrome', bg: 'laptop-bar', min: 4.5, use: 'DeviceBar Lea · laptop (chrome text)' },
  { fg: 'on-chrome', bg: 'newphone-bar', min: 4.5, use: 'DeviceBar Lea · new phone (chrome text)' },
  { fg: 'on-chrome', bg: 'danger-bar', min: 4.5, use: 'DeviceBar Thief (chrome text)' },
  // Simulated legend swatch + chip on surface-2 (desk table header).
  { fg: 'simulated-text', bg: 'surface-2', min: 4.5, use: 'SIMULATED chip on surface-2 (table header)' },
  { fg: 'simulated-text', bg: 'danger-bg', min: 4.5, use: 'SIMULATED chip inside a blocked PolicyLine' },
  { fg: 'simulated-text', bg: 'pending-bg', min: 4.5, use: 'SIMULATED chip inside a cooling PolicyLine' },
];

let failed = 0;
let total = 0;
const rows: string[] = [];
for (const [theme, tokens] of [
  ['light', light],
  ['dark', dark],
] as const) {
  rows.push(`\n${theme.toUpperCase()}`);
  for (const p of pairs) {
    if (p.themes && !p.themes.includes(theme)) continue;
    total++;
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
}

// Hue separation: danger must never read as the accent (DECISIONS #26). Both themes, ≥ 20°.
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const MIN_HUE_GAP = 20;
for (const [theme, tokens] of [
  ['light', light],
  ['dark', dark],
] as const) {
  total++;
  const a = hue(tokens.get('accent') ?? '#000000');
  const d = hue(tokens.get('danger') ?? '#000000');
  const gap = Math.min(Math.abs(a - d), 360 - Math.abs(a - d));
  // Light keeps the v1 danger (dark, 6:1 on paper): separated by lightness, so only dark is enforced.
  const ok = theme === 'light' || gap >= MIN_HUE_GAP;
  if (!ok) failed++;
  rows.push(
    `${ok ? 'ok  ' : 'FAIL'}  ${theme}: hue(--danger) ${d.toFixed(0)}° vs hue(--accent) ${a.toFixed(0)}° — ${gap.toFixed(0)}° apart (min ${MIN_HUE_GAP}° in dark)`,
  );
}

console.info(rows.join('\n'));
console.info(`\n${total - failed}/${total} pairs pass (light + dark).`);
if (failed > 0) process.exit(1);
