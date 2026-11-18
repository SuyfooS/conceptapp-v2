-- The running week's notifications (20261115000400_running_week_notices.sql;
-- Orel's answers to Q4 and Q5 of 15 November 2026 on #1). A week's first
-- publish in the middle of the week tells only those with a shift still to
-- start, how many are left, and reaches their phone until the first of them
-- starts. Published again while it runs, it tells those whose shifts changed
-- how many are left and the nearest shift that changed (moved, added, a shift
-- under way joined included, removed, or edited only when nothing else
-- changed), from their shifts before and after, which the log keeps by id; on
-- the phone until that shift starts, or ends once begun. A nearer change not
-- heard of yet stays named through a later publish. A schedule.changed push
-- waits two minutes, in any week, and a publish before then replaces it;
-- choices saved meanwhile keep them; quiet hours hold a push to their end,
-- and one whose shift has begun by then never goes, while the line is in the
-- app at once. A publish counts schedule.unfilled again: its count lowered,
-- never raised, read as it was, or settled at none. The new helpers are the
-- database's own. Fixed ids (83…), numbers (9725000083xx) and slugs (rwn-…) of
-- its own, and explicit moments throughout but for saving choices, which
-- reads the clock (in a week of 2099), so nothing here meets the seeded
-- people or the clock.
begin;
select plan(26);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('83000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500008301'),
  ('83000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500008302'),
  ('83000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500008303'),
  ('83000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500008304'),
  ('83000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500008305'),
  ('83000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500008306'),
  ('83000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500008307'),
  ('83000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500008308'),
  ('83000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500008309');

-- X: 1 its owner, 2 its manager, who publishes; 3 to 9 workers. 3 and 6 have
-- a phone; 9 has one and quiet hours from 22:00 to 07:00.
insert into public.businesses (id, slug, name)
values ('83000000-0000-4000-b000-000000000001', 'rwn-x', 'Running notices X');

insert into public.memberships (business_id, user_id, role, active)
values
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000001', 'owner', true),
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000002', 'manager', true),
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000003', 'worker', true),
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000004', 'worker', true),
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000005', 'worker', true),
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000006', 'worker', true),
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000007', 'worker', true),
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000008', 'worker', true),
  ('83000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000009', 'worker', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('83000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('83000000-0000-4000-b000-000000000001', 'notifications', true, '{}');

insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select p.id, 'https://fcm.googleapis.com/fcm/send/rwnotice-' || p.n::text,
  md5('rwnotice-a-' || p.n::text) || md5('rwnotice-b-' || p.n::text),
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from (values
  ('83000000-0000-4000-a000-000000000003'::uuid, 3),
  ('83000000-0000-4000-a000-000000000006'::uuid, 6),
  ('83000000-0000-4000-a000-000000000009'::uuid, 9)
) as p (id, n);

insert into public.notification_preferences (user_id, quiet_from, quiet_to, time_zone)
values ('83000000-0000-4000-a000-000000000009', '22:00', '07:00', 'Asia/Jerusalem');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
-- What a builder read: the shifts it would send back unchanged, and what it saw.
create temporary table screens (name text primary key, shifts jsonb, basis jsonb) on commit drop;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;
create function pg_temp.person(n text) returns uuid language sql as $$
  select ('83000000-0000-4000-a000-00000000000' || n)::uuid
$$;

-- The week's shifts, named by name and day, once each.
create function pg_temp.name_shifts() returns void language sql as $$
  insert into ids
  select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
  from public.schedule_shifts s
  where s.week_id = (select i.id from ids i where i.name = 'week')
  on conflict (name) do nothing;
$$;

-- The week as a builder reads it: its shifts with their ids, times as
-- "HH:MM", and what was seen of each.
create function pg_temp.screen() returns table (shifts jsonb, basis jsonb) language sql as $$
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', t.s ->> 'id', 'day', t.s ->> 'day', 'name', t.s ->> 'name',
          'start', left(t.s ->> 'starts_at', 5), 'end', left(t.s ->> 'ends_at', 5),
          'needed', (t.s ->> 'needed')::integer, 'pattern', t.s -> 'pattern_key',
          'assignees', t.s -> 'assignees'
        )
        order by t.n
      ),
      '[]'::jsonb
    ),
    coalesce(jsonb_object_agg(t.s ->> 'id', t.s ->> 'seen'), '{}'::jsonb)
  from jsonb_array_elements(public.week_shifts((select i.id from ids i where i.name = 'week')))
    with ordinality as t (s, n)
