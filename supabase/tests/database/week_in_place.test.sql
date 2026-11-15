-- Writing a week in place (20261115000100_week_in_place.sql; Orel's answers of
-- 15 November 2026 on #1): a week's shifts are read with what was seen of each
-- (public.week_shifts, under the policies), and a save or a publish that sends
-- that back writes only what changed. A shift sent as it was read keeps its id,
-- its people and its swap requests, whatever happened to it since (a swap
-- approved, someone taken off the team, a position taken out of the settings);
-- one changed is written in place, people and positions, unless it changed
-- meanwhile (40001, 'moved', its id in the detail); one added meanwhile stays;
-- one deleted meanwhile is skipped. A request ends only when its shift's day or
-- hours change, its asker comes off it or the shift goes (both people told),
-- opens again when its taker is put on the shift directly or now works at the
-- same time, and otherwise waits on, offered only to whoever may still take
-- it. Without a basis the week is replaced, as before. Fixed ids (8f…),
-- numbers (972500004801…) and slugs (wip-…) of its own, and explicit times, so
-- nothing here meets the seeded people or the clock.
begin;
select plan(78);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('8f000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004801'),
  ('8f000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004802'),
  ('8f000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004803'),
  ('8f000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004804'),
  ('8f000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500004805'),
  ('8f000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500004806'),
  ('8f000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500004807'),
  ('8f000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500004808');

-- X: 1 its owner, 2 its manager, 3 4 5 and 8 workers. Y: 7 its manager, 6 a
-- worker.
insert into public.businesses (id, slug, name)
values
  ('8f000000-0000-4000-b000-000000000001', 'wip-x', 'In place X'),
  ('8f000000-0000-4000-b000-000000000002', 'wip-y', 'In place Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000001', 'owner', true),
  ('8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000002', 'manager', true),
  ('8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000003', 'worker', true),
  ('8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000004', 'worker', true),
  ('8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000005', 'worker', true),
  ('8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000008', 'worker', true),
  ('8f000000-0000-4000-b000-000000000002', '8f000000-0000-4000-a000-000000000007', 'manager', true),
  ('8f000000-0000-4000-b000-000000000002', '8f000000-0000-4000-a000-000000000006', 'worker', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('8f000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "positions": [{"key": "waiter", "name": "Waiter"}, {"key": "cook", "name": "Cook"}]}'),
  ('8f000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('8f000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 0}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Runs a statement and undoes it: 'ok', or the refusal's code, hint and detail.
create function pg_temp.outcome(statement text) returns text language plpgsql as $$
declare
  code text;
  why text;
  more text;
begin
  begin
    execute statement;
    raise exception 'tried' using errcode = 'P0001', hint = 'wip-tried';
  exception when others then
    get stacked diagnostics code = returned_sqlstate, why = pg_exception_hint,
      more = pg_exception_detail;
    if why = 'wip-tried' then
      return 'ok';
    end if;
    return code || coalesce(':' || nullif(why, ''), '') || coalesce(':' || nullif(more, ''), '');
  end;
end;
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
-- What a builder read: the shifts it would send back unchanged, and what it saw.
create temporary table screens (name text primary key, shifts jsonb, basis jsonb) on commit drop;
grant all on ids, screens to authenticated;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- The ids of these shifts or requests as the log lists them: by id.
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

-- The payload with one shift changed, or left out.
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

create function pg_temp.publish(actor uuid, payload jsonb, seen jsonb, at_time timestamptz)
returns integer language sql as $$
  select public.publish_week_schedule(actor, pg_temp.id('week'), payload, seen, at_time)
$$;

-- X's latest publish row.
create function pg_temp.last_log() returns jsonb language sql as $$
  select a.details from public.audit_log a
  where a.business_id = '8f000000-0000-4000-b000-000000000001' and a.action = 'schedule.publish'
  order by a.id desc
  limit 1
$$;

-- Who has a line in X about `thing`, of this kind; and whose line still waits.
create function pg_temp.who(what text, thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '8f000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and n.kind = what
$$;
create function pg_temp.waiting(thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '8f000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and n.resolved_at is null
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
-- The week, published as before (no basis), and a draft

insert into ids values
  ('week', public.open_schedule_week('8f000000-0000-4000-b000-000000000001', '2026-11-22', '2026-11-18 16:00+00')),
  ('draft', public.open_schedule_week('8f000000-0000-4000-b000-000000000001', '2026-11-29', '2026-11-25 16:00+00')),
  ('y-week', public.open_schedule_week('8f000000-0000-4000-b000-000000000002', '2026-11-22', '2026-11-18 16:00+00'));

-- 3 on Sunday and Wednesday, 4 on Monday and Thursday (with 8), 5 on Tuesday
-- and Friday.
select public.publish_week_schedule('8f000000-0000-4000-a000-000000000002', pg_temp.id('week'),
  '[{"day": "2026-11-22", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2, "pattern": "morning",
     "assignees": [{"user": "8f000000-0000-4000-a000-000000000003", "position": "waiter"}]},
    {"day": "2026-11-23", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
     "assignees": [{"user": "8f000000-0000-4000-a000-000000000004"}]},
    {"day": "2026-11-24", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8f000000-0000-4000-a000-000000000005"}]},
    {"day": "2026-11-25", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
     "assignees": [{"user": "8f000000-0000-4000-a000-000000000003"}]},
    {"day": "2026-11-26", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
     "assignees": [{"user": "8f000000-0000-4000-a000-000000000004"}, {"user": "8f000000-0000-4000-a000-000000000008"}]},
    {"day": "2026-11-27", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8f000000-0000-4000-a000-000000000005"}]}]',
  at_time => '2026-11-18 08:00+00');
select public.save_week_schedule('8f000000-0000-4000-a000-000000000002', pg_temp.id('draft'),
  '[{"day": "2026-11-29", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8f000000-0000-4000-a000-000000000003"}]},
    {"day": "2026-11-30", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1}]');
select public.publish_week_schedule('8f000000-0000-4000-a000-000000000007', pg_temp.id('y-week'),
  '[{"day": "2026-11-22", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1}]');

insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.week_id = pg_temp.id('week');
insert into ids
select 'draft-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.week_id = pg_temp.id('draft');
insert into ids
select 'y-shift', s.id from public.schedule_shifts s where s.week_id = pg_temp.id('y-week');

------------------------------------------------------------------------------
-- Reading a week with what was seen, under the policies

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer
   from jsonb_array_elements(public.week_shifts((select id from ids where name = 'week'))) as t (s)
   where t.s ->> 'seen' ~ '^[0-9a-f]{32}$'),
  6,
  'a manager reads the week, each shift with what was seen of it'
);
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000003');
select is(
  jsonb_array_length(public.week_shifts((select id from ids where name = 'week'))),
  6,
  'a worker reads the published week the same way'
);
select is(
  public.week_shifts((select id from ids where name = 'draft')),
  '[]'::jsonb,
  'but nothing of a draft'
);
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000006');
select is(
  public.week_shifts((select id from ids where name = 'week')),
  '[]'::jsonb,
  'and a worker of another business nothing of it'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.week_shifts(gen_random_uuid())$$,
  '42501', null, 'an anonymous visitor cannot read through it'
);
reset role;

select is_empty(
  $$select (t.s ->> 'id')::uuid, t.s ->> 'seen'
    from jsonb_array_elements(public.week_shifts(pg_temp.id('week'))) as t (s)
    except
    select d.shift_id, d.digest from private.week_digests(pg_temp.id('week')) d$$,
  'what a reader sees is what a write compares'
);
select is(
  private.shift_digest('2026-11-22', ' Morning ', '07:00', '15:00:00', 2, 'morning',
    '[{"user": "8F000000-0000-4000-A000-000000000003", "position": "waiter"}]'),
  (select d.digest from private.week_digests(pg_temp.id('week')) d where d.shift_id = pg_temp.id('morning-22')),
  'the same through casts: "07:00" and "07:00:00", a name with spaces, an id in capitals'
);
select is(
  private.shift_digest('2026-11-26', 'Morning', '07:00', '15:00', 2, null,
    '[{"user": "8f000000-0000-4000-a000-000000000008"}, {"user": "8f000000-0000-4000-a000-000000000004", "position": null}]'),
  (select d.digest from private.week_digests(pg_temp.id('week')) d where d.shift_id = pg_temp.id('morning-26')),
  'people in any order, with or without a position'
);
select isnt(
  private.shift_digest('2026-11-22', 'Morning', '07:00', '15:00', 2, 'morning',
    '[{"user": "8f000000-0000-4000-a000-000000000003", "position": "cook"}]'),
  (select d.digest from private.week_digests(pg_temp.id('week')) d where d.shift_id = pg_temp.id('morning-22')),
  'and another position is another shift'
);

------------------------------------------------------------------------------
-- An unchanged round trip

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'r1', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;

select is(
  pg_temp.publish('8f000000-0000-4000-a000-000000000002', pg_temp.shifts_of('r1'),
    pg_temp.basis_of('r1'), '2026-11-18 09:00+00'),
  6,
  'publishing the week as it was read publishes its six shifts'
);
select is(
  (select array_agg(s.id order by s.id) from public.schedule_shifts s where s.week_id = pg_temp.id('week')),
  (select array_agg(i.id order by i.id) from ids i
   where i.name in ('morning-22', 'morning-23', 'morning-24', 'evening-25', 'morning-26', 'morning-27')),
  'and touches nothing: the same ids'
);
select is(
  pg_temp.last_log() -> 'kept',
  pg_temp.ids_of(array['morning-22', 'morning-23', 'morning-24', 'evening-25', 'morning-26', 'morning-27']),
  'the log says every shift was kept'
);
select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'edited', pg_temp.last_log() -> 'added', pg_temp.last_log() -> 'removed',
    pg_temp.last_log() -> 'changed', pg_temp.last_log() -> 'removed_swaps', pg_temp.last_log() -> 'reopened'
  ),
  '[[], [], [], [], [], []]'::jsonb,
  'and nothing edited, added, removed, changed for anyone, ended or opened again'
);

------------------------------------------------------------------------------
-- Requests waiting while the week changes (Orel's answer 2)

-- 4 asks to give Monday away, 3 Wednesday, 4 Thursday: open. 5 asks to give
-- Tuesday away and 3 takes it; 5 Friday and 4 takes it: both wait for a
-- manager.
insert into ids values
  ('s-mon', public.request_shift_swap('8f000000-0000-4000-a000-000000000004',
    pg_temp.id('morning-23'), null, '2026-11-18 10:00+00')),
  ('s-tue', public.request_shift_swap('8f000000-0000-4000-a000-000000000005',
    pg_temp.id('morning-24'), null, '2026-11-18 10:00+00')),
  ('s-wed', public.request_shift_swap('8f000000-0000-4000-a000-000000000003',
    pg_temp.id('evening-25'), null, '2026-11-18 10:00+00')),
  ('s-thu', public.request_shift_swap('8f000000-0000-4000-a000-000000000004',
    pg_temp.id('morning-26'), null, '2026-11-18 10:00+00')),
  ('s-fri', public.request_shift_swap('8f000000-0000-4000-a000-000000000005',
    pg_temp.id('morning-27'), null, '2026-11-18 10:00+00'));
select public.take_shift_swap('8f000000-0000-4000-a000-000000000003', pg_temp.id('s-tue'), '2026-11-18 10:30+00');
select public.take_shift_swap('8f000000-0000-4000-a000-000000000004', pg_temp.id('s-fri'), '2026-11-18 10:30+00');

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'r2', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;

-- Then the owner takes 8 off the team, and so off Thursday, which the screen
-- still shows with 8 and nobody touches (private.leave_staff).
select public.remove_member('8f000000-0000-4000-a000-000000000001',
  '8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000008',
  '2026-11-18 10:45+00');

-- Monday gets 3 as well; Tuesday starts at 08:00; Wednesday loses 3, who
-- asked; Friday gets 4, who took it, directly.
select is(
  pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.edit(pg_temp.edit(pg_temp.edit(pg_temp.shifts_of('r2'),
      'morning-23', jsonb_build_object('assignees', jsonb_build_array(
        jsonb_build_object('user', '8f000000-0000-4000-a000-000000000004'),
        jsonb_build_object('user', '8f000000-0000-4000-a000-000000000003')))),
      'morning-24', '{"start": "08:00"}'),
      'evening-25', '{"assignees": []}'),
      'morning-27', jsonb_build_object('needed', 2, 'assignees', jsonb_build_array(
        jsonb_build_object('user', '8f000000-0000-4000-a000-000000000005'),
        jsonb_build_object('user', '8f000000-0000-4000-a000-000000000004')))),
    pg_temp.basis_of('r2'), '2026-11-18 11:00+00'),
  6,
  'publishing four shifts changed'
);
select is(
  (select array_agg(s.id order by s.id) from public.schedule_shifts s where s.week_id = pg_temp.id('week')),
  (select array_agg(i.id order by i.id) from ids i
   where i.name in ('morning-22', 'morning-23', 'morning-24', 'evening-25', 'morning-26', 'morning-27')),
  'keeps every shift''s id, the changed ones too'
);
select is(
  pg_temp.swap('s-thu'),
  'open/morning-26/-',
  'an untouched shift keeps its waiting request'
);
select is(
  pg_temp.swap('s-tue'),
  'cancelled/morning-24/8f000000-0000-4000-a000-000000000003',
  'new hours cancel the request on the shift, and its row stays'
);
select is(
  pg_temp.who('swap.removed', 'swap:' || pg_temp.id('s-tue')),
  array['8f000000-0000-4000-a000-000000000003', '8f000000-0000-4000-a000-000000000005']::uuid[],
  'and both its people are told'
);
select is(
  pg_temp.swap('s-wed'),
  'cancelled/evening-25/-',
  'taking whoever asked off the shift cancels their request'
);
select is(
  pg_temp.who('swap.removed', 'swap:' || pg_temp.id('s-wed')),
  array['8f000000-0000-4000-a000-000000000003']::uuid[],
  'and tells them'
);
select is(
  (select row(sw.status, sw.taken_by, sw.taken_at)::text from public.shift_swaps sw
   where sw.id = pg_temp.id('s-fri')),
  row('open'::public.swap_status, null::uuid, null::timestamptz)::text,
  'putting its taker on the shift directly opens the request again, with no taker'
);
select is(
  pg_temp.who('swap.reopened', 'swap:' || pg_temp.id('s-fri')),
  array['8f000000-0000-4000-a000-000000000005']::uuid[],
  'and tells whoever asked'
);
select is(
  pg_temp.waiting('swap.approval:' || pg_temp.id('s-fri')),
  '{}'::uuid[],
  'with nothing left for a manager to approve'
);
select is(
  pg_temp.waiting('swap.offer:' || pg_temp.id('s-fri')),
  array['8f000000-0000-4000-a000-000000000001', '8f000000-0000-4000-a000-000000000002',
        '8f000000-0000-4000-a000-000000000003']::uuid[],
  'and offers it again to whoever may take it now'
);
select is(
  pg_temp.swap('s-mon'),
  'open/morning-23/-',
  'someone else put on the shift leaves its request waiting'
);
select is(
  pg_temp.waiting('swap.offer:' || pg_temp.id('s-mon')),
  array['8f000000-0000-4000-a000-000000000001', '8f000000-0000-4000-a000-000000000002',
        '8f000000-0000-4000-a000-000000000005']::uuid[],
  'and it is no longer offered to them, nor to someone off the team'
);
select is(
  pg_temp.people('morning-26'),
  '8f000000-0000-4000-a000-000000000004',
  'someone taken off the team since the read is not put back on a shift nobody touched'
);
select is(
  pg_temp.outcome($$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('r2'), 'morning-26', '{"needed": 3}'),
    pg_temp.basis_of('r2'), '2026-11-18 11:30+00')$$),
  '40001:moved:' || jsonb_build_array(pg_temp.id('morning-26'))::text,
  'and a change to that shift from the screen read before is refused, naming it'
);
select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'kept', pg_temp.last_log() -> 'edited',
    pg_temp.last_log() -> 'added', pg_temp.last_log() -> 'removed'
  ),
  jsonb_build_array(
    pg_temp.ids_of(array['morning-22', 'morning-26']),
    pg_temp.ids_of(array['morning-23', 'morning-24', 'evening-25', 'morning-27']),
    '[]'::jsonb,
    '[]'::jsonb
  ),
  'the log says which shifts were kept and which edited'
);
select is(
  (select string_agg(e.value ->> 'id', ',' order by e.value ->> 'id')
   from jsonb_array_elements(pg_temp.last_log() -> 'removed_swaps') as e (value))
    || '/' || (pg_temp.last_log() ->> 'swaps_removed')
    || '/' || (select string_agg(e.value ->> 'id', ',')
               from jsonb_array_elements(pg_temp.last_log() -> 'reopened') as e (value)),
  (select string_agg(i.id::text, ',' order by i.id::text) from ids i where i.name in ('s-tue', 's-wed'))
    || '/2/' || pg_temp.id('s-fri')::text,
  'the requests it ended, how many, and the one it opened again'
);
select is(
  pg_temp.last_log() -> 'changed',
  jsonb_build_array('8f000000-0000-4000-a000-000000000003', '8f000000-0000-4000-a000-000000000004',
    '8f000000-0000-4000-a000-000000000005'),
  'and whose shifts changed, as before'
);
select is(
  (select array_agg(k.key order by k.key) from jsonb_object_keys(pg_temp.last_log()) as k (key)),
  array['added', 'at', 'changed', 'edited', 'first', 'kept', 'removed', 'removed_swaps',
        'reopened', 'shifts', 'starts_on', 'swaps_removed', 'week'],
  'ids, counts and shifts only, never a name'
);
select is(
  (pg_temp.last_log() ->> 'at')::timestamptz,
  '2026-11-18 11:00+00'::timestamptz,
  'with the moment it was published'
);

