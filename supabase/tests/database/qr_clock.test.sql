-- QR clock-in (20261108000200_qr_clock.sql): codes live a minute and carry
-- digits to type; nobody uses a code they show; owners need none; a typed
-- code is counted first and five wrong ones block typing; without a code is
-- allowed, marked, and confirmed by someone else; stations pair from a
-- manager's phone, show codes with no one's account, stop and restart; the
-- business chooses where codes come from; nobody reads a station's token.
-- Every call passes the time so the test does not depend on today.
begin;
select plan(51);

create function pg_temp.h(t text) returns text language sql as $$
  select encode(sha256(convert_to(t, 'utf8')), 'hex')
$$;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to service_role, authenticated;

insert into auth.users (id, aud, role, phone)
values
  ('6a000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000951'),
  ('6a000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000952'),
  ('6a000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000953'),
  ('6a000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000954'),
  ('6a000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000955'),
  ('6a000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000956');

-- a: owner of X; b: manager of X; c, d, f: workers of X; e: worker of Y.
insert into public.businesses (id, slug, name)
values
  ('6a000000-0000-4000-b000-000000000001', 'qr-x', 'QR X'),
  ('6a000000-0000-4000-b000-000000000002', 'qr-y', 'QR Y');

insert into public.memberships (business_id, user_id, role, active, perms)
values
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000a', 'owner', true, '{}'),
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000b', 'manager', true, '{}'),
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000c', 'worker', true, '{}'),
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000d', 'worker', true, '{}'),
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000f', 'worker', true, '{}'),
  ('6a000000-0000-4000-b000-000000000002', '6a000000-0000-4000-a000-00000000000e', 'worker', true, '{}');

-- X needs a code and shows it anywhere; Y needs none.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('6a000000-0000-4000-b000-000000000001', 'time_clock', true, '{"requirePunchCode": true, "codeDisplay": "both"}'),
  ('6a000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');

-- Only the server calls these.
select pg_temp.sign_in('6a000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$select public.start_station_pairing(repeat('1', 64), repeat('2', 64), repeat('3', 64), '2026-11-10 07:00+00')$$,
  '42501', null, 'a signed-in manager cannot start a pairing through the function'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.issue_station_code(repeat('3', 64), repeat('4', 64), repeat('5', 64), '2026-11-10 07:00+00')$$,
  '42501', null, 'an anonymous visitor cannot fetch a station code'
);
reset role;
set local role service_role;

-- A manager's phone shows codes.
select is(
  public.issue_punch_code('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
    pg_temp.h('m1'), '2026-11-10 08:00+00', pg_temp.h('m1s')),
  '2026-11-10 08:01+00'::timestamptz,
  'a code lives a minute'
);
select throws_ok(
  $$select public.clock_in('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
    pg_temp.h('m1'), '2026-11-10 08:00:05+00')$$,
  '28000', 'A code you showed yourself does not count', 'nobody uses a code they show themselves'
);
insert into ids values ('c1', public.clock_in('6a000000-0000-4000-a000-00000000000c',
  '6a000000-0000-4000-b000-000000000001', pg_temp.h('m1'), '2026-11-10 08:00:05+00'));
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'c1')),
  'scan',
  'a worker scans the manager''s code'
);
select public.issue_punch_code('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
  pg_temp.h('m' || n), '2026-11-10 08:00+00'::timestamptz + n * interval '10 seconds', pg_temp.h('m' || n || 's'))
from generate_series(2, 5) n;
select is(
  (select count(*)::int from public.punch_codes
   where issued_by = '6a000000-0000-4000-a000-00000000000b'),
  4,
  'one phone keeps at most four live codes'
);

-- Owners need no code; where none is needed, none is asked.
insert into ids values ('a1', public.clock_in('6a000000-0000-4000-a000-00000000000a',
  '6a000000-0000-4000-b000-000000000001', null, '2026-11-10 08:05+00'));
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'a1')),
  'owner',
  'an owner clocks in with no code'
);
insert into ids values ('e1', public.clock_in('6a000000-0000-4000-a000-00000000000e',
  '6a000000-0000-4000-b000-000000000002', null, '2026-11-10 08:05+00'));
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'e1')),
  'off',
  'where no code is needed, the entry says so'
);

