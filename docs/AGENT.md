# Agent brief — autonomous month (13 Oct – 12 Nov 2026)

Orel is away for a month. A Claude agent works on this repo once a day and
talks to him through the ConceptApp chat in the Claude app. This file is the
standing brief. Read it, then `CLAUDE.md`, at the start of every run.

## Decisions Orel made for this period

- The agent merges to `main` on its own once every check passes. There are no
  real users before the pilot goes live in late December, so a bad merge costs
  a revert, not a customer.
- One run a day at 10:00 Israel time.
- Everything goes through GitHub (`SuyfooS/conceptapp-v2`). Orel's computer is
  off; do not depend on it.

## The daily run

1. **Keep the schedule alive first.** Make sure wake-ups exist for the next two
   days (one-shot reminders into the ConceptApp chat, named
   `ConceptApp agent · DD.MM`). Create any that are missing. Never create
   duplicates. 10:00 Israel time is 07:00 UTC until 25 Oct and 08:00 UTC after.
2. **Catch up.** Read the agent log in the ConceptApp project
   (`claude/agent-log.md`) and any answers Orel left in the chat since the last
   run. Apply answers before starting new work.
3. **Sync.** Clone or pull `main`. If `main` is red in CI, fixing it is today's
   chunk.
4. **Do one chunk** from the backlog below, in order, on a branch
   `agent/<chunk-id>`. A chunk is the smallest piece that ends in something
   demonstrable.
5. **Prove it.** `pnpm check` and `pnpm build` must pass; add or update tests
   for every behaviour change. For UI, screenshot at 390, 820 and 1440 px and
   run axe; no violations, no horizontal scroll.
6. **Merge.** Push the branch, wait for CI, then fast-forward or squash into
   `main` and delete the branch. Never force-push `main`.
7. **Log.** Append to `claude/agent-log.md`: date, chunk, what changed,
   commit, what is next, and any decisions taken by default.
8. **Ask, if needed** (see below), then post a short summary in the chat.
9. **Sundays:** a weekly summary for Orel with screenshots of what changed on
   phone, tablet and desktop, and the Vercel preview link.

## Asking Orel

- At most three questions a day, numbered, in Hebrew, each with a
  recommended default: "if there is no answer by <date, 48 hours later>, I go
  with X".
- Work never waits on an answer. Pick another chunk or proceed with the default
  and log that the default was used, so it is easy to revisit.
- Send a push notification only when there are new questions or something is
  broken. Routine progress goes in the log and the weekly summary.
- Ask before: changing anything in the business model or pricing, anything a
  restaurant owner will read (beyond UI copy that follows CLAUDE.md), any
  product decision the docs leave open, and anything irreversible.

## Never

- Spend money, start trials, or create accounts on any service.
- Touch v1, `conceptapp.co.il`, its DNS or its Firebase project.
- Read, print, log or commit secrets. Orel puts keys into Vercel, Supabase and
  GitHub settings himself; code reads them from the environment.
- Send SMS, push or email to real people or real phone numbers. Development
  uses Supabase test numbers and a logging SMS hook.
- Contact the pilot restaurant or anyone else.
- Delete repositories, other people's branches, or data outside the dev
  project.
- Lower a quality bar to finish a chunk: no skipped tests, no `any`, no
  disabled lint rules without a written reason, nothing marked done that is a
  stub.

## Escalate at once (push notification)

- `main` has been red for more than a day and the fix is not obvious.
- A security problem: data visible across businesses, a secret in the repo,
  an RLS gap.
- Lost access to GitHub, Vercel or Supabase.
- The schedule broke (a run found no wake-up for tomorrow and could not create
  one).

## Backlog, in order

Each item lists its done-when. Skip ahead only when an item is blocked on
Orel, and say so in the log.

### Phase 0 — foundations (finish)

- **2c · Boundaries and messages.** Enforce the layer rules in Biome
  (`noRestrictedImports` per folder: domain imports nothing; ui imports only
  domain; db imports only domain; modules never import another module's
  internals). Add next-intl with `messages/he.json` and `messages/en.json`;
  move every user-facing string in `app/` and `packages/ui` into them.
  Done when: a forbidden import fails `pnpm check`, and no Hebrew literal
  remains in TSX outside message files (a small script in CI proves it).
- **3 · Database.** Supabase CLI config; migrations for `businesses`,
  `profiles`, `memberships`, `business_modules`, `templates`, `invites`,
  `audit_log`; SQL helpers `is_member`, `has_role`, `has_perm`,
  `module_enabled`; RLS on every table; seed with a demo restaurant. pgTAP
  tests: a member of business A cannot read business B; anonymous users read
  nothing; and a meta-test that fails if any table in `public` lacks RLS.
  Done when: the tests run in CI against a local Supabase and pass. Applying
  migrations to `conceptapp-dev` needs secrets Orel adds to GitHub; if they are
  missing, ask once and keep going locally.
- **4 · Phone login.** Supabase phone OTP with `@supabase/ssr` cookies and
  session refresh in `proxy.ts`; sign-in screens (phone, then code) built from
  `packages/ui`; a test SMS hook that writes codes to a dev-only table; an
  empty home inside `AppShell` in the business accent. Done when: a Playwright
  test signs in with a test number and lands on the home screen.

### Phase 1 — admin console and five-minute onboarding

- **1a · Module system.** `ModuleManifest` type, a registry, Zod settings
  schemas with defaults, nav and home widgets generated from enabled modules,
  `module_enabled` used by RLS. Done when: enabling or disabling a module for
  the demo business changes the nav with no code change, covered by tests.
- **1b · Templates.** `restaurant` and `cafe-bar` templates as data (modules,
  settings, positions, hours, copy) and a server function that applies one in
  a single transaction. Done when: applying a template to an empty business
  produces a complete, valid business, covered by tests.
- **1c · Admin console.** `admin.` area: business list and the new-business
  wizard (template → name, slug, address, accent → paste staff list → create →
  checklist). Roles `platform_admin` and `onboarder` (creates and invites, no
  billing, no templates, no delete). Done when: a Playwright test creates a
  business from the restaurant template in under five minutes of clicks.
- **1d · Invites.** Invite by phone with a link (logged, not sent, in dev),
  claimed only through a server function; the Team screen lists members and
  pending invites. Done when: an invited test number signs in and lands in the
  right business with the right role.
- **1e · View as + audit.** Admin "view as" a role, written to `audit_log`,
  writes blocked while viewing. Done when: covered by tests.

### Phase 2 — scheduling (start)

- **2a · Shabbat times.** `packages/domain/shabbat.ts` on `@hebcal/core`:
  candle lighting and havdalah by coordinates, with tests for Jerusalem, Tel
  Aviv and Haifa on summer and winter dates.
- **2b · Availability.** Weeks, availability ranges, the worker's availability
  form with the Friday and Saturday rules, and the manager's "who has not
  submitted" list, in all three layouts.

## Where things live

- Plan, decisions and roadmap: ConceptApp project doc `claude/v2-rebuild-plan.md`
  and the App Design Document linked there.
- Running log and questions: ConceptApp project doc `claude/agent-log.md`.
- Rules for code and UI: `CLAUDE.md`.
