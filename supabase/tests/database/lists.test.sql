-- Lists: templates, sending, filling, finishing, cancelling and opening again,
-- all through the server, and who reads what. A list is read by whoever holds
-- it (a person, a department, the people of a shift, a role), sent it, was
-- given it, asked for it or held it before it was passed on, and by list
-- managers; a view session reads as a manager. With the module off nothing is
-- read. Fixed ids and explicit times, so nothing here depends on the seed or
-- the clock.
begin;
select plan(148);

insert into auth.users (id, aud, role, phone)
values
  ('73000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500002301'),
  ('73000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500002302'),
  ('73000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500002303'),
  ('73000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500002304'),
  ('73000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500002305'),
  ('73000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500002306'),
  ('73000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500002307'),
  ('73000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500002308'),
  ('73000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500002309'),
  ('73000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500002310'),
  ('73000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500002311'),
  ('73000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500002312'),
  ('73000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500002313'),
  ('73000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500002314'),
  ('73000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500002315');

-- X: 1 owner, 2 manager; workers 3 (kitchen), 4 (bar), 5 (no department),
-- 6 (holds lists.manage), 7 (holds lists.send), d (works the evening shift),
-- e (storeroom); 8 a former worker still in the kitchen's rows.
-- Y: 9 owner, a worker. Z: f owner, for the caps.
-- b and c are on the ConceptApp team, viewing X as a manager and as a worker.
insert into public.businesses (id, slug, name)
values
  ('73000000-0000-4000-b000-000000000001', 'lists-x', 'Lists X'),
  ('73000000-0000-4000-b000-000000000002', 'lists-y', 'Lists Y'),
  ('73000000-0000-4000-b000-000000000003', 'lists-z', 'Lists Z');

insert into public.memberships (business_id, user_id, role, perms, active)
values
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-000000000001', 'owner', '{}', true),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-000000000002', 'manager', '{}', true),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-000000000003', 'worker', '{}', true),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-000000000004', 'worker', '{}', true),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-000000000005', 'worker', '{}', true),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-000000000006', 'worker', '{lists.manage}', true),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-000000000007', 'worker', '{lists.send}', true),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-000000000008', 'worker', '{}', false),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-00000000000d', 'worker', '{}', true),
  ('73000000-0000-4000-b000-000000000001', '73000000-0000-4000-a000-00000000000e', 'worker', '{}', true),
  ('73000000-0000-4000-b000-000000000002', '73000000-0000-4000-a000-000000000009', 'owner', '{}', true),
  ('73000000-0000-4000-b000-000000000002', '73000000-0000-4000-a000-00000000000a', 'worker', '{}', true),
  ('73000000-0000-4000-b000-000000000003', '73000000-0000-4000-a000-00000000000f', 'owner', '{}', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('73000000-0000-4000-b000-000000000001', 'scheduling', true,
   '{"weekStartsOn": 0, "shifts": [{"key": "evening", "name": "Evening", "days": [0], "start": "16:00", "end": "23:00", "needed": 1}]}'),
  ('73000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('73000000-0000-4000-b000-000000000002', 'lists', true, '{}'),
  ('73000000-0000-4000-b000-000000000003', 'lists', true, '{}');

insert into public.platform_staff (user_id, role)
values
  ('73000000-0000-4000-a000-00000000000b', 'onboarder'),
  ('73000000-0000-4000-a000-00000000000c', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('73000000-0000-4000-a000-00000000000b', '73000000-0000-4000-b000-000000000001', 'manager'),
  ('73000000-0000-4000-a000-00000000000c', '73000000-0000-4000-b000-000000000001', 'worker');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
create function pg_temp.to_dept(saved text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'department', 'department', pg_temp.id_of(saved))
$$;
-- A list's item, and a template's, by label.
create function pg_temp.item_of(list_name text, item_label text) returns uuid language sql as $$
  select i.id from public.list_items i
  where i.list_id = pg_temp.id_of(list_name) and i.label = item_label
$$;
create function pg_temp.titem_of(template_name text, item_label text) returns uuid language sql as $$
  select i.id from public.list_template_items i
  where i.template_id = pg_temp.id_of(template_name) and i.label = item_label
$$;
-- The lists the caller reads, by their names here; and the templates, their
-- items and the schedules, counted.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(i.name, ',' order by i.name), '')
  from public.lists l join ids i on i.id = l.id
$$;
create function pg_temp.templates_seen() returns text language sql as $$
  select (select count(*) from public.list_templates)::text || '/'
    || (select count(*) from public.list_template_items)::text || '/'
    || (select count(*) from public.list_schedules)::text
$$;
-- Saves and sends in X, by its manager unless said otherwise.
create function pg_temp.save_x(body jsonb) returns jsonb language sql as $$
  select public.save_list_template('73000000-0000-4000-a000-000000000002',
    '73000000-0000-4000-b000-000000000001', body)
$$;
create function pg_temp.send_x(body jsonb, at_time timestamptz) returns uuid language sql as $$
  select public.send_list('73000000-0000-4000-a000-000000000002',
    '73000000-0000-4000-b000-000000000001', body, at_time)
$$;

-- X's departments: kitchen (3, and the former 8), bar (4), storeroom (e), and
-- an archived one. Y has a kitchen too, with a.
select public.set_departments('73000000-0000-4000-a000-000000000001',
  '73000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "storeroom", "name": "Storeroom"}, {"key": "old", "name": "Old"}]');
select public.set_departments('73000000-0000-4000-a000-000000000009',
  '73000000-0000-4000-b000-000000000002', '[{"key": "kitchen", "name": "Kitchen"}]');
insert into ids
select d.key, d.id from public.departments d
where d.business_id = '73000000-0000-4000-b000-000000000001';
insert into ids
select 'y-kitchen', d.id from public.departments d
where d.business_id = '73000000-0000-4000-b000-000000000002';
select public.set_department_members('73000000-0000-4000-a000-000000000001',
  '73000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen'),
  array['73000000-0000-4000-a000-000000000003']::uuid[]);
select public.set_department_members('73000000-0000-4000-a000-000000000001',
  '73000000-0000-4000-b000-000000000001', pg_temp.id_of('bar'),
  array['73000000-0000-4000-a000-000000000004']::uuid[]);
select public.set_department_members('73000000-0000-4000-a000-000000000001',
  '73000000-0000-4000-b000-000000000001', pg_temp.id_of('storeroom'),
  array['73000000-0000-4000-a000-00000000000e']::uuid[]);
select public.set_department_members('73000000-0000-4000-a000-000000000009',
  '73000000-0000-4000-b000-000000000002', pg_temp.id_of('y-kitchen'),
  array['73000000-0000-4000-a000-00000000000a']::uuid[]);
insert into public.department_members (department_id, business_id, user_id)
values (pg_temp.id_of('kitchen'), '73000000-0000-4000-b000-000000000001',
  '73000000-0000-4000-a000-000000000008');
select public.set_departments('73000000-0000-4000-a000-000000000001',
  '73000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "storeroom", "name": "Storeroom"}]');

-- The week of 15 November is published, with d on Sunday's evening shift; the
-- next week's is saved and not published.
insert into ids values ('week', public.open_schedule_week(
  '73000000-0000-4000-b000-000000000001', '2026-11-15', '2026-11-11 16:00+00'));
select public.publish_week_schedule('73000000-0000-4000-a000-000000000002', pg_temp.id_of('week'),
  '[{"day": "2026-11-15", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
     "pattern": "evening", "assignees": [{"user": "73000000-0000-4000-a000-00000000000d"}]}]');
