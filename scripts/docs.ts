import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BACKDROP, LAYOUT, page } from '../design/index.ts';
import { ATS_HOSTS } from '../src/lib/sites.ts';

const ROOT = dirname(import.meta.dir);
const DOCS = join(ROOT, 'docs');

const SITE = `
  nav { display: flex; gap: 20px; align-items: center; margin-bottom: 52px; }
  nav .brand { font-weight: 700; font-size: 18px; letter-spacing: 0.02em; margin-right: auto; text-transform: uppercase; }
  nav a { text-decoration: none; font-family: var(--font-mono); font-size: 12px; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--fg-muted); }
  nav a:hover { color: var(--program); }

  h1 { font-size: 46px; line-height: 1.05; margin-bottom: 18px; }
  .lede { font-size: 19px; max-width: 58ch; }

  .cta { display: flex; gap: 12px; flex-wrap: wrap; margin: 28px 0 10px; }
  .cta svg { width: 15px; height: 15px; flex: none; }

  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
  .card { background: color-mix(in oklch, var(--raise), transparent 70%); border: 1px solid var(--line); padding: 18px 20px; }
  .card p { margin: 0; font-size: 14px; color: var(--fg-muted); }

  ul { color: var(--fg); line-height: 1.8; max-width: 66ch; padding-left: 18px; }
  li strong { color: var(--fg-bright); }

  .boards { display: flex; flex-wrap: wrap; gap: 6px; }
  .boards span { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase;
                 border: 1px solid var(--line); padding: 4px 10px; color: var(--fg-muted);
                 background: oklch(0 0 0 / 0.4); transition: border-color 160ms var(--ease), color 160ms var(--ease); }
  .boards span:hover { border-color: var(--program); color: var(--program); }
`;

const GITHUB_MARK = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';

const CHROME_MARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.9 4.02L3.5 5.6A10 10 0 0 1 12 2Zm-9.5 5.35 4.32 7.48A5 5 0 0 0 12 17c.2 0 .4-.01.6-.04l-3.6 6.23A10 10 0 0 1 2 12c0-1.66.4-3.22 1.1-4.6l-.6-.05ZM12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm9.3.5A10 10 0 0 1 12 22h-.3l4.35-7.53A5 5 0 0 0 16.5 9h4.8Z"/></svg>';


const ORIGIN = 'https://jobfill.app';

interface Shell {
  title: string;
  description: string;
  path: string;
  body: string;
  noindex?: boolean;
  extra?: string;
}

function shell({ title, description, path, body, noindex = false, extra = '' }: Shell): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
${noindex
  ? '<meta name="robots" content="noindex, nofollow" />'
  : `<link rel="canonical" href="${ORIGIN}${path}" />
<meta name="robots" content="index, follow" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="JobFill" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${ORIGIN}${path}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />`}
<meta name="color-scheme" content="dark light" />
<style>${page()}${BACKDROP}${LAYOUT}${SITE}${extra}</style>
</head>
<body>
<main>
  <nav>
    <span class="brand">JobFill</span>
    <a href="/">Home</a>
    <a href="/privacy.html">Privacy</a>
    <a href="https://dex.jobfill.app">Dex</a>
  </nav>
${body}
  <footer>
    JobFill is free for personal use under <a href="https://github.com/LuisAhumadaMartens/jobfill/blob/main/LICENSE.md">PolyForm Strict 1.0.0</a>.
    Built by <a href="https://github.com/LuisAhumadaMartens">Luis Ahumada</a>.
  </footer>
