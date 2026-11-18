-- Roles and permissions by module, R11d (20261115001900_named_roles_lists.sql):
-- lists sent to a role a business named. A list to a named role is for
-- exactly the people holding it, active and on the staff, and only they are
-- told; a list to its base still reaches everyone in the base, those in a
-- role named on it among them, as before; the log names the role. Sending
-- to, and keeping on a template or a time, a role of another business, an
-- archived one or one on another base is refused, by the functions and by
-- the tables whoever writes them. The minute job opens a time's list to its
-- named role, and to nobody there (the managers) once the role was archived
-- under a restored template. Passing a list to a department leaves its
-- named role behind. A role a live template or a time of one goes to can't
-- be archived (55000, hint 'lists', the count), after its people (hint
-- 'held'); an archived template never holds it back. Someone moved off a
-- named role has the line of its list settled and off the phone, and keeps
-- the rest. Today's lists, with no named role, are as they were. Each write
-- is its own statement and what it wrote is read in the next. Fixed ids
-- (d4…), numbers (050-087-xxxx) and dates (the times start on 1 November,
-- whatever today is), so nothing here meets the seed or another test, or
-- the real clock.
begin;
select plan(18);

-- 1 owner, 2 manager, 3 worker (shift lead), 4 worker (in the kitchen),
-- 5 worker (bar lead), 6 manager (floor manager), 8 accountant and 9 a
-- shift lead who left, of A; 7 owner of B.
insert into auth.users (id, aud, role, phone)
select
  ('d4000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250087' || lpad(n::text, 4, '0')
from generate_series(1, 9) as n;

insert into public.businesses (id, slug, name)
values
  ('d4000000-0000-4000-b000-000000000001', 'rnl-one', 'Roles Named Lists'),
  ('d4000000-0000-4000-b000-000000000002', 'rnl-two', 'Roles Named Lists Elsewhere');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('d4000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('d4000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('d4000000-0000-4000-b000-000000000002', 'lists', true, '{}');

insert into public.memberships (business_id, user_id, role, perms)
values
  ('d4000000-0000-4000-b000-000000000001', 'd4000000-0000-4000-a000-000000000001', 'owner', '{}'),
  ('d4000000-0000-4000-b000-000000000002', 'd4000000-0000-4000-a000-000000000007', 'owner', '{}');

create temporary table ids (name text primary key, id uuid) on commit drop;

create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('d4000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- Business A.
create function pg_temp.a() returns uuid language sql as $$
  select 'd4000000-0000-4000-b000-000000000001'::uuid
$$;

-- What a call is refused with: its code and hint, and its detail; none when
-- it goes through (and its writes stay).
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

-- A recipient "to a role": `r`, or the named role labelled `named` on it.
create function pg_temp.to_role(r text, named text default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'kind', 'role', 'role', r, 'namedRole', pg_temp.id(named)))
$$;

-- The owner sends a list typed now to `recipient`, at noon on 1 December.
create function pg_temp.send(recipient jsonb) returns uuid language sql as $$
  select public.send_list(pg_temp.p(1), pg_temp.a(), jsonb_build_object(
    'name', 'Check', 'items', '[{"kind": "check", "label": "Done"}]'::jsonb,
    'recipient', recipient), '2026-12-01 10:00+00')
$$;

-- The same, as a call whose refusal is read.
create function pg_temp.send_call(recipient jsonb) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.send_list(%L::uuid, %L::uuid, %L::jsonb, %L::timestamptz)',
    pg_temp.p(1), pg_temp.a(), jsonb_build_object(
      'name', 'Check', 'items', '[{"kind": "check", "label": "Done"}]'::jsonb,
      'recipient', recipient), '2026-12-01 10:00+00'))
$$;

-- People by their number, in order: those among `people`.
create function pg_temp.who(people uuid[]) returns text language sql as $$
  select coalesce(string_agg(n::text, ',' order by n), 'nobody')
  from generate_series(1, 9) as n
  where pg_temp.p(n) = any (people)
