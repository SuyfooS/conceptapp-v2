-- Hours that stay (20261110000100_hours_kept.sql): nothing deletes hours,
-- breaks or the log, the database's owner included, but a purge that names the
-- business (the demo reset, test clean-ups) and a correction's trim of its own
-- breaks, which the log keeps. Deleting a person or a business with hours fails;
-- someone who only acted can still go, their log rows kept without them. The log
-- changes only that way. Corrections and added shifts need a reason, which the
-- log keeps. Every call passes the time so the test does not depend on today.
begin;
select plan(38);

-- Before anything sets them: a session that never named the settings reads
-- them as NULL, which the guard must treat as "no".
select is(
  current_setting('ca.records_purge', true),
  null,
  'a fresh session has no purge set'
);

insert into auth.users (id, aud, role, phone)
values
  ('76000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500002601'),
  ('76000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500002602'),
  ('76000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500002603'),
  ('76000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500002604'),
  ('76000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500002605'),
  ('76000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500002606');

-- a: owner of X and Y; b: manager of X; c: worker of X, with hours; d: X's
-- accountant, who only acted (log rows, no hours, and off the staff, so no
-- employment period either: 20261110000600_payroll_details.sql keeps those);
-- e and f: the owner and a worker of a demo business.
insert into public.businesses (id, slug, name)
values
  ('76000000-0000-4000-b000-000000000001', 'hk-x', 'Kept X'),
  ('76000000-0000-4000-b000-000000000002', 'hk-y', 'Kept Y');

insert into public.memberships (business_id, user_id, role)
values
  ('76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000a', 'owner'),
  ('76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000b', 'manager'),
  ('76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c', 'worker'),
  ('76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000d', 'accountant'),
  ('76000000-0000-4000-b000-000000000002', '76000000-0000-4000-a000-00000000000a', 'owner');

