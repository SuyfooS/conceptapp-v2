-- Taking orders: the menu and the places (20261117000500_order_taking_menu.sql;
-- waiter mode P1). The key order_taking.edit, held by owners and managers,
-- switched per role from the start, and the log's menu.* rows read with it.
-- With the module off nothing is read and every write is refused. Categories
-- saved whole: in order, renamed, removed and brought back, each to a live
-- department of the business, each name once, at most 30. Items: added,
-- saved from the version read and refused from an older one, their price
-- from 0 to 10,000.00 ₪, their choices checked at every edge
-- (private.valid_option_groups) and by the table itself, at most 300 live,
-- removed and brought back but never under a removed category; each save
-- logged with the agorot before and after, the item's and each option's.
-- Sold out: by whoever runs the menu, and by someone on the staff in the
-- department the item goes to (its own department over its category's),
-- never an accountant put in one, never logged. An import in one go, or
-- nothing at all. Places saved whole, at most 60, each name once. Who reads
-- the menu: the staff and a view as a role on it, while the module is on;
-- never an accountant, a view as one, or another business. public.order_menu
-- answers with nothing new on the same version, and the version moves with
-- every write, and with a department removed or brought back, which changes
-- where items go. And a line's unit price (private.unit_agorot). Every write
-- passes its moment, so nothing depends on today's date. Fixed ids (e1…)
-- and numbers (050-061-xxxx), so nothing here meets the seed or another test.
begin;
select plan(77);

-- A: 1 owner; 2 a manager in the floor and the bar (as the demo's Shiran);
-- 3 a worker in the kitchen (Noa); 4 a worker in the bar (Yoav); 5 put in
-- the kitchen as a worker, then made the accountant; 6 a worker in no
-- department; 7 and 8 on the ConceptApp team, viewing A as a worker and as
-- an accountant; 9 a worker in the kitchen who left. B: 11, its owner.
insert into auth.users (id, aud, role, phone)
select ('e1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250061' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,7,8,9,11}'::int[]) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('e1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'e1000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'e1000000-0000-4000-b000-000000000002'::uuid
$$;
-- Departments: 1 the kitchen, 2 the bar, 3 the floor, 4 the storeroom
-- (removed), all A's; 11 B's kitchen.
create function pg_temp.d(n integer) returns uuid language sql as $$
  select ('e1000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- What a call is refused with: its code and hint, or 'none'.
create function pg_temp.refusal(call text) returns text language plpgsql as $$
declare
  got_code text;
  got_hint text;
begin
  execute call;
  return 'none';
exception when others then
  get stacked diagnostics got_code = returned_sqlstate, got_hint = pg_exception_hint;
  return concat_ws(' ', got_code, nullif(got_hint, ''));
end;
$$;

-- Whether a call goes through, undone after: 'lives', or what it is refused
-- with.
create function pg_temp.tried(call text) returns text language plpgsql as $$
declare
  got_code text;
  got_hint text;
begin
  execute call;
  raise exception 'Undone' using errcode = 'P0001', hint = 'undone';
exception when others then
  get stacked diagnostics got_code = returned_sqlstate, got_hint = pg_exception_hint;
  if got_hint = 'undone' then
    return 'lives';
  end if;
  return concat_ws(' ', got_code, nullif(got_hint, ''));
end;
$$;
-- A moment as the tests write it, in UTC to the minute, or '-'.
create function pg_temp.utc(moment timestamptz) returns text language sql as $$
  select coalesce(to_char(moment at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), '-')
$$;

create temporary table ids (name text primary key, id uuid not null) on commit drop;
create temporary table got (name text primary key, value jsonb) on commit drop;
grant select on ids, got to authenticated;

create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;
-- Each id of a list a save returned, as `prefix` 1, 2…, in order.
create function pg_temp.keep_ids(prefix text, saved_ids jsonb) returns jsonb language sql as $$
  insert into ids (name, id)
  select prefix || e.n, (e.v #>> '{}')::uuid
  from jsonb_array_elements(saved_ids) with ordinality as e (v, n)
  on conflict (name) do update set id = excluded.id;
  select saved_ids
$$;
-- An item's save, its id kept as `label`.
create function pg_temp.keep_item(label text, saved jsonb) returns jsonb language sql as $$
  insert into ids (name, id) values (label, (saved ->> 'id')::uuid)
  on conflict (name) do update set id = excluded.id;
  insert into got (name, value) values (label, saved)
  on conflict (name) do update set value = excluded.value;
  select saved
$$;
create function pg_temp.keep(label text, kept jsonb) returns jsonb language sql as $$
  insert into got (name, value) values (label, kept)
  on conflict (name) do update set value = excluded.value;
  select kept
$$;
-- A group of choices: `option_count` options at `agorot` each, picked up to `most`.
create function pg_temp.grp(gid text, option_count integer, agorot integer, most integer)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', gid, 'name', 'Group ' || gid, 'min', 0, 'max', most,
    'options', (
      select jsonb_agg(jsonb_build_object('id', 'o' || n, 'name', 'Option ' || n, 'priceAgorot', agorot) order by n)
      from generate_series(1, option_count) as n
    )
  )
$$;
-- A's menu version now.
create function pg_temp.menu_version() returns bigint language sql as $$
  select coalesce((select v.version from private.menu_versions v where v.business_id = pg_temp.a()), 0)
$$;
-- The newest log row of `what` in A.
create function pg_temp.logged(what text) returns jsonb language sql as $$
  select a.details from public.audit_log a
  where a.business_id = pg_temp.a() and a.action = what
  order by a.created_at desc, a.id desc
  limit 1
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'order-menu-a', 'Order menu A'),
  (pg_temp.b(), 'order-menu-b', 'Order menu B');

insert into public.memberships (business_id, user_id, role)
values
  (pg_temp.a(), pg_temp.p(1), 'owner'),
  (pg_temp.a(), pg_temp.p(2), 'manager'),
  (pg_temp.a(), pg_temp.p(3), 'worker'),
  (pg_temp.a(), pg_temp.p(4), 'worker'),
  (pg_temp.a(), pg_temp.p(5), 'worker'),
  (pg_temp.a(), pg_temp.p(6), 'worker'),
  (pg_temp.a(), pg_temp.p(9), 'worker'),
  (pg_temp.b(), pg_temp.p(11), 'owner');

-- A starts with the module off; B has it on.
insert into public.business_modules (business_id, module_key, enabled)
values
  (pg_temp.a(), 'order_taking', false),
  (pg_temp.b(), 'order_taking', true);

insert into public.departments (id, business_id, key, name, archived_at)
values
  (pg_temp.d(1), pg_temp.a(), 'kitchen', 'Kitchen', null),
  (pg_temp.d(2), pg_temp.a(), 'bar', 'Bar', null),
  (pg_temp.d(3), pg_temp.a(), 'floor', 'Floor', null),
  (pg_temp.d(4), pg_temp.a(), 'storeroom', 'Storeroom', '2026-11-01 10:00+00'),
  (pg_temp.d(11), pg_temp.b(), 'kitchen', 'Kitchen', null);
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.d(3), pg_temp.a(), pg_temp.p(2)),
  (pg_temp.d(2), pg_temp.a(), pg_temp.p(2)),
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.d(2), pg_temp.a(), pg_temp.p(4)),
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(5)),
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(9));
-- 5 becomes the accountant and keeps the kitchen's row; 9 leaves.
update public.memberships set role = 'accountant'
where business_id = pg_temp.a() and user_id = pg_temp.p(5);
update public.memberships set active = false
where business_id = pg_temp.a() and user_id = pg_temp.p(9);