insert into ids
select 'shift', s.id from public.schedule_shifts s where s.week_id = pg_temp.id_of('week');
insert into ids values ('draft-week', public.open_schedule_week(
  '73000000-0000-4000-b000-000000000001', '2026-11-22', '2026-11-18 16:00+00'));
select public.save_week_schedule('73000000-0000-4000-a000-000000000002', pg_temp.id_of('draft-week'),
  '[{"day": "2026-11-22", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
     "pattern": "evening", "assignees": [{"user": "73000000-0000-4000-a000-00000000000d"}]}]');
insert into ids
select 'draft-shift', s.id from public.schedule_shifts s where s.week_id = pg_temp.id_of('draft-week');

------------------------------------------------------------------------------
-- Server only

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.set_departments(uuid, uuid, jsonb)',
      'public.set_department_members(uuid, uuid, uuid, uuid[])',
      'public.save_list_template(uuid, uuid, jsonb, integer)',
      'public.archive_list_template(uuid, uuid)',
      'public.restore_list_template(uuid, uuid)',
      'public.send_list(uuid, uuid, jsonb, timestamptz)',
      'public.set_list_item(uuid, uuid, jsonb, timestamptz)',
      'public.finish_list(uuid, uuid, timestamptz)',
      'public.cancel_list(uuid, uuid, timestamptz)',
      'public.reopen_list(uuid, uuid, timestamptz)',
      'public.my_open_lists(uuid, uuid)'
    ]) as f (signature)
    where has_function_privilege('authenticated', f.signature, 'execute')
      or has_function_privilege('anon', f.signature, 'execute')
      or not has_function_privilege('service_role', f.signature, 'execute')
  ),
  'every lists function is the server''s alone'
);
select ok(
  has_function_privilege('authenticated', 'private.sees_list(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.can_manage_lists(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.sees_list(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.can_manage_lists(uuid, uuid)', 'execute'),
  'the policies'' helpers run for a signed-in reader'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'private.can_send_lists(uuid, uuid)', 'private.in_department(uuid, uuid)',
      'private.holds_list(uuid, uuid)', 'private.list_holders(uuid)',
      'private.list_managers(uuid)', 'private.list_setting(uuid, text)',
      'private.list_settings(uuid)', 'private.has_shift_pattern(uuid, text)',
      'private.lists_on(uuid)', 'private.list_recipient(uuid, jsonb, text[])',
      'private.list_item_fields(jsonb, boolean)', 'private.list_schedule_fields(uuid, jsonb)',
      'private.json_text(jsonb, integer, text)', 'private.json_key(jsonb, text)',
      'private.json_int(jsonb, integer, integer, text)',
      'private.json_num(jsonb, numeric, numeric, text)', 'private.json_bool(jsonb, boolean, text)',
      'private.json_uuid(jsonb, text)', 'private.json_instant(jsonb, text)',
      'private.copy_template_lists(uuid, jsonb)', 'private.seed_recipient(uuid, jsonb, text[])',
      'private.notify_for_lists(public.audit_log)', 'private.notify_lists_from_log()',
      'private.seed_demo_lists(uuid)'
    ]) as f (signature)
    where has_function_privilege('authenticated', f.signature, 'execute')
      or has_function_privilege('anon', f.signature, 'execute')
  ),
  'and no other lists helper runs for a browser role'
);

------------------------------------------------------------------------------
-- Templates

select throws_ok(
  $$select public.save_list_template('73000000-0000-4000-a000-000000000003',
    '73000000-0000-4000-b000-000000000001',
    '{"name": "Mine", "items": [{"kind": "check", "label": "One"}]}')$$,
  '42501', null, 'a worker does not save templates'
);

insert into ids
select 't1', (pg_temp.save_x(jsonb_build_object(
  'name', ' Opening ',
  'note', 'Before the doors open',
  'recipient', pg_temp.to_dept('kitchen'),
  'items', '[{"kind": "number", "label": "Fridge", "unit": "C", "min": 0, "max": 5},
             {"kind": "check", "label": "Clean"},
             {"kind": "note", "label": "Missing", "required": false}]'::jsonb,
  'schedules', jsonb_build_array(jsonb_build_object(
    'days', '[0, 1, 2, 3, 4]'::jsonb, 'opensOffset', 510, 'dueOffset', 555,
    'recipient', pg_temp.to_dept('kitchen')))
)) ->> 'id')::uuid;
select is(
  (select name || '|' || note || '|' || recipient_kind || '|' || version
   from public.list_templates where id = pg_temp.id_of('t1')),
  'Opening|Before the doors open|department|1',
  'a list manager saves a template, tidied, at its first version'
);
select results_eq(
  $$select kind, label, required, unit, min_value, max_value
    from public.list_template_items where template_id = pg_temp.id_of('t1') order by position$$,
  $$values ('number'::text, 'Fridge'::text, true, 'C'::text, 0::numeric, 5::numeric),
    ('check', 'Clean', true, null, null, null),
    ('note', 'Missing', false, null, null, null)$$,
  'with its items in their order'
);
select is(
  (select array_to_string(days, ',') || '|' || anchor || '|' || opens_offset || '-' || due_offset
     || '|' || recipient_kind || '|'
     || (starts_on = (now() at time zone 'Asia/Jerusalem')::date)::text
   from public.list_schedules where template_id = pg_temp.id_of('t1')),
  '0,1,2,3,4|day|510-555|department|true',
  'and its times, starting on the business''s local today'
);
select is(
  (select details - 'template' from public.audit_log
   where action = 'lists.template.save' and details ->> 'template' = pg_temp.id_of('t1')::text),
  '{"name": "Opening", "created": true, "items": 3, "schedules": 1}'::jsonb,
  'logged'
);
insert into ids values
  ('t1-fridge', pg_temp.titem_of('t1', 'Fridge')),
  ('t1-clean', pg_temp.titem_of('t1', 'Clean')),
  ('t1-missing', pg_temp.titem_of('t1', 'Missing'));
insert into ids
select 't1-schedule', s.id from public.list_schedules s where s.template_id = pg_temp.id_of('t1');

insert into ids
select 't2', (pg_temp.save_x(jsonb_build_object(
  'name', 'Bar order',
  'recipient', pg_temp.to_dept('storeroom'),
  'fromDepartment', pg_temp.id_of('bar'),
  'asksQuantities', true,
  'items', '[{"kind": "check", "label": "Ice", "defaultQuantity": 2},
             {"kind": "check", "label": "Lemons", "defaultQuantity": 20}]'::jsonb
)) ->> 'id')::uuid;
insert into ids values ('t2-ice', pg_temp.titem_of('t2', 'Ice'));
select is(
  (select from_department = pg_temp.id_of('bar') and asks_quantities
     and recipient_department = pg_temp.id_of('storeroom')
   from public.list_templates where id = pg_temp.id_of('t2')),
  true,
  'an order between departments keeps the department that asks'
);

