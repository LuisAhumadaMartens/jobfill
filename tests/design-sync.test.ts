import { describe, expect, test } from 'bun:test';
import { drift, sameColour, themeBlock, toOklch } from '../scripts/design-sync.ts';

describe('reading the theme out of ahumada.dev', () => {
  const css = `@import "tailwindcss";

@theme {
    --font-sans: "Rajdhani", sans-serif;
    --color-void: #0b0c10;
    --color-neon: #0574f5;
    --color-text: #c0c0c0;
}

:root { --neon-rgb: 5, 116, 245; }`;

  test('the theme block is read and the rest of the file is not', () => {
    const theme = themeBlock(css);
    expect(theme['--color-neon']).toBe('#0574f5');
    expect(theme['--font-sans']).toBe('"Rajdhani", sans-serif');
    expect(theme['--neon-rgb']).toBeUndefined();
  });

  test('a file with no theme block is an error rather than an empty result', () => {
    expect(() => themeBlock('body { color: red; }')).toThrow();
  });
});

describe('converting to oklch', () => {
  test('the accent converts to the value the tokens already use', () => {
    expect(toOklch('#0574f5')).toBe('oklch(0.583 0.212 258)');
  });

  test('black and white land where they should', () => {
    expect(toOklch('#000000')).toStartWith('oklch(0.000');
    expect(toOklch('#ffffff')).toStartWith('oklch(1.000');
  });

  test('shorthand hex is understood', () => {
    expect(toOklch('#fff')).toBe(toOklch('#ffffff'));
  });
});

describe('telling real drift from formatting', () => {
  test('the same colour written differently is not drift', () => {
    expect(sameColour('oklch(0.808 0 90)', 'oklch(0.808 0.000 90)')).toBe(true);
    expect(sameColour('oklch(0.6 0 90)', 'oklch(0.600 0.000 90)')).toBe(true);
  });

  test('a different colour is drift', () => {
    expect(sameColour('oklch(0.583 0.212 258)', 'oklch(0.700 0.150 30)')).toBe(false);
  });

  test('a missing token is drift, not a match', () => {
    expect(sameColour('(missing)', 'oklch(0.583 0.212 258)')).toBe(false);
  });
});

describe('comparing a theme against the tokens', () => {
  const theme = { '--color-neon': '#0574f5', '--color-void': '#0b0c10' };

  test('matching tokens report nothing to do', () => {
    const tokens = '--program: oklch(0.583 0.212 258);\n--ground: oklch(0.155 0.009 274);';
    expect(drift(theme, tokens)).toEqual([]);
  });

  test('a changed colour on the site is reported with both sides', () => {
    const tokens = '--program: oklch(0.700 0.150 30);\n--ground: oklch(0.155 0.009 274);';
    const changed = drift(theme, tokens);

    expect(changed).toHaveLength(1);
    expect(changed[0]!.token).toBe('--program');
    expect(changed[0]!.want).toBe('oklch(0.583 0.212 258)');
  });

  test('a theme value that is not a hex colour is skipped rather than mangled', () => {
    expect(drift({ '--color-neon': 'var(--something)' }, '--program: oklch(0.583 0.212 258);')).toEqual([]);
  });
});
