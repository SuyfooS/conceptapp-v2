-- Roles and permissions by module, R11a (20261115001500_named_roles.sql):
-- roles a business names itself. Before any exists, the new resolver answers
-- as R1's for every membership and role in the database. An owner and the
-- team add one, built on a manager or a worker, from its base's rules, the
-- other built-in role's or another named role's, holding exactly what that
-- one holds and never pay; nobody else does, nor a name taken, a twenty-first
-- role or a bad name; a demo business takes them and its reset takes them
-- away. The unique index that replaced the primary key keeps a named role's
-- row beside its base's; its rows are for its base only and never pay. A
-- person in one holds what its rows decide, else its base's, with what each
-- key requires and their personal grants as before; a view still views the
-- built-in roles. public.set_role_permission(s) write its rows against its
-- base's rule. Renamed, archived (refused while held; the people who left
-- with it lose it; one archived is renamed, set, copied and put in by
-- nobody) and restored; the console's matrix has every live one
-- after managers and workers. Each change is logged and read at manage.view;
-- members and views read the roles; the functions are the server's alone.
-- Nothing changes for anyone without a named role, and a change of role to
-- another base leaves it behind. Fixed ids (a1…) and numbers (050-081-xxxx),
-- so nothing here meets the seed or another test.
begin;
select plan(53);

-- 1 owner, 2 manager, 3 worker, 4 accountant of A; 5 on the ConceptApp
-- team; 6 owner of B; 7 on the team, viewing A as its owner; 8 a worker and
-- 9 a manager who will hold A's named roles; 10 on the team, viewing A as a
-- worker; 11 the demo's owner; 12 a worker who left A.
insert into auth.users (id, aud, role, phone)
select
  ('a1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250081' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,7,8,9,10,11,12}'::int[]) as n;

insert into public.businesses (id, slug, name)
values
  ('a1000000-0000-4000-b000-000000000001', 'rn-one', 'Roles Named'),
  ('a1000000-0000-4000-b000-000000000002', 'rn-two', 'Roles Elsewhere');

insert into public.memberships (business_id, user_id, role, active)
values
  ('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000001', 'owner', true),
  ('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000002', 'manager', true),
  ('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000003', 'worker', true),
  ('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000004', 'accountant', true),
  ('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'worker', true),
  ('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000009', 'manager', true),
  ('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000012', 'worker', false),
  ('a1000000-0000-4000-b000-000000000002', 'a1000000-0000-4000-a000-000000000006', 'owner', true);

insert into public.platform_staff (user_id, role)
values
  ('a1000000-0000-4000-a000-000000000005', 'onboarder'),
  ('a1000000-0000-4000-a000-000000000007', 'onboarder'),
  ('a1000000-0000-4000-a000-000000000010', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('a1000000-0000-4000-a000-000000000007', 'a1000000-0000-4000-b000-000000000001', 'owner'),
  ('a1000000-0000-4000-a000-000000000010', 'a1000000-0000-4000-b000-000000000001', 'worker');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;
create temporary table seen (who text primary key, n integer) on commit drop;
grant all on seen to authenticated, service_role, anon;

create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- What a call is refused with: its code and hint, and its detail.
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

-- R1's resolver (20261115000700_roles_catalogue.sql), before roles a business
-- names: a role's rule is its row, else its key's default roles.
create function pg_temp.old_role_gives(business uuid, r public.member_role, perm_key text)
returns boolean language sql stable as $$
  select coalesce(
    (
      select rp.allowed
      from public.role_permissions rp
      where rp.business_id = business
        and rp.role = r
        and rp.perm = perm_key
    ),
    exists (
      select 1
      from public.permission_keys k
      where k.key = perm_key
        and not k.by_owner
        and r = any (k.default_roles)
    )
  )
$$;

create function pg_temp.old_role_holds(business uuid, r public.member_role, perm_key text)
returns boolean language sql stable as $$
  with recursive needed (need) as (
    select perm_key
    union
    select k.requires
    from needed n
    join public.permission_keys k on k.key = n.need
    where k.requires is not null
  )
  select bool_and(pg_temp.old_role_gives(business, r, n.need))
  from needed n
$$;

create function pg_temp.old_holds_perm(business uuid, person uuid, perm_key text)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (
        m.role = 'owner'
        or (m.role = 'accountant' and perm_key = any (private.accountant_perms()))
        or (
          private.is_staff_role(m.role)
          and (
            perm_key = any (m.perms)
            or (
              pg_temp.old_role_gives(m.business_id, m.role, perm_key)
              and not exists (
                select 1
                from public.permission_keys k
                where k.key = perm_key
                  and k.requires is not null
                  and not pg_temp.old_holds_perm(business, person, k.requires)
              )
            )
          )
        )
      )
  )
$$;

-- A's own rules for its managers and workers, set as its owner sets them:
-- workers run the lists and correct hours, managers see pay and moderate
-- no chat.
set local role service_role;
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'lists.manage', true);
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'clock.edit', true);
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true);
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'manager', 'chat.moderate', false);
reset role;

------------------------------------------------------------------------------
-- Before any role a business names: R1's answers

select is_empty(
  $$
    select m.business_id, m.user_id, k.key
    from public.memberships m
    cross join public.permission_keys k
    where pg_temp.old_holds_perm(m.business_id, m.user_id, k.key)
      is distinct from private.holds_perm(m.business_id, m.user_id, k.key)
  $$,
  'before any named role, every membership in the database holds what R1''s resolver gives it'
);
select is_empty(
  $$
    select b.id, r.role, k.key
    from public.businesses b
    cross join unnest('{manager,worker}'::public.member_role[]) as r (role)
    cross join public.permission_keys k
    where pg_temp.old_role_holds(b.id, r.role, k.key)
      is distinct from private.role_holds(b.id, r.role, k.key)
  $$,
  'and every business''s managers and workers what they held by role, as a view sees them'
);

