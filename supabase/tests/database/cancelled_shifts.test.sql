-- Cancelled shifts (20261117000200_cancelled_shifts.sql): whoever edits the
-- clock (an owner, a manager, a role given clock.edit) cancels a shift with
-- why and brings it back, with the secret key only; a worker, another
-- business, a manager's own shift and a cancel without a reason are refused.
-- The row and its breaks stay, with who, when and why, and the person still
-- reads it. A cancelled shift makes way for the right one, which it then
-- can't come back over. An open one is ended by its cancel (a day after it
-- began at most, its break cut there and logged), the person clocks in
-- again, and it comes back open with its break once nothing else is open,
-- only while they are on the staff. One with a break after its first day is
-- corrected first.
-- Corrections, confirmations and taking a clock-out back refuse a cancelled
-- shift. The log keeps each cancel and restore, one in a closed month tells
-- its closer and the accountants, the shift's lines settle and its
-- confirmation comes back, and the payroll reminder counts live shifts only.
-- Fixed ids (b5…), numbers (050-056-xxxx) and times (February 2027), so
-- nothing here meets the seed or another test, or the real clock.
begin;
select plan(49);

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('b5000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'b5000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'b5000000-0000-4000-b000-000000000002'::uuid
$$;

insert into auth.users (id, aud, role, phone)
select pg_temp.p(n), 'authenticated', 'authenticated', '97250056' || lpad(n::text, 4, '0')
from generate_series(1, 7) as n;

-- A: 1 owner, 2 manager, 3 and 5 workers, 4 a worker in A's role "Clock
-- lead", which edits the clock, and 6 the accountant. B: 7 its owner. A asks
-- for a punch code, so a worker's punch without one waits for a confirmation.
insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'cancelled-shifts-a', 'Cancelled shifts A'),
  (pg_temp.b(), 'cancelled-shifts-b', 'Cancelled shifts B');
insert into public.memberships (business_id, user_id, role, perms)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', '{}'),
  (pg_temp.a(), pg_temp.p(2), 'manager', '{}'),
  (pg_temp.a(), pg_temp.p(3), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(4), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(5), 'worker', '{}'),
  (pg_temp.a(), pg_temp.p(6), 'accountant', '{}'),
  (pg_temp.b(), pg_temp.p(7), 'owner', '{}');
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'time_clock', true, '{"requirePunchCode": true}'),
  (pg_temp.a(), 'notifications', true, '{}'),
  (pg_temp.b(), 'time_clock', true, '{}'),
  (pg_temp.b(), 'notifications', true, '{}');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to service_role, authenticated;

