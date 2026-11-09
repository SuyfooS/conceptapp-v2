-- Departments: a business's own groups of people. Owners, managers and the
-- team save them, and who is in each, through the server; removing one
-- archives it and saving it again brings it back. Members read them, and
-- nobody else does.
begin;
select plan(40);

insert into auth.users (id, aud, role, phone)
values
  ('72000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500002201'),
  ('72000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500002202'),
  ('72000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500002203'),
  ('72000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500002204'),
  ('72000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500002205'),
  ('72000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500002206'),
  ('72000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500002207'),
  ('72000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500002208');

-- X: 1 owner, 2 manager, 3 and 8 workers, 4 a former worker. Y: 5 owner,
-- 6 worker. 7 is on the ConceptApp team, viewing X as a worker.
insert into public.businesses (id, slug, name)
values
  ('72000000-0000-4000-b000-000000000001', 'dept-x', 'Departments X'),
  ('72000000-0000-4000-b000-000000000002', 'dept-y', 'Departments Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('72000000-0000-4000-b000-000000000001', '72000000-0000-4000-a000-000000000001', 'owner', true),
  ('72000000-0000-4000-b000-000000000001', '72000000-0000-4000-a000-000000000002', 'manager', true),
  ('72000000-0000-4000-b000-000000000001', '72000000-0000-4000-a000-000000000003', 'worker', true),
  ('72000000-0000-4000-b000-000000000001', '72000000-0000-4000-a000-000000000004', 'worker', false),
  ('72000000-0000-4000-b000-000000000001', '72000000-0000-4000-a000-000000000008', 'worker', true),
  ('72000000-0000-4000-b000-000000000002', '72000000-0000-4000-a000-000000000005', 'owner', true),
  ('72000000-0000-4000-b000-000000000002', '72000000-0000-4000-a000-000000000006', 'worker', true);

insert into public.platform_staff (user_id, role)
values ('72000000-0000-4000-a000-000000000007', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('72000000-0000-4000-a000-000000000007', '72000000-0000-4000-b000-000000000001', 'worker');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table counts (name text primary key, n integer) on commit drop;

create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
-- X's department with this key.
create function pg_temp.dept(dept_key text) returns uuid language sql as $$
  select d.id from public.departments d
  where d.business_id = '72000000-0000-4000-b000-000000000001' and d.key = dept_key
$$;
-- X's live departments, by key, in order.
create function pg_temp.live() returns text language sql as $$
  select coalesce(string_agg(d.key || ':' || d.name, ',' order by d.position), '')
  from public.departments d
  where d.business_id = '72000000-0000-4000-b000-000000000001' and d.archived_at is null
$$;

------------------------------------------------------------------------------
-- Server only

select ok(
  not has_function_privilege('authenticated', 'public.set_departments(uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.set_departments(uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_department_members(uuid, uuid, uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.set_department_members(uuid, uuid, uuid, uuid[])', 'execute'),
  'browser roles cannot save departments or their people'
);
select ok(
  has_function_privilege('service_role', 'public.set_departments(uuid, uuid, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.set_department_members(uuid, uuid, uuid, uuid[])', 'execute'),
  'the server can'
);
select pg_temp.sign_in('72000000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001', '[]')$$,
  '42501', null, 'an owner cannot call it from the browser'
);
select throws_ok(
  $$insert into public.departments (business_id, key, name)
    values ('72000000-0000-4000-b000-000000000001', 'own', 'Own')$$,
  '42501', null, 'nor write a department directly'
);
reset role;

------------------------------------------------------------------------------
-- Saving

select lives_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001',
    '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": " Bar "}]')$$,
  'an owner saves the business''s departments'
);
select is(pg_temp.live(), 'kitchen:Kitchen,bar:Bar', 'in their order, names trimmed');
select is(
  (select details from public.audit_log
   where business_id = '72000000-0000-4000-b000-000000000001' and action = 'departments.change'),
  '{"from": [], "to": [{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"}]}'::jsonb,
  'logged with what they were and what they became'
);
select lives_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000002',
    '72000000-0000-4000-b000-000000000001',
    '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
      {"key": "floor", "name": "Floor"}]')$$,
  'a manager saves them too'
);
select lives_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000007',
    '72000000-0000-4000-b000-000000000001',
    '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
      {"key": "floor", "name": "Floor"}, {"key": "storeroom", "name": "Storeroom"}]')$$,
  'and so does the ConceptApp team, who set businesses up'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000003',
    '72000000-0000-4000-b000-000000000001', '[]')$$,
  '42501', null, 'a worker may not'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000005',
    '72000000-0000-4000-b000-000000000001', '[]')$$,
  '42501', null, 'nor the owner of another business'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001',
    '[{"key": "kitchen", "name": "Kitchen"}, {"key": "kitchen", "name": "Second"}]')$$,
  '22023', null, 'each key once'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001',
    '[{"key": "kitchen", "name": "Bar"}, {"key": "bar", "name": "bar "}]')$$,
  '22023', null, 'each name once, whatever its case'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001',
    (select jsonb_agg(jsonb_build_object('key', 'd' || n, 'name', 'D' || n))
     from generate_series(1, 31) as n))$$,
  '22023', null, 'at most 30'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001', '[{"key": "Kitchen!", "name": "Kitchen"}]')$$,
  '22023', null, 'a key is lowercase'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001', '[{"key": "kitchen", "name": "  "}]')$$,
  '22023', null, 'a department needs a name'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001', '{"key": "kitchen"}')$$,
  '22023', null, 'departments are a list'
);
select throws_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000007',
    '72000000-0000-4000-b000-0000000000ff', '[]')$$,
  'P0002', null, 'an unknown business is refused'
);
select is(
  pg_temp.live(), 'kitchen:Kitchen,bar:Bar,floor:Floor,storeroom:Storeroom',
  'and nothing refused was saved'
);

