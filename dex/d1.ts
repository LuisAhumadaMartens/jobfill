import { BOARDS, COUNTS, DECIDE, EVERYTHING, GATED, GROUPS, INSERT, PENDING, PUBLISHED, WAITING, bindingsFor, withOptions } from './store.ts';
import type { Board, EveryRow, PendingRow, QuestionRow, Reviewable, Totals, Verdict } from './store.ts';
import type { Report } from '../src/shared/dex.ts';

interface D1Result<T = unknown> {
  results: T[];
  meta: { changes?: number };
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}

export class D1Store implements Reviewable {
  constructor(private readonly db: D1Database) {}

  async record(report: Report): Promise<number> {
    const statements = bindingsFor(report).map((values) => this.db.prepare(INSERT).bind(...values));
    const results = await this.db.batch(statements);
    return results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
  }

  async published(threshold: number): Promise<QuestionRow[]> {
    const { results } = await this.db.prepare(PUBLISHED).bind(threshold)
      .all<Omit<QuestionRow, 'options'> & { options: string }>();
    return withOptions(results);
  }

  async boards(threshold: number): Promise<Board[]> {
    const { results } = await this.db.prepare(BOARDS).bind(threshold).all<Board>();
    return results;
  }

  async totals(threshold: number): Promise<Totals> {
    const counts = await this.db.prepare(COUNTS).first<{ observations: number; boards: number; sessions: number }>();
    const gated = await this.db.prepare(GATED).bind(threshold).first<{ groups: number }>();
    const waiting = await this.db.prepare(WAITING).bind(threshold).first<{ groups: number }>();
    const groups = await this.db.prepare(GROUPS).first<{ groups: number }>();

    return {
      observations: counts?.observations ?? 0,
      boards: counts?.boards ?? 0,
      sessions: counts?.sessions ?? 0,
      published: gated?.groups ?? 0,
      waiting: waiting?.groups ?? 0,
      held: (groups?.groups ?? 0) - (gated?.groups ?? 0) - (waiting?.groups ?? 0)
    };
  }

  async everything(): Promise<EveryRow[]> {
    const { results } = await this.db.prepare(EVERYTHING).all<Omit<EveryRow, 'options'> & { options: string }>();
    return results.map((row) => ({ ...row, options: JSON.parse(row.options) as string[] }));
  }

  async pending(threshold: number): Promise<PendingRow[]> {
    const { results } = await this.db.prepare(PENDING).bind(threshold)
      .all<Omit<PendingRow, 'options'> & { options: string }>();
    return results.map((row) => ({ ...row, options: JSON.parse(row.options) as string[] }));
  }

  async decide(questionKey: string, outcome: string, verdict: Verdict): Promise<void> {
    await this.db.prepare(DECIDE).bind(questionKey, outcome, verdict, new Date().toISOString()).run();
  }
}
