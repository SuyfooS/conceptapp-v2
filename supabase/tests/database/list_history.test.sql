-- Each list item's history (20261116000200_list_history.sql): every real
-- change through public.set_list_item and set_list_item_photo is a row, by
-- whom and when, naming what changed, with the item after it; saving the same
-- result writes nothing, and a comment alone keeps who did the item and when;
-- on an order, a tick names the count it gives, and a count alone is a
-- change of its own; the clean-up forgetting a photo writes none. Every reopen keeps the close
-- it undid (public.list_reopens), the 5-minute undo too. Whoever reads the
-- list reads both (those it is for, its sender, those who run the lists, a
-- view session), nobody else; nobody writes them directly, the server and
-- the database's owner included, but a person going with their account; and
-- they go with their list, its business and a demo reset. The backfill gives
-- each item already done one row. Fixed ids (b1…), numbers (050-052-xxxx)
-- and times (3 December 2026), so nothing here meets the seed or another
-- test, or the real clock.
begin;
select plan(54);

-- A: 1 owner, 2 manager, 3 and 4 workers in the kitchen, 5 a worker given
-- lists.send (who sends lists but runs none and is in no department), 6 a
-- worker in no department, 7 a worker given lists.manage. 8 is on the
-- ConceptApp team, viewing A as a manager. B: 9, its owner. D, a demo
-- business: d1 owner, d2 manager, d3 worker.
insert into auth.users (id, aud, role, phone)
select ('b1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250052' || lpad(n::text, 4, '0')
from generate_series(1, 9) as n;
insert into auth.users (id, aud, role, phone)
select ('b1000000-0000-4000-a000-0000000000d' || n)::uuid,
  'authenticated', 'authenticated', '9725005200' || (20 + n)::text
from generate_series(1, 3) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('b1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'b1000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'b1000000-0000-4000-b000-000000000002'::uuid
$$;
create function pg_temp.d() returns uuid language sql as $$
  select 'b1000000-0000-4000-b000-000000000003'::uuid
$$;
create function pg_temp.kitchen() returns uuid language sql as $$
  select 'b1000000-0000-4000-c000-000000000001'::uuid
$$;
create function pg_temp.bar() returns uuid language sql as $$
  select 'b1000000-0000-4000-c000-000000000002'::uuid
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'list-history-a', 'List history A'),
  (pg_temp.b(), 'list-history-b', 'List history B');

insert into public.memberships (business_id, user_id, role, perms, active)
select pg_temp.a(), pg_temp.p(n),
  (case n when 1 then 'owner' when 2 then 'manager' else 'worker' end)::public.member_role,
  case n
    when 5 then '{lists.send}'::text[]
    when 7 then '{lists.manage}'::text[]
    else '{}'::text[]
  end,
  true
from generate_series(1, 7) as n;
insert into public.memberships (business_id, user_id, role, perms, active)
values (pg_temp.b(), pg_temp.p(9), 'owner', '{}', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'lists', true, '{}'),
  (pg_temp.b(), 'lists', true, '{}');

insert into public.platform_staff (user_id, role) values (pg_temp.p(8), 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values (pg_temp.p(8), pg_temp.a(), 'manager');

-- The bar, with nobody in it, asks the kitchen for what it needs (an order).
insert into public.departments (id, business_id, key, name)
values
  (pg_temp.kitchen(), pg_temp.a(), 'kitchen', 'Kitchen'),
  (pg_temp.bar(), pg_temp.a(), 'bar', 'Bar');
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(4));

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant select on ids to authenticated, service_role;
create temporary table first_changes (id bigint primary key) on commit drop;

create function pg_temp.id(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
-- A saved list's item, by its label.
create function pg_temp.item_of(list_name text, item_label text) returns uuid language sql as $$
  select i.id from public.list_items i
  where i.list_id = pg_temp.id(list_name) and i.label = item_label
$$;
-- A file in a saved list's folder, `<business>/<list>/<file>`.
create function pg_temp.folder(list_name text, file text) returns text language sql as $$
  select l.business_id::text || '/' || l.id::text || '/' || file
  from public.lists l where l.id = pg_temp.id(list_name)
$$;
-- An item's history, oldest first: who (their number, '-' for nobody), when
-- (UTC), what changed, and the item after it.
create function pg_temp.history(list_name text, item_label text) returns text language sql as $$
  select coalesce(string_agg(
    coalesce(right(c.changed_by::text, 1), '-') || '@'
      || to_char(c.changed_at at time zone 'UTC', 'HH24:MI') || ' '
      || array_to_string(c.changed, '+') || ' ('
      || concat_ws(' ',
        'checked=' || c.checked, 'given=' || c.given, 'reading=' || c.reading,
        'answer=' || c.answer, 'comment=' || c.comment,
        case when c.photo then 'photo' end,
        case when c.done then 'done' else 'open' end)
      || ')',
    ', ' order by c.changed_at, c.id), 'none')
  from public.list_item_changes c
  where c.item_id = pg_temp.item_of(list_name, item_label)
$$;
-- How many changes and reopens of a saved list the caller reads.
create function pg_temp.seen(list_name text) returns text language sql as $$
  select (select count(*) from public.list_item_changes c where c.list_id = pg_temp.id(list_name))::text
    || '/' || (select count(*) from public.list_reopens r where r.list_id = pg_temp.id(list_name))::text
$$;

-- The kitchen's morning list, sent by 5 at 06:00; a door list sent by the
-- manager; and an older list, by the manager too, whose items are done
-- before the history began (below). B's owner sends themselves one.
insert into ids values ('morning', public.send_list(pg_temp.p(5), pg_temp.a(),
  jsonb_build_object(
    'name', 'Morning',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "check", "label": "Clean"},
      {"kind": "number", "label": "Fridge", "unit": "C", "min": 0, "max": 5},
      {"kind": "note", "label": "Notes", "required": false},
      {"kind": "photo", "label": "Shelf", "required": false}]'::jsonb),
  '2026-12-03 06:00+00'));
insert into ids values ('door', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Door',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "check", "label": "Hinge"}]'::jsonb),
  '2026-12-03 06:00+00'));
