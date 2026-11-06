# ConceptApp v2

Operations app for small restaurants and cafés in Israel: staff scheduling,
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

CI runs Biome, the typecheck, the unit tests and a build on every push to `main` and every
pull request, and in a second job starts a local Supabase database, applies the migrations
and seed, runs the pgTAP tests and the database lint, and checks the generated types.

## Plan and decisions

- App Design Document: https://claude.ai/code/artifact/ccdf7f39-afc1-4d64-aca5-0a7b918723b9
- Business Model: https://claude.ai/code/artifact/be1331db-bb49-470c-8abc-53d6b109e5c1
- Supabase guide (Hebrew: why, setup, keys, costs): https://claude.ai/code/artifact/bac793ad-cea3-43b6-a0be-e79733c10043
- Nightly agent: brief in `docs/AGENT.md`, log in `docs/agent/LOG.md`

## Structure

See `CLAUDE.md` for the layout, the UI rules and the working agreement.

## Status

Phase 0 — Foundations.

- [x] Chunk 1: project skeleton (Next.js, TypeScript, Tailwind tokens, Hebrew RTL, Heebo, Biome, CI)
- [x] Chunk 2: design system components and the `/design` gallery
- [x] Chunk 2b: responsive app shell — phone tabs, tablet rail, desktop sidebar — and the `/design/shell` demo
- [ ] Chunk 3: Supabase schema with RLS and isolation tests
- [ ] Chunk 4: phone OTP login and an empty home in the business accent
