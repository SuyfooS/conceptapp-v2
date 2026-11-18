-- Passing lists between departments (20261110001400_lists_pass.sql): an
-- order asked by the bar, with its counts, is given at the storeroom and
-- passed back; who may pass a list and to where, the pass rows and the log,
-- the new department holding and filling it while the old one only reads it,
-- and the lines: the new department told, the old holders' lines settled, the
-- department that asked told it is finished. Fixed ids of its own and
-- explicit times.
begin;
select plan(39);

insert into auth.users (id, aud, role, phone)
values
  ('82000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500003501'),
  ('82000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500003502'),
  ('82000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500003503'),
  ('82000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500003504'),
  ('82000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500003505'),
  ('82000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500003506'),
  ('82000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500003507'),
  ('82000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500003508'),
  ('82000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500003509'),
  ('82000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500003510');

-- P: 1 owner, 2 manager; workers 3 and 8 (bar), 4 (storeroom), 5 (kitchen),
-- 6 (no department), 7 (no department, holds lists.manage); 9 a former
-- worker still in the storeroom's rows. Q: a, its owner, with a bar of its own.
insert into public.businesses (id, slug, name)
values
  ('82000000-0000-4000-b000-000000000001', 'lists-pass-p', 'Lists pass P'),
  ('82000000-0000-4000-b000-000000000002', 'lists-pass-q', 'Lists pass Q');

