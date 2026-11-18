-- Fixing a closed list in place (20261116000300_lists_fix.sql): those who run
-- the lists fix an item of a finished list through public.fix_list_item and
-- fix_list_item_photo. The list stays finished, with who closed it and when,
-- its lateness and its lists.finish row as they were; nobody is told, and
-- nothing is sent again. The change is a history row marked fixed, under the
-- fixer's name; the item and the list keep when they were last fixed; one
-- lists.fix row says what was and what is. While an item stays done, who did
-- it and when stay. A required item is changed, never emptied (23514, hint
-- 'required'), a required photo replaced, never removed; an optional photo
-- a fix gives is the fixer's, and one it removes is nobody's. set_list_item
-- still refuses a finished list; a fix refuses an open, cancelled or missed
-- one, someone who only holds or sent it, and a business with lists off, and
-- tells someone a list isn't for nothing of how it stands. Fixed ids
-- (b2…), numbers (050-053-xxxx) and times (10 December 2026), so nothing here
-- meets the seed or another test, or the real clock.
begin;
select plan(47);

-- A: 1 owner, 2 manager, 3 and 4 workers in the kitchen, 5 a worker given
-- lists.send (who sends lists but runs none and is in no department), 6 a
-- worker given lists.manage (in no department), 7 a worker in no
-- department. B: 8, its owner.
insert into auth.users (id, aud, role, phone)
select ('b2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250053' || lpad(n::text, 4, '0')
from generate_series(1, 8) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('b2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'b2000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'b2000000-0000-4000-b000-000000000002'::uuid
$$;
create function pg_temp.kitchen() returns uuid language sql as $$
  select 'b2000000-0000-4000-c000-000000000001'::uuid
$$;
create function pg_temp.bar() returns uuid language sql as $$
  select 'b2000000-0000-4000-c000-000000000002'::uuid
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'lists-fix-a', 'Lists fix A'),
  (pg_temp.b(), 'lists-fix-b', 'Lists fix B');

insert into public.memberships (business_id, user_id, role, perms, active)
select pg_temp.a(), pg_temp.p(n),
  (case n when 1 then 'owner' when 2 then 'manager' else 'worker' end)::public.member_role,
  case n
    when 5 then '{lists.send}'::text[]
    when 6 then '{lists.manage}'::text[]
    else '{}'::text[]
  end,
  true
from generate_series(1, 7) as n;
insert into public.memberships (business_id, user_id, role, perms, active)
values (pg_temp.b(), pg_temp.p(8), 'owner', '{}', true);

-- A tells its people (the notifications module), so a fix's silence shows.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'lists', true, '{}'),
  (pg_temp.a(), 'notifications', true, '{}'),
  (pg_temp.b(), 'lists', true, '{}');

-- The bar, with nobody in it, asks the kitchen for what it needs (an order).
insert into public.departments (id, business_id, key, name)
values
  (pg_temp.kitchen(), pg_temp.a(), 'kitchen', 'Kitchen'),
  (pg_temp.bar(), pg_temp.a(), 'bar', 'Bar');
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(4));

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table marks (name text primary key, value text) on commit drop;

create function pg_temp.id(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
create function pg_temp.mark(saved text) returns text language sql as $$
  select m.value from marks m where m.name = saved
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
-- A time as the tests write it (UTC), or '-'.
create function pg_temp.hm(at_time timestamptz) returns text language sql as $$
  select coalesce(to_char(at_time at time zone 'UTC', 'HH24:MI'), '-')
$$;
-- A person by their number, or '-'.
create function pg_temp.who(person uuid) returns text language sql as $$
  select coalesce(right(person::text, 1), '-')
$$;
-- An item's history, oldest first: who, when, what changed (and whether it
-- was a fix), and the item after it.
create function pg_temp.history(list_name text, item_label text) returns text language sql as $$
  select coalesce(string_agg(
    pg_temp.who(c.changed_by) || '@' || pg_temp.hm(c.changed_at) || ' '
      || array_to_string(c.changed, '+') || case when c.fixed then ' fixed' else '' end
      || ' (' || concat_ws(' ',
        'checked=' || c.checked, 'given=' || c.given, 'reading=' || c.reading,
        'answer=' || c.answer, 'comment=' || c.comment,
        case when c.photo then 'photo' end,
        case when c.done then 'done' else 'open' end)
      || ')',
    ', ' order by c.changed_at, c.id), 'none')
  from public.list_item_changes c
  where c.item_id = pg_temp.item_of(list_name, item_label)
