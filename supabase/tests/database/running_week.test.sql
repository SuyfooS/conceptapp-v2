-- What has begun stays as it was (20261115000300_running_week.sql; Orel's
-- answer to Q1 of 15 November 2026 on #1): in a published week, a shift that
-- has begun at the write's moment is never rewritten. Sent as it was read,
-- not read, or left out of a week replaced with nothing read, it keeps its
-- id, its people (someone who has left, or is now the accountant, included)
-- and its swap request; sent changed, or read and left out, the write is
-- refused (55006, 'started', its id). People join a shift under way only
-- through `joins` (a list of them, with a shift of this week and a person
-- each), as active members on the staff with no clash, never one that has
-- ended (55006, 'ended'). A write needs its moment (22023). What it puts in
-- place starts after that moment (22023, 'past'), a week wholly over (its
-- next week's first midnight, and the end of its last shift) no longer
-- changes (55000, 'over'), and a week never published is free: its first
-- publish, mid-week, publishes it as it stands, and its shifts' lists count
-- from then, so none already late opens, nor takes the day's list from a
-- later shift's on time, while a hosted demo's reset ages that stamp so its
-- lists of the day are there. A shift given another pattern counts its lists
-- from then too. Past midnight and over the spring clock change, "begun" is
-- private.shift_span's start, and a shift that change turns inside out
-- holds up no write. The log says whether the week had begun and who
-- joined. Fixed ids (7a…), numbers (9725000050xx) and slugs
-- (rw-…) of its own, and explicit times wherever the clock would matter; the
-- demo's renewal and its lists read the clock as they do, relative to now.
begin;
select plan(41);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('7a000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500005001'),
  ('7a000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500005002'),
  ('7a000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500005003'),
  ('7a000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500005004'),
  ('7a000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500005005'),
  ('7a000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500005006'),
  ('7a000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500005007'),
  ('7a000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500005008'),
  ('7a000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500005009'),
  ('7a000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500005010'),
  ('7a000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500005011'),
  ('7a000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500005012');

-- X: 1 its owner, 2 its manager, 3 to 9 workers (4 becomes its accountant and
-- 8 leaves while a shift of theirs is under way). Y: a a worker. D: b its
-- owner, for the demo's renewal. L: c its owner, a hosted demo with lists.
insert into public.businesses (id, slug, name)
values
  ('7a000000-0000-4000-b000-000000000001', 'rw-x', 'Running X'),
  ('7a000000-0000-4000-b000-000000000002', 'rw-y', 'Running Y'),
  ('7a000000-0000-4000-b000-000000000003', 'rw-renew', 'Running renewal'),
  ('7a000000-0000-4000-b000-000000000004', 'rw-demo-lists', 'Running demo lists');

insert into public.memberships (business_id, user_id, role, active)
values
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000001', 'owner', true),
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000002', 'manager', true),
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000003', 'worker', true),
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000004', 'worker', true),
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000005', 'worker', true),
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000006', 'worker', true),
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000007', 'worker', true),
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000008', 'worker', true),
  ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000009', 'worker', true),
  ('7a000000-0000-4000-b000-000000000002', '7a000000-0000-4000-a000-00000000000a', 'worker', true),
  ('7a000000-0000-4000-b000-000000000003', '7a000000-0000-4000-a000-00000000000b', 'owner', true),
  ('7a000000-0000-4000-b000-000000000004', '7a000000-0000-4000-a000-00000000000c', 'owner', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('7a000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "positions": [{"key": "waiter", "name": "Waiter"}, {"key": "cook", "name": "Cook"}],
     "shifts": [{"key": "morning"}]}'),
  ('7a000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('7a000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('7a000000-0000-4000-b000-000000000003', 'scheduling', true,
   '{"weekStartsOn": 0, "shifts": [{"key": "early", "name": "Early", "days": [0, 1, 2, 3, 4, 5, 6],
     "start": "00:00", "end": "00:30", "needed": 1}]}'),
  ('7a000000-0000-4000-b000-000000000004', 'scheduling', true,
   '{"weekStartsOn": 0, "closedOnShabbat": false, "shifts": [{"key": "late"}]}'),
  ('7a000000-0000-4000-b000-000000000004', 'lists', true, '{}');

-- X's list half an hour before each morning shift, due an hour after it
-- starts; L's at the start of each late shift, due an hour later, saved ten
-- days ago. L is a hosted demo: its reset ticks its times.
insert into public.list_templates (id, business_id, name, archived_at)
values
  ('7a000000-0000-4000-c000-000000000001', '7a000000-0000-4000-b000-000000000001', 'Opening', null),
  ('7a000000-0000-4000-c000-000000000002', '7a000000-0000-4000-b000-000000000004', 'Late check', null);
insert into public.list_template_items (template_id, business_id, position, kind, label)
values
  ('7a000000-0000-4000-c000-000000000001', '7a000000-0000-4000-b000-000000000001', 0, 'check', 'Done'),
  ('7a000000-0000-4000-c000-000000000002', '7a000000-0000-4000-b000-000000000004', 0, 'check', 'Done');
insert into public.list_schedules (
  id, template_id, business_id, position, days, anchor, shift_key, opens_offset, due_offset,
  recipient_kind, recipient_role, active, starts_on, opens_from
)
values
  ('7a000000-0000-4000-e000-000000000001', '7a000000-0000-4000-c000-000000000001',
    '7a000000-0000-4000-b000-000000000001', 0, '{0,1,2,3,4,5,6}', 'shift_start', 'morning', -30, 60,
    'role', 'worker', true, '2026-11-01', '2026-11-01 00:00+00'),
  ('7a000000-0000-4000-e000-000000000002', '7a000000-0000-4000-c000-000000000002',
    '7a000000-0000-4000-b000-000000000004', 0, '{0,1,2,3,4,5,6}', 'shift_start', 'late', 0, 60,
    'role', 'worker', true, (now() at time zone 'Asia/Jerusalem')::date - 10, now() - interval '10 days');
insert into private.demo_businesses (business_id, definition)
values ('7a000000-0000-4000-b000-000000000004', '{"scheduledLists": true}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
-- What a builder read: the shifts it would send back unchanged, and what it saw.
create temporary table screens (name text primary key, shifts jsonb, basis jsonb) on commit drop;
grant all on ids, screens to authenticated;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;
create function pg_temp.person(n text) returns uuid language sql as $$
  select ('7a000000-0000-4000-a000-0000000000' || n)::uuid
$$;

-- These shifts' ids, as the log and the refusals list them: by id.
create function pg_temp.ids_of(keys text[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(i.id order by i.id), '[]'::jsonb) from ids i where i.name = any (keys)
$$;

-- A week as the builder reads it, as whoever is signed in: the shifts with
-- their ids, times as "HH:MM" as the screen keeps them, and what was seen.
create function pg_temp.screen_of(week_name text)
returns table (shifts jsonb, basis jsonb) language sql as $$
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
  from jsonb_array_elements(public.week_shifts((select i.id from ids i where i.name = week_name)))
    with ordinality as t (s, n)
$$;

create function pg_temp.shifts_of(screen text) returns jsonb language sql as $$
  select s.shifts from screens s where s.name = screen
$$;
create function pg_temp.basis_of(screen text) returns jsonb language sql as $$
  select s.basis from screens s where s.name = screen
$$;

-- The payload with one shift changed, or left out; only some of its shifts,
-- and what was seen of only those.
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
create function pg_temp.without(payload jsonb, shift_name text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb)
  from jsonb_array_elements(payload) with ordinality as x (e, o)
  where x.e ->> 'id' is distinct from pg_temp.id(shift_name)::text
$$;
create function pg_temp.keep_shifts(payload jsonb, names text[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb)
  from jsonb_array_elements(payload) with ordinality as x (e, o)
  where (x.e ->> 'id')::uuid in (select i.id from ids i where i.name = any (names))
$$;
create function pg_temp.seen_of(seen jsonb, names text[]) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(b.key, b.value), '{}'::jsonb)
  from jsonb_each(seen) b
  where b.key::uuid in (select i.id from ids i where i.name = any (names))
$$;

-- One person joining a shift, as `joins` names them.
create function pg_temp.joining(shift_name text, who text, pos text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'shift', pg_temp.id(shift_name), 'user', pg_temp.person(who), 'position', pos
  ))
$$;

-- Runs a statement and undoes it: 'ok', or the refusal's code, words, hint
-- and detail.
create function pg_temp.outcome(statement text) returns text language plpgsql as $$
declare
  code text;
  words text;
  why text;
  more text;
begin
  begin
    execute statement;
    raise exception 'tried' using errcode = 'P0001', hint = 'rw-tried';
  exception when others then
    get stacked diagnostics code = returned_sqlstate, words = message_text,
      why = pg_exception_hint, more = pg_exception_detail;
    if why = 'rw-tried' then
      return 'ok';
    end if;
    return concat_ws(' | ', code, words, nullif(why, ''), nullif(more, ''));
  end;
end;
$$;

-- A save or a publish of one of X's weeks by its manager, tried and undone.
create function pg_temp.try(
  what text, week_name text, payload jsonb, seen jsonb, at_time timestamptz, joins jsonb
) returns text language sql as $$
  select pg_temp.outcome(format(
    'select public.%s(%L::uuid, %L::uuid, %L::jsonb, %L::jsonb, %L::timestamptz, %L::jsonb)',
    what, '7a000000-0000-4000-a000-000000000002', pg_temp.id(week_name), payload, seen,
    at_time, joins
  ))
$$;

-- A publish of one of X's weeks by its manager that stays.
create function pg_temp.publish(
  week_name text, payload jsonb, seen jsonb, at_time timestamptz, joins jsonb
) returns integer language sql as $$
  select public.publish_week_schedule('7a000000-0000-4000-a000-000000000002',
    pg_temp.id(week_name), payload, seen, at_time, joins)
$$;

-- The refusals, as pg_temp.outcome reads them.
create function pg_temp.started(names text[]) returns text language sql as $$
  select concat_ws(' | ', '55006', 'Shifts that have begun stay as they are', 'started',
    pg_temp.ids_of(names)::text)
$$;
create function pg_temp.ended(names text[]) returns text language sql as $$
  select concat_ws(' | ', '55006', 'A shift that has ended takes nobody', 'ended',
    pg_temp.ids_of(names)::text)
$$;
create function pg_temp.past(shift_id uuid, on_day text, starts text) returns text language sql as $$
  select concat_ws(' | ', '22023', 'A new or moved shift must start after now', 'past',
    jsonb_build_array(jsonb_build_object('id', shift_id, 'day', on_day, 'start', starts))::text)
$$;

-- X's latest publish row.
create function pg_temp.last_log() returns jsonb language sql as $$
  select a.details from public.audit_log a
  where a.business_id = '7a000000-0000-4000-b000-000000000001' and a.action = 'schedule.publish'
  order by a.id desc
  limit 1
$$;

-- The people on a shift, by id, and a request's state.
create function pg_temp.people(shift_name text) returns text language sql as $$
  select coalesce(string_agg(a.user_id::text || coalesce('=' || a.position_key, ''), ',' order by a.user_id), '')
  from public.shift_assignments a where a.shift_id = pg_temp.id(shift_name)
$$;
create function pg_temp.swap(swap_name text) returns text language sql as $$
  select sw.status::text || '/' || coalesce(
    (select i.name from ids i where i.id = sw.shift_id), 'gone'
  ) || '/' || coalesce(sw.taken_by::text, '-')
  from public.shift_swaps sw where sw.id = pg_temp.id(swap_name)
$$;

------------------------------------------------------------------------------
-- The week of 6 December, published before it begins

insert into ids values
  ('w', public.open_schedule_week('7a000000-0000-4000-b000-000000000001', '2026-12-06', '2026-12-02 16:00+00')),
  ('w2', public.open_schedule_week('7a000000-0000-4000-b000-000000000001', '2026-12-13', '2026-12-09 16:00+00')),
  ('w3', public.open_schedule_week('7a000000-0000-4000-b000-000000000001', '2027-03-21', '2027-03-17 16:00+00'));

-- Israel is two hours ahead of UTC in December. 3 on Sunday's morning and
-- Tuesday's with 8; 4 on Monday's evening; 6 on Tuesday's middle and
-- Thursday's evening; 5 on Tuesday's night, past midnight; 7 on Wednesday's
-- morning.
select is(
  pg_temp.publish('w',
    '[{"day": "2026-12-06", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2, "pattern": "morning",
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000003", "position": "waiter"}]},
      {"day": "2026-12-07", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000004"}]},
      {"day": "2026-12-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2, "pattern": "morning",
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000003", "position": "waiter"},
                     {"user": "7a000000-0000-4000-a000-000000000008"}]},
      {"day": "2026-12-08", "name": "Middle", "start": "11:00", "end": "19:00", "needed": 1,
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000006"}]},
      {"day": "2026-12-08", "name": "Night", "start": "22:00", "end": "06:00", "needed": 1,
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000005"}]},
      {"day": "2026-12-09", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1, "pattern": "morning",
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000007"}]},
      {"day": "2026-12-10", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000006"}]}]',
    null, '2026-12-02 08:00+00', null),
  7,
  'a week published before it begins'
);

insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.week_id = pg_temp.id('w');

select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'running', pg_temp.last_log() -> 'joined',
    (select bool_and(s.opens_lists_from = '2026-12-02 08:00+00')
     from public.schedule_shifts s where s.week_id = pg_temp.id('w'))
  ),
  '[false, [], true]'::jsonb,
  'its log says it had not begun, and its shifts'' lists count from then'
);

-- On Monday 3 gives Tuesday's morning away and 5 takes it, waiting for
-- approval. On Tuesday at 09:00 in Israel, with that morning under way, 8 is
-- taken off the team and 4 becomes the accountant.
insert into ids values
  ('s-tue', public.request_shift_swap('7a000000-0000-4000-a000-000000000003',
    pg_temp.id('morning-08'), null, '2026-12-07 08:00+00'));
select public.take_shift_swap('7a000000-0000-4000-a000-000000000005', pg_temp.id('s-tue'),
  '2026-12-07 09:00+00');
select public.remove_member('7a000000-0000-4000-a000-000000000001',
  '7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000008',
  '2026-12-08 07:00+00');
select public.set_member_role('7a000000-0000-4000-a000-000000000001',
  '7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000004',
  'accountant', at_time => '2026-12-08 07:00+00');

select is(
  array[pg_temp.people('morning-08'), pg_temp.people('evening-07')],
  array['7a000000-0000-4000-a000-000000000003=waiter,7a000000-0000-4000-a000-000000000008',
        '7a000000-0000-4000-a000-000000000004'],
  'someone taken off the team and someone now the accountant stay on what had begun'
);

------------------------------------------------------------------------------
-- Tuesday at 10:00 in Israel (08:00 UTC): sent as it was read, all stays

select pg_temp.sign_in('7a000000-0000-4000-a000-000000000002');
insert into screens select 'r1', s.shifts, s.basis from pg_temp.screen_of('w') s;
reset role;

select is(
  pg_temp.publish('w', pg_temp.shifts_of('r1'), pg_temp.basis_of('r1'), '2026-12-08 08:00+00', null),
  7,
  'a week under way, sent back as it was read, publishes'
);
select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'kept', pg_temp.last_log() -> 'edited', pg_temp.last_log() -> 'running'
  ),
  jsonb_build_array(
    pg_temp.ids_of(array['morning-06', 'evening-07', 'morning-08', 'middle-08', 'night-08',
      'morning-09', 'evening-10']),
    '[]'::jsonb, true
  ),
  'every shift kept as it was, someone who left and the accountant on theirs, and the log says the week had begun'
);

-- Changed or left out, what has begun is refused, an ended shift too.
select is(
  array[
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r1'), 'morning-08', '{"start": "08:00"}'),
      pg_temp.basis_of('r1'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r1'), 'morning-08', '{"needed": 3}'),
      pg_temp.basis_of('r1'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r1'), 'morning-08', '{"name": "Opening"}'),
      pg_temp.basis_of('r1'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r1'), 'morning-08',
        '{"assignees": [{"user": "7a000000-0000-4000-a000-000000000003", "position": "waiter"},
                        {"user": "7a000000-0000-4000-a000-000000000008"},
                        {"user": "7a000000-0000-4000-a000-000000000009"}]}'),
      pg_temp.basis_of('r1'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r1'), 'morning-08',
        '{"assignees": [{"user": "7a000000-0000-4000-a000-000000000003", "position": "cook"},
                        {"user": "7a000000-0000-4000-a000-000000000008"}]}'),
      pg_temp.basis_of('r1'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.without(pg_temp.shifts_of('r1'), 'morning-08'),
      pg_temp.basis_of('r1'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r1'), 'evening-07', '{"name": "Late"}'),
      pg_temp.basis_of('r1'), '2026-12-08 08:00+00', null)
  ],
  array[
    pg_temp.started(array['morning-08']), pg_temp.started(array['morning-08']),
    pg_temp.started(array['morning-08']), pg_temp.started(array['morning-08']),
    pg_temp.started(array['morning-08']), pg_temp.started(array['morning-08']),
    pg_temp.started(array['evening-07'])
  ],
  'a shift under way refuses other hours, people needed, a name, people or a position, and its removal; so does one over'
);

-- With no moment, every rule above would read the week as still to come.
select is(
  array[
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r1'), 'morning-08', '{"start": "08:00"}'),
      pg_temp.basis_of('r1'), null, null),
    pg_temp.try('save_week_schedule', 'w2', '[]', null, null, null)
  ],
  array['22023 | A write needs its moment', '22023 | A write needs its moment'],
  'a publish or a save with no moment is refused'
);

------------------------------------------------------------------------------
-- Left out: what has begun stays, with its request

-- The screen sends what is still to start: Tuesday's middle follows the
-- morning pattern now, Wednesday needs two, Thursday's evening starts at
-- 17:00, and 5 works a new shift from noon.
select is(
  pg_temp.publish('w',
    pg_temp.edit(
      pg_temp.edit(
        pg_temp.edit(
          pg_temp.keep_shifts(pg_temp.shifts_of('r1'), array['middle-08', 'night-08', 'morning-09', 'evening-10']),
          'middle-08', '{"pattern": "morning"}'),
        'morning-09', '{"needed": 2}'),
      'evening-10', '{"start": "17:00"}')
    || '[{"day": "2026-12-08", "name": "Extra", "start": "12:00", "end": "18:00", "needed": 1,
          "assignees": [{"user": "7a000000-0000-4000-a000-000000000005"}]}]'::jsonb,
    pg_temp.seen_of(pg_temp.basis_of('r1'), array['middle-08', 'night-08', 'morning-09', 'evening-10']),
    '2026-12-08 08:00+00', null),
  8,
  'a week under way publishes what is still to start, with a shift added'
);
insert into ids
select 'extra-08', s.id from public.schedule_shifts s
where s.week_id = pg_temp.id('w') and s.name = 'Extra';

select is(
  array[pg_temp.people('morning-08'), pg_temp.people('evening-07'), pg_temp.swap('s-tue')],
  array['7a000000-0000-4000-a000-000000000003=waiter,7a000000-0000-4000-a000-000000000008',
        '7a000000-0000-4000-a000-000000000004',
        'taken/morning-08/7a000000-0000-4000-a000-000000000005'],
  'what has begun keeps its id, its people and its request, though its taker now works at the same time'
);
select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'edited', jsonb_array_length(pg_temp.last_log() -> 'kept'),
    pg_temp.last_log() -> 'added', pg_temp.last_log() -> 'reopened'
  ),
  jsonb_build_array(
    pg_temp.ids_of(array['middle-08', 'morning-09', 'evening-10']), 4, pg_temp.ids_of(array['extra-08']),
    '[]'::jsonb
  ),
  'the log keeps the shifts not sent, and opens no request again'
);
select is(
  array[
    (select s.opens_lists_from from public.schedule_shifts s where s.id = pg_temp.id('extra-08')),
    (select s.opens_lists_from from public.schedule_shifts s where s.id = pg_temp.id('middle-08')),
    (select s.opens_lists_from from public.schedule_shifts s where s.id = pg_temp.id('morning-09')),
    (select s.opens_lists_from from public.schedule_shifts s where s.id = pg_temp.id('evening-10'))
  ],
  array['2026-12-08 08:00+00', '2026-12-08 08:00+00', '2026-12-02 08:00+00', '2026-12-08 08:00+00']::timestamptz[],
  'a shift added, moved or given another pattern counts its lists from then; one otherwise changed, from before'
);