insert into public.platform_staff (user_id, role)
values (pg_temp.p(7), 'onboarder'), (pg_temp.p(8), 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values (pg_temp.p(7), pg_temp.a(), 'worker'), (pg_temp.p(8), pg_temp.a(), 'accountant');

------------------------------------------------------------------------------
-- Who may call what

select ok(
  has_function_privilege('authenticated', 'public.order_menu(uuid, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.order_menu(uuid, bigint)', 'execute')
  and has_function_privilege('authenticated', 'private.order_taking_on(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.order_taking_on(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.runs_orders(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.line_route(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.valid_option_groups(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.unit_agorot(integer, jsonb, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.bump_menu_version(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_order_taking(uuid)', 'execute')
  and not has_table_privilege('authenticated', 'private.menu_versions', 'select')
  and (
    select bool_and(
      not has_function_privilege('authenticated', f.sig, 'execute')
      and not has_function_privilege('anon', f.sig, 'execute')
      and has_function_privilege('service_role', f.sig, 'execute')
    )
    from unnest(array[
      'public.set_menu_categories(uuid, uuid, jsonb, timestamptz)',
      'public.save_menu_item(uuid, uuid, jsonb, integer, timestamptz)',
      'public.archive_menu_item(uuid, uuid, uuid, timestamptz)',
      'public.restore_menu_item(uuid, uuid, uuid, timestamptz)',
      'public.set_menu_item_available(uuid, uuid, uuid, boolean, timestamptz)',
      'public.import_menu(uuid, uuid, jsonb, timestamptz)',
      'public.set_order_places(uuid, uuid, jsonb, timestamptz)'
    ]) as f (sig)
  ),
  'the screens read the menu with the person''s own session; every write is the server''s, and every helper runs inside'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname || '.' || p.proname in (
       'private.order_taking_on', 'private.runs_orders', 'private.line_route',
       'private.bump_menu_version', 'private.seed_demo_order_taking', 'public.order_menu',
       'public.set_menu_categories', 'public.save_menu_item', 'public.archive_menu_item',
       'public.restore_menu_item', 'public.set_menu_item_available', 'public.import_menu',
       'public.set_order_places'
     )
     and p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  13,
  'each that reads a table runs as its owner with an empty search path'
);

------------------------------------------------------------------------------
-- The key

select results_eq(
  $$select k.key, k.module_key::text, k.area, k.requires, k.settable, k.default_roles::text[], k.by_owner
    from public.permission_keys k where k.area = 'order_taking'$$,
  $$values ('order_taking.edit'::text, 'order_taking'::text, 'order_taking'::text, null::text,
    true, '{manager}'::text[], false)$$,
  'running the menu is one key of its own area, managers'' by default, switched per role from the start'
);
select is(
  (select string_agg(n::text || ':' || private.runs_orders(pg_temp.a(), pg_temp.p(n))::text, ',' order by n)
   from unnest('{1,2,3,5,9,11}'::int[]) as n),
  '1:true,2:true,3:false,5:false,9:false,11:false',
  'owners and managers run the menu; a worker, the accountant, someone who left and another business''s owner don''t'
);
select is(
  private.log_perm('menu.item.save') || ',' || private.log_perm('menu.places') || ','
    || private.log_perm('order.line.cancel') || ','
    || private.settings_perm('order_taking'::public.module_key),
  'order_taking.edit,order_taking.edit,order_taking.edit,order_taking.edit',
  'the menu''s rows of the log, the orders'' to come and the module''s settings are those who run the menu''s'
);

------------------------------------------------------------------------------
-- With the module off

select is(
  pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(jsonb_build_object('name', 'Mains', 'department', pg_temp.d(1))),
    '2026-12-01 09:00+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_order_places(pg_temp.p(1), pg_temp.a(),
    '[{"name": "1"}]', '2026-12-01 09:00+00')$c$)
  || '|' || pg_temp.refusal($c$select public.import_menu(pg_temp.p(1), pg_temp.a(), '[]',
    '2026-12-01 09:00+00')$c$),
  '42501 off|42501 off|42501 off',
  'while taking orders is off, even the owner writes nothing, and hears why'
);
select pg_temp.sign_in(pg_temp.p(3));
select throws_ok(
  $$select public.order_menu('e1000000-0000-4000-b000-000000000001')$$,
  'P0002', null, 'and the staff read no menu'
);
reset role;

update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'order_taking';

------------------------------------------------------------------------------
-- Categories

select is(
  pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(3), pg_temp.a(),
    jsonb_build_array(jsonb_build_object('name', 'Mains', 'department', pg_temp.d(1))),
    '2026-12-01 10:00+00')$c$),
  '42501',
  'a worker doesn''t save the categories'
);

select pg_temp.keep_ids('cat', public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object('name', ' Starters ', 'department', pg_temp.d(1)),
    jsonb_build_object('name', 'Mains', 'department', pg_temp.d(1)),
    jsonb_build_object('name', 'Drinks', 'department', pg_temp.d(2))
  ),
  '2026-12-01 10:00+00'));
select results_eq(
  $$select c.id, c.name, c.department_id, c.position::integer from public.menu_categories c
    where c.business_id = 'e1000000-0000-4000-b000-000000000001' and c.archived_at is null
    order by c.position$$,
  $$values
    (pg_temp.id('cat1'), 'Starters'::text, pg_temp.d(1), 0),
    (pg_temp.id('cat2'), 'Mains'::text, pg_temp.d(1), 1),
    (pg_temp.id('cat3'), 'Drinks'::text, pg_temp.d(2), 2)$$,
  'the owner adds three categories, in order, each to its department, the ids given back in that order'
);
select is(
  pg_temp.logged('menu.categories'),
  '{"added": 3, "restored": 0, "archived": 0, "changed": 0, "total": 3}'::jsonb,
  'and the log counts them'
);

-- Drinks renamed and moved first, Starters left out.
select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('cat3'), 'name', 'Bar', 'department', pg_temp.d(2)),
    jsonb_build_object('id', pg_temp.id('cat2'), 'name', 'Mains', 'department', pg_temp.d(1))
  ),
  '2026-12-01 10:05+00');
select is(
  (select string_agg(c.name || ':' || c.position, ',' order by c.position)
   from public.menu_categories c
   where c.business_id = pg_temp.a() and c.archived_at is null)
  || ' | ' || (select pg_temp.utc(c.archived_at) from public.menu_categories c where c.id = pg_temp.id('cat1')),
  'Bar:0,Mains:1 | 2026-12-01 10:05',
  'a manager renames one, moves it, and removes one left out: it is archived, not deleted'
);
select is(
  pg_temp.logged('menu.categories'),
  '{"added": 0, "restored": 0, "archived": 1, "changed": 1, "total": 2}'::jsonb,
  'counted as removed and changed, the one only moved by the removal unchanged'
);

