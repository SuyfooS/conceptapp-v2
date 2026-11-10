-- The file for payroll (20261110000800_payroll_export.sql): every file a pay
-- holder or a view as an accountant takes is one payroll.export row, written
-- with the person's own session before the file goes out, and nobody else
-- gets one. The rows are pay rows: only pay holders read them. Fixed ids.
begin;
select plan(26);

insert into auth.users (id, aud, role, phone)
values
  ('7f000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500003201'),
  ('7f000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500003202'),
  ('7f000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500003203'),
  ('7f000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500003204'),
  ('7f000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500003205'),
  ('7f000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500003206'),
  ('7f000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated', '972500003207');

-- S: a owner, b manager, c worker, d accountant. e and f are on the
-- ConceptApp team, viewing S as an accountant and as a manager. T is another
-- business, g its owner.
insert into public.businesses (id, slug, name)
values
  ('7f000000-0000-4000-b000-000000000001', 'pe-s', 'Payroll export S'),
  ('7f000000-0000-4000-b000-000000000002', 'pe-t', 'Payroll export T');
insert into public.memberships (business_id, user_id, role)
values
  ('7f000000-0000-4000-b000-000000000001', '7f000000-0000-4000-a000-00000000000a', 'owner'),
  ('7f000000-0000-4000-b000-000000000001', '7f000000-0000-4000-a000-00000000000b', 'manager'),
  ('7f000000-0000-4000-b000-000000000001', '7f000000-0000-4000-a000-00000000000c', 'worker'),
  ('7f000000-0000-4000-b000-000000000001', '7f000000-0000-4000-a000-00000000000d', 'accountant'),
  ('7f000000-0000-4000-b000-000000000002', '7f000000-0000-4000-a000-000000000011', 'owner');
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('7f000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('7f000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');
insert into public.platform_staff (user_id, role)
values
  ('7f000000-0000-4000-a000-00000000000e', 'onboarder'),
  ('7f000000-0000-4000-a000-00000000000f', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('7f000000-0000-4000-a000-00000000000e', '7f000000-0000-4000-b000-000000000001', 'accountant'),
  ('7f000000-0000-4000-a000-00000000000f', '7f000000-0000-4000-b000-000000000001', 'manager');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- How many files of S the log has from this person.
create function pg_temp.files_by(uid uuid) returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.business_id = '7f000000-0000-4000-b000-000000000001'
    and a.action = 'payroll.export' and a.actor_id = uid
$$;

-- How many files of S the signed-in person reads in the log.
create function pg_temp.files_read() returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.business_id = '7f000000-0000-4000-b000-000000000001'
    and a.action = 'payroll.export'
$$;

------------------------------------------------------------------------------
-- Who may call it

select ok(
  has_function_privilege('authenticated', 'public.note_payroll_export(uuid, date, integer, integer, text)', 'execute')
  and not has_function_privilege('anon', 'public.note_payroll_export(uuid, date, integer, integer, text)', 'execute'),
  'the file is noted with the person''s own session, never signed out'
);

------------------------------------------------------------------------------
-- What a file must say

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', null, 4, 120, '2026-11')$$,
  '22023', null, 'a file of no month is refused'
);
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', -1, 120, '2026-11')$$,
  '22023', null, 'and one of fewer than no people'
);
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, null, '2026-11')$$,
  '22023', null, 'and one that doesn''t say how many shifts'
);
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 120, '  ')$$,
  '22023', null, 'and one that doesn''t say which hours engine made it'
);

------------------------------------------------------------------------------
-- Pay holders take it

select lives_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-15', 4, 120, ' 2026-11 ')$$,
  'the owner takes October''s file'
);
reset role;
select is(pg_temp.files_by('7f000000-0000-4000-a000-00000000000a'), 1, 'which is one row');
select is(
  (select details from public.audit_log
   where action = 'payroll.export' and actor_id = '7f000000-0000-4000-a000-00000000000a'),
  '{"month": "2026-10", "format": "xlsx", "people": 4, "shifts": 120, "ids": false, "engine": "2026-11"}'::jsonb,
  'saying the month, the format, how many people and shifts, no ID numbers and the engine'
);

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000a');
select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11');
reset role;
select is(pg_temp.files_by('7f000000-0000-4000-a000-00000000000a'), 2, 'a second file the same day is a second row');

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000d');
select lives_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  'the accountant takes it'
);
reset role;
select is(pg_temp.files_by('7f000000-0000-4000-a000-00000000000d'), 1, 'and it is logged as theirs');

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000e');
select lives_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  'a view as an accountant takes it'
);
reset role;
select is(pg_temp.files_by('7f000000-0000-4000-a000-00000000000e'), 1, 'logged with the team member as the actor');

------------------------------------------------------------------------------
-- Nobody else does

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000c');
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  '42501', null, 'a worker without pay access gets no file'
);
reset role;

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  '42501', null, 'nor a manager while managers have no pay access'
);
reset role;

select public.set_role_permission('7f000000-0000-4000-a000-00000000000a',
  '7f000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true);
select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000b');
select lives_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  'once the owner gives managers pay access, a manager takes it'
);
reset role;
select is(pg_temp.files_by('7f000000-0000-4000-a000-00000000000b'), 1, 'and it is logged');
select public.set_role_permission('7f000000-0000-4000-a000-00000000000a',
  '7f000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', false);

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000f');
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  '42501', null, 'a view as a manager reads no pay, so it takes no file'
);
reset role;

select pg_temp.sign_in('7f000000-0000-4000-a000-000000000011');
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  '42501', null, 'the owner of another business takes none of this one'
);
reset role;

update public.business_modules set enabled = false
where business_id = '7f000000-0000-4000-b000-000000000001' and module_key = 'time_clock';
select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  '42501', null, 'with the time clock off, not even the owner'
);
reset role;
update public.business_modules set enabled = true
where business_id = '7f000000-0000-4000-b000-000000000001' and module_key = 'time_clock';

set local role anon;
select throws_ok(
  $$select public.note_payroll_export('7f000000-0000-4000-b000-000000000001', '2026-10-01', 4, 121, '2026-11')$$,
  '42501', null, 'signed out, nothing is noted'
);
reset role;

select is(
  (select count(*)::integer from public.audit_log
   where business_id = '7f000000-0000-4000-b000-000000000001' and action = 'payroll.export'),
  5,
  'five files in all: the owner''s two, the accountant''s, the view''s and the manager''s'
);

------------------------------------------------------------------------------
-- Who reads them

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000c');
select is(pg_temp.files_read(), 0, 'the worker reads none of them');
reset role;

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000b');
select is(pg_temp.files_read(), 0, 'nor a manager without pay access');
reset role;

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000a');
select is(pg_temp.files_read(), 5, 'the owner reads every one');
reset role;

select pg_temp.sign_in('7f000000-0000-4000-a000-00000000000d');
select is(pg_temp.files_read(), 5, 'and so does the accountant');
reset role;

select * from finish();
rollback;