------------------------------------------------------------------------------
-- Refused: ids the screen didn't read, and the rules on what is written

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'r3', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;

select throws_ok(
  format(
    $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
      pg_temp.shifts_of('r3') || %L::jsonb, pg_temp.basis_of('r3') || %L::jsonb,
      '2026-11-18 12:00+00')$$,
    jsonb_build_array(jsonb_build_object('id', pg_temp.id('y-shift'), 'day', '2026-11-22',
      'name', 'Morning', 'start', '07:00', 'end', '15:00', 'needed', 1)),
    jsonb_build_object(pg_temp.id('y-shift'), md5('y'))
  ),
  '22023', 'A shift sent is not one this week''s screen read',
  'a shift of another business is refused'
);
select throws_ok(
  format(
    $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
      pg_temp.shifts_of('r3'), pg_temp.basis_of('r3') || %L::jsonb, '2026-11-18 12:00+00')$$,
    jsonb_build_object(pg_temp.id('y-shift'), md5('y'))
  ),
  '22023', 'A shift sent is not one this week''s screen read',
  'and so is one only said to be read'
);
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.shifts_of('r3') || jsonb_build_array(pg_temp.shifts_of('r3') -> 0),
    pg_temp.basis_of('r3'), '2026-11-18 12:00+00')$$,
  '22023', 'A shift sent is not one this week''s screen read',
  'the same shift sent twice is refused'
);
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.shifts_of('r3'), pg_temp.basis_of('r3') - pg_temp.id('morning-22')::text,
    '2026-11-18 12:00+00')$$,
  '22023', 'A shift sent is not one this week''s screen read',
  'and so is one sent with an id the screen did not read'
);
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.shifts_of('r3'), null, '2026-11-18 12:00+00')$$,
  '22023', 'A shift sent is not one this week''s screen read',
  'and ids with nothing read'
);
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002', '[]',
    '{"not-a-shift": "0123456789abcdef0123456789abcdef"}', '2026-11-18 12:00+00')$$,
  '22023', 'What was read must be shift ids and digests',
  'what was read names each shift by its id'
);
select throws_ok(
  format(
    $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002', '[]', %L,
      '2026-11-18 12:00+00')$$,
    jsonb_build_object(pg_temp.id('morning-22'), 1)
  ),
  '22023', 'What was read must be shift ids and digests',
  'with its digest as text'
);
-- Nothing read, so the six stored shifts stay: with 195 new ones the week
-- would hold 201, though fewer than 200 are sent.
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    (select jsonb_agg(jsonb_build_object('day', ('2026-11-22'::date + i % 7)::text,
       'name', 'Extra ' || i, 'start', '05:00', 'end', '05:30', 'needed', 1))
     from generate_series(1, 195) as i),
    '{}', '2026-11-18 12:00+00')$$,
  '22023', 'Too many shifts',
  'the week as it would stand holds at most 200 shifts'
);
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('r3'), 'morning-22', jsonb_build_object('assignees', jsonb_build_array(
      jsonb_build_object('user', '8f000000-0000-4000-a000-000000000003', 'position', 'waiter'),
      jsonb_build_object('user', '8f000000-0000-4000-a000-000000000008')))),
    pg_temp.basis_of('r3'), '2026-11-18 12:00+00')$$,
  '22023', 'Only active members of the business can work a shift',
  'whoever this write puts on a shift is an active member'
);
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('r3'), 'morning-23', '{"day": "2026-11-22"}'),
    pg_temp.basis_of('r3'), '2026-11-18 12:00+00')$$,
  '22023', 'A person works two shifts at once',
  'a shift moved onto someone''s other shift is refused'
);
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.shifts_of('r3') || jsonb_build_array(jsonb_build_object('day', '2026-11-22',
      'name', 'Brunch', 'start', '10:00', 'end', '12:00', 'needed', 1,
      'assignees', jsonb_build_array(jsonb_build_object('user', '8f000000-0000-4000-a000-000000000003')))),
    pg_temp.basis_of('r3'), '2026-11-18 12:00+00')$$,
  '22023', 'A person works two shifts at once',
  'and so is a new shift for someone working then'
);

