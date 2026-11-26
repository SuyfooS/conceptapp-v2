-- At most 50 people on a shift, in the database too
-- (20261128000500_shift_cap.sql): after each statement that puts people on a
-- shift, every shift it put more people on than it took off holds 50 or
-- fewer, or the statement is refused (22023, hint 'full', the shifts' ids in
-- DETAIL, in order), whatever the path: a direct insert, a save or a publish
-- with a new or edited shift, people joining a shift under way, an update
-- moving someone onto another shift. 50 passes, a 51st alone and 49 + 2 in
-- one statement don't, shift by shift and business by business. A swap on a
-- full shift (one person for another) goes through, and so do a position
-- changed and someone taken off a shift already over 50, which stays as it
-- is and takes nobody more. Fixed ids (ca5…), numbers (97250085xxxx) and
-- slugs (cap-…) of its own, and explicit times wherever the clock matters.
begin;
select plan(24);
set local timezone = 'UTC';

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('ca500000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.c() returns uuid language sql as $$
  select 'ca500000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.n() returns uuid language sql as $$
  select 'ca500000-0000-4000-b000-000000000002'::uuid
$$;

-- C: 100 its owner, 1 to 55 workers. N: 101 its owner, 201 to 251 workers.
insert into auth.users (id, aud, role, phone)
select pg_temp.p(n), 'authenticated', 'authenticated', '97250085' || lpad(n::text, 4, '0')
from generate_series(1, 251) as n
where n <= 55 or n in (100, 101) or n >= 201;

insert into public.businesses (id, slug, name)
values
  (pg_temp.c(), 'cap-c', 'Cap C'),
  (pg_temp.n(), 'cap-n', 'Cap N');

insert into public.memberships (business_id, user_id, role, active)
select (case when n = 101 or n >= 201 then pg_temp.n() else pg_temp.c() end),
  pg_temp.p(n),
  (case when n in (100, 101) then 'owner' else 'worker' end)::public.member_role,
  true
from generate_series(1, 251) as n
where n <= 55 or n in (100, 101) or n >= 201;

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.c(), 'scheduling', true, '{"weekStartsOn": 0}'),
  (pg_temp.n(), 'scheduling', true, '{"weekStartsOn": 0}');

create temporary table ids (name text primary key, id uuid) on commit drop;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- These shifts' ids, as the refusal lists them: by id.
create function pg_temp.ids_of(keys text[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(i.id order by i.id), '[]'::jsonb) from ids i where i.name = any (keys)
$$;

-- People from_n to to_n, as a shift's assignees.
create function pg_temp.people(from_n integer, to_n integer) returns jsonb language sql as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('user', pg_temp.p(g), 'position', null) order by g),
    '[]'::jsonb
  )
  from generate_series(from_n, to_n) as g
$$;

