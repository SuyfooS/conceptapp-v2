-- Swap history survives a deleted shift (20261115000200_swap_history.sql; the
-- running-week plan's R1c): a request keeps the shift it was made for
-- (`shift`, as private.shift_brief read it then, never rewritten), and its row
-- outlives the shift (on delete set null), so approved and declined requests
-- stay as they were, with who took them and who decided, after their shifts
-- are published away. A request still waiting never loses its shift: a
-- publish ends it first ('schedule'), a delete by hand is refused, and a
-- business deleted takes its requests with it. A cancelled request says why:
-- withdrawn, the schedule or the team. The policy is unchanged: the
-- business's staff read its requests, history too, and nobody else does.
-- Fixed ids (78…), numbers (9725000049xx) and slugs (swh-…) of its own, and
-- explicit times, so nothing here meets the seeded people or the clock.
begin;
select plan(23);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('78000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004901'),
  ('78000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004902'),
  ('78000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004903'),
  ('78000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004904'),
  ('78000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500004905'),
  ('78000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500004906'),
  ('78000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500004907');

-- X: 1 its owner, 2 its manager, 3 4 and 5 workers. Y: 6 its manager, 7 a
-- worker.
insert into public.businesses (id, slug, name)
values
  ('78000000-0000-4000-b000-000000000001', 'swh-x', 'Swap history X'),
  ('78000000-0000-4000-b000-000000000002', 'swh-y', 'Swap history Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('78000000-0000-4000-b000-000000000001', '78000000-0000-4000-a000-000000000001', 'owner', true),
  ('78000000-0000-4000-b000-000000000001', '78000000-0000-4000-a000-000000000002', 'manager', true),
  ('78000000-0000-4000-b000-000000000001', '78000000-0000-4000-a000-000000000003', 'worker', true),
  ('78000000-0000-4000-b000-000000000001', '78000000-0000-4000-a000-000000000004', 'worker', true),
  ('78000000-0000-4000-b000-000000000001', '78000000-0000-4000-a000-000000000005', 'worker', true),
  ('78000000-0000-4000-b000-000000000002', '78000000-0000-4000-a000-000000000006', 'manager', true),
  ('78000000-0000-4000-b000-000000000002', '78000000-0000-4000-a000-000000000007', 'worker', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('78000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('78000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 0}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Runs a statement and undoes it: 'ok', or the refusal's code.
create function pg_temp.outcome(statement text) returns text language plpgsql as $$
declare
  code text;
  why text;
begin
  begin
    execute statement;
    raise exception 'tried' using errcode = 'P0001', hint = 'swh-tried';
  exception when others then
    get stacked diagnostics code = returned_sqlstate, why = pg_exception_hint;
    if why = 'swh-tried' then
      return 'ok';
    end if;
    return code;
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

-- A week as the builder reads it (as week_in_place.test.sql reads it): the
-- shifts with their ids, times as "HH:MM", and what was seen.
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

-- What the screen read, with these shifts left out and these changes made.
create function pg_temp.sent(screen text, left_out text[], shift_name text, changes jsonb)
returns jsonb language sql as $$
  select coalesce(
    jsonb_agg(
      (case when x.e ->> 'id' = pg_temp.id(shift_name)::text then x.e || changes else x.e end)
      order by x.o
    ),
    '[]'::jsonb
  )
  from screens sc
  cross join lateral jsonb_array_elements(sc.shifts) with ordinality as x (e, o)
  where sc.name = screen
    and not exists (
      select 1 from unnest(left_out) as l (shift_key) where pg_temp.id(l.shift_key)::text = x.e ->> 'id'
    )
$$;

-- X's latest publish row.
create function pg_temp.last_log() returns jsonb language sql as $$
  select a.details from public.audit_log a
  where a.business_id = '78000000-0000-4000-b000-000000000001' and a.action = 'schedule.publish'
  order by a.id desc
  limit 1
$$;

-- A request as it stands: its status, why it was cancelled, and its shift
-- (by name here, or 'gone').
create function pg_temp.swap(swap_name text) returns text language sql as $$
  select sw.status::text || '/' || coalesce(sw.cancelled_because, '-') || '/' || coalesce(
    (select i.name from ids i where i.id = sw.shift_id), 'gone'
  )
  from public.shift_swaps sw where sw.id = pg_temp.id(swap_name)
$$;

------------------------------------------------------------------------------
-- The week, published, and a request on each of its days

insert into ids values
  ('week', public.open_schedule_week('78000000-0000-4000-b000-000000000001', '2026-11-22', '2026-11-18 16:00+00')),
  ('y-week', public.open_schedule_week('78000000-0000-4000-b000-000000000002', '2026-11-22', '2026-11-18 16:00+00'));

-- 3 on Sunday and Wednesday, 4 on Monday and Thursday, 5 on Tuesday and
-- Friday; 7 on Y's Sunday.
select public.publish_week_schedule('78000000-0000-4000-a000-000000000002', pg_temp.id('week'),
  '[{"day": "2026-11-22", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "78000000-0000-4000-a000-000000000003"}]},
    {"day": "2026-11-23", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "78000000-0000-4000-a000-000000000004"}]},
    {"day": "2026-11-24", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "78000000-0000-4000-a000-000000000005"}]},
    {"day": "2026-11-25", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
     "assignees": [{"user": "78000000-0000-4000-a000-000000000003"}]},
    {"day": "2026-11-26", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "78000000-0000-4000-a000-000000000004"}]},
    {"day": "2026-11-27", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "78000000-0000-4000-a000-000000000005"}]}]',
  at_time => '2026-11-18 08:00+00');
