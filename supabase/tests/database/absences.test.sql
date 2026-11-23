-- Days away (20261127000600_absences.sql): whoever edits the clock (an owner,
-- a manager, someone given clock.edit) records vacation, sick leave, reserve
-- duty or another absence for someone on the staff, changes it, removes it
-- and, within ten minutes, brings it back, with the secret key only; a
-- worker, an accountant, someone who only builds the schedule, another
-- business and a manager's own days are refused, and so are someone off the
-- staff, overlapping days, bad values and a closed month. An unknown record
-- reads as one the actor can't reach. The rows stay, the log keeps each
-- write without the note, the person and the clock's editors and pay holders
-- read them, and the schedule's builders read only who is away and when.
-- Fixed ids (ab5e…), numbers (050-058-xxxx) and times (March 2027), so
-- nothing here meets the seed or another test, or the real clock.
begin;
select plan(60);

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('ab5e0000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'ab5e0000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'ab5e0000-0000-4000-b000-000000000002'::uuid
$$;

insert into auth.users (id, aud, role, phone)
select pg_temp.p(n), 'authenticated', 'authenticated', '97250058' || lpad(n::text, 4, '0')
from generate_series(1, 9) as n;

-- A: 1 owner, 2 manager, 3 and 5 workers, 4 a worker given clock.edit, 6 the
-- accountant, 7 a worker given schedule.edit (builds the schedule, doesn't
-- edit the clock), 8 a worker who left. B: 9 its owner.
insert into public.businesses (id, slug, name)
values
  (pg_temp.a(), 'absences-a', 'Absences A'),
  (pg_temp.b(), 'absences-b', 'Absences B');
insert into public.memberships (business_id, user_id, role, active, perms)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', true, '{}'),
  (pg_temp.a(), pg_temp.p(2), 'manager', true, '{}'),
  (pg_temp.a(), pg_temp.p(3), 'worker', true, '{}'),
  (pg_temp.a(), pg_temp.p(4), 'worker', true, '{clock.edit}'),
  (pg_temp.a(), pg_temp.p(5), 'worker', true, '{}'),
  (pg_temp.a(), pg_temp.p(6), 'accountant', true, '{}'),
  (pg_temp.a(), pg_temp.p(7), 'worker', true, '{schedule.edit}'),
  (pg_temp.a(), pg_temp.p(8), 'worker', false, '{}'),
  (pg_temp.b(), pg_temp.p(9), 'owner', true, '{}');
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'time_clock', true, '{}'),
  (pg_temp.a(), 'scheduling', true, '{}'),
  (pg_temp.b(), 'time_clock', true, '{}');

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
-- What a statement gives: 'ok', or its error's code with its hint and
-- detail, when it has them. A refused statement leaves nothing behind.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  said_state text;
  said_hint text;
  said_detail text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics said_state = returned_sqlstate,
    said_hint = pg_exception_hint, said_detail = pg_exception_detail;
  return concat_ws(' ', said_state, nullif(said_hint, ''), nullif(said_detail, ''));
end;
$$;
-- A saved record: its kind, days and note, who recorded it and when, and
-- its last change and removal.
create function pg_temp.state(saved text) returns text language sql as $$
  select concat_ws(' ',
    ab.kind, ab.from_day::text, ab.to_day::text, coalesce(ab.note, '-'),
    pg_temp.who(ab.recorded_by), pg_temp.at(ab.recorded_at),
    case when ab.changed_at is not null
      then 'changed ' || pg_temp.who(ab.changed_by) || ' ' || pg_temp.at(ab.changed_at) end,
    case when ab.removed_at is not null
      then 'removed ' || pg_temp.who(ab.removed_by) || ' ' || pg_temp.at(ab.removed_at) end)
  from public.absences ab
  where ab.id = pg_temp.id(saved)
$$;
-- The newest log row of an action about a saved record, with who wrote it.
create function pg_temp.logged(what text, saved text) returns jsonb language sql as $$
  select a.details || jsonb_build_object('by', pg_temp.who(a.actor_id))
  from public.audit_log a
  where a.action = what and a.details ->> 'absence' = pg_temp.id(saved)::text
  order by a.id desc
  limit 1
$$;

-- The owner closes A's February 2027.
set local role service_role;
select public.close_payroll_month(pg_temp.p(1), pg_temp.a(), '2027-02-01',
  '{"version": 1}'::jsonb, 'absences', '2027-03-01 10:00+02');
