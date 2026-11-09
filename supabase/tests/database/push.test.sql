-- Notifications on the phone: only the server saves devices and sends, never
-- the browser, which reads a few plain columns of its own devices and nothing
-- of their endpoints or keys. A device belongs to whoever saved it last;
-- nobody only in demo businesses can save one, and a line reaches a phone only
-- from the business the app opens for its person. Each push is claimed once,
-- per device, and what its push service said decides what happens next. Fixed
-- ids of its own and explicit times, so nothing here meets the seeded people.
begin;
select plan(73);
-- Times read back as text, in UTC.
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('72000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500001801'),
  ('72000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500001802'),
  ('72000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500001803'),
  ('72000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500001804');

-- P and Q are real businesses, D a demo. a owns P and b works there. c is only
-- in D. e joined Q first and P after, so the app opens Q for e.
insert into public.businesses (id, slug, name)
values
  ('72000000-0000-4000-b000-000000000001', 'push-p', 'Push P'),
  ('72000000-0000-4000-b000-000000000002', 'push-q', 'Push Q'),
  ('72000000-0000-4000-b000-000000000003', 'push-d', 'Push D');

insert into public.memberships (business_id, user_id, role, active, created_at)
values
  ('72000000-0000-4000-b000-000000000001', '72000000-0000-4000-a000-000000000001', 'owner', true, '2026-11-01 08:00+00'),
  ('72000000-0000-4000-b000-000000000001', '72000000-0000-4000-a000-000000000002', 'worker', true, '2026-11-01 08:00+00'),
  ('72000000-0000-4000-b000-000000000003', '72000000-0000-4000-a000-000000000003', 'worker', true, '2026-11-01 08:00+00'),
  ('72000000-0000-4000-b000-000000000002', '72000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-01 08:00+00'),
  ('72000000-0000-4000-b000-000000000001', '72000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-02 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('72000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('72000000-0000-4000-b000-000000000002', 'notifications', true, '{}'),
  ('72000000-0000-4000-b000-000000000003', 'notifications', true, '{}');

insert into private.demo_businesses (business_id, definition)
values ('72000000-0000-4000-b000-000000000003', '{"slug": "push-d"}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
-- What each claim gave, by round.
create temporary table claimed (
  round text, delivery uuid, notification uuid, what text,
  valid_until timestamptz, device uuid, push_endpoint text
) on commit drop;
grant all on ids, claimed to authenticated, service_role;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- Keys as a browser gives them: 65 bytes and 16, base64url.
create function pg_temp.p256dh() returns text language sql as $$
  select 'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0'
$$;
create function pg_temp.auth() returns text language sql as $$
  select 'aW5zdGFudC1hdXRoLWtleQ'
$$;

-- A line for `person` in business `b`, written as the producers write them.
create function pg_temp.line(b uuid, person uuid, thing text, at_time timestamptz,
  valid_until timestamptz default null) returns uuid language sql as $$
  select private.notify(b, array[person], 'team.joined', '{}'::jsonb,
    actor => null, dedupe => thing, push_until => valid_until, at_time => at_time);
  select n.id from public.notifications n
  where n.business_id = b and n.user_id = person and n.dedupe_key = thing
$$;

-- A line's push state, by its name in ids.
create function pg_temp.state(thing text) returns text language sql as $$
  select n.push_state from public.notifications n where n.id = pg_temp.id(thing)
$$;

-- The deliveries of a line, as state/attempts per device, in device order.
create function pg_temp.deliveries(thing text) returns text language sql as $$
  select coalesce(string_agg(d.state || '/' || d.attempts, ',' order by d.device_id), '')
  from public.push_deliveries d where d.notification_id = pg_temp.id(thing)
$$;

------------------------------------------------------------------------------
-- Nobody but the server

select pg_temp.sign_in('72000000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.save_push_subscription('72000000-0000-4000-a000-000000000001',
    'https://fcm.googleapis.com/fcm/send/browser', pg_temp.p256dh(), pg_temp.auth())$$,
  '42501', null, 'a signed-in person cannot save a device from the browser'
);
select throws_ok(
  $$select * from public.claim_due_pushes()$$,
  '42501', null, 'nor claim pushes'
);
select throws_ok(
  $$select public.send_test_push('72000000-0000-4000-a000-000000000001')$$,
  '42501', null, 'nor send a test'
);
select throws_ok(
  $$select * from public.note_push_fetch('72000000-0000-4000-a000-000000000001')$$,
  '42501', null, 'nor say what a phone fetched'
);
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
    values ('72000000-0000-4000-a000-000000000001', 'https://fcm.googleapis.com/x',
      repeat('a', 64), pg_temp.p256dh(), pg_temp.auth())$$,
  '42501', null, 'nor write a device'
);
select throws_ok(
  $$select count(*) from public.push_deliveries$$,
  '42501', null, 'nor read deliveries'
);
reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.push_subscriptions$$,
  '42501', null, 'an anonymous visitor reads no devices'
);
reset role;

