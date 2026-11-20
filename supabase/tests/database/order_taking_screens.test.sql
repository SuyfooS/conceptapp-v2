-- Taking orders on screen (20261120000100_order_taking_screens.sql; waiter
-- mode P2). The ConceptApp team, which is no member, sets a business's menu
-- up from the console: it imports, saves the places, the categories and an
-- item, each logged with its own id, and is refused while the module is off;
-- "sold out" stays the business's own (P0002 for the team), and someone
-- neither a member nor on the team writes nothing. A worker without the key
-- and the accountant still don't run the menu. A category kept with a
-- department removed since saves, renamed and moved; sent to another removed
-- department, or new to one, it is refused. So does an item with a
-- department of its own removed since: a new price saves, and another
-- removed department, or a new item to one, is refused. A demo whose definition says
-- "orderTaking": true opens with the module on at every reset, and one that
-- doesn't with it off. The restaurant and the café have their own words for
-- the module, read by their members under RLS and by no one else's. Every
-- write passes its moment, so nothing depends on today's date. Fixed ids
-- (e3…) and numbers (050-063-xxxx), so nothing here meets the seed or
-- another test.
begin;
select plan(18);

-- A (a restaurant): 1 owner; 2 a manager; 3 a worker in the kitchen; 4 made
-- the accountant. B (a shop): 5, its owner. 6 on the ConceptApp team, a
-- member of nothing; 8 signed up, in no business and on no team. 11 and 12
-- the people of the two demo businesses.
insert into auth.users (id, aud, role, phone)
select ('e3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250063' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,8,11,12}'::int[]) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('e3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'e3000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'e3000000-0000-4000-b000-000000000002'::uuid
$$;
-- A's departments: 1 the kitchen, 2 the bar, 3 the pastry (removed below),
-- 4 the storeroom (removed from the start), 5 the bakery (an item's own,
-- removed below).
create function pg_temp.d(n integer) returns uuid language sql as $$
  select ('e3000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
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

create temporary table ids (name text primary key, id uuid not null) on commit drop;

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

insert into public.businesses (id, slug, name, template_key)
values
  (pg_temp.a(), 'order-screens-a', 'Order screens A', 'restaurant'),
  (pg_temp.b(), 'order-screens-b', 'Order screens B', 'retail');

insert into public.memberships (business_id, user_id, role)
values
  (pg_temp.a(), pg_temp.p(1), 'owner'),
  (pg_temp.a(), pg_temp.p(2), 'manager'),
  (pg_temp.a(), pg_temp.p(3), 'worker'),
  (pg_temp.a(), pg_temp.p(4), 'worker'),
  (pg_temp.b(), pg_temp.p(5), 'owner');
update public.memberships set role = 'accountant'
where business_id = pg_temp.a() and user_id = pg_temp.p(4);

insert into public.business_modules (business_id, module_key, enabled)
values (pg_temp.a(), 'order_taking', true), (pg_temp.b(), 'order_taking', true);

insert into public.departments (id, business_id, key, name, archived_at)
values
  (pg_temp.d(1), pg_temp.a(), 'kitchen', 'Kitchen', null),
  (pg_temp.d(2), pg_temp.a(), 'bar', 'Bar', null),
  (pg_temp.d(3), pg_temp.a(), 'pastry', 'Pastry', null),
  (pg_temp.d(4), pg_temp.a(), 'storeroom', 'Storeroom', '2026-11-01 10:00+00'),
  (pg_temp.d(5), pg_temp.a(), 'bakery', 'Bakery', null);
insert into public.department_members (department_id, business_id, user_id)
values (pg_temp.d(1), pg_temp.a(), pg_temp.p(3));

insert into public.platform_staff (user_id, role) values (pg_temp.p(6), 'onboarder');

------------------------------------------------------------------------------
-- Who may call what

select ok(
  not has_function_privilege('authenticated', 'public.set_menu_categories(uuid, uuid, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.set_menu_categories(uuid, uuid, jsonb, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.set_menu_categories(uuid, uuid, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'private.runs_orders(uuid, uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.runs_orders(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_order_taking(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_order_taking(uuid)', 'execute'),
  'the categories'' save is the server''s alone, and the two helpers run only inside'
);
select is(
  (select string_agg(n::text || ':' || private.runs_orders(pg_temp.a(), pg_temp.p(n))::text, ',' order by n)
   from unnest('{1,2,3,4,5,6,8}'::int[]) as n),
  '1:true,2:true,3:false,4:false,5:false,6:true,8:false',
  'the owner, a manager and the team run the menu; a worker without the key, the accountant, another business''s owner and a stranger don''t'
);

------------------------------------------------------------------------------
-- The team sets the menu up

select is(
  public.import_menu(pg_temp.p(6), pg_temp.a(),
    '[{"category": {"name": "Mains", "department": "e3000000-0000-4000-c000-000000000001"}},
      {"item": {"name": "Schnitzel", "priceAgorot": 6200}},
      {"item": {"name": "Pasta", "priceAgorot": 5800}}]',
    '2026-12-01 09:00+00'),
  '{"categories": 1, "items": 2}'::jsonb,
  'the team imports a menu into a business it is no member of'
);
select is(
  jsonb_array_length(pg_temp.keep_ids('place', public.set_order_places(pg_temp.p(6), pg_temp.a(),
    '[{"name": "1"}, {"name": "2"}]', '2026-12-01 09:01+00'))),
  2,
  'and saves its places'
);
-- Mains renamed, and Pastry added to the pastry department.
select pg_temp.keep_ids('cat', public.set_menu_categories(pg_temp.p(6), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object(
      'id', (select c.id from public.menu_categories c
             where c.business_id = pg_temp.a() and c.name = 'Mains'),
      'name', 'Main courses', 'department', pg_temp.d(1)),
    jsonb_build_object('name', 'Pastry', 'department', pg_temp.d(3))
  ),
  '2026-12-01 09:02+00'));
insert into ids (name, id)
select 'cake', (public.save_menu_item(pg_temp.p(6), pg_temp.a(),
  jsonb_build_object('category', pg_temp.id('cat2'), 'name', 'Cake', 'priceAgorot', 3200),
  null, '2026-12-01 09:03+00') ->> 'id')::uuid;
select is(
  (select string_agg(a.action || ':' || (a.actor_id = pg_temp.p(6))::text, ',' order by a.created_at)
   from public.audit_log a
   where a.business_id = pg_temp.a() and a.action like 'menu.%'),
  'menu.import:true,menu.places:true,menu.categories:true,menu.item.save:true',
  'its categories and an item save too, each logged with the team''s own id'
);
select is(
  pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(6), pg_temp.a(),
    pg_temp.id('cake'), false, '2026-12-01 09:04+00')$c$)
  || '|' || (select i.available::text from public.menu_items i where i.id = pg_temp.id('cake')),
  'P0002|true',
  '"sold out" stays the business''s own: the team is no member'
);
select is(
  pg_temp.refusal($c$select public.import_menu(pg_temp.p(8), pg_temp.a(), '[]',
    '2026-12-01 09:05+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_order_places(pg_temp.p(8), pg_temp.a(),
    '[{"name": "1"}]', '2026-12-01 09:05+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_menu_item_available(pg_temp.p(8), pg_temp.a(),
    pg_temp.id('cake'), false, '2026-12-01 09:05+00')$c$),
  '42501|42501|P0002',
  'someone neither a member nor on the team writes nothing'
);
select is(
  pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(3), pg_temp.a(), '[]',
    '2026-12-01 09:06+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(4), pg_temp.a(), '[]',
    '2026-12-01 09:06+00')$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(3), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat1'), 'name', 'Soup', 'priceAgorot', 2400),
    null, '2026-12-01 09:06+00')$c$),
  '42501|42501|42501',
  'a worker without the key and the accountant still don''t run the menu'
);