insert into ids
select 't3', (pg_temp.save_x(jsonb_build_object(
  'name', 'Spare',
  'recipient', '{"kind": "shift", "shift": "evening"}'::jsonb,
  'items', '[{"kind": "check", "label": "One"}]'::jsonb,
  'schedules', '[{"days": [0], "anchor": "shift_start", "shift": "evening",
                  "opensOffset": -30, "dueOffset": 0,
                  "recipient": {"kind": "shift", "shift": "evening"}}]'::jsonb
)) ->> 'id')::uuid;
select is(
  (select s.anchor || '|' || s.shift_key || '|' || s.opens_offset || '|' || s.recipient_shift
   from public.list_schedules s where s.template_id = pg_temp.id_of('t3')),
  'shift_start|evening|-30|evening',
  'a schedule can follow a shift of the business'
);

insert into ids
select 'ty', (public.save_list_template('73000000-0000-4000-a000-000000000009',
  '73000000-0000-4000-b000-000000000002',
  '{"name": "Y list", "recipient": {"kind": "role", "role": "worker"},
    "items": [{"kind": "check", "label": "Y item"}]}') ->> 'id')::uuid;
insert into ids values ('ty-item', pg_temp.titem_of('ty', 'Y item'));

-- Photo items are taken from L6 (20261110001500_list_photos.sql,
-- list_photos.test.sql), like a note: with no unit or range.
select throws_ok(
  $$select pg_temp.save_x('{"name": "P", "items": [{"kind": "photo", "label": "Picture", "unit": "cm"}]}')$$,
  '22023', 'Only numbers have a unit and a range', 'a photo item has no unit or range'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'Long', 'items',
    (select jsonb_agg(jsonb_build_object('kind', 'check', 'label', 'Item ' || n))
     from generate_series(1, 61) as n)))$$,
  '22023', null, 'at most 60 items'
);
select throws_ok(
  $$select pg_temp.save_x('{"name": "None", "items": []}')$$,
  '22023', null, 'and at least one'
);
select throws_ok(
  $$select pg_temp.save_x('{"name": "R", "items": [{"kind": "number", "label": "T", "min": 5, "max": 0}]}')$$,
  '22023', null, 'a range runs upwards'
);
select throws_ok(
  $$select pg_temp.save_x('{"name": "U", "items": [{"kind": "check", "label": "T", "unit": "C"}]}')$$,
  '22023', null, 'only numbers have a unit'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'Y', 'recipient', pg_temp.to_dept('y-kitchen'),
    'items', '[{"kind": "check", "label": "A"}]'::jsonb))$$,
  '22023', 'Not a department of this business', 'another business''s department is not a recipient'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'O', 'recipient', pg_temp.to_dept('old'),
    'items', '[{"kind": "check", "label": "A"}]'::jsonb))$$,
  '22023', 'Not a department of this business', 'nor an archived one'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'O', 'recipient', '{"kind": "role", "role": "worker"}'::jsonb,
    'fromDepartment', pg_temp.id_of('bar'), 'items', '[{"kind": "check", "label": "A"}]'::jsonb))$$,
  '22023', null, 'an order goes to a department'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'O', 'recipient', pg_temp.to_dept('bar'),
    'fromDepartment', pg_temp.id_of('bar'), 'items', '[{"kind": "check", "label": "A"}]'::jsonb))$$,
  '22023', null, 'another than the one that asks'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'S', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'schedules', jsonb_build_array(jsonb_build_object('days', '[1, 1]'::jsonb,
      'opensOffset', 510, 'dueOffset', 555, 'recipient', pg_temp.to_dept('kitchen')))))$$,
  '22023', 'Each day once', 'a schedule names each day once'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'S', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'schedules', jsonb_build_array(jsonb_build_object('days', '[1]'::jsonb, 'anchor', 'shift_end',
      'opensOffset', -30, 'dueOffset', 0, 'recipient', pg_temp.to_dept('kitchen')))))$$,
  '22023', null, 'a schedule that follows a shift names it'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'S', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'schedules', jsonb_build_array(jsonb_build_object('days', '[1]'::jsonb, 'anchor', 'shift_end',
      'shift', 'night', 'opensOffset', -30, 'dueOffset', 0, 'recipient', pg_temp.to_dept('kitchen')))))$$,
  '22023', 'Not a shift of this business', 'a shift the business has'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'S', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'schedules', jsonb_build_array(jsonb_build_object('days', '[1]'::jsonb,
      'opensOffset', 510, 'dueOffset', 500, 'recipient', pg_temp.to_dept('kitchen')))))$$,
  '22023', null, 'due after it opens'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'S', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'schedules', jsonb_build_array(jsonb_build_object('days', '[1]'::jsonb,
      'opensOffset', 510, 'dueOffset', 555,
      'recipient', jsonb_build_object('kind', 'person', 'user', '73000000-0000-4000-a000-000000000008')))))$$,
  '22023', 'Not an active member of this business', 'a schedule goes to an active member'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('name', 'S', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'schedules', (select jsonb_agg(jsonb_build_object('days', jsonb_build_array(n % 7),
      'opensOffset', 510, 'dueOffset', 555, 'recipient', pg_temp.to_dept('kitchen')))
      from generate_series(1, 8) as n)))$$,
  '22023', null, 'a template has at most 7 schedules'
);
select throws_ok(
  $$select pg_temp.save_x('{"name": "F", "colour": "red", "items": [{"kind": "check", "label": "A"}]}')$$,
  '22023', null, 'and nothing it doesn''t know'
);

