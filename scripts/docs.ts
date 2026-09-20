import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { page } from '../design/index.ts';
import { ATS_HOSTS } from '../src/lib/sites.ts';

const ROOT = dirname(import.meta.dir);
const DOCS = join(ROOT, 'docs');

const SITE = `
  main { max-width: 820px; margin: 0 auto; padding: 56px 22px 110px; }
  nav { display: flex; gap: 18px; align-items: center; margin-bottom: 44px; font-size: 14px; }
  nav .brand { font-weight: 900; font-size: 17px; letter-spacing: -0.02em; margin-right: auto; }
  nav a { text-decoration: none; color: var(--fg-muted); font-weight: 700; }
  nav a:hover { color: var(--fg); }
  h1 { font-size: 42px; letter-spacing: -0.04em; margin: 0 0 14px; line-height: 1.05; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-faint); margin: 52px 0 16px; }
  h3 { font-size: 17px; margin: 30px 0 8px; letter-spacing: -0.01em; }
  p { color: var(--fg-muted); line-height: 1.7; max-width: 68ch; }
  .lede { font-size: 18px; color: var(--fg-muted); line-height: 1.6; max-width: 62ch; }
  .cta { display: flex; gap: 12px; flex-wrap: wrap; margin: 30px 0 8px; }
  .cta a { text-decoration: none; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
  .card { background: var(--raise); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 20px 22px; }
  .card h3 { margin: 0 0 7px; font-size: 15px; }
  .card p { margin: 0; font-size: 14px; }
  ul { color: var(--fg-muted); line-height: 1.8; max-width: 68ch; }
  li strong { color: var(--fg); }
  .boards { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 4px; }
  .boards span { background: var(--raise); border: 1px solid var(--line); border-radius: var(--r-pill);
                 padding: 4px 11px; font-size: 12.5px; color: var(--fg-muted); }
  footer { margin-top: 70px; padding-top: 24px; border-top: 1px solid var(--line);
           color: var(--fg-faint); font-size: 13px; line-height: 1.8; }
  code { background: var(--raise); border: 1px solid var(--line); border-radius: var(--r-sm);
         padding: 1px 6px; font-size: 0.9em; }
`;

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
<style>${page()}${SITE}${extra}</style>
</head>
<body>
<main>
  <nav>
    <span class="brand">JobFill</span>
    <a href="/">Home</a>
    <a href="/privacy.html">Privacy</a>
    <a href="/ui">Design</a>
    <a href="https://dex.jobfill.app">Dex</a>
    <a href="https://github.com/LuisAhumadaMartens/jobfill">GitHub</a>
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
    JobFill fills in job applications from answers you teach it once. Paste your resume in at
    the start, and the name, email and links half of every application fills itself. Everything
    else you answer once, in the page, and it remembers both the answer and the way that site
    worded the question.
  </p>

  <div class="cta">
    <a class="primary" href="https://github.com/LuisAhumadaMartens/jobfill/releases/latest">Download the latest build</a>
    <a class="ghost" href="https://github.com/LuisAhumadaMartens/jobfill">Read the source</a>
  </div>
  <p style="font-size:13.5px">Free, and it stays on your machine. No account, and nothing to pay for.</p>

  <h2>What it does</h2>
  <div class="cards">
    <div class="card">
      <h3>Reads your resume here</h3>
      <p>PDF, DOCX or plain text, parsed inside your browser. The file is never uploaded anywhere.</p>
    </div>
    <div class="card">
      <h3>Knows the standard questions</h3>
      <p>About 45 of them by shape, so a job board it has never seen still fills correctly the first time.</p>
    </div>
    <div class="card">
      <h3>Learns the rest as you go</h3>
      <p>Answer once in the panel and it is saved, along with that site's exact wording.</p>
    </div>
    <div class="card">
      <h3>Asks before it keeps anything</h3>
      <p>When you submit, it offers what you typed and you tick what is worth remembering.</p>
    </div>
  </div>

  <h2>Where it runs</h2>
  <p>
    Nothing happens on a page until the site is one of the job boards it supports, or you turn it
    on there yourself. It is off everywhere else, by default and by design.
  </p>
  <div class="boards">${ATS_HOSTS.map((host) => `<span>${host}</span>`).join('')}</div>

  <h2>Install it</h2>
  <p>
    Download the zip from the latest release, unzip it, open <code>chrome://extensions</code>,
    turn on Developer mode, and choose <strong>Load unpacked</strong> on the unzipped folder.
    The setup page opens on first install. Start on the Resume tab.
  </p>`
});

const privacy = shell({
  title: 'JobFill privacy',
  description: 'What JobFill stores, where it stores it, and the one thing that ever leaves your machine.',
  path: '/privacy.html',
  body: `  <h1>Privacy</h1>
  <p class="lede">
    JobFill holds a resume, a profile and a list of answers. All of it stays in this browser
    profile, on your machine. There is no account, no server it reports to, and no network
    request it makes on its own.
  </p>

  <h2>What is stored, and where</h2>
  <ul>
    <li><strong>Your resume file and its text</strong>, in <code>chrome.storage.local</code> on this computer.</li>
    <li><strong>Your profile</strong>: name, email, phone, address, links, work history, education, skills, references, languages and certifications.</li>
    <li><strong>Your answers</strong>, and the wordings each site used for the questions they answer.</li>
    <li><strong>Your settings</strong>, including which sites JobFill is allowed to run on.</li>
  </ul>
  <p>
    None of it is transmitted. Uninstalling the extension removes all of it. You can erase it at
    any time from the Settings tab, and export it as a JSON file you keep.
  </p>

  <h2>The one thing that can leave</h2>
  <p>
    When JobFill cannot answer a question, the question is worth keeping even though your answer
    is not: it is the same wording every applicant to that job board sees. Those collect on the
    <strong>Contribute</strong> tab, in your browser, where you can read every one.
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
    A report carries a random token made fresh for that one send and stored nowhere. It exists so
    separate reports can be counted, not so people can be. Two reports cannot be linked to one
    person, because there is nothing in them to link.
  </p>

  <h2>What happens to a sent question</h2>
  <p>
    It is held until five separate reports have seen the same question, so a question one company
    wrote for one candidate never reaches anyone. After that it waits to be read and approved by
    hand. Only then does it appear on <a href="https://dex.jobfill.app">the public dex</a>.
  </p>

  <h2>No analytics, ever</h2>
  <p>
    No analytics, no tracking, no advertising identifiers, no remote code, and nothing sold or
    shared with anybody. JobFill contains no third-party code that phones home. The PDF reader and
    the fonts are bundled inside the extension.
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
    Everything JobFill draws comes from one place. This page renders it from that same source,
    so what you see here is what ships: if a value changes, this changes with it, and if it drifts
    the drift is visible.
  </p>
  <p class="note">
    Colours are read out of the live stylesheet rather than written down again, which is the only
    way a page like this can be trusted.
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
  <p class="note">Every one of these has a light-mode value too. Change your system theme and this page follows.</p>

  <h2>Type</h2>
  <div class="type">
    <div style="font-size:42px;letter-spacing:-0.04em;font-weight:900">Lato Black, 42</div>
    <div style="font-size:26px;letter-spacing:-0.02em;font-weight:700">Lato Bold, 26</div>
    <div style="font-size:17px">Lato Regular, 17</div>
    <div style="font-size:14px;color:var(--fg-muted)">Lato Regular, 14, muted</div>
    <div style="font-size:12px;color:var(--fg-faint);text-transform:uppercase;letter-spacing:0.07em;font-weight:700">Lato Bold, 12, a label</div>
    <div style="font-size:15px;font-style:italic">Lato Italic, 15</div>
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