insert into ids values ('old', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Old',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "check", "label": "Mop"},
      {"kind": "number", "label": "Freezer", "min": -25, "max": -15},
      {"kind": "check", "label": "Bins"}]'::jsonb),
  '2026-12-03 05:00+00'));
insert into ids values ('front', public.send_list(pg_temp.p(9), pg_temp.b(),
  '{"name": "Front", "items": [{"kind": "check", "label": "Door"}],
    "recipient": {"kind": "person", "user": "b1000000-0000-4000-a000-000000000009"}}'::jsonb,
  '2026-12-03 06:00+00'));
-- The bar's order to the kitchen, as lists_pass.test.sql saves one: 20
-- lemons asked for, the usual count.
insert into ids
select 'order-template', (public.save_list_template(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object('name', 'Bar order',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'fromDepartment', pg_temp.bar(), 'asksQuantities', true,
    'items', '[{"kind": "check", "label": "Lemons", "defaultQuantity": 20}]'::jsonb)) ->> 'id')::uuid;
insert into ids values ('order', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object('template', pg_temp.id('order-template'),
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen())),
  '2026-12-03 06:00+00'));

------------------------------------------------------------------------------
-- Who may write

select ok(
  not has_table_privilege('authenticated', 'public.list_item_changes', 'insert, update, delete, truncate')
  and not has_table_privilege('authenticated', 'public.list_reopens', 'insert, update, delete, truncate')
  and not has_table_privilege('anon', 'public.list_item_changes', 'select, insert, update, delete, truncate')
  and not has_table_privilege('anon', 'public.list_reopens', 'select, insert, update, delete, truncate')
  and not has_table_privilege('service_role', 'public.list_item_changes', 'insert, update, delete, truncate')
  and not has_table_privilege('service_role', 'public.list_reopens', 'insert, update, delete, truncate')
  and has_table_privilege('authenticated', 'public.list_item_changes', 'select')
  and has_table_privilege('authenticated', 'public.list_reopens', 'select')
  and has_table_privilege('service_role', 'public.list_item_changes', 'select')
  and has_table_privilege('service_role', 'public.list_reopens', 'select'),
  'the history is read, never written, by the browser and the server alike'
);
select ok(
  not has_function_privilege('authenticated', 'private.record_item_change(public.list_items, public.list_items, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'private.record_item_change(public.list_items, public.list_items, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'private.refuse_history_change()', 'execute')
  and not has_function_privilege('authenticated', 'private.backfill_list_item_changes()', 'execute')
  and not has_function_privilege('service_role', 'private.backfill_list_item_changes()', 'execute')
  and not has_function_privilege('authenticated', 'public.set_list_item(uuid, uuid, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_list_item_photo(uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.reopen_list(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.set_list_item(uuid, uuid, jsonb, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.set_list_item_photo(uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.reopen_list(uuid, uuid, timestamptz)', 'execute'),
  'the history''s helpers run for nobody; its writers, replaced, are the server''s alone as before'
);

------------------------------------------------------------------------------
-- Ticks

select public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Clean'),
  '{"checked": true}', '2026-12-03 07:40+00');
