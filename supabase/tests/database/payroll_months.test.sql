-- Closing a month (20261110001000_payroll_months.sql): only the owner or an
-- accountant closes or reopens, a month that has ended by the business's own
-- clock, once; reopening needs a reason. A wage into a closed month is
-- refused; a correction or an added shift goes through, its log row names the
-- month (both, for a shift moved between two closed months), and each month's
-- closer and the accountants get one line. The daily reminder tells pay
-- holders on the 2nd, never in a demo business, a month closed already or one
-- with no hours, and the close settles it. Who reads the months, and that
-- nothing deletes one but the purge. Fixed ids, and every write at a fixed
-- time, so nothing here depends on the day it runs.
begin;
select plan(60);

insert into auth.users (id, aud, role, phone)
values
  ('80000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500003301'),
  ('80000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500003302'),
  ('80000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500003303'),
  ('80000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500003304'),
  ('80000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500003305'),
  ('80000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500003306'),
  ('80000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500003307'),
  ('80000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated', '972500003308'),
  ('80000000-0000-4000-a000-000000000012', 'authenticated', 'authenticated', '972500003309'),
  ('80000000-0000-4000-a000-000000000013', 'authenticated', 'authenticated', '972500003310'),
  ('80000000-0000-4000-a000-000000000014', 'authenticated', 'authenticated', '972500003311'),
  ('80000000-0000-4000-a000-000000000015', 'authenticated', 'authenticated', '972500003312');

