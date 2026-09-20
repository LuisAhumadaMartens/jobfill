import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { D1Store, type D1Database } from './d1.ts';
import { routes } from './routes.ts';

export interface Env {
  DB: D1Database;
  ATLAS_THRESHOLD?: string;
  ATLAS_RATE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = new Elysia({ adapter: CloudflareAdapter })
      .use(routes({
        store: new D1Store(env.DB),
        threshold: Number(env.ATLAS_THRESHOLD ?? 5),
        perMinute: Number(env.ATLAS_RATE ?? 30)
      }))
      .compile();

    return app.handle(request);
  }
};
