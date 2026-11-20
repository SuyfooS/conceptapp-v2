-- Taking orders: what is kept only for a while
-- (20261120000400_order_taking_orders_demo.sql; waiter mode P3). The hourly
-- job erases a line's note and a takeaway's label two days after the order
-- closed or was cancelled, and two days after the last round of an order
-- nobody closed, and then makes its rounds' body hashes from their ids
-- alone, marking the order so no later hour reads it, until a round or a
-- label is added to it while open; leaves a round sent within those two
-- days, and its order unmarked, until the round's own two days pass;
-- forgets who sent a round, and who did anything else to an order, its
-- tickets and its lines, 30 days after; deletes a demo business's orders
-- two days after they opened; and never deletes an order of a real
-- business. Its job is on the hour's 23rd minute, off here
-- (supabase/seed.sql). Orders are written straight into the tables, at
-- times relative to the transaction's now(), and the job runs at now(), an
-- hour on and three days on; then a table's rounds are sent four days on,
-- one after its order's close by the moments, and the job runs half a
-- minute before that round's two days pass and an hour after. Fixed ids
-- (e5…) and numbers (050-065-xxxx).
begin;
select plan(25);

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
-- Orders 1 to 9 are R's, 11 and 12 D's; each with a round of the same
-- number, and most with a ticket and a line too (6 and 7 with lines 16, 17,
-- 26 and 27 as well). Round 13 is sent to order 3 later, and rounds 14 and
-- 15 to table 8 at the end.
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
-- sent 31 and 29 days ago, with nothing noted; 8 a takeaway cancelled 31
-- days ago, whose label was cleared before the job came; 9 a takeaway left
-- open, its round three days ago, with no label and no line. D: 11 opened
-- three days ago, 12 a day ago.
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
  (pg_temp.o(8), pg_temp.r_biz(), null, 1, null, current_date - 31, 'cancelled', pg_temp.p(1),
   now() - interval '31 days 1 hour', null, null, pg_temp.p(1), now() - interval '31 days', 'guest'),
  (pg_temp.o(9), pg_temp.r_biz(), null, 2, null, current_date - 3, 'open', pg_temp.p(1),
   now() - interval '3 days', null, null, null, null, null),
  (pg_temp.o(11), pg_temp.d_biz(), pg_temp.pl(11), null, null, current_date - 3, 'closed', pg_temp.p(2),
   now() - interval '3 days', pg_temp.p(2), now() - interval '3 days' + interval '1 hour', null, null, null),
  (pg_temp.o(12), pg_temp.d_biz(), pg_temp.pl(12), null, null, current_date - 1, 'open', pg_temp.p(2),
   now() - interval '1 day', null, null, null, null, null);
-- 6 and 7 were moved from table 5 and opened again half an hour after they
-- opened.
update public.orders o
set moved_from = pg_temp.pl(5), moved_by = pg_temp.p(1), moved_at = o.opened_at + interval '30 minutes',
  reopened_by = pg_temp.p(1), reopened_at = o.opened_at + interval '30 minutes'
where o.id in (pg_temp.o(6), pg_temp.o(7));
-- Each round's body hash stands for the body's, with its notes and label.
insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
select pg_temp.r(n), o.business_id, o.id, repeat('0', 64), o.opened_by, o.opened_at
from unnest('{1,2,3,4,5,6,7,8,9,11,12}'::int[]) as n
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
-- 6's and 7's tickets: a held block called, made ready and served; and their
-- lines, one taken back, one cancelled, one on the house, all by 1 within
-- the order's first half hour.
insert into public.order_tickets (
  id, business_id, order_id, round_id, department_id, held, status, fired_at, fired_by,
  ready_at, ready_by, prepared_at, served_at, served_by
)
select pg_temp.t(n), o.business_id, o.id, pg_temp.r(n), pg_temp.dep(o.business_id), true, 'served',
  o.opened_at + interval '10 minutes', o.opened_by, o.opened_at + interval '20 minutes', o.opened_by,
  o.opened_at + interval '20 minutes', o.opened_at + interval '30 minutes', o.opened_by
from unnest('{6,7}'::int[]) as n
join public.orders o on o.id = pg_temp.o(n);
insert into public.order_lines (
  id, business_id, ticket_id, item_id, name, unit_agorot, quantity, position,
  taken_back_at, taken_back_by, cancelled_at, cancelled_by, cancel_reason,
  comped_at, comped_by, comp_reason
)
select pg_temp.l(n + 10 * k), o.business_id, pg_temp.t(n), pg_temp.item(o.business_id), 'Hummus', 3200,
  1, k,
  case when k = 0 then o.opened_at + interval '5 minutes' end,
  case when k = 0 then o.opened_by end,
  case when k = 1 then o.opened_at + interval '5 minutes' end,
  case when k = 1 then o.opened_by end,
  case when k = 1 then 'guest' end,
  case when k = 2 then o.opened_at + interval '5 minutes' end,
  case when k = 2 then o.opened_by end,
  case when k = 2 then 'staff' end
