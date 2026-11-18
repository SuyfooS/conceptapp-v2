-- Pictures in chat, and keeping them (C4 of the chat plan,
-- 20261111000500_chat_files.sql): a private bucket only the server writes; a
-- file's place reserved with the sending's own checks, the demo refusal and
-- the project's room; a message sent with its reservation only when it is the
-- sender's, for that conversation, unused, under 2 hours old and in Storage at
-- the size and type reserved; the bucket read by whoever reads the message
-- (a private chat's two people alone, no owner, accountant, view session or
-- other business), never a removed message's file or one no longer kept; the
-- files due to go (by days, by a business's space oldest first, held past
-- their undo, reservations never sent, what nothing points at) and marked when
-- they went, which every reader's sync hears of; the job's file part; and the
-- console's sizes, for the team only.
-- Fixed ids of its own, explicit times, and Storage's rows written as the
-- database's owner, as the Storage API would.
begin;
select plan(61);

insert into auth.users (id, aud, role, phone)
values
  ('89000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004101'),
  ('89000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004102'),
  ('89000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004103'),
  ('89000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004104'),
  ('89000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500004105'),
  ('89000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500004106'),
  ('89000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500004107'),
  ('89000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500004108'),
  ('89000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500004109');

-- F: 1 Uri the owner, 2 Shiran a manager, 3 Noa (kitchen) and 4 Yoav workers,
-- 5 Galit the accountant. The ConceptApp team: 6 views F as an owner, 7 views
-- nothing. G: 8 Moshe its owner. D, a demo: 9 its owner. Each on one staff.
insert into public.businesses (id, slug, name)
values
  ('89000000-0000-4000-b000-000000000001', 'chat-files-f', 'Chat files F'),
  ('89000000-0000-4000-b000-000000000002', 'chat-files-g', 'Chat files G'),
  ('89000000-0000-4000-b000-000000000003', 'chat-files-d', 'Chat files D');

