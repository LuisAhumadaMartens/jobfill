import { page } from '../design/index.ts';
import { ATS_HOSTS } from '../src/lib/sites.ts';
import type { EveryRow, QuestionRow, Totals } from './store.ts';

interface View {
  threshold: number;
  totals: Totals;
  boards: Array<{ ats: string; questions: number; sessions: number }>;
  questions: QuestionRow[];
}

const OUTCOMES: Record<string, string> = {
  unmatched: 'nothing matched',
  unsure: 'matched but unsure',
  'no-option': 'no option fitted',
  cleared: 'the page cleared it',
  replaced: 'the page replaced it'
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string
  ));
}

const STYLE = `
  ${page()}

  main { max-width: 940px; margin: 0 auto; padding: 48px 22px 100px; }
  h1 { font-size: 30px; letter-spacing: -0.03em; margin: 0 0 10px; }
  .lede { color: var(--fg-muted); line-height: 1.65; max-width: 66ch; margin: 0 0 8px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-faint); margin: 44px 0 14px; }
  .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .stat { background: var(--raise); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 16px 18px; }
  .stat b { display: block; font-size: 26px; letter-spacing: -0.02em; }
  .stat span { color: var(--fg-faint); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .q { font-weight: 600; }
  .opts { color: var(--fg-faint); font-size: 12px; margin-top: 5px; }
  .tag { display: inline-block; background: color-mix(in oklch, var(--program), transparent 84%); color: var(--program);
         border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .empty { border: 1px dashed var(--line); border-radius: var(--r-lg); padding: 34px; text-align: center; color: var(--fg-faint); }
  .rules { background: var(--raise); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 20px 22px; }
  .rules ul { margin: 0; padding-left: 20px; line-height: 1.8; color: var(--fg-muted); }
  .rules strong { color: var(--fg); }
  .note { color: var(--fg-faint); font-size: 13px; }
  code { background: var(--raise); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 1px 6px; font-size: 0.9em; }
  footer { margin-top: 44px; color: var(--fg-faint); font-size: 12.5px; line-height: 1.7; }
`;

