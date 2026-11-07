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
its template with the same id. The shop's week is always published
(`public.renew_demo_schedules`); the restaurant's is the visitor's to build.

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