select throws_ok(
  $$select public.save_list_template('73000000-0000-4000-a000-000000000002',
    '73000000-0000-4000-b000-000000000001',
    jsonb_build_object('id', pg_temp.id_of('t1'), 'name', 'Opening',
      'items', '[{"kind": "check", "label": "A"}]'::jsonb), 0)$$,
  '40001', null, 'a save behind the version it read is refused'
);
select lives_ok(
  $$select public.save_list_template('73000000-0000-4000-a000-000000000002',
    '73000000-0000-4000-b000-000000000001',
    jsonb_build_object(
      'id', pg_temp.id_of('t1'), 'name', 'Opening', 'note', 'Before the doors open',
      'recipient', pg_temp.to_dept('kitchen'),
      'items', jsonb_build_array(
        jsonb_build_object('id', pg_temp.id_of('t1-fridge'), 'kind', 'number',
          'label', 'Main fridge', 'unit', 'C', 'min', 0, 'max', 5),
        jsonb_build_object('id', pg_temp.id_of('t1-clean'), 'kind', 'check', 'label', 'Clean'),
        jsonb_build_object('kind', 'note', 'label', 'Notes', 'required', false)),
      'schedules', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.id_of('t1-schedule'), 'days', '[0, 1, 2, 3, 4, 5]'::jsonb,
        'opensOffset', 510, 'dueOffset', 555, 'recipient', pg_temp.to_dept('kitchen')))),
    1)$$,
  'a save at the version it read goes through'
);
select is(
  (select version from public.list_templates where id = pg_temp.id_of('t1')),
  2,
  'and moves the version on'
);
select is(
  (select string_agg(
     case when i.id in (pg_temp.id_of('t1-fridge'), pg_temp.id_of('t1-clean'))
       then 'kept:' else 'new:' end || i.label,
     ',' order by i.position)
   from public.list_template_items i where i.template_id = pg_temp.id_of('t1')),
  'kept:Main fridge,kept:Clean,new:Notes',
  'items keep their ids, a missing one goes and a new one comes'
);
select is(
  (select array_to_string(s.days, ',') from public.list_schedules s
   where s.template_id = pg_temp.id_of('t1') and s.id = pg_temp.id_of('t1-schedule')),
  '0,1,2,3,4,5',
  'and a schedule is edited in place, keeping its id'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('id', pg_temp.id_of('ty'), 'name', 'Mine',
    'items', '[{"kind": "check", "label": "A"}]'::jsonb))$$,
  'P0002', null, 'another business''s template is unknown here'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('id', pg_temp.id_of('t1'), 'name', 'Opening',
    'items', jsonb_build_array(jsonb_build_object('id', pg_temp.id_of('ty-item'),
      'kind', 'check', 'label', 'A'))))$$,
  '22023', 'Not an item of this template', 'and so is another template''s item'
);
select lives_ok(
  $$select public.save_list_template('73000000-0000-4000-a000-00000000000b',
    '73000000-0000-4000-b000-000000000003',
    '{"name": "Team made", "items": [{"kind": "check", "label": "One"}]}')$$,
  'the ConceptApp team saves templates for a business it sets up'
);

------------------------------------------------------------------------------
-- Removing a template, and the undo

select throws_ok(
  $$select public.archive_list_template('73000000-0000-4000-a000-000000000003', pg_temp.id_of('t3'))$$,
  '42501', null, 'a worker does not remove a template'
);
select throws_ok(
  $$select public.archive_list_template('73000000-0000-4000-a000-00000000000a', pg_temp.id_of('t3'))$$,
  'P0002', null, 'and to another business it is unknown'
);
select lives_ok(
  $$select public.archive_list_template('73000000-0000-4000-a000-000000000002', pg_temp.id_of('t3'))$$,
  'a list manager removes one'
);
select public.archive_list_template('73000000-0000-4000-a000-000000000002', pg_temp.id_of('t3'));
select is(
  (select count(*)::integer from public.audit_log
   where action = 'lists.template.archive' and details ->> 'template' = pg_temp.id_of('t3')::text),
  1,
  'once: removing it again changes nothing'
);
select throws_ok(
  $$select pg_temp.save_x(jsonb_build_object('id', pg_temp.id_of('t3'), 'name', 'Spare',
    'items', '[{"kind": "check", "label": "One"}]'::jsonb))$$,
  '55000', null, 'a removed template is not edited'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('t3'),
    'recipient', '{"kind": "role", "role": "worker"}'::jsonb), '2026-11-11 08:00+00')$$,
  '55000', null, 'nor sent'
);
select lives_ok(
  $$select public.restore_list_template('73000000-0000-4000-a000-00000000000c', pg_temp.id_of('t3'))$$,
  'the team brings it back (the undo)'
);
select is(
  (select archived_at is null from public.list_templates where id = pg_temp.id_of('t3'))
  and exists (
    select 1 from public.audit_log
    where action = 'lists.template.restore' and details = jsonb_build_object('template', pg_temp.id_of('t3'), 'name', 'Spare')
  ),
  true,
  'and that is logged'
);
select public.archive_list_template('73000000-0000-4000-a000-000000000002', pg_temp.id_of('t3'));

------------------------------------------------------------------------------
-- Sending

select throws_ok(
  $$select public.send_list('73000000-0000-4000-a000-000000000003',
    '73000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id_of('t1'), 'recipient', pg_temp.to_dept('kitchen')),
    '2026-11-11 08:00+00')$$,
  '42501', null, 'a worker does not send a list'
);

insert into ids values ('l1', pg_temp.send_x(jsonb_build_object(
  'template', pg_temp.id_of('t1'), 'recipient', pg_temp.to_dept('kitchen'),
  'dueAt', '2026-11-11T10:00:00Z', 'note', 'Today too'), '2026-11-11 08:00+00'));
select is(
  (select name || '|' || note || '|' || origin || '|' || status || '|' || recipient_kind
     || '|' || (sent_by = '73000000-0000-4000-a000-000000000002')
     || '|' || (opens_at = '2026-11-11 08:00+00' and due_at = '2026-11-11 10:00+00')
   from public.lists where id = pg_temp.id_of('l1')),
  'Opening|Before the doors open' || E'\n' || 'Today too|sent|open|department|true|true',
  'a manager sends a template to a department, with the template''s note and their own'
);
select results_eq(
  $$select label, kind, required, requested from public.list_items
    where list_id = pg_temp.id_of('l1') order by position$$,
  $$values ('Main fridge'::text, 'number'::text, true, null::integer),
    ('Clean', 'check', true, null), ('Notes', 'note', false, null)$$,
  'with a copy of its items'
);
select is(
  pg_temp.item_of('l1', 'Main fridge') is not null
  and (select template_item_id from public.list_items where id = pg_temp.item_of('l1', 'Main fridge'))
    = pg_temp.id_of('t1-fridge'),
  true,
  'each remembering the template''s item, for readings over time'
);
select is(
  (select details from public.audit_log
   where action = 'lists.send' and details ->> 'list' = pg_temp.id_of('l1')::text),
  jsonb_build_object(
    'list', pg_temp.id_of('l1'), 'template', pg_temp.id_of('t1'), 'name', 'Opening',
    'recipient', jsonb_build_object('kind', 'department', 'id', pg_temp.id_of('kitchen')),
    'from_department', null, 'due_at', '2026-11-11 10:00+00'::timestamptz
  ),
  'logged with whom it went to'
);

insert into ids values ('l2', pg_temp.send_x(jsonb_build_object(
  'name', 'Fix the door', 'items', '[{"kind": "check", "label": "Door"}]'::jsonb,
  'recipient', '{"kind": "person", "user": "73000000-0000-4000-a000-000000000005"}'::jsonb),
  '2026-11-11 08:05+00'));
select is(
  (select array_agg(user_id) from public.list_people where list_id = pg_temp.id_of('l2')),
  array['73000000-0000-4000-a000-000000000005']::uuid[],
  'a list typed when sending goes to its person, who is among its people'
);
insert into ids values ('l3', pg_temp.send_x(jsonb_build_object(
  'template', pg_temp.id_of('t1'), 'recipient', '{"kind": "role", "role": "worker"}'::jsonb,
  'dueAt', '2026-11-11T09:00:00Z'), '2026-11-11 08:10+00'));