$$;
create function pg_temp.shifts_of(screen_name text) returns jsonb language sql as $$
  select s.shifts from screens s where s.name = screen_name
$$;
create function pg_temp.basis_of(screen_name text) returns jsonb language sql as $$
  select s.basis from screens s where s.name = screen_name
$$;

-- The payload with one shift changed.
create function pg_temp.edit(payload jsonb, shift_name text, changes jsonb)
returns jsonb language sql as $$
  select coalesce(
    jsonb_agg(
      case when x.e ->> 'id' = pg_temp.id(shift_name)::text then x.e || changes else x.e end
      order by x.o
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(payload) with ordinality as x (e, o)
$$;

-- X's latest publish row.
create function pg_temp.last_log() returns jsonb language sql as $$
  select a.details from public.audit_log a
  where a.business_id = '83000000-0000-4000-b000-000000000001' and a.action = 'schedule.publish'
  order by a.id desc
  limit 1
$$;

-- Someone's line about the week: what it says, its kind, and until when it
-- may reach their phone.
create function pg_temp.line(n text) returns jsonb language sql as $$
  select (l.params - 'week') || jsonb_build_object('kind', l.kind, 'until', l.push_before)
  from public.notifications l
  where l.user_id = pg_temp.person(n)
    and l.dedupe_key = 'schedule:' || (select i.id from ids i where i.name = 'week')
$$;
create function pg_temp.push_of(n text) returns text language sql as $$
  select l.push_state || '/' || coalesce(l.push_after::text, '-')
  from public.notifications l
  where l.user_id = pg_temp.person(n)
    and l.dedupe_key = 'schedule:' || (select i.id from ids i where i.name = 'week')
$$;
-- How many pushes of someone's line about the week a send at `at_time` claims.
create function pg_temp.claimed(n text, at_time timestamptz) returns integer language sql as $$
  select count(*)::integer from public.claim_due_pushes(200, at_time) c
  where c.notification = (
    select l.id from public.notifications l
    where l.user_id = pg_temp.person(n)
      and l.dedupe_key = 'schedule:' || (select i.id from ids i where i.name = 'week')
  )
$$;

-- A line as it should read: of the week of 6 December, under way.
create function pg_temp.said(what text, mine integer, until_at timestamptz, near jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
      'kind', what, 'startsOn', '2026-12-06', 'mine', mine, 'running', true, 'until', until_at
    )
    || (case when near is null then '{}'::jsonb else jsonb_build_object('nearest', near) end)
$$;
-- The change a line names, and when it counts from (its start, or a shift
-- moved, the earlier of its two).
create function pg_temp.near(
  how text, on_day text, shift_name text, starts text, ends text, from_at timestamptz
)
returns jsonb language sql as $$
  select jsonb_build_object(
    'change', how,
    'shift', jsonb_build_object('day', on_day, 'name', shift_name, 'start', starts, 'end', ends),
    'from', from_at
  )
$$;
-- The nearest change between two lists of one person's shifts, on Israel's
-- clock on Tuesday 8 December at 10:00.
create function pg_temp.nearest_of(before_shifts jsonb, after_shifts jsonb)
returns jsonb language sql as $$
  select private.nearest_change(before_shifts, after_shifts, 'Asia/Jerusalem', '2026-12-08 08:00+00')
$$;

------------------------------------------------------------------------------
-- A first publish on Tuesday at 10:00 in Israel (two hours ahead of UTC in
-- December), with Sunday over and Tuesday's morning under way

insert into ids values
  ('week', public.open_schedule_week('83000000-0000-4000-b000-000000000001', '2026-12-06', '2026-12-02 16:00+00'));

-- 3 on Sunday's morning and Tuesday's evening, with 5; 4 on Tuesday's
-- morning; 8 on Wednesday's; 5 and 6 on Thursday's. 7 and 9 on none.
select public.publish_week_schedule('83000000-0000-4000-a000-000000000002', pg_temp.id('week'),
  '[{"day": "2026-12-06", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "83000000-0000-4000-a000-000000000003"}]},
    {"day": "2026-12-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
     "assignees": [{"user": "83000000-0000-4000-a000-000000000004"}]},
    {"day": "2026-12-08", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 2,
     "assignees": [{"user": "83000000-0000-4000-a000-000000000003"},
                   {"user": "83000000-0000-4000-a000-000000000005"}]},
    {"day": "2026-12-09", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "83000000-0000-4000-a000-000000000008"}]},
    {"day": "2026-12-10", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
     "assignees": [{"user": "83000000-0000-4000-a000-000000000005"},
                   {"user": "83000000-0000-4000-a000-000000000006"}]}]',
  null, '2026-12-08 08:00+00', null);
