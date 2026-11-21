-- Roles and permissions by module, R4 (20261115001100_roles_clock.sql): the
-- time clock by its permission. One matrix, driven by VALUES, over three
-- states the owner sets through public.set_role_permission: today's
-- defaults, workers raised to edit the clock ('raised') and managers lowered
-- to view ('lowered'). In each, for the owner, a manager, a worker and the
-- accountant: what they read of the clock (their own hours, others' hours
-- and breaks, the stations, wages, and their lines about hours waiting);
-- whether confirming, correcting and adding hours, issuing a punch code,
-- asking whether one is showing, pairing and stopping a station live or are
-- refused; and through views as a worker, a manager and an accountant, the
-- same reads. Who is told of hours without a code and of an entry open too
-- long follows who edits the clock, hours someone set for themselves stay
-- with owners (critique 24), a change of role settles a line only when the
-- new role doesn't edit, and a line written to a manager before managers
-- were lowered is no longer read and its push is skipped, then settled at
-- the next event of its hours. A clock-out undone turns its line back from
-- the owner's (a departure through one's own station) into one for those
-- who edit the clock. Only an owner
-- confirms hours someone set for themselves, whoever else edits the clock;
-- pay is read as before at every level; who edits the clock on today's
-- defaults is who did before, for every membership; the demo's correction is
-- made by someone who may correct; with workers set above managers, a
-- manager gives nobody a role that holds what they don't. Every write passes
-- its moment, so nothing depends on today's date. Fixed ids (96…), so
-- nothing here depends on the seed.
begin;
select plan(16);

-- 1 owner, 2 manager, 3 the worker the matrix follows, 4 a colleague whose
-- hours are confirmed and corrected, 5 the accountant, 6 a worker who never
-- clocked out; 7, 8 and 9 on the ConceptApp team, viewing as an accountant,
-- a worker and a manager; 10, 11 and 12 the owner, manager and worker of a
-- demo business.
insert into auth.users (id, aud, role, phone)
select
  ('96000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250096' || lpad(n::text, 4, '0')
from generate_series(1, 12) as n;

create temporary table people (label text primary key, id uuid not null) on commit drop;
insert into people values
  ('owner', '96000000-0000-4000-a000-000000000001'),
  ('manager', '96000000-0000-4000-a000-000000000002'),
  ('worker', '96000000-0000-4000-a000-000000000003'),
  ('colleague', '96000000-0000-4000-a000-000000000004'),
  ('accountant', '96000000-0000-4000-a000-000000000005'),
  ('late', '96000000-0000-4000-a000-000000000006'),
  ('view as accountant', '96000000-0000-4000-a000-000000000007'),
  ('view as worker', '96000000-0000-4000-a000-000000000008'),
  ('view as manager', '96000000-0000-4000-a000-000000000009'),
  ('demo owner', '96000000-0000-4000-a000-000000000010'),
  ('demo manager', '96000000-0000-4000-a000-000000000011'),
  ('demo worker', '96000000-0000-4000-a000-000000000012');
grant select on people to authenticated, service_role;

insert into public.businesses (id, slug, name)
values
  ('96000000-0000-4000-b000-000000000001', 'rck-one', 'Roles Clock'),
  ('96000000-0000-4000-b000-000000000002', 'rck-demo', 'Roles Clock Demo');

insert into public.memberships (business_id, user_id, role)
values
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000001', 'owner'),
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000002', 'manager'),
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000003', 'worker'),
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000004', 'worker'),
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000005', 'accountant'),
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000006', 'worker'),
  ('96000000-0000-4000-b000-000000000002', '96000000-0000-4000-a000-000000000010', 'owner'),
  ('96000000-0000-4000-b000-000000000002', '96000000-0000-4000-a000-000000000011', 'manager'),
  ('96000000-0000-4000-b000-000000000002', '96000000-0000-4000-a000-000000000012', 'worker');

-- The punch code asked for, shown anywhere, so a punch without one waits
-- for a confirmation.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('96000000-0000-4000-b000-000000000001', 'time_clock', true,
   '{"requirePunchCode": true, "codeDisplay": "both"}'),
  ('96000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('96000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');

-- The demo business as its reset reads it: its people, the manager first.
insert into private.demo_businesses (business_id, definition)
values (
  '96000000-0000-4000-b000-000000000002',
  '{"slug": "rck-demo", "people": [
     {"user_id": "96000000-0000-4000-a000-000000000011"},
     {"user_id": "96000000-0000-4000-a000-000000000012"},
     {"user_id": "96000000-0000-4000-a000-000000000010"}]}'
);

