-- Templates: apply_template turns an empty business into a complete one,
-- refuses anything else without changing it, and is server-only.
begin;
select plan(29);

insert into public.businesses (id, slug, name)
values
  ('40000000-0000-4000-b000-00000000000a', 'templates-a', 'Templates A'),
  ('40000000-0000-4000-b000-00000000000b', 'templates-b', 'Templates B'),
  ('40000000-0000-4000-b000-00000000000c', 'templates-c', 'Templates C'),
  ('40000000-0000-4000-b000-00000000000d', 'templates-d', 'Templates D'),
  ('40000000-0000-4000-b000-00000000000e', 'templates-e', 'Templates E');

select results_eq(
  'select key from public.templates where key in (''retail'', ''restaurant'', ''cafe-bar'', ''general'') order by key',
  array['cafe-bar', 'general', 'restaurant', 'retail'],
  'all four templates are in the table'
);

-- What isn't built yet stays off, so no template gives a tab to an empty screen.
select is(
  (select count(*)::integer
   from public.templates t, jsonb_each(t.definition -> 'modules') as entry
   where entry.key in ('reservations', 'storefront')
     and (entry.value ->> 'enabled')::boolean),
  0,
  'no template switches on a module that is not built yet'
);
select is(
  (select count(*)::integer from public.business_modules
   where module_key in ('reservations', 'storefront') and enabled),
  0,
  'and no business has one on'
);
-- Notifications have no tab, and every template has them on (20261109000450).
select is(
  (select array_agg(t.key order by t.key) from public.templates t
   where (t.definition #>> '{modules,notifications,enabled}')::boolean),
  array['cafe-bar', 'general', 'restaurant', 'retail'],
  'every template switches notifications on'
);

-- Server only: no execute grant for browser roles, and a call fails.
select ok(
  not has_function_privilege('authenticated', 'public.apply_template(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.apply_template(uuid, text)', 'execute'),
  'browser roles have no execute grant on apply_template'
);
select ok(
  has_function_privilege('service_role', 'public.apply_template(uuid, text)', 'execute'),
  'the server role may execute apply_template'
);
set local role authenticated;
select throws_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000a', 'restaurant')$$,
  '42501', null, 'signed-in users cannot apply a template'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000a', 'restaurant')$$,
  '42501', null, 'anonymous visitors cannot apply a template'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000a', 'restaurant')$$,
  'the server applies the restaurant template'
);
select lives_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000b', 'cafe-bar')$$,
  'the server applies the cafe-bar template'
);
select lives_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000d', 'general')$$,
  'the server applies the general template'
);
select lives_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000e', 'retail')$$,
  'the server applies the retail template'
);
reset role;

select is(
  (select count(*)::integer from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000a'),
  cardinality(enum_range(null::public.module_key)),
  'every module gets a row'
);
select is(
  (select array_agg(module_key order by module_key) from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000b' and enabled),
  array['scheduling', 'time_clock', 'notifications']::public.module_key[],
  'cafe-bar starts with the schedule, the clock and notifications'
);
select is(
  (select jsonb_array_length(settings -> 'shifts') from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000a' and module_key = 'scheduling'),
  4,
  'the restaurant gets its shifts'
);
select is(
  (select template_key || '@' || template_version from public.businesses
   where id = '40000000-0000-4000-b000-00000000000a'),
  'restaurant@3',
  'the business records the template and its version'
);
select is(
  (select settings from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000d' and module_key = 'scheduling'),
  '{}'::jsonb,
  'the general template leaves positions and shifts to the business'
);
select is(
  (select jsonb_array_length(settings -> 'positions') || '/' || jsonb_array_length(settings -> 'shifts')
   from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000e' and module_key = 'scheduling'),
  '4/3',
  'a shop gets its positions and shifts'
);
select is(
  (select jsonb_array_length(opening_hours) from public.businesses
   where id = '40000000-0000-4000-b000-00000000000a'),
  7,
  'the business gets the opening hours'
);

-- Refusals leave the business as it was.
select throws_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000a', 'cafe-bar')$$,
  'P0001', null, 'a business that is already set up is refused'
);
select is(
  (select template_key from public.businesses where id = '40000000-0000-4000-b000-00000000000a'),
  'restaurant',
  'and keeps its template'
);
select throws_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000c', 'no-such-template')$$,
  'P0002', null, 'an unknown template is refused'
);
select throws_ok(
  $$select public.apply_template('40000000-0000-4000-b000-0000000000ff', 'restaurant')$$,
  'P0002', null, 'an unknown business is refused'
);

-- A template that names a module nobody has fails as a whole: no rows written.
insert into public.templates (key, definition)
values ('broken', '{"modules": {"bakery": {"enabled": true, "settings": {}}}, "openingHours": []}');
select throws_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000c', 'broken')$$,
  'P0001', null, 'a template naming an unknown module is refused'
);
select is(
  (select count(*)::integer from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000c'),
  0,
  'and nothing is half-applied'
);

-- A template may leave modules out: they start off, with their defaults.
insert into public.templates (key, definition)
values ('short', '{"modules": {"scheduling": {"enabled": true, "settings": {"closedOnShabbat": false}}}, "openingHours": []}');
select lives_ok(
  $$select public.apply_template('40000000-0000-4000-b000-00000000000c', 'short')$$,
  'a template that leaves modules out applies'
);
select is(
  (select count(*)::integer from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000c'),
  cardinality(enum_range(null::public.module_key)),
  'a short template still gives every module a row'
);
select is(
  (select array_agg(module_key::text) from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000c' and enabled),
  array['scheduling'],
  'only what it names is on'
);
select is(
  (select settings from public.business_modules
   where business_id = '40000000-0000-4000-b000-00000000000c' and module_key = 'time_clock'),
  '{}'::jsonb,
  'what it leaves out has no settings of its own'
);

select * from finish();
rollback;
