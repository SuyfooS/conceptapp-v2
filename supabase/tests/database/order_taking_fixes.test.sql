-- Taking orders: the fixes and the till, on screen
-- (20261122000100_order_taking_fixes.sql; waiter mode P5). The migration
-- writes the restaurant's and the café's own sentences for P5's screens:
-- both templates hold all seventeen, each written against the app's
-- sentence it replaces, and the shop and the general template keep the
-- app's words. And the close's "ביטול", public.undo_close_order: the server's
-- alone; the order open again and every ticket the close served back where
-- it was, new or ready, one served before the close still served; by whoever
-- closed it within 2 minutes only; the same business day, while the place is
-- free, never for a cancelled order, by whoever takes or runs orders in the
-- business. The other writes the screens make and their refusals are P3's,
-- tested in order_taking.test.sql and order_taking_access.test.sql. Every
-- write passes its moment, from 1 December 2026 18:00 UTC (20:00 in the
-- business), so nothing depends on today's date. Fixed ids (e8…), numbers
-- (050-068-xxxx) and slugs (order-fixes-…), so nothing here meets the seed
-- or another test.
begin;
select plan(13);

create temp table p5_keys (key text primary key) on commit drop;
insert into p5_keys (key) values
  ('app.orders.fix.cancel'),
  ('app.orders.fix.restore'),
  ('app.orders.failed.managersOnly'),
  ('app.orders.failed.managersOnlyRestore'),
  ('app.orders.failed.takeaway'),
  ('app.orders.failed.moveTaken'),
  ('app.orders.failed.reopenTaken'),
  ('app.orders.close.place'),
  ('app.orders.close.held'),
  ('app.orders.order.actions.move'),
  ('app.orders.order.actions.moveHint'),
  ('app.orders.order.actions.noFree'),
  ('app.orders.move.subtitle'),
  ('app.orders.cancelOrder.subtitle'),
  ('app.orders.till.byItem'),
  ('app.orders.till.noOrder.body'),
  ('app.orders.floor.closed.table.place');

select is(
  (select string_agg(w.template_key || ':' || w.sentence || ':' || w.base_sentence, ',' order by w.template_key)
   from public.template_wording w where w.key = 'app.orders.close.place'),
  'cafe-bar:סגירת השולחן:סגירת ההזמנה,restaurant:סגירת השולחן:סגירת ההזמנה',
  'the restaurant and the café close a table, written against the app''s "סגירת ההזמנה"'
);

select is(
  (select string_agg(x.template_key || ':' || x.n::text, ',' order by x.template_key)
   from (
     select w.template_key, count(*) as n
     from public.template_wording w
     join p5_keys k on k.key = w.key
     group by w.template_key
   ) x),
  'cafe-bar:17,restaurant:17',
  'both hold every one of P5''s seventeen sentences'
);

select is(
  (select count(*)::integer from public.template_wording w
   join p5_keys k on k.key = w.key
   where w.template_key in ('general', 'retail')),
  0,
  'the shop and the general template keep the app''s words'
);

------------------------------------------------------------------------------
-- The close's "ביטול"

