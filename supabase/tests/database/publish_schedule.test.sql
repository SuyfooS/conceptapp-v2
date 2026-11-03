-- Publishing the week's schedule: only the server publishes, for an active
-- manager or owner, through the same rules as saving; a published week is
-- changed only by publishing again; once published the whole business
-- reads it (and "view as" any role), other businesses and inactive members
-- do not, and switching scheduling off closes it.
begin;
select plan(24);

insert into auth.users (id, aud, role, phone)
values
  ('66000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000881'),
  ('66000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000882'),
  ('66000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000883'),
  ('66000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000884'),
  ('66000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000885'),
  ('66000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000886'),
  ('66000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500000887');

-- a: owner of X; b: manager of X; c, d: workers of X; e: worker of Y;
-- f: an inactive worker of X; g: on the ConceptApp team (views X).
insert into public.businesses (id, slug, name)
values
  ('66000000-0000-4000-b000-000000000001', 'ps-x', 'Publish X'),
  ('66000000-0000-4000-b000-000000000002', 'ps-y', 'Publish Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('66000000-0000-4000-b000-000000000001', '66000000-0000-4000-a000-00000000000a', 'owner', true),
  ('66000000-0000-4000-b000-000000000001', '66000000-0000-4000-a000-00000000000b', 'manager', true),
  ('66000000-0000-4000-b000-000000000001', '66000000-0000-4000-a000-00000000000c', 'worker', true),
  ('66000000-0000-4000-b000-000000000001', '66000000-0000-4000-a000-00000000000d', 'worker', true),
  ('66000000-0000-4000-b000-000000000002', '66000000-0000-4000-a000-00000000000e', 'worker', true),
  ('66000000-0000-4000-b000-000000000001', '66000000-0000-4000-a000-00000000000f', 'worker', false);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('66000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "positions": [{"key": "waiter", "name": "Waiter"}]}'),
  ('66000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 0}');

insert into public.platform_staff (user_id, role)
values ('66000000-0000-4000-a000-000000000010', 'onboarder');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

set local role service_role;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values
  ('x', public.open_schedule_week('66000000-0000-4000-b000-000000000001', '2026-11-08', '2026-11-04 16:00+00')),
  ('y', public.open_schedule_week('66000000-0000-4000-b000-000000000002', '2026-11-08', '2026-11-04 16:00+00'));

-- A saved draft, not yet published.
select public.save_week_schedule('66000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'x'),
  '[{"day": "2026-11-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
     "assignees": [{"user": "66000000-0000-4000-a000-00000000000c", "position": "waiter"}]}]');
reset role;

-- Nobody but the server publishes.
select pg_temp.sign_in('66000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$select public.publish_week_schedule('66000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'a signed-in manager cannot publish through the function'
);
select throws_ok(
  $$select private.replace_week_schedule('66000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'a signed-in manager cannot reach the shared rules directly'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.publish_week_schedule('66000000-0000-4000-a000-00000000000b',
    gen_random_uuid(), '[]')$$,
  '42501', null, 'an anonymous visitor cannot publish'
);
reset role;

-- Before publishing, workers read nothing.
select pg_temp.sign_in('66000000-0000-4000-a000-00000000000c');
select is(
  (select count(*)::int from public.schedule_shifts) + (select count(*)::int from public.shift_assignments),
  0,
  'a worker reads no shifts of a draft'
);
reset role;