select public.publish_week_schedule('78000000-0000-4000-a000-000000000006', pg_temp.id('y-week'),
  '[{"day": "2026-11-22", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "78000000-0000-4000-a000-000000000007"}]}]',
  at_time => '2026-11-18 08:00+00');

insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.week_id = pg_temp.id('week');
insert into ids
select 'y-shift', s.id from public.schedule_shifts s where s.week_id = pg_temp.id('y-week');

-- Sunday: 3 gives it away, 4 takes it, the manager approves. Monday: 4 gives
-- it away, 3 takes it, the owner declines. Tuesday: 5 asks and withdraws.
-- Wednesday and Thursday: 3 and 4 ask, and nobody takes them yet. Friday: 5
-- asks, 3 takes it, and then 5 is taken off the team. On Y, 7 asks too.
insert into ids values
  ('s-sun', public.request_shift_swap('78000000-0000-4000-a000-000000000003',
    pg_temp.id('morning-22'), null, '2026-11-18 10:00+00')),
  ('s-mon', public.request_shift_swap('78000000-0000-4000-a000-000000000004',
    pg_temp.id('morning-23'), null, '2026-11-18 10:00+00')),
  ('s-tue', public.request_shift_swap('78000000-0000-4000-a000-000000000005',
    pg_temp.id('morning-24'), null, '2026-11-18 10:00+00')),
  ('s-wed', public.request_shift_swap('78000000-0000-4000-a000-000000000003',
    pg_temp.id('evening-25'), null, '2026-11-18 10:00+00')),
  ('s-thu', public.request_shift_swap('78000000-0000-4000-a000-000000000004',
    pg_temp.id('morning-26'), 'A wedding', '2026-11-18 10:00+00')),
  ('s-fri', public.request_shift_swap('78000000-0000-4000-a000-000000000005',
    pg_temp.id('morning-27'), null, '2026-11-18 10:00+00')),
  ('y-swap', public.request_shift_swap('78000000-0000-4000-a000-000000000007',
    pg_temp.id('y-shift'), null, '2026-11-18 10:00+00'));
select public.take_shift_swap('78000000-0000-4000-a000-000000000004', pg_temp.id('s-sun'), '2026-11-18 10:30+00');
select public.take_shift_swap('78000000-0000-4000-a000-000000000003', pg_temp.id('s-mon'), '2026-11-18 10:30+00');
select public.take_shift_swap('78000000-0000-4000-a000-000000000003', pg_temp.id('s-fri'), '2026-11-18 10:30+00');
select public.decide_shift_swap('78000000-0000-4000-a000-000000000002', pg_temp.id('s-sun'), true, '2026-11-18 11:00+00');
select public.decide_shift_swap('78000000-0000-4000-a000-000000000001', pg_temp.id('s-mon'), false, '2026-11-18 11:00+00');
select public.cancel_shift_swap('78000000-0000-4000-a000-000000000005', pg_temp.id('s-tue'));
select public.remove_member('78000000-0000-4000-a000-000000000001',
  '78000000-0000-4000-b000-000000000001', '78000000-0000-4000-a000-000000000005',
  '2026-11-18 12:00+00');