------------------------------------------------------------------------------
-- Saving devices

set local role service_role;
insert into ids values ('a-phone', public.save_push_subscription(
  '72000000-0000-4000-a000-000000000001', 'https://fcm.googleapis.com/fcm/send/a-phone',
  pg_temp.p256dh(), pg_temp.auth(), 'android', '2026-11-20 08:00+00'));
insert into ids values ('a-laptop', public.save_push_subscription(
  '72000000-0000-4000-a000-000000000001', 'https://updates.push.services.mozilla.com/wpush/v2/a-laptop',
  pg_temp.p256dh(), pg_temp.auth(), 'computer', '2026-11-20 08:00+00'));
select throws_ok(
  $$select public.save_push_subscription('72000000-0000-4000-a000-000000000003',
    'https://fcm.googleapis.com/fcm/send/c-phone', pg_temp.p256dh(), pg_temp.auth())$$,
  '55000', null, 'someone only in a demo business cannot save a device'
);
select is(public.push_allowed('72000000-0000-4000-a000-000000000003'), false,
  'and is not offered the switch');
select is(public.push_allowed('72000000-0000-4000-a000-000000000001'), true,
  'while someone in a real business is');
reset role;

select is(
  (select s.endpoint_hash from public.push_subscriptions s where s.id = pg_temp.id('a-phone')),
  encode(sha256(convert_to('https://fcm.googleapis.com/fcm/send/a-phone', 'UTF8')), 'hex'),
  'a device is found by its endpoint''s hash'
);
select is(
  (select s.label || '/' || s.created_at::text from public.push_subscriptions s
   where s.id = pg_temp.id('a-phone')),
  'android/2026-11-20 08:00:00+00',
  'with its kind and when it was saved'
);

-- The same phone saved again by a keeps its row.
set local role service_role;
select is(
  public.save_push_subscription('72000000-0000-4000-a000-000000000001',
    'https://fcm.googleapis.com/fcm/send/a-phone', pg_temp.p256dh(), pg_temp.auth(),
    null, '2026-11-20 08:30+00'),
  pg_temp.id('a-phone'),
  'saving a device again keeps it'
);
reset role;
select is(
  (select s.label || '/' || s.last_seen_at::text from public.push_subscriptions s
   where s.id = pg_temp.id('a-phone')),
  'android/2026-11-20 08:30:00+00',
  'and says when it was last seen, keeping its kind'
);

------------------------------------------------------------------------------
-- What the browser reads

select pg_temp.sign_in('72000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::integer from public.push_subscriptions),
  2,
  'a person reads their own devices'
);
select throws_ok(
  $$select endpoint from public.push_subscriptions$$,
  '42501', null, 'but not their endpoints'
);
select throws_ok(
  $$select p256dh, auth_secret from public.push_subscriptions$$,
  '42501', null, 'nor their keys'
);
select pg_temp.sign_in('72000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer from public.push_subscriptions),
  0,
  'a colleague reads none of them'
);
reset role;

