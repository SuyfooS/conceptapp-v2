-- Taking orders, part 2 of 2 (P1 of waiter mode, issue #191; the design of
-- 17 November 2026): the menu and the places in the database, with no screen
-- yet. The module is off in every template and every business, the demo
-- restaurant's included, so nothing here is read until a later phase
-- switches it on.
--
--   the menu       categories, each sending its items to a department (the
--                  business's own, 20261109000600_lists.sql), and items with
--                  their price in whole agorot, VAT included, as the business
--                  types it, an optional department of their own, "sold out",
--                  and up to five groups of choices (`option_groups`, checked
--                  by private.valid_option_groups, @domain/order-taking's
--                  twin). An item's choices add at most 1,000.00 ₪ however
--                  they are picked, so a line's unit price never passes
--                  11,000.00 ₪. Removing a category or an item archives it:
--                  the orders to come point at items, and the undo brings
--                  them back.
--   places         a business's tables, bar seats or rooms, saved whole like
--                  the departments.
--   who            those who run the menu hold order_taking.edit, a key of
--                  its own area, held by managers by default and switched per
--                  role from the start (owners always hold it). They save
--                  categories, items, places and imports, and mark anything
--                  sold out. Someone on the staff in the department an item
--                  goes to marks that item sold out too; an accountant never,
--                  even put in a department.
--   reading        every active staff member reads the menu and the places,
--                  and so does a view as a role on the staff, while the
--                  module is on (the tables' policies, and
--                  public.order_menu, which answers with nothing new when
--                  the version the phone holds is current). Accountants read
--                  none of it.
--   writes         server functions with the secret key, for `actor`, each
--                  refused while the module is off (42501, hint 'off'), each
--                  moving the business's menu version, and each but "sold
--                  out" with its row in the log (menu.*, read by those who
--                  run the menu: private.log_perm). An item's save names the
--                  version it read, and one behind it is refused (40001).
--   demo           the demo restaurant gets a sample menu and twelve tables
--                  (private.seed_demo_order_taking), now and with every
--                  reset, the module off. Nothing is reset here.
--
-- It replaces, from their latest versions and with only these changes:
-- private.settings_perm and private.log_perm
-- (20261115001000_roles_manage.sql's), with the new area; and
-- public.reset_demo_business (20261111000200_chat.sql's), with the sample
-- menu last. Each keeps its signature, so its grants stay; revoked and
-- granted again all the same.

------------------------------------------------------------------------------
-- 1. The module: off everywhere

-- A business made since 20261117000400_order_taking_module.sql gets its row
-- from apply_template; every one before, here.
insert into public.business_modules (business_id, module_key, enabled)
select b.id, 'order_taking'::public.module_key, false from public.businesses b
on conflict (business_id, module_key) do nothing;

------------------------------------------------------------------------------
-- 2. The area and its key

-- 20261115000700_roles_catalogue.sql's list, with taking orders.
alter table public.permission_keys
  drop constraint permission_keys_area_check,
  add constraint permission_keys_area_check check (
    area in (
      'scheduling', 'time_clock', 'lists', 'chat', 'order_taking', 'team', 'manage',
      'reservations', 'storefront'
    )
  );

-- Running the menu (modules/order_taking/manifest.ts;
-- modules/permissions.db.test.ts keeps the two the same): managers by
-- default, owners always, and settable in the same statement, as lists.fix
-- came (20261116000400_lists_fix_switch.sql): a key of the area that owners
-- couldn't switch would close the whole area on the roles screen (areaOpen
-- in @domain/role-access). Whatever reads the catalogue takes it by itself.
insert into public.permission_keys (key, module_key, area, default_roles, by_owner, requires, settable)
values (
  'order_taking.edit', 'order_taking', 'order_taking', '{manager}'::public.member_role[],
  false, null, true
);

-- 20261115001000_roles_manage.sql's, with taking orders' own edit for its
-- settings (it has none yet; P3 brings them). Its caller,
-- public.set_module_settings, is unchanged.
create or replace function private.settings_perm(module public.module_key)
returns text
language sql
stable
set search_path = ''
as $$
  select case module::text
    when 'scheduling' then 'schedule.edit'::text
    when 'time_clock' then 'clock.edit'::text
    when 'lists' then 'lists.manage'::text
    when 'chat' then 'chat.moderate'::text
    when 'order_taking' then 'order_taking.edit'::text
  end
$$;

-- 20261115001000_roles_manage.sql's, with the menu's rows (menu.*, and the
-- orders' to come, order.*) read by those who run the menu, besides
-- manage.view: without it they would show to nobody
-- (tooling/log-families.test.ts). The log's two policies call it, unchanged.
create or replace function private.log_perm(what text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when what ~ '^clock\.' then 'clock.edit'::text
    when what ~ '^(schedule|swap|availability)\.' then 'schedule.edit'::text
    when what ~ '^lists\.' then 'lists.manage'::text
    when what ~ '^(invite|member|team|profile)\.' then 'team.view'::text
    when what ~ '^chat\.' then 'chat.moderate'::text
    when what ~ '^(menu|order)\.' then 'order_taking.edit'::text
    when what ~ '^(module|business|departments|wording|role|permission|view_as)\.'
      then 'manage.view'::text
  end
$$;

------------------------------------------------------------------------------
-- 3. An item's choices

-- Whether `groups` is an item's choices as the app keeps them
-- (`optionGroups` in @domain/order-taking, its twin, tested at the same
-- edges): a list of at most 5 groups, each id once; each group
-- {id, name, min, max, options}, its id a key, its name 1 to 40 characters
-- with no space at either end, 0 <= min <= max <= its options, max at least
-- 1, and 1 to 12 options, each {id, name, priceAgorot}, each id once in the
-- group, the name as a group's, the price a whole number of agorot from 0 to
-- 100,000. And every group's `max` most expensive options, together, at most
-- 100,000: the most the choices can add, however they are picked. False for
-- anything else, never an error, since a check on menu_items calls it.
create function private.valid_option_groups(groups jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  group_entry jsonb;
  option_entry jsonb;
  option_count integer;
  least_picks numeric;
  most_picks numeric;
  option_agorot numeric;
  most_added numeric := 0;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(groups) > 5 then
    return false;
  end if;

  for group_entry in select g.value from jsonb_array_elements(groups) as g (value)
  loop
    if jsonb_typeof(group_entry) <> 'object' then
      return false;
    end if;
    if (select count(*) from jsonb_object_keys(group_entry) as k (field)) <> 5
      or not (group_entry ?& array['id', 'name', 'min', 'max', 'options'])
    then
      return false;
    end if;
    if jsonb_typeof(group_entry -> 'id') <> 'string'
      or jsonb_typeof(group_entry -> 'name') <> 'string'
      or jsonb_typeof(group_entry -> 'min') <> 'number'
      or jsonb_typeof(group_entry -> 'max') <> 'number'
      or jsonb_typeof(group_entry -> 'options') <> 'array'
    then
      return false;
    end if;
    if (group_entry ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
      or char_length(group_entry ->> 'name') not between 1 and 40
      or (group_entry ->> 'name') <> btrim(group_entry ->> 'name')
    then
      return false;
    end if;

    option_count := jsonb_array_length(group_entry -> 'options');
    least_picks := (group_entry ->> 'min')::numeric;
    most_picks := (group_entry ->> 'max')::numeric;
    if option_count not between 1 and 12
      or least_picks <> trunc(least_picks)
      or most_picks <> trunc(most_picks)
      or least_picks < 0
      or most_picks < 1
      or least_picks > most_picks
      or most_picks > option_count
    then
      return false;
    end if;

    for option_entry in
      select o.value from jsonb_array_elements(group_entry -> 'options') as o (value)
    loop
      if jsonb_typeof(option_entry) <> 'object' then
        return false;
      end if;
      if (select count(*) from jsonb_object_keys(option_entry) as k (field)) <> 3
        or not (option_entry ?& array['id', 'name', 'priceAgorot'])
      then
        return false;
      end if;
      if jsonb_typeof(option_entry -> 'id') <> 'string'
        or jsonb_typeof(option_entry -> 'name') <> 'string'
        or jsonb_typeof(option_entry -> 'priceAgorot') <> 'number'
      then
        return false;
      end if;
      if (option_entry ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
        or char_length(option_entry ->> 'name') not between 1 and 40
        or (option_entry ->> 'name') <> btrim(option_entry ->> 'name')
      then
        return false;
      end if;
      option_agorot := (option_entry ->> 'priceAgorot')::numeric;
      if option_agorot <> trunc(option_agorot) or option_agorot not between 0 and 100000 then
        return false;
      end if;
    end loop;

    if (
      select count(distinct o.value ->> 'id')
      from jsonb_array_elements(group_entry -> 'options') as o (value)
    ) <> option_count then
      return false;
    end if;

    -- What this group can add at most: its `max` most expensive options.
    most_added := most_added + (
      select coalesce(sum(top.agorot), 0)
      from (
        select (o.value ->> 'priceAgorot')::numeric as agorot
        from jsonb_array_elements(group_entry -> 'options') as o (value)
        order by 1 desc
        limit most_picks::integer
      ) top
    );
  end loop;

  if (
    select count(distinct g.value ->> 'id') from jsonb_array_elements(groups) as g (value)
  ) <> jsonb_array_length(groups) then
    return false;
  end if;
  return most_added <= 100000;
end;
$$;

-- A line's unit price in agorot: the item's own, `item_agorot`, and each
-- option picked (`picks`, a list of {group, option}) of its groups; null
-- when the picks don't fit them: an option the item doesn't have, one picked
-- twice, or a group picked fewer than its min or more than its max times.
-- `unitAgorot` in @domain/order-taking computes the same
-- (modules/order_taking/unit-price.db.test.ts). The orders' send (P3) asks
-- it; nothing does yet.
create function private.unit_agorot(item_agorot integer, groups jsonb, picks jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  pick jsonb;
  picked jsonb;
  total numeric := item_agorot;
begin
  if item_agorot is null or not private.valid_option_groups(groups)
    or picks is null or jsonb_typeof(picks) <> 'array'
  then
    return null;
  end if;

  for pick in select p.value from jsonb_array_elements(picks) as p (value)
  loop
    if jsonb_typeof(pick) <> 'object'
      or jsonb_typeof(pick -> 'group') is distinct from 'string'
      or jsonb_typeof(pick -> 'option') is distinct from 'string'
    then
      return null;
    end if;
    picked := null;
    select o.value into picked
    from jsonb_array_elements(groups) as g (value)
    cross join lateral jsonb_array_elements(g.value -> 'options') as o (value)
    where g.value ->> 'id' = pick ->> 'group'
      and o.value ->> 'id' = pick ->> 'option';
    if picked is null then
      return null;
    end if;
    total := total + (picked ->> 'priceAgorot')::numeric;
  end loop;

  if (
    select count(*)
    from (
      select distinct p.value ->> 'group' as group_id, p.value ->> 'option' as option_id
      from jsonb_array_elements(picks) as p (value)
    ) once
  ) <> jsonb_array_length(picks) then
    return null;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(groups) as g (value)
    where (
      select count(*)
      from jsonb_array_elements(picks) as p (value)
      where p.value ->> 'group' = g.value ->> 'id'
    ) not between (g.value ->> 'min')::numeric and (g.value ->> 'max')::numeric
  ) then
    return null;
  end if;
  return total::integer;
end;
$$;

------------------------------------------------------------------------------
-- 4. Places, categories and items

-- A business's places: its tables, its seats at the bar, its rooms, named as
-- it names them ("12", "בר 3", "חדר 204"). Removed ones are archived: the
-- orders to come keep their name, and saving them again brings them back.
create table public.order_places (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20 and name = btrim(name)),
  position smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create unique index order_places_name_idx
  on public.order_places (business_id, lower(name)) where archived_at is null;
create index order_places_business_idx on public.order_places (business_id, position);

-- The menu's categories, each sending its items to a department.
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  department_id uuid not null,
  position smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  -- A department is archived, never deleted, so this only refuses a stray
  -- delete. Checked at commit, as the lists' are: when a business goes (the
  -- demo reset), its departments and the categories that name them go in one
  -- statement by different paths.
  foreign key (department_id, business_id)
    references public.departments (id, business_id) deferrable initially deferred
);

create unique index menu_categories_name_idx
  on public.menu_categories (business_id, lower(name)) where archived_at is null;
create index menu_categories_business_idx on public.menu_categories (business_id, position);
create index menu_categories_department_idx
  on public.menu_categories (department_id, business_id);

-- The menu's items. Every write goes through the functions below, which run
-- as their owner, so the check on `option_groups` runs as its owner too.
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid not null,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  description text
    check (char_length(description) between 1 and 200 and description = btrim(description)),
  -- Whole agorot, VAT included, as the business types it: up to 10,000.00 ₪.
  price_agorot integer not null check (price_agorot between 0 and 1000000),
  -- Its own department; null goes where its category does.
  department_id uuid,
  -- "Sold out": who changed it last and when. No log row: it changes often,
  -- and back.
  available boolean not null default true,
  available_changed_at timestamptz,
  available_by uuid references public.profiles (id) on delete set null,
  -- A station that changed it (P8); no key until stations show menus.
  available_station uuid,
  option_groups jsonb not null default '[]'::jsonb
    check (private.valid_option_groups(option_groups)),
  position smallint not null default 0,
  archived_at timestamptz,
  -- Saves pass the version they read, and are refused (40001) when it moved.
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  -- Archived, never deleted, as the categories' department: checked at commit.
  foreign key (category_id, business_id)
    references public.menu_categories (id, business_id) deferrable initially deferred,
  foreign key (department_id, business_id)
    references public.departments (id, business_id) deferrable initially deferred
);

create index menu_items_business_idx on public.menu_items (business_id);
create index menu_items_category_idx on public.menu_items (category_id, business_id, position);
create index menu_items_department_idx on public.menu_items (department_id, business_id);
create index menu_items_available_by_idx on public.menu_items (available_by);
create index menu_items_created_by_idx on public.menu_items (created_by);
create index menu_items_updated_by_idx on public.menu_items (updated_by);

-- When each business's menu last changed: a number that only grows, read by
-- public.order_menu so a phone holding it gets nothing new. It is the moment
-- in microseconds, or one more than before when that is later, so it never
-- comes back to a number a phone holds, even after a demo reset, which
-- deletes the row with the business.
create table private.menu_versions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  version bigint not null
);

alter table public.order_places enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table private.menu_versions enable row level security;

-- Every write goes through the functions below, with the secret key.
revoke all on public.order_places, public.menu_categories, public.menu_items
  from anon, authenticated;
grant select on public.order_places, public.menu_categories, public.menu_items
  to authenticated;
revoke all on private.menu_versions from public, anon, authenticated, service_role;

comment on table public.order_places is
  'A business''s places orders are taken for: tables, bar seats, rooms. Archived when removed. Written by public.set_order_places and the demo''s seed; read by the staff while taking orders is on.';
comment on table public.menu_categories is
  'The menu''s categories, each sending its items to a department. Archived when removed. Written by public.set_menu_categories, public.import_menu and the demo''s seed; read by the staff while taking orders is on.';
comment on table public.menu_items is
  'The menu''s items: price in agorot, VAT included; an optional department of their own; sold out; up to five groups of choices (private.valid_option_groups). Archived when removed. Written by public.save_menu_item, archive_menu_item, restore_menu_item, set_menu_item_available, import_menu and the demo''s seed; read by the staff while taking orders is on.';
comment on table private.menu_versions is
  'Each business''s menu version, moved by every write to its menu and places (private.bump_menu_version), for public.order_menu.';

------------------------------------------------------------------------------
-- 5. Who may do what

-- Taking orders is on for the business.
create function private.order_taking_on(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.module_enabled(business, 'order_taking'::public.module_key)
$$;

-- `person` runs the business's menu: they hold order_taking.edit
-- (private.holds_perm: an active owner always; on the staff, by their role's
-- rule for it or by a grant of their own).
create function private.runs_orders(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'order_taking.edit'::text)
$$;

-- Where an item's lines go: its own department, else its category's, while
-- that department is live; null when it goes nowhere.
create function private.line_route(item uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.menu_items i
  join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
  join public.departments d
    on d.id = coalesce(i.department_id, c.department_id)
    and d.business_id = i.business_id
    and d.archived_at is null
  where i.id = item
$$;

-- Moves the business's menu version (private.menu_versions). Every write to
-- the menu and the places calls it last.
create function private.bump_menu_version(business uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.menu_versions as v (business_id, version)
  values (business, (extract(epoch from clock_timestamp()) * 1000000)::bigint)
  on conflict (business_id) do update
  set version = greatest(v.version + 1, excluded.version)
$$;

------------------------------------------------------------------------------
-- 6. Reading

-- The menu and the places are no secret on the staff: everyone on it reads
-- them, and so does a view as a role on it, while the module is on. An
-- accountant is off the staff and reads none of it.
create policy "the staff read the places while taking orders is on"
  on public.order_places for select to authenticated
  using (
    private.order_taking_on(business_id)
    and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id))
  );

create policy "the staff read the menu's categories while taking orders is on"
  on public.menu_categories for select to authenticated
  using (
    private.order_taking_on(business_id)
    and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id))
  );

create policy "the staff read the menu's items while taking orders is on"
  on public.menu_items for select to authenticated
  using (
    private.order_taking_on(business_id)
    and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id))
  );