------------------------------------------------------------------------------
-- A screen read before a change

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'r4', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;

-- Then 3 takes 4's Thursday and the owner approves it.
select public.take_shift_swap('8f000000-0000-4000-a000-000000000003', pg_temp.id('s-thu'), '2026-11-19 09:00+00');
select public.decide_shift_swap('8f000000-0000-4000-a000-000000000001', pg_temp.id('s-thu'), true, '2026-11-19 10:00+00');

select is(
  pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('r4'), 'morning-22', '{"needed": 3}'),
    pg_temp.basis_of('r4'), '2026-11-19 11:00+00'),
  6,
  'a screen read before a swap was approved publishes a change to another shift'
);
select is(
  pg_temp.people('morning-26') || '/' || pg_temp.swap('s-thu'),
  '8f000000-0000-4000-a000-000000000003/approved/morning-26/8f000000-0000-4000-a000-000000000003',
  'and the approval stands'
);
select is(
  pg_temp.outcome($$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('r4'), 'morning-26', '{"needed": 3}'),
    pg_temp.basis_of('r4'), '2026-11-19 12:00+00')$$),
  '40001:moved:' || jsonb_build_array(pg_temp.id('morning-26'))::text,
  'but a change to the shift it approved is refused, naming the shift'
);
select is(
  pg_temp.outcome($$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.without(pg_temp.shifts_of('r4'), 'morning-26'),
    pg_temp.basis_of('r4'), '2026-11-19 12:00+00')$$),
  '40001:moved:' || jsonb_build_array(pg_temp.id('morning-26'))::text,
  'and so is removing it'
);

