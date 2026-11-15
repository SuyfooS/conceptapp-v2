-- Roles and permissions by module, R2 (20261115000800_roles_setter.sql): with
-- two keys turned settable here, as the scheduling phase will (R3), an owner
-- raises workers to build and publish the schedule and the team lowers
-- managers, each a row granting or denying, what a key requires counted, the
-- default putting the row away; the screens and the console's matrix are told
-- so; the rows are read by the owner and a view as the owner only; each
-- change is logged as role.permission, read as module.settings is, and a row
-- that only met its default goes quietly; nobody else changes anything, a
-- key not settable yet is refused, a person is still given only pay, and pay
-- is switched as before; an area is written in one go, all or nothing, and
-- its undo leaves no row behind; a demo business is changed by its visitors
-- and its reset leaves no role row. Fixed ids (93…), so nothing here depends
-- on the seed.
begin;
select plan(56);

-- 1 owner, 2 manager, 3 worker, 4 accountant of S; 5 on the ConceptApp team;
-- 6 owner of another business; 7 on the team, viewing S as its owner; 11 the
-- demo's owner.
insert into auth.users (id, aud, role, phone)
select
  ('93000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250093' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,7,11}'::int[]) as n;

insert into public.businesses (id, slug, name)
values
  ('93000000-0000-4000-b000-000000000001', 'rs-one', 'Roles Setter'),
  ('93000000-0000-4000-b000-000000000002', 'rs-two', 'Roles Elsewhere');

insert into public.memberships (business_id, user_id, role)
values
  ('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000001', 'owner'),
  ('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000002', 'manager'),
  ('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000003', 'worker'),
  ('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000004', 'accountant'),
  ('93000000-0000-4000-b000-000000000002', '93000000-0000-4000-a000-000000000006', 'owner');

insert into public.platform_staff (user_id, role)
values
  ('93000000-0000-4000-a000-000000000005', 'onboarder'),
  ('93000000-0000-4000-a000-000000000007', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('93000000-0000-4000-a000-000000000007', '93000000-0000-4000-b000-000000000001', 'owner');

-- As the scheduling phase will: owners switch building and publishing the
-- schedule per role. Undone with the test.
update public.permission_keys
set settable = true
where key in ('schedule.edit', 'schedule.publish');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
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

-- The business's role rows, in order.
create function pg_temp.role_rows() returns table (role text, perm text, allowed boolean)
language sql as $$
  select rp.role::text, rp.perm, rp.allowed
  from public.role_permissions rp
  where rp.business_id = '93000000-0000-4000-b000-000000000001'
  order by 1, 2
$$;

-- The business's role.permission rows the signed-in person reads.
create function pg_temp.role_lines() returns integer language sql as $$
  select count(*)::integer
  from public.audit_log a
  where a.business_id = '93000000-0000-4000-b000-000000000001'
    and a.action = 'role.permission'
$$;

-- The business's role rows the signed-in person reads.
create function pg_temp.rows_read() returns integer language sql as $$
  select count(*)::integer
  from public.role_permissions rp
  where rp.business_id = '93000000-0000-4000-b000-000000000001'
$$;

------------------------------------------------------------------------------
-- Who may call what

select ok(
  not has_function_privilege('authenticated', 'public.set_role_permission(uuid, uuid, public.member_role, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.set_role_permission(uuid, uuid, public.member_role, text, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.set_role_permission(uuid, uuid, public.member_role, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[])', 'execute')
  and not has_function_privilege('anon', 'public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[])', 'execute')
  and has_function_privilege('service_role', 'public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[])', 'execute')
  and not has_function_privilege('authenticated', 'public.set_member_permission(uuid, uuid, uuid, text, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.set_member_permission(uuid, uuid, uuid, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.role_permission_matrix(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.role_permission_matrix(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.role_permission_matrix(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.check_permission_giver(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'private.check_permission_giver(uuid, uuid, text)', 'execute'),
  'permissions change, and the console reads them, through the server only'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname || '.' || p.proname in (
       'private.check_permission_giver', 'public.set_role_permission',
       'public.set_role_permissions', 'public.set_member_permission',
       'public.role_permission_matrix'
     )
     and p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  5,
  'each runs as its owner with an empty search path'
);

------------------------------------------------------------------------------
-- Workers raised, by the owner

set local role service_role;
select is(
  pg_temp.refusal($$select public.set_role_permission('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.publish', true)$$),
  '22023 requires schedule.edit',
  'publishing is not given to a role that doesn''t build the schedule, and the screen is told what it needs'
);
select lives_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true)$$,
  'the owner gives workers building the schedule'
);
select lives_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.publish', true)$$,
  'and then publishing it'
);
reset role;

