import { DECIDE, PENDING } from './store.ts';
import type { PendingRow, Verdict } from './store.ts';

const DATABASE = 'jobfill-dex';
const CONFIG = 'dex/wrangler.toml';

export function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function decideStatement(row: PendingRow, verdict: Verdict, at: string): string {
  return DECIDE
    .replace('values (?, ?, ?, ?)', `values (${quote(row.questionKey)}, ${quote(row.outcome)}, ${quote(verdict)}, ${quote(at)})`)
    .replace(/\s+/g, ' ')
    .trim();
}

async function d1(command: string): Promise<unknown[]> {
  const run = Bun.spawn(
    ['bunx', 'wrangler', 'd1', 'execute', DATABASE, '--remote', '--yes', '--json', '--config', CONFIG, '--command', command],
    { stdout: 'pipe', stderr: 'pipe' }
  );

  const [out, err, code] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited
  ]);

  if (code !== 0) throw new Error(err.trim() || `wrangler exited with ${code}`);

  const start = out.indexOf('[');
  if (start < 0) throw new Error(`no JSON in wrangler output:\n${out}`);

  const parsed = JSON.parse(out.slice(start)) as Array<{ results?: unknown[] }>;
  return parsed[0]?.results ?? [];
}

function render(rows: PendingRow[]): void {
  console.log(`\n${rows.length} question${rows.length === 1 ? '' : 's'} waiting on review\n`);

  rows.forEach((row, index) => {
    console.log(`  [${index + 1}] ${row.question}`);
    console.log(`      ${row.ats} · ${row.control} · ${row.outcome} · seen by ${row.sessions} · since ${row.firstSeen}`);
    if (row.options.length) console.log(`      options: ${row.options.slice(0, 10).join(' · ')}`);
    console.log('');
  });

  console.log('  bun run dex:review --approve 1,3     publish those');
  console.log('  bun run dex:review --approve all     publish everything listed');
  console.log('  bun run dex:review --block 2         never publish that one\n');
}

export function chosen(rows: PendingRow[], argument: string): PendingRow[] {
  if (argument === 'all') return rows;

  return argument.split(',')
    .map((part) => Number(part.trim()))
    .filter((index) => Number.isInteger(index) && index >= 1 && index <= rows.length)
    .map((index) => rows[index - 1]!);
}

if (import.meta.main) {
  const threshold = Number(Bun.env.DEX_THRESHOLD ?? 5);
  const raw = await d1(PENDING.replace('>= ?', `>= ${threshold}`).replace(/\s+/g, ' ').trim());
  const rows = (raw as Array<Omit<PendingRow, 'options'> & { options: string }>)
    .map((row) => ({ ...row, options: JSON.parse(row.options) as string[] }));

  const approve = Bun.argv.indexOf('--approve');
  const block = Bun.argv.indexOf('--block');
  const verdict: Verdict | null = approve > -1 ? 'approved' : block > -1 ? 'blocked' : null;

  if (!verdict) {
    render(rows);
    process.exit(0);
  }

  const picked = chosen(rows, Bun.argv[(approve > -1 ? approve : block) + 1] ?? '');
  if (!picked.length) {
    console.log('Nothing matched that selection.');
    process.exit(1);
  }

  const at = new Date().toISOString();
  for (const row of picked) {
    await d1(decideStatement(row, verdict, at));
    console.log(`${verdict === 'approved' ? 'published' : 'blocked '}  ${row.question}`);
  }
}