select throws_ok(
  $$select public.send_list('73000000-0000-4000-a000-000000000004',
    '73000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id_of('t2'), 'recipient', pg_temp.to_dept('bar')),
    '2026-11-11 08:15+00')$$,
  '42501', null, 'the department that asks sends its order only where the template says'
);
select throws_ok(
  $$select public.send_list('73000000-0000-4000-a000-000000000005',
    '73000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id_of('t2'), 'recipient', pg_temp.to_dept('storeroom')),
    '2026-11-11 08:15+00')$$,
  '42501', null, 'and nobody outside it sends it'
);
insert into ids values ('l4', public.send_list('73000000-0000-4000-a000-000000000004',
  '73000000-0000-4000-b000-000000000001',
  jsonb_build_object('template', pg_temp.id_of('t2'), 'recipient', pg_temp.to_dept('storeroom'),
    'quantities', jsonb_build_object(pg_temp.id_of('t2-ice')::text, 3)),
  '2026-11-11 08:15+00'));
select results_eq(
  $$select label, requested from public.list_items where list_id = pg_temp.id_of('l4') order by position$$,
  $$values ('Ice'::text, 3), ('Lemons', 20)$$,
  'a bar worker sends the bar''s order to the storeroom, with a count per item'
);
select is(
  (select from_department = pg_temp.id_of('bar') and asks_quantities
   from public.lists where id = pg_temp.id_of('l4')),
  true,
  'and the list knows who asked'
);

insert into ids values ('l5', public.send_list('73000000-0000-4000-a000-000000000007',
  '73000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Evening prep', 'items', '[{"kind": "check", "label": "Prep"}]'::jsonb,
    'recipient', jsonb_build_object('kind', 'shift', 'shift', pg_temp.id_of('shift'))),
  '2026-11-11 08:20+00'));
select is(
  (select array_agg(user_id) from public.list_people where list_id = pg_temp.id_of('l5')),
  array['73000000-0000-4000-a000-00000000000d']::uuid[],
  'someone holding lists.send sends a list to a shift, which goes to its people'
);
select is(
  (select shift from public.lists where id = pg_temp.id_of('l5')),
  '{"day": "2026-11-15", "name": "Evening", "start": "16:00", "end": "23:00"}'::jsonb,
  'and keeps the shift as it was'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('name', 'Prep', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'recipient', jsonb_build_object('kind', 'shift', 'shift', pg_temp.id_of('draft-shift'))),
    '2026-11-18 08:00+00')$$,
  '22023', 'Not a published shift of this business', 'only a published shift'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('name', 'Prep', 'items', '[{"kind": "check", "label": "A"}]'::jsonb,
    'recipient', jsonb_build_object('kind', 'shift', 'shift', pg_temp.id_of('shift'))),
    '2026-11-01 08:00+00')$$,
  '22023', 'A shift from today to a week ahead', 'from today to a week ahead'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('t1'),
    'recipient', pg_temp.to_dept('kitchen'), 'dueAt', '2026-11-11T07:00:00Z'), '2026-11-11 08:00+00')$$,
  '22023', null, 'a due time is after it is sent'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('t1'),
    'recipient', pg_temp.to_dept('kitchen'), 'dueAt', '2026-11-26T08:00:00Z'), '2026-11-11 08:00+00')$$,
  '22023', null, 'and within two weeks'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('t1'),
    'recipient', pg_temp.to_dept('kitchen'),
    'quantities', jsonb_build_object(pg_temp.id_of('t1-clean')::text, 2)), '2026-11-11 08:00+00')$$,
  '22023', null, 'counts are for templates that ask for them'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('t1'),
    'items', '[{"kind": "check", "label": "A"}]'::jsonb, 'recipient', pg_temp.to_dept('kitchen')),
    '2026-11-11 08:00+00')$$,
  '22023', null, 'a list from a template has the template''s items'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('name', 'Empty', 'recipient', pg_temp.to_dept('kitchen')),
    '2026-11-11 08:00+00')$$,
  '22023', null, 'a typed list has items'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('ty'),
    'recipient', pg_temp.to_dept('kitchen')), '2026-11-11 08:00+00')$$,
  'P0002', null, 'another business''s template is unknown here'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('t1'),
    'recipient', '{"kind": "person", "user": "73000000-0000-4000-a000-00000000000a"}'::jsonb),
    '2026-11-11 08:00+00')$$,
  '22023', 'Not an active member of this business', 'a list goes to someone in the business'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('t1'),
    'recipient', pg_temp.to_dept('old')), '2026-11-11 08:00+00')$$,
  '22023', null, 'or to a live department'
);
select throws_ok(
  $$select public.send_list('73000000-0000-4000-a000-00000000000a',
    '73000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id_of('t1'), 'recipient', pg_temp.to_dept('kitchen')),
    '2026-11-11 08:00+00')$$,
  '42501', null, 'someone from another business sends nothing here'
);

insert into ids values ('ly', public.send_list('73000000-0000-4000-a000-000000000009',
  '73000000-0000-4000-b000-000000000002',
  jsonb_build_object('template', pg_temp.id_of('ty'),
    'recipient', '{"kind": "person", "user": "73000000-0000-4000-a000-00000000000a"}'::jsonb),
  '2026-11-11 08:00+00'));

-- What L5 will write: the opening list passed through the bar, and the door
-- passed on to the storeroom.
insert into public.list_passes (list_id, business_id, from_department, to_department, passed_by)
values
  (pg_temp.id_of('l1'), '73000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen'),
   pg_temp.id_of('bar'), '73000000-0000-4000-a000-000000000003'),
  (pg_temp.id_of('l2'), '73000000-0000-4000-b000-000000000001', null,
   pg_temp.id_of('storeroom'), '73000000-0000-4000-a000-000000000005');
update public.lists
set recipient_kind = 'department', recipient_department = pg_temp.id_of('storeroom')
where id = pg_temp.id_of('l2');

------------------------------------------------------------------------------
-- Who reads which list

select pg_temp.sign_in('73000000-0000-4000-a000-000000000001');
select is(pg_temp.seen(), 'l1,l2,l3,l4,l5', 'the owner reads every list of the business');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000002');
select is(pg_temp.seen(), 'l1,l2,l3,l4,l5', 'and so does a manager');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000006');
select is(pg_temp.seen(), 'l1,l2,l3,l4,l5', 'and a worker holding lists.manage');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000003');
select is(pg_temp.seen(), 'l1,l3', 'the kitchen reads what went to the kitchen, and to every worker');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000004');
select is(pg_temp.seen(), 'l1,l3,l4', 'the bar reads its order, and a list that passed through it');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000005');
select is(pg_temp.seen(), 'l2,l3', 'a person keeps reading a list given to them after it is passed on');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-00000000000e');
select is(pg_temp.seen(), 'l2,l3,l4', 'the storeroom reads what it holds');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-00000000000d');
select is(pg_temp.seen(), 'l3,l5', 'the people of a shift read the list sent to it');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000007');
select is(pg_temp.seen(), 'l3,l5', 'whoever sent a list reads it');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000008');
select is(pg_temp.seen(), '', 'a former member reads none, though still in the kitchen''s rows');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000009');
select is(pg_temp.seen(), 'ly', 'another business''s owner reads only their own');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-00000000000a');
select is(pg_temp.seen(), 'ly', 'and its worker, the list given to them');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-00000000000b');
select is(pg_temp.seen(), 'l1,l2,l3,l4,l5', 'the team viewing as a manager reads them all');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-00000000000c');
select is(pg_temp.seen(), '', 'and viewing as a worker, none: the team is nobody''s colleague');
reset role;