-- The menu of `business` as the phones show it, for the signed-in person on
-- its staff or a view as a role on it, while the module is on (P0002 for
-- anyone else, and while it is off): its version, then its live categories,
-- items and places in their order, each item with where its lines go
-- (private.line_route) and whether it is sold out. An item of a removed
-- category is left out with it. Null when `known_version` is the menu's
-- version now, so a poll that finds nothing new reads one row.
create function public.order_menu(business uuid, known_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_version bigint;
begin
  if not (
    private.order_taking_on(business)
    and (private.is_staff_member(business) or private.is_viewing_staff(business))
  ) then
    raise exception 'Unknown menu' using errcode = 'P0002';
  end if;

  select v.version into current_version
  from private.menu_versions v
  where v.business_id = business;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;

  return jsonb_build_object(
    'version', current_version,
    'categories', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', c.id, 'name', c.name, 'department', c.department_id)
        order by c.position, c.created_at, c.id
      ), '[]'::jsonb)
      from public.menu_categories c
      where c.business_id = business and c.archived_at is null
    ),
    'items', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'category', i.category_id,
          'name', i.name,
          'description', i.description,
          'priceAgorot', i.price_agorot,
          'department', i.department_id,
          -- As private.line_route has it, in the same query.
          'route', d.id,
          'available', i.available,
          'optionGroups', i.option_groups,
          'version', i.version
        )
        order by c.position, c.created_at, c.id, i.position, i.created_at, i.id
      ), '[]'::jsonb)
      from public.menu_items i
      join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
      left join public.departments d
        on d.id = coalesce(i.department_id, c.department_id)
        and d.business_id = i.business_id
        and d.archived_at is null
      where i.business_id = business
        and i.archived_at is null
        and c.archived_at is null
    ),
    'places', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.name)
        order by p.position, p.created_at, p.id
      ), '[]'::jsonb)
      from public.order_places p
      where p.business_id = business and p.archived_at is null
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- 7. Writing the menu