$$;
-- An item now: done or open, who did it and when, and its last fix.
create function pg_temp.item_now(list_name text, item_label text) returns text language sql as $$
  select case when i.done then 'done' else 'open' end
    || ' by=' || pg_temp.who(i.done_by) || ' at=' || pg_temp.hm(i.done_at)
    || ' fixed=' || pg_temp.hm(i.fixed_at)
  from public.list_items i
  where i.id = pg_temp.item_of(list_name, item_label)
$$;
-- A list now: its status, who finished it and when, when it became late, and
-- its last fix.
create function pg_temp.list_now(list_name text) returns text language sql as $$
  select l.status || '|' || pg_temp.who(l.finished_by) || '|' || pg_temp.hm(l.finished_at)
    || '|' || pg_temp.hm(l.late_at) || '|' || pg_temp.hm(l.fixed_at)
  from public.lists l where l.id = pg_temp.id(list_name)
$$;
-- What the log has of a saved list, oldest first.
create function pg_temp.logged(list_name text) returns text language sql as $$
  select coalesce(string_agg(a.action, ',' order by a.id), 'none')
  from public.audit_log a
  where a.details ->> 'list' = pg_temp.id(list_name)::text
$$;
-- The newest lists.fix row of a saved list: who, and its details.
create function pg_temp.last_fix(list_name text) returns jsonb language sql as $$
  select jsonb_build_object('by', pg_temp.who(a.actor_id), 'details', a.details)
  from public.audit_log a
  where a.action = 'lists.fix' and a.details ->> 'list' = pg_temp.id(list_name)::text
  order by a.id desc
  limit 1
$$;
-- Everything A's people have been told, as one fingerprint.
create function pg_temp.told() returns text language sql as $$
  select md5(coalesce(string_agg(to_jsonb(n)::text, ',' order by n.id), ''))
  from public.notifications n where n.business_id = pg_temp.a()
$$;
-- How a statement was refused: its code and hint, or 'none'.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  hint_text text;
begin
  execute statement;
  return 'none';
exception when others then
  get stacked diagnostics code = returned_sqlstate, hint_text = pg_exception_hint;
  return code || '/' || coalesce(nullif(hint_text, ''), '-');
end;
$$;

-- The kitchen's morning list, sent by 5 at 06:00, due at 07:00: a check, a
-- reading, an optional note, a photo and an optional check. The manager
-- sends the kitchen a door list that stays open, one it cancels and one the
-- day marks missed.
insert into ids values ('morning', public.send_list(pg_temp.p(5), pg_temp.a(),
  jsonb_build_object(
    'name', 'Morning',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'dueAt', '2026-12-10T07:00:00Z',
    'items', '[{"kind": "check", "label": "Clean"},
      {"kind": "number", "label": "Fridge", "unit": "C", "min": 0, "max": 5},
      {"kind": "note", "label": "Notes", "required": false},
      {"kind": "photo", "label": "Shelf"},
      {"kind": "check", "label": "Spare", "required": false}]'::jsonb),
  '2026-12-10 06:00+00'));
insert into ids values ('door', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Door',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "check", "label": "Hinge"},
      {"kind": "photo", "label": "Lock", "required": false}]'::jsonb),
  '2026-12-10 06:00+00'));
insert into ids values ('cancelled', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Cancelled',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "check", "label": "Window", "required": false}]'::jsonb),
  '2026-12-10 06:00+00'));
