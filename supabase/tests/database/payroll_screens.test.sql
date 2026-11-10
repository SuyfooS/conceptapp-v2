-- The pay screens (20261110000400_payroll_screens.sql): opening them is logged
-- once a day per pay holder, never for anyone else; a person given pay access
-- is told, and taking it back settles the line; a demo business starts with
-- last month's hours for its staff but the owner, with the cases its
-- definition names, and none for its accountant. Fixed ids; the month is
-- worked out here the way the seed works it out, so nothing depends on the day.
begin;
select plan(43);

insert into auth.users (id, aud, role, phone)
values
  ('7b000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500002801'),
  ('7b000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500002802'),
  ('7b000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500002803'),
  ('7b000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500002804'),
  ('7b000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500002805'),
  ('7b000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500002806'),
  ('7b000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated', '972500002807'),
  ('7b000000-0000-4000-a000-000000000012', 'authenticated', 'authenticated', '972500002808'),
  ('7b000000-0000-4000-a000-000000000013', 'authenticated', 'authenticated', '972500002809'),
  ('7b000000-0000-4000-a000-000000000014', 'authenticated', 'authenticated', '972500002810'),
  ('7b000000-0000-4000-a000-000000000015', 'authenticated', 'authenticated', '972500002811');

-- S: a owner, b manager, c worker, d accountant. h and i are on the
-- ConceptApp team, viewing S as an accountant and as a manager.
insert into public.businesses (id, slug, name)
values ('7b000000-0000-4000-b000-000000000001', 'ps-s', 'Pay screens S');
insert into public.memberships (business_id, user_id, role)
values
  ('7b000000-0000-4000-b000-000000000001', '7b000000-0000-4000-a000-00000000000a', 'owner'),
  ('7b000000-0000-4000-b000-000000000001', '7b000000-0000-4000-a000-00000000000b', 'manager'),
  ('7b000000-0000-4000-b000-000000000001', '7b000000-0000-4000-a000-00000000000c', 'worker'),
  ('7b000000-0000-4000-b000-000000000001', '7b000000-0000-4000-a000-00000000000d', 'accountant');
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('7b000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('7b000000-0000-4000-b000-000000000001', 'notifications', true, '{}');
insert into public.platform_staff (user_id, role)
values
  ('7b000000-0000-4000-a000-00000000000e', 'onboarder'),
  ('7b000000-0000-4000-a000-00000000000f', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('7b000000-0000-4000-a000-00000000000e', '7b000000-0000-4000-b000-000000000001', 'accountant'),
  ('7b000000-0000-4000-a000-00000000000f', '7b000000-0000-4000-b000-000000000001', 'manager');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- How many views of S the log has from this person.
create function pg_temp.views_by(uid uuid) returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.business_id = '7b000000-0000-4000-b000-000000000001'
    and a.action = 'payroll.view' and a.actor_id = uid
$$;

------------------------------------------------------------------------------
-- Who may call what

select ok(
  has_function_privilege('authenticated', 'public.note_payroll_access(uuid, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.note_payroll_access(uuid, date, text)', 'execute'),
  'the screens note a view with the person''s own session, never signed out'
);
select ok(
  not has_function_privilege('authenticated', 'private.notify_for_payroll(public.audit_log)', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_hours(uuid, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_hours(uuid, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_pay(uuid)', 'execute'),
  'payroll''s lines and the demo''s hours run inside the trigger and the reset only'
);

------------------------------------------------------------------------------
-- Opening the pay screens

select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'everything')$$,
  '22023', null, 'a view of an unknown kind is refused'
);
select throws_ok(
  $$select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', null, 'month')$$,
  '22023', null, 'and one of no month'
);
select lives_ok(
  $$select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-15', 'month')$$,
  'the owner opens October'
);
select lives_ok(
  $$select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'person')$$,
  'and then one person''s month'
);
reset role;
select is(pg_temp.views_by('7b000000-0000-4000-a000-00000000000a'), 1, 'which is one view that day');
select is(
  (select details from public.audit_log
   where action = 'payroll.view' and actor_id = '7b000000-0000-4000-a000-00000000000a'),
  '{"month": "2026-10", "kind": "month"}'::jsonb,
  'saying the month and what was opened first'
);

-- A view from the day before doesn't count for today.
insert into public.audit_log (business_id, actor_id, action, details, created_at)
values ('7b000000-0000-4000-b000-000000000001', '7b000000-0000-4000-a000-00000000000d',
  'payroll.view', '{"month": "2026-09", "kind": "month"}', now() - interval '2 days');
select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000d');
select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'month');
reset role;
select is(pg_temp.views_by('7b000000-0000-4000-a000-00000000000d'), 2, 'the accountant''s view today is logged beside an older one');

select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000c');
select lives_ok(
  $$select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'month')$$,
  'a worker without pay access is refused nothing'
);
reset role;
select is(pg_temp.views_by('7b000000-0000-4000-a000-00000000000c'), 0, 'and nothing is written for them');