select results_eq(
  $$select rp.role::text, rp.perm, rp.allowed, rp.granted_by
    from public.role_permissions rp
    where rp.business_id = '93000000-0000-4000-b000-000000000001'
    order by 1, 2$$,
  $$values
    ('worker'::text, 'schedule.edit'::text, true, '93000000-0000-4000-a000-000000000001'::uuid),
    ('worker'::text, 'schedule.publish'::text, true, '93000000-0000-4000-a000-000000000001'::uuid)$$,
  'each is a row granting it to workers, set by the owner'
);
select ok(
  private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000003', 'schedule.edit')
  and private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000003', 'schedule.publish'),
  'and the worker holds both by role'
);
select pg_temp.sign_in('93000000-0000-4000-a000-000000000003');
select ok(
  public.my_permissions('93000000-0000-4000-b000-000000000001')
    @> '{schedule.edit,schedule.publish}'::text[],
  'and the screens are told so'
);
reset role;
select results_eq(
  $$select a.actor_id, a.details from public.audit_log a
    where a.business_id = '93000000-0000-4000-b000-000000000001' and a.action = 'role.permission'
    order by a.id$$,
  $$values
    ('93000000-0000-4000-a000-000000000001'::uuid,
      '{"role": "worker", "perm": "schedule.edit", "area": "scheduling", "from": false, "to": true}'::jsonb),
    ('93000000-0000-4000-a000-000000000001'::uuid,
      '{"role": "worker", "perm": "schedule.publish", "area": "scheduling", "from": false, "to": true}'::jsonb)$$,
  'the log says who changed which role''s key, in which area, from what to what'
);

set local role service_role;
select public.set_role_permission('93000000-0000-4000-a000-000000000001',
  '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true);
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '93000000-0000-4000-b000-000000000001' and a.action = 'role.permission'),
  2,
  'giving it again changes nothing and writes nothing'
);

------------------------------------------------------------------------------
-- Managers lowered, by the ConceptApp team

set local role service_role;
select lives_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000005',
    '93000000-0000-4000-b000-000000000001', 'manager', 'schedule.edit', false)$$,
  'the ConceptApp team takes building the schedule from managers'
);
reset role;

select results_eq(
  $$select rp.allowed, rp.granted_by from public.role_permissions rp
    where rp.business_id = '93000000-0000-4000-b000-000000000001'
      and rp.role = 'manager' and rp.perm = 'schedule.edit'$$,
  $$values (false, '93000000-0000-4000-a000-000000000005'::uuid)$$,
  'a row denying it, set by the team member'
);
select ok(
  not private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000002', 'schedule.edit')
  and not private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000002', 'schedule.publish')
  and private.role_gives('93000000-0000-4000-b000-000000000001', 'manager', 'schedule.publish')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.business_id = '93000000-0000-4000-b000-000000000001'
      and rp.role = 'manager' and rp.perm = 'schedule.publish'
  ),
  'the manager neither builds nor publishes the schedule: publishing requires building, its own rule left as it was'
);
select pg_temp.sign_in('93000000-0000-4000-a000-000000000002');
select ok(
  not (public.my_permissions('93000000-0000-4000-b000-000000000001')
    && '{schedule.edit,schedule.publish}'::text[])
  and public.my_permissions('93000000-0000-4000-b000-000000000001') @> '{clock.edit}'::text[],
  'and the screens are told so, the other areas untouched'
);
reset role;
select results_eq(
  $$select m.role::text, m.perm, m.by_default, m.given, m.held
    from public.role_permission_matrix('93000000-0000-4000-b000-000000000001') m
    where m.perm like 'schedule.%'
    order by 1, 2$$,
  $$values
    ('manager'::text, 'schedule.edit'::text, true, false, false),
    ('manager'::text, 'schedule.publish'::text, true, true, false),
    ('worker'::text, 'schedule.edit'::text, false, true, true),
    ('worker'::text, 'schedule.publish'::text, false, true, true)$$,
  'the console''s matrix has each role''s default, its own rule and what it holds by it'
);
select ok(
  (select count(*) from public.role_permission_matrix('93000000-0000-4000-b000-000000000001'))
    = 2 * (select count(*) from public.permission_keys)
  and exists (
    select 1 from public.role_permission_matrix('93000000-0000-4000-b000-000000000001') m
    where m.perm = 'schedule.publish' and m.area = 'scheduling'
      and m.requires = 'schedule.edit' and m.settable and not m.by_owner
  )
  and exists (
    select 1 from public.role_permission_matrix('93000000-0000-4000-b000-000000000001') m
    where m.perm = 'clock.payroll' and m.by_owner and not m.settable
  )
  and not exists (select 1 from public.role_permission_matrix('93000000-0000-4000-b000-0000000000ff')),
  'with every key for managers and workers, its area, what it requires and how it changes, and nothing for an unknown business'
);