-- A typed code is counted first.
select throws_ok(
  $$select public.clock_in('6a000000-0000-4000-a000-00000000000d', '6a000000-0000-4000-b000-000000000001',
    null, '2026-11-10 08:00:45+00', pg_temp.h('m5s'))$$,
  '42501', 'A typed code is counted first', 'a typed code that was not counted is refused'
);
select is(
  public.note_punch_attempt('6a000000-0000-4000-a000-00000000000d', '6a000000-0000-4000-b000-000000000001',
    '2026-11-10 08:00:50+00'),
  false,
  'counting one typed code does not block'
);
insert into ids values ('d1', public.clock_in('6a000000-0000-4000-a000-00000000000d',
  '6a000000-0000-4000-b000-000000000001', null, '2026-11-10 08:00:50+00', pg_temp.h('m5s')));
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'd1')),
  'typed',
  'a worker types the digits'
);
-- The private schema is read as postgres; service_role has no access to it.
reset role;
select is(
  (select count(*)::int from private.punch_attempts
   where user_id = '6a000000-0000-4000-a000-00000000000d'),
  0,
  'a typed code that works clears the count'
);
set local role service_role;

-- Five wrong typed codes in 30 minutes block typing; scanning still works.
select public.issue_punch_code('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
  pg_temp.h('m6'), '2026-11-10 09:00+00', pg_temp.h('m6s'));
select public.note_punch_attempt('6a000000-0000-4000-a000-00000000000f', '6a000000-0000-4000-b000-000000000001',
  '2026-11-10 09:00+00'::timestamptz + n * interval '1 second')
from generate_series(1, 5) n;
select is(
  public.note_punch_attempt('6a000000-0000-4000-a000-00000000000f', '6a000000-0000-4000-b000-000000000001',
    '2026-11-10 09:00:06+00'),
  true,
  'the sixth typed code in half an hour is blocked'
);
select public.note_punch_attempt('6a000000-0000-4000-a000-00000000000f', '6a000000-0000-4000-b000-000000000001',
  '2026-11-10 09:00:07+00');
select is(
  (select count(*)::int from public.audit_log
   where action = 'clock.code.locked' and actor_id = '6a000000-0000-4000-a000-00000000000f'),
  1,
  'the block is written to the log once'
);
select throws_ok(
  $$select public.clock_in('6a000000-0000-4000-a000-00000000000f', '6a000000-0000-4000-b000-000000000001',
    null, '2026-11-10 09:00:07+00', pg_temp.h('m6s'))$$,
  '28000', 'Too many wrong codes; scan instead', 'a blocked worker cannot type even a valid code'
);
select lives_ok(
  $$select public.clock_in('6a000000-0000-4000-a000-00000000000f', '6a000000-0000-4000-b000-000000000001',
    pg_temp.h('m6'), '2026-11-10 09:00:08+00')$$,
  'a blocked worker still scans'
);

-- Without a code: allowed, marked, and confirmed by someone else.
select lives_ok(
  $$select public.clock_out('6a000000-0000-4000-a000-00000000000c', '6a000000-0000-4000-b000-000000000001',
    null, '2026-11-10 12:00+00', null, true)$$,
  'a worker clocks out without a code'
);
select is(
  (select out_proof from public.time_entries where id = (select id from ids where name = 'c1')),
  'none',
  'the entry says it was left without a code'
);
select throws_ok(
  format($$select public.confirm_time_entry('6a000000-0000-4000-a000-00000000000c', %L, '2026-11-10 12:05+00')$$,
    (select id from ids where name = 'c1')),
  '42501', 'Managers and owners only', 'a worker cannot confirm'
);
select lives_ok(
  format($$select public.confirm_time_entry('6a000000-0000-4000-a000-00000000000b', %L, '2026-11-10 12:05+00')$$,
    (select id from ids where name = 'c1')),
  'a manager confirms in one press'
);
select is(
  (select confirmed_by from public.time_entries where id = (select id from ids where name = 'c1')),
  '6a000000-0000-4000-a000-00000000000b'::uuid,
  'the entry keeps who confirmed it'
);
select throws_ok(
  format($$select public.confirm_time_entry('6a000000-0000-4000-a000-00000000000b', %L, '2026-11-10 12:05+00')$$,
    (select id from ids where name = 'd1')),
  '55000', null, 'an entry made with a code needs no confirming'
);
insert into ids values ('b1', public.clock_in('6a000000-0000-4000-a000-00000000000b',
  '6a000000-0000-4000-b000-000000000001', null, '2026-11-10 13:00+00', null, true));