-- Publishing goes through the same rules as saving.
set local role service_role;
select throws_ok(
  $$select public.publish_week_schedule('66000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'a worker cannot publish'
);
select throws_ok(
  $$select public.publish_week_schedule('66000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'y'), '[]')$$,
  '42501', null, 'a manager cannot publish another business''s week'
);
select throws_ok(
  $$select public.publish_week_schedule('66000000-0000-4000-a000-00000000000b',
    gen_random_uuid(), '[]')$$,
  'P0002', null, 'an unknown week cannot be published'
);
select throws_ok(
  $$select public.publish_week_schedule('66000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-15", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1}]')$$,
  '22023', null, 'a shift outside the week is refused when publishing too'
);
select throws_ok(
  $$select public.publish_week_schedule('66000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
       "assignees": [{"user": "66000000-0000-4000-a000-00000000000d"}]},
      {"day": "2026-11-08", "name": "Middle", "start": "11:00", "end": "17:00", "needed": 1,
       "assignees": [{"user": "66000000-0000-4000-a000-00000000000d"}]}]')$$,
  '22023', null, 'someone on two shifts at once is refused when publishing too'
);
select is(
  (select schedule_published_at from public.schedule_weeks where id = (select id from ids where name = 'x')),
  null,
  'a refused publish leaves the week unpublished'
);

select is(
  public.publish_week_schedule('66000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
       "assignees": [{"user": "66000000-0000-4000-a000-00000000000c", "position": "waiter"},
                     {"user": "66000000-0000-4000-a000-00000000000d"}]},
      {"day": "2026-11-09", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1}]'),
  2,
  'a manager publishes the week and gets the number of shifts'
);
select ok(
  (select schedule_published_at is not null and schedule_published_at = schedule_saved_at
   from public.schedule_weeks where id = (select id from ids where name = 'x')),
  'the week remembers when it was published, which is also when it was saved'
);
select results_eq(
  $$select s.name, a.user_id, a.position_key
    from public.shift_assignments a join public.schedule_shifts s on s.id = a.shift_id
    where s.week_id = (select id from ids where name = 'x')
    order by s.starts_at, a.user_id$$,
  $$values ('Morning', '66000000-0000-4000-a000-00000000000c'::uuid, 'waiter'),
           ('Morning', '66000000-0000-4000-a000-00000000000d'::uuid, null)$$,
  'what is published replaces the draft'
);

-- A published week is changed only by publishing again.
select throws_ok(
  $$select public.save_week_schedule('66000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'), '[]')$$,
  '55000', null, 'a published week cannot be saved as a draft'
);
select is(
  (select count(*)::int from public.schedule_shifts where week_id = (select id from ids where name = 'x')),
  2,
  'the refused draft leaves the published week as it was'
);
select is(
  public.publish_week_schedule('66000000-0000-4000-a000-00000000000a',
    (select id from ids where name = 'x'),
    '[{"day": "2026-11-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
       "assignees": [{"user": "66000000-0000-4000-a000-00000000000c", "position": "waiter"}]},
      {"day": "2026-11-09", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
       "assignees": [{"user": "66000000-0000-4000-a000-00000000000d"}]}]'),
  2,
  'an owner publishes changes to a published week'
);
reset role;

-- Who reads a published week.
select pg_temp.sign_in('66000000-0000-4000-a000-00000000000c');
select is(
  (select count(*)::int from public.schedule_shifts) || '/' || (select count(*)::int from public.shift_assignments),
  '2/2',
  'a worker reads every shift of the published week and who works each'
);
select pg_temp.sign_in('66000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::int from public.schedule_shifts) || '/' || (select count(*)::int from public.shift_assignments),
  '2/2',
  'a manager still reads it'
);
select pg_temp.sign_in('66000000-0000-4000-a000-00000000000e');
select is(
  (select count(*)::int from public.schedule_shifts) + (select count(*)::int from public.shift_assignments),
  0,
  'a worker of another business reads nothing of it'
);
select pg_temp.sign_in('66000000-0000-4000-a000-00000000000f');
select is(
  (select count(*)::int from public.schedule_shifts) + (select count(*)::int from public.shift_assignments),
  0,
  'an inactive worker reads nothing of it'
);
reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.shift_assignments',
  '42501', null, 'an anonymous visitor reads no assignments'
);
reset role;

-- Viewing as a worker reads the published week.
insert into public.view_sessions (staff_id, business_id, role)
values ('66000000-0000-4000-a000-000000000010', '66000000-0000-4000-b000-000000000001', 'worker');
select pg_temp.sign_in('66000000-0000-4000-a000-000000000010');
select is(
  (select count(*)::int from public.schedule_shifts) || '/' || (select count(*)::int from public.shift_assignments),
  '2/2',
  'viewing as a worker reads the published week'
);
reset role;

-- Switching scheduling off closes it, and nobody publishes.
update public.business_modules set enabled = false
where business_id = '66000000-0000-4000-b000-000000000001' and module_key = 'scheduling';
select pg_temp.sign_in('66000000-0000-4000-a000-00000000000c');
select is(
  (select count(*)::int from public.schedule_shifts) + (select count(*)::int from public.shift_assignments),
  0,
  'with scheduling off a worker reads nothing'
);
reset role;
set local role service_role;
select throws_ok(
  $$select public.publish_week_schedule('66000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'x'), '[]')$$,
  '42501', null, 'with scheduling off nobody publishes'
);
reset role;

select * from finish();
rollback;
