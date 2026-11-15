-- Team changes (20261114000100_team_changes.sql; Orel, 14 November 2026):
-- only the server removes someone, changes a role or cancels an invite, by the
-- rule of inviting (an owner acts on every role, a manager on managers and
-- workers), never on oneself, in a demo or for someone clocked in. Removing
-- keeps the membership, inactive, and every record; takes the person off
-- their shifts still to start, in published weeks and drafts, with the swaps
-- they asked for, departments, open lists and lists' times; opens again a
-- colleague's swap they took that still waited for approval (Orel, 15
-- November 2026), telling its asker and offering it again; tells the
-- schedule's other builders how many shifts lack someone, and the person
-- nothing; and leaves
-- them reading nothing of the business but its name, through
-- public.own_departures. A role change to an accountant takes them off the
-- staff the same way. A cancelled invite's link stops working and its number
-- is free. Fixed ids and numbers of its own (8e…, 050-000-71xx) and explicit
-- times, so nothing here meets the seeded people or the clock; its slugs
-- (tchg-…) are its own too.
begin;
select plan(96);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('8e000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500007101'),
  ('8e000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500007102'),
  ('8e000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500007103'),
  ('8e000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500007104'),
  ('8e000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500007105'),
  ('8e000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500007106'),
  ('8e000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500007107'),
  ('8e000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500007108'),
  ('8e000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500007109'),
  ('8e000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500007110'),
  ('8e000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500007111'),
  ('8e000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500007112'),
  ('8e000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500007113'),
  ('8e000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500007114');

update public.profiles set full_name = 'Wendy One'
where id = '8e000000-0000-4000-a000-000000000005';

-- X: 1, 2 owners; 3, 4 managers; 5, 6 workers; 7, 8 accountants (8 also a
-- worker of Y); 9 a worker clocked in now; a a worker who becomes an
-- accountant. Y: b its manager. D, a demo closed to invites: c its owner, d a
-- worker. e is on the ConceptApp team.
insert into public.businesses (id, slug, name)
values
  ('8e000000-0000-4000-b000-000000000001', 'tchg-x', 'Team X'),
  ('8e000000-0000-4000-b000-000000000002', 'tchg-y', 'Team Y'),
  ('8e000000-0000-4000-b000-000000000003', 'tchg-d', 'Team D');

insert into private.demo_businesses (business_id, definition)
values ('8e000000-0000-4000-b000-000000000003', '{"slug": "tchg-d"}');

insert into public.memberships (business_id, user_id, role, perms)
values
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000001', 'owner', '{}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000002', 'owner', '{}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000003', 'manager', '{clock.payroll}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000004', 'manager', '{lists.manage}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005', 'worker', '{lists.manage}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000006', 'worker', '{}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000007', 'accountant', '{}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000008', 'accountant', '{}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000009', 'worker', '{}'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-00000000000a', 'worker', '{lists.manage}'),
  ('8e000000-0000-4000-b000-000000000002', '8e000000-0000-4000-a000-00000000000b', 'manager', '{}'),
  ('8e000000-0000-4000-b000-000000000002', '8e000000-0000-4000-a000-000000000008', 'worker', '{}'),
  ('8e000000-0000-4000-b000-000000000003', '8e000000-0000-4000-a000-00000000000c', 'owner', '{}'),
  ('8e000000-0000-4000-b000-000000000003', '8e000000-0000-4000-a000-00000000000d', 'worker', '{}');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('8e000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('8e000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('8e000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('8e000000-0000-4000-b000-000000000002', 'notifications', true, '{}'),
  ('8e000000-0000-4000-b000-000000000003', 'notifications', true, '{}');

insert into public.platform_staff (user_id, role)
values ('8e000000-0000-4000-a000-00000000000e', 'onboarder');

-- Hours already worked, and someone clocked in now.
insert into public.time_entries (business_id, user_id, clock_in, clock_out)
values
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005',
   '2026-11-22 05:00+00', '2026-11-22 13:00+00'),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000009',
   '2026-11-24 05:00+00', null);

-- 5 and 6 in the kitchen; 5 holds an open list and a done one, and a list's
-- times are theirs.
insert into public.departments (id, business_id, key, name)
values ('8e000000-0000-4000-d000-000000000001', '8e000000-0000-4000-b000-000000000001', 'kitchen', 'Kitchen');
insert into public.department_members (department_id, business_id, user_id)
values
  ('8e000000-0000-4000-d000-000000000001', '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005'),
  ('8e000000-0000-4000-d000-000000000001', '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000006');

insert into public.lists (id, business_id, name, origin, status, recipient_kind, opens_at, finished_at)
values
  ('8e000000-0000-4000-e000-000000000001', '8e000000-0000-4000-b000-000000000001',
   'Open', 'sent', 'open', 'person', '2026-11-23 06:00+00', null),
  ('8e000000-0000-4000-e000-000000000002', '8e000000-0000-4000-b000-000000000001',
   'Done', 'sent', 'finished', 'person', '2026-11-22 06:00+00', '2026-11-22 07:00+00');
insert into public.list_people (list_id, business_id, user_id)
values
  ('8e000000-0000-4000-e000-000000000001', '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005'),
  ('8e000000-0000-4000-e000-000000000002', '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005');

insert into public.list_templates (id, business_id, name)
values ('8e000000-0000-4000-f000-000000000001', '8e000000-0000-4000-b000-000000000001', 'Opening');
insert into public.list_schedules (
  template_id, business_id, days, opens_offset, due_offset, recipient_kind,
  recipient_user, starts_on
)
values (
  '8e000000-0000-4000-f000-000000000001', '8e000000-0000-4000-b000-000000000001',
  '{0}', 480, 540, 'person', '8e000000-0000-4000-a000-000000000005', '2026-11-22'
);