-- Saves the business's categories, in order (`categories`: a list of
-- {id?, name, department}), as the departments are saved: one left out is
-- removed (archived), a removed one that comes back by its id is restored
-- (the undo), one with no id is added. 42501 for anyone who doesn't run the
-- menu, and while the module is off (hint 'off'); 54000 past 30; 22023 for a
-- department that isn't live in the business (hint 'route') or any other
-- shape; 23505 for a name twice; P0002 for an id that isn't the business's.
-- Logged as menu.categories with counts, when anything changed. Returns the
-- categories' ids, in order.
create function public.set_menu_categories(
  actor uuid,
  business uuid,
  categories jsonb,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_name text;
  entry_department uuid;
  place integer := 0;
  ids uuid[] := '{}'::uuid[];
  before_live jsonb;
  added integer := 0;
  restored integer;
  archived integer;
  changed integer;
begin
  if not private.runs_orders(business, actor) then
    raise exception 'Those who run the menu only' using errcode = '42501';
  end if;
  perform 1 from public.businesses b where b.id = business for no key update;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;

  if jsonb_typeof(categories) is distinct from 'array' then
    raise exception 'Categories must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(categories) > 30 then
    raise exception 'A menu has at most 30 categories' using errcode = '54000';
  end if;
  for entry in select e.value from jsonb_array_elements(categories) as e (value)
  loop
    if jsonb_typeof(entry) <> 'object' then
      raise exception 'A category must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(entry) as k (field)
      where k.field not in ('id', 'name', 'department')
    ) then
      raise exception 'A category has an id, a name and a department' using errcode = '22023';
    end if;
    if private.json_text(entry -> 'name', 40, 'A category''s name') is null then
      raise exception 'A category needs a name' using errcode = '22023';
    end if;
    entry_department := private.json_uuid(entry -> 'department', 'A category''s department');
    if entry_department is null or not exists (
      select 1 from public.departments d
      where d.id = entry_department and d.business_id = business and d.archived_at is null
    ) then
      raise exception 'A category goes to a department of the business'
        using errcode = '22023', hint = 'route';
    end if;
    entry_id := private.json_uuid(entry -> 'id', 'A category');
    if entry_id is not null and not exists (
      select 1 from public.menu_categories c
      where c.id = entry_id and c.business_id = business
    ) then
      raise exception 'Unknown category' using errcode = 'P0002';
    end if;
  end loop;
  if (
    select count(distinct e.value ->> 'id')
    from jsonb_array_elements(categories) as e (value)
    where e.value ? 'id' and jsonb_typeof(e.value -> 'id') <> 'null'
  ) <> (
    select count(*)
    from jsonb_array_elements(categories) as e (value)
    where e.value ? 'id' and jsonb_typeof(e.value -> 'id') <> 'null'
  ) then
    raise exception 'Each category once' using errcode = '22023';
  end if;
  if (
    select count(distinct lower(btrim(e.value ->> 'name')))
    from jsonb_array_elements(categories) as e (value)
  ) <> jsonb_array_length(categories) then
    raise exception 'Each category''s name once' using errcode = '23505';
  end if;

  -- What was live, each with its place among them, to count what changed.
  select coalesce(jsonb_object_agg(
      live.id::text,
      jsonb_build_object('name', live.name, 'department', live.department_id, 'position', live.ordinal)
    ), '{}'::jsonb)
  into before_live
  from (
    select c.id, c.name, c.department_id,
      (row_number() over (order by c.position, c.created_at, c.id) - 1)::integer as ordinal
    from public.menu_categories c
    where c.business_id = business and c.archived_at is null
  ) live;

  -- Everything live is archived first, so names can move between categories
  -- in one save; what stays is restored with its new name and place.
  update public.menu_categories c
  set archived_at = at_time
  where c.business_id = business and c.archived_at is null;

  for entry in select e.value from jsonb_array_elements(categories) as e (value)
  loop
    entry_id := private.json_uuid(entry -> 'id', 'A category');
    entry_name := private.json_text(entry -> 'name', 40, 'A category''s name');
    entry_department := private.json_uuid(entry -> 'department', 'A category''s department');
    if entry_id is null then
      insert into public.menu_categories (business_id, name, department_id, position, created_at)
      values (business, entry_name, entry_department, place::smallint, at_time)
      returning id into entry_id;
      added := added + 1;
    else
      update public.menu_categories c
      set name = entry_name,
        department_id = entry_department,
        position = place::smallint,
        archived_at = null
      where c.id = entry_id and c.business_id = business;
    end if;
    ids := ids || entry_id;
    place := place + 1;
  end loop;

  select count(*)::integer into restored
  from unnest(ids) as kept (id)
  where not (before_live ? kept.id::text);
  restored := restored - added;
  select count(*)::integer into archived
  from jsonb_object_keys(before_live) as was (id)
  where not (was.id::uuid = any (ids));
  select count(*)::integer into changed
  from public.menu_categories c
  where c.id = any (ids)
    and before_live ? c.id::text
    and (before_live -> c.id::text) is distinct from jsonb_build_object(
      'name', c.name, 'department', c.department_id, 'position', c.position::integer
    );

  if added + restored + archived + changed > 0 then
    perform private.bump_menu_version(business);
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      business, actor, 'menu.categories',
      jsonb_build_object(
        'added', added, 'restored', restored, 'archived', archived, 'changed', changed,
        'total', cardinality(ids)
      ),
      at_time
    );
  end if;
  return to_jsonb(ids);