select pg_temp.sign_in('73000000-0000-4000-a000-000000000003');
select is(
  (select count(*)::integer from public.list_items),
  6,
  'items follow their list'
);
select is(
  (select count(*)::integer from public.list_passes),
  1,
  'and so do the passes'
);
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer from public.list_people) || '/'
    || (select count(*)::integer from public.list_passes),
  '2/2',
  'and the people'
);
reset role;

-- Templates: every member reads the live ones, list managers the removed one
-- too and the schedules.
select pg_temp.sign_in('73000000-0000-4000-a000-000000000003');
select is(pg_temp.templates_seen(), '2/5/0', 'a worker reads the live templates and their items');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000002');
select is(pg_temp.templates_seen(), '3/6/2', 'a manager reads the removed one too, and the times');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-000000000006');
select is(pg_temp.templates_seen(), '3/6/2', 'and so does a worker holding lists.manage');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-00000000000c');
select is(pg_temp.templates_seen(), '2/5/0', 'the team viewing as a worker reads what a worker reads');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-00000000000b');
select is(pg_temp.templates_seen(), '3/6/2', 'and as a manager, what a manager reads');
reset role;
select pg_temp.sign_in('73000000-0000-4000-a000-00000000000a');
select is(pg_temp.templates_seen(), '1/1/0', 'another business reads only its own');
select is(
  (select count(*)::integer from public.list_templates where business_id = '73000000-0000-4000-b000-000000000001')
  + (select count(*)::integer from public.list_template_items where business_id = '73000000-0000-4000-b000-000000000001')
  + (select count(*)::integer from public.list_schedules where business_id = '73000000-0000-4000-b000-000000000001')
  + (select count(*)::integer from public.lists where business_id = '73000000-0000-4000-b000-000000000001')
  + (select count(*)::integer from public.list_items where business_id = '73000000-0000-4000-b000-000000000001')
  + (select count(*)::integer from public.list_people where business_id = '73000000-0000-4000-b000-000000000001')
  + (select count(*)::integer from public.list_passes where business_id = '73000000-0000-4000-b000-000000000001'),
  0,
  'and nothing of X''s lists'
);
reset role;

-- The Lists tab counts what each person holds, not what they may read.
select is(
  public.my_open_lists('73000000-0000-4000-a000-000000000003', '73000000-0000-4000-b000-000000000001')
  || ',' || public.my_open_lists('73000000-0000-4000-a000-00000000000e', '73000000-0000-4000-b000-000000000001')
  || ',' || public.my_open_lists('73000000-0000-4000-a000-00000000000d', '73000000-0000-4000-b000-000000000001')
  || ',' || public.my_open_lists('73000000-0000-4000-a000-000000000001', '73000000-0000-4000-b000-000000000001')
  || ',' || public.my_open_lists('73000000-0000-4000-a000-00000000000a', '73000000-0000-4000-b000-000000000001'),
  '2,3,2,0,0',
  'the Lists tab counts the open lists a person holds: none for an owner who holds none'
);

-- Switched off, lists are gone, and the departments stay.
update public.business_modules set enabled = false
where business_id = '73000000-0000-4000-b000-000000000001' and module_key = 'lists';
select pg_temp.sign_in('73000000-0000-4000-a000-000000000002');
select is(
  pg_temp.seen() || '|' || pg_temp.templates_seen(),
  '|0/0/0',
  'with the module off, a manager reads no list, template or schedule'
);
select is(
  (select count(*)::integer from public.departments
   where business_id = '73000000-0000-4000-b000-000000000001'),
  4,
  'and still reads the departments, which are the business''s own'
);
reset role;
select is(
  public.my_open_lists('73000000-0000-4000-a000-000000000003', '73000000-0000-4000-b000-000000000001'),
  0,
  'the tab counts nothing'
);
select throws_ok(
  $$select pg_temp.send_x(jsonb_build_object('template', pg_temp.id_of('t1'),
    'recipient', pg_temp.to_dept('kitchen')), '2026-11-11 08:00+00')$$,
  '42501', 'Lists are off for this business', 'and nothing is sent'
);
select throws_ok(
  $$select pg_temp.save_x('{"name": "Off", "items": [{"kind": "check", "label": "A"}]}')$$,
  '42501', null, 'or saved'
);
update public.business_modules set enabled = true
where business_id = '73000000-0000-4000-b000-000000000001' and module_key = 'lists';

------------------------------------------------------------------------------
-- Filling

select is(
  public.set_list_item('73000000-0000-4000-a000-000000000003', pg_temp.item_of('l1', 'Clean'),
    '{"checked": true}', '2026-11-11 08:30+00'),
  '{"done": 1, "total": 3, "required": 2, "requiredLeft": 1}'::jsonb,
  'the kitchen ticks an item and hears how far the list is'
);
select is(
  (select done and done_by = '73000000-0000-4000-a000-000000000003'
     and done_at = '2026-11-11 08:30+00' and checked
   from public.list_items where id = pg_temp.item_of('l1', 'Clean')),
  true,
  'with who did it and when'
);
select throws_ok(
  $$select public.set_list_item('73000000-0000-4000-a000-000000000005',
    pg_temp.item_of('l1', 'Clean'), '{"checked": true}')$$,
  '42501', null, 'someone it is not for does not fill it'
);
select throws_ok(
  $$select public.set_list_item('73000000-0000-4000-a000-00000000000a',
    pg_temp.item_of('l1', 'Clean'), '{"checked": true}')$$,
  'P0002', null, 'to another business it is unknown'
);
select throws_ok(
  $$select public.set_list_item('73000000-0000-4000-a000-000000000003',
    '73000000-0000-4000-c000-000000000000', '{"checked": true}')$$,
  'P0002', null, 'as is an item that isn''t there'
);
select throws_ok(
  $$select public.set_list_item('73000000-0000-4000-a000-000000000003',
    pg_temp.item_of('l1', 'Clean'), '{"reading": 4}')$$,
  '22023', null, 'a check takes no reading'
);
select throws_ok(
  $$select public.set_list_item('73000000-0000-4000-a000-000000000003',
    pg_temp.item_of('l1', 'Clean'), '{"given": 4}')$$,
  '22023', null, 'and a count only on an order'
);
select throws_ok(
  $$select public.set_list_item('73000000-0000-4000-a000-000000000003',
    pg_temp.item_of('l1', 'Notes'), jsonb_build_object('answer', repeat('a', 501)))$$,
  '22023', null, 'an answer has at most 500 characters'
);
select is(
  public.set_list_item('73000000-0000-4000-a000-000000000003', pg_temp.item_of('l1', 'Main fridge'),
    '{"reading": 7}', '2026-11-11 08:31+00') ->> 'requiredLeft',
  '0',
  'a reading outside the range is kept, for the list to flag'
);
select is(
  (select reading from public.list_items where id = pg_temp.item_of('l1', 'Main fridge')),
  7::numeric,
  'as read'
);
select is(
  public.set_list_item('73000000-0000-4000-a000-000000000003', pg_temp.item_of('l1', 'Clean'),
    null, '2026-11-11 08:32+00') ->> 'requiredLeft',
  '1',
  'clearing an item is the undo'
);
select is(
  (select done or checked is not null or done_by is not null or done_at is not null
   from public.list_items where id = pg_temp.item_of('l1', 'Clean')),
  false,
  'and leaves nobody''s name on it'
);
select throws_ok(
  $$select public.finish_list('73000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'),
    '2026-11-11 08:40+00')$$,
  '23514', '1 required items are left', 'a list with required items left does not finish'
);
select public.set_list_item('73000000-0000-4000-a000-000000000003', pg_temp.item_of('l1', 'Clean'),
  '{"checked": true}', '2026-11-11 08:45+00');