------------------------------------------------------------------------------
-- Nothing is put in place before now, nor beside what is under way

select pg_temp.sign_in('7a000000-0000-4000-a000-000000000002');
insert into screens select 'r2', s.shifts, s.basis from pg_temp.screen_of('w') s;
reset role;

select is(
  array[
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.shifts_of('r2')
        || '[{"day": "2026-12-08", "name": "Early", "start": "09:00", "end": "12:00", "needed": 1}]'::jsonb,
      pg_temp.basis_of('r2'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.shifts_of('r2')
        || '[{"day": "2026-12-08", "name": "Now", "start": "10:00", "end": "12:00", "needed": 1}]'::jsonb,
      pg_temp.basis_of('r2'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r2'), 'morning-09', '{"day": "2026-12-08", "start": "09:30"}'),
      pg_temp.basis_of('r2'), '2026-12-08 08:00+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.shifts_of('r2')
        || '[{"day": "2026-12-08", "name": "Soon", "start": "10:01", "end": "12:00", "needed": 1}]'::jsonb,
      pg_temp.basis_of('r2'), '2026-12-08 08:00+00', null)
  ],
  array[
    pg_temp.past(null, '2026-12-08', '09:00'),
    pg_temp.past(null, '2026-12-08', '10:00'),
    pg_temp.past(pg_temp.id('morning-09'), '2026-12-08', '09:30'),
    'ok'
  ],
  'a shift added, or one still to start moved, at or before now is refused, and one a minute later is not'
);
select is(
  pg_temp.try('publish_week_schedule', 'w',
    pg_temp.shifts_of('r2')
      || '[{"day": "2026-12-08", "name": "Afternoon", "start": "13:00", "end": "17:00", "needed": 1,
            "assignees": [{"user": "7a000000-0000-4000-a000-000000000003"}]}]'::jsonb,
    pg_temp.basis_of('r2'), '2026-12-08 08:00+00', null),
  '22023 | A person works two shifts at once',
  'someone on a shift under way is not put on another at the same time'
);

