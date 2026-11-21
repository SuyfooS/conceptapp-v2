-- Taking orders: the kitchen's screens and the till
-- (20261124000100_order_taking_stations.sql; waiter mode P8a). One registry
-- with the clock's stations: what each shows, a kitchen's screen's
-- department, ten running of every kind together; locked by whoever runs
-- orders; read by the clock's editors (the clock's rows) and by those who run
-- orders (the others), never the secret. By its secret, a kitchen's screen
-- reads its department's tickets (or every one's) with no price, marking the
-- new ones seen, and what it marks sold out; the till reads the open orders
-- and today's closed, with no label, no person and no total. Their writes as
-- a person's are decided, kept as the station's, and a person's write after
-- one clears the station's column. A kitchen's or a till's secret makes no
-- clock code; an order station is stopped by whoever runs orders. Every
-- moment is passed in, from 1 December 2026 18:00 UTC (20:00 in the
-- business). Fixed ids (ea…), numbers (05-007-000xx) and slugs
-- (order-stations-…), so nothing here meets the seed or another test.
begin;
select plan(46);

-- A: 1 owner; 2 a manager on the floor; 3 a worker in the kitchen; 4 a
-- worker at the bar; 5 a worker on the floor, who takes orders; 6 a worker
-- who edits the clock and doesn't run orders; 7 the accountant. B: 11, its
-- owner.
insert into auth.users (id, aud, role, phone)
select ('ea000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '9725007000' || lpad(n::text, 2, '0')
from unnest('{1,2,3,4,5,6,7,11}'::int[]) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('ea000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'ea000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'ea000000-0000-4000-b000-000000000002'::uuid
$$;
-- Departments: A's 1 kitchen, 2 bar, 3 floor, 4 pastry (removed), 5 grill;
-- B's 11 kitchen.
create function pg_temp.d(n integer) returns uuid language sql as $$
  select ('ea000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Categories: A's 1 starters to the kitchen, 2 drinks to the bar; B's 11.
create function pg_temp.c(n integer) returns uuid language sql as $$
  select ('ea000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Items: A's 1 hummus, 2 beer, 3 lemonade, 4 soup (removed); B's 11.
create function pg_temp.i(n integer) returns uuid language sql as $$
  select ('ea000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Places: A's 1 to 4; B's 11.
create function pg_temp.pl(n integer) returns uuid language sql as $$
  select ('ea000000-0000-4000-e000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Round keys, as a phone makes them.
create function pg_temp.k(n integer) returns uuid language sql as $$
  select ('ea000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- A moment, seconds after 20:00 in the business on 1 December 2026.
create function pg_temp.at(seconds integer) returns timestamptz language sql as $$
  select '2026-12-01 18:00+00'::timestamptz + make_interval(secs => seconds)
$$;
-- A hash as the server makes them: 64 hex digits.
create function pg_temp.h(key text) returns text language sql as $$
  select encode(sha256(convert_to(key, 'UTF8')), 'hex')
$$;
create function pg_temp.place(n integer) returns jsonb language sql as $$
  select jsonb_build_object('place', pg_temp.pl(n))
$$;
create function pg_temp.li(item integer, how_many integer, held boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object('item', pg_temp.i(item), 'quantity', how_many, 'held', held)
$$;
create function pg_temp.order_of(n integer) returns uuid language sql as $$
  select r.order_id from public.order_rounds r where r.id = pg_temp.k(n)
$$;
create function pg_temp.ticket(n integer, place_no integer) returns uuid language sql as $$
  select t.id from public.order_tickets t where t.round_id = pg_temp.k(n) and t.position = place_no
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
-- Locks this device as an order station of A by `actor`, its secret's hash
-- pg_temp.h(key), through a pairing the server starts for it.
create function pg_temp.lock(
  actor uuid, key text, station_name text, station_shows text,
  station_department uuid, seconds integer
) returns uuid language plpgsql as $$
begin
  perform public.start_station_pairing(
    pg_temp.h(key || '-p'), pg_temp.h(key || '-s'), pg_temp.h(key), pg_temp.at(seconds));
  return public.lock_order_station(
    actor, pg_temp.a(), station_name, station_shows, station_department,
    pg_temp.h(key || '-p'), pg_temp.at(seconds));
end;
$$;

create temp table ids (name text primary key, id uuid not null) on commit drop;
create temp table got (name text primary key, value jsonb) on commit drop;
-- What a signed-in reader read is kept here as they read it.
grant select, insert on ids, got to authenticated;
create function pg_temp.id(key text) returns uuid language sql as $$
  select id from ids where name = key
$$;
create function pg_temp.got(key text) returns jsonb language sql as $$
  select value from got where name = key
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'order-stations-a', 'Order stations A'),
  (pg_temp.b(), 'order-stations-b', 'Order stations B');
insert into public.memberships (business_id, user_id, role, perms)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', '{}'),
  (pg_temp.a(), pg_temp.p(2), 'manager', '{}'),
  (pg_temp.a(), pg_temp.p(3), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(4), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(5), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(6), 'worker', '{clock.edit}'),
  (pg_temp.a(), pg_temp.p(7), 'accountant', '{}'),
  (pg_temp.b(), pg_temp.p(11), 'owner', '{}');
-- Orders are taken off a shift here, so the clock's rule stays out of it.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'order_taking', true, '{"takerDepartments": ["floor"], "onlyOnTheClock": false}'),
  (pg_temp.a(), 'time_clock', true, '{"codeDisplay": "both"}'),
  (pg_temp.b(), 'order_taking', true, '{"takerDepartments": ["kitchen"], "onlyOnTheClock": false}');
insert into public.departments (id, business_id, key, name, position, archived_at)
values
  (pg_temp.d(1), pg_temp.a(), 'kitchen', 'Kitchen', 0, null),
  (pg_temp.d(2), pg_temp.a(), 'bar', 'Bar', 1, null),
  (pg_temp.d(3), pg_temp.a(), 'floor', 'Floor', 2, null),
  (pg_temp.d(4), pg_temp.a(), 'pastry', 'Pastry', 3, pg_temp.at(-3600)),
  (pg_temp.d(5), pg_temp.a(), 'grill', 'Grill', 4, null),
  (pg_temp.d(11), pg_temp.b(), 'kitchen', 'Kitchen B', 0, null);
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.d(3), pg_temp.a(), pg_temp.p(2)),
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.d(2), pg_temp.a(), pg_temp.p(4)),
  (pg_temp.d(3), pg_temp.a(), pg_temp.p(5));
insert into public.menu_categories (id, business_id, name, department_id, position)
values
  (pg_temp.c(1), pg_temp.a(), 'Starters', pg_temp.d(1), 0),
  (pg_temp.c(2), pg_temp.a(), 'Drinks', pg_temp.d(2), 1),
  (pg_temp.c(11), pg_temp.b(), 'Dishes', pg_temp.d(11), 0);
insert into public.menu_items (
  id, business_id, category_id, name, price_agorot, available, option_groups, position, archived_at
)
values
  (pg_temp.i(1), pg_temp.a(), pg_temp.c(1), 'Hummus', 3200, true, '[]', 0, null),
  (pg_temp.i(2), pg_temp.a(), pg_temp.c(2), 'Beer', 2800, true, '[]', 0, null),
  (pg_temp.i(3), pg_temp.a(), pg_temp.c(2), 'Lemonade', 1600, true, '[]', 1, null),
  (pg_temp.i(4), pg_temp.a(), pg_temp.c(1), 'Soup', 2600, true, '[]', 1, pg_temp.at(-3600)),
  (pg_temp.i(11), pg_temp.b(), pg_temp.c(11), 'Dish', 4000, true, '[]', 0, null);
insert into public.order_places (id, business_id, name, position)
select pg_temp.pl(n), pg_temp.a(), n::text, n::smallint
from generate_series(1, 4) as n;
insert into public.order_places (id, business_id, name, position)
values (pg_temp.pl(11), pg_temp.b(), '11', 0);

-- Table 1: a hummus and a beer. Table 2: a hummus held for later. Table 3:
-- yesterday's, still open. B's table 11.
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(1), pg_temp.place(1),
  jsonb_build_array(pg_temp.li(1, 1), pg_temp.li(2, 1)), pg_temp.at(0));
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(2), pg_temp.place(2),
  jsonb_build_array(pg_temp.li(1, 1, true)), pg_temp.at(10));
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(3), pg_temp.place(3),
  jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(-86400));
select public.send_order_round(pg_temp.p(11), pg_temp.b(), pg_temp.k(11), jsonb_build_object('place', pg_temp.pl(11)),
  jsonb_build_array(jsonb_build_object('item', pg_temp.i(11), 'quantity', 1)), pg_temp.at(0));

------------------------------------------------------------------------------
-- Who may call what

select ok(
  (select bool_and(
     not has_function_privilege('authenticated', f, 'execute')
     and not has_function_privilege('anon', f, 'execute')
     and has_function_privilege('service_role', f, 'execute'))
   from unnest(array[
     'public.lock_order_station(uuid, uuid, text, text, uuid, text, timestamptz)',
     'public.station_order_prep(text, bigint, timestamptz)',
     'public.station_order_menu(text, bigint)',
     'public.station_order_till(text, bigint, timestamptz)',
     'public.station_set_ticket_ready(text, uuid, boolean, timestamptz)',
     'public.station_set_item_available(text, uuid, boolean, timestamptz)',
     'public.station_close_order(text, uuid, timestamptz)',
     'public.station_reopen_order(text, uuid, timestamptz)',
     'public.station_undo_close_order(text, uuid, timestamptz)'
   ]) as f)
  and (select bool_and(
     not has_function_privilege('authenticated', f, 'execute')
     and not has_function_privilege('service_role', f, 'execute'))
   from unnest(array[
     'private.order_station(text, text)',
     'private.note_station(uuid, text, timestamptz)',
     'private.station_till_order(uuid, uuid)'
   ]) as f),
  'the stations'' functions are the server''s alone, their helpers nobody''s'
);

------------------------------------------------------------------------------
-- The one registry

insert into public.clock_stations (business_id, name, token_hash, created_at)
values (pg_temp.a(), 'Door', pg_temp.h('door'), pg_temp.at(0));
select is(
  (select shows || ':' || coalesce(department_id::text, '-') from public.clock_stations
   where token_hash = pg_temp.h('door')),
  'clock_code:-',
  'a station shows the clock''s code unless it says otherwise'
);
select throws_ok(
  format($$insert into public.clock_stations (business_id, name, token_hash, shows, department_id)
    values (%L, 'Till D', %L, 'till', %L)$$, pg_temp.a(), pg_temp.h('till-d'), pg_temp.d(1)),
  '23514', null, 'only a kitchen''s screen has a department'
);
select throws_ok(
  format($$insert into public.clock_stations (business_id, name, token_hash, shows)
    values (%L, 'Screen', %L, 'menu')$$, pg_temp.a(), pg_temp.h('screen')),
  '23514', null, 'and a station shows one of three things'
);

------------------------------------------------------------------------------
-- Locking

select is(
  concat_ws('|',
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x1', 'Kitchen', 'prep', %L, 0)$$, pg_temp.p(3), pg_temp.d(1))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x2', 'Kitchen', 'prep', %L, 0)$$, pg_temp.p(7), pg_temp.d(1))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x3', 'Kitchen', 'prep', %L, 0)$$, pg_temp.p(6), pg_temp.d(1))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x4', 'Code', 'clock_code', null, 0)$$, pg_temp.p(2))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x5', 'Till', 'till', %L, 0)$$, pg_temp.p(2), pg_temp.d(1))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x6', 'Pastry', 'prep', %L, 0)$$, pg_temp.p(2), pg_temp.d(4))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x7', 'Kitchen', 'prep', %L, 0)$$, pg_temp.p(2), pg_temp.d(11))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x8', '  ', 'prep', null, 0)$$, pg_temp.p(2))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x9', %L, 'prep', null, 0)$$, pg_temp.p(2), repeat('k', 41))),
    pg_temp.refusal(format($$select pg_temp.lock(%L, 'x10', %L, 'prep', null, 0)$$, pg_temp.p(2), 'Kit' || chr(7))),
    pg_temp.refusal(format($$select public.lock_order_station(%L, %L, 'Kitchen', 'prep', null, %L, %L)$$,
      pg_temp.p(2), pg_temp.a(), pg_temp.h('never-p'), pg_temp.at(0)))
  ),
  '42501|42501|42501|22023 shows|22023 shows|22023 route|22023 route|22023|22023|22023|28000',
  'a worker, the accountant and a clock editor who doesn''t run orders lock nothing; nor another kind, a till with a department, a removed or another business''s department, a name that is no name, or a pairing that isn''t there'
);