insert into public.memberships (business_id, user_id, role, perms, active)
values
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000001', 'owner', '{}', true),
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000002', 'manager', '{}', true),
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000003', 'worker', '{}', true),
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000004', 'worker', '{}', true),
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000005', 'worker', '{}', true),
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000006', 'worker', '{}', true),
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000007', 'worker', '{lists.manage}', true),
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000008', 'worker', '{}', true),
  ('82000000-0000-4000-b000-000000000001', '82000000-0000-4000-a000-000000000009', 'worker', '{}', false),
  ('82000000-0000-4000-b000-000000000002', '82000000-0000-4000-a000-00000000000a', 'owner', '{}', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('82000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('82000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('82000000-0000-4000-b000-000000000002', 'lists', true, '{}'),
  ('82000000-0000-4000-b000-000000000002', 'notifications', true, '{}');

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
create function pg_temp.item_of(list_name text, item_label text) returns uuid language sql as $$
  select i.id from public.list_items i
  where i.list_id = pg_temp.id_of(list_name) and i.label = item_label
$$;
create function pg_temp.titem_of(template_name text, item_label text) returns uuid language sql as $$
  select i.id from public.list_template_items i
  where i.template_id = pg_temp.id_of(template_name) and i.label = item_label
$$;
-- Who in P has a line about `thing` (its dedupe key), of this kind when one is
-- given; who has it unread; and how many lines about it are settled.
create function pg_temp.who(what text, thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '82000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and (what is null or n.kind = what)
$$;
create function pg_temp.unread(thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '82000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and n.read_at is null
$$;
create function pg_temp.settled(thing text) returns text language sql as $$
  select count(*)::text || '/' || count(n.resolved_at)::text
  from public.notifications n
  where n.business_id = '82000000-0000-4000-b000-000000000001' and n.dedupe_key = thing
$$;
-- Passes a list of P.
create function pg_temp.pass(actor uuid, saved text, department text, pass_note text, at_time timestamptz)
returns void language sql as $$
  select public.pass_list(actor, pg_temp.id_of(saved), pg_temp.id_of(department), pass_note, at_time)
$$;

-- P's departments: bar (3, 8), storeroom (4, and the former 9), kitchen (5),
-- and one removed since. Q has a bar of its own.
select public.set_departments('82000000-0000-4000-a000-000000000001',
  '82000000-0000-4000-b000-000000000001',
  '[{"key": "bar", "name": "Bar"}, {"key": "storeroom", "name": "Storeroom"},
    {"key": "kitchen", "name": "Kitchen"}, {"key": "old", "name": "Old"}]');
select public.set_departments('82000000-0000-4000-a000-00000000000a',
  '82000000-0000-4000-b000-000000000002', '[{"key": "bar", "name": "Bar"}]');
insert into ids
select d.key, d.id from public.departments d
where d.business_id = '82000000-0000-4000-b000-000000000001';
insert into ids
select 'q-bar', d.id from public.departments d
where d.business_id = '82000000-0000-4000-b000-000000000002';
select public.set_department_members('82000000-0000-4000-a000-000000000001',
  '82000000-0000-4000-b000-000000000001', pg_temp.id_of('bar'),
  array['82000000-0000-4000-a000-000000000003', '82000000-0000-4000-a000-000000000008']::uuid[]);
select public.set_department_members('82000000-0000-4000-a000-000000000001',
  '82000000-0000-4000-b000-000000000001', pg_temp.id_of('storeroom'),
  array['82000000-0000-4000-a000-000000000004']::uuid[]);
select public.set_department_members('82000000-0000-4000-a000-000000000001',
  '82000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen'),
  array['82000000-0000-4000-a000-000000000005']::uuid[]);
insert into public.department_members (department_id, business_id, user_id)
values (pg_temp.id_of('storeroom'), '82000000-0000-4000-b000-000000000001',
  '82000000-0000-4000-a000-000000000009');
select public.set_departments('82000000-0000-4000-a000-000000000001',
  '82000000-0000-4000-b000-000000000001',
  '[{"key": "bar", "name": "Bar"}, {"key": "storeroom", "name": "Storeroom"},
    {"key": "kitchen", "name": "Kitchen"}]');

-- The bar's order to the storeroom, with its usual counts.
insert into ids
select 't1', (public.save_list_template('82000000-0000-4000-a000-000000000002',
  '82000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Bar order', 'recipient', pg_temp.to_dept('storeroom'),
    'fromDepartment', pg_temp.id_of('bar'), 'asksQuantities', true,
    'items', '[{"kind": "check", "label": "Ice", "defaultQuantity": 2},
               {"kind": "check", "label": "Lemons", "defaultQuantity": 20}]'::jsonb)) ->> 'id')::uuid;

------------------------------------------------------------------------------
-- Server only

select ok(
  not has_function_privilege('authenticated', 'public.pass_list(uuid, uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.pass_list(uuid, uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.pass_list(uuid, uuid, uuid, text, timestamptz)', 'execute'),
  'passing a list is the server''s alone'
);

------------------------------------------------------------------------------
-- The bar asks, with its counts

-- Worker 3, in the bar, sends its order: 24 lemons, and the usual ice.
insert into ids values ('l1', public.send_list('82000000-0000-4000-a000-000000000003',
  '82000000-0000-4000-b000-000000000001',
  jsonb_build_object('template', pg_temp.id_of('t1'), 'recipient', pg_temp.to_dept('storeroom'),
    'quantities', jsonb_build_object(pg_temp.titem_of('t1', 'Lemons')::text, 24)),
  '2026-11-11 08:00+00'));
select results_eq(
  $$select label, requested from public.list_items
    where list_id = pg_temp.id_of('l1') order by position$$,
  $$values ('Ice'::text, 2), ('Lemons'::text, 24)$$,
  'an order asks for the counts its sender set, and the usual ones otherwise'
);
select is(
  pg_temp.who('lists.sent', 'list:' || pg_temp.id_of('l1')),
  array['82000000-0000-4000-a000-000000000004']::uuid[],
  'the storeroom hears of it, not its former member'
);

------------------------------------------------------------------------------
-- Who may pass it, and to where

select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000003', 'l1', 'kitchen', null,
    '2026-11-11 08:01+00')$$,
  '42501', null, 'the department that asked does not pass what the storeroom holds'
);
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000006', 'l1', 'kitchen', null,
    '2026-11-11 08:01+00')$$,
  '42501', null, 'nor does a worker it isn''t for'
);
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-00000000000a', 'l1', 'kitchen', null,
    '2026-11-11 08:01+00')$$,
  'P0002', null, 'another business''s owner learns nothing of it'
);
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000009', 'l1', 'bar', null,
    '2026-11-11 08:01+00')$$,
  'P0002', null, 'nor does a former member, though still in the storeroom''s rows'
);
select throws_ok(
  $$select public.pass_list('82000000-0000-4000-a000-000000000004',
    '82000000-0000-4000-c000-000000000099', pg_temp.id_of('bar'), null, '2026-11-11 08:01+00')$$,
  'P0002', null, 'and a list that isn''t there is not found'
);
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000004', 'l1', 'storeroom', null,
    '2026-11-11 08:01+00')$$,
  '22023', null, 'a list does not pass to the department that holds it'
);
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000004', 'l1', 'old', null,
    '2026-11-11 08:01+00')$$,
  '22023', null, 'nor to a department that was removed'
);
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000004', 'l1', 'q-bar', null,
    '2026-11-11 08:01+00')$$,
  '22023', null, 'nor to another business''s department'
);
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000004', 'l1', 'bar', repeat('x', 201),
    '2026-11-11 08:01+00')$$,
  '22023', null, 'and its note is at most 200 characters'
);
select is(
  (select (select count(*) from public.list_passes p where p.list_id = l.id)::text || '|'
     || (l.recipient_department = pg_temp.id_of('storeroom'))::text
   from public.lists l where l.id = pg_temp.id_of('l1')),
  '0|true',
  'none of that moved it'
);

------------------------------------------------------------------------------
-- The storeroom gives, and passes it back

