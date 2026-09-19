import { describe, expect, test } from 'bun:test';
import { extract, parseRoleLine, normalizePhone, splitName, totalYears } from '../src/lib/resume/extract.ts';

const RESUME = await Bun.file(new URL('./fixtures/resume.txt', import.meta.url)).text();
const parsed = extract(RESUME);

describe('extract', () => {
  test('reads the contact block', () => {
    expect(parsed.profile.firstName).toBe('Ada');
    expect(parsed.profile.lastName).toBe('Okonkwo');
    expect(parsed.profile.email).toBe('ada@okonkwo.dev');
    expect(parsed.profile.phone).toBe('+1 (512) 555-0184');
    expect(parsed.profile.city).toBe('Austin');
    expect(parsed.profile.state).toBe('TX');
  });

  test('tells the three link types apart', () => {
    expect(parsed.profile.linkedin).toBe('https://linkedin.com/in/adaokonkwo');
    expect(parsed.profile.github).toBe('https://github.com/adaokonkwo');
    expect(parsed.profile.website).toBe('https://ada-okonkwo.dev');
  });

  test('takes the current role from the experience section', () => {
    expect(parsed.profile.currentTitle).toBe('Senior Software Engineer');
    expect(parsed.profile.currentEmployer).toBe('Wavelength Data');
    expect(parsed.experience).toHaveLength(2);
  });

  test('reads education, including the degree and field', () => {
    expect(parsed.profile.school).toBe('University of Texas at Austin');
    expect(parsed.profile.degree).toBe('B.S.');
    expect(parsed.profile.major).toBe('Computer Engineering');
    expect(parsed.profile.graduationDate).toBe('05/2018');
    expect(parsed.profile.gpa).toBe('3.8');
  });

  test('collects skills without swallowing whole sentences', () => {
    expect(parsed.skills).toContain('Kubernetes');
    expect(parsed.skills).toContain('PostgreSQL');
    expect(parsed.skills.every((skill) => skill.length <= 32)).toBe(true);
  });

  test('says nothing rather than something wrong', () => {
    const thin = extract('Just some notes about nothing in particular.');
    expect(thin.profile.email).toBeUndefined();
    expect(thin.warnings.length).toBeGreaterThan(0);
  });
});

describe('role lines', () => {
  test('reads the common layouts', () => {
    expect(parseRoleLine('Senior Engineer | Acme | Jan 2020 – Present')).toMatchObject({
      title: 'Senior Engineer', company: 'Acme', current: true
    });

    expect(parseRoleLine('Acme Corp \u2014 Staff Engineer \u2014 2019 to 2023')).toMatchObject({
      title: 'Staff Engineer', company: 'Acme Corp'
    });
  });

  test('ignores bullets and prose', () => {
    expect(parseRoleLine('• Built the thing that did the stuff')).toBeNull();
    expect(parseRoleLine('I am a backend engineer.')).toBeNull();
  });
});

test('phone numbers come out in one shape', () => {
  expect(normalizePhone('512.555.0184')).toBe('(512) 555-0184');
  expect(normalizePhone('+1 (512) 555-0184')).toBe('+1 (512) 555-0184');
});

test('names split into parts', () => {
  expect(splitName('Ada Okonkwo')).toMatchObject({ firstName: 'Ada', lastName: 'Okonkwo' });
  expect(splitName('Ada Grace Okonkwo')).toMatchObject({ middleName: 'Grace', lastName: 'Okonkwo' });
  expect(splitName('Ada Okonkwo Jr.')).toMatchObject({ firstName: 'Ada', lastName: 'Okonkwo' });
});

test('overlapping roles are not counted twice', () => {
  const years = totalYears([
    { title: 'A', company: 'X', location: '', start: { year: 2020, month: 1 }, end: { year: 2024, month: 1 }, current: false, raw: '' },
    { title: 'B', company: 'Y', location: '', start: { year: 2021, month: 1 }, end: { year: 2023, month: 1 }, current: false, raw: '' }
  ]);
  expect(years).toBe(4);
});