-- The undo: Starters back by its id.
select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Starters', 'department', pg_temp.d(1)),
    jsonb_build_object('id', pg_temp.id('cat3'), 'name', 'Bar', 'department', pg_temp.d(2)),
    jsonb_build_object('id', pg_temp.id('cat2'), 'name', 'Mains', 'department', pg_temp.d(1))
  ),
  '2026-12-01 10:10+00');
select is(
  (select string_agg(c.name, ',' order by c.position)
   from public.menu_categories c
   where c.business_id = pg_temp.a() and c.archived_at is null)
  || ' | ' || (pg_temp.logged('menu.categories') ->> 'restored')
  || ' | ' || (select count(*)::text from public.menu_categories c where c.business_id = pg_temp.a()),
  'Starters,Bar,Mains | 1 | 3',
  'one sent back by its id is restored, with nothing added twice'
);

select pg_temp.keep('version', to_jsonb(pg_temp.menu_version()));
select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Starters', 'department', pg_temp.d(1)),
    jsonb_build_object('id', pg_temp.id('cat3'), 'name', 'Bar', 'department', pg_temp.d(2)),
    jsonb_build_object('id', pg_temp.id('cat2'), 'name', 'Mains', 'department', pg_temp.d(1))
  ),
  '2026-12-01 10:15+00');
select is(
  (select count(*)::int from public.audit_log a
   where a.business_id = pg_temp.a() and a.action = 'menu.categories')
  || ' ' || (pg_temp.menu_version() = (select (g.value #>> '{}')::bigint from got g where g.name = 'version'))::text,
  '3 true',
  'the same list again writes nothing and keeps the version'
);

-- B's own category, for the refusals below and isolation.
select pg_temp.keep_ids('bcat', public.set_menu_categories(pg_temp.p(11), pg_temp.b(),
  jsonb_build_array(jsonb_build_object('name', 'B mains', 'department', pg_temp.d(11))),
  '2026-12-01 10:20+00'));

select is(
  pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(jsonb_build_object('name', 'Stock', 'department', pg_temp.d(4))),
    '2026-12-01 10:25+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(jsonb_build_object('name', 'Stock', 'department', pg_temp.d(11))),
    '2026-12-01 10:25+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(jsonb_build_object('name', 'Stock')), '2026-12-01 10:25+00')$c$),
  '22023 route|22023 route|22023 route',
  'a category goes to a live department of its own business, never a removed one or another''s'
);
select is(
  pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(
      jsonb_build_object('name', 'Mains', 'department', pg_temp.d(1)),
      jsonb_build_object('name', 'mains ', 'department', pg_temp.d(2))
    ),
    '2026-12-01 10:25+00')$c$),
  '23505',
  'each name once, case and spaces aside'
);
select is(
  pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(
      jsonb_build_object('id', pg_temp.id('bcat1'), 'name', 'Mains', 'department', pg_temp.d(1))
    ),
    '2026-12-01 10:25+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(
      jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'One', 'department', pg_temp.d(1)),
      jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Two', 'department', pg_temp.d(1))
    ),
    '2026-12-01 10:25+00')$c$),
  'P0002|22023',
  'another business''s category is unknown, and one category is sent once'
);
select is(
  pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    (select jsonb_agg(jsonb_build_object('name', 'Category ' || n, 'department', pg_temp.d(1)))
     from generate_series(1, 31) as n),
    '2026-12-01 10:25+00')$c$)
  || '|' || pg_temp.tried($c$select public.set_menu_categories(pg_temp.p(1), pg_temp.a(),
    (select jsonb_agg(jsonb_build_object('name', 'Category ' || n, 'department', pg_temp.d(1)))
     from generate_series(1, 30) as n),
    '2026-12-01 10:25+00')$c$),
  '54000|lives',
  'a menu has at most 30 categories'
);

------------------------------------------------------------------------------
-- Items

select pg_temp.keep_item('schnitzel', public.save_menu_item(pg_temp.p(1), pg_temp.a(),
  jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Schnitzel', 'priceAgorot', 6200),
  null, '2026-12-02 09:00+00'));
select is(
  (select i.name || '|' || i.price_agorot || '|' || i.position || '|' || i.version || '|'
     || i.available || '|' || (i.created_by = pg_temp.p(1)) || '|' || i.option_groups::text
   from public.menu_items i where i.id = pg_temp.id('schnitzel'))
  || ' ' || (select g.value ->> 'version' from got g where g.name = 'schnitzel'),
  'Schnitzel|6200|0|1|true|true|[] 1',
  'the owner adds an item: first in its category, version 1, available, with no choices'
);

select pg_temp.keep_item('schnitzel', public.save_menu_item(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'id', pg_temp.id('schnitzel'), 'category', pg_temp.id('cat2'), 'name', 'Schnitzel',
    'priceAgorot', 6800,
    'optionGroups', jsonb_build_array(jsonb_build_object(
      'id', 'size', 'name', 'Size', 'min', 1, 'max', 1,
      'options', jsonb_build_array(
        jsonb_build_object('id', 'regular', 'name', 'Regular', 'priceAgorot', 0),
        jsonb_build_object('id', 'large', 'name', 'Large', 'priceAgorot', 400)
      )
    ))
  ),
  1, '2026-12-02 09:05+00'));
select is(
  (select i.price_agorot || '|' || i.version || '|' || jsonb_array_length(i.option_groups)
     || '|' || (i.updated_by = pg_temp.p(2))
   from public.menu_items i where i.id = pg_temp.id('schnitzel'))
  || ' ' || (select g.value ->> 'version' from got g where g.name = 'schnitzel'),
  '6800|2|1|true 2',
  'a manager saves it from the version read: a new price and a group of sizes, version 2'
);
select is(
  pg_temp.logged('menu.item.save'),
  jsonb_build_object(
    'item', pg_temp.id('schnitzel'), 'name', 'Schnitzel', 'created', false,
    'changed', '["price", "options"]'::jsonb,
    'price', '{"before": 6200, "after": 6800}'::jsonb,
    'options', '[{"group": "Size", "option": "Regular", "before": null, "after": 0},
      {"group": "Size", "option": "Large", "before": null, "after": 400}]'::jsonb
  ),
  'the log says what changed, the price''s agorot before and after, and each option added'
);
select is(
  pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('id', pg_temp.id('schnitzel'), 'category', pg_temp.id('cat2'),
      'name', 'Schnitzel', 'priceAgorot', 7000),
    1, '2026-12-02 09:06+00')$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('id', pg_temp.id('schnitzel'), 'category', pg_temp.id('cat2'),
      'name', 'Schnitzel', 'priceAgorot', 7000),
    null, '2026-12-02 09:06+00')$c$)
  || '|' || (select i.price_agorot::text from public.menu_items i where i.id = pg_temp.id('schnitzel')),
  '40001|22023|6800',
  'a save from an older version is refused (40001), one naming none too, and the price stays'
);