reset role;

------------------------------------------------------------------------------
-- Who may call what (2)

select ok(
  has_function_privilege('service_role',
    'public.record_absence(uuid, uuid, uuid, text, date, date, text, timestamptz)', 'execute')
  and has_function_privilege('service_role',
    'public.change_absence(uuid, uuid, text, date, date, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.remove_absence(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.restore_absence(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.record_absence(uuid, uuid, uuid, text, date, date, text, timestamptz)', 'execute')
  and not has_function_privilege('anon',
    'public.record_absence(uuid, uuid, uuid, text, date, date, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.change_absence(uuid, uuid, text, date, date, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.remove_absence(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.restore_absence(uuid, uuid, timestamptz)', 'execute'),
  'only the server records, changes, removes and brings back days away'
);
select ok(
  has_function_privilege('authenticated', 'public.team_away(uuid, date, date)', 'execute')
  and not has_function_privilege('anon', 'public.team_away(uuid, date, date)', 'execute')
  and pg_get_function_result('public.team_away(uuid, date, date)'::regprocedure)
    = 'TABLE(user_id uuid, from_day date, to_day date)',
  'a signed-in reader asks who is away, and gets who and when, never the kind or the note'
);

------------------------------------------------------------------------------
-- Recording (23)

set local role service_role;
select lives_ok(
  $$insert into ids values ('vac', public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(3),
    'vacation', '2027-03-14', '2027-03-16', '  certificate  ', '2027-03-10 08:00+00'))$$,
  'a manager records a worker''s vacation, with a note'
);
reset role;
select is(
  pg_temp.state('vac'),
  'vacation 2027-03-14 2027-03-16 certificate p2 10 08:00',
  'the record keeps the kind, the days, the note trimmed, and who recorded it when'
);
select is(
  pg_temp.logged('clock.absence_add', 'vac'),
  jsonb_build_object('absence', pg_temp.id('vac'), 'person', pg_temp.p(3), 'kind', 'vacation',
    'from', '2027-03-14', 'to', '2027-03-16', 'noted', true, 'by', 'p2'),
  'the log keeps whose days and which, and that there is a note, never the note'
);

