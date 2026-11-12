-- Each person's choices for their phone (notifications part 3): the groups
-- that don't reach it (their lines still reach the app), quiet hours that
-- hold a push until they end, across midnight and the clock changes, a push
-- going again after a failure included, and whether the lock screen shows
-- the line. The person alone reads and writes their own, never an owner, a
-- colleague, the server's secret key or the team viewing as someone. Fixed
-- ids of its own and explicit times, so nothing here meets the seeded
-- people; the part about changing them reads the transaction's now().
begin;
select plan(77);
-- Times read back as text, in UTC.
set local timezone = 'UTC';

-- a and d work in R, b owns it, c is on the ConceptApp team and views R.
insert into auth.users (id, aud, role, phone)
values
  ('8c000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004601'),
  ('8c000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004602'),
  ('8c000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004603'),
  ('8c000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004604');

insert into public.businesses (id, slug, name)
values ('8c000000-0000-4000-b000-000000000001', 'prefs-r', 'Prefs R');

insert into public.memberships (business_id, user_id, role, active)
values
  ('8c000000-0000-4000-b000-000000000001', '8c000000-0000-4000-a000-000000000001', 'worker', true),
  ('8c000000-0000-4000-b000-000000000001', '8c000000-0000-4000-a000-000000000002', 'owner', true),
  ('8c000000-0000-4000-b000-000000000001', '8c000000-0000-4000-a000-000000000004', 'worker', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values ('8c000000-0000-4000-b000-000000000001', 'notifications', true, '{}');

insert into public.platform_staff (user_id, role)
values ('8c000000-0000-4000-a000-000000000003', 'platform_admin');
insert into public.view_sessions (staff_id, business_id, role)
values ('8c000000-0000-4000-a000-000000000003', '8c000000-0000-4000-b000-000000000001', 'worker');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- A line of `what` for `person` in R at `at_time`, as the producers write
-- them; its push state and when it goes, as text.
create function pg_temp.line(person uuid, what text, thing text, at_time timestamptz)
returns text language sql as $$
  select private.notify('8c000000-0000-4000-b000-000000000001', array[person], what,
    '{}'::jsonb, actor => null, dedupe => thing, at_time => at_time);
  select n.push_state || '/' || coalesce(n.push_after::text, '-')
  from public.notifications n
  where n.business_id = '8c000000-0000-4000-b000-000000000001'
    and n.user_id = person and n.dedupe_key = thing
$$;

-- When a's phone gets a line of `what` written at `at_time`, as text.
create function pg_temp.plan_a(what text, at_time timestamptz) returns text language sql as $$
  select coalesce(private.push_plan('8c000000-0000-4000-b000-000000000001',
    '8c000000-0000-4000-a000-000000000001', what, at_time)::text, 'none')
$$;

-- How many pushes of the line `thing` a send at `at_time` claims.
create function pg_temp.claimed(thing text, at_time timestamptz) returns integer language sql as $$
  select count(*)::integer from public.claim_due_pushes(200, at_time) c
  where c.notification = (select n.id from public.notifications n where n.dedupe_key = thing)
$$;

-- The pushes of the line `thing` being sent, each answered "try again" (a
-- 429, a 5xx or no answer) at `at_time`.
create function pg_temp.retry(thing text, at_time timestamptz) returns void language sql as $$
  select public.finish_pushes(
    (select coalesce(jsonb_agg(jsonb_build_object('delivery', d.id, 'outcome', 'retry')), '[]'::jsonb)
     from public.push_deliveries d
     join public.notifications n on n.id = d.notification_id
     where n.dedupe_key = thing and d.state = 'sending'),
    at_time)
$$;

-- The line `thing`'s push state and its one delivery's, as text.
create function pg_temp.pushed(thing text) returns text language sql as $$
  select n.push_state || '/' || d.state
  from public.notifications n
  join public.push_deliveries d on d.notification_id = n.id
  where n.dedupe_key = thing
$$;

-- a's quiet hours, on Israel's clock, set by hand for the plan's checks.
create function pg_temp.quiet_a(starts time, stops time) returns void language sql as $$
  update public.notification_preferences p
  set quiet_from = starts, quiet_to = stops, time_zone = 'Asia/Jerusalem'
  where p.user_id = '8c000000-0000-4000-a000-000000000001'
$$;

-- Keys as a browser gives them: 65 bytes and 16, base64url.
create function pg_temp.p256dh() returns text language sql as $$
  select 'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0'
$$;
create function pg_temp.auth() returns text language sql as $$
  select 'aW5zdGFudC1hdXRoLWtleQ'
$$;

-- a and d each have a phone.
set local role service_role;
select public.save_push_subscription('8c000000-0000-4000-a000-000000000001',
  'https://fcm.googleapis.com/fcm/send/prefs-a', pg_temp.p256dh(), pg_temp.auth(),
  'android', '2026-11-01 08:00+00');
select public.save_push_subscription('8c000000-0000-4000-a000-000000000004',
  'https://fcm.googleapis.com/fcm/send/prefs-d', pg_temp.p256dh(), pg_temp.auth(),
  'android', '2026-11-01 08:00+00');
reset role;

------------------------------------------------------------------------------
-- Groups

select is(private.notification_group('swap.offered'), 'swaps',
  'a kind of line is in its group');
select is(private.notification_group('clock.confirm'), 'approvals',
  'a line that asks for something is in one too');
select is(private.notification_group('chat.direct'), 'chat',
  'a chat''s lines are in chat');
select is(private.notification_group('documents.to_confirm'), 'documents',
  'and a document''s in documents');
select ok(
  private.notification_group('push.test') is null
    and private.notification_group('access.pay_granted') is null
    and private.notification_group('pay.wage_set') is null
    and private.notification_group('pay.after_close') is null
    and private.notification_group('pay.month_due') is null,
  'the test and the lines about pay, the office''s too, are in none'
);
select is(private.notification_group('weather.rain'), null::text,
  'nor is a kind this app doesn''t know');
select is_empty(
  $$select g.group_key from private.notification_kind_groups() g
    where g.group_key is not null
      and not (g.group_key = any (private.notification_groups()))$$,
  'every group a kind is in can be kept off the phone'
);
select is(
  (select count(*) = count(distinct g.kind_key) from private.notification_kind_groups() g),
  true,
  'each kind is in one group'
);
select is(
  (select d.starts::text || '-' || d.stops::text from private.default_quiet_hours() d),
  '22:00:00-07:00:00',
  'quiet hours start as 22:00 to 07:00'
);

------------------------------------------------------------------------------
-- Nobody but the person

select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select throws_ok(
  $$insert into public.notification_preferences (user_id)
    values ('8c000000-0000-4000-a000-000000000001')$$,
  '42501', null, 'a person cannot write their row from the browser'
);
select throws_ok(
  $$select private.quiet_until('8c000000-0000-4000-a000-000000000001', now())$$,
  '42501', null, 'nor ask the database''s rules directly'
);
reset role;
set local role anon;
select throws_ok(
  $$select * from public.set_notification_preferences(lock_previews => false)$$,
  '42501', null, 'an anonymous visitor changes nothing'
);
select throws_ok(
  $$select count(*) from public.notification_preferences$$,
  '42501', null, 'and reads nothing'
);
reset role;
set local role service_role;
select throws_ok(
  $$select count(*) from public.notification_preferences$$,
  '42501', null, 'not even the server''s secret key reads them'
);
select throws_ok(
  $$select * from public.set_notification_preferences(lock_previews => false)$$,
  '42501', null, 'nor changes them, which would have to say whose'
);
reset role;

------------------------------------------------------------------------------
-- Changing them

select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select is(
  (select s.off_groups::text from public.set_notification_preferences(
    phone_group => 'chat', phone_on => false) s),
  '{chat}',
  'a person keeps a group off their phone'
);
select is(
  (select s.off_groups::text from public.set_notification_preferences(
    phone_group => 'swaps', phone_on => false) s),
  '{swaps,chat}',
  'and another, kept in the screen''s order'
);
select is(
  (select s.off_groups::text from public.set_notification_preferences(
    phone_group => 'swaps', phone_on => false) s),
  '{swaps,chat}',
  'switching one off twice keeps it once'
);
select is(
  (select s.off_groups::text from public.set_notification_preferences(
    phone_group => 'chat', phone_on => true) s),
  '{swaps}',
  'and back on'
);
select is(
  (select coalesce(s.quiet_starts::text, 'off') || '/' || s.shows_previews::text
   from public.set_notification_preferences() s),
  'off/true',
  'quiet hours are off until switched on, and the lock screen shows the line'
);
select is(
  (select s.quiet_starts::text || '-' || s.quiet_stops::text
   from public.set_notification_preferences(quiet_on => true) s),
  '22:00:00-07:00:00',
  'switched on, quiet hours are 22:00 to 07:00'
);
select is(
  (select s.quiet_starts::text || '-' || s.quiet_stops::text
   from public.set_notification_preferences(quiet_start => '23:30') s),
  '23:30:00-07:00:00',
  'a new start keeps the end'
);
select is(
  (select coalesce(s.quiet_starts::text, 'off') from public.set_notification_preferences(quiet_on => false) s),
  'off',
  'off, they are gone'
);
select is(
  (select s.quiet_starts::text || '-' || s.quiet_stops::text
   from public.set_notification_preferences(quiet_on => true) s),
  '22:00:00-07:00:00',
  'and on again from 22:00 to 07:00'
);
select is(
  (select s.shows_previews from public.set_notification_preferences(lock_previews => false) s),
  false,
  'the lock screen can show the group alone'
);
select is(
  (select s.zone_name from public.set_notification_preferences(tz_name => 'Europe/London') s),
  'Europe/London',
  'and quiet hours are read on the clock the server passes'
);
select throws_ok(
  $$select * from public.set_notification_preferences(phone_group => 'weather', phone_on => false)$$,
  '22023', null, 'a group that doesn''t exist is refused'
);
select throws_ok(
  $$select * from public.set_notification_preferences(phone_group => 'swaps')$$,
  '22023', null, 'and a group without on or off'
);
select throws_ok(
  $$select * from public.set_notification_preferences(quiet_start => '07:00')$$,
  '22023', null, 'quiet hours with no length are refused'
);
select throws_ok(
  $$select * from public.set_notification_preferences(quiet_start => '21:59:30')$$,
  '22023', null, 'and part of a minute'
);
select throws_ok(
  $$select * from public.set_notification_preferences(tz_name => 'Mars/Olympus')$$,
  '22023', null, 'and a clock that doesn''t exist'
);
select is(
  (select p.push_off::text || '/' || p.quiet_from::text || '-' || p.quiet_to::text
     || '/' || p.time_zone || '/' || p.previews::text
   from public.notification_preferences p),
  '{swaps}/22:00:00-07:00:00/Europe/London/false',
  'a person reads their own choices, as they left them'
);

-- Nobody else reads them.
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000002');
select is_empty($$select 1 from public.notification_preferences$$,
  'an owner reads none of their worker''s choices');
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000004');
select is_empty($$select 1 from public.notification_preferences$$,
  'nor does a colleague');
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000003');
select is_empty($$select 1 from public.notification_preferences$$,
  'nor the team viewing the business as a worker');
select throws_ok(
  $$select * from public.set_notification_preferences(lock_previews => false)$$,
  '42501', null, 'who changes nothing while viewing, their own included'
);
select throws_ok(
  $$select public.see_push_ask()$$,
  '42501', null, 'nor notes an ask'
);
reset role;

------------------------------------------------------------------------------
-- What the table holds

select throws_ok(
  $$update public.notification_preferences set quiet_to = null
    where user_id = '8c000000-0000-4000-a000-000000000001'$$,
  '23514', null, 'quiet hours have both ends or none'
);
select throws_ok(
  $$update public.notification_preferences set quiet_from = '07:00', quiet_to = '07:00'
    where user_id = '8c000000-0000-4000-a000-000000000001'$$,
  '23514', null, 'and a length'
);
select throws_ok(
  $$update public.notification_preferences set quiet_from = '22:00:30'
    where user_id = '8c000000-0000-4000-a000-000000000001'$$,
  '23514', null, 'in whole minutes'
);
select throws_ok(
  $$update public.notification_preferences set push_off = '{weather}'
    where user_id = '8c000000-0000-4000-a000-000000000001'$$,
  '23514', null, 'and only groups are kept off the phone'
);

------------------------------------------------------------------------------
-- Which lines reach the phone

-- a keeps swaps off; quiet hours from 22:00 to 07:00 in Israel. 12:00 there.
select pg_temp.quiet_a('22:00', '07:00');
select is(
  pg_temp.line('8c000000-0000-4000-a000-000000000001', 'swap.offered', 'p:off',
    '2026-11-20 10:00+00'),
  'none/-',
  'a group kept off the phone queues nothing for it'
);
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::integer from public.notifications n where n.dedupe_key = 'p:off'),
  1,
  'and its line is in the app all the same'
);
reset role;
select is(
  pg_temp.line('8c000000-0000-4000-a000-000000000004', 'swap.offered', 'p:off',
    '2026-11-20 10:00+00'),
  'queued/2026-11-20 10:00:00+00',
  'a colleague who kept it on gets it at once'
);
select is(pg_temp.plan_a('swap.waiting', '2026-11-20 10:00+00'), '2026-11-20 10:00:00+00',
  'the other groups reach a''s phone');