export function dashboard(view: View): string {
  const rows = view.questions.map((row) => `
    <tr>
      <td>
        <div class="q">${escapeHtml(row.question)}</div>
        ${row.options.length ? `<div class="opts">${row.options.slice(0, 8).map(escapeHtml).join(' &middot; ')}${row.options.length > 8 ? ` &middot; +${row.options.length - 8} more` : ''}</div>` : ''}
      </td>
      <td><span class="tag">${escapeHtml(row.ats)}</span></td>
      <td>${escapeHtml(row.control)}</td>
      <td>${escapeHtml(OUTCOMES[row.outcome] ?? row.outcome)}</td>
      <td class="num">${row.sessions}</td>
    </tr>`).join('');

  const boards = view.boards.map((board) => `
    <tr>
      <td><span class="tag">${escapeHtml(board.ats)}</span></td>
      <td class="num">${board.questions}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>JobFill Dex</title>
<meta name="description" content="An open map of how applicant tracking systems word their application questions." />
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>JobFill Dex</h1>
  <p class="lede">
    An open map of how applicant tracking systems word their application questions. Every
    row here is text that any applicant opening that form already sees. Nobody's answers
    are here, and there is nothing in this dataset that could say who filled anything in.
  </p>
  <p class="lede">
    It is built from reports that <a href="https://github.com/LuisAhumadaMartens/jobfill">JobFill</a>
    users choose to send, one application at a time, after reading exactly what is in them.
  </p>

  <h2>What is here</h2>
  <div class="totals">
    <div class="stat"><b>${view.totals.published}</b><span>questions published</span></div>
    <div class="stat"><b>${view.totals.waiting}</b><span>waiting on review</span></div>
    <div class="stat"><b>${view.totals.held}</b><span>held back</span></div>
    <div class="stat"><b>${view.totals.observations}</b><span>reports</span></div>
  </div>

  <h2>What is collected, and what never is</h2>
  <div class="rules">
    <ul>
      <li><strong>Collected:</strong> the job board, the question, the options it offered, the kind of control, and whether JobFill could answer it.</li>
      <li><strong>Never collected:</strong> your answers, your profile, your resume, or anything you typed.</li>
      <li><strong>Never collected:</strong> the page address, the company, or the role. Only which of the ${ATS_HOSTS.length} boards it was.</li>
      <li><strong>Never collected:</strong> any identifier. There is no account and no install id, so nothing here links two reports to one person.</li>
      <li><strong>Never collected:</strong> questions about race, gender, disability, veteran status, orientation, religion or age. Those are refused before anything is queued.</li>
      <li><strong>Held back:</strong> a question stays private until <strong>${view.threshold} separate reports</strong> have seen it, which is how a question one company wrote for one person never reaches this page.</li>
      <li><strong>Reviewed by a person:</strong> reaching that count only puts a question in a queue. Nothing appears here until it has been read and approved by hand, because an endpoint anybody can post to is an endpoint anybody can post anything to.</li>
    </ul>
  </div>

  <h2>Boards</h2>
  ${boards ? `<table><thead><tr><th>Board</th><th style="text-align:right">Questions</th></tr></thead><tbody>${boards}</tbody></table>` : '<p class="empty">Nothing published yet.</p>'}

  <h2>Questions</h2>
  ${rows
    ? `<table><thead><tr><th>Question</th><th>Board</th><th>Control</th><th>What happened</th><th style="text-align:right">Seen by</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">Nothing has reached ${view.threshold} reports yet. That is the gate working, not an error.</p>`}

  <footer>
    Take the data: <a href="/v1/dex">/v1/dex</a> as JSON, <a href="/v1/dex.csv">/v1/dex.csv</a> as a spreadsheet.
    Both are the same k-gated view this page shows.
  </footer>
</main>
</body>
</html>`;
}

export function admin(rows: EveryRow[], threshold: number): string {
  const state = (row: EveryRow): { label: string; tone: string } => {
    if (row.verdict === 'approved') return { label: 'published', tone: 'ok' };
    if (row.verdict === 'blocked') return { label: 'blocked', tone: 'no' };
    if (row.sessions >= threshold) return { label: 'waiting on you', tone: 'wait' };
    return { label: `${threshold - row.sessions} more needed`, tone: 'low' };
  };

  const body = rows.length
    ? `<table>
    <thead><tr><th>Question</th><th>Board</th><th>Control</th><th>What happened</th><th style="text-align:right">Seen by</th><th>State</th></tr></thead>
    <tbody>${rows.map((row) => {
      const { label, tone } = state(row);
      return `
      <tr>
        <td>
          <div class="q">${escapeHtml(row.question)}</div>
          ${row.options.length ? `<div class="opts">${row.options.slice(0, 8).map(escapeHtml).join(' &middot; ')}</div>` : ''}
          <div class="opts">${escapeHtml(row.firstSeen)} to ${escapeHtml(row.lastSeen)}</div>
        </td>
        <td><span class="tag">${escapeHtml(row.ats)}</span></td>
        <td>${escapeHtml(row.control)}</td>
        <td>${escapeHtml(OUTCOMES[row.outcome] ?? row.outcome)}</td>
        <td class="num">${row.sessions}<br /><span class="opts">${row.reports} report${row.reports === 1 ? '' : 's'}</span></td>
        <td><span class="state ${tone}">${label}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`
    : '<p class="empty">Nothing has been reported yet.</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Dex, everything</title>
<style>${STYLE}
  .state { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
           padding: 3px 9px; border-radius: var(--r-pill); white-space: nowrap; }
  .state.ok { background: color-mix(in oklch, var(--success), transparent 82%); color: var(--success); }
  .state.no { background: color-mix(in oklch, var(--danger), transparent 82%); color: var(--danger); }
  .state.wait { background: color-mix(in oklch, var(--warn), transparent 82%); color: var(--warn); }
  .state.low { background: color-mix(in oklch, var(--fg), transparent 90%); color: var(--fg-faint); }
</style>
</head>
<body>
<main>
  <h1>Everything on record</h1>
  <p class="lede">
    Every question the dex has been told about, including the ones below the publication
    threshold that nobody else can see. ${rows.length} in total, threshold ${threshold}.
  </p>
  <p class="note">Decide with <code>bun run dex:review</code>. This page only reads.</p>
  ${body}
</main>
</body>
</html>`;
}
