-- Taking orders: the orders (20261120000300_order_taking_orders.sql; waiter
-- mode P3). The send: split by department into tickets, a held block apart,
-- each line's name, unit price and choices frozen; every item refused at
-- once by its id; idempotent by its key; two first sends to a place within a
-- minute joining one order; takeaway numbers by the business day. Taking a
-- line back (decision 5): the sender's, within the minutes, before anyone
-- prepared it, never their own department's; logged only once the kitchen
-- saw it. Cancelling with a reason and its undo, "on the house" and its
-- undo, each logged with the quantity and unit price and never a total; a
-- whole order cancelled for good. Ready and back within 5 minutes, served
-- and back, fire, move, close and reopen the same business day, the label.
-- The time clock is off in A, so the clock rule stays out of it
-- (order_taking_access.test.sql has it). Every write passes its moment, from
-- 1 December 2026 18:00 UTC (20:00 in the business), so nothing depends on
-- today's date. Fixed ids (e3…) and numbers (050-063-xxxx), so nothing here
-- meets the seed or another test.
begin;
select plan(89);

-- A: 1 owner; 2 a manager in the floor and the bar; 3 a worker in the
-- kitchen; 4 a worker in the bar; 5 a worker on the floor; 6 put on the
-- floor and in the kitchen, then made the accountant. B: 11, its owner.
insert into auth.users (id, aud, role, phone)
select ('e3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250063' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,11}'::int[]) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('e3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'e3000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'e3000000-0000-4000-b000-000000000002'::uuid
$$;
-- Departments: 1 the kitchen, 2 the bar, 3 the floor, 4 the storeroom
-- (removed), all A's; 11 B's kitchen.
create function pg_temp.d(n integer) returns uuid language sql as $$
  select ('e3000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Categories: 1 starters and 2 mains to the kitchen, 3 drinks to the bar;
-- 11 B's.
create function pg_temp.c(n integer) returns uuid language sql as $$
  select ('e3000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Items: 1 hummus 32.00, 2 schnitzel 62.00 with a side to pick (chips 0,
-- salad 5.00), 3 beer 28.00, 4 lemonade 16.00, 5 fish sold out, 6 one of
-- the removed storeroom's own, 7 one removed; 11 B's.
create function pg_temp.i(n integer) returns uuid language sql as $$
  select ('e3000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Places 1 to 12, 13 removed; 21 B's.
create function pg_temp.pl(n integer) returns uuid language sql as $$
  select ('e3000000-0000-4000-e000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Round keys, as a phone makes them.
create function pg_temp.k(n integer) returns uuid language sql as $$
  select ('e3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- A moment, seconds after 20:00 in the business on 1 December 2026.
create function pg_temp.at(seconds integer) returns timestamptz language sql as $$
  select '2026-12-01 18:00+00'::timestamptz + make_interval(secs => seconds)
$$;
-- A first send's target, and a line.
create function pg_temp.place(n integer) returns jsonb language sql as $$
  select jsonb_build_object('place', pg_temp.pl(n))
$$;
create function pg_temp.li(item integer, how_many integer) returns jsonb language sql as $$
  select jsonb_build_object('item', pg_temp.i(item), 'quantity', how_many)
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

create temporary table got (name text primary key, value jsonb) on commit drop;
create function pg_temp.keep(label text, kept jsonb) returns jsonb language sql as $$
  insert into got (name, value) values (label, kept)
  on conflict (name) do update set value = excluded.value;
  select kept
$$;
create function pg_temp.got(label text) returns jsonb language sql as $$
  select g.value from got g where g.name = label
$$;
-- A round's order, a ticket and a line of it, by their place in the round.
create function pg_temp.order_of(n integer) returns uuid language sql as $$
  select r.order_id from public.order_rounds r where r.id = pg_temp.k(n)
$$;
create function pg_temp.ticket(n integer, place_no integer) returns uuid language sql as $$
  select t.id from public.order_tickets t where t.round_id = pg_temp.k(n) and t.position = place_no
$$;
create function pg_temp.line(n integer, place_no integer) returns uuid language sql as $$
  select l.id
  from public.order_lines l
  join public.order_tickets t on t.id = l.ticket_id
  where t.round_id = pg_temp.k(n) and l.position = place_no
$$;
-- The newest log row of `what` in A.
create function pg_temp.logged(what text) returns jsonb language sql as $$
  select a.details from public.audit_log a
  where a.business_id = pg_temp.a() and a.action = what
  order by a.created_at desc, a.id desc
  limit 1
$$;
-- A's orders version now.
create function pg_temp.version() returns bigint language sql as $$
  select coalesce((select v.version from private.order_versions v where v.business_id = pg_temp.a()), 0)
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'orders-a', 'Orders A'),
  (pg_temp.b(), 'orders-b', 'Orders B');

insert into public.memberships (business_id, user_id, role)
values
  (pg_temp.a(), pg_temp.p(1), 'owner'),
  (pg_temp.a(), pg_temp.p(2), 'manager'),
  (pg_temp.a(), pg_temp.p(3), 'worker'),
  (pg_temp.a(), pg_temp.p(4), 'worker'),
  (pg_temp.a(), pg_temp.p(5), 'worker'),
  (pg_temp.a(), pg_temp.p(6), 'worker'),
  (pg_temp.b(), pg_temp.p(11), 'owner');

-- Taking orders on in both, the floor and the bar taking A's.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'order_taking', true, '{"takerDepartments": ["floor", "bar"]}'),
  (pg_temp.b(), 'order_taking', true, '{"takerDepartments": ["kitchen"]}');

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
  (pg_temp.d(3), pg_temp.a(), pg_temp.p(5)),
  (pg_temp.d(3), pg_temp.a(), pg_temp.p(6)),
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(6));
-- 6 becomes the accountant and keeps the floor's and the kitchen's rows.
update public.memberships set role = 'accountant'
where business_id = pg_temp.a() and user_id = pg_temp.p(6);

insert into public.menu_categories (id, business_id, name, department_id, position)
values
  (pg_temp.c(1), pg_temp.a(), 'ראשונות', pg_temp.d(1), 0),
  (pg_temp.c(2), pg_temp.a(), 'עיקריות', pg_temp.d(1), 1),
  (pg_temp.c(3), pg_temp.a(), 'שתייה', pg_temp.d(2), 2),
  (pg_temp.c(11), pg_temp.b(), 'Mains', pg_temp.d(11), 0);
insert into public.menu_items (
  id, business_id, category_id, name, price_agorot, department_id, available, option_groups,
  archived_at
)
values
  (pg_temp.i(1), pg_temp.a(), pg_temp.c(1), 'חומוס', 3200, null, true, '[]', null),
  (pg_temp.i(2), pg_temp.a(), pg_temp.c(2), 'שניצל', 6200, null, true,
   '[{"id": "side", "name": "תוספת", "min": 1, "max": 1, "options": [
      {"id": "chips", "name": "צ''יפס", "priceAgorot": 0},
      {"id": "salad", "name": "סלט", "priceAgorot": 500}]}]', null),
  (pg_temp.i(3), pg_temp.a(), pg_temp.c(3), 'בירה', 2800, null, true, '[]', null),
  (pg_temp.i(4), pg_temp.a(), pg_temp.c(3), 'לימונדה', 1600, null, true, '[]', null),
  (pg_temp.i(5), pg_temp.a(), pg_temp.c(2), 'דג', 8400, null, false, '[]', null),
  (pg_temp.i(6), pg_temp.a(), pg_temp.c(1), 'מלאי', 1000, pg_temp.d(4), true, '[]', null),
  (pg_temp.i(7), pg_temp.a(), pg_temp.c(2), 'ישן', 1500, null, true, '[]', '2026-11-01 10:00+00'),
  (pg_temp.i(11), pg_temp.b(), pg_temp.c(11), 'Schnitzel', 6200, null, true, '[]', null);
