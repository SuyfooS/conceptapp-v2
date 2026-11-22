-- Roles and permissions by module, R7 (20261115001000_roles_manage.sql): the
-- management page by its permissions. With today's defaults everyone reads
-- the activity log exactly as before, members and views as each role alike,
-- over the seed's rows and a fixture of every family; owners and the team
-- switch the area per role (settable); a family the log's areas don't name is
-- read by no one through them; a worker raised to view reads the settings and
-- the log of what manage.view alone opens, and saves nothing, a list's
-- template included; at edit saves the details, the departments and who is in
-- them, and a module's settings with that module's own edit, never without
-- it, and, since R5 moved them (critique 4), no list's template without
-- lists.manage; a manager lowered to view still reads and saves nothing, at
-- none reads no row and still saves a list's template as one who runs the
-- lists; the log by each row's own area (a
-- manager lowered in scheduling no longer reads schedule.*, swap.* or
-- availability.* rows and still reads module.*, and so on for the clock,
-- lists, the team and chat); a view reads as its role holds; owners and the
-- ConceptApp team always save; another business's people read nothing. Fixed
-- ids (95…), and the seed's demo businesses for the equivalence.
begin;
select plan(69);

-- 1 owner, 2 manager, 3 worker, 4 accountant of B1; 11 owner, 12 manager,
-- 13 worker of B2; 21 owner of B3; 5 and 6 on the ConceptApp team, members of
-- nothing (6 does the views).
insert into auth.users (id, aud, role, phone)
select
  ('95000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250095' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,11,12,13,21}'::int[]) as n;

insert into public.businesses (id, slug, name)
values
  ('95000000-0000-4000-b000-000000000001', 'rm-one', 'Roles Manage One'),
  ('95000000-0000-4000-b000-000000000002', 'rm-two', 'Roles Manage Two'),
  ('95000000-0000-4000-b000-000000000003', 'rm-three', 'Roles Manage Three');

insert into public.memberships (business_id, user_id, role)
values
  ('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-a000-000000000001', 'owner'),
  ('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-a000-000000000002', 'manager'),
  ('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-a000-000000000003', 'worker'),
  ('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-a000-000000000004', 'accountant'),
  ('95000000-0000-4000-b000-000000000002', '95000000-0000-4000-a000-000000000011', 'owner'),
  ('95000000-0000-4000-b000-000000000002', '95000000-0000-4000-a000-000000000012', 'manager'),
  ('95000000-0000-4000-b000-000000000002', '95000000-0000-4000-a000-000000000013', 'worker'),
  ('95000000-0000-4000-b000-000000000003', '95000000-0000-4000-a000-000000000021', 'owner');

insert into public.business_modules (business_id, module_key, enabled)
values
  ('95000000-0000-4000-b000-000000000001', 'scheduling', true),
  ('95000000-0000-4000-b000-000000000001', 'notifications', true),
  ('95000000-0000-4000-b000-000000000001', 'lists', true),
  ('95000000-0000-4000-b000-000000000002', 'scheduling', true),
  ('95000000-0000-4000-b000-000000000002', 'chat', true)
on conflict (business_id, module_key) do nothing;

-- B1's kitchen, the department the departments' saves below keep.
insert into public.departments (id, business_id, key, name)
values (
  '95000000-0000-4000-d000-000000000001', '95000000-0000-4000-b000-000000000001',
  'kitchen', 'Kitchen'
);

insert into public.platform_staff (user_id, role)
values
  ('95000000-0000-4000-a000-000000000005', 'onboarder'),
  ('95000000-0000-4000-a000-000000000006', 'onboarder');

-- A row of every family in each business: the areas' own (clock, schedule,
-- swap, availability, lists, invite, member, team, profile, chat), those of
-- the management page alone (module, business, departments, wording, role,
-- permission, view_as), the pay rows (wage, payroll) and documents'.
insert into public.audit_log (business_id, action)
select b.id, f.family || '.fixture'
from unnest('{95000000-0000-4000-b000-000000000001,95000000-0000-4000-b000-000000000002,95000000-0000-4000-b000-000000000003}'::uuid[]) as b (id)
cross join unnest('{availability,business,chat,clock,departments,document,invite,lists,member,module,payroll,permission,profile,role,schedule,swap,team,view_as,wage,wording}'::text[]) as f (family);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- The families of a business's fixture rows the signed-in person reads, in
-- order.
create function pg_temp.families(business uuid) returns text language sql as $$
  select coalesce(
    string_agg(split_part(a.action, '.', 1), ',' order by split_part(a.action, '.', 1) collate "C"),
    ''
  )
  from public.audit_log a
  where a.business_id = business
    and a.action like '%.fixture'
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