update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'order_taking';
select is(
  pg_temp.refusal(format($$select pg_temp.lock(%L, 'x11', 'Kitchen', 'prep', %L, 0)$$, pg_temp.p(2), pg_temp.d(1))),
  '42501 off',
  'and nothing locks while taking orders is off'
);
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'order_taking';

insert into ids values ('kitchen', pg_temp.lock(pg_temp.p(2), 'kitchen', ' Kitchen ', 'prep', pg_temp.d(1), 0));
insert into ids values ('till', pg_temp.lock(pg_temp.p(1), 'till', 'Till', 'till', null, 1));
select is(
  (select string_agg(
     s.name || ':' || s.shows || ':' || coalesce(s.department_id::text, '-') || ':' || s.created_by::text,
     ',' order by s.created_at)
   from public.clock_stations s where s.id in (pg_temp.id('kitchen'), pg_temp.id('till')))
  || '|' || (select count(*)::text from private.station_pairings sp
     where sp.pairing_hash in (pg_temp.h('kitchen-p'), pg_temp.h('till-p'))),
  'Kitchen:prep:' || pg_temp.d(1)::text || ':' || pg_temp.p(2)::text
    || ',Till:till:-:' || pg_temp.p(1)::text || '|0',
  'whoever runs orders locks the kitchen''s screen of its department and the till, each kept with who locked it, the pairing used once'
);
select is(
  (select string_agg(a.details ->> 'shows' || ':' || coalesce(a.details ->> 'department', '-')
     || ':' || (a.details ->> 'name'), ',' order by a.details ->> 'shows')
   from public.audit_log a where a.business_id = pg_temp.a() and a.action = 'order.station.add'),
  'prep:' || pg_temp.d(1)::text || ':Kitchen,till:-:Till',
  'each lock is logged as order.station.add with what it shows and its department'
);

