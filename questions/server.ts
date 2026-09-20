import { routes } from './routes.ts';
import { SqliteStore } from './sqlite.ts';

const PORT = Number(Bun.env.PORT ?? 3100);
const DB_PATH = Bun.env.QUESTIONS_DB ?? 'questions.sqlite';
const THRESHOLD = Number(Bun.env.QUESTIONS_THRESHOLD ?? 5);
const PER_MINUTE = Number(Bun.env.QUESTIONS_RATE ?? 30);

export const store = new SqliteStore(DB_PATH);
export const app = routes({ store, threshold: THRESHOLD, perMinute: PER_MINUTE });

if (import.meta.main) {
  app.listen(PORT);
  console.log(`questions on http://localhost:${PORT} (k=${THRESHOLD}, db=${DB_PATH})`);
}
