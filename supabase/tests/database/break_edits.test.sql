-- Break edits (20261117000300_break_edits.sql): whoever edits the clock (an
-- owner, a manager, a role given clock.edit) changes a break's times, adds a
-- forgotten one and removes one, each with why, and takes a removal back for
-- ten minutes, with the secret key only; a worker, another business, a
-- manager's own shift and an edit without a reason are refused, and so are a
-- cancelled shift's breaks and a break still running. A break stays inside
-- its shift, never in the future and never over another live break. A
-- changed break keeps whether it is paid, a new one takes the setting, and
-- each edit marks its shift as corrected, so its clock-out can't be taken
-- back. A removed break stays, marked, with its times: corrections don't
-- move, cut or delete it, and neither a cancel and a restore, a clock-out nor
-- a clock-out taken back opens it again. The log keeps each edit, and an
-- unpaid break's in a closed month tells its closer and the accountants.
-- Fixed ids (b6…), numbers (050-057-xxxx) and times (March 2027), so
-- nothing here meets the seed or another test, or the real clock.
begin;
select plan(64);

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('b6000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'b6000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'b6000000-0000-4000-b000-000000000002'::uuid
$$;

insert into auth.users (id, aud, role, phone)
select pg_temp.p(n), 'authenticated', 'authenticated', '97250057' || lpad(n::text, 4, '0')
from generate_series(1, 7) as n;

-- A: 1 owner, 2 manager, 3 and 5 workers, 4 a worker in A's role "Clock
-- lead", which edits the clock, and 6 the accountant. B: 7 its owner. A asks
-- for no punch code, and its breaks are paid until it says otherwise.
insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'break-edits-a', 'Break edits A'),
  (pg_temp.b(), 'break-edits-b', 'Break edits B');
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
  (pg_temp.a(), 'time_clock', true, '{}'),
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
-- A break's times as the log keeps them.
create function pg_temp.span(s timestamptz, f timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('start', s, 'end', f)
$$;
-- A saved shift's breaks, by their start: their times, whether they are
-- paid, and when and by whom each removed one was removed.
create function pg_temp.breaks(saved text) returns text language sql as $$
  select coalesce(string_agg(
      pg_temp.at(b.started_at) || '-' || coalesce(pg_temp.at(b.ended_at), 'open')
        || case when b.unpaid then ' unpaid' else ' paid' end
        || case
          when b.removed_at is null then ''
          else ' removed ' || pg_temp.at(b.removed_at) || ' by '
            || coalesce(pg_temp.who(b.removed_by), 'nobody')
        end,
      ', ' order by b.started_at, b.removed_at nulls first),
    'none')
  from public.time_breaks b
  where b.entry_id = pg_temp.id(saved)
$$;
-- Whether a saved shift reads as corrected: when, by whom and why.
create function pg_temp.stamp(saved text) returns text language sql as $$
  select coalesce('edited ' || pg_temp.at(e.edited_at) || ' by '
      || coalesce(pg_temp.who(e.edited_by), 'nobody') || ': ' || coalesce(e.note, '-'),
    'not edited')
  from public.time_entries e
  where e.id = pg_temp.id(saved)
$$;
-- The newest clock.break_edit row about a saved break, with who wrote it.
create function pg_temp.logged(saved text) returns jsonb language sql as $$
  select a.details || jsonb_build_object('by', pg_temp.who(a.actor_id))
  from public.audit_log a
  where a.action = 'clock.break_edit' and a.details ->> 'break' = pg_temp.id(saved)::text
  order by a.id desc
  limit 1
$$;
-- How many trims (clock.break_fit) the log keeps of a saved shift.
create function pg_temp.trims(saved text) returns integer language sql as $$
  select count(*)::integer
  from public.audit_log a
  where a.action = 'clock.break_fit' and a.details ->> 'entry' = pg_temp.id(saved)::text
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
-- The hint a call is refused with, for the screens' words.
create function pg_temp.hint_of(query_text text) returns text language plpgsql as $$
declare
  found_hint text;
begin
  execute query_text;
  return 'none';
exception when others then
  get stacked diagnostics found_hint = pg_exception_hint;
  return found_hint;
end;
$$;

-- Shifts written before any of this: 3's of 10 February, with a paid break
-- and an unpaid one; the owner's and the manager's own of 2 March; and 5's
-- of 3 March. Each with a break.
insert into ids values
  ('feb', 'b6000000-0000-4000-e000-000000000001'),
  ('own1', 'b6000000-0000-4000-e000-000000000002'),
  ('own2', 'b6000000-0000-4000-e000-000000000003'),
  ('gone', 'b6000000-0000-4000-e000-000000000004'),
  ('feb_paid', 'b6000000-0000-4000-f000-000000000001'),
  ('feb_unpaid', 'b6000000-0000-4000-f000-000000000002'),
  ('own1_b', 'b6000000-0000-4000-f000-000000000003'),
  ('own2_b', 'b6000000-0000-4000-f000-000000000004'),
  ('gone_b', 'b6000000-0000-4000-f000-000000000005');
insert into public.time_entries (id, business_id, user_id, clock_in, clock_out, in_proof, out_proof)
values
  (pg_temp.id('feb'), pg_temp.a(), pg_temp.p(3),
    '2027-02-10 06:00+00', '2027-02-10 14:00+00', 'off', 'off'),
  (pg_temp.id('own1'), pg_temp.a(), pg_temp.p(1),
    '2027-03-02 06:00+00', '2027-03-02 14:00+00', 'off', 'off'),
  (pg_temp.id('own2'), pg_temp.a(), pg_temp.p(2),
    '2027-03-02 06:00+00', '2027-03-02 14:00+00', 'off', 'off'),
  (pg_temp.id('gone'), pg_temp.a(), pg_temp.p(5),
    '2027-03-03 06:00+00', '2027-03-03 14:00+00', 'off', 'off');
insert into public.time_breaks (id, entry_id, business_id, user_id, started_at, ended_at, unpaid)
values
  (pg_temp.id('feb_paid'), pg_temp.id('feb'), pg_temp.a(), pg_temp.p(3),
    '2027-02-10 10:00+00', '2027-02-10 10:30+00', false),
  (pg_temp.id('feb_unpaid'), pg_temp.id('feb'), pg_temp.a(), pg_temp.p(3),
    '2027-02-10 12:00+00', '2027-02-10 12:30+00', true),
  (pg_temp.id('own1_b'), pg_temp.id('own1'), pg_temp.a(), pg_temp.p(1),
    '2027-03-02 10:00+00', '2027-03-02 10:30+00', false),
  (pg_temp.id('own2_b'), pg_temp.id('own2'), pg_temp.a(), pg_temp.p(2),
    '2027-03-02 10:00+00', '2027-03-02 10:30+00', false),
  (pg_temp.id('gone_b'), pg_temp.id('gone'), pg_temp.a(), pg_temp.p(5),
    '2027-03-03 10:00+00', '2027-03-03 10:30+00', false);

-- A's "Clock lead", on workers, edits the clock; 4 holds it.
insert into ids values ('lead', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Clock lead'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'clock.edit', true, pg_temp.id('lead'));
update public.memberships m set named_role = pg_temp.id('lead')
where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(4);

-- 3 punches on 1 March, 06:00 to 14:00, with a break from 10:00 to 10:30,
-- paid as A's breaks are then. A then takes breaks off the hours.
set local role service_role;
insert into ids values ('day', public.clock_in(pg_temp.p(3), pg_temp.a(), null, '2027-03-01 06:00+00'));
insert into ids values ('b1', public.start_break(pg_temp.p(3), pg_temp.a(), '2027-03-01 10:00+00'));
select public.end_break(pg_temp.p(3), pg_temp.a(), '2027-03-01 10:30+00');
select public.clock_out(pg_temp.p(3), pg_temp.a(), null, '2027-03-01 14:00+00');
reset role;
update public.business_modules set settings = '{"unpaidBreaks": true}'
where business_id = pg_temp.a() and module_key = 'time_clock';

------------------------------------------------------------------------------
-- Who may call what (2)

select ok(
  has_function_privilege('service_role', 'public.add_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.change_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.remove_time_break(uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.restore_time_break(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.add_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.add_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.change_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.change_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.remove_time_break(uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.remove_time_break(uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.restore_time_break(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.restore_time_break(uuid, uuid, timestamptz)', 'execute'),
  'only the server edits a break'
);
select ok(
  not has_function_privilege('service_role', 'private.check_break_fits(public.time_entries, timestamptz, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'private.check_break_fits(public.time_entries, timestamptz, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'private.record_break_edit(uuid, public.time_entries, uuid, text, jsonb, jsonb, boolean, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'private.record_break_edit(uuid, public.time_entries, uuid, text, jsonb, jsonb, boolean, text, timestamptz)', 'execute'),
  'and their helpers run only inside them'
);

------------------------------------------------------------------------------
-- Who may (10)

set local role service_role;
select throws_ok(
  $$select public.add_time_break(pg_temp.p(3), pg_temp.id('day'), '2027-03-01 12:00+00',
    '2027-03-01 12:30+00', 'Lunch', '2027-03-03 08:00+00')$$,
  '42501', 'Managers and owners only', 'a worker cannot add a break, not even to their own shift'
);
select throws_ok(
  $$select public.change_time_break(pg_temp.p(7), pg_temp.id('b1'), '2027-03-01 10:00+00',
    '2027-03-01 10:45+00', 'Not ours', '2027-03-03 08:00+00')$$,
  '42501', 'Managers and owners only', 'nor can the owner of another business change one'
);
select throws_ok(
  $$select public.remove_time_break(pg_temp.p(2), gen_random_uuid(), 'No such break',
    '2027-03-03 08:00+00')$$,
  'P0002', 'Unknown break', 'an unknown break cannot be removed'
);
select throws_ok(
  $$select public.add_time_break(pg_temp.p(2), gen_random_uuid(), '2027-03-01 12:00+00',
    '2027-03-01 12:30+00', 'Lunch', '2027-03-03 08:00+00')$$,
  'P0002', 'Unknown entry', 'nor a break added to an unknown shift'
);
select throws_ok(
  $$select public.change_time_break(pg_temp.p(2), pg_temp.id('b1'), '2027-03-01 10:00+00',
    '2027-03-01 10:45+00', '   ', '2027-03-03 08:00+00')$$,
  '22023', 'A break edit needs its reason', 'a break edit needs its reason'
);
select throws_ok(
  $$select public.change_time_break(pg_temp.p(2), pg_temp.id('own2_b'), '2027-03-02 10:00+00',
    '2027-03-02 10:15+00', 'A short one', '2027-03-03 08:00+00')$$,
  '42501', 'Only an owner cancels or changes your own hours',
  'a manager cannot change a break of their own shift'
);
select lives_ok(
  $$select public.change_time_break(pg_temp.p(1), pg_temp.id('own1_b'), '2027-03-02 10:00+00',
    '2027-03-02 10:15+00', 'A short one', '2027-03-03 08:00+00')$$,
  'an owner changes one of their own'
);
select lives_ok(
  $$select public.remove_time_break(pg_temp.p(1), pg_temp.id('own2_b'), 'Not taken',
    '2027-03-03 08:01+00')$$,
  'and removes one of a manager''s shift'
);
select throws_ok(
  $$select public.restore_time_break(pg_temp.p(2), pg_temp.id('own2_b'), '2027-03-03 08:02+00')$$,
  '42501', 'Only an owner cancels or changes your own hours',
  'which the manager cannot bring back'
);
select throws_ok(
  $$select public.restore_time_break(pg_temp.p(3), pg_temp.id('own2_b'), '2027-03-03 08:02+00')$$,
  '42501', 'Managers and owners only', 'nor can a worker'
);
reset role;

------------------------------------------------------------------------------
-- A manager changes the break of 3's shift of 1 March (5)

set local role service_role;
select lives_ok(
  $$select public.change_time_break(pg_temp.p(2), pg_temp.id('b1'), '2027-03-01 10:00+00',
    '2027-03-01 10:45+00', '  Came back late  ', '2027-03-03 09:00+00')$$,
  'a manager changes a break''s times, with why'
);
reset role;
select is(
  pg_temp.breaks('day'),
  '01 10:00-01 10:45 paid',
  'the break has its new times, and stays paid as it was taken, whatever the setting says now'
);
select is(
  pg_temp.stamp('day'),
  'edited 03 09:00 by p2: Came back late',
  'its shift reads as corrected, by whom and why'
);
select is(
  pg_temp.logged('b1'),
  jsonb_build_object('entry', pg_temp.id('day'), 'person', pg_temp.p(3),
    'clock_in', '2027-03-01 06:00+00'::timestamptz, 'break', pg_temp.id('b1'),
    'change', 'change',
    'from', pg_temp.span('2027-03-01 10:00+00', '2027-03-01 10:30+00'),
    'to', pg_temp.span('2027-03-01 10:00+00', '2027-03-01 10:45+00'),
    'unpaid', false, 'note', 'Came back late', 'by', 'p2'),
  'the log keeps the change: the break, its times before and after, and why'
);
set local role service_role;
select throws_ok(
  $$select public.undo_clock_out(pg_temp.p(3), pg_temp.id('day'), '2027-03-01 14:01+00')$$,
  '55000', 'Too late to take it back',
  'and the person can no longer take back their clock-out'
);
reset role;

------------------------------------------------------------------------------
-- What a break's times must be, and a forgotten one added (9)

set local role service_role;
select throws_ok(
  $$select public.add_time_break(pg_temp.p(2), pg_temp.id('day'), '2027-03-01 05:30+00',
    '2027-03-01 06:15+00', 'Before work', '2027-03-03 09:05+00')$$,
  '22023', 'A break must be inside its shift', 'a break is refused before its shift began'
);
select throws_ok(
  $$select public.change_time_break(pg_temp.p(2), pg_temp.id('b1'), '2027-03-01 13:50+00',
    '2027-03-01 14:10+00', 'A late break', '2027-03-03 09:05+00')$$,
  '22023', 'A break must be inside its shift', 'and past its end'
);
select throws_ok(
  $$select public.add_time_break(pg_temp.p(2), pg_temp.id('day'), '2027-03-01 12:00+00',
    null, 'Lunch', '2027-03-03 09:05+00')$$,
  '22023', 'A break needs its start and end', 'a break needs both its times'
);
select throws_ok(
  $$select public.add_time_break(pg_temp.p(2), pg_temp.id('day'), '2027-03-01 12:30+00',
    '2027-03-01 12:00+00', 'Lunch', '2027-03-03 09:05+00')$$,
  '22023', 'A break must end after it starts', 'and its end after its start'
);
select throws_ok(
  $$select public.add_time_break(pg_temp.p(2), pg_temp.id('day'), '2027-03-01 12:00+00',
    '2027-03-01 12:30+00', 'Lunch', '2027-03-01 12:15+00')$$,
  '22023', 'A break cannot be in the future', 'a break is never in the future'
);
select throws_ok(
  $$select public.add_time_break(pg_temp.p(2), pg_temp.id('day'), '2027-03-01 10:30+00',
    '2027-03-01 11:00+00', 'A second break', '2027-03-03 09:05+00')$$,
  '23P01', null, 'nor over another break of the shift'
);
select lives_ok(
  $$insert into ids values ('b2', public.add_time_break(pg_temp.p(2), pg_temp.id('day'),
    '2027-03-01 12:00+00', '2027-03-01 12:30+00', 'Forgot the lunch break', '2027-03-03 09:05+00'))$$,
  'a forgotten break is added'
);
reset role;
select is(
  pg_temp.breaks('day'),
  '01 10:00-01 10:45 paid, 01 12:00-01 12:30 unpaid',
  'and is paid or not by the setting now: unpaid'
);
select is(
  pg_temp.logged('b2'),
  jsonb_build_object('entry', pg_temp.id('day'), 'person', pg_temp.p(3),
    'clock_in', '2027-03-01 06:00+00'::timestamptz, 'break', pg_temp.id('b2'),
    'change', 'add', 'from', null::jsonb,
    'to', pg_temp.span('2027-03-01 12:00+00', '2027-03-01 12:30+00'),
    'unpaid', true, 'note', 'Forgot the lunch break', 'by', 'p2'),
  'the log keeps the addition'
);

------------------------------------------------------------------------------
-- Removing a break, and bringing it back (12)

set local role service_role;
select lives_ok(
  $$select public.remove_time_break(pg_temp.p(2), pg_temp.id('b2'), 'Pressed by mistake',
    '2027-03-03 09:10+00')$$,
  'a manager removes a break, with why'
);
select throws_ok(
  $$select public.remove_time_break(pg_temp.p(2), pg_temp.id('b2'), 'Again', '2027-03-03 09:11+00')$$,
  '55000', 'The break is removed', 'a removed break is not removed again'
);
select throws_ok(
  $$select public.change_time_break(pg_temp.p(2), pg_temp.id('b2'), '2027-03-01 12:00+00',
    '2027-03-01 12:20+00', 'Shorter', '2027-03-03 09:11+00')$$,
  '55000', 'The break is removed', 'nor changed'
);
reset role;
select is(
  pg_temp.breaks('day'),
  '01 10:00-01 10:45 paid, 01 12:00-01 12:30 unpaid removed 03 09:10 by p2',
  'the break stays with its times, marked removed, by whom and when'
);
select is(
  pg_temp.logged('b2'),
  jsonb_build_object('entry', pg_temp.id('day'), 'person', pg_temp.p(3),
    'clock_in', '2027-03-01 06:00+00'::timestamptz, 'break', pg_temp.id('b2'),
    'change', 'remove',
    'from', pg_temp.span('2027-03-01 12:00+00', '2027-03-01 12:30+00'), 'to', null::jsonb,
    'unpaid', true, 'note', 'Pressed by mistake', 'by', 'p2'),
  'the log keeps the removal'
);
set local role service_role;
select throws_ok(
  $$select public.restore_time_break(pg_temp.p(1), pg_temp.id('b2'), '2027-03-03 09:12+00')$$,
  '55000', 'Too late to bring it back', 'only whoever removed a break brings it back'
);
select throws_ok(
  $$select public.restore_time_break(pg_temp.p(2), pg_temp.id('b2'), '2027-03-03 09:20:01+00')$$,
  '55000', 'Too late to bring it back', 'within ten minutes'
);
select lives_ok(
  $$select public.restore_time_break(pg_temp.p(2), pg_temp.id('b2'), '2027-03-03 09:20+00')$$,
  'in which it comes back'
);
select throws_ok(
  $$select public.restore_time_break(pg_temp.p(2), pg_temp.id('b2'), '2027-03-03 09:21+00')$$,
  '55000', 'The break is not removed', 'a live break is not brought back'
);
reset role;
select is(
  pg_temp.breaks('day'),
  '01 10:00-01 10:45 paid, 01 12:00-01 12:30 unpaid',
  'as it was'
);
select is(
  pg_temp.stamp('day'),
  'edited 03 09:20 by p2: Pressed by mistake',
  'its shift keeps the time of the restore and the reason of the removal'
);
select is(
  pg_temp.logged('b2'),
  jsonb_build_object('entry', pg_temp.id('day'), 'person', pg_temp.p(3),
    'clock_in', '2027-03-01 06:00+00'::timestamptz, 'break', pg_temp.id('b2'),
    'change', 'restore', 'from', null::jsonb,
    'to', pg_temp.span('2027-03-01 12:00+00', '2027-03-01 12:30+00'),
    'unpaid', true, 'by', 'p2'),
  'and the log keeps the restore, with no reason asked'
);

------------------------------------------------------------------------------
-- A removed break comes back only where it fits, and corrections leave it
-- as it was (6)

-- The lunch break is removed again, and the shift's end is corrected to
-- before the break ended.
set local role service_role;
select public.remove_time_break(pg_temp.p(2), pg_temp.id('b2'), 'Pressed by mistake',
  '2027-03-03 09:30+00');
select public.correct_time_entry(pg_temp.p(2), pg_temp.id('day'),
  '2027-03-01 06:00+00', '2027-03-01 12:10+00', 'Left after lunch', '2027-03-03 09:32+00');
reset role;
select is(
  pg_temp.breaks('day') || ' | trims ' || pg_temp.trims('day'),
  '01 10:00-01 10:45 paid, 01 12:00-01 12:30 unpaid removed 03 09:30 by p2 | trims 0',
  'a correction cuts no removed break, and logs no trim of one'
);
set local role service_role;
select throws_ok(
  $$select public.restore_time_break(pg_temp.p(2), pg_temp.id('b2'), '2027-03-03 09:34+00')$$,
  '22023', 'A break must be inside its shift',
  'a removed break comes back only where it still fits its shift'
);
-- The end goes back to 14:00, and the right lunch break is added.
select public.correct_time_entry(pg_temp.p(2), pg_temp.id('day'),
  '2027-03-01 06:00+00', '2027-03-01 14:00+00', 'Left at two after all', '2027-03-03 09:35+00');
select lives_ok(
  $$insert into ids values ('b3', public.add_time_break(pg_temp.p(2), pg_temp.id('day'),
    '2027-03-01 12:15+00', '2027-03-01 12:45+00', 'The real lunch break', '2027-03-03 09:36+00'))$$,
  'the right break goes over a removed one''s time'
);
select throws_ok(
  $$select public.restore_time_break(pg_temp.p(2), pg_temp.id('b2'), '2027-03-03 09:38+00')$$,
  '23P01', null, 'which then cannot come back over it'
);
-- The shift moves whole half an hour later, and then ends at 11:30.
select public.correct_time_entry(pg_temp.p(2), pg_temp.id('day'),
  '2027-03-01 06:30+00', '2027-03-01 14:30+00', 'Came in late', '2027-03-03 09:40+00');
select public.correct_time_entry(pg_temp.p(2), pg_temp.id('day'),
  '2027-03-01 06:30+00', '2027-03-01 11:30+00', 'Left before lunch', '2027-03-03 09:42+00');
reset role;
select is(
  pg_temp.breaks('day'),
  '01 10:30-01 11:15 paid, 01 12:00-01 12:30 unpaid removed 03 09:30 by p2',
  'a shift that moves takes its live breaks along, and one cut short deletes those after its end, never a removed one'
);
select is(
  (select a.details -> 'breaks' from public.audit_log a
   where a.action = 'clock.break_fit' and a.details ->> 'entry' = pg_temp.id('day')::text),
  jsonb_build_array(jsonb_build_object('break', pg_temp.id('b3'),
    'from', pg_temp.span('2027-03-01 12:45+00', '2027-03-01 13:15+00'), 'to', null::jsonb)),
  'and the one trim logged names the live break only'
);

------------------------------------------------------------------------------
-- A break still running (6)

-- 5 clocks in on 4 March at 06:00 and goes on a break at 10:00.
set local role service_role;
insert into ids values ('open', public.clock_in(pg_temp.p(5), pg_temp.a(), null, '2027-03-04 06:00+00'));
insert into ids values ('ob', public.start_break(pg_temp.p(5), pg_temp.a(), '2027-03-04 10:00+00'));
select throws_ok(
  $$select public.change_time_break(pg_temp.p(2), pg_temp.id('ob'), '2027-03-04 10:00+00',
    '2027-03-04 10:15+00', 'A short break', '2027-03-04 11:00+00')$$,
  '55000', 'The break has not ended', 'a break still running is not changed'
);
select throws_ok(
  $$select public.remove_time_break(pg_temp.p(2), pg_temp.id('ob'), 'Not a break',
    '2027-03-04 11:00+00')$$,
  '55000', 'The break has not ended', 'nor removed'
);
select lives_ok(
  $$select public.add_time_break(pg_temp.p(2), pg_temp.id('open'), '2027-03-04 08:00+00',
    '2027-03-04 08:15+00', 'Forgot the morning break', '2027-03-04 11:00+00')$$,
  'a past break is added to a shift still open'
);
select throws_ok(
  $$select public.add_time_break(pg_temp.p(2), pg_temp.id('open'), '2027-03-04 10:30+00',
    '2027-03-04 10:45+00', 'Another', '2027-03-04 11:00+00')$$,
  '23P01', null, 'but never over the break still running'
);
select is(
  pg_temp.hint_of($$select public.add_time_break(pg_temp.p(2), pg_temp.id('open'),
      '2027-03-04 05:00+00', '2027-03-04 05:30+00', 'Before work', '2027-03-04 11:00+00')$$)
    || ' ' || pg_temp.hint_of($$select public.change_time_break(pg_temp.p(2), pg_temp.id('ob'),
      '2027-03-04 10:00+00', '2027-03-04 10:15+00', 'A short break', '2027-03-04 11:00+00')$$)
    || ' ' || pg_temp.hint_of($$select public.restore_time_break(pg_temp.p(1), pg_temp.id('b2'),
      '2027-03-04 11:00+00')$$),
  'break_outside break_open too_late',
  'the refusals the screens put in words carry their hints'
);
reset role;

-- A removed break that this clock-out would cut, written straight into the
-- table: no function leaves one ending after its shift's end.
insert into ids values ('or', 'b6000000-0000-4000-f000-000000000006');
insert into public.time_breaks (id, entry_id, business_id, user_id, started_at, ended_at, unpaid,
  removed_at, removed_by)
values (pg_temp.id('or'), pg_temp.id('open'), pg_temp.a(), pg_temp.p(5),
  '2027-03-04 11:00+00', '2027-03-04 11:45+00', true, '2027-03-04 11:50+00', pg_temp.p(2));
set local role service_role;
select public.clock_out(pg_temp.p(5), pg_temp.a(), null, '2027-03-04 11:30+00');
reset role;
select is(
  pg_temp.breaks('open'),
  '04 08:00-04 08:15 unpaid, 04 10:00-04 11:30 unpaid, 04 11:00-04 11:45 unpaid removed 04 11:50 by p2',
  'a clock-out ends the live break running, and leaves a removed one as it was, past its end'
);

------------------------------------------------------------------------------
-- A cancelled shift's breaks (4)

-- The manager removes the break of 5's shift of 3 March, then cancels it.
set local role service_role;
select public.remove_time_break(pg_temp.p(2), pg_temp.id('gone_b'), 'Not a break',
  '2027-03-06 08:00+00');
select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('gone'), 'Wrong person',
  '2027-03-06 08:01+00');
select throws_ok(
  $$select public.restore_time_break(pg_temp.p(2), pg_temp.id('gone_b'), '2027-03-06 08:02+00')$$,
  '55000', 'The shift is cancelled',
  'a removed break of a cancelled shift doesn''t come back: the shift is brought back first'
);
select throws_ok(
  $$select public.add_time_break(pg_temp.p(2), pg_temp.id('gone'), '2027-03-03 12:00+00',
    '2027-03-03 12:30+00', 'Lunch', '2027-03-06 08:02+00')$$,
  '55000', 'The shift is cancelled', 'nor is a break added to it'
);
select throws_ok(
  $$select public.change_time_break(pg_temp.p(2), pg_temp.id('gone_b'), '2027-03-03 10:00+00',
    '2027-03-03 10:15+00', 'Shorter', '2027-03-06 08:02+00')$$,
  '55000', 'The shift is cancelled', 'or one changed'
);
select public.restore_time_entry(pg_temp.p(2), pg_temp.id('gone'), '2027-03-06 08:03+00');
select lives_ok(
  $$select public.restore_time_break(pg_temp.p(2), pg_temp.id('gone_b'), '2027-03-06 08:04+00')$$,
  'once the shift is back, so is the break'
);
reset role;

------------------------------------------------------------------------------
-- A removed break never comes back open (5)

-- 5 clocks in by mistake on 8 March and takes a break from 10:00 to 10:30,
-- which the manager removes; then the manager cancels the shift, ending it
-- at 10:30 too, and brings it back.
set local role service_role;
insert into ids values ('slip', public.clock_in(pg_temp.p(5), pg_temp.a(), null, '2027-03-08 06:00+00'));
insert into ids values ('sb', public.start_break(pg_temp.p(5), pg_temp.a(), '2027-03-08 10:00+00'));
select public.end_break(pg_temp.p(5), pg_temp.a(), '2027-03-08 10:30+00');
select public.remove_time_break(pg_temp.p(2), pg_temp.id('sb'), 'Not a break',
  '2027-03-08 10:30+00');
select lives_ok(
  $$select public.cancel_time_entry(pg_temp.p(2), pg_temp.id('slip'), 'Clocked in by mistake',
    '2027-03-08 10:30+00')$$,
  'a removed break ending where a cancel ends the shift doesn''t hold the cancel back'
);
select lives_ok(
  $$select public.restore_time_entry(pg_temp.p(2), pg_temp.id('slip'), '2027-03-08 10:35+00')$$,
  'and the shift comes back'
);
reset role;
select is(
  (select coalesce(pg_temp.at(e.clock_out), 'open') || ' | ' || pg_temp.breaks('slip')
   from public.time_entries e where e.id = pg_temp.id('slip')),
  'open | 08 10:00-08 10:30 unpaid removed 08 10:30 by p2',
  'open again, with its removed break still removed, and ended'
);

-- 3 punches on 9 March with a break the clock-out ends at 14:00.
set local role service_role;
insert into ids values ('quick', public.clock_in(pg_temp.p(3), pg_temp.a(), null, '2027-03-09 06:00+00'));
insert into ids values ('qb', public.start_break(pg_temp.p(3), pg_temp.a(), '2027-03-09 13:00+00'));
select public.clock_out(pg_temp.p(3), pg_temp.a(), null, '2027-03-09 14:00+00');
reset role;
-- A removed break ending at that clock-out, on a shift nobody changed,
-- written straight into the table: a removal marks its shift as corrected,
-- which takes the undo away, so no function leaves one so.
insert into ids values ('qr', 'b6000000-0000-4000-f000-000000000007');
insert into public.time_breaks (id, entry_id, business_id, user_id, started_at, ended_at, unpaid,
  removed_at, removed_by)
values (pg_temp.id('qr'), pg_temp.id('quick'), pg_temp.a(), pg_temp.p(3),
  '2027-03-09 13:30+00', '2027-03-09 14:00+00', true, '2027-03-09 14:00+00', pg_temp.p(2));
set local role service_role;
select lives_ok(
  $$select public.undo_clock_out(pg_temp.p(3), pg_temp.id('quick'), '2027-03-09 14:01+00')$$,
  'the person takes back their clock-out'
);
reset role;
select is(
  (select coalesce(pg_temp.at(e.clock_out), 'open') || ' | ' || pg_temp.breaks('quick')
   from public.time_entries e where e.id = pg_temp.id('quick')),
  'open | 09 13:00-open unpaid, 09 13:30-09 14:00 unpaid removed 09 14:00 by p2',
  'the break the clock-out ended is open again, and a removed one stays ended'
);

------------------------------------------------------------------------------
-- A shift of a closed month (5)

-- The owner closes February: the clock lead shortens 3's paid break of 10
-- February, and the manager removes the unpaid one.
set local role service_role;
select public.close_payroll_month(pg_temp.p(1), pg_temp.a(), '2027-02-01',
  '{"version": 1}'::jsonb, 'break-edits', '2027-03-01 10:00+02');
select lives_ok(
  $$select public.change_time_break(pg_temp.p(4), pg_temp.id('feb_paid'), '2027-02-10 10:00+00',
    '2027-02-10 10:20+00', 'A short break', '2027-03-10 08:00+00')$$,
  'a role given clock.edit changes a break too, in a closed month'
);
reset role;
select is(
  (pg_temp.logged('feb_paid') ? 'closed_month')::text || ' / '
    || pg_temp.lines('pay.after_close:2027-02'),
  'false / none',
  'a paid break''s change names no closed month and tells nobody: the paid hours are the same'
);
set local role service_role;
select lives_ok(
  $$select public.remove_time_break(pg_temp.p(2), pg_temp.id('feb_unpaid'), 'Never taken',
    '2027-03-10 08:05+00')$$,
  'an unpaid one is removed there'
);
reset role;
select is(
  pg_temp.logged('feb_unpaid'),
  jsonb_build_object('entry', pg_temp.id('feb'), 'person', pg_temp.p(3),
    'clock_in', '2027-02-10 06:00+00'::timestamptz, 'break', pg_temp.id('feb_unpaid'),
    'change', 'remove',
    'from', pg_temp.span('2027-02-10 12:00+00', '2027-02-10 12:30+00'), 'to', null::jsonb,
    'unpaid', true, 'note', 'Never taken', 'closed_month', '2027-02', 'by', 'p2'),
  'its log row names the closed month'
);
select is(
  pg_temp.lines('pay.after_close:2027-02'),
  'p1 open, p6 open',
  'and the month''s closer and the accountant are told'
);

select * from finish();
rollback;