-- The large size dearer, and one more.
select public.save_menu_item(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'id', pg_temp.id('schnitzel'), 'category', pg_temp.id('cat2'), 'name', 'Schnitzel',
    'priceAgorot', 6800,
    'optionGroups', jsonb_build_array(jsonb_build_object(
      'id', 'size', 'name', 'Size', 'min', 1, 'max', 1,
      'options', jsonb_build_array(
        jsonb_build_object('id', 'regular', 'name', 'Regular', 'priceAgorot', 0),
        jsonb_build_object('id', 'large', 'name', 'Large', 'priceAgorot', 600),
        jsonb_build_object('id', 'xl', 'name', 'XL', 'priceAgorot', 900)
      )
    ))
  ),
  2, '2026-12-02 09:10+00');
select is(
  pg_temp.logged('menu.item.save'),
  jsonb_build_object(
    'item', pg_temp.id('schnitzel'), 'name', 'Schnitzel', 'created', false,
    'changed', '["options"]'::jsonb,
    'options', '[{"group": "Size", "option": "Large", "before": 400, "after": 600},
      {"group": "Size", "option": "XL", "before": null, "after": 900}]'::jsonb
  ),
  'an option''s price moved is logged with its agorot before and after, and no price when the item''s stayed'
);

select pg_temp.keep_item('lemonade', public.save_menu_item(pg_temp.p(1), pg_temp.a(),
  jsonb_build_object('category', pg_temp.id('cat3'), 'name', 'Lemonade', 'priceAgorot', 1600),
  null, '2026-12-02 09:15+00'));
-- Made in the kitchen's category, poured at the bar.
select pg_temp.keep_item('shot', public.save_menu_item(pg_temp.p(1), pg_temp.a(),
  jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Shot', 'priceAgorot', 500,
    'department', pg_temp.d(2)),
  null, '2026-12-02 09:15+00'));
select pg_temp.keep_item('feast', public.save_menu_item(pg_temp.p(1), pg_temp.a(),
  jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Feast', 'priceAgorot', 1000000),
  null, '2026-12-02 09:15+00'));
select is(
  (select string_agg(i.name || ':' || i.position, ',' order by i.position)
   from public.menu_items i where i.category_id = pg_temp.id('cat2'))
  || ' | ' || (select i.price_agorot::text from public.menu_items i where i.id = pg_temp.id('feast')),
  'Schnitzel:0,Shot:1,Feast:2 | 1000000',
  'each new item goes last in its category, at up to 10,000.00 ₪'
);
select is(
  pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Too dear', 'priceAgorot', 1000001),
    null, '2026-12-02 09:20+00')$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Below', 'priceAgorot', -1),
    null, '2026-12-02 09:20+00')$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Half', 'priceAgorot', 10.5),
    null, '2026-12-02 09:20+00')$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Free'),
    null, '2026-12-02 09:20+00')$c$),
  '22023|22023|22023|22023',
  'a price is whole agorot from 0 to 10,000.00 ₪, and an item has one'
);

-- Each kind of choices the menu doesn't keep, on a new item.
create function pg_temp.with_groups(groups jsonb) returns text language sql as $$
  select pg_temp.refusal(format(
    $c$select public.save_menu_item(%L, %L, %L::jsonb, null, '2026-12-02 09:25+00')$c$,
    pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Chooser', 'priceAgorot', 100,
      'optionGroups', groups)
  ))
$$;
select is(
  concat_ws('|',
    -- Six groups.
    pg_temp.with_groups((select jsonb_agg(pg_temp.grp('g' || n, 1, 0, 1)) from generate_series(1, 6) as n)),
    -- More to pick than there are options, and fewer than none.
    pg_temp.with_groups(jsonb_build_array(pg_temp.grp('g', 2, 0, 3))),
    pg_temp.with_groups(jsonb_build_array(pg_temp.grp('g', 2, 0, 1) || '{"min": 2}')),
    -- One id twice: of a group, and of an option.
    pg_temp.with_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1), pg_temp.grp('g', 1, 0, 1))),
    pg_temp.with_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1)
      || jsonb_build_object('options', jsonb_build_array(
        jsonb_build_object('id', 'o', 'name', 'One', 'priceAgorot', 0),
        jsonb_build_object('id', 'o', 'name', 'Two', 'priceAgorot', 0))))),
    -- An option over 1,000.00 ₪, and choices adding more than that together.
    pg_temp.with_groups(jsonb_build_array(pg_temp.grp('g', 1, 100001, 1))),
    pg_temp.with_groups(jsonb_build_array(pg_temp.grp('g', 2, 50001, 2))),
    -- Thirteen options.
    pg_temp.with_groups(jsonb_build_array(pg_temp.grp('g', 13, 0, 1)))
  ),
  '22023 choices|22023 choices|22023 choices|22023 choices|22023 choices|22023 choices|22023 choices|22023 choices',
  'choices are refused for too many groups, a min or max that doesn''t fit, an id twice, an option''s price and the extras'' cap, and too many options'
);
select throws_ok(
  $$insert into public.menu_items (business_id, category_id, name, price_agorot, option_groups)
    values ('e1000000-0000-4000-b000-000000000001', pg_temp.id('cat2'), 'Direct', 100,
      '[{"id": "g", "name": "G", "min": 0, "max": 1, "options": []}]')$$,
  '23514', null, 'and the table itself keeps no choices the check refuses'
);
select is(
  array[
    private.valid_option_groups('[]'),
    private.valid_option_groups((select jsonb_agg(pg_temp.grp('g' || n, 1, 0, 1)) from generate_series(1, 5) as n)),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 12, 0, 12))),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 100000, 1))),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 3, 50000, 2))),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 3, 50001, 1), pg_temp.grp('h', 1, 49999, 1))),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1) || jsonb_build_object('name', repeat('א', 40)))),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1) || jsonb_build_object('name', repeat('א', 41)))),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1) || '{"name": "Size "}')),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1) || '{"max": 0}')),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1) || '{"min": 0.5}')),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1) || '{"id": "Size"}')),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1) || '{"note": "x"}')),
    private.valid_option_groups(jsonb_build_array(pg_temp.grp('g', 1, 0, 1) || jsonb_build_object('options',
      jsonb_build_array(jsonb_build_object('id', 'o', 'name', 'One', 'priceAgorot', 1.5))))),
    private.valid_option_groups('{}'),
    private.valid_option_groups('null'),
    private.valid_option_groups('[3]')
  ],
  array[true, true, true, true, true, true, true, false, false, false, false, false, false, false, false, false, false],
  'the check''s edges, as @domain/order-taking''s optionGroups has them'
);

select is(
  pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('bcat1'), 'name', 'Elsewhere', 'priceAgorot', 100),
    null, '2026-12-02 09:30+00')$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Stocked', 'priceAgorot', 100,
      'department', pg_temp.d(4)),
    null, '2026-12-02 09:30+00')$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Odd', 'priceAgorot', 100,
      'colour', 'red'),
    null, '2026-12-02 09:30+00')$c$),
  '22023 category|22023 route|22023',
  'an item goes in a live category of the business, to a live department of it, with nothing else'
);

