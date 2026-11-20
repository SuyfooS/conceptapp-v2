-- Taking orders on screen (20261121000100_order_taking_mode.sql; waiter
-- mode P4): where the signed-in person stands in the mode
-- (public.order_mode), never refused and never written, for whom it is for
-- and for nobody else; the lines on one's own rounds; what is ready to serve
-- on the floor; and the restaurant's and the café's words. Times are
-- relative to the transaction's now(), the business day turning twelve
-- hours away from it. Fixed ids (e7…) and numbers (050-067-xxxx).
begin;
select plan(24);

-- A: 1 owner, in no department; 2 a manager on the floor, off the clock; 3 a
-- worker in the kitchen; 4 a worker at the bar; 5 a worker on the floor, on
-- a shift; 6 put on the floor, then made the accountant; 7 a worker on the
-- floor, out 31 minutes ago; 8 a worker on the floor, open 17 hours; 9 on
-- the ConceptApp team, viewing A as a manager. B: 11, its owner.
insert into auth.users (id, aud, role, phone)
select ('e7000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250067' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,7,8,9,11}'::int[]) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('e7000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'e7000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'e7000000-0000-4000-b000-000000000002'::uuid
$$;
-- Departments: 1 the kitchen, 2 the bar, 3 the floor.
create function pg_temp.d(n integer) returns uuid language sql as $$
  select ('e7000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.c(n integer) returns uuid language sql as $$
  select ('e7000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Items: 1 hummus to the kitchen, 3 beer and 4 lemonade to the bar.
create function pg_temp.i(n integer) returns uuid language sql as $$
  select ('e7000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.pl(n integer) returns uuid language sql as $$
  select ('e7000000-0000-4000-e000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.k(n integer) returns uuid language sql as $$
  select ('e7000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
-- Whether an answer holds a key ending in Agorot anywhere: a price.
create function pg_temp.priced(answer jsonb) returns boolean language sql as $$
  select exists (
    select 1
    from jsonb_path_query(answer, '$.**') as x (item)
    where case
      when jsonb_typeof(x.item) = 'object' then exists (
        select 1 from jsonb_object_keys(x.item) as k (field) where k.field like '%Agorot'
      )
      else false
    end
  )
$$;
-- Every key an answer holds, anywhere in it.
create function pg_temp.keys(answer jsonb) returns text[] language sql as $$
  select coalesce(array_agg(distinct k.field order by k.field), '{}'::text[])
  from jsonb_path_query(answer, '$.**') as x (item)
  cross join lateral jsonb_object_keys(
    case when jsonb_typeof(x.item) = 'object' then x.item else '{}'::jsonb end
  ) as k (field)
$$;
create function pg_temp.ticket(round_no integer, department_no integer) returns uuid language sql as $$
  select t.id from public.order_tickets t
  where t.round_id = pg_temp.k(round_no) and t.department_id = pg_temp.d(department_no)
$$;

insert into public.businesses (id, slug, name, template_key)
values
  (pg_temp.a(), 'order-mode-a', 'Order mode A', 'restaurant'),
  (pg_temp.b(), 'order-mode-b', 'Order mode B', 'retail');

insert into public.memberships (business_id, user_id, role)
select pg_temp.a(), pg_temp.p(n),
  case when n = 1 then 'owner' when n = 2 then 'manager' else 'worker' end::public.member_role
from unnest('{1,2,3,4,5,6,7,8}'::int[]) as n;
insert into public.memberships (business_id, user_id, role)
values (pg_temp.b(), pg_temp.p(11), 'owner');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'order_taking', true, jsonb_build_object(
    'takerDepartments', '["floor", "bar"]'::jsonb,
    'dayEndsAt', to_char((now() at time zone 'Asia/Jerusalem') + interval '12 hours', 'HH24:MI')
  )),
  (pg_temp.a(), 'time_clock', true, '{}'),
  (pg_temp.b(), 'order_taking', false, '{}');

insert into public.departments (id, business_id, key, name)
values
  (pg_temp.d(1), pg_temp.a(), 'kitchen', 'Kitchen'),
  (pg_temp.d(2), pg_temp.a(), 'bar', 'Bar'),
  (pg_temp.d(3), pg_temp.a(), 'floor', 'Floor');
insert into public.department_members (department_id, business_id, user_id)
select pg_temp.d(3), pg_temp.a(), pg_temp.p(n)
from unnest('{2,5,6,7,8}'::int[]) as n;
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.d(2), pg_temp.a(), pg_temp.p(4)),
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(6));
update public.memberships set role = 'accountant'
where business_id = pg_temp.a() and user_id = pg_temp.p(6);

insert into public.platform_staff (user_id, role) values (pg_temp.p(9), 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values (pg_temp.p(9), pg_temp.a(), 'manager');

insert into public.menu_categories (id, business_id, name, department_id, position)
values
  (pg_temp.c(1), pg_temp.a(), 'ראשונות', pg_temp.d(1), 0),
  (pg_temp.c(3), pg_temp.a(), 'שתייה', pg_temp.d(2), 1);
insert into public.menu_items (id, business_id, category_id, name, price_agorot)
values
  (pg_temp.i(1), pg_temp.a(), pg_temp.c(1), 'חומוס', 3200),
  (pg_temp.i(3), pg_temp.a(), pg_temp.c(3), 'בירה', 2800),
  (pg_temp.i(4), pg_temp.a(), pg_temp.c(3), 'לימונדה', 1600);
insert into public.order_places (id, business_id, name, position)
select pg_temp.pl(n), pg_temp.a(), n::text, n::smallint from generate_series(1, 4) as n;

insert into public.time_entries (business_id, user_id, clock_in, clock_out)
values
  (pg_temp.a(), pg_temp.p(3), now() - interval '1 hour', null),
  (pg_temp.a(), pg_temp.p(4), now() - interval '1 hour', null),
  (pg_temp.a(), pg_temp.p(5), now() - interval '1 hour', null),
  (pg_temp.a(), pg_temp.p(7), now() - interval '8 hours', now() - interval '31 minutes'),
  (pg_temp.a(), pg_temp.p(8), now() - interval '17 hours', null);

-- 5 sends to table 1: hummus with a note and its allergy, and a lemonade
-- held; 4 sends to table 2: a beer, which the bar marks ready; the kitchen
-- marks 5's hummus ready.
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(1),
  jsonb_build_object('place', pg_temp.pl(1)),
  jsonb_build_array(
    jsonb_build_object('item', pg_temp.i(1), 'quantity', 2, 'note', 'בוטנים', 'allergy', true),
    jsonb_build_object('item', pg_temp.i(4), 'quantity', 1, 'held', true)
  ));
select public.send_order_round(pg_temp.p(4), pg_temp.a(), pg_temp.k(2),
  jsonb_build_object('place', pg_temp.pl(2)),
  jsonb_build_array(jsonb_build_object('item', pg_temp.i(3), 'quantity', 1)));
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(3),
  jsonb_build_object('place', pg_temp.pl(3)),
  jsonb_build_array(jsonb_build_object('item', pg_temp.i(4), 'quantity', 1)));
select public.set_order_ticket_ready(pg_temp.p(4), pg_temp.ticket(2, 2), true);
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(1, 1), true);

