-- A list still late, to the owners (20261115000500_lists_owners_late.sql):
-- private.lists_tick at times the test chooses tells the business's owners,
-- once, `tellOwnersAfterMinutes` after a scheduled list became late (an hour
-- unless the business chose otherwise, a value not offered read as an hour,
-- never at 0), and not a minute before, counted from the minute of its late
-- line; only owners, never one who holds the list or one who left, and the
-- managers' late line each owner had is then read, not settled; never a list
-- sent once or one opened again by hand after it was late, while one undone
-- before it was late is told; nothing during a closed business's Shabbat; and
-- the line is settled when the list is missed, finished or cancelled. Fixed
-- ids of their own and explicit times; the times are put straight into
-- list_schedules so the moment they count from (opens_from) is known.
begin;
select plan(31);

insert into auth.users (id, aud, role, phone)
values
  ('90000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500006001'),
  ('90000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500006002'),
  ('90000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500006003'),
  ('90000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500006004'),
  ('90000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500006005'),
  -- The owners of N, U and S: one place on a staff per login (20261110000900).
  ('90000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500006006'),
  ('90000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500006007'),
  ('90000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500006008');

-- L: the settings' default. N: never ("tellOwnersAfterMinutes": 0). U: 45, a
-- value the manifest doesn't offer. None of the three has the schedule on, so
-- none closes on Shabbat (their days are a Monday to a Thursday anyway). S:
-- the default, with the schedule on, so closed on Shabbat, in Tel Aviv.
insert into public.businesses (id, slug, name, shabbat_city)
values
  ('90000000-0000-4000-b000-000000000001', 'owners-late-l', 'Owners late L', null),
  ('90000000-0000-4000-b000-000000000002', 'owners-late-n', 'Owners late N', null),
  ('90000000-0000-4000-b000-000000000003', 'owners-late-u', 'Owners late U', null),
  ('90000000-0000-4000-b000-000000000004', 'owners-late-s', 'Owners late S', 'telAviv');