-- Nothing set: no code asked for.
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('76000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('76000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to service_role, authenticated;

-- c's shift at X with a break; the log's rows by c and by d; a log row of a
-- template, with no business; a's shift at Y.
insert into public.time_entries (id, business_id, user_id, clock_in, clock_out)
values
  ('76000000-0000-4000-e000-000000000001', '76000000-0000-4000-b000-000000000001',
    '76000000-0000-4000-a000-00000000000c', '2026-11-02 06:00+00', '2026-11-02 14:00+00'),
  ('76000000-0000-4000-e000-000000000002', '76000000-0000-4000-b000-000000000002',
    '76000000-0000-4000-a000-00000000000a', '2026-11-02 06:00+00', '2026-11-02 14:00+00');
insert into public.time_breaks (id, entry_id, business_id, user_id, started_at, ended_at, unpaid)
values ('76000000-0000-4000-e000-0000000000b1', '76000000-0000-4000-e000-000000000001',
  '76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c',
  '2026-11-02 10:00+00', '2026-11-02 10:30+00', true);
insert into public.audit_log (business_id, actor_id, action, details)
values
  ('76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c',
    'business.details', '{"from": {}, "to": {"name": "Kept X"}}'),
  ('76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000d',
    'business.details', '{"from": {}, "to": {"name": "By d"}}'),
  ('76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000d',
    'business.details', '{"from": {}, "to": {"name": "By d again"}}'),
  (null, null, 'wording.change', '{"template": "hk-template", "key": "app.nav.home"}');

------------------------------------------------------------------------------
-- Nothing deletes them, the database's owner included

select throws_ok(
  $$delete from public.time_entries where id = '76000000-0000-4000-e000-000000000001'$$,
  '42501', 'Hours are kept: nothing deletes them',
  'deleting hours fails in a fresh session, even for the database''s owner'
);
select throws_ok(
  $$delete from public.time_breaks where id = '76000000-0000-4000-e000-0000000000b1'$$,
  '42501', 'Breaks are kept: nothing deletes them',
  'so does deleting a break'
);
select throws_ok(
  $$delete from public.audit_log where business_id = '76000000-0000-4000-b000-000000000001'$$,
  '42501', 'The log is kept: nothing deletes it',
  'and deleting the log'
);

-- A purge that names another business lets nothing of this one go, and a row
-- with no business never goes.
select set_config('ca.records_purge', '76000000-0000-4000-b000-000000000002', true);
select throws_ok(
  $$delete from public.time_entries where id = '76000000-0000-4000-e000-000000000001'$$,
  '42501', null,
  'a purge of another business does not reach this one''s hours'
);
select throws_ok(
  $$delete from public.audit_log where business_id is null and details ->> 'template' = 'hk-template'$$,
  '42501', null,
  'a log row without a business is never deleted'
);
select set_config('ca.records_purge', '', true);

set local role service_role;
select throws_ok(
  $$delete from public.time_entries where id = '76000000-0000-4000-e000-000000000001'$$,
  '42501', null, 'the server cannot delete hours'
);
select throws_ok(
  $$delete from public.time_breaks where id = '76000000-0000-4000-e000-0000000000b1'$$,
  '42501', null, 'nor a break'
);
select throws_ok(
  $$delete from public.audit_log where business_id = '76000000-0000-4000-b000-000000000001'$$,
  '42501', null, 'nor the log'
);
select throws_ok(
  $$update public.audit_log set details = '{}' where business_id = '76000000-0000-4000-b000-000000000001'$$,
  '42501', null, 'nor change it'
);
reset role;

------------------------------------------------------------------------------
-- The log changes only when an actor's account goes

select throws_ok(
  $$update public.audit_log set details = '{}'
    where business_id = '76000000-0000-4000-b000-000000000001'
      and actor_id = '76000000-0000-4000-a000-00000000000c'$$,
  '42501', 'The log is append-only', 'the database''s owner cannot rewrite the log'
);
select throws_ok(
  $$update public.audit_log set actor_id = '76000000-0000-4000-a000-00000000000b'
    where business_id = '76000000-0000-4000-b000-000000000001'
      and actor_id = '76000000-0000-4000-a000-00000000000c'$$,
  '42501', 'The log is append-only', 'nor put it on someone else'
);

------------------------------------------------------------------------------
-- People and businesses with hours stay

select throws_ok(
  $$delete from auth.users where id = '76000000-0000-4000-a000-00000000000c'$$,
  '23503', null, 'deleting the account of someone with hours fails'
);
select throws_ok(
  $$delete from public.profiles where id = '76000000-0000-4000-a000-00000000000c'$$,
  '23503', null, 'and so does deleting their profile'
);
select lives_ok(
  $$delete from auth.users where id = '76000000-0000-4000-a000-00000000000d'$$,
  'someone who only acted can still go'
);
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '76000000-0000-4000-b000-000000000001'
     and action = 'business.details' and details -> 'to' ->> 'name' like 'By d%'
     and actor_id is null),
  2,
  'and the log keeps what they did, without them'
);
select throws_ok(
  $$delete from public.businesses where id = '76000000-0000-4000-b000-000000000001'$$,
  '23503', null, 'deleting a business with hours fails'
);

------------------------------------------------------------------------------
-- Corrections and added shifts need a reason, and the log keeps it

set local role service_role;
select throws_ok(
  $$select public.add_time_entry('76000000-0000-4000-a000-00000000000b',
    '76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c',
    '2026-11-03 06:00+00', '2026-11-03 14:00+00', null, '2026-11-04 08:00+00')$$,
  '22023', 'A correction needs its reason', 'adding a shift without a reason is refused'
);
select throws_ok(
  $$select public.add_time_entry('76000000-0000-4000-a000-00000000000b',
    '76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c',
    '2026-11-03 06:00+00', '2026-11-03 14:00+00', '   ', '2026-11-04 08:00+00')$$,
  '22023', 'A correction needs its reason', 'and so is one of spaces'
);
insert into ids values ('added', public.add_time_entry('76000000-0000-4000-a000-00000000000b',
  '76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c',
  '2026-11-03 06:00+00', '2026-11-03 14:00+00', '  Forgot to punch  ', '2026-11-04 08:00+00'));
