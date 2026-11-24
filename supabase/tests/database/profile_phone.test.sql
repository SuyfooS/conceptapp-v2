-- The profile's number follows the sign-in number
-- (20261127000600_profile_phone.sql, known issue 69): the team's change of
-- auth.users.phone writes profiles.phone in E.164 with the +, so
-- public.own_phone() says the new one; another profile still holding the
-- new number while its sign-in has another lets it go, and one whose
-- sign-in still has it (the number written with the +) refuses the change;
-- a number taken away leaves none; an update that leaves the number, a
-- refused change and a number the profile's check refuses leave the
-- profile as it was. The week after a change is noted as before. The
-- trigger runs after each row's update, as its owner, and nobody calls its
-- function. The one-off backfill runs before any test, so nothing here
-- reaches it. Fixed ids (fa…) and numbers (050-091-xxxx), so nothing here
-- meets the seed or another test.
begin;
select plan(18);

-- 1 changes number, 2 holds a stale copy of the number 1 moves to, 3 is
-- anyone.
insert into auth.users (id, aud, role, phone)
select ('fa000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250091' || lpad(n::text, 4, '0')
from generate_series(1, 3) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('fa000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function pg_temp.shown(n integer) returns text language sql as $$
  select p.phone from public.profiles p where p.id = pg_temp.p(n)
$$;

create function pg_temp.changes(n integer) returns integer language sql as $$
  select count(*)::integer from private.phone_changes c where c.user_id = pg_temp.p(n)
$$;

-- How it is set up.
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.follow_phone_to_profile()'::regprocedure),
  'the trigger''s function runs as its owner, with an empty search path'
);
select ok(
  not has_function_privilege('authenticated', 'public.follow_phone_to_profile()', 'execute')
  and not has_function_privilege('anon', 'public.follow_phone_to_profile()', 'execute'),
  'and nobody signed in or out may call it'
);
select ok(
  exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_phone_followed'
      and t.tgfoid = 'public.follow_phone_to_profile()'::regprocedure
      and t.tgenabled = 'O'
      and (t.tgtype & 1) = 1   -- for each row
      and (t.tgtype & 2) = 0   -- after
      and (t.tgtype & 16) = 16 -- on update
  ),
  'it fires after each row''s update of auth.users'
);

select is(pg_temp.shown(1), '+972500910001', 'a new account''s profile has its number, with the +');

-- As before this migration: a profile left behind by an earlier change.
update public.profiles set phone = '+972500919999' where id = pg_temp.p(2);

select throws_ok(
  $$update auth.users set phone = '972500910011' where id = pg_temp.p(1)$$,
  '42501', null, 'a change that isn''t the team''s is refused'
);
select is(pg_temp.shown(1), '+972500910001', 'and the profile keeps its number');

select set_config('ca.phone_change', pg_temp.p(1)::text, true);
update auth.users set phone = '972500919999' where id = pg_temp.p(1);
select is(pg_temp.shown(1), '+972500919999', 'the team''s change reaches the profile');
select is(pg_temp.shown(2), null, 'and a stale copy of that number elsewhere lets it go');
select is(pg_temp.changes(1), 1, 'the week after the change is noted as before');

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.p(1), 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(public.own_phone(), '+972500919999', 'the person''s own number is the new one');
reset role;

-- The team writing 3's number with the +: auth.users takes it as another,
-- but 3 still signs in with it, so the change is refused.
select throws_ok(
  $$update auth.users set phone = '+972500910003' where id = pg_temp.p(1)$$,
  '23505', null, 'a number someone else still signs in with is refused'
);
select is(pg_temp.shown(3), '+972500910003', 'and they keep it');

-- Naming the number and leaving it: the trigger is asked and does nothing.
update auth.users set phone = phone, last_sign_in_at = now() where id = pg_temp.p(1);
select is(pg_temp.shown(1), '+972500919999', 'an update that leaves the number leaves the profile');
select is(pg_temp.changes(1), 1, 'and notes no change');

select throws_ok(
  $$update auth.users set phone = 'not-a-number' where id = pg_temp.p(1)$$,
  '23514', null, 'a number the profile can''t hold rolls the change back'
);
select is((select u.phone from auth.users u where u.id = pg_temp.p(1)), '972500919999',
  'so the sign-in keeps its number');

update auth.users set phone = null where id = pg_temp.p(1);
select is(pg_temp.shown(1), null, 'a number taken away leaves the profile none');

select is(pg_temp.shown(3), '+972500910003', 'and nobody else''s profile changes');

select * from finish();
rollback;
