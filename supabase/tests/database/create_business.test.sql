-- create_business: the wizard's one write. Server only, team members only,
-- and all or nothing: a business is never left half set up.
begin;
select plan(14);

insert into auth.users (id, aud, role, phone)
values
  ('50000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000501'),
  ('50000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000502');

-- a: an onboarder; b: signed in but not on the team.
insert into public.platform_staff (user_id, role)
values ('50000000-0000-4000-a000-00000000000a', 'onboarder');

select ok(
  not has_function_privilege('authenticated', 'public.create_business(uuid, text, text, text, text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.create_business(uuid, text, text, text, text, text, jsonb)', 'execute'),
  'browser roles have no execute grant on create_business'
);
set local role authenticated;
select throws_ok(
  $$select public.create_business('50000000-0000-4000-a000-00000000000a',
    'Cafe', 'cb-browser', null, '#2563eb', 'cafe-bar')$$,
  '42501', null, 'signed-in users cannot call create_business'
);
reset role;

set local role service_role;
select throws_ok(
  $$select public.create_business('50000000-0000-4000-a000-00000000000b',
    'Cafe', 'cb-outsider', null, '#2563eb', 'cafe-bar')$$,
  '42501', 'Platform staff only',
  'someone off the team cannot open a business'
);
select lives_ok(
  $$select public.create_business('50000000-0000-4000-a000-00000000000a',
    '  Cafe Noa ', 'cb-cafe-noa', '  ', '#0f766e', 'cafe-bar')$$,
  'an onboarder opens a business from a template'
);
select throws_ok(
  $$select public.create_business('50000000-0000-4000-a000-00000000000a',
    'Another', 'cb-cafe-noa', null, '#2563eb', 'restaurant')$$,
  '23505', null,
  'a taken slug is refused'
);
select throws_ok(
  $$select public.create_business('50000000-0000-4000-a000-00000000000a',
    'Bakery', 'cb-bakery', null, '#2563eb', 'bakery')$$,
  'P0002', null,
  'an unknown template is refused'
);
select throws_ok(
  $$select public.create_business('50000000-0000-4000-a000-00000000000a',
    'Pale', 'cb-pale', null, 'yellow', 'restaurant')$$,
  '23514', null,
  'a malformed accent is refused'
);
reset role;

select results_eq(
  $$select name, address, accent, template_key, template_version
    from public.businesses where slug = 'cb-cafe-noa'$$,
  $$values ('Cafe Noa'::text, null::text, '#0f766e'::text, 'cafe-bar'::text, 3)$$,
  'the business is stored tidied, with the template applied'
);
select is(
  (select count(*)::integer from public.business_modules bm
   join public.businesses b on b.id = bm.business_id
   where b.slug = 'cb-cafe-noa'),
  cardinality(enum_range(null::public.module_key)),
  'every module gets a row'
);
select isnt(
  (select opening_hours from public.businesses where slug = 'cb-cafe-noa'),
  '[]'::jsonb,
  'the opening hours come from the template'
);
select results_eq(
  $$select a.actor_id, a.action, a.details
    from public.audit_log a join public.businesses b on b.id = a.business_id
    where b.slug = 'cb-cafe-noa'$$,
  $$values ('50000000-0000-4000-a000-00000000000a'::uuid, 'business.create'::text,
    '{"slug": "cb-cafe-noa", "template": "cafe-bar", "invites": 0}'::jsonb)$$,
  'the audit log records who opened it and from which template'
);
select is_empty(
  $$select 1 from public.businesses where slug in ('cb-outsider', 'cb-bakery', 'cb-pale', 'cb-browser')$$,
  'a refused call leaves no business behind'
);
select is(
  (select count(*)::integer from public.businesses where slug = 'cb-cafe-noa'),
  1,
  'the taken slug kept its one business'
);
select is_empty(
  $$select 1 from public.memberships m join public.businesses b on b.id = m.business_id
    where b.slug = 'cb-cafe-noa'$$,
  'the team member does not become a member of the business'
);

select * from finish();
rollback;
