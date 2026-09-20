import { Elysia } from 'elysia';
import { Atlas } from './db.ts';
import { RateLimit } from './limit.ts';
import { dashboard } from './dashboard.ts';
import { LIMITS, validateReport } from '../src/shared/atlas.ts';

const PORT = Number(Bun.env.PORT ?? 3100);
const DB_PATH = Bun.env.ATLAS_DB ?? 'atlas.sqlite';
const THRESHOLD = Number(Bun.env.ATLAS_THRESHOLD ?? 5);
const PER_MINUTE = Number(Bun.env.ATLAS_RATE ?? 30);
const MAX_BODY = 256 * 1024;

const atlas = new Atlas(DB_PATH);
const limit = new RateLimit(PER_MINUTE);

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin.startsWith('chrome-extension://')) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return null;
}

function csv(rows: object[]): string {
  const first = rows[0];
  if (!first) return '';

  const columns = Object.keys(first);
  const cell = (value: unknown): string => {
    const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => cell((row as Record<string, unknown>)[column])).join(','))
  ].join('\n');
}

export const app = new Elysia()
  .onAfterHandle(({ set, request }) => {
    const origin = allowedOrigin(request.headers.get('origin'));
    if (origin) {
      set.headers['access-control-allow-origin'] = origin;
      set.headers['vary'] = 'Origin';
    }
    set.headers['x-content-type-options'] = 'nosniff';
    set.headers['referrer-policy'] = 'no-referrer';
  })

  .options('/v1/reports', ({ set, request }) => {
    const origin = allowedOrigin(request.headers.get('origin'));
    if (origin) {
      set.headers['access-control-allow-origin'] = origin;
      set.headers['access-control-allow-methods'] = 'POST';
      set.headers['access-control-allow-headers'] = 'content-type';
      set.headers['access-control-max-age'] = '86400';
    }
    set.status = 204;
    return '';
  })

  .post('/v1/reports', async ({ request, set, server }) => {
    const address = server?.requestIP(request)?.address ?? 'unknown';
    if (!limit.take(address)) {
      set.status = 429;
      return { error: 'too many reports, try later' };
    }

    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY) {
      set.status = 413;
      return { error: 'report is too large' };
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      set.status = 400;
      return { error: 'report is not JSON' };
    }

    const checked = validateReport(body);
    if (!checked.ok) {
      set.status = 422;
      return { error: checked.reason };
    }

    const stored = atlas.record(checked.value);
    set.status = 202;
    return { accepted: checked.value.observations.length, stored, threshold: THRESHOLD };
  })

  .get('/v1/atlas', () => ({
    schema: 1,
    threshold: THRESHOLD,
    totals: atlas.totals(THRESHOLD),
    boards: atlas.boards(THRESHOLD),
    questions: atlas.published(THRESHOLD)
  }))

  .get('/v1/atlas.csv', ({ set }) => {
    set.headers['content-type'] = 'text/csv; charset=utf-8';
    set.headers['content-disposition'] = 'attachment; filename="jobfill-atlas.csv"';
    return csv(atlas.published(THRESHOLD));
  })

  .get('/healthz', () => ({ ok: true, threshold: THRESHOLD, limits: LIMITS }))

  .get('/', ({ set }) => {
    set.headers['content-type'] = 'text/html; charset=utf-8';
    return dashboard({
      threshold: THRESHOLD,
      totals: atlas.totals(THRESHOLD),
      boards: atlas.boards(THRESHOLD),
      questions: atlas.published(THRESHOLD)
    });
  });

if (import.meta.main) {
  app.listen(PORT);
  console.log(`atlas on http://localhost:${PORT} (k=${THRESHOLD}, db=${DB_PATH})`);
}