select is(
  pg_temp.history('morning', 'Clean'),
  '3@07:40 checked (checked=true done)',
  'a tick writes one row, with who and when'
);
select is(
  public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Clean'),
    '{"checked": true}', '2026-12-03 07:41+00'),
  '{"done": 1, "total": 4, "required": 2, "requiredLeft": 1}'::jsonb,
  'the same result again still says how far the list is'
);
select is(
  pg_temp.history('morning', 'Clean') || '|' || (
    select (i.done_by = pg_temp.p(3) and i.done_at = '2026-12-03 07:40+00')::text
    from public.list_items i where i.id = pg_temp.item_of('morning', 'Clean')
  ),
  '3@07:40 checked (checked=true done)|true',
  'and writes nothing: one row, and the item done when it was'
);
select public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Clean'),
  null, '2026-12-03 08:15+00');
select is(
  pg_temp.history('morning', 'Clean') || '|' || (
    select (i.done or i.checked is not null or i.done_by is not null or i.done_at is not null)::text
    from public.list_items i where i.id = pg_temp.item_of('morning', 'Clean')
  ),
  '3@07:40 checked (checked=true done), 3@08:15 checked (open)|false',
  'clearing it writes a row of it cleared, and leaves nobody''s name on the item'
);
select public.set_list_item(pg_temp.p(4), pg_temp.item_of('morning', 'Clean'),
  '{"checked": true}', '2026-12-03 08:20+00');
select is(
  pg_temp.history('morning', 'Clean') || '|' || (
    select (i.done_by = pg_temp.p(4) and i.done_at = '2026-12-03 08:20+00')::text
    from public.list_items i where i.id = pg_temp.item_of('morning', 'Clean')
  ),
  '3@07:40 checked (checked=true done), 3@08:15 checked (open), 4@08:20 checked (checked=true done)|true',
  'ticked again by someone else, it is theirs, and the history keeps all three'
);

-- An order: a tick gives what was asked for, and says so.
select public.set_list_item(pg_temp.p(3), pg_temp.item_of('order', 'Lemons'),
  '{"checked": true}', '2026-12-03 07:50+00');
select is(
  pg_temp.history('order', 'Lemons'),
  '3@07:50 checked+given (checked=true given=20 done)',
  'a tick on an order writes one row naming the tick and the count it gave'
);
select public.set_list_item(pg_temp.p(3), pg_temp.item_of('order', 'Lemons'),
  '{"checked": true}', '2026-12-03 07:51+00');
select is(
  pg_temp.history('order', 'Lemons') || '|' || (
    select (i.done_by = pg_temp.p(3) and i.done_at = '2026-12-03 07:50+00')::text
    from public.list_items i where i.id = pg_temp.item_of('order', 'Lemons')
  ),
  '3@07:50 checked+given (checked=true given=20 done)|true',
  'ticked again with the count it already gave, it writes nothing'
);
select public.set_list_item(pg_temp.p(4), pg_temp.item_of('order', 'Lemons'),
  '{"given": 3}', '2026-12-03 08:30+00');
select is(
  pg_temp.history('order', 'Lemons') || '|' || (
    select (i.done_by = pg_temp.p(4) and i.done_at = '2026-12-03 08:30+00')::text
    from public.list_items i where i.id = pg_temp.item_of('order', 'Lemons')
  ),
  '3@07:50 checked+given (checked=true given=20 done), 4@08:30 given (checked=true given=3 done)|true',
  'a count changed by someone else writes a row naming the count, and is theirs'
);

------------------------------------------------------------------------------
-- Readings, answers and comments

