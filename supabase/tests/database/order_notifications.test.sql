-- Taking orders: "מוכן" on the sender's phone and "המסך לא מחובר"
-- (20261125000100_order_taking_notifications.sql; waiter mode P8b). The
-- group `orders` with its two kinds; "מוכן" to the round's sender alone,
-- never to whoever marked it, with the place, the department and the count
-- and no price, its push 10 seconds late and read (so never pushed) once the
-- sync showed it; settled when served, put back, closed or cancelled, and
-- told again when ready again; a kitchen's screen's with no actor. Quiet
-- hours let `orders` through during a shift where the time clock is on
-- (decision 8), its switch still keeps it off, and off a shift it waits and
-- then goes no more. Never pushed in a demo; never for an accountant; read
-- only by its own person, while taking orders is on. "המסך לא מחובר" once
-- per ticket, 2 minutes after it was sent or called, only with a running
-- prep screen of its department or of every one, only within 10 minutes, to
-- the sender and whoever runs orders on the clock; settled when a screen
-- fetches it, it turns ready, or its every line goes. The daily clean-up
-- deletes order lines after 2 days; the minute job writes them; the mode
-- says which departments a running prep screen shows. Every moment is
-- passed in, from 1 December 2026 18:00 UTC (20:00 in the business), but
-- the minute job's, which reads now(). Fixed ids (eb…), numbers
-- (05-007-100xx) and slugs (order-notices-…), so nothing here meets the seed
-- or another test.
begin;
select plan(70);
-- Times read back as text, in UTC.
set local timezone = 'UTC';

