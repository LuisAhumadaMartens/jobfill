import { normalize, similarity, squish } from './text.ts';
import { isUnitedStates, US_STATE_GROUPS } from './synonyms.ts';

const STATES = new Map<string, string>();

const STATE_CODES = new Map<string, string>();

for (const terms of US_STATE_GROUPS) {
  const canonical = terms[0]!;
  for (const term of terms) STATES.set(normalize(term), normalize(canonical));
  const code = terms.find((term) => term.length === 2);
  if (code) STATE_CODES.set(normalize(canonical), code.toUpperCase());
}

const METROS: Array<{ name: string; aliases: string[]; cities: string[] }> = [
  {
    name: 'the Bay Area',
    aliases: ['bay area', 'sf bay area', 'san francisco bay area', 'greater bay area'],
    cities: [
      'San Francisco', 'South San Francisco', 'Oakland', 'Berkeley', 'Emeryville', 'Alameda',
      'San Jose', 'Santa Clara', 'Sunnyvale', 'Mountain View', 'Palo Alto', 'East Palo Alto',
      'Menlo Park', 'Redwood City', 'San Mateo', 'Foster City', 'Burlingame', 'Millbrae',
      'Daly City', 'Cupertino', 'Milpitas', 'Fremont', 'Hayward', 'San Leandro', 'Richmond',
      'Walnut Creek', 'Concord', 'Pleasanton', 'Dublin', 'Livermore', 'San Ramon', 'Danville',
      'Sausalito', 'Mill Valley', 'San Rafael', 'Novato', 'Belmont', 'San Carlos', 'Los Altos',
      'Los Gatos', 'Campbell', 'Saratoga', 'Union City', 'Newark', 'Brisbane', 'Pacifica'
    ]
  },
  {
    name: 'the New York area',
    aliases: ['new york city', 'nyc', 'new york metro', 'greater new york', 'new york area', 'tri state area'],
    cities: [
      'New York', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Long Island City',
      'Jersey City', 'Hoboken', 'Newark', 'Yonkers', 'White Plains', 'Stamford', 'New Rochelle'
    ]
  },
  {
    name: 'Greater Boston',
    aliases: ['greater boston', 'boston area', 'boston metro'],
    cities: ['Boston', 'Cambridge', 'Somerville', 'Brookline', 'Newton', 'Waltham', 'Quincy', 'Medford', 'Watertown']
  },
  {
    name: 'the Seattle area',
    aliases: ['greater seattle', 'seattle area', 'puget sound'],
    cities: ['Seattle', 'Bellevue', 'Redmond', 'Kirkland', 'Renton', 'Tacoma', 'Everett', 'Bothell']
  },
  {
    name: 'Greater Los Angeles',
    aliases: ['greater los angeles', 'los angeles area', 'la metro', 'southern california', 'socal'],
    cities: [
      'Los Angeles', 'Santa Monica', 'Pasadena', 'Burbank', 'Glendale', 'Culver City',
      'Long Beach', 'El Segundo', 'Venice', 'Inglewood', 'Torrance', 'Anaheim', 'Irvine'
    ]
  },
  {
    name: 'the Chicago area',
    aliases: ['greater chicago', 'chicago area', 'chicagoland'],
    cities: ['Chicago', 'Evanston', 'Naperville', 'Oak Park', 'Schaumburg', 'Skokie']
  },
  {
    name: 'the DC area',
    aliases: ['dc metro', 'washington dc area', 'greater washington', 'dmv area', 'national capital region'],
    cities: ['Washington', 'Arlington', 'Alexandria', 'Bethesda', 'Silver Spring', 'Reston', 'McLean', 'Rockville', 'Tysons']
  },
  {
    name: 'South Florida',
    aliases: ['south florida', 'miami area', 'greater miami', 'tri county'],
    cities: ['Miami', 'Miami Beach', 'Coral Gables', 'Hialeah', 'Doral', 'Fort Lauderdale', 'Boca Raton', 'West Palm Beach', 'Hollywood']
  },
  {
    name: 'the Research Triangle',
    aliases: ['research triangle', 'raleigh durham', 'rtp'],
    cities: ['Raleigh', 'Durham', 'Chapel Hill', 'Cary', 'Morrisville']
  },
  {
    name: 'the Austin area',
    aliases: ['austin area', 'greater austin', 'central texas'],
    cities: ['Austin', 'Round Rock', 'Cedar Park', 'Pflugerville', 'Georgetown']
  }
];

export interface Place {

  city: string;

  region: string;

