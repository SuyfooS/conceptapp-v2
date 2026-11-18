-- Availability: weeks open on the business's start day, members save their
-- own availability through the server, managers read everyone's, workers
-- only their own, nobody reads another business, and switching scheduling
-- off closes it all.
begin;
select plan(42);

insert into auth.users (id, aud, role, phone)
values
  ('64000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000861'),
  ('64000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000862'),
  ('64000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000863'),
  ('64000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000864'),
  ('64000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000865'),
  ('64000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000866'),
  ('64000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500000867');

-- a: owner of X; b: manager of X; c, d: workers of X; e: worker of Y;
-- f: an inactive worker of X; g: on the ConceptApp team (views X).
-- X starts its week on Sunday, Y on Monday; Z has scheduling off.
insert into public.businesses (id, slug, name)
values
  ('64000000-0000-4000-b000-000000000001', 'av-x', 'Avail X'),
  ('64000000-0000-4000-b000-000000000002', 'av-y', 'Avail Y'),
  ('64000000-0000-4000-b000-000000000003', 'av-z', 'Avail Z');

insert into public.memberships (business_id, user_id, role, active)
values
  ('64000000-0000-4000-b000-000000000001', '64000000-0000-4000-a000-00000000000a', 'owner', true),
  ('64000000-0000-4000-b000-000000000001', '64000000-0000-4000-a000-00000000000b', 'manager', true),
  ('64000000-0000-4000-b000-000000000001', '64000000-0000-4000-a000-00000000000c', 'worker', true),
  ('64000000-0000-4000-b000-000000000001', '64000000-0000-4000-a000-00000000000d', 'worker', true),
  ('64000000-0000-4000-b000-000000000002', '64000000-0000-4000-a000-00000000000e', 'worker', true),
  ('64000000-0000-4000-b000-000000000001', '64000000-0000-4000-a000-00000000000f', 'worker', false),
  -- One place on a staff per login (20261110000900_several_businesses.sql):
  -- in Z, e keeps the books.
  ('64000000-0000-4000-b000-000000000003', '64000000-0000-4000-a000-00000000000e', 'accountant', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('64000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('64000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 1}'),
  ('64000000-0000-4000-b000-000000000003', 'scheduling', false, '{}');

insert into public.platform_staff (user_id, role)
values ('64000000-0000-4000-a000-000000000010', 'onboarder');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Nobody but the server may open a week or save availability.
select pg_temp.sign_in('64000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.open_schedule_week('64000000-0000-4000-b000-000000000001',
    '2026-11-01', '2026-10-28 16:00+00')$$,
  '42501', null, 'a signed-in owner cannot open a week through the function'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000a',
    gen_random_uuid(), '[]')$$,
  '42501', null, 'a signed-in member cannot save availability through the function'
);
select throws_ok(
  $$insert into public.schedule_weeks (business_id, starts_on, availability_due_at)
    values ('64000000-0000-4000-b000-000000000001', '2026-11-08', now())$$,
  '42501', null, 'a signed-in owner cannot insert a week'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000a',
    gen_random_uuid(), '[]')$$,
  '42501', null, 'an anonymous visitor cannot save availability'
);
reset role;

-- Opening weeks.
set local role service_role;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

insert into ids values ('x', public.open_schedule_week(
  '64000000-0000-4000-b000-000000000001', '2026-11-01', '2026-10-28 16:00+00'));
select isnt((select id from ids where name = 'x'), null, 'the server opens a week');
select is(
  public.open_schedule_week('64000000-0000-4000-b000-000000000001',
    '2026-11-01', '2026-10-29 16:00+00'),
  (select id from ids where name = 'x'),
  'opening the same week again returns it'
);
select is(
  (select availability_due_at from public.schedule_weeks
   where id = (select id from ids where name = 'x')),
  '2026-10-28 16:00+00'::timestamptz,
  'opening it again keeps its due time'
);
select throws_ok(
  $$select public.open_schedule_week('64000000-0000-4000-b000-000000000001',
    '2026-11-02', '2026-10-28 16:00+00')$$,
  '22023', null, 'a week cannot start on another day than the business''s'
);
insert into ids values ('y', public.open_schedule_week(
  '64000000-0000-4000-b000-000000000002', '2026-11-02', '2026-10-29 16:00+00'));
select isnt((select id from ids where name = 'y'), null, 'a Monday business opens a Monday week');
select throws_ok(
  $$select public.open_schedule_week('64000000-0000-4000-b000-000000000003',
    '2026-11-01', '2026-10-28 16:00+00')$$,
  '42501', null, 'a business with scheduling off opens no week'
);

-- Saving availability.
select lives_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "start": "08:00", "end": "16:00"},
      {"day": "2026-11-03", "start": "18:00", "end": "02:00"}]',
    ' Exams on Thursday ')$$,
  'a worker saves their availability'
);
select is(
  (select note from public.availability_submissions
   where user_id = '64000000-0000-4000-a000-00000000000c'),
  'Exams on Thursday',
  'the note is saved trimmed'
);
insert into ids values ('c-first', (select id from public.availability_submissions
  where user_id = '64000000-0000-4000-a000-00000000000c'));
