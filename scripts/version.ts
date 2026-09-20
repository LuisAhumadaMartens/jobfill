import { join, dirname } from 'node:path';

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(value: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function formatVersion(version: Version): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function nextVersion(declared: string, tags: string[]): string {
  const base = parseVersion(declared);
  if (!base) throw new Error(`manifest version is not major.minor.patch: ${declared}`);

  const released = tags
    .map(parseVersion)
    .filter((tag): tag is Version => !!tag)
    .filter((tag) => tag.major === base.major && tag.minor === base.minor);

  if (!released.length) return formatVersion({ ...base, patch: base.patch });

  const highest = released.reduce((best, tag) => (tag.patch > best.patch ? tag : best));
  return formatVersion({ ...base, patch: highest.patch + 1 });
}

export function withVersion(source: string, version: string): string {
  const replaced = source.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (replaced === source && !source.includes(`"version": "${version}"`)) {
    throw new Error('manifest has no version field to write');
  }
  return replaced;
}

if (import.meta.main) {
  const root = dirname(import.meta.dir);
  const path = join(root, 'src/manifest.json');
  const source = await Bun.file(path).text();
  const tags = (await Bun.$`git tag --list`.text()).split('\n').filter(Boolean);
  const version = nextVersion(JSON.parse(source).version, tags);

  if (process.argv.includes('--write')) await Bun.write(path, withVersion(source, version));

  console.log(version);
}
