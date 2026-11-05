-- Shift swaps: only the server writes; a worker gives away their own
-- published shift before it starts; an active colleague who is free takes
-- it; a manager or owner approves (the colleague replaces the worker in the
-- same position) or declines; the worker may cancel until then. Members of
-- the business read its swaps, nobody else does. Every call passes the
-- time explicitly so the test does not depend on today's date.
begin;
select plan(36);

insert into auth.users (id, aud, role, phone)
values
  ('67000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000891'),
  ('67000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000892'),
  ('67000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000893'),
  ('67000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000894'),
  ('67000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000895'),
  ('67000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000896');

-- a: owner of X; b: manager of X; c, d: workers of X; e: worker of Y;
-- f: an inactive worker of X.
insert into public.businesses (id, slug, name)
values
  ('67000000-0000-4000-b000-000000000001', 'sw-x', 'Swap X'),
  ('67000000-0000-4000-b000-000000000002', 'sw-y', 'Swap Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('67000000-0000-4000-b000-000000000001', '67000000-0000-4000-a000-00000000000a', 'owner', true),
  ('67000000-0000-4000-b000-000000000001', '67000000-0000-4000-a000-00000000000b', 'manager', true),
  ('67000000-0000-4000-b000-000000000001', '67000000-0000-4000-a000-00000000000c', 'worker', true),
  ('67000000-0000-4000-b000-000000000001', '67000000-0000-4000-a000-00000000000d', 'worker', true),
  ('67000000-0000-4000-b000-000000000002', '67000000-0000-4000-a000-00000000000e', 'worker', true),
  ('67000000-0000-4000-b000-000000000001', '67000000-0000-4000-a000-00000000000f', 'worker', false);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('67000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "positions": [{"key": "waiter", "name": "Waiter"}]}'),
  ('67000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 0}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

set local role service_role;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values
  ('week', public.open_schedule_week('67000000-0000-4000-b000-000000000001', '2026-11-08', '2026-11-04 16:00+00')),
  ('draft', public.open_schedule_week('67000000-0000-4000-b000-000000000001', '2026-11-15', '2026-11-11 16:00+00'));

-- The week of 8.11 is published; the week of 15.11 is only a draft.
select public.publish_week_schedule('67000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'week'),
  '[{"day": "2026-11-08", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "67000000-0000-4000-a000-00000000000c", "position": "waiter"}]},
    {"day": "2026-11-08", "name": "Middle", "start": "11:00", "end": "19:00", "needed": 1,
     "assignees": [{"user": "67000000-0000-4000-a000-00000000000a"}]},
    {"day": "2026-11-08", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
     "assignees": [{"user": "67000000-0000-4000-a000-00000000000d"}]},
    {"day": "2026-11-09", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "67000000-0000-4000-a000-00000000000c"}]}]');
select public.save_week_schedule('67000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'draft'),
  '[{"day": "2026-11-15", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "67000000-0000-4000-a000-00000000000c"}]}]');
reset role;

insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.business_id = '67000000-0000-4000-b000-000000000001';