------------------------------------------------------------------------------
-- Joining a shift under way (Orel's answer 1)

select is(
  array[
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', pg_temp.joining('morning-08', '0a', null)),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', pg_temp.joining('morning-08', '04', null)),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', pg_temp.joining('morning-08', '06', null)),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', pg_temp.joining('morning-08', '03', null)),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00',
      pg_temp.joining('morning-08', '09', null) || pg_temp.joining('morning-08', '09', 'waiter')),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', pg_temp.joining('morning-08', '09', 'chef')),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', pg_temp.joining('morning-09', '09', null)),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', pg_temp.joining('morning-06', '09', null))
  ],
  array[
    '22023 | Only active members of the business can work a shift',
    '42501 | An accountant is not on the staff',
    '22023 | A person works two shifts at once',
    '22023 | Each person needs an id and is on a shift once',
    '22023 | Each person needs an id and is on a shift once',
    '22023 | Unknown position',
    '22023 | A join is for a shift of this week under way',
    pg_temp.ended(array['morning-06'])
  ],
  'nobody joins a shift under way from another business, as the accountant, at the same time as another shift, twice, in an unknown position, nor joins one still to start or over'
);
select is(
  array[
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', '{}'),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00',
      (select jsonb_agg(pg_temp.joining('morning-08', '09', null) -> 0) from generate_series(1, 201))),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', jsonb_build_array(jsonb_build_object('user', pg_temp.person('09')))),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00',
      jsonb_build_array(jsonb_build_object('shift', 'x', 'user', pg_temp.person('09')))),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'),
      '2026-12-08 08:00+00', '[1]')
  ],
  array[
    '22023 | Joins must be a list',
    '22023 | Too many joins',
    '22023 | Each join needs a shift, a person and a position or none',
    '22023 | Each join needs a shift, a person and a position or none',
    '22023 | Each join needs a shift, a person and a position or none'
  ],
  'joins that are not a list, more than 200, without a shift, with a shift that is no id, or not objects are refused'
);
select is(
  pg_temp.publish('w', pg_temp.shifts_of('r2'), pg_temp.basis_of('r2'), '2026-12-08 08:00+00',
    pg_temp.joining('morning-08', '09', 'waiter')),
  8,
  'someone joins a shift under way'
);
select is(
  pg_temp.people('morning-08'),
  '7a000000-0000-4000-a000-000000000003=waiter,7a000000-0000-4000-a000-000000000008,'
    || '7a000000-0000-4000-a000-000000000009=waiter',
  'next to its people, the shift itself as it was'
);
select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'joined', pg_temp.last_log() -> 'changed',
    jsonb_array_length(pg_temp.last_log() -> 'kept')
  ),
  jsonb_build_array(
    jsonb_build_array(jsonb_build_object('shift', pg_temp.id('morning-08'), 'user', pg_temp.person('09'))),
    jsonb_build_array(pg_temp.person('09')),
    8
  ),
  'the log says who joined which shift, and only their shifts changed'
);