select pg_temp.name_shifts();

select is(
  (select coalesce(array_agg(l.user_id order by l.user_id), '{}'::uuid[])
   from public.notifications l
   where l.dedupe_key = 'schedule:' || pg_temp.id('week') and l.kind = 'schedule.published'),
  array[pg_temp.person('3'), pg_temp.person('5'), pg_temp.person('6'), pg_temp.person('8')],
  'a first publish mid-week tells only those with a shift still to start: not someone whose shift is under way, nor anyone without one'
);
select is(
  (select jsonb_agg(pg_temp.line(p.n) order by p.n) from unnest(array['3', '5', '6', '8']) as p (n)),
  jsonb_build_array(
    pg_temp.said('schedule.published', 1, '2026-12-08 14:00+00', null),
    pg_temp.said('schedule.published', 2, '2026-12-08 14:00+00', null),
    pg_temp.said('schedule.published', 1, '2026-12-10 05:00+00', null),
    pg_temp.said('schedule.published', 1, '2026-12-09 05:00+00', null)
  ),
  'each hears how many of their shifts are left, on the phone until the first of them starts'
);
select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'first', pg_temp.last_log() -> 'running', pg_temp.last_log() -> 'nearest'
  ),
  '[true, true, {}]'::jsonb,
  'its log says the week had begun, and names no change: everything is new to them'
);
select is(
  pg_temp.push_of('3'),
  'queued/2026-12-08 08:00:00+00',
  'a first publish reaches the phone at once'
);

------------------------------------------------------------------------------
-- Published again at 11:00, from what the builder read

insert into screens select 'r1', s.shifts, s.basis from pg_temp.screen() s;

-- The owner has a line from a team change saying the week lacks people, read.
select private.notify('83000000-0000-4000-b000-000000000001',
  array[pg_temp.person('1')], 'schedule.unfilled'::text,
  jsonb_build_object('week', pg_temp.id('week'), 'startsOn', '2026-12-06', 'count', 4),
  null::uuid, 'scheduling'::public.module_key, 'manager'::public.member_role,
  'schedule.unfilled:' || pg_temp.id('week'), at_time => '2026-12-08 08:30+00');
update public.notifications l
set read_at = '2026-12-08 08:40+00'
where l.dedupe_key = 'schedule.unfilled:' || pg_temp.id('week');

-- Tuesday's evening starts at 17:00 now; 8 comes off Wednesday's morning and
-- 5 off Thursday's; 6 is on a new Friday morning; 7 joins Tuesday's morning,
-- under way.
select public.publish_week_schedule('83000000-0000-4000-a000-000000000002', pg_temp.id('week'),
  pg_temp.edit(pg_temp.edit(pg_temp.edit(pg_temp.shifts_of('r1'),
        'evening-08', '{"start": "17:00"}'),
      'morning-09', '{"assignees": []}'),
    'morning-10', '{"assignees": [{"user": "83000000-0000-4000-a000-000000000006"}]}')
  || '[{"day": "2026-12-11", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "83000000-0000-4000-a000-000000000006"}]}]'::jsonb,
  pg_temp.basis_of('r1'),
  '2026-12-08 09:00+00',
  jsonb_build_array(jsonb_build_object(
    'shift', pg_temp.id('morning-08'), 'user', pg_temp.person('7'), 'position', null)));
select pg_temp.name_shifts();