-- Nobody but the server writes.
select pg_temp.sign_in('67000000-0000-4000-a000-00000000000c');
select throws_ok(
  $$select public.request_shift_swap('67000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'morning-08'), null, '2026-11-05 08:00+00')$$,
  '42501', null, 'a signed-in worker cannot ask through the function'
);
select throws_ok(
  $$select public.decide_shift_swap('67000000-0000-4000-a000-00000000000b',
    gen_random_uuid(), true, '2026-11-05 08:00+00')$$,
  '42501', null, 'a signed-in manager cannot decide through the function'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.take_shift_swap('67000000-0000-4000-a000-00000000000d',
    gen_random_uuid(), '2026-11-05 08:00+00')$$,
  '42501', null, 'an anonymous visitor cannot take a shift'
);
reset role;

-- Asking.
set local role service_role;
select throws_ok(
  $$select public.request_shift_swap('67000000-0000-4000-a000-00000000000d',
    (select id from ids where name = 'morning-08'), null, '2026-11-05 08:00+00')$$,
  '42501', null, 'a worker cannot give away a shift they are not on'
);
select throws_ok(
  $$select public.request_shift_swap('67000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'morning-15'), null, '2026-11-05 08:00+00')$$,
  '55000', null, 'a shift of a week not yet published cannot be given away'
);
select throws_ok(
  $$select public.request_shift_swap('67000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'morning-08'), null, '2026-11-08 05:00+00')$$,
  '55000', null, 'a shift that started (07:00 in Israel is 05:00 UTC in winter) cannot be given away'
);
select throws_ok(
  $$select public.request_shift_swap('67000000-0000-4000-a000-00000000000c',
    gen_random_uuid(), null, '2026-11-05 08:00+00')$$,
  'P0002', null, 'an unknown shift cannot be given away'
);

insert into ids values ('first', public.request_shift_swap('67000000-0000-4000-a000-00000000000c',
  (select id from ids where name = 'morning-08'), '  Exam that morning  ', '2026-11-08 04:59+00'));
select results_eq(
  $$select status::text, note, taken_by from public.shift_swaps where id = (select id from ids where name = 'first')$$,
  $$values ('open', 'Exam that morning', null::uuid)$$,
  'a worker asks to give away their shift up to the minute before it starts'
);
select throws_ok(
  $$select public.request_shift_swap('67000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'morning-08'), null, '2026-11-05 08:00+00')$$,
  '23505', null, 'the same shift cannot be offered twice at once'
);
reset role;

-- Who reads the requests.
select pg_temp.sign_in('67000000-0000-4000-a000-00000000000d');
select is((select count(*)::int from public.shift_swaps), 1, 'a colleague reads the open request');
select pg_temp.sign_in('67000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from public.shift_swaps), 1, 'a manager reads it');
select pg_temp.sign_in('67000000-0000-4000-a000-00000000000e');
select is((select count(*)::int from public.shift_swaps), 0, 'a worker of another business reads nothing');
select pg_temp.sign_in('67000000-0000-4000-a000-00000000000f');
select is((select count(*)::int from public.shift_swaps), 0, 'an inactive worker reads nothing');
reset role;
set local role anon;
select throws_ok('select count(*) from public.shift_swaps', '42501', null, 'an anonymous visitor reads nothing');
reset role;

-- Taking.
set local role service_role;
select throws_ok(
  $$select public.take_shift_swap('67000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'first'), '2026-11-05 08:00+00')$$,
  '22023', null, 'a worker cannot take their own shift'
);
select throws_ok(
  $$select public.take_shift_swap('67000000-0000-4000-a000-00000000000f',
    (select id from ids where name = 'first'), '2026-11-05 08:00+00')$$,
  '42501', null, 'an inactive worker cannot take it'
);
select throws_ok(
  $$select public.take_shift_swap('67000000-0000-4000-a000-00000000000e',
    (select id from ids where name = 'first'), '2026-11-05 08:00+00')$$,
  '42501', null, 'a worker of another business cannot take it'
);
select throws_ok(
  $$select public.take_shift_swap('67000000-0000-4000-a000-00000000000a',
    (select id from ids where name = 'first'), '2026-11-05 08:00+00')$$,
  '22023', null, 'someone working another shift at the same time cannot take it'
);
select lives_ok(
  $$select public.take_shift_swap('67000000-0000-4000-a000-00000000000d',
    (select id from ids where name = 'first'), '2026-11-05 09:00+00')$$,
  'a free colleague takes it'
);
select results_eq(
  $$select status::text, taken_by from public.shift_swaps where id = (select id from ids where name = 'first')$$,
  $$values ('taken', '67000000-0000-4000-a000-00000000000d'::uuid)$$,
  'the request now waits for a manager'
);
select throws_ok(
  $$select public.take_shift_swap('67000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'first'), '2026-11-05 09:00+00')$$,
  '55000', null, 'a taken request cannot be taken again'
);

-- Deciding.
select throws_ok(
  $$select public.decide_shift_swap('67000000-0000-4000-a000-00000000000d',
    (select id from ids where name = 'first'), true, '2026-11-05 10:00+00')$$,
  '42501', null, 'a worker cannot approve'
);
select is(
  public.decide_shift_swap('67000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'first'), true, '2026-11-05 10:00+00'),
  'approved'::public.swap_status,
  'a manager approves'
);
select results_eq(
  $$select user_id, position_key from public.shift_assignments
    where shift_id = (select id from ids where name = 'morning-08')$$,
  $$values ('67000000-0000-4000-a000-00000000000d'::uuid, 'waiter')$$,
  'the colleague is on the shift in the same position, and the worker is off it'
);
select throws_ok(
  $$select public.cancel_shift_swap('67000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'first'))$$,
  '55000', null, 'an approved request cannot be cancelled'
);
select results_eq(
  $$select action from public.audit_log
    where business_id = '67000000-0000-4000-b000-000000000001' and action like 'swap.%'
    order by id$$,
  $$values ('swap.request'), ('swap.take'), ('swap.approve')$$,
  'each step is in the audit log'
);

-- Cancelling.
insert into ids values ('second', public.request_shift_swap('67000000-0000-4000-a000-00000000000c',
  (select id from ids where name = 'morning-09'), null, '2026-11-05 08:00+00'));
select throws_ok(
  $$select public.cancel_shift_swap('67000000-0000-4000-a000-00000000000d',
    (select id from ids where name = 'second'))$$,
  '42501', null, 'only the person who asked can cancel'
);
select lives_ok(
  $$select public.cancel_shift_swap('67000000-0000-4000-a000-00000000000c',
    (select id from ids where name = 'second'))$$,
  'the worker cancels their request'
);
select throws_ok(
  $$select public.take_shift_swap('67000000-0000-4000-a000-00000000000d',
    (select id from ids where name = 'second'), '2026-11-05 09:00+00')$$,
  '55000', null, 'a cancelled request cannot be taken'
);

-- Declining.
insert into ids values ('third', public.request_shift_swap('67000000-0000-4000-a000-00000000000d',
  (select id from ids where name = 'evening-08'), null, '2026-11-05 08:00+00'));
select public.take_shift_swap('67000000-0000-4000-a000-00000000000c',
  (select id from ids where name = 'third'), '2026-11-05 09:00+00');
select is(
  public.decide_shift_swap('67000000-0000-4000-a000-00000000000a',
    (select id from ids where name = 'third'), false, '2026-11-05 10:00+00'),
  'declined'::public.swap_status,
  'an owner declines'
);
select results_eq(
  $$select user_id from public.shift_assignments
    where shift_id = (select id from ids where name = 'evening-08')$$,
  $$values ('67000000-0000-4000-a000-00000000000d'::uuid)$$,
  'after a decline the worker stays on the shift'
);

-- The rules are checked again on approval.
insert into ids values ('fourth', public.request_shift_swap('67000000-0000-4000-a000-00000000000c',
  (select id from ids where name = 'morning-09'), null, '2026-11-05 08:00+00'));
select public.take_shift_swap('67000000-0000-4000-a000-00000000000d',
  (select id from ids where name = 'fourth'), '2026-11-05 09:00+00');
reset role;
-- Meanwhile d was put on another shift at the same time.
insert into public.schedule_shifts (id, business_id, week_id, day, name, starts_at, ends_at, needed)
values ('67000000-0000-4000-c000-000000000001', '67000000-0000-4000-b000-000000000001',
  (select id from ids where name = 'week'), '2026-11-09', 'Delivery', '06:00', '08:00', 1);
insert into public.shift_assignments (shift_id, business_id, user_id)
values ('67000000-0000-4000-c000-000000000001', '67000000-0000-4000-b000-000000000001',
  '67000000-0000-4000-a000-00000000000d');
set local role service_role;
select throws_ok(
  $$select public.decide_shift_swap('67000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'fourth'), true, '2026-11-05 10:00+00')$$,
  '22023', null, 'an approval is refused if the colleague is no longer free'
);
select results_eq(
  $$select status::text, (select user_id from public.shift_assignments
      where shift_id = (select id from ids where name = 'morning-09'))
    from public.shift_swaps where id = (select id from ids where name = 'fourth')$$,
  $$values ('taken', '67000000-0000-4000-a000-00000000000c'::uuid)$$,
  'the refused approval changes nothing'
);
select throws_ok(
  $$select public.decide_shift_swap('67000000-0000-4000-a000-00000000000b',
    (select id from ids where name = 'fourth'), true, '2026-11-09 05:00+00')$$,
  '55000', null, 'a shift that started cannot be swapped any more'
);
reset role;

-- Switching scheduling off closes it.
update public.business_modules set enabled = false
where business_id = '67000000-0000-4000-b000-000000000001' and module_key = 'scheduling';
select pg_temp.sign_in('67000000-0000-4000-a000-00000000000d');
select is((select count(*)::int from public.shift_swaps), 0, 'with scheduling off, members read no swaps');
reset role;
set local role service_role;
select throws_ok(
  $$select public.request_shift_swap('67000000-0000-4000-a000-00000000000d',
    (select id from ids where name = 'evening-08'), null, '2026-11-05 08:00+00')$$,
  '42501', null, 'with scheduling off, nobody asks for a swap'
);
reset role;

select * from finish();
rollback;