------------------------------------------------------------------------------
-- Past midnight: Tuesday's night began at 22:00 and ends at 06:00

select pg_temp.sign_in('7a000000-0000-4000-a000-000000000002');
insert into screens select 'r3', s.shifts, s.basis from pg_temp.screen_of('w') s;
reset role;

select is(
  array[
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r3'), 'night-08', '{"needed": 2}'),
      pg_temp.basis_of('r3'), '2026-12-08 19:59+00', null),
    pg_temp.try('publish_week_schedule', 'w',
      pg_temp.edit(pg_temp.shifts_of('r3'), 'night-08', '{"needed": 2}'),
      pg_temp.basis_of('r3'), '2026-12-09 00:00+00', null),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r3'), pg_temp.basis_of('r3'),
      '2026-12-09 00:00+00', pg_temp.joining('night-08', '06', null)),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r3'), pg_temp.basis_of('r3'),
      '2026-12-09 04:00+00', pg_temp.joining('night-08', '06', null))
  ],
  array['ok', pg_temp.started(array['night-08']), 'ok', pg_temp.ended(array['night-08'])],
  'a shift past midnight has begun from its start the day before, and takes people until its end'
);

------------------------------------------------------------------------------
-- Replaced with nothing read, what has begun stays

select is(
  pg_temp.publish('w',
    '[{"day": "2026-12-09", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1, "pattern": "morning",
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000007"}]},
      {"day": "2026-12-10", "name": "Evening", "start": "17:00", "end": "23:00", "needed": 1,
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000006"}]}]',
    null, '2026-12-09 01:00+00', null),
  8,
  'a week under way published with nothing read'
);
select is(
  jsonb_build_array(
    pg_temp.people('morning-08'), pg_temp.last_log() -> 'removed',
    jsonb_array_length(pg_temp.last_log() -> 'kept')
  ),
  jsonb_build_array(
    '7a000000-0000-4000-a000-000000000003=waiter,7a000000-0000-4000-a000-000000000008,'
      || '7a000000-0000-4000-a000-000000000009=waiter',
    pg_temp.ids_of(array['morning-09', 'evening-10']), 6
  ),
  'keeps what has begun with its people, someone who left included, and replaces only what is still to start'
);

------------------------------------------------------------------------------
-- A week wholly over: its last midnight in Israel is 22:00 UTC on Saturday

select pg_temp.sign_in('7a000000-0000-4000-a000-000000000002');
insert into screens select 'r5', s.shifts, s.basis from pg_temp.screen_of('w') s;
reset role;

select is(
  array[
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r5'), pg_temp.basis_of('r5'),
      '2026-12-12 21:59+00', null),
    pg_temp.try('save_week_schedule', 'w', pg_temp.shifts_of('r5'), pg_temp.basis_of('r5'),
      '2026-12-12 21:59+00', null),
    pg_temp.try('publish_week_schedule', 'w', pg_temp.shifts_of('r5'), pg_temp.basis_of('r5'),
      '2026-12-12 22:00+00', null),
    pg_temp.try('save_week_schedule', 'w', pg_temp.shifts_of('r5'), pg_temp.basis_of('r5'),
      '2026-12-12 22:00+00', null)
  ],
  array[
    'ok',
    '55000 | This week is published; publish the changes instead',
    '55000 | This week is over | over',
    '55000 | This week is over | over'
  ],
  'a week no longer changes once it has wholly ended, and is never saved as a draft'
);

