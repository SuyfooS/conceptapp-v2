# packages/db

Typed access to the database: generated types now, server queries as the
screens that need them arrive. Import as `@db/<file>`.

- The schema is plain SQL in `supabase/migrations/` (one file per change,
  never edited after it is merged).
- `database.types.ts` is generated from the local database with
  `pnpm db:types`. Never edit it by hand; CI fails if it is out of date.
- The RLS tests (pgTAP) live in `supabase/tests/database/` and run with
  `pnpm db:test`.

## Access rules

Every tenant table carries `business_id`. Row-level security filters on it
through helpers in the `private` schema (not exposed by the Data API):

| Helper | True when the signed-in user… |
| --- | --- |
| `private.is_member(business)` | has an active membership in the business |
| `private.has_role(business, min_role)` | has at least that role (owner > manager > worker) |
| `private.has_perm(business, perm)` | holds the permission (owners hold all) |
| `private.module_enabled(business, key)` | (any user) the module is switched on for the business |
| `private.is_viewing(business, min_role)` | is on the ConceptApp team with an open "view as" session in the business, at that role or above (read policies only) |
| `private.can_manage_lists(business, person)` | (that person) is an active owner or manager, or holds `lists.manage` |
| `private.sees_list(list, person)` | (that person) is an active member of the list's business who holds it, sent it, was given it, is in the department that asked for it or one it passed through, or manages lists |

Writes to businesses' structure (memberships, modules, invites, templates,
audit log) go through server code with `SUPABASE_SECRET_KEY`. So do a
business's own details: `public.set_business_details(actor, business, patch)`
saves its name, colour, address and Shabbat city for an owner, a manager or the
team, and logs what changed. So does a profile (`20261109000400_profile_about.sql`):
`public.set_own_profile(actor, patch)` changes the signed-in person's own name,
language, line about themselves, cover and form of address, and
`public.clear_profile_bio(actor, business, person, seen)` lets an owner or
manager delete a hurtful line, the one they read (`seen`; a line rewritten
since stays, with 40001), logged as `profile.bio_cleared` without the text.
From the browser, reads follow the policies and nothing writes a profile.

The audit log is the business's activity log. Only server functions write it,
each for its own action (`business.details`, `module.settings`, `clock.correct`,
`clock.confirm` from `confirm_time_entry`, `clock.code.locked`,
`schedule.publish`, `swap.approve` and the rest). Owners and managers read their
own business's rows, and so does the team while viewing it as a manager or owner.
Publishing a week's schedule logs its first day, the number of shifts, whether it
was the first time, and how many waiting swap requests the old shifts took with
them (`activity_log.test.sql`), and, for notifications, whose shifts changed
and the requests it removed.

Notifications are written from the audit log: a trigger
(`private.notify_from_log`, which never blocks the write it follows) reads
each row and writes `public.notifications` through `private.notify`, one line
per person per thing (`dedupe_key`), replaced and unread again when the same
thing happens again. Once what a line asks for is handled (a request decided,
hours confirmed), `private.resolve_notifications` settles its lines for
everyone: read, with `resolved_at`. People read their own lines while they
are active members at the line's `audience_role` and its modules are on;
nobody else reads them,
the team viewing included. `public.read_notifications(actor, business, ids)`
marks lines read, with the secret key; `@db/notifications` reads the inbox
and calls it (`notifications.test.sql`).

Lines reach phones too (Web Push, `20261109000500_push.sql`), with no payload:
the phone's service worker asks `/push/inbox` what to show. `private.push_plan`
queues a line when its person has a device in `public.push_subscriptions` and
it is from the business the app opens for them, never a demo
(`private.push_business`). The server, with the secret key, saves (at most ten
devices each, a new one forgetting the one seen longest ago) and forgets
devices, claims what is due once per line and device (`claim_due_pushes`, rows
in `public.push_deliveries`, which only the server touches) and says how each
push went (`finish_pushes`: gone devices forgotten, refusals counted, retries
in 1, 5 and 25 minutes, then counted too). The browser reads only a few plain columns of its own
devices, never their endpoints or keys. `@db/push/*` signs VAPID with
`node:crypto` and sends; pg_cron's minute job asks the app to send while
something is due (`push.test.sql`).

