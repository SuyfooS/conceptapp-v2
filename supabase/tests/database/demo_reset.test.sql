-- Demo businesses: the reset puts one back the way it starts (details,
-- template, people and their departments, nothing else left), a demo business
-- that renews has this week's schedule published from its own shifts, and only
-- the server can do either.
begin;
select plan(27);

insert into auth.users (id, aud, role, phone)
values
  ('6d000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000971'),
  ('6d000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000972'),
  ('6d000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000973'),
  ('6d000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000974');

-- a: owner; b: manager; c, d: workers. The last person has no account, so
-- the reset leaves them out.
insert into private.demo_businesses (business_id, definition)
values ('6d000000-0000-4000-b000-000000000001', $json$
  {
    "slug": "demo-reset-x", "name": "Demo shop X", "accent": "#7c3aed",
    "address": "Demo street 2", "shabbat_city": "haifa",
    "template": "retail", "renews": true,
    "people": [
      { "user_id": "6d000000-0000-4000-a000-00000000000a", "role": "owner", "name": "Owner A" },
      { "user_id": "6d000000-0000-4000-a000-00000000000b", "role": "manager", "name": "Manager B", "departments": ["floor"] },
      { "user_id": "6d000000-0000-4000-a000-00000000000c", "role": "worker", "name": "Worker C", "departments": ["checkout", "stock", "checkout"] },
      { "user_id": "6d000000-0000-4000-a000-00000000000d", "role": "worker", "name": "Worker D", "departments": ["bakery"] },
      { "user_id": "6d000000-0000-4000-a000-0000000000ff", "role": "worker", "name": "Nobody", "departments": ["floor"] }
    ]
  }
  $json$);

-- Server only.
select ok(
  not has_function_privilege('authenticated', 'public.reset_demo_business(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.reset_demo_business(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.reset_demo_businesses()', 'execute')
  and not has_function_privilege('anon', 'public.reset_demo_businesses()', 'execute')
  and not has_function_privilege('authenticated', 'public.renew_demo_schedules()', 'execute')
  and not has_function_privilege('anon', 'public.renew_demo_schedules()', 'execute')
  and not has_function_privilege('authenticated', 'private.renew_demo_schedule(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.renew_demo_schedule(uuid)', 'execute'),
  'browser roles may not reset or renew'
);
select ok(
  has_function_privilege('service_role', 'public.reset_demo_business(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.reset_demo_businesses()', 'execute')
  and has_function_privilege('service_role', 'public.renew_demo_schedules()', 'execute'),
  'the server may'
);
select ok(
  not has_table_privilege('authenticated', 'private.demo_businesses', 'select, insert, update, delete')
  and not has_table_privilege('anon', 'private.demo_businesses', 'select, insert, update, delete'),
  'browser roles cannot touch how the demo businesses start'
);
set local role authenticated;
select throws_ok(
  $$select public.reset_demo_business('6d000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'a signed-in user cannot reset a demo business'
);
reset role;

-- The first reset makes the business.
set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('6d000000-0000-4000-b000-000000000001')$$,
  'the server makes a demo business from how it starts'
);
reset role;

select results_eq(
  $$select slug, name, accent, address, shabbat_city, template_key
    from public.businesses where id = '6d000000-0000-4000-b000-000000000001'$$,
  $$values ('demo-reset-x'::text, 'Demo shop X'::text, '#7c3aed'::text,
    'Demo street 2'::text, 'haifa'::text, 'retail'::text)$$,
  'with its details and its template'
);
select results_eq(
  $$select user_id, role::text from public.memberships
    where business_id = '6d000000-0000-4000-b000-000000000001' and active
    order by user_id$$,
  $$values
    ('6d000000-0000-4000-a000-00000000000a'::uuid, 'owner'::text),
    ('6d000000-0000-4000-a000-00000000000b'::uuid, 'manager'::text),
    ('6d000000-0000-4000-a000-00000000000c'::uuid, 'worker'::text),
    ('6d000000-0000-4000-a000-00000000000d'::uuid, 'worker'::text)$$,
  'and its people, leaving out one with no account'
);
select is(
  (select full_name from public.profiles where id = '6d000000-0000-4000-a000-00000000000a'),
  'Owner A',
  'with their names'
);
select results_eq(
  $$select dm.user_id, d.key from public.department_members dm
    join public.departments d on d.id = dm.department_id
    where dm.business_id = '6d000000-0000-4000-b000-000000000001'
    order by dm.user_id, d.key$$,
  $$values
    ('6d000000-0000-4000-a000-00000000000b'::uuid, 'floor'::text),
    ('6d000000-0000-4000-a000-00000000000c'::uuid, 'checkout'::text),
    ('6d000000-0000-4000-a000-00000000000c'::uuid, 'stock'::text)$$,
  'and their departments, each once, skipping a key the template doesn''t have and someone with no account'
);

