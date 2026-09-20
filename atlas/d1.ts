import { BOARDS, COUNTS, GATED, GROUPS, INSERT, PUBLISHED, bindingsFor, withOptions } from './store.ts';
import type { AtlasRow, Board, Store, Totals } from './store.ts';
import type { Report } from '../src/shared/atlas.ts';

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

export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  async record(report: Report): Promise<number> {
    const statements = bindingsFor(report).map((values) => this.db.prepare(INSERT).bind(...values));
    const results = await this.db.batch(statements);
    return results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
  }

  async published(threshold: number): Promise<AtlasRow[]> {
    const { results } = await this.db.prepare(PUBLISHED).bind(threshold)
      .all<Omit<AtlasRow, 'options'> & { options: string }>();
    return withOptions(results);
  }

  async boards(threshold: number): Promise<Board[]> {
    const { results } = await this.db.prepare(BOARDS).bind(threshold).all<Board>();
    return results;
  }

  async totals(threshold: number): Promise<Totals> {
    const counts = await this.db.prepare(COUNTS).first<{ observations: number; boards: number; sessions: number }>();
    const gated = await this.db.prepare(GATED).bind(threshold).first<{ groups: number }>();
    const groups = await this.db.prepare(GROUPS).first<{ groups: number }>();

    return {
      observations: counts?.observations ?? 0,
      boards: counts?.boards ?? 0,
      sessions: counts?.sessions ?? 0,
      published: gated?.groups ?? 0,
      held: (groups?.groups ?? 0) - (gated?.groups ?? 0)
    };
  }
}
