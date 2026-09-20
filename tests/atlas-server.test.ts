import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { Atlas, questionKey } from '../atlas/db.ts';
import { RateLimit } from '../atlas/limit.ts';
import { ATLAS_SCHEMA, type Observation, type Report } from '../src/shared/atlas.ts';

const DB = `/tmp/atlas-test-${crypto.randomUUID()}.sqlite`;
let atlas: Atlas;

function observation(over: Partial<Observation> = {}): Observation {
  return {
    ats: 'greenhouse.io', control: 'select', question: 'What are your compensation expectations?',
    options: ['Yes', 'No'], outcome: 'unmatched', kind: null, confidence: 0.4, ...over
  };
}

function report(session: string, observations: Observation[]): Report {
  return { schema: ATLAS_SCHEMA, session, day: '2026-09-19', version: '0.1.5', observations };
}

function session(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

beforeAll(() => { atlas = new Atlas(DB); });
afterAll(() => { atlas.close(); try { unlinkSync(DB); } catch {} });

describe('recording reports', () => {
  test('a report is stored and counted', () => {
    expect(atlas.record(report(session(), [observation()]))).toBe(1);
  });

  test('one session cannot inflate the count by sending twice', () => {
    const token = session();
    const same = report(token, [observation({ question: 'Why do you want to join us?' })]);
    expect(atlas.record(same)).toBe(1);
    expect(atlas.record(same)).toBe(0);
  });

  test('a question is held back until enough separate sessions have seen it', () => {
    const question = 'Do you have experience leading a team?';
    const published = () => atlas.published(5).filter((row) => row.question === question);

    for (let count = 1; count < 5; count += 1) {
      atlas.record(report(session(), [observation({ question })]));
      expect(published()).toHaveLength(0);
    }

    atlas.record(report(session(), [observation({ question })]));
    expect(published()).toHaveLength(1);
    expect(published()[0].sessions).toBe(5);
  });

  test('the same question on two boards is kept apart', () => {
    expect(questionKey('greenhouse.io', 'Why us?')).not.toBe(questionKey('lever.co', 'Why us?'));
  });

  test('wording that differs only by spacing is folded together', () => {
    expect(questionKey('greenhouse.io', '  Why   US?  ')).toBe(questionKey('greenhouse.io', 'Why us?'));
  });

  test('totals separate what is published from what is held', () => {
    const totals = atlas.totals(5);
    expect(totals.published).toBeGreaterThan(0);
    expect(totals.held).toBeGreaterThan(0);
    expect(totals.observations).toBeGreaterThan(totals.published);
  });
});

describe('the ingest endpoint', () => {
  let app: { handle: (request: Request) => Promise<Response> };

  beforeAll(async () => {
    Bun.env.ATLAS_DB = `/tmp/atlas-http-${crypto.randomUUID()}.sqlite`;
    Bun.env.ATLAS_THRESHOLD = '2';
    Bun.env.ATLAS_RATE = '500';
    app = (await import('../atlas/server.ts')).app;
  });

  const post = (body: unknown, raw?: string) => app.handle(new Request('http://atlas.test/v1/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body)
  }));

  const get = (path: string) => app.handle(new Request(`http://atlas.test${path}`));

  test('a valid report is accepted', async () => {
    const response = await post(report(session(), [observation()]));
    expect(response.status).toBe(202);
    expect((await response.json()).accepted).toBe(1);
  });

  test('a report carrying an answer is refused, not quietly trimmed', async () => {
    const response = await post({ ...report(session(), [observation()]), answer: 'Yes' });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('answer');
  });

  test('a report from an unknown site is refused', async () => {
    expect((await post(report(session(), [observation({ ats: 'evil.example.com' })]))).status).toBe(422);
  });

  test('a demographic question is refused at the door as well as in the client', async () => {
    expect((await post(report(session(), [observation({ question: 'What is your gender identity?' })]))).status).toBe(422);
  });

  test('a body that is not JSON is refused', async () => {
    expect((await post(null, 'not json')).status).toBe(400);
  });

  test('the published feed carries counts of sessions but never a token', async () => {
    const token = session();
    await post(report(token, [observation({ question: 'Which timezone do you work from?' })]));

    const body = await (await get('/v1/atlas')).text();
    expect(body).not.toContain(token);
    expect(/[0-9a-f]{32}/.test(body)).toBe(false);
    expect(JSON.parse(body).totals.sessions).toBeGreaterThan(0);
    expect(JSON.parse(body).threshold).toBe(2);
  });

  test('the csv is the same gated view and leaks no token either', async () => {
    const token = session();
    await post(report(token, [observation({ question: 'Which timezone do you work from?' })]));

    const response = await get('/v1/atlas.csv');
    expect(response.headers.get('content-type')).toContain('text/csv');

    const body = await response.text();
    expect(body).not.toContain(token);
    expect(/[0-9a-f]{32}/.test(body)).toBe(false);
    expect(body).toContain('Which timezone do you work from?');
  });

  test('the dashboard renders and says what is never collected', async () => {
    const page = await (await get('/')).text();
    expect(page).toContain('JobFill Atlas');
    expect(page).toContain('Never collected');
  });
});

describe('rate limiting', () => {
  test('a caller is cut off after its budget and recovers in the next window', () => {
    const limit = new RateLimit(3);
    const now = Date.now();
    expect([1, 2, 3].every(() => limit.take('1.2.3.4', now))).toBe(true);
    expect(limit.take('1.2.3.4', now)).toBe(false);
    expect(limit.take('5.6.7.8', now)).toBe(true);
    expect(limit.take('1.2.3.4', now + 61_000)).toBe(true);
  });
});
