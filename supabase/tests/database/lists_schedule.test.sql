-- Lists' times (20261110001300_list_schedules.sql): private.lists_tick at
-- times the test chooses opens each day's list once, to whoever it is for or
-- to the managers when nobody is there, reminds once, marks late once, closes
-- as missed what nobody did but never a list opened again by hand, follows
-- published shifts, the clock changes and Shabbat; public.next_list_openings
-- says what it then opens; a time changed after its own hour opens nothing
-- until its next one; set_list_item tells the managers of a reading outside
-- its range; and the demo reset ticks only where its definition lets it.
-- Fixed ids of their own and explicit times; the times are put straight into
-- list_schedules so the moment they count from (opens_from) is known. Only
-- the times saved through the functions count from now(), so their part
-- reads the clock the way the functions do.
begin;
select plan(83);

insert into auth.users (id, aud, role, phone)
values
  ('81000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500002801'),
  ('81000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500002802'),
  ('81000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500002803'),
  ('81000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500002804'),
  ('81000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500002805');

-- S: closed on Shabbat (its schedule on, the default), in Tel Aviv. O: open on
-- Shabbat, in Jerusalem. F: a lists setting it can't read, so it fails. Z:
-- for the clock changes, with no schedule and a city no list has.
insert into public.businesses (id, slug, name, shabbat_city)
values
  ('81000000-0000-4000-b000-000000000001', 'schedule-s', 'Schedule S', 'telAviv'),
  ('81000000-0000-4000-b000-000000000002', 'schedule-o', 'Schedule O', 'jerusalem'),
  ('81000000-0000-4000-b000-000000000003', 'schedule-f', 'Schedule F', null),
  ('81000000-0000-4000-b000-000000000004', 'schedule-z', 'Schedule Z', 'atlantis');