-- What everyone holds now, for after.
create temporary table held_before on commit drop as
select m.business_id, m.user_id, k.key, private.holds_perm(m.business_id, m.user_id, k.key) as held
from public.memberships m
cross join public.permission_keys k;
create temporary table role_before on commit drop as
select b.id as business_id, r.role, k.key, private.role_holds(b.id, r.role, k.key) as held
from public.businesses b
cross join unnest('{manager,worker}'::public.member_role[]) as r (role)
cross join public.permission_keys k;

------------------------------------------------------------------------------
-- The table and who may call what

select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.business_roles'::regclass)
  and has_table_privilege('authenticated', 'public.business_roles', 'select')
  and not has_table_privilege('authenticated', 'public.business_roles', 'insert, update, delete')
  and not has_table_privilege('anon', 'public.business_roles', 'select, insert, update, delete')
  and not has_table_privilege('service_role', 'public.business_roles', 'insert, update, delete')
  and has_table_privilege('service_role', 'public.business_roles', 'select'),
  'the roles are read under RLS and written by the functions alone, even with the secret key'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_business_role(uuid, uuid, public.member_role, text, text, uuid, public.member_role)', 'execute')
  and not has_function_privilege('anon', 'public.create_business_role(uuid, uuid, public.member_role, text, text, uuid, public.member_role)', 'execute')
  and has_function_privilege('service_role', 'public.create_business_role(uuid, uuid, public.member_role, text, text, uuid, public.member_role)', 'execute')
  and not has_function_privilege('authenticated', 'public.rename_business_role(uuid, uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.rename_business_role(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.archive_business_role(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.archive_business_role(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.restore_business_role(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.restore_business_role(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_role_permission(uuid, uuid, public.member_role, text, boolean, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.set_role_permission(uuid, uuid, public.member_role, text, boolean, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[], uuid)', 'execute')
  and has_function_privilege('service_role', 'public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[], uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.role_permission_matrix(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.role_permission_matrix(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.role_gives(uuid, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.role_holds(uuid, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.check_role_changer(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.clean_role_name(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.clear_named_role()', 'execute')
  and not has_function_privilege('authenticated', 'private.refuse_named_role_pay()', 'execute')
  and not has_function_privilege('authenticated', 'private.refuse_archived_named_role()', 'execute')
  and not has_function_privilege('anon', 'private.role_gives(uuid, public.member_role, text, uuid)', 'execute'),
  'roles are added, renamed, archived and set through the server only, and who holds what is asked inside the database'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname || '.' || p.proname in (
       'public.create_business_role', 'public.rename_business_role',
       'public.archive_business_role', 'public.restore_business_role',
       'public.set_role_permission', 'public.set_role_permissions',
       'public.role_permission_matrix', 'private.role_gives', 'private.role_holds',
       'private.holds_perm', 'private.check_role_changer', 'private.clear_named_role',
       'private.refuse_named_role_pay', 'private.refuse_archived_named_role'
     )
     and p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  14,
  'each one of them, and no older overload, runs as its owner with an empty search_path'
);
select ok(
  not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.role_permissions'::regclass and c.contype = 'p'
  )
  and exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.role_permissions'::regclass
      and c.relname = 'role_permissions_rule_idx'
      and i.indisunique
      and i.indnullsnotdistinct
  )
  and (select c.confdeltype::text from pg_constraint c
       where c.conname = 'role_permissions_named_role_fkey') = 'c'
  and (select c.confdeltype::text from pg_constraint c
       where c.conname = 'memberships_named_role_fkey') = 'n'
  and (select c.confdeltype::text from pg_constraint c
       where c.conrelid = 'public.business_roles'::regclass
         and c.confrelid = 'public.businesses'::regclass and c.contype = 'f') = 'c',
  'one rule a role, a named role or none, and a key, nulls alike, in place of the primary key; a role goes with its business, its rows with it'
);

------------------------------------------------------------------------------
-- Adding a role

set local role service_role;
insert into ids values
  ('lead', public.create_business_role('a1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-b000-000000000001', 'worker', '  אחראי   משמרת '));
insert into ids values
  ('bar', public.create_business_role('a1000000-0000-4000-a000-000000000005',
    'a1000000-0000-4000-b000-000000000001', 'manager', 'Bar lead', 'Bar lead (en)'));
insert into ids values
  ('deputy', public.create_business_role('a1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-b000-000000000001', 'worker', 'Deputy', null, null, 'manager'));
insert into ids values
  ('evening', public.create_business_role('a1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-b000-000000000001', 'worker', 'Evening bar lead', null, pg_temp.id('bar')));
insert into ids values
  ('elsewhere', public.create_business_role('a1000000-0000-4000-a000-000000000006',
    'a1000000-0000-4000-b000-000000000002', 'worker', 'Elsewhere'));
reset role;

