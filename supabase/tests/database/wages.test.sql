-- Hourly wages (20261110000500_hourly_wages.sql): the minimum wage as
-- published; who sets a wage (a pay holder, never their own, an owner's only
-- an owner, never an accountant's) and from when (the first of last month to
-- a year ahead, by the business's day); the wage on a day (the latest from,
-- then the latest set); the log row and the person's line, with no amount;
-- who reads them; nothing changes or deletes one but the purge; and the demo's
-- wages. Fixed ids, and every write at a fixed time (10 November 2026 in
-- Israel), so nothing here depends on the day it runs, but the demo's, which
-- is worked out here the way the seed works it out.
begin;
select plan(64);

insert into auth.users (id, aud, role, phone)
values
  ('7c000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500002901'),
  ('7c000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500002902'),
  ('7c000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500002903'),
  ('7c000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500002904'),
  ('7c000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500002905'),
  ('7c000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500002906'),
  ('7c000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500002907'),
  ('7c000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated', '972500002908'),
  ('7c000000-0000-4000-a000-000000000012', 'authenticated', 'authenticated', '972500002909'),
  ('7c000000-0000-4000-a000-000000000013', 'authenticated', 'authenticated', '972500002910'),
  ('7c000000-0000-4000-a000-000000000021', 'authenticated', 'authenticated', '972500002911'),
  ('7c000000-0000-4000-a000-000000000022', 'authenticated', 'authenticated', '972500002912'),
  ('7c000000-0000-4000-a000-000000000023', 'authenticated', 'authenticated', '972500002913'),
  ('7c000000-0000-4000-a000-000000000024', 'authenticated', 'authenticated', '972500002914'),
  ('7c000000-0000-4000-a000-000000000025', 'authenticated', 'authenticated', '972500002915'),
  ('7c000000-0000-4000-a000-000000000026', 'authenticated', 'authenticated', '972500002916');

-- W: a and g owners, b manager, c worker, d accountant, e a worker who left.
-- Z: h owner, i worker. j and k are on the ConceptApp team, viewing W as an
-- accountant and as a manager.
insert into public.businesses (id, slug, name)
values
  ('7c000000-0000-4000-b000-000000000001', 'wg-w', 'Wages W'),
  ('7c000000-0000-4000-b000-000000000002', 'wg-z', 'Wages Z');