-- A: 1 owner, off the clock; 2 a manager on the floor, who runs orders, on
-- the clock; 3 a cook in the kitchen, on the clock; 4 a waiter on the floor,
-- on the clock; 5 a waiter on the floor, off it; 6 the accountant. B: 7, its
-- owner. D, a demo: 8 its owner, who takes orders; 9 its cook.
insert into auth.users (id, aud, role, phone)
select ('eb000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '9725007100' || lpad(n::text, 2, '0')
from generate_series(1, 9) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('eb000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'eb000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'eb000000-0000-4000-b000-000000000002'::uuid
$$;
create function pg_temp.d() returns uuid language sql as $$
  select 'eb000000-0000-4000-b000-000000000003'::uuid
$$;
-- Departments: A's 1 kitchen, 2 bar, 3 floor; B's 11; D's 21 kitchen.
create function pg_temp.dep(n integer) returns uuid language sql as $$
  select ('eb000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Categories: A's 1 starters to the kitchen, 2 drinks to the bar; D's 21.
create function pg_temp.c(n integer) returns uuid language sql as $$
  select ('eb000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Items: A's 1 hummus, 2 beer; D's 21 hummus.
create function pg_temp.i(n integer) returns uuid language sql as $$
  select ('eb000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Places: A's 1 to 16; D's 21 and 22.
create function pg_temp.pl(n integer) returns uuid language sql as $$
  select ('eb000000-0000-4000-e000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Round keys, as a phone makes them.
create function pg_temp.k(n integer) returns uuid language sql as $$
  select ('eb000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- A moment, seconds after 20:00 in the business on 1 December 2026.
create function pg_temp.at(seconds integer) returns timestamptz language sql as $$
  select '2026-12-01 18:00+00'::timestamptz + make_interval(secs => seconds)
$$;
-- A hash as the server makes them: 64 hex digits.
create function pg_temp.h(key text) returns text language sql as $$
  select encode(sha256(convert_to(key, 'UTF8')), 'hex')
$$;
create function pg_temp.li(item integer, how_many integer, held boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object('item', pg_temp.i(item), 'quantity', how_many, 'held', held)
$$;
-- `person` sends a round `n` to place `place_no` of `business` at `at_time`.
create function pg_temp.send(
  person integer, business uuid, n integer, place_no integer, lines jsonb, at_time timestamptz
) returns void language sql as $$
  select public.send_order_round(pg_temp.p(person), business, pg_temp.k(n),
    jsonb_build_object('place', pg_temp.pl(place_no)), lines, at_time)
$$;
create function pg_temp.order_of(n integer) returns uuid language sql as $$
  select r.order_id from public.order_rounds r where r.id = pg_temp.k(n)
$$;
create function pg_temp.ticket(n integer, place_no integer) returns uuid language sql as $$
  select t.id from public.order_tickets t where t.round_id = pg_temp.k(n) and t.position = place_no
$$;
create function pg_temp.line_of(n integer) returns uuid language sql as $$
  select l.id from public.order_lines l
  join public.order_tickets t on t.id = l.ticket_id
  where t.round_id = pg_temp.k(n)
  order by l.position
  limit 1
$$;
create function pg_temp.ready(n integer, place_no integer) returns text language sql as $$
  select 'order.ready:' || pg_temp.ticket(n, place_no)::text
$$;
create function pg_temp.unseen(n integer, place_no integer) returns text language sql as $$
  select 'order.unseen:' || pg_temp.ticket(n, place_no)::text
$$;
-- `person`'s line of `what`.
create function pg_temp.note(person integer, what text) returns public.notifications
language sql as $$
  select n.* from public.notifications n
  where n.user_id = pg_temp.p(person) and n.dedupe_key = what
$$;
-- Who has a line of `what`, in order.
create function pg_temp.who(what text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n where n.dedupe_key = what
$$;
create function pg_temp.people(variadic ns integer[]) returns uuid[] language sql as $$
  select array_agg(pg_temp.p(n) order by pg_temp.p(n)) from unnest(ns) as n
$$;
-- How many pushes of the line `line_key` a send at `at_time` claims. The
-- parameter must not share a name with claim_due_pushes' columns: in an SQL
-- function a column wins, so `what` would read the claim's own kind and
-- count nothing.
create function pg_temp.claimed(line_key text, at_time timestamptz) returns integer language sql as $$
  select count(*)::integer from public.claim_due_pushes(200, at_time) c
  where c.notification in (select n.id from public.notifications n where n.dedupe_key = line_key)
$$;
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Lines' keys kept for reading them back as someone signed in, who reads no
-- ticket.
create temp table line_keys (name text primary key, what text not null) on commit drop;
grant select on line_keys to authenticated;
create function pg_temp.key(which text) returns text language sql as $$
  select what from line_keys where name = which
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'order-notices-a', 'Order notices A'),
  (pg_temp.b(), 'order-notices-b', 'Order notices B'),
  (pg_temp.d(), 'order-notices-d', 'Order notices D');
insert into private.demo_businesses (business_id, definition)
values (pg_temp.d(), '{"slug": "order-notices-d"}');
insert into public.memberships (business_id, user_id, role, perms)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', '{}'),
  (pg_temp.a(), pg_temp.p(2), 'manager', '{}'),
  (pg_temp.a(), pg_temp.p(3), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(4), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(5), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(6), 'accountant', '{}'),
  (pg_temp.b(), pg_temp.p(7), 'owner', '{}'),
  (pg_temp.d(), pg_temp.p(8), 'owner', '{}'),
  (pg_temp.d(), pg_temp.p(9), 'worker', '{}');
-- Orders are taken off a shift here, so the clock's rule for taking them
-- stays out of it; the time clock still says who is on a shift.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'order_taking', true, '{"takerDepartments": ["floor"], "onlyOnTheClock": false}'),
  (pg_temp.a(), 'notifications', true, '{}'),
  (pg_temp.a(), 'time_clock', true, '{"codeDisplay": "both"}'),
  (pg_temp.b(), 'order_taking', true, '{"takerDepartments": ["kitchen"], "onlyOnTheClock": false}'),
  (pg_temp.b(), 'notifications', true, '{}'),
  (pg_temp.d(), 'order_taking', true, '{"takerDepartments": ["kitchen"], "onlyOnTheClock": false}'),
  (pg_temp.d(), 'notifications', true, '{}');
insert into public.departments (id, business_id, key, name, position)
values
  (pg_temp.dep(1), pg_temp.a(), 'kitchen', 'Kitchen', 0),
  (pg_temp.dep(2), pg_temp.a(), 'bar', 'Bar', 1),
  (pg_temp.dep(3), pg_temp.a(), 'floor', 'Floor', 2),
  (pg_temp.dep(11), pg_temp.b(), 'kitchen', 'Kitchen B', 0),
  (pg_temp.dep(21), pg_temp.d(), 'kitchen', 'Kitchen D', 0);
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.dep(3), pg_temp.a(), pg_temp.p(2)),
  (pg_temp.dep(1), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.dep(3), pg_temp.a(), pg_temp.p(4)),
  (pg_temp.dep(3), pg_temp.a(), pg_temp.p(5)),
  (pg_temp.dep(21), pg_temp.d(), pg_temp.p(9));
insert into public.menu_categories (id, business_id, name, department_id, position)
values
  (pg_temp.c(1), pg_temp.a(), 'Starters', pg_temp.dep(1), 0),
  (pg_temp.c(2), pg_temp.a(), 'Drinks', pg_temp.dep(2), 1),
  (pg_temp.c(21), pg_temp.d(), 'Starters', pg_temp.dep(21), 0);
insert into public.menu_items (
  id, business_id, category_id, name, price_agorot, available, option_groups, position
)
values
  (pg_temp.i(1), pg_temp.a(), pg_temp.c(1), 'Hummus', 3200, true, '[]', 0),
  (pg_temp.i(2), pg_temp.a(), pg_temp.c(2), 'Beer', 2800, true, '[]', 0),
  (pg_temp.i(21), pg_temp.d(), pg_temp.c(21), 'Hummus', 3200, true, '[]', 0);
insert into public.order_places (id, business_id, name, position)
select pg_temp.pl(n), pg_temp.a(), n::text, n::smallint
from generate_series(1, 16) as n;
insert into public.order_places (id, business_id, name, position)
values (pg_temp.pl(21), pg_temp.d(), '21', 0), (pg_temp.pl(22), pg_temp.d(), '22', 1);

-- On the clock from 18:00 in the business, still in.
insert into public.time_entries (business_id, user_id, clock_in, clock_out)
select pg_temp.a(), pg_temp.p(n), pg_temp.at(-7200), null::timestamptz
from unnest('{2,3,4}'::int[]) as n;

-- Phones: the owner, the manager, both waiters and the demo's owner.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select pg_temp.p(n), 'https://fcm.googleapis.com/fcm/send/order-notices-' || n::text,
  md5('order-notices-a-' || n::text) || md5('order-notices-b-' || n::text),
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from unnest('{1,2,4,5,8}'::int[]) as n;

------------------------------------------------------------------------------
-- Who may call what

select ok(
  (select bool_and(
     not has_function_privilege('authenticated', f, 'execute')
     and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'private.shift_groups()',
     'private.order_notice_rules()',
     'private.push_skips_quiet(uuid, uuid, text, timestamptz)',
     'private.push_held_in(uuid, uuid, text, timestamptz)',
     'private.order_notice_facts(uuid)',
     'private.notify_order_ready(uuid, uuid, timestamptz)',
     'private.settle_ticket_notices()',
     'private.settle_order_notices()',
     'private.run_order_notices(timestamptz, uuid)'
   ]) as f),
  'the order notices'' helpers are the database''s own'
);
select ok(
  not has_function_privilege('authenticated', 'public.read_order_ready(uuid, uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.read_order_ready(uuid, uuid, uuid[])', 'execute')
  and has_function_privilege('service_role', 'public.read_order_ready(uuid, uuid, uuid[])', 'execute'),
  'reading the ready lines a sync showed is the server''s alone'
);

------------------------------------------------------------------------------
-- The group and its rules

select is(
  (private.notification_groups())[array_length(private.notification_groups(), 1)],
  'orders',
  'orders is the last group on the settings screen'
);
select is(
  private.notification_group('order.ready') || '/' || private.notification_group('order.unseen'),
  'orders/orders',
  'both lines about orders are in it'
);
select is(private.shift_groups(), '{orders}'::text[], 'a shift lets orders through quiet hours');
select is(
  (select row(r.ready_delay, r.unseen_after, r.unseen_window, r.push_for, r.kept)::text
   from private.order_notice_rules() r),
  row(interval '10 seconds', interval '2 minutes', interval '10 minutes',
    interval '30 minutes', interval '2 days')::text,
  'their times: 10 seconds, 2 minutes, 10 minutes, half an hour, 2 days'
);

------------------------------------------------------------------------------
-- "מוכן"

-- Table 1: two hummus and a beer. Table 2: the manager's beer. Table 3 and
-- 4: a hummus each. D's table 21: a hummus.
select pg_temp.send(4, pg_temp.a(), 1, 1, jsonb_build_array(pg_temp.li(1, 2), pg_temp.li(2, 1)), pg_temp.at(0));
select pg_temp.send(2, pg_temp.a(), 2, 2, jsonb_build_array(pg_temp.li(2, 1)), pg_temp.at(0));
select pg_temp.send(4, pg_temp.a(), 3, 3, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0));
select pg_temp.send(4, pg_temp.a(), 4, 4, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(0));
select pg_temp.send(8, pg_temp.d(), 21, 21, jsonb_build_array(pg_temp.li(21, 1)), pg_temp.at(0));

select is(
  (select count(*)::integer from public.notifications n
   where n.business_id in (pg_temp.a(), pg_temp.d()) and n.kind like 'order.%'),
  0,
  'a send tells nobody, the kitchen included'
);

-- The cook marks table 1's hummus ready.
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(1, 0), true, pg_temp.at(60));
select is(pg_temp.who(pg_temp.ready(1, 0)), array[pg_temp.p(4)],
  'its round''s sender alone hears it is ready: not the cook who marked it, not the manager');
select is(
  (select n.kind || '/' || n.source_module || '/' || n.actor_id || '/' || n.audience_role
   from public.notifications n where n.dedupe_key = pg_temp.ready(1, 0)),
  'order.ready/order_taking/' || pg_temp.p(3) || '/worker',
  'a line of taking orders, by the cook, for the staff'
);
select is(
  (pg_temp.note(4, pg_temp.ready(1, 0))).params,
  jsonb_build_object(
    'order', pg_temp.order_of(1), 'ticket', pg_temp.ticket(1, 0),
    'place', pg_temp.pl(1), 'placeName', '1', 'takeaway', null,
    'department', pg_temp.dep(1), 'departmentName', 'Kitchen', 'count', 2
  ),
  'it says the place, the department and how many items, and no price'
);
select is(
  (select n.push_state || ' ' || n.push_after || ' ' || n.push_before
   from public.notifications n where n.dedupe_key = pg_temp.ready(1, 0)),
  'queued ' || pg_temp.at(70) || ' ' || pg_temp.at(60 + 1800),
  'its push waits 10 seconds, and goes no more half an hour on'
);

-- The manager marks his own beer ready.
select public.set_order_ticket_ready(pg_temp.p(2), pg_temp.ticket(2, 0), true, pg_temp.at(60));
select is(pg_temp.who(pg_temp.ready(2, 0)), '{}'::uuid[],
  'a sender who marks their own ticket ready hears nothing');

-- D's cook marks table 21 ready.
select public.set_order_ticket_ready(pg_temp.p(9), pg_temp.ticket(21, 0), true, pg_temp.at(60));
select is(
  (pg_temp.note(8, pg_temp.ready(21, 0))).push_state,
  'none',
  'in a demo the line stays in the app, though its owner has a phone'
);

-- The sync showed table 1's hummus to its sender.
select is(
  public.read_order_ready(pg_temp.p(5), pg_temp.a(), array[pg_temp.ticket(1, 0)]),
  0,
  'a ready line is read only by its own person'
);
select is(
  public.read_order_ready(pg_temp.p(4), pg_temp.a(), array[pg_temp.ticket(1, 0), pg_temp.ticket(3, 0)]),
  1,
  'shown to its sender, it is read'
);
select is(
  (select (n.read_at is not null) || '/' || n.push_state
   from public.notifications n where n.dedupe_key = pg_temp.ready(1, 0)),
  'true/skipped',
  'read, and its push will not go'
);
select is(pg_temp.claimed(pg_temp.ready(1, 0), pg_temp.at(71)), 0,
  'the send claims nothing for it');

-- Served: settled.
select public.serve_order_ticket(pg_temp.p(4), pg_temp.ticket(1, 0), true, pg_temp.at(120));
select ok((pg_temp.note(4, pg_temp.ready(1, 0))).resolved_at is not null,
  'served settles it');

-- Table 1's beer, ready, put back, ready again, and the table closed.
select public.set_order_ticket_ready(pg_temp.p(2), pg_temp.ticket(1, 1), true, pg_temp.at(130));
select public.set_order_ticket_ready(pg_temp.p(2), pg_temp.ticket(1, 1), false, pg_temp.at(140));
select is(
  (select (n.resolved_at is not null) || '/' || (n.read_at is not null) || '/' || n.push_state
   from public.notifications n where n.dedupe_key = pg_temp.ready(1, 1)),
  'true/true/skipped',
  'put back settles it, read, and its push goes no more'
);
select public.set_order_ticket_ready(pg_temp.p(2), pg_temp.ticket(1, 1), true, pg_temp.at(150));
select is(
  (select (n.resolved_at is null) || '/' || (n.read_at is null) || '/' || n.push_state || '/' || n.push_after
   from public.notifications n where n.dedupe_key = pg_temp.ready(1, 1)),
  'true/true/queued/' || pg_temp.at(160),
  'ready again tells again, its push 10 seconds on'
);
select public.close_order(pg_temp.p(4), pg_temp.order_of(1), pg_temp.at(200));
select ok((pg_temp.note(4, pg_temp.ready(1, 1))).resolved_at is not null,
  'closing the order serves it, and settles it');

-- Table 3, ready, and the order cancelled.
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(3, 0), true, pg_temp.at(210));
select public.cancel_order(pg_temp.p(2), pg_temp.order_of(3), 'mistake', pg_temp.at(220));
select is(
  (select (n.resolved_at is not null) || '/' || n.push_state
   from public.notifications n where n.dedupe_key = pg_temp.ready(3, 0)),
  'true/skipped',
  'cancelling the order settles it'
);

-- The kitchen's screen, which marks table 4 ready and back.
insert into public.clock_stations (business_id, name, token_hash, shows, department_id, created_at)
values (pg_temp.a(), 'Kitchen', pg_temp.h('kitchen'), 'prep', pg_temp.dep(1), pg_temp.at(0));
select public.station_set_ticket_ready(pg_temp.h('kitchen'), pg_temp.ticket(4, 0), true, pg_temp.at(230));
select is(
  (select n.user_id::text || '/' || coalesce(n.actor_id::text, 'nobody')
   from public.notifications n where n.dedupe_key = pg_temp.ready(4, 0)),
  pg_temp.p(4) || '/nobody',
  'a kitchen screen''s ready tells the sender, from nobody'
);
select public.station_set_ticket_ready(pg_temp.h('kitchen'), pg_temp.ticket(4, 0), false, pg_temp.at(240));
select ok((pg_temp.note(4, pg_temp.ready(4, 0))).resolved_at is not null,
  'and its put back settles it');

-- What the mode says, as the waiter reads it.
select pg_temp.sign_in(pg_temp.p(4));
select is(public.order_mode(pg_temp.a()) -> 'screens', jsonb_build_array(pg_temp.dep(1)),
  'the mode says a running prep screen shows the kitchen');
reset role;

------------------------------------------------------------------------------
-- Quiet hours during a shift (decision 8)

-- Both waiters keep quiet hours from 22:00 to 07:00.
insert into public.notification_preferences (user_id, quiet_from, quiet_to, time_zone)
values
  (pg_temp.p(4), '22:00', '07:00', 'Asia/Jerusalem'),
  (pg_temp.p(5), '22:00', '07:00', 'Asia/Jerusalem');

-- At 23:00 in the business, tables 5 (the waiter on the clock) and 6 (the
-- one off it) are ready.
select pg_temp.send(4, pg_temp.a(), 5, 5, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(10200));
select pg_temp.send(5, pg_temp.a(), 6, 6, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(10200));
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(5, 0), true, pg_temp.at(10800));
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(6, 0), true, pg_temp.at(10800));
select is((pg_temp.note(4, pg_temp.ready(5, 0))).push_after, pg_temp.at(10810),
  'on a shift, ready reaches the phone in quiet hours, 10 seconds on');