-- A shift as the builder sends it, needing 50.
create function pg_temp.shift(shift_name text, on_day text, starts text, ends text, people jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('day', on_day, 'name', shift_name, 'start', starts, 'end', ends,
    'needed', 50, 'pattern', null, 'assignees', people)
$$;

-- People joining shifts under way, as `joins` names them.
create function pg_temp.joining(shift_name text, people integer[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('shift', pg_temp.id(shift_name), 'user', pg_temp.p(g),
    'position', null) order by g)
  from unnest(people) as g
$$;

-- How many are on a shift, and whether someone is.
create function pg_temp.headcount(shift_name text) returns integer language sql as $$
  select count(*)::integer from public.shift_assignments a where a.shift_id = pg_temp.id(shift_name)
$$;
create function pg_temp.on_it(shift_name text, n integer) returns boolean language sql as $$
  select exists (
    select 1 from public.shift_assignments a
    where a.shift_id = pg_temp.id(shift_name) and a.user_id = pg_temp.p(n)
  )
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
    raise exception 'tried' using errcode = 'P0001', hint = 'cap-tried';
  exception when others then
    get stacked diagnostics code = returned_sqlstate, words = message_text,
      why = pg_exception_hint, more = pg_exception_detail;
    if why = 'cap-tried' then
      return 'ok';
    end if;
    return concat_ws(' | ', code, words, nullif(why, ''), nullif(more, ''));
  end;
end;
$$;

-- Runs a statement and keeps what it did, as a statement of its own would:
-- 'ok', or the refusal as pg_temp.outcome reads it, with nothing of the
-- statement left. Only what is expected to be refused goes through here, so
-- a count after it shows whether the refusal really left nobody on.
create function pg_temp.kept(statement text) returns text language plpgsql as $$
declare
  code text;
  words text;
  why text;
  more text;
begin
  begin
    execute statement;
    return 'ok';
  exception when others then
    get stacked diagnostics code = returned_sqlstate, words = message_text,
      why = pg_exception_hint, more = pg_exception_detail;
    return concat_ws(' | ', code, words, nullif(why, ''), nullif(more, ''));
  end;
end;
$$;

-- A statement putting people on shifts, by the shift's name and the person's
-- number.
create function pg_temp.adding(placed jsonb) returns text language sql as $$
  select format(
    'insert into public.shift_assignments (shift_id, business_id, user_id)
     select s.id, s.business_id, pg_temp.p(x.n)
     from jsonb_to_recordset(%L::jsonb) as x (shift text, n integer)
     join ids i on i.name = x.shift
     join public.schedule_shifts s on s.id = i.id',
    placed
  )
$$;

-- People put on shifts that should refuse them, kept if they weren't.
create function pg_temp.try_add(placed jsonb) returns text language sql as $$
  select pg_temp.kept(pg_temp.adding(placed))
$$;

-- A publish of one of C's weeks by its owner that should be refused, kept if
-- it wasn't.
create function pg_temp.try_publish(
  week_name text, payload jsonb, seen jsonb, at_time timestamptz, joins jsonb
) returns text language sql as $$
  select pg_temp.kept(format(
    'select public.publish_week_schedule(%L::uuid, %L::uuid, %L::jsonb, %L::jsonb, %L::timestamptz, %L::jsonb)',
    pg_temp.p(100), pg_temp.id(week_name), payload, seen, at_time, joins
  ))
$$;

-- The refusal, as pg_temp.outcome reads it.
create function pg_temp.crowded(names text[]) returns text language sql as $$
  select concat_ws(' | ', '22023', 'More than 50 people on a shift', 'full',
    pg_temp.ids_of(names)::text)
$$;

------------------------------------------------------------------------------
-- The triggers

select is(
  (select array_agg(
      t.tgname::text || ':'
        || (case when t.tgtype & 1 = 1 then 'row' else 'statement' end) || ':'
        || (case when t.tgtype & 2 = 2 then 'before' else 'after' end) || ':'
        || (case when t.tgtype & 4 = 4 then 'insert' when t.tgtype & 16 = 16 then 'update' else '?' end) || ':'
        || coalesce(t.tgoldtable::text, '-') || ':' || coalesce(t.tgnewtable::text, '-')
      order by t.tgname
    )
   from pg_trigger t
   where t.tgrelid = 'public.shift_assignments'::regclass
     and t.tgfoid = 'private.refuse_crowded_shifts()'::regprocedure
     and t.tgenabled = 'O'),
  array[
    'shift_assignments_at_most_50:statement:after:insert:-:new_rows',
    'shift_assignments_moved_at_most_50:statement:after:update:old_rows:new_rows'
  ],
  'two statement-level triggers count every insert and every update, with the rows they touched'
);

select ok(
  not has_function_privilege('authenticated', 'private.refuse_crowded_shifts()', 'execute')
  and not has_function_privilege('anon', 'private.refuse_crowded_shifts()', 'execute'),
  'nobody calls the count: it is the triggers'''
);

------------------------------------------------------------------------------
-- C's week of 6 December, published before it begins

insert into ids values
  ('w', public.open_schedule_week(pg_temp.c(), '2026-12-06', '2026-12-02 16:00+00')),
  ('w2', public.open_schedule_week(pg_temp.c(), '2026-12-13', '2026-12-09 16:00+00'));

-- Israel is two hours ahead of UTC in December. Tuesday's morning, 1 to 50;
-- its late shift, 1 to 49; Thursday's morning, 1 to 50.
select is(
  public.publish_week_schedule(pg_temp.p(100), pg_temp.id('w'),
    jsonb_build_array(
      pg_temp.shift('Big', '2026-12-08', '07:00', '15:00', pg_temp.people(1, 50)),
      pg_temp.shift('Late', '2026-12-08', '16:00', '23:00', pg_temp.people(1, 49)),
      pg_temp.shift('Thursday', '2026-12-10', '07:00', '15:00', pg_temp.people(1, 50))
    ),
    null, '2026-12-02 08:00+00', null),
  3,
  'a week with two shifts of 50 publishes, all of them put on in one statement'
);

insert into ids
select lower(s.name), s.id from public.schedule_shifts s where s.week_id = pg_temp.id('w');

select is(
  array[pg_temp.headcount('big'), pg_temp.headcount('late'), pg_temp.headcount('thursday')],
  array[50, 49, 50],
  '50 on a shift is taken, counted shift by shift'
);

------------------------------------------------------------------------------
-- Put on directly

select is(
  pg_temp.try_add('[{"shift": "big", "n": 51}]'),
  pg_temp.crowded(array['big']),
  'a 51st on a shift of 50 is refused, in a statement of its own'
);

-- The one taken, to 50, is undone: the late shift stays at 49 for the joins
-- below.
select is(
  array[
    pg_temp.try_add('[{"shift": "late", "n": 50}, {"shift": "late", "n": 51}]'),
    pg_temp.outcome(pg_temp.adding('[{"shift": "late", "n": 50}]'))
  ],
  array[pg_temp.crowded(array['late']), 'ok'],
  '49 and two more in one statement are refused; one more, to 50, is taken'
);

select is(
  pg_temp.try_add(
    '[{"shift": "big", "n": 51}, {"shift": "late", "n": 50}, {"shift": "thursday", "n": 52}]'
  ),
  pg_temp.crowded(array['big', 'thursday']),
  'one statement onto three shifts names the two it takes past 50, in order of id, and not the one it fills'
);

-- Each refused statement above was kept had it gone through, so the count
-- shows whether any put someone on.
select is(
  array[pg_temp.headcount('big'), pg_temp.headcount('late'), pg_temp.headcount('thursday')],
  array[50, 49, 50],
  'nothing refused stays'
);

------------------------------------------------------------------------------
-- A swap on a full shift: one person for another

insert into ids values
  ('swap', public.request_shift_swap(pg_temp.p(1), pg_temp.id('thursday'), null,
    '2026-12-07 08:00+00'));
select public.take_shift_swap(pg_temp.p(52), pg_temp.id('swap'), '2026-12-07 09:00+00');

select is(
  public.decide_shift_swap(pg_temp.p(100), pg_temp.id('swap'), true, '2026-12-07 10:00+00')::text,
  'approved',
  'a swap on a full shift is approved'
);

select is(
  array[pg_temp.headcount('thursday')::text, pg_temp.on_it('thursday', 52)::text,
    pg_temp.on_it('thursday', 1)::text],
  array['50', 'true', 'false'],
  'and the shift still holds 50: the one who took it, not the one who gave it'
);

------------------------------------------------------------------------------
-- Moved by an update

select is(
  array[
    pg_temp.outcome(format(
      'update public.shift_assignments set shift_id = %L::uuid where shift_id = %L::uuid and user_id = %L::uuid',
      pg_temp.id('big'), pg_temp.id('thursday'), pg_temp.p(52))),
    -- Two people trading shifts: each shift as full as before.
    pg_temp.outcome(format(
      'update public.shift_assignments
       set shift_id = (case when shift_id = %1$L::uuid then %2$L::uuid else %1$L::uuid end)
       where (shift_id = %1$L::uuid and user_id = %3$L::uuid)
         or (shift_id = %2$L::uuid and user_id = %4$L::uuid)',
      pg_temp.id('big'), pg_temp.id('thursday'), pg_temp.p(1), pg_temp.p(52))),
    pg_temp.outcome(format(
      'update public.shift_assignments set position_key = %L where shift_id = %L::uuid',
      'waiter', pg_temp.id('big')))
  ],
  array[pg_temp.crowded(array['big']), 'ok', 'ok'],
  'moving someone onto a full shift is refused; trading places, or a position changed, is not'
);

------------------------------------------------------------------------------
-- Joining a shift under way, through the write

-- Tuesday at 10:00 in Israel: the big shift is under way.
select is(
  pg_temp.try_publish('w', '[]', '{}', '2026-12-08 08:00+00', pg_temp.joining('big', array[51])),
  pg_temp.crowded(array['big']),
  'someone joining a shift of 50 under way is refused, and the publish with it'
);

-- The publish was kept had it gone through.
select is(pg_temp.headcount('big'), 50, 'and nobody joined it');

-- Tuesday at 17:00: the late shift, 49, is under way, the big one over.
select is(
  pg_temp.try_publish('w', '[]', '{}', '2026-12-08 15:00+00', pg_temp.joining('late', array[50, 51])),
  pg_temp.crowded(array['late']),
  'two joining a shift of 49 under way are refused'
);

select is(
  public.publish_week_schedule(pg_temp.p(100), pg_temp.id('w'), '[]', '{}',
    '2026-12-08 15:00+00', pg_temp.joining('late', array[50])),
  3,
  'one joining it, to 50, is taken'
);

select is(
  array[
    pg_temp.headcount('late')::text,
    pg_temp.try_publish('w', '[]', '{}', '2026-12-08 15:30+00', pg_temp.joining('late', array[51]))
  ],
  array['50', pg_temp.crowded(array['late'])],
  'and the next to join it is refused'
);

------------------------------------------------------------------------------
-- A draft: a new shift, and one edited

select matches(
  pg_temp.outcome(format(
    'select public.save_week_schedule(%L::uuid, %L::uuid, %L::jsonb, null, %L::timestamptz, null)',
    pg_temp.p(100), pg_temp.id('w2'),
    jsonb_build_array(pg_temp.shift('Crowded', '2026-12-15', '07:00', '15:00', pg_temp.people(1, 51))),
    '2026-12-09 08:00+00')),
  '^22023 \| More than 50 people on a shift \| full \| \["[0-9a-f-]{36}"\]$',
  'a new shift sent with 51 is refused, the week replaced or not'
);

select is(
  public.save_week_schedule(pg_temp.p(100), pg_temp.id('w2'),
    jsonb_build_array(pg_temp.shift('Tuesday', '2026-12-15', '07:00', '15:00', pg_temp.people(1, 50))),
    null, '2026-12-09 08:00+00', null),
  1,
  'one sent with 50 is saved'
);

insert into ids
select 'tuesday', s.id from public.schedule_shifts s where s.week_id = pg_temp.id('w2');

select is(
  pg_temp.outcome(format(
    'select public.save_week_schedule(%L::uuid, %L::uuid, %L::jsonb, %L::jsonb, %L::timestamptz, null)',
    pg_temp.p(100), pg_temp.id('w2'),
    jsonb_build_array(
      pg_temp.shift('Tuesday', '2026-12-15', '07:00', '15:00', pg_temp.people(1, 51))
        || jsonb_build_object('id', pg_temp.id('tuesday'))
    ),
    (select jsonb_object_agg(d.shift_id, d.digest) from private.week_digests(pg_temp.id('w2')) d),
    '2026-12-09 09:00+00')),
  pg_temp.crowded(array['tuesday']),
  'the shift written in place with a 51st is refused'
);

------------------------------------------------------------------------------
-- Another business's shift is its own

insert into ids values
  ('nw', public.open_schedule_week(pg_temp.n(), '2026-12-06', '2026-12-02 16:00+00'));

select is(
  public.publish_week_schedule(pg_temp.p(101), pg_temp.id('nw'),
    jsonb_build_array(
      pg_temp.shift('Neighbour', '2026-12-08', '07:00', '15:00', pg_temp.people(201, 250))
    ),
    null, '2026-12-02 08:00+00', null),
  1,
  'another business''s 50 at the same hours are taken, beside C''s 50'
);

insert into ids
select 'neighbour', s.id from public.schedule_shifts s where s.week_id = pg_temp.id('nw');

select is(
  array[
    pg_temp.try_add('[{"shift": "neighbour", "n": 251}]'),
    pg_temp.try_add('[{"shift": "neighbour", "n": 251}, {"shift": "late", "n": 51}]')
  ],
  array[pg_temp.crowded(array['neighbour']), pg_temp.crowded(array['late', 'neighbour'])],
  'and a 51st there is refused, each business''s shift named for itself'
);

------------------------------------------------------------------------------
-- A shift already over 50 stays as it is

-- Put there with the trigger off: no path of the app can now.
alter table public.shift_assignments disable trigger shift_assignments_at_most_50;
insert into public.shift_assignments (shift_id, business_id, user_id)
values (pg_temp.id('big'), pg_temp.c(), pg_temp.p(51));
alter table public.shift_assignments enable trigger shift_assignments_at_most_50;

select is(pg_temp.headcount('big'), 51, 'a shift over 50 from before stays as it is');

select is(
  array[
    pg_temp.outcome(format(
      'update public.shift_assignments set position_key = %L where shift_id = %L::uuid',
      'waiter', pg_temp.id('big'))),
    pg_temp.outcome(format(
      'update public.shift_assignments set user_id = %L::uuid where shift_id = %L::uuid and user_id = %L::uuid',
      pg_temp.p(53), pg_temp.id('big'), pg_temp.p(51))),
    pg_temp.outcome(format(
      'delete from public.shift_assignments where shift_id = %L::uuid and user_id = %L::uuid',
      pg_temp.id('big'), pg_temp.p(51)))
  ],
  array['ok', 'ok', 'ok'],
  'a position changed on it, someone replaced on it and someone taken off it all go through'
);

select is(
  pg_temp.try_add('[{"shift": "big", "n": 54}]'),
  pg_temp.crowded(array['big']),
  'and it takes nobody more'
);

select * from finish();
rollback;
