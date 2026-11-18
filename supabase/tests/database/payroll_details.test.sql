-- Payroll details and employment periods (20261110000600_payroll_details.sql):
-- who sets them (a pay holder, never their own, an owner's only an owner,
-- never an accountant's; a birth date only an owner or the accountant), that
-- a birth date is never kept (only the 18th birthday, 29 February to 28
-- February), that the log names fields and never a value, that periods never
-- overlap, follow joining, leaving and coming back, and leave a holder's own
-- alone, that a wage can't start before a holder's start and logs the
-- minimum of the person's age, who reads them, who sees a minor's "until"
-- (only while the time clock is on), nothing deletes them but the purge, the
-- demo's, and
-- the backfill. Fixed ids, and every write at a fixed time (10 November 2026
-- in Israel) but the memberships', which the trigger dates by the business's
-- today, worked out here the same way.
begin;
select plan(88);

insert into auth.users (id, aud, role, phone)
values
  ('7d000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500003001'),
  ('7d000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500003002'),
  ('7d000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500003003'),
  ('7d000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500003004'),
  ('7d000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500003005'),
  ('7d000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500003006'),
  ('7d000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500003007'),
  ('7d000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated', '972500003008'),
  ('7d000000-0000-4000-a000-000000000012', 'authenticated', 'authenticated', '972500003009'),
  ('7d000000-0000-4000-a000-000000000013', 'authenticated', 'authenticated', '972500003010'),
  ('7d000000-0000-4000-a000-000000000014', 'authenticated', 'authenticated', '972500003011'),
  ('7d000000-0000-4000-a000-000000000021', 'authenticated', 'authenticated', '972500003012'),
  ('7d000000-0000-4000-a000-000000000022', 'authenticated', 'authenticated', '972500003013'),
  ('7d000000-0000-4000-a000-000000000023', 'authenticated', 'authenticated', '972500003014'),
  ('7d000000-0000-4000-a000-000000000024', 'authenticated', 'authenticated', '972500003015'),
  ('7d000000-0000-4000-a000-000000000025', 'authenticated', 'authenticated', '972500003016'),
  ('7d000000-0000-4000-a000-000000000026', 'authenticated', 'authenticated', '972500003017'),
  ('7d000000-0000-4000-a000-000000000027', 'authenticated', 'authenticated', '972500003018'),
  ('7d000000-0000-4000-a000-0000000000a1', 'authenticated', 'authenticated', '972500003019'),
  ('7d000000-0000-4000-a000-0000000000a2', 'authenticated', 'authenticated', '972500003020'),
  ('7d000000-0000-4000-a000-0000000000a3', 'authenticated', 'authenticated', '972500003021');

-- W: a owner, b manager, c and j workers, d accountant, e a worker who left.
-- Z: f owner, g worker. h and i are on the ConceptApp team, viewing W as an
-- accountant and as a manager. k joins W from an invite later.
insert into public.businesses (id, slug, name)
values
  ('7d000000-0000-4000-b000-000000000001', 'pd-w', 'Details W'),
  ('7d000000-0000-4000-b000-000000000002', 'pd-z', 'Details Z');
insert into public.memberships (business_id, user_id, role, active)
values
  ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000a', 'owner', true),
  ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000b', 'manager', true),
  ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000c', 'worker', true),
  ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-000000000013', 'worker', true),
  ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000d', 'accountant', true),
  ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000e', 'worker', false),
  ('7d000000-0000-4000-b000-000000000002', '7d000000-0000-4000-a000-00000000000f', 'owner', true),
  ('7d000000-0000-4000-b000-000000000002', '7d000000-0000-4000-a000-000000000010', 'worker', true);
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('7d000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('7d000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');
insert into public.platform_staff (user_id, role)
values
  ('7d000000-0000-4000-a000-000000000011', 'onboarder'),
  ('7d000000-0000-4000-a000-000000000012', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('7d000000-0000-4000-a000-000000000011', '7d000000-0000-4000-b000-000000000001', 'accountant'),
  ('7d000000-0000-4000-a000-000000000012', '7d000000-0000-4000-b000-000000000001', 'manager');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Details set in W, by `actor`, at 10:00 on 10 November 2026.
create function pg_temp.set_w(actor uuid, person uuid, patch jsonb)
returns void language sql as $$
  select public.set_payroll_details(actor, '7d000000-0000-4000-b000-000000000001',
    person, patch, '2026-11-10 10:00+02'::timestamptz)
$$;

-- A period set in W, by `actor`, at 10:00 on 10 November 2026.
create function pg_temp.period_w(
  actor uuid, person uuid, from_day date, to_day date default null,
  paid_until date default null, period_id uuid default null
)
returns uuid language sql as $$
  select public.set_employment_period(actor, '7d000000-0000-4000-b000-000000000001',
    person, from_day, to_day, paid_until, period_id, '2026-11-10 10:00+02'::timestamptz)
$$;

------------------------------------------------------------------------------
-- Who may do what

select ok(
  has_function_privilege('service_role',
    'public.set_payroll_details(uuid, uuid, uuid, jsonb, timestamptz)', 'execute')
  and has_function_privilege('service_role',
    'public.set_employment_period(uuid, uuid, uuid, date, date, date, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.set_payroll_details(uuid, uuid, uuid, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.set_employment_period(uuid, uuid, uuid, date, date, date, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon',
    'public.set_payroll_details(uuid, uuid, uuid, jsonb, timestamptz)', 'execute'),
  'details and periods are set with the secret key only'
);
select ok(
  has_function_privilege('authenticated', 'public.team_youth(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.team_youth(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.track_employment()', 'execute')
  and not has_function_privilege('authenticated', 'private.refuse_payroll_record_delete()', 'execute')
  and not has_function_privilege('authenticated', 'private.minimum_wage_for(uuid, uuid, date)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_details(uuid, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'private.backfill_employment_periods()', 'execute'),
  'who is a minor is asked with one''s own session; the rest runs inside the database'
);
select ok(
  has_table_privilege('authenticated', 'public.member_payroll_details', 'select')
  and has_table_privilege('authenticated', 'public.employment_periods', 'select')
  and not has_table_privilege('authenticated', 'public.member_payroll_details', 'insert, update, delete')
  and not has_table_privilege('authenticated', 'public.employment_periods', 'insert, update, delete')
  and not has_table_privilege('anon', 'public.member_payroll_details', 'select')
  and not has_table_privilege('anon', 'public.employment_periods', 'select')
  and not has_table_privilege('service_role', 'public.member_payroll_details', 'insert, update, delete, truncate')
  and not has_table_privilege('service_role', 'public.employment_periods', 'insert, update, delete, truncate'),
  'both are read under RLS, and nobody writes them but the functions'
);

------------------------------------------------------------------------------
-- Periods open as people join

select results_eq(
  $$select user_id, source, started_on = (now() at time zone 'Asia/Jerusalem')::date, ended_on
    from public.employment_periods
    where business_id = '7d000000-0000-4000-b000-000000000001'
    order by user_id$$,
  $$values
    ('7d000000-0000-4000-a000-00000000000a'::uuid, 'joined'::text, true, null::date),
    ('7d000000-0000-4000-a000-00000000000b'::uuid, 'joined'::text, true, null::date),
    ('7d000000-0000-4000-a000-00000000000c'::uuid, 'joined'::text, true, null::date),
    ('7d000000-0000-4000-a000-000000000013'::uuid, 'joined'::text, true, null::date)$$,
  'everyone who joins the staff has a period from the business''s today; the accountant and someone who joined inactive none'
);

------------------------------------------------------------------------------
-- Setting the details: refused

select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000b',
    '7d000000-0000-4000-a000-00000000000c', '{"rest_day": 5}')$$,
  '42501', 'Pay holders only', 'a manager without pay access sets nobody''s details'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000c',
    '7d000000-0000-4000-a000-000000000013', '{"rest_day": 5}')$$,
  '42501', 'Pay holders only', 'nor does a worker'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000f',
    '7d000000-0000-4000-a000-00000000000c', '{"rest_day": 5}')$$,
  '42501', 'Pay holders only', 'nor the owner of another business'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-00000000000a', '{"rest_day": 5}')$$,
  '42501', 'Someone else sets your own details', 'nobody sets their own'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-000000000010', '{"rest_day": 5}')$$,
  'P0002', 'Not in the team', 'nor the details of someone of another business'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-00000000000d', '{"rest_day": 5}')$$,
  '22023', 'An accountant has no hours here', 'an accountant has no payroll details here'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-00000000000c', '{"salary": 1}')$$,
  '22023', 'Not a payroll detail: salary', 'only the payroll details are kept'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-00000000000c', '{"rest_day": 3}')$$,
  '23514', null, 'a rest day is Friday, Saturday or Sunday'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-00000000000c', '{"hours_law": "boss"}')$$,
  '23514', null, 'and the Hours law applies, or one of its two exceptions'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-00000000000c', '{"payroll_number": "a b"}')$$,
  '22023', 'A payroll number is 1 to 20 letters, digits or dashes',
  'a payroll number is letters, digits and dashes'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-00000000000c', '{"birth_date": "2027-01-01"}')$$,
  '22023', 'A birth date is in the last 100 years', 'a birth date is not ahead'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-00000000000c', '{"birth_date": "2009-02-30"}')$$,
  '22023', 'A birth date is a day, YYYY-MM-DD', 'and is a real day'
);

