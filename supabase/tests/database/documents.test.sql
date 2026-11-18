-- Official documents (C6 of the chat plan, 20261111000700_documents.sql): a
-- private bucket only the server writes; a document's place reserved with the
-- sending's own checks, the business's space and the project's 980 MB; who
-- sends which category which way; who reads what (a worker's document by its
-- person and the office alone: never a manager without pay access, a view
-- session as any role, the ConceptApp team or another business; one to people
-- by its recipients, its sender and the office; a former worker their own);
-- opening (marked once, logged once a day per reader, never one's own),
-- confirming (a recipient asked to, once), removing the file (its sender in
-- 10 minutes, then the office with a reason from the list) and putting it
-- back (the remover, in 10 minutes, asking again whoever it still waits
-- for), the job's part, the bucket read by the server alone (from
-- 20261111000900_documents_server_only.sql: no policy, so no session reads a
-- file, and nothing is served of a removed one), the log's rows for the
-- office alone, lines with no category settled as they should be (losing pay
-- access too, and a push not sent yet with them), a sender who leaves, the
-- demo's rules (a closed demo and one opened to files), the limits (30 a
-- minute, a demo's 100 an hour, 10 PDFs waiting) with the hints the server
-- tells them apart by, and nothing deleting a document but the purge. Fixed
-- ids of its own, explicit times, and Storage's rows written as the
-- database's owner, as the Storage API would.
begin;
select plan(163);

insert into auth.users (id, aud, role, phone)
values
  ('8b000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004501'),
  ('8b000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004502'),
  ('8b000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004503'),
  ('8b000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004504'),
  ('8b000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500004505'),
  ('8b000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500004506'),
  ('8b000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500004507'),
  ('8b000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500004508'),
  ('8b000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500004509'),
  ('8b000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500004510'),
  ('8b000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500004511'),
  ('8b000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500004512'),
  ('8b000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500004513'),
  ('8b000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500004514'),
  ('8b000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500004515'),
  ('8b000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500004516'),
  ('8b000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated', '972500004517');

-- R: 1 Uri the owner, 2 Shiran a manager without pay access (who leaves near
-- the end), 3 Noa and 4 Yoav workers, 5 Galit the accountant (of S too), 6
-- Rina a worker who leaves. S: 7 Michal the owner, 8 Omer a manager whose role
-- holds pay access, 9 Tamar a worker. D, a demo: e Dana its owner, f Dor a
-- worker. E, a demo opened to files ("chatFiles": true, as the local seed's
-- restaurant): 10 Eli its owner, 11 Eden a worker. The ConceptApp team: a
-- views R as an owner, b as a manager, c as an accountant, d views nothing.
-- Each on one staff.
insert into public.businesses (id, slug, name)
values
  ('8b000000-0000-4000-b000-000000000001', 'documents-r', 'Documents R'),
  ('8b000000-0000-4000-b000-000000000002', 'documents-s', 'Documents S'),
  ('8b000000-0000-4000-b000-000000000003', 'documents-d', 'Documents D'),
  ('8b000000-0000-4000-b000-000000000004', 'documents-e', 'Documents E');