------------------------------------------------------------------------------
-- Who may call what

select ok(
  has_function_privilege('authenticated', 'public.order_mode(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.order_mode(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.order_mine(uuid, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.order_mine(uuid, bigint)', 'execute')
  and has_function_privilege('authenticated', 'public.order_floor(uuid, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.order_floor(uuid, bigint)', 'execute'),
  'the mode and the two widened reads are read with the person''s own session, never signed out'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('order_mode', 'order_mine', 'order_floor')
     and p.prosecdef
     and p.provolatile = 's'
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  3,
  'each runs as its owner, stable, with an empty search path'
);

------------------------------------------------------------------------------
-- Where each stands in the mode

select pg_temp.sign_in(pg_temp.p(5));
select is(
  (select concat_ws(' ', m.answer ->> 'takes', m.answer ->> 'runs', coalesce(m.answer ->> 'clock', 'none'),
     m.answer -> 'departments', m.answer ->> 'ready', m.answer ->> 'making')
   from (select public.order_mode(pg_temp.a()) as answer) m),
  'true false none [] 1 1',
  'a waiter on the floor on a shift takes orders, prepares nowhere, and counts one ready and one being made of his own'
);
-- As the database's owner, which reads the version itself; the reader is
-- still the claims'.
reset role;
select is(
  (select (public.order_mode(pg_temp.a()) ->> 'version')::bigint),
  (select v.version from private.order_versions v where v.business_id = pg_temp.a()),
  'it says the orders'' version, and moves nothing'
);
select pg_temp.sign_in(pg_temp.p(7));
select is(public.order_mode(pg_temp.a()) ->> 'clock', 'clock', '31 minutes after clocking out, the clock');
select pg_temp.sign_in(pg_temp.p(8));
select is(
  public.order_mode(pg_temp.a()) ->> 'clock', 'stale_shift',
  'a shift left open 17 hours, said as such'
);
select pg_temp.sign_in(pg_temp.p(1));
select is(
  (select concat_ws(' ', m.answer ->> 'takes', m.answer ->> 'runs', coalesce(m.answer ->> 'clock', 'none'),
     jsonb_array_length(m.answer -> 'departments'))
   from (select public.order_mode(pg_temp.a()) as answer) m),
  'true true none 2',
  'an owner takes and runs orders off any shift, and prepares for every department an item goes to'
);
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select concat_ws(' ', m.answer ->> 'takes', m.answer ->> 'runs', m.answer ->> 'clock')
   from (select public.order_mode(pg_temp.a()) as answer) m),
  'true true clock',
  'a manager off a shift runs orders, and sends on one'
);
select pg_temp.sign_in(pg_temp.p(3));
select is(
  (select concat_ws(' ', m.answer ->> 'takes', m.answer -> 'departments', m.answer -> 'waiting')
   from (select public.order_mode(pg_temp.a()) as answer) m),
  concat_ws(' ', 'false', jsonb_build_array(pg_temp.d(1)),
    '[]'),
  'the kitchen takes no orders and prepares in the kitchen, where nothing new waits now'
);
select pg_temp.sign_in(pg_temp.p(4));
select is(
  (select concat_ws(' ', m.answer ->> 'takes', m.answer -> 'departments', m.answer -> 'waiting',
     m.answer ->> 'ready', m.answer ->> 'making')
   from (select public.order_mode(pg_temp.a()) as answer) m),
  concat_ws(' ', 'true', jsonb_build_array(pg_temp.d(2)),
    jsonb_build_array(jsonb_build_object('department', pg_temp.d(2), 'count', 1)),
    '1', '0'),
  'the bar takes orders, waits on 5''s lemonade (his held one not counted), and counts its own beer ready'
);
select pg_temp.sign_in(pg_temp.p(6));
select ok(public.order_mode(pg_temp.a()) is null, 'an accountant, even put in a department, has no mode');
select pg_temp.sign_in(pg_temp.p(9));
select is(
  (select concat_ws(' ', m.answer ->> 'takes', m.answer ->> 'runs', m.answer ->> 'viewing',
     coalesce(m.answer ->> 'clock', 'none'), m.answer ->> 'ready',
     jsonb_array_length(m.answer -> 'departments'))
   from (select public.order_mode(pg_temp.a()) as answer) m),
  'true true true none 0 2',
  'a view as a manager reads all of it, runs it, and has nothing of its own'
);
select pg_temp.sign_in(pg_temp.p(5));
select ok(
  not (pg_temp.keys(public.order_mode(pg_temp.a())) && '{name,sentBy,openedBy,person,priceAgorot,unitAgorot}'::text[])
  and position(pg_temp.p(5)::text in public.order_mode(pg_temp.a())::text) = 0,
  'it names nobody and no price'
);
select pg_temp.sign_in(pg_temp.p(11));
select ok(
  public.order_mode(pg_temp.a()) is null and public.order_mode(pg_temp.b()) is null,
  'another business''s owner has none of A''s, and none while the module is off'
);
reset role;