select is(
  (select e.note || '/' || (a.details ->> 'note')
   from public.time_entries e
   join public.audit_log a on a.action = 'clock.add' and a.details ->> 'entry' = e.id::text
   where e.id = (select id from ids where name = 'added')),
  'Forgot to punch/Forgot to punch',
  'with one, the shift and its log row keep it, trimmed'
);
select throws_ok(
  $$select public.correct_time_entry('76000000-0000-4000-a000-00000000000b',
    '76000000-0000-4000-e000-000000000001', '2026-11-02 06:00+00', '2026-11-02 13:00+00',
    null, '2026-11-04 08:00+00')$$,
  '22023', 'A correction needs its reason', 'correcting a shift without a reason is refused'
);
select public.correct_time_entry('76000000-0000-4000-a000-00000000000b',
  '76000000-0000-4000-e000-000000000001', '2026-11-02 06:00+00', '2026-11-02 13:00+00',
  'Left early', '2026-11-04 08:00+00');
select is(
  (select e.note || '/' || (a.details ->> 'note')
   from public.time_entries e
   join public.audit_log a on a.action = 'clock.correct' and a.details ->> 'entry' = e.id::text
   where e.id = '76000000-0000-4000-e000-000000000001'),
  'Left early/Left early',
  'with one, the shift and its log row keep it'
);
reset role;

------------------------------------------------------------------------------
-- A correction's trims of breaks are logged

-- c's shift of 5 November, 06:00–14:00, with three breaks.
insert into public.time_entries (id, business_id, user_id, clock_in, clock_out)
values ('76000000-0000-4000-e000-000000000005', '76000000-0000-4000-b000-000000000001',
  '76000000-0000-4000-a000-00000000000c', '2026-11-05 06:00+00', '2026-11-05 14:00+00');
insert into public.time_breaks (id, entry_id, business_id, user_id, started_at, ended_at, unpaid)
values
  ('76000000-0000-4000-e000-0000000000b5', '76000000-0000-4000-e000-000000000005',
    '76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c',
    '2026-11-05 10:00+00', '2026-11-05 10:30+00', true),
  ('76000000-0000-4000-e000-0000000000b6', '76000000-0000-4000-e000-000000000005',
    '76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c',
    '2026-11-05 12:00+00', '2026-11-05 12:45+00', true),
  ('76000000-0000-4000-e000-0000000000b7', '76000000-0000-4000-e000-000000000005',
    '76000000-0000-4000-b000-000000000001', '76000000-0000-4000-a000-00000000000c',
    '2026-11-05 13:30+00', '2026-11-05 13:50+00', true);

set local role service_role;
select public.correct_time_entry('76000000-0000-4000-a000-00000000000b',
  '76000000-0000-4000-e000-000000000005', '2026-11-05 06:00+00', '2026-11-05 12:30+00',
  'Left at 12:30', '2026-11-06 08:00+00');
