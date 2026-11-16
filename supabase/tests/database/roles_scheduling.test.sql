-- Roles and permissions by module, R3 (20261115000900_roles_scheduling.sql):
-- scheduling by its permissions. One matrix, driven by VALUES, over four
-- states the owner sets through public.set_role_permission: today's
-- defaults, workers raised to build without publishing ('edit'), and with
-- it ('publish'), and managers lowered to view ('lowered'). In each, for the
-- owner, a manager and a worker: what they read of the draft week (its
-- shifts, its assignments, everyone else's availability) and of their lines;
-- whether saving, publishing and deciding a swap live or are refused (and a
-- swap's own asker and taker decide it only if they publish); and through a
-- view as a worker and as a manager, the same reads. Who is told of a swap
-- taken and of availability missing follows who builds, of shifts left short
-- who publishes, a change of role settles a builder's line only when the new
-- role doesn't build, and a line written to a manager before managers were
-- lowered is no longer read and its push is skipped. With workers set above
-- managers, a manager gives nobody a role that holds what they don't.
-- Publishing is asked first, before any lock, and a publish given to someone
-- personally publishes nothing without building. Every write passes its
-- moment, so nothing depends on today's date. Fixed ids (94…), so nothing
-- here depends on the seed.
begin;
select plan(11);

-- 1 owner, 2 manager, 3 the worker the matrix follows, 4 a worker who gives
-- shifts away, 5 one who takes them, 6 one who leaves; 8 and 9 on the
-- ConceptApp team, viewing S as a worker and as a manager.
insert into auth.users (id, aud, role, phone)
select
  ('94000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250094' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,8,9}'::int[]) as n;

create temporary table people (label text primary key, id uuid not null) on commit drop;
insert into people values
  ('owner', '94000000-0000-4000-a000-000000000001'),
  ('manager', '94000000-0000-4000-a000-000000000002'),
  ('worker', '94000000-0000-4000-a000-000000000003'),
  ('asker', '94000000-0000-4000-a000-000000000004'),
  ('taker', '94000000-0000-4000-a000-000000000005'),
  ('leaver', '94000000-0000-4000-a000-000000000006'),
  ('view as worker', '94000000-0000-4000-a000-000000000008'),
  ('view as manager', '94000000-0000-4000-a000-000000000009');
grant select on people to authenticated, service_role;

insert into public.businesses (id, slug, name)
values ('94000000-0000-4000-b000-000000000001', 'rsc-one', 'Roles Scheduling');

insert into public.memberships (business_id, user_id, role)
select '94000000-0000-4000-b000-000000000001', p.id,
  case p.label when 'owner' then 'owner' when 'manager' then 'manager' else 'worker' end::public.member_role
from people p
where p.label not like 'view as %';

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('94000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "positions": [{"key": "waiter", "name": "Waiter"}]}'),
  ('94000000-0000-4000-b000-000000000001', 'notifications', true, '{}');

insert into public.platform_staff (user_id, role)
values
  ('94000000-0000-4000-a000-000000000008', 'onboarder'),
  ('94000000-0000-4000-a000-000000000009', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('94000000-0000-4000-a000-000000000008', '94000000-0000-4000-b000-000000000001', 'worker'),
  ('94000000-0000-4000-a000-000000000009', '94000000-0000-4000-b000-000000000001', 'manager');

-- The owner's and the manager's phones, so the lines for them are queued.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select p.id, 'https://fcm.googleapis.com/rsc-' || p.label, repeat('b', 63) || n::text,
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from people p
join (values ('owner', 1), ('manager', 2)) as phones (label, n) on phones.label = p.label;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.p(name text) returns uuid language sql as $$
  select p.id from people p where p.label = name
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- The draft week's shifts, as the builder sends them: 2 shifts, 3 people.
create function pg_temp.draft() returns jsonb language sql as $$
  select '[{"day": "2026-12-13", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 2,
            "assignees": [{"user": "94000000-0000-4000-a000-000000000003", "position": "waiter"},
                          {"user": "94000000-0000-4000-a000-000000000004"}]},
           {"day": "2026-12-14", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
            "assignees": [{"user": "94000000-0000-4000-a000-000000000005"}]}]'::jsonb
$$;

-- What a call does: 'lives', or the code it is refused with. Undone either
-- way, so each state starts from the same week.
create function pg_temp.attempt(call text) returns text language plpgsql as $$
declare
  outcome text;
begin
  begin
    execute call;
    outcome := 'lives';
    raise exception 'tried' using errcode = 'P0001', hint = 'rsc-tried';
  exception when others then
    if outcome is null then
      outcome := sqlstate;
    end if;
  end;
  return outcome;
end;
$$;

-- What `look` answers once `call` has run, undone afterwards: who was told,
-- or how a line stands. 'refused <code>' when the call is.
create function pg_temp.probe(call text, look text) returns text language plpgsql as $$
declare
  outcome text;
begin
  begin
    begin
      execute call;
    exception when others then
      outcome := 'refused ' || sqlstate;
      raise;
    end;
    execute look into outcome;
    raise exception 'tried' using errcode = 'P0001', hint = 'rsc-tried';
  exception when others then
    null;
  end;
  return outcome;
end;
$$;

-- The state the owner sets: back to the defaults (workers neither key,
-- managers both), then the state's own switches.
create function pg_temp.apply(state text) returns void language plpgsql as $$
begin
  perform public.set_role_permissions(pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001',
    'worker', '{schedule.publish,schedule.edit}', '{false,false}');
  perform public.set_role_permissions(pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001',
    'manager', '{schedule.edit,schedule.publish}', '{true,true}');
  if state = 'edit' then
    perform public.set_role_permission(pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001',
      'worker', 'schedule.edit', true);
  elsif state = 'publish' then
    perform public.set_role_permissions(pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001',
      'worker', '{schedule.edit,schedule.publish}', '{true,true}');
  elsif state = 'lowered' then
    perform public.set_role_permission(pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001',
      'manager', 'schedule.edit', false);
  end if;
end;
$$;

-- What the signed-in person reads: the draft week's shifts and assignments,
-- everyone else's availability for it, their swap.waiting lines and their
-- schedule.published ones.
create function pg_temp.reads()
returns table (drafts integer, assignments integer, others integer, waiting integer, published integer)
language sql as $$
  select
    (select count(*)::integer from public.schedule_shifts s where s.week_id = pg_temp.id('draft')),
    (select count(*)::integer from public.shift_assignments a
     where a.shift_id in (select i.id from ids i where i.name like 'draft-%')),
    (select count(*)::integer from public.availability_submissions v
     where v.week_id = pg_temp.id('draft') and v.user_id is distinct from (select auth.uid())),
    (select count(*)::integer from public.notifications n where n.kind = 'swap.waiting'),
    (select count(*)::integer from public.notifications n where n.kind = 'schedule.published')
$$;

-- Saving the draft week, publishing it and approving the swap waiting, by
-- the owner, the manager and the worker, and by the swap's own asker and
-- taker (workers too).
create function pg_temp.writes() returns table (who text, save text, publish text, decide text)
language sql as $$
  select p.label,
    pg_temp.attempt(format(
      'select public.save_week_schedule(%L::uuid, %L::uuid, %L::jsonb, null, %L::timestamptz)',
      p.id, pg_temp.id('draft'), pg_temp.draft(), '2026-12-01 10:00+00')),
    pg_temp.attempt(format(
      'select public.publish_week_schedule(%L::uuid, %L::uuid, %L::jsonb, null, %L::timestamptz)',
      p.id, pg_temp.id('draft'), pg_temp.draft(), '2026-12-01 10:00+00')),
    pg_temp.attempt(format(
      'select public.decide_shift_swap(%L::uuid, %L::uuid, true, %L::timestamptz)',
      p.id, pg_temp.id('swap-a'), '2026-12-01 11:00+00'))
  from people p
  where p.label in ('owner', 'manager', 'worker', 'asker', 'taker')
$$;

-- Who hears of the open swap taken, and of the leaver's shift left short by
-- their removal; and how the manager's waiting line stands once they are made
-- a worker.
create function pg_temp.told() returns table (waiting text, unfilled text, demoted text)
language sql as $$
  select
    pg_temp.probe(
      format('select public.take_shift_swap(%L::uuid, %L::uuid, %L::timestamptz)',
        pg_temp.p('taker'), pg_temp.id('swap-b'), '2026-12-01 11:00+00'),
      format($q$select coalesce(string_agg(p.label, ',' order by p.label), '')
        from public.notifications n join people p on p.id = n.user_id
        where n.kind = 'swap.waiting' and n.dedupe_key = 'swap.approval:' || %L$q$,
        pg_temp.id('swap-b'))),
    pg_temp.probe(
      format('select public.remove_member(%L::uuid, %L::uuid, %L::uuid, %L::timestamptz)',
        pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001', pg_temp.p('leaver'),
        '2026-12-01 11:00+00'),
      $q$select coalesce(string_agg(p.label, ',' order by p.label), '')
        from public.notifications n join people p on p.id = n.user_id
        where n.kind = 'schedule.unfilled'$q$),
    pg_temp.probe(
      format('select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, at_time => %L)',
        pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001', pg_temp.p('manager'),
        'worker', '2026-12-01 11:00+00'),
      format($q$select (n.read_at is not null)::text || '/' || n.push_state
        from public.notifications n
        where n.user_id = %L and n.dedupe_key = 'swap.approval:' || %L$q$,
        pg_temp.p('manager'), pg_temp.id('swap-a')))
$$;

-- Who hears that availability for the draft week is missing (the taker's
-- and the leaver's), at its due moment under this business's rules
-- (Wednesday 9 December, 18:00 in Jerusalem), undone afterwards. Run as the
-- database's own: private functions aren't the secret key's.
create function pg_temp.missing() returns text language sql as $$
  select pg_temp.probe(
    format('select private.run_business_reminders(%L::uuid, %L::timestamptz)',
      '94000000-0000-4000-b000-000000000001', '2026-12-09 16:00+00'),
    $q$select coalesce(string_agg(p.label, ',' order by p.label), '')
      from public.notifications n join people p on p.id = n.user_id
      where n.kind = 'availability.missing'$q$)
$$;

create temporary table seen (
  state text, who text, drafts integer, assignments integer, others integer,
  waiting integer, published integer
) on commit drop;
create temporary table acts (state text, who text, save text, publish text, decide text) on commit drop;
create temporary table heard (
  state text, waiting text, unfilled text, demoted text, missing text
) on commit drop;
grant all on seen, acts, heard to authenticated, service_role;

------------------------------------------------------------------------------
-- The week: published for 6 to 12 December, a draft for 13 to 19

set local role service_role;
insert into ids values
  ('week', public.open_schedule_week('94000000-0000-4000-b000-000000000001', '2026-12-06', '2026-12-02 16:00+00')),
  ('draft', public.open_schedule_week('94000000-0000-4000-b000-000000000001', '2026-12-13', '2026-12-09 16:00+00'));

select public.publish_week_schedule(pg_temp.p('owner'), pg_temp.id('week'),
  '[{"day": "2026-12-06", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "94000000-0000-4000-a000-000000000004"}]},
    {"day": "2026-12-07", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "94000000-0000-4000-a000-000000000004"}]},
    {"day": "2026-12-08", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
     "assignees": [{"user": "94000000-0000-4000-a000-000000000006"}]},
    {"day": "2026-12-09", "name": "Middle", "start": "11:00", "end": "19:00", "needed": 1,
     "assignees": [{"user": "94000000-0000-4000-a000-000000000003"}]}]',
  null, '2026-12-01 09:00+00');