</main>
</body>
</html>`;
}

const home = shell({
  title: 'JobFill',
  description: 'A Chrome extension that fills in job applications from answers you teach it once.',
  path: '/',
  body: `  <h1>Stop retyping the same answers.</h1>
  <p class="lede">
    JobFill fills job applications from answers you teach it once. Your resume is read in the
    browser and never uploaded.
  </p>

  <div class="cta">
    <a class="skew on" href="https://github.com/LuisAhumadaMartens/jobfill/releases/latest"><span>${CHROME_MARK} Download</span></a>
    <a class="skew" href="https://github.com/LuisAhumadaMartens/jobfill"><span>${GITHUB_MARK} Source</span></a>
  </div>

  <h2>What it does</h2>
  <div class="cards">
    <div class="card hud">
      <h3>Reads your resume here</h3>
      <p>PDF, DOCX or text, parsed in your browser.</p>
    </div>
    <div class="card hud">
      <h3>Knows the standard questions</h3>
      <p>About 45 by shape, so a new board still fills on the first visit.</p>
    </div>
    <div class="card hud">
      <h3>Learns the rest</h3>
      <p>Answer once in the panel and it keeps the answer and the wording.</p>
    </div>
    <div class="card hud">
      <h3>Asks before it keeps</h3>
      <p>On submit it offers what you typed. You tick what to remember.</p>
    </div>
  </div>

  <h2>Where it runs</h2>
  <p>Only on the boards below, or a site you switch it on yourself. Nowhere else.</p>
  <div class="boards">${ATS_HOSTS.map((host) => `<span>${host}</span>`).join('')}</div>

  <h2>Install</h2>
  <p>
    Unzip the latest release, open <code>chrome://extensions</code>, turn on Developer mode and
    choose <strong>Load unpacked</strong>.
  </p>`
});

const privacy = shell({
  title: 'JobFill privacy',
  description: 'What JobFill stores, where it stores it, and the one thing that ever leaves your machine.',
  path: '/privacy.html',
  body: `  <h1>Privacy</h1>
  <p class="lede">
    Your resume, profile and answers stay in this browser. No account, no server.
  </p>

  <h2>What is stored, and where</h2>
  <ul>
    <li><strong>Your resume file and its text</strong>, in <code>chrome.storage.local</code> on this computer.</li>
    <li><strong>Your profile</strong>: name, email, phone, address, links, work history, education, skills, references, languages and certifications.</li>
    <li><strong>Your answers</strong>, and the wordings each site used for the questions they answer.</li>
    <li><strong>Your settings</strong>, including which sites JobFill is allowed to run on.</li>
  </ul>
  <p>Uninstalling removes it. Settings lets you erase or export it.</p>

  <h2>The one thing that can leave</h2>
  <p>
    A question JobFill cannot answer is worth keeping even though your answer is not: it is the
    wording every applicant to that board sees. They collect on the <strong>Contribute</strong>
    tab where you can read them.
  </p>
  <p>
    <strong>Nothing can be sent until you allow it once.</strong> Reaching the network is an
    optional permission, so the browser does not grant it until the first time you press send.
    Until you do, JobFill makes no network request at all and the questions sit in your browser
    where you can read them.
  </p>
  <p>
    After that, questions are shared as they are found, so you do not press a button after every
    application. It only ever sends the four things listed below. Turning it off on the
    Contribute tab stops it immediately, and clearing the list discards what was waiting.
  </p>

  <h3>Sent, if you send it</h3>
  <ul>
    <li>The job board, by name</li>
    <li>The question, as the page words it</li>
    <li>The options the page offered</li>
    <li>The kind of control, and what went wrong</li>
    <li>The extension version</li>
  </ul>

  <h3>Never sent, whatever you press</h3>
  <ul>
    <li>Your answers, your profile, or your resume</li>
    <li>The page address, the company, or the role</li>
    <li>Any account, install, device or session identifier that persists</li>
    <li>Questions about race, gender, disability, veteran status, sexual orientation, religion, marital status or age</li>
  </ul>
  <p>
    A report carries a token made fresh for that send and stored nowhere, so reports can be
    counted but not linked to a person.
  </p>

  <h2>What happens to a sent question</h2>
  <p>
    It is held until five separate reports have seen the same question, so a question one company
    wrote for one candidate never reaches anyone. After that it waits to be read and approved by
    hand. Only then does it appear on <a href="https://dex.jobfill.app">the public dex</a>.
  </p>

  <h2>No analytics, ever</h2>
  <p>
    No analytics, no tracking, no advertising identifiers, no remote code, nothing sold. The PDF
    reader and the fonts ship inside the extension.
  </p>

  <h2>Children</h2>
  <p>JobFill is not directed at children under 13 and collects nothing from anyone knowingly.</p>

  <h2>Questions</h2>
  <p>
    Open an issue at
    <a href="https://github.com/LuisAhumadaMartens/jobfill/issues">github.com/LuisAhumadaMartens/jobfill</a>.
    This page changes only when the extension does, and its history is in that repository.
  </p>`
});


const SWATCHES = [
  ['--program', 'the one accent'],
  ['--program-hover', 'accent, hovered'],
  ['--program-deep', 'accent, pressed'],
  ['--ground', 'the page behind everything'],
  ['--raise', 'a surface sitting on it'],
  ['--sink', 'a well cut into it'],
  ['--fg', 'text'],
  ['--fg-muted', 'text that supports'],
  ['--fg-faint', 'labels and captions'],
  ['--line', 'a hairline'],
  ['--line-2', 'a hairline that wants noticing'],
  ['--danger', 'destructive'],
  ['--success', 'went well'],
  ['--warn', 'worth reading']
];

const RADII = ['--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-pill'];

const UI_STYLE = `
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
  .swatch { border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; background: var(--raise); }
  .chip { height: 58px; }
  .swatch .meta { padding: 9px 11px; }
  .swatch code { display: block; font-size: 12px; background: none; border: 0; padding: 0; color: var(--fg); }
  .swatch small { color: var(--fg-faint); font-size: 11.5px; }
  .swatch .value { color: var(--fg-faint); font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .row { display: flex; gap: 11px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
  .stack { display: grid; gap: 11px; max-width: 420px; }
  .radii { display: flex; gap: 14px; flex-wrap: wrap; }
  .radius { text-align: center; }
  .radius div { width: 76px; height: 56px; background: var(--raise); border: 1px solid var(--line-2); }
  .radius code { font-size: 11px; background: none; border: 0; padding: 0; }
  .demo-box { --r-box: var(--r-lg); padding: 18px 20px; max-width: 420px; }
  .type div { margin-bottom: 8px; }
  .note { color: var(--fg-faint); font-size: 13px; max-width: 68ch; }
`;

const ui = shell({
  title: 'JobFill design',
  description: 'Every token and control JobFill is built from, rendered from the same source the extension ships.',
  path: '/ui',
  noindex: true,
  extra: UI_STYLE,
  body: `  <h1>Design</h1>
  <p class="lede">
    Rendered from the same source the extension and the dex ship, so this is what ships.
    Colour values are read from the live stylesheet rather than written down again.
  </p>

  <h2>Colour</h2>
  <div class="swatches">
    ${SWATCHES.map(([token, meaning]) => `
    <div class="swatch">
      <div class="chip" style="background: var(${token})"></div>
      <div class="meta">
        <code>${token}</code>
        <small>${meaning}</small>
        <div class="value" data-token="${token}"></div>
      </div>
    </div>`).join('')}
  </div>
  <p class="note">Each has a light-mode value. Change your system theme and this follows.</p>

  <h2>Type</h2>
  <div class="type">
    <div style="font-size:42px;font-weight:700;text-transform:uppercase">Rajdhani Bold, 42</div>
    <div style="font-size:26px;font-weight:600">Rajdhani Semibold, 26</div>
    <div style="font-size:17px">Rajdhani Regular, 17</div>
    <div style="font-size:14px;color:var(--fg-muted)">Rajdhani Regular, 14, muted</div>
    <div class="label">Share Tech Mono, 11, a label</div>
    <div style="font-family:var(--font-mono);font-size:14px">Share Tech Mono, 14</div>
  </div>

  <h2>Buttons</h2>
  <div class="row">
    <button class="primary">Primary</button>
    <button class="ghost">Ghost</button>
    <button class="outline">Outline</button>
    <button class="danger">Danger</button>
    <button class="link">Link</button>
  </div>
  <div class="row">
    <button class="primary" disabled>Primary, disabled</button>
    <button class="ghost" disabled>Ghost, disabled</button>
  </div>

  <h2>Fields</h2>
  <div class="stack">
    <input type="text" placeholder="A text field" />
    <input type="email" value="luis@example.com" />
    <select><option>A select</option><option>Another option</option></select>
    <textarea rows="3" placeholder="A textarea"></textarea>
    <label style="display:flex;gap:9px;align-items:center;font-size:14px;color:var(--fg-muted)">
      <input type="checkbox" checked /> A checkbox
    </label>
  </div>

  <h2>Surfaces</h2>
  <div class="box demo-box">
    <strong>A box</strong>
    <p style="margin:6px 0 0;font-size:14px">
      The border is a masked gradient, lit along the top edge, so a surface reads as raised
      rather than outlined.
    </p>
  </div>

  <h2>Pills</h2>
  <div class="row">
    <span class="pill">details</span>
    <span class="pill">attached</span>
    <span class="pill">used 4 times</span>
  </div>

  <h2>Corners</h2>
  <div class="radii">
    ${RADII.map((token) => `
    <div class="radius">
      <div style="border-radius: var(${token})"></div>
      <code>${token}</code>
    </div>`).join('')}
  </div>

  <h2>Tables</h2>
  <table>
    <thead><tr><th>Question</th><th>Board</th><th style="text-align:right">Seen by</th></tr></thead>
    <tbody>
      <tr><td>Are you legally authorized to work in the United States?</td><td><span class="pill">greenhouse.io</span></td><td class="num">12</td></tr>
      <tr><td>What are your compensation expectations?</td><td><span class="pill">lever.co</span></td><td class="num">7</td></tr>
    </tbody>
  </table>

  <script>
    for (const node of document.querySelectorAll('[data-token]')) {
      node.textContent = getComputedStyle(document.documentElement)
        .getPropertyValue(node.dataset.token).trim();
    }
  </script>`
});

await mkdir(DOCS, { recursive: true });
const ROBOTS = `User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`;

const PAGES = [
  { path: '/', priority: '1.0' },
  { path: '/privacy.html', priority: '0.5' }
];

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(({ path, priority }) => `  <url>
    <loc>${ORIGIN}${path}</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

await Bun.write(join(DOCS, 'index.html'), home);
await Bun.write(join(DOCS, 'privacy.html'), privacy);
await mkdir(join(DOCS, 'ui'), { recursive: true });
await Bun.write(join(DOCS, 'ui/index.html'), ui);
await Bun.write(join(DOCS, 'robots.txt'), ROBOTS);
await Bun.write(join(DOCS, 'sitemap.xml'), SITEMAP);
await Bun.write(join(DOCS, 'CNAME'), 'jobfill.app\n');
await Bun.write(join(DOCS, '.nojekyll'), '');

console.log('docs/ written: index.html, privacy.html, ui/index.html, robots.txt, sitemap.xml, CNAME');