select results_eq(
  $$select br.name, br.name_en, br.base::text, br.sort, br.archived_at is null, br.created_by
    from public.business_roles br
    where br.business_id = 'a1000000-0000-4000-b000-000000000001'
    order by br.sort$$,
  $$values
    ('אחראי משמרת'::text, null::text, 'worker'::text, 1, true, 'a1000000-0000-4000-a000-000000000001'::uuid),
    ('Bar lead'::text, 'Bar lead (en)'::text, 'manager'::text, 2, true, 'a1000000-0000-4000-a000-000000000005'::uuid),
    ('Deputy'::text, null::text, 'worker'::text, 3, true, 'a1000000-0000-4000-a000-000000000001'::uuid),
    ('Evening bar lead'::text, null::text, 'worker'::text, 4, true, 'a1000000-0000-4000-a000-000000000001'::uuid)$$,
  'an owner and the team add roles, built on a worker or a manager, the name tidied, each after the last'
);
select is_empty(
  $$select 1 from public.role_permissions rp
    where rp.named_role in (pg_temp.id('lead'), pg_temp.id('bar'))$$,
  'one copied from its base starts with no row of its own: its base''s rules are its own'
);
select is_empty(
  $$select k.key
    from public.permission_keys k
    where k.settable
      and private.role_holds('a1000000-0000-4000-b000-000000000001', 'worker', k.key, pg_temp.id('deputy'))
        is distinct from private.role_holds('a1000000-0000-4000-b000-000000000001', 'manager', k.key)$$,
  'one built on a worker, copied from managers, holds every permission owners switch as managers do'
);
select is_empty(
  $$select k.key
    from public.permission_keys k
    where k.settable
      and private.role_holds('a1000000-0000-4000-b000-000000000001', 'worker', k.key, pg_temp.id('evening'))
        is distinct from private.role_holds('a1000000-0000-4000-b000-000000000001', 'manager', k.key, pg_temp.id('bar'))$$,
  'and one copied from another named role holds what that one holds'
);
select ok(
  not private.role_holds('a1000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', pg_temp.id('bar'))
  and not private.role_holds('a1000000-0000-4000-b000-000000000001', 'worker', 'clock.payroll', pg_temp.id('deputy'))
  and private.role_holds('a1000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.named_role is not null and rp.perm = 'clock.payroll'
  )
  and exists (
    select 1 from public.role_permissions rp
    where rp.named_role = pg_temp.id('deputy') and rp.perm = 'lists.send' and rp.allowed
  )
  and not exists (
    select 1 from public.role_permissions rp
    join public.permission_keys k on k.key = rp.perm
    where rp.named_role is not null and not k.settable
  ),
  'never pay, though managers see it: rows only where the source''s rule differs from the base''s, for keys owners switch'
);

set local role service_role;
select results_eq(
  $$select pg_temp.refusal(c.call)
    from (values
      (1, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000002', 'a1000000-0000-4000-b000-000000000001', 'worker', 'By a manager')$c$),
      (2, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000003', 'a1000000-0000-4000-b000-000000000001', 'worker', 'By a worker')$c$),
      (3, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000004', 'a1000000-0000-4000-b000-000000000001', 'worker', 'By the accountant')$c$),
      (4, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000006', 'a1000000-0000-4000-b000-000000000001', 'worker', 'From elsewhere')$c$),
      (5, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000005', 'a1000000-0000-4000-b000-0000000000ff', 'worker', 'Nowhere')$c$),
      (6, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', '   ')$c$),
      (7, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', repeat('א', 41))$c$),
      (8, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'Long English', repeat('e', 41))$c$),
      (9, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'owner', 'A second owner')$c$),
      (10, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'accountant', 'Books')$c$),
      (11, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'Both', null, pg_temp.id('lead'), 'manager')$c$),
      (12, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'Like the owner', null, null, 'owner')$c$),
      (13, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'Copy elsewhere', null, pg_temp.id('elsewhere'))$c$),
      (14, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'אחראי משמרת')$c$),
      (15, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000005', 'a1000000-0000-4000-b000-000000000001', 'manager', 'BAR LEAD')$c$)
    ) as c (n, call)
    order by c.n$$,
  $$values ('42501'::text), ('42501'::text), ('42501'::text), ('42501'::text), ('P0002'::text),
    ('22023 name'::text), ('22023 name'::text), ('22023 name_en'::text), ('22023 base'::text),
    ('22023 base'::text), ('22023'::text), ('22023'::text), ('P0002'::text),
    ('23505 taken'::text), ('23505 taken'::text)$$,
  'nobody but an owner of the business or the team adds one; nor a bad name, base or copy, nor a name a live role goes by, whatever its case'
);
reset role;

-- B fills its twenty.
set local role service_role;
select public.create_business_role('a1000000-0000-4000-a000-000000000006',
  'a1000000-0000-4000-b000-000000000002', 'worker', 'Role ' || n)
from generate_series(2, 20) as n;
select is(
  pg_temp.refusal($c$select public.create_business_role('a1000000-0000-4000-a000-000000000006', 'a1000000-0000-4000-b000-000000000002', 'worker', 'Role 21')$c$),
  '54000 limit',
  'twenty live roles a business, and no more'
);
select public.archive_business_role('a1000000-0000-4000-a000-000000000006', pg_temp.id('elsewhere'));
select public.create_business_role('a1000000-0000-4000-a000-000000000006',
  'a1000000-0000-4000-b000-000000000002', 'worker', 'Role 21');
select is(
  pg_temp.refusal($c$select public.restore_business_role('a1000000-0000-4000-a000-000000000006', pg_temp.id('elsewhere'))$c$),
  '54000 limit',
  'an archived one takes a place again only while there is one'
);
reset role;

select pg_temp.sign_in('a1000000-0000-4000-a000-000000000007');
select throws_ok(
  $$select public.create_business_role('a1000000-0000-4000-a000-000000000007',
    'a1000000-0000-4000-b000-000000000001', 'worker', 'From a view')$$,
  '42501', null, 'a view adds none from the browser, nor does anyone'
);
reset role;

------------------------------------------------------------------------------
-- Its rules

set local role service_role;
-- Building the schedule and publishing it, by its own rows.
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true, pg_temp.id('lead'));
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.publish', true, pg_temp.id('lead'));
reset role;
select results_eq(
  $$select rp.perm, rp.allowed, rp.role::text, rp.granted_by
    from public.role_permissions rp
    where rp.named_role = pg_temp.id('lead')
    order by 1$$,
  $$values
    ('schedule.edit'::text, true, 'worker'::text, 'a1000000-0000-4000-a000-000000000001'::uuid),
    ('schedule.publish'::text, true, 'worker'::text, 'a1000000-0000-4000-a000-000000000001'::uuid)$$,
  'an owner sets a named role''s permissions: rows for it, on its base'
);