create function pg_temp.id(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
-- A person as the tests name them: p1 for pg_temp.p(1).
create function pg_temp.who(person uuid) returns text language sql as $$
  select 'p' || ltrim(right(person::text, 12), '0')
$$;
-- A moment as the tests write it: its day of the month and its time (UTC).
create function pg_temp.at(moment timestamptz) returns text language sql as $$
  select to_char(moment at time zone 'UTC', 'DD HH24:MI')
$$;
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
-- A saved shift: its times, what its end rests on, whether it is cancelled
-- (when, by whom and why), whether the cancel ended it, when it came back,
-- and its breaks.
create function pg_temp.state(saved text) returns text language sql as $$
  select concat_ws(' ',
    pg_temp.at(e.clock_in) || '-' || coalesce(pg_temp.at(e.clock_out), 'open'),
    'out:' || coalesce(e.out_proof, '-'),
    case
      when e.cancelled_at is null then 'live'
      else 'cancelled ' || pg_temp.at(e.cancelled_at) || ' by '
        || coalesce(pg_temp.who(e.cancelled_by), 'nobody') || ': ' || e.cancel_reason
    end,
    case when e.cancelled_open then 'was open' end,
    case when e.restored_at is not null then 'restored ' || pg_temp.at(e.restored_at) end,
    'breaks:' || coalesce((
      select string_agg(
        pg_temp.at(b.started_at) || '-' || coalesce(pg_temp.at(b.ended_at), 'open'),
        ',' order by b.started_at)
      from public.time_breaks b
      where b.entry_id = e.id
    ), 'none'))
  from public.time_entries e
  where e.id = pg_temp.id(saved)
$$;
-- A's lines of one key, by person: open or settled, and read or not.
create function pg_temp.lines(dedupe text) returns text language sql as $$
  select coalesce(string_agg(
      pg_temp.who(n.user_id) || ' '
        || case when n.resolved_at is null then 'open' else 'settled' end
        || case when n.read_at is null then '' else ' read' end,
      ', ' order by n.user_id),
    'none')
  from public.notifications n
  where n.business_id = pg_temp.a() and n.dedupe_key = dedupe
$$;
-- The lines of a kind about a saved shift: clock.confirm, clock.open or
-- clock.overdue.
create function pg_temp.about(what text, saved text) returns text language sql as $$
  select pg_temp.lines(what || ':' || pg_temp.id(saved)::text)
$$;
-- The newest log row of an action about a saved shift, with who wrote it.
create function pg_temp.logged(what text, saved text) returns jsonb language sql as $$
  select a.details || jsonb_build_object('by', pg_temp.who(a.actor_id))
  from public.audit_log a
  where a.action = what and a.details ->> 'entry' = pg_temp.id(saved)::text
  order by a.id desc
  limit 1
$$;

-- Shifts written before any of this: 3's of 20 January, the owner's and the
-- manager's own of 2 February, and 7's of 10 February at B.
insert into ids values
  ('jan', 'b5000000-0000-4000-e000-000000000001'),
  ('own1', 'b5000000-0000-4000-e000-000000000002'),
  ('own2', 'b5000000-0000-4000-e000-000000000003'),
  ('b7', 'b5000000-0000-4000-e000-000000000004');
insert into public.time_entries (id, business_id, user_id, clock_in, clock_out, in_proof, out_proof)
values
  (pg_temp.id('jan'), pg_temp.a(), pg_temp.p(3),
    '2027-01-20 06:00+00', '2027-01-20 14:00+00', 'off', 'off'),
  (pg_temp.id('own1'), pg_temp.a(), pg_temp.p(1),
    '2027-02-02 06:00+00', '2027-02-02 14:00+00', 'off', 'off'),
  (pg_temp.id('own2'), pg_temp.a(), pg_temp.p(2),
    '2027-02-02 06:00+00', '2027-02-02 14:00+00', 'off', 'off'),
  (pg_temp.id('b7'), pg_temp.b(), pg_temp.p(7),
    '2027-02-10 06:00+00', '2027-02-10 14:00+00', 'off', 'off');

-- A's "Clock lead", on workers, edits the clock; 4 holds it.
insert into ids values ('lead', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Clock lead'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'clock.edit', true, pg_temp.id('lead'));
update public.memberships m set named_role = pg_temp.id('lead')
where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(4);

------------------------------------------------------------------------------
-- Who may call what (1)

select ok(
  has_function_privilege('service_role', 'public.cancel_time_entry(uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.restore_time_entry(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.cancel_time_entry(uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.cancel_time_entry(uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.restore_time_entry(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.restore_time_entry(uuid, uuid, timestamptz)', 'execute'),
  'only the server cancels a shift and brings one back'
);

------------------------------------------------------------------------------
-- Who may (11)

-- 3 punches without a code on 1 February, 06:00 to 14:00, with a break from
-- 10:00 to 10:30.
set local role service_role;
insert into ids values ('done',
  public.clock_in(pg_temp.p(3), pg_temp.a(), null, '2027-02-01 06:00+00', null, true));
select public.start_break(pg_temp.p(3), pg_temp.a(), '2027-02-01 10:00+00');
select public.end_break(pg_temp.p(3), pg_temp.a(), '2027-02-01 10:30+00');
select public.clock_out(pg_temp.p(3), pg_temp.a(), null, '2027-02-01 14:00+00', null, true);
reset role;
select is(
  pg_temp.about('clock.confirm', 'done'),
  'p1 open, p2 open, p4 open',
  'hours punched without a code wait for everyone who edits the clock'
);

set local role service_role;
select throws_ok(
  $$select public.cancel_time_entry(pg_temp.p(3), pg_temp.id('done'), 'Not mine', '2027-02-03 08:00+00')$$,
  '42501', 'Managers and owners only', 'a worker cannot cancel a shift'
);
select throws_ok(
  $$select public.cancel_time_entry(pg_temp.p(7), pg_temp.id('done'), 'Not ours', '2027-02-03 08:00+00')$$,
  '42501', 'Managers and owners only', 'nor the owner of another business'
);
select throws_ok(
  $$select public.cancel_time_entry(pg_temp.p(2), gen_random_uuid(), 'No such shift', '2027-02-03 08:00+00')$$,
  'P0002', 'Unknown entry', 'an unknown shift cannot be cancelled'
);
select throws_ok(
  $$select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('done'), '   ', '2027-02-03 08:00+00')$$,
  '22023', 'A cancel needs its reason', 'a cancel needs its reason'
);
select throws_ok(
  $$select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('own2'), 'My mistake', '2027-02-03 08:00+00')$$,
  '42501', 'Only an owner cancels or changes your own hours',
  'a manager cannot cancel their own shift'
);
select lives_ok(
  $$select public.cancel_time_entry(pg_temp.p(1), pg_temp.id('own1'), 'My mistake', '2027-02-03 08:00+00')$$,
  'an owner cancels their own'
);
select lives_ok(
  $$select public.restore_time_entry(pg_temp.p(1), pg_temp.id('own1'), '2027-02-03 08:05+00')$$,
  'and brings it back'
);
select lives_ok(
  $$select public.cancel_time_entry(pg_temp.p(1), pg_temp.id('own2'), 'Not that day', '2027-02-03 08:10+00')$$,
  'an owner cancels a manager''s shift'
);
select throws_ok(
  $$select public.restore_time_entry(pg_temp.p(2), pg_temp.id('own2'), '2027-02-03 08:15+00')$$,
  '42501', 'Only an owner cancels or changes your own hours',
  'which the manager cannot bring back'
);
select throws_ok(
  $$select public.restore_time_entry(pg_temp.p(3), pg_temp.id('own2'), '2027-02-03 08:15+00')$$,
  '42501', 'Managers and owners only', 'nor can a worker'
);
reset role;

