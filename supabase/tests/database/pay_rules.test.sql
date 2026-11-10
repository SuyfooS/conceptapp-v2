-- The pay rules (20261110000700_pay_rules.sql): the time clock's settings the
-- hours engine reads are for an owner or the ConceptApp team, the pay
-- estimate for the team alone, and each is checked for its type. A demo
-- definition's settings go over its template's in the reset, so the demo
-- businesses show the estimate, and a real business starts without it.
begin;
select plan(31);

insert into auth.users (id, aud, role, phone)
values
  ('7e000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500003101'),
  ('7e000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500003102'),
  ('7e000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500003103'),
  ('7e000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500003104'),
  ('7e000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500003105');

-- a: owner of X; b: manager of X; e: on the team; f, 10: the demo
-- businesses' owners.
insert into public.businesses (id, slug, name)
values ('7e000000-0000-4000-b000-000000000001', 'pr-x', 'Pay rules X');

insert into public.memberships (business_id, user_id, role, active)
values
  ('7e000000-0000-4000-b000-000000000001', '7e000000-0000-4000-a000-00000000000a', 'owner', true),
  ('7e000000-0000-4000-b000-000000000001', '7e000000-0000-4000-a000-00000000000b', 'manager', true);

insert into public.platform_staff (user_id, role)
values ('7e000000-0000-4000-a000-00000000000e', 'onboarder');

insert into public.business_modules (business_id, module_key, enabled, settings)
values ('7e000000-0000-4000-b000-000000000001', 'time_clock', true, '{}');

set local role service_role;

-- Owners and the team set the rules; a manager doesn't.
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000b',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"workWeek": "five"}')$$,
  '42501', 'Only an owner or the team changes the pay rules',
  'a manager cannot set the work week'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000b',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true, "restStartTime": "15:00"}')$$,
  '42501', 'Only an owner or the team changes the pay rules',
  'nor when the rest starts, even with another field'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000b',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"workersSeeEstimate": false}')$$,
  '42501', 'Only an owner or the team changes the pay rules',
  'nor whether workers see their estimate'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000b',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"requirePunchCode": true}')$$,
  '42501', 'Only an owner or the team changes the punch code',
  'the punch code keeps its own words'
);
select lives_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock',
    '{"workWeek": "five", "shortDay": 3, "restStart": "fixed", "restStartTime": "15:30", "workersSeeEstimate": false}')$$,
  'the owner sets them'
);
select is(
  (select settings from public.business_modules
    where business_id = '7e000000-0000-4000-b000-000000000001' and module_key = 'time_clock'),
  '{"workWeek": "five", "shortDay": 3, "restStart": "fixed", "restStartTime": "15:30", "workersSeeEstimate": false}'::jsonb,
  'and they are kept'
);
select lives_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000e',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"workWeek": "unset"}')$$,
  'the team sets them'
);
select lives_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000b',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"unpaidBreaks": true}')$$,
  'a manager still changes the other clock settings'
);
select is(
  (select details from public.audit_log
    where business_id = '7e000000-0000-4000-b000-000000000001'
      and action = 'module.settings'
      and actor_id = '7e000000-0000-4000-a000-00000000000e'),
  '{"module": "time_clock", "from": {"workWeek": "five"}, "to": {"workWeek": "unset"}}'::jsonb,
  'the log has the rule before and after'
);

-- The estimate is the team's alone.
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"payEstimate": true}')$$,
  '42501', 'Only the team switches the pay estimate',
  'an owner cannot switch the estimate on'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000b',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"payEstimate": true}')$$,
  '42501', 'Only the team switches the pay estimate',
  'nor a manager'
);
select is(
  (select settings -> 'payEstimate' from public.business_modules
    where business_id = '7e000000-0000-4000-b000-000000000001' and module_key = 'time_clock'),
  null,
  'a real business has no estimate until the team switches it on'
);
select lives_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000e',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"payEstimate": true}')$$,
  'the team switches it on'
);
select is(
  (select settings -> 'payEstimate' from public.business_modules
    where business_id = '7e000000-0000-4000-b000-000000000001' and module_key = 'time_clock'),
  'true'::jsonb,
  'and it is on'
);