select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000b');
select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'month');
reset role;
select is(pg_temp.views_by('7b000000-0000-4000-a000-00000000000b'), 0, 'nor for a manager while managers have no pay access');

select public.set_role_permission('7b000000-0000-4000-a000-00000000000a',
  '7b000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true);
select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000b');
select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'access');
reset role;
select is(pg_temp.views_by('7b000000-0000-4000-a000-00000000000b'), 1, 'once the owner gives managers pay access, theirs is');

select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000e');
select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'month');
reset role;
select is(pg_temp.views_by('7b000000-0000-4000-a000-00000000000e'), 1, 'a view as an accountant is logged, as the team''s own');

select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000f');
select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'month');
reset role;
select is(pg_temp.views_by('7b000000-0000-4000-a000-00000000000f'), 0, 'a view as a manager reads no pay, so it writes none');

set local role anon;
select throws_ok(
  $$select public.note_payroll_access('7b000000-0000-4000-b000-000000000001', '2026-10-01', 'month')$$,
  '42501', null, 'signed out, nothing is noted'
);
reset role;

-- The views are pay rows: the worker, who reads no log, and a manager without
-- pay access don't see them; the owner does.
select public.set_role_permission('7b000000-0000-4000-a000-00000000000a',
  '7b000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', false);
select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::integer from public.audit_log where action = 'payroll.view'),
  0,
  'a manager without pay access reads no views'
);
reset role;
select pg_temp.sign_in('7b000000-0000-4000-a000-00000000000a');
select ok(
  (select count(*)::integer from public.audit_log where action = 'payroll.view') >= 4,
  'the owner reads every one'
);
reset role;

------------------------------------------------------------------------------
-- The line a person given pay access gets

select public.set_member_permission('7b000000-0000-4000-a000-00000000000a',
  '7b000000-0000-4000-b000-000000000001', '7b000000-0000-4000-a000-00000000000c',
  'clock.payroll', true);
select results_eq(
  $$select kind, actor_id, source_module::text, read_at is null, resolved_at is null
    from public.notifications
    where business_id = '7b000000-0000-4000-b000-000000000001'
      and user_id = '7b000000-0000-4000-a000-00000000000c'$$,
  $$values ('access.pay_granted'::text, '7b000000-0000-4000-a000-00000000000a'::uuid,
    'time_clock'::text, true, true)$$,
  'a worker given pay access is told, by the owner'
);
select is(
  (select params from public.notifications
   where user_id = '7b000000-0000-4000-a000-00000000000c' and kind = 'access.pay_granted'),
  '{}'::jsonb,
  'with nothing in the line but that'
);
select public.set_member_permission('7b000000-0000-4000-a000-00000000000a',
  '7b000000-0000-4000-b000-000000000001', '7b000000-0000-4000-a000-00000000000c',
  'clock.payroll', false);
select isnt(
  (select resolved_at from public.notifications
   where user_id = '7b000000-0000-4000-a000-00000000000c' and kind = 'access.pay_granted'),
  null,
  'taking it back settles the line'
);
select public.set_member_permission('7b000000-0000-4000-a000-00000000000a',
  '7b000000-0000-4000-b000-000000000001', '7b000000-0000-4000-a000-00000000000c',
  'clock.payroll', true);