insert into public.memberships (business_id, user_id, role, active, created_at)
values
  ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-a000-000000000001', 'owner', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-a000-000000000002', 'manager', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-a000-000000000003', 'worker', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-a000-000000000005', 'accountant', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-a000-000000000006', 'worker', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000002', '8b000000-0000-4000-a000-000000000007', 'owner', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000002', '8b000000-0000-4000-a000-000000000008', 'manager', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000002', '8b000000-0000-4000-a000-000000000009', 'worker', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000002', '8b000000-0000-4000-a000-000000000005', 'accountant', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000003', '8b000000-0000-4000-a000-00000000000e', 'owner', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000003', '8b000000-0000-4000-a000-00000000000f', 'worker', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000004', '8b000000-0000-4000-a000-000000000010', 'owner', true, '2026-11-01 08:00+00'),
  ('8b000000-0000-4000-b000-000000000004', '8b000000-0000-4000-a000-000000000011', 'worker', true, '2026-11-01 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('8b000000-0000-4000-b000-000000000001', 'chat', true, '{}'),
  ('8b000000-0000-4000-b000-000000000002', 'chat', true, '{}'),
  ('8b000000-0000-4000-b000-000000000003', 'chat', true, '{}'),
  ('8b000000-0000-4000-b000-000000000004', 'chat', true, '{}'),
  ('8b000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('8b000000-0000-4000-b000-000000000002', 'notifications', true, '{}'),
  ('8b000000-0000-4000-b000-000000000003', 'notifications', true, '{}'),
  ('8b000000-0000-4000-b000-000000000004', 'notifications', true, '{}');

insert into public.role_permissions (business_id, role, perm)
values ('8b000000-0000-4000-b000-000000000002', 'manager', 'clock.payroll');

insert into private.demo_businesses (business_id, definition)
values
  ('8b000000-0000-4000-b000-000000000003', '{"slug": "documents-d"}'),
  ('8b000000-0000-4000-b000-000000000004', '{"slug": "documents-e", "chatFiles": true}');

-- A phone for Omer (S) and for Dana (D, a demo), as the app saves them.
insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select p.id, 'https://fcm.googleapis.com/fcm/send/documents-' || p.n::text,
  md5('documents-a-' || p.n::text) || md5('documents-b-' || p.n::text),
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from (values
  ('8b000000-0000-4000-a000-000000000008'::uuid, 8),
  ('8b000000-0000-4000-a000-00000000000e'::uuid, 14)
) as p (id, n);

insert into public.platform_staff (user_id, role)
values
  ('8b000000-0000-4000-a000-00000000000a', 'onboarder'),
  ('8b000000-0000-4000-a000-00000000000b', 'onboarder'),
  ('8b000000-0000-4000-a000-00000000000c', 'onboarder'),
  ('8b000000-0000-4000-a000-00000000000d', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('8b000000-0000-4000-a000-00000000000a', '8b000000-0000-4000-b000-000000000001', 'owner'),
  ('8b000000-0000-4000-a000-00000000000b', '8b000000-0000-4000-b000-000000000001', 'manager'),
  ('8b000000-0000-4000-a000-00000000000c', '8b000000-0000-4000-b000-000000000001', 'accountant');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.biz_r() returns uuid language sql as $$
  select '8b000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.biz_s() returns uuid language sql as $$
  select '8b000000-0000-4000-b000-000000000002'::uuid
$$;
create function pg_temp.biz_d() returns uuid language sql as $$
  select '8b000000-0000-4000-b000-000000000003'::uuid
$$;
create function pg_temp.biz_e() returns uuid language sql as $$
  select '8b000000-0000-4000-b000-000000000004'::uuid
$$;
-- How `statement` is refused, as the server reads it: code/hint (- for none)
-- and the message (chat_pdfs.test.sql's, with the message too), or 'none'.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  told text;
  said text;
begin
  execute statement;
  return 'none';
exception when others then
  get stacked diagnostics code = returned_sqlstate, told = pg_exception_hint, said = message_text;
  return code || '/' || coalesce(nullif(told, ''), '-') || ' ' || said;
end;
$$;

create temporary table who (name text primary key, id uuid) on commit drop;
create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table ups (name text primary key, result jsonb) on commit drop;
grant all on who, ids, ups to authenticated, anon, service_role;

insert into who values
  ('uri', '8b000000-0000-4000-a000-000000000001'),
  ('shiran', '8b000000-0000-4000-a000-000000000002'),
  ('noa', '8b000000-0000-4000-a000-000000000003'),
  ('yoav', '8b000000-0000-4000-a000-000000000004'),
  ('galit', '8b000000-0000-4000-a000-000000000005'),
  ('rina', '8b000000-0000-4000-a000-000000000006'),
  ('michal', '8b000000-0000-4000-a000-000000000007'),
  ('omer', '8b000000-0000-4000-a000-000000000008'),
  ('tamar', '8b000000-0000-4000-a000-000000000009'),
  ('dana', '8b000000-0000-4000-a000-00000000000e'),
  ('dor', '8b000000-0000-4000-a000-00000000000f'),
  ('eli', '8b000000-0000-4000-a000-000000000010'),
  ('eden', '8b000000-0000-4000-a000-000000000011');

create function pg_temp.person(called text) returns uuid language sql as $$
  select w.id from who w where w.name = called
$$;
create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
create function pg_temp.up(saved text, part text) returns text language sql as $$
  select u.result ->> part from ups u where u.name = saved
$$;
-- Reserves a place as `actor`, kept under `saved`: a PDF unless said.
create function pg_temp.reserve(saved text, actor text, business uuid, direction text,
  bytes integer, at_time timestamptz, kind text default 'pdf',
  mime text default 'application/pdf')
returns jsonb language sql as $$
  insert into ups values (saved, public.reserve_document_upload(pg_temp.person(actor), business,
    direction, kind, mime, bytes, case when kind = 'pdf' then 'document.pdf' end, at_time));
  select u.result from ups u where u.name = saved
$$;
-- A file in the documents bucket, as the Storage API would write it.
create function pg_temp.put(object_name text, bytes bigint, mime text, at_time timestamptz)
returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata, created_at)
  values ('documents', object_name, jsonb_build_object('size', bytes, 'mimetype', mime), at_time);
$$;
-- Sends as `actor` with the place `upload_of`, kept under `saved`.
create function pg_temp.send(saved text, actor text, business uuid, direction text,
  category text, upload_of text, people text[], asks boolean, at_time timestamptz)
returns uuid language sql as $$
  insert into ids values (saved, public.send_document(pg_temp.person(actor), business, direction,
    category, 'A title', null,
    (select array_agg(pg_temp.person(p.called)) from unnest(people) as p (called)),
    asks, pg_temp.up(upload_of, 'upload')::uuid, null, at_time));
  select i.id from ids i where i.name = saved
$$;
-- A PDF of 50000 bytes reserved, put in place and sent, under `saved`.
create function pg_temp.file_doc(saved text, actor text, business uuid, direction text,
  category text, people text[], asks boolean, at_time timestamptz)
returns uuid language sql as $$
  select pg_temp.reserve(saved, actor, business, direction, 50000, at_time);
  select pg_temp.put(pg_temp.up(saved, 'path'), 50000, 'application/pdf', at_time);
  select pg_temp.send(saved, actor, business, direction, category, saved, people, asks, at_time);
$$;
-- The test's documents the signed-in person reads, by name.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(i.name, ',' order by i.name collate "C"), '')
  from ids i join public.documents d on d.id = i.id
$$;
-- The recipients' marks the signed-in person reads, as document:person.
create function pg_temp.marks() returns text language sql as $$
  select coalesce(string_agg(i.name || ':' || w.name, ','
    order by i.name collate "C", w.name collate "C"), '')
  from public.document_recipients r
  join ids i on i.id = r.document_id
  join who w on w.id = r.person_id
$$;
-- The files of the documents bucket the signed-in person reads, by the name
-- of their place.
create function pg_temp.files() returns text language sql as $$
  select coalesce(string_agg(u.name, ',' order by u.name collate "C"), '')
  from ups u
  join storage.objects o on o.bucket_id = 'documents' and o.name = u.result ->> 'path'
$$;
-- How many of the log's rows about documents in R and S the signed-in person reads.
create function pg_temp.log_rows() returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.action ~ '^document\.'
    and a.business_id in ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-b000-000000000002')
$$;
-- The lines about a document, as person:kind:still open.
create function pg_temp.lines(saved text) returns text language sql as $$
  select coalesce(string_agg(w.name || ':' || n.kind || ':' || (n.resolved_at is null)::text, ','
    order by w.name collate "C"), '')
  from public.notifications n
  join who w on w.id = n.user_id
  where n.dedupe_key = 'documents.' || pg_temp.id_of(saved)::text
$$;

------------------------------------------------------------------------------
-- The bucket, and who may call what

select is(
  (select public::text || ' ' || file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'documents'),
  'false 10485760 image/jpeg,image/webp,application/pdf',
  'the documents bucket is private, 10 MiB, a JPEG, a WebP or a PDF'
);
select ok(
  not has_function_privilege('authenticated',
    'public.reserve_document_upload(uuid, uuid, text, text, text, integer, text, timestamptz)', 'execute')
  and not has_function_privilege('anon',
    'public.reserve_document_upload(uuid, uuid, text, text, text, integer, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
    'public.send_document(uuid, uuid, text, text, text, text, uuid[], boolean, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('anon',
    'public.send_document(uuid, uuid, text, text, text, text, uuid[], boolean, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.open_document(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.confirm_document(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.remove_document(uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.restore_document(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.documents_closed(uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.document_upload_place(uuid, uuid, uuid, timestamptz)', 'execute'),
  'browser roles run none of the document functions'
);
select ok(
  has_function_privilege('service_role',
    'public.reserve_document_upload(uuid, uuid, text, text, text, integer, text, timestamptz)', 'execute')
  and has_function_privilege('service_role',
    'public.send_document(uuid, uuid, text, text, text, text, uuid[], boolean, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.open_document(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.confirm_document(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.remove_document(uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.restore_document(uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.documents_closed(uuid)', 'execute')
  and has_function_privilege('service_role',
    'public.document_upload_place(uuid, uuid, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.expired_files(timestamptz, integer)', 'execute')
  and has_function_privilege('service_role', 'public.forget_files(text[], timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.chat_paths_signed(text[], timestamptz)', 'execute'),
  'the server runs them, and the clean-up''s, as before'
);
select ok(
  has_function_privilege('authenticated', 'private.sees_document(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.manages_document(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.in_office(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.attach_document_upload(uuid, uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'private.seed_demo_documents(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.purge_business_records(uuid)', 'execute'),
  'a signed-in reader runs the policies'' helpers, and nothing else of them'
);
select ok(
  has_table_privilege('authenticated', 'public.documents', 'select')
  and not has_table_privilege('authenticated', 'public.documents', 'insert, update, delete, truncate')
  and not has_table_privilege('anon', 'public.documents', 'select, insert, update, delete, truncate')
  and not has_table_privilege('service_role', 'public.documents', 'select, insert, update, delete, truncate')
  and has_table_privilege('authenticated', 'public.document_recipients', 'select')
  and not has_table_privilege('authenticated', 'public.document_recipients', 'insert, update, delete, truncate')
  and not has_table_privilege('anon', 'public.document_recipients', 'select, insert, update, delete, truncate')
  and not has_table_privilege('service_role', 'public.document_recipients', 'select, insert, update, delete, truncate'),
  'the browser reads documents and writes none, the server role reads none, and nobody truncates them'
);

------------------------------------------------------------------------------
-- Reserving a document's place

select pg_temp.reserve('sick', 'noa', pg_temp.biz_r(), 'from_person', 50000, '2026-11-05 09:00+00');
select ok(
  pg_temp.up('sick', 'path') ~ '^8b000000-0000-4000-b000-000000000001/[0-9a-f]{32}\.pdf$'
  and pg_temp.up('sick', 'upload') is not null,
  'a document''s place is in its business''s folder under a random key, naming neither the person nor the category'
);
select throws_ok(
  $$select pg_temp.reserve('x', 'galit', pg_temp.biz_r(), 'from_person', 50000, '2026-11-05 09:00+00')$$,
  '42501', null, 'the accountant, off the staff, sends nothing to the business'
);
select throws_ok(
  $$select pg_temp.reserve('x', 'noa', pg_temp.biz_r(), 'to_people', 50000, '2026-11-05 09:00+00')$$,
  '42501', null, 'and a worker sends nothing to people'
);
select throws_ok(
  $$select pg_temp.reserve('x', 'noa', pg_temp.biz_r(), 'from_person', 50000, '2026-11-05 09:00+00',
    'image', 'image/png')$$,
  '22023', null, 'a photo is a JPEG or a WebP'
);
select throws_ok(
  $$select pg_temp.reserve('x', 'noa', pg_temp.biz_r(), 'from_person', 716801, '2026-11-05 09:00+00',
    'image', 'image/webp')$$,
  '22023', null, 'of at most 700 KB'
);
select throws_ok(
  $$select public.reserve_document_upload(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person',
    'pdf', 'application/pdf', 50000, 'sick.docx', '2026-11-05 09:00+00')$$,
  '22023', null, 'and a PDF''s name ends in .pdf'
);
select throws_ok(
  $$select pg_temp.reserve('x', 'noa', pg_temp.biz_r(), 'sideways', 50000, '2026-11-05 09:00+00')$$,
  '22023', null, 'a document goes to the business or to people'
);
select throws_ok(
  $$select pg_temp.reserve('x', 'dor', pg_temp.biz_d(), 'from_person', 50000, '2026-11-05 09:00+00')$$,
  '55000', null, 'a demo business takes no uploaded document'
);
select is(
  (select p ->> 'path' || '|' || (p ->> 'used') || '|' || (p ->> 'fresh') || '|' || coalesce(p ->> 'document', '-')
   from (select public.document_upload_place(pg_temp.person('noa'), pg_temp.biz_r(),
     pg_temp.up('sick', 'upload')::uuid, '2026-11-05 09:30+00') as p) x),
  pg_temp.up('sick', 'path') || '|false|true|-',
  'the server finds its own place: its path, not sent yet, still fresh'
);
select is(
  public.document_upload_place(pg_temp.person('yoav'), pg_temp.biz_r(),
    pg_temp.up('sick', 'upload')::uuid, '2026-11-05 09:30+00'),
  null::jsonb,
  'and nothing of anyone else''s'
);

------------------------------------------------------------------------------
-- Sending: who, which way, which category, and the file

select pg_temp.put(pg_temp.up('sick', 'path'), 50000, 'application/pdf', '2026-11-05 09:00+00');
select pg_temp.reserve('payslip', 'galit', pg_temp.biz_r(), 'to_people', 50000, '2026-11-05 09:00+00');
select pg_temp.put(pg_temp.up('payslip', 'path'), 50000, 'application/pdf', '2026-11-05 09:00+00');

select throws_ok(
  $$select public.send_document(pg_temp.person('yoav'), pg_temp.biz_r(), 'from_person', 'sick_note',
    'A title', null, null, false, pg_temp.up('sick', 'upload')::uuid, null, '2026-11-05 09:01+00')$$,
  '22023', 'Unknown file', 'nobody sends someone else''s file'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'to_people', 'form',
    'A title', null, array[pg_temp.person('yoav')], false, null, null, '2026-11-05 09:01+00')$$,
  '42501', null, 'a worker sends no document to people'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('galit'), pg_temp.biz_r(), 'from_person', 'form',
    'A title', null, null, false, null, null, '2026-11-05 09:01+00')$$,
  '42501', null, 'the accountant sends none to the business'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person', 'payslip',
    'A title', null, null, false, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'Not a document for the business', 'a worker sends a sick note, a form or another document, never a payslip'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('shiran'), pg_temp.biz_r(), 'to_people', 'sick_note',
    'A title', null, array[pg_temp.person('noa')], false, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'Not a document for people', 'and nobody sends people a sick note'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('shiran'), pg_temp.biz_r(), 'to_people', 'form',
    'A title', null, array[pg_temp.person('galit')], false, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'Only to people on the staff', 'a document to people goes to people on the staff, never the accountant'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('shiran'), pg_temp.biz_r(), 'to_people', 'form',
    'A title', null, array[pg_temp.person('shiran'), pg_temp.person('noa')], false, null, null,
    '2026-11-05 09:01+00')$$,
  '22023', 'Not to oneself', 'nor to its sender'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('shiran'), pg_temp.biz_r(), 'to_people', 'form',
    'A title', null, '{}'::uuid[], false, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'One to 200 people', 'nor to nobody'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person', 'form',
    'A title', null, null, true, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'Only a document to people asks for a confirmation', 'the business is never asked for "קראתי"'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person', 'form',
    '   ', null, null, false, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'A title of 1 to 80 characters', 'a document has a title'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person', 'form',
    repeat('x', 81), null, null, false, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'A title of 1 to 80 characters', 'of at most 80 characters'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person', 'form',
    'A title', repeat('x', 301), null, false, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'A note of at most 300 characters', 'and a note of at most 300'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person', 'form',
    'A title', null, null, false, null, null, '2026-11-05 09:01+00')$$,
  '22023', 'A document is a file', 'a document is a file'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person', 'sick_note',
    'A title', null, null, false, null, 'sick_note', '2026-11-05 09:01+00')$$,
  '55000', 'Samples are for demo businesses', 'a sample is a demo''s alone'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('galit'), pg_temp.biz_s(), 'to_people', 'payslip',
    'A title', null, array[pg_temp.person('tamar')], false, pg_temp.up('payslip', 'upload')::uuid,
    null, '2026-11-05 09:01+00')$$,
  '22023', 'Unknown file', 'a place goes with its own business only'
);
insert into ups values ('chat-up', public.reserve_chat_upload(pg_temp.person('noa'), pg_temp.biz_r(),
  'image', 'image/webp', 42000,
  (select c.id from public.chat_conversations c
   where c.business_id = pg_temp.biz_r() and c.kind = 'team'),
  null, null, '2026-11-05 09:00+00'));
