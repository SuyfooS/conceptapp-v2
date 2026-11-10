-- One login in several businesses (20261110000900_several_businesses.sql):
-- one active place on a staff per login, any number as an accountant; a link
-- never puts someone on a second staff, and says so in words; the phone gets
-- the lines of every business the person is in, never a demo's; and a demo
-- reset keeps an accountant of two demo businesses in both. Fixed ids of its
-- own and explicit times, so nothing here meets the seeded people.
begin;
select plan(25);
-- Times read back as text, in UTC.
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('79000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500003401'),
  ('79000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500003402'),
  ('79000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500003403'),
  ('79000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500003404'),
  ('79000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500003405'),
  ('79000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500003406'),
  ('79000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500003407'),
  ('79000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500003408');

-- A, B and C are real businesses, D a demo. a owns A and w works there; o
-- owns B; x keeps the books of A, B and D; y keeps A's books.
insert into public.businesses (id, slug, name)
values
  ('79000000-0000-4000-b000-000000000001', 'sb-a', 'Several A'),
  ('79000000-0000-4000-b000-000000000002', 'sb-b', 'Several B'),
  ('79000000-0000-4000-b000-000000000003', 'sb-d', 'Several D'),
  ('79000000-0000-4000-b000-000000000004', 'sb-c', 'Several C');

insert into private.demo_businesses (business_id, definition)
values ('79000000-0000-4000-b000-000000000003', '{"slug": "sb-d"}');

