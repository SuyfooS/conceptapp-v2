-- Taking orders: the menu on screen (P2 of waiter mode, issue #191; Orel's
-- decision of 20 November 2026 to build every phase). The screens and the
-- console's pages are in the app; the database needs five changes for them,
-- each one short, and nothing else moves:
--
--   the team       the ConceptApp team sets a business's menu up from the
--                  console (its import and its places), as it sets up its
--                  departments and lists: the six writes that set the menu
--                  and the places up ask private.sets_up_menu, new, which
--                  holds for whoever runs the menu and for someone on the
--                  team, as private.can_edit_settings does.
--                  private.runs_orders stays P1's, the members' alone, and
--                  "sold out" still asks it after an active membership: it
--                  stays the business's own, so the team gets P0002 there,
--                  and someone on the team who is also on a business's staff
--                  marks only what their own department prepares.
--   a category     public.set_menu_categories saves a category sent with
--   kept           its id and the department it has already, even when that
--                  department was removed since. Before, after a department
--                  its categories went to was removed, every later save of
--                  the categories (a rename, a move, a new one) was refused
--                  until all of them had a live department in one save. A
--                  new category, or one moved to another department, still
--                  goes to a live one (22023, hint 'route').
--   an item kept   public.save_menu_item does the same for an item's own
--                  department: an item saved with the one it has already
--                  passes, even removed since. Before, an item given a
--                  department of its own was refused every later save once
--                  that department was removed, its price changed on the
--                  table included, until another department was chosen.
--   the demo      private.seed_demo_order_taking switches the module on
--                  when the demo business's definition says
--                  "orderTaking": true. The local seed's restaurant says so,
--                  for the browser tests; the hosted demo's doesn't, so it
--                  stays off there until Orel approves the screens. Nothing
--                  is reset here: on the hosted project the definitions are
--                  unchanged, and locally the seed resets after the
--                  migrations.
--   the words      the restaurant's and the café's own sentences for the
--                  module (template wording, 20261108000100_wording.sql):
--                  "מצב מלצרות" for its name, "מנה" for what is on the menu
--                  and "שולחן" for a place. No screen edits a template's
--                  sentences yet, so they come in here. Each keeps the
--                  app's sentence it was written against (base_sentence,
--                  messages/he.json; tooling/template-wording.test.ts keeps
--                  them the same), and a sentence the team wrote already is
--                  kept. A seed, as the demo's menu is: not logged.
--
-- It adds private.sets_up_menu and replaces, from their latest versions (all
-- 20261117000500_order_taking_menu.sql's) and with only these changes:
-- public.set_menu_categories and public.save_menu_item, which ask
-- private.sets_up_menu and keep a removed department as above;
-- public.archive_menu_item, public.restore_menu_item, public.import_menu and
-- public.set_order_places, which only ask private.sets_up_menu; and
-- private.seed_demo_order_taking. Each keeps its signature, so its grants
-- stay; revoked and granted again all the same.

------------------------------------------------------------------------------
-- 1. The team sets the menu up from the console

-- `person` sets the business's menu up: they run it (private.runs_orders,
-- 20261117000500_order_taking_menu.sql's and unchanged: order_taking.edit,
-- held as an active member), or are on the ConceptApp team, which sets a
-- business up, as private.can_edit_settings lets it save settings. Asked by
-- the six writes that set the menu and the places up:
-- public.set_menu_categories and public.save_menu_item (sections 2 and 3),
-- and public.archive_menu_item, public.restore_menu_item,
-- public.import_menu and public.set_order_places (below). Not by
-- public.set_menu_item_available, which still asks private.runs_orders
-- after an active membership: "sold out" stays the business's own, so the
-- team gets P0002 there, and someone on the team who is also on a
-- business's staff marks only what their own department prepares. The
-- orders to come (P3) ask private.runs_orders too, so the team's right to
-- set the menu up gives no one a right to the orders.
create function private.sets_up_menu(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.runs_orders(business, person)
    or exists (
      select 1 from public.platform_staff s where s.user_id = person
    )
$$;

-- 20261117000500_order_taking_menu.sql's, with only its first check changed:
-- it asks private.sets_up_menu where it asked private.runs_orders.
--
-- Removes an item from the menu (archived; the undo is
-- public.restore_menu_item). 42501 for anyone who doesn't set the menu up, and
-- while the module is off (hint 'off'); P0002 for an id that isn't the
-- business's. One already removed is left as it is. Logged as
-- menu.item.archive with its id and name.
create or replace function public.archive_menu_item(
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
  if not private.sets_up_menu(business, actor) then
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

-- 20261117000500_order_taking_menu.sql's, with only its first check changed:
-- it asks private.sets_up_menu where it asked private.runs_orders.
--
-- Brings a removed item back: the undo. As public.archive_menu_item, and
-- 55000 while its category is removed (hint 'category'), 54000 for a 301st
-- live item. One that is live is left as it is. Logged as menu.item.restore.
create or replace function public.restore_menu_item(
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
  if not private.sets_up_menu(business, actor) then
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

-- 20261117000500_order_taking_menu.sql's, with only its first check changed:
-- it asks private.sets_up_menu where it asked private.runs_orders.
--
-- Writes a pasted menu in one go (@domain/menu-import): `rows` is a list, in
-- order, of {category: {name, department}} and {item: {name, priceAgorot,
-- description?, optionGroups?}}, each item in the category above it. A
-- category the business has by that name (case aside) takes the items after
-- it, wherever it goes; a new one goes last, to its department. Every row is
-- checked as its own save checks it, and any one refused refuses them all:
-- nothing is written. 42501 for anyone who doesn't set the menu up, and
-- while the module is off (hint 'off'); 22023 for a department that isn't live
-- (hint 'route'), choices that don't hold (hint 'choices') or any other
-- shape; 54000 past 30 categories or 300 items. Logged as menu.import with
-- the counts. Returns {categories, items}: how many it added.
create or replace function public.import_menu(
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
  if not private.sets_up_menu(business, actor) then
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

-- 20261117000500_order_taking_menu.sql's, with only its first check changed:
-- it asks private.sets_up_menu where it asked private.runs_orders.
--
-- Saves the business's places, in order (`places`: a list of {id?, name}),
-- as the categories are saved: one left out is removed (archived), a removed
-- one that comes back by its id is restored, one with no id is added. 42501
-- for anyone who doesn't set the menu up, and while the module is off (hint
-- 'off'); 54000 past 60; 23505 for a name twice; 22023 for any other shape;
-- P0002 for an id that isn't the business's. Logged as menu.places with
-- counts, when anything changed. Returns the places' ids, in order.
create or replace function public.set_order_places(
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
  if not private.sets_up_menu(business, actor) then
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
-- 2. A category kept keeps its department

-- 20261117000500_order_taking_menu.sql's, with only two changes: it asks
-- private.sets_up_menu where it asked private.runs_orders (section 1), and
-- its department check, after the id's, passes a category sent with its id
-- and the department it has already, even when that department was removed
-- since, so a rename or a move saves while its items wait for a department.
--
-- Saves the business's categories, in order (`categories`: a list of
-- {id?, name, department}), as the departments are saved: one left out is
-- removed (archived), a removed one that comes back by its id is restored
-- (the undo), one with no id is added. 42501 for anyone who doesn't set the
-- menu up, and while the module is off (hint 'off'); 54000 past 30; 22023 for a
-- department that isn't live in the business and isn't the category's own
-- (hint 'route') or any other shape; 23505 for a name twice; P0002 for an id
-- that isn't the business's. Logged as menu.categories with counts, when
-- anything changed. Returns the categories' ids, in order.
create or replace function public.set_menu_categories(
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
  if not private.sets_up_menu(business, actor) then
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
    entry_id := private.json_uuid(entry -> 'id', 'A category');
    if entry_id is not null and not exists (
      select 1 from public.menu_categories c
      where c.id = entry_id and c.business_id = business
    ) then
      raise exception 'Unknown category' using errcode = 'P0002';
    end if;
    -- A live department, or the one the category has already, even removed
    -- since: a category saved as it was keeps going where it went.
    entry_department := private.json_uuid(entry -> 'department', 'A category''s department');
    if entry_department is null or (
      not exists (
        select 1 from public.departments d
        where d.id = entry_department and d.business_id = business and d.archived_at is null
      )
      and not exists (
        select 1 from public.menu_categories c
        where c.id = entry_id and c.business_id = business and c.department_id = entry_department
      )
    ) then
      raise exception 'A category goes to a department of the business'
        using errcode = '22023', hint = 'route';
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

------------------------------------------------------------------------------
-- 3. An item kept keeps its department

-- 20261117000500_order_taking_menu.sql's, with only two changes, as the
-- categories' above: it asks private.sets_up_menu where it asked
-- private.runs_orders (section 1), and an item sent with its id and the
-- department of its own it has already passes, even when that department
-- was removed since (public.set_departments archives a department and
-- leaves the items that name it). Before, every later save of such an item
-- was refused 'route', a price changed on the table included, though nobody
-- chose a department there. A new item, or a department changed, still goes
-- to a live one. Its callers are the menu's sheet and price, through
-- packages/db's saveMenuItem; the twin's are stand-ins.
--
-- Adds an item (`item` with no id) or saves one (`item` with its id, and the
-- version the screen read, `known_version`): {id?, category, name,
-- description?, priceAgorot, department?, optionGroups?, position?}. 42501
-- for anyone who doesn't set the menu up, and while the module is off (hint
-- 'off'); 22023 for a category that isn't live in the business (hint
-- 'category'), a department that isn't live in the business and isn't the
-- item's own (hint 'route'), choices that don't hold (hint 'choices'), or
-- any other shape; 54000 for a 301st live item; P0002 for an id that isn't
-- the business's; 55000 for a removed one (hint 'archived'); 40001 when it
-- changed since `known_version`. A new item goes last in its category, and
-- so does one moved to another. The same values again change nothing.
-- Logged as menu.item.save with what changed, the price before and after
-- when it moved, and each option whose price moved. Returns {id, version}.
create or replace function public.save_menu_item(
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
  if not private.sets_up_menu(business, actor) then
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
  -- A live department, or the one the item has already, even removed since:
  -- an item saved as it was keeps going where it went.
  new_department := private.json_uuid(item -> 'department', 'The department');
  if new_department is not null
    and not exists (
      select 1 from public.departments d
      where d.id = new_department and d.business_id = business and d.archived_at is null
    )
    and not exists (
      select 1 from public.menu_items i
      where i.id = item_id and i.business_id = business and i.department_id = new_department
    )
  then
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


------------------------------------------------------------------------------
-- 4. The demo restaurant opens with taking orders on, where it says so

-- 20261117000500_order_taking_menu.sql's, with the module switched on first
-- when the business's definition says "orderTaking": true (supabase/seed.sql's
-- restaurant; tooling/demo-order-taking.test.ts keeps supabase/hosted-demo.sql
-- without it). public.reset_demo_business calls it last, after the template
-- put the module off, so every reset leaves it as the definition asks. Then,
-- as before:
--
-- What the demo restaurant starts with on its menu: four categories, the
-- kitchen's three and the bar's drinks, thirteen items with no choices (the
-- phase that has them seeds them), the fish of the day sold out, and twelve
-- tables. Only a demo business opened from the restaurant template, and only
-- once: a business that has categories already is left as it is. Straight
-- into the tables, as a seed, so the log starts empty of it.
create or replace function private.seed_demo_order_taking(business uuid)
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
  -- On first, when the business's definition says so: whatever comes next,
  -- the reset leaves the module as the definition asks.
  update public.business_modules bm
  set enabled = true
  from private.demo_businesses d
  where d.business_id = business
    and bm.business_id = business
    and bm.module_key = 'order_taking'::public.module_key
    and d.definition -> 'orderTaking' = 'true'::jsonb;

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

------------------------------------------------------------------------------
-- 5. The restaurant's and the café's words

-- Both templates the same sentences: "מנה" for anything on the menu, drinks
-- too, and "שולחן" for a place (Orel, 20 November 2026, the design's §16).
-- Only where the app's sentence says "פריט" or "מקום", or names the module.
insert into public.template_wording (template_key, key, sentence, base_sentence)
select t.template_key, w.key, w.sentence, w.base_sentence
from (values ('restaurant'), ('cafe-bar')) as t (template_key)
cross join (
  values
    ('modules.order_taking.name',
      'מצב מלצרות',
      'קבלת הזמנות'),
    ('modules.order_taking.description',
      'קבלת הזמנות ושליחה למטבח ולבר',
      'קבלת הזמנות ושליחה להכנה'),
    ('app.orders.menu.status.items',
      '{count, plural, one {מנה אחת} other {# מנות}}',
      '{count, plural, one {פריט אחד} other {# פריטים}}'),
    ('app.orders.menu.status.soldOut',
      '{count, plural, one {אחת נגמרה} other {# נגמרו}}',
      '{count, plural, one {אחד נגמר} other {# נגמרו}}'),
    ('app.orders.menu.status.noRoute',
      '{count, plural, one {מנה אחת בלי מחלקה} other {# מנות בלי מחלקה}}',
      '{count, plural, one {פריט אחד בלי מחלקה} other {# פריטים בלי מחלקה}}'),
    ('app.orders.menu.add',
      'הוספת מנה',
      'הוספת פריט'),
    ('app.orders.menu.readOnly.department',
      'את התפריט משנה מי שמנהל אותו. מסמנים "נגמר" למנות שמכינים במחלקה שלך.',
      'את התפריט משנה מי שמנהל אותו. מסמנים "נגמר" לפריטים שמכינים במחלקה שלך.'),
    ('app.orders.menu.empty.body',
      'מוסיפים מנות אחת אחת, או מעתיקים תפריט קיים מהאתר, מקובץ PDF או מהקופה.',
      'מוסיפים פריטים אחד אחד, או מעתיקים תפריט קיים מהאתר, מקובץ PDF או מהקופה.'),
    ('app.orders.menu.emptyCategory',
      'עוד אין כאן מנות.',
      'עוד אין כאן פריטים.'),
    ('app.orders.menu.categoryLine',
      '{department} · {count, plural, =0 {אין מנות} one {מנה אחת} other {# מנות}}',
      '{department} · {count, plural, =0 {אין פריטים} one {פריט אחד} other {# פריטים}}'),
    ('app.orders.menu.placesRow',
      'השולחנות',
      'המקומות'),
    ('app.orders.menu.placesCount',
      '{count, plural, =0 {עוד אין שולחנות} one {שולחן אחד} other {# שולחנות}}',
      '{count, plural, =0 {עוד אין מקומות} one {מקום אחד} other {# מקומות}}'),
    ('app.orders.menu.columns.name',
      'מנה',
      'פריט'),
    ('app.orders.menu.sheet.newTitle',
      'מנה חדשה',
      'פריט חדש'),
    ('app.orders.menu.sheet.name',
      'שם המנה',
      'שם הפריט'),
    ('app.orders.menu.sheet.nameMissing',
      'כותבים את שם המנה, עד 60 תווים.',
      'כותבים את שם הפריט, עד 60 תווים.'),
    ('app.orders.menu.toast.soldOut',
      'סומנה שנגמרה: {name}',
      'סומן שנגמר: {name}'),
    ('app.orders.menu.toast.available',
      'חזרה לתפריט: {name}',
      'חזר לתפריט: {name}'),
    ('app.orders.menu.toast.added',
      'נוספה לתפריט: {name}',
      'נוסף לתפריט: {name}'),
    ('app.orders.menu.toast.saved',
      'נשמרה: {name}',
      'נשמר: {name}'),
    ('app.orders.menu.toast.removed',
      'הוסרה מהתפריט: {name}',
      'הוסר מהתפריט: {name}'),
    ('app.orders.menu.failed.off',
      'מצב מלצרות כבוי בעסק הזה.',
      'קבלת הזמנות כבויה בעסק הזה.'),
    ('app.orders.menu.failed.gone',
      'המנה כבר לא בתפריט.',
      'הפריט כבר לא בתפריט.'),
    ('app.orders.menu.failed.choices',
      'הבחירות של המנה לא נשמרו כמו שהן.',
      'הבחירות של הפריט לא נשמרו כמו שהן.'),
    ('app.orders.menu.failed.changed',
      'מישהו שינה את המנה בינתיים. זה מה שיש בה עכשיו.',
      'מישהו שינה את הפריט בינתיים. זה מה שיש בו עכשיו.'),
    ('app.orders.menu.failed.tooMany',
      'בתפריט כבר יש כמה שאפשר: עד 300 מנות ו-30 קטגוריות.',
      'בתפריט כבר יש כמה שאפשר: עד 300 פריטים ו-30 קטגוריות.'),
    ('app.orders.menu.failed.archived',
      'המנה הוסרה מהתפריט. מחזירים אותה קודם.',
      'הפריט הוסר מהתפריט. מחזירים אותו קודם.'),
    ('app.orders.menu.failed.categoryRemoved',
      'הקטגוריה של המנה הוסרה. מחזירים אותה קודם.',
      'הקטגוריה של הפריט הוסרה. מחזירים אותה קודם.'),
    ('app.orders.categories.count',
      '{count, plural, =0 {אין מנות} one {מנה אחת} other {# מנות}}',
      '{count, plural, =0 {אין פריטים} one {פריט אחד} other {# פריטים}}'),
    ('app.orders.categories.removed',
      '{count, plural, =0 {הקטגוריה {name} הוסרה} one {הקטגוריה {name} הוסרה, עם מנה אחת} other {הקטגוריה {name} הוסרה, עם # מנות}}',
      '{count, plural, =0 {הקטגוריה {name} הוסרה} one {הקטגוריה {name} הוסרה, עם פריט אחד} other {הקטגוריה {name} הוסרה, עם # פריטים}}'),
    ('app.orders.categories.itemsEmpty',
      'עוד אין כאן מנות. מוסיפים אותן במסך התפריט.',
      'עוד אין כאן פריטים. מוסיפים אותם במסך התפריט.'),
    ('app.orders.places.title',
      'השולחנות',
      'המקומות'),
    ('app.orders.places.subtitle',
      'השולחנות שמקבלים אליהם הזמנות. אפשר לקרוא להם בשם, כמו "בר 3" או "מרפסת 2". הסדר כאן הוא הסדר במסך.',
      'המקומות שמקבלים אליהם הזמנות: שולחנות, מקומות ליד הבר או חדרים. הסדר כאן הוא הסדר במסך.'),
    ('app.orders.places.quick.title',
      'כמה שולחנות יש',
      'כמה מקומות יש'),
    ('app.orders.places.quick.action',
      '{count, plural, one {יצירת שולחן אחד} other {יצירת # שולחנות}}',
      '{count, plural, one {יצירת מקום אחד} other {יצירת # מקומות}}'),
    ('app.orders.places.nameOf',
      'שם השולחן {name}',
      'שם המקום {name}'),
    ('app.orders.places.newName',
      'שולחן חדש',
      'מקום חדש'),
    ('app.orders.places.add',
      'הוספת שולחן',
      'הוספת מקום'),
    ('app.orders.places.removed',
      'השולחן {name} הוסר',
      'המקום {name} הוסר'),
    ('app.orders.places.taken',
      'כבר יש שולחן בשם {name}.',
      'כבר יש מקום בשם {name}.'),
    ('app.orders.places.max',
      'אפשר עד 60 שולחנות.',
      'אפשר עד 60 מקומות.'),
    ('app.orders.places.empty',
      'עוד אין שולחנות.',
      'עוד אין מקומות.'),
    ('app.orders.import.existing',
      'בתפריט כבר יש {items, plural, one {מנה אחת} other {# מנות}} ב{categories, plural, one {קטגוריה אחת} other {-# קטגוריות}}. מה שמדביקים נוסף אליהן.',
      'בתפריט כבר יש {items, plural, one {פריט אחד} other {# פריטים}} ב{categories, plural, one {קטגוריה אחת} other {-# קטגוריות}}. מה שמדביקים נוסף אליהם.'),
    ('app.orders.import.hint',
      'שורה עם מחיר בסוף היא מנה. שורה בלי מחיר היא קטגוריה לשורות שאחריה. שני מחירים עם / הם שני גדלים, ושורה שמתחילה ב-+ היא תוספת למנה שמעליה.',
      'שורה עם מחיר בסוף היא פריט. שורה בלי מחיר היא קטגוריה לשורות שאחריה. שני מחירים עם / הם שני גדלים, ושורה שמתחילה ב-+ היא תוספת לפריט שמעליה.'),
    ('app.orders.import.counts',
      '{items, plural, one {מנה אחת} other {# מנות}} · {categories, plural, one {קטגוריה אחת} other {# קטגוריות}} · {problems, plural, =0 {אין שורות לתיקון} one {שורה אחת לתיקון} other {# שורות לתיקון}}',
      '{items, plural, one {פריט אחד} other {# פריטים}} · {categories, plural, one {קטגוריה אחת} other {# קטגוריות}} · {problems, plural, =0 {אין שורות לתיקון} one {שורה אחת לתיקון} other {# שורות לתיקון}}'),
    ('app.orders.import.line.item',
      'מנה · <ltr>{price}</ltr>',
      'פריט · <ltr>{price}</ltr>'),
    ('app.orders.import.line.extra',
      'תוספת למנה שמעליה · <ltr>+{price}</ltr>',
      'תוספת לפריט שמעליה · <ltr>+{price}</ltr>'),
    ('app.orders.import.line.known',
      'כבר בתפריט, לא נכנסת שוב',
      'כבר בתפריט, לא נכנס שוב'),
    ('app.orders.import.problem.noItem',
      'תוספת בלי מנה מעליה',
      'תוספת בלי פריט מעליה'),
    ('app.orders.import.problem.tooManyExtras',
      'יותר מדי תוספות למנה אחת',
      'יותר מדי תוספות לפריט אחד'),
    ('app.orders.import.tooMany',
      'עם ההדבקה הזאת יהיו בתפריט יותר מ-300 מנות או 30 קטגוריות. מקצרים אותה.',
      'עם ההדבקה הזאת יהיו בתפריט יותר מ-300 פריטים או 30 קטגוריות. מקצרים אותה.'),
    ('app.orders.import.action',
      '{count, plural, one {הוספת מנה אחת לתפריט} other {הוספת # מנות לתפריט}}',
      '{count, plural, one {הוספת פריט אחד לתפריט} other {הוספת # פריטים לתפריט}}'),
    ('app.orders.import.done',
      '{items, plural, one {נוספה לתפריט מנה אחת} other {נוספו לתפריט # מנות}}{categories, plural, =0 {} one { וקטגוריה חדשה אחת} other { ו-# קטגוריות חדשות}}',
      '{items, plural, one {נוסף לתפריט פריט אחד} other {נוספו לתפריט # פריטים}}{categories, plural, =0 {} one { וקטגוריה חדשה אחת} other { ו-# קטגוריות חדשות}}'),
    ('app.manage.roles.editHint.order_taking',
      'בלי עריכה רואים את התפריט, ומסמנים "נגמר" למנות שהמחלקה שלהם מכינה. עם עריכה גם עורכים את התפריט, את המחירים ואת השולחנות, ומסמנים "נגמר" לכל מנה.',
      'בלי עריכה רואים את התפריט, ומסמנים "נגמר" לפריטים שהמחלקה שלהם מכינה. עם עריכה גם עורכים את התפריט, את המחירים ואת המקומות, ומסמנים "נגמר" לכל פריט.'),
    ('app.manage.activity.actions.menu.itemCreate',
      'הוספת המנה {name} לתפריט',
      'הוספת הפריט {name} לתפריט'),
    ('app.manage.activity.actions.menu.itemSave',
      'שינוי במנה {name}',
      'שינוי בפריט {name}'),
    ('app.manage.activity.actions.menu.itemArchive',
      'הסרת המנה {name} מהתפריט',
      'הסרת הפריט {name} מהתפריט'),
    ('app.manage.activity.actions.menu.itemRestore',
      'החזרת המנה {name} לתפריט',
      'החזרת הפריט {name} לתפריט'),
    ('app.manage.activity.actions.menu.import',
      '{count, plural, one {יבוא מנה אחת לתפריט} other {יבוא # מנות לתפריט}}',
      '{count, plural, one {יבוא פריט אחד לתפריט} other {יבוא # פריטים לתפריט}}'),
    ('app.manage.activity.actions.menu.places.title',
      'שינוי בשולחנות',
      'שינוי במקומות'),
    ('app.manage.activity.actions.menu.places.added',
      '{count, plural, one {שולחן אחד נוסף} other {# שולחנות נוספו}}',
      '{count, plural, one {מקום אחד נוסף} other {# מקומות נוספו}}'),
    ('app.manage.activity.actions.menu.places.archived',
      '{count, plural, one {שולחן אחד הוסר} other {# שולחנות הוסרו}}',
      '{count, plural, one {מקום אחד הוסר} other {# מקומות הוסרו}}'),
    ('app.manage.activity.actions.menu.places.restored',
      '{count, plural, one {שולחן אחד חזר} other {# שולחנות חזרו}}',
      '{count, plural, one {מקום אחד חזר} other {# מקומות חזרו}}'),
    ('app.manage.activity.actions.menu.places.changed',
      '{count, plural, one {שולחן אחד שונה} other {# שולחנות שונו}}',
      '{count, plural, one {מקום אחד שונה} other {# מקומות שונו}}'),
    ('app.manage.departments.menuItems',
      '{count, plural, one {מכינים כאן מנה אחת מהתפריט} other {מכינים כאן # מנות מהתפריט}}',
      '{count, plural, one {מכינים כאן פריט אחד מהתפריט} other {מכינים כאן # פריטים מהתפריט}}'),
    ('app.manage.departments.removedMenu',
      '{count, plural, one {המחלקה {name} הוסרה. מנה אחת מהתפריט לא מגיעה עכשיו להכנה, עד שבוחרים לה מחלקה.} other {המחלקה {name} הוסרה. # מנות מהתפריט לא מגיעות עכשיו להכנה, עד שבוחרים להן מחלקה.}}',
      '{count, plural, one {המחלקה {name} הוסרה. פריט אחד מהתפריט לא מגיע עכשיו להכנה, עד שבוחרים לו מחלקה.} other {המחלקה {name} הוסרה. # פריטים מהתפריט לא מגיעים עכשיו להכנה, עד שבוחרים להם מחלקה.}}')
) as w (key, sentence, base_sentence)
on conflict (template_key, key) do nothing;

------------------------------------------------------------------------------
-- Who may call what

-- The new helper runs inside the menu's writes, as their owner, for nobody
-- else.
revoke execute on function private.sets_up_menu(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Replaced in place, the same signatures: their grants stay as their first
-- migration set them; revoked and granted again all the same.
revoke execute on function private.seed_demo_order_taking(uuid)
  from public, anon, authenticated, service_role;
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
revoke execute on function public.import_menu(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.import_menu(uuid, uuid, jsonb, timestamptz)
  to service_role;
revoke execute on function public.set_order_places(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_order_places(uuid, uuid, jsonb, timestamptz)
  to service_role;