-- P: a owner, b manager (managers have no pay access), c worker, d
-- accountant, h a manager given pay access personally (a pay holder, who
-- still doesn't close); e is on the ConceptApp team, viewing P as an
-- accountant. D is a demo business: f its owner, g its accountant. Q: i owner,
-- j accountant, k manager. R: l owner, and no hours. All in Israel.
insert into public.businesses (id, slug, name)
values
  ('80000000-0000-4000-b000-000000000001', 'pm-p', 'Payroll months P'),
  ('80000000-0000-4000-b000-000000000002', 'pm-d', 'Payroll months D'),
  ('80000000-0000-4000-b000-000000000003', 'pm-q', 'Payroll months Q'),
  ('80000000-0000-4000-b000-000000000004', 'pm-r', 'Payroll months R');
insert into public.memberships (business_id, user_id, role, perms)
values
  ('80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-00000000000a', 'owner', '{}'),
  ('80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-00000000000b', 'manager', '{}'),
  ('80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-00000000000c', 'worker', '{}'),
  ('80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-00000000000d', 'accountant', '{}'),
  ('80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-000000000011', 'manager', '{clock.payroll}'),
  ('80000000-0000-4000-b000-000000000002', '80000000-0000-4000-a000-00000000000f', 'owner', '{}'),
  ('80000000-0000-4000-b000-000000000002', '80000000-0000-4000-a000-000000000010', 'accountant', '{}'),
  ('80000000-0000-4000-b000-000000000003', '80000000-0000-4000-a000-000000000012', 'owner', '{}'),
  ('80000000-0000-4000-b000-000000000003', '80000000-0000-4000-a000-000000000013', 'accountant', '{}'),
  ('80000000-0000-4000-b000-000000000003', '80000000-0000-4000-a000-000000000014', 'manager', '{}'),
  ('80000000-0000-4000-b000-000000000004', '80000000-0000-4000-a000-000000000015', 'owner', '{}');
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('80000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('80000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('80000000-0000-4000-b000-000000000002', 'time_clock', true, '{}'),
  ('80000000-0000-4000-b000-000000000002', 'notifications', true, '{}'),
  ('80000000-0000-4000-b000-000000000003', 'time_clock', true, '{}'),
  ('80000000-0000-4000-b000-000000000003', 'notifications', true, '{}'),
  ('80000000-0000-4000-b000-000000000004', 'time_clock', true, '{}'),
  ('80000000-0000-4000-b000-000000000004', 'notifications', true, '{}');
insert into private.demo_businesses (business_id, definition)
values ('80000000-0000-4000-b000-000000000002', '{}');
insert into public.platform_staff (user_id, role)
values ('80000000-0000-4000-a000-00000000000e', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('80000000-0000-4000-a000-00000000000e', '80000000-0000-4000-b000-000000000001', 'accountant');

-- October's hours at P (summer time, +03): c's 13th, and the 14th clocked in
-- without a code, still waiting. A November shift of c's (+02), and October's
-- 13th of the demo's owner. At Q, i's 15 September, and i's 20 October,
-- still open.
insert into public.time_entries (id, business_id, user_id, clock_in, clock_out, in_proof)
values
  ('80000000-0000-4000-e000-000000000005', '80000000-0000-4000-b000-000000000003',
    '80000000-0000-4000-a000-000000000012', '2026-09-15 09:00+03', '2026-09-15 17:00+03', 'off'),
  ('80000000-0000-4000-e000-000000000006', '80000000-0000-4000-b000-000000000003',
    '80000000-0000-4000-a000-000000000012', '2026-10-20 09:00+03', null, 'off'),
  ('80000000-0000-4000-e000-000000000001', '80000000-0000-4000-b000-000000000001',
    '80000000-0000-4000-a000-00000000000c', '2026-10-13 09:00+03', '2026-10-13 17:00+03', 'off'),
  ('80000000-0000-4000-e000-000000000002', '80000000-0000-4000-b000-000000000001',
    '80000000-0000-4000-a000-00000000000c', '2026-10-14 09:00+03', '2026-10-14 17:00+03', 'none'),
  ('80000000-0000-4000-e000-000000000003', '80000000-0000-4000-b000-000000000001',
    '80000000-0000-4000-a000-00000000000c', '2026-11-03 09:00+02', '2026-11-03 17:00+02', 'off'),
  ('80000000-0000-4000-e000-000000000004', '80000000-0000-4000-b000-000000000002',
    '80000000-0000-4000-a000-00000000000f', '2026-10-13 09:00+03', '2026-10-13 17:00+03', 'off');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- `actor` closes October at P, at a time on 3 November 2026.
create function pg_temp.close_october(actor uuid, at_hour integer default 10)
returns void language sql as $$
  select public.close_payroll_month(actor, '80000000-0000-4000-b000-000000000001',
    '2026-10-01', '{"version": 1, "month": {"month": "2026-10"}}'::jsonb, '2026-11',
    ('2026-11-03 00:00:00+02'::timestamptz + make_interval(hours => at_hour)))
$$;

-- P's lines of a kind, for one person.
create function pg_temp.lines(what text, person uuid) returns integer language sql as $$
  select count(*)::integer from public.notifications n
  where n.business_id = '80000000-0000-4000-b000-000000000001'
    and n.kind = what and n.user_id = person
$$;

-- P's newest log row of an action.
create function pg_temp.last_row(what text) returns jsonb language sql as $$
  select a.details from public.audit_log a
  where a.business_id = '80000000-0000-4000-b000-000000000001' and a.action = what
  order by a.id desc limit 1
$$;

-- How many of P's months the signed-in person reads.
create function pg_temp.months_read() returns integer language sql as $$
  select count(*)::integer from public.payroll_months pm
  where pm.business_id = '80000000-0000-4000-b000-000000000001'
$$;

------------------------------------------------------------------------------
-- Who may call what (4)

select ok(
  has_function_privilege('service_role',
    'public.close_payroll_month(uuid, uuid, date, jsonb, text, timestamptz)', 'execute')
  and has_function_privilege('service_role',
    'public.reopen_payroll_month(uuid, uuid, date, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.close_payroll_month(uuid, uuid, date, jsonb, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.reopen_payroll_month(uuid, uuid, date, text, timestamptz)', 'execute')
  and not has_function_privilege('anon',
    'public.close_payroll_month(uuid, uuid, date, jsonb, text, timestamptz)', 'execute'),
  'a month is closed and reopened with the secret key only'
);
select ok(
  not has_function_privilege('authenticated', 'private.closes_payroll(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.month_closed(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'private.payroll_tick(timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'private.payroll_tick(timestamptz)', 'execute'),
  'the helpers and the reminder run inside the database only'
);
select ok(
  has_table_privilege('authenticated', 'public.payroll_months', 'select')
  and not has_table_privilege('authenticated', 'public.payroll_months', 'insert, update, delete')
  and not has_table_privilege('anon', 'public.payroll_months', 'select')
  and not has_table_privilege('service_role', 'public.payroll_months', 'insert, update, delete, truncate'),
  'months are read under RLS, and nobody writes them but the functions'
);
select is(
  (select j.schedule from cron.job j where j.jobname = 'payroll'),
  '0 6 * * *',
  'the reminder runs daily at 06:00 UTC'
);

------------------------------------------------------------------------------
-- The reminder, on the 2nd (6)

select is(
  private.payroll_tick('2026-11-03 08:00+02'),
  0,
  'on the 3rd of the month it tells nobody'
);
select private.payroll_tick('2026-11-02 08:00+02');
select results_eq(
  $$select n.user_id from public.notifications n
    where n.business_id = '80000000-0000-4000-b000-000000000001' and n.kind = 'pay.month_due'
    order by n.user_id$$,
  $$values ('80000000-0000-4000-a000-00000000000a'::uuid), ('80000000-0000-4000-a000-00000000000d'::uuid),
    ('80000000-0000-4000-a000-000000000011'::uuid)$$,
  'on the 2nd, October not closed: one line per pay holder, the owner, the accountant and the manager given pay access, not the other manager'
);
select is(
  (select n.params from public.notifications n
   where n.business_id = '80000000-0000-4000-b000-000000000001' and n.kind = 'pay.month_due'
     and n.user_id = '80000000-0000-4000-a000-00000000000d'),
  '{"month": "2026-10", "waiting": 1, "open": 0}'::jsonb,
  'with the month and how many shifts wait and are open: counts only'
);
select is(
  (select n.dedupe_key from public.notifications n
   where n.business_id = '80000000-0000-4000-b000-000000000001' and n.kind = 'pay.month_due'
     and n.user_id = '80000000-0000-4000-a000-00000000000d'),
  'payroll.month:2026-10',
  'one line per month'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '80000000-0000-4000-b000-000000000002' and n.kind = 'pay.month_due'),
  0,
  'and none in a demo business'
);
update public.notifications set read_at = '2026-11-02 09:00+02'
where business_id = '80000000-0000-4000-b000-000000000001' and kind = 'pay.month_due'
  and user_id = '80000000-0000-4000-a000-00000000000d';
select private.payroll_tick('2026-11-02 08:30+02');
select is(
  (select n.read_at from public.notifications n
   where n.business_id = '80000000-0000-4000-b000-000000000001' and n.kind = 'pay.month_due'
     and n.user_id = '80000000-0000-4000-a000-00000000000d'),
  '2026-11-02 09:00+02'::timestamptz,
  'asked again the same day, nobody is told again'
);

------------------------------------------------------------------------------
-- The reminder counts open shifts, and skips a month with no hours or closed
-- already; a month ends by the business's own clock (5)

select is(
  (select n.params from public.notifications n
   where n.business_id = '80000000-0000-4000-b000-000000000003' and n.kind = 'pay.month_due'
     and n.user_id = '80000000-0000-4000-a000-000000000012'),
  '{"month": "2026-10", "waiting": 0, "open": 1}'::jsonb,
  'a shift still open is counted as open'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '80000000-0000-4000-b000-000000000004' and n.kind = 'pay.month_due'),
  0,
  'a business whose month had no hours is told nothing'
);
select throws_ok(
  $$select public.close_payroll_month('80000000-0000-4000-a000-000000000012',
    '80000000-0000-4000-b000-000000000003', '2026-09-01', '{"version": 1}'::jsonb, '2026-11',
    '2026-09-30 23:30+03')$$,
  '22023', null, 'at 23:30 on its last day in Israel, September hasn''t ended'
);
select lives_ok(
  $$select public.close_payroll_month('80000000-0000-4000-a000-000000000012',
    '80000000-0000-4000-b000-000000000003', '2026-09-01', '{"version": 1}'::jsonb, '2026-11',
    '2026-10-01 00:30+03')$$,
  'half an hour after midnight there it has, though it is still September in UTC'
);
select private.payroll_tick('2026-10-02 08:00+03');
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '80000000-0000-4000-b000-000000000003' and n.kind = 'pay.month_due'
     and n.params ->> 'month' = '2026-09'),
  0,
  'on 2 October, with Q''s September closed already, nobody at Q is told about it'
);

