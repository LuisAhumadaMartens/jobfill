# JobFill Atlas

An open map of how applicant tracking systems word their application questions, and the
service that collects it.

The rule the whole thing is built on: **the question is public, the answer is private.**
Every question on a Greenhouse form is shown to every applicant, and a dropdown's options
are the same for everyone who opens it. That text is worth writing down. What somebody
typed into it is theirs and never leaves their browser.

## Run it

```bash
bun install
bun run atlas          # http://localhost:3100
```

That is the whole setup. The database is a SQLite file created on first write, so there is
nothing to install and nothing to configure.

For a local run you usually want to see rows straight away, which the publication gate
would otherwise hold back:

```bash
ATLAS_THRESHOLD=1 bun run atlas
```

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3100` | Port to listen on |
| `ATLAS_DB` | `atlas.sqlite` | Where the database file lives |
| `ATLAS_THRESHOLD` | `5` | Separate reports a question needs before it is published |
| `ATLAS_RATE` | `30` | Reports accepted per minute per caller |

## Endpoints

| | |
|---|---|
| `POST /v1/reports` | Ingest. The only write path. |
| `GET /v1/atlas` | The published dataset as JSON |
| `GET /v1/atlas.csv` | The same rows as a spreadsheet |
| `GET /healthz` | Liveness, plus the limits in force |
| `GET /` | The dashboard |

## What stops bad data getting in

The client and the server share one validator, [`src/shared/atlas.ts`](../src/shared/atlas.ts),
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

On top of that, a question is held back until **`ATLAS_THRESHOLD` separate reports** have
seen it. A question a company wrote for one candidate never reaches five, so it never
reaches the page. The dashboard shows how many are being held, because that number is
evidence the gate is doing something.

## Deploy

```bash
fly launch --copy-config --no-deploy
fly volumes create atlas_data --size 1
fly deploy
```

`fly.toml` suspends the machine when idle and wakes it on a request, so a service this quiet
costs nothing to leave running. Put Cloudflare in front for a second rate limit and to keep
the origin off the public record.

The database is a single file on the volume. Back it up with `fly ssh console -C "cat /data/atlas.sqlite" > backup.sqlite`,
or point Litestream at it if this ever gets busy enough to matter.