set local role service_role;
select throws_ok(
  $$select public.record_absence(pg_temp.p(5), pg_temp.a(), pg_temp.p(3), 'sick',
    '2027-03-20', '2027-03-20', null, '2027-03-10 08:00+00')$$,
  '42501', 'Managers and owners only', 'a worker cannot record days away'
);
select throws_ok(
  $$select public.record_absence(pg_temp.p(6), pg_temp.a(), pg_temp.p(3), 'sick',
    '2027-03-20', '2027-03-20', null, '2027-03-10 08:00+00')$$,
  '42501', 'Managers and owners only', 'nor the accountant, who sees pay'
);
select throws_ok(
  $$select public.record_absence(pg_temp.p(7), pg_temp.a(), pg_temp.p(3), 'sick',
    '2027-03-20', '2027-03-20', null, '2027-03-10 08:00+00')$$,
  '42501', 'Managers and owners only', 'nor someone who only builds the schedule'
);
select throws_ok(
  $$select public.record_absence(pg_temp.p(9), pg_temp.a(), pg_temp.p(3), 'sick',
    '2027-03-20', '2027-03-20', null, '2027-03-10 08:00+00')$$,
  '42501', 'Managers and owners only', 'nor the owner of another business'
);
select lives_ok(
  $$insert into ids values ('sick5', public.record_absence(pg_temp.p(4), pg_temp.a(), pg_temp.p(5),
    'sick', '2027-03-20', '2027-03-20', null, '2027-03-10 08:00+00'))$$,
  'a worker given clock.edit records someone else''s sick day'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(2),
    'vacation', '2027-03-22', '2027-03-22', null, '2027-03-10 08:00+00')$$),
  '42501 own',
  'a manager cannot record their own days away'
);
select lives_ok(
  $$insert into ids values ('own1', public.record_absence(pg_temp.p(1), pg_temp.a(), pg_temp.p(1),
    'vacation', '2027-03-25', '2027-03-26', null, '2027-03-10 08:00+00'))$$,
  'an owner records their own'
);
select lives_ok(
  $$insert into ids values ('mgr', public.record_absence(pg_temp.p(1), pg_temp.a(), pg_temp.p(2),
    'reserve', '2027-03-22', '2027-03-23', null, '2027-03-10 08:00+00'))$$,
  'and a manager''s'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(6),
    'vacation', '2027-03-22', '2027-03-22', null, '2027-03-10 08:00+00')$$),
  '55000 not_on_staff',
  'the accountant is not on the staff, and gets no days away'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(8),
    'vacation', '2027-03-22', '2027-03-22', null, '2027-03-10 08:00+00')$$),
  '55000 not_on_staff',
  'nor does someone who left'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(3),
    'sick', '2027-03-15', '2027-03-18', null, '2027-03-10 08:00+00')$$),
  '23P01',
  'days that overlap a live record of the same person are refused'
);
select lives_ok(
  $$insert into ids values ('touch', public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(3),
    'vacation', '2027-03-17', '2027-03-17', null, '2027-03-10 08:00+00'))$$,
  'the day after it is free'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(5),
    'vacation', '2027-03-24', '2027-03-23', null, '2027-03-10 08:00+00')$$),
  '22023 order',
  'the last day comes on or after the first'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(5),
    'vacation', '2027-03-01', '2028-03-01', null, '2027-03-10 08:00+00')$$),
  '22023 too_long',
  'at most 366 days at a time'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(5),
    'holiday', '2027-03-24', '2027-03-24', null, '2027-03-10 08:00+00')$$),
  '22023 kind',
  'only the four kinds'
);
select is(
  pg_temp.refusal(format($f$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(5),
    'other', '2027-03-24', '2027-03-24', %L, '2027-03-10 08:00+00')$f$, repeat('x', 201))),
  '22023 note',
  'a note of at most 200 characters'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(5),
    'vacation', '2026-01-05', '2026-01-06', null, '2027-03-10 08:00+00')$$),
  '22023 too_far',
  'from a year back at most'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(5),
    'sick', '2027-02-10', '2027-02-11', null, '2027-03-10 08:00+00')$$),
  '55000 month_closed 2027-02',
  'never in a month closed for payroll, which the refusal names'
);
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(5),
    'sick', '2027-02-27', '2027-03-02', null, '2027-03-10 08:00+00')$$),
  '55000 month_closed 2027-02',
  'nor across one'
);
reset role;
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'time_clock';
set local role service_role;
select is(
  pg_temp.refusal($$select public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(5),
    'sick', '2027-03-24', '2027-03-24', null, '2027-03-10 08:00+00')$$),
  '42501',
  'nor while the time clock is off'
);
reset role;
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'time_clock';

------------------------------------------------------------------------------
-- Changing (10)