-- B's item, for the refusals below and isolation.
select pg_temp.keep_item('b-item', public.save_menu_item(pg_temp.p(11), pg_temp.b(),
  jsonb_build_object('category', pg_temp.id('bcat1'), 'name', 'B item', 'priceAgorot', 100),
  null, '2026-12-02 09:30+00'));
select is(
  pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('id', pg_temp.id('b-item'), 'category', pg_temp.id('cat2'),
      'name', 'Taken', 'priceAgorot', 100),
    1, '2026-12-02 09:35+00')$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(11), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Intruder', 'priceAgorot', 100),
    null, '2026-12-02 09:35+00')$c$)
  || '|' || (select i.name from public.menu_items i where i.id = pg_temp.id('b-item')),
  'P0002|42501|B item',
  'another business''s item is unknown here, and its owner writes nothing in this one'
);

-- Removed and back.
select public.archive_menu_item(pg_temp.p(2), pg_temp.a(), pg_temp.id('schnitzel'),
  '2026-12-02 10:00+00');
select is(
  (select pg_temp.utc(i.archived_at) || '|' || i.version from public.menu_items i where i.id = pg_temp.id('schnitzel'))
  || ' ' || (pg_temp.logged('menu.item.archive') = jsonb_build_object('item', pg_temp.id('schnitzel'), 'name', 'Schnitzel'))::text,
  '2026-12-02 10:00|4 true',
  'an item removed is archived, its version moved, and the log names it'
);
select is(
  pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(2), pg_temp.a(),
    jsonb_build_object('id', pg_temp.id('schnitzel'), 'category', pg_temp.id('cat2'),
      'name', 'Schnitzel', 'priceAgorot', 6800),
    4, '2026-12-02 10:01+00')$c$),
  '55000 archived',
  'a removed item isn''t saved: it is brought back first'
);
select public.restore_menu_item(pg_temp.p(2), pg_temp.a(), pg_temp.id('schnitzel'),
  '2026-12-02 10:05+00');
select is(
  (select coalesce(i.archived_at::text, 'live') || '|' || i.version from public.menu_items i where i.id = pg_temp.id('schnitzel'))
  || ' ' || (pg_temp.logged('menu.item.restore') = jsonb_build_object('item', pg_temp.id('schnitzel'), 'name', 'Schnitzel'))::text,
  'live|5 true',
  'and brought back, logged too'
);

-- Feast removed, then its category: it can't come back under a removed one.
select public.archive_menu_item(pg_temp.p(2), pg_temp.a(), pg_temp.id('feast'),
  '2026-12-02 10:10+00');
select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Starters', 'department', pg_temp.d(1)),
    jsonb_build_object('id', pg_temp.id('cat3'), 'name', 'Bar', 'department', pg_temp.d(2))
  ),
  '2026-12-02 10:15+00');
select is(
  pg_temp.refusal($c$select public.restore_menu_item(pg_temp.p(2), pg_temp.a(), pg_temp.id('feast'),
    '2026-12-02 10:16+00')$c$),
  '55000 category',
  'an item isn''t brought back while its category is removed'
);
select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Starters', 'department', pg_temp.d(1)),
    jsonb_build_object('id', pg_temp.id('cat3'), 'name', 'Bar', 'department', pg_temp.d(2)),
    jsonb_build_object('id', pg_temp.id('cat2'), 'name', 'Mains', 'department', pg_temp.d(1))
  ),
  '2026-12-02 10:20+00');

-- The cap: A has three live items (Feast is removed); 297 more fill it.
insert into public.menu_items (business_id, category_id, name, price_agorot)
select pg_temp.a(), pg_temp.id('cat1'), 'Filler ' || n, 100
from generate_series(1, 297) as n;
select is(
  pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'One more', 'priceAgorot', 100),
    null, '2026-12-02 10:25+00')$c$)
  || '|' || pg_temp.refusal($c$select public.restore_menu_item(pg_temp.p(1), pg_temp.a(), pg_temp.id('feast'),
    '2026-12-02 10:25+00')$c$),
  '54000|54000',
  'a menu has at most 300 live items: a 301st is neither added nor brought back'
);
delete from public.menu_items where business_id = pg_temp.a() and name like 'Filler %';

------------------------------------------------------------------------------
-- Sold out (no log row: everything here at 12:00 on 3 December)

select public.set_menu_item_available(pg_temp.p(2), pg_temp.a(), pg_temp.id('lemonade'), false,
  '2026-12-03 12:00+00');
select public.set_menu_item_available(pg_temp.p(3), pg_temp.a(), pg_temp.id('schnitzel'), false,
  '2026-12-03 12:00+00');
select is(
  (select string_agg(i.name || ':' || i.available || ':' || coalesce(right(i.available_by::text, 1), '-')
     || ':' || pg_temp.utc(i.available_changed_at), ',' order by i.name)
   from public.menu_items i where i.id in (pg_temp.id('lemonade'), pg_temp.id('schnitzel'))),
  'Lemonade:false:2:2026-12-03 12:00,Schnitzel:false:3:2026-12-03 12:00',
  'a manager marks a bar item sold out, and Noa, in the kitchen, a kitchen item: kept on the item, who and when'
);
select is(
  pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(4), pg_temp.a(),
    pg_temp.id('schnitzel'), true, '2026-12-03 12:00+00')$c$),
  '42501',
  'Yoav, in the bar, doesn''t touch a kitchen item'
);
select public.set_menu_item_available(pg_temp.p(4), pg_temp.a(), pg_temp.id('lemonade'), true,
  '2026-12-03 12:00+00');
select is(
  (select i.available || ':' || right(i.available_by::text, 1)
   from public.menu_items i where i.id = pg_temp.id('lemonade')),
  'true:4',
  'but brings his own bar''s item back'
);
select is(
  pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(3), pg_temp.a(),
    pg_temp.id('shot'), false, '2026-12-03 12:00+00')$c$),
  '42501',
  'an item of the kitchen''s category that goes to the bar is the bar''s: Noa doesn''t mark it'
);
select public.set_menu_item_available(pg_temp.p(4), pg_temp.a(), pg_temp.id('shot'), false,
  '2026-12-03 12:00+00');
select is(
  (select i.available || ':' || right(i.available_by::text, 1)
   from public.menu_items i where i.id = pg_temp.id('shot')),
  'false:4',
  'Yoav does'
);
select is(
  pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(5), pg_temp.a(),
    pg_temp.id('schnitzel'), true, '2026-12-03 12:00+00')$c$),
  '42501',
  'the accountant marks nothing, even with the kitchen''s row from before'
);
select is(
  concat_ws('|',
    pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(6), pg_temp.a(),
      pg_temp.id('schnitzel'), true, '2026-12-03 12:00+00')$c$),
    pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(9), pg_temp.a(),
      pg_temp.id('schnitzel'), true, '2026-12-03 12:00+00')$c$),
    pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(11), pg_temp.a(),
      pg_temp.id('schnitzel'), true, '2026-12-03 12:00+00')$c$),
    pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(11), pg_temp.b(),
      pg_temp.id('schnitzel'), true, '2026-12-03 12:00+00')$c$),
    pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(2), pg_temp.a(),
      pg_temp.id('feast'), false, '2026-12-03 12:00+00')$c$)
  ),
  '42501|P0002|P0002|P0002|55000 archived',
  'nor a worker in no department, someone who left, or another business''s owner, here or by their own; and nothing removed'
);
select is(
  (select count(*)::int from public.audit_log a
   where a.business_id = pg_temp.a() and a.created_at = '2026-12-03 12:00+00'),
  0,
  'sold out writes no log row'
);