------------------------------------------------------------------------------
-- One cap of ten, every kind together

insert into public.clock_stations (business_id, name, token_hash, created_at)
select pg_temp.a(), 'Clock ' || n, pg_temp.h('clock-' || n), pg_temp.at(2)
from generate_series(1, 7) as n;
select public.start_station_pairing(pg_temp.h('door2-p'), pg_temp.h('door2-s'), pg_temp.h('door2'), pg_temp.at(3));
select is(
  pg_temp.refusal(format($$select pg_temp.lock(%L, 'x12', 'Bar', 'prep', %L, 3)$$, pg_temp.p(2), pg_temp.d(2)))
  || '|' || pg_temp.refusal(format($$select public.approve_station_pairing(%L, %L, 'Door 2', %L, null, %L)$$,
    pg_temp.p(2), pg_temp.a(), pg_temp.h('door2-p'), pg_temp.at(3))),
  '54000|54000',
  'with ten running, the door, seven clock stations, the kitchen''s screen and the till, neither lock makes another'
);
update public.clock_stations set stopped_at = pg_temp.at(4)
where token_hash in (pg_temp.h('clock-1'), pg_temp.h('clock-2'), pg_temp.h('clock-3'));
insert into ids values ('bar', pg_temp.lock(pg_temp.p(2), 'bar', 'Bar', 'prep', pg_temp.d(2), 5));
insert into ids values ('all', pg_temp.lock(pg_temp.p(2), 'all', 'Prep', 'prep', null, 5));
insert into ids values ('grill', pg_temp.lock(pg_temp.p(2), 'grill', 'Grill', 'prep', pg_temp.d(5), 5));
select is(
  (select count(*)::integer from public.clock_stations s
   where s.business_id = pg_temp.a() and s.stopped_at is null),
  10,
  'a stopped one counts for nothing: three stopped make room for three'
);

