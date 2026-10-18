-- The ConceptApp team: staff rows are private to each person, and only
-- staff can read the admin console's business list.
begin;
select plan(13);

insert into auth.users (id, aud, role, phone)
values
  ('30000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000301'),
  ('30000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000302'),
  ('30000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000303');

insert into public.platform_staff (user_id, role)
values
  ('30000000-0000-4000-a000-00000000000a', 'platform_admin'),
  ('30000000-0000-4000-a000-00000000000b', 'onboarder');

insert into public.businesses (id, slug, name)
values ('30000000-0000-4000-b000-00000000000a', 'staff-test-a', 'Staff test A');

-- An owner of business A who is not on the team.
insert into public.memberships (business_id, user_id, role)
values ('30000000-0000-4000-b000-00000000000a', '30000000-0000-4000-a000-00000000000c', 'owner');

insert into public.invites (business_id, phone, token_hash, expires_at, claimed_at)
values
  ('30000000-0000-4000-b000-00000000000a', '+972500000311', 'staff-open', now() + interval '1 day', null),
  ('30000000-0000-4000-b000-00000000000a', '+972500000312', 'staff-claimed', now() + interval '1 day', now()),
  ('30000000-0000-4000-b000-00000000000a', '+972500000313', 'staff-expired', now() - interval '1 day', null);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Platform admin ------------------------------------------------------------
select pg_temp.sign_in('30000000-0000-4000-a000-00000000000a');

select results_eq(
  'select role::text from public.platform_staff',
  array['platform_admin'],
  'a platform admin reads only their own staff row'
);
select ok(
  (select count(*) from public.admin_businesses()) >= 1,
  'a platform admin reads the business list'
);
select results_eq(
  $$select name, members::int, open_invites::int from public.admin_businesses()
    where slug = 'staff-test-a'$$,
  $$values ('Staff test A'::text, 1, 1)$$,
  'the list counts active members and open, unexpired invites'
);
select is_empty(
  'select 1 from public.businesses',
  'staff read no tenant rows directly; the list is the only way in'
);
select throws_ok(
  $$insert into public.platform_staff (user_id, role)
    values ('30000000-0000-4000-a000-00000000000c', 'onboarder')$$,
  '42501', null,
  'a platform admin cannot add staff from the browser'
);
select throws_ok(
  $$update public.platform_staff set role = 'onboarder'$$,
  '42501', null,
  'staff rows cannot be changed from the browser'
);

-- Onboarder -----------------------------------------------------------------
select pg_temp.sign_in('30000000-0000-4000-a000-00000000000b');

select results_eq(
  'select role::text from public.platform_staff',
  array['onboarder'],
  'an onboarder reads only their own staff row'
);
select ok(
  (select count(*) from public.admin_businesses() where slug = 'staff-test-a') = 1,
  'an onboarder reads the business list'
);
select throws_ok(
  $$update public.platform_staff set role = 'platform_admin'$$,
  '42501', null,
  'an onboarder cannot promote themselves'
);

-- A business owner who is not on the team -----------------------------------
select pg_temp.sign_in('30000000-0000-4000-a000-00000000000c');

select is_empty(
  'select 1 from public.platform_staff',
  'a business owner sees no staff rows'
);
select throws_ok(
  'select * from public.admin_businesses()',
  '42501', 'Platform staff only',
  'a business owner cannot read the business list'
);

-- Anonymous -----------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  'select * from public.admin_businesses()',
  '42501', null,
  'anonymous visitors cannot call the business list'
);
select throws_ok(
  'select * from public.platform_staff',
  '42501', null,
  'anonymous visitors cannot read staff rows'
);

reset role;
select * from finish();
rollback;
