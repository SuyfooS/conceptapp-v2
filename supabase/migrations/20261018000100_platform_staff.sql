-- The ConceptApp team: people who run the admin console. Separate from
-- memberships, which are always inside one business.
--
-- platform_admin: everything in the console.
-- onboarder: creates businesses and invites staff; no billing, no templates,
-- no deleting. (The capability list lives in @domain/platform.)

create type public.platform_role as enum ('platform_admin', 'onboarder');

create table public.platform_staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default now()
);

alter table public.platform_staff enable row level security;

revoke all on public.platform_staff from anon, authenticated;
grant select on public.platform_staff to authenticated;

-- Staff are added by hand (SQL) or by server code; people only read whether
-- they are staff themselves.
create policy "people read their own staff row"
  on public.platform_staff for select to authenticated
  using (user_id = (select auth.uid()));

-- The caller is on the ConceptApp team (any platform role).
create function private.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = (select auth.uid())
  )
$$;

revoke execute on function private.is_platform_staff() from public;
grant execute on function private.is_platform_staff() to authenticated;

-- The admin console's business list: every business with its member count
-- and open invites. Platform staff only; anyone else gets an error, not an
-- empty list, so a missing role is never mistaken for "no businesses".
-- Security definer so the console reads across businesses without opening
-- the tenant tables' policies to staff.
create function public.admin_businesses()
returns table (
  id uuid,
  slug text,
  name text,
  accent text,
  template_key text,
  created_at timestamptz,
  members bigint,
  open_invites bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff() then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  return query
  select b.id, b.slug, b.name, b.accent, b.template_key, b.created_at,
    (select count(*) from public.memberships m
      where m.business_id = b.id and m.active),
    (select count(*) from public.invites i
      where i.business_id = b.id and i.claimed_at is null
        and i.expires_at > now())
  from public.businesses b
  order by b.created_at desc, b.name;
end;
$$;

revoke execute on function public.admin_businesses() from public, anon;
grant execute on function public.admin_businesses() to authenticated;
