# JobFill Questions

An open record of how applicant tracking systems word their application questions, and
the service that collects it.

The rule the whole thing is built on: **the question is public, the answer is private.**
Every question on a Greenhouse form is shown to every applicant, and a dropdown's options
are the same for everyone who opens it. That text is worth writing down. What somebody
typed into it is theirs and never leaves their browser.

## Run it

```bash
bun install
bun run questions      # http://localhost:3100
```

That is the whole setup. Locally it runs on Bun over a SQLite file created on first write,
so there is nothing to install and nothing to configure. In production the same routes run
on a Cloudflare Worker over D1, which is SQLite as well, so the queries in
[`store.ts`](store.ts) are shared and only the driver differs.

To run it the way production does, against a local D1:

```bash
bun run questions:dev  # wrangler dev, D1 in miniflare
```

For a local run you usually want to see rows straight away, which the publication gate
would otherwise hold back:

```bash
QUESTIONS_THRESHOLD=1 bun run questions
```

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3100` | Port to listen on |
| `QUESTIONS_DB` | `questions.sqlite` | Where the database file lives |
| `QUESTIONS_THRESHOLD` | `5` | Separate reports a question needs before it is published |
| `QUESTIONS_RATE` | `30` | Reports accepted per minute per caller |

## Endpoints

| | |
|---|---|
| `POST /v1/reports` | Ingest. The only write path. |
| `GET /v1/questions` | The published dataset as JSON |
| `GET /v1/questions.csv` | The same rows as a spreadsheet |
| `GET /healthz` | Liveness, plus the limits in force |
| `GET /` | The dashboard |

## What stops bad data getting in

The client and the server share one validator, [`src/shared/questions.ts`](../src/shared/questions.ts),
so there is one definition of what a report may contain and it cannot drift between the two.
The server runs it again on arrival rather than trusting the extension that sent it, because
the promise is the server's to keep.

- **Unknown fields are refused**, not stripped. A report carrying anything the schema does
  not name is rejected whole, so a bug in the client fails loudly instead of leaking quietly.
- **Only the 25 known job boards** are accepted in `ats`. Never a URL, never a company.
- **Anything resembling personal data** in a question or an option, an email, a phone number,
  a URL, a long run of digits, an `@handle`, is refused.
- **Questions about race, gender, disability, veteran status, orientation, religion, marital
  status or age** are refused. They are standardised, so there is nothing to learn from them,
  and they are the ones where the question itself is sensitive.
- **Length and count caps** on every string and array.
- **Rate limited per caller.** The address is hashed with a salt made at process start and
  held in memory only; it is never written down.

## What stops good data identifying anybody

A report carries a random token that is made fresh for that one send and stored nowhere. It
exists so the server can count *separate* reports rather than separate people, and so one
sender cannot inflate that count by sending twice.

On top of that, a question is held back until **`QUESTIONS_THRESHOLD` separate reports** have
seen it. A question a company wrote for one candidate never reaches five, so it never
reaches the page. The dashboard shows how many are being held, because that number is
evidence the gate is doing something.

## Deploy

Pushing to `main` deploys it, through [`.github/workflows/questions.yml`](../.github/workflows/questions.yml),
which applies the schema and then runs `wrangler deploy`. By hand it is:

```bash
bun run questions:deploy
```

It runs on Cloudflare Workers with D1. Both free plans are far larger than this needs: 100k
requests a day and 100k row writes a day, against a dataset that grows by a handful of rows
per application. Nothing sleeps and nothing is deleted for being idle, so a quiet month
costs nothing and breaks nothing.

**The custom domain is attached once, by hand**, rather than declared here. In the
dashboard: **Workers & Pages -> jobfill-questions -> Settings -> Domains & Routes -> Add ->
Custom domain -> `questions.jobfill.app`**. Cloudflare creates the DNS record and the
certificate itself.

Keeping it out of `wrangler.toml` is deliberate. A route declared in config has to be
re-asserted on every deploy, which means the token this repository holds would need
`Zone -> Workers Routes -> Edit` on `jobfill.app` forever, to change something that changes
once. Attaching it by hand costs a minute and keeps the stored token account-scoped: it can
deploy code, and it cannot touch DNS.

`wrangler` is deliberately not a dependency of this repository. Anyone working on the
extension should not have to download it, so the two commands above reach for it with
`bunx` instead. It does want **Node 22 or newer**, which is the one thing about it that is
not optional; `bunx` will fetch wrangler happily and then wrangler will refuse to start.

## Keeping the data

Every night a workflow copies the published view into [`data/`](../data) and commits it, so
the dataset lives in git with a history as well as in D1. That is the backup, and it is the
answer to the only real risk here: not that the service falls over, but that a free tier
changes years from now. The rows would still be in the repository, and the endpoint is a
domain we own rather than a `workers.dev` address, so moving hosts is a DNS change rather
than a broken promise to everyone who already installed the extension.