select is(
  (select l.params ->> 'count' || '/' || (l.read_at = '2026-12-08 08:40+00')::text
      || '/' || (l.resolved_at is null)::text
   from public.notifications l
   where l.dedupe_key = 'schedule.unfilled:' || pg_temp.id('week')),
  '2/true/true',
  'the publish counts the shifts ahead that lack someone again, and the line stays read'
);
select is(
  (select coalesce(array_agg(l.user_id order by l.user_id), '{}'::uuid[])
   from public.notifications l
   where l.dedupe_key = 'schedule:' || pg_temp.id('week') and l.kind = 'schedule.changed'),
  array[pg_temp.person('3'), pg_temp.person('5'), pg_temp.person('6'), pg_temp.person('7'),
        pg_temp.person('8')],
  'those whose own shifts changed hear of it, the one who joined included, and not whoever is beside them'
);
select is(
  (select jsonb_agg(pg_temp.line(p.n) order by p.n) from unnest(array['3', '5', '6', '7', '8']) as p (n)),
  jsonb_build_array(
    -- Moved from 16:00, which it counts from.
    pg_temp.said('schedule.changed', 1, '2026-12-08 15:00+00',
      pg_temp.near('moved', '2026-12-08', 'Evening', '17:00', '23:00', '2026-12-08 14:00+00')),
    -- Tuesday's evening is nearer than Thursday's morning, which 5 came off.
    pg_temp.said('schedule.changed', 1, '2026-12-08 15:00+00',
      pg_temp.near('moved', '2026-12-08', 'Evening', '17:00', '23:00', '2026-12-08 14:00+00')),
    pg_temp.said('schedule.changed', 2, '2026-12-11 05:00+00',
      pg_temp.near('added', '2026-12-11', 'Morning', '07:00', '15:00', '2026-12-11 05:00+00')),
    -- Under way: none left to start, and on the phone until it ends.
    pg_temp.said('schedule.changed', 0, '2026-12-08 13:00+00',
      pg_temp.near('added', '2026-12-08', 'Morning', '07:00', '15:00', '2026-12-08 05:00+00')),
    pg_temp.said('schedule.changed', 0, '2026-12-09 05:00+00',
      pg_temp.near('removed', '2026-12-09', 'Morning', '07:00', '15:00', '2026-12-09 05:00+00'))
  ),
  'each hears the nearest shift that changed, as it is now or as it was, and how many are left'
);
select is(
  (select jsonb_object_agg(
      k.key,
      jsonb_build_array(k.value ->> 'change', (select i.name from ids i where i.id = (k.value ->> 'shift')::uuid))
    )
   from jsonb_each(pg_temp.last_log() -> 'nearest') k),
  jsonb_build_object(
    pg_temp.person('3'), jsonb_build_array('moved', 'evening-08'),
    pg_temp.person('5'), jsonb_build_array('moved', 'evening-08'),
    pg_temp.person('6'), jsonb_build_array('added', 'morning-11'),
    pg_temp.person('7'), jsonb_build_array('added', 'morning-08'),
    pg_temp.person('8'), jsonb_build_array('removed', 'morning-09')
  ),
  'the log keeps, for each of them, which shift changed and how, by id'
);
select is(
  pg_temp.last_log() -> 'nearest' -> pg_temp.person('8')::text,
  jsonb_build_object(
    'shift', pg_temp.id('morning-09'),
    'change', 'removed',
    'brief', jsonb_build_object('day', '2026-12-09', 'name', 'Morning', 'start', '07:00', 'end', '15:00'),
    'from', '2026-12-09 05:00+00'::timestamptz,
    'until', '2026-12-09 05:00+00'::timestamptz
  ),
  'with the shift as every member read it and when a push about it is too late, never anyone''s name'
);
select is(
  pg_temp.push_of('3'),
  'queued/2026-12-08 09:02:00+00',
  'a change reaches the phone two minutes after the publish'
);

------------------------------------------------------------------------------
-- A minute later, Tuesday's evening ends at 22:00; 6 is on a new Saturday
-- morning too, beside a new Saturday evening with nobody on it yet

insert into screens select 'r2', s.shifts, s.basis from pg_temp.screen() s;
select public.publish_week_schedule('83000000-0000-4000-a000-000000000002', pg_temp.id('week'),
  pg_temp.edit(pg_temp.shifts_of('r2'), 'evening-08', '{"end": "22:00"}')
  || '[{"day": "2026-12-12", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "83000000-0000-4000-a000-000000000006"}]},
      {"day": "2026-12-12", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
       "assignees": []}]'::jsonb,
  pg_temp.basis_of('r2'), '2026-12-08 09:01+00', null);
select pg_temp.name_shifts();

