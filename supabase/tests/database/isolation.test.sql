-- Tenant isolation: a member of business A never sees business B, and each
-- role sees only what it should inside its own business.
begin;
select plan(24);

-- Fixtures: business A (owner, manager, worker) and business B (owner).
insert into auth.users (id, aud, role, phone)
values
  ('20000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000101'),
  ('20000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000102'),
  ('20000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000103'),
  ('20000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000104'),
  ('20000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000105');

insert into public.businesses (id, slug, name)
values
  ('20000000-0000-4000-b000-00000000000a', 'business-a', 'Business A'),
  ('20000000-0000-4000-b000-00000000000b', 'business-b', 'Business B');

insert into public.memberships (business_id, user_id, role, active)
values
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000a', 'owner', true),
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000b', 'manager', true),
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000c', 'worker', true),
  ('20000000-0000-4000-b000-00000000000b', '20000000-0000-4000-a000-00000000000d', 'owner', true),
  -- A former worker of A: membership switched off.
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000e', 'worker', false);

insert into public.business_modules (business_id, module_key)
values
  ('20000000-0000-4000-b000-00000000000a', 'scheduling'),
  ('20000000-0000-4000-b000-00000000000b', 'scheduling');

insert into public.invites (business_id, phone, token_hash)
values
  ('20000000-0000-4000-b000-00000000000a', '+972500000201', 'hash-a'),
  ('20000000-0000-4000-b000-00000000000b', '+972500000202', 'hash-b');

insert into public.audit_log (business_id, action)
values
  ('20000000-0000-4000-b000-00000000000a', 'test.a'),
  ('20000000-0000-4000-b000-00000000000b', 'test.b');

-- Act as a signed-in user.
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Worker of A ---------------------------------------------------------------
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000c');

select results_eq(
  'select slug from public.businesses',
  array['business-a'],
  'worker of A sees business A only'
);
select results_eq(
  'select count(*)::int from public.memberships',
  array[4],
  'worker of A sees the four memberships of A and none of B'
);
select is_empty(
  $$select 1 from public.memberships where business_id = '20000000-0000-4000-b000-00000000000b'$$,
  'worker of A sees no membership of B'
);
select results_eq(
  'select count(*)::int from public.business_modules',
  array[1],
  'worker of A sees the modules of A only'
);
select results_eq(
  'select count(*)::int from public.profiles',
  array[3],
  'worker of A sees themself and the active members of A'
);
select is_empty(
  $$select 1 from public.profiles where id = '20000000-0000-4000-a000-00000000000d'$$,
  'worker of A does not see the owner of B'
);
select is_empty('select 1 from public.invites', 'a worker reads no invites');
select is_empty('select 1 from public.audit_log', 'a worker reads no audit log');
select throws_ok('select 1 from public.templates', '42501', null, 'templates are server-only');

select throws_ok(
  $$update public.businesses set name = 'Hacked' where slug = 'business-a'$$,
  '42501',
  null,
  'a worker cannot rename the business'
);
select throws_ok(
  $$update public.memberships set role = 'owner' where user_id = '20000000-0000-4000-a000-00000000000c'$$,
  '42501',
  null,
  'a worker cannot change their own role'
);
select throws_ok(
  $$insert into public.memberships (business_id, user_id, role)
    values ('20000000-0000-4000-b000-00000000000b', '20000000-0000-4000-a000-00000000000c', 'owner')$$,
  '42501',
  null,
  'a worker cannot join business B'
);
select lives_ok(
  $$update public.profiles set full_name = 'Noa' where id = '20000000-0000-4000-a000-00000000000c'$$,
  'a worker can rename themself'
);
select throws_ok(
  $$update public.profiles set phone = '+972500000999' where id = '20000000-0000-4000-a000-00000000000c'$$,
  '42501',
  null,
  'a worker cannot change their phone number directly'
);

-- Manager of A ---------------------------------------------------------------
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000b');

select results_eq(
  'select token_hash from public.invites',
  array['hash-a'],
  'manager of A reads the invites of A only'
);
select results_eq(
  'select action from public.audit_log',
  array['test.a'],
  'manager of A reads the audit log of A only'
);
select throws_ok(
  $$update public.businesses set name = 'Renamed' where slug = 'business-a'$$,
  '42501',
  null,
  'a manager does not rename the business from the browser'
);

-- Owner of A ---------------------------------------------------------------
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000a');

-- Renaming goes through the server (set_business_details), for owners too.
select throws_ok(
  $$update public.businesses set name = 'Business A2' where slug = 'business-a'$$,
  '42501',
  null,
  'the owner renames only through the server'
);
select throws_ok(
  $$update public.businesses set name = 'Taken over' where slug = 'business-b'$$,
  '42501',
  null,
  'the owner of A cannot rename business B'
);
select throws_ok(
  $$update public.businesses set slug = 'new-slug' where slug = 'business-a'$$,
  '42501',
  null,
  'the slug changes only through the server'
);
select throws_ok(
  $$delete from public.businesses where slug = 'business-a'$$,
  '42501',
  null,
  'nobody deletes a business from the browser'
);
select throws_ok(
  $$insert into public.audit_log (business_id, action) values ('20000000-0000-4000-b000-00000000000a', 'forged')$$,
  '42501',
  null,
  'the audit log is written only by the server'
);

-- Former worker of A ----------------------------------------------------------
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000e');

select is_empty('select 1 from public.businesses', 'an inactive member sees no business');
select results_eq(
  'select count(*)::int from public.profiles',
  array[1],
  'an inactive member sees only themself'
);

select * from finish();
rollback;
