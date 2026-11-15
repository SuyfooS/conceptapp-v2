-- Overlaps across the week's edge (20261115000600_running_week_edge.sql, the
-- running-week plan's X): a save or a publish refuses to put someone on a
-- shift that runs at the same time as one of theirs in the week before or
-- after (22023, hint 'clash', the other shift's person, name, day, start and
-- week in its detail), by the moments the shifts run on the business's clock,
-- past midnight included, whatever day its week starts on. Touching is fine,
-- someone else on the shift next door is fine, someone taken off it is free,
-- and someone kept where they were is not checked again; a clash inside the
-- week is refused first, as before. A request next door taken by someone a
-- draft now puts at the same time stays taken, its approval refused, until a
-- publish opens it again and logs it. The weeks either side are locked with
-- the week, and the demo's renewal leaves whoever works the night before out
-- of the first morning, and whoever works the morning after out of the last
-- night. (The order of those locks, the first statement of each write, and
-- the lock of the requests next door are pinned by
-- tooling/running-week-edge.test.ts, as the repo pins its other locks.) Fixed
-- ids (91…), numbers (9725000091xx) and slugs (rwe-…) of its own, and
-- explicit times; the renewal reads the clock as it does, relative to now.
begin;
select plan(27);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('91000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500009101'),
  ('91000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500009102'),
  ('91000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500009103'),
  ('91000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500009104'),
  ('91000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500009105'),
  ('91000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500009106'),
  ('91000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500009107'),
  ('91000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500009109'),
  ('91000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500009110'),
  ('91000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500009111'),
  ('91000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500009112'),
  ('91000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500009113'),
  ('91000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500009114');

-- S, whose week starts on Sunday: 1 its owner, 2 its manager, 3 to 7
-- workers. M, whose week starts on Monday: 9 its manager, a a worker. D, for
-- the demo's renewal: b its owner, c its one worker; E, for it too: d its
-- owner, e its one worker. All in Israel, two hours ahead of UTC in December.
insert into public.businesses (id, slug, name)
values
  ('91000000-0000-4000-b000-000000000001', 'rwe-sunday', 'Edge Sunday'),
  ('91000000-0000-4000-b000-000000000002', 'rwe-monday', 'Edge Monday'),
  ('91000000-0000-4000-b000-000000000003', 'rwe-renew', 'Edge renewal'),
  ('91000000-0000-4000-b000-000000000004', 'rwe-renew-next', 'Edge renewal next');

insert into public.memberships (business_id, user_id, role, active)
values
  ('91000000-0000-4000-b000-000000000001', '91000000-0000-4000-a000-000000000001', 'owner', true),
  ('91000000-0000-4000-b000-000000000001', '91000000-0000-4000-a000-000000000002', 'manager', true),
  ('91000000-0000-4000-b000-000000000001', '91000000-0000-4000-a000-000000000003', 'worker', true),
  ('91000000-0000-4000-b000-000000000001', '91000000-0000-4000-a000-000000000004', 'worker', true),
  ('91000000-0000-4000-b000-000000000001', '91000000-0000-4000-a000-000000000005', 'worker', true),
  ('91000000-0000-4000-b000-000000000001', '91000000-0000-4000-a000-000000000006', 'worker', true),
  ('91000000-0000-4000-b000-000000000001', '91000000-0000-4000-a000-000000000007', 'worker', true),
  ('91000000-0000-4000-b000-000000000002', '91000000-0000-4000-a000-000000000009', 'manager', true),
  ('91000000-0000-4000-b000-000000000002', '91000000-0000-4000-a000-00000000000a', 'worker', true),
  ('91000000-0000-4000-b000-000000000003', '91000000-0000-4000-a000-00000000000b', 'owner', true),
  ('91000000-0000-4000-b000-000000000003', '91000000-0000-4000-a000-00000000000c', 'worker', true),
  ('91000000-0000-4000-b000-000000000004', '91000000-0000-4000-a000-00000000000d', 'owner', true),
  ('91000000-0000-4000-b000-000000000004', '91000000-0000-4000-a000-00000000000e', 'worker', true);

