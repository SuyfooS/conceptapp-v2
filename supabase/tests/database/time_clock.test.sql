-- Time clock: only the server writes. An active member clocks in and out
-- with a punch code that is still valid (unless the business switched the
-- code off); never twice at once. A manager, an owner or a holder of
-- `clock.edit` issues codes, adds a forgotten entry and corrects one, and
-- every write goes to the audit log. People read their own entries,
-- managers the business's, other businesses and anonymous visitors
-- nothing. Every call passes the time so the test does not depend on today.
begin;
select plan(48);

insert into auth.users (id, aud, role, phone)
values
  ('68000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000901'),
  ('68000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000902'),
  ('68000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000903'),
  ('68000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000904'),
  ('68000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000905'),
  ('68000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000906'),
  ('68000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500000907');

-- a: owner of X; b: manager of X; c: worker of X; d: worker of X holding
-- clock.edit; e: worker of Y; f: inactive worker of X; g: ConceptApp team.
insert into public.businesses (id, slug, name)
values
  ('68000000-0000-4000-b000-000000000001', 'tc-x', 'Clock X'),
  ('68000000-0000-4000-b000-000000000002', 'tc-y', 'Clock Y');

insert into public.memberships (business_id, user_id, role, active, perms)
values
  ('68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000a', 'owner', true, '{}'),
  ('68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000b', 'manager', true, '{}'),
  ('68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000c', 'worker', true, '{}'),
  ('68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000d', 'worker', true, '{clock.edit}'),
  ('68000000-0000-4000-b000-000000000002', '68000000-0000-4000-a000-00000000000e', 'worker', true, '{}'),
  ('68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000f', 'worker', false, '{}');

-- X keeps the default (a code is required); Y switched the code off.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('68000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('68000000-0000-4000-b000-000000000002', 'time_clock', true, '{"requirePunchCode": false}');

insert into public.platform_staff (user_id, role)
values ('68000000-0000-4000-a000-000000000010', 'onboarder');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to service_role, authenticated;

-- Nobody but the server writes.
select pg_temp.sign_in('68000000-0000-4000-a000-00000000000c');
select throws_ok(
  $$select public.clock_in('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', null, '2026-11-10 06:00+00')$$,
  '42501', null, 'a signed-in worker cannot clock in through the function'
);
select throws_ok(
  $$insert into public.time_entries (business_id, user_id, clock_in)
    values ('68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000c', now())$$,
  '42501', null, 'a signed-in worker cannot write an entry'
);
select throws_ok(
  'select count(*) from public.punch_codes',
  '42501', null, 'a signed-in worker cannot read punch codes'
);
reset role;
select pg_temp.sign_in('68000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$select public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', repeat('1', 64), '2026-11-10 06:00+00')$$,
  '42501', null, 'a signed-in manager cannot issue a code through the function'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.clock_out('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', null, '2026-11-10 06:00+00')$$,
  '42501', null, 'an anonymous visitor cannot clock out'
);
reset role;

-- Punch codes.
set local role service_role;
select throws_ok(
  $$select public.issue_punch_code('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', repeat('1', 64), '2026-11-10 06:00+00')$$,
  '42501', null, 'a worker cannot issue a code'
);
select throws_ok(
  $$select public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000002', repeat('1', 64), '2026-11-10 06:00+00')$$,
  '42501', null, 'a manager of X cannot issue a code for Y'
);
select throws_ok(
  $$select public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', 'not-a-hash', '2026-11-10 06:00+00')$$,
  '22023', null, 'a code hash must be 64 hex digits'
);
select is(
  public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', repeat('1', 64), '2026-11-10 06:00+00'),
  '2026-11-10 06:02+00'::timestamptz,
  'a manager issues a code that lasts two minutes'
);
select lives_ok(
  $$select public.issue_punch_code('68000000-0000-4000-a000-00000000000d',
    '68000000-0000-4000-b000-000000000001', repeat('2', 64), '2026-11-10 06:01+00')$$,
  'a worker holding clock.edit issues a code'
);

-- Clocking in.
select throws_ok(
  $$select public.clock_in('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', null, '2026-11-10 06:01+00')$$,
  '28000', null, 'clocking in without a code is refused where a code is required'
);
select throws_ok(
  $$select public.clock_in('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', repeat('9', 64), '2026-11-10 06:01+00')$$,
  '28000', null, 'an unknown code is refused'
);
select throws_ok(
  $$select public.clock_in('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', repeat('1', 64), '2026-11-10 06:02+00')$$,
  '28000', null, 'an expired code is refused'
);
select throws_ok(
  $$select public.clock_in('68000000-0000-4000-a000-00000000000e',
    '68000000-0000-4000-b000-000000000001', repeat('2', 64), '2026-11-10 06:02+00')$$,
  '42501', null, 'a worker of Y cannot clock in at X'
);
select throws_ok(
  $$select public.clock_in('68000000-0000-4000-a000-00000000000f',
    '68000000-0000-4000-b000-000000000001', repeat('2', 64), '2026-11-10 06:02+00')$$,
  '42501', null, 'an inactive worker cannot clock in'
);
insert into ids values ('c1', public.clock_in('68000000-0000-4000-a000-00000000000c',
  '68000000-0000-4000-b000-000000000001', repeat('2', 64), '2026-11-10 06:02+00'));
