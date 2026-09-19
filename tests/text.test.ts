import { describe, expect, test } from 'bun:test';
import { normalize, similarity, tokens, humanize, asBoolean } from '../src/lib/matching/text.ts';

describe('normalize', () => {
  test('strips the decoration forms put around questions', () => {
    expect(normalize('First Name *')).toBe('first name');
    expect(normalize('  Email Address (Required) ')).toBe('email address');
    expect(normalize('Phone number:')).toBe('phone number');
  });

  test('expands the abbreviations that split otherwise identical questions', () => {
    expect(normalize('Authorized to work in the U.S.?')).toBe('authorized to work in the united states');
    expect(normalize('E-Mail')).toBe('email');
    expect(normalize('Yrs of exp')).toBe('year of experience');
  });

  test('folds accents and smart punctuation', () => {
    expect(normalize('Prénom')).toBe('prenom');
    expect(normalize('What’s your name?')).toBe('whats your name');
  });
});

describe('similarity', () => {
  test('same question, different wording', () => {
    expect(similarity(
      'Are you legally authorized to work in the United States?',
      'Are you legally authorized to work in the U.S.?'
    )).toBeGreaterThan(0.9);

    expect(similarity('Phone', 'Phone Number')).toBeGreaterThan(0.8);
    expect(similarity('Desired salary', 'What is your desired salary?')).toBeGreaterThan(0.75);
  });

  test('different questions stay apart', () => {
    expect(similarity('First Name', 'Last Name')).toBeLessThan(0.6);
    expect(similarity('First Name', 'Are you over 18?')).toBeLessThan(0.3);
    expect(similarity('LinkedIn URL', 'GitHub URL')).toBeLessThan(0.62);
  });
});

test('tokens drop filler words but never everything', () => {
  expect(tokens('Are you willing to relocate?')).toContain('relocate');
  expect(tokens('Do you have any of these?').length).toBeGreaterThan(0);
});

test('humanize turns field names into questions', () => {
  expect(humanize('job_application[first_name]')).toBe('job application first name');
  expect(humanize('firstName')).toBe('first Name');
});

test('asBoolean reads the yes/no dialects', () => {
  expect(asBoolean('Yes')).toBe(true);
  expect(asBoolean('I agree')).toBe(true);
  expect(asBoolean('No')).toBe(false);
  expect(asBoolean('Austin, TX')).toBeNull();
});