-- The team member 6 viewing a business as a role, the last view ended.
create function pg_temp.view_as(business uuid, r public.member_role) returns void language sql as $$
  update public.view_sessions v
  set ended_at = now()
  where v.staff_id = '95000000-0000-4000-a000-000000000006' and v.ended_at is null;
  insert into public.view_sessions (staff_id, business_id, role)
  values ('95000000-0000-4000-a000-000000000006', business, r);
$$;

-- The log's two policies before this migration (20261111000700_documents.sql's
-- and 20261111000200_chat.sql's), frozen: the rows they let the person in
-- request.jwt.claims read, run with RLS off.
create function pg_temp.old_reads() returns bigint[] language sql as $$
  select coalesce(array_agg(a.id order by a.id), '{}'::bigint[])
  from public.audit_log a
  where (
      private.has_role(a.business_id, 'manager')
      and not private.is_pay_action(a.action)
      and a.action !~ '^document\.'
    )
    or (
      private.has_perm(a.business_id, 'clock.payroll')
      and (private.is_pay_action(a.action) or a.action ~ '^(clock|permission|document)\.')
    )
    or (
      not private.is_private_action(a.action)
      and (
        (private.is_viewing(a.business_id, 'manager') and not private.is_pay_action(a.action))
        or (
          private.viewing_payroll(a.business_id)
          and (private.is_pay_action(a.action) or a.action ~ '^(clock|permission)\.')
        )
      )
    )
$$;

-- The rows the signed-in person reads now, through RLS.
create function pg_temp.new_reads() returns bigint[] language sql as $$
  select coalesce(array_agg(a.id order by a.id), '{}'::bigint[])
  from public.audit_log a
$$;

-- Everyone a member somewhere, and a team member who is nobody's, whose rows
-- read before and now differ.
create function pg_temp.member_differences() returns setof text language plpgsql as $$
declare
  reader uuid;
  old_ids bigint[];
  new_ids bigint[];
begin
  for reader in
    select distinct m.user_id from public.memberships m
    union
    select '95000000-0000-4000-a000-000000000005'::uuid
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', reader, 'role', 'authenticated')::text, true);
    old_ids := pg_temp.old_reads();
    perform set_config('role', 'authenticated', true);
    new_ids := pg_temp.new_reads();
    perform set_config('role', 'none', true);
    if old_ids is distinct from new_ids then
      return next reader::text;
    end if;
  end loop;
end;
$$;

-- Every business viewed as every role, whose rows read before and now differ.
create function pg_temp.view_differences() returns setof text language plpgsql as $$
declare
  business uuid;
  viewed public.member_role;
  old_ids bigint[];
  new_ids bigint[];
begin
  for business in select b.id from public.businesses b order by b.id loop
    foreach viewed in array '{owner,manager,worker,accountant}'::public.member_role[] loop
      perform pg_temp.view_as(business, viewed);
      perform set_config('request.jwt.claims',
        json_build_object('sub', '95000000-0000-4000-a000-000000000006', 'role', 'authenticated')::text, true);
      old_ids := pg_temp.old_reads();
      perform set_config('role', 'authenticated', true);
      new_ids := pg_temp.new_reads();
      perform set_config('role', 'none', true);
      if old_ids is distinct from new_ids then
        return next business::text || ' as ' || viewed::text;
      end if;
    end loop;
  end loop;
  update public.view_sessions v
  set ended_at = now()
  where v.staff_id = '95000000-0000-4000-a000-000000000006' and v.ended_at is null;
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

