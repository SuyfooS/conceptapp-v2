-- Roles and permissions by module, R5 (20261115001200_roles_lists.sql):
-- lists by their permissions. One matrix, driven by VALUES, over five states
-- the owner sets through public.set_role_permission: today's defaults,
-- workers raised to lists edit with sending ('raised') and without it
-- ('raised, no send'), managers keeping edit without sending ('no send') and
-- managers lowered to view ('lowered'). In each, for the owner, a manager, a
-- worker, the accountant, a worker given lists.manage of their own and one
-- given lists.send, and through views as a worker, a manager and an
-- accountant: what they read (every template, the templates' times, every
-- list, a list's photo, and their lines about a list still late and a
-- reading out of its range, written on today's defaults); whether saving,
-- archiving and restoring a template, its next openings, sending a list and
-- cancelling someone else's send live or are refused. Who is told of a list
-- still late and of a reading out of range follows who runs the lists, and a
-- change of role settles such a line only when the new role doesn't run
-- them; a line written to a manager before managers were lowered is no
-- longer read and its push is skipped. R7's handover (critique 4): the
-- management page's edit alone no longer saves, archives or restores a
-- template or reads its openings, and the ConceptApp team still does.
-- Sending needs running the lists (a role isn't given lists.send without
-- lists.manage); personal grants hold as before; on today's defaults who
-- runs, sends and sees each list is who did before, for every membership;
-- the demo's lists are sent by someone who may send them; with workers set
-- above managers, a manager gives nobody a role that holds what they don't;
-- a list of a template's times with nobody there to take it goes to the
-- managers while they run the lists, else to the owners. Every write passes
-- its moment, so nothing depends on today's date. Fixed ids (98…), so
-- nothing here depends on the seed.
begin;
select plan(17);

-- 1 owner, 2 manager, 3 the worker the matrix follows (in no department), 4
-- a worker in the kitchen, 5 the accountant, 6 a worker given lists.manage,
-- 7 a worker given lists.send; 8, 9 and 10 on the ConceptApp team, viewing
-- as a worker, a manager and an accountant, 11 on the team viewing nothing;
-- 12, 13 and 14 the owner, manager and worker of a demo business.
insert into auth.users (id, aud, role, phone)
select
  ('98000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250098' || lpad(n::text, 4, '0')
from generate_series(1, 14) as n;

create temporary table people (label text primary key, id uuid not null) on commit drop;
insert into people values
  ('owner', '98000000-0000-4000-a000-000000000001'),
  ('manager', '98000000-0000-4000-a000-000000000002'),
  ('worker', '98000000-0000-4000-a000-000000000003'),
  ('kitchen', '98000000-0000-4000-a000-000000000004'),
  ('accountant', '98000000-0000-4000-a000-000000000005'),
  ('personal', '98000000-0000-4000-a000-000000000006'),
  ('sender', '98000000-0000-4000-a000-000000000007'),
  ('view as worker', '98000000-0000-4000-a000-000000000008'),
  ('view as manager', '98000000-0000-4000-a000-000000000009'),
  ('view as accountant', '98000000-0000-4000-a000-000000000010'),
  ('team', '98000000-0000-4000-a000-000000000011'),
  ('demo owner', '98000000-0000-4000-a000-000000000012'),
  ('demo manager', '98000000-0000-4000-a000-000000000013'),
  ('demo worker', '98000000-0000-4000-a000-000000000014');
grant select on people to authenticated, service_role;

insert into public.businesses (id, slug, name)
values
  ('98000000-0000-4000-b000-000000000001', 'rls-lists', 'Roles Lists'),
  ('98000000-0000-4000-b000-000000000002', 'rls-lists-demo', 'Roles Lists Demo');

insert into public.memberships (business_id, user_id, role, perms)
values
  ('98000000-0000-4000-b000-000000000001', '98000000-0000-4000-a000-000000000001', 'owner', '{}'),
  ('98000000-0000-4000-b000-000000000001', '98000000-0000-4000-a000-000000000002', 'manager', '{}'),
  ('98000000-0000-4000-b000-000000000001', '98000000-0000-4000-a000-000000000003', 'worker', '{}'),
  ('98000000-0000-4000-b000-000000000001', '98000000-0000-4000-a000-000000000004', 'worker', '{}'),
  ('98000000-0000-4000-b000-000000000001', '98000000-0000-4000-a000-000000000005', 'accountant', '{}'),
  ('98000000-0000-4000-b000-000000000001', '98000000-0000-4000-a000-000000000006', 'worker', '{lists.manage}'),
  ('98000000-0000-4000-b000-000000000001', '98000000-0000-4000-a000-000000000007', 'worker', '{lists.send}'),
  ('98000000-0000-4000-b000-000000000002', '98000000-0000-4000-a000-000000000012', 'owner', '{}'),
  ('98000000-0000-4000-b000-000000000002', '98000000-0000-4000-a000-000000000013', 'manager', '{}'),
  ('98000000-0000-4000-b000-000000000002', '98000000-0000-4000-a000-000000000014', 'worker', '{}');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('98000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('98000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('98000000-0000-4000-b000-000000000002', 'lists', true, '{}');

-- The demo business as its reset reads it: its people, the manager first.
insert into private.demo_businesses (business_id, definition)
values (
  '98000000-0000-4000-b000-000000000002',
  '{"slug": "rls-lists-demo", "people": [
     {"user_id": "98000000-0000-4000-a000-000000000013"},
     {"user_id": "98000000-0000-4000-a000-000000000014"},
     {"user_id": "98000000-0000-4000-a000-000000000012"}]}'
);

insert into public.platform_staff (user_id, role)
values
  ('98000000-0000-4000-a000-000000000008', 'onboarder'),
  ('98000000-0000-4000-a000-000000000009', 'onboarder'),
  ('98000000-0000-4000-a000-000000000010', 'onboarder'),
  ('98000000-0000-4000-a000-000000000011', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('98000000-0000-4000-a000-000000000008', '98000000-0000-4000-b000-000000000001', 'worker'),
  ('98000000-0000-4000-a000-000000000009', '98000000-0000-4000-b000-000000000001', 'manager'),
  ('98000000-0000-4000-a000-000000000010', '98000000-0000-4000-b000-000000000001', 'accountant');

-- The owner's and the manager's phones, so the lines for them are queued.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select p.id, 'https://fcm.googleapis.com/rls-' || p.label, repeat('f', 63) || n::text,
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

-- The lines the setup writes, which the probes below leave out.
create temporary table kept (key text primary key) on commit drop;
grant all on kept to authenticated, service_role;

-- What a call does: 'lives', or the code it is refused with. Undone either
-- way, so each state starts from the same lists.
create function pg_temp.attempt(call text) returns text language plpgsql as $$
declare
  outcome text;
begin
  begin
    execute call;
    outcome := 'lives';
    raise exception 'tried' using errcode = 'P0001', hint = 'rls-tried';
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
    raise exception 'tried' using errcode = 'P0001', hint = 'rls-tried';
  exception when others then
    null;
  end;
  return outcome;
end;
$$;

-- What a call is refused with: its code, hint and detail.
create function pg_temp.refusal(call text) returns text language plpgsql as $$
declare
  got_code text;
  got_hint text;
  got_detail text;
begin
  execute call;
  return 'none';
exception when others then
  get stacked diagnostics
    got_code = returned_sqlstate, got_hint = pg_exception_hint, got_detail = pg_exception_detail;
  return concat_ws(' ', got_code, nullif(got_hint, ''), nullif(got_detail, ''));
end;
$$;

-- The state the owner sets: back to the defaults (managers run and send the
-- lists, workers neither), then the state's own switches, a key always after
-- what it requires.
create function pg_temp.apply(state text) returns void language plpgsql as $$
begin
  perform public.set_role_permissions(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
    'worker', '{lists.send,lists.manage}', '{false,false}');
  perform public.set_role_permissions(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
    'manager', '{lists.manage,lists.send}', '{true,true}');
  if state = 'raised' then
    perform public.set_role_permissions(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
      'worker', '{lists.manage,lists.send}', '{true,true}');
  elsif state = 'raised, no send' then
    perform public.set_role_permission(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
      'worker', 'lists.manage', true);
  elsif state = 'no send' then
    perform public.set_role_permission(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
      'manager', 'lists.send', false);
  elsif state = 'lowered' then
    perform public.set_role_permission(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
      'manager', 'lists.manage', false);
  end if;
end;
$$;

-- What the signed-in person reads of the business: its templates, archived
-- ones included, their times, its lists, the list photos, and their lines
-- about a list still late and a reading out of its range.
create function pg_temp.reads()
returns table (templates integer, times integer, lists integer, photos integer, late integer, readings integer)
language sql as $$
  select
    (select count(t.id)::integer from public.list_templates t
     where t.business_id = '98000000-0000-4000-b000-000000000001'),
    (select count(s.id)::integer from public.list_schedules s
     where s.business_id = '98000000-0000-4000-b000-000000000001'),
    (select count(l.id)::integer from public.lists l
     where l.business_id = '98000000-0000-4000-b000-000000000001'),
    (select count(o.id)::integer from storage.objects o
     where o.bucket_id = 'list-photos' and o.name like '98000000-%'),
    (select count(n.id)::integer from public.notifications n
     where n.business_id = '98000000-0000-4000-b000-000000000001' and n.kind = 'lists.late_team'),
    (select count(n.id)::integer from public.notifications n
     where n.business_id = '98000000-0000-4000-b000-000000000001' and n.kind = 'lists.out_of_range')
$$;

-- Saving a new template, archiving the closing list's, restoring the old
-- one, the opening list's next openings, sending a list typed now to the
-- kitchen's worker and cancelling the list the owner sent the worker, by the
-- owner, the manager, the worker and the two given a key of their own.
create function pg_temp.writes()
returns table (who text, saves text, archives text, restores text, openings text, sends text, cancels text)
language sql as $$
  select p.label,
    pg_temp.attempt(format(
      'select public.save_list_template(%L::uuid, %L::uuid, %L::jsonb)',
      p.id, '98000000-0000-4000-b000-000000000001',
      '{"name": "Fixture", "items": [{"kind": "check", "label": "A"}]}')),
    pg_temp.attempt(format('select public.archive_list_template(%L::uuid, %L::uuid)',
      p.id, pg_temp.id('closing'))),
    pg_temp.attempt(format('select public.restore_list_template(%L::uuid, %L::uuid)',
      p.id, pg_temp.id('old'))),
    pg_temp.attempt(format(
      'select public.next_list_openings(%L::uuid, %L::uuid, %L::timestamptz)',
      p.id, pg_temp.id('opening'), '2026-12-01 09:00+00')),
    pg_temp.attempt(format(
      'select public.send_list(%L::uuid, %L::uuid, %L::jsonb, %L::timestamptz)',
      p.id, '98000000-0000-4000-b000-000000000001',
      jsonb_build_object('name', 'Typed', 'items', '[{"kind": "check", "label": "T"}]'::jsonb,
        'recipient', jsonb_build_object('kind', 'person', 'user', pg_temp.p('kitchen'))),
      '2026-12-01 09:00+00')),
    pg_temp.attempt(format('select public.cancel_list(%L::uuid, %L::uuid, %L::timestamptz)',
      p.id, pg_temp.id('mine'), '2026-12-01 09:00+00'))
  from people p
  where p.label in ('owner', 'manager', 'worker', 'personal', 'sender')
$$;

-- Who has a line of this kind about something new (not the setup's), each
-- with what the line is for: its permission, else its rank.
create function pg_temp.lines(what text) returns text language sql as $$
  select coalesce(
    string_agg(p.label || '/' || coalesce(n.audience_perm, n.audience_role::text), ',' order by p.label),
    '')
  from public.notifications n
  join people p on p.id = n.user_id
  where n.business_id = '98000000-0000-4000-b000-000000000001'
    and n.kind = what
    and n.dedupe_key not in (select k.key from kept k)
$$;

-- A new list from the opening template to the kitchen, due at 08:00 on 2
-- December and still open at 08:16, late (private.lists_tick, as the minute
-- job runs it).
create function pg_temp.late_list() returns void language plpgsql as $$
begin
  perform public.send_list(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id('opening'),
      'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.id('kitchen dept')),
      'dueAt', '2026-12-02T08:00:00Z'),
    '2026-12-02 06:00+00');
  perform private.lists_tick('2026-12-02 08:16+00', '98000000-0000-4000-b000-000000000001');
end;
$$;

-- A new list from the opening template to the kitchen, whose worker reads
-- the fridge outside its range.
create function pg_temp.out_of_range() returns void language plpgsql as $$
declare
  sent uuid;
begin
  sent := public.send_list(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id('opening'),
      'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.id('kitchen dept'))),
    '2026-12-02 06:00+00');
  perform public.set_list_item(pg_temp.p('kitchen'),
    (select i.id from public.list_items i where i.list_id = sent and i.label = 'Fridge'),
    '{"reading": 9}'::jsonb, '2026-12-02 06:30+00');
end;
$$;

-- Who hears of a list still late and of a reading out of its range, and how
-- the manager's line about the setup's late list stands once they are made a
-- worker. Run as the database's own: private.lists_tick isn't the secret
-- key's.
create function pg_temp.told()
returns table (late text, readings text, demoted text)
language sql as $$
  select
    pg_temp.probe('select pg_temp.late_list()', $q$select pg_temp.lines('lists.late_team')$q$),
    pg_temp.probe('select pg_temp.out_of_range()', $q$select pg_temp.lines('lists.out_of_range')$q$),
    pg_temp.probe(
      format('select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, at_time => %L)',
        pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001', pg_temp.p('manager'),
        'worker', '2026-12-01 15:00+00'),
      format($q$select (n.read_at is not null)::text || '/' || n.push_state
        from public.notifications n
        where n.user_id = %L and n.dedupe_key = %L$q$,
        pg_temp.p('manager'), 'list.late_team:' || pg_temp.id('opening list')))
$$;

create temporary table seen (
  state text, who text, templates integer, times integer, lists integer, photos integer,
  late integer, readings integer
) on commit drop;
create temporary table acts (
  state text, who text, saves text, archives text, restores text, openings text, sends text,
  cancels text
) on commit drop;
create temporary table heard (state text, late text, readings text, demoted text) on commit drop;
grant all on seen, acts, heard to authenticated, service_role;

------------------------------------------------------------------------------
-- The lists, on today's defaults: the kitchen and its worker; the opening
-- list's template (a check, a fridge's reading from 0 to 5 and a photo, to
-- the kitchen, with a time switched off), the closing list's and an old one,
-- archived; the opening list sent to the kitchen, due at 08:00 on 1
-- December, a list to the worker and one to the managers, all by the owner;
-- the kitchen's photo of its shelf; the opening list late at 08:16, and the
-- fridge read at 7 at 08:20.

select public.set_departments(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}]');
insert into ids
select 'kitchen dept', d.id from public.departments d
where d.business_id = '98000000-0000-4000-b000-000000000001';
select public.set_department_members(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  pg_temp.id('kitchen dept'), array[pg_temp.p('kitchen')]);