insert into public.order_places (id, business_id, name, position, archived_at)
select pg_temp.pl(n), pg_temp.a(), n::text, n::smallint,
  case when n = 13 then '2026-11-01 10:00+00'::timestamptz end
from generate_series(1, 13) as n;
insert into public.order_places (id, business_id, name)
values (pg_temp.pl(21), pg_temp.b(), '1');

------------------------------------------------------------------------------
-- Who may call what

select ok(
  (
    select bool_and(
      not has_function_privilege('authenticated', f.sig, 'execute')
      and not has_function_privilege('anon', f.sig, 'execute')
      and has_function_privilege('service_role', f.sig, 'execute')
    )
    from unnest(array[
      'public.send_order_round(uuid, uuid, uuid, jsonb, jsonb, timestamptz)',
      'public.take_back_order_line(uuid, uuid, timestamptz)',
      'public.cancel_order_line(uuid, uuid, text, boolean, timestamptz)',
      'public.comp_order_line(uuid, uuid, text, boolean, timestamptz)',
      'public.cancel_order(uuid, uuid, text, timestamptz)',
      'public.set_order_ticket_ready(uuid, uuid, boolean, timestamptz)',
      'public.serve_order_ticket(uuid, uuid, boolean, timestamptz)',
      'public.fire_order_tickets(uuid, uuid, timestamptz)',
      'public.move_order(uuid, uuid, uuid, timestamptz)',
      'public.close_order(uuid, uuid, timestamptz)',
      'public.reopen_order(uuid, uuid, timestamptz)',
      'public.set_order_label(uuid, uuid, text, timestamptz)'
    ]) as f (sig)
  )
  and (
    select bool_and(
      has_function_privilege('authenticated', f.sig, 'execute')
      and not has_function_privilege('anon', f.sig, 'execute')
    )
    from unnest(array[
      'public.order_floor(uuid, bigint)', 'public.order_detail(uuid)', 'public.order_till(uuid)',
      'public.order_mine(uuid, bigint)', 'public.order_prep(uuid, bigint)',
      'public.order_favourites(uuid)'
    ]) as f (sig)
  )
  and (
    select bool_and(
      not has_function_privilege('authenticated', f.sig, 'execute')
      and not has_function_privilege('service_role', f.sig, 'execute')
    )
    from unnest(array[
      'private.bump_order_version(uuid)', 'private.order_demo_per_hour()',
      'private.order_round_hash(jsonb, jsonb)', 'private.order_where(uuid)',
      'private.order_line_facts(uuid)', 'private.order_writer(uuid, uuid)',
      'private.require_taker_or_runs(uuid, uuid, timestamptz)',
      'private.order_round_answer(uuid)', 'private.order_access(uuid)'
    ]) as f (sig)
  ),
  'every write is the server''s, the screens read with the person''s own session, and every helper runs inside'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname || '.' || p.proname in (
       'public.send_order_round', 'public.take_back_order_line', 'public.cancel_order_line',
       'public.comp_order_line', 'public.cancel_order', 'public.set_order_ticket_ready',
       'public.serve_order_ticket', 'public.fire_order_tickets', 'public.move_order',
       'public.close_order', 'public.reopen_order', 'public.set_order_label',
       'public.order_floor', 'public.order_detail', 'public.order_till', 'public.order_mine',
       'public.order_prep', 'public.order_favourites',
       'private.bump_order_version', 'private.order_where', 'private.order_line_facts',
       'private.order_writer', 'private.require_taker_or_runs', 'private.order_round_answer',
       'private.order_access'
     )
     and p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  25,
  'each that reads a table runs as its owner with an empty search path'
);
select is(
  (select coalesce(string_agg(c.conrelid::regclass::text || ' ' || c.conname, ', ' order by c.conname), '')
   from pg_constraint c
   where c.contype = 'f'
     and c.conrelid in (
       'public.orders'::regclass, 'public.order_rounds'::regclass,
       'public.order_tickets'::regclass, 'public.order_lines'::regclass,
       'private.order_day_counters'::regclass, 'private.order_versions'::regclass
     )
     and not exists (
       select 1 from pg_index i
       where i.indrelid = c.conrelid
         and i.indpred is null
         and (string_to_array(i.indkey::text, ' ')::smallint[])[1:cardinality(c.conkey)] @> c.conkey
     )),
  '',
  'every foreign key of the orders leads an index, so a business going (a demo''s reset) never reads them whole'
);

------------------------------------------------------------------------------
-- The send

