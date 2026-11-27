# supabase/

Supabase CLI config, migrations, seed data and the database tests.
Projects: `conceptapp-dev` (the demo, and the team's tests) and `conceptapp-prod` (real
businesses) once a first real business is near; its setup, step by step:
[`docs/production.md`](../docs/production.md).
Region: Central EU (Frankfurt).

- `migrations/`: the schema, in order. Add a file with
  `pnpm exec supabase migration new <name>`; never edit a merged one.
- `seed.sql`: two demo businesses, a restaurant and a shop, each with an owner,
  a manager and workers, plus two people on the ConceptApp team. Local and CI only.
- `tests/database/`: pgTAP tests for RLS and tenant isolation.

Local database (needs Docker):

```
pnpm db:start
pnpm db:test
pnpm db:reset
pnpm db:types
```

`db:reset` re-applies every migration and the seed. `db:types` regenerates
`packages/db/database.types.ts` after a schema change.

## Hosted project

Migrations reach `conceptapp-dev` only by hand, and never from a nightly run:

1. If the project is paused, press Restore in the Supabase dashboard. A free project
   pauses after a week without activity.
2. GitHub, Actions, "Migrate conceptapp-dev", Run workflow, with "apply" off. This
   lists what would run and changes nothing.
3. Read the list, then run it again with "apply" on. The seed never runs here.