------------------------------------------------------------------------------
-- A manager cancels 3's shift of 1 February (6)

set local role service_role;
select lives_ok(
  $$select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('done'), '  Wrong person  ',
    '2027-02-03 09:00+00')$$,
  'a manager cancels a worker''s shift, with why'
);
select throws_ok(
  $$select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('done'), 'Again', '2027-02-03 09:01+00')$$,
  '55000', 'The shift is cancelled', 'a cancelled shift is not cancelled again'
);
reset role;
select is(
  pg_temp.state('done'),
  '01 06:00-01 14:00 out:none cancelled 03 09:00 by p2: Wrong person breaks:01 10:00-01 10:30',
  'the shift and its break stay, with who cancelled it, when and why'
);
select is(
  pg_temp.logged('clock.cancel', 'done'),
  jsonb_build_object('entry', pg_temp.id('done'), 'person', pg_temp.p(3),
    'clock_in', '2027-02-01 06:00+00'::timestamptz,
    'clock_out', '2027-02-01 14:00+00'::timestamptz,
    'note', 'Wrong person', 'by', 'p2'),
  'the log keeps the cancel: whose shift, its times and why'
);
select is(
  pg_temp.about('clock.confirm', 'done'),
  'p1 settled read, p2 settled read, p4 settled read',
  'and nobody is asked to confirm it any more'
);
select pg_temp.sign_in(pg_temp.p(3));
select is(
  (select count(*)::integer || ' ' || min(e.cancel_reason)
   from public.time_entries e where e.id = pg_temp.id('done')),
  '1 Wrong person',
  'the person still reads their cancelled shift, and why'
);
reset role;

------------------------------------------------------------------------------
-- The time is free again, and nothing changes a cancelled shift (5)