-- D's one regular shift: Sunday, its week's first day, from 05:00 to 09:00.
-- E's: Saturday, its week's last day, from 22:00 to 06:00.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('91000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('91000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 1}'),
  ('91000000-0000-4000-b000-000000000003', 'scheduling', true,
   '{"weekStartsOn": 0, "shifts": [{"key": "early", "name": "Early", "days": [0],
     "start": "05:00", "end": "09:00", "needed": 1}]}'),
  ('91000000-0000-4000-b000-000000000004', 'scheduling', true,
   '{"weekStartsOn": 0, "shifts": [{"key": "late", "name": "Late", "days": [6],
     "start": "22:00", "end": "06:00", "needed": 1}]}');

create temporary table ids (name text primary key, id uuid) on commit drop;
-- What a builder read: the shifts it would send back unchanged, and what it saw.
create temporary table screens (name text primary key, shifts jsonb, basis jsonb) on commit drop;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;
create function pg_temp.person(n text) returns uuid language sql as $$
  select ('91000000-0000-4000-a000-0000000000' || n)::uuid
$$;

-- One shift as a builder sends it, with these people on it and no position.
create function pg_temp.shift(on_day text, shift_name text, starts text, ends text, who text[])
returns jsonb language sql as $$
  select jsonb_build_object(
    'day', on_day, 'name', shift_name, 'start', starts, 'end', ends,
    'needed', greatest(cardinality(who), 1),
    'assignees', coalesce(
      (select jsonb_agg(jsonb_build_object('user', pg_temp.person(u.p), 'position', null) order by u.p)
       from unnest(who) as u (p)),
      '[]'::jsonb
    )
  )
$$;

-- A week as the builder reads it: the shifts with their ids, times as "HH:MM"
-- as the screen keeps them, and what was seen of each.
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

