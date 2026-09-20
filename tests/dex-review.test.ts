import { describe, expect, test } from 'bun:test';
import { chosen, decideStatement, quote } from '../dex/review.ts';
import type { PendingRow } from '../dex/store.ts';

function looseQuotes(sql: string): number {
  return (sql.replace(/''/g, '').match(/'/g) ?? []).length;
}

function row(over: Partial<PendingRow> = {}): PendingRow {
  return {
    questionKey: "greenhouse.io|why us?",
    ats: 'greenhouse.io',
    question: 'Why us?',
    control: 'textarea',
    outcome: 'unmatched',
    options: [],
    sessions: 6,
    firstSeen: '2026-09-20',
    ...over
  };
}

describe('quoting a value for SQL', () => {
  test('a plain value is wrapped', () => {
    expect(quote('greenhouse.io')).toBe("'greenhouse.io'");
  });

  test('an apostrophe is doubled rather than left to close the string', () => {
    expect(quote("what's your notice period?")).toBe("'what''s your notice period?'");
  });

  test('an attempt to end the statement early leaves no loose quote', () => {
    const hostile = "x'; drop table observation; --";
    expect(quote(hostile)).toBe("'x''; drop table observation; --'");
    expect(looseQuotes(quote(hostile))).toBe(2);
  });
});

describe('building the decision statement', () => {
  test('the verdict and key are bound into the insert', () => {
    const statement = decideStatement(row(), 'approved', '2026-09-20T00:00:00.000Z');
    expect(statement).toContain("'greenhouse.io|why us?'");
    expect(statement).toContain("'approved'");
    expect(statement).not.toContain('values (?, ?, ?, ?)');
  });

  test('a hostile question key cannot break out of its quotes', () => {
    const statement = decideStatement(
      row({ questionKey: "greenhouse.io|'); delete from observation; --" }),
      'approved',
      '2026-09-20T00:00:00.000Z'
    );
    expect(looseQuotes(statement)).toBe(8);
    expect(statement).toContain("''); delete from observation");
  });
});

describe('picking what to act on', () => {
  const rows = [row({ question: 'One' }), row({ question: 'Two' }), row({ question: 'Three' })];

  test('all means all', () => {
    expect(chosen(rows, 'all')).toHaveLength(3);
  });

  test('numbers are one based and in the order shown', () => {
    expect(chosen(rows, '1,3').map((r) => r.question)).toEqual(['One', 'Three']);
  });

  test('anything out of range is ignored rather than wrapping around', () => {
    expect(chosen(rows, '0,4,99')).toEqual([]);
    expect(chosen(rows, '2,nonsense').map((r) => r.question)).toEqual(['Two']);
  });
});