set local role service_role;
select lives_ok(
  $$insert into ids values ('right', public.add_time_entry(pg_temp.p(2), pg_temp.a(), pg_temp.p(3),
    '2027-02-01 07:00+00', '2027-02-01 15:00+00', 'The right hours', '2027-02-03 09:05+00'))$$,
  'the right shift goes over the cancelled one'
);
select throws_ok(
  $$select public.restore_time_entry(pg_temp.p(2), pg_temp.id('done'), '2027-02-03 09:10+00')$$,
  '23P01', null, 'and the cancelled one cannot come back over it'
);
select throws_ok(
  $$select public.restore_time_entry(pg_temp.p(2), pg_temp.id('right'), '2027-02-03 09:10+00')$$,
  '55000', 'The shift is not cancelled', 'a live shift is not brought back'
);
select throws_ok(
  $$select public.correct_time_entry(pg_temp.p(2), pg_temp.id('done'),
    '2027-02-01 06:00+00', '2027-02-01 13:00+00', 'Left early', '2027-02-03 10:00+00')$$,
  '55000', 'The shift is cancelled', 'a cancelled shift is not corrected'
);
select throws_ok(
  $$select public.confirm_time_entry(pg_temp.p(1), pg_temp.id('done'), '2027-02-03 10:00+00')$$,
  '55000', 'The shift is cancelled', 'nor confirmed'
);
reset role;

------------------------------------------------------------------------------
-- A shift still open (11)

-- 5 clocks in without a code on 4 February at 06:00 and goes on a break at
-- 10:00. The reminder to clock out is written as the minute job writes it
-- (private.notify, its key).
set local role service_role;
insert into ids values ('open',
  public.clock_in(pg_temp.p(5), pg_temp.a(), null, '2027-02-04 06:00+00', null, true));
select public.start_break(pg_temp.p(5), pg_temp.a(), '2027-02-04 10:00+00');
reset role;
select private.notify(pg_temp.a(), array[pg_temp.p(5)], 'clock.open',
  jsonb_build_object('entry', pg_temp.id('open')),
  about => 'time_clock', dedupe => 'clock.open:' || pg_temp.id('open')::text,
  realert => false, at_time => '2027-02-04 11:00+00');

set local role service_role;
select lives_ok(
  $$select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('open'), 'Clocked in by mistake',
    '2027-02-04 12:00+00')$$,
  'a manager cancels a shift still open'
);
reset role;
select is(
  pg_temp.state('open'),
  '04 06:00-04 12:00 out:manager cancelled 04 12:00 by p2: Clocked in by mistake was open'
    || ' breaks:04 10:00-04 12:00',
  'the cancel ends it then, and its break with it'
);
select is(
  pg_temp.logged('clock.cancel', 'open'),
  jsonb_build_object('entry', pg_temp.id('open'), 'person', pg_temp.p(5),
    'clock_in', '2027-02-04 06:00+00'::timestamptz, 'clock_out', null,
    'ended_at', '2027-02-04 12:00+00'::timestamptz,
    'note', 'Clocked in by mistake', 'by', 'p2'),
  'the log says it was open, and where the cancel ended it'
);
select is(
  'open: ' || pg_temp.about('clock.open', 'open')
    || ' | confirm: ' || pg_temp.about('clock.confirm', 'open'),
  'open: p5 settled read | confirm: p1 settled read, p2 settled read, p4 settled read',
  'the reminder to clock out settles, and so does the confirmation'
);

set local role service_role;
select lives_ok(
  $$insert into ids values ('again',
    public.clock_in(pg_temp.p(5), pg_temp.a(), null, '2027-02-04 12:30+00', null, true))$$,
  'the person can clock in again'
);
select throws_ok(
  $$select public.restore_time_entry(pg_temp.p(2), pg_temp.id('open'), '2027-02-04 12:35+00')$$,
  '23P01', null, 'and while they are, the cancelled shift cannot come back open'
);
select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('again'), 'Clocked in twice',
  '2027-02-04 12:40+00');
select throws_ok(
  $$select public.undo_clock_out(pg_temp.p(5), pg_temp.id('again'), '2027-02-04 12:41+00')$$,
  '55000', 'The shift is cancelled', 'the end a cancel set is no clock-out to take back'
);
select lives_ok(
  $$select public.restore_time_entry(pg_temp.p(2), pg_temp.id('open'), '2027-02-04 12:45+00')$$,
  'with nothing else open, the cancelled shift comes back'
);
reset role;
select is(
  pg_temp.state('open'),
  '04 06:00-open out:- live restored 04 12:45 breaks:04 10:00-open',
  'open again, and so is its break'
);
select is(
  pg_temp.logged('clock.restore', 'open'),
  jsonb_build_object('entry', pg_temp.id('open'), 'person', pg_temp.p(5),
    'clock_in', '2027-02-04 06:00+00'::timestamptz, 'clock_out', null,
    'reopened', true, 'by', 'p2'),
  'the log keeps the restore, and that it opened the shift again'
);
select is(
  pg_temp.about('clock.confirm', 'open'),
  'p1 open, p2 settled read, p4 open',
  'its confirmation waits again, unread, for all but whoever brought it back'
);