------------------------------------------------------------------------------
-- The import

select is(
  public.import_menu(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(
      jsonb_build_object('category', jsonb_build_object('name', 'Hot drinks', 'department', pg_temp.d(2))),
      '{"item": {"name": "Espresso", "priceAgorot": 900}}'::jsonb,
      '{"item": {"name": "Cappuccino", "priceAgorot": 1400, "optionGroups": [{"id": "size", "name": "Size",
        "min": 1, "max": 1, "options": [{"id": "regular", "name": "Regular", "priceAgorot": 0},
        {"id": "large", "name": "Large", "priceAgorot": 300}]}]}}'::jsonb,
      '{"category": {"name": "MAINS"}}'::jsonb,
      '{"item": {"name": "Pasta", "priceAgorot": 5800}}'::jsonb
    ),
    '2026-12-04 09:00+00'),
  '{"categories": 1, "items": 3}'::jsonb,
  'the owner imports a pasted menu in one go: what it added comes back'
);
select is(
  (select string_agg(c.name || ':' || d.key || ':' || c.position, ',' order by c.position)
   from public.menu_categories c join public.departments d on d.id = c.department_id
   where c.business_id = pg_temp.a() and c.archived_at is null)
  || ' | ' || (select string_agg(i.name || ':' || i.position, ',' order by c.position, i.position)
   from public.menu_items i join public.menu_categories c on c.id = i.category_id
   where c.business_id = pg_temp.a() and c.name in ('Hot drinks', 'Mains') and i.archived_at is null),
  'Starters:kitchen:0,Bar:bar:1,Mains:kitchen:2,Hot drinks:bar:3 | Schnitzel:0,Shot:1,Pasta:2,Espresso:0,Cappuccino:1',
  'a new category goes last, to its department; one the menu has by that name takes the items after it'
);
select is(
  pg_temp.logged('menu.import'),
  '{"categories": 1, "items": 3}'::jsonb,
  'and the log counts them'
);
select is(
  pg_temp.refusal($c$select public.import_menu(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(
      jsonb_build_object('category', jsonb_build_object('name', 'Desserts', 'department', pg_temp.d(1))),
      '{"item": {"name": "Malabi", "priceAgorot": 2600}}'::jsonb,
      '{"item": {"name": "Broken", "priceAgorot": 100, "optionGroups": [{"id": "x"}]}}'::jsonb
    ),
    '2026-12-04 09:05+00')$c$),
  '22023 choices',
  'one row refused refuses the import'
);
select is(
  (select count(*)::int from public.menu_categories c where c.business_id = pg_temp.a() and c.name = 'Desserts')
  + (select count(*)::int from public.menu_items i where i.business_id = pg_temp.a() and i.name = 'Malabi'),
  0,
  'and nothing of it is written'
);
select is(
  pg_temp.refusal($c$select public.import_menu(pg_temp.p(1), pg_temp.a(),
    '[{"item": {"name": "Orphan", "priceAgorot": 100}}]', '2026-12-04 09:05+00')$c$)
  || '|' || pg_temp.refusal($c$select public.import_menu(pg_temp.p(1), pg_temp.a(),
    '[{"category": {"name": "Nowhere"}}]', '2026-12-04 09:05+00')$c$)
  || '|' || pg_temp.refusal($c$select public.import_menu(pg_temp.p(3), pg_temp.a(),
    '[]', '2026-12-04 09:05+00')$c$),
  '22023|22023 route|42501',
  'an item comes after its category, a new category names its department, and a worker imports nothing'
);
select is(
  pg_temp.refusal($c$select public.import_menu(pg_temp.p(1), pg_temp.a(),
    (select jsonb_agg(r.row_value order by n, r.k)
     from generate_series(1, 27) as n
     cross join lateral (values
       (1, jsonb_build_object('category', jsonb_build_object('name', 'Section ' || n, 'department', pg_temp.d(1)))),
       (2, jsonb_build_object('item', jsonb_build_object('name', 'Dish ' || n, 'priceAgorot', 100)))
     ) as r (k, row_value)),
    '2026-12-04 09:10+00')$c$)
  || '|' || (select count(*)::text from public.menu_categories c where c.business_id = pg_temp.a() and c.name like 'Section %'),
  '54000|0',
  'an import past 30 categories is refused whole'
);

------------------------------------------------------------------------------
-- Places

select pg_temp.keep_ids('place', public.set_order_places(pg_temp.p(1), pg_temp.a(),
  (select jsonb_agg(jsonb_build_object('name', n::text) order by n) from generate_series(1, 12) as n),
  '2026-12-05 09:00+00'));
select is(
  (select string_agg(p.name, ',' order by p.position) from public.order_places p
   where p.business_id = pg_temp.a() and p.archived_at is null)
  || ' | ' || (pg_temp.logged('menu.places') ->> 'added'),
  '1,2,3,4,5,6,7,8,9,10,11,12 | 12',
  'the owner sets twelve tables, in order, logged with the count'
);
select public.set_order_places(pg_temp.p(2), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('place1'), 'name', 'Bar 1'),
    jsonb_build_object('id', pg_temp.id('place2'), 'name', '2'),
    jsonb_build_object('name', '13')
  ),
  '2026-12-05 09:05+00');
select is(
  (select string_agg(p.name, ',' order by p.position) from public.order_places p
   where p.business_id = pg_temp.a() and p.archived_at is null)
  || ' | ' || pg_temp.logged('menu.places')::text,
  'Bar 1,2,13 | {"added": 1, "total": 3, "changed": 1, "archived": 10, "restored": 0}',
  'a manager renames one, keeps one, adds one and removes the rest, as the departments are saved'
);
-- B's place, for the refusals below and isolation.
select pg_temp.keep_ids('bplace', public.set_order_places(pg_temp.p(11), pg_temp.b(),
  '[{"name": "B1"}]', '2026-12-05 09:10+00'));
