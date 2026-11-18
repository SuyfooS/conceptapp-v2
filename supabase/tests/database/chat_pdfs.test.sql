-- PDFs in chat (C5 of the chat plan, 20261111000600_chat_pdfs.sql on top of
-- C4's 20261111000500_chat_files.sql): a PDF's place reserved up to 10 MiB,
-- as application/pdf, its name ending in .pdf, never in a demo business; the
-- server told where a person's own place is (public.chat_upload_place) and
-- nobody else's; a PDF sent only when Storage holds it as application/pdf at
-- the size reserved; read by whoever reads its message (a private chat's two
-- people alone, no owner, manager, accountant, view session or other
-- business), never once removed; the list's file name, and a private chat
-- with nothing in it yet listed for neither of its two; at most 10 PDF places
-- unsent from the last day a person, of those that hold a file or may still
-- be given one; a business's PDFs of the last 10 minutes within its space;
-- the project's guard counting the places on their way; which PDF paths a
-- signed upload may still write, for the clean-up's tombstones; and an unsent
-- place due after a day. Fixed ids of its own, explicit times, and Storage's
-- rows written as the database's owner, as the Storage API would. (A
-- person's reservations are counted under an advisory lock, so ones sent at
-- once all meet the counts; one transaction can't show that here, and
-- tooling/chat-pdfs.test.ts checks the lock comes before the counts.)
begin;
select plan(52);

insert into auth.users (id, aud, role, phone)
values
  ('8a000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004301'),
  ('8a000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004302'),
  ('8a000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004303'),
  ('8a000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004304'),
  ('8a000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500004305'),
  ('8a000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500004306'),
  ('8a000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500004307'),
  ('8a000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500004308');

-- P: 1 Uri the owner, 2 Shiran a manager, 3 Noa and 4 Yoav workers, 5 Galit
-- the accountant; 6 of the ConceptApp team views P as its owner. Q: 7 its
-- owner. D, a demo: 8 its owner. Each on one staff.
insert into public.businesses (id, slug, name)
values
  ('8a000000-0000-4000-b000-000000000001', 'chat-pdfs-p', 'Chat PDFs P'),
  ('8a000000-0000-4000-b000-000000000002', 'chat-pdfs-q', 'Chat PDFs Q'),
  ('8a000000-0000-4000-b000-000000000003', 'chat-pdfs-d', 'Chat PDFs D');