------------------------------------------------------------------------------
-- A shift left open more than a day (7)

-- 3 clocks in on 6 February at 06:00, goes on a break 23.5 hours later and
-- never clocks out. The line to those who edit the clock is written as the
-- minute job writes it.
set local role service_role;
insert into ids values ('long',
  public.clock_in(pg_temp.p(3), pg_temp.a(), null, '2027-02-06 06:00+00', null, true));
select public.start_break(pg_temp.p(3), pg_temp.a(), '2027-02-07 05:30+00');
reset role;
select private.notify(pg_temp.a(), array[pg_temp.p(1), pg_temp.p(2)], 'clock.overdue',
  jsonb_build_object('entry', pg_temp.id('long'), 'person', pg_temp.p(3)),
  about => 'time_clock', audience => 'manager',
  dedupe => 'clock.overdue:' || pg_temp.id('long')::text,
  realert => false, at_time => '2027-02-07 07:00+00', holders_of => 'clock.edit');

set local role service_role;
select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('long'), 'Never came in',
  '2027-02-07 09:00+00');
reset role;
select is(
  pg_temp.state('long'),
  '06 06:00-07 06:00 out:manager cancelled 07 09:00 by p2: Never came in was open'
    || ' breaks:07 05:30-07 06:00',
  'the cancel ends a shift open more than a day a day after it began, and cuts its break there'
);
select is(
  pg_temp.logged('clock.break_fit', 'long'),
  jsonb_build_object('entry', pg_temp.id('long'), 'person', pg_temp.p(3),
    'clock_in', '2027-02-06 06:00+00'::timestamptz,
    'breaks', jsonb_build_array(jsonb_build_object(
      'break', (select b.id from public.time_breaks b where b.entry_id = pg_temp.id('long')),
      'from', jsonb_build_object('start', '2027-02-07 05:30+00'::timestamptz, 'end', null),
      'to', jsonb_build_object('start', '2027-02-07 05:30+00'::timestamptz,
        'end', '2027-02-07 06:00+00'::timestamptz))),
    'by', 'p2'),
  'and the cut is logged, by whoever cancelled'
);
select is(
  pg_temp.about('clock.overdue', 'long'),
  'p1 settled read, p2 settled read',
  'its line to those who edit the clock settles'
);

-- The manager takes the cancel back at once: the shift is as it was.
set local role service_role;
select public.restore_time_entry(pg_temp.p(2), pg_temp.id('long'), '2027-02-07 09:01+00');
reset role;
select is(
  pg_temp.state('long'),
  '06 06:00-open out:- live restored 07 09:01 breaks:07 05:30-open',
  'brought back, it is open again with the break the cancel ended, as it was'
);

-- 3 ends that break at 09:03, after the shift's first day. A cancel would
-- cut it there, and so is refused until the shift's end is corrected; the
-- manager corrects it, and then cancels it.
set local role service_role;
select public.end_break(pg_temp.p(3), pg_temp.a(), '2027-02-07 09:03+00');
select throws_ok(
  $$select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('long'), 'Never came in',
    '2027-02-07 09:05+00')$$,
  '55000', 'The shift has breaks after its first day',
  'a shift with a break after its first day is not cancelled while open: its end is corrected first'
);
select public.correct_time_entry(pg_temp.p(2), pg_temp.id('long'),
  '2027-02-06 06:00+00', '2027-02-07 06:00+00', 'Forgot to clock out', '2027-02-07 09:06+00');
select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('long'), 'Never came in',
  '2027-02-07 09:07+00');
reset role;
select is(
  pg_temp.state('long'),
  '06 06:00-07 06:00 out:manager cancelled 07 09:07 by p2: Never came in breaks:07 05:30-07 06:00',
  'corrected, then cancelled: closed, its break as the correction left it'
);

