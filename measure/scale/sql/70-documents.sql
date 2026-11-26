-- 70-documents: a procedure to everyone, asking for "קראתי", and months of
-- payslips, one person each.
--
-- Each with its file's place (private.file_uploads, used) and a
-- storage.objects row of the sample's size, as the Storage API writes one
-- and supabase/tests/database/documents.test.sql puts them: the business's
-- space is the sum of documents.file_size, and the console reads Storage's
-- rows. No bytes are uploaded here (the measuring run's PR 3a uploads the
-- month the ZIP reads), so removal deletes these rows by SQL (clean.ts).

-- step: uploads
insert into private.file_uploads (
  id, business_id, owner_id, target, conversation_id, bucket, path, thumb_path, file_kind,
  file_type, declared_size, file_name, created_at, used_at
)
select r.id, r.business, r.author, 'document', null, 'documents', r.path, null, 'pdf',
  'application/pdf', r.file_size, r.file_name, r.sent_at - interval '1 minute', r.sent_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, author uuid, path text, file_size integer, file_name text,
    sent_at timestamptz);

-- step: objects
insert into storage.objects (bucket_id, name, metadata, created_at, updated_at)
select 'documents', r.path,
  jsonb_build_object('size', r.file_size, 'mimetype', 'application/pdf'),
  r.sent_at - interval '1 minute', r.sent_at - interval '1 minute'
from jsonb_to_recordset($1::jsonb)
  as r (path text, file_size integer, sent_at timestamptz);

-- step: documents
insert into public.documents (
  id, business_id, direction, person_id, author_id, category, title, note, file_kind,
  file_path, file_name, file_size, sample, asks_confirmation, sent_at
)
select r.id, r.business, 'to_people', null, r.author, r.category, r.title, null, 'pdf',
  r.path, r.file_name, r.file_size, null, r.asks, r.sent_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, author uuid, category text, title text, path text,
    file_name text, file_size integer, asks boolean, sent_at timestamptz);

-- step: recipients
insert into public.document_recipients (
  document_id, business_id, person_id, opened_at, confirmed_at
)
select r.document, r.business, r.person, r.opened_at, r.confirmed_at
from jsonb_to_recordset($1::jsonb)
  as r (document uuid, business uuid, person uuid, opened_at timestamptz,
    confirmed_at timestamptz);
