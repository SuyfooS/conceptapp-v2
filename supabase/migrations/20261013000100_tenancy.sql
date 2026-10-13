-- Tenancy core: businesses, the people in them, their modules and invites.
-- Every tenant table carries business_id; row-level security is switched on
-- for each table in the next migration (helpers + policies).

create type public.member_role as enum ('owner', 'manager', 'worker');

create type public.module_key as enum (
  'scheduling',
  'time_clock',
  'reservations',
  'storefront',
  'notifications'
);

-- Templates are platform data (chunk 1b fills them): a business is a
-- template plus settings.
create table public.templates (
  key text primary key check (key ~ '^[a-z][a-z0-9-]*$'),
  version integer not null default 1 check (version > 0),
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  template_key text references public.templates (key) on update cascade,
  accent text not null default '#2563EB' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  address text,
  -- Coordinates for Shabbat times (scheduling, chunk 2a).
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  timezone text not null default 'Asia/Jerusalem',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per signed-in person, created from auth.users by a trigger below.
-- The phone number is the identity, stored as E.164.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  full_name text check (char_length(btrim(full_name)) between 1 and 80),
  locale text not null default 'he' check (locale in ('he', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'worker',
  -- Extra permissions on top of the role, e.g. 'schedule.publish'.
  perms text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create table public.business_modules (
  business_id uuid not null references public.businesses (id) on delete cascade,
  module_key public.module_key not null,
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (business_id, module_key)
);

-- Invites are created and claimed only through server code (chunk 1d).
-- Only a hash of the link token is stored.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  role public.member_role not null default 'worker',
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  claimed_at timestamptz,
  claimed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invites_business_id_idx on public.invites (business_id);
create index invites_phone_idx on public.invites (phone) where claimed_at is null;

-- Append-only record of sensitive actions (view-as, role changes, publishing).
create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)*$'),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_business_id_created_at_idx
  on public.audit_log (business_id, created_at desc);

-- updated_at bookkeeping.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();
create trigger businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();
create trigger business_modules_touch before update on public.business_modules
  for each row execute function public.touch_updated_at();

-- A profile for every new auth user, carrying the phone in E.164
-- (Supabase stores it without the leading +).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (
    new.id,
    case when coalesce(new.phone, '') = '' then null else '+' || ltrim(new.phone, '+') end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