-- A worker on the floor sends to table 1: two hummus for the kitchen, one
-- with an allergy noted, and a beer for the bar.
select pg_temp.keep('k1', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(1), pg_temp.place(1),
  jsonb_build_array(
    pg_temp.li(1, 2) || '{"note": " בלי שום ", "allergy": true}',
    pg_temp.li(3, 1)
  ),
  pg_temp.at(0)
));
select is(
  (select string_agg(d.key || ':' || t.status || ':' || t.held, ',' order by t.position)
   from public.order_tickets t
   join public.departments d on d.id = t.department_id
   where t.round_id = pg_temp.k(1)),
  'kitchen:new:false,bar:new:false',
  'the round splits into a ticket for each department that prepares, in the order its lines came'
);
select is(
  (select string_agg(
     l.name || ':' || l.unit_agorot || ':' || l.quantity || ':' || coalesce(l.note, '-') || ':' || l.allergy,
     ',' order by l.position)
   from public.order_lines l
   join public.order_tickets t on t.id = l.ticket_id
   where t.round_id = pg_temp.k(1)),
  'חומוס:3200:2:בלי שום:true,בירה:2800:1:-:false',
  'each line keeps the item''s name and unit price as sent, its quantity, its note trimmed and its allergy'
);
select ok(
  (select r.sent_by = pg_temp.p(5)
     and r.sent_at = pg_temp.at(0)
     and r.body_hash ~ '^[0-9a-f]{64}$'
     and r.body_hash = private.order_round_hash(
       jsonb_build_object('place', pg_temp.pl(1)),
       jsonb_build_array(
         jsonb_build_object(
           'item', pg_temp.i(1), 'quantity', 2, 'note', 'בלי שום'::text, 'allergy', true,
           'held', false, 'choices', '[]'::jsonb
         ),
         jsonb_build_object(
           'item', pg_temp.i(3), 'quantity', 1, 'note', null::text, 'allergy', false,
           'held', false, 'choices', '[]'::jsonb
         )
       )
     )
   from public.order_rounds r where r.id = pg_temp.k(1)),
  'the round keeps its sender, its moment and the hash of its body as the server read it'
);
select is(
  (select o.day::text || ':' || o.status || ':' || (o.opened_by = pg_temp.p(5)) || ':'
     || (o.opened_at = pg_temp.at(0)) || ':' || (o.place_id = pg_temp.pl(1))
   from public.orders o where o.id = pg_temp.order_of(1)),
  '2026-12-01:open:true:true:true',
  'the order opens at table 1 on the business day it was sent'
);
select ok(
  (pg_temp.got('k1') ->> 'round')::uuid = pg_temp.k(1)
  and (pg_temp.got('k1') ->> 'order')::uuid = pg_temp.order_of(1)
  and pg_temp.got('k1') -> 'first' = 'true'::jsonb
  and (pg_temp.got('k1') ->> 'place')::uuid = pg_temp.pl(1)
  and pg_temp.got('k1') -> 'takeaway' = 'null'::jsonb
  and jsonb_array_length(pg_temp.got('k1') -> 'tickets') = 2
  and (pg_temp.got('k1') -> 'tickets' -> 0 ->> 'department')::uuid = pg_temp.d(1)
  and (pg_temp.got('k1') -> 'tickets' -> 1 ->> 'department')::uuid = pg_temp.d(2)
  and pg_temp.got('k1') -> 'tickets' -> 0 -> 'held' = 'false'::jsonb,
  'the send answers with its round, its order, that it was the first, the place and its tickets'
);
select ok(
  pg_temp.version() > 0
  and not exists (
    select 1 from public.audit_log a where a.business_id = pg_temp.a() and a.action like 'order.%'
  ),
  'the orders version moved, and a send writes nothing to the log'
);

-- A price changed after the send leaves the line as it was sent.
update public.menu_items set price_agorot = 3500 where id = pg_temp.i(1);
select is(
  (select l.unit_agorot from public.order_lines l where l.id = pg_temp.line(1, 0)),
  3200,
  'a price changed later never changes a line sent'
);
update public.menu_items set price_agorot = 3200 where id = pg_temp.i(1);

-- A second round to the same order, a schnitzel with salad.
select pg_temp.keep('k2', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(2),
  jsonb_build_object('order', pg_temp.order_of(1), 'place', pg_temp.pl(1)),
  jsonb_build_array(pg_temp.li(2, 1) || '{"choices": [{"group": "side", "option": "salad"}]}'),
  pg_temp.at(60)
));
select is(
  (select l.unit_agorot::text || ' ' || (l.choices = '[{"group": "side", "groupName": "תוספת",
     "option": "salad", "optionName": "סלט", "priceAgorot": 500}]'::jsonb)::text
   from public.order_lines l where l.id = pg_temp.line(2, 0)),
  '6700 true',
  'a choice adds its price, and is kept with its group''s and its own names as sent'
);
select is(
  (select count(*)::text from public.order_rounds r where r.order_id = pg_temp.order_of(1))
  || ' ' || (pg_temp.got('k2') -> 'first')::text,
  '2 false',
  'a later round joins the order the phone named'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(3),
    pg_temp.place(3), jsonb_build_array(pg_temp.li(2, 1)), pg_temp.at(60))$c$),
  '22023 choices',
  'a schnitzel with no side picked is refused'
);

------------------------------------------------------------------------------
-- What a send refuses

