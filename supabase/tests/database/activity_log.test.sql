-- The activity log: publishing the schedule is written to it with what it
-- needs to read later, and a draft or a refused publish is not; owners and
-- managers read their own business's log, and so does the ConceptApp team while
-- viewing it as a manager or owner, but not as a worker, not after the session
-- ends, and never another business's.
begin;
select plan(26);

insert into auth.users (id, aud, role, phone)
values
  ('6c000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000961'),
  ('6c000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000962'),
  ('6c000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000963'),
  ('6c000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000964'),
  ('6c000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000965'),
  ('6c000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000966');

-- a: owner of X; b: manager of X; c, d: workers of X; e: manager of Y;
-- f: on the ConceptApp team, a member of neither.
insert into public.businesses (id, slug, name)
values
  ('6c000000-0000-4000-b000-000000000001', 'al-x', 'Activity X'),
  ('6c000000-0000-4000-b000-000000000002', 'al-y', 'Activity Y');

insert into public.memberships (business_id, user_id, role)
values
  ('6c000000-0000-4000-b000-000000000001', '6c000000-0000-4000-a000-00000000000a', 'owner'),
  ('6c000000-0000-4000-b000-000000000001', '6c000000-0000-4000-a000-00000000000b', 'manager'),
  ('6c000000-0000-4000-b000-000000000001', '6c000000-0000-4000-a000-00000000000c', 'worker'),
  ('6c000000-0000-4000-b000-000000000001', '6c000000-0000-4000-a000-00000000000d', 'worker'),
  ('6c000000-0000-4000-b000-000000000002', '6c000000-0000-4000-a000-00000000000e', 'manager');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('6c000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "positions": [{"key": "waiter", "name": "Waiter"}]}'),
  ('6c000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 0}');

insert into public.platform_staff (user_id, role)
values ('6c000000-0000-4000-a000-00000000000f', 'onboarder');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- X's publish rows, as whoever is signed in reads them.
create function pg_temp.published_rows() returns int language sql as $$
  select count(*)::int from public.audit_log
  where business_id = '6c000000-0000-4000-b000-000000000001' and action = 'schedule.publish'
$$;

set local role service_role;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values
  ('x', public.open_schedule_week('6c000000-0000-4000-b000-000000000001', '2026-11-08', '2026-11-04 16:00+00')),
  ('y', public.open_schedule_week('6c000000-0000-4000-b000-000000000002', '2026-11-08', '2026-11-04 16:00+00'));

-- Two shifts on different days: c works the 8th, d the 9th.
create temporary table week_x (shifts jsonb) on commit drop;
insert into week_x values ('[
  {"day": "2026-11-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
   "assignees": [{"user": "6c000000-0000-4000-a000-00000000000c", "position": "waiter"}]},
  {"day": "2026-11-09", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
   "assignees": [{"user": "6c000000-0000-4000-a000-00000000000d", "position": "waiter"}]}]');

-- A draft is not in the log.
select public.save_week_schedule('6c000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'x'), (select shifts from week_x));
select is(
  (select count(*)::int from public.audit_log
    where business_id = '6c000000-0000-4000-b000-000000000001' and action like 'schedule.%'),
  0,
  'saving a draft writes nothing to the log'
);

-- Publishing the first time.
select is(
  public.publish_week_schedule('6c000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'), (select shifts from week_x)),
  2,
  'publishing still returns the number of shifts'
);
select results_eq(
  $$select actor_id, details from public.audit_log
    where business_id = '6c000000-0000-4000-b000-000000000001' and action = 'schedule.publish'$$,
  $$values ('6c000000-0000-4000-a000-00000000000b'::uuid, jsonb_build_object(
    'week', (select id from ids where name = 'x'),
    'starts_on', '2026-11-08',
    'shifts', 2,
    'first', true,
    'swaps_removed', 0))$$,
  'the first publish is in the log, by whom, for which week, with its shifts'
);

-- Two requests waiting: c's is open, d's is taken by c.
insert into ids
select 'shift-8', id from public.schedule_shifts
  where week_id = (select id from ids where name = 'x') and day = '2026-11-08';
insert into ids
select 'shift-9', id from public.schedule_shifts
  where week_id = (select id from ids where name = 'x') and day = '2026-11-09';
select public.request_shift_swap('6c000000-0000-4000-a000-00000000000c',
  (select id from ids where name = 'shift-8'), null, '2026-11-05 08:00+00');
insert into ids values ('taken', public.request_shift_swap('6c000000-0000-4000-a000-00000000000d',
  (select id from ids where name = 'shift-9'), null, '2026-11-05 08:00+00'));
select public.take_shift_swap('6c000000-0000-4000-a000-00000000000c',
  (select id from ids where name = 'taken'), '2026-11-05 09:00+00');
select is(
  (select array_agg(status::text order by status::text) from public.shift_swaps
    where business_id = '6c000000-0000-4000-b000-000000000001'),
  array['open', 'taken'],
  'two swap requests are waiting'
);

-- Publishing again with changes removes them, and says so.
select public.publish_week_schedule('6c000000-0000-4000-a000-00000000000a',
  (select id from ids where name = 'x'), (select shifts from week_x));