------------------------------------------------------------------------------
-- Who reads the rows, which say who set each rule and when: the owner

select pg_temp.sign_in('93000000-0000-4000-a000-000000000001');
select is(pg_temp.rows_read(), 3, 'the owner reads the business''s role rows');
select pg_temp.sign_in('93000000-0000-4000-a000-000000000007');
select is(pg_temp.rows_read(), 3, 'and so does the team viewing the business as its owner');
select pg_temp.sign_in('93000000-0000-4000-a000-000000000002');
select is(pg_temp.rows_read(), 0, 'a manager reads none: what they hold comes from my_permissions');
select pg_temp.sign_in('93000000-0000-4000-a000-000000000003');
select is(pg_temp.rows_read(), 0, 'nor does a worker');
select pg_temp.sign_in('93000000-0000-4000-a000-000000000004');
select is(pg_temp.rows_read(), 0, 'nor the accountant');
reset role;

------------------------------------------------------------------------------
-- Back to the defaults

set local role service_role;
select public.set_role_permission('93000000-0000-4000-a000-000000000001',
  '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', false);
reset role;
select results_eq(
  'select * from pg_temp.role_rows()',
  $$values
    ('manager'::text, 'schedule.edit'::text, false),
    ('worker'::text, 'schedule.publish'::text, true)$$,
  'back to its default, the workers'' row goes, and the publishing that requires it stays as it was'
);
select ok(
  not private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000003', 'schedule.publish'),
  'holding nothing without what it requires'
);

set local role service_role;
select public.set_role_permission('93000000-0000-4000-a000-000000000001',
  '93000000-0000-4000-b000-000000000001', 'manager', 'schedule.edit', true);
select public.set_role_permission('93000000-0000-4000-a000-000000000001',
  '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.publish', false);
reset role;
select is_empty(
  'select * from pg_temp.role_rows()',
  'with each back to its default, the business has no role row, as it started'
);
select ok(
  private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000002', 'schedule.edit')
  and private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000002', 'schedule.publish')
  and not private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000003', 'schedule.edit')
  and not private.holds_perm('93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000003', 'schedule.publish'),
  'and everyone holds what they held before'
);
select results_eq(
  $$select a.actor_id, a.details ->> 'role', a.details ->> 'perm',
      (a.details ->> 'from')::boolean, (a.details ->> 'to')::boolean
    from public.audit_log a
    where a.business_id = '93000000-0000-4000-b000-000000000001' and a.action = 'role.permission'
    order by a.id$$,
  $$values
    ('93000000-0000-4000-a000-000000000001'::uuid, 'worker'::text, 'schedule.edit'::text, false, true),
    ('93000000-0000-4000-a000-000000000001'::uuid, 'worker'::text, 'schedule.publish'::text, false, true),
    ('93000000-0000-4000-a000-000000000005'::uuid, 'manager'::text, 'schedule.edit'::text, true, false),
    ('93000000-0000-4000-a000-000000000001'::uuid, 'worker'::text, 'schedule.edit'::text, true, false),
    ('93000000-0000-4000-a000-000000000001'::uuid, 'manager'::text, 'schedule.edit'::text, false, true),
    ('93000000-0000-4000-a000-000000000001'::uuid, 'worker'::text, 'schedule.publish'::text, true, false)$$,
  'every change is one line of the log, the way back to the defaults included'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '93000000-0000-4000-b000-000000000001' and a.action like 'permission.%'),
  0,
  'never under permission.*, which pay holders and accountants read'
);