-- Quiet hours, across midnight.
select is(
  pg_temp.line('8c000000-0000-4000-a000-000000000001', 'schedule.published', 'p:quiet',
    '2026-11-20 21:00+00'),
  'queued/2026-11-21 05:00:00+00',
  'a line at 23:00 waits for 07:00 the next morning'
);
select is(pg_temp.plan_a('schedule.published', '2026-11-21 01:30+00'), '2026-11-21 05:00:00+00',
  'one at 03:30 waits for 07:00 that morning');
select is(pg_temp.plan_a('schedule.published', '2026-11-20 20:00+00'), '2026-11-21 05:00:00+00',
  'they start at 22:00 itself');
select is(pg_temp.plan_a('schedule.published', '2026-11-20 19:59:59+00'), '2026-11-20 19:59:59+00',
  'and not before');
select is(pg_temp.plan_a('schedule.published', '2026-11-21 05:00+00'), '2026-11-21 05:00:00+00',
  'they are over at 07:00 itself');
select is(pg_temp.plan_a('schedule.published', '2026-11-20 10:00+00'), '2026-11-20 10:00:00+00',
  'and a line at noon goes at once');

-- Across the clock changes: back on 25 October 2026 at 02:00, forward on 26
-- March 2027 at 02:00.
select is(pg_temp.plan_a('schedule.published', '2026-10-24 20:00+00'), '2026-10-25 05:00:00+00',
  'a line at 23:00 summer time waits for 07:00 winter time');
