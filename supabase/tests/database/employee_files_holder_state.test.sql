-- Whether the signed-in person may read the business's files as a holder
-- now (20261126000500_file_holder_state.sql; profile H6a): asked before any
-- file is read, for the session only, never signed out; nobody signed in
-- gets null, the module off 'off', and otherwise the file's own gate
-- (private.file_holder_gate): an owner and the accountant 'ack' until they
-- confirm today's duties and 'ready' after (another version's confirmation
-- counts for nothing), a manager or a worker 'not_holder', a manager given
-- the files personally 'ack', an owner who left and another business's
-- owner 'not_member', a view as the owner 'viewing'. None of it logs: the
-- one row added is the duties' own. Fixed ids (f6…), numbers (050-079-xxxx)
-- and slugs (efh-…), so nothing here meets the seed or another test.
begin;
select plan(16);

-- A: 1 its owner, 2 a manager, 3 a worker, 4 the accountant, 5 an owner who
-- left, 6 a manager given the files personally. B: 7 its owner. 8 is on the
-- ConceptApp team, viewing A as an owner.
insert into auth.users (id, aud, role, phone)
select ('f6000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250079' || lpad(n::text, 4, '0')
from generate_series(1, 8) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('f6000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'f6000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'f6000000-0000-4000-b000-000000000002'::uuid
$$;

insert into public.businesses (id, slug, name)
values (pg_temp.a(), 'efh-a', 'Holders A'), (pg_temp.b(), 'efh-b', 'Holders B');
insert into public.memberships (business_id, user_id, role, active)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', true),
  (pg_temp.a(), pg_temp.p(2), 'manager', true),
  (pg_temp.a(), pg_temp.p(3), 'worker', true),
  (pg_temp.a(), pg_temp.p(4), 'accountant', true),
  (pg_temp.a(), pg_temp.p(5), 'owner', false),
  (pg_temp.a(), pg_temp.p(6), 'manager', true),
  (pg_temp.b(), pg_temp.p(7), 'owner', true);
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'employee_files', true, '{}'),
  (pg_temp.b(), 'employee_files', true, '{}');
insert into public.platform_staff (user_id, role) values (pg_temp.p(8), 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values (pg_temp.p(8), pg_temp.a(), 'owner');
-- The owner gives manager 6 the files, as the access screen will (H6c).
select public.set_member_permission(pg_temp.p(1), pg_temp.a(), pg_temp.p(6), 'people.files', true);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.sign_out() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'authenticated', true);
$$;
-- Every row of A's and B's log, to see that asking writes none.
create function pg_temp.logged() returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.business_id in (pg_temp.a(), pg_temp.b())
$$;
create temporary table before_asking as select pg_temp.logged() as rows;

------------------------------------------------------------------------------
-- The function

select has_function('public', 'file_holder_state', array['uuid'],
  'the screens ask public.file_holder_state');
select ok(not has_function_privilege('anon', 'public.file_holder_state(uuid)', 'execute'),
  'nobody signed out runs it');
select ok(has_function_privilege('authenticated', 'public.file_holder_state(uuid)', 'execute'),
  'a session does');

select pg_temp.sign_out();
select is(public.file_holder_state(pg_temp.a()), null::text, 'nobody signed in is told nothing');

------------------------------------------------------------------------------
-- Owners and the accountant: the duties first

select pg_temp.sign_in(pg_temp.p(1));
select is(public.file_holder_state(pg_temp.a()), 'ack',
  'an owner must confirm the duties first');
select public.acknowledge_file_duties(pg_temp.a(), '2026-11-v1');
select is(public.file_holder_state(pg_temp.a()), 'ready',
  'and is ready once they are confirmed');
select pg_temp.sign_in(pg_temp.p(4));
select is(public.file_holder_state(pg_temp.a()), 'ack', 'the accountant must confirm them too');
reset role;
-- The accountant confirmed an older wording only.
insert into private.file_acknowledgements (business_id, user_id, version)
values (pg_temp.a(), pg_temp.p(4), '2026-10-v0');
select pg_temp.sign_in(pg_temp.p(4));
select is(public.file_holder_state(pg_temp.a()), 'ack',
  'and an older wording counts for nothing');

------------------------------------------------------------------------------
-- Everyone else

select pg_temp.sign_in(pg_temp.p(2));
select is(public.file_holder_state(pg_temp.a()), 'not_holder', 'a manager holds no files');
select pg_temp.sign_in(pg_temp.p(3));
select is(public.file_holder_state(pg_temp.a()), 'not_holder', 'nor a worker');
select pg_temp.sign_in(pg_temp.p(6));
select is(public.file_holder_state(pg_temp.a()), 'ack',
  'a manager given the files personally holds them, the duties first');
select pg_temp.sign_in(pg_temp.p(5));
select is(public.file_holder_state(pg_temp.a()), 'not_member', 'an owner who left is no member');
select pg_temp.sign_in(pg_temp.p(7));
select is(public.file_holder_state(pg_temp.a()), 'not_member',
  'nor is another business''s owner');
select pg_temp.sign_in(pg_temp.p(8));
select is(public.file_holder_state(pg_temp.a()), 'viewing', 'a view as the owner is a view');
reset role;

update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'employee_files';
select pg_temp.sign_in(pg_temp.p(1));
select is(public.file_holder_state(pg_temp.a()), 'off', 'with the module off, it says so');
reset role;

select is(pg_temp.logged(), (select rows + 1 from before_asking),
  'asking logs nothing: the one row added is the duties'' own');

select * from finish();
rollback;
