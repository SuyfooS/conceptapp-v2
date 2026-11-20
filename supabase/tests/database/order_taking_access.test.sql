-- Taking orders: who takes them and when, and who reads what
-- (20261120000200_order_taking_takers.sql and
-- 20261120000300_order_taking_orders.sql; waiter mode P3). Decision 3: an
-- owner, someone on the staff in a department that takes orders, or someone
-- who holds order_taking.edit; never an accountant, nor someone who left;
-- a sender moved out of those departments since only has a round of theirs
-- that went through answered again. Decision 4: with the time clock on,
-- only during a shift (until 30 minutes
-- after clocking out, never on one left open more than 16 hours, never a
-- cancelled one or one in another business), owners always, and running
-- orders isn't the clock's, nor a retry's of a round that went through. The
-- reads: the floor, an order, its till, one's own rounds, the kitchen's
-- tickets and the most ordered, each for those it is for, with no price in
-- the kitchen's and no total anywhere, person ids only on today's orders,
-- another business's order refused as no order at all, and nothing read
-- from the tables directly. The settings' owner fields and their shapes, and
-- the demo's cap. Times are relative to the transaction's now(), the
-- business day turning twelve hours away from it. Fixed ids (e4…) and
-- numbers (050-064-xxxx).
begin;
select plan(58);

