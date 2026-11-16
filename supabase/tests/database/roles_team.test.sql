-- Roles and permissions by module, R6 (20261115001300_roles_team.sql): the
-- team by its permissions. One matrix, driven by VALUES, over six states the
-- owner sets through public.set_role_permissions: today's defaults, workers
-- raised to team view ('view') and to team edit ('edit'), managers lowered
-- to view ('mview') and to none ('mnone'), and workers who build the
-- schedule at team none ('builds'). In each, for the owner, a manager, a
-- worker and views as a worker, a manager, the owner and an accountant: what
-- they read of the invites, the numbers (team_phones), the minors
-- (team_youth), the names (every member's, always) and the line written
-- when someone joined before the matrix; whether inviting, a fresh link,
-- cancelling, removing, changing a role and clearing a line live or are
-- refused, with the rank rule kept (a worker raised to edit acts on workers
-- alone); who hears that someone joined, and whether a manager made a worker
-- keeps that line. Then: on today's defaults the old rules and the new give
-- the same answers; a lowered manager's queued push is skipped; a worker
-- raised to edit the team touches no manager's invite and no accountant's
-- line; nobody but an owner gives a role that holds pay (by an invite, a
-- fresh link or a change of role), which today let a manager pass pay on
-- where managers held it, and an invite a manager sent before the owner gave
-- its role pay isn't claimed until an owner or the team sends it again; the
-- clock's lines stay R4's in the notifier this replaces; and how it is
-- built. Every write passes its moment where it takes one. Fixed ids (97…)
-- and numbers (050-000-970x), so nothing here meets the seed.
begin;
select plan(17);

-- 1 owner, 2 manager, 3 the worker the matrix follows, 4 a worker the others
-- act on (with a line about themselves), 5 another manager (above a worker),
-- 6 a minor, 7 someone who joined, 13 an accountant; 10 someone who joins
-- inside each state; 8, 9, 11 and 12 on the ConceptApp team, viewing the
-- business as a worker, a manager, the owner and an accountant; 14 someone a
-- manager invites as a manager, with no business.
insert into auth.users (id, aud, role, phone)
select
  ('97000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250097' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,7,8,9,10,11,12,13,14}'::int[]) as n;

create temporary table people (label text primary key, id uuid not null) on commit drop;
insert into people values
  ('owner', '97000000-0000-4000-a000-000000000001'),
  ('manager', '97000000-0000-4000-a000-000000000002'),
  ('worker', '97000000-0000-4000-a000-000000000003'),
  ('target', '97000000-0000-4000-a000-000000000004'),
  ('senior', '97000000-0000-4000-a000-000000000005'),
  ('minor', '97000000-0000-4000-a000-000000000006'),
  ('joiner', '97000000-0000-4000-a000-000000000007'),
  ('view as worker', '97000000-0000-4000-a000-000000000008'),
  ('view as manager', '97000000-0000-4000-a000-000000000009'),
  ('newcomer', '97000000-0000-4000-a000-000000000010'),
  ('view as owner', '97000000-0000-4000-a000-000000000011'),
  ('view as accountant', '97000000-0000-4000-a000-000000000012'),
  ('books', '97000000-0000-4000-a000-000000000013'),
  ('second', '97000000-0000-4000-a000-000000000014');
grant select on people to authenticated, service_role;

insert into public.businesses (id, slug, name)
values ('97000000-0000-4000-b000-000000000001', 'rtm-one', 'Roles Team');

insert into public.memberships (business_id, user_id, role)
select '97000000-0000-4000-b000-000000000001', p.id,
  case p.label
    when 'owner' then 'owner'
    when 'manager' then 'manager'
    when 'senior' then 'manager'
    when 'books' then 'accountant'
    else 'worker'
  end::public.member_role
from people p
where p.label in ('owner', 'manager', 'worker', 'target', 'senior', 'minor', 'books');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('97000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('97000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('97000000-0000-4000-b000-000000000001', 'notifications', true, '{}');

-- The minor turns 18 in over a year.
insert into public.member_payroll_details (business_id, user_id, youth_until)
values ('97000000-0000-4000-b000-000000000001', '97000000-0000-4000-a000-000000000006',
  (now() at time zone 'Asia/Jerusalem')::date + 400);

insert into public.platform_staff (user_id, role)
select p.id, 'onboarder'
from people p
where p.label like 'view as %';
insert into public.view_sessions (staff_id, business_id, role)
select p.id, '97000000-0000-4000-b000-000000000001',
  replace(p.label, 'view as ', '')::public.member_role
from people p
where p.label like 'view as %';

-- The owner's and the manager's phones, so the lines for them are queued.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select p.id, 'https://fcm.googleapis.com/rtm-' || p.label, repeat('c', 63) || n::text,
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from people p
join (values ('owner', 1), ('manager', 2)) as phones (label, n) on phones.label = p.label;

-- Open invites: one to a worker for a number nobody has, and the ones the
-- joiner and the newcomer take up.
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;
with made as (
  insert into public.invites (business_id, phone, role, full_name, token_hash, invited_by, expires_at)
  values
    ('97000000-0000-4000-b000-000000000001', '+972500970020', 'worker', 'Open',
     repeat('1', 64), '97000000-0000-4000-a000-000000000001', now() + interval '7 days'),
    ('97000000-0000-4000-b000-000000000001', '+972500970007', 'worker', 'Joiner',
     repeat('7', 64), '97000000-0000-4000-a000-000000000001', now() + interval '7 days'),
    ('97000000-0000-4000-b000-000000000001', '+972500970010', 'worker', 'Newcomer',
     repeat('5', 64), '97000000-0000-4000-a000-000000000001', now() + interval '7 days')
  returning id, full_name
)
insert into ids select lower(m.full_name), m.id from made m;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.p(name text) returns uuid language sql as $$
  select p.id from people p where p.label = name
$$;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- What a call does: 'lives', or the code it is refused with. Undone either
-- way, so each state starts from the same team.
create function pg_temp.attempt(call text) returns text language plpgsql as $$
declare
  outcome text;
begin
  begin
    execute call;
    outcome := 'lives';
    raise exception 'tried' using errcode = 'P0001', hint = 'rtm-tried';
  exception when others then
    if outcome is null then
      outcome := sqlstate;
    end if;
  end;
  return outcome;
end;
$$;

-- The same, with the refusal's hint after its code when it has one.
create function pg_temp.refusal(call text) returns text language plpgsql as $$
declare
  outcome text;
  said text;
begin
  begin
    execute call;
    outcome := 'lives';
    raise exception 'tried' using errcode = 'P0001', hint = 'rtm-tried';
  exception when others then
    if outcome is null then
      get stacked diagnostics said = pg_exception_hint;
      outcome := sqlstate || coalesce('/' || nullif(said, ''), '');
    end if;
  end;
  return outcome;
end;
$$;

-- What `look` answers once `call` has run, undone afterwards. 'refused
-- <code>' when the call is.
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
    raise exception 'tried' using errcode = 'P0001', hint = 'rtm-tried';
  exception when others then
    null;
  end;
  return outcome;
end;
$$;

-- The state the owner sets: back to the defaults (workers neither team key
-- nor building, managers both team keys), then the state's own switches.
create function pg_temp.apply(state text) returns void language plpgsql as $$
begin
  perform public.set_role_permissions(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
    'worker', '{team.edit,team.view,schedule.edit}', '{false,false,false}');
  perform public.set_role_permissions(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
    'manager', '{team.view,team.edit}', '{true,true}');
  if state = 'view' then
    perform public.set_role_permission(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
      'worker', 'team.view', true);
  elsif state = 'edit' then
    perform public.set_role_permissions(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
      'worker', '{team.view,team.edit}', '{true,true}');
  elsif state = 'mview' then
    perform public.set_role_permission(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
      'manager', 'team.edit', false);
  elsif state = 'mnone' then
    perform public.set_role_permissions(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
      'manager', '{team.edit,team.view}', '{false,false}');
  elsif state = 'builds' then
    perform public.set_role_permission(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
      'worker', 'schedule.edit', true);
  end if;
end;
$$;

-- What the signed-in person reads: the business's open invites, its numbers,
-- its minors, its active members' names and their own lines that someone
-- joined.
create function pg_temp.reads()
returns table (invites integer, phones integer, minors integer, names integer, joined integer)
language sql as $$
  select
    (select count(*)::integer from public.invites i
     where i.business_id = '97000000-0000-4000-b000-000000000001' and i.claimed_at is null),
    (select count(*)::integer from public.team_phones('97000000-0000-4000-b000-000000000001')),
    (select count(*)::integer from public.team_youth('97000000-0000-4000-b000-000000000001')),
    (select count(*)::integer from public.memberships m
     where m.business_id = '97000000-0000-4000-b000-000000000001' and m.active),
    (select count(*)::integer from public.notifications n where n.kind = 'team.joined')
$$;

-- Inviting a worker and a manager, a fresh link for the open invite (a
-- worker's) and cancelling it, taking the worker the others act on off the
-- team and making them a manager, taking the other manager off the team, and
-- clearing the worker's line, by the owner, the manager and the worker.
create function pg_temp.writes()
returns table (
  who text, invite_worker text, invite_manager text, link text, cancel text,
  remove_worker text, promote text, remove_manager text, clear_line text
)
language sql as $$
  select p.label,
    pg_temp.attempt(format(
      'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
      p.id, '97000000-0000-4000-b000-000000000001', '+972500970021', 'New', 'worker',
      repeat('d', 64))),
    pg_temp.attempt(format(
      'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
      p.id, '97000000-0000-4000-b000-000000000001', '+972500970022', 'New', 'manager',
      repeat('e', 64))),
    pg_temp.attempt(format(
      'select public.team_invite_link(%L::uuid, %L::uuid, %L)',
      p.id, pg_temp.id('open'), repeat('f', 64))),
    pg_temp.attempt(format(
      'select public.team_invite_cancel(%L::uuid, %L::uuid, %L::timestamptz)',
      p.id, pg_temp.id('open'), '2026-12-01 10:00+00')),
    pg_temp.attempt(format(
      'select public.remove_member(%L::uuid, %L::uuid, %L::uuid, %L::timestamptz)',
      p.id, '97000000-0000-4000-b000-000000000001', pg_temp.p('target'), '2026-12-01 10:00+00')),
    pg_temp.attempt(format(
      'select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, at_time => %L)',
      p.id, '97000000-0000-4000-b000-000000000001', pg_temp.p('target'), 'manager',
      '2026-12-01 10:00+00')),
    pg_temp.attempt(format(
      'select public.remove_member(%L::uuid, %L::uuid, %L::uuid, %L::timestamptz)',
      p.id, '97000000-0000-4000-b000-000000000001', pg_temp.p('senior'), '2026-12-01 10:00+00')),
    pg_temp.attempt(format(
      'select public.clear_profile_bio(%L::uuid, %L::uuid, %L::uuid, %L)',
      p.id, '97000000-0000-4000-b000-000000000001', pg_temp.p('target'), 'Hello there'))
  from people p
  where p.label in ('owner', 'manager', 'worker')
$$;

-- Who hears that the newcomer joined; and how the manager's line about the
-- joiner stands once they are made a worker.
create function pg_temp.told() returns table (joined text, demoted text)
language sql as $$
  select
    pg_temp.probe(
      format('select public.claim_invite(%L, %L::uuid)', repeat('5', 64), pg_temp.p('newcomer')),
      format($q$select coalesce(string_agg(p.label, ',' order by p.label), '')
        from public.notifications n join people p on p.id = n.user_id
        where n.kind = 'team.joined' and n.dedupe_key = 'team.joined:' || %L$q$,
        pg_temp.p('newcomer'))),
    pg_temp.probe(
      format('select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, at_time => %L)',
        pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001', pg_temp.p('manager'),
        'worker', '2026-12-01 10:00+00'),
      format($q$select (n.read_at is not null)::text || '/' || n.push_state
        from public.notifications n
        where n.user_id = %L and n.dedupe_key = 'team.joined:' || %L$q$,
        pg_temp.p('manager'), pg_temp.p('joiner')))
$$;

create temporary table seen (
  state text, who text, invites integer, phones integer, minors integer,
  names integer, joined integer
) on commit drop;
create temporary table acts (
  state text, who text, invite_worker text, invite_manager text, link text,
  cancel text, remove_worker text, promote text, remove_manager text, clear_line text
) on commit drop;
create temporary table heard (state text, joined text, demoted text) on commit drop;
grant all on seen, acts, heard to authenticated, service_role;

-- Everyone in each state reads, as themselves.
create function pg_temp.look(state text) returns void language plpgsql as $$
declare
  reader text;
begin
  foreach reader in array array[
    'owner', 'manager', 'worker', 'view as worker', 'view as manager',
    'view as owner', 'view as accountant'
  ] loop
    perform pg_temp.sign_in(pg_temp.p(reader));
    insert into seen select state, reader, r.* from pg_temp.reads() r;
    reset role;
  end loop;
end;
$$;

------------------------------------------------------------------------------
-- Before the matrix: the worker's line, and the joiner joins on today's rules

set local role service_role;
select public.set_own_profile(pg_temp.p('target'), '{"bio": "Hello there"}');
select public.claim_invite(repeat('7', 64), pg_temp.p('joiner'));
reset role;

select is(
  (select string_agg(p.label || ':' || n.push_state || ':' || n.audience_role || ':'
       || coalesce(n.audience_perm, 'none'), ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.kind = 'team.joined'),
  'manager:queued:manager:team.view,owner:queued:manager:team.view,senior:none:manager:team.view',
  'someone joining is told to those who see the team, as a line for those who hold team.view, but whoever joined'
);

------------------------------------------------------------------------------
-- The matrix

create function pg_temp.run(state text) returns void language plpgsql as $$
begin
  set local role service_role;
  perform pg_temp.apply(state);
  insert into acts select state, w.* from pg_temp.writes() w;
  insert into heard select state, t.* from pg_temp.told() t;
  reset role;
  perform pg_temp.look(state);
end;
$$;

select pg_temp.run('today');
select pg_temp.run('view');
select pg_temp.run('edit');
select pg_temp.run('mview');
select pg_temp.run('mnone');
select pg_temp.run('builds');
reset role;

-- Reads: the invites, the numbers and the minors for those who see the team,
-- members and views alike (an owner's view too, an accountant's never), the
-- minors also for those who build the schedule; every member's name for
-- everyone, at every level; the line written before for its reader while
-- they still see the team.
select set_eq(
  'select * from seen',
  $$values
    ('today', 'owner', 2, 8, 1, 8, 1),
    ('today', 'manager', 2, 8, 1, 8, 1),
    ('today', 'worker', 0, 0, 0, 8, 0),
    ('today', 'view as worker', 0, 0, 0, 8, 0),
    ('today', 'view as manager', 2, 8, 1, 8, 0),
    ('today', 'view as owner', 2, 8, 1, 8, 0),
    ('today', 'view as accountant', 0, 0, 0, 8, 0),
    ('view', 'owner', 2, 8, 1, 8, 1),
    ('view', 'manager', 2, 8, 1, 8, 1),
    ('view', 'worker', 2, 8, 1, 8, 0),
    ('view', 'view as worker', 2, 8, 1, 8, 0),
    ('view', 'view as manager', 2, 8, 1, 8, 0),
    ('view', 'view as owner', 2, 8, 1, 8, 0),
    ('view', 'view as accountant', 0, 0, 0, 8, 0),
    ('edit', 'owner', 2, 8, 1, 8, 1),
    ('edit', 'manager', 2, 8, 1, 8, 1),
    ('edit', 'worker', 2, 8, 1, 8, 0),
    ('edit', 'view as worker', 2, 8, 1, 8, 0),
    ('edit', 'view as manager', 2, 8, 1, 8, 0),
    ('edit', 'view as owner', 2, 8, 1, 8, 0),
    ('edit', 'view as accountant', 0, 0, 0, 8, 0),
    ('mview', 'owner', 2, 8, 1, 8, 1),
    ('mview', 'manager', 2, 8, 1, 8, 1),
    ('mview', 'worker', 0, 0, 0, 8, 0),
    ('mview', 'view as worker', 0, 0, 0, 8, 0),
    ('mview', 'view as manager', 2, 8, 1, 8, 0),
    ('mview', 'view as owner', 2, 8, 1, 8, 0),
    ('mview', 'view as accountant', 0, 0, 0, 8, 0),
    ('mnone', 'owner', 2, 8, 1, 8, 1),
    ('mnone', 'manager', 0, 0, 1, 8, 0),
    ('mnone', 'worker', 0, 0, 0, 8, 0),
    ('mnone', 'view as worker', 0, 0, 0, 8, 0),
    ('mnone', 'view as manager', 0, 0, 1, 8, 0),
    ('mnone', 'view as owner', 2, 8, 1, 8, 0),
    ('mnone', 'view as accountant', 0, 0, 0, 8, 0),
    ('builds', 'owner', 2, 8, 1, 8, 1),
    ('builds', 'manager', 2, 8, 1, 8, 1),
    ('builds', 'worker', 0, 0, 1, 8, 0),
    ('builds', 'view as worker', 0, 0, 1, 8, 0),
    ('builds', 'view as manager', 2, 8, 1, 8, 0),
    ('builds', 'view as owner', 2, 8, 1, 8, 0),
    ('builds', 'view as accountant', 0, 0, 0, 8, 0)$$,
  'the invites, numbers and minors are read by those who see the team, the minors by those who build too, the names by everyone, and a lowered manager no longer reads the line written before'
);

-- Writes: team edit acts, team view only reads, and the rank rule stays:
-- a worker raised to edit invites, sends links for, cancels, takes off,
-- and clears the line of workers only, and makes nobody a manager.
select set_eq(
  'select * from acts',
  $$values
    ('today', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('today', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('today', 'worker', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('view', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('view', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('view', 'worker', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('edit', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('edit', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('edit', 'worker', 'lives', '42501', 'lives', 'lives', 'lives', '42501', '42501', 'lives'),
    ('mview', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('mview', 'manager', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('mview', 'worker', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('mnone', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('mnone', 'manager', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('mnone', 'worker', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('builds', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('builds', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('builds', 'worker', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501')$$,
  'inviting, links, cancelling, removing, changing a role and clearing a line follow team edit, within the rank rule, and today''s rules are unchanged'
);

-- Notices: someone joining is told to those who see the team, whoever they
-- are, but who joined; a manager made a worker keeps that line only where
-- workers see the team.
select set_eq(
  'select * from heard',
  $$values
    ('today', 'manager,owner,senior', 'true/skipped'),
    ('view', 'joiner,manager,minor,owner,senior,target,worker', 'false/queued'),
    ('edit', 'joiner,manager,minor,owner,senior,target,worker', 'false/queued'),
    ('mview', 'manager,owner,senior', 'true/skipped'),
    ('mnone', 'owner', 'true/skipped'),
    ('builds', 'manager,owner,senior', 'true/skipped')$$,
  'team.joined goes to those who see the team, and a change of role settles it only for one who no longer does'
);

------------------------------------------------------------------------------
-- Today's defaults: the old rules and the new give the same answers

-- 20261114000100_team_changes.sql's private.gives_role, with the actor's own
-- check of the time folded in (an active owner or manager): whom someone in
-- `giver`'s role acts on, before this migration.
create function pg_temp.old_gives(giver public.member_role, r public.member_role)
returns boolean language sql immutable as $$
  select coalesce(
    giver in ('owner', 'manager')
      and r is not null
      and (giver = 'owner' or r in ('manager', 'worker')),
    false
  )
$$;

set local role service_role;
select pg_temp.apply('today');
reset role;
select is_empty(
  $$select m.user_id::text, r.role::text
    from public.memberships m
    cross join unnest(enum_range(null::public.member_role)) as r (role)
    where m.business_id = '97000000-0000-4000-b000-000000000001' and m.active
      and (
        pg_temp.old_gives(m.role, r.role) is distinct from (
          private.holds_perm(m.business_id, m.user_id, 'team.edit')
          and private.gives_role(m.role, r.role)
        )
        or (private.role_rank(m.role) >= 2)
          is distinct from private.holds_perm(m.business_id, m.user_id, 'team.view')
      )
    union all
    select 'a view', r.role::text
    from unnest(enum_range(null::public.member_role)) as r (role)
    where (private.role_rank(r.role) >= 2) is distinct from (
      r.role = 'owner'
      or private.role_holds('97000000-0000-4000-b000-000000000001', r.role, 'team.view')
    )$$,
  'on today''s defaults every member acts on the same roles as before and sees the team as before, and so does a view as each role'
);

-- The rank rule alone: an owner gives every role, anyone else a role of the
-- staff other than owner at or below their own, and an accountant none.
select set_eq(
  $$select g.giver::text, string_agg(r.role::text, ',' order by r.role)
    from unnest(enum_range(null::public.member_role)) as g (giver)
    cross join unnest(enum_range(null::public.member_role)) as r (role)
    where private.gives_role(g.giver, r.role)
    group by g.giver$$,
  $$values
    ('owner', 'owner,manager,worker,accountant'),
    ('manager', 'manager,worker'),
    ('worker', 'worker')$$,
  'the rank rule is the one rule by role left: an owner gives every role, a manager managers and workers, a worker workers, an accountant nobody'
);

------------------------------------------------------------------------------
-- The phone: a lowered manager's line is skipped at the next send

set local role service_role;
select pg_temp.apply('mnone');
select count(*) from public.claim_due_pushes(200, now());
reset role;
select is(
  (select string_agg(p.label || ':' || n.push_state, ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.dedupe_key = 'team.joined:' || pg_temp.p('joiner')),
  'manager:skipped,owner:sending,senior:none',
  'a push queued for a line its reader no longer reads is skipped, and the owner''s goes'
);

------------------------------------------------------------------------------
-- A worker raised to edit the team: the rank rule on others' invites and lines

-- Workers edit the team, and the owner invites someone as a manager. The
-- worker sends no link for that invite, cancels it not and changes it not
-- (each 42501, the rank rule's, before anything of pay), where until now the
-- matrix only met invites to workers.
set local role service_role;
select pg_temp.apply('edit');
select public.set_own_profile(pg_temp.p('books'), '{"bio": "Books here"}');
insert into ids values ('lead', public.team_invite(pg_temp.p('owner'),
  '97000000-0000-4000-b000-000000000001', '+972500970031', 'Lead', 'manager', repeat('2', 64)));
select is(
  pg_temp.refusal(format(
    'select public.team_invite_link(%L::uuid, %L::uuid, %L)',
    pg_temp.p('worker'), pg_temp.id('lead'), repeat('a', 64)))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.team_invite_cancel(%L::uuid, %L::uuid, %L::timestamptz)',
    pg_temp.p('worker'), pg_temp.id('lead'), '2026-12-01 10:00+00'))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('worker'), '97000000-0000-4000-b000-000000000001', '+972500970031', 'Lead',
    'worker', repeat('b', 64))),
  '42501 42501 42501',
  'a worker who edits the team sends no link for, cancels no and changes no invite to a manager'
);

-- An accountant reads at a worker's rank and keeps one line in every
-- business they serve: the worker who edits the team doesn't clear it, and a
-- manager and the owner, above it, do.
select is(
  pg_temp.refusal(format(
    'select public.clear_profile_bio(%L::uuid, %L::uuid, %L::uuid, %L)',
    pg_temp.p('worker'), '97000000-0000-4000-b000-000000000001', pg_temp.p('books'), 'Books here'))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.clear_profile_bio(%L::uuid, %L::uuid, %L::uuid, %L)',
    pg_temp.p('manager'), '97000000-0000-4000-b000-000000000001', pg_temp.p('books'), 'Books here'))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.clear_profile_bio(%L::uuid, %L::uuid, %L::uuid, %L)',
    pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001', pg_temp.p('books'), 'Books here')),
  '42501 lives lives',
  'a worker who edits the team clears no accountant''s line, which a manager and the owner do'
);
reset role;

------------------------------------------------------------------------------
-- Pay is the owner's to give

-- Workers edit the team, and the manager invites someone as a manager
-- ('second') while managers hold no pay. Then the owner gives managers pay
-- by a row. Nobody but an owner gives the manager's role then: not by
-- inviting a manager, making someone one or a fresh link for the owner's
-- invite of one (each 42501 with the hint the screen says), where until now
-- a manager could. A worker's role goes, and the owner gives either.
set local role service_role;
select pg_temp.apply('edit');
insert into ids values ('second', public.team_invite(pg_temp.p('manager'),
  '97000000-0000-4000-b000-000000000001', '+972500970014', 'Second', 'manager', repeat('0', 64)));
select public.set_role_permission(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
  'manager', 'clock.payroll', true);
select is(
  pg_temp.refusal(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '97000000-0000-4000-b000-000000000001', '+972500970032', 'New',
    'manager', repeat('3', 64)))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, at_time => %L)',
    pg_temp.p('manager'), '97000000-0000-4000-b000-000000000001', pg_temp.p('target'),
    'manager', '2026-12-01 10:00+00'))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.team_invite_link(%L::uuid, %L::uuid, %L)',
    pg_temp.p('manager'), pg_temp.id('lead'), repeat('4', 64)))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '97000000-0000-4000-b000-000000000001', '+972500970033', 'New',
    'worker', repeat('6', 64)))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001', '+972500970034', 'New',
    'manager', repeat('8', 64)))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, at_time => %L)',
    pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001', pg_temp.p('target'),
    'manager', '2026-12-01 10:00+00')),
  '42501/pay 42501/pay 42501/pay lives lives lives',
  'where managers hold pay by a row, a manager gives nobody the manager''s role, by an invite, a change of role or a fresh link, and the owner does'
);

-- The manager's invite sent before managers held pay isn't claimed now, and
-- its link reads as expired; once the owner sends it again, or the team from
-- the console (viewing as the owner, so on the team), it is theirs and is
-- claimed. Each tried and undone, so the same invite and person serve all.
select is(
  pg_temp.refusal(format(
    'select public.claim_invite(%L, %L::uuid)', repeat('0', 64), pg_temp.p('second')))
  || ' ' ||
  (public.invite_by_token(repeat('0', 64)) ->> 'status')
  || ' ' ||
  pg_temp.probe(
    format('select public.team_invite_link(%L::uuid, %L::uuid, %L)',
      pg_temp.p('owner'), pg_temp.id('second'), repeat('c', 64)),
    format('select pg_temp.attempt(%L)', format(
      'select public.claim_invite(%L, %L::uuid)', repeat('c', 64), pg_temp.p('second'))))
  || ' ' ||
  pg_temp.probe(
    format('select public.issue_invite_link(%L::uuid, %L::uuid, %L)',
      pg_temp.p('view as owner'), pg_temp.id('second'), repeat('c', 64)),
    format('select pg_temp.attempt(%L)', format(
      'select public.claim_invite(%L, %L::uuid)', repeat('c', 64), pg_temp.p('second')))),
  'P0002 expired lives lives',
  'an invite a manager sent to the manager''s role before it held pay passes no pay on: it is claimed only once an owner or the team sends it again'
);

-- Workers given pay too: a worker who edits the team and a manager invite no
-- worker any more, and the owner does.
select public.set_role_permission(pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001',
  'worker', 'clock.payroll', true);
select is(
  pg_temp.refusal(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('worker'), '97000000-0000-4000-b000-000000000001', '+972500970035', 'New',
    'worker', repeat('9', 64)))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '97000000-0000-4000-b000-000000000001', '+972500970035', 'New',
    'worker', repeat('9', 64)))
  || ' ' ||
  pg_temp.refusal(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('owner'), '97000000-0000-4000-b000-000000000001', '+972500970035', 'New',
    'worker', repeat('9', 64))),
  '42501/pay 42501/pay lives',
  'where workers hold pay by a row, nobody but an owner invites a worker'
);
reset role;