insert into public.platform_staff (user_id, role)
values
  ('96000000-0000-4000-a000-000000000007', 'onboarder'),
  ('96000000-0000-4000-a000-000000000008', 'onboarder'),
  ('96000000-0000-4000-a000-000000000009', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('96000000-0000-4000-a000-000000000007', '96000000-0000-4000-b000-000000000001', 'accountant'),
  ('96000000-0000-4000-a000-000000000008', '96000000-0000-4000-b000-000000000001', 'worker'),
  ('96000000-0000-4000-a000-000000000009', '96000000-0000-4000-b000-000000000001', 'manager');

-- The owner's and the manager's phones, so the lines for them are queued.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select p.id, 'https://fcm.googleapis.com/rck-' || p.label, repeat('c', 63) || n::text,
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from people p
join (values ('owner', 1), ('manager', 2)) as phones (label, n) on phones.label = p.label;

-- The worker's and the colleague's wages, read by pay holders and each by its
-- own person.
insert into public.member_wages (business_id, user_id, hourly_agorot, effective_from)
values
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000003', 3500, '2026-11-01'),
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000004', 3600, '2026-11-01');

-- The manager's and the worker's own day on 30 November, punched with a code.
insert into public.time_entries (business_id, user_id, clock_in, clock_out, in_proof, out_proof)
values
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000002',
   '2026-11-30 06:00+00', '2026-11-30 14:00+00', 'scan', 'scan'),
  ('96000000-0000-4000-b000-000000000001', '96000000-0000-4000-a000-000000000003',
   '2026-11-30 06:00+00', '2026-11-30 14:00+00', 'scan', 'scan');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.p(name text) returns uuid language sql as $$
  select p.id from people p where p.label = name
$$;

create function pg_temp.h(t text) returns text language sql as $$
  select encode(sha256(convert_to(t, 'utf8')), 'hex')
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- What a call does: 'lives', or the code it is refused with. Undone either
-- way, so each state starts from the same hours.
create function pg_temp.attempt(call text) returns text language plpgsql as $$
declare
  outcome text;
begin
  begin
    execute call;
    outcome := 'lives';
    raise exception 'tried' using errcode = 'P0001', hint = 'rck-tried';
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
    raise exception 'tried' using errcode = 'P0001', hint = 'rck-tried';
  exception when others then
    null;
  end;
  return outcome;
end;
$$;