select lives_ok(
  $$select public.set_list_item('73000000-0000-4000-a000-000000000006',
    pg_temp.item_of('l1', 'Notes'), '{"answer": "Milk", "comment": "Low on it"}', '2026-11-11 08:46+00')$$,
  'a list manager fills a list too, with a comment'
);
select is(
  (select answer || '|' || comment from public.list_items where id = pg_temp.item_of('l1', 'Notes')),
  'Milk|Low on it',
  'the answer and the comment are kept'
);

select public.set_list_item('73000000-0000-4000-a000-00000000000e', pg_temp.item_of('l4', 'Ice'),
  '{"given": 2}', '2026-11-11 08:50+00');
select is(
  (select checked::text || '/' || given from public.list_items where id = pg_temp.item_of('l4', 'Ice')),
  'true/2',
  'the storeroom says how many it gave'
);
select public.set_list_item('73000000-0000-4000-a000-00000000000e', pg_temp.item_of('l4', 'Lemons'),
  '{"checked": true}', '2026-11-11 08:51+00');
select is(
  (select given from public.list_items where id = pg_temp.item_of('l4', 'Lemons')),
  20,
  'and ticking gives what was asked for'
);

------------------------------------------------------------------------------
-- Finishing

select throws_ok(
  $$select public.finish_list('73000000-0000-4000-a000-000000000004', pg_temp.id_of('l1'),
    '2026-11-11 09:00+00')$$,
  '42501', null, 'a department it passed through does not finish it'
);
select lives_ok(
  $$select public.finish_list('73000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'),
    '2026-11-11 09:00+00')$$,
  'the kitchen finishes its list'
);
select is(
  (select status || '|' || (finished_by = '73000000-0000-4000-a000-000000000003')
     || '|' || (finished_at = '2026-11-11 09:00+00')
   from public.lists where id = pg_temp.id_of('l1')),
  'finished|true|true',
  'finished, by whom and when'
);
select is(
  (select details from public.audit_log
   where action = 'lists.finish' and details ->> 'list' = pg_temp.id_of('l1')::text),
  jsonb_build_object(
    'list', pg_temp.id_of('l1'), 'name', 'Opening', 'late', false, 'left_optional', 0,
    'from_department', null, 'sent_by', '73000000-0000-4000-a000-000000000002'
  ),
  'logged, on time'
);
select throws_ok(
  $$select public.set_list_item('73000000-0000-4000-a000-000000000003',
    pg_temp.item_of('l1', 'Main fridge'), '{"reading": 3}')$$,
  '55000', null, 'a finished list is frozen'
);
select throws_ok(
  $$select public.finish_list('73000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'))$$,
  '55000', null, 'and does not finish twice'
);
select public.set_list_item('73000000-0000-4000-a000-000000000005', pg_temp.item_of('l3', 'Main fridge'),
  '{"reading": 3}', '2026-11-11 09:50+00');
select public.set_list_item('73000000-0000-4000-a000-000000000005', pg_temp.item_of('l3', 'Clean'),
  '{"checked": true}', '2026-11-11 09:51+00');
select public.finish_list('73000000-0000-4000-a000-000000000005', pg_temp.id_of('l3'),
  '2026-11-11 10:00+00');
select is(
  (select (details ->> 'late') || '/' || (details ->> 'left_optional') from public.audit_log
   where action = 'lists.finish' and details ->> 'list' = pg_temp.id_of('l3')::text),
  'true/1',
  'a list finished well after it was due is logged late, with the optional items left'
);

------------------------------------------------------------------------------
-- Cancelling

select throws_ok(
  $$select public.cancel_list('73000000-0000-4000-a000-000000000005', pg_temp.id_of('l2'))$$,
  '42501', null, 'the person a list was given to does not cancel it'
);
insert into ids values ('l6', public.send_list('73000000-0000-4000-a000-000000000004',
  '73000000-0000-4000-b000-000000000001',
  jsonb_build_object('template', pg_temp.id_of('t2'), 'recipient', pg_temp.to_dept('storeroom')),
  '2026-11-11 08:25+00'));
select lives_ok(
  $$select public.cancel_list('73000000-0000-4000-a000-000000000004', pg_temp.id_of('l6'),
    '2026-11-11 08:30+00')$$,
  'the department that asked cancels its order'
);
select is(
  (select status || '|' || (closed_by = '73000000-0000-4000-a000-000000000004')
   from public.lists where id = pg_temp.id_of('l6')),
  'cancelled|true',
  'closed, by whom'
);
select lives_ok(
  $$select public.cancel_list('73000000-0000-4000-a000-000000000002', pg_temp.id_of('l2'))$$,
  'whoever sent a list cancels it'
);
select is(
  (select details from public.audit_log
   where action = 'lists.cancel' and details ->> 'list' = pg_temp.id_of('l2')::text),
  jsonb_build_object('list', pg_temp.id_of('l2'), 'name', 'Fix the door'),
  'logged'
);
select throws_ok(
  $$select public.cancel_list('73000000-0000-4000-a000-000000000002', pg_temp.id_of('l2'))$$,
  '55000', null, 'a closed list is not cancelled again'
);

------------------------------------------------------------------------------
-- Opening again

select throws_ok(
  $$select public.reopen_list('73000000-0000-4000-a000-000000000002', pg_temp.id_of('l4'))$$,
  '55000', null, 'an open list does not open again'
);
select lives_ok(
  $$select public.reopen_list('73000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'),
    '2026-11-11 09:04+00')$$,
  'whoever finished a list opens it again within 5 minutes (the undo)'
);
select is(
  (select status || '|' || coalesce(finished_at::text, 'none') from public.lists where id = pg_temp.id_of('l1')),
  'open|none',
  'open again'
);
select is(
  (select details from public.audit_log
   where action = 'lists.reopen' and details ->> 'list' = pg_temp.id_of('l1')::text),
  jsonb_build_object('list', pg_temp.id_of('l1'), 'name', 'Opening', 'was', 'finished'),
  'logged, with what it was'
);
select public.finish_list('73000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'),
  '2026-11-11 09:10+00');