select is(pg_temp.plan_a('schedule.published', '2026-10-24 23:30+00'), '2026-10-25 05:00:00+00',
  'one in the hour that happens twice too');
select is(pg_temp.plan_a('schedule.published', '2027-03-25 21:00+00'), '2027-03-26 04:00:00+00',
  'a line at 23:00 winter time waits for 07:00 summer time');
select is(pg_temp.plan_a('schedule.published', '2027-03-26 01:30+00'), '2027-03-26 04:00:00+00',
  'one after the clocks went forward too');

-- Quiet hours within a day.
select pg_temp.quiet_a('13:00', '15:00');
select is(pg_temp.plan_a('schedule.published', '2026-11-20 11:30+00'), '2026-11-20 13:00:00+00',
  'quiet hours from 13:00 to 15:00 hold a line at 13:30 until 15:00');
select is(pg_temp.plan_a('schedule.published', '2026-11-20 13:30+00'), '2026-11-20 13:30:00+00',
  'and not one at 15:30');
select is(pg_temp.plan_a('schedule.published', '2026-11-20 21:00+00'), '2026-11-20 21:00:00+00',
  'nor one at 23:00');

-- What nobody switches off.
update public.notification_preferences
set push_off = private.notification_groups()
where user_id = '8c000000-0000-4000-a000-000000000001';
select pg_temp.quiet_a('22:00', '07:00');
select is(pg_temp.plan_a('chat.direct', '2026-11-20 10:00+00'), 'none',
  'every group off: no chat on the phone, whatever each chat''s mute');
