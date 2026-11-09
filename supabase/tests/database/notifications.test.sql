-- Notifications in the app: only the server writes them, through the audit
-- log's trigger; each person reads their own, while they are an active member
-- of the line's audience and its modules are on. Publishing, the swap chain,
-- hours that wait for confirmation and someone joining each tell the right
-- people, and a line about the same thing replaces the last one. A failing
-- producer never blocks what it was about. Handled requests and hours are
-- settled for everyone, and the hours line tells a time that waits. Fixed ids of its own and explicit
-- times, so nothing here counts lines of the seeded demo people.
begin;
select plan(68);

insert into auth.users (id, aud, role, phone)
values
  ('71000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500001701'),
  ('71000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500001702'),
  ('71000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500001703'),
  ('71000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500001704'),
  ('71000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500001705'),
  ('71000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500001706'),
  ('71000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500001707'),
  ('71000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500001708'),
  ('71000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500001709'),
  ('71000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500001710'),
  ('71000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500001711'),
  ('71000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500001712');

-- X: a owner, b manager, c d e workers, f an inactive worker. Y: g a worker.
-- h is on the ConceptApp team, viewing X. Z is a demo business: i its owner,
-- j a worker. k joins X by invite. l is a second manager of X for one case.
insert into public.businesses (id, slug, name)
values
  ('71000000-0000-4000-b000-000000000001', 'nt-x', 'Notify X'),
  ('71000000-0000-4000-b000-000000000002', 'nt-y', 'Notify Y'),
  ('71000000-0000-4000-b000-000000000003', 'nt-z', 'Notify Z');