select is_empty(
  $$select 1 from public.shift_swaps where business_id = '6c000000-0000-4000-b000-000000000001'$$,
  'publishing again removes the waiting requests with the old shifts'
);
select results_eq(
  $$select actor_id, details ->> 'first', details ->> 'swaps_removed', details ->> 'shifts'
    from public.audit_log
    where business_id = '6c000000-0000-4000-b000-000000000001' and action = 'schedule.publish'
    order by id$$,
  $$values
    ('6c000000-0000-4000-a000-00000000000b'::uuid, 'true', '0', '2'),
    ('6c000000-0000-4000-a000-00000000000a'::uuid, 'false', '2', '2')$$,
  'publishing again is in the log, not the first time, with the requests it removed'
);

-- Clearing a published week is still publishing: the log says no shifts.
select public.publish_week_schedule('6c000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'x'), '[]');
select is(
  (select details ->> 'shifts' from public.audit_log
    where business_id = '6c000000-0000-4000-b000-000000000001' and action = 'schedule.publish'
    order by id desc limit 1),
  '0',
  'publishing an empty week is in the log with no shifts'
);
select public.publish_week_schedule('6c000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'x'), (select shifts from week_x));

-- A refused publish writes nothing.
select throws_ok(
  $$select public.publish_week_schedule('6c000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'a worker cannot publish'
);
select throws_ok(
  $$select public.publish_week_schedule('6c000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'y'), '[]')$$,
  '42501', null, 'a manager of X cannot publish Y'
);
select throws_ok(
  $$select public.publish_week_schedule('6c000000-0000-4000-a000-00000000000b',
    gen_random_uuid(), '[]')$$,
  'P0002', null, 'an unknown week cannot be published'
);
select is(
  (select count(*)::int from public.audit_log where action = 'schedule.publish'),
  4,
  'and none of them is in the log'
);

-- Y's own publish, for the isolation checks below.
select public.publish_week_schedule('6c000000-0000-4000-a000-00000000000e',
  (select id from ids where name = 'y'), '[]');
select is(
  (select business_id from public.audit_log
    where action = 'schedule.publish' and actor_id = '6c000000-0000-4000-a000-00000000000e'),
  '6c000000-0000-4000-b000-000000000002'::uuid,
  'a publish is logged in its own business'
);
reset role;

-- Owners and managers read their own business's log.
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000b');
select is(pg_temp.published_rows(), 4, 'the manager reads every publish of X');
select is_empty(
  $$select 1 from public.audit_log where business_id <> '6c000000-0000-4000-b000-000000000001'$$,
  'and nothing of Y'
);
reset role;
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000a');
select is(pg_temp.published_rows(), 4, 'the owner reads them too');
reset role;
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000c');
select is_empty($$select 1 from public.audit_log$$, 'a worker reads none of the log');
reset role;
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000e');
select is(pg_temp.published_rows(), 0, 'a manager of Y reads nothing of X');
reset role;

-- The team reads nothing without a view session.
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000f');
select is_empty($$select 1 from public.audit_log$$, 'the team reads no log without viewing');
reset role;

-- Viewing X as a manager reads X's log, as its manager does.
set local role service_role;
select public.start_view_session('6c000000-0000-4000-a000-00000000000f',
  '6c000000-0000-4000-b000-000000000001', 'manager');
reset role;
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000f');
select is(pg_temp.published_rows(), 4, 'viewing X as a manager reads its publishes');
select is(
  (select count(*)::int from public.audit_log
    where business_id = '6c000000-0000-4000-b000-000000000001'
      and action = 'view_as.start' and actor_id = '6c000000-0000-4000-a000-00000000000f'),
  1,
  'and the start of the view itself'
);
select is_empty(
  $$select 1 from public.audit_log where business_id <> '6c000000-0000-4000-b000-000000000001'$$,
  'but nothing of another business'
);
select throws_ok(
  $$insert into public.audit_log (business_id, action)
    values ('6c000000-0000-4000-b000-000000000001', 'forged')$$,
  '42501', null, 'and still writes nothing to it'
);
reset role;

-- As the owner too.
set local role service_role;
select public.start_view_session('6c000000-0000-4000-a000-00000000000f',
  '6c000000-0000-4000-b000-000000000001', 'owner');
reset role;
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000f');
select is(pg_temp.published_rows(), 4, 'viewing X as the owner reads its log');
reset role;

-- Not as a worker.
set local role service_role;
select public.start_view_session('6c000000-0000-4000-a000-00000000000f',
  '6c000000-0000-4000-b000-000000000001', 'worker');
reset role;
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000f');
select is_empty($$select 1 from public.audit_log$$, 'viewing X as a worker reads none of the log');
reset role;

-- Not once the session has run out.
set local role service_role;
select public.start_view_session('6c000000-0000-4000-a000-00000000000f',
  '6c000000-0000-4000-b000-000000000001', 'manager');
reset role;
update public.view_sessions set expires_at = now() - interval '1 minute'
  where staff_id = '6c000000-0000-4000-a000-00000000000f' and ended_at is null;
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000f');
select is_empty($$select 1 from public.audit_log$$, 'an expired view reads none of the log');
reset role;

-- Nor once it has ended.
set local role service_role;
select public.start_view_session('6c000000-0000-4000-a000-00000000000f',
  '6c000000-0000-4000-b000-000000000001', 'manager');
select public.end_view_session('6c000000-0000-4000-a000-00000000000f');
reset role;
select pg_temp.sign_in('6c000000-0000-4000-a000-00000000000f');
select is_empty($$select 1 from public.audit_log$$, 'an ended view reads none of the log');
reset role;

select * from finish();
rollback;
