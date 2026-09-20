import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { routes } from '../dex/routes.ts';
import { SqliteStore } from '../dex/sqlite.ts';
import { questionKey } from '../dex/store.ts';
import type { QuestionRow } from '../dex/store.ts';
import { RateLimit } from '../dex/limit.ts';
import { REPORT_SCHEMA, type Observation, type Report } from '../src/shared/dex.ts';

const DB = `/tmp/dex-test-${crypto.randomUUID()}.sqlite`;
let store: SqliteStore;

function observation(over: Partial<Observation> = {}): Observation {
  return {
    ats: 'greenhouse.io', control: 'select', question: 'What are your compensation expectations?',
    options: ['Yes', 'No'], outcome: 'unmatched', kind: null, confidence: 0.4, ...over
  };
}

function report(session: string, observations: Observation[]): Report {
  return { schema: REPORT_SCHEMA, session, day: '2026-09-19', version: '0.1.5', observations };
}

function session(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

beforeAll(() => { store = new SqliteStore(DB); });
afterAll(() => { store.close(); try { unlinkSync(DB); } catch {} });

describe('recording reports', () => {
  test('a report is stored and counted', async () => {
    expect(await store.record(report(session(), [observation()]))).toBe(1);
  });

  test('one session cannot inflate the count by sending twice', async () => {
    const token = session();
    const same = report(token, [observation({ question: 'Why do you want to join us?' })]);
    expect(await store.record(same)).toBe(1);
    expect(await store.record(same)).toBe(0);
  });

  test('a question is not even offered for review until enough separate sessions have seen it', async () => {
    const question = 'Do you have experience leading a team?';
    const waiting = async () => (await store.pending(5)).filter((row) => row.question === question);

    for (let count = 1; count < 5; count += 1) {
      await store.record(report(session(), [observation({ question })]));
      expect(await waiting()).toHaveLength(0);
    }

    await store.record(report(session(), [observation({ question })]));
    expect(await waiting()).toHaveLength(1);
  });

  test('reaching the threshold publishes nothing on its own', async () => {
    const question = 'Which of our products have you used?';
    for (let count = 0; count < 6; count += 1) {
      await store.record(report(session(), [observation({ question })]));
    }

    expect((await store.published(5)).filter((row) => row.question === question)).toHaveLength(0);
    expect((await store.pending(5)).filter((row) => row.question === question)).toHaveLength(1);
  });

  test('a question reaches the page only once a person approves it', async () => {
    const question = 'How many years have you written TypeScript?';
    for (let count = 0; count < 6; count += 1) {
      await store.record(report(session(), [observation({ question })]));
    }

    const [pending] = (await store.pending(5)).filter((row) => row.question === question);
    await store.decide(pending!.questionKey, pending!.outcome, 'approved');

    const rows = (await store.published(5)).filter((row) => row.question === question);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sessions).toBe(6);
    expect((await store.pending(5)).filter((row) => row.question === question)).toHaveLength(0);
  });

  test('a blocked question never appears, however many people report it', async () => {
    const question = 'Describe a time you disagreed with a manager.';
    for (let count = 0; count < 6; count += 1) {
      await store.record(report(session(), [observation({ question })]));
    }

    const [pending] = (await store.pending(5)).filter((row) => row.question === question);
    await store.decide(pending!.questionKey, pending!.outcome, 'blocked');

    for (let count = 0; count < 20; count += 1) {
      await store.record(report(session(), [observation({ question })]));
    }

    expect((await store.published(5)).filter((row) => row.question === question)).toHaveLength(0);
    expect((await store.pending(5)).filter((row) => row.question === question)).toHaveLength(0);
  });

  test('the same question on two boards is kept apart', () => {
    expect(questionKey('greenhouse.io', 'Why us?')).not.toBe(questionKey('lever.co', 'Why us?'));
  });

  test('wording that differs only by spacing is folded together', () => {
    expect(questionKey('greenhouse.io', '  Why   US?  ')).toBe(questionKey('greenhouse.io', 'Why us?'));
  });

  test('totals tell apart published, waiting on review, and below the threshold', async () => {
    const totals = await store.totals(5);
    expect(totals.published).toBeGreaterThan(0);
    expect(totals.waiting).toBeGreaterThan(0);
    expect(totals.held).toBeGreaterThan(0);
    expect(totals.observations).toBeGreaterThan(totals.published);
  });
});

