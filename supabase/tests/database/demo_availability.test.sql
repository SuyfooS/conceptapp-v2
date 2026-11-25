-- Sample availability in the hosted demo (20261128000100_demo_sample_availability.sql,
-- filling from availability, part 6): public.renew_demo_availability sends
-- next week's sample answer for each person a demo definition names who is
-- active on its staff, owes availability and sent none, through
-- public.open_schedule_week and public.submit_availability, cut by Shabbat
-- for a business closed on Shabbat. Never an owner, an accountant or someone
-- who left; never an answer someone sent, an empty one too; nothing on a
-- published week, with scheduling off or for a definition without the key;
-- no row of the log, no notification and no push; nothing the second time;
-- the sample again once a reset took the week; submit_availability's own
-- rules hold; only the server may call it. Fixed ids of its own, so nothing
-- here meets the seeded people, whose definitions name no sample.
begin;
select plan(32);

insert into auth.users (id, aud, role, phone)
values
  ('dc000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500005201'),
  ('dc000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500005202'),
  ('dc000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500005203'),
  ('dc000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500005204'),
  ('dc000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500005205'),
  ('dc000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500005206'),
  ('dc000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500005207'),
  ('dc000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500005208'),
  ('dc000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500005209'),
  ('dc000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500005210'),
  ('dc000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500005211'),
  ('dc000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500005212'),
  ('dc000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500005213');

-- X, closed on Shabbat (the default), weeks from Sunday: 1 its owner, 2 a
-- manager, 3 a worker, 4 a worker who sent their own answer, 5 a worker who
-- left, 6 its accountant, 7 a worker the sample doesn't name, 8 a worker
-- named only inside Shabbat, d a worker who sent "not available". O, open on
-- Shabbat, weeks from Monday: 9 a manager. P, next week published: a a
-- worker. Q, scheduling off: b a worker. R, a definition without the key: c
-- a worker. Every one of them a demo business.
insert into public.businesses (id, slug, name)
values
  ('dc000000-0000-4000-b000-000000000001', 'demo-avail-x', 'Demo availability X'),
  ('dc000000-0000-4000-b000-000000000002', 'demo-avail-o', 'Demo availability O'),
  ('dc000000-0000-4000-b000-000000000003', 'demo-avail-p', 'Demo availability P'),
  ('dc000000-0000-4000-b000-000000000004', 'demo-avail-q', 'Demo availability Q'),
  ('dc000000-0000-4000-b000-000000000005', 'demo-avail-r', 'Demo availability R');