select is(
  (select clock_in || ' ' || coalesce(clock_out::text, 'open') || ' ' || source
   from public.time_entries where id = (select id from ids where name = 'c1')),
  '2026-11-10 06:02:00+00 open punch',
  'a worker clocks in with a valid code'
);
select throws_ok(
  $$select public.clock_in('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', repeat('2', 64), '2026-11-10 06:02:30+00')$$,
  '23P01', null, 'a second clock-in without a clock-out is refused'
);
select lives_ok(
  $$select public.clock_in('68000000-0000-4000-a000-00000000000e',
    '68000000-0000-4000-b000-000000000002', null, '2026-11-10 06:00+00')$$,
  'where the code is off, a worker clocks in without one'
);

-- Clocking out.
select throws_ok(
  $$select public.clock_out('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', repeat('2', 64), '2026-11-10 06:02+00')$$,
  '55000', null, 'someone not clocked in cannot clock out'
);
select throws_ok(
  $$select public.clock_out('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', null, '2026-11-10 14:00+00')$$,
  '28000', null, 'clocking out needs a code too'
);
select public.issue_punch_code('68000000-0000-4000-a000-00000000000a',
  '68000000-0000-4000-b000-000000000001', repeat('3', 64), '2026-11-10 22:30+00');
select is(
  public.clock_out('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', repeat('3', 64), '2026-11-10 22:31+00'),
  (select id from ids where name = 'c1'),
  'a worker clocks out with the owner''s fresh code'
);
select is(
  (select count(*)::int from public.punch_codes where business_id = '68000000-0000-4000-b000-000000000001'),
  1,
  'issuing a code clears the expired ones'
);
select throws_ok(
  $$select public.clock_out('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', repeat('3', 64), '2026-11-10 22:31+00')$$,
  '55000', null, 'clocking out twice is refused'
);

-- An evening past midnight, then a shift left open for more than a day.
select public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
  '68000000-0000-4000-b000-000000000001', repeat('4', 64), '2026-11-11 16:00+00');
insert into ids values ('c2', public.clock_in('68000000-0000-4000-a000-00000000000c',
  '68000000-0000-4000-b000-000000000001', repeat('4', 64), '2026-11-11 16:00+00'));
select public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
  '68000000-0000-4000-b000-000000000001', repeat('5', 64), '2026-11-11 23:30+00');
select lives_ok(
  $$select public.clock_out('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', repeat('5', 64), '2026-11-11 23:30+00')$$,
  'an entry runs past midnight in Israel'
);
select public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
  '68000000-0000-4000-b000-000000000001', repeat('6', 64), '2026-11-12 06:00+00');
insert into ids values ('d1', public.clock_in('68000000-0000-4000-a000-00000000000d',
  '68000000-0000-4000-b000-000000000001', repeat('6', 64), '2026-11-12 06:00+00'));
select public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
  '68000000-0000-4000-b000-000000000001', repeat('7', 64), '2026-11-13 07:00+00');
select throws_ok(
  $$select public.clock_out('68000000-0000-4000-a000-00000000000d',
    '68000000-0000-4000-b000-000000000001', repeat('7', 64), '2026-11-13 07:00+00')$$,
  '55000', null, 'an entry open for more than 24 hours is left for a manager'
);

-- A manager adds and corrects.
select throws_ok(
  $$select public.add_time_entry('68000000-0000-4000-a000-00000000000c',
    '68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000c',
    '2026-11-09 06:00+00', '2026-11-09 14:00+00', null, '2026-11-13 08:00+00')$$,
  '42501', null, 'a worker cannot add an entry'
);
select throws_ok(
  $$select public.add_time_entry('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000e',
    '2026-11-09 06:00+00', '2026-11-09 14:00+00', null, '2026-11-13 08:00+00')$$,
  '42501', null, 'a manager cannot add an entry for someone outside the business'
);
select throws_ok(
  $$select public.add_time_entry('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000c',
    '2026-11-09 14:00+00', '2026-11-09 06:00+00', null, '2026-11-13 08:00+00')$$,
  '22023', null, 'an entry must end after it starts'
);
select throws_ok(
  $$select public.add_time_entry('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000c',
    '2026-11-13 06:00+00', '2026-11-13 14:00+00', null, '2026-11-13 08:00+00')$$,
  '22023', null, 'an entry cannot end in the future'
);
select throws_ok(
  $$select public.add_time_entry('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000c',
    '2026-11-10 12:00+00', '2026-11-10 23:00+00', null, '2026-11-13 08:00+00')$$,
  '23P01', null, 'an entry cannot overlap another of the same person'
);
insert into ids values ('c3', public.add_time_entry('68000000-0000-4000-a000-00000000000b',
  '68000000-0000-4000-b000-000000000001', '68000000-0000-4000-a000-00000000000c',
  '2026-11-09 06:00+00', '2026-11-09 14:00+00', '  Forgot to punch  ', '2026-11-13 08:00+00'));