$$;

-- Whom a list is for (private.list_holders), whom private.holds_list says
-- holds it, and who has its "sent" line.
create function pg_temp.reach(list uuid) returns text language sql as $$
  select pg_temp.who(private.list_holders(list))
    || ' / ' || pg_temp.who(array(
      select pg_temp.p(n) from generate_series(1, 9) as n
      where private.holds_list(list, pg_temp.p(n))))
    || ' / ' || pg_temp.who(array(
      select x.user_id from public.notifications x
      where x.kind = 'lists.sent' and x.dedupe_key = 'list:' || list))
$$;

-- What a row of a list, a template or a time is addressed to: its kind, its
-- role and its named role, by its label here.
create function pg_temp.label(named uuid) returns text language sql as $$
  select coalesce((select i.name from ids i where i.id = named), 'none')
$$;
create function pg_temp.addressed(list uuid) returns text language sql as $$
  select l.recipient_kind || '/' || coalesce(l.recipient_role::text, 'none')
    || '/' || pg_temp.label(l.recipient_named_role)
  from public.lists l where l.id = list
$$;
create function pg_temp.template_to(template uuid) returns text language sql as $$
  select coalesce(t.recipient_kind, 'none') || '/' || coalesce(t.recipient_role::text, 'none')
    || '/' || pg_temp.label(t.recipient_named_role)
  from public.list_templates t where t.id = template
$$;
create function pg_temp.times_to(template uuid) returns text language sql as $$
  select coalesce(string_agg(
    s.recipient_kind || '/' || coalesce(s.recipient_role::text, 'none')
      || '/' || pg_temp.label(s.recipient_named_role), ',' order by s.position), 'none')
  from public.list_schedules s where s.template_id = template
$$;

-- The owner saves `template` (JSON) in A; its id comes back.
create function pg_temp.save(template jsonb) returns uuid language sql as $$
  select (public.save_list_template(pg_temp.p(1), pg_temp.a(), template) ->> 'id')::uuid
$$;
create function pg_temp.save_call(template jsonb) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.save_list_template(%L::uuid, %L::uuid, %L::jsonb)',
    pg_temp.p(1), pg_temp.a(), template))
$$;

-- The owner archives the role labelled `named`.
create function pg_temp.archive(named text) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.archive_business_role(%L::uuid, %L::uuid)', pg_temp.p(1), pg_temp.id(named)))
$$;

