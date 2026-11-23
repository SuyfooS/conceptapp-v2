-- How full a business's spaces are, for its own people
-- (20261127000100_bigger_teams.sql): public.file_space(actor, business) gives
-- the documents' bytes as their refusal counts them (a file still kept, never
-- one whose file is gone), the chat files' bytes as the console counts them
-- (the business's own folder of chat-files only), and both spaces as the
-- team set them; to an owner, a manager, the accountant and someone given
-- the management page alone (who sends no documents), never to a worker,
-- someone who left or another business's owner; the secret key's
-- alone. A demo that takes no files, and a business with chat off, take
-- none. The console's public.admin_storage() gives each business's
-- documents' bytes the same way. Fixed ids (f11e5ace…) and numbers
-- (050-073-xxxx) of its own, explicit times, and Storage's rows written as
-- the database's owner, as the Storage API would.
begin;
select plan(18);

-- F: 1 the owner, 2 a manager, 3 a worker, 4 the accountant, 5 a worker who
-- left, 9 a worker given manage.view alone. G: 6 its owner. H, a demo that
-- takes no files: 7 its owner. 8 on the ConceptApp team.
insert into auth.users (id, aud, role, phone)
select ('f11e5ace-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250073' || lpad(n::text, 4, '0')
from generate_series(1, 9) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('f11e5ace-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.f() returns uuid language sql as $$
  select 'f11e5ace-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.g() returns uuid language sql as $$
  select 'f11e5ace-0000-4000-b000-000000000002'::uuid
$$;
create function pg_temp.h() returns uuid language sql as $$
  select 'f11e5ace-0000-4000-b000-000000000003'::uuid
$$;
-- What `actor` reads of `business` at `field`.
create function pg_temp.space(actor integer, business uuid, field text) returns text
language sql as $$
  select public.file_space(pg_temp.p(actor), business) ->> field
$$;
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.f(), 'file-space-f', 'File space F'),
  (pg_temp.g(), 'file-space-g', 'File space G'),
  (pg_temp.h(), 'file-space-h', 'File space H');
insert into public.memberships (business_id, user_id, role, active, created_at)
values
  (pg_temp.f(), pg_temp.p(1), 'owner', true, '2026-11-01 08:00+00'),
  (pg_temp.f(), pg_temp.p(2), 'manager', true, '2026-11-01 08:00+00'),
  (pg_temp.f(), pg_temp.p(3), 'worker', true, '2026-11-01 08:00+00'),
  (pg_temp.f(), pg_temp.p(4), 'accountant', true, '2026-11-01 08:00+00'),
  (pg_temp.f(), pg_temp.p(5), 'worker', false, '2026-11-01 08:00+00'),
  (pg_temp.g(), pg_temp.p(6), 'owner', true, '2026-11-01 08:00+00'),
  (pg_temp.h(), pg_temp.p(7), 'owner', true, '2026-11-01 08:00+00');
-- The management page without sending documents: a worker holds neither
-- chat.send_documents nor clock.payroll (the office) by default.
insert into public.memberships (business_id, user_id, role, active, perms, created_at)
values (pg_temp.f(), pg_temp.p(9), 'worker', true, '{manage.view}', '2026-11-01 08:00+00');
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.f(), 'chat', true, '{}'),
  (pg_temp.g(), 'chat', true, '{}'),
  (pg_temp.h(), 'chat', true, '{}');
insert into private.demo_businesses (business_id, definition)
values (pg_temp.h(), '{"slug": "file-space-h"}');
insert into public.platform_staff (user_id, role)
values (pg_temp.p(8), 'onboarder');

-- F's documents: three files still kept (100, 200 and 300 KB) and one whose
-- file is gone (its size counts no more).
insert into public.documents (
  business_id, direction, person_id, author_id, category, title, file_kind,
  file_path, file_name, file_size, sent_at, removed_at, removed_by,
  removed_reason, file_gone_after
)
values
  (pg_temp.f(), 'from_person', pg_temp.p(3), pg_temp.p(3), 'sick_note', 'A note', 'image',
   'f11e5ace-0000-4000-b000-000000000001/one.webp', 'one.webp', 100000,
   '2026-11-02 08:00+00', null, null, null, null),
  (pg_temp.f(), 'from_person', pg_temp.p(3), pg_temp.p(3), 'form', 'A form', 'pdf',
   'f11e5ace-0000-4000-b000-000000000001/two.pdf', 'two.pdf', 200000,
   '2026-11-02 08:00+00', null, null, null, null),
  (pg_temp.f(), 'from_person', pg_temp.p(3), pg_temp.p(3), 'other', 'Another', 'pdf',
   'f11e5ace-0000-4000-b000-000000000001/three.pdf', 'three.pdf', 300000,
   '2026-11-02 08:00+00', null, null, null, null),
  (pg_temp.f(), 'from_person', pg_temp.p(3), pg_temp.p(3), 'form', 'Gone', null,
   null, 'gone.pdf', 777777,
   '2026-11-02 08:00+00', '2026-11-02 09:00+00', pg_temp.p(1), 'wrong_file',
   '2026-11-02 09:10+00');

-- Chat files: two in F's folder, one in G's, and a document's file in its
-- own bucket, which is no chat file.
insert into storage.objects (bucket_id, name, metadata, created_at)
values
  ('chat-files', 'f11e5ace-0000-4000-b000-000000000001/c/one.webp',
   '{"size": 1048576, "mimetype": "image/webp"}', '2026-11-02 08:00+00'),
  ('chat-files', 'f11e5ace-0000-4000-b000-000000000001/c/one.thumb.webp',
   '{"size": 4096, "mimetype": "image/webp"}', '2026-11-02 08:00+00'),
  ('chat-files', 'f11e5ace-0000-4000-b000-000000000002/c/big.webp',
   '{"size": 9999999, "mimetype": "image/webp"}', '2026-11-02 08:00+00'),
  ('documents', 'f11e5ace-0000-4000-b000-000000000001/one.webp',
   '{"size": 100000, "mimetype": "image/webp"}', '2026-11-02 08:00+00');

------------------------------------------------------------------------------
-- The owner reads both spaces

select is(pg_temp.space(1, pg_temp.f(), 'document_bytes')::bigint, 600000::bigint,
  'the documents hold what their three kept files do, not the one gone');
select is(pg_temp.space(1, pg_temp.f(), 'document_space_bytes')::bigint, 52428800::bigint,
  'beside 50 MB for documents by default');
select is(pg_temp.space(1, pg_temp.f(), 'chat_bytes')::bigint, 1052672::bigint,
  'the chat files are its own folder''s, as the console counts them');
select is(pg_temp.space(1, pg_temp.f(), 'chat_space_bytes')::bigint, 104857600::bigint,
  'beside 100 MB for chat files by default');
select is(pg_temp.space(1, pg_temp.f(), 'files_open')::boolean, true,
  'and the business takes files');

update public.business_modules
set settings = '{"documentSpaceMb": 200, "fileSpaceMb": 50}'
where business_id = pg_temp.f() and module_key = 'chat';
select is(pg_temp.space(1, pg_temp.f(), 'document_space_bytes')::bigint, 209715200::bigint,
  'the space for documents is the team''s choice');
select is(pg_temp.space(1, pg_temp.f(), 'chat_space_bytes')::bigint, 52428800::bigint,
  'and so is the space for chat files');

------------------------------------------------------------------------------
-- Who reads it

select is(pg_temp.space(2, pg_temp.f(), 'document_bytes')::bigint, 600000::bigint,
  'a manager, who sees the management page, reads it');
select is(pg_temp.space(9, pg_temp.f(), 'document_bytes')::bigint, 600000::bigint,
  'and so does someone given the management page alone, who sends no documents');
select is(pg_temp.space(4, pg_temp.f(), 'document_bytes')::bigint, 600000::bigint,
  'and the accountant, who sends payslips');
select throws_ok(
  $$select public.file_space(pg_temp.p(3), pg_temp.f())$$,
  '42501', 'Not one who sees the business''s files', 'a worker reads none of it'
);
select throws_ok(
  $$select public.file_space(pg_temp.p(5), pg_temp.f())$$,
  '42501', 'Not one who sees the business''s files', 'nor someone who left'
);
select throws_ok(
  $$select public.file_space(pg_temp.p(6), pg_temp.f())$$,
  '42501', 'Not one who sees the business''s files', 'nor another business''s owner'
);
select is(pg_temp.space(7, pg_temp.h(), 'files_open')::boolean, false,
  'a demo that takes no files takes none');
select ok(
  not has_function_privilege('authenticated', 'public.file_space(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.file_space(uuid, uuid)', 'execute'),
  'no session calls it'
);
select ok(
  has_function_privilege('service_role', 'public.file_space(uuid, uuid)', 'execute'),
  'the server does, with the secret key'
);

------------------------------------------------------------------------------
-- The console counts the documents the same way

select pg_temp.sign_in(pg_temp.p(8));
select is(
  (select (b.value ->> 'document_bytes')::bigint
   from jsonb_array_elements(public.admin_storage() -> 'businesses') b
   where b.value ->> 'business' = 'f11e5ace-0000-4000-b000-000000000001'),
  600000::bigint,
  'the team reads each business''s documents'' bytes, as their refusal counts them'
);
reset role;

update public.business_modules
set enabled = false
where business_id = pg_temp.f() and module_key = 'chat';
select is(pg_temp.space(1, pg_temp.f(), 'files_open')::boolean, false,
  'with chat off, the business takes no files');

select * from finish();
rollback;