------------------------------------------------------------------------------
-- Who closes (12)

select throws_ok(
  $$select pg_temp.close_october('80000000-0000-4000-a000-00000000000b')$$,
  '42501', null, 'a manager can''t close a month'
);
select ok(
  private.holds_perm('80000000-0000-4000-b000-000000000001',
    '80000000-0000-4000-a000-000000000011', 'clock.payroll'),
  'h, a manager given pay access, holds it'
);
select throws_ok(
  $$select pg_temp.close_october('80000000-0000-4000-a000-000000000011')$$,
  '42501', null, 'and still can''t close a month: not every pay holder closes'
);
select throws_ok(
  $$select pg_temp.close_october('80000000-0000-4000-a000-00000000000c')$$,
  '42501', null, 'nor a worker'
);
select throws_ok(
  $$select pg_temp.close_october('80000000-0000-4000-a000-00000000000e')$$,
  '42501', null, 'nor the team, viewing as an accountant'
);
select throws_ok(
  $$select public.close_payroll_month('80000000-0000-4000-a000-00000000000d',
    '80000000-0000-4000-b000-000000000001', '2026-11-15', '{}'::jsonb, '2026-11',
    '2026-11-10 10:00+02')$$,
  '22023', null, 'the month it is now can''t be closed'
);
select throws_ok(
  $$select public.close_payroll_month('80000000-0000-4000-a000-00000000000d',
    '80000000-0000-4000-b000-000000000001', '2026-10-01', null, '2026-11',
    '2026-11-10 10:00+02')$$,
  '22023', null, 'nor a month without what the engine gave'
);
select lives_ok(
  $$select pg_temp.close_october('80000000-0000-4000-a000-00000000000d')$$,
  'the accountant closes October'
);
select results_eq(
  $$select pm.closed_by, pm.closed_at, pm.engine_version, pm.snapshot, pm.reopened_at
    from public.payroll_months pm
    where pm.business_id = '80000000-0000-4000-b000-000000000001'$$,
  $$values ('80000000-0000-4000-a000-00000000000d'::uuid, '2026-11-03 10:00+02'::timestamptz,
    '2026-11', '{"version": 1, "month": {"month": "2026-10"}}'::jsonb, null::timestamptz)$$,
  'the month keeps who closed it, when, what the engine gave and its version'
);
select is(
  pg_temp.last_row('payroll.close'),
  '{"month": "2026-10", "engine": "2026-11"}'::jsonb,
  'and the log says so, a pay row'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '80000000-0000-4000-b000-000000000001' and n.kind = 'pay.month_due'
     and n.resolved_at is null),
  0,
  'closing it settles the reminder for everyone'
);
select throws_ok(
  $$select pg_temp.close_october('80000000-0000-4000-a000-00000000000a', 11)$$,
  '23505', null, 'closing it twice is refused'
);

