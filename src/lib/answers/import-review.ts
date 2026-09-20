import { normalize, squish } from '../matching/text.ts';
import { sameValue } from '../matching/verify.ts';
import type { EducationEntry, State, WorkEntry } from '../../shared/types.ts';
import { PROFILE_FIELDS } from './schema.ts';

export type ImportArea = 'profile' | 'history' | 'education' | 'skills';

export interface ImportChange {
  id: string;
  area: ImportArea;
  label: string;
  before: string;
  after: string;
  action: 'add' | 'change';
  index?: number;
}

export interface ParsedImport {
  profile: Record<string, string>;
  history: WorkEntry[];
  education: EducationEntry[];
  skills: string[];
}

type Current = Pick<State, 'profile' | 'history' | 'education' | 'skills'>;

function roleKey(entry: { company: string; title: string }): string {
  return `${normalize(entry.company)}|${normalize(entry.title)}`;
}

function schoolKey(entry: { school: string; degree: string }): string {
  return `${normalize(entry.school)}|${normalize(entry.degree)}`;
}

function describeRole(entry: WorkEntry): string {
  const when = entry.start ? ` (${entry.start} to ${entry.current ? 'now' : entry.end || 'unknown'})` : '';
  return `${entry.title || 'Role'} at ${entry.company || 'unknown'}${when}`;
}

function describeSchool(entry: EducationEntry): string {
  return [entry.degree, entry.field, entry.school].filter(Boolean).join(', ');
}

export function planImport(current: Current, parsed: ParsedImport): ImportChange[] {
  const changes: ImportChange[] = [];

  for (const field of PROFILE_FIELDS) {
    const after = squish(parsed.profile[field.key] ?? '');
    if (!after) continue;
    const before = squish(current.profile[field.key] ?? '');
    if (before && sameValue(before, after, { type: field.type })) continue;

    changes.push({
      id: `profile.${field.key}`,
      area: 'profile',
      label: field.label,
      before,
      after,
      action: before ? 'change' : 'add'
    });
  }

  const knownRoles = new Set(current.history.map(roleKey));
  parsed.history.forEach((entry, index) => {
    if (knownRoles.has(roleKey(entry))) return;
    changes.push({
      id: `history.${index}`,
      area: 'history',
      label: describeRole(entry),
      before: '',
      after: entry.skills.length ? `Skills: ${entry.skills.join(', ')}` : '',
      action: 'add',
      index
    });
  });

  const knownSchools = new Set(current.education.map(schoolKey));
  parsed.education.forEach((entry, index) => {
    if (knownSchools.has(schoolKey(entry))) return;
    changes.push({
      id: `education.${index}`,
      area: 'education',
      label: describeSchool(entry),
      before: '',
      after: entry.end ? `Finished ${entry.end}` : '',
      action: 'add',
      index
    });
  });

  const known = new Set(current.skills.map(normalize));
  const added = parsed.skills.filter((skill) => !known.has(normalize(skill)));
  if (added.length) {
    changes.push({
      id: 'skills',
      area: 'skills',
      label: `${added.length} new skill${added.length === 1 ? '' : 's'}`,
      before: current.skills.join(', '),
      after: added.join(', '),
      action: current.skills.length ? 'change' : 'add'
    });
  }

  return changes;
}

export interface ImportResult {
  profile: Record<string, string>;
  history: WorkEntry[];
  education: EducationEntry[];
  skills: string[];
}

export function applyImport(current: Current, parsed: ParsedImport, accepted: ImportChange[]): ImportResult {
  const chosen = new Set(accepted.map((change) => change.id));

  const profile = { ...current.profile };
  for (const field of PROFILE_FIELDS) {
    if (!chosen.has(`profile.${field.key}`)) continue;
    const value = squish(parsed.profile[field.key] ?? '');
    if (value) profile[field.key] = value;
  }

  const history = [...current.history];
  parsed.history.forEach((entry, index) => {
    if (chosen.has(`history.${index}`)) history.push(entry);
  });

  const education = [...current.education];
  parsed.education.forEach((entry, index) => {
    if (chosen.has(`education.${index}`)) education.push(entry);
  });

  let skills = [...current.skills];
  if (chosen.has('skills')) {
    const known = new Set(skills.map(normalize));
    for (const skill of parsed.skills) {
      if (known.has(normalize(skill))) continue;
      known.add(normalize(skill));
      skills.push(skill);
    }
  }

  history.sort((a, b) => Number(b.current) - Number(a.current));
  return { profile, history, education, skills };
}