select is(pg_temp.plan_a('pay.month_due', '2026-11-20 10:00+00'), '2026-11-20 10:00:00+00',
  'a line about pay still reaches it: the month waiting to be closed');
select is(pg_temp.plan_a('push.test', '2026-11-20 21:00+00'), '2026-11-20 21:00:00+00',
  'and the test goes at once, even in quiet hours');
select is(
  coalesce(private.push_plan('8c000000-0000-4000-b000-000000000001',
    '8c000000-0000-4000-a000-000000000002', 'schedule.published', '2026-11-20 10:00+00')::text, 'none'),
  'none',
  'someone with no phone gets nothing, as before'
);

------------------------------------------------------------------------------
-- The minute job sends what waited

update public.notification_preferences
set push_off = '{}'
where user_id = '8c000000-0000-4000-a000-000000000001';
select is(
  pg_temp.line('8c000000-0000-4000-a000-000000000001', 'schedule.changed', 'p:held',
    '2026-11-22 21:00+00'),
  'queued/2026-11-23 05:00:00+00',
  'a change at 23:00 waits for 07:00'
);
set local role service_role;
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2026-11-23 04:59+00') c
   where c.notification = (select n.id from public.notifications n where n.dedupe_key = 'p:held')),
  0,
  'nothing sends it at 06:59'
);
select is(
  (select count(*)::integer from public.claim_due_pushes(200, '2026-11-23 05:00:30+00') c
   where c.notification = (select n.id from public.notifications n where n.dedupe_key = 'p:held')),
  1,
  'and the first send after 07:00 does'
);
reset role;