select is(
  (select sw.shift from public.shift_swaps sw where sw.id = pg_temp.id('s-thu')),
  '{"day": "2026-11-26", "name": "Morning", "start": "07:00", "end": "15:00"}'::jsonb,
  'a request keeps the shift it was made for: its day, name and hours'
);
select is(
  array[pg_temp.swap('s-tue'), pg_temp.swap('s-fri')],
  array['cancelled/withdrawn/morning-24', 'cancelled/team/morning-27'],
  'one withdrawn by whoever asked, and one ended when they left the team, each say why'
);

------------------------------------------------------------------------------
-- The shifts go, the requests stay

-- The manager publishes the week without Sunday, Monday and Wednesday, and
-- renames Thursday.
insert into screens select 'r1', s.shifts, s.basis from pg_temp.screen_of('week') s;
select is(
  public.publish_week_schedule('78000000-0000-4000-a000-000000000002', pg_temp.id('week'),
    pg_temp.sent('r1', array['morning-22', 'morning-23', 'evening-25'], 'morning-26',
      '{"name": "Opening"}'),
    (select sc.basis from screens sc where sc.name = 'r1'),
    '2026-11-19 08:00+00'),
  3,
  'a publish takes three shifts off the week and renames a fourth'
);
select is_empty(
  $$select 1 from public.schedule_shifts s
    where s.id in (select i.id from ids i where i.name in ('morning-22', 'morning-23', 'evening-25'))$$,
  'the three shifts are gone'
);
select is(
  (select row(sw.status, sw.shift_id, sw.shift, sw.requested_by, sw.taken_by, sw.decided_by, sw.decided_at)::text
   from public.shift_swaps sw where sw.id = pg_temp.id('s-sun')),
  row('approved'::public.swap_status, null::uuid,
    '{"day": "2026-11-22", "name": "Morning", "start": "07:00", "end": "15:00"}'::jsonb,
    '78000000-0000-4000-a000-000000000003'::uuid, '78000000-0000-4000-a000-000000000004'::uuid,
    '78000000-0000-4000-a000-000000000002'::uuid, '2026-11-18 11:00+00'::timestamptz)::text,
  'an approved request outlives its shift: who gave it, who took it, who approved it and when, and the shift it was'
);
select is(
  (select row(sw.status, sw.shift_id, sw.shift ->> 'day', sw.requested_by, sw.taken_by, sw.decided_by)::text
   from public.shift_swaps sw where sw.id = pg_temp.id('s-mon')),
  row('declined'::public.swap_status, null::uuid, '2026-11-23'::text,
    '78000000-0000-4000-a000-000000000004'::uuid, '78000000-0000-4000-a000-000000000003'::uuid,
    '78000000-0000-4000-a000-000000000001'::uuid)::text,
  'and so does a declined one'
);
select is(
  pg_temp.swap('s-wed') || ' ' || (select sw.shift::text from public.shift_swaps sw where sw.id = pg_temp.id('s-wed')),
  'cancelled/schedule/gone ' || '{"day": "2026-11-25", "end": "23:00", "name": "Evening", "start": "16:00"}'::jsonb::text,
  'one still waiting is cancelled by the schedule first, and stays with the shift it asked for'
);
select is(
  (select jsonb_agg(e.value -> 'id') from jsonb_array_elements(pg_temp.last_log() -> 'removed_swaps') as e (value)),
  jsonb_build_array(pg_temp.id('s-wed')),
  'the publish ended only the request still waiting, and says so'
);
select is(
  pg_temp.swap('s-thu') || '/' || (select sw.shift ->> 'name' from public.shift_swaps sw where sw.id = pg_temp.id('s-thu'))
    || '/' || (select s.name from public.schedule_shifts s where s.id = pg_temp.id('morning-26')),
  'open/-/morning-26/Morning/Opening',
  'a request on a shift renamed since waits on, and keeps the shift as it asked for it'
);
select is(
  (select count(*)::text || '/' || (count(*) filter (where sw.shift_id is null))::text
   from public.shift_swaps sw where sw.business_id = '78000000-0000-4000-b000-000000000001'),
  '6/3',
  'nothing is deleted: six requests, three of them on shifts that are gone'
);