insert into public.memberships (business_id, user_id, role, active, created_at)
values
  ('8a000000-0000-4000-b000-000000000001', '8a000000-0000-4000-a000-000000000001', 'owner', true, '2026-11-01 08:00+00'),
  ('8a000000-0000-4000-b000-000000000001', '8a000000-0000-4000-a000-000000000002', 'manager', true, '2026-11-01 08:00+00'),
  ('8a000000-0000-4000-b000-000000000001', '8a000000-0000-4000-a000-000000000003', 'worker', true, '2026-11-01 08:00+00'),
  ('8a000000-0000-4000-b000-000000000001', '8a000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-01 08:00+00'),
  ('8a000000-0000-4000-b000-000000000001', '8a000000-0000-4000-a000-000000000005', 'accountant', true, '2026-11-01 08:00+00'),
  ('8a000000-0000-4000-b000-000000000002', '8a000000-0000-4000-a000-000000000007', 'owner', true, '2026-11-01 08:00+00'),
  ('8a000000-0000-4000-b000-000000000003', '8a000000-0000-4000-a000-000000000008', 'owner', true, '2026-11-01 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('8a000000-0000-4000-b000-000000000001', 'chat', true, '{}'),
  ('8a000000-0000-4000-b000-000000000002', 'chat', true, '{}'),
  ('8a000000-0000-4000-b000-000000000003', 'chat', true, '{}');

insert into private.demo_businesses (business_id, definition)
values ('8a000000-0000-4000-b000-000000000003', '{"slug": "chat-pdfs-d"}');

insert into public.platform_staff (user_id, role)
values ('8a000000-0000-4000-a000-000000000006', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('8a000000-0000-4000-a000-000000000006', '8a000000-0000-4000-b000-000000000001', 'owner');

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
-- Reserves a PDF of `total` bytes as `actor` in P, kept under `saved`.
create function pg_temp.reserve_pdf(saved text, actor uuid, in_conversation uuid, total integer,
  at_time timestamptz, to_person uuid default null, pdf_name text default 'Menu 2026.pdf')
returns jsonb language sql as $$
  insert into ups values (saved, public.reserve_chat_upload(actor,
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', total,
    in_conversation, to_person, pdf_name, at_time));
  select u.result from ups u where u.name = saved
$$;
-- A reservation's file in the bucket, as the Storage API would write it.
create function pg_temp.put(saved text, bytes integer, mime text, at_time timestamptz)
returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata, created_at)
  values ('chat-files', pg_temp.up(saved, 'path'),
    jsonb_build_object('size', bytes, 'mimetype', mime), at_time);
$$;
-- Sends as `actor` in P with the reservation `upload_name`, kept under `saved`.
create function pg_temp.send_file(saved text, actor uuid, in_conversation uuid,
  upload_name text, at_time timestamptz, words text default null) returns uuid
language sql as $$
  insert into sent values (saved, public.send_chat_message(actor,
    '8a000000-0000-4000-b000-000000000001', gen_random_uuid(), words, in_conversation,
    null, false, at_time, pg_temp.up(upload_name, 'upload')::uuid));
  insert into ids select saved, (s.result ->> 'message')::uuid from sent s where s.name = saved;
  select i.id from ids i where i.name = saved
$$;
-- The chat-files names the signed-in person reads, of this test's businesses.
create function pg_temp.read_files() returns setof text language sql as $$
  select o.name from storage.objects o
  where o.bucket_id = 'chat-files' and o.name like '8a000000-%'
  order by o.name
$$;
-- How a statement was refused: its code and hint, or 'none'.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  told text;
begin
  execute statement;
  return 'none';
exception when others then
  get stacked diagnostics code = returned_sqlstate, told = pg_exception_hint;
  return code || '/' || coalesce(nullif(told, ''), '-');
end;
$$;
-- Whether all of these paths are due at `at_time`, or none of them.
create function pg_temp.due(at_time timestamptz, variadic wanted text[]) returns boolean
language sql as $$
  select count(*) = cardinality(wanted)
  from public.expired_files(at_time, 1000) e
  where e.path = any (wanted)
$$;
create function pg_temp.none_due(at_time timestamptz, variadic wanted text[]) returns boolean
language sql as $$
  select not exists (
    select 1 from public.expired_files(at_time, 1000) e where e.path = any (wanted)
  )
$$;

insert into ids
select 'team', c.id from public.chat_conversations c
where c.business_id = '8a000000-0000-4000-b000-000000000001' and c.kind = 'team';
insert into ids
select 'd-team', c.id from public.chat_conversations c
where c.business_id = '8a000000-0000-4000-b000-000000000003' and c.kind = 'team';
insert into ids
select 'q-team', c.id from public.chat_conversations c
where c.business_id = '8a000000-0000-4000-b000-000000000002' and c.kind = 'team';

------------------------------------------------------------------------------
-- Who may call what

select ok(
  has_function_privilege('service_role',
    'public.chat_upload_place(uuid, uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.chat_upload_place(uuid, uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon',
    'public.chat_upload_place(uuid, uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role',
    'public.chat_paths_signed(text[], timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.chat_paths_signed(text[], timestamptz)', 'execute')
  and not has_function_privilege('anon',
    'public.chat_paths_signed(text[], timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'private.stored_bytes(text, text)', 'execute')
  and not has_function_privilege('authenticated',
    'private.uploads_on_their_way(timestamptz)', 'execute'),
  'only the server asks where a place is and which a signed upload may still write, and nobody else what a place holds'
);
select ok(
  has_function_privilege('service_role',
    'public.reserve_chat_upload(uuid, uuid, text, text, integer, uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.reserve_chat_upload(uuid, uuid, text, text, integer, uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.chat_inbox(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.chat_inbox(uuid)', 'execute'),
  'reserving is still the server''s, and the list the signed-in person''s'
);

------------------------------------------------------------------------------
-- Reserving a PDF's place

select pg_temp.reserve_pdf('dm', '8a000000-0000-4000-a000-000000000003', null, 10485760,
  '2026-11-06 09:00+00', '8a000000-0000-4000-a000-000000000004');
insert into ids values ('dm-chat', pg_temp.up('dm', 'conversation')::uuid);
select ok(
  pg_temp.up('dm', 'path') ~ ('^8a000000-0000-4000-b000-000000000001/' || pg_temp.id_of('dm-chat')::text
      || '/[0-9a-f]{32}\.pdf$')
  and pg_temp.up('dm', 'thumb') is null
  and (select c.kind from public.chat_conversations c where c.id = pg_temp.id_of('dm-chat')) = 'direct',
  'a PDF of 10 MiB to someone opens their private chat, its place a .pdf in its folder, with no thumbnail'
);
select throws_ok(
  $$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 10485761,
    pg_temp.id_of('team'), upload_name => 'big.pdf', at_time => '2026-11-06 09:01+00')$$,
  '22023', null, 'a PDF is at most 10 MiB'
);
select throws_ok(
  $$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'image/webp', 5000,
    pg_temp.id_of('team'), upload_name => 'menu.pdf', at_time => '2026-11-06 09:01+00')$$,
  '22023', null, 'a PDF is application/pdf'
);
select throws_ok(
  $$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'image', 'application/pdf', 5000,
    pg_temp.id_of('team'), at_time => '2026-11-06 09:01+00')$$,
  '22023', null, 'and a picture is never one'
);
select throws_ok(
  $$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 5000,
    pg_temp.id_of('team'), upload_name => 'menu.html', at_time => '2026-11-06 09:01+00')$$,
  '22023', null, 'a PDF''s name ends in .pdf'
);
select lives_ok(
  $$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 5000,
    pg_temp.id_of('team'), upload_name => 'Menu.PDF', at_time => '2026-11-06 09:01+00')$$,
  'in any case'
);
select throws_ok(
  $$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000008',
    '8a000000-0000-4000-b000-000000000003', 'pdf', 'application/pdf', 5000,
    pg_temp.id_of('d-team'), upload_name => 'menu.pdf', at_time => '2026-11-06 09:01+00')$$,
  '55000', null, 'a demo business takes no PDF'
);
select throws_ok(
  $$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000005',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 5000,
    pg_temp.id_of('team'), upload_name => 'menu.pdf', at_time => '2026-11-06 09:01+00')$$,
  '42501', null, 'nor the accountant, off the staff'
);

