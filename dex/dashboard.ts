import { BACKDROP, LAYOUT, page } from '../design/index.ts';
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
  ${BACKDROP}
  ${LAYOUT}

  .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .stat { background: color-mix(in oklch, var(--raise), transparent 70%); border: 1px solid var(--line); padding: 16px 18px; }
  .stat b { display: block; font-size: 28px; color: var(--fg-bright); }
  .stat span { font-family: var(--font-mono); color: var(--fg-faint); font-size: 11px;
               text-transform: uppercase; letter-spacing: 0.06em; }

  .q { font-weight: 600; color: var(--fg-bright); }
  .opts { color: var(--fg-faint); font-family: var(--font-mono); font-size: 11px; margin-top: 4px; }
  .tag { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase;
         border: 1px solid var(--line); padding: 2px 8px; color: var(--program); white-space: nowrap; }
  .rules { border: 1px solid var(--line); padding: 18px 22px; background: color-mix(in oklch, var(--raise), transparent 70%); }
  .rules ul { margin: 0; padding-left: 18px; line-height: 1.8; color: var(--fg-muted); }
  .rules strong { color: var(--fg-bright); }
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
    How applicant tracking systems word their questions. Every row is text any applicant
    to that form already sees. No answers, and nothing that could identify anyone.
  </p>

  <h2>What is here</h2>
  <div class="totals">
    <div class="stat hud"><b>${view.totals.published}</b><span>questions published</span></div>
    <div class="stat hud"><b>${view.totals.waiting}</b><span>waiting on review</span></div>
    <div class="stat hud"><b>${view.totals.held}</b><span>held back</span></div>
    <div class="stat hud"><b>${view.totals.observations}</b><span>reports</span></div>
  </div>

  <h2>What is collected, and what never is</h2>
  <div class="rules">
    <ul>
      <li><strong>Collected:</strong> the board, the question, the options it offered, the control, and whether JobFill could answer it.</li>
      <li><strong>Never:</strong> your answers, profile, resume, or anything you typed.</li>
      <li><strong>Never:</strong> the page address, company or role. Only which of the ${ATS_HOSTS.length} boards.</li>
      <li><strong>Never:</strong> any identifier. Nothing here links two reports to one person.</li>
      <li><strong>Never:</strong> race, gender, disability, veteran status, orientation, religion or age.</li>
      <li><strong>Held:</strong> until <strong>${view.threshold} separate reports</strong> have seen it, so a question one company wrote for one person never lands here.</li>
      <li><strong>Reviewed:</strong> reaching that count only queues it. A person approves everything, because an endpoint anyone can post to is an endpoint anyone can post anything to.</li>
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
