-- Closing the pilot, PR 8 (20261128000800_clock_editors.sql): who may edit
-- the clock in a business, for a worker whose shift needs fixing to write
-- to. What it answers (the active members who hold clock.edit, by id, with
-- their role and the business's name for them over their profile's, null
-- for none: the owner always, managers by default, a worker by a grant of
-- their own; never an accountant, someone who left or a worker without
-- it), as the owner's switches move it (managers lowered,
-- workers raised), and to whom (the business's own active members, the
-- accountant among them; nothing for another business's member, someone
-- who left, a view session, the secret key, an unknown business, or while
-- the clock is off; anon may not call it). It runs as its owner with an
-- empty search path, and stable, so it can write nothing. Fixed ids (ec…)
-- and numbers of its own (97250059xxxx), so nothing here meets the seed or
-- another test.
begin;
select plan(13);

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('ec000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.b(n integer) returns uuid language sql as $$
  select ('ec000000-0000-4000-b000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
-- The claims last until the rollback, and `reset role` keeps them: nobody
-- is signed in only once they are cleared.
create function pg_temp.sign_out() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;

-- In A: 1 its owner, 2 a manager the business names its own way, 3 the
-- worker who asks, 4 a worker given clock.edit of their own, 5 its
-- accountant, 6 a manager who left, 7 a worker without it, 8 a manager
-- nobody named. 9 owns B. 10 is on the ConceptApp team, viewing A as
-- a worker.
insert into auth.users (id, aud, role, phone)
select pg_temp.p(n), 'authenticated', 'authenticated', '97250059' || lpad(n::text, 4, '0')
from generate_series(1, 10) as n;

update public.profiles p
set full_name = names.name
from (
  values
    (1, 'אורי בעלים'), (2, 'שירן'), (3, 'נועה'), (4, 'גיל'), (5, 'גלית'),
    (6, 'עומר'), (7, 'טל'), (8, null), (9, 'מיכל'), (10, 'דנה')
) as names (n, name)
where p.id = pg_temp.p(names.n);

insert into public.businesses (id, slug, name)
values
  (pg_temp.b(1), 'ced-a', 'Clock Editors A'),
  (pg_temp.b(2), 'ced-b', 'Clock Editors B');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.b(1), 'time_clock', true, '{}'),
  (pg_temp.b(2), 'time_clock', true, '{}');

insert into public.memberships (business_id, user_id, role, perms, active, left_at)
values
  (pg_temp.b(1), pg_temp.p(1), 'owner', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(2), 'manager', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(3), 'worker', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(4), 'worker', '{clock.edit}', true, null),
  (pg_temp.b(1), pg_temp.p(5), 'accountant', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(6), 'manager', '{}', false, now()),
  (pg_temp.b(1), pg_temp.p(7), 'worker', '{}', true, null),
  (pg_temp.b(1), pg_temp.p(8), 'manager', '{}', true, null),
  (pg_temp.b(2), pg_temp.p(9), 'owner', '{}', true, null);

insert into public.member_names (business_id, user_id, name)
values (pg_temp.b(1), pg_temp.p(2), 'שירן מנהלת');

insert into public.platform_staff (user_id, role)
values (pg_temp.p(10), 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values (pg_temp.p(10), pg_temp.b(1), 'worker');

-- The owner's switch for a role, as /manage/roles sets it.
create function pg_temp.role_edits(r public.member_role, on_or_off boolean)
returns void language sql as $$
  select public.set_role_permission(pg_temp.p(1), pg_temp.b(1), r, 'clock.edit', on_or_off)
$$;

------------------------------------------------------------------------------
-- What it answers, on the defaults

select pg_temp.sign_in(pg_temp.p(3));
select results_eq(
  $$select user_id, role::text, name from public.clock_editors(pg_temp.b(1))$$,
  $$values
    (pg_temp.p(1), 'owner'::text, 'אורי בעלים'::text),
    (pg_temp.p(2), 'manager', 'שירן מנהלת'),
    (pg_temp.p(4), 'worker', 'גיל'),
    (pg_temp.p(8), 'manager', null)$$,
  'a worker reads the owner, the managers and a worker given it, by id, each by the business''s name or none: never the accountant, who left, or a worker without it'
);
reset role;

select pg_temp.sign_in(pg_temp.p(5));
select results_eq(
  $$select user_id from public.clock_editors(pg_temp.b(1))$$,
  $$values (pg_temp.p(1)), (pg_temp.p(2)), (pg_temp.p(4)), (pg_temp.p(8))$$,
  'the accountant, an active member, reads the same'
);
reset role;

------------------------------------------------------------------------------
-- As the owner's switches move it

select pg_temp.role_edits('manager', false);
select pg_temp.sign_in(pg_temp.p(3));
select results_eq(
  $$select user_id, role::text from public.clock_editors(pg_temp.b(1))$$,
  $$values (pg_temp.p(1), 'owner'::text), (pg_temp.p(4), 'worker')$$,
  'managers lowered to view: the owner and the worker given it of their own'
);
reset role;

select pg_temp.role_edits('manager', true);
select pg_temp.role_edits('worker', true);
select pg_temp.sign_in(pg_temp.p(3));
select results_eq(
  $$select user_id from public.clock_editors(pg_temp.b(1))$$,
  $$values (pg_temp.p(1)), (pg_temp.p(2)), (pg_temp.p(3)), (pg_temp.p(4)),
    (pg_temp.p(7)), (pg_temp.p(8))$$,
  'workers raised: every active member on the staff, the one asking too (the app leaves them out)'
);
reset role;
select pg_temp.role_edits('worker', false);

------------------------------------------------------------------------------
-- To whom

select pg_temp.sign_in(pg_temp.p(9));
select is_empty(
  $$select * from public.clock_editors(pg_temp.b(1))$$,
  'another business''s owner reads nothing of it'
);
select results_eq(
  $$select user_id, role::text, name from public.clock_editors(pg_temp.b(2))$$,
  $$values (pg_temp.p(9), 'owner'::text, 'מיכל'::text)$$,
  'and reads their own business''s: themself, its owner'
);
reset role;

select pg_temp.sign_in(pg_temp.p(6));
select is_empty(
  $$select * from public.clock_editors(pg_temp.b(1))$$,
  'someone who left reads nothing'
);
reset role;

select pg_temp.sign_in(pg_temp.p(10));
select is_empty(
  $$select * from public.clock_editors(pg_temp.b(1))$$,
  'a view session reads nothing: its clock is view only, and its chat shows nothing'
);
reset role;

select pg_temp.sign_in(pg_temp.p(3));
select is_empty(
  $$select * from public.clock_editors('ec000000-0000-4000-b000-0000000000ff'::uuid)$$,
  'an unknown business answers nothing'
);
reset role;

-- The worker above is still in the claims until signed out.
select pg_temp.sign_out();
set local role service_role;
select is_empty(
  $$select * from public.clock_editors(pg_temp.b(1))$$,
  'the secret key, nobody signed in, reads nothing'
);
reset role;

update public.business_modules set enabled = false
where business_id = pg_temp.b(1) and module_key = 'time_clock';
select pg_temp.sign_in(pg_temp.p(3));
select is_empty(
  $$select * from public.clock_editors(pg_temp.b(1))$$,
  'with the clock off, nobody edits it'
);
reset role;
update public.business_modules set enabled = true
where business_id = pg_temp.b(1) and module_key = 'time_clock';

------------------------------------------------------------------------------
-- How it runs

select ok(
  not has_function_privilege('anon', 'public.clock_editors(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.clock_editors(uuid)', 'execute'),
  'anon may not call it; someone signed in may'
);

select ok(
  (select p.prosecdef and p.provolatile = 's'
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'clock_editors'),
  'it runs as its owner, stable, with an empty search path'
);

select * from finish();
rollback;
