-- Lists on (20261109000700_lists_on.sql): the undo right after sending
-- (public.cancel_unstarted_list) takes a list back only while nobody has
-- started it, under cancel_list's rules, and is the server's alone; and the
-- backfill (private.backfill_lists) gives a business opened before lists its
-- template's departments and lists, and lists on where their tab fits, and
-- leaves what a business already has as it is. Fixed ids of their own and
-- explicit times.
begin;
select plan(17);

insert into auth.users (id, aud, role, phone)
values
  ('75000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500002501'),
  ('75000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500002502'),
  ('75000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500002503'),
  ('75000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500002504');

-- U: 1 owner, 2 manager; workers 3 (kitchen) and 4 (no department).
-- V, W and X were opened from the restaurant template before lists: V with
-- the schedule and the clock, W with every module that has a tab, X with a
-- department of its own already.
insert into public.businesses (id, slug, name, template_key, template_version)
values
  ('75000000-0000-4000-b000-000000000001', 'lists-on-u', 'Lists on U', null, null),
  ('75000000-0000-4000-b000-000000000002', 'lists-on-v', 'Lists on V', 'restaurant', 1),
  ('75000000-0000-4000-b000-000000000003', 'lists-on-w', 'Lists on W', 'restaurant', 1),
  ('75000000-0000-4000-b000-000000000004', 'lists-on-x', 'Lists on X', 'restaurant', 1);

insert into public.memberships (business_id, user_id, role, active)
values
  ('75000000-0000-4000-b000-000000000001', '75000000-0000-4000-a000-000000000001', 'owner', true),
  ('75000000-0000-4000-b000-000000000001', '75000000-0000-4000-a000-000000000002', 'manager', true),
  ('75000000-0000-4000-b000-000000000001', '75000000-0000-4000-a000-000000000003', 'worker', true),
  ('75000000-0000-4000-b000-000000000001', '75000000-0000-4000-a000-000000000004', 'worker', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('75000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('75000000-0000-4000-b000-000000000002', 'scheduling', true, '{}'),
  ('75000000-0000-4000-b000-000000000002', 'time_clock', true, '{}'),
  ('75000000-0000-4000-b000-000000000002', 'lists', false, '{}'),
  ('75000000-0000-4000-b000-000000000003', 'scheduling', true, '{}'),
  ('75000000-0000-4000-b000-000000000003', 'time_clock', true, '{}'),
  ('75000000-0000-4000-b000-000000000003', 'reservations', true, '{}'),
  ('75000000-0000-4000-b000-000000000003', 'storefront', true, '{}'),
  ('75000000-0000-4000-b000-000000000003', 'lists', false, '{}'),
  ('75000000-0000-4000-b000-000000000004', 'scheduling', true, '{}'),
  ('75000000-0000-4000-b000-000000000004', 'lists', false, '{}');

insert into public.departments (business_id, key, name, position)
values ('75000000-0000-4000-b000-000000000004', 'own', 'Our own', 0);

create temporary table ids (name text primary key, id uuid) on commit drop;

create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
create function pg_temp.item_of(saved text, item_label text) returns uuid language sql as $$
  select i.id from public.list_items i
  where i.list_id = pg_temp.id_of(saved) and i.label = item_label
$$;
-- Sends U's kitchen list, by its manager.
create function pg_temp.send(at_time timestamptz) returns uuid language sql as $$
  select public.send_list('75000000-0000-4000-a000-000000000002',
    '75000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', pg_temp.id_of('t1'),
      'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.id_of('kitchen'))),
    at_time)
$$;

select public.set_departments('75000000-0000-4000-a000-000000000001',
  '75000000-0000-4000-b000-000000000001', '[{"key": "kitchen", "name": "Kitchen"}]');
insert into ids
select d.key, d.id from public.departments d
where d.business_id = '75000000-0000-4000-b000-000000000001';
select public.set_department_members('75000000-0000-4000-a000-000000000001',
  '75000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen'),
  array['75000000-0000-4000-a000-000000000003']::uuid[]);
insert into ids
select 't1', (public.save_list_template('75000000-0000-4000-a000-000000000002',
  '75000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Kitchen list',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.id_of('kitchen')),
    'items', '[{"kind": "check", "label": "A"}, {"kind": "check", "label": "B"}]'::jsonb)) ->> 'id')::uuid;

------------------------------------------------------------------------------
-- Server only

select ok(
  not has_function_privilege('authenticated', 'public.cancel_unstarted_list(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.cancel_unstarted_list(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.cancel_unstarted_list(uuid, uuid, timestamptz)', 'execute'),
  'the undo after sending is the server''s alone'
);
select ok(
  not has_function_privilege('authenticated', 'private.backfill_lists(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.backfill_lists(uuid)', 'execute'),
  'and the backfill is nobody''s but the migration''s'
);

------------------------------------------------------------------------------
-- Taking a sending back

