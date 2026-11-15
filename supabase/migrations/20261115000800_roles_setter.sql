-- Roles and permissions by module, R2: the setter and what the console reads
-- (the roles plan; Orel's answers of 15 November 2026, issue #1). Still no
-- change for anyone: no key is settable until its area's phase (R3 to R8)
-- turns its permission_keys.settable on, once every check in the area reads
-- it.
--
--   setter      public.set_role_permission switches a settable key per role:
--               granted or denied writes the row's allowed, and the key's
--               default for the role removes the row, so rows stay few and
--               "back to default" is the undo. Granting a key whose
--               requirement the role doesn't hold by role is refused (22023,
--               hint 'requires'); denying one leaves the keys that require it
--               as they are (private.holds_perm drops them). Managers and
--               workers only, as before. A key an owner gives (clock.payroll)
--               is added and removed exactly as before, logged as
--               permission.grant / permission.revoke; any other key that
--               isn't settable is refused (22023), as before. The business is
--               locked first, then its row, as public.set_member_role and the
--               demo reset take them, so a switch and a reset never deadlock
--               and two switches in one business go one after the other.
--   one area    public.set_role_permissions writes several keys of one role
--               in one transaction, each as public.set_role_permission: the
--               console's change of an area, which a refusal leaves as it
--               was, and nobody holds a step between.
--   who         private.check_permission_giver takes a settable key from the
--               same givers as pay: an active owner of the business or the
--               ConceptApp team (the console), never a manager (Q5).
--               public.set_member_permission keeps giving a person only a key
--               an owner gives: personal grants stay pay only.
--   the log     each change of a settable key is one row of public.audit_log,
--               'role.permission' (the role, the key, its area, from and to),
--               never permission.*, which pay holders and accountants read.
--               Its readers are those of module.settings: owners and
--               managers, and a view as one (the log's policies are
--               unchanged; R7 gates the log by each action's area).
--   demo        a demo business is changed as its pay is, by its visitors,
--               and its reset deletes the business, its role rows with it
--               (on delete cascade), and seeds only its definition's.
--   matrix      public.role_permission_matrix(business): for managers and
--               workers, every key with its area, what it requires, whether
--               it is settable or an owner's, whether the role holds it by
--               default, the role's own rule (private.role_gives) and what
--               the role holds by it (private.role_holds). The secret key
--               only: the console reads it after checking its team member.
--   the rows    public.role_permissions is read by the business's owners and
--               a view as its owner (/manage/access), no longer by every
--               member: its rows say who set each rule and when, which the
--               log keeps from the rest of the staff. What anyone holds comes
--               from public.my_permissions.

------------------------------------------------------------------------------
-- 1. Who gives

-- 20261110000300_payroll_access.sql's, with a key owners switch per role
-- (settable) accepted from the same givers as a key an owner gives.
create or replace function private.check_permission_giver(actor uuid, business uuid, perm_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_owner(business, actor)
    and not exists (select 1 from public.platform_staff s where s.user_id = actor)
  then
    raise exception 'Only an owner or the team gives this' using errcode = '42501';
  end if;

  if not exists (select 1 from public.businesses b where b.id = business) then
    raise exception 'Unknown business: %', business using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.permission_keys k
    where k.key = perm_key and (k.by_owner or k.settable)
  ) then
    raise exception 'Not a permission an owner gives or switches: %', coalesce(perm_key, 'none')
      using errcode = '22023';
  end if;
end;
$$;

------------------------------------------------------------------------------
-- 2. The setters

-- 20261110000300_payroll_access.sql's, with a settable key switched per role:
-- the row says granted or denied, the key's default for the role removes it,
-- a grant needs what the key requires held by the role, and each change is
-- logged as 'role.permission'. A key an owner gives is added and removed as
-- before. The business is locked before its row (for no key update, which
-- other writers' key checks pass): a demo reset locks it for update and then
-- deletes the rows, so the other order could deadlock with it.
create or replace function public.set_role_permission(
  actor uuid,
  business uuid,
  grant_role public.member_role,
  perm_key text,
  granted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
  owner_gives boolean;
  needs text;
  key_area text;
  by_default boolean;
  was boolean;
  given_before boolean;
begin
  perform private.check_permission_giver(actor, business, perm_key);

  if grant_role is null or grant_role not in ('manager', 'worker') then
    raise exception 'Owners and accountants always hold it' using errcode = '22023';
  end if;

  if granted is null then
    raise exception 'Say whether it is given' using errcode = '22023';
  end if;

  -- The business first, then its rows, as public.set_member_role takes them.
  perform 1 from public.businesses b where b.id = business for no key update;

  select k.by_owner, k.requires, k.area, grant_role = any (k.default_roles)
  into owner_gives, needs, key_area, by_default
  from public.permission_keys k
  where k.key = perm_key;

  -- A settable key (private.check_permission_giver refused any other).
  if not owner_gives then
    if granted and needs is not null
      and not private.role_holds(business, grant_role, needs)
    then
      raise exception 'The role needs % first', needs
        using errcode = '22023', hint = 'requires', detail = needs;
    end if;

    select rp.allowed into was
    from public.role_permissions rp
    where rp.business_id = business and rp.role = grant_role and rp.perm = perm_key
    for update;
    given_before := coalesce(was, by_default);

    if granted = by_default then
      delete from public.role_permissions rp
      where rp.business_id = business and rp.role = grant_role and rp.perm = perm_key;
    else
      insert into public.role_permissions as rp (business_id, role, perm, allowed, granted_by)
      values (business, grant_role, perm_key, granted, actor)
      on conflict (business_id, role, perm) do update
        set allowed = excluded.allowed, granted_by = excluded.granted_by, granted_at = now()
        where rp.allowed is distinct from excluded.allowed;
    end if;
    get diagnostics changed = row_count;

    -- Logged when the role's rule changed: a row that only met its default
    -- goes quietly, and a call that changes nothing writes nothing.
    if changed > 0 and given_before <> granted then
      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        business, actor, 'role.permission',
        jsonb_build_object(
          'role', grant_role, 'perm', perm_key, 'area', key_area,
          'from', given_before, 'to', granted
        )
      );
    end if;
    return;
  end if;

  if granted then
    insert into public.role_permissions (business_id, role, perm, granted_by)
    values (business, grant_role, perm_key, actor)
    on conflict do nothing;
  else
    delete from public.role_permissions rp
    where rp.business_id = business and rp.role = grant_role and rp.perm = perm_key;
  end if;
  get diagnostics changed = row_count;

  if changed > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, actor,
      case when granted then 'permission.grant' else 'permission.revoke' end,
      jsonb_build_object('role', grant_role, 'perm', perm_key)
    );
  end if;
end;
$$;

-- Several keys of one role in one go, each as public.set_role_permission, in
-- the order given (a grant after the keys it requires): the console's change
-- of an area (setRoleArea in @db/roles). One transaction, so a refusal of
-- any key leaves every one as it was, with its code, hint and detail, and
-- nobody holds a step between. A key without its answer is refused (22023).
create function public.set_role_permissions(
  actor uuid,
  business uuid,
  grant_role public.member_role,
  perm_keys text[],
  granted boolean[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(perm_keys), 0) <> coalesce(cardinality(granted), 0) then
    raise exception 'One answer for each key' using errcode = '22023';
  end if;

  for i in 1 .. coalesce(cardinality(perm_keys), 0) loop
    perform public.set_role_permission(actor, business, grant_role, perm_keys[i], granted[i]);
  end loop;
end;
$$;

-- 20261110000300_payroll_access.sql's, with a key owners switch per role
-- refused here: a person is given only a key an owner gives (pay), whatever
-- private.check_permission_giver accepts for a role.
create or replace function public.set_member_permission(
  actor uuid,
  business uuid,
  person uuid,
  perm_key text,
  granted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.memberships%rowtype;
begin
  perform private.check_permission_giver(actor, business, perm_key);

  if not exists (
    select 1 from public.permission_keys k where k.key = perm_key and k.by_owner
  ) then
    raise exception 'Not a permission an owner gives: %', perm_key
      using errcode = '22023';
  end if;

  if granted is null then
    raise exception 'Say whether it is given' using errcode = '22023';
  end if;

  if person is not distinct from actor then
    raise exception 'Not to yourself' using errcode = '22023';
  end if;

  select * into m
  from public.memberships x
  where x.business_id = business and x.user_id = person and x.active
  for update;
  if not found then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if m.role = 'owner' or not private.is_staff_role(m.role) then
    raise exception 'Owners and accountants always hold it' using errcode = '22023';
  end if;

  if granted = (perm_key = any (m.perms)) then
    return;
  end if;

  update public.memberships x
  set perms = case
    when granted then array_append(x.perms, perm_key)
    else array_remove(x.perms, perm_key)
  end
  where x.id = m.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor,
    case when granted then 'permission.grant' else 'permission.revoke' end,
    jsonb_build_object('person', person, 'perm', perm_key)
  );
end;
$$;

comment on table public.role_permissions is
  'What a business decides for a role and a permission: granted or denied (allowed); without a row the key''s default roles decide. Written only by public.set_role_permission (and the demo''s seed): a settable key by its row''s allowed, the row removed when the choice is the key''s default for the role; a by-owner key (clock.payroll: pay access) by adding its row and removing it. Owners and accountants hold theirs without a row. Goes with the business (a demo reset deletes and seeds it again).';
comment on column public.role_permissions.granted_by is
  'Who last set the row: who gave a by-owner key, or who granted or denied a settable one.';

-- 20261110000300_payroll_access.sql's read was every member's and every
-- view's, while the rows were pay's alone. Now they hold every rule an owner
-- or the team sets, with who set it and when (granted_by, granted_at), which
-- the log's role.permission rows keep from workers and accountants: the
-- owners read them, and the team viewing the business as its owner, as
-- /manage/access does (getPayRoles in @db/payroll). Everyone else learns what
-- they hold from public.my_permissions; the console reads with the secret
-- key.
drop policy "members read their business's role grants" on public.role_permissions;

create policy "owners read their business's role rules"
  on public.role_permissions for select to authenticated
  using (private.has_role(business_id, 'owner') or private.is_viewing(business_id, 'owner'));

------------------------------------------------------------------------------
-- 3. What the console reads

-- For managers and workers in the business, every permission: its area, what
-- it requires, whether owners switch it per role (settable) or give it
-- (by_owner), whether the role is among its default roles (by_default: its
-- rule without a row), the role's own rule for it (given: its row, else its
-- default roles, as private.role_gives) and whether the role holds it by
-- that rule (held: with what it requires, as private.role_holds and a view
-- in public.my_permissions). Nothing for an unknown business. The secret key
-- only: the console checks its team member first, as it does for who sees
-- pay.
create function public.role_permission_matrix(business uuid)
returns table (
  role public.member_role,
  perm text,
  area text,
  requires text,
  settable boolean,
  by_owner boolean,
  by_default boolean,
  given boolean,
  held boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.role, k.key, k.area, k.requires, k.settable, k.by_owner,
    r.role = any (k.default_roles),
    private.role_gives(b.id, r.role, k.key),
    private.role_holds(b.id, r.role, k.key)
  from public.businesses b
  cross join unnest('{manager,worker}'::public.member_role[]) as r (role)
  cross join public.permission_keys k
  where b.id = role_permission_matrix.business
  order by r.role, k.key
$$;

------------------------------------------------------------------------------
-- Who may call what

-- Replaced in place: the same signatures, so their grants stay; revoked and
-- granted again all the same.
revoke execute on function private.check_permission_giver(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.set_role_permission(uuid, uuid, public.member_role, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.set_member_permission(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_role_permission(uuid, uuid, public.member_role, text, boolean)
  to service_role;
grant execute on function public.set_member_permission(uuid, uuid, uuid, text, boolean)
  to service_role;

-- The console's change of an area, with the secret key only.
revoke execute on function public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[])
  from public, anon, authenticated;
grant execute on function public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[])
  to service_role;

-- The console's read, with the secret key only.
revoke execute on function public.role_permission_matrix(uuid)
  from public, anon, authenticated;
grant execute on function public.role_permission_matrix(uuid) to service_role;