insert into public.memberships (business_id, user_id, role, active)
values
  ('7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000a', 'owner', true),
  ('7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-000000000010', 'owner', true),
  ('7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000b', 'manager', true),
  ('7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000c', 'worker', true),
  ('7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000d', 'accountant', true),
  ('7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000e', 'worker', false),
  ('7c000000-0000-4000-b000-000000000002', '7c000000-0000-4000-a000-00000000000f', 'owner', true),
  ('7c000000-0000-4000-b000-000000000002', '7c000000-0000-4000-a000-000000000011', 'worker', true);
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('7c000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('7c000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('7c000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');
insert into public.platform_staff (user_id, role)
values
  ('7c000000-0000-4000-a000-000000000012', 'onboarder'),
  ('7c000000-0000-4000-a000-000000000013', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('7c000000-0000-4000-a000-000000000012', '7c000000-0000-4000-b000-000000000001', 'accountant'),
  ('7c000000-0000-4000-a000-000000000013', '7c000000-0000-4000-b000-000000000001', 'manager');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- A wage set in W for c, at a time on 10 November 2026, by `actor`.
create function pg_temp.set_c(actor uuid, agorot integer, from_day date, at_hour integer default 10)
returns uuid language sql as $$
  select public.set_hourly_wage(actor, '7c000000-0000-4000-b000-000000000001',
    '7c000000-0000-4000-a000-00000000000c', agorot, from_day, null,
    ('2026-11-10 00:00:00+02'::timestamptz + make_interval(hours => at_hour)))
$$;

------------------------------------------------------------------------------
-- Who may do what

select ok(
  has_function_privilege('service_role',
    'public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)', 'execute')
  and not has_function_privilege('anon',
    'public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)', 'execute'),
  'a wage is set with the secret key only'
);
select ok(
  not has_function_privilege('authenticated', 'private.wage_on(uuid, uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'private.minimum_wage_on(date)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_wages(uuid, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'private.purge_business_records(uuid)', 'execute'),
  'the helpers, the demo''s wages and the purge run inside the database only'
);
select ok(
  has_table_privilege('authenticated', 'public.member_wages', 'select')
  and not has_table_privilege('authenticated', 'public.member_wages', 'insert, update, delete')
  and not has_table_privilege('anon', 'public.member_wages', 'select')
  and not has_table_privilege('service_role', 'public.member_wages', 'insert, update, delete, truncate'),
  'wages are read under RLS, and nobody writes them but the function'
);
select ok(
  has_table_privilege('authenticated', 'public.minimum_wages', 'select')
  and not has_table_privilege('authenticated', 'public.minimum_wages', 'insert, update, delete')
  and not has_table_privilege('service_role', 'public.minimum_wages', 'insert, update, delete, truncate'),
  'the minimum wage is read by anyone signed in, and changes only by a migration'
);

------------------------------------------------------------------------------
-- The minimum wage

select results_eq(
  $$select effective_from, monthly_agorot, hourly_agorot, statute_hourly_agorot,
      under16_hourly_agorot, age16_hourly_agorot, age17_hourly_agorot,
      apprentice_hourly_agorot, youth_published
    from public.minimum_wages order by effective_from$$,
  $$values
    ('2025-04-01'::date, 624767, 3432, 3358, 2528, 2709, 2997, 2167, false),
    ('2026-04-01'::date, 644385, 3540, 3464, 2607, 2794, 3092, 2235, true)$$,
  'the minimum wage as published, the 2025 youth figures marked as worked out'
);
select results_eq(
  $$values (private.minimum_wage_on('2025-03-31'), private.minimum_wage_on('2026-03-31'),
    private.minimum_wage_on('2026-04-01'), private.minimum_wage_on('2026-11-01'))$$,
  $$values (null::integer, 3432, 3540, 3540)$$,
  'the adult minimum of a day is the row in effect on it'
);
select pg_temp.sign_in('7c000000-0000-4000-a000-00000000000c');
select is(
  (select hourly_agorot from public.minimum_wages where effective_from = '2026-04-01'),
  3540,
  'a worker reads it'
);
reset role;

------------------------------------------------------------------------------
-- Setting a wage: refused

select throws_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000b', 3800, '2026-11-01')$$,
  '42501', 'Pay holders only', 'a manager without pay access sets nobody''s wage'
);
select throws_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000c',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000e',
    3800, '2026-11-01', null, '2026-11-10 10:00+02')$$,
  '42501', 'Pay holders only', 'nor does a worker'
);
select throws_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000f', 3800, '2026-11-01')$$,
  '42501', 'Pay holders only', 'nor the owner of another business'
);
select throws_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000a',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000a',
    3800, '2026-11-01', null, '2026-11-10 10:00+02')$$,
  '42501', 'Someone else sets your own wage', 'nobody sets their own'
);
select throws_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000a',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-000000000011',
    3800, '2026-11-01', null, '2026-11-10 10:00+02')$$,
  'P0002', 'Not in the team', 'nor the wage of someone of another business'
);
select throws_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000a',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000d',
    3800, '2026-11-01', null, '2026-11-10 10:00+02')$$,
  '22023', 'An accountant has no hours here', 'an accountant has no wage here'
);

