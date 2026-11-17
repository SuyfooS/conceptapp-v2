-- The switch 'תיקון רשימות שנסגרו' for any role (20261116000400_lists_fix_switch.sql):
-- the key lists.fix, settable from the start, held by managers by default and
-- requiring nothing; the lists' setting fixHours, 2, 12, 24 or 72 hours and
-- anything else 24; and private.can_fix_list widened to someone given
-- lists.fix, for a list that reaches them now, until fixHours after it
-- closed. Orel's case: a role the business named on workers, given the
-- switch, fixes a list sent to it, one holder after another closed it; past
-- the window it hears why (42501, hint 'fix_window'), photos too; a list it
-- doesn't hold, or one passed away from its department since, it doesn't fix
-- (42501, no hint). A base role's grant reaches a named role with no rule of
-- its own, a named role's own rule decides over its base's, a grant of one's
-- own holds, and switching it off stops it. Those who run the lists still fix
-- at any time; lists.fix never reopens a list. A role's line (R10) counts
-- the key as held while the role runs the lists, so switching it beside edit
-- tells nobody. Managers lowered on lists before the key came are denied it
-- by the migration's backfill, base and named, with nothing logged. Fixed
-- ids (b3…), numbers (050-054-xxxx) and times (14 to 21 December 2026), so
-- nothing here meets the seed or another test, or the real clock.
begin;
select plan(37);

-- A: 1 owner, 2 manager, 3 and 4 workers in 'Senior worker' (a role A names
-- on workers; 3 in the kitchen, 4 in the bar), 5 a worker in the kitchen, 6 a
-- worker given lists.fix of their own (in no department), 7 a worker in the
-- kitchen in 'Kitchen hand' (a second role A names on workers), 8 the
-- accountant. B: 9, its owner. C, with notifications on: 10 its owner, 11 a
-- worker in 'Lead' (a role C names on workers), 12 a manager, 13 a manager
-- in 'Deputy' (a role C names on managers).
insert into auth.users (id, aud, role, phone)
select ('b3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250054' || lpad(n::text, 4, '0')
from generate_series(1, 13) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('b3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'b3000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'b3000000-0000-4000-b000-000000000002'::uuid
$$;
create function pg_temp.c() returns uuid language sql as $$
  select 'b3000000-0000-4000-b000-000000000003'::uuid
$$;
create function pg_temp.kitchen() returns uuid language sql as $$
  select 'b3000000-0000-4000-c000-000000000001'::uuid
$$;
create function pg_temp.bar() returns uuid language sql as $$
  select 'b3000000-0000-4000-c000-000000000002'::uuid
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'lists-fix-switch-a', 'Lists fix switch A'),
  (pg_temp.b(), 'lists-fix-switch-b', 'Lists fix switch B'),
  (pg_temp.c(), 'lists-fix-switch-c', 'Lists fix switch C');

insert into public.memberships (business_id, user_id, role, perms, active)
select pg_temp.a(), pg_temp.p(n),
  (case n when 1 then 'owner' when 2 then 'manager' when 8 then 'accountant' else 'worker' end)::public.member_role,
  case n when 6 then '{lists.fix}'::text[] else '{}'::text[] end,
  true
from generate_series(1, 8) as n;
insert into public.memberships (business_id, user_id, role, perms, active)
values
  (pg_temp.b(), pg_temp.p(9), 'owner', '{}', true),
  (pg_temp.c(), pg_temp.p(10), 'owner', '{}', true),
  (pg_temp.c(), pg_temp.p(11), 'worker', '{}', true),
  (pg_temp.c(), pg_temp.p(12), 'manager', '{}', true),
  (pg_temp.c(), pg_temp.p(13), 'manager', '{}', true);

-- Lists on, and in A and B nobody told (no notifications module): this is
-- about who fixes. C tells a role's people when it changes.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'lists', true, '{}'),
  (pg_temp.b(), 'lists', true, '{}'),
  (pg_temp.c(), 'lists', true, '{}'),
  (pg_temp.c(), 'notifications', true, '{}');

insert into public.departments (id, business_id, key, name)
values
  (pg_temp.kitchen(), pg_temp.a(), 'kitchen', 'Kitchen'),
  (pg_temp.bar(), pg_temp.a(), 'bar', 'Bar');
insert into public.department_members (department_id, business_id, user_id)
values
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(3)),
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(5)),
  (pg_temp.kitchen(), pg_temp.a(), pg_temp.p(7)),
  (pg_temp.bar(), pg_temp.a(), pg_temp.p(4));

