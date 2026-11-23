-- Files through the server only (20261127000300_files_server_only.sql): no
-- policy on storage.objects names any bucket, so no session reads a row of
-- chat-files, list-photos or avatars, not even the files it reads through the
-- app (Storage's download, list and signed link all ask under the reader's
-- own RLS), and the server, with the secret key, reads them all; a profile
-- photo shown only while its profile points at it, to the person and their
-- active colleagues (public.sees_profile_photo); the pointer swapped under
-- the row's lock, giving back the photo it replaced (public.set_avatar_path),
-- with the column's check and the demo rule; the avatars a day old that
-- nothing points at, for the daily clean-up (public.expired_avatars), and the
-- daily job asking the app while one is due. Fixed ids of its own, explicit
-- times, and Storage's rows written as the database's owner, as the Storage
-- API would.
begin;
select plan(44);

insert into auth.users (id, aud, role, phone)
values
  ('c1000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500007401'),
  ('c1000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500007402'),
  ('c1000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500007403'),
  ('c1000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500007404'),
  ('c1000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500007405'),
  ('c1000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500007406'),
  ('c1000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500007407');

-- C: 1 Uri the owner, 2 Shiran a manager, 3 Noa and 4 Yoav workers, 5 Dana,
-- who left. 6 of the ConceptApp team views C as its owner. D, a demo business
-- that keeps its people as they are: 7 Moshe its owner.
insert into public.businesses (id, slug, name)
values
  ('c1000000-0000-4000-b000-000000000001', 'storage-only-c', 'Storage only C'),
  ('c1000000-0000-4000-b000-000000000002', 'storage-only-d', 'Storage only D');