select is(
  (select n.push_after || ' ' || n.push_before
   from public.notifications n where n.dedupe_key = pg_temp.ready(6, 0)),
  '2026-12-02 05:00:10+00 ' || pg_temp.at(10800 + 1800),
  'off a shift it waits out quiet hours, after its half hour'
);

-- The group kept off the phone, on the clock.
update public.notification_preferences set push_off = '{orders}' where user_id = pg_temp.p(4);
select pg_temp.send(4, pg_temp.a(), 7, 7, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(10200));
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(7, 0), true, pg_temp.at(10801));
select is((pg_temp.note(4, pg_temp.ready(7, 0))).push_state, 'none',
  'the group''s switch still keeps it off the phone during a shift');
update public.notification_preferences set push_off = '{}' where user_id = pg_temp.p(4);

-- The time clock off: no shift to know of.
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'time_clock';
select pg_temp.send(4, pg_temp.a(), 8, 8, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(10200));
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(8, 0), true, pg_temp.at(10802));
select is((pg_temp.note(4, pg_temp.ready(8, 0))).push_after, '2026-12-02 05:00:10+00'::timestamptz,
  'without the time clock, quiet hours hold ready too');
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'time_clock';

select is(
  private.push_held_in(pg_temp.a(), pg_temp.p(4), 'order.ready', pg_temp.at(10800))
    || '/' || private.push_held_in(pg_temp.a(), pg_temp.p(5), 'order.ready', pg_temp.at(10800))
    || '/' || private.push_held_in(pg_temp.a(), pg_temp.p(4), 'schedule.changed', pg_temp.at(10800)),
  'false/true/true',
  'a send holds ready in quiet hours only off a shift, and every other line on one too'
);
select is(pg_temp.claimed(pg_temp.ready(5, 0), pg_temp.at(10811)), 1,
  'the send claims the push of the waiter on the clock in quiet hours');