-- The state the owner sets: back to the defaults (managers edit the clock,
-- workers don't), then the state's own switch.
create function pg_temp.apply(state text) returns void language plpgsql as $$
begin
  perform public.set_role_permission(pg_temp.p('owner'), '96000000-0000-4000-b000-000000000001',
    'worker', 'clock.edit', false);
  perform public.set_role_permission(pg_temp.p('owner'), '96000000-0000-4000-b000-000000000001',
    'manager', 'clock.edit', true);
  if state = 'raised' then
    perform public.set_role_permission(pg_temp.p('owner'), '96000000-0000-4000-b000-000000000001',
      'worker', 'clock.edit', true);
  elsif state = 'lowered' then
    perform public.set_role_permission(pg_temp.p('owner'), '96000000-0000-4000-b000-000000000001',
      'manager', 'clock.edit', false);
  end if;
end;
$$;

-- What the signed-in person reads of the business: their own hours, everyone
-- else's hours and breaks, the stations, the wages, and their lines about
-- hours waiting.
create function pg_temp.reads()
returns table (own integer, others integer, breaks integer, stations integer, wages integer, waiting integer)
language sql as $$
  select
    (select count(e.id)::integer from public.time_entries e
     where e.business_id = '96000000-0000-4000-b000-000000000001' and e.user_id = (select auth.uid())),
    (select count(e.id)::integer from public.time_entries e
     where e.business_id = '96000000-0000-4000-b000-000000000001'
       and e.user_id is distinct from (select auth.uid())),
    (select count(k.id)::integer from public.time_breaks k
     where k.business_id = '96000000-0000-4000-b000-000000000001'
       and k.user_id is distinct from (select auth.uid())),
    (select count(s.id)::integer from public.clock_stations s
     where s.business_id = '96000000-0000-4000-b000-000000000001'),
    (select count(w.id)::integer from public.member_wages w
     where w.business_id = '96000000-0000-4000-b000-000000000001'),
    (select count(n.id)::integer from public.notifications n
     where n.business_id = '96000000-0000-4000-b000-000000000001' and n.kind = 'clock.confirm')
$$;

-- A second station, paired from the actor's phone.
create function pg_temp.pair(actor uuid) returns uuid language plpgsql as $$
begin
  perform public.start_station_pairing(pg_temp.h('rck-pair-2'), pg_temp.h('rck-pair-2s'),
    pg_temp.h('rck-token-2'), '2026-12-01 15:00+00');
  return public.approve_station_pairing(actor, '96000000-0000-4000-b000-000000000001', 'Bar',
    pg_temp.h('rck-pair-2'), null, '2026-12-01 15:00+00');
end;
$$;

-- Confirming, correcting and adding the colleague's hours, issuing a punch
-- code, asking whether one is showing, pairing a station and stopping one,
-- by the owner, the manager and the worker.
create function pg_temp.writes()
returns table (who text, confirms text, corrects text, adds text, issues text, asks text, pairs text, stops text)
language sql as $$
  select p.label,
    pg_temp.attempt(format(
      'select public.confirm_time_entry(%L::uuid, %L::uuid, %L::timestamptz)',
      p.id, pg_temp.id('plain'), '2026-12-01 15:00+00')),
    pg_temp.attempt(format(
      'select public.correct_time_entry(%L::uuid, %L::uuid, %L::timestamptz, %L::timestamptz, %L, %L::timestamptz)',
      p.id, pg_temp.id('plain'), '2026-12-01 06:10+00', '2026-12-01 14:00+00', 'Late bus',
      '2026-12-01 15:00+00')),
    pg_temp.attempt(format(
      'select public.add_time_entry(%L::uuid, %L::uuid, %L::uuid, %L::timestamptz, %L::timestamptz, %L, %L::timestamptz)',
      p.id, '96000000-0000-4000-b000-000000000001', pg_temp.p('colleague'),
      '2026-11-30 06:00+00', '2026-11-30 14:00+00', 'Forgot to punch', '2026-12-01 15:00+00')),
    pg_temp.attempt(format(
      'select public.issue_punch_code(%L::uuid, %L::uuid, %L, %L::timestamptz, %L)',
      p.id, '96000000-0000-4000-b000-000000000001', pg_temp.h('rck-code'), '2026-12-01 15:00+00',
      pg_temp.h('rck-code-short'))),
    pg_temp.attempt(format(
      'select public.punch_code_showing(%L::uuid, %L::uuid, %L::timestamptz)',
      p.id, '96000000-0000-4000-b000-000000000001', '2026-12-01 15:00+00')),
    pg_temp.attempt(format('select pg_temp.pair(%L::uuid)', p.id)),
    pg_temp.attempt(format(
      'select public.set_clock_station_stopped(%L::uuid, %L::uuid, true, %L::timestamptz)',
      p.id, pg_temp.id('station'), '2026-12-01 15:00+00'))
  from people p
  where p.label in ('owner', 'manager', 'worker')
$$;

-- Who has a line of this kind about something new (not the setup's two
-- entries), each with what the line is for: its permission, else its rank.
create function pg_temp.lines(what text) returns text language sql as $$
  select coalesce(
    string_agg(p.label || '/' || coalesce(n.audience_perm, n.audience_role::text), ',' order by p.label),
    '')
  from public.notifications n
  join people p on p.id = n.user_id
  where n.business_id = '96000000-0000-4000-b000-000000000001'
    and n.kind = what
    and n.dedupe_key not in (select 'clock.confirm:' || i.id from ids i)
$$;

-- Who hears of hours without a code (the colleague in without one on the
-- 3rd), of hours the manager and the worker each set for themselves, and how
-- the manager's line about the colleague's hours stands once they are made a
-- worker.
create function pg_temp.told()
returns table (confirm text, by_manager text, by_worker text, demoted text)
language sql as $$
  select
    pg_temp.probe(
      format('select public.clock_in(%L::uuid, %L::uuid, null, %L::timestamptz, null, true)',
        pg_temp.p('colleague'), '96000000-0000-4000-b000-000000000001', '2026-12-03 06:00+00'),
      $q$select pg_temp.lines('clock.confirm')$q$),
    pg_temp.probe(
      format('select public.add_time_entry(%L::uuid, %L::uuid, %L::uuid, %L::timestamptz, %L::timestamptz, %L, %L::timestamptz)',
        pg_temp.p('manager'), '96000000-0000-4000-b000-000000000001', pg_temp.p('manager'),
        '2026-11-29 06:00+00', '2026-11-29 14:00+00', 'Forgot to punch', '2026-12-01 15:00+00'),
      $q$select pg_temp.lines('clock.confirm')$q$),
    pg_temp.probe(
      format('select public.add_time_entry(%L::uuid, %L::uuid, %L::uuid, %L::timestamptz, %L::timestamptz, %L, %L::timestamptz)',
        pg_temp.p('worker'), '96000000-0000-4000-b000-000000000001', pg_temp.p('worker'),
        '2026-11-29 06:00+00', '2026-11-29 14:00+00', 'Forgot to punch', '2026-12-01 15:00+00'),
      $q$select pg_temp.lines('clock.confirm')$q$),
    pg_temp.probe(
      format('select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, at_time => %L)',
        pg_temp.p('owner'), '96000000-0000-4000-b000-000000000001', pg_temp.p('manager'),
        'worker', '2026-12-01 15:00+00'),
      format($q$select (n.read_at is not null)::text || '/' || n.push_state
        from public.notifications n
        where n.user_id = %L and n.dedupe_key = 'clock.confirm:' || %L$q$,
        pg_temp.p('manager'), pg_temp.id('plain')))
$$;

-- Who hears that the late worker's entry is open too long, at noon on 1
-- December, undone afterwards. Run as the database's own: private functions
-- aren't the secret key's.
create function pg_temp.overdue() returns text language sql as $$
  select pg_temp.probe(
    format('select private.run_business_reminders(%L::uuid, %L::timestamptz)',
      '96000000-0000-4000-b000-000000000001', '2026-12-01 12:00+00'),
    $q$select pg_temp.lines('clock.overdue')$q$)
$$;

create temporary table seen (
  state text, who text, own integer, others integer, breaks integer, stations integer,
  wages integer, waiting integer
) on commit drop;
create temporary table acts (
  state text, who text, confirms text, corrects text, adds text, issues text, asks text,
  pairs text, stops text
) on commit drop;
create temporary table heard (
  state text, confirm text, by_manager text, by_worker text, overdue text, demoted text
) on commit drop;
grant all on seen, acts, heard to authenticated, service_role;

------------------------------------------------------------------------------
-- The hours: a station, the late worker in without a code on the 28th and
-- never out, the colleague's day on 1 December without a code both ways,
-- with a break

set local role service_role;
select public.start_station_pairing(pg_temp.h('rck-pair-1'), pg_temp.h('rck-pair-1s'),
  pg_temp.h('rck-token-1'), '2026-12-01 05:00+00');
insert into ids values ('station', public.approve_station_pairing(pg_temp.p('owner'),
  '96000000-0000-4000-b000-000000000001', 'Door', pg_temp.h('rck-pair-1'), null,
  '2026-12-01 05:00+00'));
insert into ids values ('late', public.clock_in(pg_temp.p('late'),
  '96000000-0000-4000-b000-000000000001', null, '2026-11-28 06:00+00', null, true));
insert into ids values ('plain', public.clock_in(pg_temp.p('colleague'),
  '96000000-0000-4000-b000-000000000001', null, '2026-12-01 06:00+00', null, true));
select public.start_break(pg_temp.p('colleague'), '96000000-0000-4000-b000-000000000001',
  '2026-12-01 10:00+00');
select public.end_break(pg_temp.p('colleague'), '96000000-0000-4000-b000-000000000001',
  '2026-12-01 10:30+00');
select public.clock_out(pg_temp.p('colleague'), '96000000-0000-4000-b000-000000000001',
  null, '2026-12-01 14:00+00', null, true);
reset role;

select is(
  (select string_agg(p.label || ':' || n.push_state || ':' || n.audience_role || ':'
       || coalesce(n.audience_perm, 'none'), ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.kind = 'clock.confirm' and n.dedupe_key = 'clock.confirm:' || pg_temp.id('plain')),
  'manager:queued:manager:clock.edit,owner:queued:manager:clock.edit',
  'hours without a code are told to those who edit the clock, as a line for those who hold clock.edit'
);

-- Today's rule, frozen as 20261107000100_time_clock.sql wrote it: an active
-- owner or manager, or a member given clock.edit.
create function pg_temp.old_can_edit_clock(business uuid, person uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (m.role in ('owner', 'manager') or 'clock.edit' = any (m.perms))
  )
$$;

-- With one person given clock.edit of their own, every membership in the
-- database, the seed's included.
update public.memberships set perms = '{clock.edit}'
where business_id = '96000000-0000-4000-b000-000000000001' and user_id = pg_temp.p('late');
select is_empty(
  $$select m.business_id, m.user_id, m.role
    from public.memberships m
    where pg_temp.old_can_edit_clock(m.business_id, m.user_id)
      is distinct from private.can_edit_clock(m.business_id, m.user_id)$$,
  'on today''s defaults, who edits the clock is who did before, for every membership, a personal grant included'
);
update public.memberships set perms = '{}'
where business_id = '96000000-0000-4000-b000-000000000001' and user_id = pg_temp.p('late');

------------------------------------------------------------------------------
-- The matrix

-- Today: owners and managers edit the clock, workers don't.
set local role service_role;
select pg_temp.apply('today');
insert into acts select 'today', w.* from pg_temp.writes() w;
insert into heard select 'today', t.confirm, t.by_manager, t.by_worker, null, t.demoted
from pg_temp.told() t;
reset role;
update heard set overdue = pg_temp.overdue() where state = 'today';
select pg_temp.sign_in(pg_temp.p('owner'));
insert into seen select 'today', 'owner', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('manager'));
insert into seen select 'today', 'manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('worker'));
insert into seen select 'today', 'worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('accountant'));
insert into seen select 'today', 'accountant', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as worker'));
insert into seen select 'today', 'view as worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as manager'));
insert into seen select 'today', 'view as manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as accountant'));
insert into seen select 'today', 'view as accountant', r.* from pg_temp.reads() r;
reset role;

