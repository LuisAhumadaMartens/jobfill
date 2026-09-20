import { describe, expect, test } from 'bun:test';
import {
  REPORT_SCHEMA, isCollectable, holdsPersonalData, isProtectedQuestion,
  validateObservation, validateReport, type Observation, type Report
} from '../src/shared/questions.ts';

function observation(over: Partial<Observation> = {}): Observation {
  return {
    ats: 'greenhouse.io',
    control: 'select',
    question: 'Are you legally authorized to work in the United States?',
    options: ['Yes', 'No'],
    outcome: 'unmatched',
    kind: null,
    confidence: null,
    ...over
  };
}

function report(over: Partial<Report> = {}): Report {
  return {
    schema: REPORT_SCHEMA,
    session: 'a'.repeat(32),
    day: '2026-09-19',
    version: '0.1.5',
    observations: [observation()],
    ...over
  };
}

describe('what may be collected', () => {
  test('a template question about the form is collectable', () => {
    expect(isCollectable('What are your compensation expectations?')).toBe(true);
    expect(isCollectable('Are you legally authorized to work in the United States?')).toBe(true);
  });

  test('demographic questions are never collectable', () => {
    for (const question of [
      'What is your gender?',
      'Please select your race and ethnicity',
      'Are you a protected veteran?',
      'Do you have a disability?',
      'What are your pronouns?',
      'How would you describe your sexual orientation?'
    ]) {
      expect(isProtectedQuestion(question)).toBe(true);
      expect(isCollectable(question)).toBe(false);
    }
  });

  test('work authorization survives the demographic filter', () => {
    expect(isProtectedQuestion('Will you now or in the future require sponsorship?')).toBe(false);
  });

  test('anything carrying personal data is rejected', () => {
    expect(holdsPersonalData('Email luis@example.com to confirm')).toBe(true);
    expect(holdsPersonalData('Call +1 415 555 0123')).toBe(true);
    expect(holdsPersonalData('See https://example.com/apply')).toBe(true);
    expect(holdsPersonalData('Reference number 90210412')).toBe(true);
    expect(holdsPersonalData('Reach @luisahumada')).toBe(true);
    expect(holdsPersonalData('What is your preferred start date?')).toBe(false);
  });

  test('a question that is too short or too long is rejected', () => {
    expect(isCollectable('Name?')).toBe(false);
    expect(isCollectable('a'.repeat(301))).toBe(false);
  });
});

describe('validating an observation', () => {
  test('a well formed observation is accepted and trimmed', () => {
    const checked = validateObservation(observation({ question: '  Why do you want to work here?  ', options: [' Yes ', 'No'] }));
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      expect(checked.value.question).toBe('Why do you want to work here?');
      expect(checked.value.options).toEqual(['Yes', 'No']);
    }
  });

  test('confidence is rounded rather than kept at full precision', () => {
    const checked = validateObservation(observation({ confidence: 0.6234567 }));
    expect(checked.ok && checked.value.confidence).toBe(0.623);
  });

  test('a site that is not a known job board is refused', () => {
    expect(validateObservation(observation({ ats: 'example.com' })).ok).toBe(false);
  });

  test('an unexpected field is refused rather than ignored', () => {
    const checked = validateObservation({ ...observation(), url: 'https://boards.greenhouse.io/acme/jobs/1' });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.reason).toContain('url');
  });

  test('an option carrying personal data is refused', () => {
    expect(validateObservation(observation({ options: ['luis@example.com'] })).ok).toBe(false);
  });

  test('confidence outside zero to one is refused', () => {
    expect(validateObservation(observation({ confidence: 1.4 })).ok).toBe(false);
  });

  test('a demographic question is refused at the boundary as well', () => {
    expect(validateObservation(observation({ question: 'Please describe your gender identity' })).ok).toBe(false);
  });
});

describe('validating a report', () => {
  test('a well formed report is accepted', () => {
    expect(validateReport(report()).ok).toBe(true);
  });

  test('a report from another schema is refused', () => {
    expect(validateReport(report({ schema: 2 })).ok).toBe(false);
  });

  test('a session that is not a plain token is refused', () => {
    expect(validateReport(report({ session: 'luis-ahumada' })).ok).toBe(false);
    expect(validateReport(report({ session: 'a'.repeat(31) })).ok).toBe(false);
  });

  test('a day that carries a time is refused', () => {
    expect(validateReport(report({ day: '2026-09-19T01:42:24Z' })).ok).toBe(false);
  });

  test('an empty report is refused', () => {
    expect(validateReport(report({ observations: [] })).ok).toBe(false);
  });

  test('more observations than the limit are refused', () => {
    expect(validateReport(report({ observations: Array.from({ length: 51 }, () => observation()) })).ok).toBe(false);
  });

  test('one bad observation refuses the whole report', () => {
    expect(validateReport(report({ observations: [observation(), observation({ ats: 'example.com' })] })).ok).toBe(false);
  });

  test('a report carrying anything extra is refused', () => {
    expect(validateReport({ ...report(), profile: { firstName: 'Luis' } }).ok).toBe(false);
  });
});