set local role service_role;
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.publish', false, pg_temp.id('lead'));
-- Workers run the lists: so does the role, without a row, until it doesn't.
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'lists.manage', true, pg_temp.id('lead'));
reset role;
select is_empty(
  $$select 1 from public.role_permissions rp
    where rp.named_role = pg_temp.id('lead') and rp.perm in ('schedule.publish', 'lists.manage')$$,
  'back to its base''s rule removes its row: its default is its base''s, not the key''s'
);

set local role service_role;
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'lists.manage', false, pg_temp.id('lead'));
reset role;
select is(
  (select string_agg(coalesce(rp.named_role::text, 'base') || ':' || rp.allowed::text, ',' order by rp.named_role nulls first)
   from public.role_permissions rp
   where rp.business_id = 'a1000000-0000-4000-b000-000000000001'
     and rp.role = 'worker' and rp.perm = 'lists.manage'),
  'base:true,' || pg_temp.id('lead')::text || ':false',
  'a named role''s row and its base''s for the same key sit side by side'
);
select throws_ok(
  $$insert into public.role_permissions (business_id, role, perm, allowed)
    values ('a1000000-0000-4000-b000-000000000001', 'worker', 'lists.manage', false)$$,
  '23505', null, 'but one rule a role and a key, without a named role as with one'
);
select throws_ok(
  $$insert into public.role_permissions (business_id, role, named_role, perm, allowed)
    values ('a1000000-0000-4000-b000-000000000001', 'manager', pg_temp.id('lead'), 'clock.edit', true)$$,
  '23503', null, 'a named role''s row is for its base'
);
select throws_ok(
  $$insert into public.role_permissions (business_id, role, named_role, perm)
    values ('a1000000-0000-4000-b000-000000000001', 'worker', pg_temp.id('lead'), 'clock.payroll')$$,
  '22023', null, 'and never gives pay'
);
select lives_ok(
  $$insert into public.role_permissions as rp (business_id, role, named_role, perm, allowed)
    values ('a1000000-0000-4000-b000-000000000001', 'worker', pg_temp.id('lead'), 'lists.manage', false)
    on conflict (business_id, role, named_role, perm) do update set allowed = excluded.allowed$$,
  'an upsert names the index that replaced the primary key'
);