-- Invites of X: a worker's open one, an owner's open one, an accountant's
-- expired one and a claimed one.
insert into public.invites (id, business_id, phone, role, full_name, token_hash, expires_at, claimed_at)
values
  ('8e000000-0000-4000-c000-000000000001', '8e000000-0000-4000-b000-000000000001',
   '+972500007121', 'worker', 'Gal', repeat('c', 63) || '1', now() + interval '3 days', null),
  ('8e000000-0000-4000-c000-000000000002', '8e000000-0000-4000-b000-000000000001',
   '+972500007122', 'owner', 'Partner', repeat('c', 63) || '2', now() + interval '3 days', null),
  ('8e000000-0000-4000-c000-000000000003', '8e000000-0000-4000-b000-000000000001',
   '+972500007123', 'accountant', 'Books', repeat('c', 63) || '3', now() - interval '1 day', null),
  ('8e000000-0000-4000-c000-000000000004', '8e000000-0000-4000-b000-000000000001',
   '+972500007124', 'worker', 'Done', repeat('c', 63) || '4', now() + interval '3 days', now());

-- Lines the changes settle: a manager's hours to confirm for 4, waiting for
-- the phone, the pay office's lines of 3, and a document waiting for the
-- owner 2.
insert into public.notifications (
  business_id, user_id, kind, source_module, audience_role, dedupe_key,
  push_state, push_after
)
values
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000004',
   'clock.confirm', 'time_clock', 'manager', 'clock.confirm:tc', 'queued', now()),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000003',
   'documents.received', 'chat', 'worker', 'documents.received:tc', 'none', null),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000002',
   'documents.received', 'chat', 'worker', 'documents.received:tc2', 'none', null),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000003',
   'access.pay_granted', 'time_clock', 'worker',
   'access.pay:8e000000-0000-4000-a000-000000000003', 'none', null),
  ('8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005',
   'team.joined', null, 'worker', 'tc:queued', 'queued', now());

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Runs a statement and undoes it: 'ok', or the refusal's code and hint.
create function pg_temp.outcome(statement text) returns text language plpgsql as $$
declare
  code text;
  why text;
begin
  begin
    execute statement;
    raise exception 'tried' using errcode = 'P0001', hint = 'tc-tried';
  exception when others then
    get stacked diagnostics code = returned_sqlstate, why = pg_exception_hint;
    if why = 'tc-tried' then
      return 'ok';
    end if;
    return code || coalesce(':' || nullif(why, ''), '');
  end;
end;
$$;

create function pg_temp.removal(actor uuid, person uuid) returns text language sql as $$
  select pg_temp.outcome(format(
    'select public.remove_member(%L, %L, %L, %L)',
    actor, '8e000000-0000-4000-b000-000000000001', person, '2026-11-24 08:00+00'
  ))
$$;

create function pg_temp.change(actor uuid, person uuid, to_role public.member_role)
returns text language sql as $$
  select pg_temp.outcome(format(
    'select public.set_member_role(%L, %L, %L, %L, at_time => %L)',
    actor, '8e000000-0000-4000-b000-000000000001', person, to_role, '2026-11-24 08:00+00'
  ))
$$;

-- Every change `actor` makes of the owner 2, the manager 4, the worker 5 and
-- the accountant 7, to each role in turn.
create function pg_temp.changes(actor uuid) returns text[] language sql as $$
  select array_agg(pg_temp.change(actor, t.person, r.to_role) order by t.n, r.n)
  from (values
    (1, '8e000000-0000-4000-a000-000000000002'::uuid),
    (2, '8e000000-0000-4000-a000-000000000004'::uuid),
    (3, '8e000000-0000-4000-a000-000000000005'::uuid),
    (4, '8e000000-0000-4000-a000-000000000007'::uuid)
  ) as t (n, person)
  cross join (values
    (1, 'owner'::public.member_role), (2, 'manager'::public.member_role),
    (3, 'worker'::public.member_role), (4, 'accountant'::public.member_role)
  ) as r (n, to_role)
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;

------------------------------------------------------------------------------
-- Only the server

select ok(
  not has_function_privilege('authenticated', 'public.remove_member(uuid, uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.remove_member(uuid, uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_member_role(uuid, uuid, uuid, public.member_role, public.member_role, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.set_member_role(uuid, uuid, uuid, public.member_role, public.member_role, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.team_invite_cancel(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.team_invite_cancel(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.remove_member(uuid, uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.set_member_role(uuid, uuid, uuid, public.member_role, public.member_role, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.team_invite_cancel(uuid, uuid, timestamptz)', 'execute'),
  'only the server removes someone, changes a role or cancels an invite'
);
select ok(
  has_function_privilege('authenticated', 'public.own_departures()', 'execute')
  and not has_function_privilege('anon', 'public.own_departures()', 'execute'),
  'the signed-in person asks for their own departures, nobody signed out'
);
select pg_temp.sign_in('8e000000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.remove_member('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000006')$$,
  '42501', null, 'a signed-in owner cannot remove through the function'
);
reset role;

------------------------------------------------------------------------------
-- Who may (decision 1): as with inviting