-- Sold out, and a department whose items went: the floor serves nothing,
-- and a bar with no item left is left out.
update public.menu_items set available = false where id = pg_temp.i(3);
select pg_temp.sign_in(pg_temp.p(1));
select is(public.order_mode(pg_temp.a()) ->> 'soldOut', '1', 'it counts what is sold out');
reset role;
update public.menu_items set archived_at = now() where id in (pg_temp.i(3), pg_temp.i(4));
select pg_temp.sign_in(pg_temp.p(4));
select is(
  public.order_mode(pg_temp.a()) -> 'departments', '[]'::jsonb,
  'a department no live item goes to isn''t one to prepare for'
);
reset role;
update public.menu_items set archived_at = null where id in (pg_temp.i(3), pg_temp.i(4));
update public.menu_items set available = true where id = pg_temp.i(3);

-- Served, taken back, or of a closed order: no longer counted.
select public.serve_order_ticket(pg_temp.p(5), pg_temp.ticket(1, 1), true);
select pg_temp.sign_in(pg_temp.p(5));
select is(
  public.order_mode(pg_temp.a()) ->> 'ready', '0',
  'a ticket served is no longer ready'
);
reset role;
select public.take_back_order_line(pg_temp.p(5),
  (select l.id from public.order_lines l where l.ticket_id = pg_temp.ticket(3, 2)));