select throws_ok(
  format($$select public.confirm_time_entry('6a000000-0000-4000-a000-00000000000b', %L, '2026-11-10 13:05+00')$$,
    (select id from ids where name = 'b1')),
  '42501', 'Someone else confirms your own hours', 'a manager cannot confirm their own entry'
);
select lives_ok(
  format($$select public.confirm_time_entry('6a000000-0000-4000-a000-00000000000a', %L, '2026-11-10 13:05+00')$$,
    (select id from ids where name = 'b1')),
  'the owner confirms the manager''s entry'
);
select public.clock_out('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
  null, '2026-11-10 14:00+00', null, true);
select is(
  (select confirmed_at < clock_out from public.time_entries where id = (select id from ids where name = 'b1')),
  true,
  'leaving without a code needs its own confirmation'
);
select lives_ok(
  format($$select public.undo_clock_out('6a000000-0000-4000-a000-00000000000b', %L, '2026-11-10 14:01+00')$$,
    (select id from ids where name = 'b1')),
  'the clock-out is taken back'
);
select is(
  (select out_proof is null from public.time_entries where id = (select id from ids where name = 'b1')),
  true,
  'taking a clock-out back takes its proof back'
);
select is(
  (select confirmed_by from public.time_entries where id = (select id from ids where name = 'b1')),
  '6a000000-0000-4000-a000-00000000000a'::uuid,
  'and the arrival stays confirmed'
);

-- Stations only: no codes from a phone.
update public.business_modules set settings = settings || '{"codeDisplay": "station"}'
where business_id = '6a000000-0000-4000-b000-000000000001' and module_key = 'time_clock';
select throws_ok(
  $$select public.issue_punch_code('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
    pg_temp.h('m7'), '2026-11-10 15:00+00')$$,
  '42501', 'This business shows codes on its stations only', 'with stations only, a phone shows no code'
);

-- Pairing a station from a manager's phone.
select is(
  public.start_station_pairing(pg_temp.h('p1'), pg_temp.h('p1s'), pg_temp.h('t1'), '2026-11-10 15:00+00'),
  '2026-11-10 15:05+00'::timestamptz,
  'a device asks to be paired, for five minutes'
);
select throws_ok(
  $$select public.approve_station_pairing('6a000000-0000-4000-a000-00000000000c', '6a000000-0000-4000-b000-000000000001',
    'Front door', null, pg_temp.h('p1s'), '2026-11-10 15:00:30+00')$$,
  '42501', null, 'a worker cannot pair a station'
);
insert into ids values ('st1', public.approve_station_pairing('6a000000-0000-4000-a000-00000000000b',
  '6a000000-0000-4000-b000-000000000001', 'Front door', null, pg_temp.h('p1s'), '2026-11-10 15:01+00'));
select is(
  public.station_by_token(pg_temp.h('t1')) ->> 'station',
  (select id::text from ids where name = 'st1'),
  'the device''s own secret is now the station''s token'
);
reset role;
select is(
  (select count(*)::int from private.station_pairings where pairing_hash = pg_temp.h('p1')),
  0,
  'a pairing is used once'
);
set local role service_role;
select throws_ok(
  $$select public.approve_station_pairing('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
    'Again', null, pg_temp.h('p1s'), '2026-11-10 15:01:30+00')$$,
  '28000', null, 'the same pairing cannot be approved twice'
);
select lives_ok(
  $$select public.issue_station_code(pg_temp.h('t1'), pg_temp.h('k1'), pg_temp.h('k1s'), '2026-11-10 15:02+00')$$,
  'the station fetches a code'
);
insert into ids values ('c2', public.clock_in('6a000000-0000-4000-a000-00000000000c',
  '6a000000-0000-4000-b000-000000000001', pg_temp.h('k1'), '2026-11-10 15:02:10+00'));