select is(
  pg_temp.why($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(101),
    pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 1), pg_temp.li(5, 1)), pg_temp.at(0))$c$),
  '22023 unavailable ' || jsonb_build_array(pg_temp.i(5))::text,
  'an item sold out is refused, its id in the detail'
);
select is(
  pg_temp.why($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(102),
    pg_temp.place(3),
    jsonb_build_array(pg_temp.li(7, 1), pg_temp.li(11, 1), pg_temp.li(5, 1), pg_temp.li(7, 2)),
    pg_temp.at(0))$c$),
  '22023 unavailable ' || jsonb_build_array(pg_temp.i(7), pg_temp.i(11), pg_temp.i(5))::text,
  'and so are one removed and another business''s, all of them at once, each once'
);
select is(
  pg_temp.why($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(103),
    pg_temp.place(3), jsonb_build_array(pg_temp.li(6, 1)), pg_temp.at(0))$c$),
  '22023 route ' || jsonb_build_array(pg_temp.i(6))::text,
  'an item that goes to no live department is refused, its id in the detail'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(104),
    pg_temp.place(3),
    (select jsonb_agg(pg_temp.li(1, 1)) from generate_series(1, 41)),
    pg_temp.at(0))$c$),
  '54000',
  'a round has at most 40 lines'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(105),
    pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 0)), pg_temp.at(0))$c$)
  || '|' || pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(),
    pg_temp.k(105), pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 100)), pg_temp.at(0))$c$),
  '22023|22023',
  'from 1 to 99 of an item'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(106),
    pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 1) || '{"allergy": true}'),
    pg_temp.at(0))$c$)
  || '|' || pg_temp.refusal(format(
    $c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(106),
      pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 1) || jsonb_build_object('note', %L::text)),
      pg_temp.at(0))$c$,
    repeat('א', 121))),
  '22023 allergy|22023',
  'an allergy says what in its note, and a note is at most 120 characters'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(107),
    pg_temp.place(13), jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0))$c$),
  '22023 place',
  'a removed place is refused'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(117),
    jsonb_build_object('place', pg_temp.pl(21)), jsonb_build_array(pg_temp.li(1, 1)),
    pg_temp.at(0))$c$),
  'P0002',
  'and another business''s place is unknown'
);
update public.business_modules set enabled = false
where business_id = pg_temp.b() and module_key = 'order_taking';
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(11), pg_temp.b(), pg_temp.k(108),
    jsonb_build_object('place', pg_temp.pl(21)), jsonb_build_array(pg_temp.li(11, 1)),
    pg_temp.at(0))$c$),
  '42501 off',
  'while taking orders is off, even the owner sends nothing, and hears why'
);
update public.business_modules set enabled = true
where business_id = pg_temp.b() and module_key = 'order_taking';
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(11), pg_temp.a(), pg_temp.k(109),
    pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0))$c$),
  'P0002',
  'another business''s owner sends nothing to A'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(6), pg_temp.a(), pg_temp.k(110),
    pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0))$c$)
  || '|' || pg_temp.refusal($c$select public.send_order_round(pg_temp.p(3), pg_temp.a(),
    pg_temp.k(110), pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0))$c$),
  '42501|42501',
  'nor the accountant, put on the floor, nor a worker in the kitchen, which takes no orders'
);

------------------------------------------------------------------------------
-- The same round again

select pg_temp.keep('k1 again', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(1), pg_temp.place(1),
  jsonb_build_array(
    pg_temp.li(1, 2) || '{"note": "בלי שום", "allergy": true}',
    pg_temp.li(3, 1)
  ),
  pg_temp.at(30)
));
select is(
  pg_temp.got('k1 again'),
  pg_temp.got('k1'),
  'the same key and body again give the same answer'
);
select is(
  (select count(*)::text from public.order_rounds r where r.order_id = pg_temp.order_of(1))
  || ' ' || (select count(*)::text from public.order_tickets t where t.round_id = pg_temp.k(1))
  || ' ' || (select count(*)::text from public.order_lines l
     join public.order_tickets t on t.id = l.ticket_id where t.round_id = pg_temp.k(1)),
  '2 2 2',
  'and write nothing'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(1),
    pg_temp.place(1), jsonb_build_array(pg_temp.li(1, 3)), pg_temp.at(30))$c$),
  '23505 body',
  'the key with other lines is refused'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(4), pg_temp.a(), pg_temp.k(1),
    pg_temp.place(1),
    jsonb_build_array(pg_temp.li(1, 2) || '{"note": "בלי שום", "allergy": true}', pg_temp.li(3, 1)),
    pg_temp.at(30))$c$)
  || '|' || pg_temp.refusal($c$select public.send_order_round(pg_temp.p(11), pg_temp.b(),
    pg_temp.k(1), jsonb_build_object('place', pg_temp.pl(21)),
    jsonb_build_array(pg_temp.li(11, 1)), pg_temp.at(30))$c$),
  '23505 key|23505 key',
  'and the key is no one else''s, in this business or another'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(3), pg_temp.a(), pg_temp.k(1),
    pg_temp.place(1),
    jsonb_build_array(pg_temp.li(1, 2) || '{"note": "בלי שום", "allergy": true}', pg_temp.li(3, 1)),
    pg_temp.at(30))$c$),
  '42501',
  'one who takes no orders, with another''s key and its very lines, is refused as taking none, never told whose key it is'
);

------------------------------------------------------------------------------
-- Moved, and closed

select public.move_order(pg_temp.p(5), pg_temp.order_of(1), pg_temp.pl(9), pg_temp.at(180));
select ok(
  (select o.place_id = pg_temp.pl(9) and o.moved_from = pg_temp.pl(1)
     and o.moved_by = pg_temp.p(5) and o.moved_at = pg_temp.at(180)
   from public.orders o where o.id = pg_temp.order_of(1)),
  'an order moves to a free place, keeping where it came from, who moved it and when'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(111),
    jsonb_build_object('order', pg_temp.order_of(1), 'place', pg_temp.pl(1)),
    jsonb_build_array(pg_temp.li(3, 1)), pg_temp.at(200))$c$),
  '55000 moved',
  'a round from a phone that still shows it at table 1 is refused'
);
select public.close_order(pg_temp.p(5), pg_temp.order_of(1), pg_temp.at(240));
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(112),
    jsonb_build_object('order', pg_temp.order_of(1), 'place', pg_temp.pl(9)),
    jsonb_build_array(pg_temp.li(3, 1)), pg_temp.at(300))$c$),
  '55000 closed',
  'and one to an order closed since'
);

------------------------------------------------------------------------------
-- Two first sends to one place

select pg_temp.keep('k5', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(5), pg_temp.place(2),
  jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0)
));
select pg_temp.keep('k6', public.send_order_round(
  pg_temp.p(4), pg_temp.a(), pg_temp.k(6), pg_temp.place(2),
  jsonb_build_array(pg_temp.li(3, 1)), pg_temp.at(30)
));
select is(
  ((pg_temp.got('k5') ->> 'order') = (pg_temp.got('k6') ->> 'order'))::text
  || ' ' || (pg_temp.got('k5') -> 'first')::text || ' ' || (pg_temp.got('k6') -> 'first')::text
  || ' ' || (select count(*)::text from public.order_rounds r where r.order_id = pg_temp.order_of(5)),
  'true true false 2',
  'two first sends to a place half a minute apart join one order'
);
select is(
  pg_temp.why($c$select public.send_order_round(pg_temp.p(2), pg_temp.a(), pg_temp.k(113),
    pg_temp.place(2), jsonb_build_array(pg_temp.li(4, 1)), pg_temp.at(120))$c$),
  '23505 taken ' || pg_temp.order_of(5)::text,
  'one two minutes on is told the place is taken, and by which order'
);

