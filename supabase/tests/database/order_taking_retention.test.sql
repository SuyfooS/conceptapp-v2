-- Taking orders: what is kept only for a while
-- (20261120000400_order_taking_orders_demo.sql; waiter mode P3). The hourly
-- job erases a line's note and a takeaway's label two days after the order
-- closed or was cancelled, and two days after the last round of an order
-- nobody closed; forgets who sent a round after 30 days; deletes a demo
-- business's orders two days after they opened; and never deletes an order
-- of a real business. Its job is on the hour's 23rd minute, off here
-- (supabase/seed.sql). Orders are written straight into the tables, at times
-- relative to the transaction's now(). Fixed ids (e5…) and numbers
-- (050-065-xxxx).
begin;
select plan(14);

-- R, a real business, its owner 1; D, a demo one, its owner 2.
insert into auth.users (id, aud, role, phone)
select ('e5000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250065' || lpad(n::text, 4, '0')
from generate_series(1, 2) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('e5000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.r_biz() returns uuid language sql as $$
  select 'e5000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.d_biz() returns uuid language sql as $$
  select 'e5000000-0000-4000-b000-000000000002'::uuid
$$;
-- Orders 1 to 7 are R's, 11 and 12 D's; each with a round, a ticket and a
-- line of the same number.
create function pg_temp.o(n integer) returns uuid language sql as $$
  select ('e5000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.r(n integer) returns uuid language sql as $$
  select ('e5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.t(n integer) returns uuid language sql as $$
  select ('e5000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.l(n integer) returns uuid language sql as $$
  select ('e5000000-0000-4000-e000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.pl(n integer) returns uuid language sql as $$
  select ('e5000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.dep(biz uuid) returns uuid language sql as $$
  select ('e5000000-0000-4000-c000-' || right(biz::text, 12))::uuid
$$;
create function pg_temp.item(biz uuid) returns uuid language sql as $$
  select ('e5000000-0000-4000-7000-' || right(biz::text, 12))::uuid
$$;
create function pg_temp.cat(biz uuid) returns uuid language sql as $$
  select ('e5000000-0000-4000-6000-' || right(biz::text, 12))::uuid
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.r_biz(), 'order-retention-r', 'Order retention R'),
  (pg_temp.d_biz(), 'order-retention-d', 'Order retention D');
insert into public.memberships (business_id, user_id, role)
values (pg_temp.r_biz(), pg_temp.p(1), 'owner'), (pg_temp.d_biz(), pg_temp.p(2), 'owner');
insert into private.demo_businesses (business_id, definition) values (pg_temp.d_biz(), '{}');
insert into public.business_modules (business_id, module_key, enabled)
values (pg_temp.r_biz(), 'order_taking', true), (pg_temp.d_biz(), 'order_taking', true);
insert into public.departments (id, business_id, key, name)
select pg_temp.dep(b), b, 'kitchen', 'Kitchen'
from unnest(array[pg_temp.r_biz(), pg_temp.d_biz()]) as b;
insert into public.menu_categories (id, business_id, name, department_id)
select pg_temp.cat(b), b, 'Mains', pg_temp.dep(b)
from unnest(array[pg_temp.r_biz(), pg_temp.d_biz()]) as b;
insert into public.menu_items (id, business_id, category_id, name, price_agorot)
select pg_temp.item(b), b, pg_temp.cat(b), 'Hummus', 3200
from unnest(array[pg_temp.r_biz(), pg_temp.d_biz()]) as b;
insert into public.order_places (id, business_id, name)
select pg_temp.pl(n), pg_temp.r_biz(), n::text from generate_series(2, 7) as n;
insert into public.order_places (id, business_id, name)
select pg_temp.pl(n), pg_temp.d_biz(), n::text from generate_series(11, 12) as n;

-- R: 1 a takeaway closed three days ago, labelled, its line noted with an
-- allergy; 2 closed a day ago; 3 open, its last round three days ago; 4
-- open, its round a day ago; 5 cancelled three days ago; 6 and 7 closed,
-- sent 31 and 29 days ago, with nothing noted. D: 11 opened three days ago,
-- 12 a day ago.
insert into public.orders (
  id, business_id, place_id, takeaway_no, takeaway_label, day, status, opened_by, opened_at,
  closed_by, closed_at, cancelled_by, cancelled_at, cancel_reason
)
values
  (pg_temp.o(1), pg_temp.r_biz(), null, 1, 'חולצה', current_date - 3, 'closed', pg_temp.p(1),
   now() - interval '3 days 1 hour', pg_temp.p(1), now() - interval '3 days', null, null, null),
  (pg_temp.o(2), pg_temp.r_biz(), pg_temp.pl(2), null, null, current_date - 1, 'closed', pg_temp.p(1),
   now() - interval '1 day 1 hour', pg_temp.p(1), now() - interval '1 day', null, null, null),
  (pg_temp.o(3), pg_temp.r_biz(), pg_temp.pl(3), null, null, current_date - 3, 'open', pg_temp.p(1),
   now() - interval '3 days', null, null, null, null, null),
  (pg_temp.o(4), pg_temp.r_biz(), pg_temp.pl(4), null, null, current_date - 1, 'open', pg_temp.p(1),
   now() - interval '1 day', null, null, null, null, null),
  (pg_temp.o(5), pg_temp.r_biz(), pg_temp.pl(5), null, null, current_date - 3, 'cancelled', pg_temp.p(1),
   now() - interval '3 days 1 hour', null, null, pg_temp.p(1), now() - interval '3 days', 'guest'),
  (pg_temp.o(6), pg_temp.r_biz(), pg_temp.pl(6), null, null, current_date - 31, 'closed', pg_temp.p(1),
   now() - interval '31 days', pg_temp.p(1), now() - interval '31 days' + interval '1 hour', null, null, null),
  (pg_temp.o(7), pg_temp.r_biz(), pg_temp.pl(7), null, null, current_date - 29, 'closed', pg_temp.p(1),
   now() - interval '29 days', pg_temp.p(1), now() - interval '29 days' + interval '1 hour', null, null, null),
  (pg_temp.o(11), pg_temp.d_biz(), pg_temp.pl(11), null, null, current_date - 3, 'closed', pg_temp.p(2),
   now() - interval '3 days', pg_temp.p(2), now() - interval '3 days' + interval '1 hour', null, null, null),
  (pg_temp.o(12), pg_temp.d_biz(), pg_temp.pl(12), null, null, current_date - 1, 'open', pg_temp.p(2),
   now() - interval '1 day', null, null, null, null, null);
insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
select pg_temp.r(n), o.business_id, o.id, repeat('0', 64), o.opened_by, o.opened_at
from unnest('{1,2,3,4,5,6,7,11,12}'::int[]) as n
join public.orders o on o.id = pg_temp.o(n);
insert into public.order_tickets (id, business_id, order_id, round_id, department_id, status)
select pg_temp.t(n), o.business_id, o.id, pg_temp.r(n), pg_temp.dep(o.business_id), 'new'
from unnest('{1,2,3,4,5,11,12}'::int[]) as n
join public.orders o on o.id = pg_temp.o(n);
insert into public.order_lines (id, business_id, ticket_id, item_id, name, unit_agorot, quantity, note, allergy)
select pg_temp.l(n), o.business_id, pg_temp.t(n), pg_temp.item(o.business_id), 'Hummus', 3200, 1,
  case when n = 1 then 'בוטנים' else 'בלי בצל' end, n = 1
from unnest('{1,2,3,4,5,11,12}'::int[]) as n
join public.orders o on o.id = pg_temp.o(n);
-- Takeaway numbers of five days ago, and of today.
insert into private.order_day_counters (business_id, day, last_no)
values
  (pg_temp.r_biz(), (now() at time zone 'UTC')::date - 5, 4),
  (pg_temp.r_biz(), (now() at time zone 'UTC')::date, 1);

select private.order_taking_tick(now());

------------------------------------------------------------------------------
-- Notes and labels

select is(
  (select (l.note is null)::text || ':' || (l.note_erased_at = now())::text || ':' || l.allergy::text
   from public.order_lines l where l.id = pg_temp.l(1))
  || ' | ' || (select coalesce(o.takeaway_label, '-') || ':' || (o.notes_erased_at = now())::text
     from public.orders o where o.id = pg_temp.o(1)),
  'true:true:true | -:true',
  'two days after an order closed, its notes and its label are erased, the allergy still marked'
);
select is(
  (select l.note from public.order_lines l where l.id = pg_temp.l(2))
  || ':' || (select (o.notes_erased_at is null)::text from public.orders o where o.id = pg_temp.o(2)),
  'בלי בצל:true',
  'one closed a day ago keeps them'
);
select is(
  (select (l.note is null)::text from public.order_lines l where l.id = pg_temp.l(3)),
  'true',
  'an order nobody closed loses them two days after its last round'
);
select is(
  (select l.note from public.order_lines l where l.id = pg_temp.l(4)),
  'בלי בצל',
  'and keeps them a day after'
);
select is(
  (select (l.note is null)::text from public.order_lines l where l.id = pg_temp.l(5)),
  'true',
  'an order cancelled three days ago loses them too'
);

------------------------------------------------------------------------------
-- Senders, and what is never deleted

select is(
  (select coalesce(r.sent_by::text, '-') from public.order_rounds r where r.id = pg_temp.r(6))
  || ' ' || (select (r.sent_by = pg_temp.p(1))::text from public.order_rounds r where r.id = pg_temp.r(7)),
  '- true',
  'who sent a round is forgotten after 30 days, and kept at 29'
);
select is(
  (select count(*)::integer from public.orders o where o.business_id = pg_temp.r_biz()),
  7,
  'a real business keeps every order'
);

------------------------------------------------------------------------------
-- A demo business

select is(
  (select count(*)::integer from public.orders o where o.id = pg_temp.o(11))
  + (select count(*)::integer from public.order_rounds r where r.id = pg_temp.r(11))
  + (select count(*)::integer from public.order_tickets t where t.id = pg_temp.t(11))
  + (select count(*)::integer from public.order_lines l where l.id = pg_temp.l(11)),
  0,
  'a demo business''s order goes two days after it opened, with its rounds, tickets and lines'
);
select is(
  (select l.note from public.order_lines l where l.id = pg_temp.l(12)),
  'בלי בצל',
  'and one of a day ago stays as it is'
);

------------------------------------------------------------------------------
-- Counters and versions

select is(
  (select string_agg(c.last_no::text, ',' order by c.day) from private.order_day_counters c
   where c.business_id = pg_temp.r_biz()),
  '1',
  'takeaway numbers of days gone are let go'
);
select ok(
  (select count(*) from private.order_versions v
   where v.business_id in (pg_temp.r_biz(), pg_temp.d_biz()) and v.version > 0) = 2,
  'and each business it changed has its orders version moved'
);

------------------------------------------------------------------------------
-- The job

select is(
  (select j.schedule from cron.job j where j.jobname = 'order-taking'),
  '23 * * * *',
  'the job runs every hour'
);
select is(
  (select j.active from cron.job j where j.jobname = 'order-taking'),
  false,
  'and stays off here (supabase/seed.sql)'
);
select ok(
  not has_function_privilege('authenticated', 'private.order_taking_tick(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'private.order_taking_tick(timestamptz)', 'execute'),
  'and nobody signed in runs it'
);

select * from finish();
rollback;