select public.save_week_schedule(pg_temp.p('owner'), pg_temp.id('draft'), pg_temp.draft(),
  null, '2026-12-01 09:00+00');

insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.week_id = pg_temp.id('week');
insert into ids
select 'draft-' || lower(s.name), s.id
from public.schedule_shifts s
where s.week_id = pg_temp.id('draft');

-- Availability for the draft week from the manager, the worker and the asker.
select public.submit_availability(pg_temp.p(p.label), pg_temp.id('draft'), '[]')
from (values ('manager'), ('worker'), ('asker')) as p (label);

-- A: the asker's shift on the 6th, taken and waiting (its lines written to
-- the owner and the manager now, queued for their phones). B: the 7th's,
-- open.
insert into ids values ('swap-a', public.request_shift_swap(pg_temp.p('asker'),
  pg_temp.id('morning-06'), null, '2026-12-01 09:30+00'));
select public.take_shift_swap(pg_temp.p('taker'), pg_temp.id('swap-a'), '2026-12-01 09:40+00');
insert into ids values ('swap-b', public.request_shift_swap(pg_temp.p('asker'),
  pg_temp.id('morning-07'), null, '2026-12-01 09:50+00'));
reset role;

select is(
  (select string_agg(p.label || ':' || n.push_state || ':' || n.audience_role || ':'
       || coalesce(n.audience_perm, 'none'), ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.kind = 'swap.waiting')
  || ' ' ||
  (select string_agg(distinct coalesce(n.audience_perm, 'none'), ',')
   from public.notifications n where n.kind = 'schedule.published'),
  'manager:queued:manager:schedule.edit,owner:queued:manager:schedule.edit none',
  'a swap waiting is told to those who build the schedule, as a line for those who hold schedule.edit, and the week published to everyone by rank as before'
);

------------------------------------------------------------------------------
-- The matrix

-- Today: owners and managers build and publish, workers neither. The worker
-- holds schedule.publish given personally, in this state only: publishing
-- without building publishes nothing.
update public.memberships set perms = '{schedule.publish}'
where business_id = '94000000-0000-4000-b000-000000000001' and user_id = pg_temp.p('worker');
set local role service_role;
select pg_temp.apply('today');
insert into acts select 'today', w.* from pg_temp.writes() w;
insert into heard select 'today', t.*, null from pg_temp.told() t;
reset role;
update heard set missing = pg_temp.missing() where state = 'today';
select pg_temp.sign_in(pg_temp.p('owner'));
insert into seen select 'today', 'owner', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('manager'));
insert into seen select 'today', 'manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('worker'));
insert into seen select 'today', 'worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as worker'));
insert into seen select 'today', 'view as worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as manager'));
insert into seen select 'today', 'view as manager', r.* from pg_temp.reads() r;
reset role;
update public.memberships set perms = '{}'
where business_id = '94000000-0000-4000-b000-000000000001' and user_id = pg_temp.p('worker');