set local role service_role;
select lives_ok(
  $$select public.change_absence(pg_temp.p(2), pg_temp.id('vac'), 'reserve',
    '2027-03-14', '2027-03-15', 'certificate', '2027-03-10 09:00+00')$$,
  'a manager changes the kind and the days'
);
reset role;
select is(
  pg_temp.state('vac'),
  'reserve 2027-03-14 2027-03-15 certificate p2 10 08:00 changed p2 10 09:00',
  'the record is changed, with who changed it when'
);
select is(
  pg_temp.logged('clock.absence_change', 'vac'),
  jsonb_build_object('absence', pg_temp.id('vac'), 'person', pg_temp.p(3),
    'from', jsonb_build_object('kind', 'vacation', 'from', '2027-03-14', 'to', '2027-03-16'),
    'to', jsonb_build_object('kind', 'reserve', 'from', '2027-03-14', 'to', '2027-03-15'),
    'note_changed', false, 'by', 'p2'),
  'the log keeps both sides, and whether the note changed'
);
set local role service_role;
select public.change_absence(pg_temp.p(2), pg_temp.id('vac'), 'reserve',
  '2027-03-14', '2027-03-15', ' certificate ', '2027-03-10 09:05+00');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.action = 'clock.absence_change' and a.details ->> 'absence' = pg_temp.id('vac')::text)
  || ' ' || pg_temp.state('vac'),
  '1 reserve 2027-03-14 2027-03-15 certificate p2 10 08:00 changed p2 10 09:00',
  'a change with nothing different writes nothing'
);
set local role service_role;
select is(
  pg_temp.refusal($$select public.change_absence(pg_temp.p(2), pg_temp.id('vac'), 'reserve',
    '2027-03-14', '2027-03-17', null, '2027-03-10 09:10+00')$$),
  '23P01',
  'a change onto another live record is refused'
);
select throws_ok(
  $$select public.change_absence(pg_temp.p(5), pg_temp.id('vac'), 'sick',
    '2027-03-14', '2027-03-15', null, '2027-03-10 09:10+00')$$,
  '42501', 'Managers and owners only', 'a worker cannot change one'
);
select throws_ok(
  $$select public.change_absence(pg_temp.p(2), gen_random_uuid(), 'sick',
    '2027-03-14', '2027-03-15', null, '2027-03-10 09:10+00')$$,
  '42501', 'Managers and owners only', 'and an unknown record reads exactly the same'
);
select is(
  pg_temp.refusal($$select public.change_absence(pg_temp.p(2), pg_temp.id('vac'), 'reserve',
    '2027-02-26', '2027-03-15', null, '2027-03-10 09:10+00')$$),
  '55000 month_closed 2027-02',
  'a change into a closed month is refused'
);
select is(
  pg_temp.refusal($$select public.change_absence(pg_temp.p(2), pg_temp.id('mgr'), 'vacation',
    '2027-03-22', '2027-03-23', null, '2027-03-10 09:10+00')$$),
  '42501 own',
  'a manager cannot change their own days away'
);
select is(
  pg_temp.refusal($$select public.change_absence(pg_temp.p(9), pg_temp.id('vac'), 'sick',
    '2027-03-14', '2027-03-15', null, '2027-03-10 09:10+00')$$),
  '42501',
  'nor can another business''s owner'
);
reset role;

------------------------------------------------------------------------------
-- Removing and bringing back (12)

set local role service_role;
select lives_ok(
  $$select public.remove_absence(pg_temp.p(2), pg_temp.id('touch'), '2027-03-10 10:00+00')$$,
  'a manager removes a record'
);
reset role;
select is(
  pg_temp.state('touch') || ' | ' || pg_temp.logged('clock.absence_remove', 'touch')::text,
  'vacation 2027-03-17 2027-03-17 - p2 10 08:00 removed p2 10 10:00 | '
    || jsonb_build_object('absence', pg_temp.id('touch'), 'person', pg_temp.p(3),
      'kind', 'vacation', 'from', '2027-03-17', 'to', '2027-03-17', 'by', 'p2')::text,
  'the row stays, with who removed it when, and the log keeps it'
);
set local role service_role;
select is(
  pg_temp.refusal($$select public.remove_absence(pg_temp.p(2), pg_temp.id('touch'), '2027-03-10 10:01+00')$$),
  '55000 removed',
  'a removed record is not removed again'
);
select is(
  pg_temp.refusal($$select public.change_absence(pg_temp.p(2), pg_temp.id('touch'), 'sick',
    '2027-03-17', '2027-03-17', null, '2027-03-10 10:01+00')$$),
  '55000 removed',
  'nor changed'
);
select lives_ok(
  $$insert into ids values ('over', public.record_absence(pg_temp.p(2), pg_temp.a(), pg_temp.p(3),
    'other', '2027-03-17', '2027-03-17', null, '2027-03-10 10:02+00'))$$,
  'a new record takes the removed one''s days'
);
select is(
  pg_temp.refusal($$select public.restore_absence(pg_temp.p(2), pg_temp.id('touch'), '2027-03-10 10:05+00')$$),
  '23P01',
  'which the removed one then can''t come back over'
);
select public.remove_absence(pg_temp.p(4), pg_temp.id('sick5'), '2027-03-10 10:00+00');
select lives_ok(
  $$select public.restore_absence(pg_temp.p(4), pg_temp.id('sick5'), '2027-03-10 10:09+00')$$,
  'whoever removed one brings it back within ten minutes'
);
reset role;
select is(
  pg_temp.state('sick5') || ' | ' || pg_temp.logged('clock.absence_restore', 'sick5')::text,
  'sick 2027-03-20 2027-03-20 - p4 10 08:00 changed p4 10 10:09 | '
    || jsonb_build_object('absence', pg_temp.id('sick5'), 'person', pg_temp.p(5),
      'kind', 'sick', 'from', '2027-03-20', 'to', '2027-03-20', 'by', 'p4')::text,
  'it is live again, stamped as changed, and the log keeps it'
);
set local role service_role;
select public.remove_absence(pg_temp.p(2), pg_temp.id('over'), '2027-03-10 10:20+00');
select is(
  pg_temp.refusal($$select public.restore_absence(pg_temp.p(1), pg_temp.id('over'), '2027-03-10 10:21+00')$$),
  '55000 too_late',
  'only whoever removed it brings it back'
);
select is(
  pg_temp.refusal($$select public.restore_absence(pg_temp.p(2), pg_temp.id('over'), '2027-03-10 10:31+00')$$),
  '55000 too_late',
  'and only within ten minutes'
);
select is(
  pg_temp.refusal($$select public.restore_absence(pg_temp.p(2), pg_temp.id('vac'), '2027-03-10 10:31+00')$$),
  '55000 not_removed',
  'a live record is not brought back'
);
select is(
  pg_temp.refusal($$select public.remove_absence(pg_temp.p(5), pg_temp.id('vac'), '2027-03-10 10:31+00')$$),
  '42501',
  'a worker cannot remove one'
);
reset role;

