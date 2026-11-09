-- What lists tell people, through their own trigger on the audit log
-- (private.notify_for_lists): a list sent tells the people it is for, and
-- nobody else; finishing settles its lines and tells whoever sent it and the
-- department that asked; cancelling settles them; opening it again tells its
-- people again. The lines hide while lists are off, nothing is written while
-- notifications are off, and a failure never stops the list. Fixed ids of its
-- own and explicit times.
begin;
select plan(24);

insert into auth.users (id, aud, role, phone)
values
  ('74000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500002401'),
  ('74000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500002402'),
  ('74000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500002403'),
  ('74000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500002404'),
  ('74000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500002405'),
  ('74000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500002406'),
  ('74000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500002407'),
  ('74000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500002408'),
  ('74000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500002409');

-- N: 1 owner, 2 manager; workers 3 and 4 (kitchen), 5 (bar), 6 (storeroom),
-- 7 (no department); 8 a former worker still in the kitchen's rows.
-- M: 9 its owner.
insert into public.businesses (id, slug, name)
values
  ('74000000-0000-4000-b000-000000000001', 'lists-notify-n', 'Lists notify N'),
  ('74000000-0000-4000-b000-000000000002', 'lists-notify-m', 'Lists notify M');

insert into public.memberships (business_id, user_id, role, active)
values
  ('74000000-0000-4000-b000-000000000001', '74000000-0000-4000-a000-000000000001', 'owner', true),
  ('74000000-0000-4000-b000-000000000001', '74000000-0000-4000-a000-000000000002', 'manager', true),
  ('74000000-0000-4000-b000-000000000001', '74000000-0000-4000-a000-000000000003', 'worker', true),
  ('74000000-0000-4000-b000-000000000001', '74000000-0000-4000-a000-000000000004', 'worker', true),
  ('74000000-0000-4000-b000-000000000001', '74000000-0000-4000-a000-000000000005', 'worker', true),
  ('74000000-0000-4000-b000-000000000001', '74000000-0000-4000-a000-000000000006', 'worker', true),
  ('74000000-0000-4000-b000-000000000001', '74000000-0000-4000-a000-000000000007', 'worker', true),
  ('74000000-0000-4000-b000-000000000001', '74000000-0000-4000-a000-000000000008', 'worker', false),
  ('74000000-0000-4000-b000-000000000002', '74000000-0000-4000-a000-000000000009', 'owner', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('74000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('74000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('74000000-0000-4000-b000-000000000002', 'lists', true, '{}'),
  ('74000000-0000-4000-b000-000000000002', 'notifications', true, '{}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table counts (name text primary key, n integer) on commit drop;
grant all on ids, counts to authenticated, service_role;

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
-- Who in N has a line about `thing` (its dedupe key), of this kind when one is
-- given; who has it unread; and how many lines about it are settled.
create function pg_temp.who(what text, thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '74000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and (what is null or n.kind = what)
$$;
create function pg_temp.unread(thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '74000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and n.read_at is null
$$;
create function pg_temp.settled(thing text) returns text language sql as $$
  select count(*)::text || '/' || count(n.resolved_at)::text
  from public.notifications n
  where n.business_id = '74000000-0000-4000-b000-000000000001' and n.dedupe_key = thing
$$;
-- Sends in N, by its manager unless said otherwise.
create function pg_temp.send(actor uuid, body jsonb, at_time timestamptz) returns uuid language sql as $$
  select public.send_list(actor, '74000000-0000-4000-b000-000000000001', body, at_time)
$$;

select public.set_departments('74000000-0000-4000-a000-000000000001',
  '74000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "storeroom", "name": "Storeroom"}]');
insert into ids
select d.key, d.id from public.departments d
where d.business_id = '74000000-0000-4000-b000-000000000001';
select public.set_department_members('74000000-0000-4000-a000-000000000001',
  '74000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen'),
  array['74000000-0000-4000-a000-000000000003', '74000000-0000-4000-a000-000000000004']::uuid[]);
select public.set_department_members('74000000-0000-4000-a000-000000000001',
  '74000000-0000-4000-b000-000000000001', pg_temp.id_of('bar'),
  array['74000000-0000-4000-a000-000000000005']::uuid[]);
select public.set_department_members('74000000-0000-4000-a000-000000000001',
  '74000000-0000-4000-b000-000000000001', pg_temp.id_of('storeroom'),
  array['74000000-0000-4000-a000-000000000006']::uuid[]);
insert into public.department_members (department_id, business_id, user_id)
values (pg_temp.id_of('kitchen'), '74000000-0000-4000-b000-000000000001',
  '74000000-0000-4000-a000-000000000008');

insert into ids
select 't1', (public.save_list_template('74000000-0000-4000-a000-000000000002',
  '74000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Kitchen list', 'note', 'Template note',
    'recipient', pg_temp.to_dept('kitchen'),
    'items', '[{"kind": "check", "label": "A"}]'::jsonb)) ->> 'id')::uuid;
insert into ids
select 't2', (public.save_list_template('74000000-0000-4000-a000-000000000002',
  '74000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Bar order', 'recipient', pg_temp.to_dept('storeroom'),
    'fromDepartment', pg_temp.id_of('bar'), 'asksQuantities', true,
    'items', '[{"kind": "check", "label": "Ice", "defaultQuantity": 2}]'::jsonb)) ->> 'id')::uuid;

------------------------------------------------------------------------------
-- Sending tells the people a list is for

insert into ids values ('l1', pg_temp.send('74000000-0000-4000-a000-000000000002',
  jsonb_build_object('template', pg_temp.id_of('t1'), 'recipient', pg_temp.to_dept('kitchen'),
    'note', 'A note nobody but the list shows'),
  '2026-11-11 08:00+00'));
select is(
  pg_temp.who('lists.sent', 'list:' || pg_temp.id_of('l1')),
  array['74000000-0000-4000-a000-000000000003', '74000000-0000-4000-a000-000000000004']::uuid[],
  'a list sent to a department tells its people: not the sender, not a former member'
);
select is(
  (select n.params from public.notifications n
   where n.user_id = '74000000-0000-4000-a000-000000000003'
     and n.dedupe_key = 'list:' || pg_temp.id_of('l1')),
  jsonb_build_object(
    'list', pg_temp.id_of('l1'), 'name', 'Kitchen list', 'due', null,
    'department', pg_temp.id_of('kitchen'), 'fromDepartment', null
  ),
  'with the list''s name and ids, and never its note'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.dedupe_key = 'list:' || pg_temp.id_of('l1')
     and (n.source_module is distinct from 'lists' or n.audience_role <> 'worker'
       or n.actor_id is distinct from '74000000-0000-4000-a000-000000000002'
       or n.read_at is not null or n.push_state <> 'none')),
  0,
  'about lists, for anyone it is for, from the sender, unread, and on no phone yet'
);

insert into ids values ('l2', pg_temp.send('74000000-0000-4000-a000-000000000002',
  jsonb_build_object('template', pg_temp.id_of('t1'), 'recipient', '{"kind": "role", "role": "worker"}'::jsonb),
  '2026-11-11 08:01+00'));
select is(
  pg_temp.who('lists.sent', 'list:' || pg_temp.id_of('l2')),
  array['74000000-0000-4000-a000-000000000003', '74000000-0000-4000-a000-000000000004',
        '74000000-0000-4000-a000-000000000005', '74000000-0000-4000-a000-000000000006',
        '74000000-0000-4000-a000-000000000007']::uuid[],
  'a list sent to a role tells everyone active in it, and nobody above it'
);

insert into ids values ('l3', pg_temp.send('74000000-0000-4000-a000-000000000002',
  '{"name": "Door", "items": [{"kind": "check", "label": "Door"}],
    "recipient": {"kind": "person", "user": "74000000-0000-4000-a000-000000000007"}}',
  '2026-11-11 08:02+00'));