select is(pg_temp.claimed(pg_temp.ready(6, 0), '2026-12-02 05:00:11+00'), 0,
  'and not, at the end of quiet hours, the one past its half hour');
select is((pg_temp.note(5, pg_temp.ready(6, 0))).push_state, 'skipped',
  'that one goes no more: it stays in the app');

------------------------------------------------------------------------------
-- For the staff alone, and for its own person

select is(
  private.notify(pg_temp.a(), array[pg_temp.p(6), pg_temp.p(4)], 'order.ready', '{}'::jsonb,
    null, 'order_taking'::public.module_key, 'worker'::public.member_role, 'eb-staff-only'),
  1,
  'a line about orders is never an accountant''s'
);
select is(pg_temp.who('eb-staff-only'), array[pg_temp.p(4)], 'only the staff''s');
delete from public.notifications where dedupe_key = 'eb-staff-only';

insert into line_keys values ('ready-6', pg_temp.ready(6, 0)), ('ready-5', pg_temp.ready(5, 0));
select pg_temp.sign_in(pg_temp.p(4));
select is(
  (select count(*)::integer from public.notifications n where n.dedupe_key = pg_temp.key('ready-5')),
  1,
  'the sender reads their line'
);
select pg_temp.sign_in(pg_temp.p(4));
select is(
  (select count(*)::integer from public.notifications n where n.dedupe_key = pg_temp.key('ready-6')),
  0,
  'and not another waiter''s'
);
select pg_temp.sign_in(pg_temp.p(7));
select is(
  (select count(*)::integer from public.notifications n where n.dedupe_key like 'order.%'),
  0,
  'another business reads none of them'
);
reset role;
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'order_taking';
select pg_temp.sign_in(pg_temp.p(4));
select is(
  (select count(*)::integer from public.notifications n where n.dedupe_key = pg_temp.key('ready-5')),
  0,
  'with taking orders off, the sender reads none'
);
reset role;
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'order_taking';