-- A row that only says the role's default (a demo's seed writes one, granting,
-- for any key its definition lists) goes when the default is chosen, with
-- no line: the role's rule didn't change.
insert into public.role_permissions (business_id, role, perm, allowed)
values ('93000000-0000-4000-b000-000000000001', 'manager', 'schedule.edit', true);
set local role service_role;
select public.set_role_permission('93000000-0000-4000-a000-000000000001',
  '93000000-0000-4000-b000-000000000001', 'manager', 'schedule.edit', true);
reset role;
select ok(
  not exists (select 1 from pg_temp.role_rows())
  and (select count(*) from public.audit_log a
       where a.business_id = '93000000-0000-4000-b000-000000000001'
         and a.action = 'role.permission') = 6,
  'a row that only met its default goes quietly'
);

------------------------------------------------------------------------------
-- Who reads those lines: as module.settings

select pg_temp.sign_in('93000000-0000-4000-a000-000000000001');
select is(pg_temp.role_lines(), 6, 'the owner reads them');
select pg_temp.sign_in('93000000-0000-4000-a000-000000000002');
select is(pg_temp.role_lines(), 6, 'and so does a manager');
select pg_temp.sign_in('93000000-0000-4000-a000-000000000007');
select is(pg_temp.role_lines(), 6, 'and the team viewing the business as its owner');
select pg_temp.sign_in('93000000-0000-4000-a000-000000000003');
select is(pg_temp.role_lines(), 0, 'a worker reads none');
select pg_temp.sign_in('93000000-0000-4000-a000-000000000004');
select is(pg_temp.role_lines(), 0, 'nor does the accountant, who reads the pay rows');
reset role;

------------------------------------------------------------------------------
-- Who may not

set local role service_role;
select throws_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000002',
    '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true)$$,
  '42501', null, 'a manager changes no role''s permissions (Q5)'
);
select throws_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000003',
    '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true)$$,
  '42501', null, 'nor does a worker'
);
select throws_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000004',
    '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true)$$,
  '42501', null, 'nor the accountant'
);
select throws_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000006',
    '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true)$$,
  '42501', null, 'nor the owner of another business'
);
select throws_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'worker', 'clock.edit', true)$$,
  '22023', null, 'a key whose area isn''t open for changes yet is refused'
);
select throws_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'owner', 'schedule.edit', false)$$,
  '22023', null, 'and owners always hold every key'
);
select throws_ok(
  $$select public.set_member_permission('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000003', 'schedule.edit', true)$$,
  '22023', null, 'a person is still given only pay, though the role''s key is settable'
);
reset role;

select pg_temp.sign_in('93000000-0000-4000-a000-000000000007');
select throws_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000007',
    '93000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true)$$,
  '42501', null, 'a view calls no setter from the browser'
);
select throws_ok(
  $$select * from public.role_permission_matrix('93000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'nor reads the console''s matrix'
);
reset role;

------------------------------------------------------------------------------
-- Pay, as before

set local role service_role;
select lives_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true)$$,
  'the owner gives managers pay access'
);
reset role;
select ok(
  exists (
    select 1 from public.role_permissions rp
    where rp.business_id = '93000000-0000-4000-b000-000000000001'
      and rp.role = 'manager' and rp.perm = 'clock.payroll' and rp.allowed
  )
  and exists (
    select 1 from public.audit_log a
    where a.business_id = '93000000-0000-4000-b000-000000000001' and a.action = 'permission.grant'
      and a.details = '{"role": "manager", "perm": "clock.payroll"}'::jsonb
  )
  and pg_temp.role_lines() = 6,
  'by adding its row, logged as permission.grant as before, never as role.permission'
);
set local role service_role;
select public.set_role_permission('93000000-0000-4000-a000-000000000001',
  '93000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', false);