-- The manager reads the week; the owner adds Saturday; the manager, from the
-- screen read before, changes Monday.
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'r5', s.shifts, s.basis from pg_temp.screen_of('week') s;
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000001');
insert into screens select 'r6', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;
select pg_temp.publish('8f000000-0000-4000-a000-000000000001',
  pg_temp.shifts_of('r6') || jsonb_build_array(jsonb_build_object('day', '2026-11-28',
    'name', 'Morning', 'start', '07:00', 'end', '15:00', 'needed', 1,
    'assignees', jsonb_build_array(jsonb_build_object('user', '8f000000-0000-4000-a000-000000000005')))),
  pg_temp.basis_of('r6'), '2026-11-19 12:00+00');
insert into ids
select 'morning-28', s.id from public.schedule_shifts s
where s.week_id = pg_temp.id('week') and s.day = '2026-11-28';

select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
  pg_temp.edit(pg_temp.shifts_of('r5'), 'morning-23', '{"needed": 3}'),
  pg_temp.basis_of('r5'), '2026-11-19 12:30+00');
select is(
  (select count(*)::integer from public.schedule_shifts s
   where s.week_id = pg_temp.id('week') and s.day = '2026-11-28'),
  1,
  'a shift added meanwhile stays'
);
select ok(
  pg_temp.last_log() -> 'kept' @> jsonb_build_array(pg_temp.id('morning-28')),
  'as one the write kept'
);

