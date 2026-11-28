-- Closing the pilot, PR 11 (the plan of 27 November 2026, section 1, C): a
-- free uptime check, including the database. /health says only that the
-- server answers (known issue 91). /health/db (app/health/db/route.ts,
-- through @db/health) asks the database this one question too, with the
-- publishable key and no session, as anyone on the internet could, and the
-- uptime workflow (.github/workflows/uptime.yml) asks both four times an
-- hour.
--
--   the call    public.ping(): true, and nothing else. It takes no
--               argument, reads no table, no setting and no row, and says
--               nothing of anyone: its whole body is `select true`, so an
--               answer means only that the database answered.
--   who         anon (the publishable key with nobody signed in, as
--               /health/db asks it) and authenticated: the first function
--               in public meant for anon through the Data API (private,
--               whose helpers anon may already run, is not exposed). Not
--               PUBLIC, so a role made later doesn't get it.
--   how         security invoker, so it can never do more than its caller;
--               stable, so it can write nothing; an empty search path.
--
-- No table, policy or other grant changes. Before this reaches a project,
-- PostgREST answers PGRST202, which @db/health reads as the database's API
-- answering, so the code can deploy first without the check crying wolf.

create function public.ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true
$$;

comment on function public.ping() is
  'True, and nothing else: whether the database answers, for /health/db and the uptime check (closing the pilot, PR 11). Takes no argument, reads no table and says nothing of anyone. Anyone may call it with the publishable key, signed in or not.';

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