select public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 4}', '2026-12-03 07:42+00');
select public.set_list_item(pg_temp.p(4), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 6}', '2026-12-03 11:02+00');
select is(
  pg_temp.history('morning', 'Fridge') || '|' || (
    select (i.done_by = pg_temp.p(4) and i.done_at = '2026-12-03 11:02+00')::text
    from public.list_items i where i.id = pg_temp.item_of('morning', 'Fridge')
  ),
  '3@07:42 reading (reading=4 done), 4@11:02 reading (reading=6 done)|true',
  'a second person''s new reading writes a row and moves who did it to them'
);
select public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 6, "comment": "Door left open"}', '2026-12-03 11:20+00');
select is(
  pg_temp.history('morning', 'Fridge') || '|' || (
    select (i.done_by = pg_temp.p(4) and i.done_at = '2026-12-03 11:02+00')::text
    from public.list_items i where i.id = pg_temp.item_of('morning', 'Fridge')
  ),
  '3@07:42 reading (reading=4 done), 4@11:02 reading (reading=6 done), '
    || '3@11:20 comment (reading=6 comment=Door left open done)|true',
  'a comment alone writes a row under its writer''s name, and keeps who did the item and when'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.action = 'lists.out_of_range'
     and a.details ->> 'item' = pg_temp.item_of('morning', 'Fridge')::text),
  1,
  'a reading going out of its range is logged once, as before, and a comment beside it is no news'
);
select public.set_list_item(pg_temp.p(4), pg_temp.item_of('morning', 'Notes'),
  '{"answer": "Milk", "comment": "Low on it"}', '2026-12-03 09:00+00');
select is(
  pg_temp.history('morning', 'Notes'),
  '4@09:00 answer+comment (answer=Milk comment=Low on it done)',
  'an answer and a comment saved together are one row naming both, with their text'
);

------------------------------------------------------------------------------
-- Photos

select public.set_list_item_photo(pg_temp.p(3), pg_temp.item_of('morning', 'Shelf'),
  pg_temp.folder('morning', 'aaaa1111.webp'), '2026-12-03 09:10+00');
select public.set_list_item_photo(pg_temp.p(4), pg_temp.item_of('morning', 'Shelf'),
  pg_temp.folder('morning', 'bbbb2222.jpg'), '2026-12-03 09:12+00');
select public.set_list_item_photo(pg_temp.p(3), pg_temp.item_of('morning', 'Shelf'),
  pg_temp.folder('morning', 'bbbb2222.jpg'), '2026-12-03 09:13+00');
select public.set_list_item_photo(pg_temp.p(3), pg_temp.item_of('morning', 'Shelf'),
  null, '2026-12-03 09:14+00');
select public.set_list_item_photo(pg_temp.p(3), pg_temp.item_of('morning', 'Shelf'),
  pg_temp.folder('morning', 'cccc3333.webp'), '2026-12-03 09:15+00');
select is(
  pg_temp.history('morning', 'Shelf'),
  '3@09:10 photo (photo done), 4@09:12 photo (photo done), 3@09:14 photo (open), 3@09:15 photo (photo done)',
  'a photo set, replaced and removed each write a row; the photo it already has writes none'
);
select public.forget_list_photos(array[pg_temp.folder('morning', 'cccc3333.webp')],
  '2027-03-10 08:00+00');
select is(
  pg_temp.history('morning', 'Shelf') || '|' || (
    select (i.photo_removed_at is not null)::text
    from public.list_items i where i.id = pg_temp.item_of('morning', 'Shelf')
  ),
  '3@09:10 photo (photo done), 4@09:12 photo (photo done), 3@09:14 photo (open), 3@09:15 photo (photo done)|true',
  'the clean-up forgetting a photo writes none'
);
select public.set_list_item(pg_temp.p(4), pg_temp.item_of('morning', 'Shelf'),
  '{"comment": "Top shelf"}', '2026-12-03 09:20+00');
select is(
  pg_temp.history('morning', 'Shelf') || '|' || (
    select (i.done_by = pg_temp.p(3) and i.done_at = '2026-12-03 09:15+00')::text
    from public.list_items i where i.id = pg_temp.item_of('morning', 'Shelf')
  ),
  '3@09:10 photo (photo done), 4@09:12 photo (photo done), 3@09:14 photo (open), '
    || '3@09:15 photo (photo done), 4@09:20 comment (comment=Top shelf photo done)|true',
  'a comment on a photo item writes a row and keeps who took the photo'
);

------------------------------------------------------------------------------
-- Opening again