  country: string;
  raw: string;
}

export function parsePlace(value: string): Place | null {
  const raw = squish(value);
  if (!raw) return null;

  const parts = raw.split(',').map((part) => normalize(part)).filter(Boolean);
  if (!parts.length) return null;

  const place: Place = { city: parts[0]!, region: '', country: '', raw };

  for (const part of parts.slice(1)) {
    const state = STATES.get(part);
    if (state && !place.region) {
      place.region = state;
      continue;
    }
    if (isUnitedStates(part) || /^(mexico|canada|philippines|india|united kingdom|spain|france|germany|brazil|argentina|colombia|chile)$/.test(part)) {
      place.country = part;
      continue;
    }
    if (!place.region) place.region = part;
  }

  return place;
}

function mentions(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return (' ' + haystack + ' ').includes(' ' + needle + ' ');
}

function coversWords(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return (' ' + haystack + ' ').includes(' ' + needle + ' ');
}

export function placeScore(value: string, option: string): number {
  const ours = parsePlace(value);
  const theirs = parsePlace(option);
  if (!ours || !theirs) return 0;

  let city: number;
  if (ours.city === theirs.city) city = 1;
  else if (coversWords(theirs.city, ours.city) || coversWords(ours.city, theirs.city)) city = 0.8;
  else if (similarity(ours.city, theirs.city) >= 0.88) city = 0.7;
  else return 0;

  let region = 0.5;
  if (ours.region && theirs.region) {
    if (ours.region !== theirs.region) return 0;
    region = 1;
  } else if (ours.region && !theirs.region) {

    region = coversWords(normalize(option), ours.region) ? 1 : 0.5;
  }

  let country = 0.5;
  if (ours.country && theirs.country) {
    const same = ours.country === theirs.country || (isUnitedStates(ours.country) && isUnitedStates(theirs.country));
    if (!same) return 0;
    country = 1;
  } else if (!ours.country && theirs.country) {

    if (STATES.has(ours.region)) {
      if (!isUnitedStates(theirs.country)) return 0;
      country = 1;
    } else {
      country = 0.6;
    }
  }

  return 0.55 * city + 0.3 * region + 0.15 * country;
}

export function looksLikeLocationList(options: Array<{ text: string; value: string }>): boolean {
  return options.some((option) => (option.text || option.value).includes(','));
}

export function bestPlace<T extends { text: string; value: string }>(value: string, options: T[]): T | null {
  const scored = options
    .map((option) => ({ option, score: Math.max(placeScore(value, option.text), placeScore(value, option.value)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < 0.75) return null;

  const runnerUp = scored[1];
  if (runnerUp && top.score - runnerUp.score < 0.05) return null;

  return top.option;
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function expandPlace(value: string): string[] {
  const place = parsePlace(value);
  if (!place?.city) return [squish(value)].filter(Boolean);

  const city = titleCase(place.city);
  const stateName = place.region ? titleCase(place.region) : '';
  const code = place.region ? STATE_CODES.get(place.region) : undefined;
  const inUS = !!place.region && STATES.has(place.region);

  const variants = [squish(value)];
  if (stateName) {
    variants.push(`${city}, ${stateName}`);
    if (code) variants.push(`${city}, ${code}`);
    if (inUS) variants.push(`${city}, ${stateName}, United States`);
  }
  variants.push(city);

  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = normalize(variant);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isPlace(value: string): boolean {
  const place = parsePlace(value);
  return !!place?.region && (STATES.has(place.region) || !!place.country);
}

export interface PlaceMention {

  name: string;

  cities: string[];

  region: string;
}

export function questionPlace(question: string): PlaceMention | null {
  const text = normalize(question);

  for (const metro of METROS) {
    if (metro.aliases.some((alias) => mentions(text, normalize(alias)))) {
      return { name: metro.name, cities: metro.cities, region: '' };
    }
  }

  for (const [term, canonical] of STATES) {
    if (term.length > 2 && mentions(text, term)) {
      return { name: squish(term.replace(/\b\w/g, (c) => c.toUpperCase())), cities: [], region: canonical };
    }
  }

  return null;
}

export function homeOf(profile: Record<string, string>): Place | null {
  const written = profile.location || [profile.city, profile.state].filter(Boolean).join(', ');
  return parsePlace(written);
}

export function isHome(home: Place | null, target: PlaceMention | null): boolean {
  if (!home || !target) return false;
  if (target.cities.length) return target.cities.some((city) => normalize(city) === home.city);
  if (target.region) return home.region === target.region;
  return false;
}