select ok(
  has_function_privilege('authenticated', 'private.held_perms()', 'execute')
  and has_function_privilege('authenticated', 'private.viewed_perms()', 'execute')
  and has_function_privilege('authenticated', 'private.log_perm(text)', 'execute')
  and not has_function_privilege('anon', 'private.held_perms()', 'execute')
  and not has_function_privilege('anon', 'private.viewed_perms()', 'execute')
  and not has_function_privilege('anon', 'private.log_perm(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.can_edit_settings(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.can_edit_settings(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.settings_perm(public.module_key)', 'execute')
  and not has_function_privilege('anon', 'private.settings_perm(public.module_key)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_module_settings(uuid, uuid, public.module_key, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.set_module_settings(uuid, uuid, public.module_key, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.set_module_settings(uuid, uuid, public.module_key, jsonb)', 'execute'),
  'the log''s helpers run for the reader, the settings'' gates and their writer through the server only'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname || '.' || p.proname in (
       'private.can_edit_settings', 'private.held_perms', 'private.viewed_perms',
       'public.set_module_settings'
     )
     and p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  4,
  'each that reads a table runs as its owner with an empty search path'
);

------------------------------------------------------------------------------
-- The area, open

select results_eq(
  $$select k.key from public.permission_keys k
    where k.area = 'manage' and k.settable
    order by 1$$,
  $$values ('manage.edit'::text), ('manage.view'::text)$$,
  'owners and the team switch the management page''s two permissions per role'
);
select ok(
  not exists (
    select 1 from public.role_permission_matrix('95000000-0000-4000-b000-000000000001') m
    where m.area = 'manage' and not m.settable
  )
  and (select count(*) from public.role_permission_matrix('95000000-0000-4000-b000-000000000001') m
       where m.area = 'manage') = 4,
  'and the console''s matrix has them open, for managers and workers'
);
select results_eq(
  $$select w.what, private.log_perm(w.what)
    from unnest('{clock.in,clock.correct,schedule.publish,swap.approve,availability.missing,lists.send,invite.create,member.role,team.joined,profile.bio_cleared,chat.remove,chat.restore,menu.item.save,order.line.cancel,module.settings,business.details,departments.change,wording.change,role.permission,permission.grant,view_as.start}'::text[])
      with ordinality as w (what, n)
    order by w.n$$,
  $$values
    ('clock.in', 'clock.edit'), ('clock.correct', 'clock.edit'),
    ('schedule.publish', 'schedule.edit'), ('swap.approve', 'schedule.edit'),
    ('availability.missing', 'schedule.edit'),
    ('lists.send', 'lists.manage'),
    ('invite.create', 'team.view'), ('member.role', 'team.view'),
    ('team.joined', 'team.view'), ('profile.bio_cleared', 'team.view'),
    ('chat.remove', 'chat.moderate'), ('chat.restore', 'chat.moderate'),
    ('menu.item.save', 'order_taking.edit'), ('order.line.cancel', 'order_taking.edit'),
    ('module.settings', 'manage.view'), ('business.details', 'manage.view'),
    ('departments.change', 'manage.view'), ('wording.change', 'manage.view'),
    ('role.permission', 'manage.view'), ('permission.grant', 'manage.view'),
    ('view_as.start', 'manage.view')$$,
  'each row of the log is read by its own area, the management page''s own at manage.view alone'
);
select is(
  private.log_perm('week.fixture'),
  null::text,
  'and a family named nowhere by no one through the management page, until it is given an area'
);
select results_eq(
  $$select m::text, private.settings_perm(m)
    from unnest(enum_range(null::public.module_key)) as m
    order by 1$$,
  $$values
    ('chat'::text, 'chat.moderate'::text), ('employee_files'::text, null::text),
    ('lists'::text, 'lists.manage'::text),
    ('notifications'::text, null::text), ('order_taking'::text, 'order_taking.edit'::text),
    ('reservations'::text, null::text),
    ('scheduling'::text, 'schedule.edit'::text), ('storefront'::text, null::text),
    ('time_clock'::text, 'clock.edit'::text)$$,
  'a module''s settings need its own edit besides manage.edit, where it has an area of its own'
);
select ok(
  (select array_agg(p.policyname::text order by p.policyname)
   from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'audit_log')
    = '{"a view reads the log as its role would","members read the log by area, pay holders the pay rows"}'::text[]
  and exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'audit_log'
      and p.policyname = 'members read the log by area, pay holders the pay rows'
      and p.qual ~ 'held_perms' and p.qual !~ 'has_role'
  )
  and exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'audit_log'
      and p.policyname = 'a view reads the log as its role would'
      and p.qual ~ 'viewed_perms' and p.qual !~ 'is_viewing'
  ),
  'the log has its two policies, each asking what the reader holds once per query, by no rank'
);

