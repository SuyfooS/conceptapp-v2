-- A reading back inside its range settles the line about it
-- (20261117000100_lists_range_settles.sql): once a reading outside its range
-- has told those who run the lists (lists.out_of_range, 'list.range:<item>'),
-- a new reading inside the range, filled or fixed, settles that line for
-- everyone it reached: read (an earlier read kept), settled, and its push
-- skipped while still queued, marked backInRange for the inbox's words. A
-- reading emptied leaves the line; one outside again opens it again, unread,
-- queued for the phone and without the mark, and takes the mark off the line
-- of whoever read it outside too (they aren't told). Both edges of a range
-- are inside it. Only that item's line moves, and nothing new is logged.
-- Fixed ids (b4…), numbers (050-055-xxxx) and times (11 January 2027), so
-- nothing here meets the seed or another test, or the real clock.
begin;
select plan(16);

-- A: 1 owner, 2 manager, 3 and 4 workers in the kitchen. 1 and 2 have a
-- phone for pushes.
insert into auth.users (id, aud, role, phone)
select ('b4000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250055' || lpad(n::text, 4, '0')
from generate_series(1, 4) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('b4000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'b4000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.kitchen() returns uuid language sql as $$
  select 'b4000000-0000-4000-c000-000000000001'::uuid
$$;

insert into public.businesses (id, slug, name)
values (pg_temp.a(), 'lists-range-settles-a', 'Lists range settles A');
insert into public.memberships (business_id, user_id, role, perms, active)
select pg_temp.a(), pg_temp.p(n),
  (case n when 1 then 'owner' when 2 then 'manager' else 'worker' end)::public.member_role,
  '{}'::text[], true
from generate_series(1, 4) as n;
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'lists', true, '{}'),
  (pg_temp.a(), 'notifications', true, '{}');
insert into public.departments (id, business_id, key, name)
values (pg_temp.kitchen(), pg_temp.a(), 'kitchen', 'Kitchen');
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(4));
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select pg_temp.p(n), 'https://fcm.googleapis.com/range-settles-' || n, repeat('e', 63) || n::text,
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from generate_series(1, 2) as n;

create temporary table ids (name text primary key, id uuid) on commit drop;

create function pg_temp.id(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
-- A saved list's item, by its label.
create function pg_temp.item_of(list_name text, item_label text) returns uuid language sql as $$
  select i.id from public.list_items i
  where i.list_id = pg_temp.id(list_name) and i.label = item_label
$$;
-- A time as the tests write it (UTC).
create function pg_temp.hm(at_time timestamptz) returns text language sql as $$
  select to_char(at_time at time zone 'UTC', 'HH24:MI')
$$;
-- Person `n`'s line about the morning list's item: open, or settled and
-- when; read or not; its push; and 'back' when it is marked backInRange. Or
-- 'none'.
create function pg_temp.line(n integer, item_label text) returns text language sql as $$
  select coalesce((
    select case when l.resolved_at is null then 'open' else 'settled ' || pg_temp.hm(l.resolved_at) end
      || ' ' || case when l.read_at is null then 'unread' else 'read ' || pg_temp.hm(l.read_at) end
      || ' ' || l.push_state
      || case when l.params -> 'backInRange' = 'true'::jsonb then ' back' else '' end
    from public.notifications l
    where l.business_id = pg_temp.a() and l.user_id = pg_temp.p(n)
      and l.dedupe_key = 'list.range:' || pg_temp.item_of('morning', item_label)::text
  ), 'none')
$$;
-- The lines of the owner (1) and the manager (2) about an item.
create function pg_temp.lines(item_label text) returns text language sql as $$
  select '1: ' || pg_temp.line(1, item_label) || ' | 2: ' || pg_temp.line(2, item_label)
$$;
-- The morning list's log, oldest first.
create function pg_temp.logged() returns text language sql as $$
  select coalesce(string_agg(a.action, ',' order by a.id), 'none')
  from public.audit_log a
  where a.details ->> 'list' = pg_temp.id('morning')::text
$$;
-- Worker 3 reads an item of the morning list (null empties it) at `at_time`.
create function pg_temp.reads(item_label text, reading numeric, at_time timestamptz) returns void
language sql as $$
  select public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', item_label),
    jsonb_strip_nulls(jsonb_build_object('reading', reading)), at_time);
$$;

-- The manager sends the kitchen its morning list at 06:00: a fridge from 0
-- to 5, a freezer up to -15 (optional), and a count with no range
-- (optional).
insert into ids values ('morning', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Morning',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "number", "label": "Fridge", "unit": "C", "min": 0, "max": 5},
      {"kind": "number", "label": "Freezer", "unit": "C", "max": -15, "required": false},
      {"kind": "number", "label": "Count", "required": false}]'::jsonb),
  '2027-01-11 06:00+00'));

------------------------------------------------------------------------------
-- Filling an open list