select is(
  concat_ws('|',
    pg_temp.refusal($c$select public.set_order_places(pg_temp.p(1), pg_temp.a(),
      (select jsonb_agg(jsonb_build_object('name', n::text)) from generate_series(1, 61) as n),
      '2026-12-05 09:15+00')$c$),
    pg_temp.refusal($c$select public.set_order_places(pg_temp.p(1), pg_temp.a(),
      '[{"name": "Bar 1"}, {"name": "bar 1"}]', '2026-12-05 09:15+00')$c$),
    pg_temp.refusal($c$select public.set_order_places(pg_temp.p(1), pg_temp.a(),
      jsonb_build_array(jsonb_build_object('id', pg_temp.id('bplace1'), 'name', 'B1')),
      '2026-12-05 09:15+00')$c$),
    pg_temp.refusal($c$select public.set_order_places(pg_temp.p(1), pg_temp.a(),
      jsonb_build_array(jsonb_build_object('name', repeat('x', 21))), '2026-12-05 09:15+00')$c$),
    pg_temp.refusal($c$select public.set_order_places(pg_temp.p(4), pg_temp.a(),
      '[{"name": "1"}]', '2026-12-05 09:15+00')$c$)
  ),
  '54000|23505|P0002|22023|42501',
  'at most 60 places, each name once, the business''s own, up to 20 characters, and only by those who run the menu'
);

------------------------------------------------------------------------------
-- Who reads the log's menu rows (private.log_perm)

insert into public.audit_log (business_id, action) values (pg_temp.a(), 'business.fixture');
select pg_temp.keep('menu rows', to_jsonb((select count(*) from public.audit_log a
  where a.business_id = pg_temp.a() and a.action like 'menu.%')));

select pg_temp.sign_in(pg_temp.p(3));
select is(
  (select count(*)::int from public.audit_log a where a.action like 'menu.%'),
  0,
  'a worker, who doesn''t run the menu, reads none of its rows'
);
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select count(*)::int from public.audit_log a
   where a.business_id = pg_temp.a() and a.action like 'menu.%'),
  (select (g.value #>> '{}')::int from got g where g.name = 'menu rows'),
  'a manager reads every one of them'
);
reset role;
insert into public.role_permissions (business_id, role, perm, allowed)
values (pg_temp.a(), 'manager', 'order_taking.edit', false);
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select count(*)::int from public.audit_log a
   where a.business_id = pg_temp.a() and a.action like 'menu.%')
  || ' ' || (select count(*)::int from public.audit_log a
   where a.business_id = pg_temp.a() and a.action = 'business.fixture'),
  '0 1',
  'and a manager lowered from running the menu none, still reading the management page''s'
);
reset role;
delete from public.role_permissions
where business_id = pg_temp.a() and role = 'manager' and perm = 'order_taking.edit';

------------------------------------------------------------------------------
-- Who reads the menu

select pg_temp.keep('counts', jsonb_build_object(
  'categories', (select count(*) from public.menu_categories c where c.business_id = pg_temp.a()),
  'items', (select count(*) from public.menu_items i where i.business_id = pg_temp.a()),
  'places', (select count(*) from public.order_places p where p.business_id = pg_temp.a())
));
select pg_temp.keep('version', to_jsonb(pg_temp.menu_version()));

-- The counts as the signed-in person reads them: categories, items, places.
create function pg_temp.reads() returns text language sql as $$
  select (select count(*) from public.menu_categories) || '/'
    || (select count(*) from public.menu_items) || '/'
    || (select count(*) from public.order_places)
$$;
create function pg_temp.all_of_a() returns text language sql as $$
  select (g.value ->> 'categories') || '/' || (g.value ->> 'items') || '/' || (g.value ->> 'places')
  from got g where g.name = 'counts'
$$;

select pg_temp.sign_in(pg_temp.p(3));
select is(pg_temp.reads(), pg_temp.all_of_a(),
  'a worker reads every category, item and place of their business, removed ones too, and none of another''s');
select throws_ok(
  $$insert into public.menu_items (business_id, category_id, name, price_agorot)
    values ('e1000000-0000-4000-b000-000000000001', pg_temp.id('cat2'), 'Mine', 100)$$,
  '42501', null, 'and writes nothing from the browser'
);
select pg_temp.sign_in(pg_temp.p(5));
select is(pg_temp.reads(), '0/0/0', 'the accountant reads none of it');
select pg_temp.sign_in(pg_temp.p(9));
select is(pg_temp.reads(), '0/0/0', 'nor someone who left');
select pg_temp.sign_in(pg_temp.p(11));
select is(pg_temp.reads(), '1/1/1', 'another business''s owner reads their own alone');
select pg_temp.sign_in(pg_temp.p(7));
select is(pg_temp.reads(), pg_temp.all_of_a(), 'a view as a worker reads what a worker does');
select pg_temp.sign_in(pg_temp.p(8));
select is(pg_temp.reads(), '0/0/0', 'and a view as the accountant nothing');
reset role;

------------------------------------------------------------------------------
-- public.order_menu