-- Workers raised to build, without publishing.
set local role service_role;
select pg_temp.apply('edit');
insert into acts select 'edit', w.* from pg_temp.writes() w;
insert into heard select 'edit', t.*, null from pg_temp.told() t;
reset role;
update heard set missing = pg_temp.missing() where state = 'edit';
select pg_temp.sign_in(pg_temp.p('owner'));
insert into seen select 'edit', 'owner', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('manager'));
insert into seen select 'edit', 'manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('worker'));
insert into seen select 'edit', 'worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as worker'));
insert into seen select 'edit', 'view as worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as manager'));
insert into seen select 'edit', 'view as manager', r.* from pg_temp.reads() r;
reset role;

-- Publishing is asked before anything else: a worker who builds without
-- publishing is refused for that (42501), where a manager sending the same
-- shape gets as far as the write's own checks (22023).
set local role service_role;
select is(
  pg_temp.attempt(format(
    'select public.publish_week_schedule(%L::uuid, %L::uuid, %L::jsonb, null, %L::timestamptz)',
    pg_temp.p('worker'), pg_temp.id('draft'), '"not a list"', '2026-12-01 10:00+00'))
  || ' ' ||
  pg_temp.attempt(format(
    'select public.publish_week_schedule(%L::uuid, %L::uuid, %L::jsonb, null, %L::timestamptz)',
    pg_temp.p('manager'), pg_temp.id('draft'), '"not a list"', '2026-12-01 10:00+00')),
  '42501 22023',
  'someone who builds without publishing is refused publishing before the week is looked at'
);
reset role;