insert into public.memberships (business_id, user_id, role, active, created_at)
values
  ('89000000-0000-4000-b000-000000000001', '89000000-0000-4000-a000-000000000001', 'owner', true, '2026-11-01 08:00+00'),
  ('89000000-0000-4000-b000-000000000001', '89000000-0000-4000-a000-000000000002', 'manager', true, '2026-11-01 08:00+00'),
  ('89000000-0000-4000-b000-000000000001', '89000000-0000-4000-a000-000000000003', 'worker', true, '2026-11-01 08:00+00'),
  ('89000000-0000-4000-b000-000000000001', '89000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-01 08:00+00'),
  ('89000000-0000-4000-b000-000000000001', '89000000-0000-4000-a000-000000000005', 'accountant', true, '2026-11-01 08:00+00'),
  ('89000000-0000-4000-b000-000000000002', '89000000-0000-4000-a000-000000000008', 'owner', true, '2026-11-01 08:00+00'),
  ('89000000-0000-4000-b000-000000000003', '89000000-0000-4000-a000-000000000009', 'owner', true, '2026-11-01 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('89000000-0000-4000-b000-000000000001', 'chat', true, '{}'),
  ('89000000-0000-4000-b000-000000000002', 'chat', true, '{"fileSpaceMb": 50}'),
  ('89000000-0000-4000-b000-000000000003', 'chat', true, '{}');

insert into private.demo_businesses (business_id, definition)
values ('89000000-0000-4000-b000-000000000003', '{"slug": "chat-files-d"}');

insert into public.platform_staff (user_id, role)
values
  ('89000000-0000-4000-a000-000000000006', 'onboarder'),
  ('89000000-0000-4000-a000-000000000007', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('89000000-0000-4000-a000-000000000006', '89000000-0000-4000-b000-000000000001', 'owner');

insert into public.departments (id, business_id, key, name, position)
values ('89000000-0000-4000-d000-000000000001', '89000000-0000-4000-b000-000000000001', 'kitchen', 'Kitchen', 0);
insert into public.department_members (department_id, business_id, user_id, added_at)
values ('89000000-0000-4000-d000-000000000001', '89000000-0000-4000-b000-000000000001',
  '89000000-0000-4000-a000-000000000003', '2026-11-01 08:00+00');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table ups (name text primary key, result jsonb) on commit drop;
create temporary table sent (name text primary key, result jsonb) on commit drop;
grant all on ids, ups, sent to authenticated, anon, service_role;

create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
create function pg_temp.up(saved text, part text) returns text language sql as $$
  select u.result ->> part from ups u where u.name = saved
$$;
-- A reservation's file and thumbnail, by name.
create function pg_temp.paths_of(variadic saved text[]) returns setof text language sql as $$
  select p.path
  from ups u
  cross join lateral (values (u.result ->> 'path'), (u.result ->> 'thumb')) as p (path)
  where u.name = any (saved) and p.path is not null
  order by 1
$$;
-- Reserves a picture of `total` bytes as `actor` in F, kept under `saved`.
create function pg_temp.reserve(saved text, actor uuid, in_conversation uuid, total integer,
  at_time timestamptz, to_person uuid default null, picture_type text default 'image/webp')
returns jsonb language sql as $$
  insert into ups values (saved, public.reserve_chat_upload(actor,
    '89000000-0000-4000-b000-000000000001', 'image', picture_type, total,
    in_conversation, to_person, null, at_time));
  select u.result from ups u where u.name = saved
$$;
-- A file in the bucket, as the Storage API would write it.
create function pg_temp.put(object_name text, bytes integer, mime text, at_time timestamptz)
returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata, created_at)
  values ('chat-files', object_name, jsonb_build_object('size', bytes, 'mimetype', mime), at_time);
$$;
-- A reservation's picture and thumbnail in the bucket.
create function pg_temp.put_both(saved text, full_bytes integer, thumb_bytes integer,
  mime text, at_time timestamptz) returns void language sql as $$
  select pg_temp.put(pg_temp.up(saved, 'path'), full_bytes, mime, at_time);
  select pg_temp.put(pg_temp.up(saved, 'thumb'), thumb_bytes, mime, at_time);
$$;
-- Sends as `actor` in F with the reservation `upload_name`, kept under `saved`.
create function pg_temp.send_file(saved text, actor uuid, in_conversation uuid,
  upload_name text, at_time timestamptz, words text default null) returns uuid
language sql as $$
  insert into sent values (saved, public.send_chat_message(actor,
    '89000000-0000-4000-b000-000000000001', gen_random_uuid(), words, in_conversation,
    null, false, at_time, pg_temp.up(upload_name, 'upload')::uuid));
  insert into ids select saved, (s.result ->> 'message')::uuid from sent s where s.name = saved;
  select i.id from ids i where i.name = saved
$$;
-- The chat-files names the signed-in person reads, of this test's businesses.
create function pg_temp.read_files() returns setof text language sql as $$
  select o.name from storage.objects o
  where o.bucket_id = 'chat-files' and o.name like '89000000-%'
  order by o.name
$$;
-- Whether all of these paths are due at `at_time`.
create function pg_temp.due(at_time timestamptz, variadic wanted text[]) returns boolean
language sql as $$
  select count(*) = cardinality(wanted)
  from public.expired_files(at_time, 1000) e
  where e.path = any (wanted)
$$;
-- Whether none of these is.
create function pg_temp.none_due(at_time timestamptz, variadic wanted text[]) returns boolean
language sql as $$
  select not exists (
    select 1 from public.expired_files(at_time, 1000) e where e.path = any (wanted)
  )
$$;

insert into ids
select 'team', c.id from public.chat_conversations c
where c.business_id = '89000000-0000-4000-b000-000000000001' and c.kind = 'team';
insert into ids
select 'kitchen', c.id from public.chat_conversations c
where c.department_id = '89000000-0000-4000-d000-000000000001';
insert into ids
select 'g-team', c.id from public.chat_conversations c
where c.business_id = '89000000-0000-4000-b000-000000000002' and c.kind = 'team';
insert into ids
select 'd-team', c.id from public.chat_conversations c
where c.business_id = '89000000-0000-4000-b000-000000000003' and c.kind = 'team';

------------------------------------------------------------------------------
-- The bucket, and who may call what

select is(
  (select public::text || ' ' || file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'chat-files'),
  'false 10485760 image/jpeg,image/webp,application/pdf',
  'the chat-files bucket is private, 10 MiB, a JPEG, a WebP or (from C5) a PDF'
);
select ok(
  not has_function_privilege('authenticated',
    'public.reserve_chat_upload(uuid, uuid, text, text, integer, uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.send_chat_message(uuid, uuid, uuid, text, uuid, uuid, boolean, timestamptz, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.chat_files_closed(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.chat_files_closed(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.expired_files(timestamptz, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.forget_files(text[], timestamptz)', 'execute'),
  'browser roles run none of the file functions'
);
select ok(
  has_function_privilege('service_role',
    'public.reserve_chat_upload(uuid, uuid, text, text, integer, uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role',
    'public.send_chat_message(uuid, uuid, uuid, text, uuid, uuid, boolean, timestamptz, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.chat_files_closed(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.expired_files(timestamptz, integer)', 'execute')
  and has_function_privilege('service_role', 'public.forget_files(text[], timestamptz)', 'execute'),
  'the server runs them'
);
select ok(
  has_function_privilege('authenticated', 'private.can_read_chat_file(text)', 'execute')
  and not has_function_privilege('anon', 'private.can_read_chat_file(text)', 'execute'),
  'a signed-in reader runs the storage policy''s helper; an anonymous visitor doesn''t'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000003');
select throws_ok(
  $$select count(*) from private.file_uploads$$,
  '42501', null, 'nobody reads the reservations from the browser'
);
reset role;

------------------------------------------------------------------------------
-- Reserving a file's place

select pg_temp.reserve('k', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('kitchen'),
  42000, '2026-11-05 09:00+00');
select ok(
  pg_temp.up('k', 'path') ~ ('^89000000-0000-4000-b000-000000000001/' || pg_temp.id_of('kitchen')::text
      || '/[0-9a-f]{32}\.webp$')
  and pg_temp.up('k', 'thumb') = replace(pg_temp.up('k', 'path'), '.webp', '-s.webp')
  and pg_temp.up('k', 'conversation')::uuid = pg_temp.id_of('kitchen'),
  'a picture''s place is in its conversation''s folder, under a random key, its thumbnail beside it'
);
select pg_temp.reserve('dm', '89000000-0000-4000-a000-000000000003', null, 42000,
  '2026-11-05 09:10+00', '89000000-0000-4000-a000-000000000004');
insert into ids values ('dm-chat', pg_temp.up('dm', 'conversation')::uuid);
select is(
  (select c.kind || '/' || (c.person_a < c.person_b)::text from public.chat_conversations c
   where c.id = pg_temp.id_of('dm-chat')),
  'direct/true',
  'a picture to someone opens their private chat, as a first message does'
);
select throws_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000003',
    '89000000-0000-4000-b000-000000000001', 'image', 'image/png', 42000,
    pg_temp.id_of('kitchen'), at_time => '2026-11-05 09:00+00')$$,
  '22023', null, 'a picture is a JPEG or a WebP'
);
select throws_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000003',
    '89000000-0000-4000-b000-000000000001', 'image', 'image/webp', 458753,
    pg_temp.id_of('kitchen'), at_time => '2026-11-05 09:00+00')$$,
  '22023', null, 'and with its thumbnail at most 448 KB'
);
select throws_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000003',
    '89000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 42000,
    pg_temp.id_of('kitchen'), upload_name => '../menu.pdf', at_time => '2026-11-05 09:00+00')$$,
  '22023', null, 'a file''s name names no folder'
);
select throws_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000005',
    '89000000-0000-4000-b000-000000000001', 'image', 'image/webp', 42000,
    pg_temp.id_of('team'), at_time => '2026-11-05 09:00+00')$$,
  '42501', null, 'the accountant, off the staff, sends no file'
);
select throws_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000004',
    '89000000-0000-4000-b000-000000000001', 'image', 'image/webp', 42000,
    pg_temp.id_of('kitchen'), at_time => '2026-11-05 09:00+00')$$,
  'P0002', null, 'nor anyone into a group they are not in'
);
select throws_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000009',
    '89000000-0000-4000-b000-000000000003', 'image', 'image/webp', 42000,
    pg_temp.id_of('d-team'), at_time => '2026-11-05 09:00+00')$$,
  '55000', null, 'a demo business takes no files'
);
update private.demo_businesses set definition = '{"slug": "chat-files-d", "chatFiles": true}'
where business_id = '89000000-0000-4000-b000-000000000003';
select lives_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000009',
    '89000000-0000-4000-b000-000000000003', 'image', 'image/webp', 42000,
    pg_temp.id_of('d-team'), at_time => '2026-11-05 09:00+00')$$,
  'unless its definition says "chatFiles": true'
);
update private.demo_businesses set definition = '{"slug": "chat-files-d"}'
where business_id = '89000000-0000-4000-b000-000000000003';

