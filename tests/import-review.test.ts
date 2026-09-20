import { beforeEach, describe, expect, test } from 'bun:test';
import { applyImport, planImport, type ParsedImport } from '../src/lib/answers/import-review.ts';
import type { State } from '../src/shared/types.ts';

const role = (title: string, company: string, current = false) => ({
  title, company, location: '', start: '01/2020', end: current ? '' : '01/2022', current, skills: [], summary: ''
});

const school = (name: string, degree = 'B.S.') => ({
  school: name, degree, field: 'Computer Science', start: '', end: '2018', gpa: '', location: ''
});

let current: Pick<State, 'profile' | 'history' | 'education' | 'skills'>;

beforeEach(() => {
  current = {
    profile: { firstName: 'Luis', phone: '+17868306320', city: 'San Francisco' },
    history: [role('Software Engineer', 'Mediastream', true)],
    education: [school('Florida International University')],
    skills: ['TypeScript', 'Go']
  };
});

const parsed: ParsedImport = {
  profile: { firstName: 'Luis', phone: '+1 (786) 830-6320', city: 'Austin', email: 'luis@ahumada.dev' },
  history: [role('Software Engineer', 'Mediastream', true), role('Engineering Lead', 'INIT')],
  education: [school('Florida International University'), school('Austin Community College', 'A.S.')],
  skills: ['TypeScript', 'Go', 'Kubernetes']
};

describe('what an import would change', () => {
  test('a value written differently is not a change', () => {
    const changes = planImport(current, parsed);
    expect(changes.find((change) => change.id === 'profile.phone')).toBeUndefined();
    expect(changes.find((change) => change.id === 'profile.firstName')).toBeUndefined();
  });

  test('a genuinely different value is offered, with both sides shown', () => {
    const city = planImport(current, parsed).find((change) => change.id === 'profile.city');
    expect(city).toMatchObject({ action: 'change', before: 'San Francisco', after: 'Austin' });
  });

  test('something not there yet is an addition', () => {
    const email = planImport(current, parsed).find((change) => change.id === 'profile.email');
    expect(email).toMatchObject({ action: 'add', before: '', after: 'luis@ahumada.dev' });
  });

  test('roles and schools already known are not offered again', () => {
    const changes = planImport(current, parsed);
    const roles = changes.filter((change) => change.area === 'history');
    const schools = changes.filter((change) => change.area === 'education');

    expect(roles).toHaveLength(1);
    expect(roles[0]!.label).toContain('Engineering Lead at INIT');
    expect(schools).toHaveLength(1);
    expect(schools[0]!.label).toContain('Austin Community College');
  });

  test('only the new skills are counted', () => {
    const skills = planImport(current, parsed).find((change) => change.area === 'skills');
    expect(skills?.after).toBe('Kubernetes');
  });

  test('importing the same resume twice proposes nothing', () => {
    const applied = applyImport(current, parsed, planImport(current, parsed));
    expect(planImport(applied, parsed)).toHaveLength(0);
  });
});

describe('applying only what was ticked', () => {
  test('an unticked change is left alone', () => {
    const changes = planImport(current, parsed);
    const withoutCity = changes.filter((change) => change.id !== 'profile.city');
    const applied = applyImport(current, parsed, withoutCity);

    expect(applied.profile.city).toBe('San Francisco');
    expect(applied.profile.email).toBe('luis@ahumada.dev');
  });

  test('nothing ticked changes nothing', () => {
    const applied = applyImport(current, parsed, []);
    expect(applied.profile).toEqual(current.profile);
    expect(applied.history).toHaveLength(1);
    expect(applied.skills).toEqual(['TypeScript', 'Go']);
  });

  test('accepted roles are added rather than replacing what is there', () => {
    const applied = applyImport(current, parsed, planImport(current, parsed));
    expect(applied.history).toHaveLength(2);
    expect(applied.history.map((entry) => entry.company)).toContain('Mediastream');
    expect(applied.history[0]!.current).toBe(true);
    expect(applied.skills).toEqual(['TypeScript', 'Go', 'Kubernetes']);
  });
});