-- A: 1 owner, in no department; 2 a manager on the floor and at the bar; 3
-- a worker in the kitchen; 4 a worker at the bar; 5 a worker on the floor;
-- 6 put on the floor, then made the accountant; 7 a manager in no
-- department, on a shift; 8, 9 and 13 on the ConceptApp team, viewing A as
-- a worker, as an accountant and as a manager; 10 a worker on the floor who
-- left; 12 a manager in no department, off the clock; 21 to 26 workers on
-- the floor, each with a shift of their own (none, open 17 hours, out 29
-- and 31 minutes ago, cancelled, in another business). B: 11, its owner.
insert into auth.users (id, aud, role, phone)
select ('e4000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250064' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,7,8,9,10,11,12,13,21,22,23,24,25,26}'::int[]) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('e4000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'e4000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'e4000000-0000-4000-b000-000000000002'::uuid
$$;
-- Departments: 1 the kitchen, 2 the bar, 3 the floor.
create function pg_temp.d(n integer) returns uuid language sql as $$
  select ('e4000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.c(n integer) returns uuid language sql as $$
  select ('e4000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Items: 1 hummus 32.00 to the kitchen, 3 beer 28.00 and 4 lemonade 16.00 to
-- the bar.
create function pg_temp.i(n integer) returns uuid language sql as $$
  select ('e4000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.pl(n integer) returns uuid language sql as $$
  select ('e4000000-0000-4000-e000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.k(n integer) returns uuid language sql as $$
  select ('e4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- The order of the business day before, closed.
create function pg_temp.h() returns uuid language sql as $$
  select 'e4000000-0000-4000-f000-000000000001'::uuid
$$;
create function pg_temp.place(n integer) returns jsonb language sql as $$
  select jsonb_build_object('place', pg_temp.pl(n))
$$;
create function pg_temp.li(item integer, how_many integer) returns jsonb language sql as $$
  select jsonb_build_object('item', pg_temp.i(item), 'quantity', how_many)
$$;
-- A first send to table 9 now, by person n: what a check sends.
create function pg_temp.send(n integer) returns text language sql as $$
  select format(
    'select public.send_order_round(%L, %L, %L, %L, %L)',
    pg_temp.p(n), pg_temp.a(), pg_temp.k(99), pg_temp.place(9),
    jsonb_build_array(pg_temp.li(1, 1))
  )
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
-- The same word for word: its code, message, detail and hint.
create function pg_temp.said(call text) returns text language plpgsql as $$
declare
  got_code text;
  got_message text;
  got_detail text;
  got_hint text;
begin
  execute call;
  return 'none';
exception when others then
  get stacked diagnostics got_code = returned_sqlstate, got_message = message_text,
    got_detail = pg_exception_detail, got_hint = pg_exception_hint;
  return concat_ws(' | ', got_code, got_message, got_detail, got_hint);
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
-- Whether a read holds a key ending in Agorot anywhere: a price.
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

create temporary table ids (name text primary key, id uuid not null) on commit drop;
grant select on ids to authenticated, anon;
create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;
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

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'order-access-a', 'Order access A'),
  (pg_temp.b(), 'order-access-b', 'Order access B');

insert into public.memberships (business_id, user_id, role)
select pg_temp.a(), pg_temp.p(n),
  case when n = 1 then 'owner' when n in (2, 7, 12) then 'manager' else 'worker' end::public.member_role
from unnest('{1,2,3,4,5,6,7,10,12,21,22,23,24,25,26}'::int[]) as n;
insert into public.memberships (business_id, user_id, role)
values (pg_temp.b(), pg_temp.p(11), 'owner');

-- Taking orders and the time clock on in A, the floor and the bar taking
-- orders, its business day turning twelve hours from now so every moment
-- here is today's; taking orders on in B.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'order_taking', true, jsonb_build_object(
    'takerDepartments', '["floor", "bar"]'::jsonb,
    'dayEndsAt', to_char((now() at time zone 'Asia/Jerusalem') + interval '12 hours', 'HH24:MI')
  )),
  (pg_temp.a(), 'time_clock', true, '{}'),
  (pg_temp.b(), 'order_taking', true, '{}');

insert into public.departments (id, business_id, key, name)
values
  (pg_temp.d(1), pg_temp.a(), 'kitchen', 'Kitchen'),
  (pg_temp.d(2), pg_temp.a(), 'bar', 'Bar'),
  (pg_temp.d(3), pg_temp.a(), 'floor', 'Floor');
insert into public.department_members (department_id, business_id, user_id)
select pg_temp.d(3), pg_temp.a(), pg_temp.p(n)
from unnest('{2,5,6,10,21,22,23,24,25,26}'::int[]) as n;
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.d(2), pg_temp.a(), pg_temp.p(2)),
  (pg_temp.d(1), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.d(2), pg_temp.a(), pg_temp.p(4));
update public.memberships set role = 'accountant'
where business_id = pg_temp.a() and user_id = pg_temp.p(6);
update public.memberships set active = false
where business_id = pg_temp.a() and user_id = pg_temp.p(10);

insert into public.platform_staff (user_id, role)
values (pg_temp.p(8), 'onboarder'), (pg_temp.p(9), 'onboarder'), (pg_temp.p(13), 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  (pg_temp.p(8), pg_temp.a(), 'worker'),
  (pg_temp.p(9), pg_temp.a(), 'accountant'),
  (pg_temp.p(13), pg_temp.a(), 'manager');

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
select pg_temp.pl(n), pg_temp.a(), n::text, n::smallint from generate_series(1, 10) as n;

-- The shifts: an hour in for 3, 4, 5 and 7; for 22 open since 17 hours
-- ago; for 23 and 24 ended 29 and 31 minutes ago; for 25 a shift that was
-- cancelled; for 26 an hour in, in B.
insert into public.time_entries (business_id, user_id, clock_in, clock_out)
select pg_temp.a(), pg_temp.p(n), now() - interval '1 hour', null::timestamptz
from unnest('{3,4,5,7}'::int[]) as n;
insert into public.time_entries (business_id, user_id, clock_in, clock_out)
values
  (pg_temp.a(), pg_temp.p(22), now() - interval '17 hours', null),
  (pg_temp.a(), pg_temp.p(23), now() - interval '8 hours', now() - interval '29 minutes'),
  (pg_temp.a(), pg_temp.p(24), now() - interval '8 hours', now() - interval '31 minutes'),
  (pg_temp.b(), pg_temp.p(26), now() - interval '1 hour', null);
insert into public.time_entries (
  business_id, user_id, clock_in, clock_out, cancelled_at, cancelled_by, cancel_reason
)
values (
  pg_temp.a(), pg_temp.p(25), now() - interval '1 hour', now() - interval '10 minutes',
  now() - interval '5 minutes', pg_temp.p(1), 'Twice'
);

------------------------------------------------------------------------------
-- Who may call what

select ok(
  (
    select bool_and(
      not has_function_privilege('authenticated', f.sig, 'execute')
      and not has_function_privilege('anon', f.sig, 'execute')
      and not has_function_privilege('service_role', f.sig, 'execute')
    )
    from unnest(array[
      'private.order_taking_settings(uuid)', 'private.valid_taker_keys(jsonb)',
      'private.order_taker_keys(uuid)', 'private.order_clock_rule(uuid)',
      'private.order_take_back(uuid)', 'private.order_day_ends(uuid)',
      'private.order_business_day(uuid, timestamptz)', 'private.in_taker_department(uuid, uuid)',
      'private.on_the_clock(uuid, uuid, timestamptz)',
      'private.order_taker_refusal(uuid, uuid, timestamptz)',
      'private.takes_orders(uuid, uuid, timestamptz)',
      'private.require_taker(uuid, uuid, timestamptz)', 'private.prepares_in(uuid, uuid, uuid)'
    ]) as f (sig)
  )
  and has_function_privilege('service_role',
    'public.set_module_settings(uuid, uuid, public.module_key, jsonb)', 'execute')
  and not has_function_privilege('authenticated',
    'public.set_module_settings(uuid, uuid, public.module_key, jsonb)', 'execute'),
  'who takes orders is asked inside the functions only, and the settings are saved by the server'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'private'
     and p.proname in (
       'order_taking_settings', 'order_taker_keys', 'order_clock_rule', 'order_take_back',
       'order_day_ends', 'order_business_day', 'in_taker_department', 'on_the_clock',
       'order_taker_refusal', 'takes_orders', 'require_taker', 'prepares_in'
     )
     and p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )),
  12,
  'each that reads a table runs as its owner with an empty search path'
);