------------------------------------------------------------------------------
-- Removing is archiving, and saving it again is the undo

insert into ids values ('floor', pg_temp.dept('floor'));
select public.set_departments('72000000-0000-4000-a000-000000000002',
  '72000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "storeroom", "name": "Storeroom"}]');
select is(
  (select archived_at is not null from public.departments where id = pg_temp.id_of('floor')),
  true,
  'a department left out is archived, not deleted'
);
select public.set_departments('72000000-0000-4000-a000-000000000002',
  '72000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "storeroom", "name": "Storeroom"}, {"key": "floor", "name": "Floor"}]');
select is(
  (select id from public.departments
   where business_id = '72000000-0000-4000-b000-000000000001' and key = 'floor'
     and archived_at is null),
  pg_temp.id_of('floor'),
  'and comes back with its id when saved again'
);
select lives_ok(
  $$select public.set_departments('72000000-0000-4000-a000-000000000002',
    '72000000-0000-4000-b000-000000000001',
    '[{"key": "kitchen", "name": "Bar"}, {"key": "bar", "name": "Kitchen"},
      {"key": "storeroom", "name": "Storeroom"}, {"key": "floor", "name": "Floor"}]')$$,
  'two departments can swap names in one save'
);
select public.set_departments('72000000-0000-4000-a000-000000000002',
  '72000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "storeroom", "name": "Storeroom"}, {"key": "floor", "name": "Floor"}]');
insert into counts
select 'changes', count(*)::integer from public.audit_log
where business_id = '72000000-0000-4000-b000-000000000001' and action = 'departments.change';
select public.set_departments('72000000-0000-4000-a000-000000000002',
  '72000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "storeroom", "name": "Storeroom"}, {"key": "floor", "name": "Floor"}]');
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '72000000-0000-4000-b000-000000000001' and action = 'departments.change'),
  (select n from counts where name = 'changes'),
  'saving them unchanged logs nothing'
);

------------------------------------------------------------------------------
-- Who is in which