-- 3 clocks in again on 12 February and the manager cancels it at once; 3
-- then leaves the staff. A shift the cancel ended doesn't come back open
-- for someone who left: they are never at work.
set local role service_role;
insert into ids values ('late',
  public.clock_in(pg_temp.p(3), pg_temp.a(), null, '2027-02-12 06:00+00', null, true));
select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('late'), 'Clocked in by mistake',
  '2027-02-12 06:10+00');
reset role;
update public.memberships m set active = false
where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(3);
set local role service_role;
select throws_ok(
  $$select public.restore_time_entry(pg_temp.p(2), pg_temp.id('late'), '2027-02-12 07:00+00')$$,
  '55000', 'The person is no longer on the staff',
  'a shift the cancel ended comes back open only for someone on the staff'
);
reset role;
update public.memberships m set active = true
where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(3);

------------------------------------------------------------------------------
-- A shift of a closed month (6)

-- The owner closes January; the clock lead cancels 3's shift of 20 January,
-- and the manager brings it back.
set local role service_role;
select public.close_payroll_month(pg_temp.p(1), pg_temp.a(), '2027-01-01',
  '{"version": 1}'::jsonb, 'cancelled-shifts', '2027-02-01 10:00+02');
select lives_ok(
  $$select public.cancel_time_entry(pg_temp.p(4), pg_temp.id('jan'), 'Not her shift',
    '2027-02-08 09:00+00')$$,
  'a role given clock.edit cancels a shift too, in a closed month'
);
reset role;
select is(
  pg_temp.logged('clock.cancel', 'jan'),
  jsonb_build_object('entry', pg_temp.id('jan'), 'person', pg_temp.p(3),
    'clock_in', '2027-01-20 06:00+00'::timestamptz,
    'clock_out', '2027-01-20 14:00+00'::timestamptz,
    'note', 'Not her shift', 'closed_month', '2027-01', 'by', 'p4'),
  'its log row names the closed month'
);
select is(
  pg_temp.lines('pay.after_close:2027-01'),
  'p1 open, p6 open',
  'and the month''s closer and the accountant are told'
);
update public.notifications n set read_at = '2027-02-08 09:30+00'
where n.business_id = pg_temp.a() and n.dedupe_key = 'pay.after_close:2027-01';

set local role service_role;
select lives_ok(
  $$select public.restore_time_entry(pg_temp.p(2), pg_temp.id('jan'), '2027-02-08 10:00+00')$$,
  'bringing it back goes through in a closed month'
);
reset role;
select is(
  pg_temp.logged('clock.restore', 'jan'),
  jsonb_build_object('entry', pg_temp.id('jan'), 'person', pg_temp.p(3),
    'clock_in', '2027-01-20 06:00+00'::timestamptz,
    'clock_out', '2027-01-20 14:00+00'::timestamptz,
    'reopened', false, 'closed_month', '2027-01', 'by', 'p2'),
  'and its log row names the month too'
);
select is(
  pg_temp.lines('pay.after_close:2027-01'),
  'p1 open, p6 open',
  'which tells them again, unread'
);

------------------------------------------------------------------------------
-- The payroll reminder counts live shifts (2)

-- 7, B's owner, cancels B's only shift of February. On 2 March, A's February
-- holds three live shifts: the owner's, the right one and 5's, open again
-- and waiting; the others are cancelled.
set local role service_role;
select public.cancel_time_entry(pg_temp.p(7), pg_temp.id('b7'), 'Test shift',
  '2027-02-11 09:00+00');
reset role;
select private.payroll_tick('2027-03-02 08:00+02');
select is(
  (select n.params from public.notifications n
   where n.business_id = pg_temp.a() and n.user_id = pg_temp.p(1)
     and n.dedupe_key = 'payroll.month:2027-02'),
  '{"month": "2027-02", "waiting": 1, "open": 1}'::jsonb,
  'February''s reminder counts only the live shifts that wait or are open'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = pg_temp.b() and n.kind = 'pay.month_due'),
  0,
  'and a month whose shifts were all cancelled has none'
);

select * from finish();
rollback;