------------------------------------------------------------------------------
-- Who takes orders (decision 3)

select is(pg_temp.tried(pg_temp.send(5)), 'lives', 'a worker on the floor, on a shift, sends');
select is(pg_temp.tried(pg_temp.send(3)), '42501', 'one in the kitchen, which takes no orders, doesn''t');
select is(
  pg_temp.tried(pg_temp.send(7)), 'lives',
  'a manager in no department sends: running orders is taking them'
);
select is(
  pg_temp.tried(pg_temp.send(1)), 'lives',
  'an owner in no department sends, off any shift'
);
select is(pg_temp.tried(pg_temp.send(6)), '42501', 'an accountant put on the floor never does');
select is(pg_temp.tried(pg_temp.send(10)), 'P0002', 'nor someone who left');
select public.set_module_settings(pg_temp.p(1), pg_temp.a(), 'order_taking',
  '{"takerDepartments": ["kitchen"]}');
select is(
  pg_temp.tried(pg_temp.send(3)) || '|' || pg_temp.tried(pg_temp.send(5)),
  'lives|42501',
  'the owner chooses the departments: with the kitchen taking orders, the kitchen sends and the floor doesn''t'
);
select public.set_module_settings(pg_temp.p(1), pg_temp.a(), 'order_taking',
  '{"takerDepartments": ["floor", "bar"]}');

------------------------------------------------------------------------------
-- Only on shift (decision 4)

select is(pg_temp.tried(pg_temp.send(21)), '42501 clock', 'with no shift, no orders');
select is(
  pg_temp.tried(pg_temp.send(22)), '42501 stale_shift',
  'a shift left open 17 hours doesn''t count, and says so'
);
select is(pg_temp.tried(pg_temp.send(23)), 'lives', 'until 30 minutes after clocking out');
select is(pg_temp.tried(pg_temp.send(24)), '42501 clock', 'and not 31');
select is(pg_temp.tried(pg_temp.send(25)), '42501 clock', 'a cancelled shift doesn''t count');
select is(pg_temp.tried(pg_temp.send(26)), '42501 clock', 'nor a shift in another business');
update public.business_modules set settings = settings || '{"onlyOnTheClock": false}'
where business_id = pg_temp.a() and module_key = 'order_taking';
select is(pg_temp.tried(pg_temp.send(21)), 'lives', 'with the rule off, anyone who takes orders sends');
update public.business_modules set settings = settings - 'onlyOnTheClock'
where business_id = pg_temp.a() and module_key = 'order_taking';
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'time_clock';
select is(pg_temp.tried(pg_temp.send(21)), 'lives', 'and with the time clock off');
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'time_clock';

------------------------------------------------------------------------------
-- Orders to read

-- Table 1: two hummus and a beer, ten minutes ago; table 2: a lemonade from
-- the bar's own, nine minutes ago; tables 3 and 4: a hummus each, eight
-- minutes ago, made ready six and four minutes ago.
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(1), pg_temp.place(1),
  jsonb_build_array(pg_temp.li(1, 2), pg_temp.li(3, 1)), now() - interval '10 minutes');
select public.send_order_round(pg_temp.p(4), pg_temp.a(), pg_temp.k(2), pg_temp.place(2),
  jsonb_build_array(pg_temp.li(4, 1)), now() - interval '9 minutes');
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(3), pg_temp.place(3),
  jsonb_build_array(pg_temp.li(1, 1)), now() - interval '8 minutes');
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(4), pg_temp.place(4),
  jsonb_build_array(pg_temp.li(1, 1)), now() - interval '8 minutes');
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(3, 0), true,
  now() - interval '6 minutes');
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(4, 0), true,
  now() - interval '4 minutes');