select is(
  (select in_proof || ' ' || (in_station = (select id from ids where name = 'st1'))::text
   from public.time_entries where id = (select id from ids where name = 'c2')),
  'scan true',
  'a worker scans the station, and the entry keeps which station'
);
select is(
  public.punch_code_showing('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
    '2026-11-10 15:02:20+00'),
  true,
  'a manager sees that a code is showing'
);
select is(
  public.punch_code_showing('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
    '2026-11-10 15:10+00'),
  false,
  'and that none is, once the codes expire'
);
select throws_ok(
  $$select public.punch_code_showing('6a000000-0000-4000-a000-00000000000c', '6a000000-0000-4000-b000-000000000001',
    '2026-11-10 15:02:20+00')$$,
  '42501', null, 'a worker cannot ask whether a code is showing'
);

-- Stopping a station, and taking it back.
select lives_ok(
  format($$select public.set_clock_station_stopped('6a000000-0000-4000-a000-00000000000b', %L, true, '2026-11-10 15:20+00')$$,
    (select id from ids where name = 'st1')),
  'a manager stops a station'
);
select throws_ok(
  $$select public.issue_station_code(pg_temp.h('t1'), pg_temp.h('k2'), pg_temp.h('k2s'), '2026-11-10 15:20:30+00')$$,
  '42501', 'This station was stopped', 'a stopped station shows no code'
);
select lives_ok(
  format($$select public.set_clock_station_stopped('6a000000-0000-4000-a000-00000000000b', %L, false, '2026-11-10 15:21+00')$$,
    (select id from ids where name = 'st1')),
  'stopping is taken back within two minutes'
);
select lives_ok(
  format($$select public.set_clock_station_stopped('6a000000-0000-4000-a000-00000000000b', %L, true, '2026-11-10 15:22+00')$$,
    (select id from ids where name = 'st1')),
  'and stopped again'
);
select throws_ok(
  format($$select public.set_clock_station_stopped('6a000000-0000-4000-a000-00000000000b', %L, false, '2026-11-10 15:30+00')$$,
    (select id from ids where name = 'st1')),
  '55000', null, 'too late to take it back after two minutes'
);

-- A manager's phone only: no stations.
update public.business_modules set settings = settings || '{"codeDisplay": "manager"}'
where business_id = '6a000000-0000-4000-b000-000000000001' and module_key = 'time_clock';
select public.start_station_pairing(pg_temp.h('p2'), pg_temp.h('p2s'), pg_temp.h('t2'), '2026-11-10 16:00+00');
select throws_ok(
  $$select public.approve_station_pairing('6a000000-0000-4000-a000-00000000000b', '6a000000-0000-4000-b000-000000000001',
    'Back door', pg_temp.h('p2'), null, '2026-11-10 16:01+00')$$,
  '42501', 'This business shows codes on a manager''s phone only', 'with phones only, no station is paired'
);
reset role;

-- Who reads stations, and nobody reads their tokens.
select pg_temp.sign_in('6a000000-0000-4000-a000-00000000000c');
select is((select count(*)::int from public.clock_stations), 0, 'a worker reads no stations');
reset role;
select pg_temp.sign_in('6a000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from public.clock_stations), 1, 'a manager reads the business''s stations');
select throws_ok(
  'select token_hash from public.clock_stations',
  '42501', null, 'nobody reads a station''s token'
);
reset role;

-- The log.
select results_eq(
  $$select action, count(*)::int from public.audit_log
    where business_id = '6a000000-0000-4000-b000-000000000001' and action like 'clock.station.%'
    group by action order by action$$,
  $$values ('clock.station.add', 1), ('clock.station.restart', 1), ('clock.station.stop', 2)$$,
  'adding, stopping and restarting stations are in the log'
);
select is(
  (select details -> 'proof' ->> 'proof' from public.audit_log
   where action = 'clock.in' and details ->> 'entry' = (select id::text from ids where name = 'c1')),
  'scan',
  'each punch''s proof is in its log row'
);
select is(
  (select count(*)::int from public.audit_log
   where action = 'clock.confirm' and business_id = '6a000000-0000-4000-b000-000000000001'),
  2,
  'each confirmation is in the log'
);

select * from finish();
rollback;