select is(
  (select source || ' ' || note || ' ' || edited_by
   from public.time_entries where id = (select id from ids where name = 'c3')),
  'manager Forgot to punch 68000000-0000-4000-a000-00000000000b',
  'a manager adds a forgotten entry, with a trimmed note'
);
select throws_ok(
  $$select public.correct_time_entry('68000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'c1'), '2026-11-10 06:00+00', '2026-11-10 14:00+00',
    null, '2026-11-13 08:00+00')$$,
  '42501', null, 'a worker cannot correct their own entry'
);
select throws_ok(
  $$select public.correct_time_entry('68000000-0000-4000-a000-00000000000b',
    gen_random_uuid(), '2026-11-10 06:00+00', '2026-11-10 14:00+00', null, '2026-11-13 08:00+00')$$,
  'P0002', null, 'an unknown entry cannot be corrected'
);
select throws_ok(
  $$select public.correct_time_entry('68000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'd1'), '2026-11-12 06:00+00', null, null, '2026-11-13 08:00+00')$$,
  '22023', null, 'a correction cannot leave an entry open for more than 24 hours'
);
select lives_ok(
  $$select public.correct_time_entry('68000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'd1'), '2026-11-12 06:00+00', '2026-11-12 14:00+00',
    'Forgot to clock out', '2026-11-13 08:00+00')$$,
  'a manager closes an entry left open'
);
select lives_ok(
  $$select public.correct_time_entry('68000000-0000-4000-a000-00000000000d',
    (select id from ids where name = 'c1'), '2026-11-10 06:00+00', '2026-11-10 14:00+00',
    null, '2026-11-13 08:00+00')$$,
  'a worker holding clock.edit corrects a colleague''s entry'
);
select is(
  (select details from public.audit_log where action = 'clock.correct'
   and details ->> 'entry' = (select id::text from ids where name = 'c1')),
  jsonb_build_object(
    'entry', (select id from ids where name = 'c1'),
    'person', '68000000-0000-4000-a000-00000000000c',
    'from', jsonb_build_object('clock_in', '2026-11-10 06:02+00'::timestamptz, 'clock_out', '2026-11-10 22:31+00'::timestamptz),
    'to', jsonb_build_object('clock_in', '2026-11-10 06:00+00'::timestamptz, 'clock_out', '2026-11-10 14:00+00'::timestamptz)),
  'a correction keeps the old and new times in the audit log'
);
select results_eq(
  $$select action, count(*)::int from public.audit_log
    where business_id = '68000000-0000-4000-b000-000000000001' and action like 'clock.%'
    group by action order by action$$,
  $$values ('clock.add', 1), ('clock.correct', 2), ('clock.in', 3), ('clock.out', 2)$$,
  'every clock write at X is in the audit log'
);
reset role;

-- Reading.
select pg_temp.sign_in('68000000-0000-4000-a000-00000000000c');
select is((select count(*)::int from public.time_entries), 3, 'a worker reads their own entries');
select pg_temp.sign_in('68000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from public.time_entries), 4, 'a manager reads every entry of the business');
select pg_temp.sign_in('68000000-0000-4000-a000-00000000000d');
select is((select count(*)::int from public.time_entries), 4, 'a holder of clock.edit reads every entry');
select pg_temp.sign_in('68000000-0000-4000-a000-00000000000e');
select is(
  (select count(*)::int from public.time_entries),
  1,
  'a worker of Y reads only their own entry, nothing of X'
);
select pg_temp.sign_in('68000000-0000-4000-a000-00000000000f');
select is((select count(*)::int from public.time_entries), 0, 'an inactive worker reads nothing');
reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.time_entries',
  '42501', null, 'an anonymous visitor reads no entries'
);
reset role;

-- "View as": at manager the whole business, as a worker nothing.
insert into public.view_sessions (staff_id, business_id, role)
values ('68000000-0000-4000-a000-000000000010', '68000000-0000-4000-b000-000000000001', 'worker');
select pg_temp.sign_in('68000000-0000-4000-a000-000000000010');
select is((select count(*)::int from public.time_entries), 0, 'viewing as a worker reads no one''s entries');
reset role;
update public.view_sessions set role = 'manager'
where staff_id = '68000000-0000-4000-a000-000000000010';
select pg_temp.sign_in('68000000-0000-4000-a000-000000000010');
select is((select count(*)::int from public.time_entries), 4, 'viewing as a manager reads the business''s entries');
reset role;

-- Switching the module off closes it.
update public.business_modules set enabled = false
where business_id = '68000000-0000-4000-b000-000000000001' and module_key = 'time_clock';
select pg_temp.sign_in('68000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from public.time_entries), 0, 'with the time clock off, a manager reads nothing');
reset role;
set local role service_role;
select throws_ok(
  $$select public.issue_punch_code('68000000-0000-4000-a000-00000000000b',
    '68000000-0000-4000-b000-000000000001', repeat('8', 64), '2026-11-13 08:00+00')$$,
  '42501', null, 'with the time clock off, nobody issues a code'
);
reset role;

select * from finish();
rollback;
