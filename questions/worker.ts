import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { D1Store, type D1Database } from './d1.ts';
import { routes } from './routes.ts';

export interface Env {
  DB: D1Database;
  QUESTIONS_THRESHOLD?: string;
  QUESTIONS_RATE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = new Elysia({ adapter: CloudflareAdapter })
      .use(routes({
        store: new D1Store(env.DB),
        threshold: Number(env.QUESTIONS_THRESHOLD ?? 5),
        perMinute: Number(env.QUESTIONS_RATE ?? 30)
      }))
      .compile();

    return app.handle(request);
  }
};