------------------------------------------------------------------------------
-- Wages: never into a closed month (2)

select throws_ok(
  $$select public.set_hourly_wage('80000000-0000-4000-a000-00000000000a',
    '80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-00000000000c',
    4000, '2026-10-15', null, '2026-11-10 10:00+02')$$,
  '55000', 'The month is closed', 'a wage into a closed month is refused'
);
select lives_ok(
  $$select public.set_hourly_wage('80000000-0000-4000-a000-00000000000a',
    '80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-00000000000c',
    4000, '2026-11-01', null, '2026-11-10 10:00+02')$$,
  'one from the month after it saves'
);

------------------------------------------------------------------------------
-- Hours are facts (12)

select lives_ok(
  $$select public.correct_time_entry('80000000-0000-4000-a000-00000000000b',
    '80000000-0000-4000-e000-000000000001', '2026-10-13 09:00+03', '2026-10-13 17:30+03',
    'Stayed to close', '2026-11-04 10:00+02')$$,
  'a manager still corrects a shift of a closed month'
);
select is(
  pg_temp.last_row('clock.correct') ->> 'closed_month',
  '2026-10',
  'and its log row names the closed month'
);
select results_eq(
  $$select n.user_id, n.params from public.notifications n
    where n.business_id = '80000000-0000-4000-b000-000000000001' and n.kind = 'pay.after_close'$$,
  $$values ('80000000-0000-4000-a000-00000000000d'::uuid, '{"month": "2026-10"}'::jsonb)$$,
  'the accountant, who closed it, gets one line, and the owner none'
);
select lives_ok(
  $$select public.add_time_entry('80000000-0000-4000-a000-00000000000b',
    '80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-00000000000c',
    '2026-10-20 09:00+03', '2026-10-20 13:00+03', 'Forgot to clock in', '2026-11-04 11:00+02')$$,
  'a shift added into a closed month goes through too'
);
select is(
  pg_temp.last_row('clock.add') ->> 'closed_month',
  '2026-10',
  'and names the month'
);
select is(
  pg_temp.lines('pay.after_close', '80000000-0000-4000-a000-00000000000d'),
  1,
  'still one line for the month'
);
select is(
  pg_temp.lines('pay.after_close', '80000000-0000-4000-a000-00000000000b'),
  0,
  'and none to the manager who made the changes'
);
select public.correct_time_entry('80000000-0000-4000-a000-00000000000b',
  '80000000-0000-4000-e000-000000000003', '2026-11-03 09:00+02', '2026-11-03 16:00+02',
  'Left early', '2026-11-04 12:00+02');
