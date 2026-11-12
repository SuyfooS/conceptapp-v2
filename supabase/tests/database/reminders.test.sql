-- Reminders (notifications part 4): the database writes each one at its time
-- and not before, once, to the people it is for, and what it asks for
-- settles it, its trigger or, when that missed it, the next minute. The
-- business's two settings decide when (0 is none), read with the manifest's
-- defaults when what is stored isn't offered; a demo business gets none.
-- Back-to-back shifts are one stretch, and a due moment early in the week
-- never brings a push at midnight. Old lines are cleaned once a day, and the
-- minute job runs the reminders first and calls nothing without both Vault
-- secrets. Fixed ids of its own and explicit times, so nothing here meets
-- the seeded people.
begin;
select plan(67);
-- Times read back as text, in UTC. A boolean in concat_ws reads "t" unless
-- cast: each is cast to text, which reads "true".
set local timezone = 'UTC';

-- R is a real business: o owns it, m manages it, w1, w2 and w3 work there and
-- wi worked there. Z keeps both reminders off, P has published next week, D
-- is a demo. Each person is on one staff.
insert into auth.users (id, aud, role, phone)
values
  ('8d000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004701'),
  ('8d000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004702'),
  ('8d000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004703'),
  ('8d000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004704'),
  ('8d000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500004705'),
  ('8d000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500004706'),
  ('8d000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500004707'),
  ('8d000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500004708'),
  ('8d000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500004709'),
  ('8d000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500004710'),
  ('8d000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500004711'),
  ('8d000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500004712');

insert into public.businesses (id, slug, name)
values
  ('8d000000-0000-4000-b000-000000000001', 'remind-r', 'Remind R'),
  ('8d000000-0000-4000-b000-000000000002', 'remind-z', 'Remind Z'),
  ('8d000000-0000-4000-b000-000000000003', 'remind-p', 'Remind P'),
  ('8d000000-0000-4000-b000-000000000004', 'remind-d', 'Remind D');

insert into public.memberships (business_id, user_id, role, active)
values
  ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000001', 'owner', true),
  ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000002', 'manager', true),
  ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000003', 'worker', true),
  ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000004', 'worker', true),
  ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000005', 'worker', true),
  ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-00000000000c', 'worker', false),
  ('8d000000-0000-4000-b000-000000000002', '8d000000-0000-4000-a000-000000000006', 'owner', true),
  ('8d000000-0000-4000-b000-000000000002', '8d000000-0000-4000-a000-000000000007', 'worker', true),
  ('8d000000-0000-4000-b000-000000000003', '8d000000-0000-4000-a000-000000000008', 'owner', true),
  ('8d000000-0000-4000-b000-000000000003', '8d000000-0000-4000-a000-000000000009', 'worker', true),
  ('8d000000-0000-4000-b000-000000000004', '8d000000-0000-4000-a000-00000000000a', 'owner', true),
  ('8d000000-0000-4000-b000-000000000004', '8d000000-0000-4000-a000-00000000000b', 'worker', true);

-- R stored values the manifest doesn't offer (5 hours, minutes as text): they
-- read as the defaults, 24 hours and 60 minutes. Z switched both off.
insert into public.business_modules (business_id, module_key, enabled, settings)
select b.id, m.key::public.module_key, true,
  case
    when m.key = 'notifications' and b.slug = 'remind-r'
      then '{"availabilityReminderHours": 5, "clockOutReminderMinutes": "30"}'::jsonb
    when m.key = 'notifications' and b.slug = 'remind-z'
      then '{"availabilityReminderHours": 0, "clockOutReminderMinutes": 0}'::jsonb
    else '{}'::jsonb
  end
from public.businesses b
cross join (values ('notifications'), ('scheduling'), ('time_clock')) as m (key)
where b.slug like 'remind-%';

insert into private.demo_businesses (business_id, definition)
values ('8d000000-0000-4000-b000-000000000004', '{"slug": "remind-d"}');

