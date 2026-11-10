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
| `private.has_role(business, min_role)` | has at least that role (owner > manager > worker; an accountant ranks as a worker) |
| `private.has_perm(business, perm)` | holds the permission, as `private.holds_perm` says (owners hold all) |
| `private.is_staff_member(business)` | is an active member on the staff (any role but accountant) |
| `private.is_viewing_staff(business)` | is on the ConceptApp team viewing the business as a staff role (read policies only) |
| `private.viewing_payroll(business)` | is on the ConceptApp team viewing the business as an accountant: the one view that reads pay |
| `private.reads_pay_of(person)` | holds `clock.payroll`, or views as an accountant, in a business that person is or was in |
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
own business's rows, and so does the team while viewing it as a manager or owner,
but for the pay rows (`wage.*`, `payroll.*`): only pay holders read those, and a
pay holder who is no manager reads the clock's and the permissions' rows too.
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

Hours stay (`20261110000100_hours_kept.sql`, payroll P1). `time_entries`,
`time_breaks` and `audit_log` refer to their business, person and entry with
`on delete restrict`, so deleting a person, their account or a business with
hours fails (23503): people leave by being made inactive. A trigger on each
refuses every delete (42501), the database's owner's included, but two, each
named for the transaction by a setting the Data API can't set:
`private.purge_business_records(business)` (`ca.records_purge`; breaks, then
entries, then the log; the reset locks the business and runs it first, so a
visitor's write under way finishes before it and none lands after; test
clean-ups run it as postgres, and nobody else may) and the trim of an entry's
own breaks (`ca.fit_breaks`). The log never changes but for its actor going to
null when their account goes, and only its owner updates, deletes or truncates
it; nobody else truncates hours or breaks either.
`private.seed_demo_pay(business)` is a stub the reset ends with; later payroll
parts replace it and the purge, never the reset. `add_time_entry` and
`correct_time_entry` refuse a missing reason (22023, "A correction needs its
reason") and log it as `note`; the entry keeps the newest. A correction that
cuts or removes breaks writes one `clock.break_fit` row by the corrector, each
break `from` and `to` (null when removed) and the entry's corrected `clock_in`,
which names the shift's day as `clock.correct` does; a clock-out that ends an
open break writes none (`hours_kept.test.sql`). `@db/time-clock` reads each
entry's `created_at` with its edit: a shift a manager added is edited as it is
written, so an `edited_at` more than a second later means it was corrected
since, and its line says so (`ShiftRecord.correction.kind`).

Pay access (`20261110000200_accountant_role.sql` and
`20261110000300_payroll_access.sql`, payroll P2). `accountant` is a fourth
`member_role`, appended: a member at a worker's rank who is never on the staff
(`private.is_staff_role`). A trigger on `time_entries`, `shift_assignments`,
`availability_submissions`, `department_members` and `list_people`
(`private.refuse_non_staff`), and one on `list_schedules` for its person, refuse
an accountant (42501); `private.list_recipient` already takes no accountants as
a role, `private.check_can_take` refuses them a swap (so they never take one,
have one approved or are offered one), and `private.notify` sends them nothing
about the schedule or lists. The schedule, swaps, availability, departments and
list templates read through `private.is_staff_member` and
`private.is_viewing_staff`, and `private.holds_list`, `private.sees_list` and
`private.list_holders` count only the staff, so an accountant, and a view as
one, reads none of them, while the roster and names stay open.
Every permission a manifest declares is a row of `public.permission_keys`
(`default_roles`: the staff roles other than the owner at or above its
`defaultRole`; `by_owner`: an owner gives it; `modules/permissions.db.test.ts`
keeps them the same). `clock.payroll` is the one an owner gives: everyone's
hours, and later wages, details and estimates. Owners and accountants
(`private.accountant_perms()`) always hold it; managers don't until the owner
gives it to the role (Orel, 9 November 2026), a row of
`public.role_permissions`; one person gets it in `memberships.perms`.
`private.holds_perm(business, person, perm_key)` says who holds what (owner;
accountant for theirs; on the staff, given it, in a role given it, or in a
default role of one that isn't the owner's to give), `private.has_perm` asks it
for the caller, and `public.my_permissions(business)` lists the caller's, sorted,
for the screens (a view: its role's defaults, `clock.payroll` only as an
accountant). `public.set_role_permission(actor, business, grant_role, perm_key,
granted)` and `public.set_member_permission(actor, business, person, perm_key,
granted)` change grants for an owner or the team (secret key), never for
oneself, an owner or an accountant, each change logged as `permission.grant`
or `permission.revoke` and a call that changes nothing logging nothing. Pay
holders and a view as an accountant read every hour and break of the business,
and the names of everyone who worked there (`private.reads_pay_of`). Only an
owner invites an accountant or touches their invite (`team_invite`,
`team_invite_link`; the console's `admin_invite` may), and someone who comes
back as one must have no open entry, shift or taken swap from the business's
today on (`claim_invite`, 55000), leaving their departments, permissions, place
on open lists and any list's times for them (lists done keep them on their
record). `getClockPeople` marks who is on the staff, so the team's hours list
an accountant only for a month they worked in. The demo
shop's managers hold pay access (`rolePermissions` in its definition, put back
by `private.seed_demo_pay`). `payroll_access.test.sql`, `team_invites`,
`view_as`, `helpers`, `create_business`, `demo_reset` and `rls_enabled` cover it.