-- Workers raised to edit the clock.
set local role service_role;
select pg_temp.apply('raised');
insert into acts select 'raised', w.* from pg_temp.writes() w;
insert into heard select 'raised', t.confirm, t.by_manager, t.by_worker, null, t.demoted
from pg_temp.told() t;
reset role;
update heard set overdue = pg_temp.overdue() where state = 'raised';
select pg_temp.sign_in(pg_temp.p('owner'));
insert into seen select 'raised', 'owner', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('manager'));
insert into seen select 'raised', 'manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('worker'));
insert into seen select 'raised', 'worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('accountant'));
insert into seen select 'raised', 'accountant', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as worker'));
insert into seen select 'raised', 'view as worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as manager'));
insert into seen select 'raised', 'view as manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as accountant'));
insert into seen select 'raised', 'view as accountant', r.* from pg_temp.reads() r;
reset role;

-- Managers lowered to view: they punch and read their own, as workers do.
set local role service_role;
select pg_temp.apply('lowered');
insert into acts select 'lowered', w.* from pg_temp.writes() w;
insert into heard select 'lowered', t.confirm, t.by_manager, t.by_worker, null, t.demoted
from pg_temp.told() t;
reset role;
update heard set overdue = pg_temp.overdue() where state = 'lowered';
select pg_temp.sign_in(pg_temp.p('owner'));
insert into seen select 'lowered', 'owner', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('manager'));
insert into seen select 'lowered', 'manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('worker'));
insert into seen select 'lowered', 'worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('accountant'));
insert into seen select 'lowered', 'accountant', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as worker'));
insert into seen select 'lowered', 'view as worker', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as manager'));
insert into seen select 'lowered', 'view as manager', r.* from pg_temp.reads() r;
select pg_temp.sign_in(pg_temp.p('view as accountant'));
insert into seen select 'lowered', 'view as accountant', r.* from pg_temp.reads() r;
reset role;

