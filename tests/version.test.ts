import { describe, expect, test } from 'bun:test';
import { formatVersion, nextVersion, parseVersion } from '../scripts/version.ts';

describe('working out the next version', () => {
  test('the first release of a major.minor uses the number in the manifest', () => {
    expect(nextVersion('0.1.0', [])).toBe('0.1.0');
    expect(nextVersion('0.1.0', ['v0.0.9'])).toBe('0.1.0');
  });

  test('every release after that bumps the patch', () => {
    expect(nextVersion('0.1.0', ['v0.1.0'])).toBe('0.1.1');
    expect(nextVersion('0.1.0', ['v0.1.0', 'v0.1.1', 'v0.1.2'])).toBe('0.1.3');
  });

  test('the patch counts within its own major.minor, not across them', () => {
    expect(nextVersion('0.2.0', ['v0.1.0', 'v0.1.7'])).toBe('0.2.0');
    expect(nextVersion('1.0.0', ['v0.9.14'])).toBe('1.0.0');
  });

  test('raising major or minor by hand restarts the patch', () => {
    const tags = ['v0.1.0', 'v0.1.1', 'v0.1.2'];
    expect(nextVersion('0.2.0', tags)).toBe('0.2.0');
    expect(nextVersion('0.2.0', [...tags, 'v0.2.0'])).toBe('0.2.1');
  });

  test('tags it does not understand are ignored', () => {
    expect(nextVersion('0.1.0', ['nightly', 'v0.1.0', 'release-2', 'v0.1.x'])).toBe('0.1.1');
  });

  test('a version written wrong is a loud failure, not a silent 0.0.1', () => {
    expect(() => nextVersion('0.1', [])).toThrow('major.minor.patch');
  });

  test('versions round-trip', () => {
    expect(formatVersion(parseVersion('v2.10.3')!)).toBe('2.10.3');
    expect(parseVersion('not a version')).toBeNull();
  });
});