end;
$$;

-- Adds an item (`item` with no id) or saves one (`item` with its id, and the
-- version the screen read, `known_version`): {id?, category, name,
-- description?, priceAgorot, department?, optionGroups?, position?}. 42501
-- for anyone who doesn't run the menu, and while the module is off (hint
-- 'off'); 22023 for a category that isn't live in the business (hint
-- 'category'), a department that isn't (hint 'route'), choices that don't
-- hold (hint 'choices'), or any other shape; 54000 for a 301st live item;
-- P0002 for an id that isn't the business's; 55000 for a removed one (hint
-- 'archived'); 40001 when it changed since `known_version`. A new item goes
-- last in its category, and so does one moved to another. The same values
-- again change nothing. Logged as menu.item.save with what changed, the
-- price before and after when it moved, and each option whose price moved.
-- Returns {id, version}.
create function public.save_menu_item(
  actor uuid,
  business uuid,
  item jsonb,
  known_version integer default null,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  was public.menu_items%rowtype;
  saved public.menu_items%rowtype;
  item_id uuid;
  new_category uuid;
  new_name text;
  new_description text;
  new_price integer;
  new_department uuid;
  new_groups jsonb;
  new_place integer;
  fields text[];
  option_moves jsonb;
begin
  if not private.runs_orders(business, actor) then
    raise exception 'Those who run the menu only' using errcode = '42501';
  end if;
  perform 1 from public.businesses b where b.id = business for no key update;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;

  if jsonb_typeof(item) is distinct from 'object' then
    raise exception 'An item must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(item) as k (field)
    where k.field not in (
      'id', 'category', 'name', 'description', 'priceAgorot', 'department', 'optionGroups',
      'position'
    )
  ) then
    raise exception 'An item has a category, a name, a description, a price, a department, choices and a place'
      using errcode = '22023';
  end if;
  item_id := private.json_uuid(item -> 'id', 'The item');
  new_name := private.json_text(item -> 'name', 60, 'The name');
  if new_name is null then
    raise exception 'An item needs a name' using errcode = '22023';
  end if;
  new_description := private.json_text(item -> 'description', 200, 'The description');
  new_price := private.json_int(item -> 'priceAgorot', 0, 1000000, 'The price');
  if new_price is null then
    raise exception 'An item needs a price' using errcode = '22023';
  end if;
  new_category := private.json_uuid(item -> 'category', 'The category');
  if new_category is null or not exists (
    select 1 from public.menu_categories c
    where c.id = new_category and c.business_id = business and c.archived_at is null
  ) then
    raise exception 'An item goes in a category of the menu'
      using errcode = '22023', hint = 'category';
  end if;
  new_department := private.json_uuid(item -> 'department', 'The department');
  if new_department is not null and not exists (
    select 1 from public.departments d
    where d.id = new_department and d.business_id = business and d.archived_at is null
  ) then
    raise exception 'An item goes to a department of the business'
      using errcode = '22023', hint = 'route';
  end if;
  new_groups := coalesce(item -> 'optionGroups', '[]'::jsonb);
  if jsonb_typeof(new_groups) = 'null' then
    new_groups := '[]'::jsonb;
  end if;
  if not private.valid_option_groups(new_groups) then
    raise exception 'Not choices the menu keeps' using errcode = '22023', hint = 'choices';
  end if;
  new_place := private.json_int(item -> 'position', 0, 999, 'The place');

  if item_id is null then
    if (
      select count(*) from public.menu_items i
      where i.business_id = business and i.archived_at is null
    ) >= 300 then
      raise exception 'A menu has at most 300 items' using errcode = '54000';
    end if;
    insert into public.menu_items (
      business_id, category_id, name, description, price_agorot, department_id,
      option_groups, position, created_by, created_at, updated_by, updated_at
    )
    values (
      business, new_category, new_name, new_description, new_price, new_department,
      new_groups,
      coalesce(new_place, (
        select coalesce(max(i.position) + 1, 0) from public.menu_items i
        where i.category_id = new_category and i.archived_at is null
      ))::smallint,
      actor, at_time, actor, at_time
    )
    returning * into saved;

    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      business, actor, 'menu.item.save',
      jsonb_build_object(
        'item', saved.id,
        'name', saved.name,
        'created', true,
        'changed', '[]'::jsonb,
        'price', jsonb_build_object('before', null, 'after', saved.price_agorot)
      ),
      at_time
    );
  else
    select i.* into was
    from public.menu_items i
    where i.id = item_id and i.business_id = business
    for update;
    if not found then
      raise exception 'Unknown item' using errcode = 'P0002';
    end if;
    if was.archived_at is not null then
      raise exception 'A removed item is restored first' using errcode = '55000', hint = 'archived';
    end if;
    if known_version is null then
      raise exception 'A save names the version it read' using errcode = '22023';
    end if;
    if was.version <> known_version then
      raise exception 'The item changed since it was read' using errcode = '40001';
    end if;

    fields := array_remove(array[
      case when new_name is distinct from was.name then 'name' end,
      case when new_description is distinct from was.description then 'description' end,
      case when new_price is distinct from was.price_agorot then 'price' end,
      case when new_category is distinct from was.category_id then 'category' end,
      case when new_department is distinct from was.department_id then 'department' end,
      case when new_groups is distinct from was.option_groups then 'options' end,
      case when new_place is not null and new_place is distinct from was.position::integer
        then 'position' end
    ]::text[], null);
    -- The same values again: nothing to save, and the version stays.
    if cardinality(fields) = 0 then
      return jsonb_build_object('id', was.id, 'version', was.version);
    end if;

    update public.menu_items i
    set name = new_name,
      description = new_description,
      price_agorot = new_price,
      category_id = new_category,
      department_id = new_department,
      option_groups = new_groups,
      position = case
        when new_place is not null then new_place::smallint
        when new_category is distinct from was.category_id then (
          select coalesce(max(o.position) + 1, 0) from public.menu_items o
          where o.category_id = new_category and o.archived_at is null
        )::smallint
        else was.position
      end,
      version = was.version + 1,
      updated_by = actor,
      updated_at = at_time
    where i.id = was.id
    returning i.* into saved;

    -- Each option whose price moved, by its group's and its own ids, named
    -- as it is now (or was, for one removed): none before is null, none
    -- after is null.
    select coalesce(jsonb_agg(
        jsonb_build_object(
          'group', coalesce(n.group_name, o.group_name),
          'option', coalesce(n.option_name, o.option_name),
          'before', o.agorot,
          'after', n.agorot
        )
        order by coalesce(n.group_place, o.group_place), coalesce(n.option_place, o.option_place)
      ), '[]'::jsonb)
    into option_moves
    from (
      select g.value ->> 'id' as group_id, g.value ->> 'name' as group_name, g.ordinality as group_place,
        x.value ->> 'id' as option_id, x.value ->> 'name' as option_name, x.ordinality as option_place,
        (x.value ->> 'priceAgorot')::numeric::integer as agorot
      from jsonb_array_elements(was.option_groups) with ordinality as g (value, ordinality)
      cross join lateral jsonb_array_elements(g.value -> 'options') with ordinality as x (value, ordinality)
    ) o
    full join (
      select g.value ->> 'id' as group_id, g.value ->> 'name' as group_name, g.ordinality as group_place,
        x.value ->> 'id' as option_id, x.value ->> 'name' as option_name, x.ordinality as option_place,
        (x.value ->> 'priceAgorot')::numeric::integer as agorot
      from jsonb_array_elements(saved.option_groups) with ordinality as g (value, ordinality)
      cross join lateral jsonb_array_elements(g.value -> 'options') with ordinality as x (value, ordinality)
    ) n on n.group_id = o.group_id and n.option_id = o.option_id
    where o.agorot is distinct from n.agorot;

    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      business, actor, 'menu.item.save',
      jsonb_build_object(
        'item', saved.id,
        'name', saved.name,
        'created', false,
        'changed', to_jsonb(fields)
      )
      || (
        case
          when saved.price_agorot is distinct from was.price_agorot then jsonb_build_object(
            'price', jsonb_build_object('before', was.price_agorot, 'after', saved.price_agorot)
          )
          else '{}'::jsonb
        end
      )
      || (
        case
          when jsonb_array_length(option_moves) > 0 then jsonb_build_object('options', option_moves)
          else '{}'::jsonb
        end
      ),
      at_time
    );
  end if;

  perform private.bump_menu_version(business);
  return jsonb_build_object('id', saved.id, 'version', saved.version);
