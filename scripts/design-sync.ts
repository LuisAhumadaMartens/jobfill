import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = dirname(import.meta.dir);
const SITE = Bun.env.AHUMADA_DEV ?? join(dirname(ROOT), 'ahumada.dev');
const THEME = join(SITE, 'src/styles/global.css');
const TOKENS = join(ROOT, 'design/tokens.ts');

export function themeBlock(css: string): Record<string, string> {
  const match = /@theme\s*\{([\s\S]*?)\}/.exec(css);
  if (!match) throw new Error('no @theme block in global.css');

  const values: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const pair = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (pair) values[pair[1]!] = pair[2]!.trim();
  }
  return values;
}

export function toOklch(hex: string): string {
  const value = hex.trim().replace('#', '');
  const n = parseInt(value.length === 3 ? value.replace(/./g, (c) => c + c) : value, 16);

  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => v / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

  const [r, g, b] = channels as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.hypot(A, B);
  const hue = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;

  return `oklch(${L.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(0)})`;
}

const MAPPING: Array<[theme: string, token: string]> = [
  ['--color-neon', '--program'],
  ['--color-void', '--ground'],
  ['--color-armor', '--raise'],
  ['--color-text', '--fg'],
  ['--color-text-muted', '--fg-muted'],
  ['--color-alert', '--danger'],
  ['--color-gold', '--warn']
];

export function sameColour(a: string, b: string): boolean {
  const numbers = (value: string): number[] =>
    [...value.matchAll(/-?\d*\.?\d+/g)].map((match) => Number(match[0]));

  const left = numbers(a);
  const right = numbers(b);
  if (left.length !== right.length || !left.length) return false;

  return left.every((value, index) => Math.abs(value - right[index]!) < 0.0015);
}

export function drift(theme: Record<string, string>, tokens: string): Array<{ token: string; want: string; have: string }> {
  const out: Array<{ token: string; want: string; have: string }> = [];

  for (const [themeKey, tokenKey] of MAPPING) {
    const hex = theme[themeKey];
    if (!hex?.startsWith('#')) continue;

    const want = toOklch(hex);
    const found = new RegExp(`${tokenKey}:\\s*(oklch\\([^)]*\\))`).exec(tokens);
    const have = found?.[1] ?? '(missing)';

    if (!sameColour(have, want)) out.push({ token: tokenKey, want, have });
  }
  return out;
}

if (import.meta.main) {
  if (!existsSync(THEME)) {
    console.log(`No ahumada.dev checkout at ${SITE}.`);
    console.log('Set AHUMADA_DEV to where it lives, or skip this; the tokens in design/ stand alone.');
    process.exit(0);
  }

  const theme = themeBlock(await Bun.file(THEME).text());
  const tokens = await Bun.file(TOKENS).text();
  const changed = drift(theme, tokens);

  if (!changed.length) {
    console.log('design/tokens.ts already matches ahumada.dev.');
    process.exit(0);
  }

  let next = tokens;
  for (const { token, want } of changed) {
    console.log(`  ${token}  ${changed.find((c) => c.token === token)!.have}  ->  ${want}`);
    next = next.replace(new RegExp(`(${token}:\\s*)oklch\\([^)]*\\)`), `$1${want}`);
  }

  if (process.argv.includes('--write')) {
    await Bun.write(TOKENS, next);
    console.log(`\nWrote ${changed.length} change${changed.length === 1 ? '' : 's'}. Run bun run build.`);
  } else {
    console.log('\nRun with --write to apply.');
  }
}