To have something to open, run it with "apply" and "demo" on. "demo" adds the demo
businesses from `hosted-demo.sql` that aren't there yet, and leaves the others as
visitors left them; it is safe to run again, and needs the migrations applied first.
It also writes every definition again, so a change to one (a new key, such as the
restaurant's `sampleAvailability`) reaches the project only with "demo" on.
People come in through the demo door at `/enter` (`packages/domain/passive-sign-in.ts`) on a
site whose `DEMO_DOOR` is on (the default when unset; `packages/db/env.ts`), which needs the
three Supabase variables in `.env.example` in Vercel and nothing else.

Migrations reach `conceptapp-prod` only through "Migrate conceptapp-prod"
(`.github/workflows/migrate-prod.yml`), the same way: by hand, with "apply" off first. It runs
from `main` only, in the GitHub environment `conceptapp-prod`, which waits for Orel's approval
on every run and alone holds the project's two secrets, `PROD_SUPABASE_DB_PASSWORD` and
`PROD_SUPABASE_PROJECT_REF`. Their names are their own: GitHub hands a job the repository
secret of the same name when its environment has none, and `conceptapp-dev`'s are repository
secrets, so a missing one stops the run before it connects anywhere. Before anything else it
checks that the project holds no demo business (one that does is `conceptapp-dev`, its secrets
entered by mistake), and it never adds the demo or the seed, and never runs a SQL file
(`tooling/migrate-prod.test.ts`). With "apply" on, its summary ends with the commit it applied
from and the two lines that release that commit to the site of real businesses, which deploys
the branch `production`, not `main`: the schema first, then the code. A nightly run and a live
session never run or approve it, and never push to `production`.
The setup of the environment and of the project: [`docs/production.md`](../docs/production.md),
B2 and B3; each release after that: its last section.

Each demo business starts the way `private.demo_businesses` describes it (written by
`seed.sql` and `hosted-demo.sql`). `public.reset_demo_business` puts one back that way:
it deletes the business, with everything that belongs to it, and makes it again from
its template with the same id. Hours, breaks and the log never go with a business
(`20261110000100_hours_kept.sql`), so the reset locks the business, which lets a
visitor's write already under way finish and holds new ones back, then deletes the demo's
own through `private.purge_business_records`, which only the database's owner may run
(the reset, and test clean-ups). The shop's week is always published
(`public.renew_demo_schedules`); the restaurant's is the visitor's to build. On the hosted
project its manager and two workers have next week's availability sent, so the builder's
fill from availability has someone to place: `hosted-demo.sql`'s `sampleAvailability`,
written at every entry at the door and every time Today opens there (for whoever stayed
signed in past the week's turn) for whoever hasn't sent theirs, cut by Shabbat as the
form cuts it, never over an answer someone sent and never on a published week
(`public.renew_demo_availability`, `20261128000100_demo_sample_availability.sql`); a reset
takes the week, and the next entry or Today writes it again. `seed.sql` has none, so the browser
tests send their own. Both start
with the demo's own conversations (`private.seed_demo_chat`,
`20261111000300_chat_on.sql`, and from `20261111000400_chat_announce.sql` the manager's
pinned announcement, which the first two workers confirmed): in the whole team's group, in the first worker's first
department and in the manager's private chat with that worker, written by the people
each definition names by role, so neither definition needed a change and that
migration's Migrate run needs no "demo". A visitor's messages go after an hour (the
`chat` job) and with every reset. From `20261111000700_documents.sql` (chat C6) they also
start with three sample documents (`private.seed_demo_documents`, called from the chat
seed, so the reset itself is not replaced): a payslip from the accountant to the first
worker, a procedure from the manager to everyone else on the staff asking for "קראתי",
which the second worker confirmed, and a sick note from the first worker, which the owner
opened. Samples only, with no note and no file, titled with their category's own words,
from both definitions alike. Their files are the app's own (`public/demo-documents/`, made
by `node tooling/demo-documents.mjs`, fake and marked "SAMPLE" and "דוגמה"), served by
`/document-files` for those rows alone (C7). Documents are never deleted but by the reset (`private.purge_business_records`), and a
demo business takes no uploaded one unless its definition says `"chatFiles": true` (the
local seed's restaurant only), so a visitor never leaves a file or typed words in a row
that waits for the next reset.

An official document's file is read by the app's server alone
(`20261111000900_documents_server_only.sql`, Orel's decision of 12 November 2026): the
`documents` bucket has no policy, so nobody downloads, lists or signs a link to a file of it
with their own session, and the server reads one with the secret key only after
`public.open_document` opened it for the signed-in person, so each opening is in the access
log. After the Migrate run, the dashboard's Storage, Policies shows none for `documents`; a
policy added there by hand would open the files to people straight from Storage again, past
the log.

A demo business takes no invites and nobody joins one, since anyone at the door is its
owner. Only a definition with `"invites": true` opens one: `seed.sql` does, so the browser
tests can invite and join; `hosted-demo.sql` never does (`tooling/demo-invites.test.ts`).
The server asks the same question first (`public.closed_to_invites`, secret key only,
`20261110001200_invites_open.sql`), so the Team screen offers no invite and no new link
in a closed one and `/team/invite` is not found there (#80).

Sign-in codes are counted per number and per caller against `private.auth_limits`
(`public.note_auth_attempt`; the server asks before every code it sends or checks), in
every window there: a quarter of an hour for both (5 codes sent and 10 checked per number,
20 and 40 per caller), and a day per number (15 sent, 30 checked)
(`20261127000200_sign_in_windows.sql`). A check counts against its number only while a
code sent to it may still be waiting: a send counted for it in the last ten minutes, a
code's lifetime in Twilio Verify. Otherwise it is counted for its caller only, and the
server says "wrong code" without asking the auth server. Between two codes to one number
the app has its own wait, the same for every number (`private.auth_send_wait`, one row, 65
seconds): a send within it of the number's last counted one (on either side, since of two
asked for at once the one the app stamped later may be counted first) is counted for its
caller only, asks the auth server nothing, and reads on sign-in and on `/join` as a code
asked for (the earlier code still works), while the file's codes say "in a few seconds".
It is longer than the auth server's own wait per number (`sms_max_frequency`, below), so
that wait refuses no code the app lets go, unless someone asked the auth server directly.
What the auth server still refuses (the project's SMS in an hour, its requests from one
address), and a send the SMS provider failed, sent nothing: the server gives it back, for the number and the caller
(`public.forget_auth_attempt`), and the screen says something went wrong. The sign-in screen
answers the same for every valid number, registered or not, and nothing is sent to one with
no account, which therefore still reaches the code step while the SMS cap is used up or the
provider is down (`docs/ROADMAP.md`, known issue 98). So what is counted for such a number
reached nobody: joining from an open invite clears it before the invite's code is counted
(`public.forget_number_attempts`, which keeps the counts of a number with an account), and a
stranger's tries can't hold a new person out. On `/join` the first send answers too many and
too soon as the code step, as for a code that went, and a new code asked for too soon reads
as one asked for, so neither the first answer nor the wait tells the link's holder whether
the number already had an account. "Too many" said later still does: after five sign-in
codes to the number and then a new code on `/join`, or one sign-in code and ten wrong checks
and then a check on `/join`, only a number with an account hears it, and its person sees
the five codes, or only one stray code in the second way (known issue 94). A try its
caller's windows hold answers 100000 over the caller's own seconds, whatever the number's
(`20261128000600_network_limit.sql`), and sign-in and `/join` say it: "נשלחו הרבה קודים
מהרשת הזאת", with the minutes left and the way round, mobile data. That count is the same
for every number (joining clears only the number's), but for two sends. One given back is
given back for the caller too: on sign-in only a number with an account meets that, and its
send already answered "something went wrong" (known issue 98). One on `/join` that the
number's own count holds is counted for nobody, the network included, and joining cleared
the counts of a number with no account, so only one with an account is held so: after the
five codes of known issue 94, which already tell, the network's count ends one lower for it.
The number's own count stays unsaid. The team tunes the limits and the wait in those tables, with SQL.
A number locked by the day's window (someone sent it codes and typed many wrong ones) is
cleared with:

```sql
delete from private.auth_attempts
where key_hash = encode(sha256(convert_to('phone:+9725…', 'UTF8')), 'hex');
```

(the number in E.164, as `+972501234567`). `seed.sql` lifts the limits, because the
browser tests sign the same people in many times from one machine, and sets the wait to 2.25
seconds, just past the local auth server's 2 (`config.toml`). They hold the app's own
way in only: the auth API is public, so a script calling it directly meets only Supabase's
and Twilio's limits, and, once Supabase's CAPTCHA is on (below), Cloudflare's check before
every code.

### Changing someone's sign-in number

A sign-in number changes only as the ConceptApp team changes it
(`20261127000400_file_step_up.sql`): a trigger on `auth.users` refuses any other change of
`phone`, and any new `phone_change`, so a session copied from someone's browser can't move
their number, and with it every code, to another phone. The person's own "change my number"
is refused, and so is the dashboard's edit of a user's phone. The team changes it in the SQL
editor, after checking who is asking, in one transaction that names the person first:

```
begin;
select set_config('ca.phone_change', '<user id>', true);
update auth.users set phone = '9725XXXXXXXX' where id = '<user id>';
commit;
```

The number goes as E.164 without the `+`, as the auth server keeps it. For a week after, the
person changes no bank account and, as a holder, opens no files (`private.phone_changes`,
`public.bank_change_hold`), and nothing shortens it. The profile's number follows in the same
transaction (`20261127000600_profile_phone.sql`), so the team's phones and the person's own
show the new one. Written with the `+`, a number someone else signs in with is refused (23505,
"Another account signs in with this number"), and one the profile can't hold rolls the change
back (23514).

### Notifications on the phone

`20261109000500_push.sql` schedules two jobs with pg_cron: `notifications` every minute,
which asks the app to send pushes only while something is due, and `notifications-clean`
once a day. The minute job calls the app through pg_net with two secrets from Vault, and
without them calls nothing (what is due then goes out with the next action in the app).
From `20261112000200_reminders.sql` the same minute job first writes the reminders that are
due (`private.run_reminders`): next week's availability not sent yet, to the workers and
managers who haven't sent it, and at the due moment how many haven't, to owners and managers;
someone still clocked in after their shift, to them; an entry open past 24 hours, to owners
and managers. Each comes once, never in a demo business, at the times the business chose on
`/manage/notifications`; it needs no secret, and only its pushes wait for them. The same
migration has `notifications-clean` also delete old lines: read ones after 90 days, any
after 180.
From `20261125000100_order_taking_notifications.sql` (waiter mode P8b) the minute job also
writes "המסך לא מחובר" (`private.run_order_notices`, after the reminders): once per ticket that
a running prep screen of its department hasn't fetched 2 minutes after it was sent or called,
only within 10 minutes of that, to its sender and whoever runs orders on the clock, in a demo
in the app alone. It needs no secret, and only its pushes wait for them. "מוכן" needs no job:
the app sends its push itself about 11 seconds after it. `notifications-clean` deletes every
line about orders (`order.*`) 2 days after it was written.
`20261110001000_payroll_months.sql` adds a third, `payroll`, daily at 06:00 UTC: on each
business's 2nd it reminds pay holders to close last month (never in a demo business), in
the app and, like any line, on the phone. It needs no secret.
`20261110001300_list_schedules.sql` adds a fourth, `lists`, every minute: pure SQL
(`private.lists_tick`), with no pg_net and no Vault secret. It opens the lists each
template's times have opened by then (up to 12 hours late after an outage, never a flood;
the times there already count from the migration, so its first minute catches up on
nothing), reminds before they are due, marks late ones and closes as missed what nobody did
(never a list opened again by hand), each once;
its lines go to phones with the `notifications` job.
`20261110001500_list_photos.sql` adds a fifth, `list-photos`, daily at 03:43 UTC: while a photo
on a list is older than its business keeps photos (`photoDays`, 90 days unless the team chose
another), or (from `20261127000300_files_server_only.sql`) a profile photo a day old has no
profile pointing at it, it asks the app's `/cron/list-photos`, with the same two Vault secrets as
the minute job, to remove the files through Storage (only the app reaches them) and mark the
lists' items; without the secrets it calls nothing and the photos wait.
`20261111000200_chat.sql` adds a sixth, `chat`, every 10 minutes: pure SQL
(`private.chat_tick`), with no pg_net and no Vault secret. It deletes the text of a removed
message once its 10 minutes of undo are over, and a demo business's visitors' messages
after an hour. From `20261111000500_chat_files.sql` it also asks the app's
`/cron/chat-files`, with the same two Vault secrets, whenever a chat file is due: past its
business's `fileDays` (90 unless the team chose 30 or 180), the oldest past its
`fileSpaceMb` (100 MB unless the team chose 50 or 200; from `20261127000300_files_server_only.sql`
first what one person holds beyond half of it), a removed message's once its undo is
over, a reservation never sent, and anything in the `chat-files` bucket a day old that no
row points at (from `20261111000600_chat_pdfs.sql`, a PDF the browser put through its signed
upload and never sent among them). From `20261111000700_documents.sql` it also lists the
file of an official document someone removed, once its 10 minutes of undo are over (the row
stays, saying its file is gone), and the `documents` bucket's own unused places and
orphans; documents are never listed for days or space. The app removes them through Storage and marks them;
without the secrets it calls nothing and the files wait.
`20261120000400_order_taking_orders_demo.sql` adds a seventh, `order-taking`, hourly at 23
minutes past: pure SQL (`private.order_taking_tick`), with no pg_net and no Vault secret. Two
days after an order closes or is cancelled, or after its last round while nobody closes it, it
erases its lines' notes and its takeaway's label, and makes its rounds' body hashes from their
ids alone; 30 days after someone sent a round, opened, moved, reopened, closed or cancelled an
order, called, made ready or served a ticket, or took back, cancelled or gave a line on the
house, it forgets who; and it deletes a demo business's orders two days after they opened,
leaving alone one a reset holds. It never deletes an order of a real business and writes no log
row.
`20261126000200_employee_files.sql` (the hiring file, H4) adds an eighth, `audit-guard`, daily at
02:41 UTC: pure SQL (`private.audit_guard_tick`), with no pg_net and no Vault secret. It checks
that the activity log is still append-only (its two triggers on, and no update, delete or
truncate for `service_role`, `authenticated` or `anon`) and that the hiring file's tables are
still shut (row-level security on, no privilege for those roles, the triggers that keep files
and keys on), records what it found in `private.audit_guard_runs` (read with the secret key by
`public.audit_guard_status()`; the console's card is H6's) and raises a warning naming anything
missing, never an error. It also deletes runs older than 400 days and the counts of refused
views (`private.file_denials`) older than 2 days.
`seed.sql` switches all eight off locally and in CI, and only a demo definition that says
`"scheduledLists": true` (the hosted ones) opens today's lists when it is reset; the tests call
what the jobs run, at times they choose.

Once the migration has gone through the Migrate workflow and `CRON_SECRET` is in Vercel
(`README.md`), add the two secrets in the dashboard, Project Settings, Vault (not the SQL
editor, which keeps what was typed):

- `app_url`: `https://www.conceptapp.co.il`, exactly: the main domain (#1), with no path
  and no redirect on the way. pg_net does not carry a POST through a redirect, so never
  the apex or the `vercel.app` address, which only redirect to it.
- `cron_secret`: the same value as `CRON_SECRET` in Vercel.

A nightly run never writes these, never calls `/cron/notifications`, `/cron/list-photos` or
`/cron/chat-files` on a hosted project and never sends a test notification
(`docs/AGENT.md`).

### Real sign-in in production

The site of real businesses has `DEMO_DOOR=off` in Vercel: `/enter` goes straight on to
`/sign-in`, with no demo people, no one-press sign-in and no demo reset (`proxy.ts`,
`app/(auth)/enter`). The dashboard's half, which `config.toml` never carries since it is
never pushed, is in [`docs/production.md`](../docs/production.md): B3 for the API, session and
storage settings, B4 for sign-in (phone with Twilio Verify, new signups off, no test numbers,
the rate limits, the site URL, CAPTCHA) and B6 for the first platform admin. The app sends
Cloudflare Turnstile's token with every code (`signInWithOtp`'s `captchaToken`, P9b), so
CAPTCHA goes on from the dashboard, `Authentication → Attack Protection`, in the order of
production.md's Turnstile section (and B4 step 7 for production). Locally `[auth.captcha]`
stays commented out: the app sends Cloudflare's test token, which nobody checks. The app's server sends and checks every code and refreshes every session, and
passes on no caller's address, so Supabase's limits per address are one limit for the whole
site: B4 sizes them for the site's traffic together, and `private.auth_limits` alone counts each
number and each caller.

Two settings in the dashboards go with the app's own counts and wait (above), on both
projects:

- In Twilio Verify, keep a code's lifetime at the ten minutes `public.note_auth_attempt`
  counts, or change the two together.
- Keep the auth server's own wait between two codes to one number (`sms_max_frequency`,
  60 seconds unless changed) a few seconds shorter than the app's
  (`private.auth_send_wait`, 65), and change the two together: where the auth server's is
  the longer, a number with an account gets "something went wrong" on sign-in inside it,
  and one without gets the code step.

On `conceptapp-dev` test numbers, without the `+` and with a code kept out of the repo, need
Test OTPs Valid Until set, and Supabase won't save them without an SMS provider, even though
it texts them nothing. Anyone with a test number and its code can sign in: never on
`conceptapp-prod`.