select throws_ok(
  $$select public.reopen_list('73000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'),
    '2026-11-11 09:16+00')$$,
  '42501', null, 'after 5 minutes it is a list manager''s to open'
);
select lives_ok(
  $$select public.reopen_list('73000000-0000-4000-a000-000000000002', pg_temp.id_of('l1'),
    '2026-11-11 12:00+00')$$,
  'and a list manager opens it at any time'
);
select lives_ok(
  $$select public.reopen_list('73000000-0000-4000-a000-000000000004', pg_temp.id_of('l6'),
    '2026-11-11 08:33+00')$$,
  'whoever cancelled a list opens it again within 5 minutes'
);
update public.lists set status = 'missed', closed_at = '2026-11-11 08:21+00'
where id = pg_temp.id_of('l5');
select throws_ok(
  $$select public.reopen_list('73000000-0000-4000-a000-000000000002', pg_temp.id_of('l5'))$$,
  '55000', null, 'a missed list stays missed'
);

------------------------------------------------------------------------------
-- A removed department asks for nothing, and the undo

insert into ids values ('l7', pg_temp.send_x(jsonb_build_object(
  'template', pg_temp.id_of('t2'), 'recipient', pg_temp.to_dept('storeroom')),
  '2026-11-11 09:00+00'));
select public.set_departments('73000000-0000-4000-a000-000000000001',
  '73000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "storeroom", "name": "Storeroom"}]');
select throws_ok(
  $$select public.send_list('73000000-0000-4000-a000-000000000004',
    '73000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id_of('t2'), 'recipient', pg_temp.to_dept('storeroom')),
    '2026-11-11 09:05+00')$$,
  '42501', null, 'once the bar is removed, its people no longer send its order'
);
select throws_ok(
  $$select public.cancel_list('73000000-0000-4000-a000-000000000004', pg_temp.id_of('l7'),
    '2026-11-11 09:05+00')$$,
  '42501', null, 'nor cancel one it asked for'
);
select public.set_departments('73000000-0000-4000-a000-000000000001',
  '73000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "storeroom", "name": "Storeroom"}]');
select lives_ok(
  $$select public.send_list('73000000-0000-4000-a000-000000000004',
    '73000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id_of('t2'), 'recipient', pg_temp.to_dept('storeroom')),
    '2026-11-11 09:10+00')$$,
  'brought back, with its people, the bar sends its order again'
);

------------------------------------------------------------------------------
-- Nobody writes from the browser

select pg_temp.sign_in('73000000-0000-4000-a000-000000000002');
select throws_ok(
  $$insert into public.lists (business_id, name, origin, recipient_kind, recipient_role, opens_at)
    values ('73000000-0000-4000-b000-000000000001', 'Mine', 'sent', 'role', 'worker', now())$$,
  '42501', null, 'a manager cannot write a list directly'
);
select throws_ok(
  $$update public.list_items set checked = true$$,
  '42501', null, 'nor tick an item directly'
);
select throws_ok(
  $$delete from public.list_templates$$,
  '42501', null, 'nor delete a template'
);
reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.lists',
  '42501', null, 'an anonymous visitor reads no list'
);
reset role;

------------------------------------------------------------------------------
-- Caps, since the hosted demo is open to anyone

insert into public.list_templates (business_id, name)
select '73000000-0000-4000-b000-000000000003', 'Cap ' || n from generate_series(1, 99) as n;
select throws_ok(
  $$select public.save_list_template('73000000-0000-4000-a000-00000000000f',
    '73000000-0000-4000-b000-000000000003',
    '{"name": "One more", "items": [{"kind": "check", "label": "A"}]}')$$,
  '22023', 'A business keeps at most 100 lists', 'a business keeps at most 100 templates'
);
insert into public.lists (business_id, name, origin, recipient_kind, recipient_role, opens_at)
select '73000000-0000-4000-b000-000000000003', 'Cap ' || n, 'sent', 'role', 'worker', now()
from generate_series(1, 500) as n;
select throws_ok(
  $$select public.send_list('73000000-0000-4000-a000-00000000000f',
    '73000000-0000-4000-b000-000000000003',
    '{"name": "One more", "items": [{"kind": "check", "label": "A"}],
      "recipient": {"kind": "role", "role": "worker"}}')$$,
  '22023', 'A business keeps at most 500 open lists', 'and at most 500 open lists'
);
-- Opening a list again and bringing a template back meet the same caps: one
-- list cancelled, one more sent in its place, and the cancelled one reopened.
insert into ids
select 'cap-1', l.id from public.lists l
where l.business_id = '73000000-0000-4000-b000-000000000003' and l.name = 'Cap 1';
select public.cancel_list('73000000-0000-4000-a000-00000000000f', pg_temp.id_of('cap-1'));
insert into ids values ('cap-more', public.send_list('73000000-0000-4000-a000-00000000000f',
  '73000000-0000-4000-b000-000000000003',
  '{"name": "One more", "items": [{"kind": "check", "label": "A"}],
    "recipient": {"kind": "role", "role": "worker"}}'));
select throws_ok(
  $$select public.reopen_list('73000000-0000-4000-a000-00000000000f', pg_temp.id_of('cap-1'))$$,
  '22023', 'A business keeps at most 500 open lists', 'opening a list again keeps to the cap'
);
insert into public.list_templates (business_id, name, archived_at)
values ('73000000-0000-4000-b000-000000000003', 'Cap removed', now());
insert into ids
select 'cap-removed', t.id from public.list_templates t
where t.business_id = '73000000-0000-4000-b000-000000000003' and t.name = 'Cap removed';
select throws_ok(
  $$select public.restore_list_template('73000000-0000-4000-a000-00000000000f',
    pg_temp.id_of('cap-removed'))$$,
  '22023', 'A business keeps at most 100 lists', 'and so does bringing a template back'
);

------------------------------------------------------------------------------
-- People leave; what they did stays

insert into public.list_schedules (
  template_id, business_id, days, opens_offset, due_offset, recipient_kind, recipient_user, starts_on
)
values (
  pg_temp.id_of('t1'), '73000000-0000-4000-b000-000000000001', '{1}', 600, 630, 'person',
  '73000000-0000-4000-a000-000000000005', '2026-11-11'
);
-- Their employment periods are kept (20261110000600_payroll_details.sql) and
-- hold their place in the business: a purge that names it takes them first,
-- for this test, so only the lists are left to show what stays.
select set_config('ca.records_purge', '73000000-0000-4000-b000-000000000001', true);
delete from public.employment_periods
where business_id = '73000000-0000-4000-b000-000000000001'
  and user_id in ('73000000-0000-4000-a000-000000000005', '73000000-0000-4000-a000-000000000003');
select set_config('ca.records_purge', '', true);
select lives_ok(
  $$delete from auth.users where id = '73000000-0000-4000-a000-000000000005'$$,
  'deleting someone a schedule names goes through'
);
select is(
  (select count(*)::integer from public.list_schedules
   where recipient_user = '73000000-0000-4000-a000-000000000005'),
  0,
  'and the schedule goes with them'
);
select lives_ok(
  $$delete from auth.users where id = '73000000-0000-4000-a000-000000000003'$$,
  'and so does deleting someone who filled and finished lists'
);
select is(
  (select done and done_by is null and done_at is not null
   from public.list_items where id = pg_temp.item_of('l1', 'Clean')),
  true,
  'whose items stay done, with when'
);

select * from finish();
rollback;