insert into ids
select 'opening', (public.save_list_template(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Opening',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.id('kitchen dept')),
    'items', '[{"kind": "check", "label": "Door"},
      {"kind": "number", "label": "Fridge", "unit": "C", "min": 0, "max": 5},
      {"kind": "photo", "label": "Shelf"}]'::jsonb,
    'schedules', jsonb_build_array(jsonb_build_object('days', '[2]'::jsonb,
      'opensOffset', 480, 'dueOffset', 540,
      'recipient', '{"kind": "role", "role": "worker"}'::jsonb, 'active', false)))) ->> 'id')::uuid;
insert into ids
select 'closing', (public.save_list_template(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  '{"name": "Closing", "recipient": {"kind": "role", "role": "worker"},
    "items": [{"kind": "check", "label": "Lights"}]}'::jsonb) ->> 'id')::uuid;
insert into ids
select 'old', (public.save_list_template(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  '{"name": "Old", "items": [{"kind": "check", "label": "X"}]}'::jsonb) ->> 'id')::uuid;
select public.archive_list_template(pg_temp.p('owner'), pg_temp.id('old'));

insert into ids
select 'opening list', public.send_list(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  jsonb_build_object('template', pg_temp.id('opening'),
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.id('kitchen dept')),
    'dueAt', '2026-12-01T08:00:00Z'),
  '2026-12-01 06:00+00');
