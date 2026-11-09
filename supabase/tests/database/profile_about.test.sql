-- The profile, H2 (20261109000400_profile_about.sql): colleagues read the line,
-- the cover and the form of address; nobody writes a profile from the browser
-- any more; set_own_profile writes one's own, within the table's checks; a
-- demo visitor picks a cover, a form and a language but writes no line and
-- changes no name, and the reset clears what they chose; an owner or manager
-- clears an abusive line, logged without its text.
begin;
select plan(35);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into auth.users (id, aud, role, phone)
values
  ('71000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000421'),
  ('71000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000422'),
  ('71000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000423'),
  ('71000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000424'),
  ('71000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000425'),
  ('71000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500000426'),
  ('71000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500000427');

-- a: owner of X; b: manager of X; c and e: workers of X; d: worker of Y.
insert into public.businesses (id, slug, name)
values
  ('71000000-0000-4000-b000-00000000000a', 'about-x', 'About X'),
  ('71000000-0000-4000-b000-00000000000b', 'about-y', 'About Y');

insert into public.memberships (business_id, user_id, role)
values
  ('71000000-0000-4000-b000-00000000000a', '71000000-0000-4000-a000-00000000000a', 'owner'),
  ('71000000-0000-4000-b000-00000000000a', '71000000-0000-4000-a000-00000000000b', 'manager'),
  ('71000000-0000-4000-b000-00000000000a', '71000000-0000-4000-a000-00000000000c', 'worker'),
  ('71000000-0000-4000-b000-00000000000a', '71000000-0000-4000-a000-00000000000e', 'worker'),
  ('71000000-0000-4000-b000-00000000000b', '71000000-0000-4000-a000-00000000000d', 'worker');

update public.profiles set full_name = 'Noa'
where id = '71000000-0000-4000-a000-00000000000c';

-- z (…0001) works in a closed demo business Z, w (…0002) in an open one W.
insert into private.demo_businesses (business_id, definition)
values
  ('71000000-0000-4000-b000-000000000001', $json$
  {
    "slug": "demo-about-closed", "name": "Closed", "accent": "#2563eb",
    "template": "retail", "renews": false,
    "people": [
      { "user_id": "71000000-0000-4000-a000-000000000001", "role": "worker", "name": "Z" }
    ]
  }
  $json$),
  ('71000000-0000-4000-b000-000000000002', $json$
  {
    "slug": "demo-about-open", "name": "Open", "accent": "#2563eb",
    "template": "retail", "renews": false, "profiles": true,
    "people": [
      { "user_id": "71000000-0000-4000-a000-000000000002", "role": "worker", "name": "W" }
    ]
  }
  $json$);

select public.reset_demo_business('71000000-0000-4000-b000-000000000001');
select public.reset_demo_business('71000000-0000-4000-b000-000000000002');

-- Grants and the closed path ------------------------------------------------
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'bio', 'select')
  and has_column_privilege('authenticated', 'public.profiles', 'cover', 'select')
  and has_column_privilege('authenticated', 'public.profiles', 'address_form', 'select'),
  'colleagues may read the line, the cover and the form of address'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'locale', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'bio', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'cover', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'address_form', 'update'),
  'the browser updates no profile column'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'profiles'
     and policyname = 'people update themselves'),
  0,
  'the self-update policy is gone'
);

select pg_temp.sign_in('71000000-0000-4000-a000-00000000000c');
select throws_ok(
  $$update public.profiles set full_name = 'Noa B' where id = '71000000-0000-4000-a000-00000000000c'$$,
  '42501', null,
  'a person cannot rename themself from the browser'
);
select throws_ok(
  $$update public.profiles set bio = 'hello' where id = '71000000-0000-4000-a000-00000000000c'$$,
  '42501', null,
  'nor write a line from it'
);
reset role;

select ok(
  not has_function_privilege('authenticated', 'public.set_own_profile(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.set_own_profile(uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.clear_profile_bio(uuid, uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.clear_profile_bio(uuid, uuid, uuid, text)', 'execute'),
  'browser roles cannot call the profile writers'
);
select ok(
  has_function_privilege('service_role', 'public.set_own_profile(uuid, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.clear_profile_bio(uuid, uuid, uuid, text)', 'execute'),
  'the server can'
);