-- The project's Storage full: a file of 1 GiB, as postgres.
select pg_temp.put('zz-guard/full.bin', 1073741824, 'image/webp', '2026-11-05 08:00+00');
select throws_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000003',
    '89000000-0000-4000-b000-000000000001', 'image', 'image/webp', 42000,
    pg_temp.id_of('kitchen'), at_time => '2026-11-05 09:00+00')$$,
  '54000', null, 'once the project''s Storage holds 900 MB, no file is taken'
);
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'chat-files' and name = 'zz-guard/full.bin';

-- Shiran's burst, dated before every other reservation here, so none of
-- them falls in its minute.
select count(public.reserve_chat_upload('89000000-0000-4000-a000-000000000002',
  '89000000-0000-4000-b000-000000000001', 'image', 'image/webp', 42000, pg_temp.id_of('team'),
  at_time => '2026-11-04 10:00:00+00'::timestamptz + g * interval '1 second'))
from generate_series(1, 30) as g;
select throws_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000002',
    '89000000-0000-4000-b000-000000000001', 'image', 'image/webp', 42000,
    pg_temp.id_of('team'), at_time => '2026-11-04 10:00:45+00')$$,
  '54000', null, 'the 31st file in a minute waits'
);
select lives_ok(
  $$select public.reserve_chat_upload('89000000-0000-4000-a000-000000000002',
    '89000000-0000-4000-b000-000000000001', 'image', 'image/webp', 42000,
    pg_temp.id_of('team'), at_time => '2026-11-04 09:59:50+00')$$,
  'the minute is the one before the file: reservations stamped after it count for nothing'
);