The pay screens (`20261110000400_payroll_screens.sql`, payroll P3).
`public.note_payroll_access(business, pay_month, view_kind)` notes that the
caller opened a pay screen (`view_kind`: month, person or access; 22023 for
anything else): one `payroll.view` row a day per person, by the business's
own clock, and only for someone holding `clock.payroll` or viewing as an
accountant (nothing, and no error, for anyone else). The person's own session
calls it (`notePayrollAccess` in `@db/payroll`), from a server action the screen
calls after it mounts, never while a page renders: a prefetch logs nothing. The
row is a pay row, so only pay holders read it, and the activity list leaves it
out as routine. `private.notify_for_payroll`, on its own trigger
(`audit_log_notifies_payroll`, the lists pattern), tells a person given
`clock.payroll` personally (`access.pay_granted`, no facts in the line, the
giver as its actor) and settles the line when it is taken back; a role's grant
tells nobody. A settled `access.pay_granted` line leads to the inbox, since the
pay screens are then closed to its reader: `getNotification` in
`@db/notifications` reads `resolved_at` for `linkFor`. The demo: the shop has
an accountant (Galit, door account `accountant`, in no department and on no
shift; on the hosted project `supabase/hosted-demo.sql` starts a demo business
again when someone its definition names has an account but no membership, so
she joins once the demo step makes hers), and `private.seed_demo_pay`
now ends with `private.seed_demo_hours`, which writes last month's hours from a
definition's `hours` (`{"fridays": …, "cases": [{"user_id", "case", "note"}]}`):
every active member on the staff but the owner works Sunday to Thursday
09:00–17:00 with a half-hour break (unpaid when the business's breaks are),
one weekday off by their place, Fridays 08:00–14:00 for workers when
`fridays`, and the cases on the people they name (`corrected` by the first
manager with its `clock.correct` row, `evening`, `without_code`, `night`,
`friday_late`, `saturday_night`), each on its own weekday, in the business's
time zone, none left open; a plan that fails writes no hours and the reset
stands. `@db/payroll` reads the pay people (everyone who was ever a member,
with name, photo and form of address), the roles given pay access, the access
screen's people and the times corrected entries had before (from the log's
`clock.correct` rows), and writes the grants for an owner. The session's
`membership.perms` now comes from `public.my_permissions`. Covered by
`payroll_screens.test.sql`.