end;
$$;

-- Removes an item from the menu (archived; the undo is
-- public.restore_menu_item). 42501 for anyone who doesn't run the menu, and
-- while the module is off (hint 'off'); P0002 for an id that isn't the
-- business's. One already removed is left as it is. Logged as
-- menu.item.archive with its id and name.
create function public.archive_menu_item(
  actor uuid,
  business uuid,
  item uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  was public.menu_items%rowtype;
begin
  if not private.runs_orders(business, actor) then
    raise exception 'Those who run the menu only' using errcode = '42501';
  end if;
  perform 1 from public.businesses b where b.id = business for no key update;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;
  select i.* into was
  from public.menu_items i
  where i.id = item and i.business_id = business
  for update;
  if not found then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  if was.archived_at is not null then
    return;
  end if;

  update public.menu_items i
  set archived_at = at_time, version = was.version + 1, updated_by = actor, updated_at = at_time
  where i.id = was.id;
  perform private.bump_menu_version(business);
  insert into public.audit_log (business_id, actor_id, action, details, created_at)
  values (
    business, actor, 'menu.item.archive',
    jsonb_build_object('item', was.id, 'name', was.name),
    at_time
  );
end;
$$;

-- Brings a removed item back: the undo. As public.archive_menu_item, and
-- 55000 while its category is removed (hint 'category'), 54000 for a 301st
-- live item. One that is live is left as it is. Logged as menu.item.restore.
create function public.restore_menu_item(
  actor uuid,
  business uuid,
  item uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  was public.menu_items%rowtype;
begin
  if not private.runs_orders(business, actor) then
    raise exception 'Those who run the menu only' using errcode = '42501';
  end if;
  perform 1 from public.businesses b where b.id = business for no key update;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;
  select i.* into was
  from public.menu_items i
  where i.id = item and i.business_id = business
  for update;
  if not found then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  if was.archived_at is null then
    return;
  end if;
  if not exists (
    select 1 from public.menu_categories c
    where c.id = was.category_id and c.business_id = business and c.archived_at is null
  ) then
    raise exception 'Its category is removed' using errcode = '55000', hint = 'category';
  end if;
  if (
    select count(*) from public.menu_items i
    where i.business_id = business and i.archived_at is null
  ) >= 300 then
    raise exception 'A menu has at most 300 items' using errcode = '54000';
  end if;

  update public.menu_items i
  set archived_at = null, version = was.version + 1, updated_by = actor, updated_at = at_time
  where i.id = was.id;
  perform private.bump_menu_version(business);
  insert into public.audit_log (business_id, actor_id, action, details, created_at)
  values (
    business, actor, 'menu.item.restore',
    jsonb_build_object('item', was.id, 'name', was.name),
    at_time
  );
end;
$$;

-- Marks an item sold out (`is_available` false) or back. Someone who runs
-- the menu marks any item; someone on the staff in the department the item
-- goes to (private.line_route, private.in_department) marks it too, and an
-- accountant never, even put in a department. P0002 for anyone not an
-- active member and for an id that isn't the business's; 42501 while the
-- module is off (hint 'off') and for anyone else; 55000 for a removed item
-- (hint 'archived'). Kept on the item, who and when, with no log row: it
-- changes often, and back. The same again changes nothing.
create function public.set_menu_item_available(
  actor uuid,
  business uuid,
  item uuid,
  is_available boolean,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  was public.menu_items%rowtype;
begin
  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;
  if not found then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;
  select i.* into was
  from public.menu_items i
  where i.id = item and i.business_id = business
  for update;
  if not found then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  if not (
    private.runs_orders(business, actor)
    or (
      private.is_staff_role(actor_role)
      and private.in_department(private.line_route(was.id), actor)
    )
  ) then
    raise exception 'Those who run the menu and the item''s department only'
      using errcode = '42501';
  end if;
  if was.archived_at is not null then
    raise exception 'A removed item is restored first' using errcode = '55000', hint = 'archived';
  end if;
  if is_available is null then
    raise exception 'Sold out or not' using errcode = '22023';
  end if;
  if was.available = is_available then
    return;
  end if;

  update public.menu_items i
  set available = is_available,
    available_changed_at = at_time,
    available_by = actor,
    available_station = null
  where i.id = was.id;
  perform private.bump_menu_version(business);
end;
$$;

-- Writes a pasted menu in one go (@domain/menu-import): `rows` is a list, in
-- order, of {category: {name, department}} and {item: {name, priceAgorot,
-- description?, optionGroups?}}, each item in the category above it. A
-- category the business has by that name (case aside) takes the items after
-- it, wherever it goes; a new one goes last, to its department. Every row is
-- checked as its own save checks it, and any one refused refuses them all:
-- nothing is written. 42501 for anyone who doesn't run the menu, and while
-- the module is off (hint 'off'); 22023 for a department that isn't live
-- (hint 'route'), choices that don't hold (hint 'choices') or any other
-- shape; 54000 past 30 categories or 300 items. Logged as menu.import with
-- the counts. Returns {categories, items}: how many it added.
create function public.import_menu(
  actor uuid,
  business uuid,
  rows jsonb,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  body jsonb;
  current_category uuid;
  category_name text;
  category_department uuid;
  category_place integer;
  item_place integer;
  item_groups jsonb;
  item_price integer;
  item_name text;
  new_categories integer := 0;
  new_items integer := 0;
begin
  if not private.runs_orders(business, actor) then
    raise exception 'Those who run the menu only' using errcode = '42501';
  end if;
  perform 1 from public.businesses b where b.id = business for no key update;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;

  if jsonb_typeof(rows) is distinct from 'array' then
    raise exception 'An import must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(rows) > 330 then
    raise exception 'A menu has at most 30 categories and 300 items' using errcode = '54000';
  end if;

  select coalesce(max(c.position) + 1, 0) into category_place
  from public.menu_categories c
  where c.business_id = business and c.archived_at is null;

  for entry in select e.value from jsonb_array_elements(rows) as e (value)
  loop
    if jsonb_typeof(entry) <> 'object' then
      raise exception 'A row must be an object' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(entry) as k (field)) <> 1 then
      raise exception 'A row is a category or an item' using errcode = '22023';
    end if;

    if entry ? 'category' then
      body := entry -> 'category';
      if jsonb_typeof(body) <> 'object' then
        raise exception 'A category must be an object' using errcode = '22023';
      end if;
      if exists (
        select 1 from jsonb_object_keys(body) as k (field)
        where k.field not in ('name', 'department')
      ) then
        raise exception 'A category has a name and a department' using errcode = '22023';
      end if;
      category_name := private.json_text(body -> 'name', 40, 'A category''s name');
      if category_name is null then
        raise exception 'A category needs a name' using errcode = '22023';
      end if;
      current_category := null;
      select c.id into current_category
      from public.menu_categories c
      where c.business_id = business
        and c.archived_at is null
        and lower(c.name) = lower(category_name);
      if current_category is null then
        category_department := private.json_uuid(body -> 'department', 'A category''s department');
        if category_department is null or not exists (
          select 1 from public.departments d
          where d.id = category_department and d.business_id = business and d.archived_at is null
        ) then
          raise exception 'A category goes to a department of the business'
            using errcode = '22023', hint = 'route';
        end if;
        insert into public.menu_categories (business_id, name, department_id, position, created_at)
        values (business, category_name, category_department, category_place::smallint, at_time)
        returning id into current_category;
        category_place := category_place + 1;
        new_categories := new_categories + 1;
      end if;
      select coalesce(max(i.position) + 1, 0) into item_place
      from public.menu_items i
      where i.category_id = current_category and i.archived_at is null;

    elsif entry ? 'item' then
      if current_category is null then
        raise exception 'An item comes after its category' using errcode = '22023';
      end if;
      body := entry -> 'item';
      if jsonb_typeof(body) <> 'object' then
        raise exception 'An item must be an object' using errcode = '22023';
      end if;
      if exists (
        select 1 from jsonb_object_keys(body) as k (field)
        where k.field not in ('name', 'priceAgorot', 'description', 'optionGroups')
      ) then
        raise exception 'An item has a name, a price, a description and choices' using errcode = '22023';
      end if;
      item_name := private.json_text(body -> 'name', 60, 'The name');
      if item_name is null then
        raise exception 'An item needs a name' using errcode = '22023';
      end if;
      item_price := private.json_int(body -> 'priceAgorot', 0, 1000000, 'The price');
      if item_price is null then
        raise exception 'An item needs a price' using errcode = '22023';
      end if;
      item_groups := coalesce(body -> 'optionGroups', '[]'::jsonb);
      if jsonb_typeof(item_groups) = 'null' then
        item_groups := '[]'::jsonb;
      end if;
      if not private.valid_option_groups(item_groups) then
        raise exception 'Not choices the menu keeps' using errcode = '22023', hint = 'choices';
      end if;
      insert into public.menu_items (
        business_id, category_id, name, description, price_agorot, option_groups, position,
        created_by, created_at, updated_by, updated_at
      )
      values (
        business, current_category, item_name,
        private.json_text(body -> 'description', 200, 'The description'),
        item_price, item_groups, item_place::smallint, actor, at_time, actor, at_time
      );
      item_place := item_place + 1;
      new_items := new_items + 1;

    else
      raise exception 'A row is a category or an item' using errcode = '22023';
    end if;
  end loop;

  if (
    select count(*) from public.menu_categories c
    where c.business_id = business and c.archived_at is null
  ) > 30 then
    raise exception 'A menu has at most 30 categories' using errcode = '54000';
  end if;
  if (
    select count(*) from public.menu_items i
    where i.business_id = business and i.archived_at is null
  ) > 300 then
    raise exception 'A menu has at most 300 items' using errcode = '54000';
  end if;

  if new_categories + new_items > 0 then
    perform private.bump_menu_version(business);
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      business, actor, 'menu.import',
      jsonb_build_object('categories', new_categories, 'items', new_items),
      at_time
    );
  end if;
  return jsonb_build_object('categories', new_categories, 'items', new_items);
end;
$$;

------------------------------------------------------------------------------
-- 8. Writing the places

-- Saves the business's places, in order (`places`: a list of {id?, name}),
-- as the categories are saved: one left out is removed (archived), a removed
-- one that comes back by its id is restored, one with no id is added. 42501
-- for anyone who doesn't run the menu, and while the module is off (hint
-- 'off'); 54000 past 60; 23505 for a name twice; 22023 for any other shape;
-- P0002 for an id that isn't the business's. Logged as menu.places with
-- counts, when anything changed. Returns the places' ids, in order.
create function public.set_order_places(
  actor uuid,
  business uuid,
  places jsonb,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_name text;
  place integer := 0;
  ids uuid[] := '{}'::uuid[];
  before_live jsonb;
  added integer := 0;
  restored integer;
  archived integer;
  changed integer;
begin
  if not private.runs_orders(business, actor) then
    raise exception 'Those who run the menu only' using errcode = '42501';
  end if;
  perform 1 from public.businesses b where b.id = business for no key update;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;

  if jsonb_typeof(places) is distinct from 'array' then
    raise exception 'Places must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(places) > 60 then
    raise exception 'A business has at most 60 places' using errcode = '54000';
  end if;
  for entry in select e.value from jsonb_array_elements(places) as e (value)
  loop
    if jsonb_typeof(entry) <> 'object' then
      raise exception 'A place must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(entry) as k (field)
      where k.field not in ('id', 'name')
    ) then
      raise exception 'A place has an id and a name' using errcode = '22023';
    end if;
    if private.json_text(entry -> 'name', 20, 'A place''s name') is null then
      raise exception 'A place needs a name' using errcode = '22023';
    end if;
    entry_id := private.json_uuid(entry -> 'id', 'A place');
    if entry_id is not null and not exists (
      select 1 from public.order_places p
      where p.id = entry_id and p.business_id = business
    ) then
      raise exception 'Unknown place' using errcode = 'P0002';
    end if;
  end loop;
  if (
    select count(distinct e.value ->> 'id')
    from jsonb_array_elements(places) as e (value)
    where e.value ? 'id' and jsonb_typeof(e.value -> 'id') <> 'null'
  ) <> (
    select count(*)
    from jsonb_array_elements(places) as e (value)
    where e.value ? 'id' and jsonb_typeof(e.value -> 'id') <> 'null'
  ) then
    raise exception 'Each place once' using errcode = '22023';
  end if;
  if (
    select count(distinct lower(btrim(e.value ->> 'name')))
    from jsonb_array_elements(places) as e (value)
  ) <> jsonb_array_length(places) then
    raise exception 'Each place''s name once' using errcode = '23505';
  end if;

  select coalesce(jsonb_object_agg(
      live.id::text, jsonb_build_object('name', live.name, 'position', live.ordinal)
    ), '{}'::jsonb)
  into before_live
  from (
    select p.id, p.name,
      (row_number() over (order by p.position, p.created_at, p.id) - 1)::integer as ordinal
    from public.order_places p
    where p.business_id = business and p.archived_at is null
  ) live;

  -- Everything live is archived first, so names can move between places in
  -- one save; what stays is restored with its new name and place.
  update public.order_places p
  set archived_at = at_time
  where p.business_id = business and p.archived_at is null;

  for entry in select e.value from jsonb_array_elements(places) as e (value)
  loop
    entry_id := private.json_uuid(entry -> 'id', 'A place');
    entry_name := private.json_text(entry -> 'name', 20, 'A place''s name');
    if entry_id is null then
      insert into public.order_places (business_id, name, position, created_at)
      values (business, entry_name, place::smallint, at_time)
      returning id into entry_id;
      added := added + 1;
    else
      update public.order_places p
      set name = entry_name, position = place::smallint, archived_at = null
      where p.id = entry_id and p.business_id = business;
    end if;
    ids := ids || entry_id;
    place := place + 1;
  end loop;

  select count(*)::integer into restored
  from unnest(ids) as kept (id)
  where not (before_live ? kept.id::text);
  restored := restored - added;
  select count(*)::integer into archived
  from jsonb_object_keys(before_live) as was (id)
  where not (was.id::uuid = any (ids));
  select count(*)::integer into changed
  from public.order_places p
  where p.id = any (ids)
    and before_live ? p.id::text
    and (before_live -> p.id::text) is distinct from jsonb_build_object(
      'name', p.name, 'position', p.position::integer
    );

  if added + restored + archived + changed > 0 then
    perform private.bump_menu_version(business);
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      business, actor, 'menu.places',
      jsonb_build_object(
        'added', added, 'restored', restored, 'archived', archived, 'changed', changed,
        'total', cardinality(ids)
      ),
      at_time
    );
  end if;
  return to_jsonb(ids);