------------------------------------------------------------------------------
-- Who reads what (11)

select pg_temp.sign_in(pg_temp.p(3));
select is(
  (select string_agg(distinct pg_temp.who(ab.user_id), ',') from public.absences ab),
  'p3',
  'a worker reads only their own days away'
);
reset role;
select pg_temp.sign_in(pg_temp.p(5));
select is(
  (select string_agg(distinct pg_temp.who(ab.user_id), ',') from public.absences ab),
  'p5',
  'and so does another'
);
reset role;
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select count(*)::integer from public.absences ab where ab.business_id = pg_temp.a()),
  6,
  'a manager reads all of the business''s, removed ones too'
);
reset role;
select pg_temp.sign_in(pg_temp.p(6));
select is(
  (select count(*)::integer from public.absences ab where ab.business_id = pg_temp.a()),
  6,
  'and so does the accountant, who sees pay'
);
reset role;
select pg_temp.sign_in(pg_temp.p(9));
select is(
  (select count(*)::integer from public.absences ab),
  0,
  'another business''s owner reads none'
);
reset role;
select pg_temp.sign_in(pg_temp.p(7));
select is(
  (select count(*)::integer from public.absences ab),
  0,
  'someone who builds the schedule reads no record'
);
select results_eq(
  $$select pg_temp.who(t.user_id), t.from_day::text, t.to_day::text
    from public.team_away(pg_temp.a(), '2027-03-14', '2027-03-20') t$$,
  $$values ('p3', '2027-03-14', '2027-03-15'), ('p5', '2027-03-20', '2027-03-20')$$,
  'only who is away and when, the live records over the days asked'
);
select is_empty(
  $$select 1 from public.team_away(pg_temp.a(), '2027-03-01', '2027-05-03')$$,
  'more than 62 days asked gives nothing'
);
reset role;
select pg_temp.sign_in(pg_temp.p(5));
select is_empty(
  $$select 1 from public.team_away(pg_temp.a(), '2027-03-14', '2027-03-20')$$,
  'a worker asks who is away and gets nobody'
);
reset role;
select pg_temp.sign_in(pg_temp.p(9));
select is_empty(
  $$select 1 from public.team_away(pg_temp.a(), '2027-03-14', '2027-03-20')$$,
  'nor does another business''s owner'
);
select throws_ok(
  $$insert into public.absences (business_id, user_id, kind, from_day, to_day)
    values (pg_temp.b(), pg_temp.p(9), 'vacation', '2027-03-14', '2027-03-14')$$,
  '42501', 'permission denied for table absences', 'nobody signed in writes a record directly'
);
reset role;

------------------------------------------------------------------------------
-- Kept (2)

select throws_ok(
  $$delete from public.absences ab where ab.id = pg_temp.id('vac')$$,
  '42501', 'Days away are kept: nothing deletes them',
  'nothing deletes a record'
);
select set_config('ca.records_purge', pg_temp.a()::text, true);
delete from public.absences ab where ab.business_id = pg_temp.a();
select set_config('ca.records_purge', '', true);
select is(
  (select count(*)::integer from public.absences ab where ab.business_id = pg_temp.a()),
  0,
  'but a purge that names the business'
);

select * from finish();
rollback;