-- Weeks start on Sunday and availability is due on Wednesday at 18:00, on
-- Israel's clock (16:00 UTC in November). R's week of 22 November is
-- published, with w1 on Wednesday 08:00 to 16:00 (06:00 to 14:00 UTC); its
-- week of 29 November is open, and w3 sent theirs already. P published the
-- week of 29 November.
insert into public.schedule_weeks (id, business_id, starts_on, availability_due_at, schedule_published_at)
values
  ('8d000000-0000-4000-c000-000000000001', '8d000000-0000-4000-b000-000000000001',
    '2026-11-22', '2026-11-18 16:00+00', '2026-11-19 10:00+00'),
  ('8d000000-0000-4000-c000-000000000002', '8d000000-0000-4000-b000-000000000001',
    '2026-11-29', '2026-11-25 16:00+00', null),
  ('8d000000-0000-4000-c000-000000000003', '8d000000-0000-4000-b000-000000000003',
    '2026-11-29', '2026-11-25 16:00+00', '2026-11-20 10:00+00');

insert into public.schedule_shifts (id, business_id, week_id, day, name, starts_at, ends_at, needed)
values ('8d000000-0000-4000-d000-000000000001', '8d000000-0000-4000-b000-000000000001',
  '8d000000-0000-4000-c000-000000000001', '2026-11-25', 'Morning', '08:00', '16:00', 1);
insert into public.shift_assignments (shift_id, business_id, user_id)
values ('8d000000-0000-4000-d000-000000000001', '8d000000-0000-4000-b000-000000000001',
  '8d000000-0000-4000-a000-000000000003');

insert into public.availability_submissions (business_id, week_id, user_id)
values ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-c000-000000000002',
  '8d000000-0000-4000-a000-000000000005');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

-- Clocked in, still open: m on Tuesday at 12:00 local with no shift, w1 on
-- Wednesday at 07:55 for their shift, w2 on Wednesday at 07:00 with none, zw
-- in Z, dw in the demo long ago, and pw in P since August, more than 90 days.
with opened as (
  insert into public.time_entries (business_id, user_id, clock_in)
  values
    ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000002', '2026-11-24 10:00+00'),
    ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000003', '2026-11-25 05:55+00'),
    ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000004', '2026-11-25 05:00+00'),
    ('8d000000-0000-4000-b000-000000000002', '8d000000-0000-4000-a000-000000000007', '2026-11-25 00:00+00'),
    ('8d000000-0000-4000-b000-000000000004', '8d000000-0000-4000-a000-00000000000b', '2026-11-20 00:00+00'),
    ('8d000000-0000-4000-b000-000000000003', '8d000000-0000-4000-a000-000000000009', '2026-08-01 06:00+00')
  returning id, user_id
)
insert into ids
select 'entry-' || right(o.user_id::text, 2), o.id from opened o;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Someone's line of a kind in R, by person.
create function pg_temp.line(person uuid, what text) returns public.notifications
language sql as $$
  select n.* from public.notifications n
  where n.business_id = '8d000000-0000-4000-b000-000000000001'
    and n.user_id = person and n.kind = what
$$;

-- The reminders at `at_time` in this file's businesses alone (the demo among
-- them), so other businesses in a local database change no count here.
create function pg_temp.run(at_time timestamptz) returns integer language sql as $$
  select coalesce(sum(private.run_reminders(at_time, b.id)), 0)::integer
  from public.businesses b
  where b.slug like 'remind-%'
$$;

------------------------------------------------------------------------------
-- Nobody but the database

select pg_temp.sign_in('8d000000-0000-4000-a000-000000000003');
select throws_ok(
  $$select private.run_reminders('2026-11-24 16:00+00')$$,
  '42501', null, 'a signed-in person cannot run the reminders'
);
reset role;

------------------------------------------------------------------------------
-- The settings, and the groups

