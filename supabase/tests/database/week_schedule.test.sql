-- The week's schedule: only the server saves it, for an active manager or
-- owner; shifts stay inside the week, people are active members on one
-- shift at a time, positions are the business's; managers read it,
-- workers and other businesses do not, and switching scheduling off
-- closes it.
begin;
select plan(38);

insert into auth.users (id, aud, role, phone)
values
  ('65000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000871'),
  ('65000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000872'),
  ('65000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000873'),
  ('65000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000874'),
  ('65000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000875'),
  ('65000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000876'),
  ('65000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500000877');

-- a: owner of X; b: manager of X; c, d: workers of X; e: manager of Y;
-- f: an inactive manager of X; g: on the ConceptApp team (views X).
insert into public.businesses (id, slug, name)
values
  ('65000000-0000-4000-b000-000000000001', 'ws-x', 'Schedule X'),
  ('65000000-0000-4000-b000-000000000002', 'ws-y', 'Schedule Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('65000000-0000-4000-b000-000000000001', '65000000-0000-4000-a000-00000000000a', 'owner', true),
  ('65000000-0000-4000-b000-000000000001', '65000000-0000-4000-a000-00000000000b', 'manager', true),
  ('65000000-0000-4000-b000-000000000001', '65000000-0000-4000-a000-00000000000c', 'worker', true),
  ('65000000-0000-4000-b000-000000000001', '65000000-0000-4000-a000-00000000000d', 'worker', true),
  ('65000000-0000-4000-b000-000000000002', '65000000-0000-4000-a000-00000000000e', 'manager', true),
  ('65000000-0000-4000-b000-000000000001', '65000000-0000-4000-a000-00000000000f', 'manager', false);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('65000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "positions": [{"key": "waiter", "name": "Waiter"}, {"key": "cook", "name": "Cook"}]}'),
  ('65000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 0}');

insert into public.platform_staff (user_id, role)
values ('65000000-0000-4000-a000-000000000010', 'onboarder');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

set local role service_role;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values
  ('x', public.open_schedule_week('65000000-0000-4000-b000-000000000001', '2026-11-01', '2026-10-28 16:00+00')),
  ('y', public.open_schedule_week('65000000-0000-4000-b000-000000000002', '2026-11-01', '2026-10-28 16:00+00'));
reset role;

-- Nobody but the server may save a schedule or write its tables.
select pg_temp.sign_in('65000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000a',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'a signed-in owner cannot save through the function'
);
select throws_ok(
  $$insert into public.schedule_shifts (business_id, week_id, day, name, starts_at, ends_at, needed)
    values ('65000000-0000-4000-b000-000000000001', (select id from ids where name = 'x'),
      '2026-11-01', 'Morning', '07:00', '15:00', 2)$$,
  '42501', null, 'a signed-in owner cannot insert a shift'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000a',
    gen_random_uuid(), '[]')$$,
  '42501', null, 'an anonymous visitor cannot save a schedule'
);
reset role;

