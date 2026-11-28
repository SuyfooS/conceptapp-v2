# ConceptApp v2

Operations app for small businesses of every kind in Israel: staff scheduling,
time clock, table reservations and a public page. Hebrew first, RTL,
phone first.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
Radix-based components in `packages/ui` · Supabase (Postgres + RLS, phone OTP,
Realtime) · Biome · pnpm · Vercel.

## Getting started

Requires Node 22 and pnpm.

```
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:3000.

Environment variables are listed in `.env.example`. Copy it to `.env.local`
when Supabase is connected (phase 0, chunk 3).

### Notifications on the phone

Notifications always reach the app. They reach phones too (Web Push, free, no payload)
once these are set; without them the app says nothing about phones and shows no error.

| Variable | What | Where |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | The key browsers subscribe with (public) | Vercel, `.env.local` |
| `VAPID_PRIVATE_KEY` | Its private half: a secret | Vercel (Sensitive), `.env.local` |
| `VAPID_SUBJECT` | A `mailto:` address push services may write to | Vercel, `.env.local` |
| `CRON_SECRET` | What the database's jobs send to `/cron/notifications` (every minute), `/cron/list-photos` (once a day: lists' photos and leftover profile photos) and `/cron/chat-files` (every 10 minutes while a chat file is due): a secret of its own, 32+ characters | Vercel (Sensitive), Supabase Vault as `cron_secret` |
| `PUSH_TEST_ORIGIN` | The browser tests' mock push service, never on Vercel | CI only |

Locally, `node tooling/vapid-keys.mjs` prints a fresh pair for `.env.local`. CI makes its
own pair and secret on every run; nothing is committed.

For production, once, on Orel's computer (PowerShell, one command per line, in the repo
after `git pull`):

```
node tooling/vapid-keys.mjs
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The first prints `VAPID_PUBLIC_KEY=…` and `VAPID_PRIVATE_KEY=…`, the second the cron secret.
Keep them out of chats and files. In Vercel, Settings, Environment Variables, for
Production only (previews stay in the app only): add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
(Sensitive), `VAPID_SUBJECT` (`mailto:` and an address you read) and `CRON_SECRET`
(Sensitive), then redeploy. A new pair later stops every phone's notifications until the
app is opened there again, so make it once. The database half (Vault) is in
`supabase/README.md`.

### Production

The step-by-step setup for a first real business, in Hebrew for Orel, is
[`docs/production.md`](docs/production.md): the project, its secrets, the sign-in settings,
Vercel and what to watch. The code's side of it:

| Variable | What | Where |
| --- | --- | --- |
| `DEMO_DOOR` | The demo door on this site: `on` (the default when unset) offers the demo people at `/enter`; `off` closes them, their one-press sign-in and the demo reset, and `/enter` goes straight to `/sign-in`. Read when the site is built, so a change takes a Redeploy, and anything else fails the build | Vercel: `on` on the demo's own project, `off` on the site of real businesses |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile's public Site Key for the "אני לא רובוט" check before every SMS code (sign-in, joining, the file codes). Unset: Cloudflare's always-passing test key, as locally and in CI; another shape fails the build. Supabase's CAPTCHA, with the widget's Secret Key, goes on only after it (`docs/production.md`, Turnstile) | Vercel: `Production` and `Preview`, never the Secret Key |

- Migrations reach each hosted project only by hand: "Migrate conceptapp-dev"
  (`.github/workflows/migrate-dev.yml`) for the demo's project, in the GitHub environment
  `conceptapp-dev`, which Orel limits to `main` and gives the database's two secrets
  (`docs/production.md`, A1), and "Migrate conceptapp-prod"
  (`.github/workflows/migrate-prod.yml`) for real businesses, from `main` only, in the GitHub
  environment `conceptapp-prod` that waits for Orel's approval, never with the demo
  (`supabase/README.md`).