-- It renews: this week is published from the shop's own shifts.
select is(
  (select count(*)::integer from public.schedule_weeks w
   where w.business_id = '6d000000-0000-4000-b000-000000000001'
     and w.schedule_published_at is not null
     and (now() at time zone 'Asia/Jerusalem')::date between w.starts_on and w.starts_on + 6),
  1,
  'this week is published'
);
select is(
  (select count(*)::integer from public.schedule_shifts
   where business_id = '6d000000-0000-4000-b000-000000000001'),
  11,
  'with every shift of the shop''s week'
);
select is(
  (select count(*)::integer from public.shift_assignments
   where business_id = '6d000000-0000-4000-b000-000000000001'
     and user_id = '6d000000-0000-4000-a000-00000000000a'),
  0,
  'the owner fills no shift'
);
select is(
  (select count(*)::integer from (
     select a.user_id, s.day
     from public.shift_assignments a
     join public.schedule_shifts s on s.id = a.shift_id
     where a.business_id = '6d000000-0000-4000-b000-000000000001'
     group by a.user_id, s.day
     having count(*) > 1) twice),
  0,
  'nobody works twice a day'
);
-- Three people: three of the four places each weekday, all three on Friday.
select is(
  (select count(*)::integer from public.shift_assignments
   where business_id = '6d000000-0000-4000-b000-000000000001'),
  18,
  'and the shifts are filled as far as the people go'
);
select is(
  private.renew_demo_schedule('6d000000-0000-4000-b000-000000000001'),
  false,
  'a week already published is left alone'
);

-- A visitor changes things; the reset puts them back.
update public.businesses set name = 'Changed'
where id = '6d000000-0000-4000-b000-000000000001';
update public.business_modules set settings = '{}'
where business_id = '6d000000-0000-4000-b000-000000000001' and module_key = 'scheduling';
insert into public.invites (business_id, phone, role, token_hash)
values ('6d000000-0000-4000-b000-000000000001', '+972500000979', 'worker', 'demo-reset-test');
delete from public.memberships
where business_id = '6d000000-0000-4000-b000-000000000001'
  and user_id = '6d000000-0000-4000-a000-00000000000c';
update public.profiles set full_name = 'Someone else', locale = 'en'
where id = '6d000000-0000-4000-a000-00000000000a';
insert into public.departments (business_id, key, name)
values ('6d000000-0000-4000-b000-000000000001', 'visitors', 'Visitors');
delete from public.department_members
where business_id = '6d000000-0000-4000-b000-000000000001';
insert into public.lists (business_id, name, origin, recipient_kind, recipient_role, opens_at)
values ('6d000000-0000-4000-b000-000000000001', 'A visitor''s list', 'sent', 'role', 'worker', now());

set local role service_role;
select public.reset_demo_business('6d000000-0000-4000-b000-000000000001');
reset role;

-- The links to departments are checked at commit, which a test never reaches:
-- run them now, then put them back for the resets below.
select lives_ok(
  $$set constraints all immediate$$,
  'the reset leaves nothing naming a department that went'
);
set constraints all deferred;

select is(
  (select name from public.businesses where id = '6d000000-0000-4000-b000-000000000001'),
  'Demo shop X',
  'the reset puts the name back'
);
select is(
  (select jsonb_array_length(settings -> 'shifts') from public.business_modules
   where business_id = '6d000000-0000-4000-b000-000000000001' and module_key = 'scheduling'),
  3,
  'and the settings, from the template'
);
select is(
  (select count(*)::integer from public.invites
   where business_id = '6d000000-0000-4000-b000-000000000001'),
  0,
  'leaves no invite behind'
);
select is(
  (select count(*)::integer from public.memberships
   where business_id = '6d000000-0000-4000-b000-000000000001'),
  4,
  'brings its people back'
);
select is(
  (select full_name || '/' || locale from public.profiles
   where id = '6d000000-0000-4000-a000-00000000000a'),
  'Owner A/he',
  'with their names and language'
);
select is(
  (select string_agg(action, ',') from public.audit_log
   where business_id = '6d000000-0000-4000-b000-000000000001'),
  'schedule.publish',
  'and starts its log again, with this week published'
);
select is(
  (select string_agg(key, ',' order by position) from public.departments
   where business_id = '6d000000-0000-4000-b000-000000000001')
  || '/' || (select count(*)::integer from public.lists
   where business_id = '6d000000-0000-4000-b000-000000000001')
  || '/' || (select count(*)::integer from public.department_members
   where business_id = '6d000000-0000-4000-b000-000000000001'),
  'checkout,floor,stock/0/3',
  'the visitors'' departments and lists go, and the demo people are back in theirs'
);
select is(
  (select enabled from public.business_modules
   where business_id = '6d000000-0000-4000-b000-000000000001' and module_key = 'lists'),
  false,
  'with lists still off, as their template has them'
);

select throws_ok(
  $$select public.reset_demo_business('6d000000-0000-4000-b000-0000000000ff')$$,
  'P0002', null, 'a business that is not a demo is refused'
);

-- The door's reset skips one reset a few seconds ago, and resets it after.
update public.businesses set name = 'Changed again'
where id = '6d000000-0000-4000-b000-000000000001';
select public.reset_demo_businesses();
select is(
  (select name from public.businesses where id = '6d000000-0000-4000-b000-000000000001'),
  'Changed again',
  'a second press seconds later changes nothing'
);
update private.demo_businesses set reset_at = now() - interval '1 minute'
where business_id = '6d000000-0000-4000-b000-000000000001';
select public.reset_demo_businesses();
select is(
  (select name from public.businesses where id = '6d000000-0000-4000-b000-000000000001'),
  'Demo shop X',
  'a later one resets it'
);

select * from finish();
rollback;