select public.set_list_item('82000000-0000-4000-a000-000000000004', pg_temp.item_of('l1', 'Lemons'),
  '{"given": 20, "comment": "Only 20 left"}', '2026-11-11 08:05+00');
select is(
  (select given || '|' || requested || '|' || done || '|' || comment
   from public.list_items where id = pg_temp.item_of('l1', 'Lemons')),
  '20|24|true|Only 20 left',
  'the storeroom gives fewer than were asked for, and says why'
);
select lives_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000004', 'l1', 'bar',
    '  Twenty lemons, the rest tomorrow  ', '2026-11-11 08:06+00')$$,
  'the storeroom passes it back to the bar, with a note'
);
select is(
  (select recipient_kind || '|' || (recipient_department = pg_temp.id_of('bar'))::text || '|'
     || (recipient_role is null)::text || '|' || status
   from public.lists where id = pg_temp.id_of('l1')),
  'department|true|true|open',
  'the bar holds it now, still open'
);
select results_eq(
  $$select from_department, to_department, passed_by, passed_at, note
    from public.list_passes where list_id = pg_temp.id_of('l1') order by passed_at$$,
  $$values (pg_temp.id_of('storeroom'), pg_temp.id_of('bar'),
    '82000000-0000-4000-a000-000000000004'::uuid, '2026-11-11 08:06+00'::timestamptz,
    'Twenty lemons, the rest tomorrow'::text)$$,
  'its timeline keeps who passed it, from where, to where, when, and the note, tidied'
);
select is(
  (select details from public.audit_log
   where action = 'lists.pass' and details ->> 'list' = pg_temp.id_of('l1')::text),
  jsonb_build_object('list', pg_temp.id_of('l1'), 'name', 'Bar order',
    'from_department', pg_temp.id_of('storeroom'), 'to_department', pg_temp.id_of('bar'),
    'has_note', true),
  'logged, with whether there was a note and never the note'
);
select ok(
  private.holds_list(pg_temp.id_of('l1'), '82000000-0000-4000-a000-000000000003')
  and private.holds_list(pg_temp.id_of('l1'), '82000000-0000-4000-a000-000000000008')
  and not private.holds_list(pg_temp.id_of('l1'), '82000000-0000-4000-a000-000000000004'),
  'the bar''s people hold it, and the storeroom no longer does'
);
select throws_ok(
  $$select public.set_list_item('82000000-0000-4000-a000-000000000004', pg_temp.item_of('l1', 'Ice'),
    '{"checked": true}', '2026-11-11 08:07+00')$$,
  '42501', null, 'so the storeroom fills it no more'
);
select pg_temp.sign_in('82000000-0000-4000-a000-000000000004');
select is(
  (select count(*)::integer from public.lists where id = pg_temp.id_of('l1')),
  1,
  'though it still reads it'
);
reset role;
select is(
  public.my_open_lists('82000000-0000-4000-a000-000000000003', '82000000-0000-4000-b000-000000000001')
    || '|' || public.my_open_lists('82000000-0000-4000-a000-000000000004', '82000000-0000-4000-b000-000000000001'),
  '1|0',
  'and it moves from the storeroom''s Lists tab to the bar''s'
);

------------------------------------------------------------------------------
-- Who hears of it

select is(
  pg_temp.who('lists.passed', 'list:' || pg_temp.id_of('l1')),
  array['82000000-0000-4000-a000-000000000003', '82000000-0000-4000-a000-000000000008']::uuid[],
  'the bar''s people hear it came to them'
);
select is(
  (select n.params from public.notifications n
   where n.user_id = '82000000-0000-4000-a000-000000000003'
     and n.dedupe_key = 'list:' || pg_temp.id_of('l1')),
  jsonb_build_object('list', pg_temp.id_of('l1'), 'name', 'Bar order', 'due', null,
    'department', pg_temp.id_of('bar'), 'fromDepartment', pg_temp.id_of('bar'),
    'departmentName', 'Bar', 'hasNote', true),
  'with the department''s name and that a note came, and never the note'
);
select is(
  (select n.kind || '|' || (n.resolved_at is not null)::text from public.notifications n
   where n.user_id = '82000000-0000-4000-a000-000000000004'
     and n.dedupe_key = 'list:' || pg_temp.id_of('l1')),
  'lists.sent|true',
  'the storeroom''s line about it is settled'
);
select is(
  pg_temp.unread('list:' || pg_temp.id_of('l1')),
  array['82000000-0000-4000-a000-000000000003', '82000000-0000-4000-a000-000000000008']::uuid[],
  'and only the bar''s wait, unread'
);

------------------------------------------------------------------------------
-- The bar finishes it

select public.set_list_item('82000000-0000-4000-a000-000000000003', pg_temp.item_of('l1', 'Ice'),
  '{"checked": true}', '2026-11-11 08:09+00');