set local role service_role;
select is(
  array[
    pg_temp.removal('8e000000-0000-4000-a000-000000000001', '8e000000-0000-4000-a000-000000000002'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000001', '8e000000-0000-4000-a000-000000000004'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000001', '8e000000-0000-4000-a000-000000000005'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000001', '8e000000-0000-4000-a000-000000000008')
  ],
  array['ok', 'ok', 'ok', 'ok'],
  'an owner removes another owner, a manager, a worker and an accountant'
);
select is(
  array[
    pg_temp.removal('8e000000-0000-4000-a000-000000000003', '8e000000-0000-4000-a000-000000000002'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000003', '8e000000-0000-4000-a000-000000000004'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000003', '8e000000-0000-4000-a000-000000000005'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000003', '8e000000-0000-4000-a000-000000000008')
  ],
  array['42501', 'ok', 'ok', '42501'],
  'a manager removes managers and workers, never an owner or an accountant'
);
select is(
  array[
    pg_temp.removal('8e000000-0000-4000-a000-000000000006', '8e000000-0000-4000-a000-000000000002'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000006', '8e000000-0000-4000-a000-000000000004'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000006', '8e000000-0000-4000-a000-000000000005'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000006', '8e000000-0000-4000-a000-000000000008')
  ],
  array['42501', '42501', '42501', '42501'],
  'a worker removes nobody'
);
select is(
  array[
    pg_temp.removal('8e000000-0000-4000-a000-000000000007', '8e000000-0000-4000-a000-000000000002'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000007', '8e000000-0000-4000-a000-000000000004'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000007', '8e000000-0000-4000-a000-000000000005'),
    pg_temp.removal('8e000000-0000-4000-a000-000000000007', '8e000000-0000-4000-a000-000000000008')
  ],
  array['42501', '42501', '42501', '42501'],
  'nor does an accountant, who ranks as a worker'
);

select is(
  pg_temp.changes('8e000000-0000-4000-a000-000000000001'),
  array_fill('ok'::text, array[16]),
  'an owner changes anyone''s role to any role, the same one included'
);
select is(
  pg_temp.changes('8e000000-0000-4000-a000-000000000003'),
  array[
    '42501', '42501', '42501', '42501',
    '42501', 'ok', 'ok', '42501',
    '42501', 'ok', 'ok', '42501',
    '42501', '42501', '42501', '42501'
  ],
  'a manager changes only between manager and worker'
);
select is(
  pg_temp.changes('8e000000-0000-4000-a000-000000000006'),
  array_fill('42501'::text, array[16]),
  'a worker changes no role'
);
select is(
  pg_temp.changes('8e000000-0000-4000-a000-000000000008'),
  array_fill('42501'::text, array[16]),
  'nor does an accountant'
);

------------------------------------------------------------------------------
-- And never

select throws_ok(
  $$select public.remove_member('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000001')$$,
  '22023', null, 'nobody removes themselves'
);
select throws_ok(
  $$select public.set_member_role('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000001', 'manager')$$,
  '22023', null, 'nor changes their own role'
);
select throws_ok(
  $$select public.set_member_role('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005', null)$$,
  '22023', null, 'a role change names the new role'
);
select throws_ok(
  $$select public.remove_member('8e000000-0000-4000-a000-00000000000b',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000006')$$,
  '42501', null, 'a manager of another business removes nobody here'
);
select throws_ok(
  $$select public.remove_member('8e000000-0000-4000-a000-00000000000e',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000006')$$,
  '42501', null, 'nor does the ConceptApp team, viewing or not'
);
select throws_ok(
  $$select public.remove_member('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', gen_random_uuid())$$,
  'P0002', null, 'someone not on the team is not found'
);
select is(
  pg_temp.outcome($$select public.remove_member('8e000000-0000-4000-a000-00000000000c',
    '8e000000-0000-4000-b000-000000000003', '8e000000-0000-4000-a000-00000000000d')$$),
  '55000:demo',
  'a demo business closed to invites keeps its people'
);
select is(
  pg_temp.outcome($$select public.set_member_role('8e000000-0000-4000-a000-00000000000c',
    '8e000000-0000-4000-b000-000000000003', '8e000000-0000-4000-a000-00000000000d', 'manager')$$),
  '55000:demo',
  'and their roles'
);
select is(
  pg_temp.removal('8e000000-0000-4000-a000-000000000001', '8e000000-0000-4000-a000-000000000009'),
  '55000:clocked_in',
  'someone clocked in is not removed: they could not clock out'
);
select is(
  pg_temp.change('8e000000-0000-4000-a000-000000000001', '8e000000-0000-4000-a000-000000000009', 'accountant'),
  '55000:clocked_in',
  'nor taken off the staff'
);
select is(
  pg_temp.change('8e000000-0000-4000-a000-000000000001', '8e000000-0000-4000-a000-000000000009', 'manager'),
  'ok',
  'though their role on the staff may change'
);
select is(
  pg_temp.change('8e000000-0000-4000-a000-000000000001', '8e000000-0000-4000-a000-000000000008', 'worker'),
  '23505',
  'an accountant on another business''s staff does not join this one''s'
);
reset role;

------------------------------------------------------------------------------
-- Removing someone (decision 2)

-- The week of 22.11 is published, the week of 29.11 a draft. 5 is on a past
-- shift, one under way at the moment of removal (Tuesday 10:00 in Israel),
-- and two still to start; 6 shares one of them; a is on Friday's.
insert into ids values
  ('week', public.open_schedule_week('8e000000-0000-4000-b000-000000000001', '2026-11-22', '2026-11-18 16:00+00')),
  ('draft', public.open_schedule_week('8e000000-0000-4000-b000-000000000001', '2026-11-29', '2026-11-25 16:00+00'));

select public.publish_week_schedule('8e000000-0000-4000-a000-000000000003',
  (select id from ids where name = 'week'),
  '[{"day": "2026-11-22", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-000000000005"}]},
    {"day": "2026-11-24", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-000000000005"}]},
    {"day": "2026-11-24", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 2,
     "assignees": [{"user": "8e000000-0000-4000-a000-000000000005"},
                   {"user": "8e000000-0000-4000-a000-000000000006"}]},
    {"day": "2026-11-25", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-000000000005"}]},
    {"day": "2026-11-26", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-000000000006"}]},
    {"day": "2026-11-27", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-00000000000a"}]}]');
select public.save_week_schedule('8e000000-0000-4000-a000-000000000003',
  (select id from ids where name = 'draft'),
  '[{"day": "2026-11-29", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-000000000005"}]},
    {"day": "2026-11-30", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-00000000000a"}]}]');

insert into ids
select lower(s.name) || '-' || to_char(s.day, 'DD'), s.id
from public.schedule_shifts s
where s.business_id = '8e000000-0000-4000-b000-000000000001';

-- 5 asks to give Tuesday evening away and a takes it, waiting for approval;
-- 5 asks to give Wednesday away, and nobody takes it; 6 asks to give
-- Thursday away and 5 takes it, waiting for approval; a asks to give Friday
-- away, 5 takes it and the manager 3 approves, so Friday is 5's.
insert into ids values
  ('swap-tue', public.request_shift_swap('8e000000-0000-4000-a000-000000000005',
    (select id from ids where name = 'evening-24'), null, '2026-11-23 08:00+00')),
  ('swap-wed', public.request_shift_swap('8e000000-0000-4000-a000-000000000005',
    (select id from ids where name = 'morning-25'), null, '2026-11-23 08:00+00')),
  ('swap-thu', public.request_shift_swap('8e000000-0000-4000-a000-000000000006',
    (select id from ids where name = 'evening-26'), null, '2026-11-23 08:00+00')),
  ('swap-fri', public.request_shift_swap('8e000000-0000-4000-a000-00000000000a',
    (select id from ids where name = 'morning-27'), null, '2026-11-23 08:00+00'));
select public.take_shift_swap('8e000000-0000-4000-a000-00000000000a',
  (select id from ids where name = 'swap-tue'), '2026-11-23 09:00+00');
select public.take_shift_swap('8e000000-0000-4000-a000-000000000005',
  (select id from ids where name = 'swap-thu'), '2026-11-23 09:00+00');
select public.take_shift_swap('8e000000-0000-4000-a000-000000000005',
  (select id from ids where name = 'swap-fri'), '2026-11-23 09:00+00');
select public.decide_shift_swap('8e000000-0000-4000-a000-000000000003',
  (select id from ids where name = 'swap-fri'), true, '2026-11-23 10:00+00');

create temporary table removed on commit drop as
select public.remove_member('8e000000-0000-4000-a000-000000000001',
  '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005',
  '2026-11-24 08:00+00') as result;

select is(
  (select result from removed),
  '{"shifts": 3, "drafts": 1, "swaps": 2, "reopened": 1}'::jsonb,
  'removing says what came off: three published shifts, one in a draft, two swaps cancelled and one open again'
);
select throws_ok(
  $$select public.remove_member('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000005',
    '2026-11-24 08:30+00')$$,
  'P0002', null, 'someone already taken off is not found: two managers removing them at once'
);
-- A builder opened before the removal still holds them on the draft: the
-- words that say so (scheduleTeamChanged in packages/db/schedule-errors.ts)
-- match this message.
select throws_ok(
  format(
    $$select public.save_week_schedule('8e000000-0000-4000-a000-000000000003', %L,
      '[{"day": "2026-11-29", "name": "Morning", "start": "07:00", "end": "15:00",
         "needed": 1, "assignees": [{"user": "8e000000-0000-4000-a000-000000000005"}]}]')$$,
    (select id from ids where name = 'draft')
  ),
  '22023', 'Only active members of the business can work a shift',
  'a draft saved from a builder opened before puts nobody off the team back on it'
);
select is(
  (select row(m.active, m.perms, m.left_at)::text from public.memberships m
   where m.business_id = '8e000000-0000-4000-b000-000000000001'
     and m.user_id = '8e000000-0000-4000-a000-000000000005'),
  row(false, '{}'::text[], '2026-11-24 08:00+00'::timestamptz)::text,
  'the membership stays, inactive, with its personal permissions cleared and when they left'
);
select is(
  (select array_agg(to_char(s.day, 'DD') || ' ' || s.name order by s.day, s.starts_at)
   from public.shift_assignments a join public.schedule_shifts s on s.id = a.shift_id
   where a.user_id = '8e000000-0000-4000-a000-000000000005'),
  array['22 Morning', '24 Morning'],
  'the shifts past and under way keep them: they are history'
);
select is(
  (select count(*)::int from public.shift_assignments a
   join public.schedule_shifts s on s.id = a.shift_id
   where s.week_id = (select id from ids where name = 'draft')
     and a.user_id = '8e000000-0000-4000-a000-000000000005'),
  0,
  'they are off the draft''s shifts too, or it could never be saved again'
);
select is(
  (select array_agg(a.user_id) from public.shift_assignments a
   where a.shift_id = (select id from ids where name = 'evening-24')),
  array['8e000000-0000-4000-a000-000000000006'::uuid],
  'a colleague on the same shift stays on it, which now lacks someone'
);
select is(
  (select array_agg(w.status::text order by w.status::text) from public.shift_swaps w
   where w.id in (
     (select id from ids where name = 'swap-tue'), (select id from ids where name = 'swap-wed')
   )),
  array['cancelled', 'cancelled'],
  'the swaps they asked for on shifts ahead, taken or not, are cancelled: their place on them comes off anyway'
);
select is(
  (select row(w.status, w.taken_by, w.taken_at)::text from public.shift_swaps w
   where w.id = (select id from ids where name = 'swap-thu')),
  row('open'::public.swap_status, null::uuid, null::timestamptz)::text,
  'a colleague''s swap they took, still waiting for approval, is open again with no taker'
);
select is(
  (select array_agg(a.user_id) from public.shift_assignments a
   where a.shift_id = (select id from ids where name = 'evening-26')),
  array['8e000000-0000-4000-a000-000000000006'::uuid],
  'and the colleague who asked is still on that shift'
);
select is(
  (select w.status::text from public.shift_swaps w
   where w.id = (select id from ids where name = 'swap-fri')),
  'approved',
  'a swap already approved stays as it was'
);
select is(
  (select count(*)::int from public.shift_assignments a
   where a.shift_id = (select id from ids where name = 'morning-27')),
  0,
  'and the shift it gave them comes off them as any of theirs does'
);
select is(
  (select array_agg(n.user_id order by n.user_id) from public.notifications n
   where n.business_id = '8e000000-0000-4000-b000-000000000001'
     and n.kind = 'schedule.unfilled' and n.resolved_at is null),
  array[
    '8e000000-0000-4000-a000-000000000002'::uuid,
    '8e000000-0000-4000-a000-000000000003'::uuid,
    '8e000000-0000-4000-a000-000000000004'::uuid
  ],
  'the schedule''s other builders hear of it, not the owner who removed them'
);
select is(
  (select distinct n.params || jsonb_build_object('audience', n.audience_role, 'module', n.source_module)
   from public.notifications n
   where n.business_id = '8e000000-0000-4000-b000-000000000001' and n.kind = 'schedule.unfilled'),
  jsonb_build_object(
    'week', (select id from ids where name = 'week'),
    'startsOn', '2026-11-22',
    'count', 3,
    'audience', 'manager',
    'module', 'scheduling'
  ),
  'the line says the week and how many of its shifts ahead lack someone, never who'
);
select is(
  (select count(*)::int from public.notifications n
   where n.kind = 'schedule.unfilled'
     and n.params ->> 'week' = (select id::text from ids where name = 'draft')),
  0,
  'a draft tells nobody: its builders see it as they build'
);
select is(
  (select n.kind || ' ' || (n.read_at is null)::text || ' '
      || (select string_agg(k.key, ',' order by k.key) from jsonb_object_keys(n.params) as k (key))
   from public.notifications n
   where n.user_id = '8e000000-0000-4000-a000-000000000006'
     and n.dedupe_key = 'swap:' || (select id from ids where name = 'swap-thu')),
  'swap.reopened true shift,swap',
  'the colleague whose shift they took hears, unread, that the request is open again, and not who took it'
);
select is(
  (select array_agg(n.user_id order by n.user_id) from public.notifications n
   where n.dedupe_key = 'swap.approval:' || (select id from ids where name = 'swap-thu')
     and n.resolved_at is not null and n.read_at is not null),
  array[
    '8e000000-0000-4000-a000-000000000001'::uuid,
    '8e000000-0000-4000-a000-000000000002'::uuid,
    '8e000000-0000-4000-a000-000000000003'::uuid,
    '8e000000-0000-4000-a000-000000000004'::uuid
  ],
  'the approval waiting on the swap open again is settled for every owner and manager'
);
select is(
  (select n.kind || ' ' || (n.read_at is null)::text from public.notifications n
   where n.user_id = '8e000000-0000-4000-a000-00000000000a'
     and n.dedupe_key = 'swap:' || (select id from ids where name = 'swap-tue')),
  'swap.removed true',
  'the colleague who took a swap they asked for hears, unread, that it was cancelled'
);
select is(
  (select array_agg(n.user_id order by n.user_id) from public.notifications n
   where n.dedupe_key = 'swap.approval:' || (select id from ids where name = 'swap-tue')
     and n.resolved_at is not null and n.read_at is not null),
  array[
    '8e000000-0000-4000-a000-000000000001'::uuid,
    '8e000000-0000-4000-a000-000000000002'::uuid,
    '8e000000-0000-4000-a000-000000000003'::uuid,
    '8e000000-0000-4000-a000-000000000004'::uuid
  ],
  'and the approval waiting on it is settled for every owner and manager'
);
select ok(
  (select count(*) from public.notifications n
   where n.dedupe_key = 'swap.offer:' || (select id from ids where name = 'swap-wed')) > 0
  and not exists (
    select 1 from public.notifications n
    where n.dedupe_key = 'swap.offer:' || (select id from ids where name = 'swap-wed')
      and n.resolved_at is null
  ),
  'the offer of the swap cancelled that nobody took is settled'
);
select is(
  (select array_agg(n.user_id order by n.user_id) from public.notifications n
   where n.dedupe_key = 'swap.offer:' || (select id from ids where name = 'swap-thu')
     and n.kind = 'swap.offered'
     and n.resolved_at is null and n.read_at is null),
  array[
    '8e000000-0000-4000-a000-000000000001'::uuid,
    '8e000000-0000-4000-a000-000000000002'::uuid,
    '8e000000-0000-4000-a000-000000000003'::uuid,
    '8e000000-0000-4000-a000-000000000004'::uuid,
    '8e000000-0000-4000-a000-000000000009'::uuid,
    '8e000000-0000-4000-a000-00000000000a'::uuid
  ],
  'the request open again is offered, unread, to everyone on the staff who may take it, as a new one is'
);
select is(
  (select count(*)::int from public.notifications n
   where n.business_id = '8e000000-0000-4000-b000-000000000001'
     and n.user_id = '8e000000-0000-4000-a000-000000000005'
     and (n.read_at is null or n.push_state = 'queued')),
  0,
  'their own lines are read, and none goes to their phone'
);
select is(
  (select count(*)::int from public.notifications n
   where n.user_id = '8e000000-0000-4000-a000-000000000005'
     and n.kind in ('schedule.unfilled', 'swap.removed', 'swap.reopened', 'schedule.changed')),
  0,
  'and they are told nothing (decision 3)'
);
select is(
  (select array_agg(dm.user_id) from public.department_members dm
   where dm.department_id = '8e000000-0000-4000-d000-000000000001'),
  array['8e000000-0000-4000-a000-000000000006'::uuid],
  'they leave their departments'
);
select is(
  (select array_agg(p.list_id) from public.list_people p
   where p.user_id = '8e000000-0000-4000-a000-000000000005'),
  array['8e000000-0000-4000-e000-000000000002'::uuid],
  'and the open lists sent to them; a list done keeps them on its record'
);
select is(
  (select count(*)::int from public.list_schedules ls
   where ls.recipient_user = '8e000000-0000-4000-a000-000000000005'),
  0,
  'a list''s times for them go with their place'
);
select is(
  (select count(*)::int from public.time_entries e
   where e.user_id = '8e000000-0000-4000-a000-000000000005'),
  1,
  'the hours they worked stay for payroll'
);
select ok(
  exists (
    select 1 from public.employment_periods p
    where p.user_id = '8e000000-0000-4000-a000-000000000005'
      and p.source = 'joined' and p.ended_on is not null
  ),
  'their period of work closes'
);
select is(
  (select jsonb_build_object(
      'actor', a.actor_id,
      'role', a.details -> 'role',
      'perms', a.details -> 'perms',
      'shifts', jsonb_array_length(a.details -> 'shifts'),
      'drafts', a.details -> 'drafts',
      'swaps', jsonb_array_length(a.details -> 'swaps'),
      'reopened', jsonb_array_length(a.details -> 'reopened'),
      'reopened_for', a.details #> '{reopened,0,requested_by}',
      'departments', a.details -> 'departments',
      'lists', a.details -> 'lists',
      'list_times', a.details -> 'list_times')
   from public.audit_log a
   where a.business_id = '8e000000-0000-4000-b000-000000000001'
     and a.action = 'member.remove'
     and a.details ->> 'person' = '8e000000-0000-4000-a000-000000000005'),
  jsonb_build_object(
    'actor', '8e000000-0000-4000-a000-000000000001',
    'role', 'worker',
    'perms', jsonb_build_array('lists.manage'),
    'shifts', 3,
    'drafts', 1,
    'swaps', 2,
    'reopened', 1,
    'reopened_for', '8e000000-0000-4000-a000-000000000006',
    'departments', 1,
    'lists', 1,
    'list_times', 1),
  'the log says who did it, the role, and what came off'
);
select ok(
  (select position('Wendy' in a.details::text) = 0
     and position('972500007105' in a.details::text) = 0
   from public.audit_log a
   where a.action = 'member.remove'
     and a.details ->> 'person' = '8e000000-0000-4000-a000-000000000005'),
  'never their name or number'
);

-- What they read now.
select pg_temp.sign_in('8e000000-0000-4000-a000-000000000005');
select is(
  array[
    (select count(*)::int from public.memberships m
     where m.business_id = '8e000000-0000-4000-b000-000000000001'),
    (select count(*)::int from public.businesses b
     where b.id = '8e000000-0000-4000-b000-000000000001'),
    (select count(*)::int from public.schedule_shifts s
     where s.business_id = '8e000000-0000-4000-b000-000000000001'),
    (select count(*)::int from public.shift_swaps w
     where w.business_id = '8e000000-0000-4000-b000-000000000001'),
    (select count(*)::int from public.notifications n
     where n.business_id = '8e000000-0000-4000-b000-000000000001'),
    (select count(*)::int from public.profiles p
     where p.id <> '8e000000-0000-4000-a000-000000000005'
       and p.id::text like '8e000000-%')
  ],
  array[0, 0, 0, 0, 0, 0],
  'removed, they read nothing of the business: the team, the business, the schedule, swaps, lines, colleagues'
);
select is(
  (select array_agg(d.business::text || ' ' || d.name || ' ' || d.left_at::text)
   from public.own_departures() d),
  array['8e000000-0000-4000-b000-000000000001 Team X 2026-11-24 08:00:00+00'],
  'but they are told which business they are no longer on the team of'
);
reset role;

select pg_temp.sign_in('8e000000-0000-4000-a000-000000000004');
select is(
  (select m.active from public.memberships m
   where m.business_id = '8e000000-0000-4000-b000-000000000001'
     and m.user_id = '8e000000-0000-4000-a000-000000000005'),
  false,
  'a manager still reads their row, as someone who left'
);
reset role;

-- Their name: no colleague reads it now, and a pay holder still does, for
-- the hours they worked (the person's page names them to pay holders only).
select pg_temp.sign_in('8e000000-0000-4000-a000-000000000006');
select is_empty(
  $$select 1 from public.profiles where id = '8e000000-0000-4000-a000-000000000005'$$,
  'a colleague no longer reads their name'
);
reset role;
select pg_temp.sign_in('8e000000-0000-4000-a000-000000000001');
select isnt_empty(
  $$select 1 from public.profiles where id = '8e000000-0000-4000-a000-000000000005'$$,
  'a pay holder still does'
);
reset role;

-- Publishing the week again: its builders saw it. The owner 1 is on
-- Saturday now.
select public.publish_week_schedule('8e000000-0000-4000-a000-000000000003',
  (select id from ids where name = 'week'),
  '[{"day": "2026-11-24", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 2,
     "assignees": [{"user": "8e000000-0000-4000-a000-000000000006"}]},
    {"day": "2026-11-25", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": []},
    {"day": "2026-11-27", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-00000000000a"}]},
    {"day": "2026-11-28", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "8e000000-0000-4000-a000-000000000001"}]}]');
select is(
  (select count(*)::int from public.notifications n
   where n.kind = 'schedule.unfilled' and n.resolved_at is null),
  0,
  'publishing the week again settles its line'
);

------------------------------------------------------------------------------
-- Changing a role

select is(
  public.set_member_role('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000004',
    'worker', at_time => '2026-11-24 08:00+00'),
  '{"changed": true, "shifts": 0, "drafts": 0, "swaps": 0, "reopened": 0}'::jsonb,
  'an owner makes a manager a worker'
);
select is(
  (select row(m.role, m.perms)::text from public.memberships m
   where m.business_id = '8e000000-0000-4000-b000-000000000001'
     and m.user_id = '8e000000-0000-4000-a000-000000000004'),
  row('worker'::public.member_role, '{lists.manage}'::text[])::text,
  'on the staff still, they keep their personal permissions'
);
select is(
  (select row(n.read_at is not null, n.push_state)::text from public.notifications n
   where n.dedupe_key = 'clock.confirm:tc'),
  row(true, 'skipped')::text,
  'a manager''s line is read and kept off the phone of someone no longer one'
);
select throws_ok(
  $$select public.set_member_role('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000004',
    'manager', 'manager')$$,
  '40001', null, 'a change from a role the person no longer has is refused'
);
select is(
  public.set_member_role('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000004',
    'manager', 'worker', '2026-11-24 08:00+00') ->> 'changed',
  'true',
  'an undo from the role the screen showed goes through'
);
select ok(
  (public.set_member_role('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000004',
    'manager') ->> 'changed') = 'false'
  and (select count(*) from public.audit_log a
       where a.action = 'member.role'
         and a.details ->> 'person' = '8e000000-0000-4000-a000-000000000004') = 2,
  'the same role changes nothing and writes nothing'
);

-- a becomes an accountant: off the staff, as if removed. Before, the owner 1
-- asks to give Saturday away and a takes it, waiting for approval: the owner
-- who asked is the one who makes the change.
insert into ids
select 'morning-28', s.id
from public.schedule_shifts s
where s.week_id = (select id from ids where name = 'week') and s.day = '2026-11-28';
insert into ids values
  ('swap-sat', public.request_shift_swap('8e000000-0000-4000-a000-000000000001',
    (select id from ids where name = 'morning-28'), null, '2026-11-24 08:30+00'));
select public.take_shift_swap('8e000000-0000-4000-a000-00000000000a',
  (select id from ids where name = 'swap-sat'), '2026-11-24 08:40+00');
select is(
  public.set_member_role('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-00000000000a',
    'accountant', at_time => '2026-11-24 09:00+00'),
  '{"changed": true, "shifts": 1, "drafts": 1, "swaps": 0, "reopened": 1}'::jsonb,
  'an owner makes a worker an accountant: their shifts ahead come off, and the swap they took is open again'
);
select is(
  (select n.kind || ' ' || (n.read_at is null)::text || ' ' || coalesce(n.actor_id::text, 'nobody')
   from public.notifications n
   where n.user_id = '8e000000-0000-4000-a000-000000000001'
     and n.dedupe_key = 'swap:' || (select id from ids where name = 'swap-sat')),
  'swap.reopened true nobody',
  'the owner who asked and made the change hears too that it is open again, not that it was taken'
);
select is(
  (select count(*)::int from public.shift_assignments a
   where a.user_id = '8e000000-0000-4000-a000-00000000000a'),
  0,
  'in the published week and the draft alike'
);
select is(
  (select row(m.role, m.perms, m.active)::text from public.memberships m
   where m.business_id = '8e000000-0000-4000-b000-000000000001'
     and m.user_id = '8e000000-0000-4000-a000-00000000000a'),
  row('accountant'::public.member_role, '{}'::text[], true)::text,
  'they stay on the team as its accountant, with no personal permissions'
);
select is(
  (select array_agg(distinct (n.params ->> 'count')) from public.notifications n
   where n.kind = 'schedule.unfilled' and n.resolved_at is null and n.read_at is null),
  array['3'],
  'the builders hear again, unread, of the three shifts ahead that lack someone now'
);
select is(
  (select count(*)::int from public.notifications n
   where n.user_id = '8e000000-0000-4000-a000-00000000000a'
     and n.source_module = 'scheduling' and n.read_at is null),
  0,
  'their lines about the schedule are read'
);
select ok(
  exists (
    select 1 from public.employment_periods p
    where p.user_id = '8e000000-0000-4000-a000-00000000000a'
      and p.source = 'joined' and p.ended_on is not null
  ),
  'and their period of work on the staff closes'
);
select is(
  (select jsonb_build_object(
      'role', a.details -> 'role', 'was', a.details -> 'was',
      'perms', a.details -> 'perms', 'shifts', jsonb_array_length(a.details -> 'shifts'))
   from public.audit_log a
   where a.action = 'member.role'
     and a.details ->> 'person' = '8e000000-0000-4000-a000-00000000000a'),
  jsonb_build_object(
    'role', 'accountant', 'was', 'worker',
    'perms', jsonb_build_array('lists.manage'), 'shifts', 1),
  'the log says the role, the one before, and what came off'
);

-- The minute job settles a week's line once none of its shifts ahead lacks
-- anyone: Friday's still does on Wednesday, and has begun by Friday 08:00.
-- The second time through the job's own step (private.settle_done_reminders,
-- which run_business_reminders calls each minute), so its wiring is checked.
select private.settle_unfilled('8e000000-0000-4000-b000-000000000001', '2026-11-25 06:00+00');
select is(
  (select count(*)::int from public.notifications n
   where n.kind = 'schedule.unfilled' and n.resolved_at is null),
  3,
  'a week with a shift ahead that lacks someone keeps its line'
);
select private.settle_done_reminders('8e000000-0000-4000-b000-000000000001',
  '2026-11-29', '2026-11-27 06:00+00');
select is(
  (select count(*)::int from public.notifications n
   where n.kind = 'schedule.unfilled' and n.resolved_at is null),
  0,
  'and the minute job settles it once every such shift has begun'
);

-- The change in a statement of its own: a statement sees the database as it
-- was when it began, so a check in the same one would miss the period the
-- membership's trigger writes.
create temporary table back_on_staff on commit drop as
select public.set_member_role('8e000000-0000-4000-a000-000000000001',
  '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000007',
  'worker') as result;
select ok(
  (select b.result ->> 'changed' from back_on_staff b) = 'true'
  and exists (
    select 1 from public.employment_periods p
    where p.user_id = '8e000000-0000-4000-a000-000000000007'
      and p.source = 'joined' and p.ended_on is null
  ),
  'an accountant who joins the staff starts a period of work'
);

-- Becoming an owner clears personal permissions: an owner holds everything.
select is(
  public.set_member_role('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000004',
    'owner', 'manager', '2026-11-24 11:00+00') ->> 'changed',
  'true',
  'an owner makes a manager an owner'
);
select is(
  (select row(m.role, m.perms)::text from public.memberships m
   where m.business_id = '8e000000-0000-4000-b000-000000000001'
     and m.user_id = '8e000000-0000-4000-a000-000000000004'),
  row('owner'::public.member_role, '{}'::text[])::text,
  'an owner keeps no personal permissions'
);

-- An owner made a manager, with no pay access, is no longer in the office:
-- the document waiting for them is settled, as on a removal.
select public.set_member_role('8e000000-0000-4000-a000-000000000001',
  '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000002',
  'manager', 'owner', '2026-11-24 11:30+00');
select is(
  (select n.resolved_at is not null from public.notifications n
   where n.dedupe_key = 'documents.received:tc2'),
  true,
  'a role without pay access settles their documents line'
);

------------------------------------------------------------------------------
-- Cancelling an invite

select lives_ok(
  $$select public.team_invite_cancel('8e000000-0000-4000-a000-000000000003',
    '8e000000-0000-4000-c000-000000000001', '2026-11-24 08:00+00')$$,
  'a manager cancels a worker''s invite'
);
select is(
  (select row(
      i.claimed_at = '2026-11-24 08:00+00'::timestamptz,
      i.cancelled_at = i.claimed_at,
      i.claimed_by is null,
      i.token_hash <> repeat('c', 63) || '1' and i.token_hash ~ '^[0-9a-f]{64}$'
    )::text
   from public.invites i where i.id = '8e000000-0000-4000-c000-000000000001'),
  row(true, true, true, true)::text,
  'it is closed, nobody joined, and its hash is one of no token'
);
select is(
  public.invite_by_token(repeat('c', 63) || '1'),
  null::jsonb,
  'its link finds nothing'
);
select isnt(
  public.team_invite('8e000000-0000-4000-a000-000000000003',
    '8e000000-0000-4000-b000-000000000001', '+972500007121', 'Gal', 'worker',
    repeat('c', 63) || '5'),
  '8e000000-0000-4000-c000-000000000001'::uuid,
  'and the number may be invited again'
);
select throws_ok(
  $$select public.team_invite_cancel('8e000000-0000-4000-a000-000000000003',
    '8e000000-0000-4000-c000-000000000002')$$,
  '42501', null, 'a manager does not cancel an owner''s invite'
);
select throws_ok(
  $$select public.team_invite_cancel('8e000000-0000-4000-a000-000000000003',
    '8e000000-0000-4000-c000-000000000003')$$,
  '42501', null, 'nor an accountant''s'
);
select lives_ok(
  $$select public.team_invite_cancel('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-c000-000000000003')$$,
  'an owner does, expired or not'
);
select throws_ok(
  $$select public.team_invite_cancel('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-c000-000000000004')$$,
  'P0002', null, 'a claimed invite is not cancelled'
);
select throws_ok(
  $$select public.team_invite_cancel('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-c000-000000000001')$$,
  'P0002', null, 'nor one cancelled already'
);
select throws_ok(
  $$select public.team_invite_cancel('8e000000-0000-4000-a000-00000000000b',
    '8e000000-0000-4000-c000-000000000002')$$,
  '42501', null, 'a manager of another business cancels nothing here'
);
select is(
  (select a.details from public.audit_log a
   where a.action = 'invite.cancel' and a.actor_id = '8e000000-0000-4000-a000-000000000003'),
  jsonb_build_object('invite', '8e000000-0000-4000-c000-000000000001', 'role', 'worker'),
  'the log names the invite, which stays, and its role'
);
select is(
  (select array_agg(i.full_name order by i.full_name) from public.invites i
   where i.business_id = '8e000000-0000-4000-b000-000000000001' and i.claimed_at is null),
  array['Gal', 'Partner'],
  'the open invites are the new one and the owner''s'
);

------------------------------------------------------------------------------
-- Pay access goes with the place

select public.remove_member('8e000000-0000-4000-a000-000000000001',
  '8e000000-0000-4000-b000-000000000001', '8e000000-0000-4000-a000-000000000003',
  '2026-11-24 10:00+00');
select is(
  (select count(*)::int from public.notifications n
   where n.dedupe_key in (
     'documents.received:tc', 'access.pay:8e000000-0000-4000-a000-000000000003'
   ) and n.resolved_at is null),
  0,
  'a pay holder removed is no longer in the office: their pay and documents lines are settled'
);

------------------------------------------------------------------------------
-- Coming back

select lives_ok(
  $$select public.team_invite('8e000000-0000-4000-a000-000000000001',
    '8e000000-0000-4000-b000-000000000001', '+972500007105', 'Wendy', 'worker',
    repeat('c', 63) || '6')$$,
  'someone removed may be invited again'
);
select is(
  public.claim_invite(repeat('c', 63) || '6', '8e000000-0000-4000-a000-000000000005'),
  '8e000000-0000-4000-b000-000000000001'::uuid,
  'and joins from its link'
);
select is(
  (select row(
      m.active, m.left_at, m.perms,
      (select count(*)::int from public.department_members dm
       where dm.user_id = '8e000000-0000-4000-a000-000000000005'))::text
   from public.memberships m
   where m.business_id = '8e000000-0000-4000-b000-000000000001'
     and m.user_id = '8e000000-0000-4000-a000-000000000005'),
  row(true, null::timestamptz, '{}'::text[], 0)::text,
  'back on the same row, active, with no old permissions or departments'
);
select pg_temp.sign_in('8e000000-0000-4000-a000-000000000005');
select is_empty(
  $$select 1 from public.own_departures()$$,
  'back on the team, they have left nothing'
);
reset role;

select * from finish();
rollback;