------------------------------------------------------------------------------
-- Today's defaults: everyone reads exactly what they read before

select ok(
  exists (
    select 1 from public.audit_log a
    where a.business_id in (
      '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000002'
    )
  ),
  'the seed''s demo businesses have rows in the log to compare'
);
select is_empty(
  'select * from pg_temp.member_differences()',
  'every member in the database, and a team member who is nobody''s, reads the same rows as under the old policy'
);
select is_empty(
  'select * from pg_temp.view_differences()',
  'and so does every business viewed as each role'
);
reset role;

select pg_temp.sign_in('95000000-0000-4000-a000-000000000001');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'availability,business,chat,clock,departments,document,invite,lists,member,module,payroll,permission,profile,role,schedule,swap,team,view_as,wage,wording',
  'the owner reads every family'
);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000002');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'availability,business,chat,clock,departments,invite,lists,member,module,permission,profile,role,schedule,swap,team,view_as,wording',
  'a manager every family but pay''s and documents'''
);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000003');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  '',
  'a worker none'
);
select ok(
  not (public.my_permissions('95000000-0000-4000-b000-000000000001') && '{manage.view,manage.edit}'::text[]),
  'nor holds the management page''s'
);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000004');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'clock,document,payroll,permission,wage',
  'the accountant the pay rows, the clock''s, the permissions'' and documents'''
);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000021');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  '',
  'and another business''s owner nothing'
);
reset role;

------------------------------------------------------------------------------
-- A worker raised to view, by the owner

set local role service_role;
select lives_ok(
  $$select public.set_role_permission('95000000-0000-4000-a000-000000000001',
    '95000000-0000-4000-b000-000000000001', 'worker', 'manage.view', true)$$,
  'the owner raises workers to see the management page'
);
reset role;
select ok(
  private.holds_perm('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-a000-000000000003', 'manage.view')
  and not private.holds_perm('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-a000-000000000003', 'manage.edit'),
  'the worker holds manage.view, not manage.edit'
);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000003');
select ok(
  public.my_permissions('95000000-0000-4000-b000-000000000001') @> '{manage.view}'::text[]
  and not (public.my_permissions('95000000-0000-4000-b000-000000000001') @> '{manage.edit}'::text[]),
  'and the screens are told so'
);
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'business,departments,module,permission,role,view_as,wording',
  'they read the log''s rows of the management page alone: none of an area they don''t hold'
);
select ok(
  (select count(*) from public.business_modules bm
   where bm.business_id = '95000000-0000-4000-b000-000000000001') = 3,
  'and the settings, as every member does'
);
reset role;

set local role service_role;
select throws_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', 'notifications', '{"fixture": true}')$$,
  '42501', null, 'they save no module''s settings'
);
select throws_ok(
  $$select public.set_business_details('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', '{"address": "Fixture street 1"}')$$,
  '42501', null, 'nor the business''s details'
);
select throws_ok(
  $$select public.set_departments('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', '[{"key": "kitchen", "name": "Kitchen"}]')$$,
  '42501', null, 'nor its departments'
);
select throws_ok(
  $$select public.set_department_members('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', '95000000-0000-4000-d000-000000000001',
    '{95000000-0000-4000-a000-000000000003}')$$,
  '42501', null, 'nor who is in a department'
);
select throws_ok(
  $$select public.save_list_template('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001',
    '{"name": "Fixture worker list", "items": [{"kind": "check", "label": "A"}]}')$$,
  '42501', null, 'nor a list''s template, holding neither lists.manage nor manage.edit'
);
reset role;

------------------------------------------------------------------------------
-- And to edit