set local role service_role;
select public.set_role_permissions('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', '{schedule.publish}', '{true}', pg_temp.id('lead'));
select results_eq(
  $$select pg_temp.refusal(c.call)
    from (values
      (1, $c$select public.set_role_permissions('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', '{schedule.edit,chat.announce}', '{false,true}', pg_temp.id('lead'))$c$),
      (2, $c$select public.set_role_permission('a1000000-0000-4000-a000-000000000002', 'a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', false, pg_temp.id('lead'))$c$),
      (3, $c$select public.set_role_permission('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'manager', 'schedule.edit', false, pg_temp.id('lead'))$c$),
      (4, $c$select public.set_role_permission('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'clock.payroll', true, pg_temp.id('lead'))$c$),
      (5, $c$select public.set_role_permission('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true, pg_temp.id('elsewhere'))$c$),
      (6, $c$select public.set_role_permission('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'reservations.edit', false, pg_temp.id('lead'))$c$)
    ) as c (n, call)
    order by c.n$$,
  $$values ('22023 requires chat.moderate'::text), ('42501'::text), ('22023 base'::text),
    ('22023 pay'::text), ('P0002'::text), ('22023'::text)$$,
  'its rules change as a built-in role''s, in one go or not at all, by an owner or the team, on its base, never pay, in its business'
);
reset role;
select results_eq(
  $$select rp.perm, rp.allowed
    from public.role_permissions rp
    where rp.named_role = pg_temp.id('lead')
    order by 1$$,
  $$values ('lists.manage'::text, false), ('schedule.edit'::text, true), ('schedule.publish'::text, true)$$,
  'and a refused change of several keys leaves every one as it was'
);
select results_eq(
  $$select a.actor_id, a.details ->> 'perm', (a.details ->> 'to')::boolean,
      (a.details ->> 'named_role')::uuid, a.details ->> 'name', a.details ->> 'role'
    from public.audit_log a
    where a.business_id = 'a1000000-0000-4000-b000-000000000001'
      and a.action = 'role.permission'
      and a.details ? 'named_role'
    order by a.id$$,
  $$values
    ('a1000000-0000-4000-a000-000000000001'::uuid, 'schedule.edit'::text, true, pg_temp.id('lead'), 'אחראי משמרת'::text, 'worker'::text),
    ('a1000000-0000-4000-a000-000000000001'::uuid, 'schedule.publish'::text, true, pg_temp.id('lead'), 'אחראי משמרת'::text, 'worker'::text),
    ('a1000000-0000-4000-a000-000000000001'::uuid, 'schedule.publish'::text, false, pg_temp.id('lead'), 'אחראי משמרת'::text, 'worker'::text),
    ('a1000000-0000-4000-a000-000000000001'::uuid, 'lists.manage'::text, false, pg_temp.id('lead'), 'אחראי משמרת'::text, 'worker'::text),
    ('a1000000-0000-4000-a000-000000000001'::uuid, 'schedule.publish'::text, true, pg_temp.id('lead'), 'אחראי משמרת'::text, 'worker'::text)$$,
  'each change of its rule is logged with the role, by its name then; one that only met its base''s rule goes quietly'
);

------------------------------------------------------------------------------
-- Holding one

update public.memberships m
set named_role = pg_temp.id('lead')
where m.business_id = 'a1000000-0000-4000-b000-000000000001'
  and m.user_id = 'a1000000-0000-4000-a000-000000000008';
update public.memberships m
set named_role = pg_temp.id('bar')
where m.business_id = 'a1000000-0000-4000-b000-000000000001'
  and m.user_id = 'a1000000-0000-4000-a000-000000000009';

-- The code alone: a foreign key's refusal carries the key in its detail.
select results_eq(
  $$select left(pg_temp.refusal(c.call), 5)
    from (values
      (1, $c$update public.memberships set named_role = pg_temp.id('lead') where business_id = 'a1000000-0000-4000-b000-000000000001' and user_id = 'a1000000-0000-4000-a000-000000000002'$c$),
      (2, $c$update public.memberships set named_role = pg_temp.id('lead') where business_id = 'a1000000-0000-4000-b000-000000000001' and user_id = 'a1000000-0000-4000-a000-000000000004'$c$),
      (3, $c$update public.memberships set named_role = pg_temp.id('bar') where business_id = 'a1000000-0000-4000-b000-000000000001' and user_id = 'a1000000-0000-4000-a000-000000000001'$c$),
      (4, $c$update public.memberships set named_role = pg_temp.id('elsewhere') where business_id = 'a1000000-0000-4000-b000-000000000001' and user_id = 'a1000000-0000-4000-a000-000000000003'$c$)
    ) as c (n, call)
    order by c.n$$,
  $$values ('23503'::text), ('23503'::text), ('23503'::text), ('23503'::text)$$,
  'a named role is held only on its base, in its business: never by a manager for a worker''s, an accountant or an owner'
);
select ok(
  private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'schedule.edit')
  and private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'schedule.publish')
  and not private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000003', 'schedule.edit'),
  'someone in a named role holds what its rows give'
);
select ok(
  private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'clock.edit')
  and not private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'lists.manage')
  and not private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'lists.send')
  and private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000003', 'lists.manage')
  and private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'reservations.edit'),
  'else their base''s rule, its row or the key''s default, and its own denial over the base''s grant'
);
select ok(
  not private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000009', 'clock.payroll')
  and private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000002', 'clock.payroll')
  and private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000009', 'clock.edit')
  and not private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000009', 'chat.moderate'),
  'a manager in a named role sees no pay by role, though managers do, and holds the rest as managers'
);

update public.memberships m
set perms = '{clock.payroll}'
where m.business_id = 'a1000000-0000-4000-b000-000000000001'
  and m.user_id = 'a1000000-0000-4000-a000-000000000009';
select ok(
  private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000009', 'clock.payroll'),
  'pay given to them alone, as on "מי רואה שכר", holds as before'
);
update public.memberships m
set perms = '{}'
where m.business_id = 'a1000000-0000-4000-b000-000000000001'
  and m.user_id = 'a1000000-0000-4000-a000-000000000009';

set local role service_role;
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', false, pg_temp.id('lead'));
reset role;
select ok(
  not private.holds_perm('a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'schedule.publish')
  and private.role_gives('a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.publish', pg_temp.id('lead')),
  'what a key requires counts as before: publishing goes with building, its row kept'
);
set local role service_role;
select public.set_role_permission('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true, pg_temp.id('lead'));
reset role;

select pg_temp.sign_in('a1000000-0000-4000-a000-000000000008');
select is(
  public.my_permissions('a1000000-0000-4000-b000-000000000001'),
  '{clock.edit,reservations.edit,schedule.edit,schedule.publish}'::text[],
  'the screens are told what the named role gives them'
);
select pg_temp.sign_in('a1000000-0000-4000-a000-000000000003');
select is(
  public.my_permissions('a1000000-0000-4000-b000-000000000001'),
  '{clock.edit,lists.manage,reservations.edit}'::text[],
  'and a worker without one what workers hold'
);
select pg_temp.sign_in('a1000000-0000-4000-a000-000000000010');
select is(
  public.my_permissions('a1000000-0000-4000-b000-000000000001'),
  '{clock.edit,lists.manage,reservations.edit}'::text[],
  'a view as a worker still views the built-in role'
);
reset role;

------------------------------------------------------------------------------
-- The console's matrix

select is(
  (select count(*)::int from public.role_permission_matrix('a1000000-0000-4000-b000-000000000001')),
  6 * (select count(*)::int from public.permission_keys),
  'managers, workers and each of the four live named roles, with every key'
);
select is(
  (select string_agg(coalesce(x.role_name, '-'), ',' order by x.first)
   from (
     select m.role_name, min(m.n) as first
     from public.role_permission_matrix('a1000000-0000-4000-b000-000000000001')
       with ordinality as m (role, perm, area, requires, settable, by_owner, by_default, given, held,
         named_role, role_name, role_name_en, n)
     group by m.role_name
   ) x),
  '-,אחראי משמרת,Bar lead,Deputy,Evening bar lead',
  'managers and workers first, then the named roles in the order they were added'
);
select results_eq(
  $$select m.role::text, m.perm, m.role_name, m.role_name_en, m.by_default, m.given, m.held
    from public.role_permission_matrix('a1000000-0000-4000-b000-000000000001') m
    where m.named_role in (pg_temp.id('lead'), pg_temp.id('bar'))
      and m.perm in ('schedule.edit', 'schedule.publish', 'lists.manage', 'clock.edit', 'clock.payroll')
    order by m.role, m.perm$$,
  $$values
    ('manager'::text, 'clock.edit'::text, 'Bar lead'::text, 'Bar lead (en)'::text, true, true, true),
    ('manager'::text, 'clock.payroll'::text, 'Bar lead'::text, 'Bar lead (en)'::text, false, false, false),
    ('manager'::text, 'lists.manage'::text, 'Bar lead'::text, 'Bar lead (en)'::text, true, true, true),
    ('manager'::text, 'schedule.edit'::text, 'Bar lead'::text, 'Bar lead (en)'::text, true, true, true),
    ('manager'::text, 'schedule.publish'::text, 'Bar lead'::text, 'Bar lead (en)'::text, true, true, true),
    ('worker'::text, 'clock.edit'::text, 'אחראי משמרת'::text, null::text, true, true, true),
    ('worker'::text, 'clock.payroll'::text, 'אחראי משמרת'::text, null::text, false, false, false),
    ('worker'::text, 'lists.manage'::text, 'אחראי משמרת'::text, null::text, true, false, false),
    ('worker'::text, 'schedule.edit'::text, 'אחראי משמרת'::text, null::text, false, true, true),
    ('worker'::text, 'schedule.publish'::text, 'אחראי משמרת'::text, null::text, false, true, true)$$,
  'each with its base as its role, its names, its default (its base''s rule, never pay), its own rule and what it holds'
);
select is_empty(
  $$select m.role, m.perm
    from public.role_permission_matrix('a1000000-0000-4000-b000-000000000001') m
    join public.permission_keys k on k.key = m.perm
    where m.named_role is null
      and (
        m.role_name is not null
        or m.by_default is distinct from (m.role = any (k.default_roles))
        or m.given is distinct from coalesce(
          (select rp.allowed from public.role_permissions rp
           where rp.business_id = 'a1000000-0000-4000-b000-000000000001'
             and rp.role = m.role and rp.named_role is null and rp.perm = m.perm),
          not k.by_owner and m.role = any (k.default_roles))
        or m.held is distinct from private.role_holds('a1000000-0000-4000-b000-000000000001', m.role, m.perm)
      )$$,
  'managers'' and workers'' rows are as before, their own rows alone'
);

------------------------------------------------------------------------------
-- Nothing changes for anyone without one

select is_empty(
  $$select b.business_id, b.user_id, b.key
    from held_before b
    join public.memberships m on m.business_id = b.business_id and m.user_id = b.user_id
    where m.named_role is null
      and private.holds_perm(b.business_id, b.user_id, b.key) is distinct from b.held$$,
  'every membership in the database without a named role holds what it held before any was added'
);
select is_empty(
  $$select b.business_id, b.role, b.key
    from role_before b
    where private.role_holds(b.business_id, b.role, b.key) is distinct from b.held$$,
  'and every business''s managers and workers hold by role what they did'
);

------------------------------------------------------------------------------
-- Renaming

set local role service_role;
select public.rename_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('lead'), ' אחראית   משמרת');
-- The same name again changes nothing.
select public.rename_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('lead'), 'אחראית משמרת');
select public.rename_business_role('a1000000-0000-4000-a000-000000000005', pg_temp.id('bar'), 'Bar lead', '');
select public.rename_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('deputy'), 'Deputy', 'Deputy (en)');
reset role;
select results_eq(
  $$select br.name, br.name_en
    from public.business_roles br
    where br.id in (pg_temp.id('lead'), pg_temp.id('bar'), pg_temp.id('deputy'))
    order by br.sort$$,
  $$values ('אחראית משמרת'::text, null::text), ('Bar lead'::text, null::text), ('Deputy'::text, 'Deputy (en)'::text)$$,
  'a new name, tidied; an English name kept, removed or given'
);
set local role service_role;
select results_eq(
  $$select pg_temp.refusal(c.call)
    from (values
      (1, $c$select public.rename_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('lead'), 'DEPUTY')$c$),
      (2, $c$select public.rename_business_role('a1000000-0000-4000-a000-000000000002', pg_temp.id('lead'), 'By a manager')$c$),
      (3, $c$select public.rename_business_role('a1000000-0000-4000-a000-000000000006', pg_temp.id('lead'), 'From elsewhere')$c$),
      (4, $c$select public.rename_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('lead'), '')$c$),
      (5, $c$select public.rename_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-a000-0000000000ff', 'Nobody')$c$)
    ) as c (n, call)
    order by c.n$$,
  $$values ('23505 taken'::text), ('42501'::text), ('42501'::text), ('22023 name'::text), ('P0002'::text)$$,
  'never to a name another live role goes by, by anyone but an owner or the team, nor to none'
);
reset role;