-- The manager reads the week; the owner deletes Saturday; the manager, from the
-- screen read before, changes Monday again.
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'r7', s.shifts, s.basis from pg_temp.screen_of('week') s;
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000001');
insert into screens select 'r8', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;
select pg_temp.publish('8f000000-0000-4000-a000-000000000001',
  pg_temp.without(pg_temp.shifts_of('r8'), 'morning-28'),
  pg_temp.basis_of('r8'), '2026-11-19 13:00+00');

select is(
  pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('r7'), 'morning-23', '{"needed": 2}'),
    pg_temp.basis_of('r7'), '2026-11-19 13:30+00'),
  6,
  'a shift deleted meanwhile and sent as it was read is skipped'
);
select is(
  (select count(*)::integer from public.schedule_shifts s
   where s.week_id = pg_temp.id('week') and s.day = '2026-11-28'),
  0,
  'and stays deleted'
);
select is(
  pg_temp.outcome($$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('r7'), 'morning-28', '{"needed": 2}'),
    pg_temp.basis_of('r7'), '2026-11-19 14:00+00')$$),
  '40001:moved:' || jsonb_build_array(pg_temp.id('morning-28'))::text,
  'but sent changed, it is refused'
);

------------------------------------------------------------------------------
-- A draft is written in place too

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'd1', s.shifts, s.basis from pg_temp.screen_of('draft') s;
reset role;
select is(
  public.save_week_schedule('8f000000-0000-4000-a000-000000000002', pg_temp.id('draft'),
    pg_temp.edit(pg_temp.shifts_of('d1'), 'draft-29', '{"needed": 3}'), pg_temp.basis_of('d1')),
  2,
  'a draft saved with what was read'
);
select is(
  (select array_agg(s.id order by s.id) from public.schedule_shifts s where s.week_id = pg_temp.id('draft')),
  (select array_agg(i.id order by i.id) from ids i where i.name in ('draft-29', 'draft-30')),
  'keeps its shifts'' ids'
);
select throws_ok(
  $$select public.save_week_schedule('8f000000-0000-4000-a000-000000000002', pg_temp.id('week'),
    pg_temp.shifts_of('r7'), pg_temp.basis_of('r7'))$$,
  '55000', null,
  'and a published week is still not saved as a draft'
);