select pg_temp.sign_in('71000000-0000-4000-a000-00000000000c');
select throws_ok(
  'select * from public.profiles',
  '42501', null,
  'asking for everything still fails (the phone stays closed)'
);
reset role;

-- Writing, as the server ------------------------------------------------------
set local role service_role;
select lives_ok(
  $$select public.set_own_profile(
    '71000000-0000-4000-a000-00000000000c',
    '{"bio": "  בבוקר בקופה  ", "cover": "waves", "address_form": "f"}'
  )$$,
  'a person writes a line, picks a cover and a form of address'
);
reset role;
select results_eq(
  $$select bio, cover, address_form from public.profiles
    where id = '71000000-0000-4000-a000-00000000000c'$$,
  $$values ('בבוקר בקופה'::text, 'waves'::text, 'f'::text)$$,
  'the line is stored trimmed'
);

select pg_temp.sign_in('71000000-0000-4000-a000-00000000000a');
select is(
  (select bio || '/' || cover || '/' || address_form from public.profiles
   where id = '71000000-0000-4000-a000-00000000000c'),
  'בבוקר בקופה/waves/f',
  'a colleague reads them'
);
reset role;

select pg_temp.sign_in('71000000-0000-4000-a000-00000000000d');
select is(
  (select count(*)::int from public.profiles
   where id = '71000000-0000-4000-a000-00000000000c'),
  0,
  'another business reads nothing'
);
reset role;

select throws_ok(
  $$select public.set_own_profile(
    '71000000-0000-4000-a000-00000000000c', jsonb_build_object('bio', repeat('א', 161))
  )$$,
  '23514', null,
  'a line is at most 160 characters'
);
select lives_ok(
  $$select public.set_own_profile(
    '71000000-0000-4000-a000-00000000000c', jsonb_build_object('bio', repeat('א', 160))
  )$$,
  '160 fit'
);
select throws_ok(
  $$select public.set_own_profile(
    '71000000-0000-4000-a000-00000000000c', jsonb_build_object('bio', e'one\ntwo')
  )$$,
  '23514', null,
  'a line has no line breaks'
);
select throws_ok(
  $$select public.set_own_profile('71000000-0000-4000-a000-00000000000c', '{"address_form": "n"}')$$,
  '23514', null,
  'the form of address is f, m or x'
);
select throws_ok(
  $$select public.set_own_profile('71000000-0000-4000-a000-00000000000c', '{"cover": "Waves!"}')$$,
  '23514', null,
  'a cover is a preset key'
);
select throws_ok(
  $$select public.set_own_profile('71000000-0000-4000-a000-00000000000c', '{"phone": "+972500000000"}')$$,
  '22023', null,
  'the phone number is not a profile field'
);
select throws_ok(
  $$select public.set_own_profile('71000000-0000-4000-a000-00000000000c', '{}')$$,
  '22023', null,
  'an empty patch is refused'
);
select lives_ok(
  $$select public.set_own_profile('71000000-0000-4000-a000-00000000000c', '{"bio": null}')$$,
  'the line can be cleared'
);
select is(
  (select bio from public.profiles where id = '71000000-0000-4000-a000-00000000000c'),
  null,
  'and is gone'
);
select lives_ok(
  $$select public.set_own_profile(
    '71000000-0000-4000-a000-00000000000c', '{"full_name": "  נועה לוי ", "locale": "en"}'
  )$$,
  'the name and the language change here now'
);
select is(
  (select full_name || '/' || locale from public.profiles
   where id = '71000000-0000-4000-a000-00000000000c'),
  'נועה לוי/en',
  'trimmed, as the invite flow stores names'
);

-- Demo ------------------------------------------------------------------------
select throws_ok(
  $$select public.set_own_profile('71000000-0000-4000-a000-000000000001', '{"bio": "050-1234567"}')$$,
  '55000', null,
  'a demo visitor writes no line'
);
select throws_ok(
  $$select public.set_own_profile('71000000-0000-4000-a000-000000000001', '{"full_name": "Someone else"}')$$,
  '55000', null,
  'and changes no name'
);
select lives_ok(
  $$select public.set_own_profile(
    '71000000-0000-4000-a000-000000000001', '{"cover": "dots", "address_form": "m", "locale": "en"}'
  )$$,
  'but picks a cover, a form of address and a language'
);
select lives_ok(
  $$select public.set_own_profile('71000000-0000-4000-a000-000000000002', '{"bio": "שלום"}')$$,
  'an open demo business (the local seed''s restaurant) takes a line'
);