select ok(
  not (pg_temp.last_row('clock.correct') ? 'closed_month'),
  'a correction of a month still open names none'
);
-- c's 13 October moved out of October, to 2 November.
select public.correct_time_entry('80000000-0000-4000-a000-00000000000b',
  '80000000-0000-4000-e000-000000000001', '2026-11-02 09:00+02', '2026-11-02 17:00+02',
  'Was the 2nd of November', '2026-11-04 13:00+02');
select is(
  pg_temp.last_row('clock.correct') ->> 'closed_month',
  '2026-10',
  'a shift moved out of a closed month names the month it left'
);

-- Q's October closed too, by the accountant j; k, a manager, moves i's
-- 15 September (closed by i) into October.
select public.close_payroll_month('80000000-0000-4000-a000-000000000013',
  '80000000-0000-4000-b000-000000000003', '2026-10-01', '{"version": 1}'::jsonb, '2026-11',
  '2026-11-03 10:00+02');
select lives_ok(
  $$select public.correct_time_entry('80000000-0000-4000-a000-000000000014',
    '80000000-0000-4000-e000-000000000005', '2026-10-05 09:00+03', '2026-10-05 17:00+03',
    'Was the 5th of October', '2026-11-04 10:00+02')$$,
  'a shift moves from one closed month into another'
);
select is(
  (select array[a.details ->> 'closed_month', a.details ->> 'closed_from_month']
   from public.audit_log a
   where a.business_id = '80000000-0000-4000-b000-000000000003' and a.action = 'clock.correct'
   order by a.id desc limit 1),
  array['2026-10', '2026-09'],
  'its log row names both: the month it went into and the month it left'
);
select results_eq(
  $$select n.user_id, n.params from public.notifications n
    where n.business_id = '80000000-0000-4000-b000-000000000003' and n.kind = 'pay.after_close'
    order by n.user_id, n.params ->> 'month'$$,
  $$values ('80000000-0000-4000-a000-000000000012'::uuid, '{"month": "2026-09"}'::jsonb),
    ('80000000-0000-4000-a000-000000000013'::uuid, '{"month": "2026-09"}'::jsonb),
    ('80000000-0000-4000-a000-000000000013'::uuid, '{"month": "2026-10"}'::jsonb)$$,
  'and each month''s closer and the accountant get a line for each month'
);

------------------------------------------------------------------------------
-- Reopening (12)