-- Unless a shift of its last day runs past that midnight: Saturday's late
-- shift, from 20:00 to 02:00 in Israel (18:00 to 00:00 UTC), added on
-- Saturday morning.
select is(
  pg_temp.publish('w',
    '[{"day": "2026-12-12", "name": "Late", "start": "20:00", "end": "02:00", "needed": 2}]',
    '{}', '2026-12-12 08:00+00', null),
  9,
  'the week''s last day gets a shift past midnight'
);
insert into ids
select 'late-12', s.id from public.schedule_shifts s
where s.week_id = pg_temp.id('w') and s.name = 'Late';

select is(
  array[
    pg_temp.try('publish_week_schedule', 'w', '[]', '{}', '2026-12-12 22:30+00',
      pg_temp.joining('late-12', '07', null)),
    pg_temp.try('publish_week_schedule', 'w', '[]', '{}', '2026-12-13 00:00+00',
      pg_temp.joining('late-12', '07', null))
  ],
  array['ok', '55000 | This week is over | over'],
  'it takes people after the next week''s first midnight until it ends, and then the week is over'
);

------------------------------------------------------------------------------
-- The spring change: 02:30 on 26 March 2027 doesn't exist in Israel. The
-- brief shift from 02:30 to 03:00 that night ends (03:00 summer time, 00:00
-- UTC) before it starts (00:30 UTC): a range of it would fail.