select is(
  pg_temp.who('lists.sent', 'list:' || pg_temp.id_of('l3')),
  array['74000000-0000-4000-a000-000000000007']::uuid[],
  'a list for one person tells them alone'
);

insert into ids values ('l4', pg_temp.send('74000000-0000-4000-a000-000000000002',
  '{"name": "Mine", "items": [{"kind": "check", "label": "Mine"}],
    "recipient": {"kind": "person", "user": "74000000-0000-4000-a000-000000000002"}}',
  '2026-11-11 08:03+00'));
select is(
  pg_temp.who(null, 'list:' || pg_temp.id_of('l4')),
  '{}'::uuid[],
  'nobody is told about what they sent themselves'
);

insert into ids values ('l5', pg_temp.send('74000000-0000-4000-a000-000000000005',
  jsonb_build_object('template', pg_temp.id_of('t2'), 'recipient', pg_temp.to_dept('storeroom')),
  '2026-11-11 08:04+00'));
select is(
  pg_temp.who('lists.sent', 'list:' || pg_temp.id_of('l5')),
  array['74000000-0000-4000-a000-000000000006']::uuid[],
  'an order tells the department it goes to, not the one that asks'
);
select is(
  (select n.params ->> 'fromDepartment' from public.notifications n
   where n.dedupe_key = 'list:' || pg_temp.id_of('l5')),
  pg_temp.id_of('bar')::text,
  'and says which department asks'
);

