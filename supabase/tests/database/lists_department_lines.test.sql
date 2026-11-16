-- Lists: someone taken out of a department keeps no line of its lists
-- (20261116000100_lists_department_lines.sql). Taken out while still on the
-- staff, by public.set_department_members (as the service role, as the app
-- calls it) or by a row moved to another department, someone has the sent,
-- due and late lines of the lists they no longer hold read, settled and off
-- the phone, a manager and a worker who run the lists among them, though
-- they still see every list; and the finished line of an order their
-- department asked for, unless they sent it. The lines of lists they still
-- hold stay: another department they are in, a list to them, a list to their
-- role; and so do the sender's finished line and those of whoever stays in
-- the department that asked. Saving a department with the same people takes
-- nobody out and settles nothing. Someone leaving the staff (removed from
-- the team, made an accountant) has their lines put away as before: read and
-- off the phone, not settled. The trigger and its helper run as their owner,
-- for nobody else. Each write is its own statement and what it wrote is read
-- in the next. Fixed ids (d5…), numbers (050-088-xxxx) and times (1 December
-- 2026, whatever today is), so nothing here meets the seed or another test,
-- or the real clock.
begin;
select plan(12);

-- 1 owner, 2 manager (kitchen), 3 worker (kitchen and bar), 4 worker
-- (kitchen), 5 worker (kitchen, removed from the team), 6 worker (kitchen,
-- stays in it), 7 worker (kitchen, made an accountant), 8 worker (kitchen,
-- given lists.manage).
insert into auth.users (id, aud, role, phone)
select
  ('d5000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250088' || lpad(n::text, 4, '0')
from generate_series(1, 8) as n;

insert into public.businesses (id, slug, name)
values ('d5000000-0000-4000-b000-000000000001', 'ldl-one', 'Lists Department Lines');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('d5000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('d5000000-0000-4000-b000-000000000001', 'notifications', true, '{}');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant select on ids to service_role;

create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('d5000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- The business, and its two departments.
create function pg_temp.a() returns uuid language sql as $$
  select 'd5000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.kitchen() returns uuid language sql as $$
  select 'd5000000-0000-4000-c000-000000000001'::uuid
$$;
create function pg_temp.bar() returns uuid language sql as $$
  select 'd5000000-0000-4000-c000-000000000002'::uuid
$$;

-- The people numbered `numbers`.
create function pg_temp.people(numbers integer[]) returns uuid[] language sql as $$
  select array(select pg_temp.p(n) from unnest(numbers) as u (n) order by n)
$$;

insert into public.memberships (business_id, user_id, role, perms, active)
select pg_temp.a(), pg_temp.p(n),
  (case n when 1 then 'owner' when 2 then 'manager' else 'worker' end)::public.member_role,
  case n when 8 then '{lists.manage}'::text[] else '{}'::text[] end, true
from generate_series(1, 8) as n;

-- Everyone but the owner has a phone, so their lines are queued for it.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select pg_temp.p(n), 'https://fcm.googleapis.com/ldl-' || n,
  repeat('5', 62) || lpad(n::text, 2, '0'),
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from generate_series(2, 8) as n;

insert into public.departments (id, business_id, key, name)
values
  (pg_temp.kitchen(), pg_temp.a(), 'kitchen', 'Kitchen'),
  (pg_temp.bar(), pg_temp.a(), 'bar', 'Bar');
insert into public.department_members (department_id, business_id, user_id)
select pg_temp.kitchen(), pg_temp.a(), pg_temp.p(n) from generate_series(2, 8) as n;
insert into public.department_members (department_id, business_id, user_id)
values (pg_temp.bar(), pg_temp.a(), pg_temp.p(3));

-- The owner sends a list typed now to `recipient`, at noon on 1 December
-- (Israel's time), due at 14:00 when `due` says so.
create function pg_temp.send(recipient jsonb, due boolean default false) returns uuid language sql as $$
  select public.send_list(pg_temp.p(1), pg_temp.a(), jsonb_build_object(
    'name', 'Check', 'items', '[{"kind": "check", "label": "Done"}]'::jsonb,
    'recipient', recipient) || case
      when due then '{"dueAt": "2026-12-01T12:00:00Z"}'::jsonb else '{}'::jsonb
    end, '2026-12-01 10:00+00')
$$;

-- Person `n`'s line about `dedupe`: read or not, settled or not, and its
-- push; none when there is no such line.
create function pg_temp.line(dedupe text, n integer) returns text language sql as $$
  select coalesce((
    select case when x.read_at is null then 'unread' else 'read' end
      || case when x.resolved_at is null then '' else ' settled' end
      || ' ' || x.push_state
    from public.notifications x
    where x.business_id = pg_temp.a() and x.dedupe_key = dedupe and x.user_id = pg_temp.p(n)
  ), 'none')
$$;

-- Person `n`'s three lines of the list labelled `list`: sent, due and late.
create function pg_temp.lines(list text, n integer) returns text language sql as $$
  select pg_temp.line('list:' || pg_temp.id(list), n)
    || ' / ' || pg_temp.line('list.due:' || pg_temp.id(list), n)
    || ' / ' || pg_temp.line('list.late:' || pg_temp.id(list), n)
$$;

-- Who has an unread line about `dedupe` still queued for the phone, by number.
create function pg_temp.waiting(dedupe text) returns text language sql as $$
  select coalesce(string_agg(n::text, ',' order by n), 'nobody')
  from generate_series(1, 8) as n
  where pg_temp.line(dedupe, n) = 'unread queued'
$$;

-- Every line of the business, as it stands.
create function pg_temp.all_lines() returns text language sql as $$
  select coalesce(string_agg(
    x.id::text || '=' || coalesce(x.read_at::text, '-') || '/'
      || coalesce(x.resolved_at::text, '-') || '/' || x.push_state,
    ',' order by x.id), 'none')
  from public.notifications x
  where x.business_id = pg_temp.a()
$$;

------------------------------------------------------------------------------
-- The lists and their lines

insert into ids values ('kitchen list', pg_temp.send(
  jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()), true));
insert into ids values ('bar list', pg_temp.send(
  jsonb_build_object('kind', 'department', 'department', pg_temp.bar())));
insert into ids values ('to 4', pg_temp.send(
  jsonb_build_object('kind', 'person', 'user', pg_temp.p(4))));
insert into ids values ('to workers', pg_temp.send('{"kind": "role", "role": "worker"}'::jsonb));

-- The kitchen's list comes due, then late, as the minute job logs them.
insert into public.audit_log (business_id, actor_id, action, details)
values (pg_temp.a(), null, 'lists.due', jsonb_build_object(
  'list', pg_temp.id('kitchen list'), 'name', 'Check', 'due_at', '2026-12-01T12:00:00Z'));
insert into public.audit_log (business_id, actor_id, action, details)
values (pg_temp.a(), null, 'lists.late', jsonb_build_object(
  'list', pg_temp.id('kitchen list'), 'name', 'Check', 'due_at', '2026-12-01T12:00:00Z'));

select is(
  pg_temp.waiting('list:' || pg_temp.id('kitchen list'))
    || ' ; ' || pg_temp.waiting('list.due:' || pg_temp.id('kitchen list'))
    || ' ; ' || pg_temp.waiting('list.late:' || pg_temp.id('kitchen list'))
    || ' ; ' || pg_temp.waiting('list:' || pg_temp.id('bar list'))
    || ' ; ' || pg_temp.waiting('list:' || pg_temp.id('to 4'))
    || ' ; ' || pg_temp.waiting('list:' || pg_temp.id('to workers')),
  '2,3,4,5,6,7,8 ; 2,3,4,5,6,7,8 ; 2,3,4,5,6,7,8 ; 3 ; 4 ; 3,4,5,6,7,8',
  'the kitchen''s people have its sent, due and late lines unread and queued, the bar''s, the person''s and the workers'' theirs'
);

------------------------------------------------------------------------------
-- The same people saved again

create temporary table before_save (lines text) on commit drop;
insert into before_save select pg_temp.all_lines();

set local role service_role;
select public.set_department_members(pg_temp.p(1), pg_temp.a(), pg_temp.kitchen(),
  pg_temp.people(array[2, 3, 4, 5, 6, 7, 8]));
reset role;

select is(
  (pg_temp.all_lines() = (select b.lines from before_save b))::text
    || ' / ' || (select count(*)::text from public.notifications x
                 where x.business_id = pg_temp.a() and x.resolved_at is not null)
    || ' / ' || (select count(*)::text from public.department_members dm
                 where dm.department_id = pg_temp.kitchen())
    || ' / ' || (select count(*)::text from public.audit_log l
                 where l.business_id = pg_temp.a() and l.action = 'departments.members'),
  'true / 0 / 7 / 0',
  'saving the kitchen with the same people takes nobody out, logs nothing and touches no line'
);

------------------------------------------------------------------------------
-- Leaving the staff, as before

select public.remove_member(pg_temp.p(1), pg_temp.a(), pg_temp.p(5), '2026-12-01 11:00+00');
select public.set_member_role(pg_temp.p(1), pg_temp.a(), pg_temp.p(7), 'accountant',
  seen_role => 'worker', at_time => '2026-12-01 11:00+00');

select is(
  pg_temp.lines('kitchen list', 5) || ' | ' || pg_temp.lines('kitchen list', 7)
    || ' | ' || (select count(*)::text from public.department_members dm
                 where dm.business_id = pg_temp.a()
                   and dm.user_id = any (pg_temp.people(array[5, 7]))),
  'read skipped / read skipped / read skipped | read skipped / read skipped / read skipped | 0',
  'someone removed from the team, or made an accountant, leaves the kitchen with their lines read and off the phone, not settled, as before'
);

------------------------------------------------------------------------------
-- The kitchen's order, finished by the bar

-- The kitchen asks the bar. Worker 4, in the kitchen, sends it; worker 3, in
-- the bar (and the kitchen), ticks it and finishes it. Its finished line goes
-- to the sender and the kitchen's people, the finisher left out.
insert into ids
select 'order template', (public.save_list_template(pg_temp.p(1), pg_temp.a(),
  jsonb_build_object('name', 'Kitchen order',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.bar()),
    'fromDepartment', pg_temp.kitchen(),
    'items', '[{"kind": "check", "label": "Ice"}]'::jsonb)) ->> 'id')::uuid;
insert into ids values ('order', public.send_list(pg_temp.p(4), pg_temp.a(),
  jsonb_build_object('template', pg_temp.id('order template'),
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.bar())),
  '2026-12-01 11:10+00'));
select public.set_list_item(pg_temp.p(3),
  (select i.id from public.list_items i where i.list_id = pg_temp.id('order')),
  '{"checked": true}', '2026-12-01 11:20+00');
select public.finish_list(pg_temp.p(3), pg_temp.id('order'), '2026-12-01 11:30+00');

create temporary table finished_before (who text) on commit drop;
insert into finished_before select pg_temp.waiting('list.finished:' || pg_temp.id('order'));

------------------------------------------------------------------------------
-- Taken out of a department

-- The manager, the worker also in the bar, the worker with a list of their
-- own (who sent the order) and the worker who runs the lists go; the sixth
-- stays.
set local role service_role;
select public.set_department_members(pg_temp.p(1), pg_temp.a(), pg_temp.kitchen(),
  pg_temp.people(array[6]));
reset role;

select is(
  pg_temp.lines('kitchen list', 4),
  'read settled skipped / read settled skipped / read settled skipped',
  'taken out of the kitchen, someone has its list''s sent, due and late lines read, settled and off the phone'
);

select is(
  pg_temp.line('list:' || pg_temp.id('to 4'), 4)
    || ' ; ' || pg_temp.line('list:' || pg_temp.id('to workers'), 4),
  'unread queued ; unread queued',
  'and keeps the lines of a list to them and of a list to their role'
);

select is(
  pg_temp.lines('kitchen list', 3)
    || ' | ' || pg_temp.line('list:' || pg_temp.id('bar list'), 3)
    || ' ; ' || pg_temp.line('list:' || pg_temp.id('to workers'), 3),
  'read settled skipped / read settled skipped / read settled skipped | unread queued ; unread queued',
  'someone in two departments who leaves one has its list''s lines settled and keeps the other department''s, and their role''s'
);

select is(
  pg_temp.lines('kitchen list', 2) || ' | ' || pg_temp.lines('kitchen list', 6)
    || ' | ' || private.sees_list(pg_temp.id('kitchen list'), pg_temp.p(2))::text,
  'read settled skipped / read settled skipped / read settled skipped | unread queued / unread queued / unread queued | true',
  'a manager taken out holds the kitchen''s list no more, so its lines are settled, though they still see it; whoever stays keeps theirs'
);

select is(
  pg_temp.lines('kitchen list', 8)
    || ' | ' || private.sees_list(pg_temp.id('kitchen list'), pg_temp.p(8))::text
    || ' ; ' || pg_temp.line('list:' || pg_temp.id('to workers'), 8),
  'read settled skipped / read settled skipped / read settled skipped | true ; unread queued',
  'so does a worker given lists.manage, who keeps the line of a list to their role'
);

select is(
  (select f.who from finished_before f)
    || ' | ' || pg_temp.line('list.finished:' || pg_temp.id('order'), 2)
    || ' ; ' || pg_temp.line('list.finished:' || pg_temp.id('order'), 8)
    || ' | ' || pg_temp.line('list.finished:' || pg_temp.id('order'), 4)
    || ' ; ' || pg_temp.line('list.finished:' || pg_temp.id('order'), 6),
  '2,4,6,8 | read settled skipped ; read settled skipped | unread queued ; unread queued',
  'the order the kitchen asked for: whoever is taken out of the kitchen has its finished line settled, its sender and whoever stays keep theirs'
);

------------------------------------------------------------------------------
-- A row moved to another department

update public.department_members dm
set department_id = pg_temp.bar()
where dm.department_id = pg_temp.kitchen() and dm.user_id = pg_temp.p(6);

select is(
  pg_temp.lines('kitchen list', 6)
    || ' | ' || pg_temp.line('list:' || pg_temp.id('to workers'), 6)
    || ' | ' || pg_temp.line('list.finished:' || pg_temp.id('order'), 6)
    || ' ; ' || pg_temp.line('list.finished:' || pg_temp.id('order'), 4),
  'read settled skipped / read settled skipped / read settled skipped | unread queued | read settled skipped ; unread queued',
  'a row moved from the kitchen to the bar settles the kitchen''s lines and its order''s finished line the same way'
);

------------------------------------------------------------------------------
-- Who may call what

select is(
  (select string_agg(
     g.tgname
       || ' row:' || (g.tgtype & 1 = 1)::text
       || ' after:' || (g.tgtype & 66 = 0)::text
       || ' insert:' || (g.tgtype & 4 = 4)::text
       || ' delete:' || (g.tgtype & 8 = 8)::text
       || ' update:' || (g.tgtype & 16 = 16)::text
       || ' of:' || (
         select string_agg(a.attname::text, ',' order by a.attname)
         from pg_attribute a
         where a.attrelid = g.tgrelid and a.attnum = any (g.tgattr)
       )
       || ' calls:' || (g.tgfoid = 'private.settle_lines_off_department()'::regprocedure)::text,
     '; ')
   from pg_trigger g
   where g.tgrelid = 'public.department_members'::regclass
     and not g.tgisinternal
     and g.tgname = 'department_members_settle_lines'),
  'department_members_settle_lines row:true after:true insert:false delete:true update:true of:department_id,user_id calls:true',
  'the department''s people settle their lines by one trigger, after each row deleted or moved'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'private.settle_former_list_lines(uuid, uuid, timestamptz)',
      'private.settle_lines_off_department()'
    ]) as f (signature)
    where has_function_privilege('authenticated', f.signature, 'execute')
      or has_function_privilege('anon', f.signature, 'execute')
  )
  and has_function_privilege('service_role',
    'public.set_department_members(uuid, uuid, uuid, uuid[])', 'execute')
  and not has_function_privilege('authenticated',
    'public.set_department_members(uuid, uuid, uuid, uuid[])', 'execute')
  and (select count(*)::int from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'private'
         and p.proname in ('settle_former_list_lines', 'settle_lines_off_department')
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 2,
  'the helper and the trigger''s function run as their owner with an empty search path, for nobody else; the department''s people are saved with the secret key, as before'
);

select * from finish();
rollback;
