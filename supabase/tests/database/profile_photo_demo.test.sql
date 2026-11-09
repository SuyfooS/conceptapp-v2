-- Photos in demo businesses (20261109000100_profile_photo_demo.sql): someone
-- in a demo business that keeps its people gets no new photo, not even from
-- the server; a demo business whose definition opens it (the local seed's
-- restaurant, for the browser tests) and a real business take one. The reset
-- still clears a demo person's photo, and a photo can always be removed.
begin;
select plan(10);

insert into auth.users (id, aud, role, phone)
values
  ('70000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000411'),
  ('70000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000412'),
  ('70000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000413');

-- a works in a closed demo business, b in an open one, c in a real one.
insert into private.demo_businesses (business_id, definition)
values
  ('70000000-0000-4000-b000-000000000001', $json$
  {
    "slug": "demo-photo-closed", "name": "Closed", "accent": "#2563eb",
    "template": "retail", "renews": false,
    "people": [
      { "user_id": "70000000-0000-4000-a000-00000000000a", "role": "worker", "name": "A" }
    ]
  }
  $json$),
  ('70000000-0000-4000-b000-000000000002', $json$
  {
    "slug": "demo-photo-open", "name": "Open", "accent": "#2563eb",
    "template": "retail", "renews": false, "profiles": true,
    "people": [
      { "user_id": "70000000-0000-4000-a000-00000000000b", "role": "worker", "name": "B" }
    ]
  }
  $json$);

select public.reset_demo_business('70000000-0000-4000-b000-000000000001');
select public.reset_demo_business('70000000-0000-4000-b000-000000000002');

insert into public.businesses (id, slug, name)
values ('70000000-0000-4000-b000-000000000003', 'photo-demo-real', 'Real');

insert into public.memberships (business_id, user_id, role)
values ('70000000-0000-4000-b000-000000000003', '70000000-0000-4000-a000-00000000000c', 'worker');

-- Who asks.
select ok(
  not has_function_privilege('authenticated', 'public.keeps_demo_profile(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.keeps_demo_profile(uuid)', 'execute'),
  'browser roles cannot ask who keeps a demo profile'
);
select ok(
  has_function_privilege('service_role', 'public.keeps_demo_profile(uuid)', 'execute'),
  'the server can'
);

-- The answer.
select is(
  public.keeps_demo_profile('70000000-0000-4000-a000-00000000000a'),
  true,
  'someone in a closed demo business keeps their profile'
);
select is(
  public.keeps_demo_profile('70000000-0000-4000-a000-00000000000b'),
  false,
  'an open demo business (the local seed''s restaurant) does not'
);
select is(
  public.keeps_demo_profile('70000000-0000-4000-a000-00000000000c'),
  false,
  'nor does a real business'
);

-- The rule.
select throws_ok(
  $$update public.profiles
    set avatar_path = '70000000-0000-4000-a000-00000000000a/abcdefgh.jpg'
    where id = '70000000-0000-4000-a000-00000000000a'$$,
  '55000', null,
  'the database refuses a photo for someone in a closed demo business, even from the server'
);
select lives_ok(
  $$update public.profiles
    set avatar_path = '70000000-0000-4000-a000-00000000000b/abcdefgh.jpg'
    where id = '70000000-0000-4000-a000-00000000000b'$$,
  'it takes one in an open demo business'
);
select lives_ok(
  $$update public.profiles
    set avatar_path = '70000000-0000-4000-a000-00000000000c/abcdefgh.jpg'
    where id = '70000000-0000-4000-a000-00000000000c'$$,
  'and in a real business'
);

-- b's photo is really there for the reset to clear.
select public.reset_demo_business('70000000-0000-4000-b000-000000000002');
select is(
  (select avatar_path from public.profiles where id = '70000000-0000-4000-a000-00000000000b'),
  null,
  'the reset still clears a demo person''s photo'
);

-- A photo set while the business was open, then the business closes.
update public.profiles
set avatar_path = '70000000-0000-4000-a000-00000000000b/ijklmnop.jpg'
where id = '70000000-0000-4000-a000-00000000000b';
update private.demo_businesses
set definition = definition - 'profiles'
where business_id = '70000000-0000-4000-b000-000000000002';
select lives_ok(
  $$update public.profiles set avatar_path = null
    where id = '70000000-0000-4000-a000-00000000000b'$$,
  'a photo can always be removed, even once its business is closed'
);

select * from finish();
rollback;