------------------------------------------------------------------------------
-- Takeaways

select pg_temp.keep('k8', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(8), '{"takeaway": true, "label": "חולצה אדומה"}',
  jsonb_build_array(pg_temp.li(4, 1)), pg_temp.at(0)
));
select pg_temp.keep('k9', public.send_order_round(
  pg_temp.p(4), pg_temp.a(), pg_temp.k(9), '{"takeaway": true}',
  jsonb_build_array(pg_temp.li(4, 1)), pg_temp.at(0)
));
-- 02:00 in the business the next day: still the same business day.
select pg_temp.keep('k10', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(10), '{"takeaway": true}',
  jsonb_build_array(pg_temp.li(4, 1)), '2026-12-02 00:00+00'
));
-- 06:00: a new one.
select pg_temp.keep('k11', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(11), '{"takeaway": true}',
  jsonb_build_array(pg_temp.li(4, 1)), '2026-12-02 04:00+00'
));
select is(
  concat_ws(',', pg_temp.got('k8') ->> 'takeaway', pg_temp.got('k9') ->> 'takeaway',
    pg_temp.got('k10') ->> 'takeaway', pg_temp.got('k11') ->> 'takeaway'),
  '1,2,3,1',
  'takeaways are numbered by the business day, which ends at 05:00'
);
select is(
  pg_temp.refusal(format(
    $c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(114),
      jsonb_build_object('takeaway', true, 'label', %L::text),
      jsonb_build_array(pg_temp.li(4, 1)), pg_temp.at(0))$c$,
    repeat('א', 21))),
  '22023',
  'a takeaway''s label is at most 20 characters'
);
select is(
  pg_temp.refusal($c$select public.set_order_label(pg_temp.p(5), pg_temp.order_of(5), 'x',
    pg_temp.at(60))$c$),
  '55000 takeaway',
  'and only a takeaway has one'
);
select public.set_order_label(pg_temp.p(5), pg_temp.order_of(8), '  ', pg_temp.at(60));
select is(
  (select coalesce(o.takeaway_label, '-') from public.orders o where o.id = pg_temp.order_of(8)),
  '-',
  'a blank label clears it'
);

------------------------------------------------------------------------------
-- A held block

select pg_temp.keep('k12', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(12), pg_temp.place(4),
  jsonb_build_array(
    pg_temp.li(2, 1) || '{"held": true, "choices": [{"group": "side", "option": "chips"}]}',
    pg_temp.li(3, 1)
  ),
  pg_temp.at(0)
));
select is(
  (select string_agg(d.key || ':' || t.status || ':' || t.held, ',' order by t.position)
   from public.order_tickets t
   join public.departments d on d.id = t.department_id
   where t.round_id = pg_temp.k(12)),
  'kitchen:held:true,bar:new:false',
  'a held line waits in a block of its own, the rest goes at once'
);
select is(
  pg_temp.refusal($c$select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(12, 0),
    true, pg_temp.at(60))$c$)
  || '|' || pg_temp.refusal($c$select public.close_order(pg_temp.p(5), pg_temp.order_of(12),
    pg_temp.at(60))$c$),
  '55000 held|55000 held',
  'a held block is neither made ready nor closed before it is called'
);
select is(
  public.fire_order_tickets(pg_temp.p(5), pg_temp.order_of(12), pg_temp.at(300)),
  1,
  'calling it sends the block'
);
select is(
  (select t.status || ':' || t.held || ':' || (t.fired_at = pg_temp.at(300)) || ':'
     || (t.fired_by = pg_temp.p(5))
   from public.order_tickets t where t.id = pg_temp.ticket(12, 0)),
  'new:true:true:true',
  'to its department as new, with who called it and when'
);
select is(
  public.fire_order_tickets(pg_temp.p(5), pg_temp.order_of(12), pg_temp.at(360)),
  0,
  'and calling again calls nothing'
);

------------------------------------------------------------------------------
-- Taking a line back (2 minutes, the default)