------------------------------------------------------------------------------
-- "המסך לא מחובר"

-- At 21:00, table 9: a hummus for the kitchen, which has its running screen,
-- and a beer for the bar, which has none.
select pg_temp.send(4, pg_temp.a(), 9, 9, jsonb_build_array(pg_temp.li(1, 1), pg_temp.li(2, 1)), pg_temp.at(3600));
select is(private.run_order_notices(pg_temp.at(3600 + 119), pg_temp.a()), 0,
  'before 2 minutes, nothing');
select is(private.run_order_notices(pg_temp.at(3600 + 121), pg_temp.a()), 2,
  'after 2 minutes, two lines');
select is(pg_temp.who(pg_temp.unseen(9, 0)), pg_temp.people(2, 4),
  'to the sender and to whoever runs orders on the clock: not the owner off it, the cook or the other waiter');
select is(
  (select n.push_state || ' ' || n.push_after || ' ' || n.push_before || ' ' || coalesce(n.actor_id::text, 'app')
   from public.notifications n where n.dedupe_key = pg_temp.unseen(9, 0) and n.user_id = pg_temp.p(4)),
  'queued ' || pg_temp.at(3721) || ' ' || pg_temp.at(3721 + 1800) || ' app',
  'from the app, its push at once'
);
select is(
  (pg_temp.note(4, pg_temp.unseen(9, 0))).params - 'order' - 'ticket' - 'place' - 'department',
  jsonb_build_object('placeName', '9', 'takeaway', null, 'departmentName', 'Kitchen', 'count', 1),
  'it says the place, the department and how many'
);
select is(
  (select string_agg(n.user_id::text || '/' || n.audience_role || '/' || coalesce(n.audience_perm, 'rank'),
     ',' order by n.user_id)
   from public.notifications n where n.dedupe_key = pg_temp.unseen(9, 0)),
  pg_temp.p(2) || '/manager/order_taking.edit,' || pg_temp.p(4) || '/worker/rank',
  'the line of whoever runs orders is for those who hold it, the sender''s by rank'
);