select results_eq(
  $$select count(*)::integer, bool_and(resolved_at is null and read_at is null)
    from public.notifications
    where user_id = '7b000000-0000-4000-a000-00000000000c' and kind = 'access.pay_granted'$$,
  $$values (1, true)$$,
  'and giving it again brings the same line back, unread'
);
select public.set_role_permission('7b000000-0000-4000-a000-00000000000a',
  '7b000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true);
select is(
  (select count(*)::integer from public.notifications
   where business_id = '7b000000-0000-4000-b000-000000000001'
     and user_id = '7b000000-0000-4000-a000-00000000000b'),
  0,
  'a role''s grant tells nobody'
);

------------------------------------------------------------------------------
-- The demo's hours

-- o owner, m manager, w and v workers, x the accountant. m works the night,
-- w the late Friday and the correction, v the Saturday night, the code it
-- went without and the evening.
insert into private.demo_businesses (business_id, definition)
values ('7b000000-0000-4000-b000-000000000002', $json$
  {
    "slug": "demo-pay-hours", "name": "Demo pay hours", "accent": "#7c3aed",
    "address": "Demo street 3", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "hours": { "fridays": true, "cases": [
      { "user_id": "7b000000-0000-4000-a000-000000000012", "case": "night" },
      { "user_id": "7b000000-0000-4000-a000-000000000013", "case": "friday_late" },
      { "user_id": "7b000000-0000-4000-a000-000000000013", "case": "corrected", "note": "Forgot to leave" },
      { "user_id": "7b000000-0000-4000-a000-000000000014", "case": "saturday_night" },
      { "user_id": "7b000000-0000-4000-a000-000000000014", "case": "without_code" },
      { "user_id": "7b000000-0000-4000-a000-000000000014", "case": "evening" },
      { "user_id": "7b000000-0000-4000-a000-0000000000ff", "case": "evening" }
    ] },
    "people": [
      { "user_id": "7b000000-0000-4000-a000-000000000011", "role": "owner", "name": "Owner O" },
      { "user_id": "7b000000-0000-4000-a000-000000000012", "role": "manager", "name": "Manager M" },
      { "user_id": "7b000000-0000-4000-a000-000000000013", "role": "worker", "name": "Worker W" },
      { "user_id": "7b000000-0000-4000-a000-000000000014", "role": "worker", "name": "Worker V" },
      { "user_id": "7b000000-0000-4000-a000-000000000015", "role": "accountant", "name": "Accountant X" }
    ]
  }
  $json$);

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('7b000000-0000-4000-b000-000000000002')$$,
  'a demo business with hours resets'
);
reset role;

-- Its entries as its own clock reads them.
create temporary view demo_hours as
  select e.*, (e.clock_in at time zone b.timezone) as local_in,
    (e.clock_out at time zone b.timezone) as local_out,
    date_trunc('month', now() at time zone b.timezone)::date as this_month
  from public.time_entries e
  join public.businesses b on b.id = e.business_id
  where e.business_id = '7b000000-0000-4000-b000-000000000002';

