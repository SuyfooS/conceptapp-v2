-- The staff list pasted into the wizard: invited in the same transaction as
-- the business, and read back by the console's checklist (admin_business),
-- which only the ConceptApp team may call.
begin;
select plan(13);

insert into auth.users (id, aud, role, phone)
values
  ('60000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000601'),
  ('60000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000602');

-- a: an onboarder; b: signed in but not on the team.
insert into public.platform_staff (user_id, role)
values ('60000000-0000-4000-a000-00000000000a', 'onboarder');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

set local role service_role;
select lives_ok(
  $$select public.create_business('60000000-0000-4000-a000-00000000000a',
    'Staff Cafe', 'bs-staff-cafe', 'Herzl 1, Haifa', '#0f766e', 'cafe-bar',
    '[{"name": " Ronit ", "phone": "+972500000611", "role": "owner"},
      {"name": "Shai", "phone": "+972500000612", "role": "worker"}]')$$,
  'an onboarder opens a business with a staff list'
);
select throws_ok(
  $$select public.create_business('60000000-0000-4000-a000-00000000000a',
    'Twice', 'bs-twice', null, '#0f766e', 'cafe-bar',
    '[{"name": "A", "phone": "+972500000621", "role": "worker"},
      {"name": "B", "phone": "+972500000621", "role": "worker"}]')$$,
  '23505', null,
  'the same number twice is refused'
);
select throws_ok(
  $$select public.create_business('60000000-0000-4000-a000-00000000000a',
    'Bad phone', 'bs-bad-phone', null, '#0f766e', 'cafe-bar',
    '[{"name": "A", "phone": "050-000-0631", "role": "worker"}]')$$,
  '23514', null,
  'a number not in E.164 is refused'
);
select throws_ok(
  $$select public.create_business('60000000-0000-4000-a000-00000000000a',
    'Bad role', 'bs-bad-role', null, '#0f766e', 'cafe-bar',
    '[{"name": "A", "phone": "+972500000641", "role": "boss"}]')$$,
  '22P02', null,
  'an unknown role is refused'
);
select throws_ok(
  $$select public.create_business('60000000-0000-4000-a000-00000000000a',
    'Not a list', 'bs-not-a-list', null, '#0f766e', 'cafe-bar',
    '{"name": "A"}')$$,
  '22023', null,
  'a staff value that is not a list is refused'
);
reset role;

select is_empty(
  $$select 1 from public.businesses
    where slug in ('bs-twice', 'bs-bad-phone', 'bs-bad-role', 'bs-not-a-list')$$,
  'a refused staff list leaves no business behind'
);
select results_eq(
  $$select i.full_name, i.phone, i.role::text, i.invited_by, i.claimed_at is null
    from public.invites i join public.businesses b on b.id = i.business_id
    where b.slug = 'bs-staff-cafe' order by i.phone$$,
  $$values
    ('Ronit'::text, '+972500000611'::text, 'owner'::text,
      '60000000-0000-4000-a000-00000000000a'::uuid, true),
    ('Shai', '+972500000612', 'worker',
      '60000000-0000-4000-a000-00000000000a'::uuid, true)$$,
  'each person becomes an open invite from the team member'
);
select is(
  (select count(distinct token_hash)::integer from public.invites i
    join public.businesses b on b.id = i.business_id
    where b.slug = 'bs-staff-cafe' and token_hash ~ '^[0-9a-f]{64}$'),
  2,
  'each invite gets its own hashed token'
);
select is(
  (select a.details->'invites' from public.audit_log a
    join public.businesses b on b.id = a.business_id
    where b.slug = 'bs-staff-cafe'),
  '2'::jsonb,
  'the audit log records how many were invited'
);

-- The checklist's read -------------------------------------------------------
select pg_temp.sign_in('60000000-0000-4000-a000-00000000000a');
select is(
  (select b - 'id' - 'created_at' || jsonb_build_object('people', (
      select jsonb_agg(p - 'invite_id' - 'expires_at' order by n)
      from jsonb_array_elements(b -> 'people') with ordinality as e(p, n)))
    from public.admin_business('bs-staff-cafe') as b),
  jsonb_build_object(
    'slug', 'bs-staff-cafe',
    'name', 'Staff Cafe',
    'accent', '#0f766e',
    'address', 'Herzl 1, Haifa',
    'template_key', 'cafe-bar',
    'people', jsonb_build_array(
      jsonb_build_object('name', 'Ronit', 'phone', '+972500000611',
        'role', 'owner', 'status', 'invited'),
      jsonb_build_object('name', 'Shai', 'phone', '+972500000612',
        'role', 'worker', 'status', 'invited')
    )
  ),
  'a team member reads the business and its people'
);
select is(
  (select count(distinct p ->> 'invite_id')::integer
    from jsonb_array_elements(public.admin_business('bs-staff-cafe') -> 'people') p
    where p ->> 'invite_id' ~ '^[0-9a-f-]{36}$'),
  2,
  'each invited person carries their own invite id'
);
select is(
  public.admin_business('bs-no-such-business'),
  null,
  'an unknown slug reads as null'
);

select pg_temp.sign_in('60000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$select public.admin_business('bs-staff-cafe')$$,
  '42501', 'Platform staff only',
  'someone off the team cannot read it'
);

select * from finish();
rollback;