insert into ids
select 'mine', public.send_list(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Mine', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'recipient', jsonb_build_object('kind', 'person', 'user', pg_temp.p('worker'))),
  '2026-12-01 06:00+00');
insert into ids
select 'managers', public.send_list(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  '{"name": "Managers", "items": [{"kind": "check", "label": "B"}],
    "recipient": {"kind": "role", "role": "manager"}}'::jsonb,
  '2026-12-01 06:00+00');
insert into ids
select 'fridge', i.id from public.list_items i
where i.list_id = pg_temp.id('opening list') and i.label = 'Fridge';

select public.set_list_item_photo(pg_temp.p('kitchen'),
  (select i.id from public.list_items i where i.list_id = pg_temp.id('opening list') and i.label = 'Shelf'),
  '98000000-0000-4000-b000-000000000001/' || pg_temp.id('opening list') || '/rls-shelf.webp',
  '2026-12-01 07:00+00');
set local role service_role;
insert into storage.objects (bucket_id, name)
values ('list-photos',
  '98000000-0000-4000-b000-000000000001/' || pg_temp.id('opening list') || '/rls-shelf.webp');
reset role;

select private.lists_tick('2026-12-01 08:16+00', '98000000-0000-4000-b000-000000000001');
select public.set_list_item(pg_temp.p('kitchen'), pg_temp.id('fridge'), '{"reading": 7}'::jsonb,
  '2026-12-01 08:20+00');
