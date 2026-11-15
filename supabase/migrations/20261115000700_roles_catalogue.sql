-- Roles and permissions by module, R1: the catalogue and who holds what (the
-- roles plan; Orel's choice of 15 November 2026 and his answers of the same
-- day, issue #1). Nothing changes for anyone yet: every answer is today's,
-- and the app reads it from the database (public.my_permissions).
--
--   areas       every permission says where it belongs
--               (public.permission_keys.area): the module that declares it
--               (scheduling, time_clock, lists, chat, reservations,
--               storefront), or, for those no module declares, the team
--               screen (team) and the management page (manage). The screens
--               will draw edit, view or none per area from them.
--   requires    a permission may need another (public.permission_keys.requires):
--               publishing the schedule needs building it (schedule.publish
--               needs schedule.edit), editing the team needs seeing it, and
--               so does editing the management page. A role holds a key by
--               its role only while the person also holds what the key
--               requires; one given to a person holds as before, whatever it
--               requires.
--   new keys    team.view, team.edit, manage.view and manage.edit
--               (CORE_PERMISSIONS in @domain/permissions), held by managers
--               by default, as /team and /manage open today; owners hold
--               every key. Nothing reads them yet: the team's and the
--               management page's own phases move their checks onto them.
--   settable    whether owners switch the key per role, from R2's setter on
--               (public.permission_keys.settable). Off for every key here:
--               each area's phase turns its keys on once every check in the
--               area reads them. clock.payroll, the one an owner gives, keeps
--               its own switch (public.set_role_permission).
--   role rows   a row of public.role_permissions now says whether the role
--               holds the key (allowed, true by default): a row, when there
--               is one, decides, granted or denied, and the key's default
--               roles count only without one. Nothing writes a denial yet
--               (R2's setter will). A key an owner gives is still switched by
--               adding and removing its row, never denied
--               (private.refuse_by_owner_denial), so the pay screens, which
--               read the rows as they are, stay right.
--   resolver    private.holds_perm with the role rows' answer and what a key
--               requires, and public.my_permissions giving a view what its
--               role holds by the same rule, never a key an owner gives but
--               as an accountant. RLS, every other function,
--               private.check_permission_giver and the setters are as they
--               were.

------------------------------------------------------------------------------
-- 1. The catalogue

-- The team's and the management page's keys belong to no module.
alter table public.permission_keys
  alter column module_key drop not null;

alter table public.permission_keys
  add column area text,
  add column requires text references public.permission_keys (key),
  add column settable boolean not null default false;

create index permission_keys_requires_idx on public.permission_keys (requires);

-- Every key so far is a module's, in that module's area; publishing the
-- schedule needs building it.
update public.permission_keys k
set area = k.module_key::text;

update public.permission_keys k
set requires = 'schedule.edit'
where k.key = 'schedule.publish';

alter table public.permission_keys
  alter column area set not null,
  add constraint permission_keys_area_check check (
    area in (
      'scheduling', 'time_clock', 'lists', 'chat', 'team', 'manage',
      'reservations', 'storefront'
    )
  ),
  -- A module's key is in that module's area; one with no module is the
  -- team's or the management page's.
  add constraint permission_keys_module_area_check check (
    case
      when module_key is null then area in ('team', 'manage')
      else area = module_key::text
    end
  ),
  add constraint permission_keys_requires_check check (requires <> key),
  -- A key an owner gives keeps its own switch.
  add constraint permission_keys_settable_check check (not (settable and by_owner));

insert into public.permission_keys (key, module_key, area, default_roles, by_owner, requires)
values
  ('team.view', null, 'team', '{manager}'::public.member_role[], false, null),
  ('team.edit', null, 'team', '{manager}'::public.member_role[], false, 'team.view'),
  ('manage.view', null, 'manage', '{manager}'::public.member_role[], false, null),
  ('manage.edit', null, 'manage', '{manager}'::public.member_role[], false, 'manage.view');

comment on table public.permission_keys is
  'Every permission: those a module manifest declares and those of the team screen and the management page (CORE_PERMISSIONS in @domain/permissions), each with its area, what it requires, the staff roles that hold it by default and whether owners switch it per role; by_owner ones an owner gives instead (public.role_permissions, memberships.perms). modules/permissions.db.test.ts keeps it equal to the app''s.';
comment on column public.permission_keys.module_key is
  'The module that declares the key; null for the team''s and the management page''s.';
comment on column public.permission_keys.area is
  'Where the key belongs: its module''s area (scheduling, time_clock, lists, chat, reservations, storefront), or team or manage. The screens draw edit, view or none per area.';
comment on column public.permission_keys.requires is
  'A key this one needs: a role holds this one by its role only while the person also holds that one (private.holds_perm). A key given to a person holds whatever it requires.';
comment on column public.permission_keys.settable is
  'Whether owners switch the key per role (from R2''s setter on). Off until every check in the key''s area reads it; never for a by_owner key, which keeps its own switch.';

-- A key's chain of what it requires ends: private.holds_perm follows it by
-- calling itself, so a chain that came back to its key would never stop (a
-- key requiring itself is the check above).
create function private.refuse_requires_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requires is not null and exists (
    with recursive chain (step) as (
      select new.requires
      union
      select k.requires
      from public.permission_keys k
      join chain c on c.step = k.key
      where k.requires is not null
    )
    select 1 from chain c where c.step = new.key
  ) then
    raise exception 'A permission''s chain of what it requires comes back to it'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger permission_keys_requires_chain
  before insert or update of requires on public.permission_keys
  for each row execute function private.refuse_requires_cycle();

-- A row now grants or denies.
alter table public.role_permissions
  add column allowed boolean not null default true;

comment on table public.role_permissions is
  'What a business decides for a role and a permission: granted or denied (allowed); without a row the key''s default roles decide. Written only by public.set_role_permission (and the demo''s seed), which gives a by-owner key (clock.payroll: pay access) by adding its row and takes it by removing it; owners and accountants hold theirs without a row.';
comment on column public.role_permissions.allowed is
  'Whether the role holds the permission in the business. A row decides over the key''s default roles. Never false for a by-owner key (private.refuse_by_owner_denial).';

-- A key an owner gives (clock.payroll) is switched by adding and removing its
-- row (public.set_role_permission), never by a row that denies it: the pay
-- screens read the rows as they are (getPayRoles in @db/payroll).
create function private.refuse_by_owner_denial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.allowed and exists (
    select 1
    from public.permission_keys k
    where k.key = new.perm
      and k.by_owner
  ) then
    raise exception 'A permission an owner gives is taken by removing its row'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger role_permissions_by_owner_rows
  before insert or update of allowed, perm on public.role_permissions
  for each row execute function private.refuse_by_owner_denial();

------------------------------------------------------------------------------
-- 2. Who holds what

-- Whether the business's rule for role `r` gives it `perm_key`, by the role
-- alone: the business's row for the role and the key when there is one,
-- granted or denied, else the key's default roles, when it isn't one an owner
-- gives. What the key requires is the caller's to check.
create function private.role_gives(business uuid, r public.member_role, perm_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

-- Whether role `r` holds `perm_key` in the business by its role alone: its
-- rule gives it the key and every key down the chain of what the key
-- requires. What a view holds (public.my_permissions), which has nothing of
-- its own.
create function private.role_holds(business uuid, r public.member_role, perm_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive needed (need) as (
    select perm_key
    union
    select k.requires
    from needed n
    join public.permission_keys k on k.key = n.need
    where k.requires is not null
  )
  select bool_and(private.role_gives(business, r, n.need))
  from needed n
$$;

-- 20261110000300_payroll_access.sql's, with the role rows' answer and what a
-- key requires: on the staff, a key given to the person holds as before; one
-- their role gives (private.role_gives: its row when there is one, else its
-- default roles) holds only while they also hold what it requires. An owner
-- holds every key and an accountant what accountants hold, as before, and a
-- key no manifest declares is still held by owners and those given it.
create or replace function private.holds_perm(business uuid, person uuid, perm_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
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
            or (
              private.role_gives(m.business_id, m.role, perm_key)
              and not exists (
                select 1
                from public.permission_keys k
                where k.key = perm_key
                  and k.requires is not null
                  and not private.holds_perm(business, person, k.requires)
              )
            )
          )
        )
      )
  )
$$;

-- 20261110000300_payroll_access.sql's, with a view holding what its role
-- holds by the same rule as a member (private.role_holds: the business's rows
-- for the role, else the key's default roles, and what each key requires),
-- and still never a key an owner gives but as an accountant.
create or replace function public.my_permissions(business uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(k.key order by k.key), '{}'::text[])
  from public.permission_keys k
  where private.holds_perm(business, (select auth.uid()), k.key)
    or exists (
      select 1
      from public.view_sessions v
      where v.staff_id = (select auth.uid())
        and v.business_id = business
        and v.ended_at is null
        and v.expires_at > now()
        and (
          (v.role = 'accountant' and k.key = any (private.accountant_perms()))
          or (
            not k.by_owner
            and (v.role = 'owner' or private.role_holds(business, v.role, k.key))
          )
        )
    )
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The new helpers run inside the functions above, as their owner: nobody else
-- may ask who holds what.
revoke execute on function private.role_gives(uuid, public.member_role, text)
  from public, anon, authenticated;
revoke execute on function private.role_holds(uuid, public.member_role, text)
  from public, anon, authenticated;
revoke execute on function private.refuse_by_owner_denial()
  from public, anon, authenticated;
revoke execute on function private.refuse_requires_cycle()
  from public, anon, authenticated;

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the screens' one granted) again all the same.
revoke execute on function private.holds_perm(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;
