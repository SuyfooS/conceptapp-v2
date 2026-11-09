-- Pay access (20261110000300_payroll_access.sql): the accountant, who reads
-- the roster and names but is never on the staff (no hours, shifts, swaps,
-- departments or lists) and always holds clock.payroll; managers' pay access,
-- off until the owner gives it (Orel, 9 November 2026); grants only an owner
-- or the team changes, each in the log; who reads hours, names and pay rows;
-- what a view in each role reads; and what someone who comes back as an
-- accountant leaves behind. Fixed ids and explicit times, so nothing here
-- depends on the seed or the clock (the shifts "from today on" are in 2100).
begin;
select plan(87);

insert into auth.users (id, aud, role, phone)
values
  ('77000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500002701'),
  ('77000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500002702'),
  ('77000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500002703'),
  ('77000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500002704'),
  ('77000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500002705'),
  ('77000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500002706'),
  ('77000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500002707'),
  ('77000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated', '972500002708'),
  ('77000000-0000-4000-a000-000000000012', 'authenticated', 'authenticated', '972500002709'),
  ('77000000-0000-4000-a000-000000000013', 'authenticated', 'authenticated', '972500002710'),
  ('77000000-0000-4000-a000-000000000014', 'authenticated', 'authenticated', '972500002711'),
  ('77000000-0000-4000-a000-000000000015', 'authenticated', 'authenticated', '972500002712'),
  ('77000000-0000-4000-a000-000000000016', 'authenticated', 'authenticated', '972500002713'),
  ('77000000-0000-4000-a000-000000000017', 'authenticated', 'authenticated', '972500002714'),
  ('77000000-0000-4000-a000-000000000018', 'authenticated', 'authenticated', '972500002715'),
  ('77000000-0000-4000-a000-000000000019', 'authenticated', 'authenticated', '972500002716');

-- X: a owner, b manager, c and j workers, d the accountant, k an accountant
-- who left, e a worker who left (with hours); l, m, p and n left as workers
-- and are invited back as accountants (l still clocked in, m with a shift
-- ahead, p with a swap they took of m's, waiting for a manager, n with a
-- permission, a department, an open list, a list done that they sent and a
-- list's times). Y: f owner, g worker (with hours).
-- h, i and o are on the ConceptApp team, viewing X as an accountant, a
-- manager and an owner.
insert into public.businesses (id, slug, name)
values
  ('77000000-0000-4000-b000-000000000001', 'pa-x', 'Pay X'),
  ('77000000-0000-4000-b000-000000000002', 'pa-y', 'Pay Y');

insert into public.memberships (business_id, user_id, role, perms, active)
values
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000a', 'owner', '{}', true),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b', 'manager', '{}', true),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000c', 'worker', '{}', true),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000d', 'accountant', '{}', true),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000e', 'worker', '{}', false),
  ('77000000-0000-4000-b000-000000000002', '77000000-0000-4000-a000-00000000000f', 'owner', '{}', true),
  ('77000000-0000-4000-b000-000000000002', '77000000-0000-4000-a000-000000000010', 'worker', '{}', true),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000013', 'worker', '{}', true),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000014', 'accountant', '{}', false),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000015', 'worker', '{}', false),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000016', 'worker', '{}', false),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000017', 'worker', '{lists.send}', false),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000019', 'worker', '{}', false);