-- The kitchen finishes the morning list, takes it back (the undo), finishes
-- it again, and the manager opens it in the afternoon. 7 ticks the door
-- list, cancels it and takes that back too. B's owner does as the kitchen.
select public.finish_list(pg_temp.p(3), pg_temp.id('morning'), '2026-12-03 12:00+00');
select public.reopen_list(pg_temp.p(3), pg_temp.id('morning'), '2026-12-03 12:03+00');
select public.finish_list(pg_temp.p(4), pg_temp.id('morning'), '2026-12-03 12:30+00');
select public.reopen_list(pg_temp.p(2), pg_temp.id('morning'), '2026-12-03 15:00+00');
select public.set_list_item(pg_temp.p(7), pg_temp.item_of('door', 'Hinge'),
  '{"checked": true}', '2026-12-03 08:30+00');
select public.cancel_list(pg_temp.p(7), pg_temp.id('door'), '2026-12-03 09:00+00');
select public.reopen_list(pg_temp.p(7), pg_temp.id('door'), '2026-12-03 09:03+00');
select public.set_list_item(pg_temp.p(9), pg_temp.item_of('front', 'Door'),
  '{"checked": true}', '2026-12-03 07:00+00');
select public.finish_list(pg_temp.p(9), pg_temp.id('front'), '2026-12-03 07:05+00');
select public.reopen_list(pg_temp.p(9), pg_temp.id('front'), '2026-12-03 07:06+00');

select results_eq(
  $$select r.list_id, r.reopened_by, r.reopened_at, r.was, r.was_by, r.was_at
    from public.list_reopens r
    where r.business_id = pg_temp.a()
    order by r.reopened_at$$,
  $$values
    (pg_temp.id('door'), pg_temp.p(7), '2026-12-03 09:03+00'::timestamptz,
     'cancelled'::text, pg_temp.p(7), '2026-12-03 09:00+00'::timestamptz),
    (pg_temp.id('morning'), pg_temp.p(3), '2026-12-03 12:03+00'::timestamptz,
     'finished'::text, pg_temp.p(3), '2026-12-03 12:00+00'::timestamptz),
    (pg_temp.id('morning'), pg_temp.p(2), '2026-12-03 15:00+00'::timestamptz,
     'finished'::text, pg_temp.p(4), '2026-12-03 12:30+00'::timestamptz)$$,
  'each reopen keeps the close it undid: a cancel and its undo, a finish and its undo, and a finish a list manager opened later'
);
select is(
  (select l.status || '|' || coalesce(l.finished_by::text, '-') || '|' || coalesce(l.finished_at::text, '-')
   from public.lists l where l.id = pg_temp.id('morning')),
  'open|-|-',
  'and the list forgets the close, as before'
);

------------------------------------------------------------------------------
-- A row names its own item, and what changed

select throws_ok(
  $$insert into public.list_item_changes (item_id, list_id, business_id, changed_at, changed, photo, done)
    values (pg_temp.item_of('morning', 'Clean'), pg_temp.id('door'), pg_temp.a(),
      '2026-12-03 16:00+00', '{checked}', false, true)$$,
  '23503', null, 'a row never names another list''s item'
);
select throws_ok(
  $$insert into public.list_item_changes (item_id, list_id, business_id, changed_at, changed, photo, done)
    values (pg_temp.item_of('morning', 'Clean'), pg_temp.id('morning'), pg_temp.b(),
      '2026-12-03 16:00+00', '{checked}', false, true)$$,
  '23503', null, 'nor another business''s'
);
select throws_ok(
  $$insert into public.list_item_changes (item_id, list_id, business_id, changed_at, changed, photo, done)
    values (pg_temp.item_of('morning', 'Clean'), pg_temp.id('morning'), pg_temp.a(),
      '2026-12-03 16:00+00', '{}', false, true)$$,
  '23514', null, 'a row names at least one change'
);
select throws_ok(
  $$insert into public.list_item_changes (item_id, list_id, business_id, changed_at, changed, photo, done)
    values (pg_temp.item_of('morning', 'Clean'), pg_temp.id('morning'), pg_temp.a(),
      '2026-12-03 16:00+00', '{checked,tick}', false, true)$$,
  '23514', null, 'and only fields an item has'
);

------------------------------------------------------------------------------
-- Who reads it: whoever reads the list