insert into ids (name, id) values ('order1', pg_temp.order_of(1));

-- The business day before: table 5's hummus, served and closed.
insert into public.orders (
  id, business_id, place_id, day, status, opened_by, opened_at, closed_by, closed_at
)
values (
  pg_temp.h(), pg_temp.a(), pg_temp.pl(5),
  private.order_business_day(pg_temp.a(), now() - interval '2 days'), 'closed',
  pg_temp.p(5), now() - interval '2 days', pg_temp.p(5), now() - interval '2 days' + interval '1 hour'
);
insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
values (pg_temp.k(90), pg_temp.a(), pg_temp.h(), repeat('0', 64), pg_temp.p(5), now() - interval '2 days');
insert into public.order_tickets (
  business_id, order_id, round_id, department_id, status, ready_at, served_at, served_by, served_new
)
values (
  pg_temp.a(), pg_temp.h(), pg_temp.k(90), pg_temp.d(1), 'served',
  now() - interval '2 days' + interval '1 hour', now() - interval '2 days' + interval '1 hour',
  pg_temp.p(5), true
);
insert into public.order_lines (business_id, ticket_id, item_id, name, unit_agorot, quantity)
values (pg_temp.a(), pg_temp.ticket(90, 0), pg_temp.i(1), 'חומוס', 3200, 1);

-- Running orders isn't the clock's (default 1 to ask Orel): a manager off
-- any shift sends nothing, and still gives on the house and cancels.
select is(
  pg_temp.tried(pg_temp.send(12))
  || '|' || pg_temp.tried(format('select public.comp_order_line(%L, %L, %L)',
    pg_temp.p(12), pg_temp.line(1, 1), 'staff'))
  || '|' || pg_temp.tried(format('select public.cancel_order(%L, %L, %L)',
    pg_temp.p(12), pg_temp.order_of(1), 'guest')),
  '42501 clock|lives|lives',
  'a manager off the clock sends nothing, but gives on the house and cancels an order'
);

------------------------------------------------------------------------------
-- The floor

select pg_temp.sign_in(pg_temp.p(5));
select is(
  (select jsonb_array_length(f.answer -> 'orders')::text || ' ' || (not pg_temp.priced(f.answer))::text
   from (select public.order_floor(pg_temp.a()) as answer) f),
  '4 true',
  'a waiter on a shift reads the floor''s four open orders, with no price'
);
select pg_temp.sign_in(pg_temp.p(21));
select is(
  pg_temp.refusal($c$select public.order_floor(pg_temp.a())$c$),
  '42501 clock',
  'off a shift, the floor says why it is closed'
);
select pg_temp.sign_in(pg_temp.p(3));
select is(
  pg_temp.refusal($c$select public.order_floor(pg_temp.a())$c$),
  'P0002',
  'the kitchen reads no floor'
);
select pg_temp.sign_in(pg_temp.p(6));
select is(
  pg_temp.refusal($c$select public.order_floor(pg_temp.a())$c$),
  'P0002',
  'nor the accountant'
);
select pg_temp.sign_in(pg_temp.p(8));
select is(
  (select (f.answer ->> 'runs') || ' ' || jsonb_array_length(f.answer -> 'orders')
   from (select public.order_floor(pg_temp.a()) as answer) f),
  'false 4',
  'a view as a worker reads it, running nothing'
);
select pg_temp.sign_in(pg_temp.p(9));
select is(
  pg_temp.refusal($c$select public.order_floor(pg_temp.a())$c$),
  'P0002',
  'a view as an accountant reads none of it'
);
select pg_temp.sign_in(pg_temp.p(5));
select ok(
  public.order_floor(pg_temp.a(), (public.order_floor(pg_temp.a()) ->> 'version')::bigint) is null,
  'the version it holds gives nothing new'
);
select ok(
  public.order_floor(pg_temp.a()) -> 'fixes' = 'null'::jsonb,
  'a waiter sees no count of the day''s fixes'
);
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select string_agg(k.field, ',' order by k.field)
   from jsonb_object_keys(public.order_floor(pg_temp.a()) -> 'fixes') as k (field)),
  'cancelled,comped,takenBack',
  'those who run orders do'
);
reset role;

------------------------------------------------------------------------------
-- The kitchen's screen