-- S: 1 owner, 2 manager, 3 worker (kitchen), 4 worker (on the evening and
-- night shifts), 5 worker who left.
insert into public.memberships (business_id, user_id, role, active)
values
  ('81000000-0000-4000-b000-000000000001', '81000000-0000-4000-a000-000000000001', 'owner', true),
  ('81000000-0000-4000-b000-000000000001', '81000000-0000-4000-a000-000000000002', 'manager', true),
  ('81000000-0000-4000-b000-000000000001', '81000000-0000-4000-a000-000000000003', 'worker', true),
  ('81000000-0000-4000-b000-000000000001', '81000000-0000-4000-a000-000000000004', 'worker', true),
  ('81000000-0000-4000-b000-000000000001', '81000000-0000-4000-a000-000000000005', 'worker', false),
  ('81000000-0000-4000-b000-000000000002', '81000000-0000-4000-a000-000000000001', 'owner', true),
  ('81000000-0000-4000-b000-000000000003', '81000000-0000-4000-a000-000000000001', 'owner', true),
  ('81000000-0000-4000-b000-000000000004', '81000000-0000-4000-a000-000000000001', 'owner', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('81000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('81000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('81000000-0000-4000-b000-000000000001', 'scheduling', true,
    '{"shifts": [{"key": "evening"}, {"key": "night"}, {"key": "short"}]}'),
  ('81000000-0000-4000-b000-000000000002', 'lists', true, '{}'),
  ('81000000-0000-4000-b000-000000000002', 'scheduling', true, '{"closedOnShabbat": false}'),
  ('81000000-0000-4000-b000-000000000003', 'lists', true, '{"remindBeforeMinutes": "soon"}'),
  ('81000000-0000-4000-b000-000000000004', 'lists', true, '{}');

insert into public.departments (id, business_id, key, name)
values ('81000000-0000-4000-d000-000000000001', '81000000-0000-4000-b000-000000000001', 'kitchen', 'Kitchen');
insert into public.department_members (department_id, business_id, user_id)
values ('81000000-0000-4000-d000-000000000001', '81000000-0000-4000-b000-000000000001',
  '81000000-0000-4000-a000-000000000003');

-- A published week with the evening on Monday (4 on it) and Tuesday (nobody,
-- ending after midnight), the night shift starting just after midnight on
-- Wednesday (4), and a short Friday ending at candle lighting; a week not
-- published with an evening too.
insert into public.schedule_weeks (id, business_id, starts_on, availability_due_at, schedule_published_at)
values
  ('81000000-0000-4000-f000-000000000001', '81000000-0000-4000-b000-000000000001',
    '2026-11-15', '2026-11-12 16:00+00', '2026-11-13 10:00+00'),
  ('81000000-0000-4000-f000-000000000002', '81000000-0000-4000-b000-000000000001',
    '2026-11-22', '2026-11-19 16:00+00', null);
insert into public.schedule_shifts (id, business_id, week_id, day, pattern_key, name, starts_at, ends_at, needed)
values
  ('81000000-0000-4000-f000-000000000011', '81000000-0000-4000-b000-000000000001',
    '81000000-0000-4000-f000-000000000001', '2026-11-16', 'evening', 'Evening', '16:00', '23:30', 1),
  ('81000000-0000-4000-f000-000000000012', '81000000-0000-4000-b000-000000000001',
    '81000000-0000-4000-f000-000000000001', '2026-11-17', 'evening', 'Evening', '18:00', '01:00', 1),
  ('81000000-0000-4000-f000-000000000013', '81000000-0000-4000-b000-000000000001',
    '81000000-0000-4000-f000-000000000001', '2026-11-18', 'night', 'Night', '00:15', '08:00', 1),
  ('81000000-0000-4000-f000-000000000014', '81000000-0000-4000-b000-000000000001',
    '81000000-0000-4000-f000-000000000002', '2026-11-23', 'evening', 'Evening', '16:00', '23:30', 1),
  ('81000000-0000-4000-f000-000000000015', '81000000-0000-4000-b000-000000000001',
    '81000000-0000-4000-f000-000000000001', '2026-11-20', 'short', 'Short', '09:00', '16:18', 1);
insert into public.shift_assignments (shift_id, business_id, user_id)
values
  ('81000000-0000-4000-f000-000000000011', '81000000-0000-4000-b000-000000000001',
    '81000000-0000-4000-a000-000000000004'),
  ('81000000-0000-4000-f000-000000000013', '81000000-0000-4000-b000-000000000001',
    '81000000-0000-4000-a000-000000000004');

-- Templates: the kitchen's opening (a fridge reading, a check), the weekly
-- cleaning, the evening's, a list for someone who left, one removed, Shabbat's
-- three, O's Friday one, Z's two, F's.
insert into public.list_templates (id, business_id, name, archived_at)
values
  ('81000000-0000-4000-c000-000000000001', '81000000-0000-4000-b000-000000000001', 'Kitchen opening', null),
  ('81000000-0000-4000-c000-000000000002', '81000000-0000-4000-b000-000000000001', 'Weekly cleaning', null),
  ('81000000-0000-4000-c000-000000000003', '81000000-0000-4000-b000-000000000001', 'Evening', null),
  ('81000000-0000-4000-c000-000000000004', '81000000-0000-4000-b000-000000000001', 'For someone', null),
  ('81000000-0000-4000-c000-000000000005', '81000000-0000-4000-b000-000000000001', 'Removed', '2026-11-01 00:00+00'),
  ('81000000-0000-4000-c000-000000000006', '81000000-0000-4000-b000-000000000001', 'Before Shabbat', null),
  ('81000000-0000-4000-c000-000000000007', '81000000-0000-4000-b000-000000000002', 'Friday evening', null),
  ('81000000-0000-4000-c000-000000000008', '81000000-0000-4000-b000-000000000004', 'Night', null),
  ('81000000-0000-4000-c000-000000000009', '81000000-0000-4000-b000-000000000003', 'Failing', null);
insert into public.list_template_items (id, template_id, business_id, position, kind, label, unit, min_value, max_value)
values
  ('81000000-0000-4000-c000-000000000101', '81000000-0000-4000-c000-000000000001',
    '81000000-0000-4000-b000-000000000001', 0, 'number', 'Fridge', '°C', 0, 5),
  ('81000000-0000-4000-c000-000000000102', '81000000-0000-4000-c000-000000000001',
    '81000000-0000-4000-b000-000000000001', 1, 'check', 'Surfaces', null, null, null);
insert into public.list_template_items (template_id, business_id, position, kind, label)
select t.id, t.business_id, 0, 'check', 'Done'
from public.list_templates t
where t.id <> '81000000-0000-4000-c000-000000000001'
  and t.id::text like '81000000-0000-4000-c000-%';

-- The times, all counting from 1 November unless they say otherwise.
insert into public.list_schedules (
  id, template_id, business_id, position, days, anchor, shift_key, opens_offset, due_offset,
  recipient_kind, recipient_user, recipient_department, recipient_shift, recipient_role,
  active, starts_on, opens_from
)
values
  -- K: Sunday to Thursday at 08:30, 45 minutes, to the kitchen.
  ('81000000-0000-4000-e000-000000000001', '81000000-0000-4000-c000-000000000001',
    '81000000-0000-4000-b000-000000000001', 0, '{0,1,2,3,4}', 'day', null, 510, 555,
    'department', null, '81000000-0000-4000-d000-000000000001', null, null,
    true, '2026-11-01', '2026-11-01 00:00+00'),
  -- X: the same template, paused.
  ('81000000-0000-4000-e000-000000000002', '81000000-0000-4000-c000-000000000001',
    '81000000-0000-4000-b000-000000000001', 1, '{0,1,2,3,4,5,6}', 'day', null, 420, 480,
    'role', null, null, null, 'worker', false, '2026-11-01', '2026-11-01 00:00+00'),
  -- N: the same template every day at 08:30, saved on Monday at 10:00 Israel time.
  ('81000000-0000-4000-e000-000000000003', '81000000-0000-4000-c000-000000000001',
    '81000000-0000-4000-b000-000000000001', 2, '{0,1,2,3,4,5,6}', 'day', null, 510, 555,
    'role', null, null, null, 'worker', true, '2026-11-16', '2026-11-16 08:00+00'),
  -- W: Sunday at 15:00, two hours, to the workers.
  ('81000000-0000-4000-e000-000000000004', '81000000-0000-4000-c000-000000000002',
    '81000000-0000-4000-b000-000000000001', 0, '{0}', 'day', null, 900, 1020,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  -- E: half an hour before each evening shift starts, to its people.
  ('81000000-0000-4000-e000-000000000005', '81000000-0000-4000-c000-000000000003',
    '81000000-0000-4000-b000-000000000001', 0, '{0,1,2,3,4,5,6}', 'shift_start', 'evening', -30, 60,
    'shift', null, null, 'evening', null, true, '2026-11-01', '2026-11-01 00:00+00'),
  -- EE: half an hour before each evening shift ends.
  ('81000000-0000-4000-e000-000000000006', '81000000-0000-4000-c000-000000000003',
    '81000000-0000-4000-b000-000000000001', 1, '{0,1,2,3,4,5,6}', 'shift_end', 'evening', -30, 0,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  -- NI: an hour before the night shift, the evening before it.
  ('81000000-0000-4000-e000-000000000007', '81000000-0000-4000-c000-000000000003',
    '81000000-0000-4000-b000-000000000001', 2, '{0,1,2,3,4,5,6}', 'shift_start', 'night', -60, 0,
    'shift', null, null, 'night', null, true, '2026-11-01', '2026-11-01 00:00+00'),
  -- P: Monday at 10:00 to someone who left.
  ('81000000-0000-4000-e000-000000000008', '81000000-0000-4000-c000-000000000004',
    '81000000-0000-4000-b000-000000000001', 0, '{1}', 'day', null, 600, 660,
    'person', '81000000-0000-4000-a000-000000000005', null, null, null,
    true, '2026-11-01', '2026-11-01 00:00+00'),
  -- R: Monday at 12:00, due a quarter of an hour later: inside its reminder.
  ('81000000-0000-4000-e000-000000000009', '81000000-0000-4000-c000-000000000004',
    '81000000-0000-4000-b000-000000000001', 1, '{1}', 'day', null, 720, 735,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  -- A: a removed template's.
  ('81000000-0000-4000-e000-000000000010', '81000000-0000-4000-c000-000000000005',
    '81000000-0000-4000-b000-000000000001', 0, '{0,1,2,3,4,5,6}', 'day', null, 420, 480,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  -- F1: Friday at 17:00, after candle lighting. F2: Friday at 15:30, due at
  -- 17:00. F3: Saturday at 10:00, an hour.
  ('81000000-0000-4000-e000-000000000011', '81000000-0000-4000-c000-000000000006',
    '81000000-0000-4000-b000-000000000001', 0, '{5}', 'day', null, 1020, 1080,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  ('81000000-0000-4000-e000-000000000012', '81000000-0000-4000-c000-000000000006',
    '81000000-0000-4000-b000-000000000001', 1, '{5}', 'day', null, 930, 1020,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  ('81000000-0000-4000-e000-000000000013', '81000000-0000-4000-c000-000000000006',
    '81000000-0000-4000-b000-000000000001', 2, '{6}', 'day', null, 600, 660,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  -- O: Friday at 17:00, in a business open on Shabbat.
  ('81000000-0000-4000-e000-000000000014', '81000000-0000-4000-c000-000000000007',
    '81000000-0000-4000-b000-000000000002', 0, '{5}', 'day', null, 1020, 1080,
    'role', null, null, null, 'owner', true, '2026-11-01', '2026-11-01 00:00+00'),
  -- Z1: every day at 01:30, half an hour. Z2: Friday at 02:30, half an hour.
  ('81000000-0000-4000-e000-000000000015', '81000000-0000-4000-c000-000000000008',
    '81000000-0000-4000-b000-000000000004', 0, '{0,1,2,3,4,5,6}', 'day', null, 90, 120,
    'role', null, null, null, 'owner', true, '2026-10-01', '2026-10-01 00:00+00'),
  ('81000000-0000-4000-e000-000000000016', '81000000-0000-4000-c000-000000000008',
    '81000000-0000-4000-b000-000000000004', 1, '{5}', 'day', null, 150, 180,
    'role', null, null, null, 'owner', true, '2027-03-01', '2027-03-01 00:00+00'),
  -- FA: F's every day at 08:30.
  ('81000000-0000-4000-e000-000000000017', '81000000-0000-4000-c000-000000000009',
    '81000000-0000-4000-b000-000000000003', 0, '{0,1,2,3,4,5,6}', 'day', null, 510, 555,
    'role', null, null, null, 'owner', true, '2026-11-01', '2026-11-01 00:00+00'),
  -- SF: at the end of Friday's short shift, half an hour. SG: half an hour
  -- before its end, an hour.
  ('81000000-0000-4000-e000-000000000018', '81000000-0000-4000-c000-000000000006',
    '81000000-0000-4000-b000-000000000001', 3, '{5}', 'shift_end', 'short', 0, 30,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  ('81000000-0000-4000-e000-000000000019', '81000000-0000-4000-c000-000000000006',
    '81000000-0000-4000-b000-000000000001', 4, '{5}', 'shift_end', 'short', -30, 30,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00');

-- A schedule's list of a day, and how many it has.
create function pg_temp.list_of(sched text, on_day date) returns uuid language sql as $$
  select l.id from public.lists l
  where l.schedule_id = ('81000000-0000-4000-e000-0000000000' || sched)::uuid
    and l.occurs_on = on_day
$$;
create function pg_temp.lists_of(sched text) returns integer language sql as $$
  select count(*)::integer from public.lists l
  where l.schedule_id = ('81000000-0000-4000-e000-0000000000' || sched)::uuid
$$;
create function pg_temp.tick(at_time timestamptz) returns integer language sql as $$
  select private.lists_tick(at_time, '81000000-0000-4000-b000-000000000001')
$$;
create function pg_temp.logged(what text, list uuid) returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.action = what and a.details ->> 'list' = list::text
$$;
create function pg_temp.lines(what text, person text) returns integer language sql as $$
  select count(*)::integer from public.notifications n
  where n.kind = what
    and n.business_id = '81000000-0000-4000-b000-000000000001'
    and n.user_id = ('81000000-0000-4000-a000-00000000000' || person)::uuid
$$;

------------------------------------------------------------------------------
-- Who may run it

select ok(
  not has_function_privilege('authenticated', 'private.lists_tick(timestamptz, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.lists_tick(timestamptz, uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.lists_tick(timestamptz, uuid)', 'execute'),
  'the tick is the job''s and the reset''s alone'
);
select ok(
  not has_function_privilege('authenticated', 'public.next_list_openings(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.next_list_openings(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.next_list_openings(uuid, uuid, timestamptz)', 'execute'),
  'the next openings are the server''s'
);
select ok(
  not has_table_privilege('authenticated', 'private.shabbat_times', 'select')
  and not has_table_privilege('anon', 'private.shabbat_times', 'select'),
  'and nobody signed in reads the Shabbat table'
);
select is(
  (select count(*)::integer from cron.job j where j.jobname = 'lists' and j.schedule = '* * * * *'),
  1,
  'the job runs every minute'
);

------------------------------------------------------------------------------
-- Shabbat

select is(
  private.shabbat_span('81000000-0000-4000-b000-000000000001', '2026-11-20'),
  tstzrange('2026-11-20 14:18+00', '2026-11-21 15:17+00'),
  'a Friday belongs to its Shabbat, in the business''s city'
);
select is(
  private.shabbat_span('81000000-0000-4000-b000-000000000001', '2026-11-21'),
  tstzrange('2026-11-20 14:18+00', '2026-11-21 15:17+00'),
  'and so does the Saturday'
);
select ok(
  private.shabbat_span('81000000-0000-4000-b000-000000000001', '2026-11-19') is null,
  'a Thursday belongs to none'
);
select is(
  lower(private.shabbat_span('81000000-0000-4000-b000-000000000002', '2026-11-20')),
  '2026-11-20 13:57+00'::timestamptz,
  'Jerusalem lights candles 40 minutes before sunset'
);
select is(
  private.shabbat_span('81000000-0000-4000-b000-000000000004', '2026-11-20'),
  private.shabbat_span('81000000-0000-4000-b000-000000000001', '2026-11-20'),
  'a city no list has reads as Tel Aviv'
);
select is(
  array[
    private.closes_on_shabbat('81000000-0000-4000-b000-000000000001'),
    private.closes_on_shabbat('81000000-0000-4000-b000-000000000002'),
    private.closes_on_shabbat('81000000-0000-4000-b000-000000000004')
  ],
  array[true, false, false],
  'closed on Shabbat by default; open by its settings, or with no schedule'
);

------------------------------------------------------------------------------
-- A day's list, once

select is(pg_temp.tick('2026-11-15 06:29+00'), 0, 'nothing opens before 08:30 in Israel');
select is(pg_temp.tick('2026-11-15 06:31+00'), 1, 'at 08:31 the kitchen''s Sunday list opens');
select is(pg_temp.tick('2026-11-15 06:32+00'), 0, 'and a minute later it doesn''t open again');
select is(pg_temp.lists_of('01'), 1, 'one list for the day');
select is(
  (select l.origin || '|' || l.status || '|' || l.recipient_kind || '|' || l.name
     || '|' || (l.opens_at = '2026-11-15 06:30+00') || '|' || (l.due_at = '2026-11-15 07:15+00')
   from public.lists l where l.id = pg_temp.list_of('01', '2026-11-15')),
  'scheduled|open|department|Kitchen opening|true|true',
  'scheduled for the kitchen, opened at 08:30 and due at 09:15'
);
select is(
  (select array_agg(i.label order by i.position) from public.list_items i
   where i.list_id = pg_temp.list_of('01', '2026-11-15')),
  array['Fridge', 'Surfaces'],
  'with the template''s items'
);
select is(
  pg_temp.logged('lists.open', pg_temp.list_of('01', '2026-11-15')),
  1,
  'its opening is logged once'
);
select is(pg_temp.lines('lists.sent', '3'), 1, 'and the kitchen hears of it');

------------------------------------------------------------------------------
-- Due soon, late

select pg_temp.tick('2026-11-15 06:44+00');
select ok(
  (select reminded_at is null from public.lists where id = pg_temp.list_of('01', '2026-11-15')),
  'no reminder before half an hour ahead'
);
select pg_temp.tick('2026-11-15 06:46+00');
select pg_temp.tick('2026-11-15 06:50+00');
select is(pg_temp.logged('lists.due', pg_temp.list_of('01', '2026-11-15')), 1, 'a reminder once');
select is(pg_temp.lines('lists.due', '3'), 1, 'to the kitchen');
select is(
  (select n.push_before from public.notifications n
   where n.kind = 'lists.due' and n.user_id = '81000000-0000-4000-a000-000000000003'),
  '2026-11-15 07:15+00'::timestamptz,
  'pushed only until it is due'
);
select pg_temp.tick('2026-11-15 07:29+00');
select ok(
  (select late_at is null from public.lists where id = pg_temp.list_of('01', '2026-11-15')),
  'not late until 15 minutes past its due time'
);
select pg_temp.tick('2026-11-15 07:31+00');
select pg_temp.tick('2026-11-15 07:40+00');
select is(pg_temp.logged('lists.late', pg_temp.list_of('01', '2026-11-15')), 1, 'late once');
select is(pg_temp.lines('lists.late', '3'), 1, 'the kitchen hears it is late');
select is(
  pg_temp.lines('lists.late_team', '1') + pg_temp.lines('lists.late_team', '2'),
  2,
  'and so do the owner and the manager'
);
select is(pg_temp.lines('lists.late_team', '3'), 0, 'not the kitchen twice');

------------------------------------------------------------------------------
-- Missed

select pg_temp.tick('2026-11-15 13:01+00');
select is(pg_temp.lists_of('04'), 1, 'the weekly cleaning opens on Sunday at 15:00');
select pg_temp.tick('2026-11-16 06:31+00');
select is(
  (select status || '|' || (closed_at = '2026-11-16 06:31+00')
   from public.lists where id = pg_temp.list_of('01', '2026-11-15')),
  'missed|true',
  'Sunday''s list is missed when Monday''s opens'
);
select is(
  pg_temp.logged('lists.missed', pg_temp.list_of('01', '2026-11-15')),
  1,
  'logged as missed'
);
select ok(
  (select bool_and(n.resolved_at is not null) from public.notifications n
   where n.dedupe_key = 'list:' || pg_temp.list_of('01', '2026-11-15')),
  'and its lines are settled'
);
select is(
  (select status from public.lists where id = pg_temp.list_of('01', '2026-11-16')),
  'open',
  'Monday''s is open'
);

------------------------------------------------------------------------------
-- Saved late, paused, removed, for someone who left, opened inside its reminder

select pg_temp.tick('2026-11-16 08:01+00');
select is(
  pg_temp.list_of('03', '2026-11-16'),
  null,
  'a time saved after its own time today opens nothing today'
);
select is(
  (select l.recipient_kind || '|' || l.recipient_role from public.lists l
   where l.id = pg_temp.list_of('08', '2026-11-16')),
  'role|manager',
  'a list for someone who left goes to the managers'
);
select pg_temp.tick('2026-11-16 10:01+00');
select pg_temp.tick('2026-11-16 10:10+00');
select is(
  (select l.reminded_at from public.lists l where l.id = pg_temp.list_of('09', '2026-11-16')),
  null,
  'no reminder for a list that opened inside its reminder''s window'
);

------------------------------------------------------------------------------
-- Shifts

select pg_temp.tick('2026-11-16 13:31+00');
select is(
  (select l.recipient_kind || '|' || (l.shift_id = '81000000-0000-4000-f000-000000000011')
     || '|' || (l.opens_at = '2026-11-16 13:30+00') || '|' || (l.due_at = '2026-11-16 15:00+00')
     || '|' || (l.shift ->> 'name')
   from public.lists l where l.id = pg_temp.list_of('05', '2026-11-16')),
  'shift|true|true|true|Evening',
  'half an hour before Monday''s evening starts, for its shift'
);
select is(
  (select array_agg(p.user_id) from public.list_people p
   where p.list_id = pg_temp.list_of('05', '2026-11-16')),
  array['81000000-0000-4000-a000-000000000004']::uuid[],
  'its people as they were'
);
select pg_temp.tick('2026-11-16 15:01+00');
select is(
  (select status from public.lists where id = pg_temp.list_of('04', '2026-11-15')),
  'missed',
  'a weekly list is missed 24 hours after its due time'
);
select pg_temp.tick('2026-11-17 06:31+00');
select isnt(
  pg_temp.list_of('03', '2026-11-17'),
  null,
  'the time saved on Monday starts on Tuesday'
);
select pg_temp.tick('2026-11-17 15:31+00');
select is(
  (select l.recipient_kind || '|' || l.recipient_role from public.lists l
   where l.id = pg_temp.list_of('05', '2026-11-17')),
  'role|manager',
  'an evening with nobody on it goes to the managers'
);
select is(
  (select status from public.lists where id = pg_temp.list_of('05', '2026-11-16')),
  'missed',
  'and Monday''s evening list is missed'
);
select is(
  (select o.occurs_on || '|' || (o.opens_at = '2026-11-17 22:30+00')
   from private.list_occurrences('81000000-0000-4000-e000-000000000006',
     '2026-11-17 12:00+00', '2026-11-18 12:00+00') o),
  '2026-11-17|true',
  'a time before a shift''s end follows it past midnight, on the shift''s day'
);
select pg_temp.tick('2026-11-17 21:16+00');
select is(
  (select l.opens_at from public.lists l where l.id = pg_temp.list_of('07', '2026-11-18')),
  '2026-11-17 21:15+00'::timestamptz,
  'an hour before a shift just after midnight opens the evening before'
);
select is(
  (select count(*)::integer from private.list_occurrences('81000000-0000-4000-e000-000000000005',
     '2026-11-22 22:00+00', '2026-11-23 22:00+00')),
  0,
  'a shift of a week not published opens nothing'
);

------------------------------------------------------------------------------
-- Catching up

select pg_temp.tick('2026-11-18 19:00+00');
select is(
  (select (l.late_at = '2026-11-18 19:00+00') from public.lists l
   where l.id = pg_temp.list_of('01', '2026-11-18')),
  true,
  'an outage still opens the day''s list, late, within 12 hours of its due time'
);
select pg_temp.tick('2026-11-19 19:30+00');
select is(pg_temp.list_of('01', '2026-11-19'), null, 'but not after that');
select is(
  (select status from public.lists where id = pg_temp.list_of('01', '2026-11-18')),
  'missed',
  'and the one before is missed a day after its due time'
);

------------------------------------------------------------------------------
-- Shabbat, closed and open

insert into public.lists (id, business_id, name, origin, recipient_kind, recipient_role, opens_at, due_at)
values ('81000000-0000-4000-c000-000000000201', '81000000-0000-4000-b000-000000000001',
  'Due on Shabbat', 'sent', 'role', 'worker', '2026-11-20 10:00+00', '2026-11-21 08:00+00');

select pg_temp.tick('2026-11-20 13:31+00');
select is(
  (select l.due_at from public.lists l where l.id = pg_temp.list_of('12', '2026-11-20')),
  '2026-11-20 14:18+00'::timestamptz,
  'a Friday list due after candle lighting is due at candle lighting'
);
select pg_temp.tick('2026-11-20 15:01+00');
select is(pg_temp.lists_of('11'), 0, 'nothing on Friday after candle lighting');
select pg_temp.tick('2026-11-21 09:00+00');
select is(
  (select l.late_at from public.lists l where l.id = '81000000-0000-4000-c000-000000000201'),
  null,
  'no late line during Shabbat'
);
select is(pg_temp.lists_of('13'), 0, 'and Saturday''s list waits');
select pg_temp.tick('2026-11-21 15:18+00');
select is(
  (select array[l.opens_at, l.due_at] from public.lists l
   where l.id = pg_temp.list_of('13', '2026-11-21')),
  array['2026-11-21 15:17+00', '2026-11-21 16:17+00']::timestamptz[],
  'it opens at havdalah, with its hour'
);
select is(
  (select l.late_at from public.lists l where l.id = '81000000-0000-4000-c000-000000000201'),
  '2026-11-21 15:18+00'::timestamptz,
  'and what was late on Shabbat is late after it'
);
select is(
  (select status from public.lists where id = pg_temp.list_of('12', '2026-11-20')),
  'missed',
  'Friday''s list nobody did is missed, telling nobody'
);
select private.lists_tick('2026-11-20 15:01+00', '81000000-0000-4000-b000-000000000002');
select is(
  (select l.opens_at from public.lists l where l.id = pg_temp.list_of('14', '2026-11-20')),
  '2026-11-20 15:00+00'::timestamptz,
  'a business open on Shabbat gets its Friday list at its own time'
);
select is(
  (select count(*)::integer from private.list_occurrences('81000000-0000-4000-e000-000000000018',
     '2026-11-19 22:00+00', '2026-11-21 22:00+00')),
  0,
  'a time at the end of a Friday shift that ends at candle lighting opens nothing, and says so'
);
select is(
  (select array[o.opens_at, o.due_at] from private.list_occurrences('81000000-0000-4000-e000-000000000019',
     '2026-11-19 22:00+00', '2026-11-21 22:00+00') o),
  array['2026-11-20 13:48+00', '2026-11-20 14:18+00']::timestamptz[],
  'and one half an hour before that end is due at candle lighting'
);

------------------------------------------------------------------------------
-- The next openings are what the tick opens

select is(
  (select array_agg((o.value ->> 'opensAt')::timestamptz order by o.ordinality)
   from jsonb_array_elements(
     public.next_list_openings('81000000-0000-4000-a000-000000000002',
       '81000000-0000-4000-c000-000000000001', '2026-11-21 22:00+00') -> 0 -> 'openings'
   ) with ordinality as o (value, ordinality)),
  array['2026-11-22 06:30+00', '2026-11-23 06:30+00', '2026-11-24 06:30+00']::timestamptz[],
  'the kitchen''s next three openings'
);
select is(
  public.next_list_openings('81000000-0000-4000-a000-000000000002',
    '81000000-0000-4000-c000-000000000001', '2026-11-21 22:00+00') -> 1 -> 'openings',
  '[]'::jsonb,
  'a paused time has none'
);
select throws_ok(
  $$select public.next_list_openings('81000000-0000-4000-a000-000000000003',
    '81000000-0000-4000-c000-000000000001')$$,
  '42501',
  'List managers and the team only',
  'a worker doesn''t read them'
);
select throws_ok(
  $$select public.next_list_openings('81000000-0000-4000-a000-000000000002',
    '81000000-0000-4000-c000-000000000007', '2026-11-21 22:00+00')$$,
  'P0002',
  'Unknown template',
  'nor anyone outside the template''s business'
);
select pg_temp.tick('2026-11-22 06:31+00');
select is(
  (select l.opens_at from public.lists l where l.id = pg_temp.list_of('01', '2026-11-22')),
  '2026-11-22 06:30+00'::timestamptz,
  'and the tick opens the first of them'
);
select is(
  (select count(*)::integer from public.lists l
   where l.business_id = '81000000-0000-4000-b000-000000000002'),
  1,
  'one business''s tick leaves the others alone'
);

------------------------------------------------------------------------------
-- One business failing, and the clock changes

select private.lists_tick('2026-11-23 06:31+00');
select isnt(
  pg_temp.list_of('01', '2026-11-23'),
  null,
  'a business that fails leaves the others'' lists opening'
);
select is(pg_temp.lists_of('17'), 0, 'and opens nothing itself');

-- The kitchen's Monday list is open. Moved to 10:00 that day, its time opens
-- nothing more today, and the editor hears the same.
update public.list_schedules ls set opens_offset = 600, due_offset = 645
where ls.id = '81000000-0000-4000-e000-000000000001';
select is(
  (public.next_list_openings('81000000-0000-4000-a000-000000000002',
     '81000000-0000-4000-c000-000000000001', '2026-11-23 07:00+00')
     -> 0 -> 'openings' -> 0 ->> 'opensAt')::timestamptz,
  '2026-11-24 08:00+00'::timestamptz,
  'a day that has its list is left out of the next openings'
);
update public.list_schedules ls set opens_offset = 510, due_offset = 555
where ls.id = '81000000-0000-4000-e000-000000000001';

select private.lists_tick('2026-10-24 23:31+00', '81000000-0000-4000-b000-000000000004');
select is(
  (select array[l.opens_at, l.due_at] from public.lists l
   where l.id = pg_temp.list_of('15', '2026-10-25')),
  array['2026-10-24 23:30+00', '2026-10-25 00:00+00']::timestamptz[],
  '01:30 on the night the clocks go back is the later one'
);
select private.lists_tick('2027-03-26 00:31+00', '81000000-0000-4000-b000-000000000004');
select is(
  (select array[l.opens_at, l.due_at] from public.lists l
   where l.id = pg_temp.list_of('16', '2027-03-26')),
  array['2027-03-26 00:30+00', '2027-03-26 01:00+00']::timestamptz[],
  '02:30 on the night the clocks go forward is 03:30, with its half hour'
);

select is(pg_temp.lists_of('02') + pg_temp.lists_of('10'), 0, 'paused and removed times opened nothing');

------------------------------------------------------------------------------
-- A reading outside its range

select public.set_list_item('81000000-0000-4000-a000-000000000003',
  (select i.id from public.list_items i
   where i.list_id = pg_temp.list_of('01', '2026-11-23') and i.label = 'Fridge'),
  '{"reading": 7}', '2026-11-23 06:40+00');
select is(
  (select a.details ->> 'label' || '|' || (a.details ->> 'reading') || '|' || (a.details ->> 'unit')
   from public.audit_log a
   where a.action = 'lists.out_of_range' and a.details ->> 'list' = pg_temp.list_of('01', '2026-11-23')::text),
  'Fridge|7|°C',
  'a reading outside its range is logged, with its unit'
);
select is(
  pg_temp.lines('lists.out_of_range', '1') + pg_temp.lines('lists.out_of_range', '2'),
  2,
  'the owner and the manager hear of it'
);
select is(pg_temp.lines('lists.out_of_range', '3'), 0, 'not who read it');
select public.set_list_item('81000000-0000-4000-a000-000000000003',
  (select i.id from public.list_items i
   where i.list_id = pg_temp.list_of('01', '2026-11-23') and i.label = 'Fridge'),
  '{"reading": 8}', '2026-11-23 06:41+00');
select is(
  pg_temp.logged('lists.out_of_range', pg_temp.list_of('01', '2026-11-23')),
  1,
  'still outside is no news'
);

------------------------------------------------------------------------------
-- Opened again by hand

-- Monday's kitchen list is finished, Tuesday's opens, and a manager opens
-- Monday's again to correct it: it waits for them, past the next list and a
-- day after its due time.
select public.set_list_item('81000000-0000-4000-a000-000000000003',
  (select i.id from public.list_items i
   where i.list_id = pg_temp.list_of('01', '2026-11-23') and i.label = 'Surfaces'),
  '{"checked": true}', '2026-11-23 06:50+00');
select public.finish_list('81000000-0000-4000-a000-000000000003',
  pg_temp.list_of('01', '2026-11-23'), '2026-11-23 06:55+00');
select pg_temp.tick('2026-11-24 06:31+00');
select public.reopen_list('81000000-0000-4000-a000-000000000002',
  pg_temp.list_of('01', '2026-11-23'), '2026-11-24 06:40+00');
select pg_temp.tick('2026-11-24 06:45+00');
select pg_temp.tick('2026-11-25 07:30+00');
select is(
  (select l.status || '|' || (l.reopened_at = '2026-11-24 06:40+00') from public.lists l
   where l.id = pg_temp.list_of('01', '2026-11-23')),
  'open|true',
  'a list opened again by hand is never closed as missed'
);

------------------------------------------------------------------------------
-- A time changed after its own hour opens nothing until its next opening

-- These go through save_list_template and restore_list_template, which stamp
-- now(): the times are read on Israel's clock, half an hour before now, in O
-- (open on Shabbat, so the day CI runs on changes nothing). Each counted from
-- three days ago: U paused, M at an hour and a half from now, D on every day
-- but the one it is half an hour ago, T on a removed template, C as it is.
create function pg_temp.ago() returns integer language sql as $$
  select (extract(hour from x.at_local) * 60 + extract(minute from x.at_local))::integer
  from (select (now() - interval '30 minutes') at time zone 'Asia/Jerusalem' as at_local) x
$$;
create function pg_temp.ago_day() returns integer language sql as $$
  select extract(dow from (now() - interval '30 minutes') at time zone 'Asia/Jerusalem')::integer
$$;
create function pg_temp.save_o(template text, sched text, days jsonb, opens integer, goes_to text)
returns jsonb language sql as $$
  select public.save_list_template('81000000-0000-4000-a000-000000000001',
    '81000000-0000-4000-b000-000000000002',
    jsonb_build_object('id', '81000000-0000-4000-c000-0000000000' || template,
      'name', 'Changed ' || template,
      'items', '[{"kind": "check", "label": "Done"}]'::jsonb,
      'schedules', jsonb_build_array(jsonb_build_object(
        'id', '81000000-0000-4000-e000-0000000000' || sched,
        'days', days, 'opensOffset', opens, 'dueOffset', opens + 60,
        'recipient', jsonb_build_object('kind', 'role', 'role', goes_to), 'active', true))))
$$;

insert into public.list_templates (id, business_id, name, archived_at)
values
  ('81000000-0000-4000-c000-000000000010', '81000000-0000-4000-b000-000000000002', 'U', null),
  ('81000000-0000-4000-c000-000000000011', '81000000-0000-4000-b000-000000000002', 'M', null),
  ('81000000-0000-4000-c000-000000000012', '81000000-0000-4000-b000-000000000002', 'D', null),
  ('81000000-0000-4000-c000-000000000013', '81000000-0000-4000-b000-000000000002', 'T',
    now() - interval '1 day'),
  ('81000000-0000-4000-c000-000000000014', '81000000-0000-4000-b000-000000000002', 'C', null);
insert into public.list_schedules (
  id, template_id, business_id, position, days, anchor, opens_offset, due_offset,
  recipient_kind, recipient_role, active, starts_on, opens_from
)
select ('81000000-0000-4000-e000-0000000000' || r.sched)::uuid,
  ('81000000-0000-4000-c000-0000000000' || r.template)::uuid,
  '81000000-0000-4000-b000-000000000002', 0, r.days, 'day', r.opens, r.opens + 60,
  'role', 'owner', r.active, (now() at time zone 'Asia/Jerusalem')::date - 3,
  now() - interval '3 days'
from (
  values
    ('20', '10', '{0,1,2,3,4,5,6}'::smallint[], pg_temp.ago(), false),
    ('21', '11', '{0,1,2,3,4,5,6}'::smallint[], (pg_temp.ago() + 120) % 1440, true),
    ('22', '12',
      array(select g.d from generate_series(0, 6) as g (d) where g.d <> pg_temp.ago_day())::smallint[],
      pg_temp.ago(), true),
    ('23', '13', '{0,1,2,3,4,5,6}'::smallint[], pg_temp.ago(), true),
    ('24', '14', '{0,1,2,3,4,5,6}'::smallint[], pg_temp.ago(), true)
) as r (sched, template, days, opens, active);

select pg_temp.save_o('10', '20', '[0, 1, 2, 3, 4, 5, 6]', pg_temp.ago(), 'owner');
select pg_temp.save_o('11', '21', '[0, 1, 2, 3, 4, 5, 6]', pg_temp.ago(), 'owner');
select pg_temp.save_o('12', '22', '[0, 1, 2, 3, 4, 5, 6]', pg_temp.ago(), 'owner');
select public.restore_list_template('81000000-0000-4000-a000-000000000001',
  '81000000-0000-4000-c000-000000000013');
select pg_temp.save_o('14', '24', '[0, 1, 2, 3, 4, 5, 6]', pg_temp.ago(), 'manager');

select ok(
  (select bool_and(ls.opens_from = now()) and count(*) = 4 from public.list_schedules ls
   where ls.id in ('81000000-0000-4000-e000-000000000020', '81000000-0000-4000-e000-000000000021',
     '81000000-0000-4000-e000-000000000022', '81000000-0000-4000-e000-000000000023')),
  'switched back on, moved earlier, given its day or brought back, a time counts from now'
);
select is(
  (select ls.opens_from from public.list_schedules ls
   where ls.id = '81000000-0000-4000-e000-000000000024'),
  now() - interval '3 days',
  'but not when only who it goes to changes'
);
select private.lists_tick(now(), '81000000-0000-4000-b000-000000000002');
select is(pg_temp.lists_of('24'), 1, 'so that one opens its list, half an hour late');
select is(
  pg_temp.lists_of('20') + pg_temp.lists_of('21') + pg_temp.lists_of('22') + pg_temp.lists_of('23'),
  0,
  'and the others open nothing today, though their hour has gone by'
);
select private.lists_tick(now() + interval '1 day', '81000000-0000-4000-b000-000000000002');
select is(
  array[pg_temp.lists_of('20'), pg_temp.lists_of('21'), pg_temp.lists_of('22'), pg_temp.lists_of('23')],
  array[1, 1, 1, 1],
  'each opens at its time tomorrow'
);

------------------------------------------------------------------------------
-- Saving a time, and the demo

-- Saved in one statement and read in the next, which sees what it wrote.
select set_config('test.saved', public.save_list_template('81000000-0000-4000-a000-000000000002',
  '81000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Saved now',
    'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'schedules', jsonb_build_array(jsonb_build_object('days', '[1, 2]'::jsonb,
      'opensOffset', 480, 'dueOffset', 540,
      'recipient', '{"kind": "role", "role": "worker"}'::jsonb)))) ->> 'id', true);
select is(
  (select ls.starts_on from public.list_schedules ls
   where ls.template_id = current_setting('test.saved')::uuid),
  (now() at time zone 'Asia/Jerusalem')::date,
  'a time starts on the business''s own today, not the database''s'
);

delete from public.lists l where l.business_id = '00000000-0000-4000-b000-000000000001';
select private.seed_demo_lists('00000000-0000-4000-b000-000000000001');
select is(
  (select count(*)::integer from public.lists l
   where l.business_id = '00000000-0000-4000-b000-000000000001' and l.origin = 'scheduled'),
  0,
  'the local demo''s reset opens none of its times'
);
update private.demo_businesses d
set definition = d.definition || '{"scheduledLists": true}'::jsonb
where d.business_id = '00000000-0000-4000-b000-000000000001';
delete from public.lists l where l.business_id = '00000000-0000-4000-b000-000000000001';
select private.seed_demo_lists('00000000-0000-4000-b000-000000000001');
select ok(
  (select bool_and(ls.opens_from <= now() - interval '2 days' and ls.starts_on < (now() at time zone 'Asia/Jerusalem')::date)
   from public.list_schedules ls
   where ls.business_id = '00000000-0000-4000-b000-000000000001'),
  'a hosted demo''s times are as old as a business''s that had them all along'
);
select is(
  (select count(*)::integer from public.lists l
   where l.business_id = '00000000-0000-4000-b000-000000000001'
     and l.origin = 'sent'
     and exists (
       select 1 from public.lists s
       where s.template_id = l.template_id and s.origin = 'scheduled'
     )),
  0,
  'and its examples are of templates nothing opened today'
);

select * from finish();
rollback;