------------------------------------------------------------------------------
-- Which lines reach a phone

insert into ids values
  ('l1', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000001', 'push:l1', '2026-11-20 09:00+00')),
  ('l-b', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000002', 'push:l-b', '2026-11-20 09:00+00')),
  ('l-c', pg_temp.line('72000000-0000-4000-b000-000000000003',
    '72000000-0000-4000-a000-000000000003', 'push:l-c', '2026-11-20 09:00+00'));
select is(
  (select n.push_state || '/' || n.push_after::text from public.notifications n where n.id = pg_temp.id('l1')),
  'queued/2026-11-20 09:00:00+00',
  'a line goes to the phone at once, for someone with a device'
);
select is(pg_temp.state('l-b'), 'none', 'not for someone without one');
select is(pg_temp.state('l-c'), 'none', 'nor in a demo business');

-- e gets a device for Q, the business the app opens for e.
set local role service_role;
insert into ids values ('e-phone', public.save_push_subscription(
  '72000000-0000-4000-a000-000000000004', 'https://web.push.apple.com/e-phone',
  pg_temp.p256dh(), pg_temp.auth(), 'iphone', '2026-11-20 08:00+00'));
reset role;
insert into ids values
  ('l-e-p', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000004', 'push:l-e-p', '2026-11-20 09:00+00')),
  ('l-e-q', pg_temp.line('72000000-0000-4000-b000-000000000002',
    '72000000-0000-4000-a000-000000000004', 'push:l-e-q', '2026-11-20 09:00+00'));
select is(
  pg_temp.state('l-e-p') || ',' || pg_temp.state('l-e-q'),
  'none,queued',
  'someone in two businesses gets pushes only from the one the app opens'
);

------------------------------------------------------------------------------
-- Claiming

set local role service_role;
insert into claimed
select 'r1', c.* from public.claim_due_pushes(200, '2026-11-20 09:00:10+00') c;
reset role;
select is(
  (select count(*)::integer from claimed c where c.round = 'r1' and c.notification = pg_temp.id('l1')),
  2,
  'a due line is claimed once for each of the person''s devices'
);
select is(
  (select string_agg(c.what || '/' || (c.push_endpoint like 'https://%')::text, ',')
   from claimed c where c.round = 'r1' and c.device = pg_temp.id('a-phone')),
  'team.joined/true',
  'with its kind and where to send it'
);
select is(
  pg_temp.state('l1') || '/' || pg_temp.deliveries('l1'),
  'sending/sending/1,sending/1',
  'and is sending to both'
);
set local role service_role;
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2026-11-20 09:00:20+00')),
  0,
  'a second claim right after takes nothing'
);
reset role;

-- One device takes it, the other says later.
set local role service_role;
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object(
     'delivery', c.delivery,
     'outcome', case when c.device = pg_temp.id('a-phone') then 'ok' else 'retry' end))
   from claimed c where c.round = 'r1' and c.notification = pg_temp.id('l1')),
  '2026-11-20 09:00:12+00'
);
reset role;
select is(
  (select d.state || '/' || d.next_at::text from public.push_deliveries d
   where d.notification_id = pg_temp.id('l1') and d.device_id = pg_temp.id('a-laptop')),
  'queued/2026-11-20 09:01:12+00',
  'a device that says later is tried again in a minute'
);
select is(
  (select d.state from public.push_deliveries d
   where d.notification_id = pg_temp.id('l1') and d.device_id = pg_temp.id('a-phone')),
  'sent',
  'the one that took it is done'
);
select is(
  (select s.last_success_at::text from public.push_subscriptions s where s.id = pg_temp.id('a-phone')),
  '2026-11-20 09:00:12+00',
  'and says when it last worked'
);
select is(pg_temp.state('l1'), 'sending', 'the line is still on its way');

