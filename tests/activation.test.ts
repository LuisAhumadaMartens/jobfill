import { describe, expect, test } from 'bun:test';
import { ATS_HOSTS, ATS_MATCHES, isKnownATS, originPatternFor } from '../src/lib/sites.ts';

const manifest = await Bun.file(new URL('../src/manifest.json', import.meta.url)).json();

describe('the extension is off by default', () => {
  test('it never asks for every site up front', () => {
    const declared = JSON.stringify([manifest.host_permissions, manifest.content_scripts]);
    expect(declared).not.toContain('<all_urls>');
    expect(declared).not.toContain('*://*/*');
    expect(declared).not.toContain('http://*/*');
  });

  test('the only declared content script is the job-board one', () => {
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0].matches).toEqual(['<ats>']);
    expect(manifest.host_permissions).toEqual(['<ats>']);
  });

  test('everything else is opt-in, and needs scripting to be turned on by hand', () => {
    expect(manifest.optional_host_permissions).toEqual(['*://*/*']);
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.permissions).toContain('scripting');
  });
});

describe('known job boards', () => {
  test('matches the site and its subdomains', () => {
    expect(isKnownATS('greenhouse.io')).toBe(true);
    expect(isKnownATS('boards.greenhouse.io')).toBe(true);
    expect(isKnownATS('acme.myworkdayjobs.com')).toBe(true);
  });

  test('is not fooled by a lookalike host', () => {
    expect(isKnownATS('greenhouse.io.evil.com')).toBe(false);
    expect(isKnownATS('notgreenhouse.io')).toBe(false);
    expect(isKnownATS('example.com')).toBe(false);
  });

  test('every host produces two valid match patterns', () => {
    expect(ATS_MATCHES).toHaveLength(ATS_HOSTS.length * 2);
    for (const pattern of ATS_MATCHES) expect(pattern).toMatch(/^\*:\/\/(\*\.)?[a-z0-9.-]+\/\*$/);
  });

  test('a site the user opts into is requested for that host only', () => {
    expect(originPatternFor('careers.acme.com')).toBe('*://careers.acme.com/*');
  });
});

describe('one source of truth for bundle paths', () => {
  test('the manifest names the content script by placeholder, not by hand', () => {
    expect(manifest.content_scripts[0].js).toEqual(['<content-script>']);
    expect(manifest.web_accessible_resources[0].resources).toContain('<panel-css>');
  });

  test('every path the service worker injects comes from shared/paths', async () => {
    const source = await Bun.file(new URL('../src/background/service-worker.ts', import.meta.url)).text();
    expect(source).not.toMatch(/'content\/[a-z-]+\.js'/);
    expect(source).toContain('CONTENT_SCRIPT');
  });

  test('the path everything points at is the one the build emits', async () => {
    const { CONTENT_SCRIPT } = await import('../src/shared/paths.ts');

    const entry = `src/${CONTENT_SCRIPT.replace(/\.js$/, '.ts')}`;

    expect(await Bun.file(new URL(`../${entry}`, import.meta.url)).exists()).toBe(true);

    const build = await Bun.file(new URL('../scripts/build.ts', import.meta.url)).text();
    expect(build).toContain(`'${entry}'`);
  });
});