-- The owner gives managers pay access.
select public.set_role_permission('7d000000-0000-4000-a000-00000000000a',
  '7d000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000b',
    '7d000000-0000-4000-a000-00000000000c', '{"birth_date": "2009-04-15"}')$$,
  '42501', 'Only an owner or the accountant enters a birth date',
  'a manager with pay access enters no birth date'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000b',
    '7d000000-0000-4000-a000-00000000000a', '{"payroll_number": "1"}')$$,
  '42501', 'Only an owner sets an owner''s details', 'nor an owner''s details'
);
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id in ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-b000-000000000002'))
  + (select count(*)::integer from public.audit_log
     where business_id = '7d000000-0000-4000-b000-000000000001' and action like 'payroll.%'),
  0,
  'nothing refused left details or a log row'
);

------------------------------------------------------------------------------
-- Setting the details

select lives_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000d',
    '7d000000-0000-4000-a000-00000000000c',
    '{"payroll_number": " P-77 ", "rest_day": 5, "birth_date": "2009-04-15"}')$$,
  'the accountant sets a worker''s number, rest day and birth date'
);
select results_eq(
  $$select payroll_number, rest_day::integer, hours_law, youth_until, compulsory_education,
      updated_by, updated_at
    from public.member_payroll_details
    where business_id = '7d000000-0000-4000-b000-000000000001'
      and user_id = '7d000000-0000-4000-a000-00000000000c'$$,
  $$values ('P-77'::text, 5, 'applies'::text, '2027-04-15'::date, true,
    '7d000000-0000-4000-a000-00000000000d'::uuid, '2026-11-10 10:00+02'::timestamptz)$$,
  'the number trimmed, the rest day, the 18th birthday in place of the birth date, the rest as they start'
);
select results_eq(
  $$select actor_id, details ->> 'person', details -> 'fields'
    from public.audit_log
    where business_id = '7d000000-0000-4000-b000-000000000001' and action = 'payroll.details'$$,
  $$values ('7d000000-0000-4000-a000-00000000000d'::uuid,
    '7d000000-0000-4000-a000-00000000000c'::text,
    '["payroll_number", "rest_day", "youth_until"]'::jsonb)$$,
  'the log keeps who changed which fields of whose details, the birth date as the youth'
);
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '7d000000-0000-4000-b000-000000000001' and action like 'payroll.%'
     and details::text ~ '(P-77|2009|2027|04-15|birth|"rest_day":)'),
  0,
  'and never a number, a day or a rest day''s value'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema in ('public', 'private') and column_name ~ 'birth'
  ),
  'no table has a place for a birth date'
);