set local role service_role;
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2026-11-20 09:00:50+00')),
  0,
  'nothing goes before its minute'
);
insert into claimed
select 'r2', c.* from public.claim_due_pushes(200, '2026-11-20 09:01:15+00') c;
reset role;
select is(
  (select string_agg(c.device::text, ',') from claimed c where c.round = 'r2' and c.notification = pg_temp.id('l1')),
  pg_temp.id('a-laptop')::text,
  'then it goes again to that device alone'
);

-- Later twice more, and once again: it fails.
set local role service_role;
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object('delivery', c.delivery, 'outcome', 'retry')) from claimed c where c.round = 'r2'),
  '2026-11-20 09:01:16+00'
);
reset role;
select is(
  (select d.next_at::text from public.push_deliveries d
   where d.notification_id = pg_temp.id('l1') and d.device_id = pg_temp.id('a-laptop')),
  '2026-11-20 09:06:16+00',
  'the second time in five minutes'
);
set local role service_role;
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object('delivery', c.delivery, 'outcome', 'retry', 'wait', 3600))
   from public.claim_due_pushes(200, '2026-11-20 09:06:20+00') c),
  '2026-11-20 09:06:21+00'
);
reset role;
select is(
  (select d.next_at::text from public.push_deliveries d
   where d.notification_id = pg_temp.id('l1') and d.device_id = pg_temp.id('a-laptop')),
  '2026-11-20 10:06:21+00',
  'the third time in 25 minutes, or later when the service asks for longer'
);
set local role service_role;
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object('delivery', c.delivery, 'outcome', 'retry'))
   from public.claim_due_pushes(200, '2026-11-20 10:06:30+00') c),
  '2026-11-20 10:06:31+00'
);
reset role;
select is(
  pg_temp.deliveries('l1'),
  (select string_agg(x, ',' order by d) from (values
     (pg_temp.id('a-phone'), 'sent/1'), (pg_temp.id('a-laptop'), 'failed/4')) v (d, x)),
  'after the last try it fails, on that device alone'
);
select is(
  (select s.failures || '/' || s.failing_since::text from public.push_subscriptions s
   where s.id = pg_temp.id('a-laptop')),
  '1/2026-11-20 10:06:31+00',
  'which counts it against the device'
);
select is(pg_temp.state('l1'), 'sent', 'and the line says it was sent, since a device got it');

------------------------------------------------------------------------------
-- What stops a push

insert into ids values
  ('l2', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000001', 'push:l2', '2026-11-20 11:00+00')),
  ('l3', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000001', 'push:l3', '2026-11-20 11:00+00',
    '2026-11-20 11:00:30+00'));
update public.notifications set read_at = '2026-11-20 11:00:05+00' where id = pg_temp.id('l2');
set local role service_role;
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2026-11-20 11:01+00') c
   where c.notification in (pg_temp.id('l2'), pg_temp.id('l3'))),
  0,
  'a line already read, or past the time it was for, goes to no phone'
);
reset role;
select is(
  pg_temp.state('l2') || ',' || pg_temp.state('l3'),
  'skipped,skipped',
  'and says so'
);

-- A send that died midway goes again after five minutes.
insert into ids values
  ('l4', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000001', 'push:l4', '2026-11-20 12:00+00'));
set local role service_role;
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2026-11-20 12:00:01+00') c
   where c.notification = pg_temp.id('l4')),
  2,
  'a line is claimed for sending'
);
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2026-11-20 12:06+00') c
   where c.notification = pg_temp.id('l4')),
  2,
  'and claimed again when its send never finished'
);
reset role;
select is(
  pg_temp.deliveries('l4'),
  'sending/2,sending/2',
  'counting the attempt'
);

------------------------------------------------------------------------------
-- Devices that are gone, or refuse