------------------------------------------------------------------------------
-- Sending with a file

select throws_ok(
  $$select pg_temp.send_file('k-early', '89000000-0000-4000-a000-000000000003',
    pg_temp.id_of('kitchen'), 'k', '2026-11-05 09:01+00')$$,
  '22023', null, 'a file not in place yet is not sent'
);
select pg_temp.put_both('k', 40000, 2000, 'image/webp', '2026-11-05 09:00+00');
select pg_temp.put_both('dm', 40000, 2000, 'image/webp', '2026-11-05 09:10+00');
select throws_ok(
  $$select pg_temp.send_file('dm-theirs', '89000000-0000-4000-a000-000000000004',
    pg_temp.id_of('dm-chat'), 'dm', '2026-11-05 09:11+00')$$,
  '22023', null, 'nobody sends someone else''s file'
);
select pg_temp.reserve('x-folder', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('team'),
  42000, '2026-11-05 09:02+00');
select pg_temp.put_both('x-folder', 40000, 2000, 'image/webp', '2026-11-05 09:02+00');
select throws_ok(
  $$select pg_temp.send_file('x-folder', '89000000-0000-4000-a000-000000000003',
    pg_temp.id_of('kitchen'), 'x-folder', '2026-11-05 09:03+00')$$,
  '22023', null, 'nor a file into another conversation than its folder''s'
);
select pg_temp.reserve('x-size', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('kitchen'),
  42000, '2026-11-05 09:02+00');
select pg_temp.put_both('x-size', 40000, 1000, 'image/webp', '2026-11-05 09:02+00');
select throws_ok(
  $$select pg_temp.send_file('x-size', '89000000-0000-4000-a000-000000000003',
    pg_temp.id_of('kitchen'), 'x-size', '2026-11-05 09:03+00')$$,
  '22023', null, 'nor one whose files in Storage are not the size reserved'
);
select pg_temp.reserve('x-type', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('kitchen'),
  42000, '2026-11-05 09:02+00');
