-- The profile's number follows the sign-in number
-- (20261127000600_profile_phone.sql, known issue 69): the team's change of
-- auth.users.phone writes profiles.phone in E.164 with the +, so
-- public.own_phone() says the new one; another profile still holding the
-- new number while its sign-in has another lets it go, and one whose
-- sign-in still has it (the number written with the +) refuses the change;
-- a number taken away leaves none; an update that leaves the number, a
-- refused change and a number the profile's check refuses leave the
-- profile as it was. The week after a change is noted as
-- before. Fixed ids (fa…) and numbers (050-095-xxxx), so nothing here meets
-- the seed or another test.
begin;
select plan(14);

-- 1 changes number, 2 holds a stale copy of the number 1 moves to, 3 is
-- anyone.
insert into auth.users (id, aud, role, phone)
select ('fa000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250095' || lpad(n::text, 4, '0')
from generate_series(1, 3) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('fa000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function pg_temp.shown(n integer) returns text language sql as $$
  select p.phone from public.profiles p where p.id = pg_temp.p(n)
$$;

select is(pg_temp.shown(1), '+972500950001', 'a new account''s profile has its number, with the +');

-- As before this migration: a profile left behind by an earlier change.
update public.profiles set phone = '+972500959999' where id = pg_temp.p(2);

select throws_ok(
  $$update auth.users set phone = '972500950011' where id = pg_temp.p(1)$$,
  '42501', null, 'a change that isn''t the team''s is refused'
);
select is(pg_temp.shown(1), '+972500950001', 'and the profile keeps its number');

select set_config('ca.phone_change', pg_temp.p(1)::text, true);
update auth.users set phone = '972500959999' where id = pg_temp.p(1);
select is(pg_temp.shown(1), '+972500959999', 'the team''s change reaches the profile');
select is(pg_temp.shown(2), null, 'and a stale copy of that number elsewhere lets it go');
select is((select count(*)::integer from private.phone_changes c where c.user_id = pg_temp.p(1)), 1,
  'the week after the change is noted as before');

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.p(1), 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(public.own_phone(), '+972500959999', 'the person''s own number is the new one');
reset role;

-- The team writing 3's number with the +: auth.users takes it as another,
-- but 3 still signs in with it, so the change is refused.
select throws_ok(
  $$update auth.users set phone = '+972500950003' where id = pg_temp.p(1)$$,
  '23505', null, 'a number someone else still signs in with is refused'
);
select is(pg_temp.shown(3), '+972500950003', 'and they keep it');

update auth.users set last_sign_in_at = now() where id = pg_temp.p(1);
select is(pg_temp.shown(1), '+972500959999', 'a sign-in leaves the number');

select throws_ok(
  $$update auth.users set phone = 'not-a-number' where id = pg_temp.p(1)$$,
  '23514', null, 'a number the profile can''t hold rolls the change back'
);
select is((select u.phone from auth.users u where u.id = pg_temp.p(1)), '972500959999',
  'so the sign-in keeps its number');

update auth.users set phone = null where id = pg_temp.p(1);
select is(pg_temp.shown(1), null, 'a number taken away leaves the profile none');

select is(pg_temp.shown(3), '+972500950003', 'and nobody else''s profile changes');

select * from finish();
rollback;