-- c is a minor until 15 April 2027: 16 from 15 April 2025, 17 from 15 April
-- 2026. The minimum of a day follows the band, mid-month too.
select results_eq(
  $$values (
    private.minimum_wage_for('7d000000-0000-4000-b000-000000000001',
      '7d000000-0000-4000-a000-00000000000c', '2025-03-31'),
    private.minimum_wage_for('7d000000-0000-4000-b000-000000000001',
      '7d000000-0000-4000-a000-00000000000c', '2025-04-14'),
    private.minimum_wage_for('7d000000-0000-4000-b000-000000000001',
      '7d000000-0000-4000-a000-00000000000c', '2025-04-15'),
    private.minimum_wage_for('7d000000-0000-4000-b000-000000000001',
      '7d000000-0000-4000-a000-00000000000c', '2026-04-14'),
    private.minimum_wage_for('7d000000-0000-4000-b000-000000000001',
      '7d000000-0000-4000-a000-00000000000c', '2026-04-15'),
    private.minimum_wage_for('7d000000-0000-4000-b000-000000000001',
      '7d000000-0000-4000-a000-00000000000c', '2027-04-15'),
    private.minimum_wage_for('7d000000-0000-4000-b000-000000000001',
      '7d000000-0000-4000-a000-00000000000b', '2026-11-01'))$$,
  $$values (null::integer, 2528, 2709, 2794, 3092, 3540, 3540)$$,
  'the minimum of a day by age: none before the table, under 16, 16, 16 in the next table, 17, then an adult; the adult one without details'
);
select lives_ok(
  $$select public.set_hourly_wage('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000c',
    3300, '2026-11-01', null, '2026-11-10 10:00+02')$$,
  'a minor''s wage under the adult minimum and over the minimum of 17 saves'
);
select results_eq(
  $$select (details ->> 'to_agorot')::integer, (details ->> 'minimum_agorot')::integer
    from public.audit_log
    where business_id = '7d000000-0000-4000-b000-000000000001' and action = 'wage.set'
      and details ->> 'person' = '7d000000-0000-4000-a000-00000000000c'$$,
  $$values (3300, 3092)$$,
  'and its log row keeps the minimum of 17 on that day, so the log doesn''t call it under the minimum'
);