-- The payload with one shift (by its name) changed.
create function pg_temp.edit(payload jsonb, shift_name text, changes jsonb)
returns jsonb language sql as $$
  select coalesce(
    jsonb_agg(
      case when x.e ->> 'name' = shift_name then x.e || changes else x.e end
      order by x.o
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(payload) with ordinality as x (e, o)
$$;

-- One person joining a shift under way, as `joins` names them.
create function pg_temp.joining(shift_name text, who text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'shift', pg_temp.id(shift_name), 'user', pg_temp.person(who), 'position', null
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
    raise exception 'tried' using errcode = 'P0001', hint = 'rwe-tried';
  exception when others then
    get stacked diagnostics code = returned_sqlstate, words = message_text,
      why = pg_exception_hint, more = pg_exception_detail;
    if why = 'rwe-tried' then
      return 'ok';
    end if;
    return concat_ws(' | ', code, words, nullif(why, ''), nullif(more, ''));
  end;
end;
$$;

-- A save or a publish of a week by `actor`, tried and undone.
create function pg_temp.try(
  what text, actor text, week_name text, payload jsonb, seen jsonb, at_time timestamptz,
  joins jsonb
) returns text language sql as $$
  select pg_temp.outcome(format(
    'select public.%s(%L::uuid, %L::uuid, %L::jsonb, %L::jsonb, %L::timestamptz, %L::jsonb)',
    what, pg_temp.person(actor), pg_temp.id(week_name), payload, seen, at_time, joins
  ))
$$;

-- The refusal, as pg_temp.outcome reads it, for these shifts next door
-- (pg_temp.next_door), in the order the database lists them.
create function pg_temp.next_door(who text, shift_name text, on_day text, starts text, side text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'user', pg_temp.person(who), 'name', shift_name, 'day', on_day, 'start', starts, 'week', side
  )
$$;
create function pg_temp.clash(found jsonb[]) returns text language sql as $$
  select concat_ws(' | ', '22023', 'Works a shift of the week before or after at the same time',
    'clash', to_jsonb(found)::text)
$$;

------------------------------------------------------------------------------
-- S: last week (from Sunday 29 November), this week (6 December) and next
-- week (13 December), each written before any of them begins. Last week's
-- last night, Saturday 5 December from 22:00 to 06:00, is 5's; this week's,
-- Saturday 12 December, is 3's; next week's first morning, Sunday 13 December
-- from 05:00 to 13:00, is 4's, in a draft.

insert into ids values
  ('last', public.open_schedule_week('91000000-0000-4000-b000-000000000001', '2026-11-29', '2026-11-25 16:00+00')),
  ('this', public.open_schedule_week('91000000-0000-4000-b000-000000000001', '2026-12-06', '2026-12-02 16:00+00')),
  ('next', public.open_schedule_week('91000000-0000-4000-b000-000000000001', '2026-12-13', '2026-12-09 16:00+00')),
  ('m1', public.open_schedule_week('91000000-0000-4000-b000-000000000002', '2026-12-07', '2026-12-03 16:00+00')),
  ('m2', public.open_schedule_week('91000000-0000-4000-b000-000000000002', '2026-12-14', '2026-12-10 16:00+00'));

select is(
  public.publish_week_schedule('91000000-0000-4000-a000-000000000002', pg_temp.id('last'),
    jsonb_build_array(pg_temp.shift('2026-12-05', 'Night', '22:00', '06:00', array['05'])),
    null, '2026-11-20 08:00+00'),
  1,
  'last week is published with its last night'
);
select is(
  public.publish_week_schedule('91000000-0000-4000-a000-000000000002', pg_temp.id('this'),
    jsonb_build_array(pg_temp.shift('2026-12-12', 'Night', '22:00', '06:00', array['03'])),
    null, '2026-11-20 08:00+00'),
  1,
  'this week is published with its last night'
);
select is(
  public.save_week_schedule('91000000-0000-4000-a000-000000000002', pg_temp.id('next'),
    jsonb_build_array(pg_temp.shift('2026-12-13', 'Morning', '05:00', '13:00', array['04'])),
    null, '2026-11-20 08:00+00'),
  1,
  'next week is saved with its first morning'
);

------------------------------------------------------------------------------
-- Across the edge, both ways

select is(
  array[
    pg_temp.try('save_week_schedule', '02', 'next',
      jsonb_build_array(pg_temp.shift('2026-12-13', 'Morning', '05:00', '13:00', array['03', '04'])),
      null, '2026-11-20 08:00+00', null),
    pg_temp.try('publish_week_schedule', '02', 'next',
      jsonb_build_array(pg_temp.shift('2026-12-13', 'Morning', '05:00', '13:00', array['03', '04'])),
      null, '2026-11-20 08:00+00', null)
  ],
  array[
    pg_temp.clash(array[pg_temp.next_door('03', 'Night', '2026-12-12', '22:00', 'previous')]),
    pg_temp.clash(array[pg_temp.next_door('03', 'Night', '2026-12-12', '22:00', 'previous')])
  ],
  'next week''s first morning is refused to someone on this week''s last night, saved or published'
);

select is(
  array[
    pg_temp.try('save_week_schedule', '02', 'next',
      jsonb_build_array(pg_temp.shift('2026-12-13', 'Morning', '06:00', '14:00', array['03', '04'])),
      null, '2026-11-20 08:00+00', null),
    pg_temp.try('publish_week_schedule', '02', 'next',
      jsonb_build_array(pg_temp.shift('2026-12-13', 'Morning', '05:00', '13:00', array['04', '06'])),
      null, '2026-11-20 08:00+00', null)
  ],
  array['ok', 'ok'],
  'a morning that starts as the night ends is fine, and so is someone not on the night'
);

select is(
  pg_temp.try('publish_week_schedule', '02', 'this',
    jsonb_build_array(pg_temp.shift('2026-12-12', 'Night', '22:00', '06:00', array['03', '04'])),
    null, '2026-11-20 08:00+00', null),
  pg_temp.clash(array[pg_temp.next_door('04', 'Morning', '2026-12-13', '05:00', 'next')]),
  'this week''s last night is refused to someone on next week''s first morning, a draft'
);

select is(
  pg_temp.try('publish_week_schedule', '02', 'this',
    jsonb_build_array(
      pg_temp.shift('2026-12-06', 'Early', '05:00', '12:00', array['05']),
      pg_temp.shift('2026-12-12', 'Night', '22:00', '06:00', array['03'])),
    null, '2026-11-20 08:00+00', null),
  pg_temp.clash(array[pg_temp.next_door('05', 'Night', '2026-12-05', '22:00', 'previous')]),
  'this week''s first morning is refused to someone on last week''s last night'
);

select is(
  array[
    pg_temp.try('publish_week_schedule', '02', 'this',
      jsonb_build_array(
        pg_temp.shift('2026-12-12', 'Night', '22:00', '06:00', array['03', '04']),
        pg_temp.shift('2026-12-06', 'Early', '05:00', '12:00', array['05'])),
      null, '2026-11-20 08:00+00', null),
    pg_temp.try('publish_week_schedule', '02', 'this',
      jsonb_build_array(
        pg_temp.shift('2026-12-06', 'Early', '06:00', '12:00', array['05']),
        pg_temp.shift('2026-12-12', 'Night', '22:00', '05:00', array['03', '04'])),
      null, '2026-11-20 08:00+00', null)
  ],
  array[
    pg_temp.clash(array[
      pg_temp.next_door('05', 'Night', '2026-12-05', '22:00', 'previous'),
      pg_temp.next_door('04', 'Morning', '2026-12-13', '05:00', 'next')
    ]),
    'ok'
  ],
  'both edges at once are named, the week before''s first; ending as the other starts is fine on both'
);

-- Inside the week first, in the same words as before.
select is(
  pg_temp.try('publish_week_schedule', '02', 'this',
    jsonb_build_array(
      pg_temp.shift('2026-12-12', 'Night', '22:00', '06:00', array['03', '04']),
      pg_temp.shift('2026-12-12', 'Late', '23:00', '03:00', array['04'])),
    null, '2026-11-20 08:00+00', null),
  '22023 | A person works two shifts at once',
  'a clash inside the week is refused as before, ahead of one across its edge'
);

------------------------------------------------------------------------------
-- What the shift next door holds now, and who is checked

-- 7 takes 3's place on this week's last night.
select is(
  public.publish_week_schedule('91000000-0000-4000-a000-000000000002', pg_temp.id('this'),
    jsonb_build_array(pg_temp.shift('2026-12-12', 'Night', '22:00', '06:00', array['07'])),
    null, '2026-11-20 08:30+00'),
  1,
  'this week''s last night is published again with 7 on it'
);
insert into ids
select 'night-12', s.id from public.schedule_shifts s
where s.week_id = pg_temp.id('this') and s.name = 'Night';

select is(
  array[
    pg_temp.try('save_week_schedule', '02', 'next',
      jsonb_build_array(pg_temp.shift('2026-12-13', 'Morning', '05:00', '13:00', array['03', '04'])),
      null, '2026-11-20 08:30+00', null),
    pg_temp.try('save_week_schedule', '02', 'next',
      jsonb_build_array(pg_temp.shift('2026-12-13', 'Morning', '05:00', '13:00', array['04', '07'])),
      null, '2026-11-20 08:30+00', null)
  ],
  array['ok', pg_temp.clash(array[pg_temp.next_door('07', 'Night', '2026-12-12', '22:00', 'previous')])],
  'someone taken off the night next door is free, and whoever is on it now is not'
);

-- A clash already stored (put in by hand): 7 on next week's first morning too.
insert into public.shift_assignments (shift_id, business_id, user_id)
select s.id, s.business_id, '91000000-0000-4000-a000-000000000007'
from public.schedule_shifts s
where s.week_id = pg_temp.id('next') and s.name = 'Morning';

insert into screens select 'n1', s.shifts, s.basis from pg_temp.screen_of('next') s;

select is(
  array[
    pg_temp.try('save_week_schedule', '02', 'next',
      pg_temp.edit(pg_temp.shifts_of('n1'), 'Morning', '{"needed": 3}'),
      pg_temp.basis_of('n1'), '2026-11-20 09:00+00', null),
    pg_temp.try('save_week_schedule', '02', 'next',
      pg_temp.edit(pg_temp.shifts_of('n1'), 'Morning', '{"start": "05:30"}'),
      pg_temp.basis_of('n1'), '2026-11-20 09:00+00', null)
  ],
  array['ok', pg_temp.clash(array[pg_temp.next_door('07', 'Night', '2026-12-12', '22:00', 'previous')])],
  'someone kept where they were is not checked again, until their shift moves'
);

-- Saturday 12 December at 23:00 in Israel: this week's last night is under
-- way, and people join it apart.
select is(
  array[
    pg_temp.try('publish_week_schedule', '02', 'this', '[]', '{}', '2026-12-12 21:00+00',
      pg_temp.joining('night-12', '04')),
    pg_temp.try('publish_week_schedule', '02', 'this', '[]', '{}', '2026-12-12 21:00+00',
      pg_temp.joining('night-12', '06'))
  ],
  array[pg_temp.clash(array[pg_temp.next_door('04', 'Morning', '2026-12-13', '05:00', 'next')]), 'ok'],
  'someone joining a night under way is checked against next week''s first morning too'
);

------------------------------------------------------------------------------
-- A request taken next door: 7 gives this week's last night away and 6 takes
-- it, waiting for approval; then next week's first morning, a draft, is given
-- to 6 as well.

insert into ids values
  ('s-night', public.request_shift_swap('91000000-0000-4000-a000-000000000007',
    pg_temp.id('night-12'), null, '2026-11-20 09:30+00'));
select public.take_shift_swap('91000000-0000-4000-a000-000000000006', pg_temp.id('s-night'),
  '2026-11-20 09:30+00');

select is(
  public.save_week_schedule('91000000-0000-4000-a000-000000000002', pg_temp.id('next'),
    pg_temp.edit(pg_temp.shifts_of('n1'), 'Morning', jsonb_build_object(
      'needed', 3,
      'assignees', pg_temp.shift('2026-12-13', 'Morning', '05:00', '13:00',
        array['04', '06', '07']) -> 'assignees')),
    pg_temp.basis_of('n1'), '2026-11-20 10:00+00'),
  1,
  'next week''s first morning is saved with 6, who took this week''s last night next door'
);

select is(
  array[
    (select sw.status::text || ' ' || coalesce(sw.taken_by::text, 'none')
     from public.shift_swaps sw where sw.id = pg_temp.id('s-night')),
    pg_temp.outcome(format(
      'select public.decide_shift_swap(%L::uuid, %L::uuid, true, %L::timestamptz)',
      pg_temp.person('02'), pg_temp.id('s-night'), '2026-11-20 10:00+00'))
  ],
  array[
    'taken 91000000-0000-4000-a000-000000000006',
    '22023 | Works another shift at the same time'
  ],
  'a draft saved leaves the request next door taken, and its approval is refused'
);

insert into screens select 'n2', s.shifts, s.basis from pg_temp.screen_of('next') s;

select is(
  public.publish_week_schedule('91000000-0000-4000-a000-000000000002', pg_temp.id('next'),
    pg_temp.shifts_of('n2'), pg_temp.basis_of('n2'), '2026-11-20 10:30+00'),
  1,
  'next week is published as it was saved'
);

select is(
  array[
    (select sw.status::text || ' ' || coalesce(sw.taken_by::text, 'none')
     from public.shift_swaps sw where sw.id = pg_temp.id('s-night')),
    (select jsonb_path_query_array(l.details -> 'reopened', '$[*].id')::text
     from public.audit_log l
     where l.business_id = '91000000-0000-4000-b000-000000000001'
       and l.action = 'schedule.publish'
       and l.details ->> 'week' = pg_temp.id('next')::text)
  ],
  array['open none', jsonb_build_array(pg_temp.id('s-night'))::text],
  'the publish opens the request next door again, with no taker, and logs it with the week''s own'
);

------------------------------------------------------------------------------
-- M, whose week starts on Monday: its Sunday is the last day of a week

select is(
  public.publish_week_schedule('91000000-0000-4000-a000-000000000009', pg_temp.id('m1'),
    jsonb_build_array(pg_temp.shift('2026-12-13', 'Night', '22:00', '06:00', array['0a'])),
    null, '2026-11-20 08:00+00'),
  1,
  'a week from Monday is published with its last night, on Sunday'
);

select is(
  array[
    pg_temp.try('save_week_schedule', '09', 'm2',
      jsonb_build_array(pg_temp.shift('2026-12-14', 'Morning', '05:00', '13:00', array['0a'])),
      null, '2026-11-20 08:00+00', null),
    pg_temp.try('save_week_schedule', '09', 'm2',
      jsonb_build_array(pg_temp.shift('2026-12-14', 'Morning', '06:00', '14:00', array['0a'])),
      null, '2026-11-20 08:00+00', null)
  ],
  array[
    pg_temp.clash(array[pg_temp.next_door('0a', 'Night', '2026-12-13', '22:00', 'previous')]),
    'ok'
  ],
  'the next Monday''s morning is refused to someone on that Sunday night, from the week''s own start'
);

------------------------------------------------------------------------------
-- The weeks either side are locked with the week, by the database's own

select ok(
  not has_function_privilege('anon', 'private.lock_week_edges(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.lock_week_edges(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.lock_week_edges(uuid)', 'execute'),
  'the lock of the weeks either side is the database''s own'
);

select is(
  array[
    pg_temp.outcome(format('select private.lock_week_edges(%L::uuid)', pg_temp.id('this'))),
    pg_temp.outcome('select private.lock_week_edges(''91000000-0000-4000-d000-000000000001''::uuid)')
  ],
  array['ok', 'ok'],
  'the lock of the weeks either side runs for a week with both, and for a week that isn''t there (its order is pinned by tooling/running-week-edge.test.ts)'
);

------------------------------------------------------------------------------
-- The demo's renewal: whoever worked the night before is left out of the
-- first morning, and the week is published short, as it is with too few
-- people.

insert into ids
select 'd-last', public.open_schedule_week('91000000-0000-4000-b000-000000000003',
  d.week_start - 7, now())
from (
  select (now() at time zone 'Asia/Jerusalem')::date
    - extract(dow from (now() at time zone 'Asia/Jerusalem')::date)::integer as week_start
) d;

select is(
  (select public.publish_week_schedule('91000000-0000-4000-a000-00000000000b', pg_temp.id('d-last'),
    jsonb_build_array(pg_temp.shift((w.starts_on + 6)::text, 'Night', '22:00', '06:00', array['0c'])))
   from public.schedule_weeks w where w.id = pg_temp.id('d-last')),
  1,
  'the renewing business''s last week ends with c''s night'
);

select is(
  private.renew_demo_schedule('91000000-0000-4000-b000-000000000003'),
  true,
  'the renewal publishes this week'
);

select is(
  (select array[(w.schedule_published_at is not null)::text, count(a.user_id)::text]
   from public.schedule_weeks w
   join public.schedule_shifts s on s.week_id = w.id
   left join public.shift_assignments a on a.shift_id = s.id
   where w.business_id = '91000000-0000-4000-b000-000000000003'
     and w.id <> pg_temp.id('d-last')
   group by w.id, w.schedule_published_at),
  array['true', '0'],
  'with its first morning left short rather than given to whoever worked the night before'
);

-- And the other side: E's next week, already published, starts with e's
-- early morning, from 05:00, which this week's last night would run into.
insert into ids
select 'e-next', public.open_schedule_week('91000000-0000-4000-b000-000000000004',
  d.week_start + 7, now())
from (
  select (now() at time zone 'Asia/Jerusalem')::date
    - extract(dow from (now() at time zone 'Asia/Jerusalem')::date)::integer as week_start
) d;

select is(
  (select public.publish_week_schedule('91000000-0000-4000-a000-00000000000d', pg_temp.id('e-next'),
    jsonb_build_array(pg_temp.shift(w.starts_on::text, 'Early', '05:00', '09:00', array['0e'])))
   from public.schedule_weeks w where w.id = pg_temp.id('e-next')),
  1,
  'the other renewing business''s next week starts with e''s early morning'
);

select is(
  private.renew_demo_schedule('91000000-0000-4000-b000-000000000004'),
  true,
  'the renewal publishes its week'
);

select is(
  (select array[(w.schedule_published_at is not null)::text, count(a.user_id)::text]
   from public.schedule_weeks w
   join public.schedule_shifts s on s.week_id = w.id
   left join public.shift_assignments a on a.shift_id = s.id
   where w.business_id = '91000000-0000-4000-b000-000000000004'
     and w.id <> pg_temp.id('e-next')
   group by w.id, w.schedule_published_at),
  array['true', '0'],
  'with its last night left short rather than given to whoever works the morning after'
);

select * from finish();
rollback;