create temporary table ids (name text primary key, id uuid) on commit drop;

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
-- A time as the tests write it (UTC, with its day), or '-'.
create function pg_temp.dhm(at_time timestamptz) returns text language sql as $$
  select coalesce(to_char(at_time at time zone 'UTC', 'DD HH24:MI'), '-')
$$;
-- A person by their number, or '-'.
create function pg_temp.who(person uuid) returns text language sql as $$
  select coalesce(right(person::text, 1), '-')
$$;
-- A list now: its status, who finished it and when, and its last fix.
create function pg_temp.list_now(list_name text) returns text language sql as $$
  select l.status || '|' || pg_temp.who(l.finished_by) || '|' || pg_temp.dhm(l.finished_at)
    || '|' || pg_temp.dhm(l.fixed_at)
  from public.lists l where l.id = pg_temp.id(list_name)
$$;
-- An item's fixes, oldest first: who, when and what changed.
create function pg_temp.fixes(list_name text, item_label text) returns text language sql as $$
  select coalesce(string_agg(
    pg_temp.who(c.changed_by) || '@' || pg_temp.dhm(c.changed_at) || ' ' || array_to_string(c.changed, '+'),
    ', ' order by c.changed_at, c.id), 'none')
  from public.list_item_changes c
  where c.item_id = pg_temp.item_of(list_name, item_label) and c.fixed
$$;
-- Who wrote the lists.fix rows of a saved list, oldest first.
create function pg_temp.fixers(list_name text) returns text language sql as $$
  select coalesce(string_agg(pg_temp.who(a.actor_id), ',' order by a.id), 'none')
  from public.audit_log a
  where a.action = 'lists.fix' and a.details ->> 'list' = pg_temp.id(list_name)::text
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
-- Person `n` fixes a saved list's check item (ticked, or not), a reading, or
-- the photo of its photo item, at `at_time`: how it went.
create function pg_temp.check_fix(n integer, list_name text, item_label text, checked boolean, at_time timestamptz)
returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.fix_list_item(%L::uuid, %L::uuid, %L::jsonb, %L::timestamptz)',
    pg_temp.p(n), pg_temp.item_of(list_name, item_label),
    jsonb_build_object('checked', checked), at_time))
$$;
create function pg_temp.reading_fix(n integer, list_name text, item_label text, reading numeric, at_time timestamptz)
returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.fix_list_item(%L::uuid, %L::uuid, %L::jsonb, %L::timestamptz)',
    pg_temp.p(n), pg_temp.item_of(list_name, item_label),
    jsonb_build_object('reading', reading), at_time))
$$;
create function pg_temp.photo_fix(n integer, list_name text, item_label text, file text, at_time timestamptz)
returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.fix_list_item_photo(%L::uuid, %L::uuid, %L, %L::timestamptz)',
    pg_temp.p(n), pg_temp.item_of(list_name, item_label),
    pg_temp.folder(list_name, file), at_time))
$$;
-- The owner sets a role's rule for lists.fix (a named one's by its saved
-- name), as the roles screen writes it.
create function pg_temp.switch(granted boolean, named text default null) returns void language sql as $$
  select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'lists.fix', granted,
    pg_temp.id(named))
$$;
-- A's lists setting fixHours as stored (or none), and the window it gives,
-- in hours.
create function pg_temp.window_for(stored jsonb) returns text language plpgsql as $$
begin
  update public.business_modules bm
  set settings = coalesce(stored, '{}'::jsonb)
  where bm.business_id = pg_temp.a() and bm.module_key = 'lists';
  return (extract(epoch from private.list_fix_hours(pg_temp.a())) / 3600)::integer::text;
end;
$$;