update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'order_taking';
select is(
  pg_temp.refusal($c$select public.import_menu(pg_temp.p(6), pg_temp.a(), '[]',
    '2026-12-01 09:07+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_order_places(pg_temp.p(6), pg_temp.a(),
    '[{"name": "1"}]', '2026-12-01 09:07+00')$c$),
  '42501 off|42501 off',
  'while taking orders is off, the team writes nothing either, and hears why'
);
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'order_taking';

------------------------------------------------------------------------------
-- A category kept keeps its department

-- The pastry department goes: the cake now goes nowhere.
update public.departments set archived_at = '2026-12-01 10:00+00' where id = pg_temp.d(3);

select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('cat2'), 'name', 'Cakes', 'department', pg_temp.d(3)),
    jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Main courses', 'department', pg_temp.d(1))
  ),
  '2026-12-01 10:01+00');
select is(
  (select string_agg(c.name || ':' || d.key, ',' order by c.position)
   from public.menu_categories c join public.departments d on d.id = c.department_id
   where c.business_id = pg_temp.a() and c.archived_at is null),
  'Cakes:pastry,Main courses:kitchen',
  'a category whose department was removed since is renamed and moved, keeping that department'
);
select is(
  pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
    jsonb_build_array(
      jsonb_build_object('id', pg_temp.id('cat2'), 'name', 'Cakes', 'department', pg_temp.d(4)),
      jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Main courses', 'department', pg_temp.d(1))
    ),
    '2026-12-01 10:02+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
    jsonb_build_array(
      jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Main courses', 'department', pg_temp.d(3))
    ),
    '2026-12-01 10:02+00')$c$)
  || '|' || pg_temp.refusal($c$select public.set_menu_categories(pg_temp.p(2), pg_temp.a(),
    jsonb_build_array(
      jsonb_build_object('id', pg_temp.id('cat2'), 'name', 'Cakes', 'department', pg_temp.d(3)),
      jsonb_build_object('id', pg_temp.id('cat1'), 'name', 'Main courses', 'department', pg_temp.d(1)),
      jsonb_build_object('name', 'Tarts', 'department', pg_temp.d(3))
    ),
    '2026-12-01 10:02+00')$c$),
  '22023 route|22023 route|22023 route',
  'but moved to another removed department, moved to a removed one it never had, or new to a removed one, it is refused'
);
select is(
  (select string_agg(c.name, ',' order by c.position) from public.menu_categories c
   where c.business_id = pg_temp.a() and c.archived_at is null),
  'Cakes,Main courses',
  'and nothing of a refused save is kept'
);