insert into kept values
  ('list.late_team:' || pg_temp.id('opening list')),
  ('list.range:' || pg_temp.id('fridge'));

select is(
  (select string_agg(n.kind || ':' || p.label || ':' || n.push_state || ':' || n.audience_role || ':'
       || coalesce(n.audience_perm, 'none'), ',' order by n.kind, p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.dedupe_key in (select k.key from kept k)),
  'lists.late_team:manager:queued:worker:lists.manage,lists.late_team:owner:queued:worker:lists.manage,'
    || 'lists.late_team:personal:none:worker:lists.manage,'
    || 'lists.out_of_range:manager:queued:worker:lists.manage,lists.out_of_range:owner:queued:worker:lists.manage,'
    || 'lists.out_of_range:personal:none:worker:lists.manage',
  'a list still late and a reading out of range are told to those who run the lists, as lines for those who hold lists.manage'
);

------------------------------------------------------------------------------
-- Today's rules, frozen

-- As 20261109000600_lists.sql wrote them: an active owner or manager, or a
-- member given lists.manage; for sending, given lists.manage or lists.send;
-- and the active owners, managers and members given lists.manage.
create function pg_temp.old_can_manage_lists(business uuid, person uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (m.role in ('owner', 'manager') or 'lists.manage' = any (m.perms))
  )
$$;
create function pg_temp.old_can_send_lists(business uuid, person uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (
        m.role in ('owner', 'manager')
        or m.perms && '{lists.manage,lists.send}'::text[]
      )
  )
$$;
create function pg_temp.old_list_managers(business uuid) returns uuid[]
language sql stable as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[])
  from public.memberships m
  where m.business_id = business
    and m.active
    and (m.role in ('owner', 'manager') or 'lists.manage' = any (m.perms))
$$;
-- As 20261110000300_payroll_access.sql wrote it.
create function pg_temp.old_sees_list(list uuid, person uuid) returns boolean
language sql stable as $$
  select exists (
    select 1
    from public.lists l
    join public.memberships m
      on m.business_id = l.business_id and m.user_id = person and m.active
      and private.is_staff_role(m.role)
    where l.id = list
      and (
        m.role in ('owner', 'manager')
        or 'lists.manage' = any (m.perms)
        or l.sent_by = person
        or private.holds_list(l.id, person)
        or exists (
          select 1 from public.list_people p
          where p.list_id = l.id and p.user_id = person
        )
        or exists (
          select 1 from public.department_members dm
          where dm.user_id = person and dm.department_id = l.from_department
        )
        or exists (
          select 1
          from public.list_passes lp
          join public.department_members dm
            on dm.user_id = person
            and dm.department_id in (lp.from_department, lp.to_department)
          where lp.list_id = l.id
        )
      )
  )
$$;