-- The owner corrects it: an adult.
select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
  '7d000000-0000-4000-a000-00000000000c', '{"birth_date": "2000-01-01"}');
select is(
  (select youth_until from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-00000000000c'),
  null::date,
  'an adult''s birth date leaves no youth'
);
select is(
  (select details -> 'fields' from public.audit_log
   where business_id = '7d000000-0000-4000-b000-000000000001' and action = 'payroll.details'
     and actor_id = '7d000000-0000-4000-a000-00000000000a'),
  '["youth_until"]'::jsonb,
  'and the owner''s row names only the youth'
);

-- Born on 29 February 2008: 18 on 28 February 2026, as Postgres adds years.
select public.set_payroll_details('7d000000-0000-4000-a000-00000000000a',
  '7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-000000000013',
  '{"birth_date": "2008-02-29"}', '2026-01-01 10:00+02');
select is(
  (select youth_until from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-000000000013'),
  '2026-02-28'::date,
  'someone born on 29 February is a minor until 28 February in a year without one'
);

select lives_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000b',
    '7d000000-0000-4000-a000-000000000013', '{"hours_law": "trust", "compulsory_education": false}')$$,
  'a manager with pay access sets the rest'
);
select pg_temp.set_w('7d000000-0000-4000-a000-00000000000b',
  '7d000000-0000-4000-a000-000000000013', '{"hours_law": "trust"}');
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '7d000000-0000-4000-b000-000000000001' and action = 'payroll.details'
     and actor_id = '7d000000-0000-4000-a000-00000000000b'),
  1,
  'and saving what is already there writes nothing'
);
select throws_ok(
  $$select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-a000-000000000013', '{"payroll_number": "P-77"}')$$,
  '23505', null, 'a payroll number is one person''s in the business'
);
select lives_ok(
  $$select public.set_payroll_details('7d000000-0000-4000-a000-00000000000f',
    '7d000000-0000-4000-b000-000000000002', '7d000000-0000-4000-a000-000000000010',
    '{"payroll_number": "P-77"}', '2026-11-10 10:00+02')$$,
  'and another business may have the same'
);
select pg_temp.set_w('7d000000-0000-4000-a000-00000000000a',
  '7d000000-0000-4000-a000-00000000000c', '{"payroll_number": null}');
