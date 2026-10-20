# Agent log

Newest entry on top. One entry per run: date, chunk, what changed, commit,
what is next, defaults applied.

## 2026-10-20 · run 10 · chunk 1c-3 (staff list and checklist)

- Wizard step 4 "צוות": paste a staff list, one person per line (name and
  mobile in any order; commas, tabs or dashes; an optional role word such
  as בעלים, מנהל/ת, אחמ"ש, owner). A live preview shows who will be
  invited with their role, and names each line to fix by number (no
  number, not an Israeli mobile, no name, a repeated number). Optional;
  at most 60 people. New `TextArea` in `@ui/text-field`, on `/design`.
- `@domain/staff-list` (`parseStaffList`) and `@domain/setup`
  (`setupChecklist`); `parseNewBusiness` gains `staff`.
- Migration `20261020000100_business_staff.sql`: `invites.full_name`; one
  open invite per number in a business (partial unique index);
  `create_business(…, staff jsonb)` invites everyone in the same
  transaction and counts them in the audit log. Each invite gets a random
  token of which only the hash is kept, so sending (1d) issues a fresh one.
  `admin_business(slug)` (team only) returns a business with its members
  and open invites.
- After opening, the console goes to `/admin/businesses/<slug>`: the
  checklist (opened from the template, owner invited, staff invited,
  address), worked out from the database, and the people (list on phone
  and tablet, table on desktop). The business list links to it; the old
  "opened" notice on the list moved here.
- Tests: 10 new unit tests (141 total); pgTAP `business_staff.test.sql`
  (12; dropping the unique index turned 2 red); Playwright: the café test
  now ends on the checklist with nobody invited, and a new test has a
  platform admin open a restaurant, fix a bad line, invite three people
  and check the invites in the database (the backlog's done-when for 1c).
- Not verified locally: no Docker in this run's container. Migrations,
  seed and every pgTAP file ran on a local Postgres 16 with stubbed auth
  and a small pgTAP stand-in (all green). The wizard's staff step and the
  checklist were checked in a production build with a stubbed session at
  390/820/1440: axe clean, no horizontal scroll. Playwright and the real
  pgTAP run in CI; `database.types.ts` was edited to the generator's
  format and CI's diff check confirms it.
- Commit: squash of PR `agent/1c-3-staff-and-checklist` (see the daily
  note in #1).
- Next: chunk 1d, invites: send by link (logged, not sent, in dev), claim
  through a server function, and the Team screen.
- Defaults applied: none today.

## 2026-10-19 · run 9 · chunk 1c-2 (new-business wizard)

- `/admin/new`: a three-step wizard (kind of business → name, slug,
  address → colour with a live preview and a summary), one step at a time
  on phones; a two-column details step on tablets; the summary beside the
  form on desktop. Each step is checked before moving on; the server
  repeats every check. The list's main action "פתיחת עסק חדש" opens it
  (both platform roles); back on the list an accent card says the
  business is open.
- `@domain/business`: `parseNewBusiness` (per step or whole), slug rules
  (same as the DB check, plus reserved app paths such as `admin`,
  `sign-in`), `normalizeSlug`, stored accent = `accentTokens(pick).accent`.
  `ACCENT_PRESETS` in `@domain/color` (eight colours, none adjusted).
- Migration `20261019000100_create_business.sql`:
  `public.create_business(actor, …)`, service role only: refuses an actor
  who is not platform staff, inserts the business, `apply_template`, and
  writes `business.create` to `audit_log`, all in one transaction. A taken
  slug fails with 23505 and the form goes back to the slug.
- First use of the secret key: `@db/supabase/admin` (`createAdminClient`,
  `server-only`), `parseSecretKey` (never echoes the value), and
  `createBusiness` in `@db/admin`. CI's e2e job reads the local stack's
  `SECRET_KEY` from `supabase status` (masked).
- Tests: 20 new unit tests (131 total); pgTAP `create_business.test.sql`
  (14; a planted missing staff check turned 3 red); Playwright
  `new-business.spec.ts` (onboarder opens a café in three steps, empty
  fields caught, a taken slug refused by the server, the result checked
  in the database; a manager gets no access; axe and overflow per step).
- Not verified locally: no Docker in this run's container, so the
  Supabase stack could not start. The migrations and the new pgTAP file
  ran on a local Postgres 16 with stubbed auth and a small pgTAP stand-in;
  the wizard was checked in the dev server at 390/820/1440 (axe clean, no
  horizontal scroll). Playwright and the real pgTAP run in CI.
  `database.types.ts` was edited to the generator's format; CI's diff
  check confirms it.
- Commit: squash of PR `agent/1c-2-new-business` (see the daily note in #1).
- Next: chunk 1c-3, pasting the staff list in the wizard and the
  post-create checklist, with the Playwright test that creates a business
  from the restaurant template.
- Defaults applied: none today.

## 2026-10-18 · run 8 · chunk 1c-1 (admin console: roles and business list)

- Split chunk 1c: 1c-1 roles and the business list (today), 1c-2 the
  new-business wizard (template, name, slug, address, accent, create; the
  admin client with the secret key), 1c-3 staff list paste and the
  checklist, with the Playwright test that creates a business.
- Migration `20261018000100_platform_staff.sql`: enum `platform_role`
  (`platform_admin`, `onboarder`), table `platform_staff` (RLS: people read
  only their own row; no browser writes), `private.is_platform_staff()`,
  and `public.admin_businesses()` (security definer, staff only, raises
  42501 for anyone else): every business with active members and open
  invites. Staff get no extra policies on tenant tables.
- `@domain/platform`: `platformCan(role, action)`. Onboarders read and
  create businesses and invite staff; deleting, templates and billing are
  platform admin only.
- App: `/admin` in route group `(admin)`, AppShell in ConceptApp's brand
  colour (`brandStyle`, new token `--brand-ink`). Business list: a list on
  phones, a two-column grid on tablets, a table on desktop. Off-team people
  get a "no access" screen; team members with no business are sent from
  `/home` to `/admin`. `proxy.ts` guards `/admin`.
- Seed: דנה צוות (050-000-0005, platform admin) and רון צוות
  (050-000-0006, onboarder), in no business.
- Tests: 10 new unit tests (111 total), pgTAP `platform_staff.test.sql`
  (13; a planted open policy turned 3 red), Playwright `admin.spec.ts`
  (signed out, admin, onboarder, a manager without access; axe and
  overflow). `e2e/session.ts` holds the shared sign-in helper.
- Not verified locally: the auth image could not be pulled (registry
  limits), so the Playwright spec ran only in CI. Migrations, seed, pgTAP
  and the generated types ran on the bare `supabase/postgres` image.
- Decision: the console lives at `/admin` for now. An `admin.` subdomain
  becomes a rewrite in `proxy.ts` when the production domain is set up.
- Commit: squash of PR `agent/1c-1-admin-console` (see the daily note in #1).
- Next: chunk 1c-2, the new-business wizard.
- Defaults applied: none today.

## 2026-10-17 · run 7 · chunk 1b (templates)

- Templates are data: migration `20261017000100_templates.sql` writes
  `restaurant` and `cafe-bar` into `templates` (modules on/off, module
  settings, positions, weekly shifts, opening hours, a storefront tagline).
  New columns `businesses.opening_hours` and `template_version`.
- `public.apply_template(business, template)`: one transaction, server only
  (`service_role`); refuses a business already set up, unknown keys and a
  template missing a module, changing nothing. `applyTemplate` in
  `@db/templates` wraps it for the admin client (1c). The seed now sets up
  the demo restaurant with it.
- Domain: `@domain/hours` (times, ranges past midnight, opening hours with
  no overlaps), `@domain/staffing` (positions, shift patterns, `shiftsOn`),
  `@domain/templates` (`validateTemplate`: every module present, settings
  valid with no unknown fields, requirements on). Scheduling settings gain
  `positions` and `shifts`; storefront gains `tagline`.
- Tests: 19 new unit tests (101 total); pgTAP `templates.test.sql` (18);
  new `pnpm test:db` (CI `database` job): every template in the database is
  valid against the real manifests and applying it to a fresh business
  gives back the same valid definition; the seeded demo is valid. Planted
  failures: an execute grant to `authenticated` and an unknown settings
  field both went red.
- Not verified locally: the Supabase CLI images could not be pulled here
  (registry rate limit). Migrations, seed, pgTAP for templates and
  `test:db` ran on the bare `supabase/postgres` image; the full suite runs
  in CI.
- Defaults (no question opened): the restaurant template's shifts are the
  demo shifts (per #3); positions מלצר/ית, ברמן/ית, טבח/ית, מארח/ת. The
  cafe-bar starts with reservations off (walk-in); the owner can switch it
  on. Opening hours and taglines are editable starting values.
- Commit: squash of PR `agent/1b-templates` (see the daily note in #1).
- Next: chunk 1c (admin console and the new-business wizard), probably split.
- Defaults applied: none today.

## 2026-10-16 · run 6 · chunk 1a (module system)

- `@domain/modules`: `ModuleManifest` + `defineManifest`, `enabledModules`
  (row on and every requirement on, transitively; cycles count as off),
  `moduleNav` (by role, ordered, at most 4 next to home), `moduleWidgets`,
  `canOpenModule`, `readModuleSettings` (invalid fields fall back to
  defaults one by one) and `validateModuleSettings` (throws, for writes).
- Five manifests in `modules/<key>/manifest.ts` (folder = DB enum key)
  with Zod settings and defaults, and `modules/registry.ts`. Nav: סידור,
  שעון, הזמנות (worker+), דף העסק (manager+); notifications has no screen.
- App: `@db/modules` reads `business_modules` under RLS; the `(app)` layout
  and home build nav and home cards from the enabled modules. Module routes
  `/schedule`, `/clock`, `/reservations`, `/storefront` show the module's
  entry screen (says it opens in the next stage, link home) or the new
  in-app not-found screen when the module is off or above the role.
  `proxy.ts` guards the new routes.
- Tests: 24 new unit tests (domain logic with fixtures; registry against
  the DB enum, tab-bar limit, defaults, messages; proxy guard, planted a
  missing route and it failed). 82 total. Playwright `modules.spec.ts`:
  owner sees 5 items, switching reservations off in the DB removes the nav
  item and home card and closes the route, back on restores it; a worker
  does not see the storefront. Vitest now resolves the tsconfig aliases.
- First CI run: `sign-in.spec` failed because `modules.spec` had just
  signed in the same worker (the auth server refuses a second code to a
  number within 5 s). Seeded a second demo worker (יואב לוי, 050-000-0004)
  for the modules spec.
- Not verified locally: the Supabase auth image could not be pulled here
  (registry rate limit), so the e2e test ran only in CI.
- `module_enabled` in RLS: no module table exists yet. Rule 5 in
  `modules/README.md`: each module table's policies add it, starting with
  availability (2b).
- Note: `notFound()` after the shell has streamed keeps status 200 (Next.js
  adds noindex); the test checks the screen, not the status.
- Commit: squash of PR `agent/1a-modules` (see the daily note in #1).
- Next: chunk 1b (templates `restaurant` and `cafe-bar` as data, applied in
  one transaction).
- Defaults applied: #8, no answer by 16.10 10:00: migrations stay local
  until Orel is back; 3b waits.

## 2026-10-15 · run 5 · chunk 4 (phone login)

- Skipped 3b (waits on #8, default 16.10 10:00) and did chunk 4 against a
  local Supabase.
- `@supabase/ssr` + `@supabase/supabase-js`; `packages/db`: `env.ts` (Zod,
  publishable key only), `supabase/server.ts`, `supabase/proxy.ts`,
  `session.ts` (`getCurrentMember`). Root `proxy.ts` refreshes the session
  on `/home` and `/sign-in` and redirects each side of the door.
- `/sign-in`: phone, then the 6-digit code, in one form (`useActionState`);
  resend and change-number; clear errors for a malformed number, an unknown
  number, rate limits and a wrong code. `(app)` layout: `AppShell` in the
  business accent, an empty home with sign-out, a "not in a business yet"
  screen. Copy in `messages/` (namespaces `auth`, `app`).
- Decision: no sign-ups from the sign-in screen (`[auth] enable_signup =
  false`). Unknown numbers get "not registered yet" and no SMS is sent;
  accounts come from invites (chunk 1d).
- Dev SMS: `send_sms` auth hook → `dev.sms_codes`, defined in `seed.sql`
  so it never reaches a real project; Twilio enabled with placeholders only
  because the CLI turns phone login off without a provider. Seeded users got
  empty token columns (GoTrue fails on NULL).
- Tests: Playwright (`pnpm e2e`) at 390/820/1440: redirect when signed out,
  sign-in with the hook's code (and a wrong code first), home, axe clean,
  no horizontal scroll, sign-out; unknown and malformed numbers. 12 passed.
  pgTAP `dev_sms.test.sql` (5, planted grant made it fail). Unit tests for
  the env parser and the code format (58 total). New CI job `e2e`.
- Commit: squash of PR `agent/4-phone-login` (see the daily note in #1).
- Next: phase 1, chunk 1a (module system). 3b when #8 is settled.
- Defaults applied: none today.

## 2026-10-14 · run 4 · chunk 3b (stopped, nothing merged)

- Wrote a workflow that applies migrations to `conceptapp-dev` after green
  CI. The run's safety checks blocked an unattended write to a real
  database, so nothing was pushed. Question #8 asks how migrations should
  reach `conceptapp-dev` (default: local only until Orel is back).
- Defaults applied: #2 (assume the pilot agreed, keep building on the demo
  restaurant) and #3 (the demo shifts in `app/design/shell/data.ts` become
  the `restaurant` template defaults). Both closed.

## 2026-10-13 · run 3 · chunk 3a (database: schema, RLS, tests)

- Split chunk 3: 3a local schema and tests (today), 3b apply migrations to
  `conceptapp-dev` from CI with the GitHub secrets, 3c remaining polish if
  any (e.g. template seed with chunk 1b).
- Supabase CLI 2.118.0 as a dev dependency; `supabase/config.toml` from
  `supabase init` (Postgres 17). Scripts `db:start`, `db:test`, `db:reset`,
  `db:types`.
- Migrations: `templates`, `businesses`, `profiles` (created from
  `auth.users` by a trigger, phone in E.164), `memberships` (role
  owner/manager/worker + extra perms), `business_modules`, `invites` (token
  hash only), `audit_log`. Helpers `is_member`, `has_role`, `has_perm`,
  `module_enabled` in a `private` schema the API does not expose.
- RLS on every table; anon has no table privileges. Writes are server-only
  except: owners rename their business, people edit their own name and
  language (column grants).
- pgTAP (39 tests): RLS meta-test, anonymous reads nothing, A cannot read
  or write B, role limits inside a business, inactive members, helpers.
  Each kind of failure was planted (table without RLS, open policy, anon
  grant) and the tests went red. New CI job `database`: start, test,
  `db lint`, and a check that `packages/db/database.types.ts` is current.
- Decision: schema as plain SQL migrations + generated types instead of
  Drizzle (the old `packages/db` README named it). Fewer moving parts; the
  types come from the real schema.
- Commit: squash of PR `agent/3a-database` (see the daily note in #1).
- Next: chunk 3b, a workflow that applies migrations to `conceptapp-dev`.
- Defaults applied: none. Questions #2 and #3 open until 14.10 04:00.

## 2026-10-12 · run 2 · chunk 2c-2 (messages, next-intl)

- next-intl 4.14.9 without locale routing: `i18n/request.ts` always serves
  Hebrew, so every page stays static under `cacheComponents`. `i18n/config.ts`
  lists `he`/`en` and the direction of each; keys are typed from `he.json`.
- `messages/he.json` and `messages/en.json`: every string from `app/` and
  `packages/ui` (home, gallery, shell demo, AppShell labels). Counts use ICU
  plurals; the list of names uses `format.list`. The `/design` gallery
  switches language through its own `NextIntlClientProvider`.
- Checks in `pnpm check`: `tooling/hebrew-literals.ts` (TypeScript AST, so
  comments are ignored) fails on Hebrew in strings or JSX text; verified by
  planting a literal. `tooling/messages.test.ts`: same keys and placeholders
  in both files. Demo data `app/design/shell/data.ts` is allowed (it stands
  in for database rows); weekday names moved to messages.
- Accessibility: axe was not clean before (gallery had no `<main>`, card
  titles jumped from h1 to h3). Gallery root is now `<main>`; `CardTitle`
  takes `as="h2"`. 0 violations at 390/820/1440 on all demo routes and the
  English gallery; no horizontal scroll. 47 unit tests.
- Commit: squash of PR `agent/2c-2-messages` (see the daily note in #1).
- Next: chunk 3 (database), starting with Supabase CLI config and the first
  migrations.
- Defaults applied: none. Questions #2 and #3 open until 14.10 04:00.

## 2026-10-12 · run 1 · chunk 2c-1 (layer boundaries)

- Split chunk 2c in two: 2c-1 layer boundaries (today), 2c-2 next-intl and
  the Hebrew-literal check (next).
- `biome.json`: per-folder `noRestrictedImports` overrides. domain imports no
  other layer and no React/Next/Supabase; ui and db import only `@domain`;
  modules reach other modules only via `@modules/<key>/manifest`; only `app/`
  imports `@/…`.
- `tooling/boundaries.ts` + test: catches relative imports that climb into
  another module at any depth (Biome patterns cannot), and proves with probe
  files that Biome rejects every forbidden import and accepts the allowed
  ones. Verified by disabling a rule: the test fails. 40 unit tests total.
- Commit: squash of PR `agent/2c-1-boundaries` (see the daily note in #1).
- Next: chunk 2c-2, next-intl with `messages/he.json` and `messages/en.json`.
- Defaults applied: none. Questions #2 and #3 open until 14.10 04:00.

## 2026-10-12 · kickoff

- Access: push, issues and PRs on `SuyfooS/conceptapp-v2` confirmed. CI on
  `main` green at `9c6bb8e`.
- Labels `orel` and `urgent` created (`question` already existed). Log issue
  #1 `יומן הסוכן` created and pinned.
- Questions opened: #2 (pilot meeting) and #3 (real shifts), deadline
  14.10.2026 04:00 Israel time.
- Question 3 (Supabase secrets) not opened: Orel confirmed that
  `conceptapp-dev` exists and that `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` are set in GitHub
  (`gh secret list` shows all three). Chunk 3 applies migrations there.
- Brief: the agent's own issues and comments start with 🤖, because they are
  written through @SuyfooS too.
- Next: the first daily run, chunk 2c.

## 2026-10-12 · setup (before the autonomous month)

- State: phase 0 chunks 1, 2 and 2b merged (skeleton, design system, responsive
  app shell with the `/design/shell` demo). CI: Biome, typecheck, 34 unit
  tests, build.
- Added `docs/AGENT.md` (brief), `docs/agent/RUN_PROMPT.md` (scheduled prompt),
  `docs/agent/KICKOFF.md` (one-time setup) and this log.
- Schedule: daily at 09:50 Israel time (`CRON_TZ=Asia/Jerusalem 50 9 * * *`).
- Next: chunk 2c (layer boundaries in Biome, next-intl message files).
- Open on the first run: the three questions listed at the end of the brief.
