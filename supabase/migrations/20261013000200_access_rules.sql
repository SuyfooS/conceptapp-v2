-- Who may see what. Helpers live in the `private` schema, which the Data API
-- does not expose; they are security definer so policies can read
-- memberships without recursing into memberships' own policies.
--
-- Writes are server-only for now: businesses, memberships, modules, invites,
-- templates and the audit log change through server code with the secret key
-- (which bypasses RLS). Policies for user writes arrive with the screens that
-- need them.

create schema if not exists private;
grant usage on schema private to authenticated, anon;

-- Rank of a role: owner > manager > worker.
create function private.role_rank(r public.member_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case r when 'owner' then 3 when 'manager' then 2 when 'worker' then 1 end
$$;

-- The caller has an active membership in the business.
create function private.is_member(business uuid)
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
      and m.user_id = (select auth.uid())
      and m.active
  )
$$;

-- The caller's role in the business is at least `min_role`.
create function private.has_role(business uuid, min_role public.member_role)
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
      and m.user_id = (select auth.uid())
      and m.active
      and private.role_rank(m.role) >= private.role_rank(min_role)
  )
$$;

-- The caller holds a permission in the business. Owners hold every one.
create function private.has_perm(business uuid, perm text)
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
      and m.user_id = (select auth.uid())
      and m.active
      and (m.role = 'owner' or perm = any (m.perms))
  )
$$;

-- The module is switched on for the business.
create function private.module_enabled(business uuid, key public.module_key)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_modules bm
    where bm.business_id = business
      and bm.module_key = key
      and bm.enabled
  )
$$;

-- The caller and `other` are active members of at least one common business.
create function private.shares_business(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.business_id = mine.business_id
    where mine.user_id = (select auth.uid())
      and mine.active
      and theirs.user_id = other
      and theirs.active
  )
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;

-- Row-level security on every table. A meta-test fails if a table in
-- `public` is ever added without it.
alter table public.templates enable row level security;
alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.business_modules enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;

-- Table privileges: anonymous visitors get nothing until the storefront
-- needs it; signed-in users get only what the policies below can grant.
revoke all on
  public.templates, public.businesses, public.profiles, public.memberships,
  public.business_modules, public.invites, public.audit_log
from anon, authenticated;

grant select on
  public.businesses, public.profiles, public.memberships,
  public.business_modules, public.invites, public.audit_log
to authenticated;
grant update (name, address, accent) on public.businesses to authenticated;
grant update (full_name, locale) on public.profiles to authenticated;

-- templates: platform data, server only (no policies).

-- businesses
create policy "members read their business"
  on public.businesses for select to authenticated
  using (private.is_member(id));

create policy "owners update their business"
  on public.businesses for update to authenticated
  using (private.has_role(id, 'owner'))
  with check (private.has_role(id, 'owner'));

-- profiles
create policy "people read themselves and their colleagues"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_business(id));

create policy "people update themselves"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships
create policy "members read their business's team"
  on public.memberships for select to authenticated
  using (private.is_member(business_id));

-- business_modules
create policy "members read their business's modules"
  on public.business_modules for select to authenticated
  using (private.is_member(business_id));

-- invites
create policy "managers read their business's invites"
  on public.invites for select to authenticated
  using (private.has_role(business_id, 'manager'));

-- audit_log
create policy "managers read their business's audit log"
  on public.audit_log for select to authenticated
  using (private.has_role(business_id, 'manager'));
