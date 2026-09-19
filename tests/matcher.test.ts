import { describe, expect, test } from 'bun:test';
import { classify, matchOption, best, rank } from '../src/lib/matching/matcher.ts';
import { makeAnswer, seedAnswers } from '../src/lib/answers/storage.ts';

describe('classify', () => {
  const cases: Array<[label: string, expected: string]> = [
    ['First Name *', 'firstName'],
    ['Last Name', 'lastName'],
    ['Email Address', 'email'],
    ['Phone', 'phone'],
    ['LinkedIn Profile', 'linkedin'],
    ['GitHub URL', 'github'],
    ['Resume/CV', 'resumeFile'],
    ['Are you legally authorized to work in the United States?', 'workAuthorization'],
    ['Will you now or in the future require sponsorship for employment visa status?', 'sponsorship'],
    ['Are you willing to relocate?', 'relocation'],
    ['What are your compensation expectations?', 'compensation'],
    ['How did you hear about this job?', 'referral'],
    ['Veteran Status', 'veteran'],
    ['Disability Status', 'disability'],
    ['Race / Ethnicity', 'ethnicity']
  ];

  for (const [label, expected] of cases) {
    test(`"${label}" -> ${expected}`, () => {
      expect(classify({ label })).toBe(expected);
    });
  }

  test('falls back to the input name when there is no label', () => {
    expect(classify({ label: '', name: 'job_application[first_name]' })).toBe('firstName');
    expect(classify({ label: '', name: 'urls[LinkedIn]' })).toBe('linkedin');
  });

  test('uses autocomplete when the markup offers it', () => {
    expect(classify({ label: 'Nome', autocomplete: 'given-name' })).toBe('firstName');
  });

  test('does not mistake neighbouring questions for each other', () => {
    expect(classify({ label: 'Name of your current employer' })).not.toBe('fullName');
    expect(classify({ label: 'Reference email' })).not.toBe('email');
  });
});

describe('matchOption', () => {
  const options = (...texts: string[]) => texts.map((text) => ({ value: text, text }));

  test('maps yes onto however the site words yes', () => {
    expect(matchOption('Yes', options('Please select', 'Yes', 'No'))?.text).toBe('Yes');
    expect(matchOption('No', options('Yes, I will require sponsorship', 'No, I will not require sponsorship'))?.text)
      .toBe('No, I will not require sponsorship');
  });

  test('never picks the placeholder row', () => {
    expect(matchOption('Yes', options('Select...', 'Yes'))?.text).toBe('Yes');
  });

  test('finds the decline option under any wording', () => {
    expect(matchOption('I decline to self-identify', options('Male', 'Female', "I don't wish to answer"))?.text)
      .toBe("I don't wish to answer");
    expect(matchOption('I decline to self-identify', options('Yes', 'No', 'Decline To Self Identify'))?.text)
      .toBe('Decline To Self Identify');
  });

  test('uses wordings taught for this answer', () => {
    const answer = makeAnswer({
      question: 'Work authorization',
      value: 'Yes',
      valueAliases: { Yes: ['Authorized without sponsorship'] }
    });
    expect(matchOption('Yes', options('Authorized without sponsorship', 'Not authorized'), answer)?.text)
      .toBe('Authorized without sponsorship');
  });

  test('returns null rather than guessing wildly', () => {
    expect(matchOption('Yes', options('Blue', 'Green', 'Purple'))).toBeNull();
  });
});

describe('best', () => {
  const answers = seedAnswers();

  test('a known kind matches on the first encounter', () => {
    const result = best({ label: 'Do you now or will you in the future require visa sponsorship?', kind: 'sponsorship' }, answers);
    expect(result.status).toBe('fill');
    expect(result.match?.answer.kind).toBe('sponsorship');
    expect(result.match?.reason).toBe('kind');
  });

  test('a taught wording beats a fuzzy neighbour', () => {
    const taught = makeAnswer({
      question: 'Why do you want to work here?',
      value: 'Because of the product.',
      aliases: ['What excites you about joining Northwind?']
    });
    const result = best({ label: 'What excites you about joining Northwind?' }, [...answers, taught]);
    expect(result.match?.answer.id).toBe(taught.id);
    expect(result.match?.reason).toBe('alias');
  });

  test('a word buried in a long question is not a match', () => {

    const result = best({ label: 'Country' }, answers);
    expect(result.status).toBe('none');
    expect(result.match?.score ?? 0).toBeLessThan(0.42);
  });

  test('an answer nobody could pick from a dropdown is not offered for one', () => {
    const phone = makeAnswer({ kind: 'phone', question: 'Phone', type: 'phone', value: '+1 (786) 830-6320' });
    const pool = [...answers, phone];

    expect(best({ label: 'Phone', control: 'combobox' }, pool).status).toBe('none');
    expect(best({ label: 'Phone', control: 'input', type: 'tel' }, pool).match?.answer.id).toBe(phone.id);
  });

  test('an answer that matches none of the choices on offer is not offered', () => {
    const answer = makeAnswer({ question: 'Favourite colour', value: 'Turquoise' });
    const field = { label: 'Favourite colour', control: 'select' as const, options: [{ value: 'Red', text: 'Red' }, { value: 'Blue', text: 'Blue' }] };
    expect(best(field, [...answers, answer]).status).not.toBe('fill');
  });

  test('an unrelated question matches nothing', () => {
    const result = best({ label: 'What is your favourite kind of sandwich?' }, answers);
    expect(result.status).toBe('none');
  });

  test('site-scoped answers only apply to their site', () => {
    const scoped = makeAnswer({ question: 'Employee referral code', value: 'NW-42', scope: 'site:northwind.com' });
    const pool = [...answers, scoped];
    const onSite = rank({ label: 'Employee referral code' }, pool, { host: 'jobs.northwind.com' });
    const elsewhere = rank({ label: 'Employee referral code' }, pool, { host: 'other.com' });

    expect(onSite[0]?.answer.id).toBe(scoped.id);
    expect(elsewhere.some((result) => result.answer.id === scoped.id)).toBe(false);
  });
});
