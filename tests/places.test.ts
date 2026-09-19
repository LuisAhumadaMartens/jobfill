import { describe, expect, test } from 'bun:test';
import { expandPlace, homeOf, isHome, isPlace, parsePlace, placeScore, questionPlace } from '../src/lib/matching/places.ts';
import { matchOption } from '../src/lib/matching/matcher.ts';

const options = (...texts: string[]) => texts.map((text) => ({ value: text, text }));

describe('reading a place', () => {
  test('splits city, state and country', () => {
    expect(parsePlace('San Francisco, CA')).toMatchObject({ city: 'san francisco', region: 'california' });
    expect(parsePlace('San Francisco, CA, United States')).toMatchObject({ city: 'san francisco', country: 'united states' });
    expect(parsePlace('San Francisco, Cebu, Philippines')).toMatchObject({ city: 'san francisco', country: 'philippines' });
  });
});

describe('the city name alone is not enough', () => {
  test('a different San Francisco scores nothing at all', () => {
    expect(placeScore('San Francisco, CA', 'San Francisco, Cebu, Philippines')).toBe(0);
    expect(placeScore('San Francisco, CA', 'San Francisco Caballua, Oaxaca, Mexico')).toBe(0);
  });

  test('the right one, however it is written, scores high', () => {
    expect(placeScore('San Francisco, CA', 'San Francisco, CA, United States')).toBeGreaterThan(0.9);
    expect(placeScore('San Francisco, CA', 'San Francisco, California, US')).toBeGreaterThan(0.9);
    expect(placeScore('San Francisco, CA', 'San Francisco')).toBeGreaterThan(0.75);
  });

  test('a typeahead offering only wrong cities fills nothing', () => {
    expect(matchOption('San Francisco, CA', options(
      'San Francisco, Cebu, Philippines',
      'San Francisco Caballua, Oaxaca, Mexico',
      'San Francisco, Córdoba, Argentina'
    ))).toBeNull();
  });

  test('and the right one is found among them', () => {
    expect(matchOption('San Francisco, CA', options(
      'San Francisco, Cebu, Philippines',
      'San Francisco, CA, United States'
    ))?.text).toBe('San Francisco, CA, United States');
  });
});

describe('metro areas', () => {
  const bayArea = questionPlace('Are you currently based in or willing to relocate to the Bay Area for this position?');

  test('a question naming a metro is recognised', () => {
    expect(bayArea?.name).toBe('the Bay Area');
    expect(bayArea!.cities.length).toBeGreaterThan(20);
  });

  test('living in one of its cities counts as being there', () => {
    expect(isHome(homeOf({ city: 'San Francisco', state: 'CA' }), bayArea)).toBe(true);
    expect(isHome(homeOf({ city: 'Oakland', state: 'CA' }), bayArea)).toBe(true);
    expect(isHome(homeOf({ location: 'Palo Alto, CA' }), bayArea)).toBe(true);
  });

  test('living elsewhere does not', () => {
    expect(isHome(homeOf({ city: 'Miami', state: 'FL' }), bayArea)).toBe(false);
    expect(isHome(homeOf({ city: 'Austin', state: 'TX' }), bayArea)).toBe(false);
  });

  test('a question naming a state works the same way', () => {
    const california = questionPlace('Are you currently located in California?');
    expect(california?.name).toBe('California');
    expect(isHome(homeOf({ city: 'San Francisco', state: 'CA' }), california)).toBe(true);
    expect(isHome(homeOf({ city: 'Austin', state: 'TX' }), california)).toBe(false);
  });

  test('two-letter codes are not hunted for in questions', () => {

    expect(questionPlace('Are you based in or willing to relocate for this role?')).toBeNull();
  });
});

describe('school names are not guessed at', () => {
  test('a different International is not a match', () => {
    expect(matchOption('Florida International University', options(
      'American International College',
      'International University of Monaco'
    ))).toBeNull();
  });

  test('the real one still matches', () => {
    expect(matchOption('Florida International University', options(
      'American International College',
      'Florida International University'
    ))?.text).toBe('Florida International University');
  });
});

describe('comparing places part by part', () => {
  test('the same place written every way a geocoder writes it', () => {
    for (const option of [
      'San Francisco, CA, USA',
      'San Francisco, California, United States',
      'San Francisco, CA',
      'San Francisco, California',
      'San Francisco'
    ]) {
      expect(matchOption('San Francisco, CA', options(option))?.text).toBe(option);
    }
  });

  test('picks the right one out of a list of wrong ones', () => {
    expect(matchOption('San Francisco, CA', options(
      'San Francisco, Cebu, Philippines',
      'San Francisco Caballua, Oaxaca, Mexico',
      'San Francisco, California, United States',
      'San Francisco, Córdoba, Argentina'
    ))?.text).toBe('San Francisco, California, United States');
  });

  test('a state that disagrees rules an option out, however alike it reads', () => {
    expect(matchOption('San Francisco, CA', options('San Francisco, Cebu, Philippines'))).toBeNull();
    expect(matchOption('Austin, TX', options('Austin, Manitoba, Canada'))).toBeNull();
  });

  test('other cities and states still work', () => {
    expect(matchOption('Austin, TX', options('Austin, Texas, United States'))?.text).toBe('Austin, Texas, United States');
    expect(matchOption('Miami, FL', options('Miami, Florida, USA', 'Miami, Ohio'))?.text).toBe('Miami, Florida, USA');
    expect(matchOption('New York, NY', options('New York City, New York, United States'))?.text)
      .toBe('New York City, New York, United States');
  });

  test('two equally plausible options are left for the user', () => {

    expect(matchOption('San Francisco', options(
      'San Francisco, Cebu, Philippines',
      'San Francisco, Córdoba, Argentina'
    ))).toBeNull();
  });
});

describe('a US state says the rest', () => {
  test('expands into the forms a search box understands', () => {
    expect(expandPlace('San Francisco, CA')).toEqual([
      'San Francisco, CA',
      'San Francisco, California',
      'San Francisco, California, United States',
      'San Francisco'
    ]);
  });

  test('the country is implied, so options elsewhere are ruled out', () => {

    expect(placeScore('San Francisco, CA', 'San Francisco, California, United States')).toBe(1);
    expect(placeScore('Austin, TX', 'Austin, Manitoba, Canada')).toBe(0);
    expect(placeScore('Miami, FL', 'Miami, Cuba')).toBe(0);
  });

  test('a value that is not a place is left alone', () => {
    expect(expandPlace('Why do you want to work here?')).toEqual(['Why do you want to work here?']);
    expect(isPlace('Bachelor of Science')).toBe(false);
    expect(isPlace('San Francisco, CA')).toBe(true);
  });
});