-- Every membership and business in the database, the seed's included, and
-- the two given a key of their own.
select is_empty(
  $$select m.business_id, m.user_id, 'runs' as what
    from public.memberships m
    where pg_temp.old_can_manage_lists(m.business_id, m.user_id)
      is distinct from private.can_manage_lists(m.business_id, m.user_id)
    union all
    select m.business_id, m.user_id, 'sends'
    from public.memberships m
    where pg_temp.old_can_send_lists(m.business_id, m.user_id)
      is distinct from private.can_send_lists(m.business_id, m.user_id)
    union all
    select b.id, null::uuid, 'told'
    from public.businesses b
    where pg_temp.old_list_managers(b.id) is distinct from private.list_managers(b.id)$$,
  'on today''s defaults, who runs the lists, who sends them and who is told is who was before, for every membership, a personal grant included'
);
select is_empty(
  $$select l.id, m.user_id
    from public.lists l
    join public.memberships m on m.business_id = l.business_id
    where pg_temp.old_sees_list(l.id, m.user_id) is distinct from private.sees_list(l.id, m.user_id)$$,
  'and who sees each list is who did before, for every list and member'
);

------------------------------------------------------------------------------
-- The matrix

create function pg_temp.run(state text) returns void language plpgsql as $$
declare
  who text;
begin
  perform set_config('role', 'service_role', true);
  perform pg_temp.apply(state);
  insert into acts select state, w.* from pg_temp.writes() w;
  perform set_config('role', 'none', true);
  insert into heard select state, t.* from pg_temp.told() t;
  foreach who in array array['owner', 'manager', 'worker', 'accountant', 'personal', 'sender',
    'view as worker', 'view as manager', 'view as accountant']
  loop
    perform pg_temp.sign_in(pg_temp.p(who));
    insert into seen select state, who, r.* from pg_temp.reads() r;
    perform set_config('role', 'none', true);
  end loop;
end;
$$;

select pg_temp.run('today');
select pg_temp.run('raised');
select pg_temp.run('raised, no send');
select pg_temp.run('no send');
select pg_temp.run('lowered');
reset role;

-- Reads: the live templates for the staff and a view of them (view is the
-- floor), and the archived one, the opening list's time, every list and the
-- shelf's photo for those who run the lists, members and views alike; the
-- lists someone holds (the worker's own, the managers' by their role) at
-- every level; the lines where they were written, while their reader still
-- runs the lists. Sending changes no read.
select set_eq(
  'select * from seen',
  $$values
    ('today', 'owner', 3, 1, 3, 1, 1, 1),
    ('today', 'manager', 3, 1, 3, 1, 1, 1),
    ('today', 'worker', 2, 0, 1, 0, 0, 0),
    ('today', 'accountant', 0, 0, 0, 0, 0, 0),
    ('today', 'personal', 3, 1, 3, 1, 1, 1),
    ('today', 'sender', 2, 0, 0, 0, 0, 0),
    ('today', 'view as worker', 2, 0, 0, 0, 0, 0),
    ('today', 'view as manager', 3, 1, 3, 1, 0, 0),
    ('today', 'view as accountant', 0, 0, 0, 0, 0, 0),
    ('raised', 'owner', 3, 1, 3, 1, 1, 1),
    ('raised', 'manager', 3, 1, 3, 1, 1, 1),
    ('raised', 'worker', 3, 1, 3, 1, 0, 0),
    ('raised', 'accountant', 0, 0, 0, 0, 0, 0),
    ('raised', 'personal', 3, 1, 3, 1, 1, 1),
    ('raised', 'sender', 3, 1, 3, 1, 0, 0),
    ('raised', 'view as worker', 3, 1, 3, 1, 0, 0),
    ('raised', 'view as manager', 3, 1, 3, 1, 0, 0),
    ('raised', 'view as accountant', 0, 0, 0, 0, 0, 0),
    ('raised, no send', 'owner', 3, 1, 3, 1, 1, 1),
    ('raised, no send', 'manager', 3, 1, 3, 1, 1, 1),
    ('raised, no send', 'worker', 3, 1, 3, 1, 0, 0),
    ('raised, no send', 'accountant', 0, 0, 0, 0, 0, 0),
    ('raised, no send', 'personal', 3, 1, 3, 1, 1, 1),
    ('raised, no send', 'sender', 3, 1, 3, 1, 0, 0),
    ('raised, no send', 'view as worker', 3, 1, 3, 1, 0, 0),
    ('raised, no send', 'view as manager', 3, 1, 3, 1, 0, 0),
    ('raised, no send', 'view as accountant', 0, 0, 0, 0, 0, 0),
    ('no send', 'owner', 3, 1, 3, 1, 1, 1),
    ('no send', 'manager', 3, 1, 3, 1, 1, 1),
    ('no send', 'worker', 2, 0, 1, 0, 0, 0),
    ('no send', 'accountant', 0, 0, 0, 0, 0, 0),
    ('no send', 'personal', 3, 1, 3, 1, 1, 1),
    ('no send', 'sender', 2, 0, 0, 0, 0, 0),
    ('no send', 'view as worker', 2, 0, 0, 0, 0, 0),
    ('no send', 'view as manager', 3, 1, 3, 1, 0, 0),
    ('no send', 'view as accountant', 0, 0, 0, 0, 0, 0),
    ('lowered', 'owner', 3, 1, 3, 1, 1, 1),
    ('lowered', 'manager', 2, 0, 1, 0, 0, 0),
    ('lowered', 'worker', 2, 0, 1, 0, 0, 0),
    ('lowered', 'accountant', 0, 0, 0, 0, 0, 0),
    ('lowered', 'personal', 3, 1, 3, 1, 1, 1),
    ('lowered', 'sender', 2, 0, 0, 0, 0, 0),
    ('lowered', 'view as worker', 2, 0, 0, 0, 0, 0),
    ('lowered', 'view as manager', 2, 0, 0, 0, 0, 0),
    ('lowered', 'view as accountant', 0, 0, 0, 0, 0, 0)$$,
  'every template, the templates'' times, every list and its photos are read by those who run the lists, members and views alike, the lists one holds always, and a lowered manager no longer reads the lines written before'
);