-- The owner gives managers pay access.
select public.set_role_permission('7c000000-0000-4000-a000-00000000000a',
  '7c000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true);
select throws_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000b',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-000000000010',
    5000, '2026-11-01', null, '2026-11-10 10:00+02')$$,
  '42501', 'Only an owner sets an owner''s wage', 'a manager with pay access sets no owner''s wage'
);
select throws_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000a', 0, '2026-11-01')$$,
  '22023', 'A wage is 0.01 to 1,000.00', 'a wage is more than nothing'
);
select throws_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000a', 100001, '2026-11-01')$$,
  '22023', 'A wage is 0.01 to 1,000.00', 'and at most 1,000.00'
);
select throws_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000a', 3800, '2026-09-30')$$,
  '22023', 'From the start of last month at the earliest',
  'it starts from the first of last month at the earliest'
);
select throws_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000a', 3800, '2027-11-11')$$,
  '22023', 'At most a year ahead', 'and at most a year ahead'
);
select throws_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000a', 3800, null)$$,
  '22023', 'From the start of last month at the earliest', 'and from a day'
);
select throws_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000a',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000c',
    3800, '2026-11-01', repeat('x', 201), '2026-11-10 10:00+02')$$,
  '22023', 'A note is at most 200 characters', 'its note is short'
);
update public.business_modules set enabled = false
where business_id = '7c000000-0000-4000-b000-000000000001' and module_key = 'time_clock';
select throws_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000a', 3800, '2026-11-01')$$,
  '42501', null, 'with the time clock off there are no wages to set'
);
update public.business_modules set enabled = true
where business_id = '7c000000-0000-4000-b000-000000000001' and module_key = 'time_clock';
select is(
  (select count(*)::integer from public.member_wages
   where business_id in ('7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-b000-000000000002'))
  + (select count(*)::integer from public.audit_log
     where business_id = '7c000000-0000-4000-b000-000000000001' and action = 'wage.set'),
  0,
  'nothing refused left a wage or a log row'
);

------------------------------------------------------------------------------
-- Setting a wage

set local role service_role;
select lives_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000a',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000c',
    3800, '2026-11-01', '  From November  ', '2026-11-10 10:00+02')$$,
  'the owner sets the worker''s wage from the first of the month'
);
reset role;
select results_eq(
  $$select hourly_agorot, effective_from, note, set_by, set_at
    from public.member_wages where user_id = '7c000000-0000-4000-a000-00000000000c'$$,
  $$values (3800, '2026-11-01'::date, 'From November'::text,
    '7c000000-0000-4000-a000-00000000000a'::uuid, '2026-11-10 10:00+02'::timestamptz)$$,
  'in agorot, from the day, with its note trimmed, who set it and when'
);
select results_eq(
  $$select actor_id, details ->> 'person', details ->> 'from_agorot', (details ->> 'to_agorot')::integer,
      details ->> 'effective_from', (details ->> 'minimum_agorot')::integer, details ->> 'note',
      (details ->> 'wage')::uuid = (select id from public.member_wages
        where business_id = '7c000000-0000-4000-b000-000000000001' and user_id = '7c000000-0000-4000-a000-00000000000c')
    from public.audit_log where business_id = '7c000000-0000-4000-b000-000000000001' and action = 'wage.set'$$,
  $$values ('7c000000-0000-4000-a000-00000000000a'::uuid, '7c000000-0000-4000-a000-00000000000c'::text,
    null::text, 3800, '2026-11-01'::text, 3540, 'From November'::text, true)$$,
  'the log keeps who set it, the wage before (none) and after, the day, the minimum then and the note'
);

-- A typo fixed by the manager, now with pay access: a second row for the day.
select lives_ok(
  $$select pg_temp.set_c('7c000000-0000-4000-a000-00000000000b', 4000, '2026-11-01', 11)$$,
  'a manager with pay access sets a worker''s wage'
);
select results_eq(
  $$values (private.wage_on('7c000000-0000-4000-b000-000000000001',
      '7c000000-0000-4000-a000-00000000000c', '2026-10-31'),
    private.wage_on('7c000000-0000-4000-b000-000000000001',
      '7c000000-0000-4000-a000-00000000000c', '2026-11-01'),
    private.wage_on('7c000000-0000-4000-b000-000000000001',
      '7c000000-0000-4000-a000-00000000000c', '2027-06-01'))$$,
  $$values (null::integer, 4000, 4000)$$,
  'of two rows for the same day the one set later is the wage, and before the day there is none'
);
select results_eq(
  $$select (details ->> 'from_agorot')::integer, (details ->> 'to_agorot')::integer
    from public.audit_log
    where business_id = '7c000000-0000-4000-b000-000000000001' and action = 'wage.set'
      and actor_id = '7c000000-0000-4000-a000-00000000000b'$$,
  $$values (3800, 4000)$$,
  'and its log row says what it was on that day'
);
select is(
  (select count(*)::integer from public.member_wages
   where user_id = '7c000000-0000-4000-a000-00000000000c'),
  2,
  'both rows stay, as the history'
);

