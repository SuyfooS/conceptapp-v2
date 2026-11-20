-- Taking orders, P3 of waiter mode (issue #191), part 3 of 3: the hourly job
-- and the demo's sample orders.
--
--   the job     every hour, pure SQL with no app and no secret
--               (private.order_taking_tick): a line's note and a takeaway's
--               label are erased two days after the order closes or is
--               cancelled, and two days after the last round of an order
--               nobody closed (default 2 to ask Orel); who sent a round is
--               forgotten after 30 days; a demo business's orders go two
--               days after they opened, with their rounds, tickets and
--               lines. Nothing of a real business is ever deleted (decision
--               7). It writes no log row. Kept off locally and in CI
--               (supabase/seed.sql), where the tests call it themselves.
--   the demo    the demo restaurant has three orders waiting, written once
--               now and again with every reset (private.seed_demo_orders):
--               table 4, sent by the first worker of a department that takes
--               orders six minutes before, its kitchen ticket new and a
--               hummus with an allergy noted; table 7, sent by the first
--               manager fourteen minutes before, its bar ticket ready three
--               minutes before; and takeaway 1, the manager's coffees two
--               minutes before, labelled "חולצה אדומה". The module stays
--               off, so none of it shows until P4 switches it on.
--
-- It replaces public.reset_demo_business
-- (20261117000500_order_taking_menu.sql's) with the sample orders last, the
-- same signature; revoked and granted again all the same. Nothing is reset
-- here.

------------------------------------------------------------------------------
-- 1. The job

-- Erases what is kept only for a while, and returns how many rows it
-- touched. A demo business is left alone while a reset holds it (skip
-- locked), so the two never wait on each other.
create function private.order_taking_tick(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched integer := 0;
  step integer;
  erased uuid[];
  changed uuid[];
  demo uuid;
begin
  -- Notes and labels, of real businesses: a demo's orders go whole below.
  -- The orders first, then their lines, as every write locks them.
  with due as (
    update public.orders o
    set takeaway_label = null,
      notes_erased_at = coalesce(o.notes_erased_at, at_time)
    where not exists (
        select 1 from private.demo_businesses d where d.business_id = o.business_id
      )
      and (
        (o.status <> 'open' and coalesce(o.closed_at, o.cancelled_at) < at_time - interval '2 days')
        or (
          o.status = 'open'
          and (
            select max(r.sent_at) from public.order_rounds r
            where r.order_id = o.id and r.business_id = o.business_id
          ) < at_time - interval '2 days'
        )
      )
      and (
        o.takeaway_label is not null
        or exists (
          select 1
          from public.order_tickets t
          join public.order_lines l on l.ticket_id = t.id and l.business_id = t.business_id
          where t.order_id = o.id and t.business_id = o.business_id and l.note is not null
        )
      )
    returning o.id, o.business_id
  )
  select coalesce(array_agg(due.id), '{}'::uuid[]),
    coalesce(array_agg(distinct due.business_id), '{}'::uuid[])
  into erased, changed
  from due;
  touched := touched + cardinality(erased);

  update public.order_lines l
  set note = null, note_erased_at = at_time
  from public.order_tickets t
  where t.id = l.ticket_id
    and t.business_id = l.business_id
    and t.order_id = any (erased)
    and l.note is not null;
  get diagnostics step = row_count;
  touched := touched + step;

  -- Who sent a round, after 30 days.
  with forgotten as (
    update public.order_rounds r
    set sent_by = null
    where r.sent_by is not null and r.sent_at < at_time - interval '30 days'
    returning r.business_id
  )
  select changed || coalesce(array_agg(distinct forgotten.business_id), '{}'::uuid[]),
    touched + count(*)::integer
  into changed, touched
  from forgotten;

  -- A demo business's orders, two days after they opened.
  for demo in select d.business_id from private.demo_businesses d order by d.business_id
  loop
    perform 1 from public.businesses b where b.id = demo for no key update skip locked;
    if found then
      delete from public.orders o
      where o.business_id = demo and o.opened_at < at_time - interval '2 days';
      get diagnostics step = row_count;
      if step > 0 then
        touched := touched + step;
        changed := changed || demo;
      end if;
    end if;
  end loop;

  delete from private.order_day_counters c
  where c.day < (at_time at time zone 'UTC')::date - 2;
  get diagnostics step = row_count;
  touched := touched + step;

  perform private.bump_order_version(x.business_id)
  from (select distinct unnest(changed) as business_id) x;
  return touched;
end;
$$;

select cron.schedule('order-taking', '23 * * * *', $$select private.order_taking_tick()$$);

------------------------------------------------------------------------------
-- 2. The demo's sample orders

-- What the demo restaurant starts with on its floor: table 4 waiting for the
-- kitchen, table 7's drinks ready at the bar, and a takeaway's coffees, from
-- the sample menu and tables (private.seed_demo_order_taking), at times
-- relative to now. Sent by the first manager the definition names and the
-- first worker in a department that takes orders, in the order the
-- definition names them (tooling/demo-orders.test.ts keeps both definitions
-- holding them). Only a demo business opened from the restaurant template,
-- and only once: a business that has orders keeps them. Straight into the
-- tables, as a seed, so the log starts empty of it, and whatever goes wrong
-- the reset still stands.
create function private.seed_demo_orders(business uuid)
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
            'held', false, 'choices', '[]'::jsonb
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
      business_id, ticket_id, item_id, name, unit_agorot, quantity, position
    )
    values
      (business, ticket_ref, beer.id, beer.name, beer.price_agorot, 2, 0),
      (business, ticket_ref, lemonade.id, lemonade.name, lemonade.price_agorot, 1, 1);

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
            'held', false, 'choices', '[]'::jsonb
          )
        )
      ),
      manager_person, sent_at_time
    );
    insert into public.order_tickets (business_id, order_id, round_id, department_id, status)
    values (business, order_ref, round_ref, bar, 'new')
    returning id into ticket_ref;
    insert into public.order_lines (
      business_id, ticket_id, item_id, name, unit_agorot, quantity, position
    )
    values (business, ticket_ref, coffee.id, coffee.name, coffee.price_agorot, 2, 0);

    perform private.bump_order_version(business);
  exception when others then
    raise warning 'The demo''s sample orders were not written: %', sqlstate;
  end;
end;
$$;

-- The reset: 20261117000500_order_taking_menu.sql's, with the sample orders
-- last. The business's orders, rounds, tickets, lines, counters and orders
-- version go with it by cascade.
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
  perform private.seed_demo_orders(business);
end;
$$;

-- The demo restaurants that exist get their sample orders now, with nothing
-- reset: the seed leaves a business that has orders as it is, and every
-- other business than the restaurant's template.
select private.seed_demo_orders(d.business_id) from private.demo_businesses d;

------------------------------------------------------------------------------
-- Who may call what

-- The job's, as chat's: run by the scheduler as the owner, and by the tests.
revoke execute on function private.order_taking_tick(timestamptz)
  from public, anon, authenticated;
-- It runs inside the reset, as its owner, for nobody else.
revoke execute on function private.seed_demo_orders(uuid)
  from public, anon, authenticated, service_role;

-- Replaced in place, the same signature: its grants stay as its first
-- migration set them; revoked and granted again all the same.
revoke execute on function public.reset_demo_business(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_demo_business(uuid) to service_role;