select is(
  (select row(s.availability_hours, s.clock_out_minutes)::text
   from private.business_reminder_settings('8d000000-0000-4000-b000-000000000001') s),
  '(24,60)',
  'values the manifest doesn''t offer read as its defaults'
);
select is(
  (select row(s.availability_hours, s.clock_out_minutes)::text
   from private.business_reminder_settings('8d000000-0000-4000-b000-000000000002') s),
  '(0,0)',
  'both reminders off are off'
);
select is(
  (select row(s.availability_hours, s.clock_out_minutes)::text
   from private.business_reminder_settings('8d000000-0000-4000-b000-000000000003') s),
  '(24,60)',
  'and nothing stored is the defaults'
);
select is(
  (select string_agg(coalesce(private.notification_group(k), '-'), ',' order by k)
   from unnest(array['availability.due', 'availability.missing', 'clock.open', 'clock.overdue']) k),
  'schedule,approvals,clock,approvals',
  'the reminders are in the schedule''s group, the clock''s and approvals'
);

------------------------------------------------------------------------------
-- Availability, before it is due (24 hours before: Tuesday 16:00 UTC)

select is(pg_temp.run('2026-11-24 15:59+00'), 0,
  'nothing a minute before the reminder''s time');
select is(pg_temp.run('2026-11-24 16:00+00'), 3,
  'at its time, three reminders');
select set_eq(
  $$select n.user_id from public.notifications n
    where n.business_id = '8d000000-0000-4000-b000-000000000001' and n.kind = 'availability.due'$$,
  array[
    '8d000000-0000-4000-a000-000000000002', '8d000000-0000-4000-a000-000000000003',
    '8d000000-0000-4000-a000-000000000004'
  ]::uuid[],
  'to the manager and the workers who haven''t sent it: not the owner, not who sent it, not who left'
);
select is(
  (select concat_ws('|', l.audience_role, l.source_module, l.dedupe_key, l.push_before,
     l.params ->> 'startsOn', (l.actor_id is null)::text)
   from pg_temp.line('8d000000-0000-4000-a000-000000000003', 'availability.due') l),
  'worker|scheduling|availability:2026-11-29|2026-11-25 16:00:00+00|2026-11-29|true',
  'about next week, from nobody, on the phone only until it is due'
);
select is(pg_temp.run('2026-11-24 16:30+00'), 0,
  'once: a second run adds nothing');

insert into public.availability_submissions (business_id, week_id, user_id)
values ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-c000-000000000002',
  '8d000000-0000-4000-a000-000000000003');
select is(
  (select l.resolved_at is not null and l.read_at is not null
   from pg_temp.line('8d000000-0000-4000-a000-000000000003', 'availability.due') l),
  true,
  'sending it settles one''s own reminder'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000001'
     and n.kind = 'availability.due' and n.resolved_at is null),
  2,
  'and nobody else''s'
);

------------------------------------------------------------------------------
-- Clocked in still

select is(pg_temp.run('2026-11-24 21:59+00'), 0,
  'not before 12 hours with no shift');
select is(pg_temp.run('2026-11-24 22:00+00'), 1,
  'then the person is reminded to clock out');
select is(
  (select concat_ws('|', l.audience_role, l.source_module, l.push_before,
     coalesce(l.params ->> 'shiftEnd', 'none'),
     (l.dedupe_key = 'clock.open:' || pg_temp.id('entry-02'))::text)
   from pg_temp.line('8d000000-0000-4000-a000-000000000002', 'clock.open') l),
  'worker|time_clock|2026-11-25 10:00:00+00|none|true',
  'about their entry, on the phone until 24 hours after clocking in'
);

select is(pg_temp.run('2026-11-25 10:00+00'), 0,
  'an entry open 24 hours exactly isn''t overdue');
select is(pg_temp.run('2026-11-25 10:01+00'), 2,
  'past them, it is');