update public.profiles set full_name = 'Former E' where id = '77000000-0000-4000-a000-00000000000e';
update public.profiles set full_name = 'Worker G' where id = '77000000-0000-4000-a000-000000000010';

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('77000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('77000000-0000-4000-b000-000000000001', 'scheduling', true, '{}'),
  ('77000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('77000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('77000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');

insert into public.platform_staff (user_id, role)
values
  ('77000000-0000-4000-a000-000000000011', 'onboarder'),
  ('77000000-0000-4000-a000-000000000012', 'onboarder'),
  ('77000000-0000-4000-a000-000000000018', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('77000000-0000-4000-a000-000000000011', '77000000-0000-4000-b000-000000000001', 'accountant'),
  ('77000000-0000-4000-a000-000000000012', '77000000-0000-4000-b000-000000000001', 'manager'),
  ('77000000-0000-4000-a000-000000000018', '77000000-0000-4000-b000-000000000001', 'owner');

-- Hours: c's shift with a break, e's from before they left, l still clocked
-- in, and g's at Y.
insert into public.time_entries (id, business_id, user_id, clock_in, clock_out)
values
  ('77000000-0000-4000-e000-000000000001', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-00000000000c', '2026-11-02 06:00+00', '2026-11-02 14:00+00'),
  ('77000000-0000-4000-e000-000000000002', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-00000000000e', '2026-10-20 06:00+00', '2026-10-20 14:00+00'),
  ('77000000-0000-4000-e000-000000000003', '77000000-0000-4000-b000-000000000002',
    '77000000-0000-4000-a000-000000000010', '2026-11-02 06:00+00', '2026-11-02 14:00+00'),
  ('77000000-0000-4000-e000-000000000004', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-000000000015', '2026-11-09 06:00+00', null);
insert into public.time_breaks (entry_id, business_id, user_id, started_at, ended_at, unpaid)
values ('77000000-0000-4000-e000-000000000001', '77000000-0000-4000-b000-000000000001',
  '77000000-0000-4000-a000-00000000000c', '2026-11-02 10:00+00', '2026-11-02 10:30+00', true);

-- A published week with c on a shift, which c asks to swap; a week far ahead
-- with m on one, which p took; a department with c and n; a list template, a
-- list for c, and n's lists and list's times.
insert into public.schedule_weeks (id, business_id, starts_on, availability_due_at, schedule_published_at)
values
  ('77000000-0000-4000-f000-000000000001', '77000000-0000-4000-b000-000000000001',
    '2026-11-08', '2026-11-05 16:00+00', '2026-11-06 10:00+00'),
  ('77000000-0000-4000-f000-000000000002', '77000000-0000-4000-b000-000000000001',
    '2100-01-03', '2099-12-30 16:00+00', null);
insert into public.schedule_shifts (id, business_id, week_id, day, name, starts_at, ends_at, needed)
values
  ('77000000-0000-4000-f000-000000000011', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-f000-000000000001', '2026-11-09', 'Morning', '08:00', '16:00', 2),
  ('77000000-0000-4000-f000-000000000012', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-f000-000000000002', '2100-01-04', 'Morning', '08:00', '16:00', 1);
insert into public.shift_assignments (shift_id, business_id, user_id)
values
  ('77000000-0000-4000-f000-000000000011', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-00000000000c'),
  ('77000000-0000-4000-f000-000000000012', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-000000000016');
insert into public.departments (id, business_id, key, name)
values ('77000000-0000-4000-d000-000000000001', '77000000-0000-4000-b000-000000000001', 'floor', 'Floor');
insert into public.department_members (department_id, business_id, user_id)
values
  ('77000000-0000-4000-d000-000000000001', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-00000000000c'),
  ('77000000-0000-4000-d000-000000000001', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-000000000017');
insert into public.list_templates (id, business_id, name)
values ('77000000-0000-4000-d000-000000000011', '77000000-0000-4000-b000-000000000001', 'Opening');
insert into public.lists (id, business_id, name, origin, recipient_kind, opens_at)
values
  ('77000000-0000-4000-d000-000000000021', '77000000-0000-4000-b000-000000000001',
    'A list', 'sent', 'person', '2026-11-09 08:00+00'),
  ('77000000-0000-4000-d000-000000000022', '77000000-0000-4000-b000-000000000001',
    'Their list', 'sent', 'person', '2026-11-09 08:00+00');
insert into public.lists (id, business_id, name, origin, recipient_kind, opens_at,
  sent_by, status, finished_at)
values ('77000000-0000-4000-d000-000000000023', '77000000-0000-4000-b000-000000000001',
  'Done list', 'sent', 'person', '2026-11-08 08:00+00',
  '77000000-0000-4000-a000-000000000017', 'finished', '2026-11-08 12:00+00');
insert into public.list_people (list_id, business_id, user_id)
values
  ('77000000-0000-4000-d000-000000000021', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-00000000000c'),
  ('77000000-0000-4000-d000-000000000022', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-000000000017'),
  ('77000000-0000-4000-d000-000000000023', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-00000000000c'),
  ('77000000-0000-4000-d000-000000000023', '77000000-0000-4000-b000-000000000001',
    '77000000-0000-4000-a000-000000000017');
insert into public.list_schedules (template_id, business_id, days, opens_offset, due_offset,
  recipient_kind, recipient_user, starts_on)
values ('77000000-0000-4000-d000-000000000011', '77000000-0000-4000-b000-000000000001',
  '{1}', 480, 540, 'person', '77000000-0000-4000-a000-000000000017', '2026-11-10');
insert into public.shift_swaps (business_id, shift_id, requested_by)
values ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-f000-000000000011',
  '77000000-0000-4000-a000-00000000000c');
insert into public.shift_swaps (business_id, shift_id, requested_by, status, taken_by, taken_at)
values ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-f000-000000000012',
  '77000000-0000-4000-a000-000000000016', 'taken', '77000000-0000-4000-a000-000000000019',
  '2026-11-09 08:00+00');

-- The log: a pay row, a settings row and a clock row.
insert into public.audit_log (business_id, actor_id, action, details)
values
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000a',
    'wage.set', '{"person": "77000000-0000-4000-a000-00000000000c"}'),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000a',
    'module.settings', '{}'),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b',
    'clock.break_fit', '{}');

-- l, m, n and p are invited back as accountants, by the owner.
insert into public.invites (business_id, phone, role, token_hash, invited_by, expires_at)
values
  ('77000000-0000-4000-b000-000000000001', '+972500002712', 'accountant', repeat('1', 64),
    '77000000-0000-4000-a000-00000000000a', now() + interval '3 days'),
  ('77000000-0000-4000-b000-000000000001', '+972500002713', 'accountant', repeat('2', 64),
    '77000000-0000-4000-a000-00000000000a', now() + interval '3 days'),
  ('77000000-0000-4000-b000-000000000001', '+972500002714', 'accountant', repeat('3', 64),
    '77000000-0000-4000-a000-00000000000a', now() + interval '3 days'),
  ('77000000-0000-4000-b000-000000000001', '+972500002716', 'accountant', repeat('4', 64),
    '77000000-0000-4000-a000-00000000000a', now() + interval '3 days');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- What the log shows the signed-in person, of the three rows above.
create function pg_temp.log_seen() returns text language sql as $$
  select coalesce(string_agg(a.action, ',' order by a.action), '')
  from public.audit_log a
  where a.business_id = '77000000-0000-4000-b000-000000000001'
    and a.action in ('wage.set', 'module.settings', 'clock.break_fit')
$$;

------------------------------------------------------------------------------
-- The role

select is(private.role_rank('accountant'), 1, 'an accountant reads at a worker''s rank');
select ok(
  not private.is_staff_role('accountant')
  and private.is_staff_role('worker')
  and private.is_staff_role('owner')
  and not private.is_staff_role(null),
  'and is the one role off the staff'
);

------------------------------------------------------------------------------
-- Who may call what

select ok(
  not has_function_privilege('authenticated', 'public.set_role_permission(uuid, uuid, public.member_role, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.set_role_permission(uuid, uuid, public.member_role, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_member_permission(uuid, uuid, uuid, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.set_member_permission(uuid, uuid, uuid, text, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.set_role_permission(uuid, uuid, public.member_role, text, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.set_member_permission(uuid, uuid, uuid, text, boolean)', 'execute'),
  'grants change through the server only'
);
select ok(
  has_function_privilege('authenticated', 'public.my_permissions(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.my_permissions(uuid)', 'execute'),
  'a signed-in person asks for their own permissions'
);
select ok(
  not has_function_privilege('authenticated', 'private.holds_perm(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'private.holds_perm(uuid, uuid, text)', 'execute'),
  'but nobody in the browser asks what someone else holds'
);
select ok(
  not has_table_privilege('authenticated', 'public.role_permissions', 'insert, update, delete')
  and not has_table_privilege('authenticated', 'public.permission_keys', 'insert, update, delete')
  and not has_table_privilege('anon', 'public.role_permissions', 'select'),
  'and the browser writes no permission'
);

------------------------------------------------------------------------------
-- Who holds pay access

select ok(
  private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000a', 'clock.payroll'),
  'the owner holds pay access'
);
select ok(
  private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000d', 'clock.payroll'),
  'so does the accountant, always'
);
select ok(
  not private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000d', 'clock.edit')
  and not private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000d', 'reservations.edit'),
  'and nothing else, though a worker''s permissions are at their rank'
);
select ok(
  not private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b', 'clock.payroll'),
  'a manager starts without pay access'
);
select ok(
  private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b', 'clock.edit')
  and private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000c', 'reservations.edit')
  and not private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000c', 'clock.edit'),
  'the other permissions follow their default roles'
);
select ok(
  not private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000014', 'clock.payroll')
  and not private.holds_perm('77000000-0000-4000-b000-000000000002', '77000000-0000-4000-a000-00000000000d', 'clock.payroll'),
  'an accountant who left holds nothing, nor one in another business'
);

select pg_temp.sign_in('77000000-0000-4000-a000-00000000000b');
select is(pg_temp.log_seen(), 'clock.break_fit,module.settings', 'without it, a manager reads the log but its pay rows');
reset role;

------------------------------------------------------------------------------
-- Giving it to a role

set local role service_role;
select throws_ok(
  $$select public.set_role_permission('77000000-0000-4000-a000-00000000000b',
    '77000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true)$$,
  '42501', null, 'a manager cannot give pay access'
);
select throws_ok(
  $$select public.set_role_permission('77000000-0000-4000-a000-00000000000d',
    '77000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true)$$,
  '42501', null, 'nor can the accountant'
);
select throws_ok(
  $$select public.set_role_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', 'owner', 'clock.payroll', true)$$,
  '22023', null, 'owners always hold it'
);
select throws_ok(
  $$select public.set_role_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', 'accountant', 'clock.payroll', false)$$,
  '22023', null, 'and so do accountants'
);
select throws_ok(
  $$select public.set_role_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', 'manager', 'clock.edit', false)$$,
  '22023', null, 'a permission that follows its role is not switched'
);
select throws_ok(
  $$select public.set_role_permission('77000000-0000-4000-a000-000000000011',
    '77000000-0000-4000-b000-0000000000ff', 'manager', 'clock.payroll', true)$$,
  'P0002', null, 'the team names a business that exists'
);
select lives_ok(
  $$select public.set_role_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true)$$,
  'the owner gives managers pay access'
);
reset role;

select ok(
  private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b', 'clock.payroll'),
  'and the manager holds it'
);
select results_eq(
  $$select actor_id, details from public.audit_log
    where business_id = '77000000-0000-4000-b000-000000000001' and action = 'permission.grant'$$,
  $$values ('77000000-0000-4000-a000-00000000000a'::uuid,
    '{"role": "manager", "perm": "clock.payroll"}'::jsonb)$$,
  'the log says who gave it to whom'
);

set local role service_role;
select public.set_role_permission('77000000-0000-4000-a000-00000000000a',
  '77000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', true);
reset role;
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '77000000-0000-4000-b000-000000000001' and action = 'permission.grant'),
  1,
  'giving it again changes nothing and writes nothing'
);

select pg_temp.sign_in('77000000-0000-4000-a000-00000000000b');
select is(pg_temp.log_seen(), 'clock.break_fit,module.settings,wage.set', 'with it, the manager reads the pay rows too');
reset role;

set local role service_role;
select lives_ok(
  $$select public.set_role_permission('77000000-0000-4000-a000-000000000011',
    '77000000-0000-4000-b000-000000000001', 'manager', 'clock.payroll', false)$$,
  'the ConceptApp team takes it back'
);
reset role;
select ok(
  not private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b', 'clock.payroll')
  and exists (
    select 1 from public.audit_log
    where business_id = '77000000-0000-4000-b000-000000000001' and action = 'permission.revoke'
      and actor_id = '77000000-0000-4000-a000-000000000011'
      and details = '{"role": "manager", "perm": "clock.payroll"}'::jsonb
  ),
  'the manager no longer holds it, and the log says who took it back'
);

select pg_temp.sign_in('77000000-0000-4000-a000-00000000000b');
select is(pg_temp.log_seen(), 'clock.break_fit,module.settings', 'and the pay row is closed to them again');
reset role;

------------------------------------------------------------------------------
-- Giving it to a person

set local role service_role;
select throws_ok(
  $$select public.set_member_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000a', 'clock.payroll', true)$$,
  '22023', null, 'nobody gives it to themself'
);
select throws_ok(
  $$select public.set_member_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000010', 'clock.payroll', true)$$,
  'P0002', null, 'nor to someone of another business'
);
select throws_ok(
  $$select public.set_member_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000e', 'clock.payroll', true)$$,
  'P0002', null, 'nor to someone who left'
);
select throws_ok(
  $$select public.set_member_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000d', 'clock.payroll', false)$$,
  '22023', null, 'an accountant always holds it'
);
select throws_ok(
  $$select public.set_member_permission('77000000-0000-4000-a000-00000000000b',
    '77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000013', 'clock.payroll', true)$$,
  '42501', null, 'a manager cannot give it to a person'
);
select throws_ok(
  $$select public.set_member_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000013', 'lists.send', true)$$,
  '22023', null, 'a permission that follows its role is not given this way'
);
select lives_ok(
  $$select public.set_member_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000013', 'clock.payroll', true)$$,
  'the owner gives one worker pay access'
);
reset role;

select ok(
  private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000013', 'clock.payroll')
  and exists (
    select 1 from public.audit_log
    where business_id = '77000000-0000-4000-b000-000000000001' and action = 'permission.grant'
      and details = '{"person": "77000000-0000-4000-a000-000000000013", "perm": "clock.payroll"}'::jsonb
  ),
  'they hold it, and the log says so'
);

select pg_temp.sign_in('77000000-0000-4000-a000-000000000013');
select is(
  (select count(*)::integer from public.time_entries),
  3,
  'a worker given pay access reads everyone''s hours at their business'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.set_member_permission('77000000-0000-4000-a000-00000000000a',
    '77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000013', 'clock.payroll', false)$$,
  'and takes it back'
);
reset role;
select ok(
  not private.holds_perm('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-000000000013', 'clock.payroll')
  and (select perms from public.memberships
       where business_id = '77000000-0000-4000-b000-000000000001'
         and user_id = '77000000-0000-4000-a000-000000000013') = '{}'::text[]
  and (select count(*) from public.audit_log
       where business_id = '77000000-0000-4000-b000-000000000001' and action = 'permission.revoke'
         and details ->> 'person' = '77000000-0000-4000-a000-000000000013') = 1,
  'it is gone, and the log says so'
);

------------------------------------------------------------------------------
-- What the screens are told

select pg_temp.sign_in('77000000-0000-4000-a000-00000000000a');
select is(
  public.my_permissions('77000000-0000-4000-b000-000000000001'),
  '{clock.edit,clock.payroll,lists.manage,lists.send,reservations.edit,schedule.edit,schedule.publish,storefront.edit}'::text[],
  'an owner holds every permission'
);
select pg_temp.sign_in('77000000-0000-4000-a000-00000000000d');
select is(
  public.my_permissions('77000000-0000-4000-b000-000000000001'),
  '{clock.payroll}'::text[],
  'an accountant holds pay access alone'
);
select is(
  public.my_permissions('77000000-0000-4000-b000-000000000002'),
  '{}'::text[],
  'and nothing in a business they are not in'
);
select pg_temp.sign_in('77000000-0000-4000-a000-00000000000c');
select is(
  public.my_permissions('77000000-0000-4000-b000-000000000001'),
  '{reservations.edit}'::text[],
  'a worker holds what workers hold by default'
);
select pg_temp.sign_in('77000000-0000-4000-a000-00000000000b');
select is(
  public.my_permissions('77000000-0000-4000-b000-000000000001'),
  '{clock.edit,lists.manage,lists.send,reservations.edit,schedule.edit,schedule.publish,storefront.edit}'::text[],
  'a manager without pay access holds the rest'
);
select pg_temp.sign_in('77000000-0000-4000-a000-000000000012');
select is(
  public.my_permissions('77000000-0000-4000-b000-000000000001'),
  '{clock.edit,lists.manage,lists.send,reservations.edit,schedule.edit,schedule.publish,storefront.edit}'::text[],
  'a view as a manager holds what a manager does by default'
);
select pg_temp.sign_in('77000000-0000-4000-a000-000000000018');
select is(
  public.my_permissions('77000000-0000-4000-b000-000000000001'),
  '{clock.edit,lists.manage,lists.send,reservations.edit,schedule.edit,schedule.publish,storefront.edit}'::text[],
  'and a view as an owner everything but pay access'
);
select pg_temp.sign_in('77000000-0000-4000-a000-000000000011');
select is(
  public.my_permissions('77000000-0000-4000-b000-000000000001'),
  '{clock.payroll}'::text[],
  'while a view as an accountant holds pay access'
);
reset role;

------------------------------------------------------------------------------
-- What the accountant reads

select pg_temp.sign_in('77000000-0000-4000-a000-00000000000d');
select results_eq(
  $$select user_id from public.time_entries order by clock_in$$,
  $$values ('77000000-0000-4000-a000-00000000000e'::uuid),
    ('77000000-0000-4000-a000-00000000000c'::uuid),
    ('77000000-0000-4000-a000-000000000015'::uuid)$$,
  'the accountant reads everyone''s hours at their business, someone''s who left too'
);
select is((select count(*)::integer from public.time_breaks), 1, 'and their breaks');
select is(
  (select full_name from public.profiles where id = '77000000-0000-4000-a000-00000000000e'),
  'Former E',
  'and the name of someone who left'
);
select results_eq(
  $$select slug from public.businesses$$,
  $$values ('pa-x')$$,
  'but nothing of another business'
);
select is_empty(
  $$select 1 from public.profiles where id = '77000000-0000-4000-a000-000000000010'$$,
  'nor the names of its people'
);
select is(
  (select count(*)::integer from public.schedule_weeks)
  + (select count(*)::integer from public.schedule_shifts)
  + (select count(*)::integer from public.shift_assignments)
  + (select count(*)::integer from public.departments)
  + (select count(*)::integer from public.shift_swaps)
  + (select count(*)::integer from public.department_members)
  + (select count(*)::integer from public.list_templates)
  + (select count(*)::integer from public.lists)
  + (select count(*)::integer from public.list_people),
  0,
  'and no schedule, shifts, swaps, departments or lists: they are off the staff'
);
select is(pg_temp.log_seen(), 'clock.break_fit,wage.set', 'of the log, the pay and clock rows');
select is(
  (select count(*)::integer from public.audit_log
   where business_id = '77000000-0000-4000-b000-000000000001' and action like 'permission.%'),
  4,
  'and who was given pay access and when it was taken back'
);

select pg_temp.sign_in('77000000-0000-4000-a000-00000000000c');
select ok(
  (select count(*) from public.schedule_weeks) > 0
  and (select count(*) from public.schedule_shifts) > 0
  and (select count(*) from public.shift_swaps) > 0
  and (select count(*) from public.departments) > 0
  and (select count(*) from public.list_templates) > 0
  and (select count(*) from public.lists) > 0,
  'while a worker reads the schedule, the swaps, the departments and their list'
);
select is(pg_temp.log_seen(), '', 'and none of the log');

-- Views
select pg_temp.sign_in('77000000-0000-4000-a000-000000000011');
select is((select count(*)::integer from public.time_entries), 3, 'a view as an accountant reads the hours');
select is(
  (select count(*)::integer from public.schedule_weeks)
  + (select count(*)::integer from public.departments),
  0,
  'and, like an accountant, no schedule or departments'
);
select is(pg_temp.log_seen(), 'clock.break_fit,wage.set', 'and the log as an accountant does');
select pg_temp.sign_in('77000000-0000-4000-a000-000000000012');
select ok(
  (select count(*) from public.schedule_weeks) > 0
  and (select count(*) from public.departments) > 0,
  'a view as a manager reads them as before'
);
select is(pg_temp.log_seen(), 'clock.break_fit,module.settings', 'and the log without its pay rows');
select pg_temp.sign_in('77000000-0000-4000-a000-000000000018');
select is(pg_temp.log_seen(), 'clock.break_fit,module.settings', 'and so does a view as an owner');
select pg_temp.sign_in('77000000-0000-4000-a000-00000000000a');
select is(pg_temp.log_seen(), 'clock.break_fit,module.settings,wage.set', 'the owner reads the whole log');
reset role;

------------------------------------------------------------------------------
-- Off the staff

set local role service_role;
select throws_ok(
  $$select public.correct_time_entry('77000000-0000-4000-a000-00000000000d',
    '77000000-0000-4000-e000-000000000001', '2026-11-02 06:30+00', '2026-11-02 14:00+00',
    'Came late', '2026-11-03 08:00+00')$$,
  '42501', null, 'the accountant corrects no hours'
);
select throws_ok(
  $$select public.clock_in('77000000-0000-4000-a000-00000000000d',
    '77000000-0000-4000-b000-000000000001', null, '2026-11-09 08:00+00')$$,
  '42501', 'An accountant is not on the staff', 'and clocks in to nothing'
);
reset role;
select throws_ok(
  $$insert into public.shift_assignments (shift_id, business_id, user_id)
    values ('77000000-0000-4000-f000-000000000011', '77000000-0000-4000-b000-000000000001',
      '77000000-0000-4000-a000-00000000000d')$$,
  '42501', null, 'is put on no shift'
);
select throws_ok(
  $$update public.shift_assignments set user_id = '77000000-0000-4000-a000-00000000000d'
    where shift_id = '77000000-0000-4000-f000-000000000011'
      and user_id = '77000000-0000-4000-a000-00000000000c'$$,
  '42501', null, 'nor handed one'
);
select throws_ok(
  $$insert into public.availability_submissions (business_id, week_id, user_id)
    values ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-f000-000000000001',
      '77000000-0000-4000-a000-00000000000d')$$,
  '42501', null, 'owes no availability'
);
select throws_ok(
  $$insert into public.department_members (department_id, business_id, user_id)
    values ('77000000-0000-4000-d000-000000000001', '77000000-0000-4000-b000-000000000001',
      '77000000-0000-4000-a000-00000000000d')$$,
  '42501', null, 'is in no department'
);
select throws_ok(
  $$insert into public.list_people (list_id, business_id, user_id)
    values ('77000000-0000-4000-d000-000000000021', '77000000-0000-4000-b000-000000000001',
      '77000000-0000-4000-a000-00000000000d')$$,
  '42501', null, 'is given no list'
);
select throws_ok(
  $$insert into public.list_schedules (template_id, business_id, days, opens_offset, due_offset,
      recipient_kind, recipient_user, starts_on)
    values ('77000000-0000-4000-d000-000000000011', '77000000-0000-4000-b000-000000000001',
      '{1}', 480, 540, 'person', '77000000-0000-4000-a000-00000000000d', '2026-11-10')$$,
  '42501', null, 'nor by a list''s times'
);
select throws_ok(
  $$select * from private.list_recipient('77000000-0000-4000-b000-000000000001',
    '{"kind": "role", "role": "accountant"}', array['person', 'department', 'role'])$$,
  '22023', null, 'and no list goes to the accountants as a role'
);

-- c's swap, open on the published morning, the day before it starts.
select throws_ok(
  $$select public.take_shift_swap('77000000-0000-4000-a000-00000000000d',
    (select w.id from public.shift_swaps w
     where w.shift_id = '77000000-0000-4000-f000-000000000011'),
    '2026-11-08 08:00+00')$$,
  '42501', 'An accountant is not on the staff', 'takes no swap'
);
select ok(
  (select w.status from public.shift_swaps w
   where w.shift_id = '77000000-0000-4000-f000-000000000011') = 'open'
  and not private.can_take('77000000-0000-4000-f000-000000000011', '77000000-0000-4000-a000-00000000000d')
  and private.can_take('77000000-0000-4000-f000-000000000011', '77000000-0000-4000-a000-000000000013'),
  'so the swap stays open, offered to a worker and never to the accountant'
);

-- Publishing the schedule tells the staff, never the accountant.
insert into public.audit_log (business_id, actor_id, action, details)
values ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b',
  'schedule.publish', jsonb_build_object('first', true,
    'week', '77000000-0000-4000-f000-000000000001', 'starts_on', '2026-11-08'));
select is(
  (select count(*)::integer from public.notifications
   where business_id = '77000000-0000-4000-b000-000000000001' and kind = 'schedule.published'
     and user_id = '77000000-0000-4000-a000-00000000000d'),
  0,
  'publishing the schedule tells the accountant nothing'
);
select is(
  (select count(*)::integer from public.notifications
   where business_id = '77000000-0000-4000-b000-000000000001' and kind = 'schedule.published'
     and user_id = '77000000-0000-4000-a000-00000000000c'),
  1,
  'while the staff hear of it'
);

------------------------------------------------------------------------------
-- Coming back as an accountant

select throws_ok(
  $$select public.claim_invite(repeat('1', 64), '77000000-0000-4000-a000-000000000015')$$,
  '55000', null, 'someone still clocked in joins as an accountant only once the shift ends'
);
select throws_ok(
  $$select public.claim_invite(repeat('2', 64), '77000000-0000-4000-a000-000000000016')$$,
  '55000', null, 'nor with a shift ahead'
);
select throws_ok(
  $$select public.claim_invite(repeat('4', 64), '77000000-0000-4000-a000-000000000019')$$,
  '55000', null, 'nor with a swap they took, waiting for a manager'
);
select lives_ok(
  $$select public.claim_invite(repeat('3', 64), '77000000-0000-4000-a000-000000000017')$$,
  'someone with neither joins as an accountant'
);
select results_eq(
  $$select role::text, active, perms from public.memberships
    where business_id = '77000000-0000-4000-b000-000000000001'
      and user_id = '77000000-0000-4000-a000-000000000017'$$,
  $$values ('accountant'::text, true, '{}'::text[])$$,
  'without the permissions they had on the staff'
);
select is_empty(
  $$select 1 from public.department_members
    where user_id = '77000000-0000-4000-a000-000000000017'$$,
  'and out of their departments'
);
select results_eq(
  $$select list_id from public.list_people
    where user_id = '77000000-0000-4000-a000-000000000017'$$,
  $$values ('77000000-0000-4000-d000-000000000023'::uuid)$$,
  'off the lists still open, and still on the record of the one done'
);
select is_empty(
  $$select 1 from public.list_schedules
    where recipient_user = '77000000-0000-4000-a000-000000000017'$$,
  'and no list''s times open lists for them any more'
);
select ok(
  not private.holds_list('77000000-0000-4000-d000-000000000023', '77000000-0000-4000-a000-000000000017')
  and private.list_holders('77000000-0000-4000-d000-000000000023')
    = array['77000000-0000-4000-a000-00000000000c'::uuid],
  'a list they were on is now for the staff on it alone'
);
select pg_temp.sign_in('77000000-0000-4000-a000-000000000017');
select is(
  (select count(*)::integer from public.lists)
  + (select count(*)::integer from public.list_people),
  0,
  'and they read no list, not even one they sent'
);
reset role;

-- The list they sent is reopened, then finished again.
insert into public.audit_log (business_id, actor_id, action, details)
values
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b',
    'lists.reopen', '{"list": "77000000-0000-4000-d000-000000000023"}'),
  ('77000000-0000-4000-b000-000000000001', '77000000-0000-4000-a000-00000000000b',
    'lists.finish', '{"list": "77000000-0000-4000-d000-000000000023"}');
select results_eq(
  $$select user_id, kind from public.notifications
    where business_id = '77000000-0000-4000-b000-000000000001'
      and kind in ('lists.sent', 'lists.finished')$$,
  $$values ('77000000-0000-4000-a000-00000000000c'::uuid, 'lists.sent'::text)$$,
  'which tells the staff on it, and never the accountant who sent it'
);

select * from finish();
rollback;