-- Workers raised to build and publish.
set local role service_role;
select pg_temp.apply('publish');
insert into acts select 'publish', w.* from pg_temp.writes() w;
insert into heard select 'publish', t.*, null from pg_temp.told() t;
reset role;
update heard set missing = pg_temp.missing() where state = 'publish';
select pg_temp.sign_in(pg_temp.p('owner'));
insert into seen select 'publish', 'owner', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('manager'));
insert into seen select 'publish', 'manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('worker'));
insert into seen select 'publish', 'worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as worker'));
insert into seen select 'publish', 'view as worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as manager'));
insert into seen select 'publish', 'view as manager', r.* from pg_temp.reads() r;
reset role;

-- Managers lowered to view: they see what workers see.
set local role service_role;
select pg_temp.apply('lowered');
insert into acts select 'lowered', w.* from pg_temp.writes() w;
insert into heard select 'lowered', t.*, null from pg_temp.told() t;
reset role;
update heard set missing = pg_temp.missing() where state = 'lowered';
select pg_temp.sign_in(pg_temp.p('owner'));
insert into seen select 'lowered', 'owner', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('manager'));
insert into seen select 'lowered', 'manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('worker'));
insert into seen select 'lowered', 'worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as worker'));
insert into seen select 'lowered', 'view as worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as manager'));
insert into seen select 'lowered', 'view as manager', r.* from pg_temp.reads() r;
reset role;

