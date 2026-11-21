-- Taking orders: choices on screen (20261123000100_order_taking_choices.sql;
-- waiter mode P6). A demo restaurant starts with the design's choices on its
-- sample menu, exactly the twins' (a side for the schnitzel, a doneness and
-- extras for the burger, a size for the coffee and the beer, extras for the
-- salad), every other item with none, each kept as the menu keeps choices.
-- Its sample coffees and beers go with their size at the prices they had,
-- frozen as a send freezes them and in their rounds' hashes: the same round
-- sent again is answered, and one with no size is another round. A burger
-- sent with its extras picked first is frozen doneness first, at 74.00, and
-- another doneness is a line of its own; choices that don't fit are refused
-- as choices; a salad goes with none. A reset gives back the groups a
-- visitor changed, and the seed run again adds nothing; the orders' seed run
-- alone after the coffee lost its "רגיל" still writes them, the coffees with
-- no choice. The restaurant's and the café's words, and nobody else's, and
-- neither seed for anyone but its owner. Every send passes its moment, so
-- nothing depends on today's date. Fixed ids (e9…) and numbers
-- (050-069-xxxx), so nothing here meets the seed or another test.
begin;
select plan(18);

-- 1 the owner; 2 a manager on the floor and at the bar, who sends table 7
-- and the takeaway; 3 a cook; 4 a bartender, who sends table 4.
insert into auth.users (id, aud, role, phone)
select ('e9000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250069' || lpad(n::text, 4, '0')
from generate_series(1, 4) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('e9000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.demo() returns uuid language sql as $$
  select 'e9000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.k(n integer) returns uuid language sql as $$
  select ('e9000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.at() returns timestamptz language sql as $$
  select '2026-11-23 18:00+00'::timestamptz
$$;
create function pg_temp.item(item_name text) returns uuid language sql as $$
  select i.id from public.menu_items i
  where i.business_id = pg_temp.demo() and i.name = item_name and i.archived_at is null
$$;
create function pg_temp.place(place_name text) returns jsonb language sql as $$
  select jsonb_build_object('place', p.id) from public.order_places p
  where p.business_id = pg_temp.demo() and p.name = place_name and p.archived_at is null
$$;
-- A line of the item with its picks.
create function pg_temp.li(item_name text, quantity integer, picks text) returns jsonb language sql as $$
  select jsonb_build_object('item', pg_temp.item(item_name), 'quantity', quantity, 'choices', picks::jsonb)
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

-- A send by `actor` of `lines`, with `round_key`, to `target`.
create function pg_temp.send_call(actor uuid, round_key uuid, target jsonb, lines jsonb) returns text language sql as $$
  select format(
    'select public.send_order_round(%L::uuid, %L::uuid, %L::uuid, %L::jsonb, %L::jsonb, %L::timestamptz)',
    actor, pg_temp.demo(), round_key, target, lines, pg_temp.at()
  )
$$;

-- The seeded round at a place, or takeaway 1's, sent again by the manager.
create function pg_temp.again(place_name text, lines jsonb) returns text language sql as $$
  select pg_temp.refusal(pg_temp.send_call(
    pg_temp.p(2),
    r.id,
    case
      when place_name is null then jsonb_build_object('takeaway', true, 'label', 'חולצה אדומה'::text)
      else jsonb_build_object('place', o.place_id)
    end,
    lines
  ))
  from public.order_rounds r
  join public.orders o on o.id = r.order_id
  left join public.order_places p on p.id = o.place_id
  where o.business_id = pg_temp.demo()
    and (p.name = place_name or (place_name is null and o.takeaway_no = 1))
$$;

-- A line of the demo's seeded order at a place, or of takeaway 1.
create function pg_temp.seeded_line(place_name text, item_name text)
returns table (unit integer, choices jsonb)
language sql as $$
  select l.unit_agorot, l.choices
  from public.order_lines l
  join public.order_tickets t on t.id = l.ticket_id
  join public.orders o on o.id = t.order_id
  left join public.order_places p on p.id = o.place_id
  where o.business_id = pg_temp.demo() and l.name = item_name
    and (p.name = place_name or (place_name is null and o.takeaway_no = 1))
$$;

insert into private.demo_businesses (business_id, definition)
values ('e9000000-0000-4000-b000-000000000001', $json$
  {
    "slug": "order-choices-demo", "name": "Demo restaurant C", "accent": "#2563eb",
    "address": "Demo street 9", "shabbat_city": "telAviv",
    "template": "restaurant", "renews": false, "orderTaking": true,
    "people": [
      { "user_id": "e9000000-0000-4000-a000-000000000001", "role": "owner", "name": "Owner C" },
      { "user_id": "e9000000-0000-4000-a000-000000000002", "role": "manager", "name": "Manager C", "departments": ["floor", "bar"] },
      { "user_id": "e9000000-0000-4000-a000-000000000003", "role": "worker", "name": "Cook C", "departments": ["kitchen"] },
      { "user_id": "e9000000-0000-4000-a000-000000000004", "role": "worker", "name": "Bartender C", "departments": ["bar"] }
    ]
  }
  $json$);
set local role service_role;
select public.reset_demo_business('e9000000-0000-4000-b000-000000000001');
reset role;

------------------------------------------------------------------------------
-- The sample menu's choices

select is(
  (select count(*)::integer
   from public.menu_items i
   join (values
     ('סלט ירוק', '[{"id":"extras","name":"תוספות","min":0,"max":2,"options":[{"id":"feta","name":"פטה","priceAgorot":600},{"id":"egg","name":"ביצה קשה","priceAgorot":500}]}]'::jsonb),
     ('שניצל', '[{"id":"side","name":"תוספת","min":1,"max":1,"options":[{"id":"fries","name":"צ''יפס","priceAgorot":0},{"id":"mash","name":"פירה","priceAgorot":0},{"id":"side-salad","name":"סלט","priceAgorot":0}]}]'::jsonb),
     ('המבורגר', '[{"id":"doneness","name":"מידת עשייה","min":1,"max":1,"options":[{"id":"mr","name":"מדיום רייר","priceAgorot":0},{"id":"m","name":"מדיום","priceAgorot":0},{"id":"mw","name":"מדיום וול","priceAgorot":0},{"id":"wd","name":"וול דאן","priceAgorot":0}]},{"id":"extras","name":"תוספות","min":0,"max":2,"options":[{"id":"egg","name":"ביצה","priceAgorot":600},{"id":"cheese","name":"גבינה","priceAgorot":600}]}]'::jsonb),
     ('קפה', '[{"id":"size","name":"גודל","min":1,"max":1,"options":[{"id":"regular","name":"רגיל","priceAgorot":0},{"id":"large","name":"גדול","priceAgorot":400}]}]'::jsonb),
     ('בירה מהחבית', '[{"id":"beer-size","name":"גודל","min":1,"max":1,"options":[{"id":"third","name":"שליש","priceAgorot":0},{"id":"half","name":"חצי","priceAgorot":800}]}]'::jsonb)
   ) as want (name, groups) on want.name = i.name and i.option_groups = want.groups
   where i.business_id = pg_temp.demo()),
  5,
  'a demo restaurant''s schnitzel, burger, coffee, beer and salad start with the design''s choices, the twins'' ids and all'
);
select ok(
  (select count(*) from public.menu_items i
   where i.business_id = pg_temp.demo() and i.option_groups = '[]'::jsonb) = 8
  and (select bool_and(private.valid_option_groups(i.option_groups)) from public.menu_items i
       where i.business_id = pg_temp.demo()),
  'every other item of the thirteen has none, and each item''s choices are kept as the menu keeps them'
);

------------------------------------------------------------------------------
-- The sample orders, with their sizes

select is(
  (select l.choices from pg_temp.seeded_line(null, 'קפה') l),
  '[{"group":"size","groupName":"גודל","option":"regular","optionName":"רגיל","priceAgorot":0}]'::jsonb,
  'takeaway 1''s coffees were sent "רגיל", frozen by name and price as a send freezes them'
);
select is(
  (select l.choices from pg_temp.seeded_line('7', 'בירה מהחבית') l),
  '[{"group":"beer-size","groupName":"גודל","option":"third","optionName":"שליש","priceAgorot":0}]'::jsonb,
  'and table 7''s beers "שליש"'
);
select is(
  (select l.unit::text from pg_temp.seeded_line(null, 'קפה') l)
    || ',' || (select l.unit::text from pg_temp.seeded_line('7', 'בירה מהחבית') l)
    || ',' || (select l.choices::text from pg_temp.seeded_line('7', 'לימונדה') l),
  '1200,2800,[]',
  'each at the price it had before the sizes, the lemonade beside the beers with none'
);
select is(
  pg_temp.again('7', jsonb_build_array(
    pg_temp.li('בירה מהחבית', 2, '[{"group":"beer-size","option":"third"}]'),
    pg_temp.li('לימונדה', 1, '[]')
  ))
  || '|' || pg_temp.again(null, jsonb_build_array(
    pg_temp.li('קפה', 2, '[{"group":"size","option":"regular"}]')
  )),
  'none|none',
  'each seeded round is a send of its lines with their size: the same again is answered, not refused'
);
select is(
  pg_temp.again('7', jsonb_build_array(
    pg_temp.li('בירה מהחבית', 2, '[]'),
    pg_temp.li('לימונדה', 1, '[]')
  )),
  '23505 body',
  'and the same with no size is another round'
);

------------------------------------------------------------------------------
-- A send with choices

select lives_ok(
  pg_temp.send_call(pg_temp.p(1), pg_temp.k(1), pg_temp.place('9'), jsonb_build_array(
    pg_temp.li('המבורגר', 2, '[{"group":"extras","option":"cheese"},{"group":"doneness","option":"m"}]'),
    pg_temp.li('המבורגר', 1, '[{"group":"doneness","option":"wd"}]')
  )),
  'the owner sends table 9 two burgers "מדיום" with cheese, picked extras first, and one "וול דאן"'
);
select is(
  (select string_agg(
     l.quantity || ':' || l.unit_agorot || ':'
       || (select string_agg(c.value ->> 'optionName', ' · ' order by c.n)
           from jsonb_array_elements(l.choices) with ordinality as c (value, n))
       || ':' || (l.choices -> 0 ->> 'group'),
     ',' order by l.position)
   from public.order_lines l
   join public.order_tickets t on t.id = l.ticket_id
   where t.round_id = pg_temp.k(1)),
  '2:7400:מדיום · גבינה:doneness,1:6800:וול דאן:doneness',
  'each line frozen in the item''s order, doneness first, at 74.00 with the cheese; the other doneness a line of its own'
);
select is(
  pg_temp.refusal(pg_temp.send_call(pg_temp.p(1), pg_temp.k(2), pg_temp.place('11'),
    jsonb_build_array(pg_temp.li('המבורגר', 1, '[]'))))
  || '|' || pg_temp.refusal(pg_temp.send_call(pg_temp.p(1), pg_temp.k(3), pg_temp.place('11'),
    jsonb_build_array(pg_temp.li('המבורגר', 1, '[{"group":"doneness","option":"m"},{"group":"doneness","option":"wd"}]'))))
  || '|' || pg_temp.refusal(pg_temp.send_call(pg_temp.p(1), pg_temp.k(4), pg_temp.place('11'),
    jsonb_build_array(pg_temp.li('המבורגר', 1, '[{"group":"doneness","option":"m"},{"group":"extras","option":"bacon"}]'))))
  || '|' || pg_temp.refusal(pg_temp.send_call(pg_temp.p(1), pg_temp.k(5), pg_temp.place('11'),
    jsonb_build_array(pg_temp.li('קפה', 1, '[{"group":"size","option":"regular"},{"group":"size","option":"large"}]')))),
  '22023 choices|22023 choices|22023 choices|22023 choices',
  'a burger with no doneness, with two, or with an extra it doesn''t have, and a coffee in both sizes, are refused as choices'
);
select is(
  pg_temp.refusal(pg_temp.send_call(pg_temp.p(1), pg_temp.k(6), pg_temp.place('10'),
    jsonb_build_array(pg_temp.li('סלט ירוק', 1, '[]')))),
  'none',
  'a salad, whose extras are optional, goes with none'
);
select is(
  (select l.unit_agorot || ':' || l.choices::text
   from public.order_lines l
   join public.order_tickets t on t.id = l.ticket_id
   where t.round_id = pg_temp.k(6)),
  '3600:[]',
  'at its price'
);

------------------------------------------------------------------------------
-- The reset and the seeds again

update public.menu_items i set option_groups = '[]'::jsonb
where i.id = pg_temp.item('המבורגר');
set local role service_role;
select public.reset_demo_business('e9000000-0000-4000-b000-000000000001');
reset role;
select ok(
  (select i.option_groups from public.menu_items i
   where i.business_id = pg_temp.demo() and i.name = 'המבורגר')
  = '[{"id":"doneness","name":"מידת עשייה","min":1,"max":1,"options":[{"id":"mr","name":"מדיום רייר","priceAgorot":0},{"id":"m","name":"מדיום","priceAgorot":0},{"id":"mw","name":"מדיום וול","priceAgorot":0},{"id":"wd","name":"וול דאן","priceAgorot":0}]},{"id":"extras","name":"תוספות","min":0,"max":2,"options":[{"id":"egg","name":"ביצה","priceAgorot":600},{"id":"cheese","name":"גבינה","priceAgorot":600}]}]'::jsonb,
  'a reset gives back the burger''s choices a visitor took off'
);
select private.seed_demo_order_taking(pg_temp.demo());
select is(
  (select count(*)::integer from public.menu_items i where i.business_id = pg_temp.demo()),
  13,
  'and the menu''s seed run again on a business with a menu adds nothing'
);

-- The coffee without its "רגיל", and only the orders seeded again, as the
-- browser tests do.
update public.menu_items i
set option_groups = '[{"id":"size","name":"גודל","min":1,"max":1,"options":[{"id":"large","name":"גדול","priceAgorot":400}]}]'::jsonb
where i.id = pg_temp.item('קפה');
delete from public.orders o where o.business_id = pg_temp.demo();
delete from private.order_day_counters c where c.business_id = pg_temp.demo();
select private.seed_demo_orders(pg_temp.demo());
select is(
  (select count(*)::text from public.orders o where o.business_id = pg_temp.demo())
    || ':' || (select l.unit::text || ':' || l.choices::text from pg_temp.seeded_line(null, 'קפה') l)
    || ':' || (select l.choices -> 0 ->> 'optionName' from pg_temp.seeded_line('7', 'בירה מהחבית') l),
  '3:1200:[]:שליש',
  'the orders'' seed still writes its three orders: the coffees with no choice at their price, the beers "שליש"'
);

------------------------------------------------------------------------------
-- The words

select is(
  (select string_agg(w.template_key || ':' || w.sentence || ':' || w.base_sentence, ',' order by w.template_key)
   from public.template_wording w
   where w.key = 'app.orders.picker.needsChoice'),
  'cafe-bar:יש לה בחירות: הקשה פותחת אותן:יש לו בחירות: הקשה פותחת אותן,'
    || 'restaurant:יש לה בחירות: הקשה פותחת אותן:יש לו בחירות: הקשה פותחת אותן',
  'the restaurant and the café say an item with a choice to make opens its choices now'
);
select is(
  (select string_agg(w.template_key || ':' || w.key, ',' order by w.template_key, w.key)
   from public.template_wording w
   where w.key in ('app.orders.picker.optionalChoices', 'app.orders.menu.group.requiredHint')),
  'cafe-bar:app.orders.menu.group.requiredHint,cafe-bar:app.orders.picker.optionalChoices,'
    || 'restaurant:app.orders.menu.group.requiredHint,restaurant:app.orders.picker.optionalChoices',
  'and have their own words for an item with optional choices and for "חובה לבחור", which no other template has'
);

------------------------------------------------------------------------------
-- Who may call what

select ok(
  not has_function_privilege('authenticated', 'private.seed_demo_order_taking(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.seed_demo_order_taking(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_order_taking(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_orders(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.seed_demo_orders(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_orders(uuid)', 'execute'),
  'neither seed runs for anyone but its owner, inside the reset'
);

select * from finish();
rollback;