select pg_temp.sign_in(pg_temp.p(3));
select is(pg_temp.seen('morning'), '12/2', 'the kitchen, which the list is for, reads its whole history');
reset role;
select pg_temp.sign_in(pg_temp.p(5));
select is(pg_temp.seen('morning'), '12/2', 'so does whoever sent it');
reset role;
select pg_temp.sign_in(pg_temp.p(7));
select is(pg_temp.seen('morning'), '12/2', 'and someone who runs the lists');
reset role;
select pg_temp.sign_in(pg_temp.p(8));
select is(pg_temp.seen('morning'), '12/2', 'and the team viewing the business as a manager');
reset role;
select pg_temp.sign_in(pg_temp.p(6));
select is(pg_temp.seen('morning'), '0/0', 'a worker the list isn''t for reads none of it');
reset role;
select pg_temp.sign_in(pg_temp.p(9));
select is(
  pg_temp.seen('morning') || ' ' || pg_temp.seen('front'),
  '0/0 1/1',
  'another business reads only its own'
);
reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.list_item_changes',
  '42501', null, 'an anonymous visitor reads no change'
);
select throws_ok(
  'select count(*) from public.list_reopens',
  '42501', null, 'and no reopen'
);
reset role;

------------------------------------------------------------------------------
-- Nobody writes it directly

select pg_temp.sign_in(pg_temp.p(3));
select throws_ok(
  $$insert into public.list_item_changes (item_id, list_id, business_id, changed_by, changed_at, changed, photo, done)
    values (pg_temp.item_of('morning', 'Clean'), pg_temp.id('morning'), pg_temp.a(), pg_temp.p(3),
      '2026-12-03 16:00+00', '{checked}', false, true)$$,
  '42501', null, 'someone the list is for adds no row of their own'
);
select throws_ok(
  $$update public.list_item_changes set reading = 1$$,
  '42501', null, 'nor changes one'
);
select throws_ok(
  $$insert into public.list_reopens (list_id, business_id, reopened_at, was, was_at)
    values (pg_temp.id('morning'), pg_temp.a(), '2026-12-03 16:00+00', 'finished', '2026-12-03 15:00+00')$$,
  '42501', null, 'nor adds a reopen'
);
reset role;
set local role service_role;
select throws_ok(
  $$insert into public.list_item_changes (item_id, list_id, business_id, changed_at, changed, photo, done)
    select i.id, i.list_id, i.business_id, '2026-12-03 16:00+00', '{checked}', false, true
    from public.list_items i limit 1$$,
  '42501', null, 'the server adds no row either'
);
select throws_ok(
  $$update public.list_item_changes set reading = 1$$,
  '42501', null, 'changes none'
);
select throws_ok(
  $$delete from public.list_reopens$$,
  '42501', null, 'and deletes no reopen'
);
reset role;
select throws_ok(
  $$update public.list_item_changes set reading = 1 where list_id = pg_temp.id('morning')$$,
  '42501', 'The history is append-only', 'even the database''s owner changes no row'
);
select throws_ok(
  $$update public.list_item_changes set changed_by = pg_temp.p(1) where changed_by = pg_temp.p(3)$$,
  '42501', 'The history is append-only', 'nor moves one to someone else'
);
select throws_ok(
  $$update public.list_item_changes set changed_by = null, comment = 'Other'
    where changed_by = pg_temp.p(4)$$,
  '42501', 'The history is append-only', 'nor takes a name away with anything else'
);
select throws_ok(
  $$update public.list_reopens set was_at = was_at - interval '1 hour'
    where list_id = pg_temp.id('morning')$$,
  '42501', 'The history is append-only', 'nor changes a reopen'
);

------------------------------------------------------------------------------
-- People leave; what they did stays

-- Their employment periods hold their place in the business: a purge that
-- names it takes them first, for this test, as lists.test.sql does.
select set_config('ca.records_purge', pg_temp.a()::text, true);
delete from public.employment_periods
where business_id = pg_temp.a() and user_id = pg_temp.p(7);
select set_config('ca.records_purge', '', true);
select lives_ok(
  $$delete from auth.users where id = pg_temp.p(7)$$,
  'deleting the account of someone who filled, cancelled and reopened a list goes through'
);
select is(
  pg_temp.history('door', 'Hinge'),
  '-@08:30 checked (checked=true done)',
  'their change stays, with nobody''s name'
);
select results_eq(
  $$select r.reopened_by, r.reopened_at, r.was, r.was_by, r.was_at
    from public.list_reopens r where r.list_id = pg_temp.id('door')$$,
  $$values (null::uuid, '2026-12-03 09:03+00'::timestamptz, 'cancelled'::text,
    null::uuid, '2026-12-03 09:00+00'::timestamptz)$$,
  'and so does their reopen, with neither name'
);