-- Under the minimum still saves, for someone who left, from the first of last
-- month; an owner's wage by an owner, a year ahead.
select lives_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000a',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-00000000000e',
    3000, '2026-10-01', null, '2026-11-10 10:00+02')$$,
  'a wage under the minimum is saved, for someone who left, from the first of last month'
);
select is(
  (select (details ->> 'minimum_agorot')::integer - (details ->> 'to_agorot')::integer
   from public.audit_log where business_id = '7c000000-0000-4000-b000-000000000001' and action = 'wage.set'
     and details ->> 'person' = '7c000000-0000-4000-a000-00000000000e'),
  540,
  'with the minimum beside it in the log'
);
select lives_ok(
  $$select public.set_hourly_wage('7c000000-0000-4000-a000-00000000000a',
    '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-000000000010',
    5000, '2027-11-10', null, '2026-11-10 10:00+02')$$,
  'an owner sets another owner''s wage, a year ahead at the latest'
);
insert into public.member_wages (business_id, user_id, hourly_agorot, effective_from)
values ('7c000000-0000-4000-b000-000000000002', '7c000000-0000-4000-a000-000000000011', 3900, '2026-11-01');

------------------------------------------------------------------------------
-- The person's line

select results_eq(
  $$select kind, params, actor_id, source_module::text, read_at is null
    from public.notifications
    where business_id = '7c000000-0000-4000-b000-000000000001'
      and user_id = '7c000000-0000-4000-a000-00000000000c'$$,
  $$values ('pay.wage_set'::text, '{"since": "2026-11-01"}'::jsonb,
    '7c000000-0000-4000-a000-00000000000b'::uuid, 'time_clock'::text, true)$$,
  'the worker has one line, from the latest change, with the day and no amount'
);
select is(
  (select count(*)::integer from public.notifications
   where business_id = '7c000000-0000-4000-b000-000000000001' and kind = 'pay.wage_set'
     and (params::text ~ '(3800|4000|3000|5000|agorot)')),
  0,
  'no line holds an amount'
);
select is(
  (select count(*)::integer from public.notifications
   where business_id = '7c000000-0000-4000-b000-000000000001' and kind = 'pay.wage_set'
     and user_id = '7c000000-0000-4000-a000-00000000000e'),
  0,
  'someone who left is told nothing'
);
select is(
  (select count(*)::integer from public.notifications
   where business_id = '7c000000-0000-4000-b000-000000000001' and kind = 'pay.wage_set'
     and user_id = '7c000000-0000-4000-a000-000000000010'),
  1,
  'the owner whose wage the other owner set is told'
);

------------------------------------------------------------------------------
-- Who reads them

select pg_temp.sign_in('7c000000-0000-4000-a000-00000000000c');
select results_eq(
  $$select hourly_agorot from public.member_wages order by set_at$$,
  $$values (3800), (4000)$$,
  'a worker reads their own wages and nobody else''s'
);
reset role;
select pg_temp.sign_in('7c000000-0000-4000-a000-00000000000b');
select is((select count(*)::integer from public.member_wages
  where business_id = '7c000000-0000-4000-b000-000000000001'), 4, 'a manager with pay access reads the business''s');
select is(
  (select count(*)::integer from public.member_wages
   where business_id = '7c000000-0000-4000-b000-000000000002'),
  0,
  'and nothing of another business'
);
reset role;
select public.set_role_permission('7c000000-0000-4000-a000-00000000000a',
  '7c000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', false);
select pg_temp.sign_in('7c000000-0000-4000-a000-00000000000b');
select is((select count(*)::integer from public.member_wages
  where business_id = '7c000000-0000-4000-b000-000000000001'), 0, 'once the owner takes it back, nothing');
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '7c000000-0000-4000-b000-000000000001' and action = 'wage.set'),
  0,
  'nor the log''s wage rows'
);
reset role;
select pg_temp.sign_in('7c000000-0000-4000-a000-00000000000d');
select is((select count(*)::integer from public.member_wages
  where business_id = '7c000000-0000-4000-b000-000000000001'), 4, 'the accountant reads the business''s');