------------------------------------------------------------------------------
-- The clock's lines are R4's

-- This migration replaces private.notify_for after the clock's phase (R4),
-- and keeps its clock: hours without a code go to those who edit the clock,
-- whatever their role, as lines for clock.edit. With workers raised to it and
-- managers lowered from it, the worker the others act on clocks in without a
-- code: the owner and the other workers hear, the managers don't. The rows
-- are written as the database's own, the punch code turned on so a punch
-- without one waits for confirming.
update public.business_modules m
set settings = m.settings || '{"requirePunchCode": true}'::jsonb
where m.business_id = '97000000-0000-4000-b000-000000000001' and m.module_key = 'time_clock';
insert into public.role_permissions (business_id, role, perm, allowed)
values
  ('97000000-0000-4000-b000-000000000001', 'worker', 'clock.edit', true),
  ('97000000-0000-4000-b000-000000000001', 'manager', 'clock.edit', false)
on conflict (business_id, role, perm) do update set allowed = excluded.allowed;
set local role service_role;
insert into ids values ('shift', public.clock_in(pg_temp.p('target'),
  '97000000-0000-4000-b000-000000000001', null, '2026-12-01 06:00+00', null, true));
reset role;
select is(
  (select string_agg(p.label || ':' || n.audience_role || ':' || coalesce(n.audience_perm, 'none'),
       ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.kind = 'clock.confirm' and n.dedupe_key = 'clock.confirm:' || pg_temp.id('shift')),
  'joiner:manager:clock.edit,minor:manager:clock.edit,owner:manager:clock.edit,worker:manager:clock.edit',
  'hours without a code still go to those who edit the clock, as lines for clock.edit: a worker raised to it hears, a manager lowered from it doesn''t'
);

------------------------------------------------------------------------------
-- How it is built

select is(
  (select string_agg(k.key, ',' order by k.key) from public.permission_keys k
   where k.settable and k.area = 'team'),
  'team.edit,team.view',
  'the team is open for changes per role, both its keys'
);

-- The lines written before this migration moved to their key: none of the
-- kind is left for a rank alone.
select is(
  (select count(*)::integer from public.notifications n
   where n.kind = 'team.joined' and n.audience_perm is distinct from 'team.view'),
  0,
  'every line about someone joining is for team.view, those written before the migration too'
);

select is(
  (select string_agg(p.policyname, ',' order by p.policyname) from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'invites'),
  'the team''s viewers read its invites',
  'the invites have one read policy, for members and views alike'
);

select ok(
  not has_function_privilege('authenticated', 'private.role_holds_pay(uuid, public.member_role)', 'execute')
  and not has_function_privilege('anon', 'private.role_holds_pay(uuid, public.member_role)', 'execute')
  and not has_function_privilege('authenticated', 'private.gives_role(public.member_role, public.member_role)', 'execute')
  and has_function_privilege('authenticated', 'public.team_phones(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.team_phones(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.team_youth(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.team_youth(uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.team_invite(uuid, uuid, text, text, public.member_role, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.team_invite_link(uuid, uuid, text)', 'execute')
  and not has_function_privilege('authenticated',
    'public.set_member_role(uuid, uuid, uuid, public.member_role, public.member_role, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.remove_member(uuid, uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.team_invite_cancel(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.clear_profile_bio(uuid, uuid, uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.team_invite(uuid, uuid, text, text, public.member_role, text)', 'execute')
  and has_function_privilege('service_role', 'public.clear_profile_bio(uuid, uuid, uuid, text)', 'execute')
  and (select p.prosecdef and exists (
         select 1 from unnest(p.proconfig) as c (setting)
         where c.setting in ('search_path=""', 'search_path=')
       )
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'private' and p.proname = 'role_holds_pay'),
  'the new helper runs as its owner with an empty search path and nobody else calls it; the team''s writes are the secret key''s and its reads the signed-in''s'
);

select * from finish();
rollback;