------------------------------------------------------------------------------
-- The registry's own functions

select is(
  public.station_by_token(pg_temp.h('kitchen')) ->> 'shows'
    || ':' || (public.station_by_token(pg_temp.h('kitchen')) ->> 'department')
    || ':' || (public.station_by_token(pg_temp.h('door')) ->> 'shows'),
  'prep:' || pg_temp.d(1)::text || ':clock_code',
  'a station read by its secret says what it shows and its department'
);
select is(
  pg_temp.refusal(format($$select public.issue_station_code(%L, %L, %L, %L)$$,
    pg_temp.h('kitchen'), pg_temp.h('code-1'), pg_temp.h('code-1s'), pg_temp.at(6)))
  || '|' || pg_temp.refusal(format($$select public.issue_station_code(%L, %L, %L, %L)$$,
    pg_temp.h('till'), pg_temp.h('code-2'), pg_temp.h('code-2s'), pg_temp.at(6)))
  || '|' || (select count(*)::text from public.punch_codes c
     where c.station_id in (pg_temp.id('kitchen'), pg_temp.id('till'))),
  '42501|42501|0',
  'a kitchen''s or a till''s secret makes no clock code'
);

------------------------------------------------------------------------------
-- Who reads the stations

select ok(
  not has_column_privilege('authenticated', 'public.clock_stations', 'token_hash', 'select')
  and has_column_privilege('authenticated', 'public.clock_stations', 'shows', 'select')
  and has_column_privilege('authenticated', 'public.clock_stations', 'last_action', 'select'),
  'nobody reads a station''s secret; what it shows and last did is read'
);
select pg_temp.sign_in(pg_temp.p(6));
insert into got values ('clock editor', (select jsonb_build_object(
  'clock', count(*) filter (where s.shows = 'clock_code'),
  'orders', count(*) filter (where s.shows <> 'clock_code'))
  from public.clock_stations s where s.business_id = pg_temp.a()));
reset role;
select pg_temp.sign_in(pg_temp.p(2));
insert into got values ('manager', (select jsonb_build_object(
  'clock', count(*) filter (where s.shows = 'clock_code'),
  'orders', count(*) filter (where s.shows <> 'clock_code'))
  from public.clock_stations s where s.business_id = pg_temp.a()));
reset role;
select pg_temp.sign_in(pg_temp.p(3));
insert into got values ('worker', (select jsonb_build_object('all', count(*))
  from public.clock_stations s where s.business_id = pg_temp.a()));
