import { rm, mkdir, cp, readdir, stat } from 'node:fs/promises';
import { writeIcons } from './icons.ts';
import { existsSync, watch } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const ROOT = dirname(import.meta.dir);
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const ENTRYPOINTS = [
  'src/content/content-script.ts',
  'src/background/service-worker.ts',
  'src/pages/options/options.ts',
  'src/pages/popup/popup.ts'
];

const STATIC_FILES: Array<[from: string, to: string]> = [
  ['src/pages/theme.css', 'pages/theme.css'],
  ['assets/fonts', 'assets/fonts'],
  ['src/pages/options/options.html', 'pages/options/options.html'],
  ['src/pages/options/options.css', 'pages/options/options.css'],
  ['src/pages/popup/popup.html', 'pages/popup/popup.html'],
  ['src/pages/popup/popup.css', 'pages/popup/popup.css'],
  ['src/content/panel.css', 'content/panel.css'],

  ['vendor/pdfjs/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs'],
  ['vendor/pdfjs/LICENSE', 'vendor/pdfjs/LICENSE']
];

function versionOverride(): string | null {
  const flag = process.argv.indexOf('--version');
  if (flag < 0) return null;
  const value = process.argv[flag + 1];
  if (!value || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`--version needs a major.minor.patch value, got: ${value ?? '(nothing)'}`);
  }
  return value;
}

async function writeManifest(): Promise<void> {
  const { ATS_MATCHES } = await import(join(SRC, 'lib/sites.ts'));
  const { CONTENT_SCRIPT, PANEL_STYLESHEET } = await import(join(SRC, 'shared/paths.ts'));
  const source = await Bun.file(join(SRC, 'manifest.json')).text();
  const manifest = JSON.parse(source);
  const override = versionOverride();
  if (override) manifest.version = override;

  const expand = (list: string[]): string[] =>
    list.flatMap((entry: string) => {
      if (entry === '<ats>') return ATS_MATCHES;
      if (entry === '<content-script>') return [CONTENT_SCRIPT];
      if (entry === '<panel-css>') return [PANEL_STYLESHEET];
      return [entry];
    });

  manifest.host_permissions = expand(manifest.host_permissions ?? []);
  for (const script of manifest.content_scripts ?? []) {
    script.matches = expand(script.matches ?? []);
    script.js = expand(script.js ?? []);
  }
  for (const entry of manifest.web_accessible_resources ?? []) entry.resources = expand(entry.resources ?? []);

  const unexpanded = JSON.stringify(manifest).match(/<[a-z-]+>/);
  if (unexpanded) throw new Error(`manifest placeholder was not expanded: ${unexpanded[0]}`);

  await Bun.write(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

async function copyStatic(): Promise<void> {
  for (const [from, to] of STATIC_FILES) {
    const source = join(ROOT, from);
    if (!existsSync(source)) {
      throw new Error(`missing static file: ${from}`);
    }
    const target = join(DIST, to);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(full) : (await stat(full)).size;
  }
  return total;
}

async function build(): Promise<boolean> {
  const started = performance.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const result = await Bun.build({
    entrypoints: ENTRYPOINTS.map((entry) => join(ROOT, entry)),
    outdir: DIST,
    root: SRC,
    target: 'browser',
    format: 'esm',

    splitting: false,
    minify: false,
    sourcemap: 'linked',
    naming: { entry: '[dir]/[name].js', chunk: '[name]-[hash].js', asset: '[dir]/[name].[ext]' },
    define: { 'process.env.NODE_ENV': '"production"' }
  });

  if (!result.success) {
    console.error('✗ build failed');
    for (const log of result.logs) console.error('  ', log.message);
    return false;
  }

  await copyStatic();
  await writeIcons(join(DIST, 'icons'));
  await writeManifest();
  await assertContentScriptIsClassic();

  const bytes = await dirSize(DIST);
  const ms = Math.round(performance.now() - started);
  console.log(`✓ built dist/ (${result.outputs.length} bundles, ${(bytes / 1024 / 1024).toFixed(2)} MB, ${ms}ms)`);
  return true;
}

async function assertContentScriptIsClassic(): Promise<void> {
  const { CONTENT_SCRIPT } = await import(join(SRC, 'shared/paths.ts'));
  const code = await Bun.file(join(DIST, CONTENT_SCRIPT)).text();
  const offending = /^\s*(import\s|export\s|export\{)/m.exec(code);
  if (offending) {
    throw new Error(`${CONTENT_SCRIPT} still contains a module statement: ${offending[0].trim()}`);
  }
}

async function zip(): Promise<void> {
  const manifest = await Bun.file(join(DIST, 'manifest.json')).json();
  const name = `jobfill-${manifest.version}.zip`;
  await rm(join(ROOT, name), { force: true });
  const proc = Bun.spawn(['zip', '-qr', join(ROOT, name), '.'], { cwd: DIST, stdout: 'inherit', stderr: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) throw new Error('zip failed');
  const size = (await stat(join(ROOT, name))).size;
  console.log(`✓ ${name} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}

const args = new Set(process.argv.slice(2));
const ok = await build();
if (!ok && !args.has('--watch')) process.exit(1);
if (args.has('--zip')) await zip();

if (args.has('--watch')) {
  console.log('… watching src/ (Ctrl+C to stop)');
  let queued: ReturnType<typeof setTimeout> | null = null;
  watch(SRC, { recursive: true }, (_event, filename) => {
    if (!filename || filename.endsWith('~')) return;
    if (queued) clearTimeout(queued);
    queued = setTimeout(() => {
      console.log(`↻ ${relative(SRC, join(SRC, filename))}`);
      build().catch((error) => console.error(error));
    }, 120);
  });
  await new Promise(() => {});
}