select pg_temp.sign_in(pg_temp.p(3));
select is(
  (select string_agg(t.ticket ->> 'placeName', ',' order by t.n) || ' '
     || bool_and((t.ticket ->> 'department')::uuid = pg_temp.d(1))::text || ' '
     || (not pg_temp.priced(p.answer))::text
   from (select public.order_prep(pg_temp.a()) as answer) p
   cross join lateral jsonb_array_elements(p.answer -> 'tickets') with ordinality as t (ticket, n)
   group by p.answer),
  '1,4 true true',
  'the kitchen reads its own tickets, oldest first, one made ready 4 minutes ago and not one 6 minutes ago, with no price'
);
reset role;
select is(
  (select (t.kitchen_seen_at is not null)::text from public.order_tickets t where t.id = pg_temp.ticket(1, 0))
  || ':' || (select (t.kitchen_seen_at is not null)::text from public.order_tickets t where t.id = pg_temp.ticket(1, 1))
  || ':' || (select (t.kitchen_seen_at is not null)::text from public.order_tickets t where t.id = pg_temp.ticket(4, 0)),
  'true:false:false',
  'and has its new tickets seen, not the bar''s, nor one already ready'
);
select pg_temp.sign_in(pg_temp.p(7));
select is(
  (select string_agg(t.ticket ->> 'placeName', ',' order by t.n) || ' '
     || jsonb_array_length(p.answer -> 'departments')::text
   from (select public.order_prep(pg_temp.a()) as answer) p
   cross join lateral jsonb_array_elements(p.answer -> 'tickets') with ordinality as t (ticket, n)
   group by p.answer),
  '1,1,2,4 3',
  'a manager in no department reads every department''s'
);
select pg_temp.sign_in(pg_temp.p(8));
select is(
  (select string_agg(t.ticket ->> 'placeName', ',' order by t.n)
   from jsonb_array_elements(public.order_prep(pg_temp.a()) -> 'tickets') with ordinality as t (ticket, n)),
  '1,1,2,4',
  'and so does a view as a worker'
);
reset role;
select ok(
  (select bool_and(t.kitchen_seen_at is null) from public.order_tickets t
   where t.id in (pg_temp.ticket(1, 1), pg_temp.ticket(2, 0))),
  'neither of them marks the bar''s tickets seen'
);
select pg_temp.sign_in(pg_temp.p(4));
select is(
  (select string_agg(t.ticket ->> 'placeName', ',' order by t.n)
   from jsonb_array_elements(public.order_prep(pg_temp.a()) -> 'tickets') with ordinality as t (ticket, n)),
  '1,2',
  'the bar reads its own'
);
select pg_temp.sign_in(pg_temp.p(6));
select is(
  pg_temp.refusal($c$select public.order_prep(pg_temp.a())$c$),
  'P0002',
  'an accountant put in a department reads none'
);

------------------------------------------------------------------------------
-- One's own rounds

select pg_temp.sign_in(pg_temp.p(5));
select is(
  (select string_agg(r.round ->> 'placeName', ',' order by r.n)
   from jsonb_array_elements(public.order_mine(pg_temp.a()) -> 'rounds') with ordinality as r (round, n)),
  '3,4,1',
  'a waiter reads their own rounds of today, those with a ticket ready first'
);
select pg_temp.sign_in(pg_temp.p(8));
select is(
  jsonb_array_length(public.order_mine(pg_temp.a()) -> 'rounds'),
  0,
  'a view is nobody: none'
);

------------------------------------------------------------------------------
-- Another day's order, and today's