-- Table 5: a hummus and a schnitzel for the kitchen, a beer for the bar.
select pg_temp.keep('k13', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(13), pg_temp.place(5),
  jsonb_build_array(
    pg_temp.li(1, 1),
    pg_temp.li(2, 1) || '{"choices": [{"group": "side", "option": "chips"}]}',
    pg_temp.li(3, 1)
  ),
  pg_temp.at(0)
));
select public.take_back_order_line(pg_temp.p(5), pg_temp.line(13, 0), pg_temp.at(60));
select ok(
  (select l.taken_back_at = pg_temp.at(60) and l.taken_back_by = pg_temp.p(5)
   from public.order_lines l where l.id = pg_temp.line(13, 0))
  and not exists (
    select 1 from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'order.line.take_back'
  ),
  'the sender takes a line back within the minutes, and nothing is logged: the kitchen never saw it'
);
-- The kitchen has it on its screen.
select pg_temp.sign_in(pg_temp.p(3));
select public.order_prep('e3000000-0000-4000-b000-000000000001') is not null as read;
reset role;
select public.take_back_order_line(pg_temp.p(5), pg_temp.line(13, 1), pg_temp.at(90));
select is(
  (select (g ->> 'name') || ':' || (g ->> 'quantity') || ':' || (g ->> 'unitAgorot') || ':'
     || (g -> 'where')::text || ':' || ((g ->> 'department')::uuid = pg_temp.d(1)) || ':'
     || (g ->> 'ticket') || ':' || (g ? 'sender')
   from (select pg_temp.logged('order.line.take_back') as g) x),
  'שניצל:1:6200:{"place": "5"}:true:new:false',
  'once the kitchen saw it, a take-back is logged with its quantity and unit price, where and which department, and no sender'
);
select is(
  pg_temp.refusal($c$select public.take_back_order_line(pg_temp.p(5), pg_temp.line(13, 2),
    pg_temp.at(121))$c$),
  '55000 window',
  'a second past the two minutes, it is a cancel'
);
select is(
  pg_temp.refusal($c$select public.take_back_order_line(pg_temp.p(4), pg_temp.line(13, 2),
    pg_temp.at(60))$c$),
  '42501 sender',
  'only the sender takes a line back'
);
select pg_temp.keep('k14', public.send_order_round(
  pg_temp.p(4), pg_temp.a(), pg_temp.k(14), pg_temp.place(6),
  jsonb_build_array(pg_temp.li(3, 1)), pg_temp.at(0)
));
select is(
  pg_temp.refusal($c$select public.take_back_order_line(pg_temp.p(4), pg_temp.line(14, 0),
    pg_temp.at(30))$c$),
  '42501 own_department',
  'a bartender who sent a beer to his own bar cancels it with a reason instead'
);
select pg_temp.keep('k15', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(15), pg_temp.place(7),
  jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0)
));
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(15, 0), true, pg_temp.at(20));
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(15, 0), false, pg_temp.at(40));
select is(
  pg_temp.refusal($c$select public.take_back_order_line(pg_temp.p(5), pg_temp.line(15, 0),
    pg_temp.at(60))$c$),
  '55000 prepared',
  'a line the kitchen marked ready is never taken back, even put back to new'
);
update public.business_modules set settings = settings || '{"takeBackMinutes": 0}'
where business_id = pg_temp.a() and module_key = 'order_taking';
select pg_temp.keep('k16', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(16), pg_temp.place(8),
  jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0)
));
select is(
  pg_temp.refusal($c$select public.take_back_order_line(pg_temp.p(5), pg_temp.line(16, 0),
    pg_temp.at(10))$c$),
  '55000 window',
  'with no taking back, every line is a cancel'
);
update public.business_modules set settings = settings || '{"takeBackMinutes": 5}'
where business_id = pg_temp.a() and module_key = 'order_taking';
select public.take_back_order_line(pg_temp.p(5), pg_temp.line(16, 0), pg_temp.at(240));
select is(
  (select l.taken_back_at from public.order_lines l where l.id = pg_temp.line(16, 0)),
  pg_temp.at(240),
  'with five minutes, four minutes on is still in time'
);
select is(
  pg_temp.refusal($c$select public.take_back_order_line(pg_temp.p(5), pg_temp.line(16, 0),
    pg_temp.at(270))$c$),
  'none',
  'taking it back again is no error'
);
select is(
  (select l.taken_back_at from public.order_lines l where l.id = pg_temp.line(16, 0)),
  pg_temp.at(240),
  'and changes nothing'
);
update public.business_modules set settings = settings - 'takeBackMinutes'
where business_id = pg_temp.a() and module_key = 'order_taking';

------------------------------------------------------------------------------
-- Cancelling a line

-- Table 10: two hummus for the kitchen, a beer for the bar.
select pg_temp.keep('k17', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(17), pg_temp.place(10),
  jsonb_build_array(pg_temp.li(1, 2), pg_temp.li(3, 1)), pg_temp.at(0)
));
select public.cancel_order_line(pg_temp.p(5), pg_temp.line(17, 0), 'guest', true, pg_temp.at(180));
select is(
  (select l.cancel_reason || ':' || (l.cancelled_by = pg_temp.p(5)) || ':'
     || (l.cancelled_at = pg_temp.at(180))
   from public.order_lines l where l.id = pg_temp.line(17, 0)),
  'guest:true:true',
  'whoever takes orders cancels a line not yet ready, saying why'
);
select is(
  (select (g ->> 'reason') || ':' || ((g ->> 'sender')::uuid = pg_temp.p(5)) || ':'
     || (g ->> 'ticket') || ':' || (g ->> 'quantity') || ':' || (g ->> 'unitAgorot')
   from (select pg_temp.logged('order.line.cancel') as g) x),
  'guest:true:new:2:3200',
  'logged with the reason, who sent it, where its ticket was, its quantity and unit price'
);
select is(
  pg_temp.refusal($c$select public.cancel_order_line(pg_temp.p(5), pg_temp.line(17, 1), null,
    true, pg_temp.at(180))$c$),
  '22023',
  'a cancel says why'
);
select public.cancel_order_line(pg_temp.p(5), pg_temp.line(17, 0), null, false, pg_temp.at(240));
select is(
  (select (l.cancelled_at is null and l.cancel_reason is null and l.cancelled_by is null)::text
   from public.order_lines l where l.id = pg_temp.line(17, 0))
  || ':' || (pg_temp.logged('order.line.restore') ? 'sender')::text,
  'true:false',
  'a cancel is undone while the order is open, logged with no sender'
);
select public.set_order_ticket_ready(pg_temp.p(4), pg_temp.ticket(17, 1), true, pg_temp.at(300));
select is(
  pg_temp.refusal($c$select public.cancel_order_line(pg_temp.p(5), pg_temp.line(17, 1), 'guest',
    true, pg_temp.at(360))$c$),
  '42501 ready',
  'a line already ready is not a waiter''s to cancel'
);
select public.cancel_order_line(pg_temp.p(2), pg_temp.line(17, 1), 'sold_out', true, pg_temp.at(360));
select is(
  (select (g ->> 'ticket') || ':' || (g ->> 'reason')
   from (select pg_temp.logged('order.line.cancel') as g) x),
  'ready:sold_out',
  'those who run orders cancel it, logged as ready'
);
select is(
  pg_temp.refusal($c$select public.cancel_order_line(pg_temp.p(6), pg_temp.line(17, 0), 'guest',
    true, pg_temp.at(420))$c$)
  || '|' || pg_temp.refusal($c$select public.cancel_order_line(pg_temp.p(6), pg_temp.line(17, 1),
    'guest', true, pg_temp.at(420))$c$),
  '42501|42501',
  'an accountant cancels nothing, refused before anything is locked, so never told a line is ready'
);
select is(
  pg_temp.refusal($c$select public.cancel_order_line(pg_temp.p(5), pg_temp.line(13, 0), 'guest',
    true, pg_temp.at(480))$c$),
  '55000 taken_back',
  'a line taken back is not cancelled too'
);

------------------------------------------------------------------------------
-- On the house

