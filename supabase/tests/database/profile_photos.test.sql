-- Profile photos: a private bucket for JPEG, PNG or WebP up to 2MB. A
-- person uploads, replaces and removes only their own photo; they and the
-- active members of their businesses read it; other businesses, former
-- members and anonymous visitors read nothing. `avatar_path` is written by
-- the server only and must point into the person's own folder.
begin;
select plan(20);

insert into auth.users (id, aud, role, phone)
values
  ('69000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000911'),
  ('69000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000912'),
  ('69000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000913'),
  ('69000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000914');

-- a and b work at X; c works at Y; d used to work at X.
insert into public.businesses (id, slug, name)
values
  ('69000000-0000-4000-b000-000000000001', 'ph-x', 'Photo X'),
  ('69000000-0000-4000-b000-000000000002', 'ph-y', 'Photo Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('69000000-0000-4000-b000-000000000001', '69000000-0000-4000-a000-00000000000a', 'owner', true),
  ('69000000-0000-4000-b000-000000000001', '69000000-0000-4000-a000-00000000000b', 'worker', true),
  ('69000000-0000-4000-b000-000000000002', '69000000-0000-4000-a000-00000000000c', 'worker', true),
  ('69000000-0000-4000-b000-000000000001', '69000000-0000-4000-a000-00000000000d', 'worker', false);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- The bucket.
select is(
  (select public::text || ' ' || file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'avatars'),
  'false 2097152 image/jpeg,image/png,image/webp',
  'the avatars bucket is private, 2MB, JPEG, PNG or WebP'
);

-- Uploading.
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000b');
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg')$$,
  'a person uploads a photo to their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', '69000000-0000-4000-a000-00000000000a/abcdefgh.jpg')$$,
  '42501', null, 'a person cannot upload into a colleague''s folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', 'abcdefgh.jpg')$$,
  '42501', null, 'a photo outside any folder is refused'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', 'not-a-user/abcdefgh.jpg')$$,
  '42501', null, 'a folder that is not a user id is refused'
);
reset role;
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000c');
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', '69000000-0000-4000-a000-00000000000c/abcdefgh.png')$$,
  'a worker of Y uploads their own photo'
);
reset role;
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000d');
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', '69000000-0000-4000-a000-00000000000d/abcdefgh.webp')$$,
  'a former member still keeps their own photo'
);
reset role;
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', '69000000-0000-4000-a000-00000000000b/zzzzzzzz.jpg')$$,
  '42501', null, 'an anonymous visitor cannot upload'
);
reset role;

-- Reading.
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  1,
  'a worker reads their own photo and no one else''s outside their business'
);
reset role;
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000a');
select results_eq(
  $$select name from storage.objects where bucket_id = 'avatars' order by name$$,
  $$values ('69000000-0000-4000-a000-00000000000b/abcdefgh.jpg')$$,
  'a colleague reads the photo; a former member''s stays closed'
);
reset role;
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000c');
select results_eq(
  $$select name from storage.objects where bucket_id = 'avatars' order by name$$,
  $$values ('69000000-0000-4000-a000-00000000000c/abcdefgh.png')$$,
  'a worker of another business reads only their own'
);
reset role;
set local role anon;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  0,
  'an anonymous visitor reads no photos'
);
reset role;

-- Replacing and removing.
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000a');
update storage.objects set metadata = '{"x": 1}'
where name = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg';
reset role;
select is(
  (select metadata from storage.objects where name = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg'),
  null,
  'a colleague cannot replace someone''s photo'
);
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000b');
select lives_ok(
  $$update storage.objects set metadata = '{"x": 1}'
    where name = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg'$$,
  'a person replaces their own photo'
);
reset role;
set local storage.allow_delete_query = 'true';
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000a');
delete from storage.objects where name = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg';
reset role;
select is(
  (select count(*)::int from storage.objects where name = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg'),
  1,
  'a colleague cannot remove someone''s photo'
);
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000b');
delete from storage.objects where name = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg';
reset role;
select is(
  (select count(*)::int from storage.objects where name = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg'),
  0,
  'a person removes their own photo'
);

-- The profile's pointer.
select pg_temp.sign_in('69000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$update public.profiles set avatar_path = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg'
    where id = '69000000-0000-4000-a000-00000000000b'$$,
  '42501', null, 'a person cannot set avatar_path from the browser'
);
reset role;
select lives_ok(
  $$update public.profiles set avatar_path = '69000000-0000-4000-a000-00000000000b/abcdefgh.jpg'
    where id = '69000000-0000-4000-a000-00000000000b'$$,
  'the server sets avatar_path into the person''s folder'
);
select throws_ok(
  $$update public.profiles set avatar_path = '69000000-0000-4000-a000-00000000000a/abcdefgh.jpg'
    where id = '69000000-0000-4000-a000-00000000000b'$$,
  '23514', null, 'avatar_path cannot point into someone else''s folder'
);
select throws_ok(
  $$update public.profiles set avatar_path = '69000000-0000-4000-a000-00000000000b/abcdefgh.gif'
    where id = '69000000-0000-4000-a000-00000000000b'$$,
  '23514', null, 'avatar_path must be a JPEG, PNG or WebP'
);

select * from finish();
rollback;