select is(
  pg_temp.push_of('3') || '/' || (pg_temp.line('3') #>> '{nearest,shift,end}'),
  'queued/2026-12-08 09:03:00+00/22:00',
  'a publish before then replaces the push still waiting with its own, saying what it changed'
);
-- 6 hasn't heard of Friday's morning yet (unread, its push still waiting),
-- which is nearer than Saturday's and still theirs.
select is(
  pg_temp.line('6') || jsonb_build_object('push', pg_temp.push_of('6')),
  pg_temp.said('schedule.changed', 3, '2026-12-11 05:00+00',
      pg_temp.near('added', '2026-12-11', 'Morning', '07:00', '15:00', '2026-12-11 05:00+00'))
    || jsonb_build_object('push', 'queued/2026-12-08 09:03:00+00'),
  'a nearer change not heard of yet stays named, with its shift''s start, in the one push after both'
);
select is(
  (select l.params ->> 'count' || '/' || (l.read_at = '2026-12-08 08:40+00')::text
      || '/' || (l.resolved_at is null)::text
   from public.notifications l
   where l.dedupe_key = 'schedule.unfilled:' || pg_temp.id('week')),
  '2/true/true',
  'a shift published with nobody on it doesn''t raise the count of those a team change freed'
);
select is(
  pg_temp.claimed('3', '2026-12-08 09:02:30+00'),
  0,
  'so nothing goes at the first one''s time'
);
select is(
  pg_temp.claimed('3', '2026-12-08 09:03:00+00'),
  1,
  'and one push goes after the two'
);

------------------------------------------------------------------------------
-- At 23:00, a new shift tomorrow at 06:00, inside 9's quiet hours, and the
-- week filled

insert into screens select 'r3', s.shifts, s.basis from pg_temp.screen() s;
select public.publish_week_schedule('83000000-0000-4000-a000-000000000002', pg_temp.id('week'),
  pg_temp.edit(pg_temp.edit(pg_temp.edit(pg_temp.shifts_of('r3'),
        'morning-09', '{"assignees": [{"user": "83000000-0000-4000-a000-000000000007"}]}'),
      'morning-10', '{"assignees": [{"user": "83000000-0000-4000-a000-000000000004"},
                                    {"user": "83000000-0000-4000-a000-000000000006"}]}'),
    'evening-12', '{"assignees": [{"user": "83000000-0000-4000-a000-000000000008"}]}')
  || '[{"day": "2026-12-09", "name": "Early", "start": "06:00", "end": "14:00", "needed": 1,
       "assignees": [{"user": "83000000-0000-4000-a000-000000000009"}]}]'::jsonb,
  pg_temp.basis_of('r3'), '2026-12-08 21:00+00', null);