select public.reset_demo_business('71000000-0000-4000-b000-000000000001');
select results_eq(
  $$select bio, cover, address_form, locale from public.profiles
    where id = '71000000-0000-4000-a000-000000000001'$$,
  $$values (null::text, null::text, null::text, 'he'::text)$$,
  'the reset clears what a visitor chose'
);

-- Clearing someone's line ---------------------------------------------------
-- c's line back (20 cleared it), and one for the owner.
select public.set_own_profile('71000000-0000-4000-a000-00000000000c', '{"bio": "בבוקר בקופה"}');
select public.set_own_profile('71000000-0000-4000-a000-00000000000a', '{"bio": "Owner"}');

select throws_ok(
  $$select public.clear_profile_bio(
    '71000000-0000-4000-a000-00000000000e', '71000000-0000-4000-b000-00000000000a',
    '71000000-0000-4000-a000-00000000000c', 'בבוקר בקופה'
  )$$,
  '42501', null,
  'a worker cannot clear a colleague''s line'
);
select throws_ok(
  $$select public.clear_profile_bio(
    '71000000-0000-4000-a000-00000000000b', '71000000-0000-4000-b000-00000000000a',
    '71000000-0000-4000-a000-00000000000d', 'anything'
  )$$,
  '42501', null,
  'nor can a manager clear someone outside the business'
);
select throws_ok(
  $$select public.clear_profile_bio(
    '71000000-0000-4000-a000-00000000000b', '71000000-0000-4000-b000-00000000000a',
    '71000000-0000-4000-a000-00000000000a', 'Owner'
  )$$,
  '42501', null,
  'a manager does not clear an owner''s line'
);

-- The manager read "בבוקר בקופה"; c writes a new line before the delete goes.
select public.set_own_profile('71000000-0000-4000-a000-00000000000c', '{"bio": "בערב בבר"}');
select throws_ok(
  $$select public.clear_profile_bio(
    '71000000-0000-4000-a000-00000000000b', '71000000-0000-4000-b000-00000000000a',
    '71000000-0000-4000-a000-00000000000c', 'בבוקר בקופה'
  )$$,
  '40001', null,
  'a line written after the manager read it is not cleared'
);
select ok(
  (select bio from public.profiles where id = '71000000-0000-4000-a000-00000000000c') = 'בערב בבר'
  and not exists (
    select 1 from public.audit_log
    where business_id = '71000000-0000-4000-b000-00000000000a'
      and action = 'profile.bio_cleared'
  ),
  'the new line stays, and nothing is logged'
);

select public.clear_profile_bio(
  '71000000-0000-4000-a000-00000000000b', '71000000-0000-4000-b000-00000000000a',
  '71000000-0000-4000-a000-00000000000c', 'בערב בבר'
);
select public.clear_profile_bio(
  '71000000-0000-4000-a000-00000000000b', '71000000-0000-4000-b000-00000000000a',
  '71000000-0000-4000-a000-00000000000c', 'בערב בבר'
);
select is(
  (select count(*)::int from public.audit_log
   where business_id = '71000000-0000-4000-b000-00000000000a'
     and actor_id = '71000000-0000-4000-a000-00000000000b'
     and action = 'profile.bio_cleared'
     and details ->> 'person' = '71000000-0000-4000-a000-00000000000c'),
  1,
  'a manager clears the line they read, logged once; clearing nothing logs nothing'
);
select ok(
  (select bio from public.profiles where id = '71000000-0000-4000-a000-00000000000c') is null
  and not exists (
    select 1 from public.audit_log
    where business_id = '71000000-0000-4000-b000-00000000000a'
      and (details::text like '%בבוקר%' or details::text like '%בערב%')
  ),
  'the line is gone and the log holds no text'
);

select * from finish();
rollback;