-- Reads: the draft's 2 shifts and 3 people, and the 3 answers (one's own
-- left out), for those who build; one's own published line for everyone on
-- the staff but its publisher, whatever their level; the waiting line where
-- it was written, while its reader still builds.
select set_eq(
  'select * from seen',
  $$values
    ('today', 'owner', 2, 3, 3, 1, 0),
    ('today', 'manager', 2, 3, 2, 1, 1),
    ('today', 'worker', 0, 0, 0, 0, 1),
    ('today', 'view as worker', 0, 0, 0, 0, 0),
    ('today', 'view as manager', 2, 3, 3, 0, 0),
    ('edit', 'owner', 2, 3, 3, 1, 0),
    ('edit', 'manager', 2, 3, 2, 1, 1),
    ('edit', 'worker', 2, 3, 2, 0, 1),
    ('edit', 'view as worker', 2, 3, 3, 0, 0),
    ('edit', 'view as manager', 2, 3, 3, 0, 0),
    ('publish', 'owner', 2, 3, 3, 1, 0),
    ('publish', 'manager', 2, 3, 2, 1, 1),
    ('publish', 'worker', 2, 3, 2, 0, 1),
    ('publish', 'view as worker', 2, 3, 3, 0, 0),
    ('publish', 'view as manager', 2, 3, 3, 0, 0),
    ('lowered', 'owner', 2, 3, 3, 1, 0),
    ('lowered', 'manager', 0, 0, 0, 0, 1),
    ('lowered', 'worker', 0, 0, 0, 0, 1),
    ('lowered', 'view as worker', 0, 0, 0, 0, 0),
    ('lowered', 'view as manager', 0, 0, 0, 0, 0)$$,
  'the drafts and everyone''s availability are read by those who build, members and views alike, and a lowered manager no longer reads the line written before'
);