------------------------------------------------------------------------------
-- Where a place is: for the server, its owner's only

select is(
  public.chat_upload_place('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', pg_temp.up('dm', 'upload')::uuid,
    '2026-11-06 09:05+00') - 'upload',
  jsonb_build_object('path', pg_temp.up('dm', 'path'), 'conversation', pg_temp.up('dm', 'conversation'),
    'kind', 'pdf', 'size', 10485760, 'name', 'Menu 2026.pdf', 'used', false, 'fresh', true),
  'the server learns where its sender''s place is: its path, conversation, kind, size and name, not sent, in its time'
);
select ok(
  public.chat_upload_place('8a000000-0000-4000-a000-000000000004',
    '8a000000-0000-4000-b000-000000000001', pg_temp.up('dm', 'upload')::uuid,
    '2026-11-06 09:05+00') is null
  and public.chat_upload_place('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000002', pg_temp.up('dm', 'upload')::uuid,
    '2026-11-06 09:05+00') is null
  and public.chat_upload_place('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', gen_random_uuid(), '2026-11-06 09:05+00') is null,
  'and nothing of a place that is someone else''s, in another business, or none'
);
select is(
  public.chat_upload_place('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', pg_temp.up('dm', 'upload')::uuid,
    '2026-11-06 11:01+00') ->> 'fresh',
  'false',
  'a place is good for 2 hours, as its signed upload'
);

------------------------------------------------------------------------------
-- Sending a PDF

select throws_ok(
  $$select pg_temp.send_file('dm-early', '8a000000-0000-4000-a000-000000000003',
    pg_temp.id_of('dm-chat'), 'dm', '2026-11-06 09:06+00')$$,
  '22023', null, 'a PDF not in Storage yet is not sent'
);
select pg_temp.reserve_pdf('x-type', '8a000000-0000-4000-a000-000000000003', pg_temp.id_of('team'),
  5000, '2026-11-06 09:02+00');
select pg_temp.put('x-type', 5000, 'text/html', '2026-11-06 09:02+00');
select throws_ok(
  $$select pg_temp.send_file('x-type', '8a000000-0000-4000-a000-000000000003',
    pg_temp.id_of('team'), 'x-type', '2026-11-06 09:03+00')$$,
  '22023', null, 'nor one Storage holds as anything but application/pdf'
);
select pg_temp.reserve_pdf('x-size', '8a000000-0000-4000-a000-000000000003', pg_temp.id_of('team'),
  5000, '2026-11-06 09:03+00');