insert into public.memberships (business_id, user_id, role)
values
  ('79000000-0000-4000-b000-000000000001', '79000000-0000-4000-a000-000000000001', 'owner'),
  ('79000000-0000-4000-b000-000000000001', '79000000-0000-4000-a000-000000000002', 'worker'),
  ('79000000-0000-4000-b000-000000000002', '79000000-0000-4000-a000-000000000004', 'owner'),
  ('79000000-0000-4000-b000-000000000001', '79000000-0000-4000-a000-000000000006', 'accountant');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('79000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('79000000-0000-4000-b000-000000000002', 'notifications', true, '{}'),
  ('79000000-0000-4000-b000-000000000003', 'notifications', true, '{}'),
  ('79000000-0000-4000-b000-000000000004', 'notifications', true, '{}');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to service_role;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- A line for `person` in business `b`, written as the producers write them.
create function pg_temp.line(b uuid, person uuid, thing text, at_time timestamptz)
returns uuid language sql as $$
  select private.notify(b, array[person], 'team.joined', '{}'::jsonb,
    actor => null, dedupe => thing, at_time => at_time);
  select n.id from public.notifications n
  where n.business_id = b and n.user_id = person and n.dedupe_key = thing
$$;

create function pg_temp.state(thing text) returns text language sql as $$
  select n.push_state from public.notifications n where n.id = pg_temp.id(thing)
$$;

------------------------------------------------------------------------------
-- One place on a staff per login

select has_index(
  'public', 'memberships', 'memberships_one_staff_idx',
  'one place on a staff per login has its index'
);
select throws_ok(
  $$insert into public.memberships (business_id, user_id, role)
    values ('79000000-0000-4000-b000-000000000002', '79000000-0000-4000-a000-000000000002', 'worker')$$,
  '23505', null,
  'a worker of one business cannot be on a second staff'
);
select throws_ok(
  $$insert into public.memberships (business_id, user_id, role)
    values ('79000000-0000-4000-b000-000000000002', '79000000-0000-4000-a000-000000000001', 'owner')$$,
  '23505', null,
  'nor can an owner own a second business'
);
select lives_ok(
  $$insert into public.memberships (business_id, user_id, role, active)
    values ('79000000-0000-4000-b000-000000000004', '79000000-0000-4000-a000-000000000002', 'worker', false)$$,
  'a staff place they left in another business stays on record'
);
select throws_ok(
  $$update public.memberships set active = true
    where business_id = '79000000-0000-4000-b000-000000000004'
      and user_id = '79000000-0000-4000-a000-000000000002'$$,
  '23505', null,
  'but taking it up again while on another staff fails'
);
select lives_ok(
  $$update public.memberships set active = true, role = 'accountant'
    where business_id = '79000000-0000-4000-b000-000000000004'
      and user_id = '79000000-0000-4000-a000-000000000002'$$,
  'coming back to it as its accountant is fine'
);
select lives_ok(
  $$insert into public.memberships (business_id, user_id, role)
    values
      ('79000000-0000-4000-b000-000000000001', '79000000-0000-4000-a000-000000000003', 'accountant'),
      ('79000000-0000-4000-b000-000000000002', '79000000-0000-4000-a000-000000000003', 'accountant'),
      ('79000000-0000-4000-b000-000000000003', '79000000-0000-4000-a000-000000000003', 'accountant')$$,
  'an accountant may keep the books of several businesses, a demo among them'
);

------------------------------------------------------------------------------
-- Joining from a link

insert into public.invites (business_id, phone, role, token_hash)
values
  ('79000000-0000-4000-b000-000000000002', '+972500003402', 'worker', repeat('1', 64)),
  ('79000000-0000-4000-b000-000000000004', '+972500003406', 'worker', repeat('3', 64));
select throws_ok(
  $$select public.claim_invite(repeat('1', 64), '79000000-0000-4000-a000-000000000002')$$,
  '23505', 'Already in another business''s team',
  'a link never puts a worker of one business on another''s staff, and says why'
);
select is(
  (select count(*)::integer from public.memberships m
   where m.business_id = '79000000-0000-4000-b000-000000000002'
     and m.user_id = '79000000-0000-4000-a000-000000000002')
  + (select count(*)::integer from public.invites i
     where i.token_hash = repeat('1', 64) and i.claimed_at is not null),
  0,
  'and nothing of it is written'
);

-- The same number, invited to keep B's books instead.
update public.invites set role = 'accountant', token_hash = repeat('2', 64)
where token_hash = repeat('1', 64);
select is(
  public.claim_invite(repeat('2', 64), '79000000-0000-4000-a000-000000000002'),
  '79000000-0000-4000-b000-000000000002'::uuid,
  'as an accountant they join'
);
select results_eq(
  $$select m.business_id::text, m.role::text, m.active
    from public.memberships m
    where m.user_id = '79000000-0000-4000-a000-000000000002'
    order by m.business_id$$,
  $$values
    ('79000000-0000-4000-b000-000000000001'::text, 'worker'::text, true),
    ('79000000-0000-4000-b000-000000000002'::text, 'accountant'::text, true),
    ('79000000-0000-4000-b000-000000000004'::text, 'accountant'::text, true)$$,
  'keeping their place on the staff they had'
);
select is(
  public.claim_invite(repeat('3', 64), '79000000-0000-4000-a000-000000000006'),
  '79000000-0000-4000-b000-000000000004'::uuid,
  'someone who keeps books elsewhere joins a staff from a link'
);

------------------------------------------------------------------------------
-- The phone: every business but a demo

set local role service_role;
insert into ids values ('x-phone', public.save_push_subscription(
  '79000000-0000-4000-a000-000000000003', 'https://fcm.googleapis.com/fcm/send/sb-x',
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ', 'android', '2026-11-20 08:00+00'));
reset role;

insert into ids values
  ('l-a', pg_temp.line('79000000-0000-4000-b000-000000000001',
    '79000000-0000-4000-a000-000000000003', 'sb:l-a', '2026-11-20 09:00+00')),
  ('l-b', pg_temp.line('79000000-0000-4000-b000-000000000002',
    '79000000-0000-4000-a000-000000000003', 'sb:l-b', '2026-11-20 09:00+00')),
  ('l-d', pg_temp.line('79000000-0000-4000-b000-000000000003',
    '79000000-0000-4000-a000-000000000003', 'sb:l-d', '2026-11-20 09:00+00'));
select is(
  pg_temp.state('l-a') || ',' || pg_temp.state('l-b') || ',' || pg_temp.state('l-d'),
  'queued,queued,none',
  'an accountant''s lines reach the phone from each real business, never from a demo'
);

set local role service_role;
select is(
  (select string_agg(f.business::text || '@' || f.since::text, ',' order by f.business)
   from public.note_push_fetch('79000000-0000-4000-a000-000000000003', null,
     '2026-11-20 09:30+00') f),
  '79000000-0000-4000-b000-000000000001@2026-11-20 08:30:00+00,'
    || '79000000-0000-4000-b000-000000000002@2026-11-20 08:30:00+00',
  'a phone asking what to show hears of both real businesses, not the demo'
);
select is(
  (select count(*)::integer || '/' || count(distinct f.since)::integer || '/' || min(f.since)::text
   from public.note_push_fetch('79000000-0000-4000-a000-000000000003',
     'https://fcm.googleapis.com/fcm/send/sb-x', '2026-11-20 09:31+00') f),
  '2/1/2026-11-20 08:00:00+00',
  'each with the same moment, the device''s'
);
select is(
  (select string_agg(c.notification::text, ',' order by c.notification)
   from public.claim_due_pushes(200, '2026-11-20 09:00:10+00') c
   where c.device = pg_temp.id('x-phone')),
  (select string_agg(x::text, ',' order by x)
   from unnest(array[pg_temp.id('l-a'), pg_temp.id('l-b')]) x),
  'and both lines go to it'
);
reset role;

-- A test line goes to the business the person is in now, when it reaches the
-- phone; else to the first one that does.
set local role service_role;
select is(
  public.send_test_push('79000000-0000-4000-a000-000000000003', '2026-11-20 10:00+00',
    '79000000-0000-4000-b000-000000000002'),
  true,
  'a test from the second business is written'
);
select is(
  public.send_test_push('79000000-0000-4000-a000-000000000003', '2026-11-20 10:01+00',
    '79000000-0000-4000-b000-000000000003'),
  true,
  'and one from the demo too'
);
reset role;
select is(
  (select string_agg(n.business_id::text, ',' order by n.business_id)
   from public.notifications n
   where n.user_id = '79000000-0000-4000-a000-000000000003' and n.kind = 'push.test'),
  '79000000-0000-4000-b000-000000000001,79000000-0000-4000-b000-000000000002',
  'in the second business, and for the demo in the first that reaches a phone'
);

-- Leaving a business stops its lines on the way to the phone.
insert into ids values
  ('l-b2', pg_temp.line('79000000-0000-4000-b000-000000000002',
    '79000000-0000-4000-a000-000000000003', 'sb:l-b2', '2026-11-20 11:00+00'));
update public.memberships set active = false
where business_id = '79000000-0000-4000-b000-000000000002'
  and user_id = '79000000-0000-4000-a000-000000000003';
set local role service_role;
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2026-11-20 11:00:10+00') c
   where c.notification = pg_temp.id('l-b2')),
  0,
  'a line from a business they left goes to no phone'
);
reset role;
select is(pg_temp.state('l-b2'), 'skipped', 'and says so');
insert into ids values
  ('l-b3', pg_temp.line('79000000-0000-4000-b000-000000000002',
    '79000000-0000-4000-a000-000000000003', 'sb:l-b3', '2026-11-20 11:05+00'));
select is(pg_temp.state('l-b3'), null, 'nor is anything written there for them any more');
select is(
  public.push_allowed('79000000-0000-4000-a000-000000000003'),
  true,
  'while the business they still keep reaches their phone'
);

------------------------------------------------------------------------------
-- Two demo businesses with one accountant

-- g keeps the books of both; p and q own one each. The reset makes each from
-- its definition and keeps g in the other.
insert into private.demo_businesses (business_id, definition)
values
  ('79000000-0000-4000-b000-000000000011', $json$
  {
    "slug": "sb-demo-one", "name": "Demo one", "accent": "#2563eb",
    "address": "Demo street 1", "shabbat_city": "telAviv", "template": "retail",
    "people": [
      { "user_id": "79000000-0000-4000-a000-000000000007", "role": "owner", "name": "Owner P" },
      { "user_id": "79000000-0000-4000-a000-000000000005", "role": "accountant", "name": "Books G" }
    ]
  }
  $json$),
  ('79000000-0000-4000-b000-000000000012', $json$
  {
    "slug": "sb-demo-two", "name": "Demo two", "accent": "#7c3aed",
    "address": "Demo street 2", "shabbat_city": "haifa", "template": "retail",
    "people": [
      { "user_id": "79000000-0000-4000-a000-000000000008", "role": "owner", "name": "Owner Q" },
      { "user_id": "79000000-0000-4000-a000-000000000005", "role": "accountant", "name": "Books G" }
    ]
  }
  $json$);

select lives_ok(
  $$select public.reset_demo_business('79000000-0000-4000-b000-000000000011'),
      public.reset_demo_business('79000000-0000-4000-b000-000000000012'),
      public.reset_demo_business('79000000-0000-4000-b000-000000000011')$$,
  'two demo businesses with one accountant start, and start again'
);
select results_eq(
  $$select m.business_id::text, m.role::text, m.active
    from public.memberships m
    where m.user_id = '79000000-0000-4000-a000-000000000005'
    order by m.business_id$$,
  $$values
    ('79000000-0000-4000-b000-000000000011'::text, 'accountant'::text, true),
    ('79000000-0000-4000-b000-000000000012'::text, 'accountant'::text, true)$$,
  'and the accountant is in both after each'
);

select * from finish();
rollback;