select is(
  (select (l.resolved_at = '2026-12-08 21:00+00')::text || '/' || (l.read_at is not null)::text
   from public.notifications l
   where l.dedupe_key = 'schedule.unfilled:' || pg_temp.id('week')),
  'true/true',
  'a publish that leaves no shift ahead lacking someone settles the line, at its moment'
);
select is(
  pg_temp.push_of('9') || '/' || (pg_temp.line('9') ->> 'until')::timestamptz::text
    || '/' || (pg_temp.line('9') #>> '{nearest,change}') || '/' || (pg_temp.line('9') ->> 'mine'),
  'queued/2026-12-09 05:00:00+00/2026-12-09 04:00:00+00/added/1',
  'quiet hours hold the push until 07:00, and it is too late from 06:00, when the shift starts'
);
select is(
  pg_temp.claimed('9', '2026-12-09 05:00:30+00'),
  0,
  'so the first send after quiet hours sends nothing'
);
select is(
  (select l.push_state || '/' || (l.read_at is null)::text
   from public.notifications l
   where l.user_id = pg_temp.person('9') and l.dedupe_key = 'schedule:' || pg_temp.id('week')),
  'skipped/true',
  'and the line stays in the app, unread, as it was from the start'
);

------------------------------------------------------------------------------
-- Which change is the nearest, from the helper itself

-- Wednesday's morning moved to the evening counts from 07:00, so it is
-- nearer than the middle shift that now ends later, from 12:00.
select is(
  pg_temp.nearest_of(
    '[{"shift": "a", "day": "2026-12-09", "start": "07:00", "end": "11:00", "name": "Morning", "position": null},
      {"shift": "b", "day": "2026-12-09", "start": "12:00", "end": "16:00", "name": "Middle", "position": null}]',
    '[{"shift": "a", "day": "2026-12-09", "start": "18:00", "end": "23:00", "name": "Morning", "position": null},
      {"shift": "b", "day": "2026-12-09", "start": "12:00", "end": "17:00", "name": "Middle", "position": null}]'),
  jsonb_build_object(
    'shift', 'a',
    'change', 'moved',
    'brief', jsonb_build_object('day', '2026-12-09', 'name', 'Morning', 'start', '18:00', 'end', '23:00'),
    'from', '2026-12-09 05:00+00'::timestamptz,
    'until', '2026-12-09 16:00+00'::timestamptz
  ),
  'a shift moved counts from the earlier of its two starts, and is named at its hours now'
);
select is(
  pg_temp.nearest_of(
    '[{"shift": "a", "day": "2026-12-09", "start": "07:00", "end": "15:00", "name": "Morning", "position": "till"}]',
    '[{"shift": "a", "day": "2026-12-09", "start": "07:00", "end": "15:00", "name": "Morning", "position": "floor"}]')
    - 'from' - 'until',
  jsonb_build_object(
    'shift', 'a',
    'change', 'edited',
    'brief', jsonb_build_object('day', '2026-12-09', 'name', 'Morning', 'start', '07:00', 'end', '15:00')
  ),
  'another position alone is an edit, not new hours'
);
select is(
  (select r ->> 'shift' || '/' || (r ->> 'change')
   from pg_temp.nearest_of(
     '[{"shift": "a", "day": "2026-12-08", "start": "16:00", "end": "23:00", "name": "Evening", "position": null},
       {"shift": "b", "day": "2026-12-10", "start": "07:00", "end": "15:00", "name": "Morning", "position": null}]',
     '[{"shift": "a", "day": "2026-12-08", "start": "16:00", "end": "23:00", "name": "Closing", "position": null},
       {"shift": "b", "day": "2026-12-10", "start": "08:00", "end": "15:00", "name": "Morning", "position": null}]')
     as n (r)),
  'b/moved',
  'and another name alone too, named only when nothing else changed: new hours later in the week come first'
);

------------------------------------------------------------------------------
-- A week still to come, changed: its push waits two minutes too, and choices
-- saved meanwhile keep them. Around now, since saving them reads the clock.

insert into ids values
  ('later', public.open_schedule_week('83000000-0000-4000-b000-000000000001', '2099-12-06', now()));
select public.publish_week_schedule('83000000-0000-4000-a000-000000000002', pg_temp.id('later'),
  '[{"day": "2099-12-07", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "83000000-0000-4000-a000-000000000003"}]}]',
  null, now() - interval '1 minute', null);
select public.publish_week_schedule('83000000-0000-4000-a000-000000000002', pg_temp.id('later'),
  '[{"day": "2099-12-07", "name": "Morning", "start": "08:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "83000000-0000-4000-a000-000000000003"}]}]',
  null, now() - interval '30 seconds', null);

select is(
  (select l.kind || '/' || l.push_state || '/' || (l.push_after = now() + interval '90 seconds')::text
   from public.notifications l
   where l.user_id = pg_temp.person('3') and l.dedupe_key = 'schedule:' || pg_temp.id('later')),
  'schedule.changed/queued/true',
  'a change to a week still to come reaches the phone two minutes after the publish too'
);
select pg_temp.sign_in('83000000-0000-4000-a000-000000000003');
select public.set_notification_preferences(lock_previews => false);
reset role;
select is(
  (select l.push_state || '/' || (l.push_after = now() + interval '90 seconds')::text
   from public.notifications l
   where l.user_id = pg_temp.person('3') and l.dedupe_key = 'schedule:' || pg_temp.id('later')),
  'queued/true',
  'choices saved 30 seconds after the publish keep the two minutes, so a publish within them still replaces the push'
);

------------------------------------------------------------------------------
-- The helpers are the database's own

select pg_temp.sign_in('83000000-0000-4000-a000-000000000003');
select throws_ok(
  $$select * from private.shifts_ahead('83000000-0000-4000-a000-000000000003',
    '83000000-0000-4000-b000-000000000001', '2026-12-08 08:00+00')$$,
  '42501', null, 'a signed-in person cannot count anyone''s shifts ahead'
);
select throws_ok(
  $$select private.nearest_change('[]', '[]', 'Asia/Jerusalem', '2026-12-08 08:00+00')$$,
  '42501', null, 'nor work out a change'
);
reset role;

select * from finish();
rollback;