insert into ids values ('l1', pg_temp.send('2026-11-11 08:00+00'));
select lives_ok(
  $$select public.cancel_unstarted_list('75000000-0000-4000-a000-000000000002', pg_temp.id_of('l1'),
    '2026-11-11 08:01+00')$$,
  'whoever sent a list takes it back while nobody has started it'
);
select is(
  (select status || '|' || (closed_by = '75000000-0000-4000-a000-000000000002')
   from public.lists where id = pg_temp.id_of('l1')),
  'cancelled|true',
  'cancelled, by them'
);
select is(
  (select count(*)::integer from public.audit_log
   where action = 'lists.cancel' and details ->> 'list' = pg_temp.id_of('l1')::text),
  1,
  'and logged as cancel_list logs it'
);

insert into ids values ('l2', pg_temp.send('2026-11-11 08:10+00'));
select public.set_list_item('75000000-0000-4000-a000-000000000003', pg_temp.item_of('l2', 'A'),
  '{"checked": true}', '2026-11-11 08:11+00');
select throws_ok(
  $$select public.cancel_unstarted_list('75000000-0000-4000-a000-000000000002', pg_temp.id_of('l2'),
    '2026-11-11 08:12+00')$$,
  '55000', null, 'once an item is ticked, the sending stays'
);
select is(
  (select status || '|' || (select count(*) from public.audit_log
     where action = 'lists.cancel' and details ->> 'list' = pg_temp.id_of('l2')::text)
   from public.lists where id = pg_temp.id_of('l2')),
  'open|0',
  'still open, and nothing logged'
);
select lives_ok(
  $$select public.cancel_list('75000000-0000-4000-a000-000000000002', pg_temp.id_of('l2'),
    '2026-11-11 08:13+00')$$,
  'cancel_list itself still cancels a started list'
);

insert into ids values ('l3', pg_temp.send('2026-11-11 08:20+00'));
select public.set_list_item('75000000-0000-4000-a000-000000000003', pg_temp.item_of('l3', 'B'),
  '{"comment": "No soap left"}', '2026-11-11 08:21+00');
select throws_ok(
  $$select public.cancel_unstarted_list('75000000-0000-4000-a000-000000000002', pg_temp.id_of('l3'),
    '2026-11-11 08:22+00')$$,
  '55000', null, 'a comment on an item counts as starting it'
);

insert into ids values ('l4', pg_temp.send('2026-11-11 08:30+00'));
select throws_ok(
  $$select public.cancel_unstarted_list('75000000-0000-4000-a000-000000000004', pg_temp.id_of('l4'),
    '2026-11-11 08:31+00')$$,
  '42501', null, 'cancel_list''s rules hold: a worker who did not send it does not take it back'
);
select throws_ok(
  $$select public.cancel_unstarted_list('75000000-0000-4000-a000-000000000002',
    '75000000-0000-4000-c000-000000000099', '2026-11-11 08:31+00')$$,
  'P0002', null, 'nor does anyone take back a list that isn''t there'
);

------------------------------------------------------------------------------
-- The backfill

select private.backfill_lists(b.id)
from public.businesses b
where b.id in (
  '75000000-0000-4000-b000-000000000002', '75000000-0000-4000-b000-000000000003',
  '75000000-0000-4000-b000-000000000004'
);
select is(
  (select count(*)::integer from public.departments
   where business_id = '75000000-0000-4000-b000-000000000002'),
  (select jsonb_array_length(t.definition -> 'departments')
   from public.templates t where t.key = 'restaurant'),
  'a business opened before lists gets its template''s departments'
);
select is(
  (select count(*)::integer from public.list_templates
   where business_id = '75000000-0000-4000-b000-000000000002'),
  (select jsonb_array_length(t.definition -> 'listTemplates')
   from public.templates t where t.key = 'restaurant'),
  'and its lists'
);
select ok(
  (select enabled from public.business_modules
   where business_id = '75000000-0000-4000-b000-000000000002' and module_key = 'lists'),
  'and lists on, beside the schedule and the clock'
);
select is(
  (select (select count(*) from public.departments d where d.business_id = b.id)::text || '|'
     || (select bm.enabled from public.business_modules bm
         where bm.business_id = b.id and bm.module_key = 'lists')::text
   from public.businesses b where b.id = '75000000-0000-4000-b000-000000000003'),
  (select jsonb_array_length(t.definition -> 'departments')::text || '|false'
   from public.templates t where t.key = 'restaurant'),
  'with four tabs already, a business gets the content and keeps lists off'
);
select is(
  (select string_agg(key || ':' || name, ',') from public.departments
   where business_id = '75000000-0000-4000-b000-000000000004'),
  'own:Our own',
  'a business with a department of its own keeps its departments as they are'
);
select ok(
  (select count(*) = 0 from public.list_templates
   where business_id = '75000000-0000-4000-b000-000000000004')
  and (select enabled from public.business_modules
       where business_id = '75000000-0000-4000-b000-000000000004' and module_key = 'lists'),
  'gets no template lists, and has lists on'
);

select * from finish();
rollback;