-- 9 joins and goes on the draft's Monday, and is taken off the team while it
-- is under way, so private.leave_staff leaves them on it (it takes them off
-- only what is still to start).
insert into auth.users (id, aud, role, phone)
values ('8f000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500004809');
insert into public.memberships (business_id, user_id, role, active)
values ('8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000009', 'worker', true);
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'd2', s.shifts, s.basis from pg_temp.screen_of('draft') s;
reset role;
select public.save_week_schedule('8f000000-0000-4000-a000-000000000002', pg_temp.id('draft'),
  pg_temp.edit(pg_temp.shifts_of('d2'), 'draft-30',
    '{"assignees": [{"user": "8f000000-0000-4000-a000-000000000009"}]}'),
  pg_temp.basis_of('d2'));
select public.remove_member('8f000000-0000-4000-a000-000000000001',
  '8f000000-0000-4000-b000-000000000001', '8f000000-0000-4000-a000-000000000009',
  '2026-11-30 09:00+00');

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'd3', s.shifts, s.basis from pg_temp.screen_of('draft') s;
reset role;
select is(
  public.save_week_schedule('8f000000-0000-4000-a000-000000000002', pg_temp.id('draft'),
    pg_temp.edit(pg_temp.shifts_of('d3'), 'draft-30', '{"needed": 2}'), pg_temp.basis_of('d3')),
  2,
  'a shift changed while someone who left is still on it is saved'
);
select is(
  pg_temp.people('draft-30'),
  '8f000000-0000-4000-a000-000000000009',
  'and they stay on it: nobody put them on again'
);