select results_eq(
  $$select user_id from demo_hours group by user_id order by user_id$$,
  $$values ('7b000000-0000-4000-a000-000000000012'::uuid),
    ('7b000000-0000-4000-a000-000000000013'::uuid),
    ('7b000000-0000-4000-a000-000000000014'::uuid)$$,
  'its manager and workers have hours, its owner and its accountant none'
);
select is(
  (select count(*)::integer from demo_hours
   where local_in::date >= this_month or local_in::date < (this_month - interval '1 month')::date),
  0,
  'all of them last month, by the business''s clock'
);
select is(
  (select count(*)::integer from demo_hours where clock_out is null),
  0,
  'and none left open'
);
select is(
  (select count(*)::integer from demo_hours where source <> 'punch'),
  0,
  'each one punched'
);
select ok(
  (select count(*) from demo_hours where user_id = '7b000000-0000-4000-a000-000000000013'
     and extract(dow from local_in) = 5) > 0
  and (select count(*) from demo_hours where user_id = '7b000000-0000-4000-a000-000000000012'
     and extract(dow from local_in) = 5) = 0,
  'workers work Fridays, the manager doesn''t'
);
select is(
  (select count(*)::integer from demo_hours where user_id = '7b000000-0000-4000-a000-000000000012'
     and extract(dow from local_in) = 0),
  0,
  'each takes a weekday off by their place: the manager Sundays'
);
select results_eq(
  $$select to_char(local_in, 'Dy HH24:MI'), to_char(local_out, 'Dy HH24:MI')
    from demo_hours where user_id = '7b000000-0000-4000-a000-000000000012'
      and local_out::date > local_in::date$$,
  $$values ('Thu 22:00'::text, 'Fri 06:30'::text)$$,
  'the manager''s one night, on the month''s last Thursday'
);
select is(
  (select max(local_in::date) from demo_hours where user_id = '7b000000-0000-4000-a000-000000000012'
     and extract(dow from local_in) = 4),
  (select max(d)::date from generate_series(
     (date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '1 month'),
     (date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '1 day'),
     interval '1 day') d where extract(dow from d) = 4),
  'which is the last Thursday of the month'
);
select results_eq(
  $$select to_char(local_in, 'HH24:MI'), to_char(local_out, 'HH24:MI')
    from demo_hours where user_id = '7b000000-0000-4000-a000-000000000013'
      and local_in::date = (select max(local_in::date) from demo_hours
        where extract(dow from local_in) = 5)$$,
  $$values ('12:00'::text, '21:00'::text)$$,
  'the late Friday, past candle lighting, in place of the usual one'
);
select results_eq(
  $$select to_char(local_in, 'Dy HH24:MI'), to_char(local_out, 'Dy HH24:MI')
    from demo_hours where user_id = '7b000000-0000-4000-a000-000000000014'
      and extract(dow from local_in) = 6$$,
  $$values ('Sat 20:00'::text, 'Sun 01:00'::text)$$,
  'the Saturday night'
);
select results_eq(
  $$select in_proof, confirmed_at is null, to_char(local_in, 'Dy HH24:MI')
    from demo_hours where in_proof is distinct from 'off'$$,
  $$values ('none'::text, true, 'Wed 09:00'::text)$$,
  'one clocked in without a code, still waiting'
);
select results_eq(
  $$select to_char(local_in, 'Dy HH24:MI'), to_char(local_out, 'HH24:MI')
    from demo_hours where user_id = '7b000000-0000-4000-a000-000000000014'
      and extract(dow from local_in) = 2$$,
  $$values ('Tue 18:00'::text, '22:30'::text)$$,
  'the evening, the one Tuesday of someone whose day off it is'
);
select results_eq(
  $$select h.note, h.edited_by, h.out_proof, to_char(h.local_in, 'Dy HH24:MI'),
      a.actor_id, a.details ->> 'note', a.details #>> '{from,clock_out}', a.created_at = h.edited_at
    from demo_hours h
    join public.audit_log a on a.action = 'clock.correct' and (a.details ->> 'entry')::uuid = h.id
    where h.edited_by is not null$$,
  $$values ('Forgot to leave'::text, '7b000000-0000-4000-a000-000000000012'::uuid, 'manager'::text,
    'Mon 09:00'::text, '7b000000-0000-4000-a000-000000000012'::uuid, 'Forgot to leave'::text,
    null::text, true)$$,
  'one corrected by the manager, with its reason and its row in the log'
);
select is(
  (select count(*)::integer from demo_hours where user_id = '7b000000-0000-4000-a000-000000000013'
     and extract(dow from local_in) = 1),
  1,
  'which is the only Monday of someone whose day off it is'
);
select is(
  (select count(*)::integer from demo_hours h
   where to_char(h.local_in, 'HH24:MI') = '09:00' and to_char(h.local_out, 'HH24:MI') = '17:00'
     and (select count(*) from public.time_breaks t
          where t.entry_id = h.id
            and to_char(t.started_at at time zone 'Asia/Jerusalem', 'HH24:MI') = '13:00'
            and to_char(t.ended_at at time zone 'Asia/Jerusalem', 'HH24:MI') = '13:30'
            and t.unpaid = coalesce((select (m.settings ->> 'unpaidBreaks')::boolean
              from public.business_modules m
              where m.business_id = h.business_id and m.module_key = 'time_clock'), false)) <> 1),
  0,
  'every usual weekday has its half-hour break, unpaid as the business''s breaks are'
);
select is(
  (select count(*)::integer from public.memberships
   where business_id = '7b000000-0000-4000-b000-000000000002'
     and user_id = '7b000000-0000-4000-a000-000000000015' and role = 'accountant' and active),
  1,
  'the accountant is in the business, with no hours of their own'
);

-- Again, from the start.
create temporary table first_count as select count(*) as n from demo_hours;
set local role service_role;
select public.reset_demo_business('7b000000-0000-4000-b000-000000000002');
reset role;
select is(
  (select count(*) from demo_hours),
  (select n from first_count),
  'a second reset writes the same hours again, nothing left from before'
);

-- A plan that makes no sense writes no hours, and the reset still stands.
update private.demo_businesses
set definition = definition || '{"hours": {"fridays": true, "cases": [
  {"user_id": "7b000000-0000-4000-a000-000000000013", "case": "evening"},
  {"user_id": "7b000000-0000-4000-a000-000000000013", "case": "evening"}
]}}'::jsonb
where business_id = '7b000000-0000-4000-b000-000000000002';
set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('7b000000-0000-4000-b000-000000000002')$$,
  'a plan whose shifts would overlap still lets the reset through'
);
reset role;
select is((select count(*)::integer from demo_hours), 0, 'with no hours at all');

select * from finish();
rollback;