select is(
  pg_temp.refusal($c$select public.comp_order_line(pg_temp.p(5), pg_temp.line(17, 0), 'staff',
    true, pg_temp.at(480))$c$),
  '42501',
  'a worker gives nothing on the house'
);
select public.comp_order_line(pg_temp.p(2), pg_temp.line(17, 0), 'staff', true, pg_temp.at(480));
select is(
  (select l.comp_reason from public.order_lines l where l.id = pg_temp.line(17, 0))
  || ':' || (pg_temp.logged('order.line.comp') ->> 'reason'),
  'staff:staff',
  'those who run orders do, saying why, and it is logged'
);
select is(
  pg_temp.refusal($c$select public.cancel_order_line(pg_temp.p(2), pg_temp.line(17, 0), 'guest',
    true, pg_temp.at(540))$c$),
  '55000 comped',
  'a line on the house is not cancelled'
);
select public.comp_order_line(pg_temp.p(2), pg_temp.line(17, 0), null, false, pg_temp.at(540));
select is(
  (select (l.comped_at is null and l.comp_reason is null)::text
   from public.order_lines l where l.id = pg_temp.line(17, 0))
  || ':' || (pg_temp.logged('order.line.uncomp') is not null)::text,
  'true:true',
  'and on the house is undone, logged too'
);

------------------------------------------------------------------------------
-- Cancelling an order

select is(
  pg_temp.refusal($c$select public.cancel_order(pg_temp.p(5), pg_temp.order_of(17), 'mistake',
    pg_temp.at(600))$c$),
  '42501',
  'a worker cancels no whole order'
);
select public.cancel_order(pg_temp.p(2), pg_temp.order_of(17), 'mistake', pg_temp.at(600));
select is(
  (select o.status || ':' || o.cancel_reason from public.orders o where o.id = pg_temp.order_of(17))
  || ':' || (select string_agg(l.cancel_reason, ',' order by l.position)
     from public.order_lines l join public.order_tickets t on t.id = l.ticket_id
     where t.order_id = pg_temp.order_of(17)),
  'cancelled:mistake:mistake,sold_out',
  'those who run orders cancel it, every live line with the same reason'
);
select ok(
  (select jsonb_array_length(g -> 'lines') = 1
     and g -> 'lines' -> 0 ->> 'name' = 'חומוס'
     and g -> 'lines' -> 0 ->> 'quantity' = '2'
     and g -> 'lines' -> 0 ->> 'unitAgorot' = '3200'
     and g ->> 'reason' = 'mistake'
     and g -> 'where' = '{"place": "10"}'::jsonb
     and not jsonb_path_exists(g, '$.**.total')
     and not jsonb_path_exists(g, '$.**.lineAgorot')
   from (select pg_temp.logged('order.cancel') as g) x),
  'logged with the lines it cancelled, each with its quantity and unit price, and no sum'
);
select is(
  pg_temp.refusal($c$select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(115),
    jsonb_build_object('order', pg_temp.order_of(17), 'place', pg_temp.pl(10)),
    jsonb_build_array(pg_temp.li(3, 1)), pg_temp.at(660))$c$),
  '55000 closed',
  'a round to it is refused'
);
select is(
  pg_temp.refusal($c$select public.reopen_order(pg_temp.p(5), pg_temp.order_of(17),
    pg_temp.at(660))$c$),
  '55000 not_closed',
  'and it doesn''t open again'
);

------------------------------------------------------------------------------
-- Ready

-- Table 11: a hummus for the kitchen, a beer for the bar.
select pg_temp.keep('k18', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(18), pg_temp.place(11),
  jsonb_build_array(pg_temp.li(1, 1), pg_temp.li(3, 1)), pg_temp.at(0)
));
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(18, 0), true, pg_temp.at(60));
select is(
  (select t.status || ':' || (t.ready_at = pg_temp.at(60)) || ':' || (t.ready_by = pg_temp.p(3))
     || ':' || (t.prepared_at = pg_temp.at(60))
   from public.order_tickets t where t.id = pg_temp.ticket(18, 0)),
  'ready:true:true:true',
  'the kitchen marks its ticket ready'
);
select is(
  pg_temp.refusal($c$select public.set_order_ticket_ready(pg_temp.p(4), pg_temp.ticket(18, 0),
    true, pg_temp.at(60))$c$),
  '42501',
  'the bar doesn''t mark the kitchen''s'
);
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(18, 0), false, pg_temp.at(240));
select is(
  (select t.status || ':' || (t.ready_at is null) || ':' || (t.prepared_at = pg_temp.at(60))
   from public.order_tickets t where t.id = pg_temp.ticket(18, 0)),
  'new:true:true',
  'back to new within 5 minutes, and it stays prepared'
);
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(18, 0), true, pg_temp.at(300));
select is(
  pg_temp.refusal($c$select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(18, 0),
    false, pg_temp.at(660))$c$),
  '55000 window',
  'but not 6 minutes after'
);
select is(
  pg_temp.refusal($c$select public.set_order_ticket_ready(pg_temp.p(6), pg_temp.ticket(18, 0),
    false, pg_temp.at(310))$c$),
  '42501',
  'an accountant put in the kitchen marks nothing'
);
select public.set_order_ticket_ready(pg_temp.p(2), pg_temp.ticket(18, 1), true, pg_temp.at(120));
select is(
  (select t.status || ':' || (t.ready_by = pg_temp.p(2))
   from public.order_tickets t where t.id = pg_temp.ticket(18, 1)),
  'ready:true',
  'those who run orders mark any department''s'
);

------------------------------------------------------------------------------
-- Served