select is(
  public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-02", "start": "08:00", "end": "12:00"},
      {"day": "2026-11-02", "start": "12:00", "end": "16:00"}]'),
  (select id from ids where name = 'c-first'),
  'saving again updates the same submission (ranges may touch)'
);
select results_eq(
  $$select day::text, starts_at::text, ends_at::text from public.availability_ranges
    where submission_id = (select id from ids where name = 'c-first') order by starts_at$$,
  $$values ('2026-11-02', '08:00:00', '12:00:00'), ('2026-11-02', '12:00:00', '16:00:00')$$,
  'saving again replaces the ranges'
);
select is(
  (select note from public.availability_submissions
   where id = (select id from ids where name = 'c-first')),
  null,
  'saving again without a note clears it'
);
select lives_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000d',
    (select id from ids where name = 'x'), '[]')$$,
  'an empty list saves "not available this week"'
);
select is(
  (select count(*)::int from public.availability_ranges r
   join public.availability_submissions s on s.id = r.submission_id
   where s.user_id = '64000000-0000-4000-a000-00000000000d'),
  0,
  'not available this week has no ranges'
);
select lives_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000a',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-07", "start": "20:00", "end": "23:30"}]')$$,
  'an owner saves availability too'
);

select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000e',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'a member of another business cannot save availability here'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000f',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'an inactive member cannot save availability'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    gen_random_uuid(), '[]')$$,
  'P0002', null, 'an unknown week is refused'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-08", "start": "08:00", "end": "16:00"}]')$$,
  '22023', null, 'a range after the week is refused'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'),
    '[{"day": "2026-10-31", "start": "08:00", "end": "16:00"}]')$$,
  '22023', null, 'a range before the week is refused'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "start": "08:00", "end": "16:00"},
      {"day": "2026-11-01", "start": "15:00", "end": "20:00"}]')$$,
  '22023', null, 'overlapping ranges on a day are refused'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "start": "18:00", "end": "02:00"},
      {"day": "2026-11-01", "start": "23:00", "end": "23:30"}]')$$,
  '22023', null, 'a range inside one that runs past midnight is refused'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "start": "08:00", "end": "08:00"}]')$$,
  '22023', null, 'a range that starts and ends together is refused'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-01", "start": "8am", "end": "16:00"}]')$$,
  '22023', null, 'a malformed time is refused'
);
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'), '{"day": "2026-11-01"}')$$,
  '22023', null, 'ranges that are not a list are refused'
);
select is(
  (select count(*)::int from public.availability_ranges
   where submission_id = (select id from ids where name = 'c-first')),
  2,
  'a refused save leaves the last one as it was'
);

reset role;

-- Who reads what.
select pg_temp.sign_in('64000000-0000-4000-a000-00000000000c');
select is((select count(*)::int from public.schedule_weeks), 1, 'a worker reads their business''s week');
select is(
  (select array_agg(user_id) from public.availability_submissions),
  array['64000000-0000-4000-a000-00000000000c'::uuid],
  'a worker reads only their own availability'
);
select is((select count(*)::int from public.availability_ranges), 2, 'a worker reads only their own ranges');

select pg_temp.sign_in('64000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from public.availability_submissions), 3, 'a manager reads everyone''s availability');
select is((select count(*)::int from public.availability_ranges), 3, 'a manager reads everyone''s ranges');

select pg_temp.sign_in('64000000-0000-4000-a000-00000000000e');
select is(
  (select array_agg(starts_on::text) from public.schedule_weeks),
  array['2026-11-02'],
  'a member of another business reads only their own business''s weeks'
);
select is((select count(*)::int from public.availability_submissions), 0, 'a member of another business reads no availability here');

select pg_temp.sign_in('64000000-0000-4000-a000-00000000000f');
select is((select count(*)::int from public.schedule_weeks), 0, 'an inactive member reads no weeks');

reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.availability_submissions',
  '42501', null, 'an anonymous visitor reads no availability'
);
reset role;

-- Viewing as: a manager's view reads availability, a worker's view does not.
insert into public.view_sessions (staff_id, business_id, role)
values ('64000000-0000-4000-a000-000000000010', '64000000-0000-4000-b000-000000000001', 'worker');
select pg_temp.sign_in('64000000-0000-4000-a000-000000000010');
select is(
  (select count(*)::int from public.schedule_weeks) || '/' ||
  (select count(*)::int from public.availability_submissions),
  '1/0',
  'viewing as a worker reads the week and nobody''s availability'
);
reset role;
update public.view_sessions set role = 'manager'
where staff_id = '64000000-0000-4000-a000-000000000010';
select pg_temp.sign_in('64000000-0000-4000-a000-000000000010');
select is((select count(*)::int from public.availability_submissions), 3, 'viewing as a manager reads everyone''s availability');
reset role;

-- Switching scheduling off closes its data.
update public.business_modules set enabled = false
where business_id = '64000000-0000-4000-b000-000000000001' and module_key = 'scheduling';
select pg_temp.sign_in('64000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::int from public.schedule_weeks) + (select count(*)::int from public.availability_submissions)
    + (select count(*)::int from public.availability_ranges),
  0,
  'with scheduling off a manager reads no weeks, availability or ranges'
);
reset role;
set local role service_role;
select throws_ok(
  $$select public.submit_availability('64000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'with scheduling off nobody saves availability'
);
reset role;

select * from finish();
rollback;