-- Running orders taken from the managers: the manager no longer reads his
-- line, and the sender still reads theirs.
insert into line_keys values ('unseen-9', pg_temp.unseen(9, 0));
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select count(*)::integer from public.notifications n where n.dedupe_key = pg_temp.key('unseen-9')),
  1,
  'whoever runs orders reads it'
);
reset role;
insert into public.role_permissions (business_id, role, perm, allowed)
values (pg_temp.a(), 'manager', 'order_taking.edit', false);
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select count(*)::integer from public.notifications n where n.dedupe_key = pg_temp.key('unseen-9')),
  0,
  'and no more once running orders is taken away'
);
select pg_temp.sign_in(pg_temp.p(4));
select is(
  (select count(*)::integer from public.notifications n where n.dedupe_key = pg_temp.key('unseen-9')),
  1,
  'while its sender still does'
);
reset role;
delete from public.role_permissions
where business_id = pg_temp.a() and role = 'manager' and perm = 'order_taking.edit';

select is(private.run_order_notices(pg_temp.at(3600 + 180), pg_temp.a()), 0,
  'a minute later, nothing new');
select is(
  (select count(*)::integer || ' ' || max(n.created_at) from public.notifications n
   where n.dedupe_key = pg_temp.unseen(9, 0)),
  '2 ' || pg_temp.at(3721),
  'once per ticket'
);
select is(pg_temp.who(pg_temp.unseen(9, 1)), '{}'::uuid[],
  'a department with no running prep screen never says so');

