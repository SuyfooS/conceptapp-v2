# supabase/

Supabase CLI config, migrations, seed data and the database tests.
Projects: `conceptapp-dev` now, `conceptapp-prod` when the pilot goes live.
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
People come in through the passive door at `/enter` (`packages/domain/passive-sign-in.ts`),
which needs the three variables in `.env.example` in Vercel and nothing else.

Each demo business starts the way `private.demo_businesses` describes it (written by
`seed.sql` and `hosted-demo.sql`). `public.reset_demo_business` puts one back that way:
it deletes the business, with everything that belongs to it, and makes it again from
its template with the same id. Hours, breaks and the log never go with a business
(`20261110000100_hours_kept.sql`), so the reset locks the business, which lets a
visitor's write already under way finish and holds new ones back, then deletes the demo's
own through `private.purge_business_records`, which only the database's owner may run
(the reset, and test clean-ups). The shop's week is always published
(`public.renew_demo_schedules`); the restaurant's is the visitor's to build. Both start
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
(`public.note_auth_attempt`; the server asks before every code it sends or checks). The
team tunes the limits there, with SQL. `seed.sql` lifts them, because the browser tests
sign the same people in many times from one machine. They hold the app's own way in only:
the auth API is public, so a script calling it directly meets only Supabase's and Twilio's
limits, and CAPTCHA once it is on (below).

### Notifications on the phone

`20261109000500_push.sql` schedules two jobs with pg_cron: `notifications` every minute,
which asks the app to send pushes only while something is due, and `notifications-clean`
once a day. The minute job calls the app through pg_net with two secrets from Vault, and
without them calls nothing (what is due then goes out with the next action in the app).
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
another), it asks the app's `/cron/list-photos`, with the same two Vault secrets as the minute
job, to remove the files through Storage (only the app reaches them) and mark their items; without
the secrets it calls nothing and the photos wait.
`20261111000200_chat.sql` adds a sixth, `chat`, every 10 minutes: pure SQL
(`private.chat_tick`), with no pg_net and no Vault secret. It deletes the text of a removed
message once its 10 minutes of undo are over, and a demo business's visitors' messages
after an hour. From `20261111000500_chat_files.sql` it also asks the app's
`/cron/chat-files`, with the same two Vault secrets, whenever a chat file is due: past its
business's `fileDays` (90 unless the team chose 30 or 180), the oldest past its
`fileSpaceMb` (100 MB unless the team chose 50 or 200), a removed message's once its undo is
over, a reservation never sent, and anything in the `chat-files` bucket a day old that no
row points at (from `20261111000600_chat_pdfs.sql`, a PDF the browser put through its signed
upload and never sent among them). From `20261111000700_documents.sql` it also lists the
file of an official document someone removed, once its 10 minutes of undo are over (the row
stays, saying its file is gone), and the `documents` bucket's own unused places and
orphans; documents are never listed for days or space. The app removes them through Storage and marks them;
without the secrets it calls nothing and the files wait. `seed.sql` switches all six off locally
and in CI, and only a demo definition that says `"scheduledLists": true` (the hosted ones)
opens today's lists when it is reset; the tests call what the jobs run, at times they choose.

Once the migration has gone through the Migrate workflow and `CRON_SECRET` is in Vercel
(`README.md`), add the two secrets in the dashboard, Project Settings, Vault (not the SQL
editor, which keeps what was typed):

- `app_url`: the app's exact address, with no path and no redirect on the way, for
  example `https://www.conceptapp.co.il` once that is where the app is opened. pg_net
  does not carry a POST through a redirect.
- `cron_secret`: the same value as `CRON_SECRET` in Vercel.

A nightly run never writes these, never calls `/cron/notifications`, `/cron/list-photos` or
`/cron/chat-files` on a hosted project and never sends a test notification
(`docs/AGENT.md`).

### Real sign-in, later

Orel put it off on 6 November. When it comes, turn `PASSIVE_SIGN_IN` off, and in the
dashboards, because `config.toml` is never pushed:

- Authentication, Sign In / Providers, Phone: turn phone sign-in on, with an SMS provider.
  Supabase won't save test numbers without one, even though it texts them nothing.
- Test numbers, without the `+` and with a code kept out of the repo, need Test OTPs Valid
  Until set. Anyone with a test number and its code can sign in, so end this before real
  people use the project.
- Authentication: new signups off (`[auth] enable_signup = false`). Accounts come from
  invites, through the admin API.
- Authentication, Rate Limits: SMS sent per hour, and token verifications per 5 minutes
  per address, no looser than `private.auth_limits`; in Twilio Verify, its own limits per
  number and Fraud Guard. CAPTCHA (Cloudflare Turnstile) only once the app sends its token,
  or every sign-in stops.
- URL configuration: the site URL is the deployed address, not `127.0.0.1`.
- The first platform admin: add a user by phone, then in the SQL editor:

  ```sql
  insert into public.platform_staff (user_id, role)
  values ('<the user id>', 'platform_admin');
  ```