-- A's two named roles, from their bases (no rule of their own), and who
-- holds them.
insert into ids values
  ('senior', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Senior worker')),
  ('hand', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Kitchen hand'));
update public.memberships m set named_role = pg_temp.id('senior')
where m.business_id = pg_temp.a() and m.user_id in (pg_temp.p(3), pg_temp.p(4));
update public.memberships m set named_role = pg_temp.id('hand')
where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(7);

-- The manager sends, on 14 December at 05:00: the seniors' list (to the
-- named role: a reading, an optional check and an optional photo), which 3
-- fills and finishes at 06:00; the kitchen's, which 5 finishes at 06:30;
-- 6's own, which 6 finishes at 06:00; and the kitchen's order, which the
-- manager passes to the bar at 05:30 and 4 finishes there at 06:10.
insert into ids values ('seniors', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Seniors',
    'recipient', jsonb_build_object('kind', 'role', 'role', 'worker', 'namedRole', pg_temp.id('senior')),
    'items', '[{"kind": "number", "label": "Fridge", "unit": "C"},
      {"kind": "check", "label": "Spare", "required": false},
      {"kind": "photo", "label": "Shelf", "required": false}]'::jsonb),
  '2026-12-14 05:00+00'));
insert into ids values ('kitchen', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Kitchen',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "check", "label": "Clean"},
      {"kind": "check", "label": "Spare", "required": false}]'::jsonb),
  '2026-12-14 05:00+00'));
insert into ids values ('mine', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Mine',
    'recipient', jsonb_build_object('kind', 'person', 'user', pg_temp.p(6)),
    'items', '[{"kind": "check", "label": "Clean"},
      {"kind": "check", "label": "Spare", "required": false}]'::jsonb),
  '2026-12-14 05:00+00'));
insert into ids values ('passed', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Passed',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.kitchen()),
    'items', '[{"kind": "check", "label": "Lemons"},
      {"kind": "check", "label": "Spare", "required": false}]'::jsonb),
  '2026-12-14 05:00+00'));

select public.set_list_item(pg_temp.p(3), pg_temp.item_of('seniors', 'Fridge'),
  '{"reading": 4}', '2026-12-14 05:50+00');
select public.finish_list(pg_temp.p(3), pg_temp.id('seniors'), '2026-12-14 06:00+00');
select public.set_list_item(pg_temp.p(5), pg_temp.item_of('kitchen', 'Clean'),
  '{"checked": true}', '2026-12-14 06:20+00');
select public.finish_list(pg_temp.p(5), pg_temp.id('kitchen'), '2026-12-14 06:30+00');
select public.set_list_item(pg_temp.p(6), pg_temp.item_of('mine', 'Clean'),
  '{"checked": true}', '2026-12-14 05:55+00');
select public.finish_list(pg_temp.p(6), pg_temp.id('mine'), '2026-12-14 06:00+00');
select public.pass_list(pg_temp.p(2), pg_temp.id('passed'), pg_temp.bar(), null, '2026-12-14 05:30+00');
select public.set_list_item(pg_temp.p(4), pg_temp.item_of('passed', 'Lemons'),
  '{"checked": true}', '2026-12-14 06:05+00');
select public.finish_list(pg_temp.p(4), pg_temp.id('passed'), '2026-12-14 06:10+00');

------------------------------------------------------------------------------
-- The key, the setting and who may call what