select pg_temp.reads('Fridge', 9, '2027-01-11 06:10+00');
select is(
  pg_temp.lines('Fridge'),
  '1: open unread queued | 2: open unread queued',
  'a reading outside its range tells those who run the lists, on the phone too'
);

select pg_temp.reads('Fridge', 4, '2027-01-11 06:12+00');
select is(
  pg_temp.lines('Fridge'),
  '1: settled 06:12 read 06:12 skipped back | 2: settled 06:12 read 06:12 skipped back',
  'read again inside its range, the line is settled for everyone it reached, read, and off the phone'
);

select pg_temp.reads('Fridge', 8, '2027-01-11 06:14+00');
select is(
  pg_temp.lines('Fridge'),
  '1: open unread queued | 2: open unread queued',
  'outside again, it is open again, unread and on the phone'
);

update public.notifications n set read_at = '2027-01-11 06:15+00'
where n.user_id = pg_temp.p(2)
  and n.dedupe_key = 'list.range:' || pg_temp.item_of('morning', 'Fridge')::text;
select pg_temp.reads('Fridge', null, '2027-01-11 06:16+00');
select is(
  pg_temp.lines('Fridge'),
  '1: open unread queued | 2: open read 06:15 queued',
  'a reading emptied leaves the line as it is'
);

select pg_temp.reads('Fridge', 3, '2027-01-11 06:18+00');
select is(
  pg_temp.lines('Fridge'),
  '1: settled 06:18 read 06:18 skipped back | 2: settled 06:18 read 06:15 skipped back',
  'a reading inside its range after an empty one settles it, keeping when it was read'
);

select pg_temp.reads('Freezer', -10, '2027-01-11 06:20+00');
select pg_temp.reads('Freezer', -12, '2027-01-11 06:21+00');
select is(
  pg_temp.lines('Freezer') || ' || ' || pg_temp.lines('Fridge'),
  '1: open unread queued | 2: open unread queued'
    || ' || 1: settled 06:18 read 06:18 skipped back | 2: settled 06:18 read 06:15 skipped back',
  'a range with a top alone: still above it is still open, and another item''s line doesn''t move'
);

select pg_temp.reads('Freezer', -15, '2027-01-11 06:22+00');
select is(
  pg_temp.lines('Freezer'),
  '1: settled 06:22 read 06:22 skipped back | 2: settled 06:22 read 06:22 skipped back',
  'its edge is inside the range'
);

select pg_temp.reads('Fridge', -3, '2027-01-11 06:24+00');
select is(
  pg_temp.lines('Fridge'),
  '1: open unread queued | 2: open unread queued',
  'below its bottom, it is open again, without the mark'
);

select pg_temp.reads('Fridge', -1, '2027-01-11 06:25+00');
select is(
  pg_temp.lines('Fridge'),
  '1: open unread queued | 2: open unread queued',
  'still below it, it stays open'
);

select pg_temp.reads('Fridge', 0, '2027-01-11 06:26+00');
select is(
  pg_temp.lines('Fridge'),
  '1: settled 06:26 read 06:26 skipped back | 2: settled 06:26 read 06:26 skipped back',
  'and its bottom edge is inside the range'
);

select pg_temp.reads('Count', 500, '2027-01-11 06:23+00');
select is(
  pg_temp.lines('Count'),
  '1: none | 2: none',
  'an item with no range tells nobody'
);

select is(
  pg_temp.logged(),
  'lists.send,lists.out_of_range,lists.out_of_range,lists.out_of_range,lists.out_of_range',
  'settling writes nothing to the log: each time outside is one lists.out_of_range, as before'
);

------------------------------------------------------------------------------
-- Fixing a closed list

select public.finish_list(pg_temp.p(3), pg_temp.id('morning'), '2027-01-11 06:30+00');
select is(
  pg_temp.lines('Fridge'),
  '1: settled 06:26 read 06:26 skipped back | 2: settled 06:26 read 06:26 skipped back',
  'finishing the list moves no line about a reading'
);

select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 7}', '2027-01-11 07:00+00');
select is(
  pg_temp.lines('Fridge'),
  '1: open unread queued | 2: settled 06:26 read 06:26 skipped',
  'a fix outside its range opens the owner''s line again; the fixer is not told, and their own line no longer says the reading is back'
);

select public.fix_list_item(pg_temp.p(1), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 2}', '2027-01-11 07:05+00');
select is(
  pg_temp.lines('Fridge'),
  '1: settled 07:05 read 07:05 skipped back | 2: settled 06:26 read 06:26 skipped',
  'a fix back inside it settles the line, the fixer''s own too, and leaves a settled one as it was'
);

select is(
  pg_temp.logged(),
  'lists.send,lists.out_of_range,lists.out_of_range,lists.out_of_range,lists.out_of_range,lists.finish,'
    || 'lists.fix,lists.out_of_range,lists.fix',
  'the fixes log as they did: what each changed, and the reading outside once'
);

select * from finish();
rollback;