insert into ids values ('missed', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Missed',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'dueAt', '2026-12-10T07:00:00Z',
    'items', '[{"kind": "check", "label": "Floor", "required": false}]'::jsonb),
  '2026-12-10 06:00+00'));
-- The back room's list, with only an optional photo, closed with none.
insert into ids values ('back', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Back',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "photo", "label": "Bin", "required": false}]'::jsonb),
  '2026-12-10 06:00+00'));
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
  '2026-12-10 06:00+00'));

-- The kitchen fills the morning list, late (as the tick marks it at 07:15),
-- and 3 finishes it at 08:05; 3 ticks the order and finishes it at 08:10;
-- 4 finishes the back room's at 08:20 with no photo. The manager cancels one
-- list, and the day marks another missed, as the tick does.
select public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Clean'),
  '{"checked": true}', '2026-12-10 07:40+00');
select public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 4}', '2026-12-10 07:42+00');
select public.set_list_item_photo(pg_temp.p(4), pg_temp.item_of('morning', 'Shelf'),
  pg_temp.folder('morning', 'aaaa1111.webp'), '2026-12-10 07:50+00');
select public.set_list_item(pg_temp.p(4), pg_temp.item_of('morning', 'Notes'),
  '{"answer": "Milk"}', '2026-12-10 07:55+00');
update public.lists set late_at = '2026-12-10 07:15+00' where id = pg_temp.id('morning');
select public.finish_list(pg_temp.p(3), pg_temp.id('morning'), '2026-12-10 08:05+00');
select public.set_list_item(pg_temp.p(3), pg_temp.item_of('order', 'Lemons'),
  '{"checked": true}', '2026-12-10 07:50+00');
select public.finish_list(pg_temp.p(3), pg_temp.id('order'), '2026-12-10 08:10+00');
select public.finish_list(pg_temp.p(4), pg_temp.id('back'), '2026-12-10 08:20+00');
select public.cancel_list(pg_temp.p(2), pg_temp.id('cancelled'), '2026-12-10 09:00+00');
update public.lists set status = 'missed', closed_at = '2026-12-10 08:00+00'
where id = pg_temp.id('missed');

------------------------------------------------------------------------------
-- The marks, and who may call what

