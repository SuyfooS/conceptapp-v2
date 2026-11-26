# measure/

Measuring the app at the size of a business of a few hundred people. What it
is and how to run it, for everyone: [docs/measure.md](../docs/measure.md).
This file is for whoever changes the code here.

So far (part 1a) it holds the test business alone: made in the database, checked,
and removed. The browser harness, the workflow and the measured screens come in
the next parts.

## The rules

- **Local only.** `scale/guard.ts` refuses any database but the local stack's
  (loopback, port 54322) and any run with `VERCEL` set; `scale/sql/00-guard.sql`
  then asks the database itself (dev.send_sms there, an empty Vault, every cron
  job off) before the seed writes and again after.
- **Nothing can be sent.** No phone in `auth.users`, logins at
  `scale.conceptapp.invalid`, display numbers from the fictional
  `+1 2NN 555 01xx` range, no push subscription. The only Israeli numbers are
  the import's block, 050-000-6100 to 6399, used in a rolled-back test alone.
  `tooling/measure-guards.test.ts` keeps the ids and numbers out of the rest
  of the repo.
- **Imports:** `@domain` and `@modules/<key>/manifest` only (Biome's `measure/**`
  override); never `@/…`, `@ui` or `@db`. Nothing in app/, packages/ or
  modules/ imports from here (tooling/boundaries.test.ts).
- **No migration, no change to `supabase/seed.sql`, `hosted-demo.sql`, `e2e/` or
  `playwright.config.ts`** for measuring.

## The test business

| File | What it does |
|---|---|
| `scale/ids.ts` | `SEED_VERSION`, the `5ca1e300` prefix, people's and rows' ids, fake names, fictional numbers, the import's block, and `choice`: md5 of the version, kind, subject and day, its first 8 hex digits over 2³². |
| `scale/shape.ts` | `shape({ people, depth, months, chat, anchor })`: every row, planned before anything is written. Pure: the same version and anchor give the same shape (`shapeHash`). |
| `scale/seed.ts` | `seedScaleBusiness(tx, shape)`: writes the shape part by part inside the caller's transaction, cleaning first, and checks every count after each part. `partData` is what each step is sent, `expectations` what each part must leave. |
| `scale/parts.ts` | Reads `scale/sql/*.sql` into steps and runs them: one statement after each `-- step: <name>` line, its rows in `$1` as a typed JSON parameter (`tx.json`, 2,000 at a time; a JSON string would be encoded twice), the run's settings from `current_setting('scale.…')`. A failure names the part, the step and the line; a step returning a `problem` column fails with each one. |
| `scale/sql/` | The parts, in order: guard, people, business, team, hours, chat, documents, lines, the history's log, weeks, days away, the waiting entries' log, counts. The weeks the app publishes and the days away it records come after the history's log, so their rows, the anchor's, are the newest by id, as the activity feed reads them. No dollar quotes and no DO blocks. |
| `scale/clean.ts` | `removeScaleBusiness(tx)`: Storage's rows, the purge, the businesses, the logins; then checks nothing of the prefix is left. |
| `scale/cost.ts` | The cost a month, as arithmetic from the counts and the tables' sizes: each table over the months its rows cover in the shape (`spansOf`), the bell's lines as held under the app's cleaning (`linesHeld`). |
| `scale/seed.run.ts`, `scale/clean.run.ts`, `seed.config.ts` | `pnpm measure:seed` and `pnpm measure:clean`, through Playwright (no browser, no web server), which runs TypeScript with the repo's aliases. |
| `scale/*.test.ts` | Unit tests, in `pnpm check`. |
| `scale/scale.db.test.ts` | The database job's test (`pnpm test:db`): 30 people with two months, then 300 with their team and next week, each in a transaction rolled back. |

### Adding to the seed

1. Plan the rows in `shape.ts`, with a unit test for their rule.
2. Add a step to the part's SQL: `-- step: <name>`, then one statement reading
   `jsonb_to_recordset($1::jsonb) as r (…)`. Write through the app's own
   functions where a write of the app has rules (publishing, saving a week, a
   day away, a named role), directly where it would only tell people (history).
3. Send its rows in `partData` (the columns of `as r (…)` and the keys sent are
   held equal by `scale/parts.test.ts`), and add what it leaves to
   `expectations` and `sql/99-counts.sql`.
4. An action written to `audit_log` must be one whose triggers tell nobody for
   the rows written, or the lines it writes must be counted in `expectations`.