reset role;
select is(
  (pg_temp.got('clock editor') ->> 'clock') || ':' || (pg_temp.got('clock editor') ->> 'orders')
    || '|' || (pg_temp.got('manager') ->> 'clock') || ':' || (pg_temp.got('manager') ->> 'orders')
    || '|' || (pg_temp.got('worker') ->> 'all'),
  '8:0|8:5|0',
  'the clock''s editors read the clock''s stations, those who run orders the kitchen''s screens and the till too, a worker none'
);
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'order_taking';
select pg_temp.sign_in(pg_temp.p(2));
insert into got values ('manager off', (select jsonb_build_object('orders', count(*))
  from public.clock_stations s where s.business_id = pg_temp.a() and s.shows <> 'clock_code'));
reset role;
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'order_taking';
select is(
  pg_temp.got('manager off') ->> 'orders',
  '0',
  'with taking orders off, nobody reads its screens'
);

------------------------------------------------------------------------------
-- A kitchen's screen reads

select is(
  pg_temp.refusal(format($$select public.station_order_prep(%L, null, %L)$$, pg_temp.h('till'), pg_temp.at(60)))
  || '|' || pg_temp.refusal(format($$select public.station_order_prep(%L, null, %L)$$, pg_temp.h('nobody'), pg_temp.at(60)))
  || '|' || pg_temp.refusal(format($$select public.station_order_prep(%L, null, %L)$$, pg_temp.h('door'), pg_temp.at(60)))
  || '|' || pg_temp.refusal(format($$select public.station_order_prep('not a hash', null, %L)$$, pg_temp.at(60))),
  '42501 shows|42501|42501 shows|22023',
  'the till, a secret that is no station''s and the clock''s station read no tickets'
);
insert into got values ('kitchen', public.station_order_prep(pg_temp.h('kitchen'), null, pg_temp.at(60)));
select is(
  (select string_agg(d.key || ':' || t.status || ':' || coalesce((t.kitchen_seen_at = pg_temp.at(60))::text, '-'),
     ',' order by r.sent_at, t.position)
   from public.order_tickets t
   join public.order_rounds r on r.id = t.round_id
   join public.departments d on d.id = t.department_id
   where t.business_id = pg_temp.a()),
  'kitchen:new:true,kitchen:new:true,bar:new:-,kitchen:held:-',
  'reading marks the new tickets of its own department seen, yesterday''s still open too, never the bar''s, nor a held block'
);
select is(
  (select string_agg(e ->> 'status' || ':' || coalesce(e ->> 'sentBy', '-'), ',' order by n)
   from jsonb_array_elements(pg_temp.got('kitchen') -> 'tickets') with ordinality as x (e, n))
  || '|' || (strpos(pg_temp.got('kitchen')::text, 'gorot') = 0)::text
  || '|' || (pg_temp.got('kitchen') ->> 'lateAfterMinutes')
  || '|' || (pg_temp.got('kitchen') ->> 'departmentGone')
  || '|' || jsonb_array_length(pg_temp.got('kitchen') -> 'departments')::text,
  'new:-,new:' || pg_temp.p(5)::text || ',held:' || pg_temp.p(5)::text || '|true|15|false|5',
  'it reads its department''s tickets oldest first, the held block after, with no price, who sent it only today, and every department by name'
);
insert into got values ('kitchen again', public.station_order_prep(
  pg_temp.h('kitchen'), (pg_temp.got('kitchen') ->> 'version')::bigint, pg_temp.at(65)));
select is(
  pg_temp.got('kitchen again'),
  null::jsonb,
  'and nothing for the version it has, with nothing new since'
);
insert into got values ('all', public.station_order_prep(pg_temp.h('all'), null, pg_temp.at(70)));
select is(
  (select string_agg(e ->> 'status', ',' order by n)
   from jsonb_array_elements(pg_temp.got('all') -> 'tickets') with ordinality as x (e, n))
  || '|' || coalesce(pg_temp.got('all') ->> 'department', '-')
  || '|' || (select (t.kitchen_seen_at = pg_temp.at(70))::text from public.order_tickets t
     where t.id = pg_temp.ticket(1, 1)),
  'new,new,new,held|-|true',
  'a screen of every department reads and marks them all'
);
select is(
  (select (s.last_seen_at = pg_temp.at(60))::text from public.clock_stations s where s.id = pg_temp.id('kitchen')),
  'true',
  'a read stamps the station seen, once a minute at most'
);
update public.departments set archived_at = pg_temp.at(80) where id = pg_temp.d(5);
insert into got values ('grill', public.station_order_prep(pg_temp.h('grill'), null, pg_temp.at(81)));
select is(
  pg_temp.got('grill') ->> 'departmentGone',
  'true',
  'a screen whose department was removed says so'
);