------------------------------------------------------------------------------
-- Finishing settles and tells

select public.set_list_item('74000000-0000-4000-a000-000000000006', pg_temp.item_of('l5', 'Ice'),
  '{"checked": true}', '2026-11-11 08:10+00');
select public.finish_list('74000000-0000-4000-a000-000000000006', pg_temp.id_of('l5'),
  '2026-11-11 08:11+00');
select is(
  pg_temp.settled('list:' || pg_temp.id_of('l5')),
  '1/1',
  'finishing a list settles its lines'
);
select is(
  pg_temp.who('lists.finished', 'list.finished:' || pg_temp.id_of('l5')),
  array['74000000-0000-4000-a000-000000000005']::uuid[],
  'and tells the department that asked, and whoever sent it, the finisher left out'
);

select public.set_list_item('74000000-0000-4000-a000-000000000003', pg_temp.item_of('l1', 'A'),
  '{"checked": true}', '2026-11-11 08:20+00');
select public.finish_list('74000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'),
  '2026-11-11 08:21+00');
select is(
  pg_temp.settled('list:' || pg_temp.id_of('l1')),
  '2/2',
  'for everyone it was for'
);
select is(
  pg_temp.who('lists.finished', 'list.finished:' || pg_temp.id_of('l1')),
  array['74000000-0000-4000-a000-000000000002']::uuid[],
  'a list a manager sent tells the manager'
);

select public.reopen_list('74000000-0000-4000-a000-000000000003', pg_temp.id_of('l1'),
  '2026-11-11 08:23+00');
select is(
  pg_temp.unread('list:' || pg_temp.id_of('l1')),
  array['74000000-0000-4000-a000-000000000004']::uuid[],
  'opening it again tells its people again, unread, the one who opened it left out'
);
select is(
  pg_temp.settled('list.finished:' || pg_temp.id_of('l1')),
  '1/1',
  'and settles the line that said it was finished'
);

update public.business_modules set settings = '{"tellWhenFinished": false}'
where business_id = '74000000-0000-4000-b000-000000000001' and module_key = 'lists';
select public.set_list_item('74000000-0000-4000-a000-000000000007', pg_temp.item_of('l3', 'Door'),
  '{"checked": true}', '2026-11-11 08:30+00');