select pg_temp.publish('w3',
  '[{"day": "2027-03-26", "name": "Early", "start": "02:30", "end": "08:00", "needed": 1,
     "assignees": [{"user": "7a000000-0000-4000-a000-000000000009"}]},
    {"day": "2027-03-26", "name": "Brief", "start": "02:30", "end": "03:00", "needed": 1}]',
  null, '2027-03-17 08:00+00', null);
insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.week_id = pg_temp.id('w3');

select is(
  lower(private.shift_span(pg_temp.id('early-26'))),
  '2027-03-26 00:30+00'::timestamptz,
  'a start the clocks skip is 03:30 summer time, as Postgres reads it'
);

select pg_temp.sign_in('7a000000-0000-4000-a000-000000000002');
insert into screens select 'r4', s.shifts, s.basis from pg_temp.screen_of('w3') s;
reset role;

select is(
  array[
    pg_temp.try('publish_week_schedule', 'w3',
      pg_temp.edit(pg_temp.shifts_of('r4'), 'early-26', '{"needed": 2}'),
      pg_temp.basis_of('r4'), '2027-03-26 00:29+00', null),
    pg_temp.try('publish_week_schedule', 'w3',
      pg_temp.edit(pg_temp.shifts_of('r4'), 'early-26', '{"needed": 2}'),
      pg_temp.basis_of('r4'), '2027-03-26 00:30+00', null)
  ],
  array['ok', pg_temp.started(array['early-26'])],
  'and it has begun from that moment, not a minute before'
);
select is(
  array[
    pg_temp.try('publish_week_schedule', 'w3', pg_temp.shifts_of('r4'), pg_temp.basis_of('r4'),
      '2027-03-26 00:30+00', pg_temp.joining('early-26', '03', null)),
    pg_temp.try('publish_week_schedule', 'w3',
      pg_temp.edit(pg_temp.shifts_of('r4'), 'brief-26', '{"needed": 2}'),
      pg_temp.basis_of('r4'), '2027-03-26 00:30+00', null),
    pg_temp.try('publish_week_schedule', 'w3', pg_temp.shifts_of('r4'), pg_temp.basis_of('r4'),
      '2027-03-26 00:30+00', pg_temp.joining('brief-26', '03', null))
  ],
  array['ok', pg_temp.started(array['brief-26']), pg_temp.ended(array['brief-26'])],
  'a shift the change turns inside out holds up no write of its week: it has begun from its start, and ended at its end'
);