select pg_temp.sign_in(pg_temp.p(5));
select is(
  public.order_mode(pg_temp.a()) ->> 'making', '0',
  'a ticket all taken back is no longer being made'
);
reset role;

------------------------------------------------------------------------------
-- One's own rounds, with their lines

select pg_temp.sign_in(pg_temp.p(5));
select is(
  (select string_agg(concat_ws(':', l.line ->> 'name', l.line ->> 'note', l.line ->> 'allergy',
     l.line ->> 'state'), ',' order by concat_ws(':', l.line ->> 'name', l.line ->> 'state'))
   from jsonb_array_elements(public.order_mine(pg_temp.a()) -> 'rounds') as r (round)
   cross join jsonb_array_elements(r.round -> 'tickets') as t (ticket)
   cross join jsonb_array_elements(t.ticket -> 'items') as l (line)),
  'חומוס:בוטנים:true:live,לימונדה:false:live,לימונדה:false:takenBack',
  'each ticket of one''s own carries its lines: the note with its allergy, and one taken back'
);
select ok(
  not pg_temp.priced(public.order_mine(pg_temp.a()))
  and not exists (
    select 1
    from jsonb_array_elements(public.order_mine(pg_temp.a()) -> 'rounds') as r (round)
    where r.round ->> 'id' = pg_temp.k(2)::text
  ),
  'with no price, and still nobody else''s rounds'
);
reset role;

------------------------------------------------------------------------------
-- What is ready to serve, on the floor

select pg_temp.sign_in(pg_temp.p(5));
select is(
  (select string_agg(concat_ws(':', t.ticket ->> 'placeName', t.ticket -> 'lines' -> 0 ->> 'name'), ',')
   from jsonb_array_elements(public.order_floor(pg_temp.a()) -> 'ready') as t (ticket)),
  '2:בירה',
  'every waiter''s ready tickets of open orders, with their lines: the bar''s beer, not the hummus served'
);
select ok(
  not pg_temp.priced(public.order_floor(pg_temp.a()) -> 'ready')
  and public.order_floor(pg_temp.a(), (public.order_floor(pg_temp.a()) ->> 'version')::bigint) is null,
  'with no price, and still nothing new for the version it holds'
);
reset role;

------------------------------------------------------------------------------
-- The restaurant's and the café's words

select is(
  (select string_agg(w.template_key || ':' || w.sentence, ',' order by w.template_key)
   from public.template_wording w
   where w.key = 'app.orders.floor.title'),
  'cafe-bar:שולחנות,restaurant:שולחנות',
  'the restaurant and the café call their places tables'
);
select is(
  (select count(*)::int from public.template_wording w
   where w.template_key in ('general', 'retail') and w.key like 'app.orders.%'),
  0,
  'a shop and any other business keep the app''s words'
);

select * from finish();
rollback;