select public.finish_list('74000000-0000-4000-a000-000000000007', pg_temp.id_of('l3'),
  '2026-11-11 08:31+00');
select is(
  pg_temp.who('lists.finished', 'list.finished:' || pg_temp.id_of('l3')),
  '{}'::uuid[],
  'with tellWhenFinished off, nobody hears a list was finished'
);
select is(
  pg_temp.settled('list:' || pg_temp.id_of('l3')),
  '1/1',
  'though its lines are settled'
);
update public.business_modules set settings = '{}'
where business_id = '74000000-0000-4000-b000-000000000001' and module_key = 'lists';

------------------------------------------------------------------------------
-- Cancelling settles, and tells nobody

insert into ids values ('l6', pg_temp.send('74000000-0000-4000-a000-000000000002',
  jsonb_build_object('template', pg_temp.id_of('t1'), 'recipient', pg_temp.to_dept('kitchen')),
  '2026-11-11 09:00+00'));
select public.cancel_list('74000000-0000-4000-a000-000000000002', pg_temp.id_of('l6'),
  '2026-11-11 09:01+00');
select is(
  pg_temp.settled('list:' || pg_temp.id_of('l6')),
  '2/2',
  'cancelling a list settles its lines'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.dedupe_key like ('list%:' || pg_temp.id_of('l6')) and n.kind <> 'lists.sent'),
  0,
  'and tells nobody'
);

------------------------------------------------------------------------------
-- Off is off

select pg_temp.sign_in('74000000-0000-4000-a000-000000000003');
insert into counts select 'c-lines', count(*)::integer from public.notifications;
reset role;
update public.business_modules set enabled = false
where business_id = '74000000-0000-4000-b000-000000000001' and module_key = 'lists';
select pg_temp.sign_in('74000000-0000-4000-a000-000000000003');
select is(
  (select count(*)::integer from public.notifications),
  0,
  'switching lists off hides their lines'
);
reset role;
select ok(
  (select n from counts where name = 'c-lines') > 0,
  'which their people read while lists are on'
);
update public.business_modules set enabled = true
where business_id = '74000000-0000-4000-b000-000000000001' and module_key = 'lists';

update public.business_modules set enabled = false
where business_id = '74000000-0000-4000-b000-000000000001' and module_key = 'notifications';
insert into ids values ('l7', pg_temp.send('74000000-0000-4000-a000-000000000002',
  jsonb_build_object('template', pg_temp.id_of('t1'), 'recipient', pg_temp.to_dept('kitchen')),
  '2026-11-11 09:10+00'));
select is(
  pg_temp.who(null, 'list:' || pg_temp.id_of('l7')),
  '{}'::uuid[],
  'with notifications off, a list is sent and nobody is told'
);
update public.business_modules set enabled = true
where business_id = '74000000-0000-4000-b000-000000000001' and module_key = 'notifications';

select is(
  (select count(*)::integer from public.notifications
   where user_id = '74000000-0000-4000-a000-000000000009'
      or business_id = '74000000-0000-4000-b000-000000000002'),
  0,
  'nobody in another business hears of any of it'
);

------------------------------------------------------------------------------
-- A producer that fails

create or replace function private.list_holders(list uuid)
returns uuid[]
language plpgsql
as $$
begin
  raise exception 'poisoned';
end;
$$;

select lives_ok(
  $$insert into ids values ('l8', pg_temp.send('74000000-0000-4000-a000-000000000002',
    jsonb_build_object('template', pg_temp.id_of('t1'), 'recipient', pg_temp.to_dept('kitchen')),
    '2026-11-11 09:20+00'))$$,
  'a notification that fails does not stop the list being sent'
);
select is(
  (select count(*)::integer from public.lists l
   join public.audit_log a on a.action = 'lists.send' and a.details ->> 'list' = l.id::text
   where l.id = pg_temp.id_of('l8')),
  1,
  'its list and its log row are written'
);

select * from finish();
rollback;