------------------------------------------------------------------------------
-- Archiving and restoring

set local role service_role;
select is(
  pg_temp.refusal($c$select public.archive_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('lead'))$c$),
  '55000 held 1',
  'a role someone holds isn''t archived, and says how many hold it'
);
reset role;

-- Someone who left in Deputy; Evening bar lead held by nobody.
update public.memberships m
set named_role = pg_temp.id('deputy')
where m.business_id = 'a1000000-0000-4000-b000-000000000001'
  and m.user_id = 'a1000000-0000-4000-a000-000000000012';

set local role service_role;
select public.archive_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('deputy'));
select public.archive_business_role('a1000000-0000-4000-a000-000000000005', pg_temp.id('evening'));
-- Again, which changes nothing.
select public.archive_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('evening'));
reset role;
select ok(
  (select br.archived_at is not null from public.business_roles br where br.id = pg_temp.id('deputy'))
  and (select br.archived_at is not null from public.business_roles br where br.id = pg_temp.id('evening'))
  and (select m.named_role is null from public.memberships m
       where m.business_id = 'a1000000-0000-4000-b000-000000000001'
         and m.user_id = 'a1000000-0000-4000-a000-000000000012')
  and exists (select 1 from public.role_permissions rp where rp.named_role = pg_temp.id('evening'))
  and (select count(*) from public.role_permission_matrix('a1000000-0000-4000-b000-000000000001'))
    = 4 * (select count(*) from public.permission_keys),
  'one nobody active holds is archived: off the matrix, its rules kept, and whoever left with it keeps it no longer'
);

