import type { Report } from '../src/shared/questions.ts';

export interface QuestionRow {
  ats: string;
  question: string;
  control: string;
  outcome: string;
  kind: string | null;
  options: string[];
  sessions: number;
  reports: number;
  firstSeen: string;
  lastSeen: string;
}

export interface Board {
  ats: string;
  questions: number;
  sessions: number;
}

export interface Totals {
  observations: number;
  published: number;
  held: number;
  boards: number;
  sessions: number;
}

export interface Store {
  record(report: Report): Promise<number>;
  published(threshold: number): Promise<QuestionRow[]>;
  boards(threshold: number): Promise<Board[]>;
  totals(threshold: number): Promise<Totals>;
}

export function questionKey(ats: string, question: string): string {
  return `${ats}|${question.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

export const INSERT = `
  insert or ignore into observation
    (day, ats, control, question, question_key, options, outcome, kind, confidence, session, version)
  values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const PUBLISHED = `
  select
    ats, question, control, outcome, kind, options,
    count(distinct session) as sessions,
    count(*) as reports,
    min(day) as firstSeen,
    max(day) as lastSeen
  from observation
  group by question_key, outcome
  having count(distinct session) >= ?
  order by sessions desc, question asc
`;

export const BOARDS = `
  select ats, count(*) as questions, sum(sessions) as sessions from (
    select ats, question_key, count(distinct session) as sessions
    from observation group by ats, question_key having count(distinct session) >= ?
  ) group by ats order by questions desc
`;

export const COUNTS = `
  select count(*) as observations, count(distinct ats) as boards, count(distinct session) as sessions
  from observation
`;

export const GATED = `
  select count(*) as groups from (
    select question_key, outcome, count(distinct session) as sessions
    from observation group by question_key, outcome
  ) where sessions >= ?
`;

export const GROUPS = `
  select count(*) as groups from (select question_key, outcome from observation group by question_key, outcome)
`;

export function bindingsFor(report: Report): unknown[][] {
  return report.observations.map((observation) => [
    report.day,
    observation.ats,
    observation.control,
    observation.question,
    questionKey(observation.ats, observation.question),
    JSON.stringify(observation.options),
    observation.outcome,
    observation.kind,
    observation.confidence,
    report.session,
    report.version
  ]);
}

export function withOptions(rows: Array<Omit<QuestionRow, 'options'> & { options: string }>): QuestionRow[] {
  return rows.map((row) => ({ ...row, options: JSON.parse(row.options) as string[] }));
}
