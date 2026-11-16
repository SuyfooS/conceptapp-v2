-- Roles and permissions by module, R11a: roles a business names itself (the
-- roles plan; Orel's answers of 15 November 2026, issue #1: answer 1, an
-- owner adds a role with a name they choose, built on a manager or a worker,
-- with its own permissions; answer 5, only owners and the ConceptApp team
-- change permissions, and so add, rename and archive roles). Nothing changes
-- for anyone yet: nobody holds a named role until R11b gives one (by an
-- invite or a change of role), so every person's answer is today's.
--
--   the roles   public.business_roles: a business's own roles, each with its
--               name (trimmed, 1 to 40 characters, one live role per name in
--               a business, whatever its case), an optional English name,
--               what it is built on (base: manager or worker, which gives its
--               rank: who may give it, whom it may give, what it sees by
--               rank), its place in the list (sort), who made it and when,
--               and when it was archived. Read by the business's members and
--               its view sessions (a colleague's role name is no secret);
--               written only by the functions below.
--   holding one memberships.named_role: the role a person holds, always one
--               built on their own role (memberships.role), by a foreign key
--               over (business_id, named_role, role), so a change of role
--               that changes the base clears it (a trigger, whoever changes
--               the role: public.set_member_role, public.claim_invite), and
--               always a live one (a trigger: an archived role is refused,
--               22023, hint 'archived'). R11a never sets it; R11b does.
--   its rules   public.role_permissions.named_role: a row for a named role
--               has role = its base (the same foreign key). The primary key
--               (business_id, role, perm) can't take a nullable column
--               (critique 27), so a unique index nulls not distinct over
--               (business_id, role, named_role, perm) replaces it, and
--               public.set_role_permission's on conflict names it. The demo's
--               seed (private.seed_demo_pay) and the pay branch of the setter
--               say on conflict do nothing, with no target: unchanged.
--   who holds   a person with a named role holds by role what the named
--               role's row decides, else its base's rule (the base's row,
--               else the key's default roles), with what each key requires
--               as before (private.role_gives, private.role_holds,
--               private.holds_perm); personal grants as before. A named role
--               never holds pay by role: a key an owner gives (clock.payroll)
--               is given to each person in it on "מי רואה שכר"
--               (memberships.perms), as R0's screen says, so no row for one
--               is written (private.refuse_named_role_pay) and the base's
--               pay doesn't flow into it. A view session still views the
--               built-in roles only (R11c).
--   setting     public.set_role_permission and public.set_role_permissions
--               take a named role (grant_named, defaulted, so today's
--               callers are unchanged): its rows, the base's rule as its
--               default, so "back to default" removes the row and the role
--               follows its base again.
--   making      public.create_business_role (owners and the team, as
--               private.check_permission_giver has it: private.check_role_changer),
--               from its base's rules or another role's, built-in or named:
--               rows only where the source's rule differs from the base's, so
--               it starts holding exactly what the source holds and follows
--               its base wherever it doesn't differ. At most twenty live
--               roles a business (54000, hint 'limit'); a live name taken
--               (23505, hint 'taken'). public.rename_business_role,
--               public.archive_business_role (refused while anyone active
--               holds it: 55000, hint 'held', detail the count) and
--               public.restore_business_role (the archive's undo). A demo
--               business takes them as it takes its pay and its rules: its
--               reset deletes the business, its roles with it (on delete
--               cascade). Each is logged, role.create, role.rename,
--               role.archive and role.restore, read as role.permission is
--               (private.log_perm: manage.view).
--   the matrix  public.role_permission_matrix gains the live named roles:
--               for each, every key, with its role (the base), its id, name
--               and English name, its default (the base's rule; never pay),
--               its own rule and what it holds by it; managers' and workers'
--               rows as before, first.
--
-- Replaced, each from its latest version and only with what is said above:
-- private.role_gives, private.role_holds and private.holds_perm
-- (20261115000700_roles_catalogue.sql), public.set_role_permission,
-- public.set_role_permissions and public.role_permission_matrix
-- (20261115000800_roles_setter.sql). private.role_gives and
-- private.role_holds gain a defaulted argument, public.set_role_permission
-- and public.set_role_permissions one too, and public.role_permission_matrix
-- three columns, so each is dropped and created again, its grants with it.
-- Every caller keeps its call: private.role_holds_beyond,
-- private.role_holds_pay, the invites, private.businesses_holding,
-- private.viewed_perms and public.my_permissions ask the built-in roles, as
-- R11b (giving one), R11c (view-as) and R11d (lists to one) will widen.

------------------------------------------------------------------------------
-- 1. The roles

create table public.business_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Its rank and its rules' base: a role a business names is a manager or a
  -- worker by another name.
  base public.member_role not null check (base in ('manager', 'worker')),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  name_en text check (
    name_en is null or (name_en = btrim(name_en) and char_length(name_en) between 1 and 40)
  ),
  sort integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  -- What the memberships' and the rules' foreign keys name: the role, in its
  -- business, on its base.
  unique (business_id, id, base)
);

-- One live role a name in a business, whatever its case.
create unique index business_roles_live_name_idx
  on public.business_roles (business_id, lower(name))
  where archived_at is null;
create index business_roles_created_by_idx on public.business_roles (created_by);

alter table public.business_roles enable row level security;
revoke all on public.business_roles from anon, authenticated;
-- Written only by the functions below, even with the secret key.
revoke insert, update, delete, truncate on public.business_roles from service_role;
grant select on public.business_roles to authenticated;

create policy "members and views read their business's roles"
  on public.business_roles for select to authenticated
  using (private.is_member(business_id) or private.is_viewing(business_id));

comment on table public.business_roles is
  'Roles a business names itself (the roles plan''s R11; Orel, 15 November 2026): a manager or a worker by another name (base), with its own rules in public.role_permissions (named_role), else its base''s. One live role a name in a business. Written only by public.create_business_role, public.rename_business_role, public.archive_business_role and public.restore_business_role; read by the business''s members and views. Goes with the business.';
comment on column public.business_roles.base is
  'What the role is built on: its rank, and its rules where it has none of its own.';
comment on column public.business_roles.name_en is
  'Its name in English, when the business gave one; the English screens show the Hebrew name otherwise.';
comment on column public.business_roles.sort is
  'Its place among the business''s roles, after managers and workers: the order they were added.';
comment on column public.business_roles.archived_at is
  'When it was archived: off the screens, held by nobody, its rules kept for a restore.';

------------------------------------------------------------------------------
-- 2. Who holds one

alter table public.memberships
  add column named_role uuid,
  -- Always a role built on the person's own: a manager's named role is built
  -- on manager. Deleted only with its business.
  add constraint memberships_named_role_fkey
    foreign key (business_id, named_role, role)
    references public.business_roles (business_id, id, base)
    on delete set null (named_role);

create index memberships_named_role_idx
  on public.memberships (named_role)
  where named_role is not null;

comment on column public.memberships.named_role is
  'The role the business named that the person holds (public.business_roles), built on their role and live (never an archived one); null for the role itself. Cleared when the role changes to another base.';

-- A change of role to another base leaves the named role behind, whoever
-- changes it (public.set_member_role, public.claim_invite): one that sets a
-- named role with it keeps that one.
create function private.clear_named_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
    and new.named_role is not distinct from old.named_role
  then
    new.named_role := null;
  end if;
  return new;
end;
$$;

create trigger memberships_named_role_follows_role
  before update of role on public.memberships
  for each row execute function private.clear_named_role();

-- A role held is a live one: nobody is put in an archived role of the
-- business, whoever writes it (R11b's public.claim_invite and
-- public.set_member_role among them), until it is restored (22023, hint
-- 'archived'). The foreign key answers for a role of another business or on
-- another base. The role's row is locked as the foreign key's check locks
-- it, so an archive under way is waited for and its answer read.
create function private.refuse_archived_named_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived boolean;
begin
  if new.named_role is null
    or (tg_op = 'UPDATE' and new.named_role is not distinct from old.named_role)
  then
    return new;
  end if;

  select br.archived_at is not null into archived
  from public.business_roles br
  where br.id = new.named_role
    and br.business_id = new.business_id
  for key share;

  if archived then
    raise exception 'The role is archived' using errcode = '22023', hint = 'archived';
  end if;
  return new;
end;
$$;

-- After memberships_named_role_follows_role (triggers go by name), so a role
-- left behind by a change of base is never checked.
create trigger memberships_named_role_live
  before insert or update of named_role on public.memberships
  for each row execute function private.refuse_archived_named_role();

------------------------------------------------------------------------------
-- 3. Its rules

alter table public.role_permissions
  add column named_role uuid,
  -- A named role's row is for its base, in its business.
  add constraint role_permissions_named_role_fkey
    foreign key (business_id, named_role, role)
    references public.business_roles (business_id, id, base)
    on delete cascade;

-- The primary key can't take a nullable column (critique 27): one rule a
-- role, a named role (or none) and a key, nulls alike.
alter table public.role_permissions drop constraint role_permissions_pkey;
create unique index role_permissions_rule_idx
  on public.role_permissions (business_id, role, named_role, perm) nulls not distinct;

comment on column public.role_permissions.named_role is
  'The role the business named that the row is for (its role is that one''s base); null for the base role itself. Never a key an owner gives.';

-- Pay is given to each person in a named role, never to the role (R0's
-- screen: "מי רואה שכר" has no switch for it), so no row gives one a key an
-- owner gives.
create function private.refuse_named_role_pay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.named_role is not null and exists (
    select 1
    from public.permission_keys k
    where k.key = new.perm
      and k.by_owner
  ) then
    raise exception 'A role the business names is given pay person by person'
      using errcode = '22023', hint = 'pay';
  end if;
  return new;
end;
$$;

create trigger role_permissions_named_role_pay
  before insert or update of named_role, perm on public.role_permissions
  for each row execute function private.refuse_named_role_pay();

------------------------------------------------------------------------------
-- 4. Who holds what

drop function private.role_gives(uuid, public.member_role, text);
drop function private.role_holds(uuid, public.member_role, text);

-- 20261115000700_roles_catalogue.sql's, with a role the business names
-- (`named`, built on `r`): its own row when there is one, else its base's
-- rule as before (r's row, now the one for no named role, else the key's
-- default roles), and never a key an owner gives.
create function private.role_gives(
  business uuid,
  r public.member_role,
  perm_key text,
  named uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when named is not null and exists (
      select 1
      from public.permission_keys k
      where k.key = perm_key
        and k.by_owner
    ) then false
    else coalesce(
      (
        select rp.allowed
        from public.role_permissions rp
        where named is not null
          and rp.business_id = business
          and rp.role = r
          and rp.named_role = named
          and rp.perm = perm_key
      ),
      (
        select rp.allowed
        from public.role_permissions rp
        where rp.business_id = business
          and rp.role = r
          and rp.named_role is null
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
  end
$$;

-- 20261115000700_roles_catalogue.sql's, with a role the business names
-- (`named`, built on `r`), by its own rule (private.role_gives).
create function private.role_holds(
  business uuid,
  r public.member_role,
  perm_key text,
  named uuid default null
)
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
  select bool_and(private.role_gives(business, r, n.need, named))
  from needed n
$$;

-- 20261115000700_roles_catalogue.sql's, with the person's named role: what
-- their role gives them is their named role's rule, else its base's.
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
              private.role_gives(m.business_id, m.role, perm_key, m.named_role)
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

------------------------------------------------------------------------------
-- 5. The setters

drop function public.set_role_permission(uuid, uuid, public.member_role, text, boolean);
drop function public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[]);

-- 20261115000800_roles_setter.sql's, with a role the business names
-- (grant_named): live, in the business, built on grant_role; its row, with
-- its base's rule (private.role_gives) as its default, so a choice that is
-- the base's removes the row; never a key an owner gives (22023, hint
-- 'pay'); its log row naming it. A built-in role's rows are now those for no
-- named role, and its upsert names the unique index that replaced the
-- primary key.
create function public.set_role_permission(
  actor uuid,
  business uuid,
  grant_role public.member_role,
  perm_key text,
  granted boolean,
  grant_named uuid default null
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
  named_name text;
  named_base public.member_role;
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

  -- A role the business named: live in this business, on this base, never
  -- given pay, and the base's rule its default.
  if grant_named is not null then
    select br.name, br.base into named_name, named_base
    from public.business_roles br
    where br.id = grant_named
      and br.business_id = business
      and br.archived_at is null;
    if not found then
      raise exception 'No such role in the business' using errcode = 'P0002';
    end if;
    if named_base <> grant_role then
      raise exception 'The role is built on %', named_base using errcode = '22023', hint = 'base';
    end if;
    if owner_gives then
      raise exception 'A role the business names is given pay person by person'
        using errcode = '22023', hint = 'pay';
    end if;
    by_default := private.role_gives(business, grant_role, perm_key);
  end if;

  -- A settable key (private.check_permission_giver refused any other).
  if not owner_gives then
    if granted and needs is not null
      and not private.role_holds(business, grant_role, needs, grant_named)
    then
      raise exception 'The role needs % first', needs
        using errcode = '22023', hint = 'requires', detail = needs;
    end if;

    select rp.allowed into was
    from public.role_permissions rp
    where rp.business_id = business and rp.role = grant_role
      and rp.named_role is not distinct from grant_named and rp.perm = perm_key
    for update;
    given_before := coalesce(was, by_default);

    if granted = by_default then
      delete from public.role_permissions rp
      where rp.business_id = business and rp.role = grant_role
        and rp.named_role is not distinct from grant_named and rp.perm = perm_key;
    else
      insert into public.role_permissions as rp (business_id, role, named_role, perm, allowed, granted_by)
      values (business, grant_role, grant_named, perm_key, granted, actor)
      on conflict (business_id, role, named_role, perm) do update
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
        ) || case
          when grant_named is null then '{}'::jsonb
          else jsonb_build_object('named_role', grant_named, 'name', named_name)
        end
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
    where rp.business_id = business and rp.role = grant_role
      and rp.named_role is null and rp.perm = perm_key;
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

-- 20261115000800_roles_setter.sql's, with a role the business names
-- (grant_named), passed on to each key's public.set_role_permission.
create function public.set_role_permissions(
  actor uuid,
  business uuid,
  grant_role public.member_role,
  perm_keys text[],
  granted boolean[],
  grant_named uuid default null
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
    perform public.set_role_permission(
      actor, business, grant_role, perm_keys[i], granted[i], grant_named
    );
  end loop;
end;
$$;

comment on table public.role_permissions is
  'What a business decides for a role and a permission: granted or denied (allowed); without a row the key''s default roles decide. A row for a role the business named (named_role) decides for it; without one, its base''s rule. Written only by public.set_role_permission (and the demo''s seed, and public.create_business_role''s first rules): a settable key by its row''s allowed, the row removed when the choice is the default (a named role''s: its base''s rule); a by-owner key (clock.payroll: pay access) by adding its row and removing it, for managers and workers only. Owners and accountants hold theirs without a row. Goes with the business (a demo reset deletes and seeds it again).';

------------------------------------------------------------------------------
-- 6. Adding, renaming and archiving a role

-- Who adds, renames and archives a business's roles: as who switches a
-- permission per role (private.check_permission_giver), an active owner of
-- the business or the ConceptApp team (Q5), never a manager.
create function private.check_role_changer(actor uuid, business uuid)
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
    raise exception 'Only an owner or the team changes the roles' using errcode = '42501';
  end if;

  if not exists (select 1 from public.businesses b where b.id = business) then
    raise exception 'Unknown business: %', business using errcode = 'P0002';
  end if;
end;
$$;

-- A role's name as it is kept: trimmed, its spaces single; null for none.
create function private.clean_role_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce(raw, ''::text), '\s+', ' ', 'g')), ''::text)
$$;

-- A business's role, built on a manager or a worker, with a name it chooses
-- and, optionally, an English one, starting with the permissions of its base,
-- of the other built-in role (copy_role) or of another of its roles
-- (copy_from): rows only where that one's rule differs from the base's, so
-- it holds exactly what the source holds and follows its base wherever it
-- doesn't differ; keys owners don't switch, and pay, are its base's and
-- never copied. Its id. Owners and the team only.
create function public.create_business_role(
  actor uuid,
  business uuid,
  base_role public.member_role,
  role_name text,
  role_name_en text default null,
  copy_from uuid default null,
  copy_role public.member_role default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := private.clean_role_name(role_name);
  clean_name_en text := private.clean_role_name(role_name_en);
  source_role public.member_role;
  made uuid;
begin
  perform private.check_role_changer(actor, business);

  if base_role is null or base_role not in ('manager', 'worker') then
    raise exception 'A role is built on a manager or a worker' using errcode = '22023', hint = 'base';
  end if;

  if clean_name is null or char_length(clean_name) > 40 then
    raise exception 'A role''s name has 1 to 40 characters' using errcode = '22023', hint = 'name';
  end if;

  if char_length(clean_name_en) > 40 then
    raise exception 'A role''s English name has up to 40 characters'
      using errcode = '22023', hint = 'name_en';
  end if;

  if copy_from is not null and copy_role is not null then
    raise exception 'Copy one role' using errcode = '22023';
  end if;

  if copy_role is not null and copy_role not in ('manager', 'worker') then
    raise exception 'Copy a manager, a worker or a role of the business' using errcode = '22023';
  end if;

  -- The business first, as every writer of its roles and rules takes it, so
  -- two additions go one after the other and a reset waits.
  perform 1 from public.businesses b where b.id = business for no key update;

  if copy_from is not null then
    select br.base into source_role
    from public.business_roles br
    where br.id = copy_from
      and br.business_id = business
      and br.archived_at is null;
    if not found then
      raise exception 'No such role in the business' using errcode = 'P0002';
    end if;
  else
    source_role := coalesce(copy_role, base_role);
  end if;

  if (
    select count(*)
    from public.business_roles br
    where br.business_id = business
      and br.archived_at is null
  ) >= 20 then
    raise exception 'At most twenty roles' using errcode = '54000', hint = 'limit';
  end if;

  if exists (
    select 1
    from public.business_roles br
    where br.business_id = business
      and br.archived_at is null
      and lower(br.name) = lower(clean_name)
  ) then
    raise exception 'A role by this name is in the business' using errcode = '23505', hint = 'taken';
  end if;

  insert into public.business_roles (business_id, base, name, name_en, sort, created_by)
  values (
    business, base_role, clean_name, clean_name_en,
    coalesce(
      (select max(br.sort) from public.business_roles br where br.business_id = business),
      0
    ) + 1,
    actor
  )
  returning id into made;

  insert into public.role_permissions (business_id, role, named_role, perm, allowed, granted_by)
  select business, base_role, made, k.key, s.given, actor
  from public.permission_keys k
  cross join lateral (
    select private.role_gives(business, source_role, k.key, copy_from) as given
  ) s
  where k.settable
    and s.given is distinct from private.role_gives(business, base_role, k.key);

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'role.create',
    jsonb_build_object('named_role', made, 'name', clean_name, 'base', base_role)
      || jsonb_strip_nulls(jsonb_build_object(
        'name_en', clean_name_en, 'copy_from', copy_from, 'copy_role', copy_role
      ))
  );

  return made;
end;
$$;

-- A live role's new name, and its English one: null keeps the English name,
-- an empty one removes it. Refused for a name another live role of the
-- business goes by (23505, hint 'taken'). Owners and the team only.
create function public.rename_business_role(
  actor uuid,
  role_id uuid,
  role_name text,
  role_name_en text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.business_roles%rowtype;
  clean_name text := private.clean_role_name(role_name);
  clean_name_en text;
begin
  select * into target from public.business_roles br where br.id = role_id;
  if not found then
    raise exception 'No such role' using errcode = 'P0002';
  end if;

  perform private.check_role_changer(actor, target.business_id);

  if clean_name is null or char_length(clean_name) > 40 then
    raise exception 'A role''s name has 1 to 40 characters' using errcode = '22023', hint = 'name';
  end if;

  perform 1 from public.businesses b where b.id = target.business_id for no key update;
  select * into target from public.business_roles br where br.id = role_id for update;
  if target.archived_at is not null then
    raise exception 'The role is archived' using errcode = 'P0002', hint = 'archived';
  end if;

  clean_name_en := case
    when role_name_en is null then target.name_en
    else private.clean_role_name(role_name_en)
  end;
  if char_length(clean_name_en) > 40 then
    raise exception 'A role''s English name has up to 40 characters'
      using errcode = '22023', hint = 'name_en';
  end if;

  if exists (
    select 1
    from public.business_roles br
    where br.business_id = target.business_id
      and br.archived_at is null
      and br.id <> role_id
      and lower(br.name) = lower(clean_name)
  ) then
    raise exception 'A role by this name is in the business' using errcode = '23505', hint = 'taken';
  end if;

  if target.name = clean_name and target.name_en is not distinct from clean_name_en then
    return;
  end if;

  update public.business_roles br
  set name = clean_name, name_en = clean_name_en
  where br.id = role_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    target.business_id, actor, 'role.rename',
    jsonb_build_object(
      'named_role', role_id, 'base', target.base, 'from', target.name, 'to', clean_name
    ) || case
      when target.name_en is not distinct from clean_name_en then '{}'::jsonb
      else jsonb_build_object('from_en', target.name_en, 'to_en', clean_name_en)
    end
  );
end;
$$;

-- A role off the business's screens: refused while anyone active holds it
-- (55000, hint 'held', the count as its detail; R11b adds an open invite to
-- it), and the people who left with it keep it no longer, so nobody comes
-- back in an archived role. Its rules stay, for its restore. Archiving it
-- again changes nothing. Owners and the team only.
create function public.archive_business_role(actor uuid, role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.business_roles%rowtype;
  holders integer;
begin
  select * into target from public.business_roles br where br.id = role_id;
  if not found then
    raise exception 'No such role' using errcode = 'P0002';
  end if;

  perform private.check_role_changer(actor, target.business_id);

  perform 1 from public.businesses b where b.id = target.business_id for no key update;
  select * into target from public.business_roles br where br.id = role_id for update;
  if target.archived_at is not null then
    return;
  end if;

  select count(*)::integer into holders
  from public.memberships m
  where m.named_role = role_id
    and m.active;
  if holders > 0 then
    raise exception 'People hold the role' using errcode = '55000', hint = 'held', detail = holders::text;
  end if;

  update public.memberships m
  set named_role = null
  where m.named_role = role_id;

  update public.business_roles br
  set archived_at = now()
  where br.id = role_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    target.business_id, actor, 'role.archive',
    jsonb_build_object('named_role', role_id, 'name', target.name, 'base', target.base)
  );
end;
$$;

-- An archived role back on the screens, with its rules (the archive's undo):
-- refused while another live role goes by its name (23505, hint 'taken') or
-- the business has its twenty (54000, hint 'limit'). Restoring a live one
-- changes nothing. Owners and the team only.
create function public.restore_business_role(actor uuid, role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.business_roles%rowtype;
begin
  select * into target from public.business_roles br where br.id = role_id;
  if not found then
    raise exception 'No such role' using errcode = 'P0002';
  end if;

  perform private.check_role_changer(actor, target.business_id);

  perform 1 from public.businesses b where b.id = target.business_id for no key update;
  select * into target from public.business_roles br where br.id = role_id for update;
  if target.archived_at is null then
    return;
  end if;

  if (
    select count(*)
    from public.business_roles br
    where br.business_id = target.business_id
      and br.archived_at is null
  ) >= 20 then
    raise exception 'At most twenty roles' using errcode = '54000', hint = 'limit';
  end if;

  if exists (
    select 1
    from public.business_roles br
    where br.business_id = target.business_id
      and br.archived_at is null
      and lower(br.name) = lower(target.name)
  ) then
    raise exception 'A role by this name is in the business' using errcode = '23505', hint = 'taken';
  end if;

  update public.business_roles br
  set archived_at = null
  where br.id = role_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    target.business_id, actor, 'role.restore',
    jsonb_build_object('named_role', role_id, 'name', target.name, 'base', target.base)
  );
end;
$$;

------------------------------------------------------------------------------
-- 7. What the console reads

drop function public.role_permission_matrix(uuid);

-- 20261115000800_roles_setter.sql's, with the business's live named roles
-- after managers and workers, in their order: each key for each, with its
-- base as the role, its id, name and English name, its default (by_default:
-- its rule without a row of its own, the base's, and never pay), its own
-- rule (private.role_gives) and what it holds by it (private.role_holds).
-- Managers' and workers' rows as before, with no named role.
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
  held boolean,
  named_role uuid,
  role_name text,
  role_name_en text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.role, k.key, k.area, k.requires, k.settable, k.by_owner,
    case
      when r.named is null then r.role = any (k.default_roles)
      else not k.by_owner and private.role_gives(b.id, r.role, k.key)
    end,
    private.role_gives(b.id, r.role, k.key, r.named),
    private.role_holds(b.id, r.role, k.key, r.named),
    r.named, r.label, r.label_en
  from public.businesses b
  cross join lateral (
    select u.role, null::uuid as named, null::text as label, null::text as label_en,
      0 as place, null::timestamptz as made
    from unnest('{manager,worker}'::public.member_role[]) as u (role)
    union all
    select br.base, br.id, br.name, br.name_en, br.sort, br.created_at
    from public.business_roles br
    where br.business_id = b.id
      and br.archived_at is null
  ) as r
  cross join public.permission_keys k
  where b.id = role_permission_matrix.business
  order by r.named is not null, r.place, r.made, r.named, r.role, k.key
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The helpers run inside the functions above, as their owner.
revoke execute on function private.role_gives(uuid, public.member_role, text, uuid)
  from public, anon, authenticated;
revoke execute on function private.role_holds(uuid, public.member_role, text, uuid)
  from public, anon, authenticated;
revoke execute on function private.holds_perm(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function private.check_role_changer(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.clean_role_name(text)
  from public, anon, authenticated;
revoke execute on function private.clear_named_role()
  from public, anon, authenticated;
revoke execute on function private.refuse_archived_named_role()
  from public, anon, authenticated;
revoke execute on function private.refuse_named_role_pay()
  from public, anon, authenticated;

-- With the secret key only: the console's and the owner's screens, after
-- they checked the person.
revoke execute on function public.set_role_permission(uuid, uuid, public.member_role, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.set_role_permission(uuid, uuid, public.member_role, text, boolean, uuid)
  to service_role;
revoke execute on function public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[], uuid)
  from public, anon, authenticated;
grant execute on function public.set_role_permissions(uuid, uuid, public.member_role, text[], boolean[], uuid)
  to service_role;
revoke execute on function public.create_business_role(uuid, uuid, public.member_role, text, text, uuid, public.member_role)
  from public, anon, authenticated;
grant execute on function public.create_business_role(uuid, uuid, public.member_role, text, text, uuid, public.member_role)
  to service_role;
revoke execute on function public.rename_business_role(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.rename_business_role(uuid, uuid, text, text) to service_role;
revoke execute on function public.archive_business_role(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.archive_business_role(uuid, uuid) to service_role;
revoke execute on function public.restore_business_role(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_business_role(uuid, uuid) to service_role;
revoke execute on function public.role_permission_matrix(uuid)
  from public, anon, authenticated;
grant execute on function public.role_permission_matrix(uuid) to service_role;