select pg_temp.put('x-size', 6000, 'application/pdf', '2026-11-06 09:03+00');
select throws_ok(
  $$select pg_temp.send_file('x-size', '8a000000-0000-4000-a000-000000000003',
    pg_temp.id_of('team'), 'x-size', '2026-11-06 09:04+00')$$,
  '22023', null, 'nor one of another size than reserved'
);
select throws_ok(
  $$select pg_temp.send_file('x-theirs', '8a000000-0000-4000-a000-000000000004',
    pg_temp.id_of('dm-chat'), 'dm', '2026-11-06 09:06+00')$$,
  '22023', null, 'nor someone else''s'
);

select pg_temp.put('dm', 10485760, 'application/pdf', '2026-11-06 09:08+00');
select pg_temp.send_file('dm', '8a000000-0000-4000-a000-000000000003', pg_temp.id_of('dm-chat'),
  'dm', '2026-11-06 09:10+00', 'The new menu');
select is(
  (select m.file_kind || '|' || m.file_path || '|' || coalesce(m.thumb_path, '-') || '|' || m.file_name
     || '|' || m.file_size || '|' || m.body
   from public.chat_messages m where m.id = pg_temp.id_of('dm')),
  'pdf|' || pg_temp.up('dm', 'path') || '|-|Menu 2026.pdf|10485760|The new menu',
  'a PDF of 10 MiB goes with its words, its name and size, and no thumbnail'
);
select is(
  public.chat_upload_place('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', pg_temp.up('dm', 'upload')::uuid,
    '2026-11-06 09:11+00') ->> 'used',
  'true',
  'and its place says it was sent, so a retry never removes its file'
);

select pg_temp.sign_in('8a000000-0000-4000-a000-000000000003');
select is(
  (select p.file_kind || '|' || p.file_name || '|' || p.file_size || '|' || p.file_path
   from public.chat_page('8a000000-0000-4000-b000-000000000001', pg_temp.id_of('dm-chat')) p
   where p.id = pg_temp.id_of('dm')),
  'pdf|Menu 2026.pdf|10485760|' || pg_temp.up('dm', 'path'),
  'a page gives its reader the PDF''s name, size and file'
);
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000004');
select is(
  (select i.last_file_kind || '|' || i.last_file_name || '|' || i.last_preview
   from public.chat_inbox('8a000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('dm-chat')),
  'pdf|Menu 2026.pdf|The new menu',
  'the list gives the last message''s file name, with its kind and words'
);
reset role;

------------------------------------------------------------------------------
-- Reading: whoever reads the message, and nobody else

select pg_temp.sign_in('8a000000-0000-4000-a000-000000000003');
select results_eq(
  'select pg_temp.read_files()',
  $$values (pg_temp.up('dm', 'path'))$$,
  'Noa reads the PDF she sent, and none of the files she put and never sent'
);
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000004');
select results_eq(
  'select pg_temp.read_files()',
  $$values (pg_temp.up('dm', 'path'))$$,
  'Yoav reads the PDF of their private chat'
);
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'the owner reads none of it'
);
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'nor the manager'
);
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000005');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'nor the accountant'
);
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000006');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'nor the team viewing the business as its owner'
);
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000007');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'nor another business'
);
reset role;