select lives_ok(
  $$select public.set_department_members('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001', pg_temp.dept('kitchen'),
    array['72000000-0000-4000-a000-000000000003', '72000000-0000-4000-a000-000000000008',
          '72000000-0000-4000-a000-000000000003']::uuid[])$$,
  'an owner puts people in a department'
);
select is(
  (select array_agg(user_id order by user_id) from public.department_members
   where department_id = pg_temp.dept('kitchen')),
  array['72000000-0000-4000-a000-000000000003', '72000000-0000-4000-a000-000000000008']::uuid[],
  'each once'
);
select is(
  (select details from public.audit_log
   where business_id = '72000000-0000-4000-b000-000000000001' and action = 'departments.members'),
  jsonb_build_object(
    'department', pg_temp.dept('kitchen'),
    'added', '["72000000-0000-4000-a000-000000000003", "72000000-0000-4000-a000-000000000008"]'::jsonb,
    'removed', '[]'::jsonb
  ),
  'logged with who came in'
);
select throws_ok(
  $$select public.set_department_members('72000000-0000-4000-a000-000000000003',
    '72000000-0000-4000-b000-000000000001', pg_temp.dept('kitchen'), '{}')$$,
  '42501', null, 'a worker may not'
);
select throws_ok(
  $$select public.set_department_members('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001', pg_temp.dept('kitchen'),
    array['72000000-0000-4000-a000-000000000006']::uuid[])$$,
  '22023', null, 'someone from another business cannot be put in'
);
select throws_ok(
  $$select public.set_department_members('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001', pg_temp.dept('kitchen'),
    array['72000000-0000-4000-a000-000000000004']::uuid[])$$,
  '22023', null, 'nor a former member'
);
select public.set_departments('72000000-0000-4000-a000-000000000005',
  '72000000-0000-4000-b000-000000000002', '[{"key": "kitchen", "name": "Kitchen"}]');
select throws_ok(
  $$select public.set_department_members('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001',
    (select d.id from public.departments d
     where d.business_id = '72000000-0000-4000-b000-000000000002'), '{}')$$,
  'P0002', null, 'another business''s department is unknown here'
);
select public.set_departments('72000000-0000-4000-a000-000000000002',
  '72000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"},
    {"key": "floor", "name": "Floor"}]');
select throws_ok(
  $$select public.set_department_members('72000000-0000-4000-a000-000000000001',
    '72000000-0000-4000-b000-000000000001', pg_temp.dept('storeroom'), '{}')$$,
  'P0002', null, 'and so is an archived one'
);
select lives_ok(
  $$select public.set_department_members('72000000-0000-4000-a000-000000000002',
    '72000000-0000-4000-b000-000000000001', pg_temp.dept('kitchen'),
    array['72000000-0000-4000-a000-000000000008']::uuid[])$$,
  'a manager takes someone out'
);
select is(
  (select details from public.audit_log
   where business_id = '72000000-0000-4000-b000-000000000001' and action = 'departments.members'
   order by id desc limit 1),
  jsonb_build_object(
    'department', pg_temp.dept('kitchen'),
    'added', '[]'::jsonb,
    'removed', '["72000000-0000-4000-a000-000000000003"]'::jsonb
  ),
  'logged with who left'
);
select public.set_department_members('72000000-0000-4000-a000-000000000007',
  '72000000-0000-4000-b000-000000000001', pg_temp.dept('bar'),
  array['72000000-0000-4000-a000-000000000008', '72000000-0000-4000-a000-000000000002']::uuid[]);
select is(
  (select count(*)::integer from public.department_members
   where user_id = '72000000-0000-4000-a000-000000000008'),
  2,
  'someone can be in two departments, and a manager in one'
);

------------------------------------------------------------------------------
-- Reading

select pg_temp.sign_in('72000000-0000-4000-a000-000000000003');
select is(
  (select count(*)::integer from public.departments),
  4,
  'a member reads the business''s departments, archived ones too (old lists keep their names)'
);
select is(
  (select count(*)::integer from public.department_members),
  3,
  'and who is in each'
);
reset role;
select pg_temp.sign_in('72000000-0000-4000-a000-000000000006');
select is(
  (select count(*)::integer from public.departments
   where business_id = '72000000-0000-4000-b000-000000000001')
  + (select count(*)::integer from public.department_members
     where business_id = '72000000-0000-4000-b000-000000000001'),
  0,
  'a member of another business reads none of them'
);
reset role;
select pg_temp.sign_in('72000000-0000-4000-a000-000000000004');
select is(
  (select count(*)::integer from public.departments),
  0,
  'nor does a former member'
);
reset role;
select pg_temp.sign_in('72000000-0000-4000-a000-000000000007');
select is(
  (select count(*)::integer from public.departments
   where business_id = '72000000-0000-4000-b000-000000000001'),
  4,
  'the team reads them while viewing the business'
);
reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.departments',
  '42501', null, 'an anonymous visitor reads nothing'
);
reset role;

select * from finish();
rollback;
