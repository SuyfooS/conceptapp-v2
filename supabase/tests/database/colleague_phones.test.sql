-- Phones (20261108000300_sealed.sql): members read their colleagues' names and
-- photos but not their numbers; owners and managers get a business's numbers
-- from team_phones (and the ConceptApp team viewing it as a manager); everyone
-- reads their own from own_phone.
begin;
select plan(11);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into auth.users (id, aud, role, phone)
values
  ('6d000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000991'),
  ('6d000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000992'),
  ('6d000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000993'),
  ('6d000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000994'),
  ('6d000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000995');

-- a: owner of X; b: manager of X; c: worker of X; d: worker of Y; e: on the
-- ConceptApp team, viewing X as a manager.
insert into public.businesses (id, slug, name)
values
  ('6d000000-0000-4000-b000-000000000001', 'phones-x', 'Phones X'),
  ('6d000000-0000-4000-b000-000000000002', 'phones-y', 'Phones Y');

insert into public.memberships (business_id, user_id, role)
values
  ('6d000000-0000-4000-b000-000000000001', '6d000000-0000-4000-a000-00000000000a', 'owner'),
  ('6d000000-0000-4000-b000-000000000001', '6d000000-0000-4000-a000-00000000000b', 'manager'),
  ('6d000000-0000-4000-b000-000000000001', '6d000000-0000-4000-a000-00000000000c', 'worker'),
  ('6d000000-0000-4000-b000-000000000002', '6d000000-0000-4000-a000-00000000000d', 'worker');

insert into public.platform_staff (user_id, role)
values ('6d000000-0000-4000-a000-00000000000e', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('6d000000-0000-4000-a000-00000000000e', '6d000000-0000-4000-b000-000000000001', 'manager');

update public.profiles set full_name = 'Colleague'
where id = '6d000000-0000-4000-a000-00000000000a';

-- A worker.
select pg_temp.sign_in('6d000000-0000-4000-a000-00000000000c');
select is(
  (select full_name from public.profiles where id = '6d000000-0000-4000-a000-00000000000a'),
  'Colleague',
  'a worker reads a colleague''s name'
);
select throws_ok(
  'select phone from public.profiles',
  '42501', null, 'but no one''s number from the table, their own included'
);
select throws_ok(
  'select * from public.profiles',
  '42501', null, 'not even by asking for everything'
);
select is(
  (select count(*)::int from public.team_phones('6d000000-0000-4000-b000-000000000001')),
  0,
  'a worker gets no numbers from team_phones'
);
select is(public.own_phone(), '+972500000993', 'a worker reads their own number');
reset role;

-- A manager.
select pg_temp.sign_in('6d000000-0000-4000-a000-00000000000b');
select results_eq(
  $$select phone from public.team_phones('6d000000-0000-4000-b000-000000000001') order by phone$$,
  $$values ('+972500000991'::text), ('+972500000992'::text), ('+972500000993'::text)$$,
  'a manager gets the numbers of the business''s active members'
);
select is(
  (select count(*)::int from public.team_phones('6d000000-0000-4000-b000-000000000002')),
  0,
  'and none of another business'
);
reset role;

-- The team, viewing.
select pg_temp.sign_in('6d000000-0000-4000-a000-00000000000e');
select is(
  (select count(*)::int from public.team_phones('6d000000-0000-4000-b000-000000000001')),
  3,
  'the team viewing as a manager gets them too'
);
reset role;

-- Former members' numbers are not given.
update public.memberships set active = false
where user_id = '6d000000-0000-4000-a000-00000000000c';
select pg_temp.sign_in('6d000000-0000-4000-a000-00000000000a');
select is(
  (select count(*)::int from public.team_phones('6d000000-0000-4000-b000-000000000001')),
  2,
  'an owner gets no former member''s number'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.team_phones(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.own_phone()', 'execute'),
  'signed out, there are no numbers to get'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'full_name', 'select')
  and has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'select')
  and not has_column_privilege('authenticated', 'public.profiles', 'phone', 'select'),
  'members read names and photos, not numbers'
);

select * from finish();
rollback;
