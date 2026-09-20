import { ATS_HOSTS } from '../lib/sites.ts';

export const REPORT_SCHEMA = 1;

export type QuestionControl =
  | 'input' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'combobox' | 'contenteditable';

export type QuestionOutcome = 'unmatched' | 'unsure' | 'no-option' | 'cleared' | 'replaced';

export interface Observation {
  ats: string;
  control: QuestionControl;
  question: string;
  options: string[];
  outcome: QuestionOutcome;
  kind: string | null;
  confidence: number | null;
}

export interface Report {
  schema: number;
  session: string;
  day: string;
  version: string;
  observations: Observation[];
}

export const LIMITS = {
  question: { min: 8, max: 300 },
  option: { min: 1, max: 120 },
  options: 60,
  observations: 50,
  kind: 40
} as const;

const CONTROLS: ReadonlySet<string> = new Set<QuestionControl>([
  'input', 'textarea', 'select', 'radio', 'checkbox', 'combobox', 'contenteditable'
]);

const OUTCOMES: ReadonlySet<string> = new Set<QuestionOutcome>([
  'unmatched', 'unsure', 'no-option', 'cleared', 'replaced'
]);

const PERSONAL = [
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  /\+?\d[\d\s().-]{7,}\d/,
  /\d{6,}/,
  /\bhttps?:\/\//i,
  /\bwww\./i,
  /(?:^|\s)@[\w.-]{2,}/
];

const PROTECTED = [
  /\b(race|races|racial|ethnic|ethnicity)\b/i,
  /\b(gender|genders|sex|male|female|non-?binary)\b/i,
  /\b(pronoun|pronouns)\b/i,
  /\b(sexual orientation|lgbt|lgbtq|queer|transgender)\b/i,
  /\b(veteran|military service|protected veteran)\b/i,
  /\b(disabilit(?:y|ies)|disabled|impairment)\b/i,
  /\b(religion|religious)\b/i,
  /\b(marital status|married|single)\b/i,
  /\b(date of birth|birth date|age range|how old)\b/i,
  /\b(national origin|ancestry)\b/i
];

export function isProtectedQuestion(question: string): boolean {
  return PROTECTED.some((pattern) => pattern.test(question));
}

export function holdsPersonalData(text: string): boolean {
  return PERSONAL.some((pattern) => pattern.test(text));
}

export function isCollectable(question: string): boolean {
  const trimmed = question.trim();
  if (trimmed.length < LIMITS.question.min || trimmed.length > LIMITS.question.max) return false;
  if (isProtectedQuestion(trimmed)) return false;
  if (holdsPersonalData(trimmed)) return false;
  return true;
}

type Check<T> = { ok: true; value: T } | { ok: false; reason: string };

function fail<T>(reason: string): Check<T> {
  return { ok: false, reason };
}

const KEYS_REPORT = ['schema', 'session', 'day', 'version', 'observations'];
const KEYS_OBSERVATION = ['ats', 'control', 'question', 'options', 'outcome', 'kind', 'confidence'];

function onlyKeys(value: Record<string, unknown>, allowed: string[], where: string): string | null {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  return extra ? `${where} has an unexpected field: ${extra}` : null;
}

export function validateObservation(input: unknown): Check<Observation> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('observation is not an object');
  const value = input as Record<string, unknown>;

  const extra = onlyKeys(value, KEYS_OBSERVATION, 'observation');
  if (extra) return fail(extra);

  if (typeof value.ats !== 'string' || !ATS_HOSTS.includes(value.ats)) return fail('ats is not a known job board');
  if (typeof value.control !== 'string' || !CONTROLS.has(value.control)) return fail('control is not a known kind');
  if (typeof value.outcome !== 'string' || !OUTCOMES.has(value.outcome)) return fail('outcome is not a known kind');

  if (typeof value.question !== 'string') return fail('question is not a string');
  const question = value.question.trim();
  if (!isCollectable(question)) return fail('question cannot be collected');

  if (!Array.isArray(value.options)) return fail('options is not an array');
  if (value.options.length > LIMITS.options) return fail('too many options');
  const options: string[] = [];
  for (const option of value.options) {
    if (typeof option !== 'string') return fail('an option is not a string');
    const text = option.trim();
    if (text.length < LIMITS.option.min || text.length > LIMITS.option.max) return fail('an option is the wrong length');
    if (holdsPersonalData(text)) return fail('an option holds personal data');
    options.push(text);
  }

  if (value.kind !== null && (typeof value.kind !== 'string' || !/^[a-z][a-zA-Z0-9]{0,39}$/.test(value.kind))) {
    return fail('kind is not a plain key');
  }

  if (value.confidence !== null) {
    if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)) return fail('confidence is not a number');
    if (value.confidence < 0 || value.confidence > 1) return fail('confidence is out of range');
  }

  return {
    ok: true,
    value: {
      ats: value.ats,
      control: value.control as QuestionControl,
      question,
      options,
      outcome: value.outcome as QuestionOutcome,
      kind: value.kind as string | null,
      confidence: value.confidence === null ? null : Math.round((value.confidence as number) * 1000) / 1000
    }
  };
}

export function validateReport(input: unknown): Check<Report> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('report is not an object');
  const value = input as Record<string, unknown>;

  const extra = onlyKeys(value, KEYS_REPORT, 'report');
  if (extra) return fail(extra);

  if (value.schema !== REPORT_SCHEMA) return fail('report is not this schema');
  if (typeof value.session !== 'string' || !/^[0-9a-f]{32}$/.test(value.session)) return fail('session is not a token');
  if (typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)) return fail('day is not a date');
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version)) return fail('version is not a version');

  if (!Array.isArray(value.observations)) return fail('observations is not an array');
  if (!value.observations.length) return fail('report is empty');
  if (value.observations.length > LIMITS.observations) return fail('too many observations');

  const observations: Observation[] = [];
  for (const entry of value.observations) {
    const checked = validateObservation(entry);
    if (!checked.ok) return fail(checked.reason);
    observations.push(checked.value);
  }

  return { ok: true, value: { schema: REPORT_SCHEMA, session: value.session, day: value.day, version: value.version, observations } };
}