select public.remove_chat_message('8a000000-0000-4000-a000-000000000003',
  pg_temp.id_of('dm'), '2026-11-06 09:30+00');
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000004');
select is(
  (select count(*)::integer from pg_temp.read_files()), 0,
  'removed, the PDF is read by nobody at once'
);
select is(
  (select coalesce(i.last_file_kind, '-') || '|' || coalesce(i.last_file_name, '-')
   from public.chat_inbox('8a000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('dm-chat')),
  '-|-',
  'and the list no longer names it'
);
reset role;

------------------------------------------------------------------------------
-- The list: a private chat with nothing in it yet

-- Uri starts a PDF to Yoav, which opens their private chat, and sends nothing.
select pg_temp.reserve_pdf('owner-dm', '8a000000-0000-4000-a000-000000000001', null, 5000,
  '2026-11-06 09:20+00', '8a000000-0000-4000-a000-000000000004');
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000004');
select is(
  (select count(*)::integer from public.chat_inbox('8a000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.up('owner-dm', 'conversation')::uuid),
  0,
  'a private chat a PDF opened, with nothing sent in it, is not in the other person''s list'
);
select pg_temp.sign_in('8a000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::integer from public.chat_inbox('8a000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.up('owner-dm', 'conversation')::uuid),
  0,
  'nor in the list of the one who opened it, who reaches it from the person''s page'
);
reset role;

------------------------------------------------------------------------------
-- PDFs waiting to be sent: at most 10 a person from the last day

-- Shiran's ten, an hour apart, the last 14 hours before noon on the 7th, each
-- with its file in Storage.
select count(pg_temp.reserve_pdf('s' || g, '8a000000-0000-4000-a000-000000000002',
  pg_temp.id_of('team'), 1000, '2026-11-07 12:00+00'::timestamptz - (24 - g) * interval '1 hour'))
from generate_series(1, 10) as g;
insert into storage.objects (bucket_id, name, metadata, created_at)
select 'chat-files', pg_temp.up('s' || g, 'path'),
  jsonb_build_object('size', 1000, 'mimetype', 'application/pdf'),
  '2026-11-07 12:00+00'::timestamptz - (24 - g) * interval '1 hour'
from generate_series(1, 10) as g;
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000002',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'eleventh.pdf', at_time => '2026-11-07 12:00+00')$$),
  '54000/pdfs',
  'with 10 PDF places unsent from the last day, each holding its file, an 11th waits'
);
select lives_ok(
  $$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000002',
    '8a000000-0000-4000-b000-000000000001', 'image', 'image/webp', 42000,
    pg_temp.id_of('team'), at_time => '2026-11-07 12:00+00')$$,
  'a picture still goes: the server put its files itself'
);
select pg_temp.send_file('s10', '8a000000-0000-4000-a000-000000000002', pg_temp.id_of('team'),
  's10', '2026-11-06 22:30+00');
select lives_ok(
  $$select pg_temp.reserve_pdf('s11', '8a000000-0000-4000-a000-000000000002',
    pg_temp.id_of('team'), 1000, '2026-11-07 12:00+00')$$,
  'one of them sent, another PDF goes'
);
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000002',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'twelfth.pdf', at_time => '2026-11-07 13:00:01+00')$$),
  'none',
  'and once the oldest is a day old, it counts no more'
);
select ok(
  pg_temp.due('2026-11-07 09:04+00', pg_temp.up('x-size', 'path'))
  and pg_temp.none_due('2026-11-07 09:02+00', pg_temp.up('x-size', 'path')),
  'a PDF put in place and never sent is due a day after its place was reserved'
);

------------------------------------------------------------------------------
-- Only places that hold a file, or may still be given one, count

-- Uri's ten, 11 minutes apart from 08:11 on the 8th, nothing in them yet.
select count(pg_temp.reserve_pdf('u' || g, '8a000000-0000-4000-a000-000000000001',
  pg_temp.id_of('team'), 1000, '2026-11-08 08:00+00'::timestamptz + g * interval '11 minutes'))
from generate_series(1, 10) as g;
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000001',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'u-a.pdf', at_time => '2026-11-08 10:00+00')$$),
  '54000/pdfs',
  'ten places whose signed uploads may still write count, with nothing in them yet'
);
-- Two of them stopped: the server's tombstone, one byte, at each.
select pg_temp.put('u1', 1, 'application/pdf', '2026-11-08 09:55+00');
select pg_temp.put('u2', 1, 'application/pdf', '2026-11-08 09:55+00');
select is(
  pg_temp.refusal($$select pg_temp.reserve_pdf('u-b', '8a000000-0000-4000-a000-000000000001',
    pg_temp.id_of('team'), 1000, '2026-11-08 10:00+00')$$),
  'none',
  'a place let go holds the server''s tombstone and counts no more: another goes'
);
select pg_temp.reserve_pdf('u-c', '8a000000-0000-4000-a000-000000000001',
  pg_temp.id_of('team'), 1000, '2026-11-08 10:01+00');
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000001',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'u-d.pdf', at_time => '2026-11-08 10:02+00')$$),
  '54000/pdfs',
  'and with ten that may still be written to again, the next waits'
);
-- u3 (08:33) gets nothing; u4 (08:44) gets its file.
select pg_temp.put('u4', 1000, 'application/pdf', '2026-11-08 08:50+00');
select is(
  pg_temp.refusal($$select pg_temp.reserve_pdf('u-e', '8a000000-0000-4000-a000-000000000001',
    pg_temp.id_of('team'), 1000, '2026-11-08 10:40+00')$$),
  'none',
  'a place whose signed upload is over (2 hours and 5 minutes on) with nothing in it counts no more'
);
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000001',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'u-f.pdf', at_time => '2026-11-08 10:50+00')$$),
  '54000/pdfs',
  'while one past its hours with its file in it still does'
);

