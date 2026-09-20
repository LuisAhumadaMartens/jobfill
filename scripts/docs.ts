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

function shell(title: string, description: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<style>${page()}${SITE}</style>
</head>
<body>
<main>
  <nav>
    <span class="brand">JobFill</span>
    <a href="/">Home</a>
    <a href="/privacy.html">Privacy</a>
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

const home = shell(
  'JobFill',
  'A Chrome extension that fills in job applications from answers you teach it once.',
  `  <h1>Stop retyping the same answers.</h1>
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
);

const privacy = shell(
  'JobFill privacy',
  'What JobFill stores, where it stores it, and the one thing that ever leaves your machine.',
  `  <h1>Privacy</h1>
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
    <strong>Nothing is sent unless you press send.</strong> The permission to reach the network is
    optional, so the browser does not grant it until the first time you choose to. If you never
    press it, JobFill never makes a network request at all.
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
);

await mkdir(DOCS, { recursive: true });
await Bun.write(join(DOCS, 'index.html'), home);
await Bun.write(join(DOCS, 'privacy.html'), privacy);
await Bun.write(join(DOCS, 'CNAME'), 'jobfill.app\n');
await Bun.write(join(DOCS, '.nojekyll'), '');

console.log('docs/ written: index.html, privacy.html, CNAME');