select pg_temp.sign_in(pg_temp.p(3));
select is(
  (public.order_menu(pg_temp.a()) -> 'version')::text,
  (select g.value::text from got g where g.name = 'version'),
  'a worker reads the menu at its version'
);
select is(
  public.order_menu(pg_temp.a(), (select (g.value #>> '{}')::bigint from got g where g.name = 'version')),
  null::jsonb,
  'and nothing when the version they hold is current'
);
select is(
  (select string_agg(e.value ->> 'name', ',' order by e.n)
   from jsonb_array_elements(public.order_menu(pg_temp.a()) -> 'categories') with ordinality as e (value, n))
  || ' | ' || (select string_agg(e.value ->> 'name', ',' order by e.n)
   from jsonb_array_elements(public.order_menu(pg_temp.a()) -> 'items') with ordinality as e (value, n))
  || ' | ' || (select string_agg(e.value ->> 'name', ',' order by e.n)
   from jsonb_array_elements(public.order_menu(pg_temp.a()) -> 'places') with ordinality as e (value, n)),
  'Starters,Bar,Mains,Hot drinks | Lemonade,Schnitzel,Shot,Pasta,Espresso,Cappuccino | Bar 1,2,13',
  'its live categories, items and places in their order, the removed Feast left out'
);
select is(
  (select string_agg((i ->> 'name') || ':' || coalesce(i ->> 'route', '-') || ':' || (i ->> 'available')
     || ':' || (i ->> 'priceAgorot') || ':' || jsonb_array_length(i -> 'optionGroups'), ',' order by i ->> 'name')
   from jsonb_array_elements(public.order_menu(pg_temp.a()) -> 'items') as i
   where i ->> 'name' in ('Lemonade', 'Schnitzel', 'Shot')),
  'Lemonade:' || pg_temp.d(2) || ':true:1600:0,Schnitzel:' || pg_temp.d(1) || ':false:6800:1,Shot:'
    || pg_temp.d(2) || ':false:500:0',
  'each item with where it goes, its own department over its category''s, whether it is sold out, its price and choices'
);
select pg_temp.sign_in(pg_temp.p(7));
select isnt(public.order_menu(pg_temp.a()), null::jsonb, 'a view as a worker reads it too');
select pg_temp.sign_in(pg_temp.p(5));
select throws_ok(
  $$select public.order_menu('e1000000-0000-4000-b000-000000000001')$$,
  'P0002', null, 'the accountant is answered as for no menu'
);
select pg_temp.sign_in(pg_temp.p(8));
select throws_ok(
  $$select public.order_menu('e1000000-0000-4000-b000-000000000001')$$,
  'P0002', null, 'and so is a view as the accountant'
);
select pg_temp.sign_in(pg_temp.p(11));
select throws_ok(
  $$select public.order_menu('e1000000-0000-4000-b000-000000000001')$$,
  'P0002', null, 'and another business''s owner'
);
reset role;

select pg_temp.keep('before', to_jsonb(pg_temp.menu_version()));
select public.set_menu_item_available(pg_temp.p(2), pg_temp.a(), pg_temp.id('schnitzel'), true,
  '2026-12-06 09:00+00');
select pg_temp.keep('after', to_jsonb(pg_temp.menu_version()));
select public.set_menu_item_available(pg_temp.p(2), pg_temp.a(), pg_temp.id('schnitzel'), true,
  '2026-12-06 09:05+00');
select is(
  ((select (g.value #>> '{}')::bigint from got g where g.name = 'after')
    > (select (g.value #>> '{}')::bigint from got g where g.name = 'before'))::text
  || ' ' || (pg_temp.menu_version() = (select (g.value #>> '{}')::bigint from got g where g.name = 'after'))::text,
  'true true',
  'a write moves the version, and one that changes nothing keeps it'
);

-- A department removed or brought back on the management page changes where
-- items go (public.set_departments, replaced by the migration), so it moves
-- the version too: the phone holding the one before reads the routes anew.
-- Where Lemonade, Schnitzel and Shot go, as order_menu answers the phone
-- holding the version kept as `held`, or 'nothing new'.
create function pg_temp.routes(held text) returns text language sql as $$
  select coalesce((
    select string_agg((i ->> 'name') || ':' || coalesce(i ->> 'route', '-'), ',' order by i ->> 'name')
    from jsonb_array_elements(public.order_menu(
      pg_temp.a(), (select (g.value #>> '{}')::bigint from got g where g.name = held)
    ) -> 'items') as i
    where i ->> 'name' in ('Lemonade', 'Schnitzel', 'Shot')
  ), 'nothing new')
$$;

select pg_temp.keep('before', to_jsonb(pg_temp.menu_version()));
select public.set_departments(pg_temp.p(1), pg_temp.a(),
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "floor", "name": "Floor"}]');
select pg_temp.keep('after', to_jsonb(pg_temp.menu_version()));
select pg_temp.sign_in(pg_temp.p(3));
select is(
  ((select (g.value #>> '{}')::bigint from got g where g.name = 'after')
    > (select (g.value #>> '{}')::bigint from got g where g.name = 'before'))::text
  || ' | ' || pg_temp.routes('before') || ' | ' || pg_temp.routes('after'),
  'true | Lemonade:-,Schnitzel:' || pg_temp.d(1) || ',Shot:- | nothing new',
  'removing the bar moves the version: the phone holding the one before reads its items, the category''s and the override''s, going nowhere'
);
reset role;

select pg_temp.keep('before', to_jsonb(pg_temp.menu_version()));
select public.set_departments(pg_temp.p(1), pg_temp.a(),
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"}, {"key": "floor", "name": "Floor"}]');
select pg_temp.keep('after', to_jsonb(pg_temp.menu_version()));
select public.set_departments(pg_temp.p(1), pg_temp.a(),
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"}, {"key": "floor", "name": "Floor"}]');
select pg_temp.keep('again', to_jsonb(pg_temp.menu_version()));
select pg_temp.sign_in(pg_temp.p(3));
select is(
  ((select (g.value #>> '{}')::bigint from got g where g.name = 'after')
    > (select (g.value #>> '{}')::bigint from got g where g.name = 'before'))::text
  || ' ' || ((select g.value from got g where g.name = 'again')
    = (select g.value from got g where g.name = 'after'))::text
  || ' | ' || pg_temp.routes('before') || ' | ' || pg_temp.routes('after'),
  'true true | Lemonade:' || pg_temp.d(2) || ',Schnitzel:' || pg_temp.d(1) || ',Shot:' || pg_temp.d(2)
    || ' | nothing new',
  'bringing it back moves it again, the routes back with it, and the same departments saved again keep it'
);
reset role;

------------------------------------------------------------------------------
-- Off again: nothing is read, nothing is written

update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'order_taking';
select pg_temp.sign_in(pg_temp.p(3));
select is(
  pg_temp.reads() || '|' || pg_temp.refusal($c$select public.order_menu('e1000000-0000-4000-b000-000000000001')$c$),
  '0/0/0|P0002',
  'with the module off again, the staff read none of the menu'
);
reset role;
select is(
  concat_ws('|',
    pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(2), pg_temp.a(),
      pg_temp.id('schnitzel'), false, '2026-12-06 10:00+00')$c$),
    pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(1), pg_temp.a(),
      jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Late', 'priceAgorot', 100),
      null, '2026-12-06 10:00+00')$c$),
    pg_temp.refusal($c$select public.archive_menu_item(pg_temp.p(1), pg_temp.a(),
      pg_temp.id('schnitzel'), '2026-12-06 10:00+00')$c$),
    pg_temp.refusal($c$select public.restore_menu_item(pg_temp.p(1), pg_temp.a(),
      pg_temp.id('feast'), '2026-12-06 10:00+00')$c$)
  ),
  '42501 off|42501 off|42501 off|42501 off',
  'and nobody writes to it, saying why'
);

------------------------------------------------------------------------------
-- A line's unit price

select is(
  array[
    private.unit_agorot(6800, g.groups, '[{"group": "doneness", "option": "m"}]'),
    private.unit_agorot(6800, g.groups,
      '[{"group": "doneness", "option": "wd"}, {"group": "extras", "option": "egg"},
        {"group": "extras", "option": "bacon"}]'),
    private.unit_agorot(6800, g.groups, '[]'),
    private.unit_agorot(6800, g.groups,
      '[{"group": "doneness", "option": "m"}, {"group": "doneness", "option": "wd"}]'),
    private.unit_agorot(6800, g.groups,
      '[{"group": "doneness", "option": "m"}, {"group": "extras", "option": "egg"},
        {"group": "extras", "option": "egg"}]'),
    private.unit_agorot(6800, g.groups, '[{"group": "doneness", "option": "rare"}]'),
    private.unit_agorot(6800, '[]', '[]'),
    private.unit_agorot(6800, '[]', '[{"group": "doneness", "option": "m"}]'),
    private.unit_agorot(6800, '[{"id": "x"}]', '[]')
  ],
  array[6800, 8300, null, null, null, null, 6800, null, null]::integer[],
  'a line''s unit price is the item''s and each option picked, and nothing for picks that don''t fit'
)
from (select '[
  {"id": "doneness", "name": "Doneness", "min": 1, "max": 1, "options": [
    {"id": "m", "name": "M", "priceAgorot": 0}, {"id": "wd", "name": "WD", "priceAgorot": 0}]},
  {"id": "extras", "name": "Extras", "min": 0, "max": 2, "options": [
    {"id": "egg", "name": "Egg", "priceAgorot": 600}, {"id": "cheese", "name": "Cheese", "priceAgorot": 600},
    {"id": "bacon", "name": "Bacon", "priceAgorot": 900}]}
]'::jsonb as groups) as g;

select * from finish();
rollback;