- Once production is live, `main` deploys the demo's site alone. The site of real businesses
  deploys the branch `production` (its Vercel project's production branch), which only Orel
  moves forward, after Migrate conceptapp-prod has applied: a run with "apply" on ends its
  summary with the commit and the two lines that release it, a fast-forward that is never
  forced. Nobody else pushes to `production`.
- `GET /health` (or `HEAD`) answers 200 with `{"status":"ok"}` from the running server, for an
  uptime monitor. It doesn't ask the database.
- `node tooling/check-site.mjs <address>` checks one site from outside, on Node 20 with
  nothing installed and no secret, one GET per address and no redirect followed: `/health`
  answers 200, `/health/db` too once a site has it (until then it says so and doesn't fail),
  whether `/enter` goes on to `/sign-in` (the door closed) or is open, that `/sign-in`'s
  Turnstile `data-sitekey` is none of Cloudflare's test keys, and the security headers of
  `@domain/security-headers`, named but never their values. It answers in Hebrew and exits 1
  when something failed (`docs/production.md`, Turnstile step 4 and B7;
  `tooling/check-site.test.ts`, with a fake fetch).
- `node tooling/backup-files.mjs [folder]` backs up the files Supabase's database backup
  doesn't hold (it keeps their rows, not the files): every object of the buckets the
  migrations create (`avatars`, `list-photos`, `chat-files`, `documents`), listed page by
  page and downloaded into a dated folder outside any git checkout (the repo refused by its
  words and by where its links lead), with a manifest of each file's bucket, path, size,
  content type and SHA-256, then encrypted into one file (AES-256-GCM, the key from scrypt
  on a passphrase with a random salt; the parameters, IV and tag in a 1 KB header), opened
  again and checked, and only then the plain folder deleted. `node tooling/restore-files.mjs
  <file> [--overwrite]` reads a backup to its end and checks every SHA-256, then uploads it
  to a project typed twice that is neither conceptapp-dev's, production's nor the backup's
  own, refusing to overwrite unless asked. Both take the secret key and the passphrase (and
  the backup the address) at a question with nothing echoed (the backup also takes
  `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` from the session, never from a
  file), print counts and never a
  file's name, run on Node 20 with nothing installed (Storage's REST API through Node's
  fetch: `@supabase/supabase-js` can't make a client on Node 20), and refuse to run where
  `CI` or `GITHUB_ACTIONS` is set: only Orel runs them, on his computer
  (`docs/production.md`, B8; `tooling/backup-files.test.ts` and
  `tooling/restore-files.test.ts`, with a fake storage client). Against the local stack:
  `http://127.0.0.1:54321` and `SECRET_KEY` from `pnpm exec supabase status -o env`, and
  `local` as the project to restore to.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm build` | Production build |
| `pnpm check` | Biome lint/format check + TypeScript + unit tests |
| `pnpm test` | Unit tests (Vitest) for `packages/domain` |
| `pnpm lint:fix` | Apply Biome fixes and formatting |
| `pnpm db:start` | Local Postgres (Supabase CLI, needs Docker) with migrations and seed |
| `pnpm db:test` | pgTAP tests: RLS and tenant isolation |
| `pnpm db:reset` | Re-apply migrations and seed |
| `pnpm db:types` | Regenerate `packages/db/database.types.ts` |

CI runs three jobs on every pull request: `check` (Biome, the typecheck, the unit tests and a
build with the demo door closed, `DEMO_DOOR=off`, which `.github/scripts/door-closed.sh` then
serves and asks for `/health`, `/enter` and `/home` going on to `/sign-in`, and no way to the
demo there), `database` (a local Supabase database with the migrations and seed, the pgTAP tests,
the database lint and the generated types) and `e2e` (Playwright at 390, 820 and 1440 against
a build with the demo door open and a local Supabase, once the other two pass: six jobs side
by side, each size in two parts by file with `--shard`, each with its own database, and beside
them `e2e (first day)`: `e2e/first-day.spec.ts` alone, a new worker from the link to the
clock, in WebKit at 390 and in Chromium at 320, set up as the six are). A push to `main` runs them again, unless that exact tree already
passed all three in a pull request run created the same day in Israel
(`.github/scripts/tested-tree.sh`). Actions → CI → Run workflow forces a full run on `main`.
The ruleset Orel sets on `main` (`docs/production.md`, A1) requires every job by the name
GitHub shows it: `gate`, `check`, `database`, the six `e2e (<size> <part>/2)` and
`e2e (first day)`. The doc
lists them, and `tooling/production-doc.test.ts` fails when CI gains a job the list lacks.

## Plan and decisions

- App Design Document: https://claude.ai/code/artifact/ccdf7f39-afc1-4d64-aca5-0a7b918723b9
- Business Model: https://claude.ai/code/artifact/be1331db-bb49-470c-8abc-53d6b109e5c1
- Supabase guide (Hebrew: why, setup, keys, costs): https://claude.ai/code/artifact/bac793ad-cea3-43b6-a0be-e79733c10043
- Nightly agent: brief in `docs/AGENT.md`, log in `docs/agent/LOG.md` (older entries in `docs/agent/log/`)

## Structure

See `CLAUDE.md` for the layout, the UI rules and the working agreement.

## Status

What exists, what works and what comes next: [`docs/ROADMAP.md`](docs/ROADMAP.md).
