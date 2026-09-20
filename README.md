# JobFill

A Chrome extension that fills job applications from answers you teach it once.

Paste your resume in and the name, email and links half of every application fills itself.
Everything else you answer once, in the page, and JobFill keeps both the answer and the way
that site worded the question. The next site that words it differently is one click.

It does nothing on a page until that site is one it supports or you turn it on yourself.

## When it runs

| | What happens | What Chrome asks |
|---|---|---|
| **Supported boards** | Runs on its own. Greenhouse, Lever, Ashby, Workday and ~20 more, listed in [`src/lib/sites.ts`](src/lib/sites.ts). | Named at install |
| **A site you turn on** | Tick **Always run on this site** in the popup. | One prompt, once per site |
| **Just this once** | Press **Run JobFill here**. Uses `activeTab`, forgotten when you leave. | Nothing |

Any site, including the supported ones, can be muted from the popup.

## What it does

- **Reads your resume in the browser.** PDF, DOCX or text, parsed locally with a vendored
  pdf.js. The file is never uploaded.
- **Recognises ~45 standard questions by shape**, so a board it has never seen still fills
  correctly the first time.
- **Learns the rest.** Answer in the panel and it is saved, along with that site's wording and
  the option it maps to.
- **Asks on submit.** Sending an application is the one moment the page holds finished answers,
  so JobFill offers what you typed and you tick what to keep.
- **Handles the markup ATSs ship**: `<label for>`, `aria-labelledby` on divs, placeholder-only
  fields, radio and checkbox fieldsets, custom comboboxes, and forms inside an iframe.
- **Keeps the whole resume**, not just the current job: every role with its dates and skills,
  every school, references, languages and certifications. Forms asking for several fill each in
  order, including dates split across separate month and year controls.
- **Keeps as many resumes as you do.** One is read for your details, another is the file
  employers receive. They can be the same.
- **Shows what an import would change** before it changes it, and applies only what you tick.
- **Never assumes your status.** Work authorization and sponsorship stay empty unless your
  resume states them.
- **Reads a US state as the whole address.** "San Francisco, CA" means California, which means
  the United States, so a result from another country is ruled out.
- **Reads a dropdown before typing into it**, because typing filters the list. It matches
  against what is actually offered and never commits a suggestion it did not match.
- **Survives framework-controlled forms.** Values go in through the native property setter so
  React's value tracker registers them. After filling it reads every field back and reports
  what the page took away, read-only, because a check that can re-fill can undo a right answer.
- **Never overwrites** what you typed, and **undoes a fill** for a minute and a half after.

## Install

```bash
bun install
bun run build     # -> dist/
```

`chrome://extensions` → Developer mode → **Load unpacked** → `dist/`.

<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> fills, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>
toggles the panel.

## Development

```bash
bun run dev          # rebuild dist/ on save
bun run playground   # fixture forms at localhost:3000
bun run dex          # the question bank at localhost:3100
bun run dex:data     # everything the dex has on record
bun run dex:review   # decide what gets published
bun run docs         # regenerate docs/ for jobfill.app
bun test             # 341 tests
bun run typecheck
bun run zip
```

The playground serves forms shaped like the real ones, including `react-board`, which
reproduces selects that silently revert anything written without the page noticing. The
scanner tests read the same fixtures.

> The extension has no server. Elysia earns its place as the local harness and as the dex.

## How it decides what goes where

Three passes, strongest first, in [`src/lib/matching/matcher.ts`](src/lib/matching/matcher.ts):

1. **Kind**, matched against ~45 patterns plus `autocomplete` and `name`, so it needs no
   history. Confidence 0.97.
2. **Exact**, the normalised label equals the question (0.99) or a wording you taught it (0.98).
3. **Fuzzy**, Dice over character bigrams blended with Jaccard over words, capped at 0.93 so a
   guess never outranks something known.

Above 0.62 it fills, below it asks. Normalisation is what makes this work: `First Name *`,
`first_name` and `Given name (required)` all reduce to `first name`.

Choosing the *option* is a second problem. Your answer is `B.S.`; the dropdown only offers
`Bachelor's Degree`, which shares almost no characters. Those equivalences are written down in
[`synonyms.ts`](src/lib/matching/synonyms.ts) at two strengths: same thing, and same family.

## Privacy

Your resume, profile and answers stay in `chrome.storage.local`. No analytics, no telemetry, no
remote code. This section is the policy; there is no separate page.

When JobFill cannot answer a question, the question is worth keeping even though your answer is
not: it is the wording every applicant to that board sees. Those collect on the **Contribute**
tab where you can read them.

| Sent | Never sent |
|---|---|
| The board, by name | Your answers, profile or resume |
| The question, as worded | The page address, company or role |
| The options offered | Any account, install or device id |
| The control, and what went wrong | Race, gender, disability, veteran status, orientation, religion, age |

Nothing can be sent until you allow it once, because the network permission is optional and
Chrome grants it only from a press. After that questions are shared as they are found, and
turning it off on the Contribute tab stops it immediately.

A question stays unpublished until five separate reports have seen it **and** a person has
approved it, so an endpoint anyone can post to cannot put anything on the public page. The
service is [`dex/`](dex/README.md); the published data is at
[dex.jobfill.app](https://dex.jobfill.app) and mirrored nightly into [`data/`](data).

## Layout

```
design/                  the tokens and primitives every surface is built from
docs/                    the site at jobfill.app, generated from design/
dex/                     the question bank: Elysia on Workers over D1
src/
  manifest.json          the job-board list is written in at build time
  shared/                types, the messaging protocol, the dex contract
  lib/                   answers, matching, resume readers, values, dex client
  content/               scanner, filler, the in-page panel
  background/            the hub: aggregates frames, relays actions, badge
  pages/                 options (one module per tab) and popup
assets/fonts/            Rajdhani and Share Tech Mono, vendored (SIL OFL)
vendor/pdfjs/            vendored PDF reader
tools/playground/        fixture server and forms
tests/                   bun test, happy-dom for the DOM-walking ones
scripts/                 build, icons, version, docs
```

## Releases

Every push to `main` that passes publishes a release with `jobfill-<version>.zip` attached.

**Major and minor you set by hand** in `src/manifest.json`; **the patch counts the releases
since that minor**. The release writes the version back and tags that commit, so `main` moves
when one goes out. Pull before your next push.

## Licence

[PolyForm Strict 1.0.0](LICENSE.md). © 2026 Luis Ahumada.

Noncommercial use only: personal, study, hobby, schools, charities, public research. Two
permissions are added so using and contributing work. You may keep your own copy, **a fork
included**, and change it **solely to prepare a pull request here**. You may not pass it on:
no extension store, no shipping it inside something else, no releasing your fork as its own.

Third-party: Rajdhani and Share Tech Mono under the SIL Open Font Licence
(`assets/fonts/OFL.txt`), pdf.js under Apache 2.0 (`vendor/pdfjs/LICENSE`).