-- L: 1 owner, 2 owner in the kitchen (so holding the kitchen's lists), 3
-- manager, 4 worker in the kitchen, 5 owner who left. N: 6, its owner. U: 7,
-- its owner. S: 8, its owner.
insert into public.memberships (business_id, user_id, role, active)
values
  ('90000000-0000-4000-b000-000000000001', '90000000-0000-4000-a000-000000000001', 'owner', true),
  ('90000000-0000-4000-b000-000000000001', '90000000-0000-4000-a000-000000000002', 'owner', true),
  ('90000000-0000-4000-b000-000000000001', '90000000-0000-4000-a000-000000000003', 'manager', true),
  ('90000000-0000-4000-b000-000000000001', '90000000-0000-4000-a000-000000000004', 'worker', true),
  ('90000000-0000-4000-b000-000000000001', '90000000-0000-4000-a000-000000000005', 'owner', false),
  ('90000000-0000-4000-b000-000000000002', '90000000-0000-4000-a000-000000000006', 'owner', true),
  ('90000000-0000-4000-b000-000000000003', '90000000-0000-4000-a000-000000000007', 'owner', true),
  ('90000000-0000-4000-b000-000000000004', '90000000-0000-4000-a000-000000000008', 'owner', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('90000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('90000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('90000000-0000-4000-b000-000000000002', 'lists', true, '{"tellOwnersAfterMinutes": 0}'),
  ('90000000-0000-4000-b000-000000000002', 'notifications', true, '{}'),
  ('90000000-0000-4000-b000-000000000003', 'lists', true, '{"tellOwnersAfterMinutes": 45}'),
  ('90000000-0000-4000-b000-000000000003', 'notifications', true, '{}'),
  ('90000000-0000-4000-b000-000000000004', 'lists', true, '{}'),
  ('90000000-0000-4000-b000-000000000004', 'notifications', true, '{}'),
  ('90000000-0000-4000-b000-000000000004', 'scheduling', true, '{}');

insert into public.departments (id, business_id, key, name)
values ('90000000-0000-4000-d000-000000000001', '90000000-0000-4000-b000-000000000001', 'kitchen', 'Kitchen');
insert into public.department_members (department_id, business_id, user_id)
values
  ('90000000-0000-4000-d000-000000000001', '90000000-0000-4000-b000-000000000001',
    '90000000-0000-4000-a000-000000000002'),
  ('90000000-0000-4000-d000-000000000001', '90000000-0000-4000-b000-000000000001',
    '90000000-0000-4000-a000-000000000004');

-- One template a business, each with one item that may stay empty, so a list
-- finishes as it is.
insert into public.list_templates (id, business_id, name)
values
  ('90000000-0000-4000-c000-000000000001', '90000000-0000-4000-b000-000000000001', 'Opening'),
  ('90000000-0000-4000-c000-000000000002', '90000000-0000-4000-b000-000000000002', 'Closing'),
  ('90000000-0000-4000-c000-000000000003', '90000000-0000-4000-b000-000000000003', 'Delivery');
insert into public.list_template_items (template_id, business_id, position, kind, label, required)
select t.id, t.business_id, 0, 'check', 'Done', false
from public.list_templates t
where t.id::text like '90000000-0000-4000-c000-%';

-- Every day at 08:30 in Israel, 45 minutes, so due at 09:15 and late at
-- 09:30: L's to the kitchen, N's and U's to the workers. All count from 1
-- November.
insert into public.list_schedules (
  id, template_id, business_id, position, days, anchor, shift_key, opens_offset, due_offset,
  recipient_kind, recipient_user, recipient_department, recipient_shift, recipient_role,
  active, starts_on, opens_from
)
values
  ('90000000-0000-4000-e000-000000000001', '90000000-0000-4000-c000-000000000001',
    '90000000-0000-4000-b000-000000000001', 0, '{0,1,2,3,4,5,6}', 'day', null, 510, 555,
    'department', null, '90000000-0000-4000-d000-000000000001', null, null,
    true, '2026-11-01', '2026-11-01 00:00+00'),
  ('90000000-0000-4000-e000-000000000002', '90000000-0000-4000-c000-000000000002',
    '90000000-0000-4000-b000-000000000002', 0, '{0,1,2,3,4,5,6}', 'day', null, 510, 555,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  ('90000000-0000-4000-e000-000000000003', '90000000-0000-4000-c000-000000000003',
    '90000000-0000-4000-b000-000000000003', 0, '{0,1,2,3,4,5,6}', 'day', null, 510, 555,
    'role', null, null, null, 'worker', true, '2026-11-01', '2026-11-01 00:00+00');

-- Two of L's lists, late long ago and still open, put in by hand: one sent
-- once (not a list's times'), and a scheduled one a manager opened again
-- after it was late. And two of S's, scheduled, late at 13:30 UTC on Friday
-- 20 November, 48 minutes before Tel Aviv's candle lighting (14:18 UTC;
-- havdalah at 15:17 UTC on Saturday): one nobody opened again, and one its
-- finisher undid before it was late (which the missed lists leave alone).
insert into public.lists (
  id, business_id, occurs_on, name, origin, recipient_kind, recipient_role, sent_by,
  opens_at, due_at, late_at, reopened_at
)
values
  ('90000000-0000-4000-f000-000000000001', '90000000-0000-4000-b000-000000000001',
    null, 'Sent once', 'sent', 'role', 'worker', '90000000-0000-4000-a000-000000000003',
    '2026-11-16 05:00+00', '2026-11-16 05:30+00', '2026-11-16 05:45+00', null),
  ('90000000-0000-4000-f000-000000000002', '90000000-0000-4000-b000-000000000001',
    '2026-11-15', 'Corrected', 'scheduled', 'role', 'worker', null,
    '2026-11-15 05:00+00', '2026-11-15 05:30+00', '2026-11-15 05:45+00', '2026-11-16 05:00+00'),
  ('90000000-0000-4000-f000-000000000003', '90000000-0000-4000-b000-000000000004',
    '2026-11-20', 'Before Shabbat', 'scheduled', 'role', 'worker', null,
    '2026-11-20 12:00+00', '2026-11-20 13:15+00', '2026-11-20 13:30+00', null),
  ('90000000-0000-4000-f000-000000000004', '90000000-0000-4000-b000-000000000004',
    '2026-11-20', 'Undone before Shabbat', 'scheduled', 'role', 'worker', null,
    '2026-11-20 12:00+00', '2026-11-20 13:15+00', '2026-11-20 13:30+00', '2026-11-20 13:00+00');

create function pg_temp.business_of(which text) returns uuid language sql as $$
  select ('90000000-0000-4000-b000-0000000000' || which)::uuid
$$;
create function pg_temp.person(which text) returns uuid language sql as $$
  select ('90000000-0000-4000-a000-0000000000' || which)::uuid
$$;
create function pg_temp.tick(at_time timestamptz, which text) returns integer language sql as $$
  select private.lists_tick(at_time, pg_temp.business_of(which))
$$;
-- A schedule's list of a day.
create function pg_temp.list_of(sched text, on_day date) returns uuid language sql as $$
  select l.id from public.lists l
  where l.schedule_id = ('90000000-0000-4000-e000-0000000000' || sched)::uuid
    and l.occurs_on = on_day
$$;
create function pg_temp.logged(what text, list uuid) returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.action = what and a.details ->> 'list' = list::text
$$;
create function pg_temp.lines(what text, who text) returns integer language sql as $$
  select count(*)::integer from public.notifications n
  where n.kind = what and n.user_id = pg_temp.person(who)
$$;
-- Whether every line about a list's owners' step is settled (null: none).
create function pg_temp.settled(list uuid) returns boolean language sql as $$
  select bool_and(n.resolved_at is not null) from public.notifications n
  where n.dedupe_key = 'list.late_owner:' || list
$$;

------------------------------------------------------------------------------
-- The setting

select is(
  private.list_settings(pg_temp.business_of('01')) ->> 'tellOwnersAfterMinutes',
  '60',
  'the owners hear an hour after a list became late, when the business chose nothing'
);
select is(
  private.list_settings(pg_temp.business_of('02')) ->> 'tellOwnersAfterMinutes',
  '0',
  'and what the business chose wins'
);
select is(
  private.notification_group('lists.late_owner'),
  'lists',
  'the owners'' line is in the lists group, as the app has it'
);
select ok(
  not has_function_privilege('authenticated', 'private.lists_tick_business(uuid, timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'private.lists_tick_business(uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'private.notify_for_lists(public.audit_log)', 'execute')
  and not has_function_privilege('anon', 'private.list_settings(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.list_settings(uuid)', 'execute'),
  'the replaced functions stay the database''s own'
);

------------------------------------------------------------------------------
-- At its time, once, to the owners

select is(pg_temp.tick('2026-11-16 06:31+00', '01'), 1, 'Monday''s list opens at 08:30');
select pg_temp.tick('2026-11-16 07:30+00', '01');
select is(
  (select l.late_at from public.lists l where l.id = pg_temp.list_of('01', '2026-11-16')),
  '2026-11-16 07:30+00'::timestamptz,
  'and is late at 09:30, a quarter of an hour after its due time'
);
select is(
  pg_temp.lines('lists.late_team', '01'),
  1,
  'which the owner hears with the managers'
);

select pg_temp.tick('2026-11-16 08:29+00', '01');
select ok(
  (select l.owners_told_at is null from public.lists l
   where l.id = pg_temp.list_of('01', '2026-11-16'))
  and pg_temp.logged('lists.late_owner', pg_temp.list_of('01', '2026-11-16')) = 0,
  'nothing more a minute before the hour'
);

select pg_temp.tick('2026-11-16 08:30+00', '01');
select is(
  (select l.owners_told_at from public.lists l where l.id = pg_temp.list_of('01', '2026-11-16')),
  '2026-11-16 08:30+00'::timestamptz,
  'an hour after it became late, the owners are told'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.action = 'lists.late_owner'
     and a.business_id = pg_temp.business_of('01')
     and a.actor_id is null
     and a.details ->> 'list' = pg_temp.list_of('01', '2026-11-16')::text
     and (a.details ->> 'late_at')::timestamptz = '2026-11-16 07:30+00'),
  1,
  'logged once, by nobody, with when it became late'
);
select is(
  (select n.kind || '|' || n.audience_role || '|' || n.source_module || '|'
     || (n.params ->> 'list') || '|' || (n.params ->> 'name') || '|'
     || ((n.params ->> 'due')::timestamptz = '2026-11-16 07:15+00') || '|'
     || (n.actor_id is null) || '|' || (n.resolved_at is null)
   from public.notifications n
   where n.user_id = pg_temp.person('01')
     and n.dedupe_key = 'list.late_owner:' || pg_temp.list_of('01', '2026-11-16')),
  'lists.late_owner|owner|lists|' || pg_temp.list_of('01', '2026-11-16') || '|Opening|true|true|true',
  'the owner gets one line, for owners alone, with the list and its due time'
);
select is(
  pg_temp.lines('lists.late_owner', '02'),
  0,
  'never an owner who holds the list: the kitchen''s owner heard it with the kitchen'
);
select is(
  pg_temp.lines('lists.late_owner', '03') + pg_temp.lines('lists.late_owner', '04')
    + pg_temp.lines('lists.late_owner', '05'),
  0,
  'nor the manager, the kitchen''s worker, or the owner who left'
);
select is(
  array[
    (select count(*)::integer from public.notifications n
     where n.user_id = pg_temp.person('01')
       and n.dedupe_key = 'list.late_team:' || pg_temp.list_of('01', '2026-11-16')
       and n.read_at is not null
       and n.resolved_at is null),
    (select count(*)::integer from public.notifications n
     where n.user_id = pg_temp.person('01')
       and n.params ->> 'list' = pg_temp.list_of('01', '2026-11-16')::text
       and n.read_at is null),
    (select count(*)::integer from public.notifications n
     where n.user_id = pg_temp.person('03')
       and n.dedupe_key = 'list.late_team:' || pg_temp.list_of('01', '2026-11-16')
       and n.read_at is null)
  ],
  array[1, 1, 1],
  'the owner''s line with the managers gives way to it, read but not settled, so one line about the list waits for the owner; the manager''s stays unread'
);

select pg_temp.tick('2026-11-16 09:30+00', '01');
select pg_temp.tick('2026-11-16 12:00+00', '01');
select is(
  array[
    pg_temp.logged('lists.late_owner', pg_temp.list_of('01', '2026-11-16')),
    pg_temp.lines('lists.late_owner', '01')
  ],
  array[1, 1],
  'and only once, however long it stays open'
);
select ok(
  (select bool_and(l.owners_told_at is null) from public.lists l
   where l.id in ('90000000-0000-4000-f000-000000000001', '90000000-0000-4000-f000-000000000002')),
  'never a list sent once, or one a manager opened again after it was late'
);

------------------------------------------------------------------------------
-- Settled when missed and when finished

select pg_temp.tick('2026-11-17 06:31+00', '01');
select is(
  (select l.status from public.lists l where l.id = pg_temp.list_of('01', '2026-11-16')),
  'missed',
  'Monday''s list is missed when Tuesday''s opens'
);
select ok(pg_temp.settled(pg_temp.list_of('01', '2026-11-16')), 'which settles the owners'' line');

select pg_temp.tick('2026-11-17 07:30+00', '01');
select pg_temp.tick('2026-11-17 08:30+00', '01');
select is(
  pg_temp.lines('lists.late_owner', '01'),
  2,
  'Tuesday''s, late too, comes an hour after it became late'
);
select ok(not pg_temp.settled(pg_temp.list_of('01', '2026-11-17')), 'and waits');
select public.finish_list(
  '90000000-0000-4000-a000-000000000004', pg_temp.list_of('01', '2026-11-17'), '2026-11-17 08:40+00'
);
select ok(pg_temp.settled(pg_temp.list_of('01', '2026-11-17')), 'until the kitchen finishes it');

------------------------------------------------------------------------------
-- Undone before it was late

-- Wednesday's: the kitchen's worker finishes it by mistake at 09:00 and undoes
-- it a minute later, before its due time.
select pg_temp.tick('2026-11-18 06:31+00', '01');
select public.finish_list(
  '90000000-0000-4000-a000-000000000004', pg_temp.list_of('01', '2026-11-18'), '2026-11-18 07:00+00'
);
select public.reopen_list(
  '90000000-0000-4000-a000-000000000004', pg_temp.list_of('01', '2026-11-18'), '2026-11-18 07:01+00'
);
select pg_temp.tick('2026-11-18 07:30+00', '01');
select pg_temp.tick('2026-11-18 08:30+00', '01');
select is(
  (select array[l.reopened_at, l.late_at, l.owners_told_at] from public.lists l
   where l.id = pg_temp.list_of('01', '2026-11-18')),
  array['2026-11-18 07:01+00', '2026-11-18 07:30+00', '2026-11-18 08:30+00']::timestamptz[],
  'a list undone before it was late still becomes late, and the owners hear it an hour later'
);

------------------------------------------------------------------------------
-- To the minute

-- Thursday's: the job's now() is a little past its minute, by a different
-- fraction each run; here more at the late line than an hour later.
select pg_temp.tick('2026-11-19 06:31+00', '01');
select pg_temp.tick('2026-11-19 07:30:00.5+00', '01');
select pg_temp.tick('2026-11-19 08:30:00.1+00', '01');
select is(
  (select array[l.late_at, l.owners_told_at] from public.lists l
   where l.id = pg_temp.list_of('01', '2026-11-19')),
  array['2026-11-19 07:30:00.5+00', '2026-11-19 08:30:00.1+00']::timestamptz[],
  'the owners hear it in the minute an hour after its late line, not a minute later'
);

------------------------------------------------------------------------------
-- Never at 0

select pg_temp.tick('2026-11-16 06:31+00', '02');
select pg_temp.tick('2026-11-16 07:30+00', '02');
select pg_temp.tick('2026-11-16 08:30+00', '02');
select pg_temp.tick('2026-11-16 10:30+00', '02');
select is(
  pg_temp.logged('lists.late', pg_temp.list_of('02', '2026-11-16')),
  1,
  'N''s list was late'
);
select ok(
  (select l.owners_told_at is null from public.lists l
   where l.id = pg_temp.list_of('02', '2026-11-16'))
  and pg_temp.logged('lists.late_owner', pg_temp.list_of('02', '2026-11-16')) = 0
  and pg_temp.lines('lists.late_owner', '06') = 0,
  'and with the setting at 0 its owner never hears more'
);

------------------------------------------------------------------------------
-- A value not offered, and settled when cancelled

select pg_temp.tick('2026-11-16 06:31+00', '03');
select pg_temp.tick('2026-11-16 07:30+00', '03');
select pg_temp.tick('2026-11-16 08:15+00', '03');
select ok(
  (select l.owners_told_at is null from public.lists l
   where l.id = pg_temp.list_of('03', '2026-11-16')),
  '45 minutes, which the settings don''t offer, tells nobody after 45 minutes'
);
select pg_temp.tick('2026-11-16 08:30+00', '03');
select is(
  pg_temp.lines('lists.late_owner', '07'),
  1,
  'but after an hour, the default it reads as instead, its owner hears it'
);
select public.cancel_list(
  '90000000-0000-4000-a000-000000000007', pg_temp.list_of('03', '2026-11-16'), '2026-11-16 08:40+00'
);
select ok(pg_temp.settled(pg_temp.list_of('03', '2026-11-16')), 'and cancelling the list settles it');

------------------------------------------------------------------------------
-- Not during Shabbat

-- An hour after their late lines, inside Shabbat.
select pg_temp.tick('2026-11-20 14:30+00', '04');
select ok(
  (select bool_and(l.owners_told_at is null) from public.lists l
   where l.id in ('90000000-0000-4000-f000-000000000003', '90000000-0000-4000-f000-000000000004'))
  and (select count(*) from public.audit_log a
       where a.action = 'lists.late_owner' and a.business_id = pg_temp.business_of('04')) = 0
  and pg_temp.lines('lists.late_owner', '08') = 0,
  'a business closed on Shabbat tells its owner nothing during it, an hour after a late line or not'
);
select pg_temp.tick('2026-11-21 15:18+00', '04');
select is(
  (select l.status || '|' || (l.owners_told_at is null) from public.lists l
   where l.id = '90000000-0000-4000-f000-000000000003'),
  'missed|true',
  'after havdalah, the list nobody opened again is already past its 24 hours, missed, and told to nobody'
);
select is(
  (select l.owners_told_at from public.lists l
   where l.id = '90000000-0000-4000-f000-000000000004'),
  '2026-11-21 15:18+00'::timestamptz,
  'and the one still open reaches its owner at the first minute after havdalah'
);

select * from finish();
rollback;