select pg_temp.sign_in(pg_temp.p(5));
select is(
  pg_temp.refusal($c$select public.order_detail(pg_temp.h())$c$),
  'P0002',
  'a waiter doesn''t read a closed order of another day'
);
select pg_temp.sign_in(pg_temp.p(8));
select is(
  pg_temp.refusal($c$select public.order_detail(pg_temp.h())$c$),
  'P0002',
  'nor does a view as a worker'
);
select pg_temp.sign_in(pg_temp.p(13));
select ok(
  (select (d.answer ->> 'id')::uuid = pg_temp.h()
     and d.answer -> 'openedBy' = 'null'::jsonb
     and d.answer -> 'rounds' -> 0 -> 'sentBy' = 'null'::jsonb
   from (select public.order_detail(pg_temp.h()) as answer) d),
  'a view as a manager, whose role runs orders, does, with nobody named on it'
);
select pg_temp.sign_in(pg_temp.p(11));
select is(
  pg_temp.said($c$select public.order_detail(pg_temp.h())$c$)
    || ' / ' || pg_temp.said($c$select public.order_till(pg_temp.h())$c$),
  pg_temp.said($c$select public.order_detail('e4000000-0000-4000-f000-000000000099')$c$)
    || ' / ' || pg_temp.said($c$select public.order_till('e4000000-0000-4000-f000-000000000099')$c$),
  'another business''s owner is refused A''s order word for word as an order that doesn''t exist'
);
select pg_temp.sign_in(pg_temp.p(2));
select ok(
  (select (d.answer ->> 'id')::uuid = pg_temp.h()
     and d.answer -> 'openedBy' = 'null'::jsonb
     and d.answer -> 'closedBy' = 'null'::jsonb
     and d.answer -> 'rounds' -> 0 -> 'sentBy' = 'null'::jsonb
     and d.answer -> 'rounds' -> 0 -> 'tickets' -> 0 -> 'lines' -> 0 ->> 'name' = 'חומוס'
   from (select public.order_detail(pg_temp.h()) as answer) d),
  'those who run orders do, with nobody named on it'
);
select pg_temp.sign_in(pg_temp.p(5));
select ok(
  (select (d.answer ->> 'openedBy')::uuid = pg_temp.p(5)
     and (d.answer -> 'rounds' -> 0 ->> 'sentBy')::uuid = pg_temp.p(5)
     and d.answer -> 'rounds' -> 0 -> 'tickets' -> 0 -> 'lines' -> 0 ->> 'unitAgorot' = '3200'
   from (select public.order_detail(pg_temp.id('order1')) as answer) d),
  'today''s names who opened it and who sent each round'
);
reset role;

------------------------------------------------------------------------------
-- The till

-- Another round to table 1: a hummus taken back, a beer on the house, a
-- lemonade cancelled.
select public.send_order_round(pg_temp.p(5), pg_temp.a(), pg_temp.k(5),
  jsonb_build_object('order', pg_temp.order_of(1), 'place', pg_temp.pl(1)),
  jsonb_build_array(pg_temp.li(1, 1), pg_temp.li(3, 1), pg_temp.li(4, 1)),
  now() - interval '5 minutes');
select public.take_back_order_line(pg_temp.p(5), pg_temp.line(5, 0), now() - interval '4 minutes');
select public.comp_order_line(pg_temp.p(2), pg_temp.line(5, 1), 'staff');
select public.cancel_order_line(pg_temp.p(5), pg_temp.line(5, 2), 'guest');
select pg_temp.sign_in(pg_temp.p(5));
select is(
  (select string_agg(
     (i.line ->> 'name') || ':' || (i.line ->> 'quantity') || ':' || (i.line ->> 'comped'),
     ',' order by i.n)
   from jsonb_array_elements(public.order_till(pg_temp.id('order1')) -> 'byItem')
     with ordinality as i (line, n)),
  'חומוס:2:false,בירה:1:false,בירה:1:true',
  'the till has the live lines by item, the same ones together, on the house apart'
);
select ok(
  (select jsonb_array_length(t.answer -> 'byRound') = 2
     and jsonb_array_length(t.answer -> 'byRound' -> 1 -> 'lines') = 1
     and t.answer -> 'byRound' -> 1 -> 'lines' -> 0 ->> 'unitAgorot' = '2800'
     and not jsonb_path_exists(t.answer, '$.**.total')
   from (select public.order_till(pg_temp.id('order1')) as answer) t),
  'and by round, taken back and cancelled lines left out, with no total'
);
reset role;

------------------------------------------------------------------------------
-- The most ordered

