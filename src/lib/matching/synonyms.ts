import { normalize } from './text.ts';

interface Group {
  terms: string[];

  family?: string;

  scoped?: boolean;
}

const GROUPS: Group[] = [

  { terms: ['United States', 'United States of America', 'USA', 'U.S.A.', 'America'] },
  { terms: ['United Kingdom', 'UK', 'Great Britain'] },

  { terms: ['Bachelor of Science', 'BS', 'B.S.', 'BSc', 'B.Sc.'], family: 'bachelor' },
  { terms: ['Bachelor of Arts', 'BA', 'B.A.'], family: 'bachelor' },
  { terms: ['Bachelor of Engineering', 'BE', 'B.E.', 'BEng'], family: 'bachelor' },
  {
    terms: [
      "Bachelor's Degree", 'Bachelors Degree', 'Bachelor Degree', 'Bachelors', 'Bachelor',
      'Undergraduate Degree', 'Undergraduate', 'Four-year degree', 'College Degree'
    ],
    family: 'bachelor'
  },
  { terms: ['Master of Science', 'MS', 'M.S.', 'MSc', 'M.Sc.'], family: 'master' },
  { terms: ['Master of Arts', 'MA', 'M.A.'], family: 'master' },
  { terms: ['MBA', 'M.B.A.', 'Master of Business Administration'], family: 'master' },
  {
    terms: ["Master's Degree", 'Masters Degree', 'Master Degree', 'Masters', 'Master', 'Graduate Degree', 'Postgraduate Degree'],
    family: 'master'
  },
  { terms: ['PhD', 'Ph.D.', 'Doctorate', 'Doctoral Degree', 'Doctor of Philosophy'], family: 'doctorate' },
  {
    terms: ["Associate's Degree", 'Associates Degree', 'Associate Degree', 'Associates', 'Associate', 'AA', 'A.A.', 'AS', 'A.S.', 'Two-year degree'],
    family: 'associate'
  },
  { terms: ['High School Diploma', 'High School', 'GED', 'Secondary School', 'High School or equivalent'], family: 'highschool' },
  { terms: ['Some College', 'Some College, no degree', 'College, no degree'], family: 'somecollege' },

  { terms: ['Full-time', 'Full time', 'Fulltime', 'Permanent full-time'] },
  { terms: ['Part-time', 'Part time', 'Parttime'] },
  { terms: ['Contract', 'Contractor', 'Contract to hire', 'Freelance'] },
  { terms: ['Internship', 'Intern', 'Co-op'] },

  { terms: ['Remote', 'Fully remote', 'Work from home', 'WFH'] },
  { terms: ['Hybrid', 'Partially remote'] },
  { terms: ['On-site', 'Onsite', 'In office', 'In-person'] },

  ...([
    ['Alabama', 'AL'], ['Alaska', 'AK'], ['Arizona', 'AZ'], ['Arkansas', 'AR'], ['California', 'CA'],
    ['Colorado', 'CO'], ['Connecticut', 'CT'], ['Delaware', 'DE'], ['Florida', 'FL'], ['Georgia', 'GA'],
    ['Hawaii', 'HI'], ['Idaho', 'ID'], ['Illinois', 'IL'], ['Indiana', 'IN'], ['Iowa', 'IA'],
    ['Kansas', 'KS'], ['Kentucky', 'KY'], ['Louisiana', 'LA'], ['Maine', 'ME'], ['Maryland', 'MD'],
    ['Massachusetts', 'MA'], ['Michigan', 'MI'], ['Minnesota', 'MN'], ['Mississippi', 'MS'], ['Missouri', 'MO'],
    ['Montana', 'MT'], ['Nebraska', 'NE'], ['Nevada', 'NV'], ['New Hampshire', 'NH'], ['New Jersey', 'NJ'],
    ['New Mexico', 'NM'], ['New York', 'NY'], ['North Carolina', 'NC'], ['North Dakota', 'ND'], ['Ohio', 'OH'],
    ['Oklahoma', 'OK'], ['Oregon', 'OR'], ['Pennsylvania', 'PA'], ['Rhode Island', 'RI'], ['South Carolina', 'SC'],
    ['South Dakota', 'SD'], ['Tennessee', 'TN'], ['Texas', 'TX'], ['Utah', 'UT'], ['Vermont', 'VT'],
    ['Virginia', 'VA'], ['Washington', 'WA'], ['West Virginia', 'WV'], ['Wisconsin', 'WI'], ['Wyoming', 'WY'],
    ['District of Columbia', 'DC', 'Washington DC']
  ] as string[][]).map((terms) => ({ terms, scoped: true }))
];

const INDEX = new Map<string, number>();
for (const [position, group] of GROUPS.entries()) {
  for (const term of group.terms) {
    const key = normalize(term);
    if (key && !INDEX.has(key)) INDEX.set(key, position);
  }
}

export interface MatchContext {

  longList?: boolean;
}

function groupOf(value: string, context: MatchContext = {}): Group | null {
  const position = INDEX.get(normalize(value));
  if (position === undefined) return null;
  const group = GROUPS[position]!;
  if (group.scoped && !context.longList) return null;
  return group;
}

export function areSynonyms(a: string, b: string, context: MatchContext = {}): boolean {
  const left = groupOf(a, context);
  if (!left) return false;
  return left === groupOf(b, context);
}

export function areRelated(a: string, b: string, context: MatchContext = {}): boolean {
  const left = groupOf(a, context);
  const right = groupOf(b, context);
  if (!left || !right || left === right) return false;
  return !!left.family && left.family === right.family;
}

export const US_STATE_GROUPS: string[][] = GROUPS.filter((group) => group.scoped).map((group) => group.terms);

export function isUSState(value: string): boolean {
  const position = INDEX.get(normalize(value));
  if (position === undefined) return false;
  return !!GROUPS[position]?.scoped;
}

export function isUnitedStates(value: string): boolean {
  return areSynonyms(value, 'United States');
}

export function synonymsOf(value: string, context: MatchContext = {}): string[] {
  const group = groupOf(value, context);
  if (!group) return [];
  const self = normalize(value);
  return group.terms.filter((term) => normalize(term) !== self);
}
