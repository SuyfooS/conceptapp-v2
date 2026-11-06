-- Breaks on the time clock: only the server writes. A person on the clock goes
-- on a break and comes back; a break keeps what the business's setting said
-- when it began; leaving ends an open break, and a manager's correction keeps
-- breaks inside the entry. A person can take back leaving for two minutes. No
-- punch code is asked for unless the business turned it on. People read their
-- own breaks, managers the business's, other businesses nothing. Every call
-- passes the time so the test does not depend on today.
begin;
select plan(35);

insert into auth.users (id, aud, role, phone)
values
  ('69000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000911'),
  ('69000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000912'),
  ('69000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000913'),
  ('69000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000914'),
  ('69000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000915');

-- a: owner of X; b: manager of X; c: worker of X; d: another worker of X;
-- e: manager of Y.
insert into public.businesses (id, slug, name)
values
  ('69000000-0000-4000-b000-000000000001', 'tb-x', 'Breaks X'),
  ('69000000-0000-4000-b000-000000000002', 'tb-y', 'Breaks Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('69000000-0000-4000-b000-000000000001', '69000000-0000-4000-a000-00000000000a', 'owner', true),
  ('69000000-0000-4000-b000-000000000001', '69000000-0000-4000-a000-00000000000b', 'manager', true),
  ('69000000-0000-4000-b000-000000000001', '69000000-0000-4000-a000-00000000000c', 'worker', true),
  ('69000000-0000-4000-b000-000000000001', '69000000-0000-4000-a000-00000000000d', 'worker', true),
  ('69000000-0000-4000-b000-000000000002', '69000000-0000-4000-a000-00000000000e', 'manager', true);

-- Nothing set: no code asked for, and breaks stay in the hours.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('69000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('69000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to service_role, authenticated;

-- Nobody but the server writes.
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000c');
select throws_ok(
  $$select public.start_break('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', '2026-11-10 08:00+00')$$,
  '42501', null, 'a signed-in worker cannot start a break through the function'
);
select throws_ok(
  $$select public.set_clock_settings('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', true)$$,
  '42501', null, 'a signed-in worker cannot change settings through the function'
);
select throws_ok(
  $$insert into public.time_breaks (entry_id, business_id, user_id, started_at, unpaid)
    values (gen_random_uuid(), '69000000-0000-4000-b000-000000000001',
      '69000000-0000-4000-a000-00000000000c', now(), false)$$,
  '42501', null, 'a signed-in worker cannot write a break'
);
reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.time_breaks',
  '42501', null, 'an anonymous visitor cannot read breaks'
);
reset role;

set local role service_role;

-- Going on a break.
select throws_ok(
  $$select public.start_break('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', '2026-11-10 08:00+00')$$,
  '55000', 'Not clocked in', 'someone not clocked in cannot go on a break'
);
select throws_ok(
  $$select public.end_break('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', '2026-11-10 08:00+00')$$,
  '55000', 'Not on a break', 'someone not on a break cannot come back'
);
select throws_ok(
  $$select public.start_break('69000000-0000-4000-a000-00000000000e',
    '69000000-0000-4000-b000-000000000001', '2026-11-10 08:00+00')$$,
  '42501', null, 'a member of Y cannot go on a break in X'
);

insert into ids
select 'c1', public.clock_in('69000000-0000-4000-a000-00000000000c',
  '69000000-0000-4000-b000-000000000001', null, '2026-11-10 06:00+00');
select isnt(
  (select id from ids where name = 'c1'), null,
  'clocking in needs no code unless the business turned it on'
);

select throws_ok(
  $$select public.start_break('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', '2026-11-10 05:00+00')$$,
  '22023', null, 'a break cannot start before the entry'
);

insert into ids
select 'b1', public.start_break('69000000-0000-4000-a000-00000000000c',
  '69000000-0000-4000-b000-000000000001', '2026-11-10 09:00+00');
select is(
  (select unpaid from public.time_breaks where id = (select id from ids where name = 'b1')),
  false,
  'with nothing set, a break stays in the hours'
);
select throws_ok(
  $$select public.start_break('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', '2026-11-10 09:05+00')$$,
  '23P01', 'Already on a break', 'two breaks cannot be open at once'
);
select throws_ok(
  $$select public.end_break('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', '2026-11-10 08:59+00')$$,
  '22023', null, 'a break cannot end before it starts'
);
select is(
  public.end_break('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', '2026-11-10 09:30+00'),
  (select id from ids where name = 'b1'),
  'coming back ends the break'
);
select is(
  (select ended_at from public.time_breaks where id = (select id from ids where name = 'b1')),
  '2026-11-10 09:30+00'::timestamptz,
  'the break ends when they came back'
);

-- The setting.
select throws_ok(
  $$select public.set_clock_settings('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', true)$$,
  '42501', 'Managers and owners only', 'a worker cannot change the setting'
);
select throws_ok(
  $$select public.set_clock_settings('69000000-0000-4000-a000-00000000000e',
    '69000000-0000-4000-b000-000000000001', true)$$,
  '42501', 'Managers and owners only', 'a manager of Y cannot change X''s setting'
);
select lives_ok(
  $$select public.set_clock_settings('69000000-0000-4000-a000-00000000000b',
    '69000000-0000-4000-b000-000000000001', true)$$,
  'a manager chooses that breaks come off the hours'
);
select is(
  (select settings from public.business_modules
    where business_id = '69000000-0000-4000-b000-000000000001' and module_key = 'time_clock'),
  '{"unpaidBreaks": true}'::jsonb,
  'the setting is stored with the module'
);
select is(
  (select unpaid from public.time_breaks where id = (select id from ids where name = 'b1')),
  false,
  'a break already taken keeps what it was'
);

-- Leaving ends an open break, and it can be taken back.
insert into ids
select 'b2', public.start_break('69000000-0000-4000-a000-00000000000c',
  '69000000-0000-4000-b000-000000000001', '2026-11-10 13:00+00');
select is(
  (select unpaid from public.time_breaks where id = (select id from ids where name = 'b2')),
  true,
  'a new break follows the new setting'
);
select is(
  public.clock_out('69000000-0000-4000-a000-00000000000c',
    '69000000-0000-4000-b000-000000000001', null, '2026-11-10 14:00+00'),
  (select id from ids where name = 'c1'),
  'someone on a break can leave'
);
select is(
  (select ended_at from public.time_breaks where id = (select id from ids where name = 'b2')),
  '2026-11-10 14:00+00'::timestamptz,
  'leaving ends the open break'
);
select throws_ok(
  format($$select public.undo_clock_out('69000000-0000-4000-a000-00000000000d', %L, '2026-11-10 14:01+00')$$,
    (select id from ids where name = 'c1')),
  'P0002', null, 'someone else cannot take back leaving'
);
select throws_ok(
  format($$select public.undo_clock_out('69000000-0000-4000-a000-00000000000c', %L, '2026-11-10 14:03+00')$$,
    (select id from ids where name = 'c1')),
  '55000', 'Too late to take it back', 'taking it back has a time limit'
);
select lives_ok(
  format($$select public.undo_clock_out('69000000-0000-4000-a000-00000000000c', %L, '2026-11-10 14:01+00')$$,
    (select id from ids where name = 'c1')),
  'a person takes back leaving right after'
);
select is(
  (select clock_out from public.time_entries where id = (select id from ids where name = 'c1')),
  null,
  'the entry is open again'
);

-- A correction keeps breaks inside the entry.
select public.correct_time_entry('69000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'c1'),
  '2026-11-10 06:00+00', '2026-11-10 13:30+00', null, '2026-11-10 20:00+00');
select is(
  (select ended_at from public.time_breaks where id = (select id from ids where name = 'b2')),
  '2026-11-10 13:30+00'::timestamptz,
  'an earlier end cuts a break to fit'
);
select public.correct_time_entry('69000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'c1'),
  '2026-11-10 06:00+00', '2026-11-10 12:00+00', null, '2026-11-10 20:01+00');
select is(
  (select count(*)::int from public.time_breaks where id = (select id from ids where name = 'b2')),
  0,
  'a break wholly outside the entry goes'
);
select throws_ok(
  format($$select public.undo_clock_out('69000000-0000-4000-a000-00000000000c', %L, '2026-11-10 12:01+00')$$,
    (select id from ids where name = 'c1')),
  '55000', 'Too late to take it back', 'an entry a manager changed cannot be taken back'
);

-- Everything goes to the audit log.
select is(
  (select array_agg(distinct action order by action) from public.audit_log
    where business_id = '69000000-0000-4000-b000-000000000001'
      and action in ('clock.break_start', 'clock.break_end', 'clock.undo_out', 'clock.settings')),
  array['clock.break_end', 'clock.break_start', 'clock.settings', 'clock.undo_out'],
  'breaks, settings and taking back are in the audit log'
);
reset role;

-- Who reads what.
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000c');
select is(
  (select count(*)::int from public.time_breaks),
  1,
  'a worker reads their own breaks'
);
reset role;
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000d');
select is(
  (select count(*)::int from public.time_breaks),
  0,
  'another worker does not read them'
);
reset role;
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::int from public.time_breaks),
  1,
  'a manager reads the business''s'
);
reset role;
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000e');
select is(
  (select count(*)::int from public.time_breaks),
  0,
  'a manager of Y reads nothing of X'
);
reset role;

select * from finish();
rollback;