describe('the ingest endpoint', () => {
  let app: { handle: (request: Request) => Promise<Response> };

  beforeAll(async () => {
    Bun.env.DEX_DB = `/tmp/dex-http-${crypto.randomUUID()}.sqlite`;
    Bun.env.DEX_THRESHOLD = '2';
    Bun.env.DEX_RATE = '500';
    app = (await import('../dex/server.ts')).app;
  });

  const post = (body: unknown, raw?: string) => app.handle(new Request('http://questions.test/v1/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body)
  }));

  const get = (path: string) => app.handle(new Request(`http://questions.test${path}`));

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

    const body = await (await get('/v1/dex')).text();
    expect(body).not.toContain(token);
    expect(/[0-9a-f]{32}/.test(body)).toBe(false);
    expect(JSON.parse(body).totals.sessions).toBeGreaterThan(0);
    expect(JSON.parse(body).threshold).toBe(2);
  });

  test('the csv is the same gated view and leaks no token either', async () => {
    const token = session();
    await post(report(token, [observation({ question: 'Which timezone do you work from?' })]));

    const response = await get('/v1/dex.csv');
    expect(response.headers.get('content-type')).toContain('text/csv');

    const body = await response.text();
    expect(body).not.toContain(token);
    expect(/[0-9a-f]{32}/.test(body)).toBe(false);
    expect(body).not.toContain('Which timezone do you work from?');
  });

  test('the dashboard renders and says what is never collected', async () => {
    const page = await (await get('/')).text();
    expect(page).toContain('JobFill Dex');
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

describe('staying out of search results', () => {
  let app: { handle: (request: Request) => Promise<Response> };

  beforeAll(async () => {
    app = (await import('../dex/routes.ts')).routes({
      store: new SqliteStore(`/tmp/dex-robots-${crypto.randomUUID()}.sqlite`),
      threshold: 5,
      perMinute: 100
    }) as unknown as typeof app;
  });

  const get = (path: string) => app.handle(new Request(`http://dex.test${path}`));

  test('robots.txt tells crawlers to stay out entirely', async () => {
    const response = await get('/robots.txt');
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain('Disallow: /');
  });

  test('every response carries the noindex header, not just the pages', async () => {
    for (const path of ['/', '/healthz', '/v1/dex', '/v1/dex.csv']) {
      const response = await get(path);
      expect({ path, robots: response.headers.get('x-robots-tag') })
        .toEqual({ path, robots: 'noindex, nofollow' });
    }
  });
});

describe('what the edge is allowed to keep', () => {
  let app: { handle: (request: Request) => Promise<Response> };

  beforeAll(async () => {
    app = (await import('../dex/routes.ts')).routes({
      store: new SqliteStore(`/tmp/dex-cache-${crypto.randomUUID()}.sqlite`),
      threshold: 5,
      perMinute: 100
    }) as unknown as typeof app;
  });

  test('the readable pages may be held at the edge, which is what keeps them off the Worker', async () => {
    for (const path of ['/', '/v1/dex', '/v1/dex.csv']) {
      const header = (await app.handle(new Request(`http://dex.test${path}`))).headers.get('cache-control');
      expect({ path, header }).toEqual({ path, header: 'public, max-age=300, s-maxage=300' });
    }
  });

  test('ingest is never cached, however it is called', async () => {
    const response = await app.handle(new Request('http://dex.test/v1/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json'
    }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('health is never cached, because a cached health check answers nothing', async () => {
    const response = await app.handle(new Request('http://dex.test/healthz'));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('the private view of everything', () => {
  const PASSWORD = 'correct-horse-battery-staple';

  const build = (password?: string) => (routes as unknown as (o: object) => { handle: (r: Request) => Promise<Response> })({
    store: new SqliteStore(`/tmp/dex-admin-${crypto.randomUUID()}.sqlite`),
    threshold: 5,
    perMinute: 100,
    adminPassword: password
  });

  const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;

  test('the page does not exist at all until a password is configured', async () => {
    const response = await build(undefined).handle(new Request('http://dex.test/admin'));
    expect(response.status).toBe(404);
  });

  test('without credentials it asks for them rather than answering', async () => {
    const response = await build(PASSWORD).handle(new Request('http://dex.test/admin'));
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic');
  });

  test('a wrong password is refused', async () => {
    const response = await build(PASSWORD).handle(new Request('http://dex.test/admin', {
      headers: { authorization: basic('dex', 'hunter2') }
    }));
    expect(response.status).toBe(401);
  });

  test('the right password shows everything on record', async () => {
    const response = await build(PASSWORD).handle(new Request('http://dex.test/admin', {
      headers: { authorization: basic('dex', PASSWORD) }
    }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Everything on record');
  });

  test('the username is ignored, only the password decides', async () => {
    const response = await build(PASSWORD).handle(new Request('http://dex.test/admin', {
      headers: { authorization: basic('anyone-at-all', PASSWORD) }
    }));
    expect(response.status).toBe(200);
  });

  test('a private page is never cached anywhere', async () => {
    const response = await build(PASSWORD).handle(new Request('http://dex.test/admin', {
      headers: { authorization: basic('dex', PASSWORD) }
    }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('comparing secrets does not short-circuit on the first wrong character', async () => {
    const { sameSecret } = await import('../dex/routes.ts');
    expect(sameSecret('abcdef', 'abcdef')).toBe(true);
    expect(sameSecret('abcdef', 'abcdeX')).toBe(false);
    expect(sameSecret('Xbcdef', 'abcdef')).toBe(false);
    expect(sameSecret('abc', 'abcdef')).toBe(false);
  });

  test('a malformed authorization header is refused rather than throwing', async () => {
    for (const header of ['Bearer abc', 'Basic !!!not-base64!!!', 'Basic ' + btoa('nocolon'), '']) {
      const response = await build(PASSWORD).handle(new Request('http://dex.test/admin', {
        headers: { authorization: header }
      }));
      expect({ header, status: response.status }).toEqual({ header, status: 401 });
    }
  });
});