------------------------------------------------------------------------------
-- An item kept keeps its department

-- The pasta goes to the bakery, a department of its own; then the bakery goes.
select public.save_menu_item(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object('id', i.id, 'category', i.category_id, 'name', i.name,
    'priceAgorot', i.price_agorot, 'department', pg_temp.d(5)),
  i.version, '2026-12-01 10:03+00')
from public.menu_items i
where i.business_id = pg_temp.a() and i.name = 'Pasta';
update public.departments set archived_at = '2026-12-01 10:04+00' where id = pg_temp.d(5);

-- Its price changed, sent whole as the screens send it: its own department too.
select public.save_menu_item(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object('id', i.id, 'category', i.category_id, 'name', i.name,
    'priceAgorot', 6000, 'department', i.department_id),
  i.version, '2026-12-01 10:05+00')
from public.menu_items i
where i.business_id = pg_temp.a() and i.name = 'Pasta';
select is(
  (select i.price_agorot::text || ':' || d.key
   from public.menu_items i join public.departments d on d.id = i.department_id
   where i.business_id = pg_temp.a() and i.name = 'Pasta'),
  '6000:bakery',
  'an item whose own department was removed since saves a new price, keeping that department'
);
select is(
  pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(2), pg_temp.a(),
    jsonb_build_object('id', i.id, 'category', i.category_id, 'name', i.name,
      'priceAgorot', i.price_agorot, 'department', pg_temp.d(4)),
    i.version, '2026-12-01 10:06+00')
    from public.menu_items i
    where i.business_id = pg_temp.a() and i.name = 'Pasta'$c$)
  || '|' || pg_temp.refusal($c$select public.save_menu_item(pg_temp.p(2), pg_temp.a(),
    jsonb_build_object('category', pg_temp.id('cat1'), 'name', 'Ravioli',
      'priceAgorot', 6400, 'department', pg_temp.d(5)),
    null, '2026-12-01 10:06+00')$c$),
  '22023 route|22023 route',
  'but sent to another removed department, or new to a removed one, it is refused'
);