set local role service_role;
insert into ids values
  ('second evening', public.create_business_role('a1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-b000-000000000001', 'worker', 'evening BAR lead'));
select results_eq(
  $$select pg_temp.refusal(c.call)
    from (values
      (1, $c$select public.restore_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('evening'))$c$),
      (2, $c$select public.restore_business_role('a1000000-0000-4000-a000-000000000003', pg_temp.id('deputy'))$c$),
      (3, $c$select public.archive_business_role('a1000000-0000-4000-a000-000000000002', pg_temp.id('lead'))$c$),
      (4, $c$select public.archive_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-a000-0000000000ff')$c$),
      (5, $c$select public.rename_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('evening'), 'Late')$c$),
      (6, $c$select public.set_role_permission('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'schedule.edit', true, pg_temp.id('evening'))$c$),
      (7, $c$select public.create_business_role('a1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-b000-000000000001', 'worker', 'From archive', null, pg_temp.id('evening'))$c$),
      (8, $c$update public.role_permissions set perm = 'clock.payroll' where named_role = pg_temp.id('evening')$c$),
      (9, $c$update public.memberships set named_role = pg_temp.id('evening') where business_id = 'a1000000-0000-4000-b000-000000000001' and user_id = 'a1000000-0000-4000-a000-000000000003'$c$)
    ) as c (n, call)
    order by c.n$$,
  $$values ('23505 taken'::text), ('42501'::text), ('42501'::text), ('P0002'::text),
    ('P0002 archived'::text), ('P0002'::text), ('P0002'::text), ('22023 pay'::text),
    ('22023 archived'::text)$$,
  'an archived role''s name is free for a new one, which then keeps it from coming back; nobody but an owner or the team archives or restores; an archived role of the business is not renamed, given rules, copied or held, and its kept rows never become pay'
);
select public.restore_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('deputy'));
-- Restoring a live one changes nothing.
select public.restore_business_role('a1000000-0000-4000-a000-000000000001', pg_temp.id('deputy'));
reset role;
select ok(
  (select br.archived_at is null from public.business_roles br where br.id = pg_temp.id('deputy'))
  and exists (
    select 1 from public.role_permission_matrix('a1000000-0000-4000-b000-000000000001') m
    where m.named_role = pg_temp.id('deputy')
  ),
  'and one restored is back, with its rules'
);

------------------------------------------------------------------------------
-- The log, and who reads it

select results_eq(
  $$select a.action, a.actor_id, a.details ->> 'name', a.details ->> 'to', a.details ->> 'base',
      (a.details ->> 'named_role')::uuid
    from public.audit_log a
    where a.business_id = 'a1000000-0000-4000-b000-000000000001'
      and a.action ~ '^role\.(create|rename|archive|restore)$'
    order by a.id$$,
  $$values
    ('role.create'::text, 'a1000000-0000-4000-a000-000000000001'::uuid, 'אחראי משמרת'::text, null::text, 'worker'::text, pg_temp.id('lead')),
    ('role.create'::text, 'a1000000-0000-4000-a000-000000000005'::uuid, 'Bar lead'::text, null::text, 'manager'::text, pg_temp.id('bar')),
    ('role.create'::text, 'a1000000-0000-4000-a000-000000000001'::uuid, 'Deputy'::text, null::text, 'worker'::text, pg_temp.id('deputy')),
    ('role.create'::text, 'a1000000-0000-4000-a000-000000000001'::uuid, 'Evening bar lead'::text, null::text, 'worker'::text, pg_temp.id('evening')),
    ('role.rename'::text, 'a1000000-0000-4000-a000-000000000001'::uuid, null::text, 'אחראית משמרת'::text, 'worker'::text, pg_temp.id('lead')),
    ('role.rename'::text, 'a1000000-0000-4000-a000-000000000005'::uuid, null::text, 'Bar lead'::text, 'manager'::text, pg_temp.id('bar')),
    ('role.rename'::text, 'a1000000-0000-4000-a000-000000000001'::uuid, null::text, 'Deputy'::text, 'worker'::text, pg_temp.id('deputy')),
    ('role.archive'::text, 'a1000000-0000-4000-a000-000000000001'::uuid, 'Deputy'::text, null::text, 'worker'::text, pg_temp.id('deputy')),
    ('role.archive'::text, 'a1000000-0000-4000-a000-000000000005'::uuid, 'Evening bar lead'::text, null::text, 'worker'::text, pg_temp.id('evening')),
    ('role.create'::text, 'a1000000-0000-4000-a000-000000000001'::uuid, 'evening BAR lead'::text, null::text, 'worker'::text, pg_temp.id('second evening')),
    ('role.restore'::text, 'a1000000-0000-4000-a000-000000000001'::uuid, 'Deputy'::text, null::text, 'worker'::text, pg_temp.id('deputy'))$$,
  'adding, renaming, archiving and restoring are logged once each, with who did it; what changes nothing is not'
);
select ok(
  private.log_perm('role.create') = 'manage.view'
  and private.log_perm('role.rename') = 'manage.view'
  and private.log_perm('role.archive') = 'manage.view'
  and private.log_perm('role.restore') = 'manage.view',
  'they are read as a role''s permissions are, at manage.view'
);

