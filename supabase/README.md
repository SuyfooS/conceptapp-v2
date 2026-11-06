# supabase/

Supabase CLI config, migrations, seed data and the database tests.
Projects: `conceptapp-dev` now, `conceptapp-prod` when the pilot goes live.
Region: Central EU (Frankfurt).

- `migrations/`: the schema, in order. Add a file with
  `pnpm exec supabase migration new <name>`; never edit a merged one.
- `seed.sql`: a demo restaurant with an owner, a manager and a worker.
  Local and CI only.
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

The rest is set in the dashboards, because `config.toml` is never pushed:

- Authentication, Sign In / Providers, Phone:
  - Turn phone sign-in on. Supabase won't save test numbers without an SMS provider,
    even though it texts them nothing. Choose Twilio and put placeholder text in its
    required fields. A number that isn't a test number then fails on sign-in, so no
    real person gets a message. A real provider comes later (Orel, 6 November).
  - Test numbers, without the `+` and with a code you choose, kept out of the repo:
    `972500000101=CODE,972500000102=CODE,972500000103=CODE,972500000104=CODE`.
  - Test OTPs Valid Until: a date is required. Anyone with a test number and its code
    can sign in, so end this before real people use this project.
- Authentication, new signups off (`[auth] enable_signup = false`). Accounts come from
  invites, through the admin API.
- URL configuration: the site URL is the deployed address, not `127.0.0.1`.
- Vercel: the three variables in `.env.example`, for Production and Preview.
- SQL editor: paste `hosted-demo.sql` once. It adds a demo restaurant and the people
  for those four numbers, including the first platform admin. Sign in with 050-000-0102
  as its owner, 050-000-0103 as its manager, 050-000-0104 as a worker, or 050-000-0101
  for the console.
