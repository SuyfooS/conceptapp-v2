-- Roles and permissions by module, R1 (20261115000700_roles_catalogue.sql):
-- every permission's area, what it requires and whether owners switch it;
-- the team's and the management page's keys, held by owners and managers and
-- a view as a manager, not by workers or accountants; a role's row deciding,
-- granted or denied, over its key's default roles, and what a key requires,
-- for members and views alike; keys given personally as before; a key an
-- owner gives never denied by a row, nor reaching a view by one; and the old
-- private.holds_perm, frozen
-- here, answering as the new one for every membership of a fixture of roles
-- × personal keys × role rows, over every key declared before and some no
-- manifest declares. Fixed ids (92…), so nothing here depends on the seed.
begin;
select plan(29);

-- 1–17 the people below; 101–220 the fixture's, one membership each.
insert into auth.users (id, aud, role, phone)
select
  ('92000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250092' || lpad(n::text, 4, '0')
from generate_series(1, 220) as n
where n <= 17 or n > 100;

-- K: 1 owner, 2 manager, 3 worker, 4 accountant; 5 and 6 on the ConceptApp
-- team, viewing K as a manager and as a worker.
-- D, whose rows deny managers chat.moderate, schedule.edit and team.view,
-- give managers pay (clock.payroll, as the demo shop's do) and give workers
-- schedule.publish, and lists.send with lists.manage, which sending requires
-- since the lists' phase (R5): 11 owner, 12 a manager, 13 a
-- manager given schedule.edit, chat.moderate and team.view personally, 14 a
-- worker given schedule.publish, 15 a worker; 16 and 17 viewing D as a
-- manager and as a worker.
-- E1–E4: the fixture.
insert into public.businesses (id, slug, name)
values
  ('92000000-0000-4000-b000-000000000001', 'rc-keys', 'Roles Keys'),
  ('92000000-0000-4000-b000-000000000002', 'rc-deny', 'Roles Deny'),
  ('92000000-0000-4000-b000-000000000011', 'rc-e-one', 'Roles E1'),
  ('92000000-0000-4000-b000-000000000012', 'rc-e-two', 'Roles E2'),
  ('92000000-0000-4000-b000-000000000013', 'rc-e-three', 'Roles E3'),
  ('92000000-0000-4000-b000-000000000014', 'rc-e-four', 'Roles E4');

insert into public.memberships (business_id, user_id, role, perms)
values
  ('92000000-0000-4000-b000-000000000001', '92000000-0000-4000-a000-000000000001', 'owner', '{}'),
  ('92000000-0000-4000-b000-000000000001', '92000000-0000-4000-a000-000000000002', 'manager', '{}'),
  ('92000000-0000-4000-b000-000000000001', '92000000-0000-4000-a000-000000000003', 'worker', '{}'),
  ('92000000-0000-4000-b000-000000000001', '92000000-0000-4000-a000-000000000004', 'accountant', '{}'),
  ('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000011', 'owner', '{}'),
  ('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000012', 'manager', '{}'),
  ('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000013', 'manager',
    '{schedule.edit,chat.moderate,team.view}'),
  ('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000014', 'worker',
    '{schedule.publish}'),
  ('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000015', 'worker', '{}');

insert into public.role_permissions (business_id, role, perm, allowed)
values
  ('92000000-0000-4000-b000-000000000002', 'manager', 'chat.moderate', false),
  ('92000000-0000-4000-b000-000000000002', 'manager', 'schedule.edit', false),
  ('92000000-0000-4000-b000-000000000002', 'manager', 'team.view', false),
  ('92000000-0000-4000-b000-000000000002', 'manager', 'clock.payroll', true),
  ('92000000-0000-4000-b000-000000000002', 'worker', 'schedule.publish', true),
  ('92000000-0000-4000-b000-000000000002', 'worker', 'lists.manage', true),
  ('92000000-0000-4000-b000-000000000002', 'worker', 'lists.send', true);

insert into public.platform_staff (user_id, role)
values
  ('92000000-0000-4000-a000-000000000005', 'onboarder'),
  ('92000000-0000-4000-a000-000000000006', 'onboarder'),
  ('92000000-0000-4000-a000-000000000016', 'onboarder'),
  ('92000000-0000-4000-a000-000000000017', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('92000000-0000-4000-a000-000000000005', '92000000-0000-4000-b000-000000000001', 'manager'),
  ('92000000-0000-4000-a000-000000000006', '92000000-0000-4000-b000-000000000001', 'worker'),
  ('92000000-0000-4000-a000-000000000016', '92000000-0000-4000-b000-000000000002', 'manager'),
  ('92000000-0000-4000-a000-000000000017', '92000000-0000-4000-b000-000000000002', 'worker');

-- The fixture: in each of E1–E4, every role (managers and workers who left
-- too) with each set of personal keys, one person each (101–220). E1 has no
-- role rows; E2 gives managers pay; E3 gives workers pay, lists.send (with
-- lists.manage, which it requires since R5) and chat.moderate, and managers
-- what they hold anyway; E4 gives workers both schedule keys, and managers
-- lists.manage.
insert into public.memberships (business_id, user_id, role, perms, active)
select
  b.id,
  ('92000000-0000-4000-a000-'
    || lpad((100 + row_number() over (order by b.n, kind.n, given.n))::text, 12, '0'))::uuid,
  kind.role, given.perms, kind.active
from (values
  (1, '92000000-0000-4000-b000-000000000011'::uuid),
  (2, '92000000-0000-4000-b000-000000000012'::uuid),
  (3, '92000000-0000-4000-b000-000000000013'::uuid),
  (4, '92000000-0000-4000-b000-000000000014'::uuid)
) as b (n, id)
cross join (values
  (1, 'owner'::public.member_role, true),
  (2, 'manager'::public.member_role, true),
  (3, 'worker'::public.member_role, true),
  (4, 'accountant'::public.member_role, true),
  (5, 'manager'::public.member_role, false),
  (6, 'worker'::public.member_role, false)
) as kind (n, role, active)
cross join (values
  (1, '{}'::text[]),
  (2, '{schedule.publish}'::text[]),
  (3, '{lists.manage,chat.announce}'::text[]),
  (4, '{clock.payroll}'::text[]),
  (5, '{billing.manage,schedule.edit}'::text[])
) as given (n, perms);

insert into public.role_permissions (business_id, role, perm)
values
  ('92000000-0000-4000-b000-000000000012', 'manager', 'clock.payroll'),
  ('92000000-0000-4000-b000-000000000013', 'worker', 'clock.payroll'),
  ('92000000-0000-4000-b000-000000000013', 'worker', 'lists.manage'),
  ('92000000-0000-4000-b000-000000000013', 'worker', 'lists.send'),
  ('92000000-0000-4000-b000-000000000013', 'worker', 'chat.moderate'),
  ('92000000-0000-4000-b000-000000000013', 'manager', 'reservations.edit'),
  ('92000000-0000-4000-b000-000000000014', 'worker', 'schedule.edit'),
  ('92000000-0000-4000-b000-000000000014', 'worker', 'schedule.publish'),
  ('92000000-0000-4000-b000-000000000014', 'manager', 'lists.manage');

-- private.holds_perm as 20261110000300_payroll_access.sql wrote it, the
-- version before this one.
create function pg_temp.old_holds_perm(business uuid, person uuid, perm_key text)
returns boolean
language sql
stable
as $$
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
            or exists (
              select 1
              from public.role_permissions rp
              where rp.business_id = m.business_id
                and rp.role = m.role
                and rp.perm = perm_key
            )
            or exists (
              select 1
              from public.permission_keys k
              where k.key = perm_key
                and not k.by_owner
                and m.role = any (k.default_roles)
            )
          )
        )
      )
  )