end;
$$;

------------------------------------------------------------------------------
-- 9. The demo

-- What the demo restaurant starts with on its menu: four categories, the
-- kitchen's three and the bar's drinks, thirteen items with no choices (the
-- phase that has them seeds them), the fish of the day sold out, and twelve
-- tables. Only a demo business opened from the restaurant template, and only
-- once: a business that has categories already is left as it is. Straight
-- into the tables, as a seed, so the log starts empty of it. The module
-- stays off, as its template has it, so none of it shows until a phase with
-- screens switches it on.
create function private.seed_demo_order_taking(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kitchen uuid;
  bar uuid;
  starters uuid;
  mains uuid;
  desserts uuid;
  drinks uuid;
begin
  if not exists (
      select 1
      from public.businesses b
      join private.demo_businesses d on d.business_id = b.id
      where b.id = business and b.template_key = 'restaurant'
    )
    or exists (select 1 from public.menu_categories c where c.business_id = business)
  then
    return;
  end if;
  select d.id into kitchen
  from public.departments d
  where d.business_id = business and d.key = 'kitchen' and d.archived_at is null;
  select d.id into bar
  from public.departments d
  where d.business_id = business and d.key = 'bar' and d.archived_at is null;
  if kitchen is null or bar is null then
    return;
  end if;

  insert into public.menu_categories (business_id, name, department_id, position)
  values (business, 'ראשונות', kitchen, 0)
  returning id into starters;
  insert into public.menu_categories (business_id, name, department_id, position)
  values (business, 'עיקריות', kitchen, 1)
  returning id into mains;
  insert into public.menu_categories (business_id, name, department_id, position)
  values (business, 'קינוחים', kitchen, 2)
  returning id into desserts;
  insert into public.menu_categories (business_id, name, department_id, position)
  values (business, 'שתייה', bar, 3)
  returning id into drinks;

  insert into public.menu_items (business_id, category_id, name, price_agorot, position)
  values
    (business, starters, 'פוקאצ''ה', 2800, 0),
    (business, starters, 'סלט ירוק', 3600, 1),
    (business, starters, 'חומוס', 3200, 2),
    (business, mains, 'שניצל', 6200, 0),
    (business, mains, 'המבורגר', 6800, 1),
    (business, mains, 'פסטה', 5800, 2),
    (business, desserts, 'מלבי', 2600, 0),
    (business, desserts, 'עוגת שוקולד', 3200, 1),
    (business, drinks, 'לימונדה', 1600, 0),
    (business, drinks, 'מים', 1000, 1),
    (business, drinks, 'קפה', 1200, 2),
    (business, drinks, 'בירה מהחבית', 2800, 3);
  -- Sold out, so the demo shows it.
  insert into public.menu_items (
    business_id, category_id, name, price_agorot, position, available, available_changed_at
  )
  values (business, mains, 'דג היום', 8400, 3, false, now());

  insert into public.order_places (business_id, name, position)
  select business, n::text, (n - 1)::smallint
  from generate_series(1, 12) as n;

  perform private.bump_menu_version(business);
end;
$$;

-- The reset: 20261111000200_chat.sql's, with the sample menu last. The
-- business's places, categories, items and menu version go with it by
-- cascade.
create or replace function public.reset_demo_business(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
begin
  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business
  for update;
  if not found then
    raise exception 'Not a demo business: %', business using errcode = 'P0002';
  end if;

  -- Lock the business before the purge: a write already under way for it (a
  -- visitor's clock-in, anything that logs) finishes first, so the purge sees
  -- its rows, and a new one waits for the reset. The restrict keys then never
  -- meet a row the purge missed.
  perform 1 from public.businesses b where b.id = business for update;

  perform private.purge_business_records(business);
  delete from public.businesses b where b.id = business;

  insert into public.businesses (id, slug, name, accent, address, shabbat_city)
  values (
    business, def ->> 'slug', def ->> 'name', def ->> 'accent',
    def ->> 'address', def ->> 'shabbat_city'
  );
  perform public.apply_template(business, def ->> 'template');

  insert into public.memberships (business_id, user_id, role)
  select business, person.user_id, person.role
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  join public.profiles p on p.id = person.user_id;

  insert into public.department_members (department_id, business_id, user_id)
  select distinct dep.id, business, person.user_id
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text, departments text[])
  join public.memberships m on m.business_id = business and m.user_id = person.user_id
  cross join lateral unnest(coalesce(person.departments, '{}'::text[])) as wanted (key)
  join public.departments dep
    on dep.business_id = business and dep.key = wanted.key and dep.archived_at is null;

  update public.profiles p
  set full_name = person.name, locale = 'he', avatar_path = null,
    bio = null, cover = null, address_form = null
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  where p.id = person.user_id;

  update private.demo_businesses d
  set reset_at = now()
  where d.business_id = business;

  if coalesce((def ->> 'renews')::boolean, false) then
    perform private.renew_demo_schedule(business);
  end if;

  perform private.seed_demo_lists(business);
  perform private.seed_demo_pay(business);
  perform private.seed_demo_chat(business);
  perform private.seed_demo_order_taking(business);
end;
$$;

-- The demo restaurants that exist get their sample now, with nothing reset:
-- the seed leaves a business that has a menu as it is, and every other
-- business than the restaurant's template.
select private.seed_demo_order_taking(d.business_id) from private.demo_businesses d;

------------------------------------------------------------------------------
-- Who may call what

-- The policies' helper runs as the reader, so the signed-in role runs it.
revoke execute on function private.order_taking_on(uuid) from public, anon;
grant execute on function private.order_taking_on(uuid) to authenticated;

-- The rest of the private ones run inside the functions, and the check on
-- menu_items, as their owner, for nobody else.
revoke execute on function private.runs_orders(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.line_route(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.valid_option_groups(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.unit_agorot(integer, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.bump_menu_version(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_order_taking(uuid)
  from public, anon, authenticated, service_role;

-- The screens ask with the person's own session.
revoke execute on function public.order_menu(uuid, bigint) from public, anon;
grant execute on function public.order_menu(uuid, bigint) to authenticated;

-- The server's alone, for `actor`.
revoke execute on function public.set_menu_categories(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_menu_categories(uuid, uuid, jsonb, timestamptz)
  to service_role;
revoke execute on function public.save_menu_item(uuid, uuid, jsonb, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_menu_item(uuid, uuid, jsonb, integer, timestamptz)
  to service_role;
revoke execute on function public.archive_menu_item(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.archive_menu_item(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.restore_menu_item(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.restore_menu_item(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.set_menu_item_available(uuid, uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_menu_item_available(uuid, uuid, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.import_menu(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.import_menu(uuid, uuid, jsonb, timestamptz)
  to service_role;
revoke execute on function public.set_order_places(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_order_places(uuid, uuid, jsonb, timestamptz)
  to service_role;

-- Replaced in place, the same signatures: their grants stay as their first
-- migrations set them; revoked and granted again all the same.
revoke execute on function private.settings_perm(public.module_key)
  from public, anon, authenticated;
revoke execute on function private.log_perm(text) from public, anon;
grant execute on function private.log_perm(text) to authenticated;
revoke execute on function public.reset_demo_business(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_demo_business(uuid) to service_role;
