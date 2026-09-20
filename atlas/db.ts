import { Database } from 'bun:sqlite';
import type { Observation, Report } from '../src/shared/atlas.ts';

export interface AtlasRow {
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

export interface Totals {
  observations: number;
  published: number;
  held: number;
  boards: number;
  sessions: number;
}

const SCHEMA = `
  create table if not exists observation (
    id integer primary key autoincrement,
    day text not null,
    ats text not null,
    control text not null,
    question text not null,
    question_key text not null,
    options text not null,
    outcome text not null,
    kind text,
    confidence real,
    session text not null,
    version text not null
  );

  create index if not exists observation_question on observation (question_key);
  create index if not exists observation_ats on observation (ats);
  create unique index if not exists observation_once on observation (session, question_key, outcome);
`;

export function questionKey(ats: string, question: string): string {
  return `${ats}|${question.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

export class Atlas {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec('pragma journal_mode = WAL');
    this.db.exec('pragma busy_timeout = 5000');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  record(report: Report): number {
    const insert = this.db.prepare(`
      insert or ignore into observation
        (day, ats, control, question, question_key, options, outcome, kind, confidence, session, version)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const write = this.db.transaction((observations: Observation[]) => {
      let stored = 0;
      for (const observation of observations) {
        const result = insert.run(
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
        );
        stored += result.changes;
      }
      return stored;
    });

    return write(report.observations);
  }

  published(threshold: number): AtlasRow[] {
    const rows = this.db.prepare(`
      select
        ats,
        question,
        control,
        outcome,
        kind,
        options,
        count(distinct session) as sessions,
        count(*) as reports,
        min(day) as firstSeen,
        max(day) as lastSeen
      from observation
      group by question_key, outcome
      having count(distinct session) >= ?
      order by sessions desc, question asc
    `).all(threshold) as Array<Omit<AtlasRow, 'options'> & { options: string }>;

    return rows.map((row) => ({ ...row, options: JSON.parse(row.options) as string[] }));
  }

  boards(threshold: number): Array<{ ats: string; questions: number; sessions: number }> {
    return this.db.prepare(`
      select ats, count(*) as questions, sum(sessions) as sessions from (
        select ats, question_key, count(distinct session) as sessions
        from observation group by ats, question_key having count(distinct session) >= ?
      ) group by ats order by questions desc
    `).all(threshold) as Array<{ ats: string; questions: number; sessions: number }>;
  }

  totals(threshold: number): Totals {
    const counts = this.db.prepare(`
      select
        count(*) as observations,
        count(distinct ats) as boards,
        count(distinct session) as sessions
      from observation
    `).get() as { observations: number; boards: number; sessions: number };

    const gated = this.db.prepare(`
      select count(*) as groups from (
        select question_key, outcome, count(distinct session) as sessions
        from observation group by question_key, outcome
      ) where sessions >= ?
    `).get(threshold) as { groups: number };

    const all = this.db.prepare(`
      select count(*) as groups from (select question_key, outcome from observation group by question_key, outcome)
    `).get() as { groups: number };

    return {
      observations: counts.observations,
      boards: counts.boards,
      sessions: counts.sessions,
      published: gated.groups,
      held: all.groups - gated.groups
    };
  }
}