reset role;
select ok(
  not exists (
    select 1 from public.role_permissions rp
    where rp.business_id = '93000000-0000-4000-b000-000000000001' and rp.perm = 'clock.payroll'
  )
  and exists (
    select 1 from public.audit_log a
    where a.business_id = '93000000-0000-4000-b000-000000000001' and a.action = 'permission.revoke'
      and a.details = '{"role": "manager", "perm": "clock.payroll"}'::jsonb
  ),
  'and takes it back by removing it, logged as permission.revoke'
);

------------------------------------------------------------------------------
-- One area in one go, as the console writes it

set local role service_role;
select is(
  pg_temp.refusal($$select public.set_role_permissions('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'worker',
    '{schedule.edit,clock.edit}', '{true,true}')$$),
  '22023',
  'a key of the change refused refuses all of it'
);
reset role;
select is_empty(
  'select * from pg_temp.role_rows()',
  'so nothing of it is written, the key before it included'
);
set local role service_role;
select throws_ok(
  $$select public.set_role_permissions('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'worker',
    '{schedule.edit,schedule.publish}', '{true}')$$,
  '22023', null, 'and so does a key without its answer'
);
select lives_ok(
  $$select public.set_role_permissions('93000000-0000-4000-a000-000000000001',
    '93000000-0000-4000-b000-000000000001', 'worker',
    '{schedule.edit,schedule.publish}', '{true,true}')$$,
  'the owner raises workers to build and publish the schedule in one go, building first'
);
-- Its undo, as the screen writes it: the denials, what requires another
-- first.
select public.set_role_permissions('93000000-0000-4000-a000-000000000001',
  '93000000-0000-4000-b000-000000000001', 'worker',
  '{schedule.publish,schedule.edit}', '{false,false}');
reset role;
select is_empty(
  'select * from pg_temp.role_rows()',
  'and its undo leaves no worker row behind'
);
select results_eq(
  $$select a.details ->> 'role', a.details ->> 'perm',
      (a.details ->> 'from')::boolean, (a.details ->> 'to')::boolean
    from public.audit_log a
    where a.business_id = '93000000-0000-4000-b000-000000000001' and a.action = 'role.permission'
    order by a.id
    offset 6$$,
  $$values
    ('worker'::text, 'schedule.edit'::text, false, true),
    ('worker'::text, 'schedule.publish'::text, false, true),
    ('worker'::text, 'schedule.publish'::text, true, false),
    ('worker'::text, 'schedule.edit'::text, true, false)$$,
  'a line for each key, the undo''s taking back each of the raise''s'
);

------------------------------------------------------------------------------
-- A demo business

insert into private.demo_businesses (business_id, definition)
values ('93000000-0000-4000-b000-000000000003', $json$
  {
    "slug": "rs-demo", "name": "Roles demo", "accent": "#7c3aed",
    "address": "Demo street 5", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "people": [
      { "user_id": "93000000-0000-4000-a000-000000000011", "role": "owner", "name": "Owner 11" }
    ]
  }
  $json$);

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('93000000-0000-4000-b000-000000000003')$$,
  'a demo business is made'
);
select lives_ok(
  $$select public.set_role_permission('93000000-0000-4000-a000-000000000011',
    '93000000-0000-4000-b000-000000000003', 'worker', 'schedule.edit', true)$$,
  'and its visitor, as its owner, changes a role''s permissions, as its pay'
);
reset role;
select is(
  (select count(*)::integer from public.role_permissions rp
   where rp.business_id = '93000000-0000-4000-b000-000000000003'),
  1,
  'which is a row of the demo''s'
);
set local role service_role;
select public.reset_demo_business('93000000-0000-4000-b000-000000000003');
reset role;
select is_empty(
  $$select 1 from public.role_permissions rp
    where rp.business_id = '93000000-0000-4000-b000-000000000003'$$,
  'until its reset, which leaves no role row but its definition''s'
);
select is(
  (select c.confdeltype::text from pg_constraint c
   where c.conrelid = 'public.role_permissions'::regclass
     and c.confrelid = 'public.businesses'::regclass
     and c.contype = 'f'),
  'c'::text,
  'role rows go with their business, as the reset deletes it'
);

select * from finish();
rollback;
