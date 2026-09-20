import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARDS, COUNTS, DECIDE, EVERYTHING, GATED, GROUPS, INSERT, PENDING, PUBLISHED, WAITING, bindingsFor, withOptions } from './store.ts';
import type { Board, EveryRow, PendingRow, QuestionRow, Reviewable, Totals, Verdict } from './store.ts';
import type { Report } from '../src/shared/dex.ts';

export class SqliteStore implements Reviewable {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec('pragma journal_mode = WAL');
    this.db.exec('pragma busy_timeout = 5000');
    this.db.exec(readFileSync(join(import.meta.dir, 'schema.sql'), 'utf8'));
  }

  close(): void {
    this.db.close();
  }

  async record(report: Report): Promise<number> {
    const insert = this.db.prepare(INSERT);
    const write = this.db.transaction((rows: unknown[][]) => {
      let stored = 0;
      for (const values of rows) stored += insert.run(...(values as never[])).changes;
      return stored;
    });
    return write(bindingsFor(report));
  }

  async published(threshold: number): Promise<QuestionRow[]> {
    return withOptions(this.db.prepare(PUBLISHED)
      .all(threshold) as Array<Omit<QuestionRow, 'options'> & { options: string }>);
  }

  async boards(threshold: number): Promise<Board[]> {
    return this.db.prepare(BOARDS).all(threshold) as Board[];
  }

  async totals(threshold: number): Promise<Totals> {
    const counts = this.db.prepare(COUNTS).get() as { observations: number; boards: number; sessions: number };
    const gated = this.db.prepare(GATED).get(threshold) as { groups: number };
    const waiting = this.db.prepare(WAITING).get(threshold) as { groups: number };
    const groups = this.db.prepare(GROUPS).get() as { groups: number };

    return {
      ...counts,
      published: gated.groups,
      waiting: waiting.groups,
      held: groups.groups - gated.groups - waiting.groups
    };
  }

  async everything(): Promise<EveryRow[]> {
    const rows = this.db.prepare(EVERYTHING).all() as Array<Omit<EveryRow, 'options'> & { options: string }>;
    return rows.map((row) => ({ ...row, options: JSON.parse(row.options) as string[] }));
  }

  async pending(threshold: number): Promise<PendingRow[]> {
    const rows = this.db.prepare(PENDING).all(threshold) as Array<Omit<PendingRow, 'options'> & { options: string }>;
    return rows.map((row) => ({ ...row, options: JSON.parse(row.options) as string[] }));
  }

  async decide(questionKey: string, outcome: string, verdict: Verdict): Promise<void> {
    this.db.prepare(DECIDE).run(questionKey, outcome, verdict, new Date().toISOString());
  }
}