select throws_ok(
  $$select public.send_document(pg_temp.person('noa'), pg_temp.biz_r(), 'from_person', 'form',
    'A title', null, null, false, pg_temp.up('chat-up', 'upload')::uuid, null, '2026-11-05 09:01+00')$$,
  '22023', 'Unknown file', 'nor does a chat file''s'
);
select pg_temp.reserve('x-missing', 'noa', pg_temp.biz_r(), 'from_person', 50000, '2026-11-05 09:00+00');
select throws_ok(
  $$select pg_temp.send('x-missing', 'noa', pg_temp.biz_r(), 'from_person', 'form', 'x-missing',
    null, false, '2026-11-05 09:01+00')$$,
  '22023', 'The file is not in place', 'a file not in place yet is not sent'
);
select pg_temp.reserve('x-type', 'noa', pg_temp.biz_r(), 'from_person', 50000, '2026-11-05 09:00+00');
select pg_temp.put(pg_temp.up('x-type', 'path'), 50000, 'image/webp', '2026-11-05 09:00+00');
select throws_ok(
  $$select pg_temp.send('x-type', 'noa', pg_temp.biz_r(), 'from_person', 'form', 'x-type',
    null, false, '2026-11-05 09:01+00')$$,
  '22023', 'The file is not in place', 'nor one whose type in Storage is not the one reserved'
);
select pg_temp.reserve('x-size', 'noa', pg_temp.biz_r(), 'from_person', 50000, '2026-11-05 09:00+00');
select pg_temp.put(pg_temp.up('x-size', 'path'), 40000, 'application/pdf', '2026-11-05 09:00+00');
select throws_ok(
  $$select pg_temp.send('x-size', 'noa', pg_temp.biz_r(), 'from_person', 'form', 'x-size',
    null, false, '2026-11-05 09:01+00')$$,
  '22023', 'The file is not the size reserved', 'nor its size'
);
select pg_temp.reserve('x-old', 'noa', pg_temp.biz_r(), 'from_person', 50000, '2026-11-05 06:00+00');
select pg_temp.put(pg_temp.up('x-old', 'path'), 50000, 'application/pdf', '2026-11-05 06:00+00');
select throws_ok(
  $$select pg_temp.send('x-old', 'noa', pg_temp.biz_r(), 'from_person', 'form', 'x-old',
    null, false, '2026-11-05 08:01+00')$$,
  '22023', 'The file waited too long', 'nor one reserved more than 2 hours before'
);
update public.business_modules set enabled = false
where business_id = '8b000000-0000-4000-b000-000000000002' and module_key = 'chat';
select throws_ok(
  $$select public.send_document(pg_temp.person('tamar'), pg_temp.biz_s(), 'from_person', 'form',
    'A title', null, null, false, null, null, '2026-11-05 09:01+00')$$,
  '55000', null, 'with chat off a business takes no documents'
);
update public.business_modules set enabled = true
where business_id = '8b000000-0000-4000-b000-000000000002' and module_key = 'chat';

-- Noa's sick note, Galit's payslip to Noa, Shiran's procedure to Noa and
-- Yoav asking for "קראתי", Uri's contract to Rina, Rina's form, Tamar's sick
-- note in S, Omer's own in S (he is in its office) and Yoav's other document.
select pg_temp.send('sick', 'noa', pg_temp.biz_r(), 'from_person', 'sick_note', 'sick', null, false,
  '2026-11-05 09:01+00');