select set_eq(
  $$select n.user_id from public.notifications n
    where n.business_id = '8d000000-0000-4000-b000-000000000001' and n.kind = 'clock.overdue'$$,
  array['8d000000-0000-4000-a000-000000000001', '8d000000-0000-4000-a000-000000000002']::uuid[],
  'to the owner and the managers, the person too as one of them, never the workers'
);
select is(
  (select concat_ws('|', l.audience_role, l.source_module, l.params ->> 'person',
     (l.push_before is null)::text,
     (l.dedupe_key = 'clock.overdue:' || pg_temp.id('entry-02'))::text)
   from pg_temp.line('8d000000-0000-4000-a000-000000000001', 'clock.overdue') l),
  'manager|time_clock|8d000000-0000-4000-a000-000000000002|true|true',
  'naming whose entry, for managers'
);
select is(
  (select l.resolved_at is not null
   from pg_temp.line('8d000000-0000-4000-a000-000000000002', 'clock.open') l),
  true,
  'and the reminder to clock out is settled: only a manager closes it now'
);

-- w1's shift ended at 14:00 UTC; R's minutes read as 60.
select is(pg_temp.run('2026-11-25 14:59+00'), 0,
  'not before an hour after the shift ended');
select is(pg_temp.run('2026-11-25 15:00+00'), 1,
  'then its person is reminded');
select is(
  (select (l.params ->> 'shiftEnd')::timestamptz
   from pg_temp.line('8d000000-0000-4000-a000-000000000003', 'clock.open') l),
  '2026-11-25 14:00+00'::timestamptz,
  'with when the shift ended'
);
select public.clock_out('8d000000-0000-4000-a000-000000000003',
  '8d000000-0000-4000-b000-000000000001', at_time => '2026-11-25 15:30+00');
select is(
  (select l.resolved_at is not null
   from pg_temp.line('8d000000-0000-4000-a000-000000000003', 'clock.open') l),
  true,
  'clocking out settles it'
);

------------------------------------------------------------------------------
-- Availability, when it is due

select is(pg_temp.run('2026-11-25 15:59+00'), 0,
  'the managers hear nothing before it is due');
select is(pg_temp.run('2026-11-25 16:00+00'), 2,
  'and at its due moment, two lines');
select set_eq(
  $$select n.user_id from public.notifications n
    where n.business_id = '8d000000-0000-4000-b000-000000000001' and n.kind = 'availability.missing'$$,
  array['8d000000-0000-4000-a000-000000000001', '8d000000-0000-4000-a000-000000000002']::uuid[],
  'to the owner and the manager'
);
select is(
  (select (select string_agg(k, ',' order by k) from jsonb_object_keys(l.params) k)
     || '=' || (l.params ->> 'missing') || '|' || l.audience_role || '|' || l.push_before
   from pg_temp.line('8d000000-0000-4000-a000-000000000001', 'availability.missing') l),
  'dueAt,missing,startsOn=2|manager|2026-11-25 22:00:00+00',
  'how many still haven''t sent it, never who, on the phone for six hours'
);
select pg_temp.sign_in('8d000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer from public.notifications n where n.kind = 'availability.missing'),
  1,
  'the manager reads theirs in the app'
);
reset role;

-- w2 has no shift: 12 hours after 05:00.
select is(pg_temp.run('2026-11-25 17:00+00'), 1,
  'twelve hours after clocking in with no shift, the next reminder');
select public.correct_time_entry('8d000000-0000-4000-a000-000000000001', pg_temp.id('entry-04'),
  '2026-11-25 05:10+00', null, 'Started at ten past', '2026-11-25 17:30+00');
select is(
  (select l.resolved_at is null
   from pg_temp.line('8d000000-0000-4000-a000-000000000004', 'clock.open') l),
  true,
  'a correction that leaves the entry open leaves the reminder'
);
select public.correct_time_entry('8d000000-0000-4000-a000-000000000001', pg_temp.id('entry-04'),
  '2026-11-25 05:10+00', '2026-11-25 14:00+00', 'Left at four', '2026-11-25 18:00+00');