reset role;
select is(
  (select details from public.audit_log
   where action = 'clock.break_fit' and details ->> 'entry' = '76000000-0000-4000-e000-000000000005'),
  jsonb_build_object(
    'entry', '76000000-0000-4000-e000-000000000005'::uuid,
    'person', '76000000-0000-4000-a000-00000000000c'::uuid,
    'clock_in', '2026-11-05 06:00+00'::timestamptz,
    'breaks', jsonb_build_array(
      jsonb_build_object(
        'break', '76000000-0000-4000-e000-0000000000b6'::uuid,
        'from', jsonb_build_object('start', '2026-11-05 12:00+00'::timestamptz, 'end', '2026-11-05 12:45+00'::timestamptz),
        'to', jsonb_build_object('start', '2026-11-05 12:00+00'::timestamptz, 'end', '2026-11-05 12:30+00'::timestamptz)
      ),
      jsonb_build_object(
        'break', '76000000-0000-4000-e000-0000000000b7'::uuid,
        'from', jsonb_build_object('start', '2026-11-05 13:30+00'::timestamptz, 'end', '2026-11-05 13:50+00'::timestamptz),
        'to', null
      )
    )
  ),
  'a correction that cuts one break and removes another logs each, before and after, with the shift''s start'
);
select is(
  (select count(*)::integer || '/' || min(actor_id::text) from public.audit_log
   where action = 'clock.break_fit' and details ->> 'entry' = '76000000-0000-4000-e000-000000000005'),
  '1/76000000-0000-4000-a000-00000000000b',
  'in one row, by whoever corrected it'
);
select results_eq(
  $$select started_at, ended_at from public.time_breaks
    where entry_id = '76000000-0000-4000-e000-000000000005' order by started_at$$,
  $$values ('2026-11-05 10:00+00'::timestamptz, '2026-11-05 10:30+00'::timestamptz),
           ('2026-11-05 12:00+00'::timestamptz, '2026-11-05 12:30+00'::timestamptz)$$,
  'and the breaks fit the shift'
);

set local role service_role;
select public.correct_time_entry('76000000-0000-4000-a000-00000000000b',
  '76000000-0000-4000-e000-000000000005', '2026-11-05 06:30+00', '2026-11-05 13:00+00',
  'Came in late', '2026-11-06 08:10+00');
reset role;
select is(
  (select count(*)::integer from public.audit_log
   where action = 'clock.break_fit' and details ->> 'entry' = '76000000-0000-4000-e000-000000000005')
  || '/' || (select string_agg(to_char(started_at at time zone 'UTC', 'HH24:MI'), ',' order by started_at)
   from public.time_breaks where entry_id = '76000000-0000-4000-e000-000000000005'),
  '1/10:30,12:30',
  'moving a whole shift takes its breaks along and logs no trim'
);

-- c clocks in, goes on a break and leaves during it: leaving ends the break,
-- which is no correction.
set local role service_role;
insert into ids
select 'punched', public.clock_in('76000000-0000-4000-a000-00000000000c',
  '76000000-0000-4000-b000-000000000001', null, '2026-11-06 06:00+00');
select public.start_break('76000000-0000-4000-a000-00000000000c',
  '76000000-0000-4000-b000-000000000001', '2026-11-06 10:00+00');
select public.clock_out('76000000-0000-4000-a000-00000000000c',
  '76000000-0000-4000-b000-000000000001', null, '2026-11-06 14:00+00');
reset role;
select is(
  (select count(*)::integer from public.audit_log
   where action = 'clock.break_fit' and details ->> 'entry' = (select id::text from ids where name = 'punched'))
  || '/' || (select ended_at = '2026-11-06 14:00+00'::timestamptz from public.time_breaks
   where entry_id = (select id from ids where name = 'punched'))::text,
  '0/true',
  'leaving during a break ends it and logs no trim'
);
set local role service_role;
select lives_ok(
  format($$select public.undo_clock_out('76000000-0000-4000-a000-00000000000c', %L, '2026-11-06 14:01+00')$$,
    (select id from ids where name = 'punched')),
  'taking the clock-out back still works'
);
reset role;
select is(
  (select (e.clock_out is null)::text || '/' || (b.ended_at is null)::text
   from public.time_entries e join public.time_breaks b on b.entry_id = e.id
   where e.id = (select id from ids where name = 'punched')),
  'true/true',
  'with the shift and its break open again'
);

------------------------------------------------------------------------------
-- The purge: the reset's, and the tests' clean-ups