select is(
  (select d.direction || '|' || (d.person_id = pg_temp.person('noa'))::text
     || '|' || (d.author_id = pg_temp.person('noa'))::text || '|' || d.category || '|' || d.title
     || '|' || d.file_kind || '|' || d.file_path || '|' || d.file_size || '|' || d.file_name
     || '|' || coalesce(d.sample, '-') || '|' || d.asks_confirmation::text
     || '|' || (d.opened_at is null)::text || '|' || (u.used_at is not null)::text
   from public.documents d
   join private.file_uploads u on u.path = d.file_path
   where d.id = pg_temp.id_of('sick')),
  'from_person|true|true|sick_note|A title|pdf|' || pg_temp.up('sick', 'path')
    || '|50000|document.pdf|-|false|true|true',
  'a sick note goes to the business as its person''s, with its file, not opened yet, and its place used'
);
select throws_ok(
  $$select pg_temp.send('sick-again', 'noa', pg_temp.biz_r(), 'from_person', 'sick_note', 'sick',
    null, false, '2026-11-05 09:02+00')$$,
  '22023', 'The file was sent already', 'a file is sent once'
);
select is(
  (public.document_upload_place(pg_temp.person('noa'), pg_temp.biz_r(),
    pg_temp.up('sick', 'upload')::uuid, '2026-11-05 09:30+00') ->> 'document')::uuid,
  pg_temp.id_of('sick'),
  'and its place then says which document it went to, for a retry'
);
select pg_temp.send('payslip', 'galit', pg_temp.biz_r(), 'to_people', 'payslip', 'payslip',
  array['noa'], false, '2026-11-05 09:10+00');
select pg_temp.file_doc('procedure', 'shiran', pg_temp.biz_r(), 'to_people', 'procedure',
  array['noa', 'yoav'], true, '2026-11-05 09:20+00');
select pg_temp.file_doc('contract', 'uri', pg_temp.biz_r(), 'to_people', 'contract',
  array['rina'], false, '2026-11-05 09:30+00');
select pg_temp.file_doc('rina-form', 'rina', pg_temp.biz_r(), 'from_person', 'form',
  null, false, '2026-11-05 09:40+00');
select pg_temp.file_doc('tamar-sick', 'tamar', pg_temp.biz_s(), 'from_person', 'sick_note',
  null, false, '2026-11-05 09:50+00');
select pg_temp.file_doc('omer-sick', 'omer', pg_temp.biz_s(), 'from_person', 'sick_note',
  null, false, '2026-11-05 09:55+00');
select pg_temp.file_doc('yoav-other', 'yoav', pg_temp.biz_r(), 'from_person', 'other',
  null, false, '2026-11-05 10:00+00');
select is(
  (select string_agg(w.name || ':' || (r.opened_at is null)::text, ',' order by w.name collate "C")
   from public.document_recipients r join who w on w.id = r.person_id
   where r.document_id = pg_temp.id_of('procedure')),
  'noa:true,yoav:true',
  'a document to people goes to each of them, none of whom opened it yet'
);

-- Rina leaves the business.
update public.memberships set active = false
where business_id = '8b000000-0000-4000-b000-000000000001'
  and user_id = '8b000000-0000-4000-a000-000000000006';

------------------------------------------------------------------------------
-- Reading

select pg_temp.sign_in('8b000000-0000-4000-a000-000000000003');
select is(pg_temp.seen(), 'payslip,procedure,sick',
  'Noa reads her sick note and what was sent to her');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000004');
select is(pg_temp.seen(), 'procedure,yoav-other',
  'Yoav his own and the procedure, never Noa''s sick note or payslip');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000001');
select is(pg_temp.seen(), 'contract,payslip,procedure,rina-form,sick,yoav-other',
  'the owner reads every document of the business');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000005');
select is(pg_temp.seen(), 'contract,omer-sick,payslip,procedure,rina-form,sick,tamar-sick,yoav-other',
  'the accountant every document of both her businesses');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000002');
select is(pg_temp.seen(), 'procedure',
  'a manager without pay access only what she sent: no worker''s document');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000006');
select is(pg_temp.seen(), 'contract,rina-form',
  'someone who left still reads their own and what was sent to them, and nothing else');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000007');
select is(pg_temp.seen(), 'omer-sick,tamar-sick', 'the owner of S reads S''s only');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000008');
select is(pg_temp.seen(), 'omer-sick,tamar-sick',
  'a manager given pay access reads a worker''s sick note, and his own');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000009');
select is(pg_temp.seen(), 'tamar-sick', 'and so does the worker who sent it, never her manager''s');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000a');
select is(pg_temp.seen(), '', 'a view as an owner reads no document');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000b');
select is(pg_temp.seen(), '', 'nor a view as a manager');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000c');
select is(pg_temp.seen(), '', 'nor a view as an accountant');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000d');
select is(pg_temp.seen(), '', 'nor the ConceptApp team');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000e');
select is(pg_temp.seen(), '', 'nor another business''s owner');

select pg_temp.sign_in('8b000000-0000-4000-a000-000000000003');
select is(pg_temp.marks(), 'payslip:noa,procedure:noa', 'a recipient reads her own marks only');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000002');
select is(pg_temp.marks(), 'procedure:noa,procedure:yoav', 'its sender reads every recipient''s');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000001');
select is(pg_temp.marks(), 'contract:rina,payslip:noa,procedure:noa,procedure:yoav',
  'and the office every one in the business');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000006');
select is(pg_temp.marks(), 'contract:rina', 'someone who left reads their own');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000c');
select is(pg_temp.marks(), '', 'and a view as an accountant none');
reset role;

------------------------------------------------------------------------------
-- Lines

select is(pg_temp.lines('sick'), 'galit:documents.received:true,uri:documents.received:true',
  'a sick note tells the office: the owner and the accountant, never a manager without pay access');
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id in ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-b000-000000000002')
     and n.kind like 'documents.%')
  || '/' || (select count(*)::integer from public.notifications n
   where n.business_id in ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-b000-000000000002')
     and n.kind like 'documents.%'
     and (n.params - 'document' - 'from' <> '{}'::jsonb
       or not n.params ? 'document' or not n.params ? 'from'
       or n.params::text ~ 'title|sick|payslip|procedure|contract|form|pdf')),
  '15/0',
  'every line about a document holds its id and its sender, and never a category, a title or a file'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.user_id = pg_temp.person('shiran') and n.kind like 'documents.%'),
  0,
  'a manager without pay access learns nothing, not even that a document came'
);
select is(pg_temp.lines('payslip') || ' ' || pg_temp.lines('procedure'),
  'noa:documents.sent:true noa:documents.to_confirm:true,yoav:documents.to_confirm:true',
  'a document to people tells each of them, asking for "קראתי" when it does');
select is(pg_temp.lines('tamar-sick'),
  'galit:documents.received:true,michal:documents.received:true,omer:documents.received:true',
  'in S the office is the owner, the manager given pay access and the accountant');
select is(
  (select n.push_state || '|' || (n.push_after = '2026-11-05 09:50+00')::text
   from public.notifications n
   where n.user_id = pg_temp.person('omer')
     and n.dedupe_key = 'documents.' || pg_temp.id_of('tamar-sick')::text),
  'queued|true',
  'a line about a document goes to the phone of someone in the office at once, as any line does'
);

------------------------------------------------------------------------------
-- Opening