set local role service_role;
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object(
     'delivery', d.id,
     'outcome', case when d.device_id = pg_temp.id('a-laptop') then 'gone' else 'refused' end))
   from public.push_deliveries d where d.notification_id = pg_temp.id('l4')),
  '2026-11-20 12:06:05+00'
);
reset role;
select is(
  (select count(*)::integer from public.push_subscriptions s where s.id = pg_temp.id('a-laptop')),
  0,
  'a device its push service says is gone is forgotten'
);
select is(
  (select s.failures || '/' || s.failing_since::text from public.push_subscriptions s
   where s.id = pg_temp.id('a-phone')),
  '1/2026-11-20 12:06:05+00',
  'one that refuses counts a failure, and stays'
);
select is(pg_temp.state('l4'), 'failed', 'and the line failed on every device');

-- Two more refusals the same day keep it; one a day after the first does not.
insert into ids values
  ('l5', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000001', 'push:l5', '2026-11-20 13:00+00')),
  ('l6', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000001', 'push:l6', '2026-11-20 14:00+00'));
set local role service_role;
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object('delivery', c.delivery, 'outcome', 'refused'))
   from public.claim_due_pushes(200, '2026-11-20 13:30+00') c),
  '2026-11-20 13:30:01+00'
);
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object('delivery', c.delivery, 'outcome', 'refused'))
   from public.claim_due_pushes(200, '2026-11-20 14:30+00') c),
  '2026-11-20 14:30:01+00'
);
reset role;
select is(
  (select s.failures::integer from public.push_subscriptions s where s.id = pg_temp.id('a-phone')),
  3,
  'three refusals in a day keep the device'
);
insert into ids values
  ('l7', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000001', 'push:l7', '2026-11-21 12:30+00'));
set local role service_role;
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object('delivery', c.delivery, 'outcome', 'refused'))
   from public.claim_due_pushes(200, '2026-11-21 12:30:01+00') c),
  '2026-11-21 12:30:02+00'
);
reset role;
select is(
  (select count(*)::integer from public.push_subscriptions s where s.id = pg_temp.id('a-phone')),
  0,
  'one more a day after the first forgets it'
);

------------------------------------------------------------------------------
-- A device that changes hands

set local role service_role;
insert into ids values ('shared', public.save_push_subscription(
  '72000000-0000-4000-a000-000000000001', 'https://fcm.googleapis.com/fcm/send/shared',
  pg_temp.p256dh(), pg_temp.auth(), 'android', '2026-11-22 08:00+00'));
reset role;
insert into ids values
  ('l8', pg_temp.line('72000000-0000-4000-b000-000000000001',
    '72000000-0000-4000-a000-000000000001', 'push:l8', '2026-11-22 09:00+00'));
set local role service_role;
insert into claimed
select 'r3', c.* from public.claim_due_pushes(200, '2026-11-22 09:00:01+00') c;
select public.finish_pushes(
  (select jsonb_agg(jsonb_build_object('delivery', c.delivery, 'outcome', 'retry')) from claimed c where c.round = 'r3'),
  '2026-11-22 09:00:02+00'
);
select is(
  public.save_push_subscription('72000000-0000-4000-a000-000000000002',
    'https://fcm.googleapis.com/fcm/send/shared', pg_temp.p256dh(), pg_temp.auth(),
    null, '2026-11-22 09:00:30+00'),
  pg_temp.id('shared'),
  'saving someone else''s device moves it'
);
reset role;
select is(
  (select s.user_id::text || '/' || s.last_fetched_at::text from public.push_subscriptions s
   where s.id = pg_temp.id('shared')),
  '72000000-0000-4000-a000-000000000002/2026-11-22 09:00:30+00',
  'to its new person, who starts from now'
);
select is(pg_temp.deliveries('l8'), '', 'and the last person''s pushes to it stop');

------------------------------------------------------------------------------
-- What the phone asks

