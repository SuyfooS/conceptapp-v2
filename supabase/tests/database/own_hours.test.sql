-- Hours somebody sets for themselves (20261108000300_sealed.sql): a manager or
-- clock.edit holder still records and corrects their own, marked 'self' for an
-- owner to confirm; what a manager sets for someone else is 'manager', and a
-- corrected time keeps no scan. Whether the clock needs a code, and where
-- codes show, are for an owner or the ConceptApp team.
-- Every call passes the time so the test does not depend on today.
begin;
select plan(26);

create function pg_temp.h(t text) returns text language sql as $$
  select encode(sha256(convert_to(t, 'utf8')), 'hex')
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to service_role;

insert into auth.users (id, aud, role, phone)
values
  ('6b000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000961'),
  ('6b000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000962'),
  ('6b000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000963'),
  ('6b000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000964'),
  ('6b000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000965'),
  ('6b000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000966');

-- a: owner of X; b and d: managers; c: worker; e: worker holding clock.edit;
-- f: on the ConceptApp team.
insert into public.businesses (id, slug, name)
values ('6b000000-0000-4000-b000-000000000001', 'own-x', 'Own X');

insert into public.memberships (business_id, user_id, role, active, perms)
values
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000a', 'owner', true, '{}'),
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000b', 'manager', true, '{}'),
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000c', 'worker', true, '{}'),
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000d', 'manager', true, '{}'),
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000e', 'worker', true, '{clock.edit}');

insert into public.platform_staff (user_id, role)
values ('6b000000-0000-4000-a000-00000000000f', 'onboarder');

insert into public.business_modules (business_id, module_key, enabled, settings)
values ('6b000000-0000-4000-b000-000000000001', 'time_clock', true, '{"requirePunchCode": true}');

set local role service_role;

-- Adding hours.
insert into ids values ('b1', public.add_time_entry('6b000000-0000-4000-a000-00000000000b',
  '6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000b',
  '2026-11-10 08:00+00', '2026-11-10 12:00+00', 'Forgot to punch', '2026-11-10 13:00+00'));
select is(
  (select in_proof || ' ' || out_proof from public.time_entries where id = (select id from ids where name = 'b1')),
  'self self',
  'a manager adds their own hours, marked as their own word'
);
insert into ids values ('c1', public.add_time_entry('6b000000-0000-4000-a000-00000000000b',
  '6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000c',
  '2026-11-10 08:00+00', '2026-11-10 12:00+00', 'Forgot to punch', '2026-11-10 13:00+00'));
select is(
  (select in_proof || ' ' || out_proof from public.time_entries where id = (select id from ids where name = 'c1')),
  'manager manager',
  'hours a manager adds for someone else rest on the manager'
);
insert into ids values ('e1', public.add_time_entry('6b000000-0000-4000-a000-00000000000e',
  '6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000e',
  '2026-11-10 08:00+00', '2026-11-10 12:00+00', 'Forgot to punch', '2026-11-10 13:00+00'));
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'e1')),
  'self',
  'so do a clock.edit holder''s own'
);
insert into ids values ('a1', public.add_time_entry('6b000000-0000-4000-a000-00000000000a',
  '6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000a',
  '2026-11-10 08:00+00', '2026-11-10 12:00+00', 'Forgot to punch', '2026-11-10 13:00+00'));
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'a1')),
  'manager',
  'an owner''s own hours need nobody else'
);
insert into ids values ('e2', public.add_time_entry('6b000000-0000-4000-a000-00000000000e',
  '6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000e',
  '2026-11-11 08:00+00', null, 'Forgot to punch', '2026-11-11 09:00+00'));
select is(
  (select in_proof || ' ' || coalesce(out_proof, '-') from public.time_entries
   where id = (select id from ids where name = 'e2')),
  'self -',
  'an entry added still open has no departure to mark'
);

-- Confirming them.
select throws_ok(
  format($$select public.confirm_time_entry('6b000000-0000-4000-a000-00000000000d', %L, '2026-11-10 14:00+00')$$,
    (select id from ids where name = 'b1')),
  '42501', 'Only an owner confirms hours someone set for themselves',
  'another manager cannot confirm a manager''s own hours'
);
select throws_ok(
  format($$select public.confirm_time_entry('6b000000-0000-4000-a000-00000000000b', %L, '2026-11-10 14:00+00')$$,
    (select id from ids where name = 'b1')),
  '42501', 'Someone else confirms your own hours', 'nor can the manager themselves'
);
select lives_ok(
  format($$select public.confirm_time_entry('6b000000-0000-4000-a000-00000000000a', %L, '2026-11-10 14:00+00')$$,
    (select id from ids where name = 'b1')),
  'the owner confirms them'
);
select is(
  (select confirmed_by from public.time_entries where id = (select id from ids where name = 'b1')),
  '6b000000-0000-4000-a000-00000000000a'::uuid,
  'and the entry keeps who did'
);
select throws_ok(
  format($$select public.confirm_time_entry('6b000000-0000-4000-a000-00000000000b', %L, '2026-11-10 14:00+00')$$,
    (select id from ids where name = 'c1')),
  '55000', null, 'hours a manager set for someone else need no confirming'
);

-- Correcting hours.
select public.issue_punch_code('6b000000-0000-4000-a000-00000000000b', '6b000000-0000-4000-b000-000000000001',
  pg_temp.h('k1'), '2026-11-12 08:00+00');
