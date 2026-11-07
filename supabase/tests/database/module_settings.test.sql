-- A business's settings: only the server writes. An owner, a manager or the
-- ConceptApp team saves some of a module's settings, and the rest stays. Only the
-- team switches a module on or off. Nobody reaches another business, and every
-- write goes to the audit log.
begin;
select plan(19);

insert into auth.users (id, aud, role, phone)
values
  ('6a000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000921'),
  ('6a000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000922'),
  ('6a000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000923'),
  ('6a000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000924'),
  ('6a000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000925'),
  ('6a000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000926');

-- a: owner of X; b: manager of X; c: worker of X; d: manager of Y; e: on the team;
-- f: manager of X who has left.
insert into public.businesses (id, slug, name)
values
  ('6a000000-0000-4000-b000-000000000001', 'ms-x', 'Settings X'),
  ('6a000000-0000-4000-b000-000000000002', 'ms-y', 'Settings Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000a', 'owner', true),
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000b', 'manager', true),
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000c', 'worker', true),
  ('6a000000-0000-4000-b000-000000000002', '6a000000-0000-4000-a000-00000000000d', 'manager', true),
  ('6a000000-0000-4000-b000-000000000001', '6a000000-0000-4000-a000-00000000000f', 'manager', false);

insert into public.platform_staff (user_id, role)
values ('6a000000-0000-4000-a000-00000000000e', 'onboarder');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('6a000000-0000-4000-b000-000000000001', 'time_clock', true, '{"roundToMinutes": 5}'),
  ('6a000000-0000-4000-b000-000000000002', 'time_clock', true, '{}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Nobody but the server writes.
select pg_temp.sign_in('6a000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000b',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true}')$$,
  '42501', null, 'a signed-in manager cannot call it directly'
);
select throws_ok(
  $$update public.business_modules set settings = '{}'$$,
  '42501', null, 'a signed-in manager cannot write the table'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.set_module_enabled('6a000000-0000-4000-a000-00000000000e',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', false)$$,
  '42501', null, 'an anonymous visitor cannot switch a module'
);
reset role;

set local role service_role;

-- Who may save.
select lives_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000b',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true}')$$,
  'a manager saves a setting'
);
select is(
  (select settings from public.business_modules
    where business_id = '6a000000-0000-4000-b000-000000000001' and module_key = 'time_clock'),
  '{"roundToMinutes": 5, "unpaidBreaks": true}'::jsonb,
  'the other settings stay'
);
select lives_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000a',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": false}')$$,
  'an owner saves a setting'
);
select lives_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000e',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', '{"roundToMinutes": 15}')$$,
  'the team saves a setting'
);
select throws_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000c',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true}')$$,
  '42501', null, 'a worker cannot'
);
select throws_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000f',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true}')$$,
  '42501', null, 'a manager who left cannot'
);
select throws_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000d',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true}')$$,
  '42501', null, 'a manager of another business cannot'
);
select throws_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000b',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', '[1]')$$,
  '22023', null, 'settings must be an object'
);
select throws_ok(
  $$select public.set_module_settings('6a000000-0000-4000-a000-00000000000b',
    '6a000000-0000-4000-b000-000000000001', 'scheduling', '{}')$$,
  'P0002', null, 'a module the business has no row for is refused'
);

-- The audit log keeps what changed.
select is(
  (select details from public.audit_log
    where business_id = '6a000000-0000-4000-b000-000000000001'
      and action = 'module.settings'
      and actor_id = '6a000000-0000-4000-a000-00000000000e'),
  '{"module": "time_clock", "from": {"roundToMinutes": 5}, "to": {"roundToMinutes": 15}}'::jsonb,
  'the log has the setting before and after'
);

-- Switching a module.
select throws_ok(
  $$select public.set_module_enabled('6a000000-0000-4000-a000-00000000000a',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', false)$$,
  '42501', null, 'an owner cannot switch a module'
);
select lives_ok(
  $$select public.set_module_enabled('6a000000-0000-4000-a000-00000000000e',
    '6a000000-0000-4000-b000-000000000001', 'time_clock', false)$$,
  'the team switches a module off'
);
select is(
  (select enabled from public.business_modules
    where business_id = '6a000000-0000-4000-b000-000000000001' and module_key = 'time_clock'),
  false,
  'it is off'
);
select is(
  (select enabled from public.business_modules
    where business_id = '6a000000-0000-4000-b000-000000000002' and module_key = 'time_clock'),
  true,
  'and only for that business'
);
select throws_ok(
  $$select public.set_module_enabled('6a000000-0000-4000-a000-00000000000e',
    '6a000000-0000-4000-b000-000000000001', 'scheduling', true)$$,
  'P0002', null, 'a module the business has no row for cannot be switched'
);
select is(
  (select count(*)::int from public.audit_log
    where business_id = '6a000000-0000-4000-b000-000000000001' and action = 'module.enabled'),
  1,
  'switching goes to the log'
);
reset role;

select * from finish();
rollback;