insert into public.memberships (business_id, user_id, role, active, created_at)
values
  ('c1000000-0000-4000-b000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'owner', true, '2026-11-01 08:00+00'),
  ('c1000000-0000-4000-b000-000000000001', 'c1000000-0000-4000-a000-000000000002', 'manager', true, '2026-11-01 08:00+00'),
  ('c1000000-0000-4000-b000-000000000001', 'c1000000-0000-4000-a000-000000000003', 'worker', true, '2026-11-01 08:00+00'),
  ('c1000000-0000-4000-b000-000000000001', 'c1000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-01 08:00+00'),
  ('c1000000-0000-4000-b000-000000000001', 'c1000000-0000-4000-a000-000000000005', 'worker', false, '2026-11-01 08:00+00'),
  ('c1000000-0000-4000-b000-000000000002', 'c1000000-0000-4000-a000-000000000007', 'owner', true, '2026-11-01 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('c1000000-0000-4000-b000-000000000001', 'chat', true, '{}'),
  ('c1000000-0000-4000-b000-000000000001', 'lists', true, '{}');

insert into public.platform_staff (user_id, role)
values ('c1000000-0000-4000-a000-000000000006', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('c1000000-0000-4000-a000-000000000006', 'c1000000-0000-4000-b000-000000000001', 'owner');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- What this test put in Storage, by bucket and name.
create temporary table stored (bucket text, name text, primary key (bucket, name)) on commit drop;
grant select on stored to authenticated, anon, service_role;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant select on ids to authenticated, anon, service_role;

-- A file in a bucket, as the Storage API would write it.
create function pg_temp.put(in_bucket text, object_name text, at_time timestamptz)
returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata, created_at)
  values (in_bucket, object_name, jsonb_build_object('size', 1000), at_time);
  insert into stored values (in_bucket, object_name);
$$;
-- How many of them the signed-in role reads.
create function pg_temp.objects() returns integer language sql as $$
  select count(*)::integer
  from storage.objects o
  join stored s on s.bucket = o.bucket_id and s.name = o.name
$$;
create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;

------------------------------------------------------------------------------
-- What there is to read

-- Shiran's picture in the team's group, and Noa's PDF in her private chat
-- with Yoav, written as the server would.
insert into ids
select 'team', c.id from public.chat_conversations c
where c.business_id = 'c1000000-0000-4000-b000-000000000001' and c.kind = 'team';
insert into public.chat_conversations (id, business_id, kind, person_a, person_b)
values ('c1000000-0000-4000-c000-000000000001', 'c1000000-0000-4000-b000-000000000001',
  'direct', 'c1000000-0000-4000-a000-000000000003', 'c1000000-0000-4000-a000-000000000004');
insert into public.chat_messages (business_id, conversation_id, author_id, draft_id,
  file_kind, file_path, thumb_path, file_name, file_size, created_at)
values
  ('c1000000-0000-4000-b000-000000000001', pg_temp.id_of('team'),
   'c1000000-0000-4000-a000-000000000002', gen_random_uuid(), 'image',
   'c1000000-0000-4000-b000-000000000001/' || pg_temp.id_of('team')::text || '/' || md5('team') || '.webp',
   'c1000000-0000-4000-b000-000000000001/' || pg_temp.id_of('team')::text || '/' || md5('team') || '-s.webp',
   null, 42000, '2026-11-05 09:00+00'),
  ('c1000000-0000-4000-b000-000000000001', 'c1000000-0000-4000-c000-000000000001',
   'c1000000-0000-4000-a000-000000000003', gen_random_uuid(), 'pdf',
   'c1000000-0000-4000-b000-000000000001/c1000000-0000-4000-c000-000000000001/' || md5('dm') || '.pdf',
   null, 'Menu.pdf', 5000, '2026-11-05 09:10+00');
select pg_temp.put('chat-files', m.path, '2026-11-05 09:00+00')
from (
  select m.file_path as path from public.chat_messages m
  where m.business_id = 'c1000000-0000-4000-b000-000000000001'
  union all
  select m.thumb_path from public.chat_messages m
  where m.business_id = 'c1000000-0000-4000-b000-000000000001' and m.thumb_path is not null
) m;

-- Shiran sends Noa a list of one photo item, and Noa takes its photo.
insert into ids
select 'list', public.send_list('c1000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-b000-000000000001',
  '{"name": "Door", "items": [{"kind": "photo", "label": "Door"}],
    "recipient": {"kind": "person", "user": "c1000000-0000-4000-a000-000000000003"}}'::jsonb,
  '2026-11-05T07:00:00+02');
select public.set_list_item_photo('c1000000-0000-4000-a000-000000000003',
  (select i.id from public.list_items i where i.list_id = pg_temp.id_of('list')),
  'c1000000-0000-4000-b000-000000000001/' || pg_temp.id_of('list')::text || '/door-1.webp',
  '2026-11-05T08:00:00+02');
select pg_temp.put('list-photos',
  'c1000000-0000-4000-b000-000000000001/' || pg_temp.id_of('list')::text || '/door-1.webp',
  '2026-11-05 06:00+00');

-- Profile photos: Noa's current one and the one it replaced, whose removal
-- failed; Dana's, who left; a file Yoav's save left a few hours ago; a name
-- not in the app's shape and one with its folder in upper case; and one of
-- an account that is no more.
select pg_temp.put('avatars', 'c1000000-0000-4000-a000-000000000003/noacurrent1.webp', '2026-11-18 09:00+00');
select pg_temp.put('avatars', 'c1000000-0000-4000-a000-000000000003/noaoldkey1.webp', '2026-11-18 08:00+00');
select pg_temp.put('avatars', 'c1000000-0000-4000-a000-000000000005/danakey001.webp', '2026-11-18 09:00+00');
select pg_temp.put('avatars', 'c1000000-0000-4000-a000-000000000004/yoavfresh1.webp', '2026-11-20 09:00+00');
select pg_temp.put('avatars', 'zz/abcdefgh.jpg', '2026-11-17 08:00+00');
select pg_temp.put('avatars', 'C1000000-0000-4000-A000-000000000003/upperkey1.webp', '2026-11-17 08:00+00');
select pg_temp.put('avatars', 'c1000000-0000-4000-a000-0000000000ff/nobodykey.webp', '2026-11-17 08:00+00');

update public.profiles p set avatar_path = x.path
from (values
  ('c1000000-0000-4000-a000-000000000003'::uuid, 'c1000000-0000-4000-a000-000000000003/noacurrent1.webp'),
  ('c1000000-0000-4000-a000-000000000004'::uuid, 'c1000000-0000-4000-a000-000000000004/yoavfirst1.webp'),
  ('c1000000-0000-4000-a000-000000000005'::uuid, 'c1000000-0000-4000-a000-000000000005/danakey001.webp'),
  ('c1000000-0000-4000-a000-000000000007'::uuid, 'c1000000-0000-4000-a000-000000000007/moshekey01.webp')
) as x (id, path)
where p.id = x.id;
-- D keeps its people as they are from now on.
insert into private.demo_businesses (business_id, definition)
values ('c1000000-0000-4000-b000-000000000002', '{}');

------------------------------------------------------------------------------
-- No policy, no helper

select ok(
  not exists (
    select 1 from pg_policies p
    where p.schemaname = 'storage'
      and (
        p.policyname in (
          'people read the files of the chat messages they read',
          'people read the photos of the lists they see',
          'people and their colleagues read photos'
        )
        or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
          ~ '''(chat-files|list-photos|avatars|documents)'''
      )
  ),
  'no policy of Storage names chat-files, list-photos, avatars or documents'
);
select ok(
  to_regprocedure('private.can_read_chat_file(text)') is null
  and to_regprocedure('private.can_read_list_photo(text)') is null,
  'and the chat files'' and the list photos'' readers'' checks are gone'
);
select ok(
  not has_function_privilege('authenticated', 'private.avatar_owner(text)', 'execute')
  and not has_function_privilege('anon', 'private.avatar_owner(text)', 'execute'),
  'nobody signed in or not runs private.avatar_owner: only the functions do, as their owner'
);

------------------------------------------------------------------------------
-- No session reads a row of the buckets

select pg_temp.sign_in('c1000000-0000-4000-a000-000000000003');
select is(
  pg_temp.objects()::text
    || ' ' || (select count(*) from public.chat_messages m
               where m.business_id = 'c1000000-0000-4000-b000-000000000001'
                 and m.file_path is not null)::text
    || ' ' || (select count(*) from public.list_items i
               where i.business_id = 'c1000000-0000-4000-b000-000000000001'
                 and i.photo_path is not null)::text,
  '0 2 1',
  'Noa reads the two messages and the list item that point at files, and no row of their buckets: no download, no list and no signed link, which Storage asks under her own RLS'
);
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000004');
select is(pg_temp.objects(), 0, 'nor Yoav, of the private chat and the team''s group');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000002');
select is(pg_temp.objects(), 0, 'nor the manager, who sent the list');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000001');
select is(pg_temp.objects(), 0, 'nor the owner');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000006');
select is(pg_temp.objects(), 0, 'nor the ConceptApp team viewing the business');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000005');
select is(pg_temp.objects(), 0, 'nor Dana, who left, not even her own photo');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000007');
select is(pg_temp.objects(), 0, 'nor another business');
reset role;
set local role anon;
select is(pg_temp.objects(), 0, 'nor an anonymous visitor');
reset role;
set local role service_role;
select is(pg_temp.objects(), 11, 'the server, with the secret key, reads every one of them');
reset role;

------------------------------------------------------------------------------
-- Which profile photo is shown: the current one, to the person and their colleagues

select pg_temp.sign_in('c1000000-0000-4000-a000-000000000003');
select is(public.sees_profile_photo('c1000000-0000-4000-a000-000000000003/noacurrent1.webp'),
  true, 'Noa is shown her own photo');
select is(public.sees_profile_photo('c1000000-0000-4000-a000-000000000003/noaoldkey1.webp'),
  false, 'and not the one it replaced, though its file is still there');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000004');
select is(public.sees_profile_photo('c1000000-0000-4000-a000-000000000003/noacurrent1.webp'),
  true, 'Yoav, her colleague, is shown it');
select is(public.sees_profile_photo('c1000000-0000-4000-a000-000000000003/noaoldkey1.webp'),
  false, 'and not the old one, whatever address he kept');
select is(public.sees_profile_photo('c1000000-0000-4000-a000-000000000005/danakey001.webp'),
  false, 'nor the photo of someone who left');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000005');
select is(public.sees_profile_photo('c1000000-0000-4000-a000-000000000005/danakey001.webp'),
  true, 'who left is still shown their own');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000007');
select is(public.sees_profile_photo('c1000000-0000-4000-a000-000000000003/noacurrent1.webp'),
  false, 'another business is not');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000006');
select is(public.sees_profile_photo('c1000000-0000-4000-a000-000000000003/noacurrent1.webp'),
  false, 'nor the ConceptApp team viewing the business, as before');
select pg_temp.sign_in('c1000000-0000-4000-a000-000000000003');
select ok(
  not public.sees_profile_photo(null)
  and not public.sees_profile_photo(repeat('-', 36))
  and not public.sees_profile_photo(repeat('-', 36) || '/abcdefgh.webp')
  and not public.sees_profile_photo(upper('c1000000-0000-4000-a000-000000000003/noacurrent1.webp')),
  'none, a name of 36 dashes, or one not in lower case is false, not an error'
);
reset role;
select ok(
  has_function_privilege('authenticated', 'public.sees_profile_photo(text)', 'execute')
  and not has_function_privilege('anon', 'public.sees_profile_photo(text)', 'execute'),
  'a signed-in reader asks it under their own session; an anonymous visitor doesn''t'
);

------------------------------------------------------------------------------
-- Pointing a profile at a photo: under its row's lock, giving back the one replaced

set local role service_role;
select is(
  public.set_avatar_path('c1000000-0000-4000-a000-000000000004',
    'c1000000-0000-4000-a000-000000000004/yoavsecond.webp'),
  'c1000000-0000-4000-a000-000000000004/yoavfirst1.webp',
  'the server points a profile at its new photo and is given the one it replaced, to remove'
);
reset role;
select is(
  (select p.avatar_path from public.profiles p where p.id = 'c1000000-0000-4000-a000-000000000004'),
  'c1000000-0000-4000-a000-000000000004/yoavsecond.webp',
  'which the profile points at now'
);
set local role service_role;
select is(
  public.set_avatar_path('c1000000-0000-4000-a000-000000000004',
    'c1000000-0000-4000-a000-000000000004/yoavsecond.webp'),
  null,
  'the same photo again replaces nothing'
);
select is(
  public.set_avatar_path('c1000000-0000-4000-a000-000000000004'),
  'c1000000-0000-4000-a000-000000000004/yoavsecond.webp',
  'clearing gives back the photo it had'
);
reset role;
select is(
  (select p.avatar_path from public.profiles p where p.id = 'c1000000-0000-4000-a000-000000000004'),
  null,
  'and the profile points at none'
);
set local role service_role;
select throws_ok(
  $$select public.set_avatar_path('c1000000-0000-4000-a000-000000000004',
    'c1000000-0000-4000-a000-000000000003/noakey0001.webp')$$,
  '23514', null, 'a photo in someone else''s folder is refused, as the column''s check refuses it'
);
select throws_ok(
  $$select public.set_avatar_path('c1000000-0000-4000-a000-0000000000ee',
    'c1000000-0000-4000-a000-0000000000ee/somekey01.webp')$$,
  'P0002', null, 'and anyone who isn''t there'
);
select throws_ok(
  $$select public.set_avatar_path('c1000000-0000-4000-a000-000000000007',
    'c1000000-0000-4000-a000-000000000007/moshekey02.webp')$$,
  '55000', null, 'a demo business that keeps its people takes no new photo'
);
select lives_ok(
  $$select public.set_avatar_path('c1000000-0000-4000-a000-000000000007')$$,
  'and still clears one'
);
reset role;
select ok(
  has_function_privilege('service_role', 'public.set_avatar_path(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_avatar_path(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.set_avatar_path(uuid, text)', 'execute'),
  'only the server points a profile at a photo'
);

------------------------------------------------------------------------------
-- Profile photos nothing points at, for the daily clean-up

select ok(
  exists (
    select 1 from public.expired_avatars('2026-11-20 12:00+00') e
    where e.path = 'c1000000-0000-4000-a000-000000000003/noaoldkey1.webp'
  ),
  'a photo a day old that no profile points at is due: the one Noa''s replaced'
);
select ok(
  not exists (
    select 1 from public.expired_avatars('2026-11-20 12:00+00') e
    where e.path in ('c1000000-0000-4000-a000-000000000003/noacurrent1.webp',
      'c1000000-0000-4000-a000-000000000005/danakey001.webp')
  ),
  'a current photo never is, however old, someone''s who left included'
);
select ok(
  not exists (
    select 1 from public.expired_avatars('2026-11-20 12:00+00') e
    where e.path = 'c1000000-0000-4000-a000-000000000004/yoavfresh1.webp'
  ),
  'nor one a few hours old, which a save may point at yet'
);
select ok(
  not exists (
    select 1 from public.expired_avatars('2026-11-20 12:00+00') e
    where e.path in ('zz/abcdefgh.jpg', 'C1000000-0000-4000-A000-000000000003/upperkey1.webp')
  ),
  'nor a name the app doesn''t make'
);
select ok(
  exists (
    select 1 from public.expired_avatars('2026-11-20 12:00+00') e
    where e.path = 'c1000000-0000-4000-a000-0000000000ff/nobodykey.webp'
  ),
  'a photo of an account that is no more is due'
);
select results_eq(
  $$select e.path from public.expired_avatars('2026-11-20 12:00+00', 1000) e
    where e.path like 'c1000000-%'$$,
  $$values ('c1000000-0000-4000-a000-0000000000ff/nobodykey.webp'),
    ('c1000000-0000-4000-a000-000000000003/noaoldkey1.webp')$$,
  'oldest first'
);
select is(
  (select count(*)::integer from public.expired_avatars('2026-11-20 12:00+00', 1)),
  1,
  'the clean-up takes them a batch at a time'
);
select ok(
  has_function_privilege('service_role', 'public.expired_avatars(timestamptz, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.expired_avatars(timestamptz, integer)', 'execute')
  and not has_function_privilege('anon', 'public.expired_avatars(timestamptz, integer)', 'execute'),
  'only the server lists them'
);

------------------------------------------------------------------------------
-- The daily job asks the app while a profile photo is due

-- At a time only profile photos are due (the list's photo is kept 90 days):
-- Vault has no app address here, so it asks pg_net for nothing.
select set_config('storage_only.queued',
  (select count(*) from net.http_request_queue)::text, true);
select lives_ok(
  $$select private.list_photos_tick('2026-11-20 12:00+00')$$,
  'the daily job runs while only a profile photo is due'
);
select is(
  (select count(*)::integer from net.http_request_queue),
  current_setting('storage_only.queued')::integer,
  'and calls nothing without the app''s address'
);
do $$
begin
  perform vault.create_secret('http://127.0.0.1:9', 'app_url');
  perform vault.create_secret('a-test-secret-that-never-leaves', 'cron_secret');
exception when others then
  raise notice 'Vault took no secret here: %', sqlerrm;
end;
$$;
select private.list_photos_tick('2026-11-18 07:00+00');
select is(
  (select count(*)::integer from net.http_request_queue),
  current_setting('storage_only.queued')::integer,
  'with both, it asks nothing while nothing is due'
);
select private.list_photos_tick('2026-11-20 12:00+00');
select is(
  (select count(*)::integer from net.http_request_queue),
  current_setting('storage_only.queued')::integer + (
    select case when count(*) = 2 then 1 else 0 end
    from vault.decrypted_secrets v where v.name in ('app_url', 'cron_secret')
  )::integer,
  'and asks the app once a profile photo nothing points at is a day old'
);

select * from finish();
rollback;