reset role;
select pg_temp.sign_in('7c000000-0000-4000-a000-000000000010');
select is((select count(*)::integer from public.member_wages
  where business_id = '7c000000-0000-4000-b000-000000000001'), 4, 'and so does an owner');
reset role;
select pg_temp.sign_in('7c000000-0000-4000-a000-000000000012');
select is((select count(*)::integer from public.member_wages
  where business_id = '7c000000-0000-4000-b000-000000000001'), 4, 'a view as an accountant reads them');
reset role;
select pg_temp.sign_in('7c000000-0000-4000-a000-000000000013');
select is((select count(*)::integer from public.member_wages
  where business_id = '7c000000-0000-4000-b000-000000000001'), 0, 'a view as a manager doesn''t');
reset role;
select pg_temp.sign_in('7c000000-0000-4000-a000-00000000000e');
select is((select count(*)::integer from public.member_wages
  where business_id = '7c000000-0000-4000-b000-000000000001'), 0, 'someone who left reads not even their own');
reset role;
select pg_temp.sign_in('7c000000-0000-4000-a000-00000000000f');
select results_eq(
  $$select business_id, hourly_agorot from public.member_wages$$,
  $$values ('7c000000-0000-4000-b000-000000000002'::uuid, 3900)$$,
  'the other business''s owner reads theirs alone'
);
reset role;
update public.business_modules set enabled = false
where business_id = '7c000000-0000-4000-b000-000000000001' and module_key = 'time_clock';
select pg_temp.sign_in('7c000000-0000-4000-a000-00000000000c');
select is((select count(*)::integer from public.member_wages
  where business_id = '7c000000-0000-4000-b000-000000000001'), 0, 'with the time clock off nobody reads them');
reset role;
update public.business_modules set enabled = true
where business_id = '7c000000-0000-4000-b000-000000000001' and module_key = 'time_clock';

------------------------------------------------------------------------------
-- Kept

select throws_ok(
  $$update public.member_wages set hourly_agorot = 1
    where user_id = '7c000000-0000-4000-a000-00000000000c'$$,
  '42501', 'Wages are kept: a new row corrects one', 'nothing changes a wage, the database''s owner included'
);
select throws_ok(
  $$delete from public.member_wages where user_id = '7c000000-0000-4000-a000-00000000000c'$$,
  '42501', 'Wages are kept: a new row corrects one', 'nor deletes one'
);
select throws_ok(
  $$delete from public.memberships
    where business_id = '7c000000-0000-4000-b000-000000000001'
      and user_id = '7c000000-0000-4000-a000-00000000000c'$$,
  '23503', null, 'a person with wages stays in the business''s records'
);
select throws_ok(
  $$delete from auth.users where id = '7c000000-0000-4000-a000-00000000000c'$$,
  '23503', null, 'and their account stays'
);
-- The manager who set a wage leaves the app: who set it goes to null, and
-- nothing else changes.
select lives_ok(
  $$delete from auth.users where id = '7c000000-0000-4000-a000-00000000000b'$$,
  'the account of someone who set a wage can go'
);
select results_eq(
  $$select hourly_agorot, set_by from public.member_wages
    where user_id = '7c000000-0000-4000-a000-00000000000c' order by set_at$$,
  $$values (3800, '7c000000-0000-4000-a000-00000000000a'::uuid), (4000, null::uuid)$$,
  'leaving the wage as it was, with nobody named as who set it'
);
select throws_ok(
  $$delete from public.businesses where id = '7c000000-0000-4000-b000-000000000002'$$,
  '23503', null, 'a business with wages stays'
);
select private.purge_business_records('7c000000-0000-4000-b000-000000000002');
select lives_ok(
  $$delete from public.businesses where id = '7c000000-0000-4000-b000-000000000002'$$,
  'until the purge takes its wages with its records'
);
select throws_ok(
  $$delete from public.member_wages where user_id = '7c000000-0000-4000-a000-00000000000e'$$,
  '42501', null, 'and after it the purge''s setting is back to what it was'
);

