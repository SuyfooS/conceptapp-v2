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
| `CRON_SECRET` | What the database's jobs send to `/cron/notifications` (every minute), `/cron/list-photos` (once a day) and `/cron/chat-files` (every 10 minutes while a chat file is due): a secret of its own, 32+ characters | Vercel (Sensitive), Supabase Vault as `cron_secret` |
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
build), `database` (a local Supabase database with the migrations and seed, the pgTAP tests,
the database lint and the generated types) and `e2e` (Playwright at 390, 820 and 1440 against
a build and a local Supabase, once the other two pass). A push to `main` runs them again, unless that exact tree already
passed all three in a pull request run created the same day in Israel
(`.github/scripts/tested-tree.sh`). Actions → CI → Run workflow forces a full run on `main`.

## Plan and decisions

- App Design Document: https://claude.ai/code/artifact/ccdf7f39-afc1-4d64-aca5-0a7b918723b9
- Business Model: https://claude.ai/code/artifact/be1331db-bb49-470c-8abc-53d6b109e5c1
- Supabase guide (Hebrew: why, setup, keys, costs): https://claude.ai/code/artifact/bac793ad-cea3-43b6-a0be-e79733c10043
- Nightly agent: brief in `docs/AGENT.md`, log in `docs/agent/LOG.md`

## Structure

See `CLAUDE.md` for the layout, the UI rules and the working agreement.

## Status

What exists, what works and what comes next: [`docs/ROADMAP.md`](docs/ROADMAP.md).
