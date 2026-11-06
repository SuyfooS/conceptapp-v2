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

The rest is set in the dashboards, because `config.toml` is never pushed. Names are
from memory, so check them on screen:

- Authentication: phone sign-in on, new signups off (`[auth] enable_signup = false`).
  Accounts come from invites, through the admin API.
- SMS: test numbers with fixed codes for now. A real provider comes later (Orel, 6 November).
- URL configuration: the site URL is the deployed address, not `127.0.0.1`.
- Vercel: the three variables in `.env.example`, for Production and Preview.
- The first platform admin: add a user by phone in Authentication, then in the SQL
  editor:

  ```sql
  insert into public.platform_staff (user_id, role)
  values ('<the user id>', 'platform_admin');
  ```