select ok(
  exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'list_item_changes'
      and c.column_name = 'fixed' and c.data_type = 'boolean'
      and c.is_nullable = 'NO' and c.column_default = 'false'
  )
  and exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'list_items'
      and c.column_name = 'fixed_at' and c.data_type = 'timestamp with time zone'
      and c.is_nullable = 'YES'
  )
  and exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'lists'
      and c.column_name = 'fixed_at' and c.data_type = 'timestamp with time zone'
      and c.is_nullable = 'YES'
  ),
  'a history row says whether it was a fix, and an item and a list when they were last fixed'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.fix_list_item(uuid, uuid, jsonb, timestamptz)',
      'public.fix_list_item_photo(uuid, uuid, text, timestamptz)',
      'public.set_list_item(uuid, uuid, jsonb, timestamptz)',
      'public.set_list_item_photo(uuid, uuid, text, timestamptz)'
    ]) as f (signature)
    where has_function_privilege('authenticated', f.signature, 'execute')
      or has_function_privilege('anon', f.signature, 'execute')
      or not has_function_privilege('service_role', f.signature, 'execute')
  )
  and not exists (
    select 1
    from unnest(array[
      'private.can_fix_list(public.lists, uuid, timestamptz)',
      'private.write_list_item(uuid, uuid, jsonb, timestamptz, boolean)',
      'private.write_list_item_photo(uuid, uuid, text, timestamptz, boolean)',
      'private.record_item_change(public.list_items, public.list_items, uuid, timestamptz)'
    ]) as f (signature)
    where has_function_privilege('authenticated', f.signature, 'execute')
      or has_function_privilege('anon', f.signature, 'execute')
  )
  and not has_function_privilege('service_role', 'private.can_fix_list(public.lists, uuid, timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'private.write_list_item(uuid, uuid, jsonb, timestamptz, boolean)', 'execute')
  and not has_function_privilege('service_role', 'private.write_list_item_photo(uuid, uuid, text, timestamptz, boolean)', 'execute')
  and (select count(*)::int from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname || '.' || p.proname in (
           'public.fix_list_item', 'public.fix_list_item_photo',
           'public.set_list_item', 'public.set_list_item_photo',
           'private.can_fix_list', 'private.write_list_item',
           'private.write_list_item_photo', 'private.record_item_change'
         )
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 8,
  'a fix is the server''s alone, as filling is; the bodies under both run for nobody, as their owner with an empty search path'
);
select is(
  (select string_agg(pg_temp.who(x.person) || ':' || private.can_fix_list(l, x.person, '2026-12-10 14:00+00')::text,
     ' ' order by x.n)
   from public.lists l
   cross join lateral (values (1, pg_temp.p(2)), (2, pg_temp.p(6)), (3, pg_temp.p(3)), (4, pg_temp.p(5)))
     as x (n, person)
   where l.id = pg_temp.id('morning'))
    || ' / ' || (select private.can_fix_list(l, pg_temp.p(2), '2026-12-10 14:00+00')::text
                 from public.lists l where l.id = pg_temp.id('door')),
  '2:true 6:true 3:false 5:false / false',
  'those who run the lists may fix a finished list, those who only hold it or sent it may not, and an open list is no fix'
);

------------------------------------------------------------------------------
-- A manager fixes a reading

insert into marks values ('told', pg_temp.told());
select is(
  public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Fridge'),
    '{"reading": 3}', '2026-12-10 14:20+00'),
  '{"done": 4, "total": 5, "required": 3, "requiredLeft": 0}'::jsonb,
  'a fix says how far the list is, as filling does'
);
select is(
  pg_temp.list_now('morning'),
  'finished|3|08:05|07:15|14:20',
  'the list stays finished, by whoever finished it and when, as late as it was, and keeps when it was fixed'
);
select is(
  pg_temp.logged('morning')
    || ' ' || (select (a.details ->> 'late') from public.audit_log a
               where a.action = 'lists.finish' and a.details ->> 'list' = pg_temp.id('morning')::text),
  'lists.send,lists.finish,lists.fix true',
  'nothing is sent or finished again: one lists.fix row, and the close''s row, late, as it was'
);
select is(
  pg_temp.told(),
  pg_temp.mark('told'),
  'and nobody is told: no line is written, opened again or settled'
);
select is(
  pg_temp.history('morning', 'Fridge'),
  '3@07:42 reading (reading=4 done), 2@14:20 reading fixed (reading=3 done)',
  'the history keeps the first reading and the fix, under the fixer''s name and marked fixed'
);
select is(
  pg_temp.item_now('morning', 'Fridge'),
  'done by=3 at=07:42 fixed=14:20',
  'the item stays the one who read it first, at their time, and keeps when it was fixed'
);
select is(
  pg_temp.last_fix('morning'),
  jsonb_build_object('by', '2', 'details', jsonb_build_object(
    'list', pg_temp.id('morning'), 'name', 'Morning',
    'item', pg_temp.item_of('morning', 'Fridge'), 'label', 'Fridge',
    'kind', 'number', 'unit', 'C', 'changed', '["reading"]'::jsonb,
    'from', '{"checked": null, "given": null, "reading": 4}'::jsonb,
    'to', '{"checked": null, "given": null, "reading": 3}'::jsonb)),
  'the lists.fix row is the fixer''s: the list, the item, what changed, from and to'
);

------------------------------------------------------------------------------
-- Filling a closed list stays refused, and only a finished list is fixed