select throws_ok(
  $$select public.reopen_payroll_month('80000000-0000-4000-a000-00000000000d',
    '80000000-0000-4000-b000-000000000001', '2026-10-01', null, '2026-11-05 10:00+02')$$,
  '22023', null, 'reopening without a reason is refused'
);
select throws_ok(
  $$select public.reopen_payroll_month('80000000-0000-4000-a000-00000000000d',
    '80000000-0000-4000-b000-000000000001', '2026-10-01', '   ', '2026-11-05 10:00+02')$$,
  '22023', null, 'and with a blank one'
);
select throws_ok(
  $$select public.reopen_payroll_month('80000000-0000-4000-a000-00000000000b',
    '80000000-0000-4000-b000-000000000001', '2026-10-01', 'A shift was missing',
    '2026-11-05 10:00+02')$$,
  '42501', null, 'a manager can''t reopen one'
);
select throws_ok(
  $$select public.reopen_payroll_month('80000000-0000-4000-a000-000000000011',
    '80000000-0000-4000-b000-000000000001', '2026-10-01', 'A shift was missing',
    '2026-11-05 10:00+02')$$,
  '42501', null, 'nor one given pay access'
);
select lives_ok(
  $$select public.reopen_payroll_month('80000000-0000-4000-a000-00000000000a',
    '80000000-0000-4000-b000-000000000001', '2026-10-31', '  A shift was missing ',
    '2026-11-05 10:00+02')$$,
  'the owner reopens it, saying why'
);
select results_eq(
  $$select pm.reopened_by, pm.reopened_at, pm.reopen_reason from public.payroll_months pm
    where pm.business_id = '80000000-0000-4000-b000-000000000001'$$,
  $$values ('80000000-0000-4000-a000-00000000000a'::uuid, '2026-11-05 10:00+02'::timestamptz,
    'A shift was missing')$$,
  'the month keeps who reopened it, when and why'
);
select is(
  pg_temp.last_row('payroll.reopen'),
  '{"month": "2026-10", "reason": "A shift was missing"}'::jsonb,
  'and the log keeps the reason'
);
select throws_ok(
  $$select public.reopen_payroll_month('80000000-0000-4000-a000-00000000000a',
    '80000000-0000-4000-b000-000000000001', '2026-10-01', 'Again', '2026-11-05 11:00+02')$$,
  'P0002', null, 'a month that isn''t closed can''t be reopened'
);
select lives_ok(
  $$select public.set_hourly_wage('80000000-0000-4000-a000-00000000000a',
    '80000000-0000-4000-b000-000000000001', '80000000-0000-4000-a000-00000000000c',
    4000, '2026-10-15', null, '2026-11-10 10:00+02')$$,
  'once reopened, a wage into it saves'
);
select public.correct_time_entry('80000000-0000-4000-a000-00000000000b',
  '80000000-0000-4000-e000-000000000002', '2026-10-14 09:00+03', '2026-10-14 16:30+03',
  'Left early', '2026-11-05 10:30+02');
select ok(
  not (pg_temp.last_row('clock.correct') ? 'closed_month'),
  'and a correction into it names no month'
);
select lives_ok(
  $$select public.close_payroll_month('80000000-0000-4000-a000-00000000000a',
    '80000000-0000-4000-b000-000000000001', '2026-10-01', '{"version": 1}'::jsonb, '2026-11',
    '2026-11-06 10:00+02')$$,
  'and it closes again'
);
select results_eq(
  $$select pm.closed_by, pm.closed_at, pm.reopened_by, pm.reopened_at, pm.reopen_reason
    from public.payroll_months pm
    where pm.business_id = '80000000-0000-4000-b000-000000000001'$$,
  $$values ('80000000-0000-4000-a000-00000000000a'::uuid, '2026-11-06 10:00+02'::timestamptz,
    null::uuid, null::timestamptz, null::text)$$,
  'anew: its reopening cleared, which the log keeps'
);

------------------------------------------------------------------------------
-- Who reads the months (5)

select pg_temp.sign_in('80000000-0000-4000-a000-00000000000d');
select is(pg_temp.months_read(), 1, 'the accountant reads the closed month');
reset role;

select pg_temp.sign_in('80000000-0000-4000-a000-00000000000a');
select is(pg_temp.months_read(), 1, 'so does the owner');
reset role;

select pg_temp.sign_in('80000000-0000-4000-a000-00000000000b');
select is(pg_temp.months_read(), 0, 'a manager without pay access reads none');
reset role;

select pg_temp.sign_in('80000000-0000-4000-a000-00000000000c');
select is(pg_temp.months_read(), 0, 'nor does a worker');
reset role;

select pg_temp.sign_in('80000000-0000-4000-a000-00000000000e');
select is(pg_temp.months_read(), 1, 'a view as an accountant reads it');
reset role;

------------------------------------------------------------------------------
-- Kept (2)

select throws_ok(
  $$delete from public.payroll_months where business_id = '80000000-0000-4000-b000-000000000001'$$,
  '42501', null, 'nothing deletes a closed month, the database''s owner included'
);
select private.purge_business_records('80000000-0000-4000-b000-000000000001');
select is(
  (select count(*)::integer from public.payroll_months
   where business_id = '80000000-0000-4000-b000-000000000001'),
  0,
  'but the demo reset''s purge'
);

select * from finish();
rollback;