set local role service_role;
select throws_ok(
  $$select private.purge_business_records('76000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'the server cannot purge a business'
);
reset role;
select pg_temp.sign_in('76000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select private.purge_business_records('76000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'nor can a signed-in owner'
);
reset role;
select ok(
  not has_function_privilege('service_role', 'private.seed_demo_pay(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_pay(uuid)', 'execute'),
  'and nobody but the reset seeds a demo''s pay'
);
-- A truncate skips the delete triggers. has_table_privilege with a list is
-- true when any one is held, so each "not" means none of them.
select ok(
  not has_table_privilege('service_role', 'public.time_entries', 'truncate')
  and not has_table_privilege('service_role', 'public.time_breaks', 'truncate')
  and not has_table_privilege('service_role', 'public.audit_log', 'update, delete, truncate')
  and not has_table_privilege('authenticated', 'public.time_entries', 'truncate')
  and not has_table_privilege('authenticated', 'public.time_breaks', 'truncate')
  and not has_table_privilege('authenticated', 'public.audit_log', 'update, delete, truncate')
  and not has_table_privilege('anon', 'public.time_entries', 'truncate')
  and not has_table_privilege('anon', 'public.time_breaks', 'truncate')
  and not has_table_privilege('anon', 'public.audit_log', 'update, delete, truncate'),
  'and nobody but the owner truncates hours, breaks or the log, or changes the log'
);

-- A demo business with hours, a break and log rows of its own.
insert into private.demo_businesses (business_id, definition)
values ('76000000-0000-4000-b000-000000000003', $json$
  {
    "slug": "hk-demo", "name": "Kept demo", "accent": "#7c3aed",
    "address": "Demo street 3", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "people": [
      { "user_id": "76000000-0000-4000-a000-00000000000e", "role": "owner", "name": "Owner E" },
      { "user_id": "76000000-0000-4000-a000-00000000000f", "role": "worker", "name": "Worker F" }
    ]
  }
  $json$);
set local role service_role;
select public.reset_demo_business('76000000-0000-4000-b000-000000000003');
reset role;
insert into public.time_entries (id, business_id, user_id, clock_in, clock_out)
values ('76000000-0000-4000-e000-0000000000d1', '76000000-0000-4000-b000-000000000003',
  '76000000-0000-4000-a000-00000000000f', '2026-11-02 06:00+00', '2026-11-02 14:00+00');
insert into public.time_breaks (entry_id, business_id, user_id, started_at, ended_at, unpaid)
values ('76000000-0000-4000-e000-0000000000d1', '76000000-0000-4000-b000-000000000003',
  '76000000-0000-4000-a000-00000000000f', '2026-11-02 10:00+00', '2026-11-02 10:30+00', true);
insert into public.audit_log (business_id, actor_id, action, details)
values ('76000000-0000-4000-b000-000000000003', '76000000-0000-4000-a000-00000000000e',
  'business.details', '{"from": {}, "to": {"name": "Before"}, "mark": "before"}');

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('76000000-0000-4000-b000-000000000003')$$,
  'the reset of a demo with hours, breaks and log rows goes through'
);
reset role;
select is(
  (select count(*)::integer from public.time_entries
   where business_id = '76000000-0000-4000-b000-000000000003')
  + (select count(*)::integer from public.time_breaks
     where business_id = '76000000-0000-4000-b000-000000000003')
  + (select count(*)::integer from public.audit_log
     where business_id = '76000000-0000-4000-b000-000000000003' and details ->> 'mark' = 'before'),
  0,
  'and the demo starts again with none of them'
);

-- The database's owner purges a business that is no demo, as the tests'
-- clean-ups do, and then it can go; nothing after the purge may delete.
select lives_ok(
  $$select private.purge_business_records('76000000-0000-4000-b000-000000000001')$$,
  'the database''s owner purges a business'
);
select lives_ok(
  $$delete from public.businesses where id = '76000000-0000-4000-b000-000000000001'$$,
  'and then it can go'
);
select throws_ok(
  $$delete from public.time_entries where id = '76000000-0000-4000-e000-000000000002'$$,
  '42501', null, 'while the purge leaves nothing else allowed after it'
);

select * from finish();
rollback;
