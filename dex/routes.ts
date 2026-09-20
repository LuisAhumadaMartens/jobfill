import { Elysia } from 'elysia';
import { dashboard } from './dashboard.ts';
import { RateLimit } from './limit.ts';
import { validateReport } from '../src/shared/dex.ts';
import type { Store } from './store.ts';

const MAX_BODY = 256 * 1024;

export interface Options {
  store: Store;
  threshold: number;
  perMinute: number;
}

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin.startsWith('chrome-extension://')) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function csv(rows: object[]): string {
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

export function routes({ store, threshold, perMinute }: Options) {
  const limit = new RateLimit(perMinute);

  const view = async () => ({
    schema: 1,
    threshold,
    totals: await store.totals(threshold),
    boards: await store.boards(threshold),
    questions: await store.published(threshold)
  });

  return new Elysia()
    .onAfterHandle(({ set, request }) => {
      const origin = allowedOrigin(request.headers.get('origin'));
      if (origin) {
        set.headers['access-control-allow-origin'] = origin;
        set.headers['vary'] = 'Origin';
      }
      set.headers['x-content-type-options'] = 'nosniff';
      set.headers['referrer-policy'] = 'no-referrer';
      set.headers['x-robots-tag'] = 'noindex, nofollow';
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
      const address = server?.requestIP(request)?.address
        ?? request.headers.get('cf-connecting-ip')
        ?? 'unknown';

      if (!limit.take(address)) {
        set.status = 429;
        return { error: 'too many reports, try later' };
      }

      if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) {
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

      const stored = await store.record(checked.value);
      set.status = 202;
      return { accepted: checked.value.observations.length, stored, threshold };
    })

    .get('/v1/dex', () => view())

    .get('/v1/dex.csv', async ({ set }) => {
      set.headers['content-type'] = 'text/csv; charset=utf-8';
      set.headers['content-disposition'] = 'attachment; filename="jobfill-dex.csv"';
      return csv(await store.published(threshold));
    })

    .get('/robots.txt', ({ set }) => {
      set.headers['content-type'] = 'text/plain; charset=utf-8';
      return 'User-agent: *\nDisallow: /\n';
    })

    .get('/healthz', () => ({ ok: true, threshold }))

    .get('/', async ({ set }) => {
      set.headers['content-type'] = 'text/html; charset=utf-8';
      return dashboard(await view());
    });
}