insert into public.memberships (business_id, user_id, role, active)
values
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-000000000001', 'owner', true),
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-000000000002', 'manager', true),
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-000000000003', 'worker', true),
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-000000000004', 'worker', true),
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-000000000005', 'worker', false),
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-000000000006', 'accountant', true),
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-000000000007', 'worker', true),
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-000000000008', 'worker', true),
  ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-a000-00000000000d', 'worker', true),
  ('dc000000-0000-4000-b000-000000000002', 'dc000000-0000-4000-a000-000000000009', 'manager', true),
  ('dc000000-0000-4000-b000-000000000003', 'dc000000-0000-4000-a000-00000000000a', 'worker', true),
  ('dc000000-0000-4000-b000-000000000004', 'dc000000-0000-4000-a000-00000000000b', 'worker', true),
  ('dc000000-0000-4000-b000-000000000005', 'dc000000-0000-4000-a000-00000000000c', 'worker', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('dc000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('dc000000-0000-4000-b000-000000000002', 'scheduling', true, '{"weekStartsOn": 1, "closedOnShabbat": false}'),
  ('dc000000-0000-4000-b000-000000000003', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('dc000000-0000-4000-b000-000000000004', 'scheduling', false, '{"weekStartsOn": 0}'),
  ('dc000000-0000-4000-b000-000000000005', 'scheduling', true, '{"weekStartsOn": 0}');

insert into private.demo_businesses (business_id, definition)
values
  ('dc000000-0000-4000-b000-000000000001', $json$
  {
    "slug": "demo-avail-x",
    "sampleAvailability": [
      { "user_id": "dc000000-0000-4000-a000-000000000001", "ranges": [
        { "weekday": 0, "start": "09:00", "end": "17:00" } ] },
      { "user_id": "dc000000-0000-4000-a000-000000000002", "ranges": [
        { "weekday": 0, "start": "09:00", "end": "23:30" },
        { "weekday": 3, "start": "16:00", "end": "23:30" },
        { "weekday": 5, "start": "08:00", "end": "23:00" },
        { "weekday": 6, "start": "08:00", "end": "23:00" } ] },
      { "user_id": "dc000000-0000-4000-a000-000000000003", "ranges": [
        { "weekday": 1, "start": "09:00", "end": "16:00" },
        { "weekday": 6, "start": "19:30", "end": "00:00" } ] },
      { "user_id": "dc000000-0000-4000-a000-000000000004", "ranges": [
        { "weekday": 2, "start": "09:00", "end": "17:00" } ] },
      { "user_id": "dc000000-0000-4000-a000-000000000005", "ranges": [
        { "weekday": 0, "start": "09:00", "end": "17:00" } ] },
      { "user_id": "dc000000-0000-4000-a000-000000000006", "ranges": [
        { "weekday": 0, "start": "09:00", "end": "17:00" } ] },
      { "user_id": "dc000000-0000-4000-a000-000000000008", "ranges": [
        { "weekday": 6, "start": "08:00", "end": "12:00" } ] },
      { "user_id": "dc000000-0000-4000-a000-00000000000d", "ranges": [
        { "weekday": 0, "start": "09:00", "end": "17:00" } ] }
    ]
  }
  $json$),
  ('dc000000-0000-4000-b000-000000000002', $json$
  {
    "slug": "demo-avail-o",
    "sampleAvailability": [
      { "user_id": "dc000000-0000-4000-a000-000000000009", "ranges": [
        { "weekday": 1, "start": "09:00", "end": "17:00" },
        { "weekday": 6, "start": "08:00", "end": "12:00" },
        { "weekday": 0, "start": "22:00", "end": "02:00" } ] }
    ]
  }
  $json$),
  ('dc000000-0000-4000-b000-000000000003', $json$
  {
    "slug": "demo-avail-p",
    "sampleAvailability": [
      { "user_id": "dc000000-0000-4000-a000-00000000000a", "ranges": [
        { "weekday": 0, "start": "09:00", "end": "17:00" } ] }
    ]
  }
  $json$),
  ('dc000000-0000-4000-b000-000000000004', $json$
  {
    "slug": "demo-avail-q",
    "sampleAvailability": [
      { "user_id": "dc000000-0000-4000-a000-00000000000b", "ranges": [
        { "weekday": 0, "start": "09:00", "end": "17:00" } ] }
    ]
  }
  $json$),
  ('dc000000-0000-4000-b000-000000000005', '{"slug": "demo-avail-r"}');

-- Next week's days, as the availability form answers for it: X's (and P's)
-- from Sunday, O's from Monday, on Israel's clock (every business here is in
-- it). Candle lighting and havdalah in X's city (Tel Aviv, having none).
create function pg_temp.x_day(n integer) returns date language sql as $$
  select private.week_start_after(now(), 'Asia/Jerusalem', 0) + n
$$;
create function pg_temp.o_day(n integer) returns date language sql as $$
  select private.week_start_after(now(), 'Asia/Jerusalem', 1) + n
$$;
create function pg_temp.candles(on_day date) returns text language sql as $$
  select to_char(lower(private.shabbat_span('dc000000-0000-4000-b000-000000000001', on_day))
    at time zone 'Asia/Jerusalem', 'HH24:MI')
$$;
create function pg_temp.havdalah(on_day date) returns text language sql as $$
  select to_char(upper(private.shabbat_span('dc000000-0000-4000-b000-000000000001', on_day))
    at time zone 'Asia/Jerusalem', 'HH24:MI')
$$;
-- A person's ranges in a business, as "day start-end" lines, earliest first.
create function pg_temp.ranges_of(person uuid) returns text language sql as $$
  select coalesce(string_agg(
    r.day::text || ' ' || to_char(r.starts_at, 'HH24:MI') || '-' || to_char(r.ends_at, 'HH24:MI'),
    ', ' order by r.day, r.starts_at), '')
  from public.availability_submissions s
  join public.availability_ranges r on r.submission_id = s.id
  where s.user_id = person
$$;
create function pg_temp.answers_in(business uuid) returns integer language sql as $$
  select count(*)::integer from public.availability_submissions s where s.business_id = business
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table calls (name text primary key, written integer) on commit drop;
create temporary table counts (name text primary key, n bigint) on commit drop;
grant all on calls, counts to service_role;

-- X's next week is open, as a worker's own answer opens it, and so is P's.
insert into ids values
  ('x-week', public.open_schedule_week('dc000000-0000-4000-b000-000000000001',
    pg_temp.x_day(0), now() + interval '1 day')),
  ('p-week', public.open_schedule_week('dc000000-0000-4000-b000-000000000003',
    pg_temp.x_day(0), now() + interval '1 day'));

-- In X the fourth worker sent hours of their own, with a note, a day ago,
-- and d sent "not available".
select public.submit_availability('dc000000-0000-4000-a000-000000000004',
  (select i.id from ids i where i.name = 'x-week'),
  jsonb_build_array(jsonb_build_object('day', pg_temp.x_day(4)::text, 'start', '10:00', 'end', '14:00')),
  'own words');
select public.submit_availability('dc000000-0000-4000-a000-00000000000d',
  (select i.id from ids i where i.name = 'x-week'),
  '[]'::jsonb);
update public.availability_submissions
set submitted_at = now() - interval '1 day', updated_at = now() - interval '1 day'
where user_id in ('dc000000-0000-4000-a000-000000000004', 'dc000000-0000-4000-a000-00000000000d');

-- P's next week is published.
update public.schedule_weeks w
set schedule_saved_at = now(), schedule_published_at = now()
where w.id = (select i.id from ids i where i.name = 'p-week');

insert into counts
select 'log', count(*) from public.audit_log
union all select 'lines', count(*) from public.notifications
union all select 'pushes', count(*) from public.push_deliveries;

------------------------------------------------------------------------------
-- Who may call it

select ok(
  not has_function_privilege('anon', 'public.renew_demo_availability()', 'execute')
  and not has_function_privilege('authenticated', 'public.renew_demo_availability()', 'execute')
  and not has_function_privilege('anon', 'private.demo_sample_ranges(uuid, date, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.demo_sample_ranges(uuid, date, jsonb)', 'execute'),
  'browser roles may not send the demo''s sample availability'
);
select ok(
  has_function_privilege('service_role', 'public.renew_demo_availability()', 'execute'),
  'the server may'
);
set local role authenticated;
select throws_ok(
  $$select public.renew_demo_availability()$$,
  '42501', null, 'a signed-in user cannot call it'
);
reset role;

------------------------------------------------------------------------------
-- The first call

set local role service_role;
insert into calls values ('first', public.renew_demo_availability());
reset role;

select is(
  (select written from calls where name = 'first'), 3,
  'it writes an answer for each named person on the staff who owes one and sent none'
);
select is(
  pg_temp.ranges_of('dc000000-0000-4000-a000-000000000002'),
  pg_temp.x_day(0)::text || ' 09:00-23:30, '
    || pg_temp.x_day(3)::text || ' 16:00-23:30, '
    || pg_temp.x_day(5)::text || ' 08:00-' || pg_temp.candles(pg_temp.x_day(5)) || ', '
    || pg_temp.x_day(6)::text || ' ' || pg_temp.havdalah(pg_temp.x_day(6)) || '-23:00',
  'a manager gets the sample on next week''s days, Friday ending by candle lighting and Saturday starting from havdalah'
);
select is(
  pg_temp.ranges_of('dc000000-0000-4000-a000-000000000003'),
  pg_temp.x_day(1)::text || ' 09:00-16:00, '
    || pg_temp.x_day(6)::text || ' ' || greatest('19:30', pg_temp.havdalah(pg_temp.x_day(6))) || '-00:00',
  'a worker gets theirs, Saturday night from havdalah at the earliest'
);
select is(
  (select count(*)::integer from public.availability_submissions s
   join public.schedule_weeks w on w.id = s.week_id
   where s.user_id in ('dc000000-0000-4000-a000-000000000002', 'dc000000-0000-4000-a000-000000000003')
     and w.business_id = 'dc000000-0000-4000-b000-000000000001'
     and w.starts_on = pg_temp.x_day(0)
     and s.note is null),
  2,
  'each for next week, with no note'
);
select is(
  pg_temp.ranges_of('dc000000-0000-4000-a000-000000000004')
    || ' / ' || (select s.note || ' ' || (s.updated_at = now() - interval '1 day')::text
      from public.availability_submissions s
      where s.user_id = 'dc000000-0000-4000-a000-000000000004'),
  pg_temp.x_day(4)::text || ' 10:00-14:00 / own words true',
  'an answer someone sent stays as they sent it'
);
select is(
  (select count(r.id)::integer || ' ' || (s.updated_at = now() - interval '1 day')::text
   from public.availability_submissions s
   left join public.availability_ranges r on r.submission_id = s.id
   where s.user_id = 'dc000000-0000-4000-a000-00000000000d'
   group by s.updated_at),
  '0 true',
  'and so does "not available"'
);
select is(
  (select count(*)::integer from public.availability_submissions s
   where s.user_id = 'dc000000-0000-4000-a000-000000000001'),
  0,
  'never for an owner'
);
select is(
  (select count(*)::integer from public.availability_submissions s
   where s.user_id in ('dc000000-0000-4000-a000-000000000005', 'dc000000-0000-4000-a000-000000000006')),
  0,
  'never for someone who left, nor for an accountant'
);
select is(
  (select count(*)::integer from public.availability_submissions s
   where s.user_id = 'dc000000-0000-4000-a000-000000000007'),
  0,
  'never for someone the sample doesn''t name'
);
select is(
  (select count(*)::integer from public.availability_submissions s
   where s.user_id = 'dc000000-0000-4000-a000-000000000008'),
  0,
  'nothing for someone the sample names only inside Shabbat'
);
select is(
  pg_temp.answers_in('dc000000-0000-4000-b000-000000000001'),
  4,
  'X has the two sent before and the two sample answers'
);

select is(
  pg_temp.ranges_of('dc000000-0000-4000-a000-000000000009'),
  pg_temp.o_day(0)::text || ' 09:00-17:00, '
    || pg_temp.o_day(5)::text || ' 08:00-12:00, '
    || pg_temp.o_day(6)::text || ' 22:00-02:00',
  'open on Shabbat, a week from Monday keeps every range whole, a night past midnight on its last day too'
);
select results_eq(
  $$select w.starts_on, w.availability_due_at from public.schedule_weeks w
    where w.business_id = 'dc000000-0000-4000-b000-000000000002'$$,
  $$values (pg_temp.o_day(0),
    private.availability_due_at('dc000000-0000-4000-b000-000000000002', pg_temp.o_day(0)))$$,
  'the week it opens starts on the business''s day and is due when its settings say'
);

select is(
  pg_temp.answers_in('dc000000-0000-4000-b000-000000000003'),
  0,
  'nothing on a published week'
);
select is(
  (select count(*)::integer from public.schedule_weeks w
   where w.business_id = 'dc000000-0000-4000-b000-000000000004')
    + pg_temp.answers_in('dc000000-0000-4000-b000-000000000004'),
  0,
  'nothing with scheduling off, not even a week'
);
select is(
  (select count(*)::integer from public.schedule_weeks w
   where w.business_id = 'dc000000-0000-4000-b000-000000000005')
    + pg_temp.answers_in('dc000000-0000-4000-b000-000000000005'),
  0,
  'nothing for a definition without the key'
);

------------------------------------------------------------------------------
-- Again

insert into counts
select 'answers', count(*) from public.availability_submissions s
where s.business_id in ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-b000-000000000002')
union all
select 'ranges', count(*) from public.availability_ranges r
join public.availability_submissions s on s.id = r.submission_id
where s.business_id in ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-b000-000000000002');

set local role service_role;
insert into calls values ('second', public.renew_demo_availability());
reset role;

select is(
  (select written from calls where name = 'second'), 0,
  'called again, it writes nothing'
);
select is(
  (select count(*) from public.availability_submissions s
   where s.business_id in ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-b000-000000000002')),
  (select n from counts where name = 'answers'),
  'and changes no answer'
);
select is(
  (select count(*) from public.availability_ranges r
   join public.availability_submissions s on s.id = r.submission_id
   where s.business_id in ('dc000000-0000-4000-b000-000000000001', 'dc000000-0000-4000-b000-000000000002')),
  (select n from counts where name = 'ranges'),
  'nor any range'
);

------------------------------------------------------------------------------
-- submit_availability's own rules hold

update private.demo_businesses d
set definition = jsonb_set(d.definition, '{sampleAvailability}',
  (d.definition -> 'sampleAvailability') || $json$
  [{ "user_id": "dc000000-0000-4000-a000-000000000007", "ranges": [
    { "weekday": 0, "start": "09:00", "end": "17:00" },
    { "weekday": 0, "start": "16:00", "end": "20:00" } ] }]
  $json$::jsonb)
where d.business_id = 'dc000000-0000-4000-b000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.renew_demo_availability()$$,
  '22023', 'Ranges on the same day overlap',
  'a sample the database wouldn''t take from a worker is refused as theirs would be'
);
reset role;
select is(
  (select count(*)::integer from public.availability_submissions s
   where s.user_id = 'dc000000-0000-4000-a000-000000000007'),
  0,
  'and nothing of it stays'
);
update private.demo_businesses d
set definition = jsonb_set(d.definition, '{sampleAvailability}',
  (select jsonb_agg(e.value) from jsonb_array_elements(d.definition -> 'sampleAvailability') e
   where e.value ->> 'user_id' <> 'dc000000-0000-4000-a000-000000000007'))
where d.business_id = 'dc000000-0000-4000-b000-000000000001';

------------------------------------------------------------------------------
-- The ranges themselves

select is(
  private.demo_sample_ranges('dc000000-0000-4000-b000-000000000001', '2032-01-04', $json$
    [{ "weekday": 5, "start": "08:00", "end": "12:00" },
     { "weekday": 6, "start": "20:00", "end": "23:00" },
     { "weekday": 7, "start": "09:00", "end": "17:00" },
     { "weekday": 0, "start": "09:00", "end": "17:00" }]
  $json$),
  '[{"day": "2032-01-04", "start": "09:00", "end": "17:00"}]'::jsonb,
  'past the last Shabbat it knows, Friday and Saturday are left out, and so is a day that isn''t one'
);
select is(
  private.demo_sample_ranges('dc000000-0000-4000-b000-000000000002', '2032-01-05', $json$
    [{ "weekday": 6, "start": "20:00", "end": "23:00" }]
  $json$),
  '[{"day": "2032-01-10", "start": "20:00", "end": "23:00"}]'::jsonb,
  'open on Shabbat, it needs no Shabbat times'
);
select is(
  private.demo_sample_ranges('dc000000-0000-4000-b000-000000000001', pg_temp.x_day(0), '"not a list"'::jsonb),
  '[]'::jsonb,
  'what isn''t a list of ranges gives none'
);

------------------------------------------------------------------------------
-- After a reset

-- A reset takes the week with the business; here the week alone goes, and
-- with it every answer for it.
delete from public.schedule_weeks w
where w.business_id = 'dc000000-0000-4000-b000-000000000001';

set local role service_role;
insert into calls values ('after reset', public.renew_demo_availability());
reset role;

select is(
  (select written from calls where name = 'after reset'), 4,
  'once the week is gone, the next call sends the sample again, for those who had sent their own too'
);
select is(
  pg_temp.ranges_of('dc000000-0000-4000-a000-000000000004'),
  pg_temp.x_day(2)::text || ' 09:00-17:00',
  'with the sample''s hours'
);

------------------------------------------------------------------------------
-- Nothing else

select is(
  (select count(*) from public.audit_log),
  (select n from counts where name = 'log'),
  'no row of the log'
);
select is(
  (select count(*) from public.notifications),
  (select n from counts where name = 'lines'),
  'no notification'
);
select is(
  (select count(*) from public.push_deliveries),
  (select n from counts where name = 'pushes'),
  'and no push'
);

select * from finish();
rollback;