Lists (`20261109000600_lists.sql`) work the same way as the rest. A
business's departments are its own data, read by every member;
`public.set_departments` and `public.set_department_members` save them for an
owner, a manager or the team, archiving what is left out. List templates with their items and times, and
the lists sent with their items, people and passes, are read under the
policies above (the module off closes them) and written only by
`save_list_template`, `archive_list_template`, `restore_list_template`,
`send_list`, `set_list_item`, `finish_list`, `cancel_list` and `reopen_list`
(secret key, for `actor`), each with its own `lists.*` audit row except an
item's tick. Lists tell people through a trigger of their own,
`private.notify_for_lists`, and their lines reach phones like any other.
`public.my_open_lists(actor, business)` counts what a person holds, for the
tab. `@db/departments` and `@db/lists` read and call them
(`departments.test.sql`, `lists.test.sql`, `lists_notifications.test.sql`).
`20261109000700_lists_on.sql` switches the module on in every template and
business (where its tab fits), gives businesses opened before lists their
template's departments and lists (`private.backfill_lists`), adds
`public.cancel_unstarted_list`, the undo right after sending (`cancel_list`
only while nobody has started the list), and fills `private.seed_demo_lists`:
the demo reset ends with two example lists sent by the demo's manager
(`lists_on.test.sql`).
`@db/departments` `getDepartmentsForTeam` reads them for the console with the
secret key, since the team is no member.

The tests that must always pass: a member of business A cannot read
business B; anonymous visitors read nothing; every table in `public` has RLS.

## Templates

A business starts from a template (`restaurant`, `cafe-bar`): rows in
`templates`, written by migrations (a change is a new migration that updates
the row and bumps `version`). The definition's shape is `templateDefinition`
in `@domain/templates`: modules with `enabled` and their settings (positions
and the weekly shift pattern are scheduling settings), plus the opening hours,
its `departments` and its `listTemplates` (pointing at its departments and
shifts by key). A module the template doesn't name starts off, with its
defaults, so a module built for one business touches no template.

`public.apply_template(business, template)` copies one into a business
that has none yet, in one transaction: a `business_modules` row per module,
`opening_hours`, its departments and lists (`private.copy_template_lists`),
`template_key` and `template_version`. It refuses a business that is already
set up, an unknown key, a template that names a module nobody has, or a list
that names a department or shift the template doesn't have, and changes
nothing then. It is security definer, since the server role has no use of the
private schema. Only `service_role` may run it;
from TypeScript, `applyTemplate(adminClient, id, key)` in `@db/templates`.

Tested twice: pgTAP (`templates.test.sql`: grants, refusals, nothing
half-applied) and `pnpm test:db` (`modules/templates.db.test.ts`: each
template in the database is valid against the real manifests, and applying
it to a fresh business gives back the same valid definition). The seed makes
the demo restaurant and the demo shop with `reset_demo_business`, which applies
their templates; `demo_reset.test.sql` tests the reset and the shop's renewed
week.

## Wording

A template or a business can replace a whole sentence of the app's copy
(`template_wording`, `business_wording`), keyed by its message key under
`app.*` or `modules.*`. A business's sentence wins over its template's, which
wins over messages/he.json; deleting a row brings back the layer below.
Template sentences are read live through `businesses.template_key`, so a
change reaches every business opened from the template at once (Orel,
7 November 2026). Members read their own business's sentences and its
template's under RLS, and the team while viewing; only the team writes, with
`set_business_wording` (platform staff) and `set_template_wording` (platform
admins), each logging `wording.change`. Seeds hold no wording, so screens
read as messages/he.json. Console reads and writes are in `@db/wording`;
`wording.test.sql` covers who reads and writes what.

## Clients and session

- `@db/supabase/server`: `createClient()` for Server Components and Server
  Actions, acting as the signed-in person under RLS (publishable key).
- `@db/supabase/proxy`: `refreshSession()` for the root `proxy.ts`, which
  refreshes the session cookies on every app request.
- `@db/session`: `getCurrentMember()`, the signed-in person and their
  business. `app/(app)/member.ts` wraps it in React `cache()`.
- `@db/supabase/admin`: `createAdminClient()` with `SUPABASE_SECRET_KEY`,
  for server-only writes. Bypasses RLS, so every caller checks who is
  asking first.
- `@db/admin`: the console's reads and writes. `createBusiness(actor,
  business)` calls `public.create_business` (service role only): it opens
  the business, applies its template and writes `business.create` to the
  audit log in one transaction, and refuses an actor who is not platform
  staff. A taken slug comes back as `slugTaken`.
- `@db/env`: the public settings and the secret key, checked with Zod.

Sign-in is phone + SMS code. Accounts are never created at sign-in
(`[auth] enable_signup = false`); people arrive through the seed now and
through invites from chunk 1d. Locally and in CI the `send_sms` auth hook
writes codes to `dev.sms_codes` (defined in `supabase/seed.sql`, so it never
reaches a real project); the Playwright test reads them from there.