-- Writes: the templates, their openings and cancelling another's send follow
-- lists.manage, sending lists.send, which a role holds only while it runs
-- the lists; a key given to a person holds as before, and lists.manage of
-- one's own sends too.
select set_eq(
  'select * from acts',
  $$values
    ('today', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('today', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('today', 'worker', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('today', 'personal', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('today', 'sender', '42501', '42501', '42501', '42501', 'lives', '42501'),
    ('raised', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised', 'worker', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised', 'personal', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised', 'sender', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised, no send', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised, no send', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised, no send', 'worker', 'lives', 'lives', 'lives', 'lives', '42501', 'lives'),
    ('raised, no send', 'personal', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('raised, no send', 'sender', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('no send', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('no send', 'manager', 'lives', 'lives', 'lives', 'lives', '42501', 'lives'),
    ('no send', 'worker', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('no send', 'personal', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('no send', 'sender', '42501', '42501', '42501', '42501', 'lives', '42501'),
    ('lowered', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('lowered', 'manager', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('lowered', 'worker', '42501', '42501', '42501', '42501', '42501', '42501'),
    ('lowered', 'personal', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives'),
    ('lowered', 'sender', '42501', '42501', '42501', '42501', 'lives', '42501')$$,
  'templates, their openings and cancelling another''s send follow lists.manage, sending follows lists.send under it, personal grants hold as before, and today''s rules are unchanged'
);

-- Notices: a list still late and a reading out of range to those who run the
-- lists but those who hold it and whoever read it, as lines for
-- lists.manage; the manager made a worker keeps their line only where
-- workers run the lists.
select set_eq(
  'select * from heard',
  $$values
    ('today', 'manager/lists.manage,owner/lists.manage,personal/lists.manage',
      'manager/lists.manage,owner/lists.manage,personal/lists.manage', 'true/skipped'),
    ('raised',
      'manager/lists.manage,owner/lists.manage,personal/lists.manage,sender/lists.manage,worker/lists.manage',
      'manager/lists.manage,owner/lists.manage,personal/lists.manage,sender/lists.manage,worker/lists.manage',
      'false/queued'),
    ('raised, no send',
      'manager/lists.manage,owner/lists.manage,personal/lists.manage,sender/lists.manage,worker/lists.manage',
      'manager/lists.manage,owner/lists.manage,personal/lists.manage,sender/lists.manage,worker/lists.manage',
      'false/queued'),
    ('no send', 'manager/lists.manage,owner/lists.manage,personal/lists.manage',
      'manager/lists.manage,owner/lists.manage,personal/lists.manage', 'true/skipped'),
    ('lowered', 'owner/lists.manage,personal/lists.manage',
      'owner/lists.manage,personal/lists.manage', 'true/skipped')$$,
  'lists.late_team and lists.out_of_range go to those who run the lists, and a change of role settles such a line only for one who no longer runs them'
);

-- The phone: the lowered manager's line is skipped at the next send, the
-- owner's goes, and the one without a phone has none to send.
set local role service_role;
select count(*) from public.claim_due_pushes(200, now());
reset role;
select is(
  (select string_agg(p.label || ':' || n.push_state, ',' order by p.label)
   from public.notifications n join people p on p.id = n.user_id
   where n.dedupe_key = 'list.late_team:' || pg_temp.id('opening list')),
  'manager:skipped,owner:sending,personal:none',
  'a push queued for a line its reader no longer reads is skipped, and the rest go'
);

------------------------------------------------------------------------------
-- R7's handover: the management page's edit alone, and the team

-- Workers given the management page's view and edit, but not lists.manage:
-- the worker saves, archives and restores no template and reads no
-- openings; the ConceptApp team, in no business, does all four.
set local role service_role;
select pg_temp.apply('today');
select public.set_role_permissions(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  'worker', '{manage.view,manage.edit}', '{true,true}');
select is(
  (select string_agg(x.outcome, ' ' order by x.n)
   from (
     select w.n, pg_temp.attempt(format(w.sql_text, p.id)) as outcome
     from (values
       (1, 'worker', 'select public.save_list_template(%L::uuid, ''98000000-0000-4000-b000-000000000001''::uuid, ''{"name": "Fixture", "items": [{"kind": "check", "label": "A"}]}''::jsonb)'),
       (2, 'worker', 'select public.archive_list_template(%L::uuid, pg_temp.id(''closing''))'),
       (3, 'worker', 'select public.restore_list_template(%L::uuid, pg_temp.id(''old''))'),
       (4, 'worker', 'select public.next_list_openings(%L::uuid, pg_temp.id(''opening''), ''2026-12-01 09:00+00''::timestamptz)'),
       (5, 'team', 'select public.save_list_template(%L::uuid, ''98000000-0000-4000-b000-000000000001''::uuid, ''{"name": "Fixture", "items": [{"kind": "check", "label": "A"}]}''::jsonb)'),
       (6, 'team', 'select public.archive_list_template(%L::uuid, pg_temp.id(''closing''))'),
       (7, 'team', 'select public.restore_list_template(%L::uuid, pg_temp.id(''old''))'),
       (8, 'team', 'select public.next_list_openings(%L::uuid, pg_temp.id(''opening''), ''2026-12-01 09:00+00''::timestamptz)')
     ) as w (n, who, sql_text)
     join people p on p.label = w.who
   ) x),
  '42501 42501 42501 42501 lives lives lives lives',
  'the management page''s edit alone no longer saves, archives or restores a list''s template or reads its openings (critique 4), and the ConceptApp team still does'
);
select public.set_role_permissions(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  'worker', '{manage.edit,manage.view}', '{false,false}');
reset role;

------------------------------------------------------------------------------
-- Sending under running

set local role service_role;
select is(
  pg_temp.refusal($$select public.set_role_permission(pg_temp.p('owner'),
    '98000000-0000-4000-b000-000000000001', 'worker', 'lists.send', true)$$),
  '22023 requires lists.manage',
  'sending is a switch under running the lists: a role that doesn''t run them isn''t given it'
);
reset role;

------------------------------------------------------------------------------
-- Giving a role, with workers set above managers

-- The owner makes the sender a manager; a manager then makes them a worker
-- again.
create function pg_temp.manager_demotes() returns void language plpgsql as $$
begin
  perform public.set_member_role(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
    pg_temp.p('sender'), 'manager', at_time => '2026-12-01 15:00+00');
  perform public.set_member_role(pg_temp.p('manager'), '98000000-0000-4000-b000-000000000001',
    pg_temp.p('sender'), 'worker', at_time => '2026-12-01 15:00+00');
end;
$$;

-- Workers run the lists and managers don't: a manager gives nobody a role
-- that does, by a change of role or an invite, and inviting a manager goes.
set local role service_role;
select pg_temp.apply('raised');
select public.set_role_permission(pg_temp.p('owner'), '98000000-0000-4000-b000-000000000001',
  'manager', 'lists.manage', false);
select is(
  pg_temp.attempt('select pg_temp.manager_demotes()')
  || ' ' ||
  pg_temp.attempt(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '98000000-0000-4000-b000-000000000001', '+972500980091', 'New',
    'worker', repeat('d', 64)))
  || ' ' ||
  pg_temp.attempt(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L)',
    pg_temp.p('manager'), '98000000-0000-4000-b000-000000000001', '+972500980092', 'New',
    'manager', repeat('e', 64))),
  '42501 42501 lives',
  'with workers set above managers on the lists, a manager gives nobody a role that runs them'
);
select pg_temp.apply('today');
reset role;

------------------------------------------------------------------------------
-- A time with nobody there to take it

-- The closing list on Wednesdays at 07:00, an hour, for a worker who has
-- left (15), as the minute job opens it at 07:01 on 2 December: to the
-- managers on today's defaults, as before, with their line; once managers
-- are lowered, to the owners, with theirs, and the lowered manager neither
-- holds it nor reads it.
insert into auth.users (id, aud, role, phone)
values ('98000000-0000-4000-a000-000000000015', 'authenticated', 'authenticated', '972500980015');
insert into public.memberships (business_id, user_id, role, active)
values ('98000000-0000-4000-b000-000000000001', '98000000-0000-4000-a000-000000000015', 'worker', false);
insert into public.list_schedules (
  template_id, business_id, days, opens_offset, due_offset, recipient_kind, recipient_user,
  starts_on, opens_from
)
values (
  pg_temp.id('closing'), '98000000-0000-4000-b000-000000000001', '{3}', 420, 480, 'person',
  '98000000-0000-4000-a000-000000000015', '2026-11-01', '2026-11-01 00:00+00'
);

create function pg_temp.nobody_there(state text) returns void language plpgsql as $$
begin
  perform pg_temp.apply(state);
  perform private.lists_tick_business('98000000-0000-4000-b000-000000000001', '2026-12-02 05:01+00');
end;
$$;

-- Whom the list opened for, who holds it, who has its line, and whether the
-- manager reads it.
create function pg_temp.nobody_there_look() returns text language sql as $$
  select l.recipient_kind || '|' || l.recipient_role::text
    || '|' || coalesce((select string_agg(p.label, ',' order by p.label)
         from people p where p.id = any (private.list_holders(l.id))), 'nobody')
    || '|' || coalesce((select string_agg(p.label, ',' order by p.label)
         from public.notifications n join people p on p.id = n.user_id
         where n.kind = 'lists.sent' and n.dedupe_key = 'list:' || l.id), 'nobody')
    || '|' || private.sees_list(l.id, pg_temp.p('manager'))::text
  from public.lists l
  join public.list_schedules ls on ls.id = l.schedule_id
  where ls.recipient_user = '98000000-0000-4000-a000-000000000015'
$$;

select is(
  pg_temp.probe($$select pg_temp.nobody_there('today')$$, 'select pg_temp.nobody_there_look()')
  || ' ; ' ||
  pg_temp.probe($$select pg_temp.nobody_there('lowered')$$, 'select pg_temp.nobody_there_look()'),
  'role|manager|manager|manager|true ; role|owner|owner|owner|false',
  'a list of a template''s times with nobody there goes to the managers while they run the lists, else to the owners, and never to a manager lowered'
);

------------------------------------------------------------------------------
-- The demo's example lists

-- A template of the demo business, and its example lists as its reset sends
-- them; and the same with the demo's managers lowered on the lists first.
select public.save_list_template(pg_temp.p('demo owner'), '98000000-0000-4000-b000-000000000002',
  '{"name": "Demo opening", "recipient": {"kind": "role", "role": "worker"},
    "items": [{"kind": "check", "label": "Open"}, {"kind": "check", "label": "Lights"}]}'::jsonb);
create function pg_temp.demo_lists_lowered() returns void language plpgsql as $$
begin
  perform public.set_role_permission(pg_temp.p('demo owner'), '98000000-0000-4000-b000-000000000002',
    'manager', 'lists.manage', false);
  perform private.seed_demo_lists('98000000-0000-4000-b000-000000000002');
end;
$$;

select is(
  pg_temp.probe($$select private.seed_demo_lists('98000000-0000-4000-b000-000000000002')$$,
    $q$select coalesce(string_agg(distinct p.label, ','), 'nobody')
      from public.lists l join people p on p.id = l.sent_by
      where l.business_id = '98000000-0000-4000-b000-000000000002'$q$)
  || ' | ' ||
  pg_temp.probe('select pg_temp.demo_lists_lowered()',
    $q$select coalesce(string_agg(distinct p.label, ','), 'nobody')
      from public.lists l join people p on p.id = l.sent_by
      where l.business_id = '98000000-0000-4000-b000-000000000002'$q$),
  'demo manager | demo owner',
  'the demo''s lists are sent by its manager while managers may send them, else by its owner'
);

------------------------------------------------------------------------------
-- How it is built

-- The lines written before this migration moved to the key: none of the two
-- kinds is left for a rank alone.
select is(
  (select count(*)::integer from public.notifications n
   where n.kind in ('lists.late_team', 'lists.out_of_range')
     and n.audience_perm is distinct from 'lists.manage'),
  0,
  'every line of a list still late and of a reading out of range is for lists.manage, those written before the migration too'
);

select ok(
  (select count(*) = 3
     and bool_and(strpos(p.qual, 'businesses_holding(''lists.manage''') > 0
       and strpos(p.qual, 'is_viewing(') = 0
       and strpos(p.qual, 'can_manage_lists') = 0)
   from pg_policies p
   where (p.schemaname, p.tablename, p.policyname) in (
     ('public', 'list_templates', 'members read their business''s list templates'),
     ('public', 'list_schedules', 'list managers read the schedules'),
     ('public', 'lists', 'people read the lists they see')
   )),
  'every template, the templates'' times and every list ask lists.manage once per query, by no role'
);

select ok(
  (select strpos(p.prosrc, 'businesses_holding(''lists.manage''') > 0
     and strpos(p.prosrc, 'is_viewing(') = 0
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'private' and p.proname = 'can_read_list_photo')
  and (select strpos(p.prosrc, 'can_edit_settings') = 0
     and strpos(p.prosrc, 'platform_staff') > 0
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'save_list_template'),
  'a list''s photos follow the same rule for a view (critique 5), and a template''s writers name the team, not the management page'
);

select is(
  (select string_agg(k.key || ':' || k.settable::text || ':' || coalesce(k.requires, 'none'), ','
     order by k.key)
   from public.permission_keys k where k.area = 'lists'),
  'lists.fix:true:none,lists.manage:true:none,lists.send:true:lists.manage',
  'lists are open for changes per role, sending under running them, and fixing a closed list (L6b-2) under nothing'
);

select ok(
  has_function_privilege('authenticated', 'private.can_manage_lists(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.sees_list(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.can_read_list_photo(text)', 'execute')
  and not has_function_privilege('anon', 'private.can_manage_lists(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.sees_list(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.can_read_list_photo(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.can_send_lists(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.list_managers(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_lists(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.notify_for_lists(public.audit_log)', 'execute')
  and not has_function_privilege('authenticated', 'public.save_list_template(uuid, uuid, jsonb, integer)', 'execute')
  and not has_function_privilege('anon', 'public.archive_list_template(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.restore_list_template(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.next_list_openings(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.save_list_template(uuid, uuid, jsonb, integer)', 'execute')
  and has_function_privilege('service_role', 'public.archive_list_template(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.restore_list_template(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.next_list_openings(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'private.lists_tick_business(uuid, timestamptz)', 'execute')
  and (select count(*)::int from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname || '.' || p.proname in (
           'private.can_manage_lists', 'private.can_send_lists', 'private.list_managers',
           'private.sees_list', 'private.seed_demo_lists', 'private.can_read_list_photo',
           'private.notify_for_lists', 'public.save_list_template', 'public.archive_list_template',
           'public.restore_list_template', 'public.next_list_openings',
           'private.lists_tick_business'
         )
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 12,
  'the replaced functions run as their owner with an empty search path, the policies'' helpers for a signed-in reader and the rest for the server alone'
);

select * from finish();
rollback;
