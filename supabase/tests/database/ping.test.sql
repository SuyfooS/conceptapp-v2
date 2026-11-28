-- Closing the pilot, PR 11 (20261128000900_ping.sql): public.ping(), the one
-- question /health/db asks the database with the publishable key and nobody
-- signed in. Anyone may ask it, signed in or not (anon and authenticated,
-- never PUBLIC, so no role made later gets it); it takes nothing and answers
-- true, and nothing else; its whole body is `select true`, so it reads no
-- table, no setting and no row; and it runs as its caller, stable, with an
-- empty search path, so it can write nothing and do no more than whoever
-- asks.
begin;
select plan(6);

------------------------------------------------------------------------------
-- Who may ask it

-- As /health/db asks it: the publishable key, nobody signed in.
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(public.ping(), true, 'with nobody signed in it answers true');
reset role;

-- Someone signed in, as any screen could.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1000000-0000-4000-a000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;
select is(public.ping(), true, 'someone signed in may ask it too');
reset role;
-- The claims last until the rollback, and `reset role` keeps them.
select set_config('request.jwt.claims', '', true);

select ok(
  has_function_privilege('anon', 'public.ping()', 'execute')
  and has_function_privilege('authenticated', 'public.ping()', 'execute')
  and (
    select p.proacl is not null
      and not exists (
        select 1
        from aclexplode(p.proacl) as a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
    from pg_proc p
    where p.oid = 'public.ping()'::regprocedure
  ),
  'anon and authenticated may call it; PUBLIC may not'
);

------------------------------------------------------------------------------
-- What it is

select ok(
  (select p.pronargs = 0 and p.prorettype = 'boolean'::regtype and not p.proretset
   from pg_proc p
   where p.oid = 'public.ping()'::regprocedure),
  'it takes nothing and gives one boolean'
);

select is(
  (select btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))
   from pg_proc p
   where p.oid = 'public.ping()'::regprocedure),
  'select true',
  'its whole body is select true: it reads no table, no setting and no row'
);

select ok(
  (select not p.prosecdef
     and p.provolatile = 's'
     and l.lanname = 'sql'
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )
   from pg_proc p
   join pg_language l on l.oid = p.prolang
   where p.oid = 'public.ping()'::regprocedure),
  'it runs as its caller, stable, in SQL, with an empty search path'
);

select * from finish();
rollback;
