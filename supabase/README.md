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

To have something to open, run it with "demo" on, once. It adds the demo restaurant
from `hosted-demo.sql` and does nothing if it's already there. People come in through
the passive door at `/enter` (`packages/domain/passive-sign-in.ts`), which needs the three
variables in `.env.example` in Vercel and nothing else.

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
- URL configuration: the site URL is the deployed address, not `127.0.0.1`.
- The first platform admin: add a user by phone, then in the SQL editor:

  ```sql
  insert into public.platform_staff (user_id, role)
  values ('<the user id>', 'platform_admin');
  ```