insert into public.memberships (business_id, user_id, role, active)
values
  ('71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-000000000001', 'owner', true),
  ('71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-000000000002', 'manager', true),
  ('71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-000000000003', 'worker', true),
  ('71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-000000000004', 'worker', true),
  ('71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-000000000005', 'worker', true),
  ('71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-000000000006', 'worker', false),
  ('71000000-0000-4000-b000-000000000002', '71000000-0000-4000-a000-000000000007', 'worker', true),
  ('71000000-0000-4000-b000-000000000003', '71000000-0000-4000-a000-000000000009', 'owner', true),
  ('71000000-0000-4000-b000-000000000003', '71000000-0000-4000-a000-00000000000a', 'worker', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('71000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "positions": [{"key": "waiter", "name": "Waiter"}]}'),
  ('71000000-0000-4000-b000-000000000001', 'time_clock', true, '{"requirePunchCode": true}'),
  ('71000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('71000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('71000000-0000-4000-b000-000000000002', 'notifications', true, '{}'),
  ('71000000-0000-4000-b000-000000000003', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('71000000-0000-4000-b000-000000000003', 'notifications', true, '{}');

insert into public.platform_staff (user_id, role)
values ('71000000-0000-4000-a000-000000000008', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('71000000-0000-4000-a000-000000000008', '71000000-0000-4000-b000-000000000001', 'manager');

insert into private.demo_businesses (business_id, definition)
values ('71000000-0000-4000-b000-000000000003', '{"slug": "nt-z"}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table counts (name text primary key, n integer) on commit drop;
grant all on ids, counts to authenticated, service_role;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- Who has a line in X about `thing` (its dedupe key), of this kind when one is
-- given; and who still has it unread.
create function pg_temp.who(what text, thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '71000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and (what is null or n.kind = what)
$$;
create function pg_temp.unread(thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '71000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and n.read_at is null
$$;
-- How many lines in X are about `thing`, and how many of them are settled.
create function pg_temp.settled(thing text) returns text language sql as $$
  select count(*)::text || '/' || count(n.resolved_at)::text
  from public.notifications n
  where n.business_id = '71000000-0000-4000-b000-000000000001' and n.dedupe_key = thing
$$;

------------------------------------------------------------------------------
-- Every template and business

select is(
  (select count(*)::integer from public.templates t
   where t.definition ? 'modules'
     and not (
       coalesce((t.definition #>> '{modules,notifications,enabled}')::boolean, false)
       and jsonb_typeof(t.definition #> '{modules,notifications,settings}') = 'object'
     )),
  0,
  'every template switches notifications on, with its settings'
);
select is(
  (select count(*)::integer from public.businesses b
   where not exists (
     select 1 from public.business_modules m
     where m.business_id = b.id and m.module_key = 'notifications' and m.enabled
   )),
  0,
  'and every business has them on'
);

------------------------------------------------------------------------------
-- Nobody but the server writes

select pg_temp.sign_in('71000000-0000-4000-a000-000000000003');
select throws_ok(
  $$insert into public.notifications (business_id, user_id, kind)
    values ('71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-000000000003', 'test.line')$$,
  '42501', null, 'a signed-in person cannot write a line'
);
select throws_ok(
  $$update public.notifications set read_at = now()$$,
  '42501', null, 'nor change one'
);
select throws_ok(
  $$delete from public.notifications$$,
  '42501', null, 'nor delete one'
);
select throws_ok(
  $$select private.notify('71000000-0000-4000-b000-000000000001',
    array['71000000-0000-4000-a000-000000000004'::uuid], 'test.line')$$,
  '42501', null, 'nor call private.notify'
);
select throws_ok(
  $$select public.read_notifications('71000000-0000-4000-a000-000000000003',
    '71000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'nor mark lines read from the browser'
);
reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.notifications',
  '42501', null, 'an anonymous visitor reads nothing'
);
reset role;

------------------------------------------------------------------------------
-- Publishing the first time

set local role service_role;
insert into ids values
  ('week', public.open_schedule_week('71000000-0000-4000-b000-000000000001', '2026-11-15', '2026-11-11 16:00+00')),
  ('z-week', public.open_schedule_week('71000000-0000-4000-b000-000000000003', '2026-11-15', '2026-11-11 16:00+00'));

-- c works Sunday morning, d the middle (overlapping it), e Monday morning.
select public.publish_week_schedule('71000000-0000-4000-a000-000000000002',
  pg_temp.id('week'),
  '[{"day": "2026-11-15", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "71000000-0000-4000-a000-000000000003", "position": "waiter"}]},
    {"day": "2026-11-15", "name": "Middle", "start": "11:00", "end": "19:00", "needed": 1,
     "assignees": [{"user": "71000000-0000-4000-a000-000000000004"}]},
    {"day": "2026-11-16", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "71000000-0000-4000-a000-000000000005"}]}]');
reset role;

insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.business_id = '71000000-0000-4000-b000-000000000001';

select is(
  pg_temp.who('schedule.published', 'schedule:' || pg_temp.id('week')),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000003',
        '71000000-0000-4000-a000-000000000004', '71000000-0000-4000-a000-000000000005']::uuid[],
  'the first publish tells every active member but the publisher'
);
select is(
  (select string_agg(n.params ->> 'mine', ',' order by n.user_id) from public.notifications n
   where n.kind = 'schedule.published' and n.business_id = '71000000-0000-4000-b000-000000000001'),
  '0,1,1,1',
  'each with how many shifts are theirs'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.user_id in ('71000000-0000-4000-a000-000000000002', '71000000-0000-4000-a000-000000000006',
                       '71000000-0000-4000-a000-000000000007')),
  0,
  'not the publisher, an inactive member or another business'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.kind = 'schedule.published' and n.business_id = '71000000-0000-4000-b000-000000000001'
     and (n.source_module <> 'scheduling' or n.audience_role <> 'worker'
       or n.actor_id <> '71000000-0000-4000-a000-000000000002' or n.push_state <> 'none'
       or n.read_at is not null or n.params ->> 'startsOn' <> '2026-11-15')),
  0,
  'about the schedule, for anyone in it, from the publisher, unread, for the week, and on no phone'
);

------------------------------------------------------------------------------
-- The swap chain

set local role service_role;
insert into ids values ('s1', public.request_shift_swap('71000000-0000-4000-a000-000000000003',
  pg_temp.id('morning-15'), null, '2026-11-12 08:00+00'));
reset role;
select is(
  pg_temp.who('swap.offered', 'swap.offer:' || pg_temp.id('s1')),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002',
        '71000000-0000-4000-a000-000000000005']::uuid[],
  'a request reaches the colleagues who could take it: not the one asking, nobody on an overlapping shift, nobody inactive'
);
select is(
  (select n.params -> 'shift' from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-000000000005' and n.kind = 'swap.offered'),
  '{"day": "2026-11-15", "name": "Morning", "start": "07:00", "end": "15:00"}'::jsonb,
  'and says which shift'
);

set local role service_role;
select public.take_shift_swap('71000000-0000-4000-a000-000000000005', pg_temp.id('s1'), '2026-11-12 09:00+00');
reset role;
select is(
  (select n.kind || '/' || (n.params ->> 'by') from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-000000000003' and n.dedupe_key = 'swap:' || pg_temp.id('s1')),
  'swap.taken/71000000-0000-4000-a000-000000000005',
  'taking it tells the one who asked, and who took it'
);
select is(
  (select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[]) from public.notifications n
   where n.dedupe_key = 'swap.approval:' || pg_temp.id('s1') and n.kind = 'swap.waiting'
     and n.audience_role = 'manager'),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002']::uuid[],
  'and the owners and managers, who approve'
);
select is(
  pg_temp.unread('swap.offer:' || pg_temp.id('s1')),
  '{}'::uuid[],
  'and the offers are settled for everyone'
);
select is(
  pg_temp.settled('swap.offer:' || pg_temp.id('s1')),
  '3/3',
  'so none of them still says the shift is free'
);

set local role service_role;
select public.decide_shift_swap('71000000-0000-4000-a000-000000000002', pg_temp.id('s1'), true, '2026-11-12 10:00+00');
reset role;
select is(
  pg_temp.who('swap.approved', 'swap:' || pg_temp.id('s1')),
  array['71000000-0000-4000-a000-000000000003', '71000000-0000-4000-a000-000000000005']::uuid[],
  'approving tells the one who asked and the one who took it'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-000000000003' and n.dedupe_key = 'swap:' || pg_temp.id('s1')),
  1,
  'with one line per person for the request, in place of the last'
);
select is(
  pg_temp.unread('swap.approval:' || pg_temp.id('s1')),
  '{}'::uuid[],
  'and settles the approval for everyone'
);
select is(
  pg_temp.settled('swap.approval:' || pg_temp.id('s1')),
  '2/2',
  'so no approval line still says it waits'
);
select is(
  pg_temp.who(null, 'swap:' || pg_temp.id('s1')),
  array['71000000-0000-4000-a000-000000000003', '71000000-0000-4000-a000-000000000005']::uuid[],
  'the manager who decided is not told'
);

-- d gives away the middle shift; e works Sunday morning now, so can't take it.
set local role service_role;
insert into ids values ('s2', public.request_shift_swap('71000000-0000-4000-a000-000000000004',
  pg_temp.id('middle-15'), null, '2026-11-12 11:00+00'));
reset role;
select is(
  pg_temp.who('swap.offered', 'swap.offer:' || pg_temp.id('s2')),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002',
        '71000000-0000-4000-a000-000000000003']::uuid[],
  'who is free follows the schedule as it is now'
);

set local role service_role;
select public.take_shift_swap('71000000-0000-4000-a000-000000000003', pg_temp.id('s2'), '2026-11-12 11:30+00');
select public.decide_shift_swap('71000000-0000-4000-a000-000000000001', pg_temp.id('s2'), false, '2026-11-12 12:00+00');
reset role;
select is(
  pg_temp.who('swap.declined', 'swap:' || pg_temp.id('s2')),
  array['71000000-0000-4000-a000-000000000003', '71000000-0000-4000-a000-000000000004']::uuid[],
  'declining tells both'
);
select is(
  pg_temp.unread('swap.approval:' || pg_temp.id('s2')),
  '{}'::uuid[],
  'and settles the approval'
);

-- d asks again, c takes it, and d withdraws.
set local role service_role;
insert into ids values ('s3', public.request_shift_swap('71000000-0000-4000-a000-000000000004',
  pg_temp.id('middle-15'), null, '2026-11-12 13:00+00'));
select public.take_shift_swap('71000000-0000-4000-a000-000000000003', pg_temp.id('s3'), '2026-11-12 13:30+00');
select public.cancel_shift_swap('71000000-0000-4000-a000-000000000004', pg_temp.id('s3'));
reset role;
select is(
  (select n.kind from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-000000000003' and n.dedupe_key = 'swap:' || pg_temp.id('s3')),
  'swap.cancelled',
  'withdrawing tells the colleague who took it'
);
select is(
  pg_temp.unread('swap.offer:' || pg_temp.id('s3')) || pg_temp.unread('swap.approval:' || pg_temp.id('s3')),
  '{}'::uuid[],
  'and settles its offers and its approval'
);

------------------------------------------------------------------------------
-- Publishing again

-- e gives away Monday morning and c takes it: it waits for a manager.
set local role service_role;
insert into ids values ('s4', public.request_shift_swap('71000000-0000-4000-a000-000000000005',
  pg_temp.id('morning-16'), null, '2026-11-12 14:00+00'));
select public.take_shift_swap('71000000-0000-4000-a000-000000000003', pg_temp.id('s4'), '2026-11-12 14:30+00');
reset role;
update public.notifications n set read_at = now()
where n.business_id = '71000000-0000-4000-b000-000000000001'
  and n.dedupe_key <> 'swap.approval:' || pg_temp.id('s4');
select is(
  pg_temp.unread('swap.approval:' || pg_temp.id('s4')),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002']::uuid[],
  'a taken request waits for the owner and the manager'
);

-- a publishes again: only d's shift moves.
set local role service_role;
select public.publish_week_schedule('71000000-0000-4000-a000-000000000001',
  pg_temp.id('week'),
  '[{"day": "2026-11-15", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "71000000-0000-4000-a000-000000000005", "position": "waiter"}]},
    {"day": "2026-11-15", "name": "Middle", "start": "12:00", "end": "19:00", "needed": 1,
     "assignees": [{"user": "71000000-0000-4000-a000-000000000004"}]},
    {"day": "2026-11-16", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "71000000-0000-4000-a000-000000000005"}]}]');
reset role;
select is(
  (select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[]) from public.notifications n
   where n.business_id = '71000000-0000-4000-b000-000000000001' and n.kind = 'schedule.changed'),
  array['71000000-0000-4000-a000-000000000004']::uuid[],
  'publishing again tells only those whose own shifts changed'
);
select is(
  pg_temp.unread('schedule:' || pg_temp.id('week')),
  array['71000000-0000-4000-a000-000000000004']::uuid[],
  'in place of the line about the week, unread again'
);
select is(
  (select n.kind from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-000000000005' and n.dedupe_key = 'schedule:' || pg_temp.id('week')),
  'schedule.published',
  'and leaves the others as they were'
);
select is(
  pg_temp.who('swap.removed', 'swap:' || pg_temp.id('s4')),
  array['71000000-0000-4000-a000-000000000003', '71000000-0000-4000-a000-000000000005']::uuid[],
  'a waiting request it removed tells the one who asked and the one who took it'
);
select is(
  pg_temp.unread('swap.approval:' || pg_temp.id('s4')),
  '{}'::uuid[],
  'and settles its approval'
);
select is(
  (select (a.details ->> 'swaps_removed') || '/' || (a.details -> 'changed')::text
   from public.audit_log a
   where a.business_id = '71000000-0000-4000-b000-000000000001' and a.action = 'schedule.publish'
   order by a.id desc limit 1),
  '1/["71000000-0000-4000-a000-000000000004"]',
  'the log row still counts the requests removed, and says whose shifts changed'
);

------------------------------------------------------------------------------
-- Hours that wait for confirmation

set local role service_role;
insert into ids values ('e1', public.clock_in('71000000-0000-4000-a000-000000000003',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-10 06:05+00', null, true));
reset role;
select is(
  pg_temp.who('clock.confirm', 'clock.confirm:' || pg_temp.id('e1')),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002']::uuid[],
  'clocking in without a code tells the owners and managers, not the person or the workers'
);
select is(
  (select n.params ->> 'proof' || '/' || (n.params ->> 'direction') || '/' || n.audience_role::text
     || '/' || n.source_module::text
   from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-000000000002' and n.dedupe_key = 'clock.confirm:' || pg_temp.id('e1')),
  'none/in/manager/time_clock',
  'as hours without a code, for managers, about the clock'
);

update public.notifications n set read_at = now()
where n.dedupe_key = 'clock.confirm:' || pg_temp.id('e1');
set local role service_role;
select public.clock_out('71000000-0000-4000-a000-000000000003',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-10 14:00+00', null, true);
reset role;
select is(
  (select count(*)::text || '/' || bool_and(n.read_at is null)::text || '/' || min(n.params ->> 'direction')
   from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-000000000001' and n.dedupe_key = 'clock.confirm:' || pg_temp.id('e1')),
  '1/true/out',
  'leaving without a code tells again, on the same line'
);

set local role service_role;
select public.confirm_time_entry('71000000-0000-4000-a000-000000000002', pg_temp.id('e1'), '2026-11-10 15:00+00');
reset role;
select is(
  pg_temp.unread('clock.confirm:' || pg_temp.id('e1')),
  '{}'::uuid[],
  'confirming settles it for everyone'
);
select is(
  pg_temp.settled('clock.confirm:' || pg_temp.id('e1')),
  '2/2',
  'and every line about the hours says they no longer wait'
);

-- A manager's own hours are an owner's to confirm.
set local role service_role;
insert into ids values ('e2', public.add_time_entry('71000000-0000-4000-a000-000000000002',
  '71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-000000000002',
  '2026-11-09 06:00+00', '2026-11-09 14:00+00', 'Forgot to punch', '2026-11-10 16:00+00'));
reset role;
select is(
  (select coalesce(array_agg(n.user_id::text || '/' || (n.params ->> 'proof') || '/' || n.audience_role::text), '{}')
   from public.notifications n where n.dedupe_key = 'clock.confirm:' || pg_temp.id('e2')),
  array['71000000-0000-4000-a000-000000000001/self/owner'],
  'hours someone set for themselves tell the owners alone'
);

-- d in and out without a code; b, a manager, moves the time out.
set local role service_role;
insert into ids values ('e3', public.clock_in('71000000-0000-4000-a000-000000000004',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-11 06:00+00', null, true));
select public.clock_out('71000000-0000-4000-a000-000000000004',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-11 14:00+00', null, true);
reset role;
update public.notifications n set read_at = now()
where n.dedupe_key = 'clock.confirm:' || pg_temp.id('e3');
set local role service_role;
select public.correct_time_entry('71000000-0000-4000-a000-000000000002', pg_temp.id('e3'),
  '2026-11-11 06:00+00', '2026-11-11 13:30+00', 'Left early', '2026-11-11 15:00+00');
reset role;
select is(
  pg_temp.unread('clock.confirm:' || pg_temp.id('e3')),
  array['71000000-0000-4000-a000-000000000001']::uuid[],
  'a manager''s correction that leaves something to confirm tells the others, not that manager'
);

set local role service_role;
select public.correct_time_entry('71000000-0000-4000-a000-000000000001', pg_temp.id('e3'),
  '2026-11-11 06:10+00', '2026-11-11 13:30+00', 'Came in late', '2026-11-11 15:30+00');
reset role;
select is(
  pg_temp.unread('clock.confirm:' || pg_temp.id('e3')),
  '{}'::uuid[],
  'an owner''s correction leaves nothing to confirm, and settles it'
);

-- e in without a code, confirmed, then out without one, then takes it back.
set local role service_role;
insert into ids values ('e4', public.clock_in('71000000-0000-4000-a000-000000000005',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-12 06:00+00', null, true));
select public.confirm_time_entry('71000000-0000-4000-a000-000000000002', pg_temp.id('e4'), '2026-11-12 07:00+00');
select public.clock_out('71000000-0000-4000-a000-000000000005',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-12 14:00+00', null, true);
reset role;
select is(
  pg_temp.unread('clock.confirm:' || pg_temp.id('e4')),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002']::uuid[],
  'a departure without a code after a confirmation waits again'
);
select is(
  pg_temp.settled('clock.confirm:' || pg_temp.id('e4')),
  '2/0',
  'and its line, settled by the confirmation, is open again'
);
set local role service_role;
select public.undo_clock_out('71000000-0000-4000-a000-000000000005', pg_temp.id('e4'), '2026-11-12 14:01+00');
reset role;
select is(
  pg_temp.unread('clock.confirm:' || pg_temp.id('e4')),
  '{}'::uuid[],
  'taking the clock-out back settles it'
);

-- d in without a code, confirmed, out without one; b then moves the arrival only.
set local role service_role;
insert into ids values ('e6', public.clock_in('71000000-0000-4000-a000-000000000004',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-14 06:00+00', null, true));
select public.confirm_time_entry('71000000-0000-4000-a000-000000000002', pg_temp.id('e6'), '2026-11-14 07:00+00');
select public.clock_out('71000000-0000-4000-a000-000000000004',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-14 14:00+00', null, true);
select public.correct_time_entry('71000000-0000-4000-a000-000000000002', pg_temp.id('e6'),
  '2026-11-14 06:10+00', '2026-11-14 14:00+00', 'Came in late', '2026-11-14 15:00+00');
reset role;
select is(
  (select (n.params ->> 'direction') || '/' || ((n.params ->> 'at')::timestamptz = '2026-11-14 14:00+00')::text
   from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-000000000001' and n.dedupe_key = 'clock.confirm:' || pg_temp.id('e6')),
  'out/true',
  'moving a confirmed arrival while the departure waits still tells the departure'
);

-- d in and out without a code, the line read, then the clock-out taken back.
set local role service_role;
insert into ids values ('e7', public.clock_in('71000000-0000-4000-a000-000000000004',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-15 06:00+00', null, true));
select public.clock_out('71000000-0000-4000-a000-000000000004',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-15 14:00+00', null, true);
reset role;
update public.notifications n set read_at = now()
where n.dedupe_key = 'clock.confirm:' || pg_temp.id('e7');
set local role service_role;
select public.undo_clock_out('71000000-0000-4000-a000-000000000004', pg_temp.id('e7'), '2026-11-15 14:01+00');
reset role;
select is(
  (select string_agg(
     (n.params ->> 'direction') || '/' || ((n.params ->> 'at')::timestamptz = '2026-11-15 06:00+00')::text
       || '/' || (n.read_at is not null)::text || '/' || (n.resolved_at is null)::text,
     ',' order by n.user_id)
   from public.notifications n where n.dedupe_key = 'clock.confirm:' || pg_temp.id('e7')),
  'in/true/true/true,in/true/true/true',
  'taking the clock-out back while the arrival waits tells the arrival, without coming back unread'
);

-- b, a manager, in without a code, with l a second manager; then b moves their
-- own arrival, which only an owner may confirm now.
insert into public.memberships (business_id, user_id, role, active)
values ('71000000-0000-4000-b000-000000000001', '71000000-0000-4000-a000-00000000000c', 'manager', true);
set local role service_role;
insert into ids values ('e8', public.clock_in('71000000-0000-4000-a000-000000000002',
  '71000000-0000-4000-b000-000000000001', null, '2026-11-15 06:00+00', null, true));
reset role;
select is(
  pg_temp.unread('clock.confirm:' || pg_temp.id('e8')),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-00000000000c']::uuid[],
  'a manager in without a code tells the owner and the other manager'
);
set local role service_role;
select public.correct_time_entry('71000000-0000-4000-a000-000000000002', pg_temp.id('e8'),
  '2026-11-15 06:15+00', null, 'Came in late', '2026-11-15 07:00+00');
reset role;
select is(
  (select string_agg(
     n.user_id::text || '/' || (n.read_at is null)::text || '/' || (n.resolved_at is null)::text
       || '/' || n.audience_role::text || '/' || (n.params ->> 'proof'),
     ',' order by n.user_id)
   from public.notifications n where n.dedupe_key = 'clock.confirm:' || pg_temp.id('e8')),
  '71000000-0000-4000-a000-000000000001/true/true/owner/self,'
    || '71000000-0000-4000-a000-00000000000c/false/false/manager/none',
  'moving their own arrival settles the other manager''s line, and the owner''s is the owner''s to confirm'
);
update public.memberships set active = false
where business_id = '71000000-0000-4000-b000-000000000001' and user_id = '71000000-0000-4000-a000-00000000000c';
update public.notifications n set read_at = now()
where n.dedupe_key in ('clock.confirm:' || pg_temp.id('e6'), 'clock.confirm:' || pg_temp.id('e7'),
                       'clock.confirm:' || pg_temp.id('e8'));

------------------------------------------------------------------------------
-- Someone joins

insert into public.invites (business_id, phone, role, token_hash, invited_by, full_name)
values ('71000000-0000-4000-b000-000000000001', '+972500001711', 'worker', 'nt-invite-token',
        '71000000-0000-4000-a000-000000000002', 'K');
set local role service_role;
select public.claim_invite('nt-invite-token', '71000000-0000-4000-a000-00000000000b');
reset role;
select is(
  (select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[]) from public.notifications n
   where n.kind = 'team.joined' and n.audience_role = 'manager' and n.source_module is null
     and n.params ->> 'person' = '71000000-0000-4000-a000-00000000000b'),
  array['71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002']::uuid[],
  'joining tells the owners and managers, not the one who joined'
);

------------------------------------------------------------------------------
-- A demo business

set local role service_role;
select public.publish_week_schedule('71000000-0000-4000-a000-000000000009',
  pg_temp.id('z-week'),
  '[{"day": "2026-11-15", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "71000000-0000-4000-a000-00000000000a"}]}]');
reset role;
select is(
  (select string_agg(n.kind || '/' || n.push_state, ',') from public.notifications n
   where n.user_id = '71000000-0000-4000-a000-00000000000a'),
  'schedule.published/none',
  'a demo business gets its lines in the app, and none on a phone'
);

------------------------------------------------------------------------------
-- Who reads them

insert into counts
select 'c', count(*)::integer from public.notifications
where user_id = '71000000-0000-4000-a000-000000000003';
insert into counts
select 'b-worker', count(*)::integer from public.notifications
where user_id = '71000000-0000-4000-a000-000000000002' and audience_role = 'worker';
insert into counts
select 'a-not-scheduling', count(*)::integer from public.notifications
where user_id = '71000000-0000-4000-a000-000000000001' and source_module is distinct from 'scheduling';

select pg_temp.sign_in('71000000-0000-4000-a000-000000000003');
select is(
  (select count(*)::integer from public.notifications),
  (select n from counts where name = 'c'),
  'a person reads their own lines'
);
select is(
  (select count(*)::integer from public.notifications
   where user_id <> '71000000-0000-4000-a000-000000000003'),
  0,
  'and nobody else''s'
);
select pg_temp.sign_in('71000000-0000-4000-a000-000000000007');
select is((select count(*)::integer from public.notifications), 0, 'another business reads none of them');
select pg_temp.sign_in('71000000-0000-4000-a000-000000000008');
select is((select count(*)::integer from public.notifications), 0, 'the team viewing the business reads none');
reset role;

update public.memberships set active = false
where business_id = '71000000-0000-4000-b000-000000000001' and user_id = '71000000-0000-4000-a000-000000000003';
select pg_temp.sign_in('71000000-0000-4000-a000-000000000003');
select is((select count(*)::integer from public.notifications), 0, 'someone made inactive reads none');
reset role;
update public.memberships set active = true
where business_id = '71000000-0000-4000-b000-000000000001' and user_id = '71000000-0000-4000-a000-000000000003';

update public.memberships set role = 'worker'
where business_id = '71000000-0000-4000-b000-000000000001' and user_id = '71000000-0000-4000-a000-000000000002';
select pg_temp.sign_in('71000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer from public.notifications),
  (select n from counts where name = 'b-worker'),
  'a manager made a worker no longer reads the lines for managers'
);
reset role;
update public.memberships set role = 'manager'
where business_id = '71000000-0000-4000-b000-000000000001' and user_id = '71000000-0000-4000-a000-000000000002';

update public.business_modules set enabled = false
where business_id = '71000000-0000-4000-b000-000000000001' and module_key = 'scheduling';
select pg_temp.sign_in('71000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::integer from public.notifications),
  (select n from counts where name = 'a-not-scheduling'),
  'switching off a module hides the lines about it'
);
reset role;
update public.business_modules set enabled = true
where business_id = '71000000-0000-4000-b000-000000000001' and module_key = 'scheduling';

update public.business_modules set enabled = false
where business_id = '71000000-0000-4000-b000-000000000001' and module_key = 'notifications';
select pg_temp.sign_in('71000000-0000-4000-a000-000000000001');
select is((select count(*)::integer from public.notifications), 0, 'switching off notifications hides them all');
reset role;
set local role service_role;
insert into ids values ('s5', public.request_shift_swap('71000000-0000-4000-a000-000000000004',
  (select s.id from public.schedule_shifts s
   where s.business_id = '71000000-0000-4000-b000-000000000001' and s.name = 'Middle'),
  null, '2026-11-12 15:00+00'));
reset role;
select is(
  pg_temp.who(null, 'swap.offer:' || pg_temp.id('s5')),
  '{}'::uuid[],
  'and writes no new ones'
);
select is(
  (select w.status::text from public.shift_swaps w where w.id = pg_temp.id('s5')),
  'open',
  'while what happened still happens'
);
update public.business_modules set enabled = true
where business_id = '71000000-0000-4000-b000-000000000001' and module_key = 'notifications';

------------------------------------------------------------------------------
-- Marking them read

-- a still has two lines unread: the manager's own hours, and k joining.
insert into counts
select 'others-unread', count(*)::integer from public.notifications
where read_at is null and user_id <> '71000000-0000-4000-a000-000000000001'
  and business_id = '71000000-0000-4000-b000-000000000001';
insert into ids
select 'a-line', n.id from public.notifications n
where n.user_id = '71000000-0000-4000-a000-000000000001' and n.kind = 'team.joined';

set local role service_role;
select is(
  public.read_notifications('71000000-0000-4000-a000-000000000001',
    '71000000-0000-4000-b000-000000000001', array[pg_temp.id('a-line')]),
  1,
  'the server marks one line read for its person'
);
select is(
  public.read_notifications('71000000-0000-4000-a000-000000000001', '71000000-0000-4000-b000-000000000001'),
  1,
  'or all of their lines in the business'
);
reset role;
select is(
  (select count(*)::integer from public.notifications
   where read_at is null and user_id <> '71000000-0000-4000-a000-000000000001'
     and business_id = '71000000-0000-4000-b000-000000000001'),
  (select n from counts where name = 'others-unread'),
  'and nobody else''s'
);

------------------------------------------------------------------------------
-- A producer that fails

create or replace function private.push_plan(
  business uuid,
  person uuid,
  what text,
  at_time timestamptz
)
returns timestamptz
language plpgsql
as $$
begin
  raise exception 'poisoned';
end;
$$;

set local role service_role;
select lives_ok(
  $$insert into ids values ('e5', public.clock_in('71000000-0000-4000-a000-000000000003',
    '71000000-0000-4000-b000-000000000001', null, '2026-11-13 06:00+00', null, true))$$,
  'a notification that fails does not stop the clock'
);
reset role;
select is(
  (select count(*)::integer from public.time_entries t
   join public.audit_log a on a.action = 'clock.in' and a.details ->> 'entry' = t.id::text
   where t.id = pg_temp.id('e5')),
  1,
  'its entry and its log row are written'
);
select is(
  pg_temp.who(null, 'clock.confirm:' || pg_temp.id('e5')),
  '{}'::uuid[],
  'and no line'
);

select * from finish();
rollback;