-- Table 12: a hummus for the kitchen, a beer for the bar.
select pg_temp.keep('k19', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(19), pg_temp.place(12),
  jsonb_build_array(pg_temp.li(1, 1), pg_temp.li(3, 1)), pg_temp.at(0)
));
select public.serve_order_ticket(pg_temp.p(5), pg_temp.ticket(19, 0), true, pg_temp.at(60));
select is(
  (select t.status || ':' || t.served_new || ':' || (t.ready_at = pg_temp.at(60))
   from public.order_tickets t where t.id = pg_temp.ticket(19, 0)),
  'served:true:true',
  'a ticket served before anyone marked it ready says so'
);
select public.serve_order_ticket(pg_temp.p(5), pg_temp.ticket(19, 0), false, pg_temp.at(120));
select is(
  (select t.status || ':' || t.served_new || ':' || (t.ready_at is null)
   from public.order_tickets t where t.id = pg_temp.ticket(19, 0)),
  'new:false:true',
  'and its undo puts it back to new'
);
select public.set_order_ticket_ready(pg_temp.p(4), pg_temp.ticket(19, 1), true, pg_temp.at(60));
select public.serve_order_ticket(pg_temp.p(5), pg_temp.ticket(19, 1), true, pg_temp.at(120));
select is(
  pg_temp.refusal($c$select public.set_order_ticket_ready(pg_temp.p(4), pg_temp.ticket(19, 1),
    false, pg_temp.at(150))$c$),
  '55000 served',
  'its department doesn''t put a served ticket back to new, though it was ready a minute and a half before'
);
select public.serve_order_ticket(pg_temp.p(5), pg_temp.ticket(19, 1), false, pg_temp.at(180));
select is(
  (select t.status || ':' || (t.ready_at = pg_temp.at(60))
   from public.order_tickets t where t.id = pg_temp.ticket(19, 1)),
  'ready:true',
  'one served after it was ready goes back to ready'
);

------------------------------------------------------------------------------
-- Closed, and opened again

select public.close_order(pg_temp.p(5), pg_temp.order_of(19), pg_temp.at(300));
select is(
  (select o.status || ':' || (o.closed_at = pg_temp.at(300)) || ':' || (o.closed_by = pg_temp.p(5))
   from public.orders o where o.id = pg_temp.order_of(19))
  || ':' || (select string_agg(t.status || '/' || t.served_new, ',' order by t.position)
     from public.order_tickets t where t.round_id = pg_temp.k(19)),
  'closed:true:true:served/true,served/false',
  'closing serves what wasn''t, the new as served before it was ready'
);
select is(
  pg_temp.refusal($c$select public.close_order(pg_temp.p(5), pg_temp.order_of(19),
    pg_temp.at(360))$c$),
  'none',
  'closing again is no error'
);
select public.reopen_order(pg_temp.p(5), pg_temp.order_of(19), pg_temp.at(420));
select is(
  (select o.status || ':' || (o.reopened_by = pg_temp.p(5)) || ':' || (o.reopened_at = pg_temp.at(420))
     || ':' || (o.closed_at is null)
   from public.orders o where o.id = pg_temp.order_of(19))
  || ':' || (select string_agg(t.status, ',' order by t.position)
     from public.order_tickets t where t.round_id = pg_temp.k(19)),
  'open:true:true:true:served,served',
  'it opens again the same business day, its tickets still served'
);
select public.close_order(pg_temp.p(5), pg_temp.order_of(19), pg_temp.at(480));
select is(
  pg_temp.refusal($c$select public.reopen_order(pg_temp.p(5), pg_temp.order_of(19),
    '2026-12-02 04:00+00')$c$),
  '55000 day',
  'but not on the next'
);
select pg_temp.keep('k20', public.send_order_round(
  pg_temp.p(5), pg_temp.a(), pg_temp.k(20), pg_temp.place(12),
  jsonb_build_array(pg_temp.li(3, 1)), pg_temp.at(540)
));
select is(
  pg_temp.refusal($c$select public.reopen_order(pg_temp.p(5), pg_temp.order_of(19),
    pg_temp.at(600))$c$),
  '23505 taken',
  'nor while another order is open at its place'
);

------------------------------------------------------------------------------
-- Moved

select is(
  pg_temp.refusal($c$select public.move_order(pg_temp.p(5), pg_temp.order_of(5), pg_temp.pl(12),
    pg_temp.at(600))$c$),
  '23505 taken',
  'an order doesn''t move to a place with an open order'
);
select is(
  pg_temp.refusal($c$select public.move_order(pg_temp.p(5), pg_temp.order_of(8), pg_temp.pl(3),
    pg_temp.at(600))$c$),
  '55000 takeaway',
  'and a takeaway stays one'
);
select is(
  pg_temp.refusal($c$select public.move_order(pg_temp.p(5), pg_temp.order_of(5), pg_temp.pl(21),
    pg_temp.at(600))$c$),
  'P0002',
  'nor does an order move to another business''s place, which is unknown'
);

------------------------------------------------------------------------------
-- Another business's owner

select is(
  concat_ws('|',
    pg_temp.refusal($c$select public.send_order_round(pg_temp.p(11), pg_temp.a(), pg_temp.k(116),
      pg_temp.place(3), jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0))$c$),
    pg_temp.refusal($c$select public.take_back_order_line(pg_temp.p(11), pg_temp.line(13, 2))$c$),
    pg_temp.refusal($c$select public.cancel_order_line(pg_temp.p(11), pg_temp.line(13, 2), 'guest')$c$),
    pg_temp.refusal($c$select public.comp_order_line(pg_temp.p(11), pg_temp.line(13, 2), 'staff')$c$),
    pg_temp.refusal($c$select public.cancel_order(pg_temp.p(11), pg_temp.order_of(5), 'guest')$c$),
    pg_temp.refusal($c$select public.set_order_ticket_ready(pg_temp.p(11), pg_temp.ticket(13, 1))$c$),
    pg_temp.refusal($c$select public.serve_order_ticket(pg_temp.p(11), pg_temp.ticket(13, 1))$c$),
    pg_temp.refusal($c$select public.fire_order_tickets(pg_temp.p(11), pg_temp.order_of(5))$c$),
    pg_temp.refusal($c$select public.move_order(pg_temp.p(11), pg_temp.order_of(5), pg_temp.pl(3))$c$),
    pg_temp.refusal($c$select public.close_order(pg_temp.p(11), pg_temp.order_of(5))$c$),
    pg_temp.refusal($c$select public.reopen_order(pg_temp.p(11), pg_temp.order_of(19))$c$),
    pg_temp.refusal($c$select public.set_order_label(pg_temp.p(11), pg_temp.order_of(9), 'x')$c$)
  ),
  'P0002|P0002|P0002|P0002|P0002|P0002|P0002|P0002|P0002|P0002|P0002|P0002',
  'another business''s owner finds none of A''s orders, lines or tickets'
);

select * from finish();
rollback;