select pg_temp.put_both('x-type', 40000, 2000, 'image/jpeg', '2026-11-05 09:02+00');
select throws_ok(
  $$select pg_temp.send_file('x-type', '89000000-0000-4000-a000-000000000003',
    pg_temp.id_of('kitchen'), 'x-type', '2026-11-05 09:03+00')$$,
  '22023', null, 'nor the type reserved'
);
select pg_temp.reserve('x-old', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('kitchen'),
  42000, '2026-11-05 06:00+00');
select pg_temp.put_both('x-old', 40000, 2000, 'image/webp', '2026-11-05 06:00+00');
select throws_ok(
  $$select pg_temp.send_file('x-old', '89000000-0000-4000-a000-000000000003',
    pg_temp.id_of('kitchen'), 'x-old', '2026-11-05 08:01+00')$$,
  '22023', null, 'nor one reserved more than 2 hours before'
);

select pg_temp.send_file('k', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('kitchen'),
  'k', '2026-11-05 09:01+00');
select is(
  (select m.file_kind || '|' || m.file_path || '|' || m.thumb_path || '|' || m.file_size
     || '|' || coalesce(m.body, '-') || '|' || (u.used_at is not null)::text
   from public.chat_messages m
   join private.file_uploads u on u.path = m.file_path
   where m.id = pg_temp.id_of('k')),
  'image|' || pg_temp.up('k', 'path') || '|' || pg_temp.up('k', 'thumb') || '|42000|-|true',
  'a picture goes with no words, its file and thumbnail its message''s, and its place used'
);
select throws_ok(
  $$select pg_temp.send_file('k-again', '89000000-0000-4000-a000-000000000003',
    pg_temp.id_of('kitchen'), 'k', '2026-11-05 09:02+00')$$,
  '22023', null, 'a file is sent once'
);
select pg_temp.reserve('k-retry', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('kitchen'),
  42000, '2026-11-05 09:02+00');
select pg_temp.put_both('k-retry', 40000, 2000, 'image/webp', '2026-11-05 09:02+00');
select is(
  public.send_chat_message('89000000-0000-4000-a000-000000000003',
    '89000000-0000-4000-b000-000000000001',
    (select m.draft_id from public.chat_messages m where m.id = pg_temp.id_of('k')),
    null, pg_temp.id_of('kitchen'), at_time => '2026-11-05 09:02+00',
    upload => pg_temp.up('k-retry', 'upload')::uuid),
  jsonb_build_object('conversation', pg_temp.id_of('kitchen'), 'message', pg_temp.id_of('k'),
    'attached', false),
  'its draft sent again gives back the same message, and says the new file was not attached'
);

select pg_temp.send_file('dm', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('dm-chat'),
  'dm', '2026-11-05 09:11+00');
select pg_temp.reserve('t', '89000000-0000-4000-a000-000000000002', pg_temp.id_of('team'),
  42000, '2026-11-05 09:20+00');
select pg_temp.put_both('t', 40000, 2000, 'image/webp', '2026-11-05 09:20+00');
select pg_temp.send_file('t', '89000000-0000-4000-a000-000000000002', pg_temp.id_of('team'),
  't', '2026-11-05 09:21+00', 'The new menu');
select pg_temp.reserve('g', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('kitchen'),
  42000, '2026-11-05 09:30+00');
select pg_temp.put_both('g', 40000, 2000, 'image/webp', '2026-11-05 09:30+00');
select pg_temp.send_file('g', '89000000-0000-4000-a000-000000000003', pg_temp.id_of('kitchen'),
  'g', '2026-11-05 09:30+00');

select throws_ok(
  $$insert into public.chat_messages (business_id, conversation_id, author_id, draft_id,
      file_kind, file_path, thumb_path, file_size)
    values ('89000000-0000-4000-b000-000000000003', pg_temp.id_of('d-team'),
      '89000000-0000-4000-a000-000000000009', gen_random_uuid(), 'image',
      '89000000-0000-4000-b000-000000000003/' || pg_temp.id_of('d-team')::text || '/' || md5('d') || '.webp',
      '89000000-0000-4000-b000-000000000003/' || pg_temp.id_of('d-team')::text || '/' || md5('d') || '-s.webp',
      42000)$$,
  '55000', null, 'the database refuses a file in a demo business, whoever writes it'
);