insert into got values ('menu', public.station_order_menu(pg_temp.h('kitchen'), null));
insert into got values ('menu all', public.station_order_menu(pg_temp.h('all'), null));
select is(
  (select string_agg(e ->> 'name' || ':' || (e -> 'category' ->> 'name') || ':' || (e ->> 'available'), ',' order by n)
   from jsonb_array_elements(pg_temp.got('menu') -> 'items') with ordinality as x (e, n))
  || '|' || (select string_agg(e ->> 'name', ',' order by n)
   from jsonb_array_elements(pg_temp.got('menu all') -> 'items') with ordinality as x (e, n))
  || '|' || (strpos(pg_temp.got('menu all')::text, 'price') = 0)::text
  || '|' || coalesce(public.station_order_menu(pg_temp.h('kitchen'),
       (pg_temp.got('menu') ->> 'version')::bigint)::text, 'same'),
  'Hummus:Starters:true|Hummus,Beer,Lemonade|true|same',
  'what it marks sold out: its department''s live items (every one''s for all), no price, nothing for its version'
);

------------------------------------------------------------------------------
-- A kitchen's screen marks ready

select is(
  concat_ws('|',
    pg_temp.refusal(format($$select public.station_set_ticket_ready(%L, %L, true, %L)$$,
      pg_temp.h('kitchen'), pg_temp.ticket(1, 1), pg_temp.at(100))),
    pg_temp.refusal(format($$select public.station_set_ticket_ready(%L, %L, true, %L)$$,
      pg_temp.h('kitchen'), pg_temp.ticket(11, 0), pg_temp.at(100))),
    pg_temp.refusal(format($$select public.station_set_ticket_ready(%L, %L, true, %L)$$,
      pg_temp.h('kitchen'), pg_temp.ticket(2, 0), pg_temp.at(100))),
    pg_temp.refusal(format($$select public.station_set_ticket_ready(%L, %L, true, %L)$$,
      pg_temp.h('till'), pg_temp.ticket(1, 0), pg_temp.at(100)))
  ),
  'P0002|P0002|55000 held|42501 shows',
  'another department''s ticket and another business''s are none of its own; a held block waits; a till marks nothing'
);
select public.station_set_ticket_ready(pg_temp.h('kitchen'), pg_temp.ticket(1, 0), true, pg_temp.at(120));
select is(
  (select t.status || ':' || (t.ready_station = pg_temp.id('kitchen'))::text || ':'
     || (t.ready_by is null)::text || ':' || (t.prepared_at = pg_temp.at(120))::text
   from public.order_tickets t where t.id = pg_temp.ticket(1, 0))
  || '|' || (select s.last_action || ':' || (s.last_action_at = pg_temp.at(120))::text
     from public.clock_stations s where s.id = pg_temp.id('kitchen')),
  'ready:true:true:true|ready:true',
  'ready, kept as the station''s and nobody''s, and the station''s last action'
);
select public.station_set_ticket_ready(pg_temp.h('kitchen'), pg_temp.ticket(1, 0), false, pg_temp.at(180));
select is(
  (select t.status || ':' || coalesce(t.ready_station::text, '-') || ':' || coalesce(t.ready_at::text, '-')
   from public.order_tickets t where t.id = pg_temp.ticket(1, 0))
  || '|' || (select s.last_action from public.clock_stations s where s.id = pg_temp.id('kitchen')),
  'new:-:-|putBack',
  'and back within 5 minutes, the station gone with it'
);
select public.station_set_ticket_ready(pg_temp.h('kitchen'), pg_temp.ticket(1, 0), true, pg_temp.at(200));
select is(
  pg_temp.refusal(format($$select public.station_set_ticket_ready(%L, %L, false, %L)$$,
    pg_temp.h('kitchen'), pg_temp.ticket(1, 0), pg_temp.at(501))),
  '55000 window',
  'not after its 5 minutes'
);
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(1, 0), false, pg_temp.at(210));
select is(
  (select t.status || ':' || coalesce(t.ready_station::text, '-') || ':' || coalesce(t.ready_by::text, '-')
   from public.order_tickets t where t.id = pg_temp.ticket(1, 0)),
  'new:-:-',
  'a cook''s put back of the station''s ready clears the station too'
);

------------------------------------------------------------------------------
-- A kitchen's screen marks sold out

