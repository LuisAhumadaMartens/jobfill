import * as T from '../matching/text.ts';
import * as S from './schema.ts';
import { isUnitedStates } from '../matching/synonyms.ts';
import { classify } from '../matching/matcher.ts';
import { parsePhone } from '../values/phone.ts';
import type { Answer, EducationEntry, MasterResume, PendingReview, Profile, ResumeRecord, ReviewItem, Settings, State, WorkEntry } from '../../shared/types.ts';

const KEYS: Array<keyof State> = ['version', 'profile', 'answers', 'settings', 'resume', 'stats', 'pendingReview', 'history', 'education', 'skills', 'skillYears', 'references', 'languages', 'certifications', 'master'];

interface Area {
  get(keys?: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

function memoryArea(): Area {
  const mem: Record<string, unknown> = {};
  return {
    get: async (keys) => Object.fromEntries((keys ?? Object.keys(mem)).map((k) => [k, mem[k]])),
    set: async (items) => { Object.assign(mem, items); },
    remove: async (keys) => { for (const k of ([] as string[]).concat(keys)) delete mem[k]; },
    clear: async () => { for (const k of Object.keys(mem)) delete mem[k]; }
  };
}

const area: Area = (typeof chrome !== 'undefined' && chrome.storage?.local)
  ? (chrome.storage.local as unknown as Area)
  : memoryArea();

function uid(prefix?: string): string {
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return (prefix || 'id') + '_' + rand;
}

function nowISO(): string { return new Date().toISOString(); }

function makeAnswer(input: Partial<Answer> & { question?: string }): Answer {
  const now = nowISO();
  return {
    id: input.id || uid('ans'),
    kind: input.kind || null,
    question: T.squish(input.question || ''),
    aliases: dedupePhrases(input.aliases || [], input.question),
    type: input.type || 'text',
    value: input.value != null ? input.value : '',
    choices: Array.isArray(input.choices) ? input.choices.slice() : undefined,
    valueAliases: input.valueAliases || undefined,
    scope: input.scope || 'global',
    source: input.source || 'user',
    control: input.control,
    notes: input.notes || '',
    archived: !!input.archived,
    usageCount: input.usageCount || 0,
    lastUsedAt: input.lastUsedAt || null,
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function dedupePhrases(list: string[], exclude?: string): string[] {
  const seen = new Set(exclude ? [T.normalize(exclude)] : []);
  const out: string[] = [];
  for (const phrase of list) {
    const text = T.squish(phrase);
    const key = T.normalize(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function seedAnswers(): Answer[] {
  return S.SEED_ANSWERS.map((seed) => makeAnswer(Object.assign({ source: 'seed' }, seed)));
}

function repair(state: State): State {
  const answers = state.answers.map((answer) => {
    let kind = answer.kind;
    if (answer.source === 'user') kind = classify({ label: answer.question, control: answer.control }) ?? null;
    if (!S.kindFitsType(kind, answer.type)) kind = null;

    let value = answer.value;
    if (value && (answer.type === 'phone' || kind === 'phone')) {
      value = parsePhone(value)?.e164 ?? value;
    }

    return kind === answer.kind && value === answer.value ? answer : { ...answer, kind, value };
  });

  const profile = { ...state.profile };
  if (profile.phone) profile.phone = parsePhone(profile.phone)?.e164 ?? profile.phone;

  return { ...state, answers, profile, version: S.STORAGE_VERSION };
}

async function load(): Promise<State> {
  const raw = await area.get(KEYS);
  const state = Object.assign(S.defaultState(), raw || {});
  state.settings = Object.assign(S.defaultSettings(), state.settings || {});
  state.profile = state.profile || {};
  state.history = Array.isArray(state.history) ? state.history : [];
  state.education = Array.isArray(state.education) ? state.education : [];
  state.skills = Array.isArray(state.skills) ? state.skills : [];
  state.skillYears = Array.isArray(state.skillYears) ? state.skillYears : [];
  state.references = Array.isArray(state.references) ? state.references : [];
  state.languages = Array.isArray(state.languages) ? state.languages : [];
  state.certifications = Array.isArray(state.certifications) ? state.certifications : [];
  state.stats = Object.assign({ filled: 0, learned: 0, applications: 0 }, state.stats || {});

  if (!Array.isArray(state.answers) || !raw || raw.answers === undefined) {
    state.answers = Array.isArray(state.answers) && state.answers.length ? state.answers : seedAnswers();
    await area.set({ answers: state.answers, version: S.STORAGE_VERSION, settings: state.settings });
  }

  if (state.version !== S.STORAGE_VERSION) {
    const repaired = repair(state);
    await area.set({ answers: repaired.answers, profile: repaired.profile, version: S.STORAGE_VERSION });
    return repaired;
  }

  return state;
}

async function patch(partial: Partial<State>): Promise<Partial<State>> {
  await area.set(partial);
  return partial;
}

async function getAnswers() { return (await load()).answers; }
async function getSettings() { return (await load()).settings; }

async function setSettings(update: Partial<Settings>): Promise<Settings> {
  const settings = Object.assign(await getSettings(), update);
  await patch({ settings });
  return settings;
}

async function upsertAnswer(input: Partial<Answer> & { question?: string }): Promise<Answer> {
  const state = await load();
  const answers = state.answers.slice();
  const index = input.id ? answers.findIndex((a) => a.id === input.id) : -1;

  if (index >= 0) {
    const merged = makeAnswer(Object.assign({}, answers[index], input));
    merged.createdAt = answers[index].createdAt;
    answers[index] = merged;
    await patch({ answers });
    return merged;
  }

  const created = makeAnswer(input);
  answers.push(created);
  await patch({ answers });
  return created;
}

async function deleteAnswer(id: string): Promise<void> {
  const state = await load();
  await patch({ answers: state.answers.filter((a) => a.id !== id) });
}

async function addAlias(answerId: string, phrase: string): Promise<Answer | null> {
  const state = await load();
  const answers = state.answers.slice();
  const index = answers.findIndex((a) => a.id === answerId);
  if (index < 0) return null;

  const answer = answers[index];
  const text = T.squish(phrase);
  if (!text) return answer;

  const known = new Set([T.normalize(answer.question), ...(answer.aliases || []).map(T.normalize)]);
  if (known.has(T.normalize(text))) return answer;

  answers[index] = Object.assign({}, answer, {
    aliases: (answer.aliases || []).concat(text),
    updatedAt: nowISO()
  });
  await patch({ answers, stats: Object.assign(state.stats, { learned: state.stats.learned + 1 }) });
  return answers[index];
}

async function addValueAlias(answerId: string, canonical: string, optionText: string): Promise<Answer | null> {
  const text = T.squish(optionText);
  const key = T.squish(canonical);
  if (!text || !key || T.normalize(text) === T.normalize(key)) return null;

  const state = await load();
  const answers = state.answers.slice();
  const index = answers.findIndex((a) => a.id === answerId);
  if (index < 0) return null;

  const answer = answers[index]!;
  const valueAliases: Record<string, string[]> = Object.assign({}, answer.valueAliases);
  const known = valueAliases[key] ?? [];
  if (known.some((alias) => T.normalize(alias) === T.normalize(text))) return answer;

  valueAliases[key] = known.concat(text);
  answers[index] = Object.assign({}, answer, { valueAliases, updatedAt: nowISO() });
  await patch({ answers });
  return answers[index]!;
}

async function recordUse(answerIds: string | string[]): Promise<void> {
  const ids = new Set<string>(Array.isArray(answerIds) ? answerIds : [answerIds].filter(Boolean));
  if (!ids.size) return;
  const state = await load();
  const when = nowISO();
  const answers = state.answers.map((a) => (ids.has(a.id)
    ? Object.assign({}, a, { usageCount: (a.usageCount || 0) + 1, lastUsedAt: when })
    : a));
  await patch({ answers, stats: Object.assign(state.stats, { filled: state.stats.filled + ids.size }) });
}

function deriveFromProfile(answers: Answer[], profile: Profile): void {
  const fill = (kind: string, value: string): void => {
    if (!value) return;
    const answer = answers.find((candidate) => candidate.kind === kind);
    if (!answer || answer.value) return;
    answer.value = value;
    answer.updatedAt = nowISO();
  };

  if (profile.country && isUnitedStates(profile.country)) fill('locatedInUS', 'Yes');

  const status = profile.workStatus ?? '';
  if (status) {
    const authorised = /citizen|permanent resident|green card|authorized/i.test(status);
    const sponsored = /sponsorship|h-?1b|f-?1\b|opt\b|cpt\b/i.test(status);
    if (authorised) fill('workAuthorization', 'Yes');
    if (sponsored) fill('sponsorship', 'Yes');
    else if (authorised) fill('sponsorship', 'No');
  }
}

async function setProfile(update: Profile): Promise<{ profile: Profile; answers: Answer[] }> {
  const state = await load();
  const profile = Object.assign({}, state.profile, update);
  for (const key of Object.keys(profile)) {
    if (profile[key] === '' || profile[key] == null) delete profile[key];
  }

  const answers = state.answers.slice();
  for (const field of S.PROFILE_FIELDS) {
    const value = profile[field.key];
    const index = answers.findIndex((a) => a.kind === field.key && a.source === 'profile');
    if (value == null || value === '') {
      if (index >= 0) answers.splice(index, 1);
      continue;
    }
    const base: Partial<Answer> & { question: string } = {
      kind: field.key,
      question: field.label,
      type: field.type,
      value: String(value),
      source: 'profile'
    };
    if (index >= 0) {
      answers[index] = makeAnswer(Object.assign({}, answers[index], { value: base.value }));
    } else {
      answers.push(makeAnswer(base));
    }
  }

  deriveFromProfile(answers, profile);

  await patch({ profile, answers });
  return { profile, answers };
}

async function setPendingReview(review: PendingReview | null): Promise<void> {
  await patch({ pendingReview: review });
}

async function getPendingReview(host?: string, maxAgeMinutes = 90): Promise<PendingReview | null> {
  const state = await load();
  const review = state.pendingReview;
  if (!review || !review.items.length) return null;

  const age = (Date.now() - new Date(review.capturedAt).getTime()) / 60000;
  if (age > maxAgeMinutes) {
    await setPendingReview(null);
    return null;
  }

  if (host && !(host === review.host || host.endsWith('.' + review.host) || review.host.endsWith('.' + host))) return null;
  return review;
}

async function applyReview(items: ReviewItem[]): Promise<{ created: number; updated: number; learned: number }> {
  const tally = { created: 0, updated: 0, learned: 0 };

  for (const item of items) {
    if (item.action === 'alias' && item.answerId) {
      await addAlias(item.answerId, item.question);
      tally.learned++;
      continue;
    }

    if (item.action === 'update' && item.answerId) {
      const target = (await load()).answers.find((answer) => answer.id === item.answerId);
      const value = target?.type === 'phone' ? parsePhone(item.value)?.e164 ?? item.value : item.value;

      await upsertAnswer({ id: item.answerId, value });
      await addAlias(item.answerId, item.question);

      if (target?.source === 'profile' && target.kind) await setProfile({ [target.kind]: value });
      tally.updated++;
      continue;
    }

    await upsertAnswer({
      question: item.question,
      value: item.type === 'phone' ? parsePhone(item.value)?.e164 ?? item.value : item.value,
      kind: item.kind,
      type: item.type,
      control: item.control,
      choices: item.choices,
      source: 'user'
    });
    tally.created++;
  }

  const state = await load();
  await patch({
    pendingReview: null,
    stats: Object.assign(state.stats, { applications: state.stats.applications + 1 })
  });
  return tally;
}

async function setHistory(history: WorkEntry[]): Promise<WorkEntry[]> {
  await patch({ history });
  return history;
}

async function setEducation(education: EducationEntry[]): Promise<EducationEntry[]> {
  await patch({ education });
  return education;
}

async function setRecords(update: Partial<Pick<State, 'references' | 'languages' | 'certifications' | 'skillYears'>>): Promise<void> {
  await patch(update);
}

async function setSkills(skills: string[]): Promise<string[]> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const skill of skills.map((value) => T.squish(value)).filter(Boolean)) {
    const key = T.normalize(skill);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(skill);
  }
  await patch({ skills: unique });
  return unique;
}

async function setResume(resume: ResumeRecord | null): Promise<ResumeRecord | null> {
  await patch({ resume });
  return resume;
}

async function setMaster(master: MasterResume | null): Promise<MasterResume | null> {
  await patch({ master });
  return master;
}

export interface ExportPayload extends Partial<Omit<State, 'resume'>> {
  exportedAt?: string;
  resume?: { name: string; text: string; parsedAt: string } | null;
}

async function exportAll(): Promise<ExportPayload> {
  const state = await load();
  return {
    exportedAt: nowISO(),
    version: S.STORAGE_VERSION,
    profile: state.profile,
    answers: state.answers,
    settings: state.settings,
    history: state.history,
    education: state.education,
    skills: state.skills,
    skillYears: state.skillYears,
    references: state.references,
    languages: state.languages,
    certifications: state.certifications,
    master: state.master
      ? { name: state.master.name, text: state.master.text, parsedAt: state.master.parsedAt }
      : null,
    resume: state.resume ? { name: state.resume.name, text: state.resume.text, parsedAt: state.resume.parsedAt } : null
  };
}

async function importAll(payload: ExportPayload, options?: { merge?: boolean }): Promise<{ answers: number }> {
  const merge = !options || options.merge !== false;
  const state = await load();
  const incoming = Array.isArray(payload.answers) ? payload.answers.map(makeAnswer) : [];

  let answers: Answer[];
  if (!merge) {
    answers = incoming;
  } else {
    answers = state.answers.slice();
    for (const candidate of incoming) {
      const existing = answers.find((a) => (a.kind && a.kind === candidate.kind)
        || T.normalize(a.question) === T.normalize(candidate.question));
      if (existing) {
        existing.value = candidate.value || existing.value;
        existing.aliases = dedupePhrases((existing.aliases || []).concat(candidate.aliases || []), existing.question);
        existing.updatedAt = nowISO();
      } else {
        answers.push(candidate);
      }
    }
  }

  const profile = merge ? Object.assign({}, state.profile, payload.profile || {}) : (payload.profile || {});
  const settings = Object.assign(S.defaultSettings(), merge ? state.settings : {}, payload.settings || {});

  const collection = <K extends 'history' | 'education' | 'skills' | 'skillYears' | 'references' | 'languages' | 'certifications'>(
    key: K
  ): State[K] => {
    const incoming = payload[key];
    if (Array.isArray(incoming) && incoming.length) return incoming as State[K];
    return (merge ? state[key] : ([] as unknown)) as State[K];
  };

  await patch({
    answers,
    profile,
    settings,
    master: payload.master ?? (merge ? state.master : null),
    history: collection('history'),
    education: collection('education'),
    skills: collection('skills'),
    skillYears: collection('skillYears'),
    references: collection('references'),
    languages: collection('languages'),
    certifications: collection('certifications')
  });
  return { answers: answers.length };
}

async function clearAll() {
  await area.clear();
  return load();
}

async function isHostDisabled(host: string): Promise<boolean> {
  const settings = await getSettings();
  return (settings.disabledHosts || []).some((h) => host === h || host.endsWith('.' + h));
}

async function setHostDisabled(host: string, disabled: boolean): Promise<Settings> {
  const settings = await getSettings();
  const set = new Set(settings.disabledHosts || []);
  if (disabled) set.add(host); else set.delete(host);
  return setSettings({ disabledHosts: [...set] });
}

export {
  KEYS, uid, makeAnswer, seedAnswers, load, patch, getAnswers, getSettings, setSettings,
  upsertAnswer, deleteAnswer, addAlias, addValueAlias, recordUse, setProfile, setResume,
  setPendingReview, getPendingReview, applyReview, setHistory, setEducation, setSkills, setRecords, setMaster,
  exportAll, importAll, clearAll, isHostDisabled, setHostDisabled
};