-- Writes: building saves and decides swaps (Orel's answer 6), publishing
-- needs its own switch too, and a published week is only published again.
-- A swap's own asker and taker decide it only if they publish: approving it
-- changes a published week.
select set_eq(
  'select * from acts',
  $$values
    ('today', 'owner', 'lives', 'lives', 'lives'),
    ('today', 'manager', 'lives', 'lives', 'lives'),
    ('today', 'worker', '42501', '42501', '42501'),
    ('today', 'asker', '42501', '42501', '42501'),
    ('today', 'taker', '42501', '42501', '42501'),
    ('edit', 'owner', 'lives', 'lives', 'lives'),
    ('edit', 'manager', 'lives', 'lives', 'lives'),
    ('edit', 'worker', 'lives', '42501', 'lives'),
    ('edit', 'asker', 'lives', '42501', '42501'),
    ('edit', 'taker', 'lives', '42501', '42501'),
    ('publish', 'owner', 'lives', 'lives', 'lives'),
    ('publish', 'manager', 'lives', 'lives', 'lives'),
    ('publish', 'worker', 'lives', 'lives', 'lives'),
    ('publish', 'asker', 'lives', 'lives', 'lives'),
    ('publish', 'taker', 'lives', 'lives', 'lives'),
    ('lowered', 'owner', 'lives', 'lives', 'lives'),
    ('lowered', 'manager', '42501', '42501', '42501'),
    ('lowered', 'worker', '42501', '42501', '42501'),
    ('lowered', 'asker', '42501', '42501', '42501'),
    ('lowered', 'taker', '42501', '42501', '42501')$$,
  'saving and deciding a swap follow building, publishing follows building and publishing, one''s own swap is decided only by one who publishes, and today''s rules are unchanged'
);

-- Notices: a swap waiting and availability missing to those who build, but
-- whoever did it (the taker) and the swap's asker when they don't publish;
-- shifts left short, of a published week, to those who publish (not the
-- worker who holds publishing personally without building, today), but the
-- owner who removed someone and whoever left; the manager made a worker keeps
-- a line only where workers build.
select set_eq(
  'select * from heard',
  $$values
    ('today', 'manager,owner', 'manager', 'true/skipped', 'manager,owner'),
    ('edit', 'leaver,manager,owner,worker', 'manager', 'false/queued',
      'asker,leaver,manager,owner,taker,worker'),
    ('publish', 'asker,leaver,manager,owner,worker', 'asker,manager,taker,worker', 'false/queued',
      'asker,leaver,manager,owner,taker,worker'),
    ('lowered', 'owner', '', 'true/skipped', 'owner')$$,
  'swap.waiting and availability.missing go to those who build, schedule.unfilled to those who publish, and a change of role settles a line only for one who no longer builds'
);

-- The phone: the lowered manager's line is skipped at the next send, the
-- owner's goes.
set local role service_role;
select count(*) from public.claim_due_pushes(200, now());
reset role;
select is(
  (select string_agg(p.label || ':' || n.push_state, ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.dedupe_key = 'swap.approval:' || pg_temp.id('swap-a')),
  'manager:skipped,owner:sending',
  'a push queued for a line its reader no longer reads is skipped, and the rest go'
);

------------------------------------------------------------------------------
-- Giving a role, with workers set above managers

-- The owner sets workers to build and publish and managers to neither. A
-- manager then gives nobody a role that holds what they don't: not by making
-- a manager a worker, inviting a worker or a fresh link for the owner's
-- invite of one. Making someone a manager, or inviting one, gives nothing
-- they don't hold and goes, and so does the owner's invite of a worker.
create function pg_temp.manager_demotes() returns void language plpgsql as $$
begin
  perform public.set_member_role(pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001',
    pg_temp.p('leaver'), 'manager', at_time => '2026-12-01 11:00+00');
  perform public.set_member_role(pg_temp.p('manager'), '94000000-0000-4000-b000-000000000001',
    pg_temp.p('leaver'), 'worker', at_time => '2026-12-01 11:00+00');
end;
$$;

set local role service_role;
select pg_temp.apply('publish');
select public.set_role_permission(pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001',
  'manager', 'schedule.edit', false);
insert into ids values ('invite', public.team_invite(pg_temp.p('owner'),
  '94000000-0000-4000-b000-000000000001', '+972500940094', 'Asked', 'worker', repeat('9', 64)));
select is(
  pg_temp.attempt('select pg_temp.manager_demotes()')
  || ' ' ||
  pg_temp.attempt(format(
    'select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, at_time => %L)',
    pg_temp.p('manager'), '94000000-0000-4000-b000-000000000001', pg_temp.p('leaver'),
    'manager', '2026-12-01 11:00+00'))
  || ' ' ||
  pg_temp.attempt(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '94000000-0000-4000-b000-000000000001', '+972500940091', 'New',
    'worker', repeat('d', 64)))
  || ' ' ||
  pg_temp.attempt(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '94000000-0000-4000-b000-000000000001', '+972500940092', 'New',
    'manager', repeat('e', 64)))
  || ' ' ||
  pg_temp.attempt(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('owner'), '94000000-0000-4000-b000-000000000001', '+972500940093', 'New',
    'worker', repeat('f', 64)))
  || ' ' ||
  pg_temp.attempt(format(
    'select public.team_invite_link(%L::uuid, %L::uuid, %L)',
    pg_temp.p('manager'), pg_temp.id('invite'), repeat('a', 64))),
  '42501 lives 42501 lives lives 42501',
  'with workers set above managers, a manager gives nobody a role that holds what they don''t, by a change of role, an invite or a fresh link, and the rest goes as before'
);
reset role;

