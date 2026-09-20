import { describe, expect, test } from 'bun:test';
import { tokens } from '../design/tokens.ts';

async function panelStylesheet(): Promise<string> {
  const source = await Bun.file('src/content/panel.css').text();
  return source.replace('<tokens>', tokens({ selector: '.root', media: false }));
}

describe('the panel keeps its own layout, not just the shared tokens', () => {
  test('it is taken out of the page flow, or it renders wherever the page ends', async () => {
    expect(await panelStylesheet()).toContain('position: fixed');
  });

  test('it sits above the page rather than behind it', async () => {
    expect(await panelStylesheet()).toContain('z-index: 2147483000');
  });

  test('it starts in a corner, so place() has something to move from', async () => {
    const css = await panelStylesheet();
    expect(css).toContain('right: 16px');
    expect(css).toContain('bottom: 16px');
  });

  test('the transform origin it animates from is defined', async () => {
    const css = await panelStylesheet();
    expect(css).toContain('--origin:');
    expect(css).toContain('transform-origin: var(--origin)');
  });

  test('it asks for the vendored font by the name the FontFace API registers', async () => {
    expect(await panelStylesheet()).toContain("'JobFill Rajdhani'");
  });

  test('every custom property it uses is one it defines', async () => {
    const css = await panelStylesheet();
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!));
    const defined = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1]!));

    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });
});