-- A's roles: a shift lead and a bar lead on workers, a floor manager on
-- managers, one nobody holds that lists will go to ('spare'), one archived
-- under a template later ('gone'), one archived now ('old'), and one of B.
insert into ids values ('lead', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Shift lead'));
insert into ids values ('bar', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Bar lead'));
insert into ids values ('floor', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'manager', 'Floor manager'));
insert into ids values ('spare', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Spare'));
insert into ids values ('gone', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Gone soon'));
insert into ids values ('old', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Old role'));
insert into ids values ('far', public.create_business_role(pg_temp.p(7),
  'd4000000-0000-4000-b000-000000000002', 'worker', 'Elsewhere'));
select public.archive_business_role(pg_temp.p(1), pg_temp.id('old'));

insert into public.memberships (business_id, user_id, role, perms, named_role, active)
values
  (pg_temp.a(), pg_temp.p(2), 'manager', '{}', null, true),
  (pg_temp.a(), pg_temp.p(3), 'worker', '{}', pg_temp.id('lead'), true),
  (pg_temp.a(), pg_temp.p(4), 'worker', '{}', null, true),
  (pg_temp.a(), pg_temp.p(5), 'worker', '{}', pg_temp.id('bar'), true),
  (pg_temp.a(), pg_temp.p(6), 'manager', '{}', pg_temp.id('floor'), true),
  (pg_temp.a(), pg_temp.p(8), 'accountant', '{}', null, true),
  (pg_temp.a(), pg_temp.p(9), 'worker', '{}', pg_temp.id('lead'), false);

-- The bar lead's phone, so the lines for them are queued.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
values (pg_temp.p(5), 'https://fcm.googleapis.com/rnl-5', repeat('d', 63) || '5',
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ');

insert into public.departments (id, business_id, key, name)
values ('d4000000-0000-4000-c000-000000000001', pg_temp.a(), 'kitchen', 'Kitchen');
insert into public.department_members (department_id, business_id, user_id)
values ('d4000000-0000-4000-c000-000000000001', pg_temp.a(), pg_temp.p(4));

------------------------------------------------------------------------------
-- Sending to a named role, and to its base

insert into ids values ('to lead', pg_temp.send(pg_temp.to_role('worker', 'lead')));
insert into ids values ('to workers', pg_temp.send(pg_temp.to_role('worker')));
insert into ids values ('to managers', pg_temp.send(pg_temp.to_role('manager')));
insert into ids values ('to floor', pg_temp.send(pg_temp.to_role('manager', 'floor')));
insert into ids values ('to owners', pg_temp.send(pg_temp.to_role('owner')));

select is(
  pg_temp.addressed(pg_temp.id('to lead')) || ' : ' || pg_temp.reach(pg_temp.id('to lead')),
  'role/worker/lead : 3 / 3 / 3',
  'a list to a named role is for exactly the people holding it, one who left not among them, and only they are told'
);

select is(
  pg_temp.addressed(pg_temp.id('to workers')) || ' : ' || pg_temp.reach(pg_temp.id('to workers')),
  'role/worker/none : 3,4,5 / 3,4,5 / 3,4,5',
  'a list to the workers reaches everyone in the role, those in a role named on it among them, as before'
);

select is(
  pg_temp.reach(pg_temp.id('to managers')) || ' ; ' || pg_temp.reach(pg_temp.id('to floor'))
    || ' ; ' || pg_temp.reach(pg_temp.id('to owners')),
  '2,6 / 2,6 / 2,6 ; 6 / 6 / 6 ; 1 / 1 / nobody',
  'the same on managers: the managers reach the floor manager, the floor managers only them, and the owners only the owners'
);

select is(
  pg_temp.who(array(
    select pg_temp.p(n) from generate_series(1, 9) as n
    where private.sees_list(pg_temp.id('to lead'), pg_temp.p(n)))),
  '1,2,3,6',
  'a list to a named role is read by its people, its sender and whoever runs the lists, a floor manager as a manager does, and by no other worker or the accountant'
);

select is(
  (select l.details -> 'recipient' from public.audit_log l
   where l.action = 'lists.send' and l.details ->> 'list' = pg_temp.id('to lead')::text),
  jsonb_build_object('kind', 'role', 'role', 'worker',
    'named_role', pg_temp.id('lead'), 'role_name', 'Shift lead'),
  'the log names the role the list went to'
);

select is(
  pg_temp.send_call(pg_temp.to_role('worker', 'far'))
    || ' | ' || pg_temp.send_call(pg_temp.to_role('worker', 'old'))
    || ' | ' || pg_temp.send_call(pg_temp.to_role('worker', 'floor'))
    || ' | ' || pg_temp.send_call(pg_temp.to_role('owner', 'lead'))
    || ' | ' || pg_temp.send_call(jsonb_build_object(
      'kind', 'department', 'department', 'd4000000-0000-4000-c000-000000000001',
      'namedRole', pg_temp.id('lead')))
    || ' | ' || pg_temp.send_call(jsonb_build_object(
      'kind', 'role', 'role', 'worker', 'namedRole', 'd4000000-0000-4000-e000-000000000001'))
    || ' | ' || pg_temp.send_call(jsonb_build_object(
      'kind', 'role', 'role', 'worker', 'namedRole', 'lead')),
  '22023 | 22023 archived | 22023 base | 22023 base | 22023 | 22023 | 22023',
  'sending to a role of another business, an archived one, one on another base, a named role on a department, an unknown one or not an id is refused'
);

------------------------------------------------------------------------------
-- A template's default and its times

insert into ids values ('opening', pg_temp.save(jsonb_build_object(
  'name', 'Opening', 'recipient', pg_temp.to_role('worker', 'lead'),
  'items', '[{"kind": "check", "label": "Open"}]'::jsonb,
  'schedules', jsonb_build_array(
    jsonb_build_object('days', '[3]'::jsonb, 'opensOffset', 420, 'dueOffset', 480,
      'recipient', pg_temp.to_role('worker', 'bar')),
    jsonb_build_object('days', '[3]'::jsonb, 'opensOffset', 400, 'dueOffset', 480,
      'recipient', pg_temp.to_role('worker'))))));

select is(
  pg_temp.template_to(pg_temp.id('opening')) || ' : ' || pg_temp.times_to(pg_temp.id('opening')),
  'role/worker/lead : role/worker/bar,role/worker/none',
  'a template keeps the named role it goes to, and each of its times its own'
);

select pg_temp.save(jsonb_build_object(
  'id', pg_temp.id('opening'), 'name', 'Opening', 'recipient', pg_temp.to_role('manager', 'floor'),
  'items', (select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'label', i.label))
            from public.list_template_items i where i.template_id = pg_temp.id('opening')),
  'schedules', (select jsonb_agg(jsonb_build_object('id', s.id, 'days', s.days,
      'opensOffset', s.opens_offset, 'dueOffset', s.due_offset,
      'recipient', case when s.position = 0 then pg_temp.to_role('worker', 'bar')
        else pg_temp.to_role('worker') end) order by s.position)
    from public.list_schedules s where s.template_id = pg_temp.id('opening'))));
insert into ids values ('plain', pg_temp.save(jsonb_build_object(
  'name', 'Plain', 'recipient', pg_temp.to_role('worker'),
  'items', '[{"kind": "check", "label": "Done"}]'::jsonb)));

select is(
  pg_temp.template_to(pg_temp.id('opening')) || ' : ' || pg_temp.times_to(pg_temp.id('opening'))
    || ' ; ' || pg_temp.template_to(pg_temp.id('plain')),
  'role/manager/floor : role/worker/bar,role/worker/none ; role/worker/none',
  'saved again it changes to another, and a template to the role itself keeps none, as before'
);

select is(
  pg_temp.save_call(jsonb_build_object('name', 'Refused', 'recipient', pg_temp.to_role('worker', 'old'),
    'items', '[{"kind": "check", "label": "A"}]'::jsonb))
    || ' | ' || pg_temp.save_call(jsonb_build_object('name', 'Refused', 'recipient', pg_temp.to_role('manager', 'lead'),
      'items', '[{"kind": "check", "label": "A"}]'::jsonb))
    || ' | ' || pg_temp.save_call(jsonb_build_object('name', 'Refused',
      'items', '[{"kind": "check", "label": "A"}]'::jsonb,
      'schedules', jsonb_build_array(jsonb_build_object('days', '[1]'::jsonb,
        'opensOffset', 420, 'dueOffset', 480, 'recipient', pg_temp.to_role('worker', 'far')))))
    || ' | ' || pg_temp.save_call(jsonb_build_object('name', 'Refused',
      'items', '[{"kind": "check", "label": "A"}]'::jsonb,
      'schedules', jsonb_build_array(jsonb_build_object('days', '[1]'::jsonb,
        'opensOffset', 420, 'dueOffset', 480, 'recipient', pg_temp.to_role('worker', 'old'))))),
  '22023 archived | 22023 base | 22023 | 22023 archived',
  'a template to an archived role or one on another base, and a time to a role of another business or an archived one, are refused'
);

select is(
  pg_temp.refusal(format(
    'insert into public.list_templates (business_id, name, recipient_kind, recipient_role, recipient_named_role)
     values (%L::uuid, %L, %L, %L, %L::uuid)', pg_temp.a(), 'Direct', 'role', 'worker', pg_temp.id('old')))
    || ' | ' || left(pg_temp.refusal(format(
    'insert into public.list_templates (business_id, name, recipient_kind, recipient_role, recipient_named_role)
     values (%L::uuid, %L, %L, %L, %L::uuid)', pg_temp.a(), 'Direct', 'role', 'manager', pg_temp.id('lead'))), 5)
    || ' | ' || left(pg_temp.refusal(format(
    'insert into public.list_templates (business_id, name, recipient_kind, recipient_role, recipient_named_role)
     values (%L::uuid, %L, %L, %L, %L::uuid)', pg_temp.a(), 'Direct', 'role', 'worker', pg_temp.id('far'))), 5)
    || ' | ' || left(pg_temp.refusal(format(
    'insert into public.list_templates (business_id, name, recipient_kind, recipient_department, recipient_named_role)
     values (%L::uuid, %L, %L, %L::uuid, %L::uuid)', pg_temp.a(), 'Direct', 'department',
     'd4000000-0000-4000-c000-000000000001', pg_temp.id('lead'))), 5)
    || ' | ' || pg_temp.refusal(format(
    'update public.list_schedules set recipient_named_role = %L::uuid where template_id = %L::uuid and position = 0',
     pg_temp.id('old'), pg_temp.id('opening')))
    || ' | ' || pg_temp.refusal(format(
    'update public.lists set recipient_named_role = %L::uuid where id = %L::uuid',
     pg_temp.id('old'), pg_temp.id('to workers'))),
  '22023 archived | 23503 | 23503 | 23514 | 22023 archived | 22023 archived',
  'whoever writes the tables: never an archived role, one on another base or of another business, or a named role on a department'
);

------------------------------------------------------------------------------
-- The times

-- A second template whose times go to 'gone', archived; then 'gone' is
-- archived (nobody holds it, and the template no longer holds it back), and
-- the template restored. Then every time of A starts on 1 November: after
-- the restore, which starts the template's times again from the real clock,
-- so nothing here depends on today's date. On Wednesday 2 December at 07:01
-- (05:01 UTC) the minute job opens the day's lists.
insert into ids values ('closing', pg_temp.save(jsonb_build_object(
  'name', 'Closing', 'recipient', pg_temp.to_role('worker', 'gone'),
  'items', '[{"kind": "check", "label": "Close"}]'::jsonb,
  'schedules', jsonb_build_array(
    jsonb_build_object('days', '[3]'::jsonb, 'opensOffset', 410, 'dueOffset', 480,
      'recipient', pg_temp.to_role('worker', 'gone'))))));
create temporary table gone_archive (got text) on commit drop;
select public.archive_list_template(pg_temp.p(1), pg_temp.id('closing'));
insert into gone_archive values (pg_temp.archive('gone'));
select public.restore_list_template(pg_temp.p(1), pg_temp.id('closing'));
update public.list_schedules s set starts_on = '2026-11-01', opens_from = '2026-11-01 00:00+00'
where s.business_id = pg_temp.a();
select private.lists_tick_business(pg_temp.a(), '2026-12-02 05:01+00');

-- The list a time of `template` at position `place` opened.
create function pg_temp.opened(template uuid, place integer) returns uuid language sql as $$
  select l.id from public.lists l
  join public.list_schedules s on s.id = l.schedule_id
  where s.template_id = template and s.position = place
$$;

select is(
  pg_temp.addressed(pg_temp.opened(pg_temp.id('opening'), 0)) || ' : '
    || pg_temp.reach(pg_temp.opened(pg_temp.id('opening'), 0))
    || ' ; ' || pg_temp.addressed(pg_temp.opened(pg_temp.id('opening'), 1)) || ' : '
    || pg_temp.reach(pg_temp.opened(pg_temp.id('opening'), 1)),
  'role/worker/bar : 5 / 5 / 5 ; role/worker/none : 3,4,5 / 3,4,5 / 3,4,5',
  'the minute job opens a time''s list to its named role''s people, and one to the workers to them all'
);

select is(
  (select g.got from gone_archive g)
    || ' : ' || pg_temp.addressed(pg_temp.opened(pg_temp.id('closing'), 0)) || ' : '
    || pg_temp.reach(pg_temp.opened(pg_temp.id('closing'), 0)),
  'none : role/manager/none : 2,6 / 2,6 / 2,6',
  'a role whose template was archived is archived, and once the template is restored its time''s list goes to nobody there: the managers, not the whole base'
);

------------------------------------------------------------------------------
-- Passing on

select public.pass_list(pg_temp.p(1), pg_temp.id('to lead'),
  'd4000000-0000-4000-c000-000000000001', null, '2026-12-01 11:00+00');

select is(
  pg_temp.addressed(pg_temp.id('to lead')) || ' : ' || pg_temp.who(private.list_holders(pg_temp.id('to lead'))),
  'department/none/none : 4',
  'passed to a department, a list leaves its named role behind with its role'
);

------------------------------------------------------------------------------
-- Archiving a role lists go to

-- 'spare': nobody holds it. A template goes to it when nobody chooses, and a
-- time of another template sends to it.
insert into ids values ('spare default', pg_temp.save(jsonb_build_object(
  'name', 'Spare default', 'recipient', pg_temp.to_role('worker', 'spare'),
  'items', '[{"kind": "check", "label": "A"}]'::jsonb)));
insert into ids values ('spare time', pg_temp.save(jsonb_build_object(
  'name', 'Spare time', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
  'schedules', jsonb_build_array(jsonb_build_object('days', '[1]'::jsonb,
    'opensOffset', 420, 'dueOffset', 480, 'recipient', pg_temp.to_role('worker', 'spare'))))));

create temporary table archives (n serial primary key, got text) on commit drop;
insert into archives (got) values (pg_temp.archive('spare'));
insert into archives (got) values (pg_temp.archive('lead'));
select public.archive_list_template(pg_temp.p(1), pg_temp.id('spare default'));
insert into archives (got) values (pg_temp.archive('spare'));
update public.list_schedules s set active = false where s.template_id = pg_temp.id('spare time');
insert into archives (got) values (pg_temp.archive('spare'));
select public.save_list_template(pg_temp.p(1), pg_temp.a(), jsonb_build_object(
  'id', pg_temp.id('spare time'), 'name', 'Spare time',
  'items', (select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'label', i.label))
            from public.list_template_items i where i.template_id = pg_temp.id('spare time'))));
insert into archives (got) values (pg_temp.archive('spare'));

select is(
  (select string_agg(a.got, ' | ' order by a.n) from archives a)
    || ' : ' || (select (br.archived_at is not null)::text from public.business_roles br
                 where br.id = pg_temp.id('spare'))
    || ' : ' || pg_temp.template_to(pg_temp.id('spare default')),
  '55000 lists 2 | 55000 held 1 | 55000 lists 1 | 55000 lists 1 | none : true : role/worker/spare',
  'a role a live template or a time of one goes to, on or paused, isn''t archived (after its people), and is once they go elsewhere; an archived template keeps it and holds nothing back'
);

------------------------------------------------------------------------------
-- Moving someone off a named role

-- Person `n`'s "sent" line of a list: read or not, settled or not, and its
-- push.
create function pg_temp.line(list uuid, n integer) returns text language sql as $$
  select coalesce((
    select case when x.read_at is null then 'unread' else 'read' end
      || case when x.resolved_at is null then '' else ' settled' end
      || ' ' || x.push_state
    from public.notifications x
    where x.dedupe_key = 'list:' || list and x.user_id = pg_temp.p(n)
  ), 'none')
$$;

-- The bar lead becomes a worker like the rest, an hour after the bar lead's
-- time opened its list.
select public.set_member_role(pg_temp.p(1), pg_temp.a(), pg_temp.p(5), 'worker',
  seen_role => 'worker', at_time => '2026-12-02 06:00+00', seen_named => pg_temp.id('bar'));

select is(
  pg_temp.line(pg_temp.opened(pg_temp.id('opening'), 0), 5)
    || ' ; ' || pg_temp.line(pg_temp.id('to workers'), 5)
    || ' ; ' || pg_temp.line(pg_temp.opened(pg_temp.id('opening'), 1), 5),
  'read settled skipped ; unread queued ; unread queued',
  'moved off a named role, someone has the line of its list, which they no longer see, settled and off the phone, and keeps the workers'' lines'
);

------------------------------------------------------------------------------
-- Today's lists, and who may call what

select is(
  (select r.to_kind || '/' || r.to_role::text || '/' || coalesce(r.to_named::text, 'none')
   from private.list_recipient(pg_temp.a(), '{"kind": "role", "role": "worker"}'::jsonb,
     array['person', 'department', 'role']) as r)
    || ' ; ' || (select count(*)::text from public.lists l
       where l.business_id = pg_temp.a() and l.recipient_named_role is not null),
  'role/worker/none ; 2',
  'a recipient without a named role reads as before, and only the lists sent or opened to one name one'
);

select ok(
  (select count(*) = 3 from pg_trigger g
   where not g.tgisinternal and g.tgname in (
     'list_templates_recipient_named_role_live', 'list_schedules_recipient_named_role_live',
     'lists_recipient_named_role_live'))
  and (select count(*) = 3 from pg_constraint c
   where c.conname in (
     'list_templates_recipient_named_role_fkey', 'list_schedules_recipient_named_role_fkey',
     'lists_recipient_named_role_fkey')
     and c.confrelid = 'public.business_roles'::regclass),
  'each of the three tables names its role by the foreign key and refuses an archived one by its trigger'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'private.refuse_archived_recipient_role()', 'private.list_recipient(uuid, jsonb, text[])',
      'private.list_schedule_fields(uuid, jsonb)', 'private.holds_list(uuid, uuid)',
      'private.list_holders(uuid)', 'private.lists_tick_business(uuid, timestamptz)'
    ]) as f (signature)
    where has_function_privilege('authenticated', f.signature, 'execute')
      or has_function_privilege('anon', f.signature, 'execute')
  )
  and not has_function_privilege('service_role', 'private.lists_tick_business(uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.send_list(uuid, uuid, jsonb, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.save_list_template(uuid, uuid, jsonb, integer)', 'execute')
  and has_function_privilege('service_role', 'public.pass_list(uuid, uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.archive_business_role(uuid, uuid)', 'execute')
  and has_function_privilege('service_role',
    'public.set_member_role(uuid, uuid, uuid, public.member_role, public.member_role, timestamptz, uuid, uuid)',
    'execute')
  and not has_function_privilege('authenticated', 'public.send_list(uuid, uuid, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.archive_business_role(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.set_member_role(uuid, uuid, uuid, public.member_role, public.member_role, timestamptz, uuid, uuid)',
    'execute')
  and (select count(*)::int from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname || '.' || p.proname in (
           'private.refuse_archived_recipient_role', 'private.list_recipient',
           'private.list_schedule_fields', 'private.holds_list', 'private.list_holders',
           'private.lists_tick_business', 'public.send_list', 'public.save_list_template',
           'public.pass_list', 'public.archive_business_role', 'public.set_member_role'
         )
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 11,
  'the helpers run for the server alone, the public ones with the secret key, all as their owner with an empty search path'
);

select * from finish();
rollback;