Hourly wages (`20261110000500_hourly_wages.sql`, payroll P4). Money is whole
agorot, as integers, everywhere. `public.minimum_wages` holds Israel's minimum
wage by the day it took effect, every figure as published (the adult hour on
182 hours, cut, not rounded: 35.40 from 1.4.2026; the statute's 186-hour
figure; the youth bands and the apprentice's), read by anyone signed in and
written only by migrations; `youth_published` is false for 1.4.2025, whose
youth figures were worked out and must be checked before a business pays a
minor from them. `packages/db/minimum-wages.db.test.ts` keeps it equal to
`MINIMUM_WAGES` in `@domain/minimum-wage` (`pnpm test:db`).
`private.minimum_wage_on(on_day)` reads the adult hour of a day.
`public.member_wages` is a person's wage from a day (`effective_from`), 0.01 to
1,000.00, with an optional note; append-only: the wage on a day is the latest
`effective_from` on or before it, then the latest `set_at`
(`private.wage_on`), so a typo is fixed by a new row for the same day and both
stay. Its key to the membership is `restrict`, so a person or business with
wages stays (23503); a trigger refuses every update and delete (42501) but a
purge that names the business and the setter going to null when their account
goes, and nobody but its owner writes or truncates it. The person reads their
own while a member; pay holders and a view as an accountant read the
business's; nobody reads any with the time clock off.
`public.set_hourly_wage(actor, business, person, agorot, from_day, wage_note,
at_time)` (secret key) sets one for a pay holder: never their own (42501), an
owner's only by an owner (42501), never an accountant's (22023), someone who
left allowed, from the first of last month to a year ahead by the business's
day (22023), under the minimum saved all the same; it logs `wage.set` with the
wage before on that day, after, the day, the adult minimum of the day and the
note, and `private.notify_for_payroll` tells the person (`pay.wage_set`, with
`since` and never an amount, one line per person). The purge deletes wages
before the log. `private.seed_demo_pay` ends with `private.seed_demo_wages`,
from a definition's `wages` (`{"manager": 4500, "worker": 3800, "cases":
[{"user_id", "case": "raise", "agorot"} | {"user_id", "case": "none"}]}`): the
role's wage from the first of last month for every active manager and worker,
a raise on the 15th, or none; set by the definition's owner, with no log rows.
`@db/wages` reads wages under the person's session (`getWages`) and sets one
with the secret key (`setHourlyWage`, refusals read by `wageFailureOf` in
`@domain/wages`). Covered by `wages.test.sql`, `demo_reset` and
`rls_enabled`.

Details for payroll (`20261110000600_payroll_details.sql`, payroll P5),
reconciled with the hiring file's design: no ID number, address, bank account
or birth date here. `public.member_payroll_details` (one row per person, the
table's defaults standing for none) holds the payroll system's number
(`^[0-9A-Za-z-]{1,20}$`, one person's in a business), the weekly rest day
(6 Saturday, 5 Friday or 0 Sunday: a day, never a religion), whether the Hours
law applies (`applies`, `trust` for s.30(א)(5), `unsupervised` for
s.30(א)(6)), a minor's 18th birthday (`youth_until`, null for an adult) and
whether a minor is at school (`compulsory_education`, the 20:00 limit).
`public.employment_periods` holds when each person worked here
(`started_on`, `ended_on` null while it goes on, `last_paid_on` once it
ended), never overlapping (`employment_periods_no_overlap`, a gist exclusion
on a closed day range), `source` `joined` for a start copied from the
membership and `set` for one a pay holder entered. Both are records: their
keys to the membership are `restrict`, a trigger refuses every delete (42501)
but a purge that names the business (`private.refuse_payroll_record_delete`),
nobody but the owner writes or truncates them, and they are read like wages
(the person while a member, pay holders and a view as an accountant, with the
time clock on). `private.backfill_employment_periods()` gave every staff
membership without one a `joined` period from the business's day it began,
ended on its last change when inactive; the trigger `memberships_track_employment`
(`private.track_employment`, after insert or update of `active`, `role`) opens
a `joined` period on the business's day a staff membership starts or comes
back, closes the open `joined` one when it stops (inactive, or an accountant
now), goes on with the same one when someone is back the day it closed, and
never moves a holder's `set` period (a membership write never fails over a
period). `public.set_payroll_details(actor, business, person, patch, at_time)`
(secret key) takes only the keys to change (`payroll_number`, `rest_day`,
`hours_law`, `compulsory_education`, `birth_date`; anything else 22023) by the
wage's rules (a pay holder, never their own, an owner's only by an owner, never
an accountant's); a birth date only from an active owner or the accountant
(42501), a real day in the last 100 years, read once and kept only as
`youth_until` (29 February + 18 years is 28 February); a call that changes
nothing writes no log row, and `payroll.details` names the fields that changed
(`youth_until` for a birth date), never a value. `public.set_employment_period(actor,
business, person, from_day, to_day, paid_until, period_id, at_time)` adds a
period or changes one of the person's (P0002 for another's), by the same rules,
an overlap 23P01 ('Periods overlap'), a start in the last 100 years and at
most a year ahead, the end on or after the start, a last payment only once it
ended; the period is `set` from then on, and
`payroll.period` names the fields that changed, whether it was added, and
whether a `joined` one was confirmed, never a day. `public.set_hourly_wage` now
refuses a wage before the first period's start once a holder set it (22023
'Before they started'); a `joined` start limits nothing. Its `wage.set` row
now keeps the minimum of the person's age band on the wage's first day
(`private.minimum_wage_for(business, person, on_day)`: under 16, 16, 17 by
`youth_until`, else the adult hour), so a minor's legal wage isn't logged as
under the minimum. `public.team_youth(business)` gives the business's owners
and managers (and a view as one) who on the staff is a minor today and until
when, with the time clock on, and nobody else anything. The purge deletes
details and periods before the log. `private.seed_demo_pay` ends with
`private.seed_demo_details`, from a definition's `details` (`{"since": "2026-03-01",
"numbers": 101, "cases": [{"user_id", "case": "youth" | "no_number" |
"rest_friday" | "started"}]}`): payroll numbers in the definition's order for
managers and workers, the reset's open periods from `since`, still `joined`,
and the cases (a minor until the first of the month six months on, no number,
rest on Friday, a start on the 10th of three months ago set by the owner); no
log rows. `@db/payroll-details` reads details and periods under the person's
session and `team_youth`, and writes both with the secret key (refusals read by
`detailsFailureOf` in `@domain/payroll-details`). Covered by
`payroll_details.test.sql`, `demo_reset`, `hours_kept`, `wages`, `lists` and
`rls_enabled`.

The pay rules (`20261110000700_pay_rules.sql`, payroll P6). No new table: the
hours engine is pure code (`@domain/payroll`), and its rules are time clock
settings. `public.set_module_settings` (sealed's, replaced) keeps the punch
code for an owner or the team, adds the pay rules (`workWeek`, `shortDay`,
`restStart`, `restStartTime`, `workersSeeEstimate`: 42501 'Only an owner or the
team changes the pay rules') and the pay estimate for the team alone
(`payEstimate`: 42501 'Only the team switches the pay estimate'), and checks
each for its type (22023 'Not a pay rule setting': a week of `unset`, `five` or
`six`, a short day 0 to 4, a start at `candleLighting` or `fixed`, a time as
`HH:MM`, yes or no for the two switches). `private.seed_demo_pay` (P5's) first
lays a definition's `settings` (`{"time_clock": {"payEstimate": true}}`, by
module key, a key that is no module skipped) over what the template gave, so
both demo businesses show the estimate and a real one starts without it; the
hosted definitions are patched by id and their settings set at once, with no
reset. The pay screens read the engine's month with `currentPayrollMonth` and
`currentOwnPay` (app code), through the reads above, and drop every amount
while `payEstimate` is off. Covered by `pay_rules.test.sql`. `getTimeEntries`
reads page by page (`allPages` in `pages.ts`, ordered by `clock_in` then
`id`): PostgREST returns at most `max_rows` (1000, here and on hosted
Supabase) without an error, and payroll reads a whole business's entries over
four months.

The file for payroll (`20261110000800_payroll_export.sql`, payroll P8). No
table: the app builds the month's XLSX from the reads above and keeps it
nowhere. `public.note_payroll_export(business, pay_month, person_count,
shift_count, engine_version)` (the person's own session, `authenticated` only)
logs each file as `payroll.export` before it goes out: `{month, format:
"xlsx", people, shifts, ids: false, engine}`, every file its own row. Only a
`clock.payroll` holder or the team viewing as an accountant, with the time
clock on, takes one (42501 otherwise); no month, a count under zero or none,
or no engine version is 22023. A pay row, so only pay holders read it, and the
activity log shows it. `@db/payroll` calls it (`notePayrollExport`, which
throws when the row isn't written, so no file goes out without it) and reads
when a month's newest file went out (`getLastPayrollExport`), for the screen's
"changed since the last file". Covered by `payroll_export.test.sql`.

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