select is(
  pg_temp.refusal($$select public.set_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Fridge'),
      '{"reading": 2}', '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.set_list_item_photo(pg_temp.p(2), pg_temp.item_of('morning', 'Shelf'),
      pg_temp.folder('morning', 'cccc3333.webp'), '2026-12-10 14:21+00')$$),
  '55000/- 55000/-',
  'filling a finished list is still refused, even for someone who may fix it'
);
select is(
  pg_temp.refusal($$select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('door', 'Hinge'),
      '{"checked": true}', '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item_photo(pg_temp.p(2), pg_temp.item_of('door', 'Lock'),
      pg_temp.folder('door', 'dddd4444.webp'), '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('cancelled', 'Window'),
      '{"checked": true}', '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('missed', 'Floor'),
      '{"checked": true}', '2026-12-10 14:21+00')$$),
  '55000/- 55000/- 55000/- 55000/-',
  'an open list is filled, not fixed, and a cancelled or missed list is not fixed'
);
select is(
  pg_temp.list_now('missed') || ' ' || pg_temp.item_now('missed', 'Floor'),
  'missed|-|-|-|- open by=- at=- fixed=-',
  'a missed list stays missed'
);

------------------------------------------------------------------------------
-- Who fixes

select is(
  pg_temp.refusal($$select public.fix_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Fridge'),
      '{"reading": 2}', '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item_photo(pg_temp.p(4), pg_temp.item_of('morning', 'Shelf'),
      pg_temp.folder('morning', 'cccc3333.webp'), '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item(pg_temp.p(5), pg_temp.item_of('morning', 'Fridge'),
      '{"reading": 2}', '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item(pg_temp.p(7), pg_temp.item_of('morning', 'Fridge'),
      '{"reading": 2}', '2026-12-10 14:21+00')$$),
  '42501/- 42501/- 42501/- 42501/-',
  'the kitchen, which holds the list and finished it, does not fix it, nor its sender, nor a worker it isn''t for'
);
select is(
  pg_temp.refusal($$select public.fix_list_item(pg_temp.p(7), pg_temp.item_of('door', 'Hinge'),
      '{"checked": true}', '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item_photo(pg_temp.p(7), pg_temp.item_of('door', 'Lock'),
      pg_temp.folder('door', 'dddd4444.webp'), '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item(pg_temp.p(3), pg_temp.item_of('door', 'Hinge'),
      '{"checked": true}', '2026-12-10 14:21+00')$$),
  '42501/- 42501/- 55000/-',
  'a fix tells someone a list isn''t for nothing of how it stands, and the kitchen, which holds it, that it is open'
);
select is(
  pg_temp.refusal($$select public.fix_list_item(pg_temp.p(8), pg_temp.item_of('morning', 'Fridge'),
      '{"reading": 2}', '2026-12-10 14:21+00')$$),
  'P0002/-',
  'another business''s owner finds no such item'
);
select is(
  pg_temp.history('morning', 'Fridge') || ' | ' || pg_temp.item_now('morning', 'Fridge'),
  '3@07:42 reading (reading=4 done), 2@14:20 reading fixed (reading=3 done) | done by=3 at=07:42 fixed=14:20',
  'and a refused fix leaves the item as it was'
);

------------------------------------------------------------------------------
-- A required item is changed, never emptied

select is(
  pg_temp.refusal($$select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Clean'),
      null, '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Clean'),
      '{"checked": false}', '2026-12-10 14:21+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Fridge'),
      '{"comment": "No reading"}', '2026-12-10 14:21+00')$$),
  '23514/required 23514/required 23514/required',
  'emptying a required item in a fix is refused, with the hint required'
);
select is(
  pg_temp.history('morning', 'Clean') || ' | ' || pg_temp.item_now('morning', 'Clean'),
  '3@07:40 checked (checked=true done) | done by=3 at=07:40 fixed=-',
  'and leaves it as it was'
);
select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Notes'),
  null, '2026-12-10 14:22+00');
select is(
  pg_temp.history('morning', 'Notes') || ' | ' || pg_temp.item_now('morning', 'Notes'),
  '4@07:55 answer (answer=Milk done), 2@14:22 answer fixed (open) | open by=- at=- fixed=14:22',
  'an optional item can be emptied in a fix, and then is nobody''s'
);
select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Spare'),
  '{"checked": true}', '2026-12-10 14:23+00');