select is(
  (select payroll_number from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-00000000000c'),
  null::text,
  'a number can be cleared'
);

------------------------------------------------------------------------------
-- Periods

select lives_ok(
  $$select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
    '7d000000-0000-4000-a000-00000000000c', '2026-03-01', null, null,
    (select id from public.employment_periods
     where business_id = '7d000000-0000-4000-b000-000000000001'
       and user_id = '7d000000-0000-4000-a000-00000000000c'))$$,
  'the accountant says the worker started on 1 March, not on joining the app'
);
select results_eq(
  $$select started_on, ended_on, source, updated_by
    from public.employment_periods
    where business_id = '7d000000-0000-4000-b000-000000000001'
      and user_id = '7d000000-0000-4000-a000-00000000000c'$$,
  $$values ('2026-03-01'::date, null::date, 'set'::text,
    '7d000000-0000-4000-a000-00000000000d'::uuid)$$,
  'the period is theirs from then on'
);
select results_eq(
  $$select details ->> 'person', (details ->> 'added')::boolean, (details ->> 'confirmed')::boolean,
      details -> 'fields',
      (details ->> 'period')::uuid = (select id from public.employment_periods
        where business_id = '7d000000-0000-4000-b000-000000000001'
          and user_id = '7d000000-0000-4000-a000-00000000000c')
    from public.audit_log
    where business_id = '7d000000-0000-4000-b000-000000000001' and action = 'payroll.period'$$,
  $$values ('7d000000-0000-4000-a000-00000000000c'::text, false, true,
    '["started_on"]'::jsonb, true)$$,
  'and the log says the joined period was checked and its start changed'
);
select lives_ok(
  $$select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
    '7d000000-0000-4000-a000-00000000000c', '2025-01-01', '2025-12-31', '2026-01-10')$$,
  'an earlier period of theirs is added, with its last payment'
);
select throws_ok(
  $$select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
    '7d000000-0000-4000-a000-00000000000c', '2025-06-01', '2026-04-01')$$,
  '23P01', 'Periods overlap', 'periods never overlap'
);
select throws_ok(
  $$select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
    '7d000000-0000-4000-a000-00000000000c', '2024-05-01', '2024-04-01')$$,
  '22023', 'A period ends on or after its start', 'a period ends after it starts'
);
select throws_ok(
  $$select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
    '7d000000-0000-4000-a000-00000000000c', '1926-11-09')$$,
  '22023', 'A period starts in the last 100 years', 'and starts in the last 100 years'
);
select throws_ok(
  $$select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
    '7d000000-0000-4000-a000-00000000000c', '2024-01-01', null, '2024-02-01')$$,
  '22023', 'The last payment comes once the period ended', 'and is paid off once it ended'
);
select throws_ok(
  $$select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
    '7d000000-0000-4000-a000-000000000013', '2026-03-01', null, null,
    (select id from public.employment_periods
     where business_id = '7d000000-0000-4000-b000-000000000001'
       and user_id = '7d000000-0000-4000-a000-00000000000c' and ended_on is null))$$,
  'P0002', 'Unknown period', 'one person''s period is not changed as another''s'
);
select throws_ok(
  $$select pg_temp.period_w('7d000000-0000-4000-a000-00000000000b',
    '7d000000-0000-4000-a000-00000000000b', '2026-03-01')$$,
  '42501', 'Someone else sets your own period', 'nobody sets their own'
);
select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
  '7d000000-0000-4000-a000-00000000000c', '2026-03-01', null, null,
  (select id from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-00000000000c' and ended_on is null));
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '7d000000-0000-4000-b000-000000000001' and action = 'payroll.period'),
  2,
  'saving a holder''s period as it was writes nothing'
);
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '7d000000-0000-4000-b000-000000000001' and action = 'payroll.period'
     and details::text ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}'),
  0,
  'and no period''s row holds a day'
);
select throws_ok(
  $$insert into public.employment_periods (business_id, user_id, started_on, source)
    values ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000c',
      '2026-05-01', 'set')$$,
  '23P01', null, 'the table refuses an overlap by itself too'
);

------------------------------------------------------------------------------
-- A wage, not before they started