select is(
  (select l.resolved_at is not null
   from pg_temp.line('8d000000-0000-4000-a000-000000000004', 'clock.open') l),
  true,
  'one that closes it settles it'
);
select public.correct_time_entry('8d000000-0000-4000-a000-000000000001', pg_temp.id('entry-02'),
  '2026-11-24 10:00+00', '2026-11-24 18:00+00', 'Left at eight', '2026-11-25 19:00+00');
select is(
  (select count(*)::integer from public.notifications n
   where n.dedupe_key = 'clock.overdue:' || pg_temp.id('entry-02') and n.resolved_at is null),
  0,
  'a correction settles the overdue entry''s line for everyone'
);

-- Six hours after the due moment, no more: without the lines, the run at
-- 22:00 makes none, the one at 21:59 makes them again.
delete from public.notifications n
where n.business_id = '8d000000-0000-4000-b000-000000000001' and n.kind = 'availability.missing';
select is(pg_temp.run('2026-11-25 22:00+00'), 0,
  'the managers hear nothing six hours after it was due');
select is(pg_temp.run('2026-11-25 21:59+00'), 2,
  'and do up to then');

insert into public.availability_submissions (business_id, week_id, user_id)
values ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-c000-000000000002',
  '8d000000-0000-4000-a000-000000000002');
select is(
  (select l.resolved_at is null
   from pg_temp.line('8d000000-0000-4000-a000-000000000001', 'availability.missing') l),
  true,
  'while someone is still missing, the managers'' line waits'
);
select is(
  (select l.params ->> 'missing'
   from pg_temp.line('8d000000-0000-4000-a000-000000000001', 'availability.missing') l),
  '1',
  'saying how many still haven''t sent it, not how many hadn''t'
);
insert into public.availability_submissions (business_id, week_id, user_id)
values ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-c000-000000000002',
  '8d000000-0000-4000-a000-000000000004');
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000001'
     and n.kind = 'availability.missing' and n.resolved_at is null),
  0,
  'and once nobody is, it is settled for both'
);

------------------------------------------------------------------------------
-- The settings at 0, a published week, a demo

select is(pg_temp.run('2026-11-26 00:01+00'), 1,
  'an entry open past 24 hours is told even with the reminders off');
select is(
  (select string_agg(n.user_id::text || ':' || n.kind, ',')
   from public.notifications n where n.business_id = '8d000000-0000-4000-b000-000000000002'),
  '8d000000-0000-4000-a000-000000000006:clock.overdue',
  'to the owner, and with both settings at 0, nothing else: no availability, no clocking out'
);
select is_empty(
  $$select n.id from public.notifications n
    where n.business_id = '8d000000-0000-4000-b000-000000000003'$$,
  'nothing about a week already published'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.dedupe_key = 'clock.overdue:' || pg_temp.id('entry-09')),
  0,
  'nor about an entry open more than 90 days: its line, once cleaned, would come back as new'
);

------------------------------------------------------------------------------
-- The next week, and publishing it

select is(pg_temp.run('2026-12-01 16:00+00'), 5,
  'the next week''s reminders come at their own time, in every business');
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000001'
     and n.dedupe_key = 'availability:2026-12-06'),
  4,
  'to everyone who hasn''t sent that one'
);
insert into public.audit_log (business_id, actor_id, action, details)
values ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000002',
  'schedule.publish',
  '{"starts_on": "2026-12-06", "first": false, "changed": [], "removed_swaps": []}');
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000001'
     and n.dedupe_key = 'availability:2026-12-06' and n.resolved_at is null),
  0,
  'publishing the week settles every one of them'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000003'
     and n.dedupe_key = 'availability:2026-12-06' and n.resolved_at is null),
  1,
  'and only that business''s'
);

------------------------------------------------------------------------------
-- Back-to-back shifts, and a due moment early in the week