select is(
  public.open_document(pg_temp.person('uri'), pg_temp.id_of('sick'), '2026-11-05 10:00+00') ->> 'path',
  pg_temp.up('sick', 'path'),
  'the owner opens a sick note: the route gets its file'
);
select is(
  (select (d.opened_at = '2026-11-05 10:00+00' and d.opened_by = pg_temp.person('uri'))::text
   from public.documents d where d.id = pg_temp.id_of('sick'))
  || '|' || pg_temp.lines('sick'),
  'true|galit:documents.received:false,uri:documents.received:false',
  'the office''s first opening marks it received, and settles its line for all of the office'
);
select public.open_document(pg_temp.person('galit'), pg_temp.id_of('sick'), '2026-11-05 11:00+00');
select ok(
  (select d.opened_at = '2026-11-05 10:00+00' and d.opened_by = pg_temp.person('uri')
   from public.documents d where d.id = pg_temp.id_of('sick')),
  'once: the first opening stays'
);
select public.open_document(pg_temp.person('uri'), pg_temp.id_of('sick'), '2026-11-05 15:00+00');
select public.open_document(pg_temp.person('uri'), pg_temp.id_of('sick'), '2026-11-06 08:00+00');
select public.open_document(pg_temp.person('noa'), pg_temp.id_of('sick'), '2026-11-05 12:00+00');
select is(
  (select string_agg(w.name || '@' || to_char(a.created_at at time zone 'Asia/Jerusalem', 'MM-DD'), ','
     order by a.id)
   from public.audit_log a join who w on w.id = a.actor_id
   where a.action = 'document.open' and a.details ->> 'document' = pg_temp.id_of('sick')::text),
  'uri@11-05,galit@11-05,uri@11-06',
  'each opening by the office is logged once a day per reader, in the business''s clock, and never the person''s own'
);
select public.open_document(pg_temp.person('noa'), pg_temp.id_of('payslip'), '2026-11-05 12:00+00');
select is(
  (select (r.opened_at = '2026-11-05 12:00+00')::text from public.document_recipients r
   where r.document_id = pg_temp.id_of('payslip') and r.person_id = pg_temp.person('noa'))
  || '|' || pg_temp.lines('payslip'),
  'true|noa:documents.sent:false',
  'a recipient''s opening marks hers, and settles her line'
);
select public.open_document(pg_temp.person('noa'), pg_temp.id_of('procedure'), '2026-11-05 12:10+00');
select is(
  (select (r.opened_at = '2026-11-05 12:10+00')::text from public.document_recipients r
   where r.document_id = pg_temp.id_of('procedure') and r.person_id = pg_temp.person('noa'))
  || '|' || pg_temp.lines('procedure'),
  'true|noa:documents.to_confirm:true,yoav:documents.to_confirm:true',
  'opening one that asks for "קראתי" leaves its line waiting'
);
select public.open_document(pg_temp.person('shiran'), pg_temp.id_of('procedure'), '2026-11-05 12:20+00');
-- The office's own: Galit the payslip she sent, Uri the contract he sent, and
-- Omer his own sick note in S.
select public.open_document(pg_temp.person('galit'), pg_temp.id_of('payslip'), '2026-11-05 12:35+00');
select public.open_document(pg_temp.person('uri'), pg_temp.id_of('contract'), '2026-11-05 12:35+00');
select public.open_document(pg_temp.person('omer'), pg_temp.id_of('omer-sick'), '2026-11-05 12:35+00');
select is(
  (select count(*)::integer from public.audit_log a
   where a.action = 'document.open'
     and (
       a.actor_id in (pg_temp.person('noa'), pg_temp.person('shiran'))
       or (a.actor_id = pg_temp.person('galit')
         and a.details ->> 'document' = pg_temp.id_of('payslip')::text)
       or (a.actor_id = pg_temp.person('uri')
         and a.details ->> 'document' = pg_temp.id_of('contract')::text)
       or (a.actor_id = pg_temp.person('omer')
         and a.details ->> 'document' = pg_temp.id_of('omer-sick')::text)
     ))
  || '|' || (select (d.opened_at is null)::text from public.documents d
    where d.id = pg_temp.id_of('omer-sick')),
  '0|true',
  'a recipient''s, a sender''s and the person''s own openings are no one else''s, in the office too: none is logged, and one''s own is not marked received by it'
);
select public.open_document(pg_temp.person('uri'), pg_temp.id_of('payslip'), '2026-11-05 12:30+00');
select is(
  (select a.details from public.audit_log a
   where a.action = 'document.open' and a.actor_id = pg_temp.person('uri')
     and a.details ->> 'document' = pg_temp.id_of('payslip')::text),
  jsonb_build_object('document', pg_temp.id_of('payslip'), 'person', null::uuid),
  'the office opening a document to people is logged too, with ids only'
);
select throws_ok(
  $$select public.open_document(pg_temp.person('shiran'), pg_temp.id_of('sick'), '2026-11-05 12:40+00')$$,
  'P0002', null, 'a manager without pay access can''t open a sick note: it is unknown to her'
);
select throws_ok(
  $$select public.open_document(pg_temp.person('uri'), gen_random_uuid(), '2026-11-05 12:40+00')$$,
  'P0002', null, 'the same answer as for no document at all'
);

------------------------------------------------------------------------------
-- Confirming

select throws_ok(
  $$select public.confirm_document(pg_temp.person('noa'), pg_temp.id_of('payslip'), '2026-11-05 13:00+00')$$,
  '22023', null, 'a document that asks for no "קראתי" is not confirmed'
);
select throws_ok(
  $$select public.confirm_document(pg_temp.person('uri'), pg_temp.id_of('procedure'), '2026-11-05 13:00+00')$$,
  '42501', null, 'and only its recipients confirm one that asks'
);
select public.confirm_document(pg_temp.person('yoav'), pg_temp.id_of('procedure'), '2026-11-05 13:00+00');
select is(
  (select (r.opened_at = '2026-11-05 13:00+00' and r.confirmed_at = '2026-11-05 13:00+00')::text
   from public.document_recipients r
   where r.document_id = pg_temp.id_of('procedure') and r.person_id = pg_temp.person('yoav'))
  || '|' || pg_temp.lines('procedure'),
  'true|noa:documents.to_confirm:true,yoav:documents.to_confirm:false',
  'confirming marks it opened and confirmed, and settles one''s own line only'
);
select public.confirm_document(pg_temp.person('noa'), pg_temp.id_of('procedure'), '2026-11-05 13:10+00');
select public.confirm_document(pg_temp.person('noa'), pg_temp.id_of('procedure'), '2026-11-05 14:00+00');
select ok(
  (select r.confirmed_at = '2026-11-05 13:10+00' and r.opened_at = '2026-11-05 12:10+00'
   from public.document_recipients r
   where r.document_id = pg_temp.id_of('procedure') and r.person_id = pg_temp.person('noa')),
  'once: confirming again keeps the first time, and the opening before it'
);

------------------------------------------------------------------------------
-- Removing a document's file, and putting it back

select lives_ok(
  $$select public.remove_document(pg_temp.person('yoav'), pg_temp.id_of('yoav-other'), 'taken_back',
    '2026-11-05 10:05+00')$$,
  'its sender takes it back in their first 10 minutes'
);
select is(
  (select d.removed_reason || '|' || (d.removed_by = pg_temp.person('yoav'))::text
     || '|' || (d.file_gone_after = '2026-11-05 10:15+00')::text || '|' || (d.file_path is not null)::text
   from public.documents d where d.id = pg_temp.id_of('yoav-other'))
  || '|' || pg_temp.lines('yoav-other'),
  'taken_back|true|true|true|galit:documents.received:false,uri:documents.received:false',
  'the row stays and its file waits 10 minutes for the undo; every line about it is settled'
);
select lives_ok(
  $$select public.restore_document(pg_temp.person('yoav'), pg_temp.id_of('yoav-other'),
    '2026-11-05 10:08+00')$$,
  'whoever removed it puts it back within the 10 minutes'
);
select is(
  (select coalesce(d.removed_reason, '-') || '|' || (d.removed_at is null and d.file_gone_after is null)::text
   from public.documents d where d.id = pg_temp.id_of('yoav-other'))
  || '|' || pg_temp.lines('yoav-other'),
  '-|true|galit:documents.received:true,uri:documents.received:true',
  'and it is as it was, the office told again, since nobody there opened it'
);
select throws_ok(
  $$select public.remove_document(pg_temp.person('yoav'), pg_temp.id_of('yoav-other'), 'taken_back',
    '2026-11-05 10:20+00')$$,
  '22023', null, 'after 10 minutes its sender no longer takes it back'
);
select throws_ok(
  $$select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('yoav-other'), 'taken_back',
    '2026-11-05 10:06+00')$$,
  '22023', null, 'and nobody but its sender does'
);
select throws_ok(
  $$select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('yoav-other'), 'oops',
    '2026-11-05 10:30+00')$$,
  '22023', null, 'the office removes a file with a reason from the list'
);
select throws_ok(
  $$select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('yoav-other'), null,
    '2026-11-05 10:30+00')$$,
  '22023', null, 'and never with none'
);
select throws_ok(
  $$select public.remove_document(pg_temp.person('shiran'), pg_temp.id_of('procedure'), 'wrong_person',
    '2026-11-05 14:00+00')$$,
  '42501', null, 'a sender who is not in the office doesn''t remove it once her 10 minutes are over'
);

-- Galit's rules to Noa, Uri and Yoav, asking for "קראתי": Uri (in the
-- office) and Noa open it, Yoav confirms it; then Galit removes it.
select pg_temp.file_doc('rules', 'galit', pg_temp.biz_r(), 'to_people', 'procedure',
  array['noa', 'uri', 'yoav'], true, '2026-11-05 10:30+00');
select public.open_document(pg_temp.person('uri'), pg_temp.id_of('rules'), '2026-11-05 10:31+00');
select public.open_document(pg_temp.person('noa'), pg_temp.id_of('rules'), '2026-11-05 10:31+00');
select public.confirm_document(pg_temp.person('yoav'), pg_temp.id_of('rules'), '2026-11-05 10:32+00');
select is(
  (select count(*)::integer from public.audit_log a
   where a.action = 'document.open' and a.details ->> 'document' = pg_temp.id_of('rules')::text),
  0,
  'one in the office opening what was sent to them is their own: not logged'
);
select public.remove_document(pg_temp.person('galit'), pg_temp.id_of('rules'), 'other',
  '2026-11-05 10:33+00');
