import { routes } from './routes.ts';
import { SqliteStore } from './sqlite.ts';

const PORT = Number(Bun.env.PORT ?? 3100);
const DB_PATH = Bun.env.DEX_DB ?? 'dex.sqlite';
const THRESHOLD = Number(Bun.env.DEX_THRESHOLD ?? 5);
const PER_MINUTE = Number(Bun.env.DEX_RATE ?? 30);

export const store = new SqliteStore(DB_PATH);
export const app = routes({
  store,
  threshold: THRESHOLD,
  perMinute: PER_MINUTE,
  adminPassword: Bun.env.DEX_ADMIN
});

if (import.meta.main) {
  app.listen(PORT);
  console.log(`questions on http://localhost:${PORT} (k=${THRESHOLD}, db=${DB_PATH})`);
}
