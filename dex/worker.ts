import { env } from 'cloudflare:workers';
import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { D1Store, type D1Database } from './d1.ts';
import { routes } from './routes.ts';

export interface Bindings {
  DB: D1Database;
  DEX_THRESHOLD?: string;
  DEX_RATE?: string;
  DEX_ADMIN?: string;
}

const bindings = env as unknown as Bindings;

export default new Elysia({ adapter: CloudflareAdapter })
  .use(routes({
    store: new D1Store(bindings.DB),
    threshold: Number(bindings.DEX_THRESHOLD ?? 5),
    perMinute: Number(bindings.DEX_RATE ?? 30),
    adminPassword: bindings.DEX_ADMIN
  }))
  .compile();