select is(
  pg_temp.history('morning', 'Spare') || ' | ' || pg_temp.item_now('morning', 'Spare'),
  '2@14:23 checked fixed (checked=true done) | done by=2 at=14:23 fixed=14:23',
  'an optional item a fix makes done is the fixer''s, at the fix''s time'
);

------------------------------------------------------------------------------
-- An order's count

select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('order', 'Lemons'),
  '{"given": 18}', '2026-12-10 14:25+00');
select is(
  pg_temp.history('order', 'Lemons') || ' | ' || pg_temp.item_now('order', 'Lemons')
    || ' | ' || pg_temp.list_now('order'),
  '3@07:50 checked+given (checked=true given=20 done), 2@14:25 given fixed (checked=true given=18 done)'
    || ' | done by=3 at=07:50 fixed=14:25 | finished|3|08:10|-|14:25',
  'a count fixed on a finished order keeps who gave it and when, and the order stays finished'
);
select is(
  pg_temp.last_fix('order') -> 'details',
  jsonb_build_object(
    'list', pg_temp.id('order'), 'name', 'Bar order',
    'item', pg_temp.item_of('order', 'Lemons'), 'label', 'Lemons',
    'kind', 'check', 'unit', null, 'changed', '["given"]'::jsonb,
    'from', '{"checked": true, "given": 20, "reading": null}'::jsonb,
    'to', '{"checked": true, "given": 18, "reading": null}'::jsonb),
  'its lists.fix row says the count it was and the count it is'
);

------------------------------------------------------------------------------
-- Photos

select is(
  public.fix_list_item_photo(pg_temp.p(6), pg_temp.item_of('morning', 'Shelf'),
    pg_temp.folder('morning', 'bbbb2222.jpg'), '2026-12-10 14:30+00'),
  pg_temp.folder('morning', 'aaaa1111.webp'),
  'someone given lists.manage replaces a required photo in a fix, and gets the file it replaced to delete'
);
select is(
  pg_temp.history('morning', 'Shelf') || ' | ' || pg_temp.item_now('morning', 'Shelf')
    || ' | ' || pg_temp.list_now('morning'),
  '4@07:50 photo (photo done), 6@14:30 photo fixed (photo done) | done by=4 at=07:50 fixed=14:30'
    || ' | finished|3|08:05|07:15|14:30',
  'the photo keeps who took the first one and when; the fix is in the history, on the item and on the list'
);
select is(
  pg_temp.last_fix('morning'),
  jsonb_build_object('by', '6', 'details', jsonb_build_object(
    'list', pg_temp.id('morning'), 'name', 'Morning',
    'item', pg_temp.item_of('morning', 'Shelf'), 'label', 'Shelf',
    'kind', 'photo', 'unit', null, 'changed', '["photo"]'::jsonb,
    'from', '{"checked": null, "given": null, "reading": null}'::jsonb,
    'to', '{"checked": null, "given": null, "reading": null}'::jsonb)),
  'and its lists.fix row names the photo'
);
select is(
  pg_temp.refusal($$select public.fix_list_item_photo(pg_temp.p(6), pg_temp.item_of('morning', 'Shelf'),
      null, '2026-12-10 14:31+00')$$),
  '23514/required',
  'removing a required photo in a fix is refused, with the hint required'
);
select is(
  public.fix_list_item_photo(pg_temp.p(6), pg_temp.item_of('morning', 'Shelf'),
    pg_temp.folder('morning', 'bbbb2222.jpg'), '2026-12-10 14:32+00'),
  null,
  'the photo it already has returns nothing'
);
select is(
  pg_temp.history('morning', 'Shelf') || ' | ' || pg_temp.item_now('morning', 'Shelf')
    || ' | ' || (select count(*)::text from public.audit_log a
                 where a.action = 'lists.fix' and a.details ->> 'item' = pg_temp.item_of('morning', 'Shelf')::text),
  '4@07:50 photo (photo done), 6@14:30 photo fixed (photo done) | done by=4 at=07:50 fixed=14:30 | 1',
  'and writes nothing, as a refused removal writes nothing'
);
select is(
  public.fix_list_item_photo(pg_temp.p(2), pg_temp.item_of('back', 'Bin'),
    pg_temp.folder('back', 'eeee5555.webp'), '2026-12-10 14:40+00'),
  null,
  'a first photo on an optional item in a fix replaces no file'
);
select is(
  pg_temp.history('back', 'Bin') || ' | ' || pg_temp.item_now('back', 'Bin')
    || ' | ' || pg_temp.list_now('back'),
  '2@14:40 photo fixed (photo done) | done by=2 at=14:40 fixed=14:40 | finished|4|08:20|-|14:40',
  'an optional photo a fix gives is the fixer''s, at the fix''s time, and the list stays finished'
);
select is(
  public.fix_list_item_photo(pg_temp.p(2), pg_temp.item_of('back', 'Bin'),
    null, '2026-12-10 14:41+00'),
  pg_temp.folder('back', 'eeee5555.webp'),
  'an optional photo is removed in a fix, and gives the file it removed to delete'
);
select is(
  pg_temp.history('back', 'Bin') || ' | ' || pg_temp.item_now('back', 'Bin')
    || ' | ' || (pg_temp.last_fix('back') -> 'details' -> 'changed')::text,
  '2@14:40 photo fixed (photo done), 2@14:41 photo fixed (open) | open by=- at=- fixed=14:41 | ["photo"]',
  'and the item is then not done and nobody''s, with a fixed row and a lists.fix row naming the photo'
);

