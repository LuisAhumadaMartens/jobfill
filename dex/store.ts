import type { Report } from '../src/shared/dex.ts';

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
  waiting: number;
  held: number;
  boards: number;
  sessions: number;
}

export interface PendingRow {
  questionKey: string;
  ats: string;
  question: string;
  control: string;
  outcome: string;
  options: string[];
  sessions: number;
  firstSeen: string;
}

export type Verdict = 'approved' | 'blocked';

export interface Store {
  record(report: Report): Promise<number>;
  published(threshold: number): Promise<QuestionRow[]>;
  boards(threshold: number): Promise<Board[]>;
  totals(threshold: number): Promise<Totals>;
}

export interface Reviewable extends Store {
  pending(threshold: number): Promise<PendingRow[]>;
  decide(questionKey: string, outcome: string, verdict: Verdict): Promise<void>;
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
    o.ats as ats, o.question as question, o.control as control, o.outcome as outcome,
    o.kind as kind, o.options as options,
    count(distinct o.session) as sessions,
    count(*) as reports,
    min(o.day) as firstSeen,
    max(o.day) as lastSeen
  from observation o
  join decision d on d.question_key = o.question_key and d.outcome = o.outcome
  where d.verdict = 'approved'
  group by o.question_key, o.outcome
  having count(distinct o.session) >= ?
  order by sessions desc, question asc
`;

export const PENDING = `
  select
    o.question_key as questionKey, o.ats as ats, o.question as question,
    o.control as control, o.outcome as outcome, o.options as options,
    count(distinct o.session) as sessions,
    min(o.day) as firstSeen
  from observation o
  where not exists (
    select 1 from decision d where d.question_key = o.question_key and d.outcome = o.outcome
  )
  group by o.question_key, o.outcome
  having count(distinct o.session) >= ?
  order by sessions desc, question asc
`;

export const DECIDE = `
  insert into decision (question_key, outcome, verdict, decided_at)
  values (?, ?, ?, ?)
  on conflict (question_key, outcome) do update set verdict = excluded.verdict, decided_at = excluded.decided_at
`;

export const BOARDS = `
  select ats, count(*) as questions, sum(sessions) as sessions from (
    select o.ats as ats, o.question_key as question_key, count(distinct o.session) as sessions
    from observation o
    join decision d on d.question_key = o.question_key and d.outcome = o.outcome
    where d.verdict = 'approved'
    group by o.ats, o.question_key
    having count(distinct o.session) >= ?
  ) group by ats order by questions desc
`;

export const COUNTS = `
  select count(*) as observations, count(distinct ats) as boards, count(distinct session) as sessions
  from observation
`;

export const GATED = `
  select count(*) as groups from (
    select o.question_key as question_key, count(distinct o.session) as sessions
    from observation o
    join decision d on d.question_key = o.question_key and d.outcome = o.outcome
    where d.verdict = 'approved'
    group by o.question_key, o.outcome
  ) where sessions >= ?
`;

export const WAITING = `
  select count(*) as groups from (
    select o.question_key as question_key, count(distinct o.session) as sessions
    from observation o
    where not exists (
      select 1 from decision d where d.question_key = o.question_key and d.outcome = o.outcome
    )
    group by o.question_key, o.outcome
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