------------------------------------------------------------------------------
-- A business's PDFs of the last 10 minutes, within its space

-- Yoav's ten of 10 MiB in the team's group, a second apart, put and sent.
select count(pg_temp.reserve_pdf('y' || g, '8a000000-0000-4000-a000-000000000004',
  pg_temp.id_of('team'), 10485760, '2026-11-09 08:00:00+00'::timestamptz + g * interval '1 second'))
from generate_series(1, 10) as g;
insert into storage.objects (bucket_id, name, metadata, created_at)
select 'chat-files', pg_temp.up('y' || g, 'path'),
  jsonb_build_object('size', 10485760, 'mimetype', 'application/pdf'),
  '2026-11-09 08:00:20+00'
from generate_series(1, 10) as g;
select count(pg_temp.send_file('y' || g, '8a000000-0000-4000-a000-000000000004',
  pg_temp.id_of('team'), 'y' || g, '2026-11-09 08:00:30+00'::timestamptz + g * interval '1 second'))
from generate_series(1, 10) as g;
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000004',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'y-a.pdf', at_time => '2026-11-09 08:01+00')$$),
  '54000/busy',
  'with the business''s PDFs of the last 10 minutes, sent, bringing its 100 MB, the next waits, whatever its size'
);
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'n-a.pdf', at_time => '2026-11-09 08:02+00')$$),
  '54000/busy',
  'for anyone in the business'
);
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000007',
    '8a000000-0000-4000-b000-000000000002', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('q-team'), upload_name => 'q-a.pdf', at_time => '2026-11-09 08:02+00')$$),
  'none',
  'while another business''s PDFs go'
);
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000004',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'y-b.pdf', at_time => '2026-11-09 08:10:30+00')$$),
  'none',
  'and 10 minutes on, the business''s go again'
);

------------------------------------------------------------------------------
-- The project's guard, with the places on their way

-- Storage 15 MiB under the guard, at noon on the 10th, nothing on its way.
insert into storage.objects (bucket_id, name, metadata, created_at)
select 'chat-files', 'zz-guard/filler.bin',
  jsonb_build_object('size', private.files_guard_bytes() - private.storage_used() - 15728640,
    'mimetype', 'image/webp'),
  '2026-11-10 08:00+00';
select is(
  pg_temp.refusal($$select pg_temp.reserve_pdf('k1', '8a000000-0000-4000-a000-000000000003',
    pg_temp.id_of('team'), 1000, '2026-11-10 09:00+00')$$),
  'none',
  'with room for the 10 MiB its signed upload may bring, a PDF goes'
);
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'k2.pdf', at_time => '2026-11-10 09:01+00')$$),
  '54000/storage',
  'with that one on its way, counted for as much, the next waits, whatever its size'
);
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'image', 'image/webp', 42000,
    pg_temp.id_of('team'), at_time => '2026-11-10 09:01+00')$$),
  'none',
  'a picture, which the server uploads itself, counts its own size'
);
select pg_temp.put('k1', 1000, 'application/pdf', '2026-11-10 09:01:30+00');
select is(
  pg_temp.refusal($$select public.reserve_chat_upload('8a000000-0000-4000-a000-000000000003',
    '8a000000-0000-4000-b000-000000000001', 'pdf', 'application/pdf', 1000,
    pg_temp.id_of('team'), upload_name => 'k3.pdf', at_time => '2026-11-10 09:02+00')$$),
  'none',
  'and once its file is in Storage, a place counts what it holds'
);

------------------------------------------------------------------------------
-- Letting a place go: which a signed upload may still write

select is(
  public.chat_paths_signed(
    array[pg_temp.up('x-size', 'path'), pg_temp.up('dm', 'path'), pg_temp.up('dm', 'path') || 'x'],
    '2026-11-06 11:00+00'),
  (select array_agg(p order by p)
   from unnest(array[pg_temp.up('dm', 'path'), pg_temp.up('x-size', 'path')]) p),
  'the clean-up learns which PDFs a signed upload may still write: under 2 hours and 5 minutes old, sent or not'
);
select is(
  public.chat_paths_signed(
    array[pg_temp.up('x-size', 'path'), pg_temp.up('dm', 'path')], '2026-11-06 11:10+00'),
  '{}'::text[],
  'and none once their uploads are over'
);

select * from finish();
rollback;