------------------------------------------------------------------------------
-- The demo's wages

-- o owner, m manager, w, v and n workers, x the accountant. v gets a raise in
-- the month, n no wage.
insert into private.demo_businesses (business_id, definition)
values ('7c000000-0000-4000-b000-000000000003', $json$
  {
    "slug": "demo-wages", "name": "Demo wages", "accent": "#7c3aed",
    "address": "Demo street 4", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "wages": { "manager": 4500, "worker": 3800, "cases": [
      { "user_id": "7c000000-0000-4000-a000-000000000024", "case": "raise", "agorot": 3600 },
      { "user_id": "7c000000-0000-4000-a000-000000000025", "case": "none" }
    ] },
    "people": [
      { "user_id": "7c000000-0000-4000-a000-000000000021", "role": "owner", "name": "Owner O" },
      { "user_id": "7c000000-0000-4000-a000-000000000022", "role": "manager", "name": "Manager M" },
      { "user_id": "7c000000-0000-4000-a000-000000000023", "role": "worker", "name": "Worker W" },
      { "user_id": "7c000000-0000-4000-a000-000000000024", "role": "worker", "name": "Worker V" },
      { "user_id": "7c000000-0000-4000-a000-000000000025", "role": "worker", "name": "Worker N" },
      { "user_id": "7c000000-0000-4000-a000-000000000026", "role": "accountant", "name": "Accountant X" }
    ]
  }
  $json$);

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('7c000000-0000-4000-b000-000000000003')$$,
  'a demo business with wages resets'
);
reset role;

create temporary view demo_wages as
  select w.user_id, w.hourly_agorot, w.effective_from, w.set_by,
    (w.set_at at time zone b.timezone) as local_set,
    (date_trunc('month', now() at time zone b.timezone) - interval '1 month')::date as first_day
  from public.member_wages w
  join public.businesses b on b.id = w.business_id
  where w.business_id = '7c000000-0000-4000-b000-000000000003';

select results_eq(
  $$select user_id, hourly_agorot, effective_from - first_day
    from demo_wages order by user_id, effective_from$$,
  $$values
    ('7c000000-0000-4000-a000-000000000022'::uuid, 4500, 0),
    ('7c000000-0000-4000-a000-000000000023'::uuid, 3800, 0),
    ('7c000000-0000-4000-a000-000000000024'::uuid, 3600, 0),
    ('7c000000-0000-4000-a000-000000000024'::uuid, 3800, 14)$$,
  'its manager and workers have their role''s wage from the first of last month, one a raise on the 15th; the owner, the accountant and the one without a wage none'
);
select is(
  (select count(*)::integer from demo_wages
   where set_by is distinct from '7c000000-0000-4000-a000-000000000021'
     or local_set <> effective_from + '08:00'::time),
  0,
  'each set by its owner, on the morning it takes effect'
);
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '7c000000-0000-4000-b000-000000000003' and action = 'wage.set')
  + (select count(*)::integer from public.notifications
     where business_id = '7c000000-0000-4000-b000-000000000003' and kind = 'pay.wage_set'),
  0,
  'with no log rows and no lines: nobody set them today'
);

-- Again, from the start; a plan that makes no sense writes no wages, and the
-- reset still stands.
set local role service_role;
select public.reset_demo_business('7c000000-0000-4000-b000-000000000003');
reset role;
select is(
  (select count(*)::integer from demo_wages),
  4,
  'a second reset writes the same wages again, nothing left from before'
);
update private.demo_businesses
set definition = definition || '{"wages": {"manager": 4500, "worker": 3800, "cases": [
  {"user_id": "7c000000-0000-4000-a000-000000000023", "case": "raise", "agorot": 0}
]}}'::jsonb
where business_id = '7c000000-0000-4000-b000-000000000003';
set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('7c000000-0000-4000-b000-000000000003')$$,
  'a plan with a wage of nothing still lets the reset through'
);
reset role;
select is((select count(*)::integer from demo_wages), 0, 'with no wages at all');

select * from finish();
rollback;