-- Saving.
set local role service_role;
select is(
  public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": " Morning ", "start": "07:00", "end": "15:00", "needed": 2,
       "pattern": "morning",
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000c", "position": "waiter"},
                     {"user": "65000000-0000-4000-a000-00000000000d"}]},
      {"day": "2026-11-01", "name": "Evening", "start": "15:00", "end": "01:00", "needed": 3,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000c", "position": "cook"}]},
      {"day": "2026-11-02", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1}]'),
  3,
  'a manager saves the week and gets the number of shifts'
);
select results_eq(
  $$select day::text, name, starts_at::text, ends_at::text, needed, pattern_key
    from public.schedule_shifts where week_id = (select id from ids where name = 'x')
    order by day, starts_at$$,
  $$values ('2026-11-01', 'Morning', '07:00:00', '15:00:00', 2, 'morning'),
           ('2026-11-01', 'Evening', '15:00:00', '01:00:00', 3, null),
           ('2026-11-02', 'Morning', '07:00:00', '15:00:00', 1, null)$$,
  'the shifts are saved, names trimmed, a shift may run past midnight'
);
select results_eq(
  $$select s.name, a.user_id, a.position_key
    from public.shift_assignments a join public.schedule_shifts s on s.id = a.shift_id
    where a.business_id = '65000000-0000-4000-b000-000000000001'
    order by s.starts_at, a.user_id$$,
  $$values ('Morning', '65000000-0000-4000-a000-00000000000c'::uuid, 'waiter'),
           ('Morning', '65000000-0000-4000-a000-00000000000d'::uuid, null),
           ('Evening', '65000000-0000-4000-a000-00000000000c'::uuid, 'cook')$$,
  'each person lands on their own shift, with their position (back-to-back shifts are fine)'
);
select isnt(
  (select schedule_saved_at from public.schedule_weeks where id = (select id from ids where name = 'x')),
  null,
  'the week remembers when its schedule was saved'
);
select is(
  public.save_week_schedule('65000000-0000-4000-a000-00000000000a',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-07", "name": "Night", "start": "20:00", "end": "02:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000a"}]}]'),
  1,
  'an owner saves too, and may work a shift'
);
select is(
  (select count(*)::int from public.schedule_shifts where week_id = (select id from ids where name = 'x'))
    || '/' || (select count(*)::int from public.shift_assignments
      where business_id = '65000000-0000-4000-b000-000000000001'),
  '1/1',
  'saving again replaces the whole week'
);

select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'a worker cannot save the schedule'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000f',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'an inactive manager cannot save the schedule'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000e',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'a manager of another business cannot save here'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b', gen_random_uuid(), '[]')$$,
  'P0002', null, 'an unknown week is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1}]')$$,
  '22023', null, 'a shift after the week is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-10-31", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1}]')$$,
  '22023', null, 'a shift before the week is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "07:00", "end": "07:00", "needed": 1}]')$$,
  '22023', null, 'a shift that starts and ends together is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "  ", "start": "07:00", "end": "15:00", "needed": 1}]')$$,
  '22023', null, 'a shift without a name is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 0}]')$$,
  '22023', null, 'a shift that needs nobody is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "7am", "end": "15:00", "needed": 1}]')$$,
  '22023', null, 'a malformed time is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "not-an-id"}]}]')$$,
  '22023', null, 'a malformed person id is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000c"},
                     {"user": "65000000-0000-4000-a000-00000000000c"}]}]')$$,
  '22023', null, 'the same person twice on a shift is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000e"}]}]')$$,
  '22023', null, 'a member of another business cannot be put on a shift'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000f"}]}]')$$,
  '22023', null, 'an inactive member cannot be put on a shift'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000c", "position": "pilot"}]}]')$$,
  '22023', null, 'a position the business does not have is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000c"}]},
      {"day": "2026-11-01", "name": "Brunch", "start": "11:00", "end": "16:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000c"}]}]')$$,
  '22023', null, 'one person on two overlapping shifts is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "name": "Night", "start": "20:00", "end": "03:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000c"}]},
      {"day": "2026-11-02", "name": "Early", "start": "02:00", "end": "08:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000c"}]}]')$$,
  '22023', null, 'a night shift overlapping the next morning''s is refused'
);
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'), '{"day": "2026-11-01"}')$$,
  '22023', null, 'shifts that are not a list are refused'
);
select is(
  (select count(*)::int from public.schedule_shifts where week_id = (select id from ids where name = 'x')),
  1,
  'a refused save leaves the last one as it was'
);
select is(
  public.save_week_schedule('65000000-0000-4000-a000-00000000000e',
    (select id from ids where name = 'y'),
    '[{"day": "2026-11-03", "name": "Lunch", "start": "11:00", "end": "16:00", "needed": 1,
       "assignees": [{"user": "65000000-0000-4000-a000-00000000000e"}]}]'),
  1,
  'business Y saves its own week'
);
reset role;

-- Who reads what.
select pg_temp.sign_in('65000000-0000-4000-a000-00000000000b');
select is(
  (select array_agg(name) from public.schedule_shifts) || (select count(*)::int from public.shift_assignments)::text,
  array['Night', '1'],
  'a manager reads their business''s shifts and assignments only'
);
select pg_temp.sign_in('65000000-0000-4000-a000-00000000000a');
select is((select count(*)::int from public.shift_assignments), 1, 'an owner reads the assignments');

select pg_temp.sign_in('65000000-0000-4000-a000-00000000000c');
select is(
  (select count(*)::int from public.schedule_shifts) + (select count(*)::int from public.shift_assignments),
  0,
  'a worker reads no shifts before publishing'
);

select pg_temp.sign_in('65000000-0000-4000-a000-00000000000f');
select is((select count(*)::int from public.schedule_shifts), 0, 'an inactive manager reads no shifts');

reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.schedule_shifts',
  '42501', null, 'an anonymous visitor reads no shifts'
);
reset role;

-- Viewing as: a manager's view reads the schedule, a worker's view does not.
insert into public.view_sessions (staff_id, business_id, role)
values ('65000000-0000-4000-a000-000000000010', '65000000-0000-4000-b000-000000000001', 'worker');
select pg_temp.sign_in('65000000-0000-4000-a000-000000000010');
select is((select count(*)::int from public.schedule_shifts), 0, 'viewing as a worker reads no shifts');
reset role;
update public.view_sessions set role = 'manager'
where staff_id = '65000000-0000-4000-a000-000000000010';
select pg_temp.sign_in('65000000-0000-4000-a000-000000000010');
select is(
  (select count(*)::int from public.schedule_shifts) || '/' || (select count(*)::int from public.shift_assignments),
  '1/1',
  'viewing as a manager reads the shifts and assignments'
);
reset role;

-- Switching scheduling off closes the schedule.
update public.business_modules set enabled = false
where business_id = '65000000-0000-4000-b000-000000000001' and module_key = 'scheduling';
select pg_temp.sign_in('65000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::int from public.schedule_shifts) + (select count(*)::int from public.shift_assignments),
  0,
  'with scheduling off a manager reads no shifts'
);
reset role;
set local role service_role;
select throws_ok(
  $$select public.save_week_schedule('65000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'with scheduling off nobody saves a schedule'
);
reset role;

select * from finish();
rollback;