-- E is a business of its own, not among `remind-%`, so the runs above never
-- met it: eo owns it, ew works there with a device. Availability is due on
-- the week's first day, Sunday at 18:00 (16:00 UTC), with the reminder a day
-- before; ew works Wednesday 08:00 to 15:00 and 15:00 to 22:00 (06:00 to
-- 13:00 and 13:00 to 20:00 UTC), and clocked in at 07:55 for both.
insert into auth.users (id, aud, role, phone)
values
  ('8d000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500004713'),
  ('8d000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500004714');
insert into public.businesses (id, slug, name)
values ('8d000000-0000-4000-b000-000000000005', 'early-remind', 'Early Remind');
insert into public.memberships (business_id, user_id, role, active)
values
  ('8d000000-0000-4000-b000-000000000005', '8d000000-0000-4000-a000-00000000000d', 'owner', true),
  ('8d000000-0000-4000-b000-000000000005', '8d000000-0000-4000-a000-00000000000e', 'worker', true);
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('8d000000-0000-4000-b000-000000000005', 'notifications', true, '{}'::jsonb),
  ('8d000000-0000-4000-b000-000000000005', 'scheduling', true, '{"availabilityDueDay": 0}'::jsonb),
  ('8d000000-0000-4000-b000-000000000005', 'time_clock', true, '{}'::jsonb);
insert into public.schedule_weeks (id, business_id, starts_on, availability_due_at, schedule_published_at)
values ('8d000000-0000-4000-c000-000000000004', '8d000000-0000-4000-b000-000000000005',
  '2026-11-22', '2026-11-15 16:00+00', '2026-11-19 10:00+00');
insert into public.schedule_shifts (id, business_id, week_id, day, name, starts_at, ends_at, needed)
values
  ('8d000000-0000-4000-d000-000000000002', '8d000000-0000-4000-b000-000000000005',
    '8d000000-0000-4000-c000-000000000004', '2026-11-25', 'Morning', '08:00', '15:00', 1),
  ('8d000000-0000-4000-d000-000000000003', '8d000000-0000-4000-b000-000000000005',
    '8d000000-0000-4000-c000-000000000004', '2026-11-25', 'Evening', '15:00', '22:00', 1);