------------------------------------------------------------------------------
-- A week never published is free, and its first publish opens no late list

-- Saved on Tuesday 15 December at 11:00 in Israel: Sunday's morning is over
-- and Tuesday's under way; Tuesday's afternoon, of the morning pattern too,
-- starts at 14:00.
select is(
  public.save_week_schedule('7a000000-0000-4000-a000-000000000002', pg_temp.id('w2'),
    '[{"day": "2026-12-13", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1, "pattern": "morning",
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000003"}]},
      {"day": "2026-12-15", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1, "pattern": "morning",
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000003"}]},
      {"day": "2026-12-15", "name": "Afternoon", "start": "14:00", "end": "20:00", "needed": 1, "pattern": "morning"},
      {"day": "2026-12-16", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1, "pattern": "morning",
       "assignees": [{"user": "7a000000-0000-4000-a000-000000000007"}]}]',
    at_time => '2026-12-15 09:00+00'),
  4,
  'a week never published is saved with a shift over and one under way'
);
insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.week_id = pg_temp.id('w2');

select pg_temp.sign_in('7a000000-0000-4000-a000-000000000002');
insert into screens select 'r6', s.shifts, s.basis from pg_temp.screen_of('w2') s;
reset role;

select is(
  array[
    pg_temp.try('save_week_schedule', 'w2',
      pg_temp.edit(pg_temp.shifts_of('r6'), 'morning-13', '{"needed": 2}')
        || '[{"day": "2026-12-15", "name": "Early", "start": "08:00", "end": "12:00", "needed": 1}]'::jsonb,
      pg_temp.basis_of('r6'), '2026-12-15 09:30+00', null),
    pg_temp.try('save_week_schedule', 'w2', pg_temp.shifts_of('r6'), pg_temp.basis_of('r6'),
      '2026-12-15 09:30+00', pg_temp.joining('morning-15', '09', null))
  ],
  array['ok', '22023 | A join is for a shift of this week under way'],
  'its draft changes a shift over and takes one that would start before now, and nothing in it is under way to join'
);

select is(
  pg_temp.publish('w2', pg_temp.shifts_of('r6'), pg_temp.basis_of('r6'), '2026-12-15 10:00+00', null),
  4,
  'its first publish, in the middle of the week, publishes it as it stands'
);
select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'first', pg_temp.last_log() -> 'running',
    (select bool_and(s.opens_lists_from = '2026-12-15 10:00+00')
     from public.schedule_shifts s where s.week_id = pg_temp.id('w2'))
  ),
  '[true, true, true]'::jsonb,
  'the first time, once the week had begun, and every shift''s lists count from then'
);