------------------------------------------------------------------------------
-- Positions

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'p1', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;
select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
  pg_temp.edit(pg_temp.shifts_of('p1'), 'morning-22',
    '{"assignees": [{"user": "8f000000-0000-4000-a000-000000000003", "position": "cook"}]}'),
  pg_temp.basis_of('p1'), '2026-11-19 15:00+00');
select is(
  pg_temp.people('morning-22'),
  '8f000000-0000-4000-a000-000000000003=cook',
  'a new position for someone who stays on a shift is written in place'
);
select is(
  jsonb_build_array(pg_temp.last_log() -> 'edited', pg_temp.last_log() -> 'changed'),
  jsonb_build_array(pg_temp.ids_of(array['morning-22']),
    jsonb_build_array('8f000000-0000-4000-a000-000000000003')),
  'the shift keeps its id, and their shifts changed'
);

-- Cook comes out of the settings. The builder shows 3 on Sunday with no
-- position (withKnownPositions) and sends the week back as it shows it.
update public.business_modules
set settings = jsonb_set(settings, '{positions}', '[{"key": "waiter", "name": "Waiter"}]')
where business_id = '8f000000-0000-4000-b000-000000000001' and module_key = 'scheduling';
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'p2', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;

select is_empty(
  $$select (t.s ->> 'id')::uuid, t.s ->> 'seen'
    from jsonb_array_elements(public.week_shifts(pg_temp.id('week'))) as t (s)
    except
    select d.shift_id, d.digest from private.week_digests(pg_temp.id('week')) d$$,
  'a reader and a write still see the same, with a position the settings no longer have'
);
select is(
  pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('p2'), 'morning-22',
      '{"assignees": [{"user": "8f000000-0000-4000-a000-000000000003", "position": null}]}'),
    pg_temp.basis_of('p2'), '2026-11-19 15:30+00'),
  6,
  'the week sent back as the builder shows it publishes'
);
select is(
  pg_temp.last_log() -> 'kept',
  pg_temp.ids_of(array['morning-22', 'morning-23', 'morning-24', 'evening-25', 'morning-26', 'morning-27']),
  'as every shift kept'
);
select is(
  pg_temp.people('morning-22'),
  '8f000000-0000-4000-a000-000000000003=cook',
  'with the position as stored'
);
select throws_ok(
  $$select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.edit(pg_temp.shifts_of('p2'), 'morning-22', '{"needed": 4}'),
    pg_temp.basis_of('p2'), '2026-11-19 16:00+00')$$,
  '22023', 'Unknown position',
  'but a shift written with a position the settings no longer have is refused'
);

update public.business_modules
set settings = jsonb_set(settings, '{positions}',
  '[{"key": "waiter", "name": "Waiter"}, {"key": "cook", "name": "Cook"}]')
where business_id = '8f000000-0000-4000-b000-000000000001' and module_key = 'scheduling';

------------------------------------------------------------------------------
-- A taker who now works at the same time, and a shift deleted with a request

-- 5 takes 4's Monday; then a new brunch puts 5 to work on Monday at the same
-- time.
select public.take_shift_swap('8f000000-0000-4000-a000-000000000005', pg_temp.id('s-mon'),
  '2026-11-19 16:00+00');
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'n1', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;
select pg_temp.publish('8f000000-0000-4000-a000-000000000002',
  pg_temp.shifts_of('n1') || jsonb_build_array(jsonb_build_object('day', '2026-11-23',
    'name', 'Brunch', 'start', '10:00', 'end', '12:00', 'needed', 1,
    'assignees', jsonb_build_array(jsonb_build_object('user', '8f000000-0000-4000-a000-000000000005')))),
  pg_temp.basis_of('n1'), '2026-11-19 16:30+00');
insert into ids
select 'brunch-23', s.id from public.schedule_shifts s
where s.week_id = pg_temp.id('week') and s.name = 'Brunch';