insert into public.shift_assignments (shift_id, business_id, user_id)
values
  ('8d000000-0000-4000-d000-000000000002', '8d000000-0000-4000-b000-000000000005',
    '8d000000-0000-4000-a000-00000000000e'),
  ('8d000000-0000-4000-d000-000000000003', '8d000000-0000-4000-b000-000000000005',
    '8d000000-0000-4000-a000-00000000000e');
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
values ('8d000000-0000-4000-a000-00000000000e', 'https://fcm.googleapis.com/fcm/send/remind-e',
  md5('remind-e-a') || md5('remind-e-b'),
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ');
with opened as (
  insert into public.time_entries (business_id, user_id, clock_in)
  values ('8d000000-0000-4000-b000-000000000005', '8d000000-0000-4000-a000-00000000000e',
    '2026-11-25 05:55+00')
  returning id
)
insert into ids
select 'entry-0e', o.id from opened o;

select is(private.run_reminders('2026-11-25 14:00+00', '8d000000-0000-4000-b000-000000000005'), 0,
  'back to back, nothing an hour after the first shift ends');
select is(private.run_reminders('2026-11-25 21:00+00', '8d000000-0000-4000-b000-000000000005'), 1,
  'an hour after the last one ends, the reminder');
select is(
  (select (n.params ->> 'shiftEnd')::timestamptz from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000005'
     and n.dedupe_key = 'clock.open:' || pg_temp.id('entry-0e')),
  '2026-11-25 20:00+00'::timestamptz,
  'with when the last one ended'
);

-- A clock-out its trigger didn't settle (it came as the line was written):
-- written here without the audit log, which the trigger reads.
update public.time_entries e set clock_out = '2026-11-25 21:05+00'
where e.id = pg_temp.id('entry-0e');
select private.run_reminders('2026-11-25 21:06+00', '8d000000-0000-4000-b000-000000000005');
select is(
  (select n.resolved_at is not null from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000005'
     and n.dedupe_key = 'clock.open:' || pg_temp.id('entry-0e')),
  true,
  'a clock-out its trigger missed settles the reminder the next minute'
);

-- The week of 6 December is due on Sunday 29 November at 18:00. A day before
-- that is Saturday 18:00, while the app still shows the week of 29 November
-- as next; the week of 6 December becomes next at midnight, and its reminder
-- waits for 08:00 (06:00 UTC).
select is(private.run_reminders('2026-11-28 22:00+00', '8d000000-0000-4000-b000-000000000005'), 0,
  'due on the week''s first day: nothing at midnight, as the week begins');
select is(private.run_reminders('2026-11-29 05:59+00', '8d000000-0000-4000-b000-000000000005'), 0,
  'nor before eight that morning');
select is(private.run_reminders('2026-11-29 06:00+00', '8d000000-0000-4000-b000-000000000005'), 1,
  'at eight, the reminder');
select is(
  (select concat_ws('|', n.push_state, n.push_after, n.push_before) from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000005'
     and n.user_id = '8d000000-0000-4000-a000-00000000000e'
     and n.dedupe_key = 'availability:2026-12-06'),
  'queued|2026-11-29 06:00:00+00|2026-11-29 16:00:00+00',
  'on the phone from then until it is due'
);

-- Due at 07:00 on the week's first day: no hour after eight is left before
-- it. The week of 13 December is due on 6 December at 07:00 (05:00 UTC).
update public.business_modules bm
set settings = '{"availabilityDueDay": 0, "availabilityDueTime": "07:00"}'::jsonb
where bm.business_id = '8d000000-0000-4000-b000-000000000005' and bm.module_key = 'scheduling';
select is(private.run_reminders('2026-12-05 22:00+00', '8d000000-0000-4000-b000-000000000005'), 1,
  'due by eight on the week''s first day, the reminder comes as the week begins');
select is(
  (select n.push_state from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000005'
     and n.user_id = '8d000000-0000-4000-a000-00000000000e'
     and n.dedupe_key = 'availability:2026-12-13'),
  'none',
  'in the app alone, never on the phone at midnight'
);
select is(
  (select n.resolved_at is not null from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000005'
     and n.user_id = '8d000000-0000-4000-a000-00000000000e'
     and n.dedupe_key = 'availability:2026-12-06'),
  true,
  'and the line about the week now begun is settled, sent or not'
);
select is(private.run_reminders('2026-12-06 05:00+00', '8d000000-0000-4000-b000-000000000005'), 1,
  'when it is due, the owner hears one hasn''t sent it');
update public.memberships m set active = false
where m.business_id = '8d000000-0000-4000-b000-000000000005'
  and m.user_id = '8d000000-0000-4000-a000-00000000000e';
select private.run_reminders('2026-12-06 05:01+00', '8d000000-0000-4000-b000-000000000005');
select is(
  (select n.resolved_at is not null from public.notifications n
   where n.business_id = '8d000000-0000-4000-b000-000000000005'
     and n.user_id = '8d000000-0000-4000-a000-00000000000d'
     and n.dedupe_key = 'availability.missing:2026-12-13'),
  true,
  'and once the one missing has left the staff, that is settled too'
);

------------------------------------------------------------------------------
-- The daily clean-up

-- w3's lines, against a clean-up on 1 June 2027: read 91 and 89 days ago,
-- unread 91 and 181 days ago, and one queued for the phone two days ago.
select private.notify('8d000000-0000-4000-b000-000000000001',
  array['8d000000-0000-4000-a000-000000000005']::uuid[], 'team.joined', '{}'::jsonb,
  actor => null, dedupe => c.key, at_time => '2027-06-01 00:00+00'::timestamptz - c.age)
from (values
  ('clean:read-91', interval '91 days'), ('clean:read-89', interval '89 days'),
  ('clean:unread-91', interval '91 days'), ('clean:unread-181', interval '181 days'),
  ('clean:queued', interval '2 days')
) as c (key, age);
update public.notifications n set read_at = n.created_at
where n.user_id = '8d000000-0000-4000-a000-000000000005'
  and n.dedupe_key in ('clean:read-91', 'clean:read-89');
update public.notifications n
set push_state = 'queued', push_after = n.created_at
where n.user_id = '8d000000-0000-4000-a000-000000000005' and n.dedupe_key = 'clean:queued';
select private.clean_notifications('2027-06-01 00:00+00');
select set_eq(
  $$select n.dedupe_key from public.notifications n
    where n.user_id = '8d000000-0000-4000-a000-000000000005' and n.dedupe_key like 'clean:%'$$,
  array['clean:read-89', 'clean:unread-91', 'clean:queued'],
  'read lines go after 90 days, any after 180'
);
select is(
  (select n.push_state from public.notifications n
   where n.user_id = '8d000000-0000-4000-a000-000000000005' and n.dedupe_key = 'clean:queued'),
  'skipped',
  'and a push that waited a day goes no more'
);

------------------------------------------------------------------------------
-- The jobs

select is(
  (select string_agg(j.jobname || '=' || j.command, ',' order by j.jobname)
   from cron.job j where j.jobname in ('notifications', 'notifications-clean')),
  'notifications=select private.notifications_tick(),notifications-clean=select private.clean_notifications()',
  'the minute job and the daily one run what they ran'
);

-- w3 clocked in 13 hours ago with no shift, and a line of theirs is due for
-- the phone now. Vault has neither secret here; the app's address alone is
-- added (where Vault takes it), then the secret.
with opened as (
  insert into public.time_entries (business_id, user_id, clock_in)
  values ('8d000000-0000-4000-b000-000000000001', '8d000000-0000-4000-a000-000000000005',
    now() - interval '13 hours')
  returning id
)
insert into ids
select 'entry-now', o.id from opened o;
select private.notify('8d000000-0000-4000-b000-000000000001',
  array['8d000000-0000-4000-a000-000000000005']::uuid[], 'team.joined', '{}'::jsonb,
  actor => null, dedupe => 'tick:due');
update public.notifications n
set push_state = 'queued', push_after = now() - interval '1 minute'
where n.user_id = '8d000000-0000-4000-a000-000000000005' and n.dedupe_key = 'tick:due';
select set_config('reminders.queued', (select count(*) from net.http_request_queue)::text, true);
do $$
begin
  perform vault.create_secret('http://127.0.0.1:9', 'app_url');
exception when others then
  raise notice 'Vault took no address here: %', sqlerrm;
end;
$$;

select lives_ok(
  $$select private.notifications_tick()$$,
  'the minute job runs with only the app''s address'
);
select is(
  (select count(*)::integer from net.http_request_queue),
  current_setting('reminders.queued')::integer,
  'and calls nothing without the secret'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.dedupe_key = 'clock.open:' || pg_temp.id('entry-now')),
  1,
  'it runs the reminders first, at its own time'
);

do $$
begin
  perform vault.create_secret('a-test-secret-that-never-leaves', 'cron_secret');
exception when others then
  raise notice 'Vault took no secret here: %', sqlerrm;
end;
$$;
select private.notifications_tick();
select is(
  (select count(*)::integer from net.http_request_queue),
  current_setting('reminders.queued')::integer + (
    select case when count(*) = 2 then 1 else 0 end
    from vault.decrypted_secrets v where v.name in ('app_url', 'cron_secret')
  )::integer,
  'with both, it asks the app to send what is due'
);

select is_empty(
  $$select n.id from public.notifications n
    where n.business_id = '8d000000-0000-4000-b000-000000000004'$$,
  'a demo business never gets a reminder'
);

select * from finish();
rollback;
