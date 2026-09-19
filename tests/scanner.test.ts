import { beforeEach, describe, expect, test } from 'bun:test';
import { scan, serialize } from '../src/content/scanner.ts';
import type { ScannedField } from '../src/shared/types.ts';

async function loadForm(name: string): Promise<ScannedField[]> {
  const html = await Bun.file(new URL(`../tools/playground/forms/${name}`, import.meta.url)).text();
  document.documentElement.innerHTML = html.replace(/<!doctype html>/i, '');
  return scan(document);
}

function kinds(fields: ScannedField[]): string[] {
  return fields.map((field) => field.kind).filter(Boolean) as string[];
}

function byKind(fields: ScannedField[], kind: string): ScannedField | undefined {
  return fields.find((field) => field.kind === kind);
}

beforeEach(() => {
  document.documentElement.innerHTML = '';
});

describe('classic ATS markup (greenhouse.html)', () => {
  test('recognises the questions every application asks', async () => {
    const found = kinds(await loadForm('greenhouse.html'));
    for (const kind of [
      'firstName', 'lastName', 'email', 'phone', 'resumeFile', 'linkedin', 'website',
      'workAuthorization', 'sponsorship', 'startDate', 'compensation', 'whyCompany',
      'referral', 'gender', 'ethnicity', 'veteran', 'disability'
    ]) {
      expect(found).toContain(kind);
    }
  });

  test('carries the select options through', async () => {
    const fields = await loadForm('greenhouse.html');
    const sponsorship = byKind(fields, 'sponsorship');
    expect(sponsorship?.control).toBe('select');
    expect(sponsorship?.options.map((option) => option.text)).toContain('No, I will not require sponsorship');
  });

  test('strips the required marker out of the label', async () => {
    const fields = await loadForm('greenhouse.html');
    expect(byKind(fields, 'firstName')?.label).toBe('First Name');
  });
});

describe('placeholder-only markup (lever.html)', () => {
  test('falls back to the placeholder as the question', async () => {
    const fields = await loadForm('lever.html');
    expect(byKind(fields, 'fullName')?.label).toBe('Full name');
    expect(kinds(fields)).toContain('email');
    expect(kinds(fields)).toContain('github');
  });

  test('a radio group is one question, not three', async () => {
    const fields = await loadForm('lever.html');
    const relocation = byKind(fields, 'relocation');
    expect(relocation?.control).toBe('radio');
    expect(relocation?.label).toBe('Are you willing to relocate?');
    expect(relocation?.options).toHaveLength(3);
    expect(relocation?.options.map((option) => option.text)).toEqual(['Yes', 'No', 'Open to discussing']);
  });
});

describe('div labels and comboboxes (workday.html)', () => {
  test('reads labels wired up by aria-labelledby', async () => {
    const fields = await loadForm('workday.html');
    expect(byKind(fields, 'firstName')?.label).toBe('Legal Name - First Name');
    expect(kinds(fields)).toContain('city');
    expect(kinds(fields)).toContain('addressLine1');
  });

  test('spots a custom combobox', async () => {
    const fields = await loadForm('workday.html');
    expect(byKind(fields, 'workAuthorization')?.control).toBe('combobox');
  });
});

describe('what the scanner refuses to touch', () => {
  test('skips hidden, disabled and search inputs', async () => {
    document.documentElement.innerHTML = `
      <form>
        <label for="a">First Name</label><input id="a" name="first_name">
        <input type="hidden" name="csrf_token" value="x">
        <label for="b">Search</label><input id="b" type="search" name="search">
        <label for="c">Disabled thing</label><input id="c" name="thing" disabled>
        <input type="text" name="_gotcha" style="display:none">
      </form>`;
    const names = scan(document).map((field) => field.name);
    expect(names).toEqual(['first_name']);
  });
});

test('serialize drops the DOM handles so the field can cross a message port', async () => {
  const [field] = await loadForm('greenhouse.html');
  const wire = serialize(field!);
  expect(wire).not.toHaveProperty('el');
  expect(JSON.stringify(wire)).toContain(wire.label);
});

test('field ids survive a rescan, so what we remember about a field stays true', async () => {
  const first = await loadForm('greenhouse.html');
  const idsBefore = first.map((field) => field.uid);

  const extra = document.createElement('div');
  extra.innerHTML = '<label for="zz">Referred by</label><input id="zz" name="referred_by">';
  document.querySelector('form')?.prepend(extra);

  const second = scan(document);
  const idsAfter = second.map((field) => field.uid);

  for (const id of idsBefore) expect(idsAfter).toContain(id);
  expect(second.length).toBe(first.length + 1);
});

test('two fields that look identical still get separate ids', () => {
  document.documentElement.innerHTML = `
    <form>
      <label for="a">School</label><input id="a" name="school">
      <label for="b">School</label><input id="b" name="school">
    </form>`;
  const ids = scan(document).map((field) => field.uid);
  expect(new Set(ids).size).toBe(ids.length);
});