------------------------------------------------------------------------------
-- Reading: whoever reads the message, and nobody else

-- Noa removes her second picture, and the bucket holds a file nothing points
-- at, put there before all this.
select public.remove_chat_message('89000000-0000-4000-a000-000000000003',
  pg_temp.id_of('g'), '2026-11-05 09:31+00');
insert into ups values ('orphan', jsonb_build_object('path',
  '89000000-0000-4000-b000-000000000001/' || pg_temp.id_of('kitchen')::text || '/' || md5('orphan') || '.webp'));
select pg_temp.put(pg_temp.up('orphan', 'path'), 5000, 'image/webp', '2026-11-04 08:00+00');

select pg_temp.sign_in('89000000-0000-4000-a000-000000000003');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.paths_of('k', 'dm', 't')$$,
  'Noa reads the pictures of her kitchen, her private chat and the team, never a removed one or what nothing points at'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000004');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.paths_of('dm', 't')$$,
  'Yoav reads their private chat''s and the team''s, not the kitchen''s'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000002');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.paths_of('k', 't')$$,
  'a manager reads the groups'', never the private chat''s'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000001');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.paths_of('k', 't')$$,
  'nor does the owner'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000005');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'the accountant reads none'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000006');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'nor the team viewing the business as its owner'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000008');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'nor another business'
);
reset role;
set local role anon;
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'chat-files'), 0,
  'nor an anonymous visitor'
);
reset role;

select public.restore_chat_message('89000000-0000-4000-a000-000000000003',
  pg_temp.id_of('g'), '2026-11-05 09:35+00');
select pg_temp.sign_in('89000000-0000-4000-a000-000000000003');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.paths_of('k', 'dm', 't', 'g')$$,
  'put back, a picture is read again'
);
reset role;
select public.remove_chat_message('89000000-0000-4000-a000-000000000003',
  pg_temp.id_of('g'), '2026-11-05 09:36+00');

select ok(
  not private.can_read_chat_file(repeat('-', 36) || '/' || repeat('-', 36) || '/' || repeat('a', 32) || '.webp')
  and not private.can_read_chat_file(null)
  and not private.can_read_chat_file(upper(pg_temp.up('k', 'path'))),
  'a name of 36 dashes, none, or one not in lower case is false, not an error'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000003');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('chat-files', '89000000-0000-4000-b000-000000000001/' || pg_temp.id_of('kitchen')::text
      || '/' || md5('mine') || '.webp')$$,
  '42501', null, 'the browser uploads no file, not even into a conversation it reads'
);
select is(
  (select p.file_path || '|' || p.thumb_path
   from public.chat_page('89000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen')) p
   where p.id = pg_temp.id_of('k')),
  pg_temp.up('k', 'path') || '|' || pg_temp.up('k', 'thumb'),
  'a page gives its reader a message''s file and thumbnail'
);
reset role;

------------------------------------------------------------------------------
-- Keeping files