select is(
  (select k.module_key::text || '|' || k.area || '|' || coalesce(k.requires, 'none') || '|'
     || k.settable::text || '|' || k.default_roles::text || '|' || k.by_owner::text
   from public.permission_keys k where k.key = 'lists.fix'),
  'lists|lists|none|true|{manager}|false',
  'lists.fix is the lists'' key, owners switch it per role from the start, managers hold it by default, and it requires nothing'
);
select is(
  (select string_agg(n::text || ':' || private.holds_perm(pg_temp.a(), pg_temp.p(n), 'lists.fix')::text,
     ' ' order by n)
   from generate_series(1, 8) as n),
  '1:true 2:true 3:false 4:false 5:false 6:true 7:false 8:false',
  'the owner, the manager and someone given it hold it at first; workers, the roles named on them and the accountant don''t'
);
select is(
  (private.list_settings(gen_random_uuid()) -> 'fixHours')::text
    || ' ' || private.list_fix_hours(gen_random_uuid())::text,
  '24 24:00:00',
  'a business that set nothing has a day'
);
select is(
  (select string_agg(pg_temp.window_for(s.stored), ',' order by s.n)
   from (values
     (1, '{"fixHours": 2}'::jsonb), (2, '{"fixHours": 12}'::jsonb),
     (3, '{"fixHours": 24}'::jsonb), (4, '{"fixHours": 72}'::jsonb),
     (5, '{"fixHours": 72.0}'::jsonb), (6, '{"fixHours": 48}'::jsonb),
     (7, '{"fixHours": "12"}'::jsonb), (8, '{"fixHours": 2.5}'::jsonb),
     (9, '{"fixHours": null}'::jsonb), (10, '{"lateAfterMinutes": 30}'::jsonb)
   ) as s (n, stored)),
  '2,12,24,72,72,24,24,24,24,24',
  'fixHours counts as 2, 12, 24 or 72 hours, as stored, and anything else as 24'
);
select pg_temp.window_for(null);
select ok(
  not has_function_privilege('authenticated', 'private.list_fix_hours(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.list_fix_hours(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.list_fix_hours(uuid)', 'execute')
  and not exists (
    select 1
    from unnest(array[
      'private.can_fix_list(public.lists, uuid, timestamptz)',
      'private.write_list_item(uuid, uuid, jsonb, timestamptz, boolean)',
      'private.write_list_item_photo(uuid, uuid, text, timestamptz, boolean)',
      'private.backfill_lists_fix_denials()'
    ]) as f (signature)
    where has_function_privilege('authenticated', f.signature, 'execute')
      or has_function_privilege('anon', f.signature, 'execute')
      or has_function_privilege('service_role', f.signature, 'execute')
  )
  and not has_function_privilege('authenticated', 'private.list_settings(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.list_settings(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.area_holds(jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.area_holds(jsonb)', 'execute')
  and (select count(*)::int from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'private'
         and p.proname in ('list_fix_hours', 'list_settings', 'can_fix_list', 'write_list_item',
           'write_list_item_photo', 'backfill_lists_fix_denials', 'area_holds')
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 7,
  'the window, the rules under a fix, the backfill and a role''s line about the lists run inside the database alone, as their owner with an empty search path'
);

------------------------------------------------------------------------------
-- A role the business named, given the switch

select is(
  pg_temp.reading_fix(4, 'seniors', 'Fridge', 6, '2026-12-14 07:00+00')
    || ' ' || private.can_fix_list(l, pg_temp.p(4), '2026-12-14 07:00+00')::text,
  '42501/- false',
  'before the switch, a senior who holds the list doesn''t fix it, and hears nothing of a window'
)
from public.lists l where l.id = pg_temp.id('seniors');

-- The owner turns it on for 'Senior worker', at view.
select pg_temp.switch(true, 'senior');
select is(
  (select string_agg(n::text || ':' || private.holds_perm(pg_temp.a(), pg_temp.p(n), 'lists.fix')::text,
     ' ' order by n)
   from unnest('{3,4,5,7}'::int[]) as n)
    || ' | ' || private.holds_perm(pg_temp.a(), pg_temp.p(4), 'lists.manage')::text,
  '3:true 4:true 5:false 7:false | false',
  'both seniors hold it now, and only they: workers and the other named role don''t, and nobody runs the lists for it'
);

-- 4, an hour after 3 closed the seniors' list, fixes its reading; 3 ticks
-- the spare check; 4 adds the shelf's photo.
select is(
  pg_temp.reading_fix(4, 'seniors', 'Fridge', 6, '2026-12-14 07:00+00')
    || ' ' || pg_temp.check_fix(3, 'seniors', 'Spare', true, '2026-12-14 08:00+00')
    || ' ' || pg_temp.photo_fix(4, 'seniors', 'Shelf', 'eeee1111.webp', '2026-12-14 09:00+00'),
  'none none none',
  'a senior fixes the list sent to the role after another closed it, and the one who closed it fixes it too, a photo included'
);
select is(
  pg_temp.list_now('seniors')
    || ' ; ' || pg_temp.fixes('seniors', 'Fridge')
    || ' ; ' || pg_temp.fixes('seniors', 'Spare')
    || ' ; ' || pg_temp.fixes('seniors', 'Shelf')
    || ' ; ' || pg_temp.fixers('seniors'),
  'finished|3|14 06:00|14 09:00 ; 4@14 07:00 reading ; 3@14 08:00 checked ; 4@14 09:00 photo ; 4,3,4',
  'the list stays closed by 3 at 06:00, each change is a fix under its fixer''s name, and the log has each'
);

-- The window: 24 hours from 06:00, to the minute.
select is(
  pg_temp.reading_fix(4, 'seniors', 'Fridge', 5, '2026-12-15 06:00+00')
    || ' ' || pg_temp.reading_fix(4, 'seniors', 'Fridge', 4, '2026-12-15 06:01+00')
    || ' ' || pg_temp.check_fix(3, 'seniors', 'Spare', false, '2026-12-15 06:01+00')
    || ' ' || pg_temp.photo_fix(4, 'seniors', 'Shelf', 'eeee2222.webp', '2026-12-15 06:01+00'),
  'none 42501/fix_window 42501/fix_window 42501/fix_window',
  'a day after it closed a senior still fixes it, and a minute later hears the time to fix it is over, a photo too'
);
select is(
  pg_temp.fixes('seniors', 'Fridge') || ' ; ' || pg_temp.list_now('seniors'),
  '4@14 07:00 reading, 4@15 06:00 reading ; finished|3|14 06:00|15 06:00',
  'and what was refused changed nothing'
);

-- The owner shortens it to two hours, then gives three days.
select pg_temp.window_for('{"fixHours": 2}');
select is(
  pg_temp.check_fix(6, 'mine', 'Spare', true, '2026-12-14 08:00+00')
    || ' ' || pg_temp.check_fix(6, 'mine', 'Spare', false, '2026-12-14 08:01+00'),
  'none 42501/fix_window',
  'with fixHours 2, two hours after it closed and not a minute more'
);
select pg_temp.window_for('{"fixHours": 72}');
select is(
  pg_temp.check_fix(6, 'mine', 'Spare', false, '2026-12-17 06:00+00')
    || ' ' || pg_temp.check_fix(6, 'mine', 'Spare', true, '2026-12-17 06:01+00'),
  'none 42501/fix_window',
  'with fixHours 72, three days'
);
select pg_temp.window_for(null);

------------------------------------------------------------------------------
-- Only a list that reaches them now

select is(
  pg_temp.check_fix(4, 'kitchen', 'Spare', true, '2026-12-14 07:00+00')
    || ' ' || pg_temp.check_fix(3, 'mine', 'Spare', true, '2026-12-14 07:00+00')
    || ' ' || pg_temp.check_fix(4, 'kitchen', 'Spare', true, '2026-12-16 07:00+00'),
  '42501/- 42501/- 42501/-',
  'a senior doesn''t fix the kitchen''s list from the bar, nor someone else''s, and past the window still hears nothing of one it doesn''t hold'
);
select is(
  pg_temp.check_fix(3, 'kitchen', 'Spare', true, '2026-12-14 07:00+00')
    || ' ' || pg_temp.check_fix(3, 'passed', 'Spare', true, '2026-12-14 07:00+00')
    || ' ' || pg_temp.check_fix(4, 'passed', 'Spare', true, '2026-12-14 07:05+00'),
  'none 42501/- none',
  'the kitchen''s senior fixes the kitchen''s list, but not the order passed to the bar since: the bar''s senior does'
);

------------------------------------------------------------------------------
-- A grant of one's own, a base role's, and a named role's own rule

select is(
  pg_temp.check_fix(6, 'mine', 'Spare', true, '2026-12-14 07:00+00')
    || ' ' || pg_temp.check_fix(6, 'mine', 'Spare', false, '2026-12-15 06:01+00'),
  'none 42501/fix_window',
  'someone given lists.fix of their own fixes their list within the window, and hears when it is over'
);
select is(pg_temp.fixers('mine'), '6,6,6', 'and the log has each of their fixes');

-- The owner turns it on for workers: the kitchen hand's role, with no rule of
-- its own, follows them.
select pg_temp.switch(true);
select is(
  pg_temp.check_fix(5, 'kitchen', 'Spare', false, '2026-12-14 08:00+00')
    || ' ' || pg_temp.check_fix(7, 'kitchen', 'Spare', true, '2026-12-14 08:10+00')
    || ' | ' || (select count(*)::text from public.role_permissions rp
                 where rp.named_role = pg_temp.id('hand')),
  'none none | 0',
  'a worker fixes once workers have it, and so does a named role on them with no rule of its own'
);

-- Then off for 'Kitchen hand' alone.
select pg_temp.switch(false, 'hand');
select is(
  pg_temp.check_fix(7, 'kitchen', 'Spare', false, '2026-12-14 08:20+00')
    || ' ' || pg_temp.check_fix(5, 'kitchen', 'Spare', false, '2026-12-14 08:20+00'),
  '42501/- none',
  'a named role''s own rule decides over its base''s'
);
select is(pg_temp.fixers('kitchen'), '3,5,7,5', 'and the log has the fixes that went through, by whom');

-- Then off for workers, and off for 'Senior worker'.
select pg_temp.switch(false);
select pg_temp.switch(false, 'senior');
select is(
  pg_temp.check_fix(5, 'kitchen', 'Spare', false, '2026-12-14 08:30+00')
    || ' ' || pg_temp.check_fix(3, 'kitchen', 'Spare', false, '2026-12-14 08:30+00')
    || ' ' || pg_temp.check_fix(4, 'seniors', 'Spare', false, '2026-12-14 08:30+00')
    || ' | ' || (select count(*)::text from public.role_permissions rp
                 where rp.business_id = pg_temp.a() and rp.perm = 'lists.fix' and rp.allowed),
  '42501/- 42501/- 42501/- | 0',
  'switched off, nobody in those roles fixes, within the window or not, and no row gives it'
);

------------------------------------------------------------------------------
-- Those who run the lists, and reopening

select is(
  pg_temp.reading_fix(2, 'seniors', 'Fridge', 3, '2026-12-21 09:00+00')
    || ' ' || pg_temp.check_fix(1, 'kitchen', 'Spare', true, '2026-12-21 09:00+00'),
  'none none',
  'those who run the lists still fix at any time, a week later'
);
select is(
  pg_temp.list_now('seniors'),
  'finished|3|14 06:00|21 09:00',
  'and the list stays closed, by whoever closed it, with the fix''s time'
);

select pg_temp.switch(true, 'senior');
select is(
  pg_temp.refusal($$select public.reopen_list(pg_temp.p(4), pg_temp.id('seniors'), '2026-12-14 07:00+00')$$)
    || ' ' || pg_temp.refusal($$select public.reopen_list(pg_temp.p(3), pg_temp.id('seniors'), '2026-12-14 07:00+00')$$)
    || ' ' || pg_temp.refusal($$select public.reopen_list(pg_temp.p(6), pg_temp.id('mine'), '2026-12-14 07:00+00')$$)
    || ' ' || pg_temp.list_now('seniors'),
  '42501/- 42501/- 42501/- finished|3|14 06:00|21 09:00',
  'lists.fix never opens a list again: not for a senior, not for the one who closed it after 5 minutes, not for a grant of one''s own'
);

------------------------------------------------------------------------------
-- What doesn't move

select is(
  pg_temp.refusal($$select public.fix_list_item(pg_temp.p(9), pg_temp.item_of('seniors', 'Fridge'),
      '{"reading": 2}', '2026-12-14 07:00+00')$$)
    || ' ' || pg_temp.refusal($$select public.fix_list_item(pg_temp.p(8), pg_temp.item_of('seniors', 'Fridge'),
      '{"reading": 2}', '2026-12-14 07:00+00')$$),
  'P0002/- 42501/-',
  'another business''s owner knows nothing of the list, and the accountant fixes nothing'
);
select is(
  pg_temp.refusal($$select public.set_list_item(pg_temp.p(4), pg_temp.item_of('seniors', 'Spare'),
      '{"checked": false}', '2026-12-14 07:00+00')$$),
  '55000/-',
  'and filling a closed list is still refused: only a fix changes it'
);

-- The open-list side: a list sent to the seniors and still open is filled,
-- not fixed, by whoever holds the switch.
insert into ids values ('open', public.send_list(pg_temp.p(2), pg_temp.a(),
  jsonb_build_object(
    'name', 'Open',
    'recipient', jsonb_build_object('kind', 'role', 'role', 'worker', 'namedRole', pg_temp.id('senior')),
    'items', '[{"kind": "check", "label": "Spare", "required": false}]'::jsonb),
  '2026-12-14 05:00+00'));
select is(
  pg_temp.check_fix(4, 'open', 'Spare', true, '2026-12-14 07:00+00'),
  '55000/-',
  'an open list is filled, not fixed, by someone given lists.fix too'
);

------------------------------------------------------------------------------
-- A role's line, beside edit

-- C's two named roles, from their bases, and who holds them.
insert into ids values
  ('lead', public.create_business_role(pg_temp.p(10), pg_temp.c(), 'worker', 'Lead')),
  ('deputy', public.create_business_role(pg_temp.p(10), pg_temp.c(), 'manager', 'Deputy'));
update public.memberships m set named_role = pg_temp.id('lead')
where m.business_id = pg_temp.c() and m.user_id = pg_temp.p(11);
update public.memberships m set named_role = pg_temp.id('deputy')
where m.business_id = pg_temp.c() and m.user_id = pg_temp.p(13);

select is(
  private.area_holds('{"lists.fix": false, "lists.manage": true, "lists.send": false}'::jsonb)::text
    || ' ' || private.area_holds('{"lists.fix": false, "lists.manage": false, "lists.send": true}'::jsonb)::text
    || ' ' || private.area_holds('{"lists.fix": true, "lists.manage": false, "lists.send": false}'::jsonb)::text,
  '{"lists.fix": true, "lists.send": false, "lists.manage": true} '
    || '{"lists.fix": false, "lists.send": false, "lists.manage": false} '
    || '{"lists.fix": true, "lists.send": false, "lists.manage": false}',
  'a role''s line counts fixing closed lists as held while the role runs them, and otherwise by its own rule'
);

-- C's owner gives workers lists.fix at view, then lets 'Lead' run the lists
-- (as the roles screen writes a raise: no lists.fix row, since it follows
-- workers there), and 11 reads the line about it. Then workers' switch off.
select public.set_role_permission(pg_temp.p(10), pg_temp.c(), 'worker', 'lists.fix', true);
select public.set_role_permissions(pg_temp.p(10), pg_temp.c(), 'worker',
  '{lists.manage,lists.send}'::text[], '{true,true}'::boolean[], pg_temp.id('lead'));
update public.notifications n set read_at = now()
where n.user_id = pg_temp.p(11) and n.kind = 'role.changed';
select public.set_role_permission(pg_temp.p(10), pg_temp.c(), 'worker', 'lists.fix', false);
select is(
  (select count(*)::int from public.notifications n
   where n.user_id = pg_temp.p(11) and n.kind = 'role.changed' and n.read_at is null),
  0,
  'the switch turned for the base of a named role that runs the lists tells its people nothing: their role holds it as before'
);

------------------------------------------------------------------------------
-- Managers lowered on lists before the key came

-- C's owner sends a list to the manager and one to the deputy, and each
-- closes theirs. 'Deputy' was lowered on lists in an earlier release: a
-- lists.manage denial of its own, and no rule for lists.fix (straight into
-- the rules, as the app wrote them then).
insert into ids values ('manager list', public.send_list(pg_temp.p(10), pg_temp.c(),
  jsonb_build_object(
    'name', 'Manager list',
    'recipient', jsonb_build_object('kind', 'person', 'user', pg_temp.p(12)),
    'items', '[{"kind": "check", "label": "Spare", "required": false}]'::jsonb),
  '2026-12-14 05:00+00'));
insert into ids values ('deputy list', public.send_list(pg_temp.p(10), pg_temp.c(),
  jsonb_build_object(
    'name', 'Deputy list',
    'recipient', jsonb_build_object('kind', 'person', 'user', pg_temp.p(13)),
    'items', '[{"kind": "check", "label": "Spare", "required": false}]'::jsonb),
  '2026-12-14 05:00+00'));
select public.finish_list(pg_temp.p(12), pg_temp.id('manager list'), '2026-12-14 06:00+00');
select public.finish_list(pg_temp.p(13), pg_temp.id('deputy list'), '2026-12-14 06:00+00');
insert into public.role_permissions (business_id, role, named_role, perm, allowed, granted_by)
values (pg_temp.c(), 'manager', pg_temp.id('deputy'), 'lists.manage', false, pg_temp.p(10));

select is(
  private.holds_perm(pg_temp.c(), pg_temp.p(13), 'lists.fix')::text,
  'true',
  'without the backfill, a role named on managers and lowered on lists would hold lists.fix by the key''s default'
);
select is(private.backfill_lists_fix_denials(), 1, 'the backfill denies it to that role');
select is(
  private.holds_perm(pg_temp.c(), pg_temp.p(13), 'lists.fix')::text
    || ' ' || private.holds_perm(pg_temp.c(), pg_temp.p(12), 'lists.fix')::text
    || ' ' || pg_temp.check_fix(13, 'deputy list', 'Spare', true, '2026-12-14 07:00+00'),
  'false true 42501/-',
  'so the deputy doesn''t fix the list they hold, and managers, not lowered, still hold the key'
);

-- Then managers themselves, lowered on lists in an earlier release.
insert into public.role_permissions (business_id, role, named_role, perm, allowed, granted_by)
values (pg_temp.c(), 'manager', null, 'lists.manage', false, pg_temp.p(10));
select is(
  private.holds_perm(pg_temp.c(), pg_temp.p(12), 'lists.fix')::text,
  'true',
  'without the backfill, managers lowered on lists would hold lists.fix by the key''s default'
);
select is(
  private.backfill_lists_fix_denials(),
  1,
  'the backfill denies it to managers, and adds nothing for the deputy, who has their own'
);
select is(
  private.holds_perm(pg_temp.c(), pg_temp.p(12), 'lists.fix')::text
    || ' ' || private.holds_perm(pg_temp.c(), pg_temp.p(13), 'lists.fix')::text
    || ' ' || pg_temp.check_fix(12, 'manager list', 'Spare', true, '2026-12-14 07:00+00'),
  'false false 42501/-',
  'so a manager doesn''t fix the list they hold either'
);
select is(
  (select string_agg(rp.role::text || ':' || coalesce(br.name, '-') || ':' || rp.allowed::text,
     ',' order by br.name nulls first)
   from public.role_permissions rp
   left join public.business_roles br on br.id = rp.named_role
   where rp.business_id = pg_temp.c() and rp.perm = 'lists.fix')
    || ' | ' || private.role_holds(pg_temp.c(), 'manager', 'lists.fix')::text
    || ' ' || private.role_holds(pg_temp.c(), 'manager', 'lists.fix', pg_temp.id('deputy'))::text
    || ' | ' || (select count(*)::text from public.audit_log a
                 where a.business_id = pg_temp.c() and a.action = 'role.permission'
                   and a.details ->> 'role' = 'manager')
    || ' ' || (select count(*)::text from public.notifications n
               where n.business_id = pg_temp.c() and n.kind = 'role.changed'
                 and n.user_id in (pg_temp.p(12), pg_temp.p(13))),
  'manager:-:false,manager:Deputy:false | false false | 0 0',
  'each is a denial of the role''s own, the roles screen draws it off, and nothing went to the log or to anyone'
);
select is(private.backfill_lists_fix_denials(), 0, 'and nothing twice');

select * from finish();
rollback;