-- B's menu of thirteen herbs, one each of 10.00, written straight into the
-- tables: Oregano sold out, Pepper removed, Rosemary in a removed category.
-- One order at its table, with a round of yesterday's and one of 15 days
-- ago (Dill's twenty). Cumin's nine more were cancelled.
insert into public.departments (id, business_id, key, name)
values (pg_temp.d(11), pg_temp.b(), 'kitchen', 'Kitchen');
insert into public.menu_categories (id, business_id, name, department_id, position, archived_at)
values
  (pg_temp.c(11), pg_temp.b(), 'Herbs', pg_temp.d(11), 0, null),
  (pg_temp.c(12), pg_temp.b(), 'Old', pg_temp.d(11), 1, now() - interval '1 day');
insert into public.menu_items (id, business_id, category_id, name, price_agorot, available, archived_at)
select pg_temp.i(10 + h.n::integer), pg_temp.b(),
  case when h.name = 'Rosemary' then pg_temp.c(12) else pg_temp.c(11) end,
  h.name, 1000, h.name <> 'Oregano',
  case when h.name = 'Pepper' then now() - interval '1 day' end
from unnest(array[
  'Anise', 'Basil', 'Cumin', 'Dill', 'Fennel', 'Ginger', 'Mint', 'Nutmeg', 'Oregano', 'Pepper',
  'Rosemary', 'Sage', 'Thyme'
]) with ordinality as h (name, n);
insert into public.order_places (id, business_id, name) values (pg_temp.pl(21), pg_temp.b(), '1');
insert into public.orders (id, business_id, place_id, day, opened_by, opened_at)
values (
  'e4000000-0000-4000-f000-000000000002', pg_temp.b(), pg_temp.pl(21), current_date - 15,
  pg_temp.p(11), now() - interval '15 days'
);
insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
values
  (pg_temp.k(81), pg_temp.b(), 'e4000000-0000-4000-f000-000000000002', repeat('0', 64),
   pg_temp.p(11), now() - interval '15 days'),
  (pg_temp.k(82), pg_temp.b(), 'e4000000-0000-4000-f000-000000000002', repeat('0', 64),
   pg_temp.p(11), now() - interval '1 day');
insert into public.order_tickets (business_id, order_id, round_id, department_id, status)
values
  (pg_temp.b(), 'e4000000-0000-4000-f000-000000000002', pg_temp.k(81), pg_temp.d(11), 'new'),
  (pg_temp.b(), 'e4000000-0000-4000-f000-000000000002', pg_temp.k(82), pg_temp.d(11), 'new');
insert into public.order_lines (
  business_id, ticket_id, item_id, name, unit_agorot, quantity, cancelled_at, cancelled_by,
  cancel_reason
)
select pg_temp.b(), pg_temp.ticket(case when h.name = 'Dill' then 81 else 82 end, 0), i.id, i.name,
  1000, h.how_many,
  case when h.cancelled then now() - interval '1 day' end,
  case when h.cancelled then pg_temp.p(11) end,
  case when h.cancelled then 'guest' end
from (
  values
    ('Anise', 2, false), ('Basil', 2, false), ('Cumin', 2, false), ('Cumin', 9, true),
    ('Dill', 20, false), ('Fennel', 4, false), ('Ginger', 5, false), ('Mint', 6, false),
    ('Nutmeg', 7, false), ('Oregano', 10, false), ('Pepper', 10, false),
    ('Rosemary', 10, false), ('Sage', 8, false), ('Thyme', 9, false)
) as h (name, how_many, cancelled)
join public.menu_items i on i.business_id = pg_temp.b() and i.name = h.name;
select pg_temp.sign_in(pg_temp.p(11));
select is(
  public.order_favourites(pg_temp.b()) -> 'items',
  jsonb_build_array(
    pg_temp.i(23), pg_temp.i(22), pg_temp.i(18), pg_temp.i(17), pg_temp.i(16), pg_temp.i(15),
    pg_temp.i(11), pg_temp.i(12)
  ),
  'the most ordered: eight live, available items by their live lines of the last 14 days, Anise and Basil before Cumin by name'
);
reset role;

------------------------------------------------------------------------------
-- Nobody reads the tables

select pg_temp.sign_in(pg_temp.p(1));
select is(
  concat_ws('|',
    pg_temp.refusal('select count(*) from public.orders'),
    pg_temp.refusal('select count(*) from public.order_rounds'),
    pg_temp.refusal('select count(*) from public.order_tickets'),
    pg_temp.refusal('select count(*) from public.order_lines')),
  '42501|42501|42501|42501',
  'not even the owner reads the orders directly'
);
reset role;
set local role anon;
select is(pg_temp.refusal('select count(*) from public.orders'), '42501', 'nor a visitor');
reset role;
set local role service_role;
select is(
  pg_temp.refusal(format(
    'insert into public.orders (business_id, place_id, day, opened_at) values (%L, %L, current_date, now())',
    pg_temp.a(), pg_temp.pl(9)))
  || '|' || pg_temp.refusal('delete from public.orders'),
  '42501|42501',
  'and the server role writes and deletes none: only the functions do'
);
reset role;
select ok(
  not has_table_privilege('authenticated', 'private.order_versions', 'select')
  and not has_table_privilege('authenticated', 'private.order_day_counters', 'select')
  and not has_table_privilege('service_role', 'private.order_day_counters', 'insert')
  and not has_table_privilege('service_role', 'public.order_lines', 'select'),
  'nor the counters and the versions'
);

------------------------------------------------------------------------------
-- The settings

select is(
  pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(2), pg_temp.a(), 'order_taking',
    '{"lateAfterMinutes": 20}')$c$),
  'none',
  'a manager who runs orders sets when an order waits too long'
);
select is(
  pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(2), pg_temp.a(), 'order_taking',
    '{"takeBackMinutes": 5}')$c$)
  || '|' || pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(2), pg_temp.a(),
    'order_taking', '{"takerDepartments": ["floor"]}')$c$),
  '42501|42501',
  'but not the take-back time nor who takes orders'
);
select is(
  pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(1), pg_temp.a(), 'order_taking',
    '{"takeBackMinutes": 5}')$c$)
  || '|' || pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(8), pg_temp.a(),
    'order_taking', '{"onlyOnTheClock": true}')$c$),
  'none|none',
  'the owner and the team do'
);
select is(
  concat_ws('|',
    pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(1), pg_temp.a(), 'order_taking',
      '{"takeBackMinutes": 3}')$c$),
    pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(1), pg_temp.a(), 'order_taking',
      '{"dayEndsAt": "24:00"}')$c$),
    pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(1), pg_temp.a(), 'order_taking',
      '{"takerDepartments": ["Bad"]}')$c$),
    pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(1), pg_temp.a(), 'order_taking',
      '{"onlyOnTheClock": "yes"}')$c$),
    pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(1), pg_temp.a(), 'order_taking',
      '{"lateAfterMinutes": 25}')$c$)),
  '22023|22023|22023|22023|22023',
  'each a value the manifest offers'
);
select is(
  pg_temp.refusal($c$select public.set_module_settings(pg_temp.p(5), pg_temp.a(), 'order_taking',
    '{"lateAfterMinutes": 10}')$c$),
  '42501',
  'a worker sets none'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.a() and a.action = 'module.settings'
     and a.details ->> 'module' = 'order_taking'),
  5,
  'each save that went through is logged, as before'
);