-- The screen fetches the kitchen's new tickets.
select public.station_order_prep(pg_temp.h('kitchen'), null, pg_temp.at(3600 + 200)) is not null;
select ok(
  (select bool_and(n.resolved_at is not null and n.read_at is not null)
   from public.notifications n where n.dedupe_key = pg_temp.unseen(9, 0)),
  'a screen fetching it settles it'
);

-- Table 10, fetched in time.
select pg_temp.send(4, pg_temp.a(), 10, 10, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(3600 + 210));
select public.station_order_prep(pg_temp.h('kitchen'), null, pg_temp.at(3600 + 240)) is not null;
select private.run_order_notices(pg_temp.at(3600 + 331), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(10, 0)), '{}'::uuid[],
  'a ticket a screen fetched never says so');

-- The kitchen's screen stopped.
update public.clock_stations set stopped_at = pg_temp.at(3600 + 290) where token_hash = pg_temp.h('kitchen');
select pg_temp.sign_in(pg_temp.p(4));
select is(public.order_mode(pg_temp.a()) -> 'screens', '[]'::jsonb,
  'with it stopped, the mode says no screen runs');
reset role;
select pg_temp.send(4, pg_temp.a(), 11, 11, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(3600 + 300));
select private.run_order_notices(pg_temp.at(3600 + 421), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(11, 0)), '{}'::uuid[],
  'a stopped screen is no screen');

-- A screen of every department.
insert into public.clock_stations (business_id, name, token_hash, shows, department_id, created_at)
values (pg_temp.a(), 'Everything', pg_temp.h('all'), 'prep', null, pg_temp.at(3600 + 430));
select pg_temp.sign_in(pg_temp.p(4));
select is(public.order_mode(pg_temp.a()) -> 'screens',
  jsonb_build_array(pg_temp.dep(1), pg_temp.dep(2), pg_temp.dep(3)),
  'a screen of every department shows each live one');
reset role;
select private.run_order_notices(pg_temp.at(3600 + 440), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(9, 1)), pg_temp.people(2, 4),
  'and counts for the bar');

-- Table 12, its hummus held, then called.
select pg_temp.send(4, pg_temp.a(), 12, 12, jsonb_build_array(pg_temp.li(1, 1, true)), pg_temp.at(3600 + 450));
select private.run_order_notices(pg_temp.at(3600 + 571), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(12, 0)), '{}'::uuid[],
  'a held block says nothing while it waits to be called');
select public.fire_order_tickets(pg_temp.p(4), pg_temp.order_of(12), pg_temp.at(3600 + 600));
select private.run_order_notices(pg_temp.at(3600 + 660), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(12, 0)), '{}'::uuid[],
  'nor within 2 minutes of its call');