-- Tuesday's list for its morning opened at 06:30 in Israel and was due at
-- 08:00, before the publish; for its afternoon it opens at 13:30 (11:30 UTC),
-- due at 15:00; Wednesday's opens at 06:30 the next day.
select is(
  private.lists_tick('2026-12-15 10:01+00', '7a000000-0000-4000-b000-000000000001'),
  0,
  'a first publish in the middle of the week opens no list already late'
);
select is(
  private.lists_tick('2026-12-15 11:31+00', '7a000000-0000-4000-b000-000000000001'),
  1,
  'nor lets the late one take the day''s list from a later shift of its pattern'
);
select private.lists_tick('2026-12-16 04:31+00', '7a000000-0000-4000-b000-000000000001');
select is(
  (select string_agg(l.occurs_on::text || ' ' || to_char(l.opens_at at time zone 'UTC', 'HH24:MI'), ','
     order by l.occurs_on)
   from public.lists l
   where l.schedule_id = '7a000000-0000-4000-e000-000000000001'),
  '2026-12-15 11:30,2026-12-16 04:30',
  'which opens in its time, and so does the next day''s'
);

-- Through this week, nobody joins a shift of another, though it has begun.
select is(
  pg_temp.try('publish_week_schedule', 'w2', pg_temp.shifts_of('r6'), pg_temp.basis_of('r6'),
    '2026-12-15 10:30+00', pg_temp.joining('morning-08', '09', null)),
  '22023 | A join is for a shift of this week under way',
  'a join on a shift of another week is refused'
);

-- Saving it, once published, follows the same rules before it is refused.
select is(
  array[
    pg_temp.try('save_week_schedule', 'w2',
      pg_temp.edit(pg_temp.shifts_of('r6'), 'morning-15', '{"needed": 2}'),
      pg_temp.basis_of('r6'), '2026-12-15 10:30+00', null),
    pg_temp.try('save_week_schedule', 'w2', pg_temp.shifts_of('r6'), pg_temp.basis_of('r6'),
      '2026-12-15 10:30+00', null)
  ],
  array[
    pg_temp.started(array['morning-15']),
    '55000 | This week is published; publish the changes instead'
  ],
  'a save of the week once published follows the same rules, and is still not saved as a draft'
);

------------------------------------------------------------------------------
-- The demo's renewal, now: this week, under way

select is(
  private.renew_demo_schedule('7a000000-0000-4000-b000-000000000003'),
  true,
  'the demo''s renewal publishes this week, under way'
);
select ok(
  (select count(*) = 7 and bool_or(lower(private.shift_span(s.id)) <= now())
   from public.schedule_shifts s
   join public.schedule_weeks w on w.id = s.week_id
   where s.business_id = '7a000000-0000-4000-b000-000000000003'
     and w.schedule_published_at is not null),
  'with every shift of the week, what has begun included'
);

------------------------------------------------------------------------------
-- A hosted demo's lists of the day, now

-- L publishes, for the first time, a late shift that began three hours ago:
-- its list was due two hours ago.
insert into ids
select 'l-week', public.open_schedule_week('7a000000-0000-4000-b000-000000000004',
  d.day - extract(dow from d.day)::integer, now() + interval '1 day')
from (select ((now() - interval '3 hours') at time zone 'Asia/Jerusalem')::date as day) d;
select public.publish_week_schedule('7a000000-0000-4000-a000-00000000000c', pg_temp.id('l-week'),
  jsonb_build_array(jsonb_build_object(
    'day', ((now() - interval '3 hours') at time zone 'Asia/Jerusalem')::date,
    'name', 'Late',
    'start', to_char((now() - interval '3 hours') at time zone 'Asia/Jerusalem', 'HH24:MI'),
    'end', to_char((now() - interval '90 minutes') at time zone 'Asia/Jerusalem', 'HH24:MI'),
    'needed', 1,
    'pattern', 'late'
  )));

select is(
  private.lists_tick(now(), '7a000000-0000-4000-b000-000000000004'),
  0,
  'a shift published after its list was due opens none'
);
select private.seed_demo_lists('7a000000-0000-4000-b000-000000000004');
select is(
  (select count(*)::integer from public.lists l
   where l.schedule_id = '7a000000-0000-4000-e000-000000000002'),
  1,
  'but a hosted demo''s reset ages its shifts with its times, so its list of the day is there'
);

------------------------------------------------------------------------------
-- Only the server writes

select ok(
  to_regprocedure('public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)') is null
  and to_regprocedure('public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)') is null
  and to_regprocedure('private.write_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)') is null
  and has_function_privilege('service_role',
    'public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)', 'execute')
  and has_function_privilege('service_role',
    'public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)', 'execute')
  and not has_function_privilege('authenticated',
    'public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)', 'execute')
  and not has_function_privilege('authenticated',
    'public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)', 'execute')
  and not has_function_privilege('anon',
    'public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)', 'execute')
  and not has_function_privilege('authenticated',
    'private.write_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)', 'execute')
  and not has_function_privilege('service_role',
    'private.write_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)', 'execute'),
  'only the secret key saves and publishes, joins too; the five-argument ones are gone, and nobody reaches the write'
);

select * from finish();
rollback;