set local role service_role;
select is(
  (select f.since::text || '/' || f.business::text
   from public.note_push_fetch('72000000-0000-4000-a000-000000000002',
     'https://fcm.googleapis.com/fcm/send/shared', '2026-11-22 09:05+00') f),
  '2026-11-22 09:00:30+00/72000000-0000-4000-b000-000000000001',
  'a phone asking what to show gets what came after its last ask, and the business'
);
select is(
  (select f.since::text
   from public.note_push_fetch('72000000-0000-4000-a000-000000000002',
     'https://fcm.googleapis.com/fcm/send/shared', '2026-11-22 09:10+00') f),
  '2026-11-22 09:05:00+00',
  'and next time, what came after that'
);
select is(
  (select count(*)::integer
   from public.note_push_fetch('72000000-0000-4000-a000-000000000001',
     'https://fcm.googleapis.com/fcm/send/shared', '2026-11-22 09:15+00')),
  0,
  'someone else signed in on it gets nothing'
);
select is(
  (select f.since::text
   from public.note_push_fetch('72000000-0000-4000-a000-000000000001', null, '2026-11-22 09:15+00') f),
  '2026-11-22 08:15:00+00',
  'a phone that would not say which it is gets the last hour'
);
select is(
  (select count(*)::integer
   from public.note_push_fetch('72000000-0000-4000-a000-000000000003', null, '2026-11-22 09:15+00')),
  0,
  'someone only in a demo business gets nothing'
);
select public.note_push_signed_out('https://fcm.googleapis.com/fcm/send/shared');
select public.note_push_signed_out('https://fcm.googleapis.com/fcm/send/shared');
select is(
  (select count(*)::integer from public.push_subscriptions s where s.id = pg_temp.id('shared')),
  1,
  'a phone asking twice without a session keeps its device'
);
select public.note_push_signed_out('https://fcm.googleapis.com/fcm/send/shared');
reset role;
select is(
  (select count(*)::integer from public.push_subscriptions s where s.id = pg_temp.id('shared')),
  0,
  'the third time in a row it is forgotten'
);

------------------------------------------------------------------------------
-- A test notification, and forgetting a device

set local role service_role;
select throws_ok(
  $$select public.send_test_push('72000000-0000-4000-a000-000000000003')$$,
  '55000', null, 'someone only in a demo business gets no test'
);
select is(public.send_test_push('72000000-0000-4000-a000-000000000001', '2026-11-23 10:00+00'), true,
  'a test line is written');
select is(public.send_test_push('72000000-0000-4000-a000-000000000001', '2026-11-23 10:00:20+00'), false,
  'not again within 30 seconds');
select is(public.send_test_push('72000000-0000-4000-a000-000000000001', '2026-11-23 10:00:40+00'), true,
  'and again after');
reset role;
select is(
  (select count(*)::integer || '/' || min(n.push_before)::text from public.notifications n
   where n.user_id = '72000000-0000-4000-a000-000000000001' and n.kind = 'push.test'
     and n.actor_id is null),
  '1/2026-11-23 10:15:40+00',
  'one line for the person themselves, for a quarter of an hour'
);

set local role service_role;
insert into ids values ('a-again', public.save_push_subscription(
  '72000000-0000-4000-a000-000000000001', 'https://fcm.googleapis.com/fcm/send/a-again',
  pg_temp.p256dh(), pg_temp.auth(), 'android', '2026-11-23 11:00+00'));
select is(
  public.remove_push_subscription('72000000-0000-4000-a000-000000000002', pg_temp.id('a-again')),
  false,
  'nobody forgets someone else''s device'
);
select is(
  public.remove_push_subscription('72000000-0000-4000-a000-000000000001',
    push_endpoint => 'https://fcm.googleapis.com/fcm/send/a-again'),
  true,
  'a person forgets their own'
);
reset role;

------------------------------------------------------------------------------
-- At most ten devices each

-- b, with none left, saves ten, a minute apart.
set local role service_role;
insert into ids
select 'b-' || i, public.save_push_subscription('72000000-0000-4000-a000-000000000002',
  'https://fcm.googleapis.com/fcm/send/b-' || i, pg_temp.p256dh(), pg_temp.auth(), 'android',
  '2026-11-24 08:00+00'::timestamptz + make_interval(mins => i))