-- Each rule is checked for its type.
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"workWeek": "seven"}')$$,
  '22023', 'Not a pay rule setting', 'a week is unset, five or six days'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"shortDay": 5}')$$,
  '22023', 'Not a pay rule setting', 'the short day is Sunday to Thursday'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"shortDay": "4"}')$$,
  '22023', 'Not a pay rule setting', 'and a number'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"restStart": "sunset"}')$$,
  '22023', 'Not a pay rule setting', 'the rest starts at candle lighting or a fixed time'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"restStartTime": "24:00"}')$$,
  '22023', 'Not a pay rule setting', 'the fixed time is a time of day'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"restStartTime": 14}')$$,
  '22023', 'Not a pay rule setting', 'written as HH:MM'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"workersSeeEstimate": "yes"}')$$,
  '22023', 'Not a pay rule setting', 'whether workers see it is yes or no'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000e',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"payEstimate": 1}')$$,
  '22023', 'Not a pay rule setting', 'and so is the estimate'
);
select throws_ok(
  $$select public.set_module_settings('7e000000-0000-4000-a000-00000000000a',
    '7e000000-0000-4000-b000-000000000001', 'time_clock', '{"codeDisplay": "everywhere"}')$$,
  '22023', 'Not a punch code setting', 'the punch code is checked as before'
);
select is(
  (select settings from public.business_modules
    where business_id = '7e000000-0000-4000-b000-000000000001' and module_key = 'time_clock'),
  '{"workWeek": "unset", "shortDay": 3, "restStart": "fixed", "restStartTime": "15:30", "workersSeeEstimate": false, "unpaidBreaks": true, "payEstimate": true}'::jsonb,
  'only the allowed changes were saved'
);
reset role;

-- The demo: a definition's settings go over its template's.
insert into private.demo_businesses (business_id, definition)
values
  ('7e000000-0000-4000-b000-000000000002', $json$
  {
    "slug": "pr-demo", "name": "Pay rules demo", "accent": "#7c3aed",
    "address": "Demo street 3", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "settings": { "time_clock": { "payEstimate": true }, "nowhere": { "x": 1 } },
    "people": [
      { "user_id": "7e000000-0000-4000-a000-00000000000f", "role": "owner", "name": "Owner F" }
    ]
  }
  $json$),
  ('7e000000-0000-4000-b000-000000000003', $json$
  {
    "slug": "pr-demo-plain", "name": "Pay rules demo, plain", "accent": "#2563eb",
    "address": "Demo street 4", "shabbat_city": "telAviv",
    "template": "retail", "renews": false,
    "people": [
      { "user_id": "7e000000-0000-4000-a000-000000000010", "role": "owner", "name": "Owner 10" }
    ]
  }
  $json$);

select lives_ok(
  $$select public.reset_demo_business('7e000000-0000-4000-b000-000000000002')$$,
  'a demo business with settings resets'
);
select lives_ok(
  $$select public.reset_demo_business('7e000000-0000-4000-b000-000000000003')$$,
  'and one without'
);
select is(
  (select settings -> 'payEstimate' from public.business_modules
    where business_id = '7e000000-0000-4000-b000-000000000002' and module_key = 'time_clock'),
  'true'::jsonb,
  'its definition switches the estimate on'
);
select is(
  (select enabled from public.business_modules
    where business_id = '7e000000-0000-4000-b000-000000000002' and module_key = 'time_clock'),
  true,
  'over the template, which keeps the clock on'
);
select is(
  (select settings -> 'payEstimate' from public.business_modules
    where business_id = '7e000000-0000-4000-b000-000000000003' and module_key = 'time_clock'),
  null,
  'a demo without it starts with the estimate off, as a real business does'
);
select is(
  (select count(*)::int from public.business_modules
    where business_id in ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000002')
      and module_key = 'time_clock'
      and settings -> 'payEstimate' = 'true'::jsonb),
  2,
  'both seeded demo businesses show the estimate'
);
select ok(
  not has_function_privilege('service_role', 'private.seed_demo_pay(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_pay(uuid)', 'execute'),
  'the demo''s pay seed runs only inside the reset'
);

select * from finish();
rollback;