select is(pg_temp.lines('rules'),
  'noa:documents.to_confirm:false,uri:documents.to_confirm:false,yoav:documents.to_confirm:false',
  'removing one to people settles every recipient''s line, those still waiting included');
select throws_ok(
  $$select public.confirm_document(pg_temp.person('noa'), pg_temp.id_of('rules'), '2026-11-05 10:34+00')$$,
  'P0002', 'Unknown document',
  'a recipient pressing "קראתי" on a removed one finds it unknown: it is hidden from her'
);
select throws_ok(
  $$select public.confirm_document(pg_temp.person('uri'), pg_temp.id_of('rules'), '2026-11-05 10:34+00')$$,
  '55000', 'The document was removed',
  'and a recipient in the office, who still reads it, is told it was removed'
);
select public.restore_document(pg_temp.person('galit'), pg_temp.id_of('rules'), '2026-11-05 10:35+00');
select is(pg_temp.lines('rules'),
  'noa:documents.to_confirm:true,uri:documents.to_confirm:true,yoav:documents.to_confirm:false',
  'putting it back asks again whoever hasn''t confirmed it: opening it is not confirming');

-- Uri removes Rina's form, which nobody opened, and puts it back.
select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('rina-form'), 'other',
  '2026-11-05 10:40+00');
select public.restore_document(pg_temp.person('uri'), pg_temp.id_of('rina-form'),
  '2026-11-05 10:42+00');
select is(pg_temp.lines('rina-form'),
  'galit:documents.received:true,uri:documents.received:false',
  'the office is told again, all but whoever put it back');

select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('payslip'), 'wrong_person',
  '2026-11-05 14:00+00');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000003');
select is(pg_temp.seen() || ' ' || pg_temp.marks(), 'procedure,rules,sick procedure:noa,rules:noa',
  'a removed one is hidden from its recipient, and her mark with it');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000005');
select is(pg_temp.seen(),
  'contract,omer-sick,payslip,procedure,rina-form,rules,sick,tamar-sick,yoav-other',
  'while the office still reads it');
reset role;
select throws_ok(
  $$select public.restore_document(pg_temp.person('galit'), pg_temp.id_of('payslip'), '2026-11-05 14:05+00')$$,
  '42501', null, 'only whoever removed it puts it back'
);
select throws_ok(
  $$select public.restore_document(pg_temp.person('uri'), pg_temp.id_of('payslip'), '2026-11-05 14:20+00')$$,
  '55000', null, 'and only within its 10 minutes'
);
select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('payslip'), 'duplicate',
  '2026-11-05 14:30+00');
select is(
  (select d.removed_reason from public.documents d where d.id = pg_temp.id_of('payslip')),
  'wrong_person',
  'removing it again changes nothing'
);

select ok(
  not exists (
    select 1 from public.expired_files('2026-11-05 14:05+00', 1000) e
    where e.path = pg_temp.up('payslip', 'path')
  )
  and exists (
    select 1 from public.expired_files('2026-11-05 14:11+00', 1000) e
    where e.bucket = 'documents' and e.path = pg_temp.up('payslip', 'path')
  ),
  'the chat job lists a removed document''s file once its 10 minutes are over, and not before'
);
select is(
  public.forget_files(array[pg_temp.up('payslip', 'path')], '2026-11-05 14:11+00'),
  1,
  'its clean-up marks it'
);
select is(
  (select coalesce(d.file_path, '-') || '|' || coalesce(d.file_kind, '-') || '|'
     || coalesce(d.file_name, '-') || '|' || d.removed_reason
   from public.documents d where d.id = pg_temp.id_of('payslip')),
  '-|-|-|wrong_person',
  'and the row stays, removed, with no file'
);
select ok(
  not exists (
    select 1 from public.expired_files('2026-11-05 14:12+00', 1000) e
    where e.path = pg_temp.up('payslip', 'path')
  ),
  'then it is listed no more (until what is left in Storage is a day old, with nothing pointing at it)'
);
select is(
  public.chat_paths_signed(array[pg_temp.up('procedure', 'path')], '2026-11-05 10:00+00'),
  array[pg_temp.up('procedure', 'path')],
  'a document''s PDF whose signed upload may still be good is let go with the tombstone, as chat''s'
);

------------------------------------------------------------------------------
-- The bucket, read by the server alone (20261111000900_documents_server_only.sql,
-- Orel's decision of 12 November 2026): no policy, so no session reads a
-- document's file in Storage, whoever reads the document; the server reads
-- it with the secret key once public.open_document opened it, which serves
-- nothing of a removed one, even within its 10 minutes of undo (C7's rule,
-- 20261111000800_documents_screens.sql)

-- The contract's file was removed long ago; Yoav's other document, and
-- Shiran's procedure to Noa and Yoav, just now.
select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('contract'), 'wrong_file',
  '2026-11-05 15:00+00');
select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('yoav-other'), 'duplicate');
select public.remove_document(pg_temp.person('uri'), pg_temp.id_of('procedure'), 'duplicate');

set local role service_role;
select ok(
  pg_temp.files() ~ '(^|,)rules(,|$)' and pg_temp.files() ~ '(^|,)sick(,|$)',
  'the files are in Storage, for the server''s secret key, which RLS doesn''t stop'
);
reset role;

select pg_temp.sign_in('8b000000-0000-4000-a000-000000000003');
select is(pg_temp.files(), '',
  'Noa reads no file of the documents bucket, not even of the documents she reads: the server serves them');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000004');
select is(pg_temp.files(), '', 'nor Yoav his own, nor one sent to him');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000001');
select is(pg_temp.files(), '', 'nor the owner, who reads every document of the business');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000005');
select is(pg_temp.files(), '', 'nor the accountant, in either of her businesses');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000002');
select is(pg_temp.files(), '', 'nor a manager without pay access what she sent');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000006');
select is(pg_temp.files(), '', 'nor someone who left their own');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000008');
select is(pg_temp.files(), '', 'nor a manager with pay access a worker''s sick note');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000a');
select is(pg_temp.files(), '', 'nor a view as an owner');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000b');
select is(pg_temp.files(), '', 'nor as a manager');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000c');
select is(pg_temp.files(), '', 'nor as an accountant');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000d');
select is(pg_temp.files(), '', 'nor the ConceptApp team');
reset role;
set local role anon;
select is(pg_temp.files(), '', 'nor an anonymous visitor');
reset role;
select ok(
  not exists (
    select 1 from pg_policies p
    where p.schemaname = 'storage'
      and (
        p.policyname = 'people read the files of the documents they read'
        or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ '''documents'''
      )
  )
  and to_regprocedure('private.can_read_document(text)') is null,
  'no policy of Storage names the documents bucket, and private.can_read_document is gone: no session downloads, lists or signs a document''s file'
);

-- Opening the removed procedure: Galit within its 10 minutes, Uri, who never
-- opened it, after them.
select is(
  coalesce(public.open_document(pg_temp.person('galit'), pg_temp.id_of('procedure'), now()) ->> 'path', '-'),
  '-',
  'the office opening a removed one within its 10 minutes is given nothing to serve'
);
select is(
  coalesce(public.open_document(pg_temp.person('uri'), pg_temp.id_of('procedure'),
    now() + interval '11 minutes') ->> 'path', '-'),
  '-',
  'nor after them'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.action = 'document.open' and a.details ->> 'document' = pg_temp.id_of('procedure')::text),
  0,
  'and neither opening is logged: nothing was served'
);

------------------------------------------------------------------------------
-- The activity log: rows about documents for the office alone

insert into public.audit_log (business_id, actor_id, action, details)
values ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-a000-000000000001',
  'business.details', '{"from": {}, "to": {}}');