set local role service_role;
select lives_ok(
  $$select public.set_role_permission('95000000-0000-4000-a000-000000000001',
    '95000000-0000-4000-b000-000000000001', 'worker', 'manage.edit', true)$$,
  'the owner raises workers to edit the management page'
);
select lives_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', 'notifications', '{"fixture": true}')$$,
  'the worker saves the settings of a module without an area of its own'
);
select lives_ok(
  $$select public.set_business_details('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', '{"address": "Fixture street 1"}')$$,
  'and the business''s details'
);
select lives_ok(
  $$select public.set_departments('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', '[{"key": "kitchen", "name": "Kitchen"}]')$$,
  'and its departments'
);
select lives_ok(
  $$select public.set_department_members('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', '95000000-0000-4000-d000-000000000001',
    '{95000000-0000-4000-a000-000000000003}')$$,
  'and who is in each'
);
select is(
  pg_temp.refusal($$select public.set_module_settings('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', 'scheduling', '{"fixture": true}')$$),
  '42501 module schedule.edit',
  'but not the schedule''s settings without building the schedule, and the screen is told what it needs'
);
reset role;
select ok(
  (select bm.settings ? 'fixture' from public.business_modules bm
   where bm.business_id = '95000000-0000-4000-b000-000000000001' and bm.module_key = 'notifications')
  and not (select bm.settings ? 'fixture' from public.business_modules bm
   where bm.business_id = '95000000-0000-4000-b000-000000000001' and bm.module_key = 'scheduling'),
  'the one saved, the other left as it was'
);

-- Critique 4's reach, closed by the lists' phase (R5,
-- 20261115001200_roles_lists.sql), which put the ConceptApp team alone where
-- the templates' writers took private.can_edit_settings: manage.edit no
-- longer saves a list's template (and so the times it opens by itself)
-- without lists.manage.
select ok(
  not private.holds_perm('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-a000-000000000003', 'lists.manage')
  and not private.can_manage_lists('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-a000-000000000003'),
  'the worker doesn''t run the lists'
);
set local role service_role;
select throws_ok(
  $$select public.save_list_template('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001',
    '{"name": "Fixture worker list", "items": [{"kind": "check", "label": "A"}]}')$$,
  '42501', null, 'nor saves a list''s template at manage.edit alone, since R5 (critique 4)'
);
reset role;

-- Workers given building the schedule, as the scheduling phase lets owners.
insert into public.role_permissions (business_id, role, perm, allowed)
values ('95000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true);

set local role service_role;
select lives_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000003',
    '95000000-0000-4000-b000-000000000001', 'scheduling', '{"fixture": true}')$$,
  'with it, the worker saves the schedule''s settings too'
);
reset role;
select pg_temp.sign_in('95000000-0000-4000-a000-000000000003');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'availability,business,departments,module,permission,role,schedule,swap,view_as,wording',
  'and reads the schedule''s, the swaps'' and availability''s rows of the log, still none of the clock, lists, the team or chat'
);
reset role;

------------------------------------------------------------------------------
-- A manager lowered, by the ConceptApp team, then by the owner

set local role service_role;
select lives_ok(
  $$select public.set_role_permission('95000000-0000-4000-a000-000000000005',
    '95000000-0000-4000-b000-000000000001', 'manager', 'manage.edit', false)$$,
  'the team lowers managers to see the management page without editing it'
);
select throws_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000002',
    '95000000-0000-4000-b000-000000000001', 'notifications', '{"fixture": false}')$$,
  '42501', null, 'the manager saves no settings'
);
select throws_ok(
  $$select public.set_business_details('95000000-0000-4000-a000-000000000002',
    '95000000-0000-4000-b000-000000000001', '{"address": "Fixture street 2"}')$$,
  '42501', null, 'nor the business''s details'
);
reset role;
select pg_temp.sign_in('95000000-0000-4000-a000-000000000002');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'availability,business,chat,clock,departments,invite,lists,member,module,permission,profile,role,schedule,swap,team,view_as,wording',
  'and still reads the log as before'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.set_role_permission('95000000-0000-4000-a000-000000000001',
    '95000000-0000-4000-b000-000000000001', 'manager', 'manage.view', false)$$,
  'the owner lowers managers to none'
);
reset role;
select pg_temp.sign_in('95000000-0000-4000-a000-000000000002');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  '',
  'the manager reads no row of the log'
);
select ok(
  not (public.my_permissions('95000000-0000-4000-b000-000000000001') && '{manage.view,manage.edit}'::text[])
  and public.my_permissions('95000000-0000-4000-b000-000000000001')
    @> '{clock.edit,schedule.edit,lists.manage,team.view,chat.moderate}'::text[],
  'and holds neither of the management page''s permissions, every other area''s as before'
);
reset role;
set local role service_role;
select lives_ok(
  $$select public.save_list_template('95000000-0000-4000-a000-000000000002',
    '95000000-0000-4000-b000-000000000001',
    '{"name": "Fixture manager list", "items": [{"kind": "check", "label": "A"}]}')$$,
  'while still saving a list''s template, as one who runs the lists'
);
reset role;