select private.run_order_notices(pg_temp.at(3600 + 721), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(12, 0)), pg_temp.people(2, 4),
  'and says so 2 minutes after it');

-- Table 13, past the window: the minute job missed its runs.
select pg_temp.send(4, pg_temp.a(), 13, 13, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(3600 + 800));
select private.run_order_notices(pg_temp.at(3600 + 800 + 660), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(13, 0)), '{}'::uuid[],
  'never late: nothing more than 10 minutes on');

-- Table 11 (told by the screen of every department) turns ready.
select ok(cardinality(pg_temp.who(pg_temp.unseen(11, 0))) = 2, 'table 11 was told');
select public.set_order_ticket_ready(pg_temp.p(3), pg_temp.ticket(11, 0), true, pg_temp.at(3600 + 1500));
select ok(
  (select bool_and(n.resolved_at is not null) from public.notifications n
   where n.dedupe_key = pg_temp.unseen(11, 0)),
  'ready settles it'
);

-- Table 12's one line cancelled: the minute job settles what the ticket no
-- longer waits for.
select public.cancel_order_line(pg_temp.p(2), pg_temp.line_of(12), 'mistake', true, pg_temp.at(3600 + 1510));
select private.run_order_notices(pg_temp.at(3600 + 1520), pg_temp.a());
select ok(
  (select bool_and(n.resolved_at is not null and n.read_at is not null)
   from public.notifications n where n.dedupe_key = pg_temp.unseen(12, 0)),
  'a ticket with no line left is settled by the minute job'
);

-- D's running kitchen screen, and table 22.
insert into public.clock_stations (business_id, name, token_hash, shows, department_id, created_at)
values (pg_temp.d(), 'Kitchen D', pg_temp.h('kitchen-d'), 'prep', pg_temp.dep(21), pg_temp.at(0));
select pg_temp.send(8, pg_temp.d(), 22, 22, jsonb_build_array(pg_temp.li(21, 1)), pg_temp.at(3600));
select private.run_order_notices(pg_temp.at(3600 + 121), pg_temp.d());
select is(
  (select coalesce(string_agg(n.user_id::text || '/' || n.push_state, ','), 'none')
   from public.notifications n where n.dedupe_key = pg_temp.unseen(22, 0)),
  pg_temp.p(8) || '/none',
  'in a demo it is told in the app alone'
);

-- With notifications off, then taking orders off.
select pg_temp.send(4, pg_temp.a(), 14, 14, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(3600 + 1600));
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'notifications';
select private.run_order_notices(pg_temp.at(3600 + 1721), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(14, 0)), '{}'::uuid[], 'nothing with notifications off');
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'notifications';
select pg_temp.send(4, pg_temp.a(), 15, 15, jsonb_build_array(pg_temp.li(1, 1)), pg_temp.at(3600 + 1800));
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'order_taking';
select private.run_order_notices(pg_temp.at(3600 + 1921), pg_temp.a());
select is(pg_temp.who(pg_temp.unseen(15, 0)), '{}'::uuid[], 'nor with taking orders off');
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'order_taking';

------------------------------------------------------------------------------
-- Two days on, and the minute job

-- A line about the week, written with table 5's.
select private.notify(pg_temp.a(), array[pg_temp.p(4)], 'schedule.changed', '{}'::jsonb,
  actor => null, dedupe => 'eb-week', at_time => pg_temp.at(10800));
select private.clean_notifications(pg_temp.at(10800) + interval '2 days' + interval '1 hour');
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id in (pg_temp.a(), pg_temp.d()) and n.kind like 'order.%'),
  0,
  'the daily clean-up deletes the lines about orders after 2 days'
);
select is(pg_temp.who('eb-week'), array[pg_temp.p(4)], 'and keeps any other line of their age');

-- Table 16, sent 3 minutes ago, and the minute job.
select public.send_order_round(pg_temp.p(4), pg_temp.a(), pg_temp.k(16),
  jsonb_build_object('place', pg_temp.pl(16)), jsonb_build_array(pg_temp.li(1, 1)),
  now() - interval '3 minutes') is not null;
select private.notifications_tick();
select ok(pg_temp.p(4) = any (pg_temp.who(pg_temp.unseen(16, 0))),
  'the minute job tells of a screen that didn''t fetch it');

select * from finish();
rollback;
