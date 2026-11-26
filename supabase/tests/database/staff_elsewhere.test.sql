-- Inviting from a list, part 6 (20261128000400_staff_elsewhere.sql): the
-- console's new-business wizard asks which of its list's numbers are on a
-- business's staff already, the numbers in the call's body, and its "הוספת
-- אדם" asks the same of one number with its business left out (known issue
-- 109). Who may ask (the ConceptApp team, with the secret key), what it
-- answers (of the numbers given, those an active member holds on a staff,
-- an accountant's place aside, each once, in the order given; none for an
-- empty list or none at all), a business left out (its staff out, another's
-- still in, an accountant's place still none, null as no business), a
-- demo's staff counted as any other's while the demo stays as it was,
-- nothing written, and the cap. Fixed ids (d8…) and numbers of its own
-- (050-000-65xx), so nothing here meets the seed or another test.
begin;
select plan(24);

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('d8000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.b(n integer) returns uuid language sql as $$
  select ('d8000000-0000-4000-b000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.ph(n integer) returns text language sql as $$
  select '+9725000065' || lpad(n::text, 2, '0')
$$;
-- What a call said: 'ok', or its SQLSTATE and its hint.
create function pg_temp.said(actor uuid, phones text[]) returns text language plpgsql as $$
declare
  why text;
begin
  perform public.admin_staff_elsewhere(actor, phones);
  return 'ok';
exception when others then
  get stacked diagnostics why = pg_exception_hint;
  return sqlstate || coalesce(' ' || nullif(why, ''), '');
end;
$$;

-- 1 on the ConceptApp team (an onboarder), 2 owner of A, 3 a worker of A,
-- 4 A's accountant and nothing else, 5 a worker who left A, 6 a worker of D
-- (a demo closed to invites), 7 A's accountant and B's manager, 8 nobody's,
-- 10 owner of B, 11 on the ConceptApp team (its admin). 9 has an invite to A
-- and no account.
insert into auth.users (id, aud, role, phone)
select pg_temp.p(n), 'authenticated', 'authenticated', '9725000065' || lpad(n::text, 2, '0')
from generate_series(1, 11) as n
where n <> 9;

insert into public.platform_staff (user_id, role)
values (pg_temp.p(1), 'onboarder'), (pg_temp.p(11), 'platform_admin');

insert into public.businesses (id, slug, name)
values
  (pg_temp.b(1), 'sel-a', 'Elsewhere A'),
  (pg_temp.b(2), 'sel-b', 'Elsewhere B'),
  (pg_temp.b(3), 'sel-d', 'Elsewhere demo');
insert into private.demo_businesses (business_id, definition)
values (pg_temp.b(3), '{"slug": "sel-d"}');

insert into public.memberships (business_id, user_id, role, perms, active, left_at)
values
  (pg_temp.b(1), pg_temp.p(2), 'owner', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(3), 'worker', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(4), 'accountant', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(5), 'worker', '{}', false, now()),
  (pg_temp.b(3), pg_temp.p(6), 'worker', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(7), 'accountant', '{}', true, null),
  (pg_temp.b(2), pg_temp.p(7), 'manager', '{}', true, null),
  (pg_temp.b(2), pg_temp.p(10), 'owner', '{}', true, null);

insert into public.invites (business_id, phone, role, token_hash, invited_by)
values (pg_temp.b(1), pg_temp.ph(9), 'worker', repeat('d', 64), pg_temp.p(2));

-- What the database holds before any call.
create temporary table before on commit drop as
  select
    (select count(*) from public.invites) as invites,
    (select count(*) from public.audit_log) as logged,
    (select count(*) from public.notifications) as told;

------------------------------------------------------------------------------
-- 1. The function, and who may call it

select has_function('public', 'admin_staff_elsewhere', array['uuid', 'text[]', 'uuid'],
  'the console asks which of its numbers are on a staff already, a business left out or none');
select is(
  (select pg_catalog.format_type(p.prorettype, null)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_staff_elsewhere'),
  'text[]',
  'and gets the numbers back, nothing else'
);
select ok(
  (select p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_staff_elsewhere'),
  'it runs as its owner, with an empty search path'
);
select ok(
  (select p.provolatile = 's'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_staff_elsewhere'),
  'and only reads'
);
select ok(
  not has_function_privilege('anon', 'public.admin_staff_elsewhere(uuid, text[], uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_staff_elsewhere(uuid, text[], uuid)', 'execute'),
  'no browser role asks where else a number works'
);
select ok(
  has_function_privilege('service_role', 'public.admin_staff_elsewhere(uuid, text[], uuid)', 'execute'),
  'the secret key does'
);
select is(pg_temp.said(pg_temp.p(2), array[pg_temp.ph(3)]), '42501',
  'a business''s owner is refused: only the ConceptApp team asks');
select is(pg_temp.said(pg_temp.p(99), array[pg_temp.ph(3)]) || ' ' || pg_temp.said(null, array[pg_temp.ph(3)]),
  '42501 42501',
  'and anyone unknown, or no one, is refused too');

------------------------------------------------------------------------------
-- 2. What it answers

-- With the secret key, as @db/invites asks: nobody's number, A's worker, an
-- accountant only, A's owner, one who left, an accountant who manages B, a
-- number with an invite and no account, A's worker again, no number, and
-- the demo's worker.
set local role service_role;
select is(
  public.admin_staff_elsewhere('d8000000-0000-4000-a000-000000000001',
    array['+972500006508', '+972500006503', '+972500006504', '+972500006502',
      '+972500006505', '+972500006507', '+972500006509', '+972500006503',
      null, '+972500006506']),
  array['+972500006503', '+972500006502', '+972500006507', '+972500006506'],
  'only the numbers on a staff, an accountant''s place aside, each once in the order given'
);
-- As "הוספת אדם" asks on A's page, with A left out: A's worker and owner
-- are on A's own staff, B's owner and the one who manages B (and keeps A's
-- books) on another's.
select is(
  public.admin_staff_elsewhere('d8000000-0000-4000-a000-000000000001',
    array['+972500006503', '+972500006502', '+972500006510', '+972500006507'],
    'd8000000-0000-4000-b000-000000000001'),
  array['+972500006510', '+972500006507'],
  'the business left out has its own staff left out, and another''s still answered'
);
reset role;

select is(
  public.admin_staff_elsewhere(pg_temp.p(1),
    array[pg_temp.ph(3), pg_temp.ph(2), pg_temp.ph(10), pg_temp.ph(7), pg_temp.ph(4)],
    pg_temp.b(2)),
  array[pg_temp.ph(3), pg_temp.ph(2)],
  'with B left out its manager is out too: his other place is A''s accountant''s, which is no staff place'
);
select is(
  public.admin_staff_elsewhere(pg_temp.p(1),
    array[pg_temp.ph(3), pg_temp.ph(2), pg_temp.ph(10), pg_temp.ph(7), pg_temp.ph(4), pg_temp.ph(6)],
    null),
  array[pg_temp.ph(3), pg_temp.ph(2), pg_temp.ph(10), pg_temp.ph(7), pg_temp.ph(6)],
  'no business left out (null) answers as the wizard''s call, every staff counted'
);
select is(
  public.admin_staff_elsewhere(pg_temp.p(1), array[pg_temp.ph(7)], pg_temp.b(1)),
  array[pg_temp.ph(7)],
  'one number, as "הוספת אדם" asks: A''s accountant who manages B is on another staff for A'
);
select is(
  public.admin_staff_elsewhere(pg_temp.p(1), array[pg_temp.ph(3)], pg_temp.b(1))
    || public.admin_staff_elsewhere(pg_temp.p(1), array[pg_temp.ph(4)], pg_temp.b(2)),
  '{}'::text[],
  'and A''s own worker for A, or A''s accountant alone for B, is on none'
);
select is(
  public.admin_staff_elsewhere(pg_temp.p(1), array[pg_temp.ph(6), pg_temp.ph(3)], pg_temp.b(99)),
  array[pg_temp.ph(6), pg_temp.ph(3)],
  'a business nobody is in leaves nobody out'
);

select is(
  public.admin_staff_elsewhere(pg_temp.p(1), array[pg_temp.ph(6)]),
  array[pg_temp.ph(6)],
  'a demo business''s staff counts as any other''s: one place on a staff a login'
);
select ok(
  private.closed_to_invites(pg_temp.b(3)),
  'and asking leaves the demo closed to invites'
);
select is(
  (select row(
     (select count(*) from public.invites),
     (select count(*) from public.audit_log),
     (select count(*) from public.notifications))::text),
  (select row(b.invites, b.logged, b.told)::text from before b),
  'nothing is written: no invite, no row in the log, nobody told'
);
select is(public.admin_staff_elsewhere(pg_temp.p(1), '{}'::text[]), '{}'::text[],
  'an empty list answers none');
select is(public.admin_staff_elsewhere(pg_temp.p(1), null), '{}'::text[],
  'and so does no list at all');
select is(
  public.admin_staff_elsewhere(pg_temp.p(1),
    array[pg_temp.ph(8), pg_temp.ph(4), pg_temp.ph(5), pg_temp.ph(9)]),
  '{}'::text[],
  'numbers on no staff answer none: nobody''s, an accountant''s, one who left, an invite''s'
);
select is(
  public.admin_staff_elsewhere(pg_temp.p(11), array[pg_temp.ph(10), pg_temp.ph(2)]),
  array[pg_temp.ph(10), pg_temp.ph(2)],
  'the ConceptApp team''s admin asks too'
);

------------------------------------------------------------------------------
-- 3. The cap

select is(
  pg_temp.said(pg_temp.p(1),
    (select array_agg('+97250009' || lpad(n::text, 4, '0')) from generate_series(1, 300) as n)),
  'ok',
  '300 numbers are asked at once'
);
select is(
  pg_temp.said(pg_temp.p(1),
    (select array_agg('+97250009' || lpad(n::text, 4, '0')) from generate_series(1, 301) as n)),
  '54000 limit',
  'and more are refused'
);

select * from finish();
rollback;
