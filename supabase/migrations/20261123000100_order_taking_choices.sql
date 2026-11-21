-- Taking orders: choices, on screen (waiter mode P6, #191).
--
-- The choices themselves need nothing new here: P1's menu keeps and checks
-- an item's groups (private.valid_option_groups), public.save_menu_item
-- and public.import_menu write them, and P3's send checks a line's picks
-- against them and freezes them by name and price
-- (20261120000300_order_taking_orders.sql), as every read gives them back.
-- No table, grant, policy, read or write changes, and
-- packages/db/database.types.ts doesn't change. What this adds:
--
--   the demo's choices  the sample menu gets the groups the twins have
--                       (app/design/order-taking/data.ts, held equal by
--                       tooling/demo-choices.test.ts): a side for the
--                       schnitzel, a doneness and extras for the burger, a
--                       size for the coffee and for the beer, and extras
--                       for the green salad, which only has optional ones;
--                       and the sample orders' coffees and beers are sent
--                       with their size, at the same prices
--   the words           the restaurant's and the café's own sentences for
--                       an item with a choice to make, one with optional
--                       choices only, and the editor's "חובה לבחור"
--
-- It replaces private.seed_demo_order_taking
-- (20261120000100_order_taking_screens.sql's) and private.seed_demo_orders
-- (20261120000400_order_taking_orders_demo.sql's), the same signatures,
-- revoked again all the same. Nothing is reset here: the local seed resets
-- the demo after the migrations, the browser tests reseed the menu
-- themselves, and the hosted demo's restaurant, whose module is still off,
-- takes the groups at its next reset.

------------------------------------------------------------------------------
-- 1. The sample menu, with its choices

-- 20261120000100_order_taking_screens.sql's, with each item's groups of
-- choices: the demo's, as the design's §10 has them, with the twin's ids.
-- Then, as before: the module switched on first when the business's
-- definition says "orderTaking": true (supabase/seed.sql's restaurant;
-- tooling/demo-order-taking.test.ts keeps supabase/hosted-demo.sql without
-- it), four categories, thirteen items, the fish of the day sold out, and
-- twelve tables. Only a demo business opened from the restaurant template,
-- and only once: a business that has categories already is left as it is.
-- Straight into the tables, as a seed, so the log starts empty of it.
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

  -- Each item's groups as one literal, so the twins' test reads them.
  insert into public.menu_items (business_id, category_id, name, price_agorot, position, option_groups)
  values
    (business, starters, 'פוקאצ''ה', 2800, 0, '[]'::jsonb),
    (business, starters, 'סלט ירוק', 3600, 1, '[{"id":"extras","name":"תוספות","min":0,"max":2,"options":[{"id":"feta","name":"פטה","priceAgorot":600},{"id":"egg","name":"ביצה קשה","priceAgorot":500}]}]'::jsonb),
    (business, starters, 'חומוס', 3200, 2, '[]'::jsonb),
    (business, mains, 'שניצל', 6200, 0, '[{"id":"side","name":"תוספת","min":1,"max":1,"options":[{"id":"fries","name":"צ''יפס","priceAgorot":0},{"id":"mash","name":"פירה","priceAgorot":0},{"id":"side-salad","name":"סלט","priceAgorot":0}]}]'::jsonb),
    (business, mains, 'המבורגר', 6800, 1, '[{"id":"doneness","name":"מידת עשייה","min":1,"max":1,"options":[{"id":"mr","name":"מדיום רייר","priceAgorot":0},{"id":"m","name":"מדיום","priceAgorot":0},{"id":"mw","name":"מדיום וול","priceAgorot":0},{"id":"wd","name":"וול דאן","priceAgorot":0}]},{"id":"extras","name":"תוספות","min":0,"max":2,"options":[{"id":"egg","name":"ביצה","priceAgorot":600},{"id":"cheese","name":"גבינה","priceAgorot":600}]}]'::jsonb),
    (business, mains, 'פסטה', 5800, 2, '[]'::jsonb),
    (business, desserts, 'מלבי', 2600, 0, '[]'::jsonb),
    (business, desserts, 'עוגת שוקולד', 3200, 1, '[]'::jsonb),
    (business, drinks, 'לימונדה', 1600, 0, '[]'::jsonb),
    (business, drinks, 'מים', 1000, 1, '[]'::jsonb),
    (business, drinks, 'קפה', 1200, 2, '[{"id":"size","name":"גודל","min":1,"max":1,"options":[{"id":"regular","name":"רגיל","priceAgorot":0},{"id":"large","name":"גדול","priceAgorot":400}]}]'::jsonb),
    (business, drinks, 'בירה מהחבית', 2800, 3, '[{"id":"beer-size","name":"גודל","min":1,"max":1,"options":[{"id":"third","name":"שליש","priceAgorot":0},{"id":"half","name":"חצי","priceAgorot":800}]}]'::jsonb);
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
-- 2. The sample orders, with their sizes

-- 20261120000400_order_taking_orders_demo.sql's, with the coffees and the
-- beers sent with their size as a waiter would send them now: takeaway 1's
-- two coffees "רגיל" and table 7's two beers "שליש", at the prices they had
-- (the sizes add nothing), their choices frozen by name and price as
-- public.send_order_round freezes them, and in each round's body hash, so a
-- seeded round reads as a real send of it. Should the item no longer have
-- that size (a visitor changed it, and only the orders are seeded again),
-- the line goes with no choice at the item's price, and the seed still
-- stands. Then, as before: table 4 waiting for the kitchen, table 7's drinks
-- ready at the bar, and a takeaway's coffees, from the sample menu and
-- tables, at times relative to now; sent by the first manager the
-- definition names and the first worker in a department that takes orders,
-- in the order the definition names them (tooling/demo-orders.test.ts keeps
-- both definitions holding them). Only a demo business opened from the
-- restaurant template, and only once: a business that has orders keeps
-- them. Straight into the tables, as a seed, so the log starts empty of it,
-- and whatever goes wrong the reset still stands.
create or replace function private.seed_demo_orders(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  people jsonb;
  kitchen uuid;
  bar uuid;
  table_four uuid;
  table_seven uuid;
  manager_person uuid;
  worker_person uuid;
  hummus public.menu_items%rowtype;
  focaccia public.menu_items%rowtype;
  beer public.menu_items%rowtype;
  lemonade public.menu_items%rowtype;
  coffee public.menu_items%rowtype;
  beer_picks jsonb := '[{"group":"beer-size","option":"third"}]'::jsonb;
  beer_unit integer;
  beer_frozen jsonb;
  coffee_picks jsonb := '[{"group":"size","option":"regular"}]'::jsonb;
  coffee_unit integer;
  coffee_frozen jsonb;
  sent_at_time timestamptz;
  order_ref uuid;
  round_ref uuid;
  ticket_ref uuid;
  order_day date;
begin
  if not exists (
      select 1
      from public.businesses b
      join private.demo_businesses d on d.business_id = b.id
      where b.id = business and b.template_key = 'restaurant'
    )
    or exists (select 1 from public.orders o where o.business_id = business)
  then
    return;
  end if;

  begin
    select case
        when jsonb_typeof(d.definition -> 'people') = 'array' then d.definition -> 'people'
        else '[]'::jsonb
      end
    into people
    from private.demo_businesses d
    where d.business_id = business;

    select dep.id into kitchen
    from public.departments dep
    where dep.business_id = business and dep.key = 'kitchen' and dep.archived_at is null;
    select dep.id into bar
    from public.departments dep
    where dep.business_id = business and dep.key = 'bar' and dep.archived_at is null;
    select p.id into table_four
    from public.order_places p
    where p.business_id = business and p.name = '4' and p.archived_at is null;
    select p.id into table_seven
    from public.order_places p
    where p.business_id = business and p.name = '7' and p.archived_at is null;
    select i.* into hummus from public.menu_items i
    where i.business_id = business and i.name = 'חומוס' and i.archived_at is null;
    select i.* into focaccia from public.menu_items i
    where i.business_id = business and i.name = 'פוקאצ''ה' and i.archived_at is null;
    select i.* into beer from public.menu_items i
    where i.business_id = business and i.name = 'בירה מהחבית' and i.archived_at is null;
    select i.* into lemonade from public.menu_items i
    where i.business_id = business and i.name = 'לימונדה' and i.archived_at is null;
    select i.* into coffee from public.menu_items i
    where i.business_id = business and i.name = 'קפה' and i.archived_at is null;

    -- Who: by role, in the order the definition names them.
    select m.user_id into manager_person
    from jsonb_array_elements(people) with ordinality as person (value, ordinality)
    join public.memberships m
      on m.business_id = business
      and m.user_id::text = person.value ->> 'user_id'
      and m.active
    where m.role = 'manager'::public.member_role
    order by person.ordinality
    limit 1;
    select m.user_id into worker_person
    from jsonb_array_elements(people) with ordinality as person (value, ordinality)
    join public.memberships m
      on m.business_id = business
      and m.user_id::text = person.value ->> 'user_id'
      and m.active
    where m.role = 'worker'::public.member_role
      and private.in_taker_department(business, m.user_id)
    order by person.ordinality
    limit 1;

    if kitchen is null or bar is null or table_four is null or table_seven is null
      or hummus.id is null or focaccia.id is null or beer.id is null
      or lemonade.id is null or coffee.id is null
      or manager_person is null or worker_person is null
    then
      return;
    end if;

    -- The sizes, priced and frozen as the send does it; none when the item
    -- no longer has them.
    beer_unit := private.unit_agorot(beer.price_agorot, beer.option_groups, beer_picks);
    if beer_unit is null then
      beer_picks := '[]'::jsonb;
      beer_unit := beer.price_agorot;
    end if;
    select coalesce(jsonb_agg(
        jsonb_build_object(
          'group', g.value -> 'id',
          'groupName', g.value -> 'name',
          'option', o.value -> 'id',
          'optionName', o.value -> 'name',
          'priceAgorot', o.value -> 'priceAgorot'
        )
        order by g.n, o.n
      ), '[]'::jsonb)
    into beer_frozen
    from jsonb_array_elements(beer.option_groups) with ordinality as g (value, n)
    cross join lateral jsonb_array_elements(g.value -> 'options') with ordinality as o (value, n)
    where exists (
      select 1 from jsonb_array_elements(beer_picks) as p (value)
      where p.value -> 'group' = g.value -> 'id' and p.value -> 'option' = o.value -> 'id'
    );
    coffee_unit := private.unit_agorot(coffee.price_agorot, coffee.option_groups, coffee_picks);
    if coffee_unit is null then
      coffee_picks := '[]'::jsonb;
      coffee_unit := coffee.price_agorot;
    end if;
    select coalesce(jsonb_agg(
        jsonb_build_object(
          'group', g.value -> 'id',
          'groupName', g.value -> 'name',
          'option', o.value -> 'id',
          'optionName', o.value -> 'name',
          'priceAgorot', o.value -> 'priceAgorot'
        )
        order by g.n, o.n
      ), '[]'::jsonb)
    into coffee_frozen
    from jsonb_array_elements(coffee.option_groups) with ordinality as g (value, n)
    cross join lateral jsonb_array_elements(g.value -> 'options') with ordinality as o (value, n)
    where exists (
      select 1 from jsonb_array_elements(coffee_picks) as p (value)
      where p.value -> 'group' = g.value -> 'id' and p.value -> 'option' = o.value -> 'id'
    );

    -- Table 4: the worker's, six minutes ago, the kitchen's still to make.
    sent_at_time := now() - interval '6 minutes';
    order_day := private.order_business_day(business, sent_at_time);
    insert into public.orders (business_id, place_id, day, opened_by, opened_at)
    values (business, table_four, order_day, worker_person, sent_at_time)
    returning id into order_ref;
    round_ref := gen_random_uuid();
    insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
    values (
      round_ref, business, order_ref,
      private.order_round_hash(
        jsonb_build_object('place', table_four),
        jsonb_build_array(
          jsonb_build_object(
            'item', hummus.id, 'quantity', 1, 'note', 'בלי שום'::text, 'allergy', true,
            'held', false, 'choices', '[]'::jsonb
          ),
          jsonb_build_object(
            'item', focaccia.id, 'quantity', 1, 'note', null::text, 'allergy', false,
            'held', false, 'choices', '[]'::jsonb
          )
        )
      ),
      worker_person, sent_at_time
    );
    insert into public.order_tickets (business_id, order_id, round_id, department_id, status)
    values (business, order_ref, round_ref, kitchen, 'new')
    returning id into ticket_ref;
    insert into public.order_lines (
      business_id, ticket_id, item_id, name, unit_agorot, quantity, note, allergy, position
    )
    values
      (business, ticket_ref, hummus.id, hummus.name, hummus.price_agorot, 1, 'בלי שום', true, 0),
      (business, ticket_ref, focaccia.id, focaccia.name, focaccia.price_agorot, 1, null, false, 1);

    -- Table 7: the manager's, fourteen minutes ago, ready at the bar three
    -- minutes ago, by the worker who prepares there.
    sent_at_time := now() - interval '14 minutes';
    order_day := private.order_business_day(business, sent_at_time);
    insert into public.orders (business_id, place_id, day, opened_by, opened_at)
    values (business, table_seven, order_day, manager_person, sent_at_time)
    returning id into order_ref;
    round_ref := gen_random_uuid();
    insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
    values (
      round_ref, business, order_ref,
      private.order_round_hash(
        jsonb_build_object('place', table_seven),
        jsonb_build_array(
          jsonb_build_object(
            'item', beer.id, 'quantity', 2, 'note', null::text, 'allergy', false,
            'held', false, 'choices', beer_picks
          ),
          jsonb_build_object(
            'item', lemonade.id, 'quantity', 1, 'note', null::text, 'allergy', false,
            'held', false, 'choices', '[]'::jsonb
          )
        )
      ),
      manager_person, sent_at_time
    );
    insert into public.order_tickets (
      business_id, order_id, round_id, department_id, status, ready_at, ready_by, prepared_at
    )
    values (
      business, order_ref, round_ref, bar, 'ready',
      now() - interval '3 minutes', worker_person, now() - interval '3 minutes'
    )
    returning id into ticket_ref;
    insert into public.order_lines (
      business_id, ticket_id, item_id, name, unit_agorot, choices, quantity, position
    )
    values
      (business, ticket_ref, beer.id, beer.name, beer_unit, beer_frozen, 2, 0),
      (business, ticket_ref, lemonade.id, lemonade.name, lemonade.price_agorot, '[]'::jsonb, 1, 1);

    -- Takeaway 1: the manager's coffees, two minutes ago, for the red shirt.
    sent_at_time := now() - interval '2 minutes';
    order_day := private.order_business_day(business, sent_at_time);
    insert into private.order_day_counters (business_id, day, last_no)
    values (business, order_day, 1);
    insert into public.orders (
      business_id, takeaway_no, takeaway_label, day, opened_by, opened_at
    )
    values (business, 1, 'חולצה אדומה', order_day, manager_person, sent_at_time)
    returning id into order_ref;
    round_ref := gen_random_uuid();
    insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
    values (
      round_ref, business, order_ref,
      private.order_round_hash(
        jsonb_build_object('takeaway', true, 'label', 'חולצה אדומה'::text),
        jsonb_build_array(
          jsonb_build_object(
            'item', coffee.id, 'quantity', 2, 'note', null::text, 'allergy', false,
            'held', false, 'choices', coffee_picks
          )
        )
      ),
      manager_person, sent_at_time
    );
    insert into public.order_tickets (business_id, order_id, round_id, department_id, status)
    values (business, order_ref, round_ref, bar, 'new')
    returning id into ticket_ref;
    insert into public.order_lines (
      business_id, ticket_id, item_id, name, unit_agorot, choices, quantity, position
    )
    values (business, ticket_ref, coffee.id, coffee.name, coffee_unit, coffee_frozen, 2, 0);

    perform private.bump_order_version(business);
  exception when others then
    raise warning 'The demo''s sample orders were not written: %', sqlstate;
  end;
end;
$$;

------------------------------------------------------------------------------
-- 3. The restaurant's and the café's words

-- An item with a choice to make opens its choices now, so the sentence that
-- said to pass it on by word of mouth moves on, where the team hasn't
-- changed it (the form of 20261120000500_order_taking_roles_hint.sql: a
-- sentence the team wrote keeps its own, and the console shows the app's
-- moved on). "מנה" for an item, as the templates' other sentences.
insert into public.template_wording (template_key, key, sentence, base_sentence)
select t.template_key, w.key, w.sentence, w.base_sentence
from (values ('restaurant'), ('cafe-bar')) as t (template_key)
cross join (
  values
    ('app.orders.picker.needsChoice',
      'יש לה בחירות: הקשה פותחת אותן',
      'יש לו בחירות: הקשה פותחת אותן')
) as w (key, sentence, base_sentence)
where exists (select 1 from public.templates tt where tt.key = t.template_key)
on conflict (template_key, key) do update
  set sentence = excluded.sentence,
      base_sentence = excluded.base_sentence,
      updated_at = now()
  where public.template_wording.sentence = 'יש לה בחירות. בינתיים מוסרים אותה בעל פה.';

-- And P6's own: an item with only optional choices, and the editor's
-- "חובה לבחור". Only where nothing is stored yet.
insert into public.template_wording (template_key, key, sentence, base_sentence)
select t.template_key, w.key, w.sentence, w.base_sentence
from (values ('restaurant'), ('cafe-bar')) as t (template_key)
cross join (
  values
    ('app.orders.picker.optionalChoices',
      'נוספת מיד, ואת הבחירות שלה משנים בטיוטה',
      'נוסף מיד, ואת הבחירות שלו משנים בטיוטה'),
    ('app.orders.menu.group.requiredHint',
      'בלי בחירה לא מוסיפים את המנה',
      'בלי בחירה לא מוסיפים את הפריט')
) as w (key, sentence, base_sentence)
where exists (select 1 from public.templates tt where tt.key = t.template_key)
on conflict (template_key, key) do nothing;

------------------------------------------------------------------------------
-- 4. Who may call what

-- Replaced in place, the same signatures: their grants stay as their first
-- migration set them; revoked again all the same. They run inside the
-- reset, as their owner, for nobody else.
revoke execute on function private.seed_demo_order_taking(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_orders(uuid)
  from public, anon, authenticated, service_role;