select is(
  pg_temp.swap('s-mon'),
  'open/morning-23/-',
  'a taker now working at the same time opens the request again, with no taker'
);
select is(
  pg_temp.who('swap.reopened', 'swap:' || pg_temp.id('s-mon')),
  array['8f000000-0000-4000-a000-000000000004']::uuid[],
  'and whoever asked is told'
);

-- 5 asks to give the brunch away and the owner takes it; the manager then
-- publishes the week without it.
insert into ids values
  ('s-brunch', public.request_shift_swap('8f000000-0000-4000-a000-000000000005',
    pg_temp.id('brunch-23'), null, '2026-11-19 17:00+00'));
select public.take_shift_swap('8f000000-0000-4000-a000-000000000001', pg_temp.id('s-brunch'),
  '2026-11-19 17:10+00');
select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
insert into screens select 'n2', s.shifts, s.basis from pg_temp.screen_of('week') s;
reset role;

select is(
  pg_temp.publish('8f000000-0000-4000-a000-000000000002',
    pg_temp.without(pg_temp.shifts_of('n2'), 'brunch-23'),
    pg_temp.basis_of('n2'), '2026-11-19 17:30+00'),
  6,
  'a shift read and not sent is deleted'
);
select is(
  jsonb_build_array(
    pg_temp.last_log() -> 'removed',
    (select jsonb_agg(e.value -> 'id')
     from jsonb_array_elements(pg_temp.last_log() -> 'removed_swaps') as e (value)),
    pg_temp.last_log() -> 'swaps_removed'
  ),
  jsonb_build_array(pg_temp.ids_of(array['brunch-23']), pg_temp.ids_of(array['s-brunch']), 1),
  'the log names it, and the request on it that it ended'
);
select is(
  pg_temp.who('swap.removed', 'swap:' || pg_temp.id('s-brunch')),
  array['8f000000-0000-4000-a000-000000000001', '8f000000-0000-4000-a000-000000000005']::uuid[],
  'and both its people are told'
);

------------------------------------------------------------------------------
-- Without a basis, the week is replaced as before

-- 3 asks to give Sunday away too.
insert into ids values
  ('s-sun', public.request_shift_swap('8f000000-0000-4000-a000-000000000003',
    pg_temp.id('morning-22'), null, '2026-11-19 14:00+00'));

select is(
  public.publish_week_schedule('8f000000-0000-4000-a000-000000000002', pg_temp.id('week'),
    '[{"day": "2026-11-22", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "8f000000-0000-4000-a000-000000000003"}]},
      {"day": "2026-11-23", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1}]',
    at_time => '2026-11-19 14:30+00'),
  2,
  'a week published with nothing read'
);
select is_empty(
  $$select 1 from public.schedule_shifts s
    where s.id in (select i.id from ids i where i.name like 'morning-%' or i.name like 'evening-%')$$,
  'is replaced: none of its shifts is left'
);
select is_empty(
  $$select 1 from public.shift_swaps sw where sw.business_id = '8f000000-0000-4000-b000-000000000001'$$,
  'and the requests go with them, as before'
);
select is(
  jsonb_build_array(
    jsonb_array_length(pg_temp.last_log() -> 'kept'), jsonb_array_length(pg_temp.last_log() -> 'edited'),
    jsonb_array_length(pg_temp.last_log() -> 'removed'), jsonb_array_length(pg_temp.last_log() -> 'added'),
    (pg_temp.last_log() ->> 'swaps_removed')::integer
  ),
  '[0, 0, 6, 2, 3]'::jsonb,
  'the log says six shifts removed, two added, and the three requests still waiting ended'
);
select is(
  pg_temp.last_log() -> 'added',
  (select jsonb_agg(s.id order by s.day) from public.schedule_shifts s where s.week_id = pg_temp.id('week')),
  'with the new shifts'' ids, in the order sent'
);

------------------------------------------------------------------------------
-- Only the server writes

select pg_temp.sign_in('8f000000-0000-4000-a000-000000000002');
select throws_ok(
  $$select private.write_week_schedule('8f000000-0000-4000-a000-000000000002',
    gen_random_uuid(), '[]', '{}', now())$$,
  '42501', null, 'a signed-in manager cannot reach the write'
);
select throws_ok(
  $$select public.publish_week_schedule('8f000000-0000-4000-a000-000000000002',
    gen_random_uuid(), '[]', '{}')$$,
  '42501', null, 'nor publish with what they read'
);
select throws_ok(
  $$insert into public.schedule_shifts (business_id, week_id, day, name, starts_at, ends_at, needed)
    values ('8f000000-0000-4000-b000-000000000001', gen_random_uuid(), '2026-11-22', 'Morning',
      '07:00', '15:00', 1)$$,
  '42501', null, 'nor write a shift themselves'
);
reset role;

select * from finish();
rollback;