select pg_temp.sign_in('8b000000-0000-4000-a000-000000000001');
select is(pg_temp.log_rows(), 21, 'the owner reads every row about the business''s documents');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000005');
select is(pg_temp.log_rows(), 23, 'the accountant those of both her businesses');
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000002');
select is(
  pg_temp.log_rows() || '/' || (select count(*)::integer from public.audit_log a
    where a.business_id = '8b000000-0000-4000-b000-000000000001' and a.action = 'business.details'),
  '0/1',
  'a manager without pay access reads none of them, and still the rest of the log'
);
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000008');
select is(pg_temp.log_rows(), 2, 'a manager with pay access reads them');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000a');
select is(pg_temp.log_rows(), 0, 'a view as an owner none');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000b');
select is(pg_temp.log_rows(), 0, 'nor as a manager');
select pg_temp.sign_in('8b000000-0000-4000-a000-00000000000c');
select is(pg_temp.log_rows(), 0, 'nor as an accountant');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.action ~ '^document\.'
     and a.business_id in ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-b000-000000000002')
     and (
       exists (
         select 1 from jsonb_object_keys(a.details) k (key)
         where k.key not in ('document', 'direction', 'recipients', 'person', 'reason')
       )
       or a.details::text ~ 'A title|document\.pdf'
     ))
  || '/' || (select string_agg(x.action || '=' || x.n, ',' order by x.action collate "C")
    from (
      select a.action, count(*) as n from public.audit_log a
      where a.action ~ '^document\.'
        and a.business_id in ('8b000000-0000-4000-b000-000000000001', '8b000000-0000-4000-b000-000000000002')
      group by a.action
    ) x),
  '0/document.open=4,document.remove=7,document.restore=3,document.send=9',
  'every row about documents holds ids and codes only: never a category, a title, a note or a file'
);

------------------------------------------------------------------------------
-- Someone who left sends nothing

select throws_ok(
  $$select public.send_document(pg_temp.person('rina'), pg_temp.biz_r(), 'from_person', 'form',
    'A title', null, null, false, null, null, '2026-11-06 09:00+00')$$,
  '42501', null, 'someone who left reads their own, and writes nothing'
);

------------------------------------------------------------------------------
-- A sender who leaves: what she sent is no longer hers

-- Shiran's memo to Noa, and Uri's notice to Shiran asking for "קראתי"; then
-- Shiran leaves, within the memo's first 10 minutes.
select pg_temp.file_doc('memo', 'shiran', pg_temp.biz_r(), 'to_people', 'form',
  array['noa'], false, '2026-11-06 09:00+00');
select pg_temp.file_doc('notice', 'uri', pg_temp.biz_r(), 'to_people', 'procedure',
  array['shiran'], true, '2026-11-06 09:00+00');
update public.memberships set active = false
where business_id = '8b000000-0000-4000-b000-000000000001'
  and user_id = '8b000000-0000-4000-a000-000000000002';

select pg_temp.sign_in('8b000000-0000-4000-a000-000000000002');
select is(pg_temp.seen() || ' ' || pg_temp.marks(), 'notice notice:shiran',
  'a sender who left reads what was sent to her and her own mark, never what she sent or its marks');
reset role;
select throws_ok(
  $$select public.remove_document(pg_temp.person('shiran'), pg_temp.id_of('memo'), 'taken_back',
    '2026-11-06 09:02+00')$$,
  'P0002', 'Unknown document', 'nor takes it back, even in its first 10 minutes: it is unknown to her'
);
select throws_ok(
  $$select public.confirm_document(pg_temp.person('shiran'), pg_temp.id_of('notice'),
    '2026-11-06 09:03+00')$$,
  '42501', 'Only its recipients confirm it', 'someone who left confirms nothing sent to them'
);
select is(
  public.open_document(pg_temp.person('shiran'), pg_temp.id_of('notice'), '2026-11-06 09:04+00') ->> 'path',
  pg_temp.up('notice', 'path'),
  'while still opening it'
);
select is(
  (select coalesce(r.opened_at::text, '-') || '|' || coalesce(r.confirmed_at::text, '-')
   from public.document_recipients r
   where r.document_id = pg_temp.id_of('notice') and r.person_id = pg_temp.person('shiran')),
  '-|-',
  'and neither opening nor confirming marks anything once they left'
);

------------------------------------------------------------------------------
-- Pay access goes

select public.set_role_permission(pg_temp.person('michal'), pg_temp.biz_s(), 'manager',
  'clock.payroll', false);
select is(pg_temp.lines('tamar-sick'),
  'galit:documents.received:true,michal:documents.received:true,omer:documents.received:false',
  'taking pay access back settles one''s own line about a document to the business, and nobody else''s');
select is(
  (select n.push_state from public.notifications n
   where n.user_id = pg_temp.person('omer')
     and n.dedupe_key = 'documents.' || pg_temp.id_of('tamar-sick')::text),
  'skipped',
  'and its push, not sent yet, never goes'
);
select pg_temp.sign_in('8b000000-0000-4000-a000-000000000008');
select is(pg_temp.seen(), 'omer-sick',
  'and a worker''s document is no longer theirs to read: only their own is left');
reset role;

------------------------------------------------------------------------------
-- A demo business: samples only, no note, and the category's own words

select throws_ok(
  $$select public.send_document(pg_temp.person('dor'), pg_temp.biz_d(), 'from_person', 'sick_note',
    'A title', 'I feel ill', null, false, null, 'sick_note', '2026-11-05 09:00+00')$$,
  '22023', 'A demo document takes no note', 'a demo document takes no note'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('dor'), pg_temp.biz_d(), 'from_person', 'form',
    'A title', null, null, false, null, null, '2026-11-05 09:00+00')$$,
  '22023', 'A demo document is a sample or a file', 'and is a sample'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('dor'), pg_temp.biz_d(), 'from_person', 'form',
    'A title', null, null, false, null, 'sick_note', '2026-11-05 09:00+00')$$,
  '22023', 'A sample of its own category', 'of its own category'
);
insert into ids values ('demo-sick', public.send_document(pg_temp.person('dor'), pg_temp.biz_d(),
  'from_person', 'sick_note', 'Something a visitor typed', null, null, false, null, 'sick_note',
  '2026-11-05 09:00+00'));
select is(
  (select d.title || '|' || coalesce(d.note, '-') || '|' || d.sample || '|' || coalesce(d.file_path, '-')
   from public.documents d where d.id = pg_temp.id_of('demo-sick')),
  'אישור מחלה|-|sick_note|-',
  'titled with its category''s words, whatever a visitor typed'
);
select is(
  (select n.push_state from public.notifications n
   where n.user_id = pg_temp.person('dana')
     and n.dedupe_key = 'documents.' || pg_temp.id_of('demo-sick')::text),
  'none',
  'and its line never goes to a phone: a demo''s never do'
);

-- Dor sends 30 samples in one minute, the most a minute takes.
select count(public.send_document(pg_temp.person('dor'), pg_temp.biz_d(), 'from_person',
  'sick_note', 'A title', null, null, false, null, 'sick_note', '2026-11-05 11:00+00'))
from generate_series(1, 30);
select is(
  pg_temp.refusal($$select public.send_document(pg_temp.person('dor'), pg_temp.biz_d(), 'from_person',
    'sick_note', 'A title', null, null, false, null, 'sick_note', '2026-11-05 11:00+00')$$),
  '54000/- Too many in a minute',
  'a 31st document in a minute is refused, with no hint: too fast'
);
-- Then Dana 29 at 11:30, Dor 29 at 11:40 and Dana 12 at 11:50: 100 in the
-- demo's hour, none more than 30 a minute.
select count(public.send_document(pg_temp.person('dana'), pg_temp.biz_d(), 'from_person',
  'sick_note', 'A title', null, null, false, null, 'sick_note', '2026-11-05 11:30+00'))
from generate_series(1, 29);
select count(public.send_document(pg_temp.person('dor'), pg_temp.biz_d(), 'from_person',
  'sick_note', 'A title', null, null, false, null, 'sick_note', '2026-11-05 11:40+00'))
from generate_series(1, 29);
select count(public.send_document(pg_temp.person('dana'), pg_temp.biz_d(), 'from_person',
  'sick_note', 'A title', null, null, false, null, 'sick_note', '2026-11-05 11:50+00'))
from generate_series(1, 12);
select is(
  pg_temp.refusal($$select public.send_document(pg_temp.person('dana'), pg_temp.biz_d(), 'from_person',
    'sick_note', 'A title', null, null, false, null, 'sick_note', '2026-11-05 11:50+00')$$),
  '54000/- Too many in this demo for now',
  'and a demo''s 101st in an hour, whoever sends it'
);
select throws_ok(
  $$insert into public.documents (business_id, direction, person_id, author_id, category, title,
      file_kind, file_path, file_size)
    values ('8b000000-0000-4000-b000-000000000003', 'from_person', pg_temp.person('dor'),
      pg_temp.person('dor'), 'form', 'A form', 'pdf',
      '8b000000-0000-4000-b000-000000000003/' || md5('demo') || '.pdf', 50000)$$,
  '55000', 'Demo businesses take no files', 'the database refuses a file in a demo business, whoever writes it'
);
select throws_ok(
  $$insert into public.documents (business_id, direction, person_id, author_id, category, title, sample)
    values ('8b000000-0000-4000-b000-000000000001', 'from_person', pg_temp.person('noa'),
      pg_temp.person('noa'), 'sick_note', 'A sick note', 'sick_note')$$,
  '55000', 'Samples are for demo businesses', 'and a sample anywhere else'
);
select is(
  public.documents_closed(pg_temp.biz_d())::text || '|' || public.documents_closed(pg_temp.biz_r())::text
    || '|' || public.documents_closed(pg_temp.biz_e())::text,
  'true|false|false',
  'the server asks before an upload: a demo takes none unless its definition opens it to files'
);