------------------------------------------------------------------------------
-- A request still waiting keeps its shift, and a cancelled one says why

select throws_ok(
  format($$delete from public.schedule_shifts where id = %L$$, pg_temp.id('morning-26')),
  '23514', null,
  'a shift with a request still waiting is not deleted by hand: the request would lose it'
);
select throws_ok(
  format($$update public.shift_swaps set status = 'cancelled' where id = %L$$, pg_temp.id('s-thu')),
  '23514', null,
  'and a request is never cancelled without saying why'
);
select is(
  array[
    pg_temp.outcome(format($$select public.cancel_shift_swap(%L, %L)$$,
      '78000000-0000-4000-a000-000000000003', pg_temp.id('s-wed'))),
    pg_temp.outcome(format($$select public.take_shift_swap(%L, %L, %L)$$,
      '78000000-0000-4000-a000-000000000004', pg_temp.id('s-mon'), '2026-11-19 09:00+00')),
    pg_temp.outcome(format($$select public.decide_shift_swap(%L, %L, false, %L)$$,
      '78000000-0000-4000-a000-000000000002', pg_temp.id('s-sun'), '2026-11-19 09:00+00'))
  ],
  array['55000', '55000', '55000'],
  'a request whose shift is gone is closed: nobody withdraws it, takes it or decides it'
);

------------------------------------------------------------------------------
-- Who reads them: as before

select pg_temp.sign_in('78000000-0000-4000-a000-000000000004');
select is(
  (select count(*)::text || '/' || (count(*) filter (where sw.shift_id is null))::text
     || '/' || (count(*) filter (where sw.shift is not null))::text
   from public.shift_swaps sw),
  '6/3/6',
  'a worker reads the business''s requests, those whose shift is gone too, each with the shift it was'
);
select pg_temp.sign_in('78000000-0000-4000-a000-000000000002');
select is(
  (select sw.shift ->> 'day' from public.shift_swaps sw where sw.id = pg_temp.id('s-sun')),
  '2026-11-22',
  'and so does a manager, for the activity log'
);
select pg_temp.sign_in('78000000-0000-4000-a000-000000000007');
select is(
  (select count(*)::integer from public.shift_swaps),
  1,
  'a worker of another business reads only their own business''s'
);
select pg_temp.sign_in('78000000-0000-4000-a000-000000000005');
select is(
  (select count(*)::integer from public.shift_swaps),
  0,
  'and someone taken off the team reads none of it'
);
reset role;
set local role anon;
select throws_ok('select count(*) from public.shift_swaps', '42501', null, 'an anonymous visitor reads nothing');
reset role;

------------------------------------------------------------------------------
-- A week replaced, and a business deleted

-- Published with nothing read: every shift goes, Thursday's request with
-- them.
select public.publish_week_schedule('78000000-0000-4000-a000-000000000002', pg_temp.id('week'),
  '[{"day": "2026-11-26", "name": "Closing", "start": "16:00", "end": "23:00", "needed": 1}]',
  at_time => '2026-11-19 09:00+00');
select is(
  pg_temp.swap('s-thu'),
  'cancelled/schedule/gone',
  'a week replaced with nothing read ends its waiting requests by the schedule'
);
select is(
  (select count(*)::text || '/' || (count(*) filter (where sw.shift_id is null))::text
     || '/' || (count(*) filter (where sw.status in ('open', 'taken')))::text
   from public.shift_swaps sw where sw.business_id = '78000000-0000-4000-b000-000000000001'),
  '6/6/0',
  'and every request stays, none of them waiting on a shift that is gone'
);

-- Y, with 7's request still waiting, goes as a demo reset deletes a business.
select lives_ok(
  $$select private.purge_business_records('78000000-0000-4000-b000-000000000002')$$,
  'the database''s owner purges a business with a request still waiting'
);
select lives_ok(
  $$delete from public.businesses where id = '78000000-0000-4000-b000-000000000002'$$,
  'and it can go, its shifts with it'
);
select is_empty(
  $$select 1 from public.shift_swaps where business_id = '78000000-0000-4000-b000-000000000002'$$,
  'and its requests with it'
);

select * from finish();
rollback;