-- Reads: one's own hours always (view is the floor); everyone else's hours
-- (the colleague's, the late worker's and the other one's own) and the
-- colleague's break, and the stations, for those who edit the clock,
-- members and views alike; every hour and the two wages for pay holders and
-- a view as an accountant at every level, the stations not; one's own wage;
-- the lines about hours waiting where they were written, while their reader
-- still edits the clock.
select set_eq(
  'select * from seen',
  $$values
    ('today', 'owner', 0, 4, 1, 1, 2, 2),
    ('today', 'manager', 1, 3, 1, 1, 0, 2),
    ('today', 'worker', 1, 0, 0, 0, 1, 0),
    ('today', 'accountant', 0, 4, 1, 0, 2, 0),
    ('today', 'view as worker', 0, 0, 0, 0, 0, 0),
    ('today', 'view as manager', 0, 4, 1, 1, 0, 0),
    ('today', 'view as accountant', 0, 4, 1, 0, 2, 0),
    ('raised', 'owner', 0, 4, 1, 1, 2, 2),
    ('raised', 'manager', 1, 3, 1, 1, 0, 2),
    ('raised', 'worker', 1, 3, 1, 1, 1, 0),
    ('raised', 'accountant', 0, 4, 1, 0, 2, 0),
    ('raised', 'view as worker', 0, 4, 1, 1, 0, 0),
    ('raised', 'view as manager', 0, 4, 1, 1, 0, 0),
    ('raised', 'view as accountant', 0, 4, 1, 0, 2, 0),
    ('lowered', 'owner', 0, 4, 1, 1, 2, 2),
    ('lowered', 'manager', 1, 0, 0, 0, 0, 0),
    ('lowered', 'worker', 1, 0, 0, 0, 1, 0),
    ('lowered', 'accountant', 0, 4, 1, 0, 2, 0),
    ('lowered', 'view as worker', 0, 0, 0, 0, 0, 0),
    ('lowered', 'view as manager', 0, 0, 0, 0, 0, 0),
    ('lowered', 'view as accountant', 0, 4, 1, 0, 2, 0)$$,
  'the team''s hours, breaks and stations are read by those who edit the clock, members and views alike, one''s own always, pay as before at every level, and a lowered manager no longer reads the line written before'
);

-- Writes: every one of the clock's follows clock.edit, as today's rules do
-- for owners and managers.
select set_eq(
  'select * from acts',
  $$values
    ('today', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('today', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('today', 'worker', '42501', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('raised', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised', 'worker', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('lowered', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('lowered', 'manager', '42501', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('lowered', 'worker', '42501', '42501', '42501', '42501', '42501', '42501', '42501')$$,
  'confirming, correcting and adding hours, the punch code and the stations follow clock.edit, and today''s rules are unchanged'
);

-- Notices: hours without a code and an entry open too long to those who
-- edit the clock but the person and whoever did it, as lines for clock.edit;
-- hours someone set for themselves to the owner alone, by rank, whoever else
-- edits the clock (critique 24); the manager made a worker keeps a line only
-- where workers edit the clock.
select set_eq(
  'select * from heard',
  $$values
    ('today', 'manager/clock.edit,owner/clock.edit', 'owner/owner', 'refused 42501',
      'manager/clock.edit,owner/clock.edit', 'true/skipped'),
    ('raised', 'late/clock.edit,manager/clock.edit,owner/clock.edit,worker/clock.edit',
      'owner/owner', 'owner/owner',
      'colleague/clock.edit,late/clock.edit,manager/clock.edit,owner/clock.edit,worker/clock.edit',
      'false/queued'),
    ('lowered', 'owner/clock.edit', 'refused 42501', 'refused 42501', 'owner/clock.edit',
      'true/skipped')$$,
  'clock.confirm and clock.overdue go to those who edit the clock, hours set for oneself to owners alone, and a change of role settles a line only for one who no longer edits it'
);

-- The phone: the lowered manager's line is skipped at the next send, the
-- owner's goes.
set local role service_role;
select count(*) from public.claim_due_pushes(200, now());
reset role;
select is(
  (select string_agg(p.label || ':' || n.push_state, ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.dedupe_key = 'clock.confirm:' || pg_temp.id('plain')),
  'manager:skipped,owner:sending',
  'a push queued for a line its reader no longer reads is skipped, and the rest go'
);

------------------------------------------------------------------------------
-- A line at the next event of its hours, and a clock-out undone

-- Whose lines about the late worker's entry are settled.
create function pg_temp.late_lines() returns text language sql as $$
  select coalesce(
    string_agg(p.label || ':' || (n.resolved_at is not null)::text, ',' order by p.label),
    'none')
  from public.notifications n
  join people p on p.id = n.user_id
  where n.dedupe_key = 'clock.confirm:' || pg_temp.id('late')
$$;

-- The owner sets `state`, then the late worker's departure: their arrival
-- is still without a code, so the entry still waits for those who edit the
-- clock.
create function pg_temp.correct_late(state text) returns void language plpgsql as $$
begin
  perform pg_temp.apply(state);
  perform public.correct_time_entry(pg_temp.p('owner'), pg_temp.id('late'),
    '2026-11-28 06:00+00', '2026-11-28 14:00+00', 'Forgot to clock out',
    '2026-12-01 15:00+00');
end;
$$;

-- On today's defaults, the manager in without a code on the 2nd (a line for
-- those who edit the clock), out through a station they paired themselves
-- ('self', the owner's by rank), and that clock-out undone a minute later,
-- so the arrival without a code waits again: who has a line about the day,
-- and what it is for, after the clock-out and after the undo. Undone
-- afterwards; 'refused <code>' where a step is.
create function pg_temp.undone_out() returns text language plpgsql as $$
declare
  own_day uuid;
  outcome text;
  done boolean := false;
begin
  begin
    perform pg_temp.apply('today');
    perform pg_temp.pair(pg_temp.p('manager'));
    perform public.issue_station_code(pg_temp.h('rck-token-2'), pg_temp.h('rck-own'),
      pg_temp.h('rck-own-short'), '2026-12-02 14:00+00');
    own_day := public.clock_in(pg_temp.p('manager'), '96000000-0000-4000-b000-000000000001',
      null, '2026-12-02 06:00+00', null, true);
    perform public.clock_out(pg_temp.p('manager'), '96000000-0000-4000-b000-000000000001',
      pg_temp.h('rck-own'), '2026-12-02 14:00+00', null, false);
    outcome := pg_temp.lines('clock.confirm');
    perform public.undo_clock_out(pg_temp.p('manager'), own_day, '2026-12-02 14:01+00');
    outcome := outcome || ' | ' || pg_temp.lines('clock.confirm');
    done := true;
    raise exception 'tried' using errcode = 'P0001', hint = 'rck-tried';
  exception when others then
    if not done then
      outcome := coalesce(outcome || ' | ', '') || 'refused ' || sqlstate;
    end if;
  end;
  return outcome;
end;
$$;

-- Managers lowered, the manager's line about the late worker's entry stays
-- as it was (the switch settles nothing; they no longer read it), and the
-- owner's correction, which leaves the entry waiting, settles it but not
-- the owner's; on today's defaults the same correction settles neither.
set local role service_role;
select is(
  pg_temp.probe($$select pg_temp.apply('lowered')$$, $q$select pg_temp.late_lines()$q$)
  || ' | ' || pg_temp.probe($$select pg_temp.correct_late('lowered')$$,
    $q$select pg_temp.late_lines()$q$)
  || ' | ' || pg_temp.probe($$select pg_temp.correct_late('today')$$,
    $q$select pg_temp.late_lines()$q$),
  'manager:false,owner:false | manager:true,owner:false | manager:false,owner:false',
  'the line of one who no longer edits the clock is settled at the next event of its hours, not by the switch, and the others'' stay'
);

-- The undone clock-out's line changes what it is for: the owner's by rank
-- while the departure rested on the manager's own station, for clock.edit
-- once only the arrival without a code waits.
select is(
  pg_temp.undone_out(),
  'owner/owner | owner/clock.edit',
  'a clock-out undone puts the line back for those who edit the clock, as hours without a code'
);
reset role;

------------------------------------------------------------------------------
-- Hours set for oneself, with workers raised

-- `maker` adds their own forgotten day, then `confirmer` confirms it.
create function pg_temp.own_then_confirm(maker text, confirmer text) returns void
language plpgsql as $$
declare
  made uuid;
begin
  made := public.add_time_entry(pg_temp.p(maker), '96000000-0000-4000-b000-000000000001',
    pg_temp.p(maker), '2026-11-29 06:00+00', '2026-11-29 14:00+00', 'Forgot to punch',
    '2026-12-01 15:00+00');
  perform public.confirm_time_entry(pg_temp.p(confirmer), made, '2026-12-01 16:00+00');
end;
$$;

set local role service_role;
select pg_temp.apply('raised');
select is(
  pg_temp.attempt($$select pg_temp.own_then_confirm('manager', 'worker')$$)
  || ' ' || pg_temp.attempt($$select pg_temp.own_then_confirm('manager', 'manager')$$)
  || ' ' || pg_temp.attempt($$select pg_temp.own_then_confirm('manager', 'owner')$$)
  || ' ' || pg_temp.attempt($$select pg_temp.own_then_confirm('worker', 'manager')$$)
  || ' ' || pg_temp.attempt($$select pg_temp.own_then_confirm('worker', 'owner')$$),
  '42501 42501 lives 42501 lives',
  'a manager''s correction of their own hours, and any hours set for oneself, only an owner confirms, whoever else edits the clock'
);
reset role;

------------------------------------------------------------------------------
-- Giving a role, with workers set above managers

-- The owner makes the late worker a manager; a manager then makes them a
-- worker again.
create function pg_temp.manager_demotes() returns void language plpgsql as $$
begin
  perform public.set_member_role(pg_temp.p('owner'), '96000000-0000-4000-b000-000000000001',
    pg_temp.p('late'), 'manager', at_time => '2026-12-01 15:00+00');
  perform public.set_member_role(pg_temp.p('manager'), '96000000-0000-4000-b000-000000000001',
    pg_temp.p('late'), 'worker', at_time => '2026-12-01 15:00+00');
end;
$$;

-- Workers edit the clock and managers don't: a manager gives nobody a role
-- that holds it, by a change of role or an invite, and inviting a manager
-- goes.
set local role service_role;
select pg_temp.apply('raised');
select public.set_role_permission(pg_temp.p('owner'), '96000000-0000-4000-b000-000000000001',
  'manager', 'clock.edit', false);
select is(
  pg_temp.attempt('select pg_temp.manager_demotes()')
  || ' ' ||
  pg_temp.attempt(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '96000000-0000-4000-b000-000000000001', '+972500960091', 'New',
    'worker', repeat('d', 64)))
  || ' ' ||
  pg_temp.attempt(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '96000000-0000-4000-b000-000000000001', '+972500960092', 'New',
    'manager', repeat('e', 64))),
  '42501 42501 lives',
  'with workers set above managers on the clock, a manager gives nobody a role that edits it'
);
reset role;

------------------------------------------------------------------------------
-- The demo's correction

-- Last month's hours of the demo business, with the demo worker's corrected
-- day; and the same with the demo's managers lowered on the clock first.
create function pg_temp.demo_hours() returns void language plpgsql as $$
begin
  perform private.seed_demo_hours('96000000-0000-4000-b000-000000000002',
    '{"cases": [{"user_id": "96000000-0000-4000-a000-000000000012", "case": "corrected",
       "note": "Forgot to clock out"}]}'::jsonb);
end;
$$;
create function pg_temp.demo_hours_lowered() returns void language plpgsql as $$
begin
  perform public.set_role_permission(pg_temp.p('demo owner'), '96000000-0000-4000-b000-000000000002',
    'manager', 'clock.edit', false);
  perform pg_temp.demo_hours();
end;
$$;

select is(
  pg_temp.probe('select pg_temp.demo_hours()',
    $q$select coalesce(string_agg(distinct p.label, ','), 'nobody')
      from public.time_entries e join people p on p.id = e.edited_by
      where e.business_id = '96000000-0000-4000-b000-000000000002'$q$)
  || ' | ' ||
  pg_temp.probe('select pg_temp.demo_hours_lowered()',
    $q$select coalesce(string_agg(distinct p.label, ','), 'nobody')
      from public.time_entries e join people p on p.id = e.edited_by
      where e.business_id = '96000000-0000-4000-b000-000000000002'$q$),
  'demo manager | demo owner',
  'the demo''s correction is made by its manager while managers edit the clock, else by its owner'
);

------------------------------------------------------------------------------
-- How it is built

-- The lines written before this migration moved to their key: none of the
-- two kinds is left for a rank alone, but hours set for oneself, an owner's.
select is(
  (select count(*)::integer from public.notifications n
   where (n.kind = 'clock.overdue' and n.audience_perm is distinct from 'clock.edit')
     or (n.kind = 'clock.confirm' and n.audience_role = 'manager'
       and n.audience_perm is distinct from 'clock.edit')
     or (n.kind = 'clock.confirm' and n.audience_role = 'owner' and n.audience_perm is not null)),
  0,
  'every line of hours waiting and of an entry open too long is for clock.edit, those written before the migration too, but hours set for oneself, an owner''s by rank'
);

select ok(
  (select count(*) = 3
     and bool_and(strpos(p.qual, 'businesses_holding(''clock.edit''') > 0
       and strpos(p.qual, 'has_role') = 0
       and strpos(p.qual, 'is_viewing') = 0
       and strpos(p.qual, 'has_perm(business_id, ''clock.edit''') = 0)
   from pg_policies p
   where (p.schemaname, p.tablename, p.policyname) in (
     ('public', 'time_entries', 'people read their own entries, editors and pay holders all'),
     ('public', 'time_breaks', 'breaks are read like the entries they belong to'),
     ('public', 'clock_stations', 'the clock''s editors read the business''s stations')
   )),
  'the team''s hours, breaks and stations ask clock.edit once per query, by no role'
);

-- Since waiter mode's stations (20261124000100_order_taking_stations.sql)
-- share the registry: the clock's editors read the clock's rows only, and
-- the kitchen's screens and tills are read by those who run orders.
select ok(
  (select strpos(p.qual, '''clock_code''') > 0
     and strpos(p.qual, 'businesses_holding(''clock.edit''') > 0
     and strpos(p.qual, 'order_taking') = 0
   from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'clock_stations'
     and p.policyname = 'the clock''s editors read the business''s stations')
  and (select strpos(p.qual, '''prep''') > 0
     and strpos(p.qual, '''till''') > 0
     and strpos(p.qual, 'businesses_holding(''order_taking.edit''') > 0
     and strpos(p.qual, 'clock.edit') = 0
   from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'clock_stations'
     and p.policyname = 'order_taking''s runners read its stations'),
  'the clock''s editors read only the clock''s stations, and those who run orders the kitchen''s screens and tills'
);

select is(
  (select string_agg(k.key || ':' || k.settable::text, ',' order by k.key)
   from public.permission_keys k where k.area = 'time_clock'),
  'clock.edit:true,clock.payroll:false',
  'the time clock is open for changes per role, and pay keeps its own switch'
);

select ok(
  not has_function_privilege('authenticated', 'private.can_edit_clock(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.can_edit_clock(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_hours(uuid, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_hours(uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.notify_for(public.audit_log)', 'execute')
  and not has_function_privilege('authenticated', 'private.run_business_reminders(uuid, timestamptz)', 'execute')
  and (select count(*)::int from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname || '.' || p.proname in (
           'private.can_edit_clock', 'private.seed_demo_hours', 'private.notify_for',
           'private.run_business_reminders'
         )
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 4,
  'the replaced functions run as their owner with an empty search path, and nobody signed in calls them'
);

select * from finish();
rollback;