select pg_temp.period_w('7d000000-0000-4000-a000-00000000000d',
  '7d000000-0000-4000-a000-000000000013', '2026-11-05', null, null,
  (select id from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-000000000013'));
select throws_ok(
  $$select public.set_hourly_wage('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-000000000013',
    3800, '2026-11-01', null, '2026-11-10 10:00+02')$$,
  '22023', 'Before they started', 'a wage can''t start before a holder''s start'
);
select lives_ok(
  $$select public.set_hourly_wage('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-000000000013',
    3800, '2026-11-05', null, '2026-11-10 10:00+02')$$,
  'from that day it can'
);
select lives_ok(
  $$select public.set_hourly_wage('7d000000-0000-4000-a000-00000000000a',
    '7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000b',
    4500, (date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '1 month')::date)$$,
  'a start copied from joining the app limits nothing: last month''s wage still saves'
);

------------------------------------------------------------------------------
-- Who reads them

-- e left with details of their own; j is a minor for a while yet.
insert into public.member_payroll_details (business_id, user_id, payroll_number)
values ('7d000000-0000-4000-b000-000000000001', '7d000000-0000-4000-a000-00000000000e', 'E-1');
update public.member_payroll_details
set youth_until = (now() at time zone 'Asia/Jerusalem')::date + 400
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-000000000013';

select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000c');
select results_eq(
  $$select user_id from public.member_payroll_details$$,
  $$values ('7d000000-0000-4000-a000-00000000000c'::uuid)$$,
  'a worker reads their own details and nobody else''s'
);
select is(
  (select count(*)::integer || '/' || (count(*) filter (
     where user_id = '7d000000-0000-4000-a000-00000000000c'))::integer
   from public.employment_periods),
  '2/2',
  'and their own periods'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001'),
  3,
  'a manager with pay access reads the business''s'
);
reset role;
select public.set_role_permission('7d000000-0000-4000-a000-00000000000a',
  '7d000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', false);
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001')::text
  || '/' || (select count(*)::integer from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000001')::text,
  '0/1',
  'once the owner takes it back, only their own period'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000d');
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001'),
  3,
  'the accountant reads the business''s'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-000000000011');
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001'),
  3,
  'a view as an accountant reads them'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-000000000012');
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001')::text
  || '/' || (select count(*)::integer from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000001')::text,
  '0/0',
  'a view as a manager reads neither'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000e');
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001'),
  0,
  'someone who left reads not even their own'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000f');
select results_eq(
  $$select business_id, payroll_number from public.member_payroll_details$$,
  $$values ('7d000000-0000-4000-b000-000000000002'::uuid, 'P-77'::text)$$,
  'the other business''s owner reads theirs alone'
);
reset role;
update public.business_modules set enabled = false
where business_id = '7d000000-0000-4000-b000-000000000001' and module_key = 'time_clock';
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000c');
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000001'),
  0,
  'with the time clock off nobody reads them'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::integer from public.team_youth('7d000000-0000-4000-b000-000000000001')),
  0,
  'nor does a manager see who is a minor'
);
reset role;
update public.business_modules set enabled = true
where business_id = '7d000000-0000-4000-b000-000000000001' and module_key = 'time_clock';

------------------------------------------------------------------------------
-- Who is a minor, for managers

select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000b');
select results_eq(
  $$select user_id, youth_until from public.team_youth('7d000000-0000-4000-b000-000000000001')$$,
  $$values ('7d000000-0000-4000-a000-000000000013'::uuid,
    (now() at time zone 'Asia/Jerusalem')::date + 400)$$,
  'a manager without pay access still sees who is a minor, and until when'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000c');
select is(
  (select count(*)::integer from public.team_youth('7d000000-0000-4000-b000-000000000001')),
  0,
  'a worker doesn''t'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-00000000000d');
select is(
  (select count(*)::integer from public.team_youth('7d000000-0000-4000-b000-000000000001')),
  0,
  'nor does the accountant, who reads the details themselves'
);
reset role;
select pg_temp.sign_in('7d000000-0000-4000-a000-000000000012');
select results_eq(
  $$select user_id from public.team_youth('7d000000-0000-4000-b000-000000000001')$$,
  $$values ('7d000000-0000-4000-a000-000000000013'::uuid)$$,
  'a view as a manager does'
);
reset role;

------------------------------------------------------------------------------
-- Kept

select throws_ok(
  $$delete from public.member_payroll_details
    where user_id = '7d000000-0000-4000-a000-00000000000c'$$,
  '42501', 'Payroll records are kept: nothing deletes them',
  'nothing deletes someone''s details, the database''s owner included'
);
select throws_ok(
  $$delete from public.employment_periods
    where user_id = '7d000000-0000-4000-a000-00000000000c'$$,
  '42501', 'Payroll records are kept: nothing deletes them', 'nor a period'
);
select throws_ok(
  $$delete from public.memberships
    where business_id = '7d000000-0000-4000-b000-000000000001'
      and user_id = '7d000000-0000-4000-a000-00000000000a'$$,
  '23503', null, 'a period alone keeps someone in the business''s records'
);
select throws_ok(
  $$delete from auth.users where id = '7d000000-0000-4000-a000-00000000000a'$$,
  '23503', null, 'and their account'
);
select throws_ok(
  $$delete from public.businesses where id = '7d000000-0000-4000-b000-000000000002'$$,
  '23503', null, 'a business with details and periods stays'
);
select private.purge_business_records('7d000000-0000-4000-b000-000000000002');
select lives_ok(
  $$delete from public.businesses where id = '7d000000-0000-4000-b000-000000000002'$$,
  'until the purge takes them with its records'
);
select throws_ok(
  $$delete from public.employment_periods
    where business_id = '7d000000-0000-4000-b000-000000000001'$$,
  '42501', null, 'and after it the purge''s setting is back to what it was'
);

------------------------------------------------------------------------------
-- Coming and going

insert into public.invites (business_id, phone, role, token_hash)
values ('7d000000-0000-4000-b000-000000000001', '+972500003011', 'worker', repeat('7', 64));
select public.claim_invite(repeat('7', 64), '7d000000-0000-4000-a000-000000000014');
select results_eq(
  $$select source, started_on = (now() at time zone 'Asia/Jerusalem')::date, ended_on
    from public.employment_periods
    where business_id = '7d000000-0000-4000-b000-000000000001'
      and user_id = '7d000000-0000-4000-a000-000000000014'$$,
  $$values ('joined'::text, true, null::date)$$,
  'joining from an invite opens a period from today'
);
update public.memberships set active = false
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-000000000014';
select is(
  (select ended_on = (now() at time zone 'Asia/Jerusalem')::date from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-000000000014'),
  true,
  'leaving closes it today'
);
-- As if they had worked three months and left a month ago.
update public.employment_periods
set started_on = (now() at time zone 'Asia/Jerusalem')::date - 90,
  ended_on = (now() at time zone 'Asia/Jerusalem')::date - 30
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-000000000014';
update public.memberships set active = true
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-000000000014';
select results_eq(
  $$select started_on - (now() at time zone 'Asia/Jerusalem')::date,
      ended_on - (now() at time zone 'Asia/Jerusalem')::date
    from public.employment_periods
    where business_id = '7d000000-0000-4000-b000-000000000001'
      and user_id = '7d000000-0000-4000-a000-000000000014'
    order by started_on$$,
  $$values (-90, -30), (0, null::integer)$$,
  'coming back opens a second period, after the first'
);
-- Gone and back on the same day.
update public.memberships set active = false
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-000000000014';
update public.memberships set active = true
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-000000000014';
select is(
  (select count(*)::integer || '/' || (count(*) filter (where ended_on is null))::integer
   from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-000000000014'),
  '2/1',
  'gone and back the same day, the same period goes on'
);
update public.memberships set role = 'accountant'
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-000000000014';
select is(
  (select count(*)::integer from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-000000000014' and ended_on is null),
  0,
  'becoming the accountant closes it'
);
-- c's periods are a holder's.
update public.memberships set active = false
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-00000000000c';
select results_eq(
  $$select started_on, ended_on, source
    from public.employment_periods
    where business_id = '7d000000-0000-4000-b000-000000000001'
      and user_id = '7d000000-0000-4000-a000-00000000000c'
    order by started_on$$,
  $$values ('2025-01-01'::date, '2025-12-31'::date, 'set'::text),
    ('2026-03-01'::date, null::date, 'set'::text)$$,
  'a holder''s period is left alone when someone leaves'
);
update public.memberships set active = true
where business_id = '7d000000-0000-4000-b000-000000000001'
  and user_id = '7d000000-0000-4000-a000-00000000000c';
select is(
  (select count(*)::integer from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000001'
     and user_id = '7d000000-0000-4000-a000-00000000000c'),
  2,
  'and when they come back, nothing new opens over it'
);

------------------------------------------------------------------------------
-- The demo's details

-- o owner, m manager, w, y, r and s workers, x the accountant. y is a minor
-- without a number yet, r rests on Friday, s started on the 10th of three
-- months ago.
insert into private.demo_businesses (business_id, definition)
values ('7d000000-0000-4000-b000-000000000003', $json$
  {
    "slug": "demo-details", "name": "Demo details", "accent": "#7c3aed",
    "address": "Demo street 5", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "details": { "since": "2026-03-01", "numbers": 101, "cases": [
      { "user_id": "7d000000-0000-4000-a000-000000000024", "case": "youth" },
      { "user_id": "7d000000-0000-4000-a000-000000000024", "case": "no_number" },
      { "user_id": "7d000000-0000-4000-a000-000000000025", "case": "rest_friday" },
      { "user_id": "7d000000-0000-4000-a000-000000000026", "case": "started" }
    ] },
    "people": [
      { "user_id": "7d000000-0000-4000-a000-000000000021", "role": "owner", "name": "Owner O" },
      { "user_id": "7d000000-0000-4000-a000-000000000022", "role": "manager", "name": "Manager M" },
      { "user_id": "7d000000-0000-4000-a000-000000000023", "role": "worker", "name": "Worker W" },
      { "user_id": "7d000000-0000-4000-a000-000000000024", "role": "worker", "name": "Worker Y" },
      { "user_id": "7d000000-0000-4000-a000-000000000025", "role": "worker", "name": "Worker R" },
      { "user_id": "7d000000-0000-4000-a000-000000000026", "role": "worker", "name": "Worker S" },
      { "user_id": "7d000000-0000-4000-a000-000000000027", "role": "accountant", "name": "Accountant X" }
    ]
  }
  $json$);

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('7d000000-0000-4000-b000-000000000003')$$,
  'a demo business with details resets'
);
reset role;
select results_eq(
  $$select user_id, payroll_number, rest_day::integer,
      youth_until = (date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '6 months')::date,
      hours_law, updated_by
    from public.member_payroll_details
    where business_id = '7d000000-0000-4000-b000-000000000003'
    order by user_id$$,
  $$values
    ('7d000000-0000-4000-a000-000000000022'::uuid, '101'::text, 6, null::boolean, 'applies'::text,
      '7d000000-0000-4000-a000-000000000021'::uuid),
    ('7d000000-0000-4000-a000-000000000023'::uuid, '102'::text, 6, null::boolean, 'applies'::text,
      '7d000000-0000-4000-a000-000000000021'::uuid),
    ('7d000000-0000-4000-a000-000000000024'::uuid, null::text, 6, true, 'applies'::text,
      '7d000000-0000-4000-a000-000000000021'::uuid),
    ('7d000000-0000-4000-a000-000000000025'::uuid, '104'::text, 5, null::boolean, 'applies'::text,
      '7d000000-0000-4000-a000-000000000021'::uuid),
    ('7d000000-0000-4000-a000-000000000026'::uuid, '105'::text, 6, null::boolean, 'applies'::text,
      '7d000000-0000-4000-a000-000000000021'::uuid)$$,
  'its manager and workers have numbers in order, one a minor still without one, one resting on Friday; nobody outside the Hours law'
);
select results_eq(
  $$select user_id, started_on, source, updated_by
    from public.employment_periods
    where business_id = '7d000000-0000-4000-b000-000000000003'
    order by user_id$$,
  $$values
    ('7d000000-0000-4000-a000-000000000021'::uuid, '2026-03-01'::date, 'joined'::text, null::uuid),
    ('7d000000-0000-4000-a000-000000000022'::uuid, '2026-03-01'::date, 'joined'::text, null::uuid),
    ('7d000000-0000-4000-a000-000000000023'::uuid, '2026-03-01'::date, 'joined'::text, null::uuid),
    ('7d000000-0000-4000-a000-000000000024'::uuid, '2026-03-01'::date, 'joined'::text, null::uuid),
    ('7d000000-0000-4000-a000-000000000025'::uuid, '2026-03-01'::date, 'joined'::text, null::uuid),
    ('7d000000-0000-4000-a000-000000000026'::uuid,
      (date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '3 months')::date + 9,
      'set'::text, '7d000000-0000-4000-a000-000000000021'::uuid)$$,
  'everyone on the staff worked from 1 March as joined, one from the 10th of three months ago as the owner set it; the accountant has no period'
);
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '7d000000-0000-4000-b000-000000000003' and action like 'payroll.%'),
  0,
  'with no log rows: nobody set them today'
);
set local role service_role;
select public.reset_demo_business('7d000000-0000-4000-b000-000000000003');
reset role;
select is(
  (select count(*)::integer from public.member_payroll_details
   where business_id = '7d000000-0000-4000-b000-000000000003')::text
  || '/' || (select count(*)::integer from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000003')::text,
  '5/6',
  'a second reset writes the same again, nothing left from before'
);

------------------------------------------------------------------------------
-- The backfill

-- V's people joined before the periods existed: the trigger is off while
-- they are written, as it was before this migration.
alter table public.memberships disable trigger memberships_track_employment;
insert into public.businesses (id, slug, name)
values ('7d000000-0000-4000-b000-000000000004', 'pd-v', 'Details V');
insert into public.memberships (business_id, user_id, role, active, created_at, updated_at)
values
  ('7d000000-0000-4000-b000-000000000004', '7d000000-0000-4000-a000-0000000000a1', 'worker', true,
    '2026-01-05 10:00+02', '2026-01-05 10:00+02'),
  ('7d000000-0000-4000-b000-000000000004', '7d000000-0000-4000-a000-0000000000a2', 'worker', false,
    '2026-01-05 10:00+02', '2026-06-30 18:00+03'),
  ('7d000000-0000-4000-b000-000000000004', '7d000000-0000-4000-a000-0000000000a3', 'accountant', true,
    '2026-01-05 10:00+02', '2026-01-05 10:00+02');
alter table public.memberships enable trigger memberships_track_employment;
select is(
  (select count(*)::integer from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000004'),
  0,
  'before the backfill they have no periods'
);
select private.backfill_employment_periods();
select results_eq(
  $$select user_id, started_on, ended_on, source
    from public.employment_periods
    where business_id = '7d000000-0000-4000-b000-000000000004'
    order by user_id$$,
  $$values
    ('7d000000-0000-4000-a000-0000000000a1'::uuid, '2026-01-05'::date, null::date, 'joined'::text),
    ('7d000000-0000-4000-a000-0000000000a2'::uuid, '2026-01-05'::date, '2026-06-30'::date, 'joined'::text)$$,
  'the backfill gives each membership on the staff one joined period, from joining, ended when it went inactive'
);
select private.backfill_employment_periods();
select is(
  (select count(*)::integer from public.employment_periods
   where business_id = '7d000000-0000-4000-b000-000000000004'),
  2,
  'and a second run adds nothing'
);

select * from finish();
rollback;