$$;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

------------------------------------------------------------------------------
-- The catalogue (chat's own keys, opened by R8, are roles_chat.test.sql's:
-- each area's phase checks its own)

select set_eq(
  $$select k.key, k.module_key::text, k.area, k.requires, k.settable,
      k.default_roles::text[], k.by_owner
    from public.permission_keys k
    where k.area <> 'chat'$$,
  $$values
    ('clock.edit', 'time_clock', 'time_clock', null, true, '{manager}'::text[], false),
    ('clock.payroll', 'time_clock', 'time_clock', null, false, '{}'::text[], true),
    ('lists.manage', 'lists', 'lists', null, true, '{manager}'::text[], false),
    ('lists.send', 'lists', 'lists', 'lists.manage', true, '{manager}'::text[], false),
    ('reservations.edit', 'reservations', 'reservations', null, false, '{manager,worker}'::text[], false),
    ('schedule.edit', 'scheduling', 'scheduling', null, true, '{manager}'::text[], false),
    ('schedule.publish', 'scheduling', 'scheduling', 'schedule.edit', true, '{manager}'::text[], false),
    ('storefront.edit', 'storefront', 'storefront', null, false, '{manager}'::text[], false),
    ('team.view', null, 'team', null, true, '{manager}'::text[], false),
    ('team.edit', null, 'team', 'team.view', true, '{manager}'::text[], false),
    ('manage.view', null, 'manage', null, true, '{manager}'::text[], false),
    ('manage.edit', null, 'manage', 'manage.view', true, '{manager}'::text[], false)$$,
  'every permission has its module''s area, or the team''s or the management page''s, what it requires, and a switch per role only in scheduling (R3), the time clock (R4), lists (R5, sending requiring running them), on the team (R6) and on the management page (R7)'
);

select throws_ok(
  $$insert into public.permission_keys (key, module_key, area)
    values ('rc.one', 'chat', 'billing')$$,
  '23514', null, 'an area outside the list is refused'
);
select throws_ok(
  $$insert into public.permission_keys (key, module_key, area)
    values ('rc.two', 'chat', 'lists')$$,
  '23514', null, 'and so is a module''s key in another module''s area'
);
select throws_ok(
  $$insert into public.permission_keys (key, module_key, area)
    values ('rc.three', null, 'chat')$$,
  '23514', null, 'and a key of no module outside the team''s and the management page''s'
);
select throws_ok(
  $$insert into public.permission_keys (key, area, requires)
    values ('team.rc', 'team', 'team.rc')$$,
  '23514', null, 'a key never requires itself'
);
select throws_ok(
  $$update public.permission_keys set requires = 'team.edit' where key = 'team.view'$$,
  '23514', null, 'nor through another key: its chain of what it requires ends'
);
select throws_ok(
  $$insert into public.permission_keys (key, module_key, area, by_owner, settable)
    values ('clock.rc', 'time_clock', 'time_clock', true, true)$$,
  '23514', null, 'and one an owner gives is never switched per role'
);

------------------------------------------------------------------------------
-- The team's and the management page's keys

select ok(
  (select bool_and(
     private.holds_perm('92000000-0000-4000-b000-000000000001', '92000000-0000-4000-a000-000000000001', k.key)
     and private.holds_perm('92000000-0000-4000-b000-000000000001', '92000000-0000-4000-a000-000000000002', k.key))
   from unnest('{team.view,team.edit,manage.view,manage.edit}'::text[]) as k (key)),
  'owners and managers hold the team''s and the management page''s keys'
);
select ok(
  (select not bool_or(
     private.holds_perm('92000000-0000-4000-b000-000000000001', '92000000-0000-4000-a000-000000000003', k.key)
     or private.holds_perm('92000000-0000-4000-b000-000000000001', '92000000-0000-4000-a000-000000000004', k.key))
   from unnest('{team.view,team.edit,manage.view,manage.edit}'::text[]) as k (key)),
  'workers and accountants hold none of them'
);

select pg_temp.sign_in('92000000-0000-4000-a000-000000000005');
select ok(
  public.my_permissions('92000000-0000-4000-b000-000000000001')
    @> '{team.view,team.edit,manage.view,manage.edit}'::text[],
  'and a view as a manager holds them'
);
select pg_temp.sign_in('92000000-0000-4000-a000-000000000006');
select ok(
  not (public.my_permissions('92000000-0000-4000-b000-000000000001')
    && '{team.view,team.edit,manage.view,manage.edit}'::text[]),
  'while a view as a worker holds none'
);
reset role;

------------------------------------------------------------------------------
-- A role's row decides, and what a key requires

-- (Since R8 announcing requires moderating, so the key left alone is the
-- clock's.)
select ok(
  not private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000012', 'chat.moderate')
  and private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000012', 'clock.edit'),
  'a row denying managers a key decides over its default roles, and only for that key'
);
select ok(
  not private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000012', 'schedule.edit')
  and not private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000012', 'schedule.publish'),
  'a manager denied building the schedule no longer publishes it by role: publishing requires building'
);
select ok(
  not private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000012', 'team.view')
  and not private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000012', 'team.edit')
  and private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000012', 'manage.edit'),
  'nor edits the team without seeing it, while the management page stays theirs'
);
select ok(
  private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000013', 'schedule.edit')
  and private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000013', 'chat.moderate')
  and private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000013', 'schedule.publish')
  and private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000013', 'team.edit'),
  'a key given to a manager personally holds over the role''s denial, and the role''s keys that require it hold again'
);
select ok(
  private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000015', 'lists.send')
  and not private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000015', 'schedule.publish')
  and pg_temp.old_holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000015', 'schedule.publish'),
  'a row giving workers a key holds, but not one whose requirement they lack, which the old rule held'
);
select ok(
  private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000014', 'schedule.publish')
  and not private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000014', 'schedule.edit'),
  'a key given personally holds as before, whatever it requires'
);
select ok(
  (select bool_and(private.holds_perm('92000000-0000-4000-b000-000000000002', '92000000-0000-4000-a000-000000000011', k.key))
   from unnest('{chat.moderate,schedule.edit,schedule.publish,team.view,team.edit,billing.manage}'::text[]) as k (key)),
  'the owner holds every key, those denied to managers included'
);

select pg_temp.sign_in('92000000-0000-4000-a000-000000000012');
select is(
  public.my_permissions('92000000-0000-4000-b000-000000000002'),
  '{clock.edit,clock.payroll,lists.manage,lists.send,manage.edit,manage.view,reservations.edit,storefront.edit}'::text[],
  'the screens are told what the manager holds, pay by the role''s row, the denials and what they require counted'
);
-- Still them (request.jwt.claims), as the policies ask.
reset role;
select ok(
  not private.has_perm('92000000-0000-4000-b000-000000000002', 'chat.moderate')
  and not private.has_perm('92000000-0000-4000-b000-000000000002', 'chat.announce')
  and private.has_perm('92000000-0000-4000-b000-000000000002', 'clock.edit'),
  'and private.has_perm answers the same for them'
);
select pg_temp.sign_in('92000000-0000-4000-a000-000000000016');
select is(
  public.my_permissions('92000000-0000-4000-b000-000000000002'),
  '{clock.edit,lists.manage,lists.send,manage.edit,manage.view,reservations.edit,storefront.edit}'::text[],
  'a view as a manager holds the same but pay: the business''s rows for the role count for it too, while a key an owner gives the role by a row never reaches a view'
);
select pg_temp.sign_in('92000000-0000-4000-a000-000000000017');
select is(
  public.my_permissions('92000000-0000-4000-b000-000000000002'),
  '{lists.manage,lists.send,reservations.edit}'::text[],
  'and a view as a worker what the rows give workers, but not a key whose requirement they lack'
);
reset role;

------------------------------------------------------------------------------
-- Rows of a key an owner gives

insert into public.role_permissions (business_id, role, perm)
values ('92000000-0000-4000-b000-000000000001', 'worker', 'clock.payroll');
select is(
  (select rp.allowed from public.role_permissions rp
   where rp.business_id = '92000000-0000-4000-b000-000000000001'
     and rp.role = 'worker' and rp.perm = 'clock.payroll'),
  true,
  'a row grants unless it says otherwise'
);
select throws_ok(
  $$insert into public.role_permissions (business_id, role, perm, allowed)
    values ('92000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', false)$$,
  '22023', null, 'a key an owner gives is never denied by a row: it is taken by removing its row'
);
select throws_ok(
  $$update public.role_permissions set allowed = false
    where business_id = '92000000-0000-4000-b000-000000000001'
      and role = 'worker' and perm = 'clock.payroll'$$,
  '22023', null, 'nor is its row turned into a denial'
);

------------------------------------------------------------------------------
-- The same answers as before

select is(
  (select count(*)::int from public.memberships m
   where m.business_id in ('92000000-0000-4000-b000-000000000011', '92000000-0000-4000-b000-000000000012',
     '92000000-0000-4000-b000-000000000013', '92000000-0000-4000-b000-000000000014')),
  120,
  'the fixture has every role, managers and workers who left too, with each set of personal keys, in four businesses'
);
select is_empty(
  $$
    select m.business_id, m.user_id, k.key
    from public.memberships m
    cross join unnest('{chat.announce,chat.moderate,chat.send_documents,clock.edit,clock.payroll,lists.manage,lists.send,reservations.edit,schedule.edit,schedule.publish,storefront.edit,billing.manage,people.files,schedule}'::text[]) as k (key)
    where m.business_id in ('92000000-0000-4000-b000-000000000011', '92000000-0000-4000-b000-000000000012',
        '92000000-0000-4000-b000-000000000013', '92000000-0000-4000-b000-000000000014')
      and pg_temp.old_holds_perm(m.business_id, m.user_id, k.key)
        is distinct from private.holds_perm(m.business_id, m.user_id, k.key)
  $$,
  'the new private.holds_perm answers as the old one for every role, personal key and role row, declared key or not'
);

------------------------------------------------------------------------------
-- Who may call what

select ok(
  not has_function_privilege('authenticated', 'private.role_gives(uuid, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.role_gives(uuid, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.role_holds(uuid, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.role_holds(uuid, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.refuse_by_owner_denial()', 'execute')
  and not has_function_privilege('authenticated', 'private.refuse_requires_cycle()', 'execute')
  and not has_function_privilege('authenticated', 'private.holds_perm(uuid, uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.my_permissions(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.my_permissions(uuid)', 'execute'),
  'the screens ask public.my_permissions; who holds what is asked inside the database only'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'private'
     and p.proname in (
       'role_gives', 'role_holds', 'holds_perm', 'refuse_by_owner_denial',
       'refuse_requires_cycle'
     )
     and p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  5,
  'each runs as its owner with an empty search path'
);

select * from finish();
rollback;