------------------------------------------------------------------------------
-- A reading out of its range, a note, and nothing new

select public.fix_list_item(pg_temp.p(1), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 9}', '2026-12-10 15:00+00');
select is(
  pg_temp.logged('morning'),
  'lists.send,lists.finish,lists.fix,lists.fix,lists.fix,lists.fix,lists.fix,lists.out_of_range',
  'a fix that puts a reading out of its range still writes lists.out_of_range, after its own row'
);
select is(
  (select pg_temp.who(a.actor_id) || ' ' || (a.details ->> 'reading')
   from public.audit_log a
   where a.action = 'lists.out_of_range' and a.details ->> 'item' = pg_temp.item_of('morning', 'Fridge')::text),
  '1 9',
  'under the fixer''s name, with the reading'
);
select is(
  (select string_agg(pg_temp.who(n.user_id), ',' order by n.user_id)
   from public.notifications n
   where n.business_id = pg_temp.a() and n.kind = 'lists.out_of_range'
     and n.dedupe_key = 'list.range:' || pg_temp.item_of('morning', 'Fridge')::text),
  '2,6',
  'and the others who run the lists are told, as for any reading'
);
select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 9, "comment": "Door left open"}', '2026-12-10 15:05+00');
select is(
  pg_temp.history('morning', 'Fridge') || ' | ' || pg_temp.item_now('morning', 'Fridge'),
  '3@07:42 reading (reading=4 done), 2@14:20 reading fixed (reading=3 done), '
    || '1@15:00 reading fixed (reading=9 done), 2@15:05 comment fixed (reading=9 comment=Door left open done)'
    || ' | done by=3 at=07:42 fixed=15:05',
  'a note added in a fix is a fixed row of its own, and the reading stays the first reader''s'
);
select is(
  pg_temp.last_fix('morning') -> 'details' -> 'changed',
  '["comment"]'::jsonb,
  'and its lists.fix row names the comment, with no text'
);
select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 9, "comment": "Door left open"}', '2026-12-10 15:10+00');
select is(
  pg_temp.history('morning', 'Fridge') || ' | ' || pg_temp.item_now('morning', 'Fridge')
    || ' | ' || pg_temp.list_now('morning') || ' | ' || pg_temp.logged('morning'),
  '3@07:42 reading (reading=4 done), 2@14:20 reading fixed (reading=3 done), '
    || '1@15:00 reading fixed (reading=9 done), 2@15:05 comment fixed (reading=9 comment=Door left open done)'
    || ' | done by=3 at=07:42 fixed=15:05 | finished|3|08:05|07:15|15:05'
    || ' | lists.send,lists.finish,lists.fix,lists.fix,lists.fix,lists.fix,lists.fix,lists.out_of_range,lists.fix',
  'a fix that changes nothing writes nothing: no row, no mark, no log'
);