from generate_series(1, 10) i;
reset role;
select is(
  (select count(*)::integer from public.push_subscriptions s
   where s.user_id = '72000000-0000-4000-a000-000000000002'),
  10,
  'a person keeps ten devices'
);

-- Which of b's saved devices are gone, by name.
create function pg_temp.gone_of_b() returns text language sql as $$
  select coalesce(string_agg(i.name, ',' order by i.name), '')
  from ids i
  where i.name like 'b-%'
    and not exists (select 1 from public.push_subscriptions s where s.id = i.id)
$$;

set local role service_role;
insert into ids values ('b-11', public.save_push_subscription(
  '72000000-0000-4000-a000-000000000002', 'https://fcm.googleapis.com/fcm/send/b-11',
  pg_temp.p256dh(), pg_temp.auth(), 'android', '2026-11-24 09:00+00'));
reset role;
select is(
  (select count(*)::integer from public.push_subscriptions s
   where s.user_id = '72000000-0000-4000-a000-000000000002') || '/' || pg_temp.gone_of_b(),
  '10/b-1',
  'an eleventh forgets the one seen longest ago'
);

set local role service_role;
select is(
  public.save_push_subscription('72000000-0000-4000-a000-000000000002',
    'https://fcm.googleapis.com/fcm/send/b-2', pg_temp.p256dh(), pg_temp.auth(),
    null, '2026-11-24 09:10+00'),
  pg_temp.id('b-2'),
  'one of theirs saved again stays'
);
insert into ids values ('b-12', public.save_push_subscription(
  '72000000-0000-4000-a000-000000000002', 'https://fcm.googleapis.com/fcm/send/b-12',
  pg_temp.p256dh(), pg_temp.auth(), 'android', '2026-11-24 09:20+00'));
reset role;
select is(
  pg_temp.gone_of_b(),
  'b-1,b-3',
  'and the next new one forgets the oldest seen after it'
);

------------------------------------------------------------------------------
-- The daily clean-up

-- b-4 took a push lately, b-5 was seen lately, b-6 took one but fails now;
-- the rest of b's were seen and took nothing since 24 November, and e's phone
-- fails, with a line on its way to it.
update public.push_subscriptions set last_success_at = '2027-01-20 08:00+00'
where id in (pg_temp.id('b-4'), pg_temp.id('b-6'));
update public.push_subscriptions set last_seen_at = '2027-01-25 08:00+00'
where id = pg_temp.id('b-5');
update public.push_subscriptions set failures = 1, failing_since = '2027-01-30 08:00+00'
where id = pg_temp.id('b-6');
insert into ids values
  ('l-e2', pg_temp.line('72000000-0000-4000-b000-000000000002',
    '72000000-0000-4000-a000-000000000004', 'push:l-e2', '2027-01-31 10:00+00'));
set local role service_role;
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2027-01-31 10:00:01+00') c
   where c.device = pg_temp.id('e-phone')),
  1,
  'a line is on its way to a failing phone'
);
reset role;
select private.clean_notifications('2027-02-01 00:00+00');
select is(
  (select string_agg(i.name, ',' order by i.name) from ids i
   where exists (select 1 from public.push_subscriptions s where s.id = i.id)),
  'b-4,b-5',
  'devices unseen for 60 days go when they fail or took no push in that time'
);
select is(pg_temp.state('l-e2'), 'failed',
  'and a line left waiting on one of them says how it went');

------------------------------------------------------------------------------
-- The jobs

select is(
  (select count(*)::integer from cron.job j
   where j.jobname in ('notifications', 'notifications-clean')),
  2,
  'the minute job and the daily one are scheduled'
);
select lives_ok(
  $$select private.notifications_tick()$$,
  'the minute job calls nothing without the app''s address'
);

select * from finish();
rollback;