-- E, a demo opened to files: Eden's sick note, a PDF.
select pg_temp.reserve('demo-file', 'eden', pg_temp.biz_e(), 'from_person', 50000, '2026-11-05 09:00+00');
select pg_temp.put(pg_temp.up('demo-file', 'path'), 50000, 'application/pdf', '2026-11-05 09:00+00');
select throws_ok(
  $$select public.send_document(pg_temp.person('eden'), pg_temp.biz_e(), 'from_person', 'sick_note',
    'A title', null, null, false, pg_temp.up('demo-file', 'upload')::uuid, 'sick_note',
    '2026-11-05 09:01+00')$$,
  '22023', 'A demo document is a sample or a file', 'a demo document is a sample or a file, never both'
);
select throws_ok(
  $$select public.send_document(pg_temp.person('eden'), pg_temp.biz_e(), 'from_person', 'sick_note',
    'A title', 'I feel ill', null, false, pg_temp.up('demo-file', 'upload')::uuid, null,
    '2026-11-05 09:01+00')$$,
  '22023', 'A demo document takes no note', 'and takes no note with a file either'
);
insert into ids values ('demo-file', public.send_document(pg_temp.person('eden'), pg_temp.biz_e(),
  'from_person', 'sick_note', 'Something a visitor typed', null, null, false,
  pg_temp.up('demo-file', 'upload')::uuid, null, '2026-11-05 09:02+00'));
select is(
  (select d.title || '|' || coalesce(d.note, '-') || '|' || coalesce(d.sample, '-')
     || '|' || (d.file_path = pg_temp.up('demo-file', 'path'))::text
   from public.documents d where d.id = pg_temp.id_of('demo-file')),
  'אישור מחלה|-|-|true',
  'its file goes in, the database letting it, titled with its category''s words whatever was typed'
);

------------------------------------------------------------------------------
-- Room: a business's space for documents, and the project's 980 MB

select pg_temp.reserve('cap-late', 'tamar', pg_temp.biz_s(), 'from_person', 1048576,
  '2026-11-07 09:00+00');
-- S's documents hold its 50 MB, as the database's owner writes them.
insert into public.documents (business_id, direction, person_id, author_id, category, title,
  file_kind, file_path, file_size, sent_at)
select '8b000000-0000-4000-b000-000000000002', 'from_person', pg_temp.person('tamar'),
  pg_temp.person('tamar'), 'form', 'A form', 'pdf',
  '8b000000-0000-4000-b000-000000000002/' || md5('space' || g::text) || '.pdf', 10485760,
  '2026-11-07 08:00+00'
from generate_series(1, 5) as g;
select is(
  pg_temp.refusal($$select pg_temp.reserve('cap-full', 'tamar', pg_temp.biz_s(), 'from_person', 1000,
    '2026-11-07 09:01+00')$$),
  '54000/space No room for this business''s documents',
  'past its space no new document is taken, with the hint the server reads as full: none is ever deleted for room'
);
select pg_temp.put(pg_temp.up('cap-late', 'path'), 1048576, 'application/pdf', '2026-11-07 09:00+00');
select is(
  pg_temp.refusal($$select pg_temp.send('cap-late', 'tamar', pg_temp.biz_s(), 'from_person', 'form',
    'cap-late', null, false, '2026-11-07 09:02+00')$$),
  '54000/space No room for this business''s documents',
  'and one reserved before the room ran out is not sent either, with the same hint'
);
update public.business_modules set settings = '{"documentSpaceMb": 100}'
where business_id = '8b000000-0000-4000-b000-000000000002' and module_key = 'chat';
select lives_ok(
  $$select pg_temp.send('cap-late', 'tamar', pg_temp.biz_s(), 'from_person', 'form', 'cap-late',
    null, false, '2026-11-07 09:03+00')$$,
  'with the 100 MB the team may choose, it goes'
);

-- A person's places: 30 a minute (chat's and documents' together), and 10
-- PDFs waiting to be sent from the day. Yoav, on days of their own.
select count(public.reserve_document_upload(pg_temp.person('yoav'), pg_temp.biz_r(), 'from_person',
  'image', 'image/webp', 1000, null, '2026-11-08 10:00+00'))
from generate_series(1, 30);
select is(
  pg_temp.refusal($$select public.reserve_document_upload(pg_temp.person('yoav'), pg_temp.biz_r(),
    'from_person', 'image', 'image/webp', 1000, null, '2026-11-08 10:00+00')$$),
  '54000/- Too many in a minute',
  'a 31st place in a minute is refused, with no hint: too fast'
);
select count(public.reserve_document_upload(pg_temp.person('yoav'), pg_temp.biz_r(), 'from_person',
  'pdf', 'application/pdf', 1000, 'page.pdf', '2026-11-08 12:00+00'))
from generate_series(1, 10);
select is(
  pg_temp.refusal($$select public.reserve_document_upload(pg_temp.person('yoav'), pg_temp.biz_r(),
    'from_person', 'pdf', 'application/pdf', 1000, 'page.pdf', '2026-11-08 12:00+00')$$),
  '54000/pdfs Too many PDFs waiting to be sent',
  'and an 11th PDF waiting to be sent, with the hint the server reads as too many'
);

-- The project's Storage at 950 MB, as postgres.
select pg_temp.put('zz-guard/big.bin', 996147200, 'application/pdf', '2026-11-20 08:00+00');
select throws_ok(
  $$select public.reserve_chat_upload(pg_temp.person('noa'), pg_temp.biz_r(), 'image', 'image/webp',
    1000, (select c.id from public.chat_conversations c
           where c.business_id = pg_temp.biz_r() and c.kind = 'team'),
    at_time => '2026-11-20 09:00+00')$$,
  '54000', 'No room for files', 'at 950 MB of Storage a chat file is refused'
);
select lives_ok(
  $$select pg_temp.reserve('guard-ok', 'noa', pg_temp.biz_r(), 'from_person', 1000,
    '2026-11-20 09:00+00', 'image', 'image/webp')$$,
  'while a document still goes'
);
select pg_temp.put('zz-guard/more.bin', 31457280, 'application/pdf', '2026-11-20 08:00+00');
select is(
  pg_temp.refusal($$select pg_temp.reserve('guard-full', 'noa', pg_temp.biz_r(), 'from_person', 1000,
    '2026-11-20 09:01+00', 'image', 'image/webp')$$),
  '54000/storage No room for files',
  'until Storage holds 980 MB, with the hint the server reads as no room'
);
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'documents' and name like 'zz-guard/%';

------------------------------------------------------------------------------
-- What nothing points at

select ok(
  (select count(*) = 2 from public.expired_files('2026-11-07 00:00+00', 1000) e
   where e.bucket = 'documents'
     and e.path in (pg_temp.up('payslip', 'path'), pg_temp.up('x-old', 'path'))),
  'a day on, a file left in the documents bucket with nothing pointing at it, and a place never sent, are due'
);

------------------------------------------------------------------------------
-- Kept

select throws_ok(
  $$delete from public.documents where id = pg_temp.id_of('sick')$$,
  '42501', 'Documents are kept: nothing deletes them',
  'nothing deletes a document, the database''s owner included'
);
select throws_ok(
  $$delete from public.document_recipients where document_id = pg_temp.id_of('procedure')$$,
  '42501', 'Documents are kept: nothing deletes them', 'nor whom it went to'
);
select private.purge_business_records(pg_temp.biz_r());
select is(
  (select count(*)::integer from public.documents d where d.business_id = pg_temp.biz_r())
  || '/' || (select count(*)::integer from public.document_recipients r where r.business_id = pg_temp.biz_r())
  || '/' || (select count(*)::integer from public.documents d where d.business_id = pg_temp.biz_s()),
  '0/0/8',
  'the demo reset''s purge deletes a business''s documents and whom they went to, and nothing of another'
);

select * from finish();
rollback;