select is(
  (select given from public.list_items where id = pg_temp.item_of('l1', 'Ice')),
  2,
  'the bar fills it: a tick gives what was asked for'
);
select lives_ok(
  $$select public.finish_list('82000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'),
    '2026-11-11 08:10+00')$$,
  'and finishes it'
);
select is(
  pg_temp.who('lists.finished', 'list.finished:' || pg_temp.id_of('l1')),
  array['82000000-0000-4000-a000-000000000008']::uuid[],
  'the department that asked hears it is finished, the finisher, who sent it, left out'
);
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000002', 'l1', 'storeroom', null,
    '2026-11-11 08:11+00')$$,
  '55000', null, 'a finished list is passed by nobody'
);

------------------------------------------------------------------------------
-- From a role, through two departments

insert into ids values ('l2', public.send_list('82000000-0000-4000-a000-000000000002',
  '82000000-0000-4000-b000-000000000001',
  '{"name": "Fridge check", "items": [{"kind": "check", "label": "Fridge"}],
    "recipient": {"kind": "role", "role": "worker"}}',
  '2026-11-11 09:00+00'));
select lives_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000007', 'l2', 'kitchen', null,
    '2026-11-11 09:01+00')$$,
  'one of the workers a list was sent to passes it to the kitchen'
);
select lives_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000005', 'l2', 'bar', '   ',
    '2026-11-11 09:02+00')$$,
  'and the kitchen, which holds it now, passes it on to the bar'
);
select results_eq(
  $$select from_department, to_department, passed_by, note
    from public.list_passes where list_id = pg_temp.id_of('l2') order by passed_at$$,
  $$values
    (null::uuid, pg_temp.id_of('kitchen'), '82000000-0000-4000-a000-000000000007'::uuid, null::text),
    (pg_temp.id_of('kitchen'), pg_temp.id_of('bar'), '82000000-0000-4000-a000-000000000005'::uuid, null::text)$$,
  'its timeline in order: from a role it came from no department, and a blank note is none'
);
select is(
  (select count(*)::integer from public.audit_log
   where action = 'lists.pass' and details ->> 'list' = pg_temp.id_of('l2')::text
     and details -> 'has_note' = 'false'::jsonb),
  2,
  'each pass logged once, without a note'
);
select ok(
  not private.holds_list(pg_temp.id_of('l2'), '82000000-0000-4000-a000-000000000006')
  and not private.holds_list(pg_temp.id_of('l2'), '82000000-0000-4000-a000-000000000005'),
  'the workers it was sent to, and the kitchen, hold it no more'
);
select is(
  pg_temp.settled('list:' || pg_temp.id_of('l2')),
  '6/4',
  'every worker heard of it when it was sent; all but the bar''s are settled now'
);
select is(
  pg_temp.unread('list:' || pg_temp.id_of('l2')),
  array['82000000-0000-4000-a000-000000000003', '82000000-0000-4000-a000-000000000008']::uuid[],
  'and the bar''s people have it unread'
);

------------------------------------------------------------------------------
-- A reminder settles with the rest, and off is off

insert into ids values ('l3', public.send_list('82000000-0000-4000-a000-000000000002',
  '82000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Count the kegs', 'items', '[{"kind": "check", "label": "Kegs"}]'::jsonb,
    'recipient', pg_temp.to_dept('storeroom')),
  '2026-11-11 10:00+00'));
insert into public.audit_log (business_id, actor_id, action, details)
values ('82000000-0000-4000-b000-000000000001', null, 'lists.due',
  jsonb_build_object('list', pg_temp.id_of('l3'), 'name', 'Count the kegs', 'due_at', null));
select pg_temp.pass('82000000-0000-4000-a000-000000000002', 'l3', 'bar', null,
  '2026-11-11 10:05+00');
select is(
  (select string_agg(n.kind || ':' || (n.resolved_at is not null)::text, ',' order by n.kind)
   from public.notifications n
   where n.user_id = '82000000-0000-4000-a000-000000000004'
     and n.dedupe_key in ('list:' || pg_temp.id_of('l3'), 'list.due:' || pg_temp.id_of('l3'))),
  'lists.due:true,lists.sent:true',
  'the old holders'' reminder is settled with its line'
);

update public.business_modules set enabled = false
where business_id = '82000000-0000-4000-b000-000000000001' and module_key = 'lists';
select throws_ok(
  $$select pg_temp.pass('82000000-0000-4000-a000-000000000002', 'l3', 'kitchen', null,
    '2026-11-11 10:10+00')$$,
  '42501', null, 'with lists off, nothing is passed'
);
update public.business_modules set enabled = true
where business_id = '82000000-0000-4000-b000-000000000001' and module_key = 'lists';

select * from finish();
rollback;