------------------------------------------------------------------------------
-- How it is built

-- The lines written before this migration moved to their key: none of the
-- three kinds is left for a rank alone.
select is(
  (select count(*)::integer from public.notifications n
   where n.kind in ('swap.waiting', 'schedule.unfilled', 'availability.missing')
     and n.audience_perm is distinct from case
       when n.kind = 'schedule.unfilled' then 'schedule.publish'
       else 'schedule.edit'
     end),
  0,
  'every line of the three kinds is for its key, those written before the migration too'
);

select ok(
  strpos(pg_get_functiondef('public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)'::regprocedure),
    'private.publishes_schedule(week_business, actor)') > 0
  and strpos(pg_get_functiondef('public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)'::regprocedure),
    'private.publishes_schedule(week_business, actor)')
    < strpos(pg_get_functiondef('public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)'::regprocedure),
    'perform private.lock_week_edges(week)'),
  'publishing is asked before the weeks are locked (critique 23)'
);

select is(
  (select string_agg(k.key, ',' order by k.key) from public.permission_keys k where k.settable),
  'manage.edit,manage.view,schedule.edit,schedule.publish',
  'scheduling is open for changes per role, and besides it only the management page (R7)'
);

select ok(
  not has_function_privilege('authenticated', 'private.publishes_schedule(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.publishes_schedule(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.members_holding(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'private.members_holding(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.builds_schedule(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.role_holds_beyond(uuid, public.member_role, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.role_holds_beyond(uuid, public.member_role, uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.businesses_holding(text)', 'execute')
  and not has_function_privilege('anon', 'private.businesses_holding(text)', 'execute')
  and not has_function_privilege('authenticated',
    'private.notify(uuid, uuid[], text, jsonb, uuid, public.module_key, public.member_role, text, boolean, timestamptz, timestamptz, uuid[], text)',
    'execute')
  and (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'private' and p.proname = 'notify') = 1
  and (select count(*)::int from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname || '.' || p.proname in (
           'private.builds_schedule', 'private.publishes_schedule',
           'private.businesses_holding', 'private.members_holding', 'private.notify',
           'private.role_holds_beyond'
         )
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 6,
  'the new helpers run as their owner with an empty search path, only the policies'' one for the signed-in, and one notify'
);

select * from finish();
rollback;