-- A push that failed goes again a minute later (finish_pushes), and keeps to
-- quiet hours too: tried at 21:58 on Israel's clock and due again at 21:59,
-- it waits for 07:00.
select pg_temp.line('8c000000-0000-4000-a000-000000000001', 'schedule.changed', 'p:again',
  '2026-11-24 19:58+00');
set local role service_role;
select pg_temp.claimed('p:again', '2026-11-24 19:58:10+00');
reset role;
select pg_temp.retry('p:again', '2026-11-24 19:58:20+00');
set local role service_role;
select is(pg_temp.claimed('p:again', '2026-11-24 20:00+00'), 0,
  'a push going again inside quiet hours waits');
select is(pg_temp.claimed('p:again', '2026-11-25 05:00:30+00'), 1,
  'and goes again once they are over');
reset role;
select ok(
  private.push_held('8c000000-0000-4000-a000-000000000001', 'schedule.changed',
    '2026-11-24 20:00+00')
    and not private.push_held('8c000000-0000-4000-a000-000000000001', 'push.test',
      '2026-11-24 20:00+00')
    and not private.push_held('8c000000-0000-4000-a000-000000000001', 'schedule.changed',
      '2026-11-24 10:00+00'),
  'the minute job asks the same: held inside quiet hours, never the test'
);

-- Its group kept off the phone while it goes again: it goes no more.
select pg_temp.retry('p:again', '2026-11-25 05:00:40+00');
update public.notification_preferences
set push_off = '{schedule}'
where user_id = '8c000000-0000-4000-a000-000000000001';
set local role service_role;
select is(pg_temp.claimed('p:again', '2026-11-25 05:10+00'), 0,
  'a group switched off stops a push going again');
reset role;
select is(pg_temp.pushed('p:again'), 'skipped/skipped',
  'and its line says it went no more');

------------------------------------------------------------------------------
-- What waits follows a change

-- Quiet hours around now, on Israel's clock: from an hour ago to two hours on.
update public.notification_preferences
set push_off = '{}',
  time_zone = 'Asia/Jerusalem',
  quiet_from = date_trunc('minute', (now() at time zone 'Asia/Jerusalem') - interval '1 hour')::time,
  quiet_to = date_trunc('minute', (now() at time zone 'Asia/Jerusalem') + interval '2 hours')::time
where user_id = '8c000000-0000-4000-a000-000000000001';
select pg_temp.line('8c000000-0000-4000-a000-000000000001', 'swap.taken', 'p:now-swap', now());
select pg_temp.line('8c000000-0000-4000-a000-000000000001', 'team.joined', 'p:now-team', now());
select ok(
  (select bool_and(n.push_state = 'queued' and n.push_after > now() + interval '1 hour')
   from public.notifications n where n.dedupe_key in ('p:now-swap', 'p:now-team')),
  'lines during quiet hours wait for their end'
);
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select public.set_notification_preferences(phone_group => 'team', phone_on => false);
reset role;
select is(
  (select n.push_state from public.notifications n where n.dedupe_key = 'p:now-team'),
  'skipped',
  'a group switched off goes no more, even while it waits'
);
select ok(
  (select n.push_state = 'queued' and n.push_after > now() + interval '1 hour'
   from public.notifications n where n.dedupe_key = 'p:now-swap'),
  'and the rest still wait'
);
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select public.set_notification_preferences(quiet_on => false);
reset role;
select is(
  (select n.push_state || '/' || (n.push_after = now())::text
   from public.notifications n where n.dedupe_key = 'p:now-swap'),
  'queued/true',
  'switching quiet hours off sends what waited, now'
);

-- A push that failed and goes again in a minute, then its group switched off.
select pg_temp.line('8c000000-0000-4000-a000-000000000001', 'schedule.published', 'p:now-again',
  now());
set local role service_role;
select pg_temp.claimed('p:now-again', now());
reset role;
select pg_temp.retry('p:now-again', now());
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select public.set_notification_preferences(phone_group => 'schedule', phone_on => false);
reset role;
select is(pg_temp.pushed('p:now-again'), 'skipped/skipped',
  'switching a group off stops a push going again for it, at once');

------------------------------------------------------------------------------
-- Asked once

select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select public.see_push_ask();
select is(
  (select p.push_asked_at = now() from public.notification_preferences p),
  true,
  'a person offered notifications on the phone is noted'
);
reset role;
update public.notification_preferences
set push_asked_at = '2026-11-01 08:00+00'
where user_id = '8c000000-0000-4000-a000-000000000001';
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select public.see_push_ask();
select is(
  (select p.push_asked_at::text from public.notification_preferences p),
  '2026-11-01 08:00:00+00',
  'once: the first time stays'
);
reset role;

select * from finish();
rollback;
