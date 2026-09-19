import type { CertificationEntry, EducationEntry, LanguageEntry, ReferenceEntry, ScannedField, SerializedField, State, WorkEntry } from '../../shared/types.ts';

export const HISTORY_KINDS = [
  'employerName', 'jobTitle', 'currentEmployer', 'currentTitle', 'employmentStart', 'employmentEnd'
] as const;

export const EDUCATION_KINDS = ['school', 'degree', 'major', 'gpa', 'graduationDate'] as const;

type FieldLike = Partial<ScannedField & SerializedField>;

export function historyIndexOf(field: FieldLike): number {
  const identity = `${field.name ?? ''} ${field.id ?? ''}`;

  const bracket = /\[(\d{1,2})\]/.exec(identity);
  if (bracket) return Number(bracket[1]);

  const suffixed = /(?:experience|employment|work|job|position|employer|company)[^a-z0-9]{0,3}(\d{1,2})/i.exec(identity);
  if (suffixed) return Number(suffixed[1]);

  const labelled = /\b(?:employer|position|job|experience|company|role)\s*#?\s*(\d{1,2})\b/i.exec(field.label ?? '');
  if (labelled) return Math.max(0, Number(labelled[1]) - 1);

  return 0;
}

export function valueFromHistory(field: FieldLike, history: WorkEntry[]): string | null {
  const kind = field.kind;
  if (!kind || !history.length) return null;
  if (!HISTORY_KINDS.includes(kind as (typeof HISTORY_KINDS)[number])) return null;

  const index = historyIndexOf(field);
  const entry = history[index];
  if (!entry) return null;

  if (kind === 'employerName' || kind === 'currentEmployer') return entry.company || null;
  if (kind === 'jobTitle' || kind === 'currentTitle') return entry.title || null;
  if (kind === 'employmentStart') return entry.start || null;
  if (kind === 'employmentEnd') return entry.current ? 'Present' : entry.end || null;
  return null;
}

export function valueFromEducation(field: FieldLike, education: EducationEntry[]): string | null {
  const kind = field.kind;
  if (!kind || !education.length) return null;
  if (!EDUCATION_KINDS.includes(kind as (typeof EDUCATION_KINDS)[number])) return null;

  const entry = education[historyIndexOf(field)];
  if (!entry) return null;

  if (kind === 'school') return entry.school || null;
  if (kind === 'degree') return entry.degree || null;
  if (kind === 'major') return entry.field || null;
  if (kind === 'gpa') return entry.gpa || null;
  if (kind === 'graduationDate') return entry.end || null;
  return null;
}

const REFERENCE_FIELDS: Record<string, keyof ReferenceEntry> = {
  referenceName: 'name',
  referenceEmail: 'email',
  referencePhone: 'phone',
  referenceCompany: 'company',
  referenceTitle: 'title',
  referenceRelationship: 'relationship'
};

export function valueFromReferences(field: FieldLike, references: ReferenceEntry[]): string | null {
  const key = field.kind ? REFERENCE_FIELDS[field.kind] : undefined;
  if (!key || !references.length) return null;
  const entry = references[historyIndexOf(field)];
  return entry ? entry[key] || null : null;
}

export function valueFromLanguages(field: FieldLike, languages: LanguageEntry[]): string | null {
  if (!languages.length) return null;
  const entry = languages[historyIndexOf(field)];
  if (!entry) return null;
  if (field.kind === 'language') return entry.language || null;
  if (field.kind === 'languageProficiency') return entry.proficiency || null;
  return null;
}

export function valueFromCertifications(field: FieldLike, certifications: CertificationEntry[]): string | null {
  if (field.kind !== 'certificationName' || !certifications.length) return null;
  const entry = certifications[historyIndexOf(field)];
  return entry ? entry.name || null : null;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function partOf(value: string, want: 'month' | 'year'): string | null {
  const match = /^(\d{1,2})[/-](\d{4})$/.exec(value);
  if (match) {
    if (want === 'year') return match[2]!;
    const index = Number(match[1]) - 1;
    return MONTH_NAMES[index] ?? String(Number(match[1]));
  }
  if (/^(19|20)\d{2}$/.test(value)) return want === 'year' ? value : null;
  return null;
}

export function datePartFor(field: FieldLike, value: string): string | null {
  const haystack = `${field.label ?? ''} ${field.name ?? ''} ${field.id ?? ''}`.toLowerCase();
  if (/\bmonth\b/.test(haystack)) return partOf(value, 'month');
  if (/\byear\b/.test(haystack)) return partOf(value, 'year');
  return null;
}

export function valueFromRecords(field: FieldLike, state: Pick<State,
  'history' | 'education' | 'skills' | 'references' | 'languages' | 'certifications'> & { skillYears?: Array<{ name: string; years: string }> }): string | null {
  const direct = valueFromHistory(field, state.history)
    ?? valueFromEducation(field, state.education)
    ?? valueFromReferences(field, state.references)
    ?? valueFromLanguages(field, state.languages)
    ?? valueFromCertifications(field, state.certifications);

  if (direct) {
    const part = datePartFor(field, direct);
    return part ?? direct;
  }

  if (field.kind === 'currentlyWorkHere') {
    const entry = state.history[historyIndexOf(field)];
    return entry ? (entry.current ? 'Yes' : 'No') : null;
  }

  if (field.kind === 'yearsExperience') {
    const named = yearsForNamedSkill(field, state.skillYears ?? []);
    if (named) return named;
  }

  if (field.kind === 'skills' && state.skills.length) return state.skills.join(', ');
  return null;
}

function yearsForNamedSkill(field: FieldLike, skillYears: Array<{ name: string; years: string }>): string | null {
  const haystack = ` ${(field.label ?? '').toLowerCase()} ${(field.name ?? '').toLowerCase()} `;
  const matches = skillYears
    .filter((entry) => entry.years && entry.name)
    .filter((entry) => haystack.includes(` ${entry.name.toLowerCase()} `) || haystack.includes(entry.name.toLowerCase()));

  const longest = matches.sort((a, b) => b.name.length - a.name.length)[0];
  return longest?.years ?? null;
}

export function toEducationEntries(entries: Array<{
  degree: string;
  major: string;
  school: string;
  gpa: string;
  graduation: { year?: number; month?: number } | null;
}>): EducationEntry[] {
  return entries
    .filter((entry) => entry.school || entry.degree)
    .map((entry) => ({
      school: entry.school,
      degree: entry.degree,
      field: entry.major,
      start: '',
      end: entry.graduation?.year
        ? (entry.graduation.month ? `${String(entry.graduation.month).padStart(2, '0')}/${entry.graduation.year}` : String(entry.graduation.year))
        : '',
      gpa: entry.gpa,
      location: ''
    }));
}

export function toWorkEntries(roles: Array<{
  title: string;
  company: string;
  location: string;
  current: boolean;
  start: { year?: number; month?: number } | null;
  end: { year?: number; month?: number; present?: boolean } | null;
  skills?: string[];
  summary?: string;
}>): WorkEntry[] {
  const asText = (date: { year?: number; month?: number } | null | undefined): string => {
    if (!date?.year) return '';
    return date.month ? `${String(date.month).padStart(2, '0')}/${date.year}` : String(date.year);
  };

  return roles
    .filter((role) => role.title || role.company)
    .map((role) => ({
      title: role.title,
      company: role.company,
      location: role.location,
      start: asText(role.start),
      end: role.current ? '' : asText(role.end),
      current: role.current,
      skills: role.skills ?? [],
      summary: role.summary ?? ''
    }));
}