insert into ids values ('c2', public.clock_in('6b000000-0000-4000-a000-00000000000c',
  '6b000000-0000-4000-b000-000000000001', pg_temp.h('k1'), '2026-11-12 08:00:10+00'));
select public.correct_time_entry('6b000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'c2'), '2026-11-12 07:30+00', null, 'Came in early', '2026-11-12 09:00+00');
select is(
  (select in_proof || ' ' || (in_station is null)::text from public.time_entries
   where id = (select id from ids where name = 'c2')),
  'manager true',
  'a corrected arrival keeps no scan: the manager set it'
);
select public.correct_time_entry('6b000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'c2'), '2026-11-12 07:30+00', '2026-11-12 10:00+00', 'left early',
  '2026-11-12 11:00+00');
select is(
  (select in_proof || ' ' || out_proof from public.time_entries where id = (select id from ids where name = 'c2')),
  'manager manager',
  'a time that did not move keeps what it rested on'
);

select public.issue_punch_code('6b000000-0000-4000-a000-00000000000d', '6b000000-0000-4000-b000-000000000001',
  pg_temp.h('k2'), '2026-11-12 08:00+00');
insert into ids values ('b3', public.clock_in('6b000000-0000-4000-a000-00000000000b',
  '6b000000-0000-4000-b000-000000000001', pg_temp.h('k2'), '2026-11-12 08:00:20+00'));
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'b3')),
  'scan',
  'a manager scans another manager''s code'
);
select public.correct_time_entry('6b000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'b3'), '2026-11-12 07:00+00', null, 'Came in early', '2026-11-12 09:00+00');
select is(
  (select in_proof || ' ' || (in_station is null)::text from public.time_entries
   where id = (select id from ids where name = 'b3')),
  'self true',
  'and moving their own arrival makes it their own word'
);
select public.correct_time_entry('6b000000-0000-4000-a000-00000000000d',
  (select id from ids where name = 'b3'), '2026-11-12 07:10+00', null, 'Came in early', '2026-11-12 09:10+00');
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'b3')),
  'self',
  'another manager moving it does not take the mark off'
);
select public.correct_time_entry('6b000000-0000-4000-a000-00000000000a',
  (select id from ids where name = 'b3'), '2026-11-12 07:15+00', null, 'Came in early', '2026-11-12 09:20+00');
select is(
  (select in_proof from public.time_entries where id = (select id from ids where name = 'b3')),
  'manager',
  'the owner moving it does'
);

-- A confirmed entry the person moves again needs confirming again.
select public.correct_time_entry('6b000000-0000-4000-a000-00000000000b',
  (select id from ids where name = 'b1'), '2026-11-10 08:30+00', '2026-11-10 12:00+00', 'Came in late',
  '2026-11-10 15:00+00');
select is(
  (select in_proof || ' ' || out_proof || ' ' || (confirmed_at is null)::text
   from public.time_entries where id = (select id from ids where name = 'b1')),
  'self self true',
  'moving one''s own confirmed hours takes the confirmation away'
);
select lives_ok(
  format($$select public.confirm_time_entry('6b000000-0000-4000-a000-00000000000a', %L, '2026-11-10 16:00+00')$$,
    (select id from ids where name = 'b1')),
  'and the owner confirms them again'
);

-- The punch code settings.
select throws_ok(
  $$select public.set_module_settings('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', 'time_clock', '{"requirePunchCode": false}')$$,
  '42501', 'Only an owner or the team changes the punch code',
  'a manager cannot switch the code off'
);
select throws_ok(
  $$select public.set_module_settings('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true, "codeDisplay": "manager"}')$$,
  '42501', 'Only an owner or the team changes the punch code',
  'nor move where codes show, even with another field'
);
select lives_ok(
  $$select public.set_module_settings('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true}')$$,
  'a manager still changes the other clock settings'
);
select lives_ok(
  $$select public.set_module_settings('6b000000-0000-4000-a000-00000000000a',
    '6b000000-0000-4000-b000-000000000001', 'time_clock', '{"codeDisplay": "station"}')$$,
  'the owner chooses where codes show'
);
select lives_ok(
  $$select public.set_module_settings('6b000000-0000-4000-a000-00000000000f',
    '6b000000-0000-4000-b000-000000000001', 'time_clock', '{"requirePunchCode": false}')$$,
  'the ConceptApp team switches the code off'
);
select throws_ok(
  $$select public.set_module_settings('6b000000-0000-4000-a000-00000000000a',
    '6b000000-0000-4000-b000-000000000001', 'time_clock', '{"codeDisplay": "everywhere"}')$$,
  '22023', 'Not a punch code setting', 'codes show on a station, a manager''s phone, or both'
);
select throws_ok(
  $$select public.set_module_settings('6b000000-0000-4000-a000-00000000000a',
    '6b000000-0000-4000-b000-000000000001', 'time_clock', '{"requirePunchCode": "yes"}')$$,
  '22023', 'Not a punch code setting', 'whether a code is needed is yes or no'
);
select is(
  (select settings from public.business_modules
   where business_id = '6b000000-0000-4000-b000-000000000001' and module_key = 'time_clock'),
  '{"unpaidBreaks": true, "codeDisplay": "station", "requirePunchCode": false}'::jsonb,
  'only the allowed changes were saved'
);

reset role;
select * from finish();
rollback;
