# JobFill

A Chrome extension that fills in job applications from answers you teach it once.

Paste your resume in at the start, and it fills the name/email/links half of every
application on its own. For everything else ("are you legally authorized to work in
the United States?", "what are your compensation expectations?", "why us?") you answer
it once, in the page, and JobFill remembers both the answer *and* the way that site
worded the question. The next site that words it differently is a one-click confirm,
and after that it is automatic.

Everything lives in your browser profile. There is no account, no server, and no
network call anywhere in the extension, and it does nothing at all on a page until
that site is one it supports or you turn it on yourself.

## When it runs

JobFill is off by default. There are three ways it ends up running on a page, and the
popup tells you which one you are in:

| | What happens | What Chrome asks |
|---|---|---|
| **Supported job boards** | Runs on its own. Greenhouse, Lever, Ashby, Workday, Workable, SmartRecruiters, iCIMS, Taleo and ~17 more. The list is [`src/lib/sites.ts`](src/lib/sites.ts), and the build writes it into the manifest. | Named at install, nothing later |
| **A site you turn on** | Tick **Always run on this site** in the popup. From then on it starts there by itself, because the background registers a content script for that origin. | One permission prompt, once per site |
| **Just this once** | Press **Run JobFill here**. Uses `activeTab`, so it works on the page you are looking at and is forgotten when you leave. | Nothing |

That covers the case you actually hit: most applications are on the job boards above and
just work, and a company hosting its own form at `careers.acme.com` is one tick away.
That tick is remembered, so you only do it the first time you apply there.

Every site, including the supported boards, can be muted from the popup.

## What it does

- **Reads your resume in the browser.** PDF, DOCX or plain text, parsed locally with a
  vendored copy of pdf.js, and the file is never uploaded. Fills in name, email, phone,
  location, LinkedIn/GitHub/site, current role, school, degree, graduation, GPA.
- **Recognises ~45 standard questions by shape**, not by having seen the site before, so
  a brand new ATS still fills correctly on the first visit.
- **Asks to keep your answers when you submit.** Sending an application is the one
  moment the page holds finished answers: everything typed by hand, corrected, or
  picked from a dropdown. JobFill captures it before the page navigates, then offers
  the list: new answers to save, existing ones you answered differently this time, and
  wordings it had not seen. You tick what to keep; nothing is saved on its own.
- **Learns the rest as you go.** Answer a question in the panel and it is saved. Confirm
  a guess and that site's exact wording is added to that answer's aliases.
- **Learns option wording too.** Your answer is `Yes`; the site offers
  "I am authorized to work in the US without sponsorship". Once you accept that mapping
  it is stored on the answer and reused.
- **Handles the markup ATSs actually ship**: `<label for>`, `aria-labelledby` on divs,
  placeholder-only fields, radio/checkbox fieldsets, custom comboboxes with a listbox,
  and applications embedded in an iframe on a careers page.
- **Keeps as many resumes as you do.** One is read for your details and can be as long
  as you like; another is the file employers receive and is usually shorter. Which does
  which is yours to set, and they can be the same file.
- **Shows what an import would change before it changes it.** Reading a resume lists
  every difference against what you already have, with both sides side by side, and
  applies only what you tick. Roles and schools it already knows are not offered again,
  and nothing you edited by hand is quietly replaced.
- **Keeps the whole resume**, not just the current job: every role with its dates and the
  skills named in it, every school, and your skills as a list. Forms that ask for several
  jobs, schools or references fill each one in order, including dates split across
  separate month and year controls.
- **Never assumes your status.** Work authorization and visa sponsorship start empty and
  are answered from your resume only when it states them.
- **Writes `{company}` and `{role}` into long answers** from whatever the page is
  advertising, so one cover letter adapts itself.
- **Refuses answers that cannot fit.** A phone number is not something a dropdown
  offers, so a phone answer is never proposed for one however the label reads.
- **Reads a US state as the whole address.** "San Francisco, CA" means California, and
  California means the United States, so a search box is asked in the forms it
  understands (the spelled-out state, then the city alone) and any result from another
  country is ruled out, even though the answer never named one.
- **Compares places part by part.** A location answer is split into city, state and
  country and each part compared on its own, because the two hardest cases both defeat
  string similarity: "San Francisco, CA" and "San Francisco, California, United States"
  are the same place sharing half their characters, while "San Francisco, Cebu,
  Philippines" is a different continent that reads almost identically. A part that
  disagrees rules the option out; when two options are equally plausible, the field is
  left for you rather than guessed. See [`src/lib/matching/places.ts`](src/lib/matching/places.ts).
- **Knows which cities are where.** The metros job posts ask about are written down, so
  "are you based in or willing to relocate to the Bay Area?" answers itself when you
  live in Oakland. It only ever derives a *yes* from where you already are. Whether you
  would move is yours to say.
- **Reads a dropdown before typing into it.** Typing filters the list, so typing "B.S."
  into a Degree dropdown removes "Bachelor's Degree" from it. JobFill opens the list,
  matches against what is actually offered, and only types for search-as-you-type boxes.
  It never commits a suggestion it did not match, which is how you end up living in
  San Francisco, Cebu. Search boxes answer late and show the previous query's results
  while they do, so it waits for the list to actually change before deciding nothing
  fits, and it never fills a field twice by itself.
- **Survives framework-controlled forms.** Values go in through the native property
  setter so React's value tracker registers the change. Otherwise the field looks filled
  and silently reverts on the next render. After filling, JobFill reads every field back
  and flags anything the page took away, or quietly replaced with something else,
  rather than claiming it worked. That check is strictly read-only: a check that can
  re-fill is a check that can undo a correct answer.
- **Works when the application is an iframe** on a company careers page: the background
  aggregates every frame, and the frame holding the form is the one that draws the panel.
- **Never overwrites** anything already typed (configurable), and never fills a field it
  is not confident about. Those show up as a suggestion you confirm with one click.
- **Undoes a fill.** Every field is remembered as it was, and one click puts them all
  back for a minute and a half afterwards.
- **Answers can apply to one site only**, for the question a particular board words in a
  way you want handled differently.

## Install

```bash
bun install
bun run build     # -> dist/
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
choose the `dist/` folder. The setup page opens on first install; start on the
**Resume** tab.

Shortcuts: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> fills the page,
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd> toggles the panel.

## Development

```bash
bun run dev          # rebuild dist/ on save
bun run playground   # fixture application forms at localhost:3000
bun run atlas        # the question atlas at localhost:3100
bun test             # 274 tests
bun run typecheck    # tsc --noEmit, strict
bun run zip          # build + package for the Chrome Web Store
```

The playground is an [Elysia](https://elysiajs.com) server that serves fake application
forms shaped like the real ones: classic ATS markup, a placeholder-only form, a
Workday-style page with div labels and a custom combobox, a careers page that embeds an
application in an iframe, and `react-board`, which reproduces the newer Greenhouse
boards: selects controlled by page state that revert anything written without the page
noticing, and a combobox whose menu renders in a portal. The scanner tests read the same fixtures, so a form that
works in the playground is a form the tests cover.

> Note: the extension itself has no server. It is a browser extension, and all its state
> is `chrome.storage.local`. Elysia earns its place here as the local test harness.

## How it decides what goes where

Three passes, strongest first, in `src/lib/matching/matcher.ts`:

1. **Kind**: the question is matched against ~45 patterns (`src/lib/answers/schema.ts`), plus
   the field's `autocomplete` token and `name`/`id`. Deterministic, so it needs no
   history. Confidence 0.97.
2. **Exact**: the normalised label equals the answer's question (0.99) or one of the
   wordings you have taught it (0.98).
3. **Fuzzy**: Dice coefficient over character bigrams blended with Jaccard over content
   words, capped at 0.93 so a guess never outranks something known.

Above `fillConfidence` (0.62 by default) JobFill fills. Between that and
`suggestConfidence` it offers. Below, it asks.

Normalisation is what makes this work: `First Name *`, `first_name`, and
`Given name (required)` all reduce to `first name`, and `U.S.` expands to
`united states` before anything is compared.

Choosing the *option* is a second problem. Your answer says `United States`; the form
offers `United States of America`, or `USA`, or `US`. Your degree is `B.S.`; the dropdown
only has `Bachelor's Degree`. Similarity is no help there, since `BS` and `Bachelor's Degree`
share almost no characters, so the equivalences are written down in
[`src/lib/matching/synonyms.ts`](src/lib/matching/synonyms.ts) at two strengths: *same thing* (`USA` =
`United States of America`, trusted like an exact match) and *same family* (`B.S.` will
take `Bachelor's Degree`, but only when nothing more exact is offered, so `Bachelor of
Science` still beats it). US state codes are in there too, consulted only for lists long
enough to actually be state lists, because otherwise `OR` starts meaning Oregon.

On top of that, whenever you confirm a mapping on a real form, that site's exact option
wording is saved onto the answer, so the next visit needs no inference at all.

## Layout

```
src/
  manifest.json          MV3 manifest; the job-board list is written in at build time
  shared/
    types.ts             the shapes everything agrees on
    messages.ts          the content <-> background <-> UI protocol
  lib/
    answers/             the library: schema, storage, and what to save after applying
    matching/            normalisation, similarity, synonyms, places, verification
    resume/              PDF / DOCX / text readers and the extraction heuristics
    sites.ts             job boards JobFill runs on without being asked
  content/
    content-script.ts    per-frame orchestration
    scanner.ts           finds the questions and their labels
    filler.ts            puts values in so the page believes them
    panel.ts / panel.css the in-page panel (shadow DOM)
  background/
    service-worker.ts    the hub: aggregates frames, relays actions, badge
  pages/
    options/             resume import, profile, answer library, settings
    popup/               quick status, filling, per-site control
assets/fonts/            Lato, vendored (SIL OFL)
vendor/pdfjs/            vendored PDF reader, with types
atlas/                   the question atlas: Elysia service, SQLite, public dashboard
tools/playground/        Elysia fixture server + forms
tests/                   bun test, with happy-dom for the DOM-walking ones
scripts/build.ts         Bun bundler -> dist/
scripts/icons.ts         draws the extension icons at build time
```

## Privacy

No analytics, no telemetry, no remote code, and no network request JobFill makes on its
own. Your resume, your answers and your profile stay in `chrome.storage.local` on this
machine. Exports leave out the resume binary on purpose, and carry everything else:
answers, profile, work history, education, skills, references, languages and
certifications.

There is exactly one way anything leaves, and you press it. See [Contributing
questions](#contributing-questions).

## Contributing questions

When JobFill cannot answer a question, the question is worth keeping even though the
answer is not: it is the same wording every applicant to that board sees. Those pile up
on the **Contribute** tab, in this browser, and you can read every one before deciding.

The rule the whole thing is built on: **the question is public, the answer is private.**

| Sent, if you press send | Never sent |
|---|---|
| The job board, by name | Your answers, profile or resume |
| The question, as the page words it | The page address, the company, the role |
| The options the page offered | Any account, install or device id |
| The control, and what went wrong | Race, gender, disability, veteran status, orientation, religion or age |

Nothing is sent on its own, ever. The network permission is optional, so Chrome does not
even grant it until the first time you choose to send. There is no identifier of any kind
in a report, so two reports cannot be tied to one person, and a question stays unpublished
until five separate reports have seen it, which is how a question one company wrote for
one candidate never reaches the public page.

Everything published is at [`atlas/`](atlas/README.md), which is the service, the
dashboard and the rules, all in this repository. The extension and the server share one
validator, [`src/shared/atlas.ts`](src/shared/atlas.ts), so what may be collected has a
single definition and the server re-checks it on arrival rather than trusting the
extension that sent it.

## Releases

Every push to `main` that passes the checks publishes a release: the workflow builds,
packages `jobfill-<version>.zip` and attaches it to a tagged GitHub release, so a build
can be downloaded without cloning anything.

Versions are `major.minor.patch`. **Major and minor you set by hand** in
`src/manifest.json`; **the patch is worked out from the tags**, counting releases since
that minor. Raising the minor in the manifest restarts the patch at zero.

The release then writes that version back into `src/manifest.json` and commits it as
`Release vX.Y.Z`, so the version the extension reports in `chrome://extensions` is the
version of the release it came from. The tag points at that commit. That push does not
start a run of its own, because GitHub does not raise workflow events for anything
pushed with the built-in `GITHUB_TOKEN`; if the push ever moves to a token that does,
the release job still stops on its own, since the commit it would act on is already
tagged. It does mean `main` moves when a release goes out, so pull before your next
push.

```bash
bun run scripts/version.ts                        # what the next release would be
bun run scripts/version.ts --write                # and write it into the manifest
bun run scripts/build.ts --zip --version 1.2.3    # build and package a specific version
```

## Publishing

`bun run zip` produces `jobfill-<version>.zip` ready for the Chrome Web Store. The
listing will need a privacy policy written for it. The permission story is the easy one
to justify: `host_permissions` names ~25 job boards rather than every site, and anything
else goes through `optional_host_permissions` at the user's request. There is no remote
code, since pdf.js and Lato ship inside the package.

## Licence

[PolyForm Strict 1.0.0](LICENSE.md). © 2026 Luis Ahumada.

Use it for any **noncommercial** purpose: personal study, hobby projects, and use by
schools, charities, public research and government are all named in the licence. What
it does not allow is commercial use, redistribution, or changing the software.

Two permissions are added on top, so that using and contributing still work. You may
keep your own copy, **a fork included**, for personal use or to prepare a
contribution, and you may change that copy **solely to prepare, test and submit a pull
request here**. What you may not do is pass it on: no publishing it to an extension
store, shipping it inside something else, offering it as a service, or releasing your
fork as its own thing.

Third-party components keep their own terms: Lato under the SIL Open Font Licence
(`assets/fonts/OFL.txt`) and pdf.js under Apache 2.0 (`vendor/pdfjs/LICENSE`).