select pg_temp.sign_in('a1000000-0000-4000-a000-000000000001');
insert into seen
select 'owner', count(*)::integer from public.audit_log a
where a.business_id = 'a1000000-0000-4000-b000-000000000001' and a.action like 'role.%';
select pg_temp.sign_in('a1000000-0000-4000-a000-000000000002');
insert into seen
select 'manager', count(*)::integer from public.audit_log a
where a.business_id = 'a1000000-0000-4000-b000-000000000001' and a.action like 'role.%';
select pg_temp.sign_in('a1000000-0000-4000-a000-000000000003');
insert into seen
select 'worker', count(*)::integer from public.audit_log a
where a.business_id = 'a1000000-0000-4000-b000-000000000001' and a.action like 'role.%';
reset role;
select results_eq(
  $$select s.who, s.n > 0 from seen s order by s.who$$,
  $$values ('manager'::text, true), ('owner'::text, true), ('worker'::text, false)$$,
  'the owners and those at manage.view read them; workers don''t'
);
delete from seen;

------------------------------------------------------------------------------
-- Who reads the roles

select pg_temp.sign_in('a1000000-0000-4000-a000-000000000003');
insert into seen
select 'worker', count(*)::integer from public.business_roles br
where br.business_id = 'a1000000-0000-4000-b000-000000000001';
insert into seen
select 'worker sees a colleague''s', count(*)::integer from public.memberships m
where m.business_id = 'a1000000-0000-4000-b000-000000000001'
  and m.named_role = pg_temp.id('lead');
select pg_temp.sign_in('a1000000-0000-4000-a000-000000000004');
insert into seen
select 'accountant', count(*)::integer from public.business_roles br
where br.business_id = 'a1000000-0000-4000-b000-000000000001';
select pg_temp.sign_in('a1000000-0000-4000-a000-000000000010');
insert into seen
select 'view', count(*)::integer from public.business_roles br
where br.business_id = 'a1000000-0000-4000-b000-000000000001';
select pg_temp.sign_in('a1000000-0000-4000-a000-000000000006');
insert into seen
select 'elsewhere', count(*)::integer from public.business_roles br
where br.business_id = 'a1000000-0000-4000-b000-000000000001';
reset role;
select results_eq(
  $$select s.who, s.n from seen s order by s.who$$,
  $$values ('accountant'::text, 5), ('elsewhere'::text, 0), ('view'::text, 5),
    ('worker'::text, 5), ('worker sees a colleague''s'::text, 1)$$,
  'members and views read every role of their business, archived too, and who holds one; nobody else reads any'
);

------------------------------------------------------------------------------
-- A change of role

set local role service_role;
select public.set_member_role('a1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-b000-000000000001', 'a1000000-0000-4000-a000-000000000008', 'manager');
reset role;
-- The same role again keeps it; a role set with its named role keeps that one.
update public.memberships m
set role = 'manager'
where m.business_id = 'a1000000-0000-4000-b000-000000000001'
  and m.user_id = 'a1000000-0000-4000-a000-000000000009';
update public.memberships m
set role = 'worker', named_role = pg_temp.id('deputy')
where m.business_id = 'a1000000-0000-4000-b000-000000000001'
  and m.user_id = 'a1000000-0000-4000-a000-000000000002';
select results_eq(
  $$select m.user_id, m.role::text, m.named_role
    from public.memberships m
    where m.business_id = 'a1000000-0000-4000-b000-000000000001'
      and m.user_id in ('a1000000-0000-4000-a000-000000000002', 'a1000000-0000-4000-a000-000000000008',
        'a1000000-0000-4000-a000-000000000009')
    order by m.user_id$$,
  $$values
    ('a1000000-0000-4000-a000-000000000002'::uuid, 'worker'::text, pg_temp.id('deputy')),
    ('a1000000-0000-4000-a000-000000000008'::uuid, 'manager'::text, null::uuid),
    ('a1000000-0000-4000-a000-000000000009'::uuid, 'manager'::text, pg_temp.id('bar'))$$,
  'a change of role to another base leaves the named role behind, whoever makes it; the same role keeps it'
);

------------------------------------------------------------------------------
-- A demo business

insert into private.demo_businesses (business_id, definition)
values ('a1000000-0000-4000-b000-000000000003', $json$
  {
    "slug": "rn-demo", "name": "Roles named demo", "accent": "#7c3aed",
    "address": "Demo street 7", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "people": [
      { "user_id": "a1000000-0000-4000-a000-000000000011", "role": "owner", "name": "Owner 11" }
    ]
  }
  $json$);

set local role service_role;
select public.reset_demo_business('a1000000-0000-4000-b000-000000000003');
select lives_ok(
  $$select public.create_business_role('a1000000-0000-4000-a000-000000000011',
    'a1000000-0000-4000-b000-000000000003', 'worker', 'Demo lead', null, null, 'manager')$$,
  'a demo business''s visitor, as its owner, adds a role, as they change its permissions'
);
select public.reset_demo_business('a1000000-0000-4000-b000-000000000003');
reset role;
select is_empty(
  $$select 1 from public.business_roles br
    where br.business_id = 'a1000000-0000-4000-b000-000000000003'
    union all
    select 1 from public.role_permissions rp
    where rp.business_id = 'a1000000-0000-4000-b000-000000000003' and rp.named_role is not null$$,
  'until its reset, which takes its roles and their rules away'
);

select * from finish();
rollback;
