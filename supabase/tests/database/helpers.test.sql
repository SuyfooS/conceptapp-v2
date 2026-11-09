-- The SQL helpers that the policies are built on.
begin;
select plan(15);

insert into auth.users (id, aud, role, phone)
values
  ('30000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000301'),
  ('30000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000302'),
  ('30000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000303');

insert into public.businesses (id, slug, name)
values ('30000000-0000-4000-b000-00000000000a', 'helpers-a', 'Helpers A');

insert into public.memberships (business_id, user_id, role, perms)
values
  ('30000000-0000-4000-b000-00000000000a', '30000000-0000-4000-a000-00000000000a', 'owner', '{}'),
  ('30000000-0000-4000-b000-00000000000a', '30000000-0000-4000-a000-00000000000b', 'worker', '{schedule.publish}'),
  ('30000000-0000-4000-b000-00000000000a', '30000000-0000-4000-a000-00000000000c', 'accountant', '{}');

insert into public.business_modules (business_id, module_key, enabled)
values
  ('30000000-0000-4000-b000-00000000000a', 'scheduling', true),
  ('30000000-0000-4000-b000-00000000000a', 'reservations', false);

select is(
  (select phone from public.profiles where id = '30000000-0000-4000-a000-00000000000a'),
  '+972500000301',
  'a new auth user gets a profile with an E.164 phone'
);

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

select ok(private.is_member('30000000-0000-4000-b000-00000000000a'), 'is_member: worker is a member');
select ok(private.has_role('30000000-0000-4000-b000-00000000000a', 'worker'), 'has_role: worker is at least worker');
select ok(not private.has_role('30000000-0000-4000-b000-00000000000a', 'manager'), 'has_role: worker is not a manager');
select ok(private.has_perm('30000000-0000-4000-b000-00000000000a', 'schedule.publish'), 'has_perm: granted permission');
select ok(not private.has_perm('30000000-0000-4000-b000-00000000000a', 'billing.manage'), 'has_perm: missing permission');

-- has_perm asks private.holds_perm (20261110000300_payroll_access.sql): a
-- role the business gives a permission to holds it.
insert into public.role_permissions (business_id, role, perm)
values ('30000000-0000-4000-b000-00000000000a', 'worker', 'clock.payroll');
select ok(private.has_perm('30000000-0000-4000-b000-00000000000a', 'clock.payroll'), 'has_perm: a role the business gives it to');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);
select ok(private.has_perm('30000000-0000-4000-b000-00000000000a', 'clock.payroll'), 'has_perm: an accountant holds pay access');
select ok(not private.has_perm('30000000-0000-4000-b000-00000000000a', 'reservations.edit'), 'has_perm: and nothing a worker holds by rank');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

select ok(private.has_role('30000000-0000-4000-b000-00000000000a', 'manager'), 'has_role: owner outranks manager');
select ok(private.has_perm('30000000-0000-4000-b000-00000000000a', 'billing.manage'), 'has_perm: owners hold every permission');

select ok(private.module_enabled('30000000-0000-4000-b000-00000000000a', 'scheduling'), 'module_enabled: enabled module');
select ok(not private.module_enabled('30000000-0000-4000-b000-00000000000a', 'reservations'), 'module_enabled: disabled module');
select ok(not private.module_enabled('30000000-0000-4000-b000-00000000000a', 'storefront'), 'module_enabled: module never added');

select set_config('request.jwt.claims', '', true);
select ok(not private.is_member('30000000-0000-4000-b000-00000000000a'), 'is_member: nobody signed in');

select * from finish();
rollback;
