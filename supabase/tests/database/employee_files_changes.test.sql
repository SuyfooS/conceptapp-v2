-- What a holder's screens need from the file's reads
-- (20261126000600_file_started_and_changed.sql; profile H6b-2): the file
-- gives the current employment period's first day, to its person and to a
-- holder alike, also for a fixed-term job whose end is still ahead (with
-- the pension's due day from it), and none for someone whose only period
-- ended; the status gives a holder when the file or its 101 was last
-- written, the newer of the two, null for neither, and a manager no detail
-- at all. Its detail has exactly its ten keys, and the file never a sealed
-- column's name. Times are fixed by hand, never the real clock, but for
-- the end still ahead, a month after the business's today, which the reads
-- take from the clock themselves. Fixed ids (f7…), numbers (050-086-xxxx)
-- and slugs (efc-…), so nothing here meets the seed or another test.
begin;
select plan(14);

-- A: 1 its owner, 2 a manager with no file and no 101, 3 a worker with a
-- file and an open period since 1 September, 4 a worker on a fixed-term job
-- since 1 July that a pay holder said ends a month from today, 5 a worker
-- whose only period ended.
insert into auth.users (id, aud, role, phone)
select ('f7000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250086' || lpad(n::text, 4, '0')
from generate_series(1, 5) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('f7000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'f7000000-0000-4000-b000-000000000001'::uuid
$$;

insert into public.businesses (id, slug, name) values (pg_temp.a(), 'efc-a', 'Changes A');
insert into public.memberships (business_id, user_id, role, active)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', true),
  (pg_temp.a(), pg_temp.p(2), 'manager', true),
  (pg_temp.a(), pg_temp.p(3), 'worker', true),
  (pg_temp.a(), pg_temp.p(4), 'worker', true),
  (pg_temp.a(), pg_temp.p(5), 'worker', true);
insert into public.business_modules (business_id, module_key, enabled, settings)
values (pg_temp.a(), 'employee_files', true, '{}');

-- Joining opened a period today (private.track_employment): fixed by hand.
update public.employment_periods set started_on = '2026-09-01'
where business_id = pg_temp.a() and user_id = pg_temp.p(3);
update public.employment_periods set started_on = '2026-01-04', ended_on = '2026-06-30'
where business_id = pg_temp.a() and user_id = pg_temp.p(5);
-- Its end ahead, as set_employment_period takes it (up to a year on).
update public.employment_periods
set started_on = '2026-07-01', ended_on = private.file_today(pg_temp.a(), now()) + 30
where business_id = pg_temp.a() and user_id = pg_temp.p(4);

-- Worker 3's file, last written on 1 October; nothing sealed.
insert into public.employee_details (business_id, user_id, legal_first_name, updated_at)
values (pg_temp.a(), pg_temp.p(3), 'Noa', '2026-10-01 09:00:00+00');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
-- A person's status row, as the signed-in reader gets it.
create function pg_temp.detail(n integer) returns jsonb language sql as $$
  select s.detail from public.employee_file_status(pg_temp.a()) s where s.user_id = pg_temp.p(n)
$$;

------------------------------------------------------------------------------
-- The functions

select has_function('public', 'employee_file_status', array['uuid'],
  'the status is still public.employee_file_status(business)');
select ok(not has_function_privilege('anon', 'public.employee_file_status(uuid)', 'execute'),
  'nobody signed out reads it');
select ok(not has_function_privilege('authenticated', 'private.file_answer(uuid, uuid, text)', 'execute'),
  'a session never calls the file''s answer itself');

------------------------------------------------------------------------------
-- The current period's start

select pg_temp.sign_in(pg_temp.p(1));
select public.acknowledge_file_duties(pg_temp.a(), '2026-11-v1');
select is(public.employee_file(pg_temp.a(), pg_temp.p(3)) ->> 'started_on', '2026-09-01',
  'a holder reads the open period''s first day');
select is(public.employee_file(pg_temp.a(), pg_temp.p(4)) ->> 'started_on', '2026-07-01',
  'and the first day of a job whose end is still ahead');
select is(public.employee_file(pg_temp.a(), pg_temp.p(4)) ->> 'pension_due_on', '2026-08-30',
  'whose pension is due 60 days on, as an open one''s');
select ok(
  (public.employee_file(pg_temp.a(), pg_temp.p(5)) ? 'started_on')
    and public.employee_file(pg_temp.a(), pg_temp.p(5)) ->> 'started_on' is null,
  'and none for someone whose only period ended');
select is(public.employee_file(pg_temp.a(), pg_temp.p(3))::text ~ '_enc"', false,
  'the file names no sealed column');

select pg_temp.sign_in(pg_temp.p(3));
select is(public.employee_file(pg_temp.a(), pg_temp.p(3)) ->> 'started_on', '2026-09-01',
  'the person reads it in their own file');

------------------------------------------------------------------------------
-- When each file last changed

select pg_temp.sign_in(pg_temp.p(1));
select is((pg_temp.detail(3) ->> 'changed_at')::timestamptz, '2026-10-01 09:00:00+00'::timestamptz,
  'a holder reads when the file was last written');
select is(pg_temp.detail(2) ->> 'changed_at', null,
  'and nothing for a file never written, with no 101');
select is(
  (select array_agg(k.key order by k.key) from jsonb_object_keys(pg_temp.detail(3)) as k (key)),
  array['bank_review', 'change_due_by', 'changed_at', 'missing', 'pension_due_on',
    'returned_reason', 'status', 'submitted_at', 'tax_year', 'youth_until'],
  'the detail has exactly its ten keys');
reset role;

-- A 101 marked after the file's last write.
insert into public.employee_tax_years (business_id, user_id, tax_year, status, route, updated_at)
values (pg_temp.a(), pg_temp.p(3), 2026, 'handed_in', 'print', '2026-10-15 09:00:00+00');

select pg_temp.sign_in(pg_temp.p(1));
select is((pg_temp.detail(3) ->> 'changed_at')::timestamptz, '2026-10-15 09:00:00+00'::timestamptz,
  'the newer of the file and its 101s');

select pg_temp.sign_in(pg_temp.p(2));
select ok(
  (select count(*) > 0 and bool_and(s.detail is null) from public.employee_file_status(pg_temp.a()) s),
  'a manager reads no detail, and so no change');
reset role;

select * from finish();
rollback;
