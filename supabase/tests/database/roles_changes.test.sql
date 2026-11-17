-- Roles and permissions by module, R10 (20261115001700_roles_changes.sql):
-- when a role's rule changes, its people hear it in the app alone. A change
-- tells exactly the active people whose rule it changed: for a built-in role
-- those in it with no named role and those in a named role on it with no
-- rule of its own for the key; for a named role, those holding it. Never an
-- owner, the actor, an accountant, someone who left or the team; never on a
-- phone, whoever has one. One line a person, a role and an area, from where
-- it began to now: an immediate undo leaves none, a second change updates
-- it, one already read (or settled) stays as it was while the next change
-- starts its own, one that ends where it began goes, and a change that moves
-- nothing the role holds tells nobody. A demo business's people get theirs
-- in the app; with notifications off nobody does. Fixed ids (c4…) and numbers
-- (050-084-xxxx), so nothing here meets the seed or another test.
begin;
select plan(28);

-- C: 1 owner, 2 manager, 3 worker, 4 a second worker, 5 accountant, 6 a
-- manager in the named role "Deputy" (on managers), 7 a worker in "Bar
-- lead" (on workers), 8 on the ConceptApp team, 9 a worker who left. D, a
-- demo: 10 its owner, 11 its worker.
insert into auth.users (id, aud, role, phone)
select
  ('c4000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250084' || lpad(n::text, 4, '0')
from generate_series(1, 11) as n;

insert into public.businesses (id, slug, name)
values
  ('c4000000-0000-4000-b000-000000000001', 'rc-one', 'Roles Changes'),
  ('c4000000-0000-4000-b000-000000000002', 'rc-demo', 'Roles Changes Demo');
insert into private.demo_businesses (business_id, definition)
values ('c4000000-0000-4000-b000-000000000002', '{"slug": "rc-demo"}');

insert into public.memberships (business_id, user_id, role, active)
values
  ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000001', 'owner', true),
  ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000002', 'manager', true),
  ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000003', 'worker', true),
  ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000004', 'worker', true),
  ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000005', 'accountant', true),
  ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000006', 'manager', true),
  ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000007', 'worker', true),
  ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000009', 'worker', false),
  ('c4000000-0000-4000-b000-000000000002', 'c4000000-0000-4000-a000-000000000010', 'owner', true),
  ('c4000000-0000-4000-b000-000000000002', 'c4000000-0000-4000-a000-000000000011', 'worker', true);

insert into public.platform_staff (user_id, role)
values ('c4000000-0000-4000-a000-000000000008', 'onboarder');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('c4000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('c4000000-0000-4000-b000-000000000001', 'scheduling', true, '{}'),
  ('c4000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('c4000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('c4000000-0000-4000-b000-000000000002', 'notifications', true, '{}'),
  ('c4000000-0000-4000-b000-000000000002', 'scheduling', true, '{}');

-- Phones for the manager, the workers, the two in named roles and the
-- demo's worker: every line would be queued for them, unless it is in the
-- app alone.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select ('c4000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'https://fcm.googleapis.com/fcm/send/rc-' || n::text,
  md5('rc-a-' || n::text) || md5('rc-b-' || n::text),
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from unnest('{2,3,4,6,7,11}'::int[]) as n;

create temporary table people (label text primary key, id uuid) on commit drop;
insert into people (label, id)
values
  ('owner', 'c4000000-0000-4000-a000-000000000001'),
  ('manager', 'c4000000-0000-4000-a000-000000000002'),
  ('worker', 'c4000000-0000-4000-a000-000000000003'),
  ('colleague', 'c4000000-0000-4000-a000-000000000004'),
  ('accountant', 'c4000000-0000-4000-a000-000000000005'),
  ('deputy', 'c4000000-0000-4000-a000-000000000006'),
  ('barlead', 'c4000000-0000-4000-a000-000000000007'),
  ('team', 'c4000000-0000-4000-a000-000000000008'),
  ('left', 'c4000000-0000-4000-a000-000000000009'),
  ('demo owner', 'c4000000-0000-4000-a000-000000000010'),
  ('demo worker', 'c4000000-0000-4000-a000-000000000011');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on people, ids to authenticated, service_role;

create function pg_temp.p(who text) returns uuid language sql as $$
  select p.id from people p where p.label = who
$$;

create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- The role lines in C of an area (or every area), each as
-- `person:role/area`, marked `+read` once read and `+kept` once out of the
-- way of the next (its dedupe key cleared).
create function pg_temp.lines(of_area text default null) returns text language sql as $$
  select coalesce(
    string_agg(x.line, ',' order by x.line collate "C"),
    'none'
  )
  from (
    select p.label || ':'
      || coalesce((select i.name from ids i where i.id::text = n.params ->> 'role'), n.params ->> 'role')
      || '/' || (n.params ->> 'area')
      || case when n.read_at is not null then '+read' else '' end
      || case when n.dedupe_key is null then '+kept' else '' end as line
    from public.notifications n
    join people p on p.id = n.user_id
    where n.business_id = 'c4000000-0000-4000-b000-000000000001'
      and n.kind = 'role.changed'
      and (of_area is null or n.params ->> 'area' = of_area)
  ) x
$$;

-- What a person's live line about a role's area says it went from and to.
create function pg_temp.said(who text, of_area text) returns text language sql as $$
  select (n.params -> 'from')::text || ' > ' || (n.params -> 'to')::text
  from public.notifications n
  where n.user_id = pg_temp.p(who)
    and n.kind = 'role.changed'
    and n.dedupe_key is not null
    and n.params ->> 'area' = of_area
$$;

-- The owner, as the roles screen writes for them.
create function pg_temp.set_rule(
  r public.member_role, perm_key text, granted boolean, named uuid default null,
  actor uuid default 'c4000000-0000-4000-a000-000000000001'
) returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform public.set_role_permission(actor, 'c4000000-0000-4000-b000-000000000001',
    r, perm_key, granted, named);
  perform set_config('role', 'none', true);
end;
$$;

-- The business's two named roles, as an owner adds them: from their bases,
-- so with no rule of their own, following them everywhere.
set local role service_role;
insert into ids (name, id)
values
  ('deputy-role', public.create_business_role('c4000000-0000-4000-a000-000000000001',
    'c4000000-0000-4000-b000-000000000001', 'manager', 'Deputy')),
  ('bar-role', public.create_business_role('c4000000-0000-4000-a000-000000000001',
    'c4000000-0000-4000-b000-000000000001', 'worker', 'Bar lead'));
reset role;
update public.memberships m
set named_role = pg_temp.id('deputy-role')
where m.user_id = pg_temp.p('deputy');
update public.memberships m
set named_role = pg_temp.id('bar-role')
where m.user_id = pg_temp.p('barlead');

------------------------------------------------------------------------------
-- The functions and the catalogue

select ok(
  not has_function_privilege('authenticated', 'private.area_rules(uuid, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.area_rules(uuid, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.area_holds(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.notify_role_change(public.audit_log)', 'execute')
  and not has_function_privilege('anon', 'private.notify_role_change(public.audit_log)', 'execute')
  and not has_function_privilege('authenticated', 'private.notify_roles_from_log()', 'execute')
  and not has_function_privilege('authenticated', 'private.notification_kind_groups()', 'execute'),
  'a role''s line is written inside the database alone'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname || '.' || p.proname in (
       'private.area_rules', 'private.area_holds', 'private.notify_role_change',
       'private.notify_roles_from_log'
     )
     and p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  4,
  'each runs as its owner with an empty search path'
);
select is(
  (select t.tgenabled <> 'D'
     and pg_get_triggerdef(t.oid) like '%AFTER INSERT ON public.audit_log FOR EACH ROW%'
     and pg_get_triggerdef(t.oid) like '%''role.permission''%'
     and pg_get_triggerdef(t.oid) like '%private.notify_roles_from_log()%'
   from pg_trigger t
   where t.tgname = 'audit_log_notifies_roles' and t.tgrelid = 'public.audit_log'::regclass),
  true,
  'the log tells a role''s people of each role.permission row, on a trigger of its own'
);
select is_empty(
  $$select k.key from public.permission_keys k
    join public.permission_keys q on q.key = k.requires
    where k.settable and (q.area <> k.area or not q.settable)$$,
  'every key owners switch requires only a key owners switch in its own area, so an area''s rules decide what it holds there'
);
select is(
  private.area_holds('{"schedule.edit": false, "schedule.publish": true}'::jsonb)::text
    || ' ' || private.area_holds('{"team.view": true, "team.edit": true}'::jsonb)::text,
  '{"schedule.edit": false, "schedule.publish": false} {"team.edit": true, "team.view": true}',
  'a key is held while its rule gives it and nothing it requires is denied'
);
select ok(
  private.notification_group('role.changed') is null
    and exists (
      select 1 from private.notification_kind_groups() g
      where g.kind_key = 'role.changed' and g.group_key is null
    ),
  'the line is in no group: nothing of it reaches a phone to keep off'
);

------------------------------------------------------------------------------
-- A change, and who hears it

-- The owner lowers managers to view in scheduling.
select pg_temp.set_rule('manager', 'schedule.edit', false);

select is(
  pg_temp.lines(),
  'deputy:deputy-role/scheduling,manager:manager/scheduling',
  'managers hear it, and the deputy, whose role follows managers there; nobody else'
);
select is(
  (select n.params from public.notifications n
   where n.user_id = pg_temp.p('manager') and n.kind = 'role.changed'),
  '{"role": "manager", "area": "scheduling", "from": {"schedule.edit": true, "schedule.publish": true}, "to": {"schedule.edit": false, "schedule.publish": false}}'::jsonb,
  'the line holds the role, the area, and what it held there before and now: publishing goes with building'
);
select is(
  (select (n.params - 'role')::text || ' ' || (n.params ->> 'role' = pg_temp.id('deputy-role')::text)::text
   from public.notifications n
   where n.user_id = pg_temp.p('deputy') and n.kind = 'role.changed'),
  '{"to": {"schedule.edit": false, "schedule.publish": false}, "area": "scheduling", "from": {"schedule.edit": true, "schedule.publish": true}, "name": "Deputy"} true',
  'the deputy''s names their own role, by its id and its name'
);
select is(
  (select string_agg(distinct n.source_module::text || '/' || n.audience_role::text || '/'
     || (n.actor_id = pg_temp.p('owner'))::text || '/' || n.push_state || '/'
     || coalesce(n.push_after::text, 'never') || '/' || (n.read_at is null)::text, ',')
   from public.notifications n where n.kind = 'role.changed'),
  'scheduling/worker/true/none/never/true',
  'about scheduling, from the owner, unread, and never for the phone, though both have one'
);
select is(
  (select count(*)::int
   from public.claim_due_pushes(200, now() + interval '1 hour') c
   join public.notifications n on n.id = c.notification
   where n.kind = 'role.changed'),
  0,
  'and the next send takes none of them'
);

select pg_temp.sign_in(pg_temp.p('manager'));
insert into ids (name, id)
select 'manager reads', n.id from public.notifications n where n.kind = 'role.changed';
reset role;
select pg_temp.sign_in(pg_temp.p('owner'));
insert into ids (name, id)
select 'owner reads', n.id from public.notifications n where n.kind = 'role.changed';
reset role;
select is(
  (select string_agg(i.name, ',' order by i.name) from ids i where i.name like '% reads'),
  'manager reads',
  'the manager reads their line in their own session, and the owner none'
);

-- "ביטול" right after: the rule back, and no line left.
select pg_temp.set_rule('manager', 'schedule.edit', true);
select is(pg_temp.lines(), 'none', 'an immediate undo leaves no line');

------------------------------------------------------------------------------
-- A second change, a line read, and back where it began

-- Publishing off, then building too: one line each, from where it began.
select pg_temp.set_rule('manager', 'schedule.publish', false);
select is(
  pg_temp.said('manager', 'scheduling'),
  '{"schedule.edit": true, "schedule.publish": true} > {"schedule.edit": true, "schedule.publish": false}',
  'a switch alone is told too'
);
select pg_temp.set_rule('manager', 'schedule.edit', false);
select is(
  pg_temp.lines() || ' | ' || pg_temp.said('manager', 'scheduling'),
  'deputy:deputy-role/scheduling,manager:manager/scheduling | '
    || '{"schedule.edit": true, "schedule.publish": true} > {"schedule.edit": false, "schedule.publish": false}',
  'a second change updates the line, still from where it began'
);

-- The manager reads theirs; building comes back.
update public.notifications n
set read_at = now()
where n.user_id = pg_temp.p('manager') and n.kind = 'role.changed';
select pg_temp.set_rule('manager', 'schedule.edit', true);
select is(
  pg_temp.lines() || ' | ' || pg_temp.said('manager', 'scheduling') || ' | '
    || pg_temp.said('deputy', 'scheduling'),
  'deputy:deputy-role/scheduling,manager:manager/scheduling,manager:manager/scheduling+read+kept | '
    || '{"schedule.edit": false, "schedule.publish": false} > {"schedule.edit": true, "schedule.publish": false} | '
    || '{"schedule.edit": true, "schedule.publish": true} > {"schedule.edit": true, "schedule.publish": false}',
  'a line read stays as it was and the change starts its own, while an unread one goes on'
);

-- Publishing back too: the deputy, who never read theirs, is back where
-- they began; the manager has news since what they read.
select pg_temp.set_rule('manager', 'schedule.publish', true);
select is(
  pg_temp.lines() || ' | ' || pg_temp.said('manager', 'scheduling'),
  'manager:manager/scheduling,manager:manager/scheduling+read+kept | '
    || '{"schedule.edit": false, "schedule.publish": false} > {"schedule.edit": true, "schedule.publish": true}',
  'a line back where it began goes, unread; the one read stays'
);

------------------------------------------------------------------------------
-- A named role, and its base

-- The owner lets "Bar lead" run the lists.
select pg_temp.set_rule('worker', 'lists.manage', true, pg_temp.id('bar-role'));
select is(
  pg_temp.lines('lists') || ' | ' || pg_temp.said('barlead', 'lists'),
  'barlead:bar-role/lists | '
    || '{"lists.fix": false, "lists.send": false, "lists.manage": false} > {"lists.fix": true, "lists.send": false, "lists.manage": true}',
  'a named role''s change tells those who hold it, never the role it is built on (fixing closed lists comes with running them)'
);

-- Then workers, sending included, in one write. "Bar lead" read theirs
-- first, so the write starts a new line for it, from just before the row
-- that tells it: told of running too, which it has its own rule for, the
-- line would start from before running, and say so.
update public.notifications n
set read_at = now()
where n.user_id = pg_temp.p('barlead') and n.kind = 'role.changed'
  and n.params ->> 'area' = 'lists';
set local role service_role;
select public.set_role_permissions('c4000000-0000-4000-a000-000000000001',
  'c4000000-0000-4000-b000-000000000001', 'worker',
  '{lists.manage,lists.send}'::text[], '{true,true}'::boolean[]);
reset role;
select is(
  pg_temp.lines('lists') || ' | ' || pg_temp.said('barlead', 'lists') || ' | '
    || pg_temp.said('worker', 'lists'),
  'barlead:bar-role/lists,barlead:bar-role/lists+read+kept,colleague:worker/lists,worker:worker/lists | '
    || '{"lists.fix": true, "lists.send": false, "lists.manage": true} > {"lists.fix": true, "lists.send": true, "lists.manage": true} | '
    || '{"lists.fix": false, "lists.send": false, "lists.manage": false} > {"lists.fix": true, "lists.send": true, "lists.manage": true}',
  'workers hear their change once; "Bar lead", with its own rule to run them, hears only the sending it follows workers in'
);

------------------------------------------------------------------------------
-- From the console, and the actor

select pg_temp.set_rule('manager', 'clock.edit', false, null, pg_temp.p('team'));
select is(
  (select string_agg(p.label || ':' || (n.actor_id = pg_temp.p('team'))::text
     || ':' || n.source_module::text, ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.kind = 'role.changed' and n.params ->> 'area' = 'time_clock'),
  'deputy:true:time_clock,manager:true:time_clock',
  'a change from the console is told the same, from the ConceptApp team'
);

-- A change whose actor is in the role (written straight to the log here: no
-- setter lets a manager change a role): everyone in it but them.
insert into public.role_permissions (business_id, role, perm, allowed, granted_by)
values ('c4000000-0000-4000-b000-000000000001', 'manager', 'lists.send', false,
  'c4000000-0000-4000-a000-000000000001');
insert into public.audit_log (business_id, actor_id, action, details)
values ('c4000000-0000-4000-b000-000000000001', 'c4000000-0000-4000-a000-000000000002',
  'role.permission',
  '{"role": "manager", "perm": "lists.send", "area": "lists", "from": true, "to": false}');
select is(
  pg_temp.lines('lists'),
  'barlead:bar-role/lists,barlead:bar-role/lists+read+kept,colleague:worker/lists,deputy:deputy-role/lists,worker:worker/lists',
  'never whoever changed it'
);

select is(
  (select count(*)::int from public.notifications n join people p on p.id = n.user_id
   where n.kind = 'role.changed' and p.label in ('owner', 'accountant', 'left', 'team')),
  0,
  'never an owner, an accountant, someone who left or the team'
);

------------------------------------------------------------------------------
-- A demo business, and notifications off

set local role service_role;
select public.set_role_permission('c4000000-0000-4000-a000-000000000010',
  'c4000000-0000-4000-b000-000000000002', 'worker', 'schedule.edit', true);
reset role;
select is(
  (select string_agg(p.label || ':' || n.push_state, ',')
   from public.notifications n join people p on p.id = n.user_id
   where n.business_id = 'c4000000-0000-4000-b000-000000000002' and n.kind = 'role.changed'),
  'demo worker:none',
  'a demo business''s people hear it in the app, as every demo line'
);

update public.business_modules bm
set enabled = false
where bm.business_id = 'c4000000-0000-4000-b000-000000000001'
  and bm.module_key = 'notifications';
select pg_temp.set_rule('worker', 'clock.edit', true);
select is(pg_temp.lines('time_clock'), 'deputy:deputy-role/time_clock,manager:manager/time_clock',
  'with notifications off nobody is told');
update public.business_modules bm
set enabled = true
where bm.business_id = 'c4000000-0000-4000-b000-000000000001'
  and bm.module_key = 'notifications';

------------------------------------------------------------------------------
-- Nothing the role holds, and a line settled

-- Managers lowered to view in scheduling again: the manager's unread line
-- (from view) is back where it began and goes; the deputy, with none, gets
-- one, and reads it. Then publishing off, which managers no longer hold for
-- want of building: the rule changes, and nobody hears of it.
select pg_temp.set_rule('manager', 'schedule.edit', false);
update public.notifications n
set read_at = now()
where n.user_id in (pg_temp.p('manager'), pg_temp.p('deputy'))
  and n.kind = 'role.changed' and n.params ->> 'area' = 'scheduling'
  and n.read_at is null;
select pg_temp.set_rule('manager', 'schedule.publish', false);
select is(
  pg_temp.lines('scheduling') || ' | '
    || (select count(*) from public.audit_log a
        where a.business_id = 'c4000000-0000-4000-b000-000000000001'
          and a.action = 'role.permission'
          and a.details @> '{"role": "manager", "perm": "schedule.publish", "to": false}')::text,
  'deputy:deputy-role/scheduling+read,manager:manager/scheduling+read+kept | 2',
  'a change that moves nothing the role holds is logged and tells nobody: no line, and a read one left as it was'
);
-- Managers' scheduling back on its defaults, building first.
select pg_temp.set_rule('manager', 'schedule.edit', true);
select pg_temp.set_rule('manager', 'schedule.publish', true);

-- The manager's line about the clock settled, though unread; the clock comes
-- back to managers. The deputy's unread one is back where it began and goes;
-- the manager's settled one stays as it was, and the change starts its own.
update public.notifications n
set resolved_at = now()
where n.user_id = pg_temp.p('manager') and n.kind = 'role.changed'
  and n.params ->> 'area' = 'time_clock';
select pg_temp.set_rule('manager', 'clock.edit', true);
select is(
  pg_temp.lines('time_clock') || ' | ' || pg_temp.said('manager', 'time_clock'),
  'manager:manager/time_clock,manager:manager/time_clock+kept | '
    || '{"clock.edit": false} > {"clock.edit": true}',
  'a line settled stays as it was, as one read, and the next change starts its own'
);

select is(
  (select string_agg(distinct n.push_state || '/' || coalesce(n.push_after::text, 'never'), ',')
   from public.notifications n where n.kind = 'role.changed'),
  'none/never',
  'and no line of a role''s was ever for a phone'
);
select is(
  (select count(*)::int from public.role_permissions rp
   where rp.business_id = 'c4000000-0000-4000-b000-000000000001'
     and rp.role = 'manager' and rp.perm like 'schedule.%'),
  0,
  'the rules themselves are as the changes left them: managers'' scheduling back on its default'
);

select * from finish();
rollback;
