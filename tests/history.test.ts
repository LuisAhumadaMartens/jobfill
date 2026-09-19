import { describe, expect, test } from 'bun:test';
import { historyIndexOf, toEducationEntries, toWorkEntries, valueFromEducation, valueFromHistory } from '../src/lib/answers/history.ts';
import { extract } from '../src/lib/resume/extract.ts';

const history = toWorkEntries([
  { title: 'Senior Software Engineer', company: 'Wavelength Data', location: '', current: true, start: { year: 2021, month: 2 }, end: null },
  { title: 'Software Engineer', company: 'Brightline Systems', location: '', current: false, start: { year: 2018, month: 7 }, end: { year: 2021, month: 1 } }
]);

describe('which job a repeated field is asking about', () => {
  test('reads the index out of the field name', () => {
    expect(historyIndexOf({ name: 'experience[0][title]' })).toBe(0);
    expect(historyIndexOf({ name: 'experience[1][title]' })).toBe(1);
    expect(historyIndexOf({ name: 'work_experience_2_company' })).toBe(2);
    expect(historyIndexOf({ id: 'employment-1-employer' })).toBe(1);
  });

  test('falls back to a numbered label', () => {
    expect(historyIndexOf({ label: 'Employer 2' })).toBe(1);
    expect(historyIndexOf({ label: 'Position 3' })).toBe(2);
  });

  test('an unnumbered field is the most recent job', () => {
    expect(historyIndexOf({ name: 'company', label: 'Employer' })).toBe(0);
  });
});

describe('serving a form that asks for several jobs', () => {
  test('each index gets its own role', () => {
    expect(valueFromHistory({ kind: 'employerName', name: 'experience[0][company]' }, history)).toBe('Wavelength Data');
    expect(valueFromHistory({ kind: 'employerName', name: 'experience[1][company]' }, history)).toBe('Brightline Systems');
    expect(valueFromHistory({ kind: 'jobTitle', name: 'experience[1][title]' }, history)).toBe('Software Engineer');
  });

  test('an index past the end of the history fills nothing', () => {
    expect(valueFromHistory({ kind: 'employerName', name: 'experience[5][company]' }, history)).toBeNull();
  });

  test('unrelated fields are left alone', () => {
    expect(valueFromHistory({ kind: 'email', name: 'email' }, history)).toBeNull();
    expect(valueFromHistory({ kind: null, name: 'whatever' }, history)).toBeNull();
  });
});

test('the resume reader fills the history, not just the current job', async () => {
  const text = await Bun.file(new URL('./fixtures/resume.txt', import.meta.url)).text();
  const entries = toWorkEntries(extract(text).experience);

  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({ company: 'Wavelength Data', current: true, start: '02/2021', end: '' });
  expect(entries[1]).toMatchObject({ company: 'Brightline Systems', current: false, end: '01/2021' });
});

describe('education, the same way', () => {
  const education = toEducationEntries([
    { school: 'University of Texas at Austin', degree: 'B.S.', major: 'Computer Engineering', gpa: '3.8', graduation: { year: 2018, month: 5 } },
    { school: 'Austin Community College', degree: 'A.S.', major: 'Mathematics', gpa: '', graduation: { year: 2015 } }
  ]);

  test('each indexed block gets its own school', () => {
    expect(valueFromEducation({ kind: 'school', name: 'education[0][school]' }, education)).toBe('University of Texas at Austin');
    expect(valueFromEducation({ kind: 'school', name: 'education[1][school]' }, education)).toBe('Austin Community College');
    expect(valueFromEducation({ kind: 'major', name: 'education[1][discipline]' }, education)).toBe('Mathematics');
    expect(valueFromEducation({ kind: 'graduationDate', name: 'education[0][end]' }, education)).toBe('05/2018');
  });

  test('a school that is not there fills nothing', () => {
    expect(valueFromEducation({ kind: 'school', name: 'education[4][school]' }, education)).toBeNull();
    expect(valueFromEducation({ kind: 'gpa', name: 'education[1][gpa]' }, education)).toBeNull();
  });
});

describe('what each job involved', () => {
  test('skills named in a role are kept against that role', async () => {
    const text = await Bun.file(new URL('./fixtures/resume.txt', import.meta.url)).text();
    const parsed = extract(text);
    const entries = toWorkEntries(parsed.experience);

    expect(entries[0]!.skills).toContain('Kafka');
    expect(entries[0]!.summary).toContain('Streaming analytics');

    expect(entries[1]!.skills).toEqual([]);
  });

  test('employment dates come from the history too', () => {
    const history = toWorkEntries([
      { title: 'Senior Engineer', company: 'Acme', location: '', current: true, start: { year: 2021, month: 2 }, end: null },
      { title: 'Engineer', company: 'Beta', location: '', current: false, start: { year: 2018, month: 7 }, end: { year: 2021, month: 1 } }
    ]);

    expect(valueFromHistory({ kind: 'employmentStart', name: 'experience[1][from]' }, history)).toBe('07/2018');
    expect(valueFromHistory({ kind: 'employmentEnd', name: 'experience[1][to]' }, history)).toBe('01/2021');
    expect(valueFromHistory({ kind: 'employmentEnd', name: 'experience[0][to]' }, history)).toBe('Present');
  });
});
