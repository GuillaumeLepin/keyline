import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../tokens.css'), 'utf8');

function body(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}
const decls = (b: string) =>
  b
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort();

describe('theme tokens', () => {
  it('declares the same dark values for data-theme="dark" and data-theme="system" (dark OS)', () => {
    expect(decls(body('[data-theme="system"]'))).toEqual(decls(body('[data-theme="dark"]')));
  });

  it('leaves the v1 light values untouched (existing screens read them)', () => {
    const root = body(':root');
    for (const pair of [
      '--bg: #f7f6f3',
      '--ink: #141414',
      '--line: #e4e2dd',
      '--accent: #fa5b35',
      '--ok: #1f7a4d',
      '--danger: #b42318',
    ]) {
      expect(root).toContain(pair);
    }
  });

  it('keeps the Emergency card (.kl-paper) on the light values in every theme', () => {
    const root = body(':root');
    const paper = decls(body('.kl-paper')).filter((d) =>
      /^--(bg|surface|surface-2|line|line-strong|ink|ink-2|ink-3|on-ink):/.test(d),
    );
    expect(paper).toHaveLength(9);
    for (const d of paper) expect(root).toContain(d);
  });

  it('keeps hardware chrome dark in dark mode (bezel, device bars, desk header)', () => {
    const dark = body('[data-theme="dark"]');
    for (const t of [
      '--bezel',
      '--chrome',
      '--on-chrome',
      '--on-chrome-2',
      '--ink-hover',
      '--ink-active',
      '--danger-hover',
    ]) {
      expect(dark).toContain(`${t}:`);
    }
    expect(dark).not.toContain('--laptop-bar: #b8b4ab');
  });
});
