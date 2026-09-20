import { describe, expect, test } from 'bun:test';
import { D1Store, type D1Database } from '../atlas/d1.ts';
import { questionKey } from '../atlas/store.ts';
import { ATLAS_SCHEMA, type Observation, type Report } from '../src/shared/atlas.ts';

interface Call {
  query: string;
  values: unknown[];
}

function fakeD1(plan: { changes?: number[]; rows?: unknown[]; first?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  let index = 0;

  const statement = (query: string, values: unknown[] = []): ReturnType<D1Database['prepare']> => ({
    bind: (...next: unknown[]) => statement(query, next),
    all: async () => {
      calls.push({ query, values });
      return { results: (plan.rows ?? []) as never[], meta: {} };
    },
    first: async () => {
      calls.push({ query, values });
      return (plan.first ?? null) as never;
    },
    run: async () => {
      calls.push({ query, values });
      return { results: [], meta: { changes: plan.changes?.[index++] ?? 1 } };
    }
  });

  const db: D1Database = {
    prepare: (query) => statement(query),
    batch: async (statements) => {
      const results = [];
      for (const each of statements) results.push(await each.run());
      return results;
    }
  };

  return { db, calls };
}

function observation(over: Partial<Observation> = {}): Observation {
  return {
    ats: 'greenhouse.io', control: 'select', question: 'What are your compensation expectations?',
    options: ['Yes', 'No'], outcome: 'unmatched', kind: null, confidence: 0.4, ...over
  };
}

function report(observations: Observation[]): Report {
  return { schema: ATLAS_SCHEMA, session: 'a'.repeat(32), day: '2026-09-19', version: '0.1.5', observations };
}

describe('the D1 store', () => {
  test('a report is written as one batch, not one round trip per row', async () => {
    const { db, calls } = fakeD1();
    const batches: number[] = [];
    const wrapped: D1Database = { prepare: db.prepare, batch: async (s) => { batches.push(s.length); return db.batch(s); } };

    await new D1Store(wrapped).record(report([observation(), observation({ question: 'Why us, in your own words?' })]));

    expect(batches).toEqual([2]);
    expect(calls).toHaveLength(2);
  });

  test('the count returned is what D1 actually changed, not what was offered', async () => {
    const { db } = fakeD1({ changes: [1, 0] });
    const stored = await new D1Store(db).record(report([observation(), observation({ question: 'Why us, in your own words?' })]));
    expect(stored).toBe(1);
  });

  test('the bound values carry the question key and never the raw options array', async () => {
    const { db, calls } = fakeD1();
    await new D1Store(db).record(report([observation()]));

    const values = calls[0]!.values;
    expect(values).toContain(questionKey('greenhouse.io', 'What are your compensation expectations?'));
    expect(values).toContain(JSON.stringify(['Yes', 'No']));
    expect(values).toContain('a'.repeat(32));
  });

  test('published rows come back with options parsed out of their column', async () => {
    const { db } = fakeD1({
      rows: [{ ats: 'lever.co', question: 'Why us?', control: 'select', outcome: 'unmatched', kind: null,
               options: '["Yes","No"]', sessions: 7, reports: 9, firstSeen: '2026-09-01', lastSeen: '2026-09-19' }]
    });

    const [row] = await new D1Store(db).published(5);
    expect(row!.options).toEqual(['Yes', 'No']);
    expect(row!.sessions).toBe(7);
  });

  test('the threshold is bound to the query rather than pasted into it', async () => {
    const { db, calls } = fakeD1({ rows: [] });
    await new D1Store(db).published(5);
    expect(calls[0]!.values).toEqual([5]);
    expect(calls[0]!.query).not.toContain('5');
  });

  test('totals survive an empty database instead of returning NaN', async () => {
    const { db } = fakeD1({ first: undefined });
    const totals = await new D1Store(db).totals(5);
    expect(totals).toEqual({ observations: 0, boards: 0, sessions: 0, published: 0, held: 0 });
  });
});