------------------------------------------------------------------------------
-- A round sent again after its sender clocked out

-- 23, out 29 minutes ago, sends to table 6 now. Two minutes on, off the
-- clock, a new round is refused, and the phone's retry of this one gets its
-- answer: the stored round is looked up before the clock is asked.
select public.send_order_round(pg_temp.p(23), pg_temp.a(), pg_temp.k(6), pg_temp.place(6),
  jsonb_build_array(pg_temp.li(1, 1)), now());
select is(
  pg_temp.refusal(format(
    'select public.send_order_round(%L, %L, %L, %L, %L, %L)',
    pg_temp.p(23), pg_temp.a(), pg_temp.k(7), pg_temp.place(7),
    jsonb_build_array(pg_temp.li(1, 1)), now() + interval '2 minutes'
  ))
  || '|' || (
    public.send_order_round(pg_temp.p(23), pg_temp.a(), pg_temp.k(6), pg_temp.place(6),
      jsonb_build_array(pg_temp.li(1, 1)), now() + interval '2 minutes')
    = private.order_round_answer(pg_temp.k(6))
  )::text,
  '42501 clock|true',
  'a round sent again after its sender clocked out gives its answer, while a new one is refused'
);

------------------------------------------------------------------------------
-- A round sent again after its sender left the departments that take orders

-- 4, on a shift, sent table 2's lemonade above and is then taken out of the
-- bar, so takes no orders. The phone's retry of that round gets its answer,
-- looked up before any lock, while a new round is refused as from someone
-- who takes no orders.
delete from public.department_members
where business_id = pg_temp.a() and user_id = pg_temp.p(4) and department_id = pg_temp.d(2);
select is(
  (
    public.send_order_round(pg_temp.p(4), pg_temp.a(), pg_temp.k(2), pg_temp.place(2),
      jsonb_build_array(pg_temp.li(4, 1)), now())
    = private.order_round_answer(pg_temp.k(2))
  )::text
  || '|' || pg_temp.refusal(format(
    'select public.send_order_round(%L, %L, %L, %L, %L, %L)',
    pg_temp.p(4), pg_temp.a(), pg_temp.k(8), pg_temp.place(8),
    jsonb_build_array(pg_temp.li(4, 1)), now()
  )),
  'true|42501',
  'a sender moved out of the departments that take orders gets their round''s answer again, while a new round is refused'
);

------------------------------------------------------------------------------
-- The demo's cap

insert into private.demo_businesses (business_id, definition) values (pg_temp.a(), '{}');
-- With the six rounds sent here, a hundred in the last hour.
insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
select gen_random_uuid(), pg_temp.a(), pg_temp.order_of(1), repeat('0', 64), pg_temp.p(5),
  now() - interval '30 minutes'
from generate_series(1, 94);
select is(pg_temp.tried(pg_temp.send(5)), '54000', 'a demo business takes a hundred rounds an hour');

select * from finish();
rollback;