select public.station_set_item_available(pg_temp.h('kitchen'), pg_temp.i(1), false, pg_temp.at(220));
select is(
  (select i.available::text || ':' || (i.available_station = pg_temp.id('kitchen'))::text || ':'
     || (i.available_by is null)::text || ':' || (i.available_changed_at = pg_temp.at(220))::text
   from public.menu_items i where i.id = pg_temp.i(1))
  || '|' || ((select v.version from private.menu_versions v where v.business_id = pg_temp.a())
     > coalesce((pg_temp.got('menu') ->> 'version')::bigint, 0))::text
  || '|' || (select s.last_action from public.clock_stations s where s.id = pg_temp.id('kitchen')),
  'false:true:true:true|true|soldOut',
  'sold out, kept as the station''s, the menu''s version moved'
);
select is(
  concat_ws('|',
    pg_temp.refusal(format($$select public.station_set_item_available(%L, %L, false, %L)$$,
      pg_temp.h('kitchen'), pg_temp.i(2), pg_temp.at(230))),
    pg_temp.refusal(format($$select public.station_set_item_available(%L, %L, false, %L)$$,
      pg_temp.h('kitchen'), pg_temp.i(4), pg_temp.at(230))),
    pg_temp.refusal(format($$select public.station_set_item_available(%L, %L, false, %L)$$,
      pg_temp.h('kitchen'), pg_temp.i(11), pg_temp.at(230))),
    pg_temp.refusal(format($$select public.station_set_item_available(%L, %L, false, %L)$$,
      pg_temp.h('all'), pg_temp.i(2), pg_temp.at(230)))
  ),
  '42501|55000 archived|P0002|none',
  'not the bar''s item, nor a removed one, nor another business''s; every department''s screen marks any'
);
select public.set_menu_item_available(pg_temp.p(2), pg_temp.a(), pg_temp.i(2), true, pg_temp.at(240));
select is(
  (select i.available::text || ':' || coalesce(i.available_station::text, '-') || ':' || (i.available_by = pg_temp.p(2))::text
   from public.menu_items i where i.id = pg_temp.i(2)),
  'true:-:true',
  'a person''s change takes the station off it'
);

------------------------------------------------------------------------------
-- The till

insert into got values ('till', public.station_order_till(pg_temp.h('till'), null, pg_temp.at(300)));
select is(
  (select string_agg(coalesce(e -> 'place' ->> 'name', '-') || ':' || (e ->> 'held') || ':' || (e ->> 'closedHere')
     || ':' || jsonb_array_length(e -> 'byItem')::text, ',' order by n)
   from jsonb_array_elements(pg_temp.got('till') -> 'orders') with ordinality as x (e, n))
  || '|' || (strpos(pg_temp.got('till')::text, 'sentBy') = 0
    and strpos(pg_temp.got('till')::text, 'label') = 0
    and strpos(pg_temp.got('till')::text, 'total') = 0)::text
  || '|' || pg_temp.refusal(format($$select public.station_order_till(%L, null, %L)$$, pg_temp.h('kitchen'), pg_temp.at(300))),
  '3:0:false:1,1:0:false:2,2:1:false:1|true|42501 shows',
  'the till reads every open order, oldest first, what to ring up and what waits, with no person, label or total; a kitchen''s screen reads no till'
);

select is(
  pg_temp.refusal(format($$select public.station_close_order(%L, %L, %L)$$, pg_temp.h('till'), pg_temp.order_of(2), pg_temp.at(600)))
  || '|' || pg_temp.refusal(format($$select public.station_close_order(%L, %L, %L)$$, pg_temp.h('till'), pg_temp.order_of(11), pg_temp.at(600))),
  '55000 held|P0002',
  'a held block keeps an order open; another business''s order is none of the till''s'
);
select public.station_close_order(pg_temp.h('till'), pg_temp.order_of(1), pg_temp.at(600));
select is(
  (select o.status || ':' || (o.closed_station = pg_temp.id('till'))::text || ':' || (o.closed_by is null)::text
   from public.orders o where o.id = pg_temp.order_of(1))
  || '|' || (select string_agg(t.status || ':' || (t.served_station = pg_temp.id('till'))::text || ':' || (t.served_by is null)::text,
     ',' order by t.position)
   from public.order_tickets t where t.round_id = pg_temp.k(1)),
  'closed:true:true|served:true:true,served:true:true',
  'the till closes it, its tickets served by the station, nobody''s'
);
select is(
  pg_temp.refusal(format($$select public.undo_close_order(%L, %L, %L)$$, pg_temp.p(5), pg_temp.order_of(1), pg_temp.at(610))),
  '55000 window',
  'nobody takes the till''s close back but the till'
);
select public.station_undo_close_order(pg_temp.h('till'), pg_temp.order_of(1), pg_temp.at(630));
select is(
  (select o.status || ':' || coalesce(o.closed_station::text, '-') || ':' || (o.reopened_station = pg_temp.id('till'))::text
     || ':' || coalesce(o.reopened_by::text, '-')
   from public.orders o where o.id = pg_temp.order_of(1))
  || '|' || (select string_agg(t.status || ':' || coalesce(t.served_station::text, '-'), ',' order by t.position)
     from public.order_tickets t where t.round_id = pg_temp.k(1)),
  'open:-:true:-|new:-,new:-',
  'its "ביטול" within 2 minutes opens it again and gives the kitchen back what the close served'
);
select public.station_close_order(pg_temp.h('till'), pg_temp.order_of(1), pg_temp.at(700));
select is(
  pg_temp.refusal(format($$select public.station_undo_close_order(%L, %L, %L)$$, pg_temp.h('till'), pg_temp.order_of(1), pg_temp.at(821))),
  '55000 window',
  'not after its 2 minutes'
);
select public.station_reopen_order(pg_temp.h('till'), pg_temp.order_of(1), pg_temp.at(830));
select is(
  (select o.status || ':' || coalesce(o.closed_station::text, '-') || ':' || (o.reopened_station = pg_temp.id('till'))::text
   from public.orders o where o.id = pg_temp.order_of(1))
  || '|' || (select s.last_action from public.clock_stations s where s.id = pg_temp.id('till')),
  'open:-:true|reopen',
  'the till opens it again, its tickets left served'
);
select public.serve_order_ticket(pg_temp.p(5), pg_temp.ticket(1, 0), false, pg_temp.at(840));
select is(
  (select t.status || ':' || coalesce(t.served_station::text, '-') from public.order_tickets t
   where t.id = pg_temp.ticket(1, 0)),
  'new:-',
  'a waiter''s "not served" of what the till''s close served clears the station'
);
select public.close_order(pg_temp.p(5), pg_temp.order_of(1), pg_temp.at(850));
select public.reopen_order(pg_temp.p(5), pg_temp.order_of(1), pg_temp.at(860));
select is(
  (select o.status || ':' || (o.reopened_by = pg_temp.p(5))::text || ':' || coalesce(o.reopened_station::text, '-')
   from public.orders o where o.id = pg_temp.order_of(1)),
  'open:true:-',
  'a waiter closes and opens it again after the till did, the station cleared'
);