------------------------------------------------------------------------------
-- The demo

insert into private.demo_businesses (business_id, definition)
values
  ('e3000000-0000-4000-b000-000000000011', $json$
  {
    "slug": "order-screens-on", "name": "Demo restaurant O", "accent": "#2563eb",
    "address": "Demo street 4", "shabbat_city": "telAviv",
    "template": "restaurant", "renews": false, "orderTaking": true,
    "people": [
      { "user_id": "e3000000-0000-4000-a000-000000000011", "role": "owner", "name": "Owner O" }
    ]
  }
  $json$),
  ('e3000000-0000-4000-b000-000000000012', $json$
  {
    "slug": "order-screens-off", "name": "Demo restaurant F", "accent": "#2563eb",
    "address": "Demo street 5", "shabbat_city": "telAviv",
    "template": "restaurant", "renews": false,
    "people": [
      { "user_id": "e3000000-0000-4000-a000-000000000012", "role": "owner", "name": "Owner F" }
    ]
  }
  $json$);
set local role service_role;
select public.reset_demo_business('e3000000-0000-4000-b000-000000000011');
select public.reset_demo_business('e3000000-0000-4000-b000-000000000012');
reset role;
-- A visitor switches it off; the next reset puts it back as the definition says.
update public.business_modules set enabled = false
where business_id = 'e3000000-0000-4000-b000-000000000011' and module_key = 'order_taking';
set local role service_role;
select public.reset_demo_business('e3000000-0000-4000-b000-000000000011');
reset role;
select is(
  (select string_agg(b.slug || ':' || bm.enabled::text || ':' || (
      select count(*)::text from public.menu_items i where i.business_id = b.id
    ), ',' order by b.slug)
   from public.businesses b
   join public.business_modules bm on bm.business_id = b.id and bm.module_key = 'order_taking'
   where b.id in ('e3000000-0000-4000-b000-000000000011', 'e3000000-0000-4000-b000-000000000012')),
  'order-screens-off:false:13,order-screens-on:true:13',
  'a demo whose definition says "orderTaking" opens with taking orders on at every reset, and one that doesn''t with it off, both with the sample menu'
);

------------------------------------------------------------------------------
-- The restaurant's and the café's words

select is(
  (select string_agg(w.template_key || ':' || w.sentence || ':' || w.base_sentence, ',' order by w.template_key)
   from public.template_wording w where w.key = 'modules.order_taking.name')
  || '|' || (select count(*)::text from public.template_wording w
   where w.template_key in ('general', 'retail') and w.key like 'app.orders.%'),
  'cafe-bar:מצב מלצרות:קבלת הזמנות,restaurant:מצב מלצרות:קבלת הזמנות|0',
  'the restaurant and the café call the module מצב מלצרות, written against the app''s name for it; the shop and the general template keep the app''s words'
);
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select string_agg(w.sentence, ',' order by w.key) from public.template_wording w
   where w.key in ('modules.order_taking.name', 'app.orders.menu.add')),
  'הוספת מנה,מצב מלצרות',
  'a member of a restaurant reads them'
);
reset role;
select pg_temp.sign_in(pg_temp.p(5));
select is(
  (select count(*)::integer from public.template_wording w where w.key like 'app.orders.%'
     or w.key like 'modules.order_taking.%'),
  0,
  'and a shop''s member none of them'
);
reset role;

select * from finish();
rollback;