------------------------------------------------------------------------------
-- Items done before the history began

-- Done straight on the row, as before this migration, with no history.
update public.list_items
set checked = true, done = true, done_by = pg_temp.p(3), done_at = '2026-12-03 05:10+00'
where id = pg_temp.item_of('old', 'Mop');
update public.list_items
set reading = -18, comment = 'Ice on the door', done = true, done_by = pg_temp.p(4),
  done_at = '2026-12-03 05:20+00'
where id = pg_temp.item_of('old', 'Freezer');
select is(
  pg_temp.history('old', 'Mop') || ' / ' || pg_temp.history('old', 'Freezer'),
  'none / none',
  'items done before the history began have none'
);
select private.backfill_list_item_changes();
select is(
  pg_temp.history('old', 'Mop') || ' / ' || pg_temp.history('old', 'Freezer')
    || ' / ' || pg_temp.history('old', 'Bins'),
  '3@05:10 checked (checked=true done) / 4@05:20 reading (reading=-18 comment=Ice on the door done) / none',
  'the backfill gives each item already done one row, by whoever did it and when, naming its result and keeping its comment unnamed; none to one not done'
);
select is(
  (select count(*)::integer from public.list_item_changes c where c.list_id = pg_temp.id('morning')),
  12,
  'and none to an item that has its history'
);
select is(private.backfill_list_item_changes(), 0, 'run again, it adds none');

------------------------------------------------------------------------------
-- It goes with its list

select lives_ok(
  $$delete from public.lists where id = pg_temp.id('door')$$,
  'deleting a list goes through'
);
select is(
  (select count(*)::integer from public.list_item_changes c where c.list_id = pg_temp.id('door'))
    + (select count(*)::integer from public.list_reopens r where r.list_id = pg_temp.id('door')),
  0,
  'and takes its history with it'
);
select private.purge_business_records(pg_temp.b());
select lives_ok(
  $$delete from public.businesses where id = pg_temp.b()$$,
  'deleting a business goes through'
);
select is(
  (select count(*)::integer from public.list_item_changes c where c.business_id = pg_temp.b())
    + (select count(*)::integer from public.list_reopens r where r.business_id = pg_temp.b()),
  0,
  'and takes its lists'' history with them'
);

-- A demo business: its example lists are filled through set_list_item at
-- each reset (private.seed_demo_lists).
insert into private.demo_businesses (business_id, definition)
values (pg_temp.d(), $json$
  {
    "slug": "list-history-demo", "name": "List history demo", "accent": "#7c3aed",
    "address": "Demo street 9", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "people": [
      { "user_id": "b1000000-0000-4000-a000-0000000000d1", "role": "owner", "name": "Owner D1" },
      { "user_id": "b1000000-0000-4000-a000-0000000000d2", "role": "manager", "name": "Manager D2", "departments": ["floor"] },
      { "user_id": "b1000000-0000-4000-a000-0000000000d3", "role": "worker", "name": "Worker D3", "departments": ["checkout", "stock"] }
    ]
  }
  $json$);
set local role service_role;
select public.reset_demo_business(pg_temp.d());
reset role;
insert into first_changes
select c.id from public.list_item_changes c where c.business_id = pg_temp.d();
select ok(
  (select count(*) from first_changes) > 0
  and (select count(*) from first_changes) = (
    select count(*) from public.list_items i where i.business_id = pg_temp.d() and i.done
  )
  and not exists (
    select 1
    from public.list_item_changes c
    join public.list_items i on i.id = c.item_id
    where c.business_id = pg_temp.d()
      and (c.changed_by is distinct from i.done_by or c.changed_at is distinct from i.done_at or not c.done)
  ),
  'a demo''s example lists have their history: one row for each item done, by whoever did it and when'
);
set local role service_role;
select public.reset_demo_business(pg_temp.d());
reset role;
select ok(
  not exists (select 1 from public.list_item_changes c join first_changes f on f.id = c.id)
  and (select count(*) from public.list_item_changes c where c.business_id = pg_temp.d()) = (
    select count(*) from public.list_items i where i.business_id = pg_temp.d() and i.done
  ),
  'a demo reset takes it with its lists, and the new lists start their own'
);

select * from finish();
rollback;