-- A: 1 owner; 2 a manager on the floor and in the bar; 3 a worker in the
-- kitchen; 5 and 6 workers on the floor. B: 11, its owner. The time clock is
-- off in A, so the clock rule stays out of it.
insert into auth.users (id, aud, role, phone)
select ('e8000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250068' || lpad(n::text, 4, '0')
from unnest('{1,2,3,5,6,11}'::int[]) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('e8000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'e8000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'e8000000-0000-4000-b000-000000000002'::uuid
$$;
-- Departments: 1 the kitchen, 2 the bar, 3 the floor.
create function pg_temp.d(n integer) returns uuid language sql as $$
  select ('e8000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Categories: 1 starters to the kitchen, 2 drinks to the bar.
create function pg_temp.c(n integer) returns uuid language sql as $$
  select ('e8000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Items: 1 hummus, 2 beer, 3 lemonade.
create function pg_temp.i(n integer) returns uuid language sql as $$
  select ('e8000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Places 1 to 4.
create function pg_temp.pl(n integer) returns uuid language sql as $$
  select ('e8000000-0000-4000-e000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Round keys, as a phone makes them.
create function pg_temp.k(n integer) returns uuid language sql as $$
  select ('e8000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- A moment, seconds after 20:00 in the business on 1 December 2026.
create function pg_temp.at(seconds integer) returns timestamptz language sql as $$
  select '2026-12-01 18:00+00'::timestamptz + make_interval(secs => seconds)
$$;
create function pg_temp.place(n integer) returns jsonb language sql as $$
  select jsonb_build_object('place', pg_temp.pl(n))
$$;
create function pg_temp.li(item integer, how_many integer) returns jsonb language sql as $$
  select jsonb_build_object('item', pg_temp.i(item), 'quantity', how_many)
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
-- The same, with the refusal's detail.
create function pg_temp.why(call text) returns text language plpgsql as $$
declare
  got_code text;
  got_hint text;
  got_detail text;
begin
  execute call;
  return 'none';
exception when others then
  get stacked diagnostics got_code = returned_sqlstate, got_hint = pg_exception_hint,
    got_detail = pg_exception_detail;
  return concat_ws(' ', got_code, nullif(got_hint, ''), nullif(got_detail, ''));
end;
$$;
-- A round's order, and a ticket of it by its place in the round.
create function pg_temp.order_of(n integer) returns uuid language sql as $$
  select r.order_id from public.order_rounds r where r.id = pg_temp.k(n)
$$;
create function pg_temp.ticket(n integer, place_no integer) returns uuid language sql as $$
  select t.id from public.order_tickets t where t.round_id = pg_temp.k(n) and t.position = place_no
$$;
-- An order's tickets, in the order they were sent: each one's status, and
-- whether it was served before it was ready, served, and ready since 20:01.
create function pg_temp.tickets(order_ref uuid) returns text language sql as $$
  select string_agg(
    t.status || '/' || t.served_new || '/' || (t.served_at is not null) || '/'
      || coalesce((t.ready_at = pg_temp.at(60))::text, '-'),
    ',' order by r.sent_at, t.position)
  from public.order_tickets t
  join public.order_rounds r on r.id = t.round_id
  where t.order_id = order_ref
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'order-fixes-a', 'Order fixes A'),
  (pg_temp.b(), 'order-fixes-b', 'Order fixes B');
insert into public.memberships (business_id, user_id, role)
values
  (pg_temp.a(), pg_temp.p(1), 'owner'),
  (pg_temp.a(), pg_temp.p(2), 'manager'),
  (pg_temp.a(), pg_temp.p(3), 'worker'),
  (pg_temp.a(), pg_temp.p(5), 'worker'),
  (pg_temp.a(), pg_temp.p(6), 'worker'),
  (pg_temp.b(), pg_temp.p(11), 'owner');
insert into public.business_modules (business_id, module_key, enabled, settings)
values (pg_temp.a(), 'order_taking', true, '{"takerDepartments": ["floor"]}');
insert into public.departments (id, business_id, key, name)
values
  (pg_temp.d(1), pg_temp.a(), 'kitchen', 'Kitchen'),
  (pg_temp.d(2), pg_temp.a(), 'bar', 'Bar'),
  (pg_temp.d(3), pg_temp.a(), 'floor', 'Floor');
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.d(3), pg_temp.a(), pg_temp.p(2)),
  (pg_temp.d(2), pg_temp.a(), pg_temp.p(2)),
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.d(3), pg_temp.a(), pg_temp.p(5)),
  (pg_temp.d(3), pg_temp.a(), pg_temp.p(6));
insert into public.menu_categories (id, business_id, name, department_id, position)
values
  (pg_temp.c(1), pg_temp.a(), 'ראשונות', pg_temp.d(1), 0),
  (pg_temp.c(2), pg_temp.a(), 'שתייה', pg_temp.d(2), 1);
insert into public.menu_items (
  id, business_id, category_id, name, price_agorot, department_id, available, option_groups,
  archived_at
)
values
  (pg_temp.i(1), pg_temp.a(), pg_temp.c(1), 'חומוס', 3200, null, true, '[]', null),
  (pg_temp.i(2), pg_temp.a(), pg_temp.c(2), 'בירה', 2800, null, true, '[]', null),
  (pg_temp.i(3), pg_temp.a(), pg_temp.c(2), 'לימונדה', 1600, null, true, '[]', null);
insert into public.order_places (id, business_id, name, position)
select pg_temp.pl(n), pg_temp.a(), n::text, n::smallint
from generate_series(1, 4) as n;

select ok(
  not has_function_privilege('authenticated', 'public.undo_close_order(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.undo_close_order(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.undo_close_order(uuid, uuid, timestamptz)', 'execute')
  and exists (
    select 1
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname = 'undo_close_order'
      and p.prosecdef
      and exists (
        select 1 from unnest(p.proconfig) as c (setting)
        where c.setting in ('search_path=""', 'search_path=')
      )
  ),
  'the close''s undo is the server''s alone, and runs as its owner with an empty search path'
);

-- Table 1: a hummus for the kitchen and a beer for the bar, the beer ready a
-- minute on; then a lemonade for the bar, served at once. Closed at 20:05,
-- and its "ביטול" half a minute on.
select public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(1), pg_temp.place(1),
  jsonb_build_array(pg_temp.li(1, 1), pg_temp.li(2, 1)), pg_temp.at(0)
);
select public.set_order_ticket_ready(pg_temp.p(2), pg_temp.ticket(1, 1), true, pg_temp.at(60));
select public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(2),
  jsonb_build_object('order', pg_temp.order_of(1), 'place', pg_temp.pl(1)),
  jsonb_build_array(pg_temp.li(3, 1)), pg_temp.at(90)
);
select public.serve_order_ticket(pg_temp.p(5), pg_temp.ticket(2, 0), true, pg_temp.at(120));
select public.close_order(pg_temp.p(5), pg_temp.order_of(1), pg_temp.at(300));
select public.undo_close_order(pg_temp.p(5), pg_temp.order_of(1), pg_temp.at(330));
select is(
  (select o.status || ':' || (o.closed_at is null) || ':' || (o.closed_by is null) || ':'
     || (o.reopened_by = pg_temp.p(5)) || ':' || (o.reopened_at = pg_temp.at(330))
   from public.orders o where o.id = pg_temp.order_of(1)),
  'open:true:true:true:true',
  'the close''s undo opens the order again, keeping who opened it again and when, as a reopen does'
);
select is(
  pg_temp.tickets(pg_temp.order_of(1)),
  'new/false/false/-,ready/false/false/true,served/true/true/false',
  'and every ticket the close served is back where it was: the hummus new, the beer ready since 20:01; the lemonade served before the close stays served'
);
select is(
  pg_temp.refusal($c$select public.undo_close_order(pg_temp.p(5), pg_temp.order_of(1),
    pg_temp.at(340))$c$),
  'none',
  'an undo again, the order open already, is no error'
);
select is(
  (select (o.reopened_at = pg_temp.at(330))::text from public.orders o where o.id = pg_temp.order_of(1))
  || ':' || pg_temp.tickets(pg_temp.order_of(1)),
  'true:new/false/false/-,ready/false/false/true,served/true/true/false',
  'and changes nothing'
);

-- Closed again at 20:06:40, by 6.
select public.close_order(pg_temp.p(6), pg_temp.order_of(1), pg_temp.at(400));
select is(
  pg_temp.refusal($c$select public.undo_close_order(pg_temp.p(5), pg_temp.order_of(1),
    pg_temp.at(410))$c$)
  || '|' || pg_temp.refusal($c$select public.undo_close_order(pg_temp.p(6), pg_temp.order_of(1),
    pg_temp.at(521))$c$),
  '55000 window|55000 window',
  'only whoever closed it takes the close back, and only within 2 minutes'
);
select is(
  (select o.status from public.orders o where o.id = pg_temp.order_of(1))
  || ':' || pg_temp.tickets(pg_temp.order_of(1)),
  'closed:served/true/true/false,served/false/true/true,served/true/true/false',
  'a refused undo leaves the order closed and its tickets served'
);

-- Table 2, closed at 04:59:30 in the business the next morning: its
-- business day ends at 05:00.
select public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(3), pg_temp.place(2),
  jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0)
);
select public.close_order(pg_temp.p(5), pg_temp.order_of(3), '2026-12-02 02:59:30+00');
select is(
  pg_temp.refusal($c$select public.undo_close_order(pg_temp.p(5), pg_temp.order_of(3),
    '2026-12-02 03:00:30+00')$c$),
  '55000 day',
  'nor once its business day is over, though within the 2 minutes'
);

