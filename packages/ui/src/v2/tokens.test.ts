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
});