------------------------------------------------------------------------------
-- The log by each row's own area: B2's managers lowered one area at a time

select pg_temp.sign_in('95000000-0000-4000-a000-000000000012');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  'availability,business,chat,clock,departments,invite,lists,member,module,permission,profile,role,schedule,swap,team,view_as,wording',
  'B2''s manager reads every family but pay''s and documents'''
);
reset role;

insert into public.role_permissions (business_id, role, perm, allowed)
values ('95000000-0000-4000-b000-000000000002', 'manager', 'schedule.edit', false);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000012');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  'business,chat,clock,departments,invite,lists,member,module,permission,profile,role,team,view_as,wording',
  'lowered in scheduling, no longer the schedule''s, the swaps'' or availability''s rows, still module.*'
);
reset role;
set local role service_role;
select is(
  pg_temp.refusal($$select public.set_module_settings('95000000-0000-4000-a000-000000000012',
    '95000000-0000-4000-b000-000000000002', 'scheduling', '{"fixture": true}')$$),
  '42501 module schedule.edit',
  'nor saves the schedule''s settings'
);
select lives_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000012',
    '95000000-0000-4000-b000-000000000002', 'notifications', '{"fixture": true}')$$,
  'while still saving the rest'
);
reset role;

insert into public.role_permissions (business_id, role, perm, allowed)
values ('95000000-0000-4000-b000-000000000002', 'manager', 'clock.edit', false);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000012');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  'business,chat,departments,invite,lists,member,module,permission,profile,role,team,view_as,wording',
  'lowered in the clock, no longer its rows'
);
reset role;

insert into public.role_permissions (business_id, role, perm, allowed)
values ('95000000-0000-4000-b000-000000000002', 'manager', 'lists.manage', false);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000012');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  'business,chat,departments,invite,member,module,permission,profile,role,team,view_as,wording',
  'lowered in lists, no longer theirs'
);
reset role;

insert into public.role_permissions (business_id, role, perm, allowed)
values ('95000000-0000-4000-b000-000000000002', 'manager', 'team.view', false);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000012');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  'business,chat,departments,module,permission,role,view_as,wording',
  'at none in the team, no longer the invites'', members'', the team''s or profiles'''
);
reset role;

insert into public.role_permissions (business_id, role, perm, allowed)
values ('95000000-0000-4000-b000-000000000002', 'manager', 'chat.moderate', false);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000012');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  'business,departments,module,permission,role,view_as,wording',
  'and without moderating chat, no longer its: the management page''s own rows alone'
);
reset role;

-- A worker given the clock's edit and the management page's view, nothing more.
insert into public.role_permissions (business_id, role, perm, allowed)
values
  ('95000000-0000-4000-b000-000000000002', 'worker', 'clock.edit', true),
  ('95000000-0000-4000-b000-000000000002', 'worker', 'manage.view', true);
select pg_temp.sign_in('95000000-0000-4000-a000-000000000013');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  'business,clock,departments,module,permission,role,view_as,wording',
  'a worker at manage.view with the clock''s edit reads the clock''s rows and the management page''s'
);
reset role;
delete from public.role_permissions rp
where rp.business_id = '95000000-0000-4000-b000-000000000002'
  and rp.role = 'worker' and rp.perm = 'manage.view';
select pg_temp.sign_in('95000000-0000-4000-a000-000000000013');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  '',
  'and nothing without manage.view, the clock''s edit notwithstanding'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000011',
    '95000000-0000-4000-b000-000000000002', 'chat', '{"fixture": true}')$$,
  'B2''s owner saves chat''s settings, holding every key whatever the managers'''
);
reset role;
select pg_temp.sign_in('95000000-0000-4000-a000-000000000011');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000002'),
  'availability,business,chat,clock,departments,document,invite,lists,member,module,payroll,permission,profile,role,schedule,swap,team,view_as,wage,wording',
  'and reads every row of the log'
);
reset role;