from unnest('{6,7}'::int[]) as n
cross join generate_series(0, 2) as k
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
select is(
  (select string_agg(
     case r.body_hash
       when encode(sha256(convert_to(r.id::text, 'UTF8')), 'hex') then 'id'
       when repeat('0', 64) then 'body'
       else r.body_hash
     end,
     ',' order by r.id)
   from public.order_rounds r
   where r.id in (pg_temp.r(1), pg_temp.r(2), pg_temp.r(3), pg_temp.r(5), pg_temp.r(8))),
  'id,body,id,id,id',
  'and their rounds'' body hashes are made from the round alone, so no erased note or name is confirmed from one; a takeaway''s whose label was cleared before too'
);
select is(
  (select string_agg(n::text || ':' || coalesce((o.notes_erased_at = now())::text, '-'), ' ' order by n)
   from unnest('{2,4,6,7,8,9}'::int[]) as n
   join public.orders o on o.id = pg_temp.o(n)),
  '2:- 4:- 6:true 7:true 8:true 9:true',
  'each order is marked once its two days pass, even with nothing to erase, and one within them is not'
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
  (select num_nonnulls(o.opened_by, o.closed_by, o.reopened_by, o.moved_by, o.cancelled_by)::text
   from public.orders o where o.id = pg_temp.o(6))
  || ' ' || (select num_nonnulls(o.opened_by, o.cancelled_by)::text
     from public.orders o where o.id = pg_temp.o(8))
  || ' ' || (select num_nonnulls(o.opened_by, o.closed_by, o.reopened_by, o.moved_by)::text
     from public.orders o where o.id = pg_temp.o(7)),
  '0 0 4',
  'and who opened, moved, opened again, closed or cancelled an order, after 30 days too, and kept at 29'
);
select is(
  (select num_nonnulls(t.fired_by, t.ready_by, t.served_by)::text
   from public.order_tickets t where t.id = pg_temp.t(6))
  || ' ' || (select sum(num_nonnulls(l.taken_back_by, l.cancelled_by, l.comped_by))::text
     from public.order_lines l where l.ticket_id = pg_temp.t(6))
  || ' | ' || (select num_nonnulls(t.fired_by, t.ready_by, t.served_by)::text
     from public.order_tickets t where t.id = pg_temp.t(7))
  || ' ' || (select sum(num_nonnulls(l.taken_back_by, l.cancelled_by, l.comped_by))::text
     from public.order_lines l where l.ticket_id = pg_temp.t(7)),
  '0 0 | 3 3',
  'and who called, made ready or served a ticket, and took back, cancelled or gave a line on the house'
);
select is(
  (select count(*)::integer from public.orders o where o.business_id = pg_temp.r_biz()),
  9,
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
-- A later round and a later label, and the hours after

-- 1 sends a second round to table 3, whose first lost its note above, and
-- names takeaway 9, marked above with nothing on it.
create function pg_temp.second_round(at_time timestamptz) returns jsonb language sql as $$
  select public.send_order_round(
    pg_temp.p(1), pg_temp.r_biz(), pg_temp.r(13), jsonb_build_object('order', pg_temp.o(3)),
    jsonb_build_array(jsonb_build_object(
      'item', pg_temp.item(pg_temp.r_biz()), 'quantity', 1, 'note', 'בלי מלח'
    )),
    at_time
  )
$$;
select pg_temp.second_round(now());
select public.set_order_label(pg_temp.p(1), pg_temp.o(9), 'כובע', now());
select is(
  (select string_agg(coalesce(o.notes_erased_at::text, '-'), ' ' order by o.id)
   from public.orders o where o.id in (pg_temp.o(3), pg_temp.o(9))),
  '- -',
  'a round or a label added to an open order the job marked takes the mark away'
);

select private.order_taking_tick(now() + interval '1 hour');
select is(
  (select l.note
   from public.order_lines l
   join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
   where t.round_id = pg_temp.r(13))
  || ':' || (select (r.body_hash <> encode(sha256(convert_to(r.id::text, 'UTF8')), 'hex'))::text
     from public.order_rounds r where r.id = pg_temp.r(13))
  || ':' || (pg_temp.second_round(now() + interval '1 hour')
     = private.order_round_answer(pg_temp.r(13)))::text,
  'בלי מלח:true:true',
  'an hour on, the later round keeps its note and its hash, its order''s last round not two days old, and its retry still gets its answer'
);
select is(
  (select string_agg((o.notes_erased_at = now())::text, ' ' order by o.id)
   from public.orders o where o.id in (pg_temp.o(1), pg_temp.o(5), pg_temp.o(6))),
  'true true true',
  'an order marked is read no more: its mark keeps the hour it was made'
);
select is(
  (select coalesce(o.takeaway_label, '-') || ':' || (o.notes_erased_at = now() + interval '1 hour')::text
   from public.orders o where o.id = pg_temp.o(9)),
  '-:true',
  'and the label named on a takeaway whose last round is two days old goes that hour'
);

select private.order_taking_tick(now() + interval '3 days');
select is(
  (select (l.note is null)::text
   from public.order_lines l
   join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
   where t.round_id = pg_temp.r(13))
  || ':' || (select (r.body_hash = encode(sha256(convert_to(r.id::text, 'UTF8')), 'hex'))::text
     from public.order_rounds r where r.id = pg_temp.r(13))
  || ':' || (select (o.notes_erased_at = now() + interval '3 days')::text
     from public.orders o where o.id = pg_temp.o(3)),
  'true:true:true',
  'two days after the later round, its note and its hash go in turn, and its order is marked again'
);

------------------------------------------------------------------------------
-- A round sent after its order's close, by the moments

-- Four days on, 1 opens table 8 with a round, and ten minutes later sends
-- it another. A close that began a minute before that send, and waited on
-- its lock, closes the order at its own moment, so the order closed before
-- its last round was sent. Every moment is passed to the functions.
insert into public.order_places (id, business_id, name)
values (pg_temp.pl(8), pg_temp.r_biz(), '8');
select public.send_order_round(
  pg_temp.p(1), pg_temp.r_biz(), pg_temp.r(14), jsonb_build_object('place', pg_temp.pl(8)),
  jsonb_build_array(jsonb_build_object(
    'item', pg_temp.item(pg_temp.r_biz()), 'quantity', 1, 'note', 'בלי בצל'
  )),
  now() + interval '4 days' - interval '10 minutes'
);
select public.send_order_round(
  pg_temp.p(1), pg_temp.r_biz(), pg_temp.r(15),
  jsonb_build_object(
    'order', (select r.order_id from public.order_rounds r where r.id = pg_temp.r(14)),
    'place', pg_temp.pl(8)
  ),
  jsonb_build_array(jsonb_build_object(
    'item', pg_temp.item(pg_temp.r_biz()), 'quantity', 1, 'note', 'בלי חריף'
  )),
  now() + interval '4 days'
);
select public.close_order(
  pg_temp.p(1), (select r.order_id from public.order_rounds r where r.id = pg_temp.r(14)),
  now() + interval '4 days' - interval '1 minute'
);
-- A round as the job leaves it: its line's note ('-' once erased), whether
-- its hash is made from its id alone, and whether its order is marked at
-- `moment` ('-' for no mark).
create function pg_temp.kept(round_no integer, moment timestamptz) returns text language sql as $$
  select coalesce(l.note, '-')
    || ':' || (r.body_hash = encode(sha256(convert_to(r.id::text, 'UTF8')), 'hex'))::text
    || ':' || coalesce((o.notes_erased_at = moment)::text, '-')
  from public.order_rounds r
  join public.orders o on o.id = r.order_id and o.business_id = r.business_id
  join public.order_tickets t on t.round_id = r.id and t.business_id = r.business_id
  join public.order_lines l on l.ticket_id = t.id and l.business_id = t.business_id
  where r.id = pg_temp.r(round_no)
$$;

-- Half a minute before the last round's two days pass: the order's have.
select private.order_taking_tick(now() + interval '6 days' - interval '30 seconds');
select is(
  (select (o.closed_at < r.sent_at)::text
   from public.order_rounds r
   join public.orders o on o.id = r.order_id and o.business_id = r.business_id
   where r.id = pg_temp.r(15))
  || ' ' || pg_temp.kept(14, now() + interval '6 days' - interval '30 seconds')
  || ' ' || pg_temp.kept(15, now() + interval '6 days' - interval '30 seconds'),
  'true -:true:- בלי חריף:false:-',
  'an order closed before its last round was sent loses its first round''s note and hash, keeps the last one''s within that round''s two days, and is left unmarked'
);
select private.order_taking_tick(now() + interval '6 days' - interval '30 seconds' + interval '1 hour');
select is(
  pg_temp.kept(15, now() + interval '6 days' - interval '30 seconds' + interval '1 hour'),
  '-:true:true',
  'an hour later the last round''s note and its hash go, and the order is marked'
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