------------------------------------------------------------------------------
-- Stopping a station

select is(
  pg_temp.refusal(format($$select public.set_clock_station_stopped(%L, %L, true, %L)$$,
    pg_temp.p(6), pg_temp.id('till'), pg_temp.at(900)))
  || '|' || pg_temp.refusal(format($$select public.set_clock_station_stopped(%L, %L, true, %L)$$,
    pg_temp.p(3), (select id from public.clock_stations where token_hash = pg_temp.h('door')), pg_temp.at(900))),
  '42501|42501',
  'a clock editor who doesn''t run orders stops no till; a worker stops no clock station'
);
select public.set_clock_station_stopped(pg_temp.p(2), pg_temp.id('kitchen'), true, pg_temp.at(910));
select public.set_clock_station_stopped(pg_temp.p(6),
  (select id from public.clock_stations where token_hash = pg_temp.h('door')), true, pg_temp.at(910));
select is(
  (select string_agg(a.action || ':' || coalesce(a.details ->> 'shows', '-'), ',' order by a.action)
   from public.audit_log a where a.business_id = pg_temp.a() and a.action like '%.station.stop'),
  'clock.station.stop:-,order.station.stop:prep',
  'whoever runs orders stops the kitchen''s screen, logged with what it shows; whoever edits the clock the clock''s station, as before'
);
select is(
  concat_ws('|',
    pg_temp.refusal(format($$select public.station_order_prep(%L, null, %L)$$, pg_temp.h('kitchen'), pg_temp.at(920))),
    pg_temp.refusal(format($$select public.station_set_ticket_ready(%L, %L, true, %L)$$,
      pg_temp.h('kitchen'), pg_temp.ticket(1, 0), pg_temp.at(920)))
  ),
  '42501 stopped|42501 stopped',
  'a stopped screen reads and writes nothing'
);
select public.set_clock_station_stopped(pg_temp.p(2), pg_temp.id('kitchen'), false, pg_temp.at(950));
select is(
  (select (s.stopped_at is null)::text from public.clock_stations s where s.id = pg_temp.id('kitchen'))
  || '|' || (select count(*)::text from public.audit_log a
     where a.business_id = pg_temp.a() and a.action = 'order.station.restart'),
  'true|1',
  'and within its 2 minutes it runs again, logged as order.station.restart'
);
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'order_taking';
select is(
  pg_temp.refusal(format($$select public.set_clock_station_stopped(%L, %L, true, %L)$$,
    pg_temp.p(2), pg_temp.id('till'), pg_temp.at(960)))
  || '|' || pg_temp.refusal(format($$select public.station_order_till(%L, null, %L)$$, pg_temp.h('till'), pg_temp.at(960))),
  '42501 off|42501 off',
  'with taking orders off, its screens are neither stopped nor read'
);
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'order_taking';

------------------------------------------------------------------------------
-- Every new key leads an index

select is(
  (select string_agg(con.conrelid::regclass::text || '.' || a.attname, ',' order by 1)
   from pg_constraint con
   join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
   where con.contype = 'f'
     and con.confrelid = 'public.clock_stations'::regclass
     and a.attname in ('ready_station', 'served_station', 'closed_station', 'reopened_station', 'available_station')
     and not exists (
       select 1 from pg_index ix
       where ix.indrelid = con.conrelid and ix.indkey[0] = con.conkey[1]
     )),
  null,
  'every key to a station leads an index'
);

select * from finish();
rollback;