------------------------------------------------------------------------------
-- Lists off

update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'lists';
select is(
  pg_temp.refusal($$select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Fridge'),
      '{"reading": 2}', '2026-12-10 15:20+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item_photo(pg_temp.p(1), pg_temp.item_of('morning', 'Shelf'),
      pg_temp.folder('morning', 'cccc3333.webp'), '2026-12-10 15:20+00')$$),
  '42501/- 42501/-',
  'with lists off, nobody fixes'
);
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'lists';

------------------------------------------------------------------------------
-- Opened again for everyone

select public.reopen_list(pg_temp.p(2), pg_temp.id('morning'), '2026-12-10 16:00+00');
select is(
  pg_temp.refusal($$select public.fix_list_item(pg_temp.p(2), pg_temp.item_of('morning', 'Fridge'),
      '{"reading": 2}', '2026-12-10 16:01+00')$$),
  '55000/-',
  'a fix of a list opened again in the meantime is refused, as a list to fill'
);
select public.set_list_item(pg_temp.p(3), pg_temp.item_of('morning', 'Spare'),
  '{"checked": false}', '2026-12-10 16:05+00');
select is(
  pg_temp.history('morning', 'Spare') || ' | ' || pg_temp.item_now('morning', 'Spare'),
  '2@14:23 checked fixed (checked=true done), 3@16:05 checked (open) | open by=- at=- fixed=14:23',
  'filling it again is no fix, and the item keeps when it was last fixed'
);
select public.finish_list(pg_temp.p(4), pg_temp.id('morning'), '2026-12-10 16:10+00');
select is(
  pg_temp.list_now('morning'),
  'finished|4|16:10|07:15|15:05',
  'finished again, the list keeps its last fix, now before its close, so it no longer reads as fixed'
);
select public.fix_list_item(pg_temp.p(6), pg_temp.item_of('morning', 'Fridge'),
  '{"reading": 5, "comment": "Door left open"}', '2026-12-10 17:00+00');
select is(
  pg_temp.item_now('morning', 'Fridge') || ' | ' || pg_temp.list_now('morning'),
  'done by=3 at=07:42 fixed=17:00 | finished|4|16:10|07:15|17:00',
  'and a fix after the new close marks it again'
);

------------------------------------------------------------------------------
-- Every change still goes through the history

select is(
  (select count(*)::integer from public.list_item_changes c
   where c.business_id = pg_temp.a() and c.fixed)
    || '/' || (select count(*)::integer from public.audit_log a
               where a.business_id = pg_temp.a() and a.action = 'lists.fix'),
  '10/10',
  'each fix is one fixed history row and one lists.fix row'
);
select is(
  (select count(*)::integer from public.list_item_changes c
   where c.business_id = pg_temp.a() and c.fixed
     and not exists (
       select 1 from public.audit_log a
       where a.action = 'lists.fix'
         and a.actor_id is not distinct from c.changed_by
         and a.details ->> 'item' = c.item_id::text
     )),
  0,
  'by the same person, on the same item'
);
select is(
  (select count(*)::integer from public.list_item_changes c
   where c.business_id = pg_temp.a() and not c.fixed
     and exists (
       select 1 from public.lists l
       where l.id = c.list_id and l.finished_at is not null and c.changed_at > l.finished_at
     )),
  0,
  'and no change after a list''s close goes unmarked'
);

select * from finish();
rollback;