select private.clean_chat('2026-11-05 10:00+00');
select is(
  (select count(*)::integer from private.chat_removed h where h.message_id = pg_temp.id_of('g')),
  1,
  'past its undo, a removed message''s holding waits for its files to go'
);
select ok(
  pg_temp.due('2026-11-05 09:47+00', variadic array(select pg_temp.paths_of('g')))
  and pg_temp.none_due('2026-11-05 09:45+00', variadic array(select pg_temp.paths_of('g'))),
  'a removed message''s files are due once its 10 minutes of undo are over'
);
select ok(
  pg_temp.due('2026-11-06 09:03+00', variadic array(select pg_temp.paths_of('x-size')))
  and pg_temp.none_due('2026-11-06 09:01+00', variadic array(select pg_temp.paths_of('x-size'))),
  'a file reserved and never sent is due after a day'
);
select ok(
  pg_temp.due('2026-11-05 09:00+00', pg_temp.up('orphan', 'path'))
  and pg_temp.none_due('2026-11-05 07:00+00', pg_temp.up('orphan', 'path')),
  'a file nothing points at is due once a day old'
);
select ok(
  pg_temp.none_due('2027-02-02 09:00+00', variadic array(select pg_temp.paths_of('k', 'dm', 't')))
  and pg_temp.due('2027-02-04 09:00+00', variadic array(select pg_temp.paths_of('k', 'dm', 't'))),
  'a picture is kept 90 days, then its file and thumbnail are due'
);
update public.business_modules set settings = '{"fileDays": 30}'
where business_id = '89000000-0000-4000-b000-000000000001' and module_key = 'chat';
select ok(
  pg_temp.due('2026-12-06 09:00+00', variadic array(select pg_temp.paths_of('k')))
  and pg_temp.none_due('2026-12-04 09:00+00', variadic array(select pg_temp.paths_of('k'))),
  'the team keeps a business''s files 30 days'
);
update public.business_modules set settings = '{}'
where business_id = '89000000-0000-4000-b000-000000000001' and module_key = 'chat';

-- G keeps 50 MB: seven pictures of 10 MiB each, an hour apart.
insert into public.chat_messages (business_id, conversation_id, author_id, draft_id,
  file_kind, file_path, thumb_path, file_size, created_at)
select '89000000-0000-4000-b000-000000000002', pg_temp.id_of('g-team'),
  '89000000-0000-4000-a000-000000000008', gen_random_uuid(), 'image',
  '89000000-0000-4000-b000-000000000002/' || pg_temp.id_of('g-team')::text || '/' || md5('g' || n) || '.webp',
  '89000000-0000-4000-b000-000000000002/' || pg_temp.id_of('g-team')::text || '/' || md5('g' || n) || '-s.webp',
  10485760, '2026-11-05 00:00+00'::timestamptz + n * interval '1 hour'
from generate_series(1, 7) as n;
select results_eq(
  $$select e.path from public.expired_files('2026-11-06 12:00+00', 1000) e
    where e.path like '89000000-0000-4000-b000-000000000002/%'$$,
  $$values
    ('89000000-0000-4000-b000-000000000002/' || pg_temp.id_of('g-team')::text || '/' || md5('g1') || '-s.webp'),
    ('89000000-0000-4000-b000-000000000002/' || pg_temp.id_of('g-team')::text || '/' || md5('g1') || '.webp'),
    ('89000000-0000-4000-b000-000000000002/' || pg_temp.id_of('g-team')::text || '/' || md5('g2') || '-s.webp'),
    ('89000000-0000-4000-b000-000000000002/' || pg_temp.id_of('g-team')::text || '/' || md5('g2') || '.webp')$$,
  'past a business''s space its oldest files go first, a day old, each thumbnail before its picture'
);
select is(
  (select count(*)::integer from public.expired_files('2026-11-06 12:00+00', 1)),
  1,
  'the clean-up takes them a batch at a time'
);

-- The app removes what it was given from Storage first, then marks it.
create function pg_temp.remove_files(variadic saved text[]) returns void language sql as $$
  delete from storage.objects o
  where o.bucket_id = 'chat-files' and o.name in (select pg_temp.paths_of(variadic saved));
$$;

-- What Noa's sync holds of the kitchen, before and after its picture goes:
-- her list's version and the conversation's own stamp (C3's `cv`).
create temporary table marks (step text primary key, v text) on commit drop;
grant all on marks to authenticated;
create function pg_temp.keep_marks(step_name text) returns void language sql as $$
  select pg_temp.sign_in('89000000-0000-4000-a000-000000000003');
  insert into marks
  values (step_name, public.chat_version('89000000-0000-4000-b000-000000000001'));
  insert into marks
  values (step_name || '-stamp', (
    select s.changed::text
    from public.chat_stamp('89000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen')) s
  ));
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.mark_at(step_name text) returns text language sql as $$
  select x.v from marks x where x.step = step_name
$$;

select pg_temp.remove_files('k');
select pg_temp.keep_marks('kept');
select is(
  public.forget_files(array(select pg_temp.paths_of('k')), '2027-02-04 09:00+00'),
  1,
  'the clean-up marks the picture it removed'
);
select pg_temp.keep_marks('forgotten');
select isnt(pg_temp.mark_at('forgotten'), pg_temp.mark_at('kept'),
  'and the sync''s version of everyone who reads its conversation moves');
