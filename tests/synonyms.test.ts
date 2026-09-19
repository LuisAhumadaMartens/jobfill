import { describe, expect, test } from 'bun:test';
import { areRelated, areSynonyms, synonymsOf } from '../src/lib/matching/synonyms.ts';
import { matchOption } from '../src/lib/matching/matcher.ts';

const options = (...texts: string[]) => texts.map((text) => ({ value: text, text }));

describe('the same thing said differently', () => {
  test('country', () => {
    expect(areSynonyms('United States', 'United States of America')).toBe(true);
    expect(areSynonyms('USA', 'US')).toBe(true);
    expect(areSynonyms('U.S.A.', 'united states of america')).toBe(true);
    expect(areSynonyms('United States', 'United Kingdom')).toBe(false);
  });

  test('degrees, exactly', () => {
    expect(areSynonyms('B.S.', 'Bachelor of Science')).toBe(true);
    expect(areSynonyms('BSc', 'BS')).toBe(true);
    expect(areSynonyms('B.S.', 'Bachelor of Arts')).toBe(false);
  });

  test('degrees, by family, when nothing exact is offered', () => {
    expect(areRelated('B.S.', "Bachelor's Degree")).toBe(true);
    expect(areRelated('MBA', "Master's Degree")).toBe(true);
    expect(areRelated('B.S.', "Master's Degree")).toBe(false);
  });

  test('lists what else a value is called', () => {
    expect(synonymsOf('USA')).toContain('United States of America');
  });
});

describe('picking the right option', () => {
  test('country, however the form spells it', () => {
    expect(matchOption('United States', options('Canada', 'United States of America', 'Mexico'))?.text)
      .toBe('United States of America');
    expect(matchOption('United States', options('CA', 'US', 'MX'))?.text).toBe('US');
    expect(matchOption('USA', options('United Kingdom', 'United States'))?.text).toBe('United States');
  });

  test('education level, from a resume that says "B.S."', () => {
    expect(matchOption('B.S.', options('High School', "Associate's Degree", "Bachelor's Degree", "Master's Degree"))?.text)
      .toBe("Bachelor's Degree");
  });

  test('an exact degree beats a family relative', () => {
    expect(matchOption('Bachelor of Science', options("Bachelor's Degree", 'Bachelor of Arts', 'Bachelor of Science'))?.text)
      .toBe('Bachelor of Science');
  });

  test('state codes expand, but only in a list long enough to be a state list', () => {
    const states = options(
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
      'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Texas'
    );
    expect(matchOption('TX', states)?.text).toBe('Texas');

    expect(matchOption('OR', options('Yes', 'No'))).toBeNull();
  });

  test('none of this makes it guess at unrelated options', () => {
    expect(matchOption('United States', options('Blue', 'Green', 'Purple'))).toBeNull();
  });
});