-- Table 3, closed at 20:01:40, and opened anew by 6 half a minute on.
select public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(4), pg_temp.place(3),
  jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0)
);
select public.close_order(pg_temp.p(5), pg_temp.order_of(4), pg_temp.at(100));
select public.send_order_round(
  pg_temp.p(6), pg_temp.a(), pg_temp.k(5), pg_temp.place(3),
  jsonb_build_array(pg_temp.li(2, 1)), pg_temp.at(130)
);
select is(
  pg_temp.why($c$select public.undo_close_order(pg_temp.p(5), pg_temp.order_of(4),
    pg_temp.at(160))$c$),
  '23505 taken ' || pg_temp.order_of(5)::text,
  'nor while another order is open at its place, which it names'
);

-- Table 4, cancelled whole by the manager.
select public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(6), pg_temp.place(4),
  jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0)
);
select public.cancel_order(pg_temp.p(2), pg_temp.order_of(6), 'mistake', pg_temp.at(60));
select is(
  concat_ws('|',
    pg_temp.refusal($c$select public.undo_close_order(pg_temp.p(2), pg_temp.order_of(6),
      pg_temp.at(70))$c$),
    pg_temp.refusal($c$select public.undo_close_order(pg_temp.p(3), pg_temp.order_of(1),
      pg_temp.at(420))$c$),
    pg_temp.refusal($c$select public.undo_close_order(pg_temp.p(11), pg_temp.order_of(1),
      pg_temp.at(420))$c$)
  ),
  '55000 not_closed|42501|P0002',
  'a cancelled order stays cancelled; a worker in the kitchen, who takes no orders, and another business''s owner take no close back'
);

select * from finish();
rollback;