------------------------------------------------------------------------------
-- A view as each role, of B1 as it now is: workers at edit here and building
-- the schedule, managers at none

select pg_temp.view_as('95000000-0000-4000-b000-000000000001', 'owner');
select pg_temp.sign_in('95000000-0000-4000-a000-000000000006');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'availability,business,clock,departments,invite,lists,member,module,permission,profile,role,schedule,swap,team,view_as,wording',
  'a view as the owner reads every row but pay''s, chat''s and documents'''
);
reset role;
select pg_temp.view_as('95000000-0000-4000-b000-000000000001', 'manager');
select pg_temp.sign_in('95000000-0000-4000-a000-000000000006');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  '',
  'a view as a manager none, as the managers now'
);
reset role;
select pg_temp.view_as('95000000-0000-4000-b000-000000000001', 'worker');
select pg_temp.sign_in('95000000-0000-4000-a000-000000000006');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'availability,business,departments,module,permission,role,schedule,swap,view_as,wording',
  'a view as a worker what the workers now read'
);
select ok(
  public.my_permissions('95000000-0000-4000-b000-000000000001')
    @> '{manage.view,manage.edit,schedule.edit}'::text[],
  'and holds what they hold'
);
reset role;
select pg_temp.view_as('95000000-0000-4000-b000-000000000001', 'accountant');
select pg_temp.sign_in('95000000-0000-4000-a000-000000000006');
select is(
  pg_temp.families('95000000-0000-4000-b000-000000000001'),
  'clock,payroll,permission,wage',
  'a view as the accountant the pay rows, the clock''s and the permissions'', never documents'''
);
reset role;
update public.view_sessions v
set ended_at = now()
where v.staff_id = '95000000-0000-4000-a000-000000000006' and v.ended_at is null;

------------------------------------------------------------------------------
-- The owner and the ConceptApp team always save

set local role service_role;
select lives_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000005',
    '95000000-0000-4000-b000-000000000001', 'scheduling', '{"fixture": false}')$$,
  'the team saves a module''s settings in a business it isn''t in'
);
select lives_ok(
  $$select public.set_business_details('95000000-0000-4000-a000-000000000005',
    '95000000-0000-4000-b000-000000000001', '{"address": "Fixture street 3"}')$$,
  'and its details'
);
select lives_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000001',
    '95000000-0000-4000-b000-000000000001', 'scheduling', '{"fixture": true}')$$,
  'and so does the owner, whatever the roles hold'
);
select throws_ok(
  $$select public.set_module_settings('95000000-0000-4000-a000-000000000021',
    '95000000-0000-4000-b000-000000000001', 'notifications', '{"fixture": true}')$$,
  '42501', null, 'another business''s owner saves nothing here'
);
reset role;

------------------------------------------------------------------------------
-- Back to the defaults

set local role service_role;
select public.set_role_permission('95000000-0000-4000-a000-000000000001',
  '95000000-0000-4000-b000-000000000001', 'worker', 'manage.edit', false);
select public.set_role_permission('95000000-0000-4000-a000-000000000001',
  '95000000-0000-4000-b000-000000000001', 'worker', 'manage.view', false);
select public.set_role_permission('95000000-0000-4000-a000-000000000001',
  '95000000-0000-4000-b000-000000000001', 'manager', 'manage.view', true);
select public.set_role_permission('95000000-0000-4000-a000-000000000001',
  '95000000-0000-4000-b000-000000000001', 'manager', 'manage.edit', true);
reset role;
delete from public.role_permissions rp
where rp.business_id in ('95000000-0000-4000-b000-000000000001', '95000000-0000-4000-b000-000000000002');
select is_empty(
  'select * from pg_temp.member_differences()',
  'with every role back to its defaults, everyone reads as under the old policy again'
);
reset role;
select is(
  (select count(*)::int from public.audit_log a
   where a.business_id = '95000000-0000-4000-b000-000000000001'
     and a.action = 'role.permission'
     and a.details ->> 'area' = 'manage'),
  8,
  'every change of the management page''s permissions is a line of the log, the way back included'
);

select * from finish();
rollback;