select isnt(pg_temp.mark_at('forgotten-stamp'), pg_temp.mark_at('kept-stamp'),
  'and so does the conversation''s stamp, so a screen open on it shows the file is gone');
select is(
  (select m.file_path || '|' || (m.file_removed_at = '2027-02-04 09:00+00'::timestamptz)::text
     || '|' || (m.removed_at is null)::text
   from public.chat_messages m where m.id = pg_temp.id_of('k')),
  pg_temp.up('k', 'path') || '|true|true',
  'the message stays, and says its file is no longer kept'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000003');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.paths_of('dm', 't')$$,
  'nobody reads a file no longer kept'
);
reset role;
select ok(
  pg_temp.none_due('2027-02-04 09:00+00', variadic array(select pg_temp.paths_of('k'))),
  'and it is not due again'
);
select pg_temp.remove_files('g', 'x-size');
select is(
  public.forget_files(array(select pg_temp.paths_of('g')), '2026-11-05 09:47+00'),
  1,
  'the clean-up lets go of a removed message''s files'
);
select is(
  (select count(*)::integer from private.chat_removed h where h.message_id = pg_temp.id_of('g')),
  0,
  'and its holding goes with them'
);
select public.forget_files(array(select pg_temp.paths_of('x-size')), '2026-11-06 09:03+00');
select is(
  (select count(*)::integer from private.file_uploads u where u.path = pg_temp.up('x-size', 'path')),
  0,
  'a place reserved and never sent goes with its files'
);

-- The job, at a time a file is due: Vault has no app address here, so it
-- asks pg_net for nothing.
select set_config('chat_files.queued',
  (select count(*) from net.http_request_queue)::text, true);
select lives_ok(
  $$select private.chat_tick('2027-03-01 09:00+00')$$,
  'the job runs while a file is due'
);
select is(
  (select count(*)::integer from net.http_request_queue),
  current_setting('chat_files.queued')::integer,
  'and calls nothing without the app''s address'
);
select is(
  (select count(*)::integer from private.file_uploads u
   where u.path in (pg_temp.up('k', 'path'), pg_temp.up('t', 'path'))),
  0,
  'and lets go of the places sent more than a day before, whose messages hold the files'
);

------------------------------------------------------------------------------
-- The console: sizes only, for the team only

-- What F's folder holds, read as the database's owner.
select set_config('chat_files.f_bytes',
  (select sum((o.metadata ->> 'size')::bigint) from storage.objects o
   where o.bucket_id = 'chat-files' and o.name like '89000000-0000-4000-b000-000000000001/%')::text,
  true);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.admin_storage()$$,
  '42501', null, 'an owner reads no storage numbers'
);
select pg_temp.sign_in('89000000-0000-4000-a000-000000000007');
select ok(
  (
    select (b.value ->> 'chat_bytes')::bigint = current_setting('chat_files.f_bytes')::bigint
      and (b.value ->> 'chat_cap_bytes')::bigint = 104857600
      and (b.value ->> 'document_cap_bytes')::bigint = 52428800
    from jsonb_array_elements(public.admin_storage() -> 'businesses') b
    where b.value ->> 'business' = '89000000-0000-4000-b000-000000000001'
  )
  and (
    select (b.value ->> 'chat_cap_bytes')::bigint = 0 and not (b.value ->> 'files_open')::boolean
    from jsonb_array_elements(public.admin_storage() -> 'businesses') b
    where b.value ->> 'business' = '89000000-0000-4000-b000-000000000003'
  )
  and exists (
    select 1 from jsonb_array_elements(public.admin_storage() -> 'buckets') k
    where k.value ->> 'bucket' = 'chat-files'
  )
  and (public.admin_storage() ->> 'guard_bytes')::bigint = 943718400
  and (public.admin_storage() ->> 'database_bytes')::bigint > 0,
  'the team reads each business''s chat space and caps (none for a demo that takes no files), Storage per bucket and the database''s size'
);
reset role;

select * from finish();
rollback;
