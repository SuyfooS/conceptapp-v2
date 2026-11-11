-- Official documents (C6 of the chat plan; Orel's answers of 11 November 2026
-- on issue #1): in the database, with no screen yet. The screens, the sample
-- files (public/demo-documents/) and the /document-files route that serves
-- them come with C7.
--
--   two ways     a worker (anyone on the staff) sends a document to the
--                business (`from_person`: a sick note, a form, another
--                document); an owner, a holder of chat.send_documents
--                (managers by default) or someone in the office sends one to
--                people (`to_people`: a payslip, a contract, a procedure, a
--                form, another document), to people the screen picks (one, a
--                department or everyone, at most 200), asking for "קראתי" or
--                not.
--   the office   the business's active members who hold clock.payroll:
--                owners and accountants always, managers (or anyone on the
--                staff) when the owner gives it (private.in_office). They read
--                every document of the business. A manager without pay access
--                reads no worker's document and learns nothing of one: no
--                line, no row of the log.
--   who reads    a document to the business: its person, and the office. One
--                to people: its recipients, its sender and the office. The
--                sender and the office while they are active members; its
--                person and its recipients through any membership row of
--                theirs, active or not, so someone who left keeps their
--                payslips and sick notes (read only: every write asks for an
--                active member). A removed one only the office and its sender
--                read. Nothing has a branch for the ConceptApp team or a view
--                session (private.sees_document), and the server role reads
--                neither table, so no console page can.
--   kept         forever, while the project lasts (the free plan has no
--                backups: C7's office screen says once that the business
--                should keep its own copy, and offers "הורדת כל המסמכים").
--                Nothing deletes a row: on delete restrict to the business and
--                the people, a trigger that refuses deletes but under the demo
--                reset's purge (private.purge_business_records, replaced once
--                here), and truncate for nobody. Documents are never deleted
--                for space: past a business's `documentSpaceMb` (50 MB unless
--                the team chose 100 or 200) new ones are refused (54000 with
--                hint 'space'), and across the project only past 980 MB of
--                Storage (hint 'storage'; chat files stop at 900).
--   removing     a document's FILE, never its row: its sender within 10
--                minutes of sending ('taken_back', the "ביטול" after sending),
--                or the office with a reason from a list ('wrong_person',
--                'wrong_file', 'duplicate', 'other'; never free text, which
--                could carry the very health details it removes). Whoever
--                removed it puts it back within 10 minutes; then the chat job
--                lists the file (public.expired_files), the app removes it
--                from Storage and public.forget_files clears its path.
--   the log      document.send, document.open (each opening by the office of
--                someone else's document, once a day per reader: the access
--                log of reg 10, plan §15), document.remove and
--                document.restore, with ids and codes only, never a category,
--                a title, a note or a file's name. Read by the office alone:
--                managers keep every other row but these
--                (the policy "managers read the log, pay holders the pay
--                rows", replaced once here), and no view session reads any of
--                them (C1's private.is_private_action).
--   lines        documents.received to the office, documents.sent or
--                documents.to_confirm to each recipient, with params
--                {document, from} only: a line outlives its reader's pay
--                access, so "אישור מחלה" in it would outlive the right to know
--                it. The office's first opening settles documents.received for
--                all of it; a recipient's opening their documents.sent, their
--                confirming their documents.to_confirm; removing every line of
--                the document; and losing clock.payroll (permission.revoke)
--                one's own documents.received (audit_log_settles_documents).
--   files        bucket `documents`: private, 10 MiB, a JPEG or WebP photo of
--                a page (at most 700 KB, made on the phone in C7) or a PDF, in
--                `<business>/<32 hex>.<pdf|webp|jpg>`, a path that names
--                neither the person nor the category. No browser writes: the
--                server reserves a place (public.reserve_document_upload),
--                uploads a photo itself or gives the browser a signed upload
--                for a PDF, as C4 and C5 do for chat, and sends the document
--                with it (public.send_document). Read under the reader's own
--                session by whoever reads the document, never a removed one
--                past its 10 minutes.
--   demo         a demo business takes no uploaded file unless its definition
--                says "chatFiles": true (public.documents_closed, the trigger
--                documents_demo_file), only samples (`sample`, refused
--                anywhere else), no note, and the category's own words as the
--                title, whatever was typed: its rows outlive the visitors'
--                hour. The reset writes three samples (private.
--                seed_demo_documents, called from private.seed_demo_chat,
--                which is replaced once more for it; the reset is not): a
--                payslip from the accountant to the first worker, a procedure
--                from the manager to everyone asking for "קראתי" and
--                confirmed by the second worker, and a sick note from the
--                first worker, opened by the owner. Both hosted demo
--                businesses start again.
--
-- Replaced here, each with create or replace and the same arguments, grants
-- and return: public.expired_files and public.forget_files (C4: documents'
-- files after their undo, and their orphans), public.chat_paths_signed (C5:
-- a document's PDF may still have a good signed upload too, so it is let go
-- with the tombstone), private.purge_business_records
-- (20261110001000_payroll_months.sql: documents and their recipients before
-- the log) and private.seed_demo_chat (C3: the documents' seed first, the rest
-- as it was). One policy of the log is altered. private.is_pay_action does
-- not change.

------------------------------------------------------------------------------
-- The bucket

-- Made from the dashboard before this ran, it is set to the same.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

------------------------------------------------------------------------------
-- The documents

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  direction text not null check (direction in ('to_people', 'from_person')),
  -- from_person: whose document it is (its sender). to_people: null; its
  -- people are in document_recipients.
  person_id uuid references public.profiles (id) on delete restrict,
  author_id uuid references public.profiles (id) on delete set null,
  category text not null
    check (category in ('sick_note', 'payslip', 'contract', 'procedure', 'form', 'other')),
  title text not null check (char_length(title) between 1 and 80 and title = btrim(title)),
  note text check (char_length(note) between 1 and 300 and note = btrim(note)),
  file_kind text check (file_kind in ('image', 'pdf')),
  file_path text unique,
  file_name text check (char_length(file_name) between 1 and 120),
  file_size integer check (file_size between 1 and 10485760),
  -- A demo business's sample, served from the app's own files (C7).
  sample text check (sample in ('payslip', 'procedure', 'sick_note')),
  asks_confirmation boolean not null default false,
  sent_at timestamptz not null default now(),
  -- from_person: the first opening by someone in the office.
  opened_at timestamptz,
  opened_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  -- A choice, never free text: a reason typed here could carry the very
  -- health details it removes. 'taken_back': its sender's "ביטול" in their
  -- first 10 minutes.
  removed_reason text check (removed_reason in
    ('taken_back', 'wrong_person', 'wrong_file', 'duplicate', 'other')),
  -- The file waits this long for the undo, then the chat job removes it.
  file_gone_after timestamptz,
  unique (id, business_id),
  foreign key (business_id, person_id) references public.memberships (business_id, user_id),
  check ((direction = 'from_person') = (person_id is not null)),
  check (direction = 'to_people' or not asks_confirmation),
  check (case direction
    when 'from_person' then category in ('sick_note', 'form', 'other')
    else category <> 'sick_note' end),
  check ((file_path is null) = (file_kind is null)),
  check (removed_at is not null or file_path is not null or sample is not null),
  check (file_path is null or sample is null),
  check ((removed_at is null) = (file_gone_after is null)),
  check (removed_at is null or removed_reason is not null)
);

create index documents_person_idx on public.documents (business_id, person_id, sent_at desc);
create index documents_business_idx on public.documents (business_id, sent_at desc);
create index documents_person_id_idx on public.documents (person_id);
create index documents_author_idx on public.documents (author_id, sent_at);
create index documents_opened_by_idx on public.documents (opened_by);
create index documents_removed_by_idx on public.documents (removed_by);
-- The files waiting for the job once their undo is over.
create index documents_gone_idx on public.documents (file_gone_after)
  where removed_at is not null and file_path is not null;

create table public.document_recipients (
  document_id uuid not null,
  business_id uuid not null,
  person_id uuid not null references public.profiles (id) on delete restrict,
  opened_at timestamptz,
  confirmed_at timestamptz,
  primary key (document_id, person_id),
  foreign key (document_id, business_id)
    references public.documents (id, business_id) on delete restrict,
  foreign key (business_id, person_id) references public.memberships (business_id, user_id),
  check (confirmed_at is null or opened_at is not null)
);

create index document_recipients_document_idx
  on public.document_recipients (document_id, business_id);
create index document_recipients_person_idx on public.document_recipients (business_id, person_id);
create index document_recipients_person_id_idx on public.document_recipients (person_id);

alter table public.documents enable row level security;
alter table public.document_recipients enable row level security;

-- Every write goes through the functions below. The browser reads under the
-- policies; the server role reads nothing at all, so no console page or
-- script with the secret key reads a document. A truncate would skip the
-- triggers below, so nobody but the owner may.
revoke all on public.documents, public.document_recipients from anon, authenticated, service_role;
grant select on public.documents, public.document_recipients to authenticated;

comment on table public.documents is
  'Official documents: a worker''s to the business (a sick note, a form), read by its person and the office (owners and clock.payroll holders), and the business''s to people (a payslip, a procedure), read by its recipients, its sender and the office. Never by a manager without pay access, the ConceptApp team or a view session. Kept forever: written only by the document functions, its file removed only with a reason and undo, the row never deleted but by a demo reset (private.purge_business_records).';
comment on table public.document_recipients is
  'Who a document to people went to, and when each opened and confirmed it: read by that person while they read the document, and by its sender and the office. Written only by the document functions; deleted only by a demo reset.';

------------------------------------------------------------------------------
-- Nothing deletes them

-- But a purge that names the business (private.deleting_allowed, every
-- comparison wrapped, so a fresh session fails closed).
create function private.refuse_document_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.deleting_allowed(old.business_id, null::uuid) then
    raise exception 'Documents are kept: nothing deletes them' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger documents_kept before delete on public.documents
  for each row execute function private.refuse_document_delete();
create trigger document_recipients_kept before delete on public.document_recipients
  for each row execute function private.refuse_document_delete();

------------------------------------------------------------------------------
-- Demo businesses

-- A demo business that takes no uploaded document: the same as for chat files
-- (anyone at the demo door is any of its people, and the reset can't remove
-- Storage files). Open when its definition says "chatFiles": true (the local
-- seed's restaurant, for the browser tests; never a hosted one).
create function private.documents_closed(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.chat_files_closed(business)
$$;

-- The same question, for the server before an upload (secret key).
create function public.documents_closed(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.documents_closed(business)
$$;

-- Whoever writes it: a new file in a demo business that takes none, and a
-- sample anywhere but a demo business, are refused (55000). Clearing a file
-- (the job, once a removal's undo is over) stays allowed.
create function private.refuse_demo_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sample is not null
    and not exists (select 1 from private.demo_businesses d where d.business_id = new.business_id)
  then
    raise exception 'Samples are for demo businesses' using errcode = '55000';
  end if;
  if new.file_path is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.file_path is not distinct from old.file_path then
      return new;
    end if;
  end if;
  if private.documents_closed(new.business_id) then
    raise exception 'Demo businesses take no files' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger documents_demo_file
  before insert or update of file_path, sample on public.documents
  for each row execute function private.refuse_demo_document();

-- A category's own words (app.chat.documents.categories in messages/he.json):
-- a demo document's title, whatever was typed.
create function private.document_title(of_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case of_category
    when 'sick_note' then 'אישור מחלה'
    when 'payslip' then 'תלוש שכר'
    when 'contract' then 'חוזה'
    when 'procedure' then 'נוהל'
    when 'form' then 'טופס'
    when 'other' then 'מסמך אחר'
  end
$$;

------------------------------------------------------------------------------
-- Who

-- Documents are on for the business: today, chat is on. The one gate every
-- document policy and function asks, so documents can become a module of
-- their own (plan §19) by changing this function alone.
create function private.documents_on(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.module_enabled(business, 'chat'::public.module_key)
$$;

-- `person` is in the business's office: an active member holding
-- clock.payroll (owners and accountants always, managers and anyone on the
-- staff when the owner gives it). private.holds_perm has no branch for a view
-- session, and nothing built on it here has one.
create function private.in_office(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'clock.payroll')
$$;

-- The office: those a document to the business tells.
create function private.office_people(business uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[])
  from public.memberships m
  where m.business_id = business
    and m.active
    and private.holds_perm(business, m.user_id, 'clock.payroll')
$$;

-- `person` sends documents to people: an owner, a holder of
-- chat.send_documents (managers by default), or someone in the office (so an
-- accountant sends payslips).
create function private.sends_documents(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'chat.send_documents')
    or private.in_office(business, person)
$$;

-- `person` reads the document, with documents on for its business: the
-- office, and its sender, while they are active members; its own person (to
-- the business) and its recipients (to people) through any membership row of
-- theirs, active or not, so someone who left keeps their own (read only).
-- A removed one only the office and its sender read. Nothing for the
-- ConceptApp team or a view session.
create function private.sees_document(document uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = document
      and private.documents_on(d.business_id)
      and (
        private.in_office(d.business_id, person)
        or (
          d.author_id = person
          and exists (
            select 1
            from public.memberships m
            where m.business_id = d.business_id and m.user_id = person and m.active
          )
        )
        or (
          d.removed_at is null
          and (
            d.person_id = person
            or exists (
              select 1
              from public.document_recipients r
              where r.document_id = d.id and r.person_id = person
            )
          )
        )
      )
  )
$$;

-- The office, or its sender while an active member: who sees every
-- recipient's opened and confirmed marks.
create function private.manages_document(document uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = document
      and private.documents_on(d.business_id)
      and (
        private.in_office(d.business_id, person)
        or (
          d.author_id = person
          and exists (
            select 1
            from public.memberships m
            where m.business_id = d.business_id and m.user_id = person and m.active
          )
        )
      )
  )
$$;

------------------------------------------------------------------------------
-- Reading

create policy "people read the documents that are theirs to read"
  on public.documents for select to authenticated
  using (private.sees_document(id, (select auth.uid())));

-- One's own mark while one reads the document; every mark for its sender and
-- the office.
create policy "recipients read their own marks, senders and the office all of them"
  on public.document_recipients for select to authenticated
  using (
    (person_id = (select auth.uid()) and private.sees_document(document_id, person_id))
    or private.manages_document(document_id, (select auth.uid()))
  );

-- The signed-in person may read the file `object_name` of the documents
-- bucket: `<business>/<32 hex>.<pdf|webp|jpg>`, a document of that business
-- pointing at it, which they read (private.sees_document: no branch for the
-- team or a view session), not removed, or removed less than 10 minutes ago
-- (for its undo: then only the office and its sender read it). Anything else,
-- and any other shape, is false: strict ids, so a name of dashes is false
-- before any cast, never an error inside the policy.
create function private.can_read_document(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reader uuid := (select auth.uid());
begin
  if object_name is null
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.(pdf|webp|jpg)$'
  then
    return false;
  end if;
  return exists (
    select 1
    from public.documents d
    where d.file_path = object_name
      and d.business_id = split_part(object_name, '/', 1)::uuid
      and (d.removed_at is null or d.file_gone_after > now())
      and private.sees_document(d.id, reader)
  );
end;
$$;

create policy "people read the files of the documents they read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.can_read_document(name));

------------------------------------------------------------------------------
-- Room

-- Past this, no new document is taken (980 MB of the free plan's 1 GB; chat
-- files stop at 900, private.files_guard_bytes): documents are never deleted
-- for space, so they get the last of it.
create function private.documents_guard_bytes()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 1027604480::bigint
$$;

-- The business's space for documents (`documentSpaceMb`, the team's: 50, 100
-- or 200 MB; anything else stored counts as 50), in bytes.
create function private.document_space_bytes(business uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (case private.chat_settings(business) ->> 'documentSpaceMb'
      when '100' then 100::bigint when '200' then 200::bigint else 50::bigint
    end) * 1048576
$$;

-- What the business's documents hold in Storage: every one whose file is
-- still there, a removed one waiting for its undo included.
create function private.documents_held_bytes(business uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(d.file_size::bigint), 0::bigint)::bigint
  from public.documents d
  where d.business_id = business and d.file_path is not null
$$;

-- A document's place has no conversation and no thumbnail (a photo of a page
-- is one file), and is in its own bucket.
alter table private.file_uploads add constraint file_uploads_document_place
  check (target <> 'document' or (bucket = 'documents' and conversation_id is null
    and thumb_path is null));

------------------------------------------------------------------------------
-- Reserving a document's place

-- `actor` is about to send a document (`upload_direction`: 'from_person' for
-- someone on the staff, 'to_people' for one who sends documents to people): a
-- photo of a page (`upload_kind` 'image', a JPEG or WebP of at most 700 KB,
-- which the server uploads itself) or a PDF (at most 10 MiB, through a signed
-- upload), of `upload_size` bytes, with a name for a PDF (`upload_name`,
-- cleaned by the server, ending in .pdf). Refused: documents off (55000), not
-- one who may send that way (42501), a direction, kind, type, size or name it
-- doesn't take (22023), a demo business that takes no files (55000), a 31st
-- place in a minute (54000, chat's and documents' together), an 11th PDF
-- unsent from the day (54000 with hint 'pdfs', the same count as chat's), the
-- business's documents past its `documentSpaceMb` with this one and those on
-- their way (54000 with hint 'space'; never evicted), and the project's
-- Storage past 980 MB (54000 with hint 'storage'). A person's places are
-- counted one at a time (chat's lock), and a business's documents too. Writes
-- no log row. Returns {upload, path}: where the file goes, under a fresh
-- random key that names neither the person nor the category.
create function public.reserve_document_upload(
  actor uuid,
  business uuid,
  upload_direction text,
  upload_kind text,
  upload_type text,
  upload_size integer,
  upload_name text default null,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  file_ext text;
  file_key text;
  saved private.file_uploads%rowtype;
  clean_name text := nullif(btrim(coalesce(upload_name, '')), '');
begin
  if not private.documents_on(business) then
    raise exception 'Documents are off for this business' using errcode = '55000';
  end if;
  if upload_direction = 'from_person' then
    if not private.chat_staff(business, actor) then
      raise exception 'Not on the staff' using errcode = '42501';
    end if;
  elsif upload_direction = 'to_people' then
    if not private.sends_documents(business, actor) then
      raise exception 'Not one who sends documents' using errcode = '42501';
    end if;
  else
    raise exception 'To the business or to people' using errcode = '22023';
  end if;
  -- One person's places one at a time, chat's and documents' together.
  perform pg_advisory_xact_lock(hashtextextended('chat_upload:' || actor::text, 0));
  file_ext := case
    when upload_kind = 'image' and upload_type = 'image/webp' then 'webp'
    when upload_kind = 'image' and upload_type = 'image/jpeg' then 'jpg'
    when upload_kind = 'pdf' and upload_type = 'application/pdf' then 'pdf'
  end;
  if file_ext is null then
    raise exception 'A photo is a JPEG or a WebP, a document a PDF' using errcode = '22023';
  end if;
  -- In parentheses: PL/pgSQL ends an IF's condition at its first THEN.
  if upload_size is null or upload_size < 1
    or upload_size > (case when upload_kind = 'image' then 716800 else 10485760 end)
  then
    raise exception 'Too large a file' using errcode = '22023';
  end if;
  if clean_name is not null
    and (char_length(clean_name) > 120 or clean_name ~ '[[:cntrl:]/\\]')
  then
    raise exception 'A file''s name is at most 120 characters, with no folder' using errcode = '22023';
  end if;
  if upload_kind = 'pdf' and clean_name is not null and clean_name !~* '\.pdf$' then
    raise exception 'A PDF''s name ends in .pdf' using errcode = '22023';
  end if;
  if private.documents_closed(business) then
    raise exception 'Demo businesses take no files' using errcode = '55000';
  end if;

  -- The minute up to `at_time`: a place stamped later is no part of it.
  if (
    select count(*)
    from private.file_uploads u
    where u.owner_id = actor
      and u.created_at > at_time - interval '1 minute'
      and u.created_at <= at_time
  ) >= 30 then
    raise exception 'Too many in a minute' using errcode = '54000';
  end if;
  -- PDF places never sent that hold a file (more than a tombstone), or, with
  -- nothing there, whose signed upload may still be good: chat's count.
  if upload_kind = 'pdf' and (
    select count(*)
    from private.file_uploads u
    where u.owner_id = actor
      and u.file_kind = 'pdf'
      and u.used_at is null
      and u.created_at > at_time - interval '1 day'
      and u.created_at <= at_time
      and coalesce(
        private.stored_bytes(u.bucket, u.path) > 1,
        u.created_at > at_time - interval '2 hours 5 minutes'
      )
  ) >= 10 then
    raise exception 'Too many PDFs waiting to be sent' using errcode = '54000', hint = 'pdfs';
  end if;

  -- The business's documents one at a time, for its space.
  perform pg_advisory_xact_lock(hashtextextended('documents:' || business::text, 0));
  if private.documents_held_bytes(business)
    + (
      select coalesce(sum(u.declared_size::bigint), 0::bigint)::bigint
      from private.file_uploads u
      where u.business_id = business
        and u.target = 'document'
        and u.used_at is null
        and u.created_at > at_time - interval '2 hours'
        and u.created_at <= at_time
    )
    + upload_size::bigint > private.document_space_bytes(business)
  then
    raise exception 'No room for this business''s documents' using errcode = '54000', hint = 'space';
  end if;
  if private.storage_used() + private.uploads_on_their_way(at_time)
    + (case when upload_kind = 'pdf' then 10485760::bigint else upload_size::bigint end)
    > private.documents_guard_bytes()
  then
    raise exception 'No room for files' using errcode = '54000', hint = 'storage';
  end if;

  file_key := replace(gen_random_uuid()::text, '-', '');
  insert into private.file_uploads (
    business_id, owner_id, target, conversation_id, bucket, path, thumb_path,
    file_kind, file_type, declared_size, file_name, created_at
  )
  values (
    business, actor, 'document', null, 'documents',
    business::text || '/' || file_key || '.' || file_ext, null,
    upload_kind, upload_type, upload_size, clean_name, at_time
  )
  returning * into saved;

  return jsonb_build_object('upload', saved.id, 'path', saved.path);
end;
$$;

-- `actor`'s own document place `upload` in `business`, as the server needs it
-- to finish a PDF the browser PUT through its signed upload: its path (which
-- the server reads and, on any refusal, removes: never a path the browser
-- names), its kind, the size and name reserved, whether it was sent (`used`,
-- with the document it went to: a retry whose answer was lost) and whether
-- its 2 hours are still on at `at_time` (`fresh`). Null for anyone else's
-- place, another business's, a chat file's, or none. Writes nothing.
create function public.document_upload_place(
  actor uuid,
  business uuid,
  upload uuid,
  at_time timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'upload', u.id,
    'path', u.path,
    'kind', u.file_kind,
    'size', u.declared_size,
    'name', u.file_name,
    'used', u.used_at is not null,
    'document', (
      select d.id from public.documents d
      where d.file_path = u.path and d.author_id = actor
    ),
    'fresh', u.created_at >= at_time - interval '2 hours'
  )
  from private.file_uploads u
  where u.id = upload
    and u.owner_id = actor
    and u.business_id = business
    and u.target = 'document'
    and u.bucket = 'documents'
$$;

-- The place `upload`, checked for `actor`'s document in `business` at
-- `at_time` and locked: theirs, a document's, in this business, unused, made
-- in the last 2 hours (how long Storage's signed upload is good for), in a
-- business that takes files, and with its file in the bucket at the type
-- reserved, within its kind's size (a photo 700 KB, a PDF 10 MiB) and the
-- size reserved. 22023 for anything else, 55000 in a demo business that
-- takes no files. Returns it, for the document's file columns.
create function private.attach_document_upload(
  upload uuid,
  actor uuid,
  business uuid,
  at_time timestamptz
)
returns private.file_uploads
language plpgsql
security definer
set search_path = ''
as $$
declare
  held private.file_uploads%rowtype;
  stored_size bigint;
  stored_type text;
begin
  select u.* into held from private.file_uploads u where u.id = upload for update;
  if not found
    or held.owner_id is distinct from actor
    or held.business_id is distinct from business
    or held.target <> 'document'
    or held.bucket <> 'documents'
  then
    raise exception 'Unknown file' using errcode = '22023';
  end if;
  if held.used_at is not null then
    raise exception 'The file was sent already' using errcode = '22023';
  end if;
  if held.created_at < at_time - interval '2 hours' then
    raise exception 'The file waited too long' using errcode = '22023';
  end if;
  if private.documents_closed(held.business_id) then
    raise exception 'Demo businesses take no files' using errcode = '55000';
  end if;

  select
    case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
      then (o.metadata ->> 'size')::bigint end,
    o.metadata ->> 'mimetype'
  into stored_size, stored_type
  from storage.objects o
  where o.bucket_id = 'documents' and o.name = held.path;
  if stored_size is null or stored_size < 1 or stored_type is distinct from held.file_type
    or stored_size > (case when held.file_kind = 'image' then 716800 else 10485760 end)
  then
    raise exception 'The file is not in place' using errcode = '22023';
  end if;
  if stored_size <> held.declared_size then
    raise exception 'The file is not the size reserved' using errcode = '22023';
  end if;
  return held;
end;
$$;

------------------------------------------------------------------------------
-- Sending

-- `actor` sends a document: to the business (`send_direction` 'from_person',
-- anyone on the staff, a sick note, a form or another document), or to people
-- (`send_to`, 'to_people', one who sends documents: a payslip, a contract, a
-- procedure, a form or another document, asking for "קראתי" when `asks`).
-- Its file is the place `upload` (public.reserve_document_upload) the server
-- put in place, or in a demo business a `send_sample`. Every rule is checked
-- before the row is written, so a refused document never reaches the
-- Postgres log with its title. Refused: documents off (55000); not one who
-- may send that way (42501); a category the direction doesn't take, people
-- who aren't someone else active on the staff (or none, or more than 200),
-- "קראתי" asked of the business, a title of no or more than 80 characters or
-- with a control character, a note over 300, no file (22023); a sample
-- anywhere but a demo business (55000); in a demo business, a note, neither
-- a file nor a sample, or a sample not of its category (22023), and its
-- title is the category's own words whatever was typed; the place refused
-- as private.attach_document_upload says; a 31st document in a minute, and
-- a demo business's 101st in an hour (54000); and the business's documents
-- past its `documentSpaceMb` with this one (54000 with hint 'space'). Tells
-- the office (documents.received) or each recipient (documents.sent, or
-- documents.to_confirm when it asks), with params {document, from} only, and
-- logs document.send {document, direction, recipients: a count}. Returns the
-- document's id.
create function public.send_document(
  actor uuid,
  business uuid,
  send_direction text,
  send_category text,
  send_title text,
  send_note text default null,
  send_to uuid[] default null,
  asks boolean default false,
  upload uuid default null,
  send_sample text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  held private.file_uploads%rowtype;
  in_demo boolean;
  clean_title text := nullif(regexp_replace(coalesce(send_title, ''), '^\s+|\s+$', '', 'g'), '');
  clean_note text := nullif(regexp_replace(coalesce(send_note, ''), '^\s+|\s+$', '', 'g'), '');
  people uuid[];
  asking boolean := coalesce(asks, false);
  sent uuid;
begin
  if not private.documents_on(business) then
    raise exception 'Documents are off for this business' using errcode = '55000';
  end if;

  if send_direction = 'from_person' then
    if not private.chat_staff(business, actor) then
      raise exception 'Not on the staff' using errcode = '42501';
    end if;
    if send_category is null or send_category not in ('sick_note', 'form', 'other') then
      raise exception 'Not a document for the business' using errcode = '22023';
    end if;
    if coalesce(cardinality(send_to), 0) > 0 then
      raise exception 'A document to the business goes to the office' using errcode = '22023';
    end if;
    if asking then
      raise exception 'Only a document to people asks for a confirmation' using errcode = '22023';
    end if;
  elsif send_direction = 'to_people' then
    if not private.sends_documents(business, actor) then
      raise exception 'Not one who sends documents' using errcode = '42501';
    end if;
    if send_category is null
      or send_category not in ('payslip', 'contract', 'procedure', 'form', 'other')
    then
      raise exception 'Not a document for people' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct p.person order by p.person), '{}'::uuid[])
    into people
    from unnest(coalesce(send_to, '{}'::uuid[])) as p (person)
    where p.person is not null;
    if cardinality(people) = 0 or cardinality(people) > 200 then
      raise exception 'One to 200 people' using errcode = '22023';
    end if;
    if actor = any (people) then
      raise exception 'Not to oneself' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(people) as p (person)
      where not private.chat_staff(business, p.person)
    ) then
      raise exception 'Only to people on the staff' using errcode = '22023';
    end if;
  else
    raise exception 'To the business or to people' using errcode = '22023';
  end if;

  in_demo := exists (select 1 from private.demo_businesses d where d.business_id = business);
  if in_demo then
    -- Its rows outlive the visitors' hour: nothing typed may sit in them.
    if clean_note is not null then
      raise exception 'A demo document takes no note' using errcode = '22023';
    end if;
    clean_title := private.document_title(send_category);
    if (upload is null) = (send_sample is null) then
      raise exception 'A demo document is a sample or a file' using errcode = '22023';
    end if;
    if send_sample is not null
      and (send_sample not in ('payslip', 'procedure', 'sick_note') or send_sample <> send_category)
    then
      raise exception 'A sample of its own category' using errcode = '22023';
    end if;
  elsif send_sample is not null then
    raise exception 'Samples are for demo businesses' using errcode = '55000';
  end if;

  if clean_title is null or char_length(clean_title) > 80 or clean_title ~ '[[:cntrl:]]' then
    raise exception 'A title of 1 to 80 characters' using errcode = '22023';
  end if;
  if char_length(clean_note) > 300 then
    raise exception 'A note of at most 300 characters' using errcode = '22023';
  end if;
  if upload is null and send_sample is null then
    raise exception 'A document is a file' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.documents d
    where d.author_id = actor
      and d.sent_at > at_time - interval '1 minute'
      and d.sent_at <= at_time
  ) >= 30 then
    raise exception 'Too many in a minute' using errcode = '54000';
  end if;
  if in_demo and (
    select count(*)
    from public.documents d
    where d.business_id = business
      and d.sent_at > at_time - interval '1 hour'
      and d.sent_at <= at_time
  ) >= private.chat_demo_per_hour() then
    raise exception 'Too many in this demo for now' using errcode = '54000';
  end if;

  if upload is not null then
    held := private.attach_document_upload(upload, actor, business, at_time);
    -- The business's documents one at a time: two sent at once never both
    -- pass its space.
    perform pg_advisory_xact_lock(hashtextextended('documents:' || business::text, 0));
    if private.documents_held_bytes(business) + held.declared_size::bigint
      > private.document_space_bytes(business)
    then
      raise exception 'No room for this business''s documents' using errcode = '54000', hint = 'space';
    end if;
  end if;

  insert into public.documents (
    business_id, direction, person_id, author_id, category, title, note,
    file_kind, file_path, file_name, file_size, sample, asks_confirmation, sent_at
  )
  values (
    business, send_direction,
    case when send_direction = 'from_person' then actor end,
    actor, send_category, clean_title, clean_note,
    held.file_kind, held.path, held.file_name, held.declared_size, send_sample,
    asking, at_time
  )
  returning id into sent;

  if send_direction = 'to_people' then
    insert into public.document_recipients (document_id, business_id, person_id)
    select sent, business, p.person
    from unnest(people) as p (person);
  end if;
  if upload is not null then
    update private.file_uploads u set used_at = at_time where u.id = held.id;
  end if;

  if send_direction = 'from_person' then
    perform private.notify(
      business, private.office_people(business), 'documents.received'::text,
      jsonb_build_object('document', sent, 'from', actor), actor,
      'chat'::public.module_key, 'worker'::public.member_role,
      'documents.' || sent::text, true, null::timestamptz, at_time
    );
  else
    perform private.notify(
      business, people,
      (case when asking then 'documents.to_confirm' else 'documents.sent' end)::text,
      jsonb_build_object('document', sent, 'from', actor), actor,
      'chat'::public.module_key, 'worker'::public.member_role,
      'documents.' || sent::text, true, null::timestamptz, at_time
    );
  end if;

  insert into public.audit_log (business_id, actor_id, action, details, created_at)
  values (
    business, actor, 'document.send',
    jsonb_build_object(
      'document', sent,
      'direction', send_direction,
      'recipients', coalesce(cardinality(people), 0)
    ),
    at_time
  );
  return sent;
end;
$$;

------------------------------------------------------------------------------
-- Opening and confirming

-- `actor` opens a document they read (P0002 otherwise: unknown and not yours
-- are the same answer), for the route that serves it. A recipient on the
-- staff: their mark (the first time), and their documents.sent line settled
-- (a documents.to_confirm one waits for "קראתי"). The office's first opening
-- of someone's document to the business: its opened_at and opened_by, and
-- documents.received settled for all of the office. Every opening by the
-- office of someone else's document (not their own, not one they sent, not
-- one sent to them) that serves something writes document.open {document,
-- person}, once per reader, document and day in the business's clock: the
-- access log, read by the office alone. Returns {document, business, path,
-- kind, name, sample}: `path` null once its file is gone, or removed more
-- than 10 minutes before.
create function public.open_document(
  actor uuid,
  document uuid,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents%rowtype;
  tz text;
  local_day date;
  as_recipient boolean;
  own boolean;
  serves boolean;
begin
  select d.* into doc from public.documents d where d.id = document for update;
  if not found or not private.sees_document(doc.id, actor) then
    raise exception 'Unknown document' using errcode = 'P0002';
  end if;
  as_recipient := exists (
    select 1 from public.document_recipients r
    where r.document_id = doc.id and r.person_id = actor
  );
  own := as_recipient
    or doc.author_id is not distinct from actor
    or doc.person_id is not distinct from actor;
  serves := doc.sample is not null
    or (doc.file_path is not null
      and (doc.removed_at is null or doc.file_gone_after > at_time));

  if as_recipient and doc.removed_at is null and private.chat_staff(doc.business_id, actor) then
    update public.document_recipients r
    set opened_at = at_time
    where r.document_id = doc.id and r.person_id = actor and r.opened_at is null;
    if not doc.asks_confirmation then
      perform private.settle_own_line(doc.business_id, actor, 'documents.' || doc.id::text, at_time);
    end if;
  end if;

  if doc.direction = 'from_person'
    and doc.removed_at is null
    and doc.opened_at is null
    and doc.person_id is distinct from actor
    and private.in_office(doc.business_id, actor)
  then
    update public.documents d
    set opened_at = at_time, opened_by = actor
    where d.id = doc.id;
    perform private.resolve_notifications(doc.business_id, 'documents.' || doc.id::text, at_time);
  end if;

  if serves and not own and private.in_office(doc.business_id, actor) then
    select coalesce(b.timezone, 'Asia/Jerusalem') into tz
    from public.businesses b
    where b.id = doc.business_id;
    -- The reader's day in the business's clock, as a range of the log's own
    -- created_at from its local midnight to the next (a DST day included),
    -- so audit_log_business_id_created_at_idx bounds the look to that day
    -- instead of every row the business ever logged.
    local_day := (at_time at time zone tz)::date;
    if not exists (
      select 1
      from public.audit_log a
      where a.business_id = doc.business_id
        and a.created_at >= ((local_day::timestamp) at time zone tz)
        and a.created_at < (((local_day + 1)::timestamp) at time zone tz)
        and a.actor_id = actor
        and a.action = 'document.open'
        and a.details ->> 'document' = doc.id::text
    ) then
      insert into public.audit_log (business_id, actor_id, action, details, created_at)
      values (
        doc.business_id, actor, 'document.open',
        jsonb_build_object('document', doc.id, 'person', doc.person_id),
        at_time
      );
    end if;
  end if;

  return jsonb_build_object(
    'document', doc.id,
    'business', doc.business_id,
    'path', case
      when doc.file_path is not null
        and (doc.removed_at is null or doc.file_gone_after > at_time)
      then doc.file_path
    end,
    'kind', doc.file_kind,
    'name', doc.file_name,
    'sample', doc.sample
  );
end;
$$;

-- `actor`, a recipient on the staff of a document that asks for it, presses
-- "קראתי ואישרתי": once (the first time stays), opened then too if it wasn't,
-- and their own line about it settled. P0002 for a document they don't read
-- (a plain recipient's removed one included: it is hidden from them, so to
-- them it is unknown), 22023 for one that asks for no confirmation, 55000
-- for a removed one to a recipient who still reads it (one in the office),
-- 42501 for anyone it wasn't sent to (and someone who left).
create function public.confirm_document(
  actor uuid,
  document uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents%rowtype;
begin
  select d.* into doc from public.documents d where d.id = document;
  if not found or not private.sees_document(doc.id, actor) then
    raise exception 'Unknown document' using errcode = 'P0002';
  end if;
  if not doc.asks_confirmation then
    raise exception 'This document asks for no confirmation' using errcode = '22023';
  end if;
  if doc.removed_at is not null then
    raise exception 'The document was removed' using errcode = '55000';
  end if;
  if not private.chat_staff(doc.business_id, actor)
    or not exists (
      select 1 from public.document_recipients r
      where r.document_id = doc.id and r.person_id = actor
    )
  then
    raise exception 'Only its recipients confirm it' using errcode = '42501';
  end if;

  update public.document_recipients r
  set opened_at = coalesce(r.opened_at, at_time),
    confirmed_at = coalesce(r.confirmed_at, at_time)
  where r.document_id = doc.id and r.person_id = actor;

  perform private.settle_own_line(doc.business_id, actor, 'documents.' || doc.id::text, at_time);
end;
$$;

------------------------------------------------------------------------------
-- Removing a document's file

-- `actor` removes a document's file, never its row: its sender, an active
-- member, within 10 minutes of sending it, as 'taken_back' (22023 for anyone
-- else, or later); the office with 'wrong_person', 'wrong_file', 'duplicate'
-- or 'other' (42501 for anyone else); any other reason 22023. The file waits
-- 10 minutes for public.restore_document (file_gone_after), then the job
-- removes it. Every line about the document is settled, and document.remove
-- {document, reason} is logged, the code only. P0002 for a document they
-- don't read; removing it again changes nothing.
create function public.remove_document(
  actor uuid,
  document uuid,
  reason text,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents%rowtype;
begin
  select d.* into doc from public.documents d where d.id = document for update;
  if not found or not private.sees_document(doc.id, actor) then
    raise exception 'Unknown document' using errcode = 'P0002';
  end if;
  if doc.removed_at is not null then
    return;
  end if;
  if reason = 'taken_back' then
    if doc.author_id is distinct from actor
      or at_time > doc.sent_at + interval '10 minutes'
      or not (private.chat_staff(doc.business_id, actor) or private.in_office(doc.business_id, actor))
    then
      raise exception 'Only its sender takes it back, in their first 10 minutes' using errcode = '22023';
    end if;
  elsif reason in ('wrong_person', 'wrong_file', 'duplicate', 'other') then
    if not private.in_office(doc.business_id, actor) then
      raise exception 'The owner or whoever prepares payroll removes it' using errcode = '42501';
    end if;
  else
    raise exception 'A reason from the list' using errcode = '22023';
  end if;

  update public.documents d
  set removed_at = at_time,
    removed_by = actor,
    removed_reason = reason,
    file_gone_after = at_time + interval '10 minutes'
  where d.id = doc.id;

  perform private.resolve_notifications(doc.business_id, 'documents.' || doc.id::text, at_time);

  insert into public.audit_log (business_id, actor_id, action, details, created_at)
  values (
    doc.business_id, actor, 'document.remove',
    jsonb_build_object('document', doc.id, 'reason', reason),
    at_time
  );
end;
$$;

-- Whoever removed a document's file puts it back before its file_gone_after
-- (55000 after, or once the file is gone; 42501 for anyone else). Those it
-- still waits for are told again: the office, when nobody there opened a
-- document to the business yet; the recipients who haven't opened it (or
-- confirmed it, when it asks). Logs document.restore {document}. P0002 for a
-- document they don't read; one not removed changes nothing.
create function public.restore_document(
  actor uuid,
  document uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents%rowtype;
  waiting uuid[];
begin
  select d.* into doc from public.documents d where d.id = document for update;
  if not found or not private.sees_document(doc.id, actor) then
    raise exception 'Unknown document' using errcode = 'P0002';
  end if;
  if doc.removed_at is null then
    return;
  end if;
  if doc.removed_by is distinct from actor then
    raise exception 'Only who removed it puts it back' using errcode = '42501';
  end if;
  if at_time >= doc.file_gone_after or (doc.file_path is null and doc.sample is null) then
    raise exception 'Too late to put it back' using errcode = '55000';
  end if;

  update public.documents d
  set removed_at = null,
    removed_by = null,
    removed_reason = null,
    file_gone_after = null
  where d.id = doc.id;

  if doc.direction = 'from_person' then
    if doc.opened_at is null then
      perform private.notify(
        doc.business_id, private.office_people(doc.business_id), 'documents.received'::text,
        jsonb_build_object('document', doc.id, 'from', doc.author_id), doc.author_id,
        'chat'::public.module_key, 'worker'::public.member_role,
        'documents.' || doc.id::text, true, null::timestamptz, at_time,
        array[actor]
      );
    end if;
  else
    select coalesce(array_agg(r.person_id order by r.person_id), '{}'::uuid[])
    into waiting
    from public.document_recipients r
    where r.document_id = doc.id
      and (case when doc.asks_confirmation then r.confirmed_at else r.opened_at end) is null;
    perform private.notify(
      doc.business_id, waiting,
      (case when doc.asks_confirmation then 'documents.to_confirm' else 'documents.sent' end)::text,
      jsonb_build_object('document', doc.id, 'from', doc.author_id), doc.author_id,
      'chat'::public.module_key, 'worker'::public.member_role,
      'documents.' || doc.id::text, true, null::timestamptz, at_time,
      array[actor]
    );
  end if;

  insert into public.audit_log (business_id, actor_id, action, details, created_at)
  values (
    doc.business_id, actor, 'document.restore',
    jsonb_build_object('document', doc.id),
    at_time
  );
end;
$$;

------------------------------------------------------------------------------
-- The activity log: rows about documents for the office alone

-- 20261110000300_payroll_access.sql's, with documents' rows moved from the
-- managers' side to the pay holders': a manager without pay access learns
-- nothing of a sick note, not even that one came; a manager with it reads
-- them as a pay holder. Managers keep chat.remove and every other row. The
-- view policy (C1) already keeps chat.* and document.* from every view.
alter policy "managers read the log, pay holders the pay rows" on public.audit_log
  using (
    (
      private.has_role(business_id, 'manager')
      and not private.is_pay_action(action)
      and action !~ '^document\.'
    )
    or (
      private.has_perm(business_id, 'clock.payroll')
      and (private.is_pay_action(action) or action ~ '^(clock|permission|document)\.')
    )
  );

comment on table public.audit_log is
  'Append-only record of what changed in a business: written only by server functions, never changed but for its actor going when their account does, deleted only by a demo reset (private.purge_business_records). Pay rows (wage.*, payroll.*) and rows about documents (document.*) are read by pay holders only (clock.payroll); rows about chats and documents (chat.*, document.*) never by a view session.';

------------------------------------------------------------------------------
-- Lines settled when pay access goes

-- Someone who no longer holds clock.payroll is no longer in the office: their
-- documents.received lines are settled, so nothing waits for them there. The
-- lines hold no category, so a stale one says only that a document came.
-- permission.revoke is the only way pay access goes today; "remove a person,
-- change a role" (docs/ROADMAP.md) must settle these too when it lands. It
-- never blocks the write that logged.
create function private.settle_documents_from_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    update public.notifications n
    set read_at = coalesce(n.read_at, new.created_at),
      resolved_at = new.created_at,
      push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
    where n.business_id = new.business_id
      and n.kind = 'documents.received'
      and n.resolved_at is null
      and not private.holds_perm(n.business_id, n.user_id, 'clock.payroll');
  exception when others then
    raise warning 'document lines for % (%) were not settled: %', new.action, new.id, sqlstate;
  end;
  return null;
end;
$$;

create trigger audit_log_settles_documents
  after insert on public.audit_log
  for each row
  when (new.action = 'permission.revoke')
  execute function private.settle_documents_from_log();

------------------------------------------------------------------------------
-- Keeping files: a removed document's file goes once its undo is over

-- C4's (20261111000500_chat_files.sql), the same for chat files, and the
-- documents' part: the file of a removed document past its file_gone_after;
-- a document's place never sent, after a day, as chat's; and anything in the
-- documents bucket older than a day, in its shape, that no document or open
-- place points at. A document is never listed for days or space: only its
-- removal sends its file away.
create or replace function public.expired_files(
  at_time timestamptz default now(),
  max_rows integer default 500
)
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select m.business_id, m.file_path, m.thumb_path, m.created_at,
      sum(m.file_size::bigint) over (
        partition by m.business_id
        order by m.created_at desc, m.id desc
        rows between unbounded preceding and current row
      ) as newer_bytes
    from public.chat_messages m
    where m.file_path is not null and m.file_removed_at is null
  ),
  caps as (
    select b.business_id,
      case x.settings ->> 'fileDays'
        when '30' then 30 when '180' then 180 else 90
      end as keep_days,
      case x.settings ->> 'fileSpaceMb'
        when '50' then 50::bigint when '200' then 200::bigint else 100::bigint
      end * 1048576 as space_bytes
    from (select distinct l.business_id from live l) b
    cross join lateral (select private.chat_settings(b.business_id) as settings) x
  ),
  owned as (
    select 'chat-files'::text as in_bucket, l.file_path as file, l.thumb_path as thumb,
      l.created_at as since
    from live l
    join caps c on c.business_id = l.business_id
    where l.created_at < at_time - make_interval(days => c.keep_days)
      or l.newer_bytes > c.space_bytes
    union all
    select 'chat-files'::text, h.file_path, h.thumb_path, h.removed_at
    from private.chat_removed h
    where h.removed_at < at_time - interval '10 minutes'
      and (h.file_path is not null or h.thumb_path is not null)
    union all
    select 'documents'::text, doc.file_path, null::text, doc.file_gone_after
    from public.documents doc
    where doc.removed_at is not null
      and doc.file_path is not null
      and doc.file_gone_after <= at_time
    union all
    select u.bucket, u.path, u.thumb_path, u.created_at
    from private.file_uploads u
    where u.used_at is null
      and u.created_at < at_time - interval '1 day'
  ),
  due as (
    select o.in_bucket, o.thumb as file, o.since
    from owned o
    where o.thumb is not null
    union all
    select o.in_bucket, o.file, o.since
    from owned o
    where o.file is not null
    union all
    select s.bucket_id, s.name, s.created_at
    from storage.objects s
    where s.bucket_id = 'chat-files'
      and s.created_at < at_time - interval '1 day'
      and s.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}(-s)?\.(webp|jpg|pdf)$'
      and not exists (
        select 1 from public.chat_messages m
        where (m.file_path = s.name or m.thumb_path = s.name)
          and m.file_removed_at is null
      )
      and not exists (
        select 1 from private.chat_removed h
        where h.file_path = s.name or h.thumb_path = s.name
      )
      and not exists (
        select 1 from private.file_uploads u
        where u.used_at is null and (u.path = s.name or u.thumb_path = s.name)
      )
    union all
    select s.bucket_id, s.name, s.created_at
    from storage.objects s
    where s.bucket_id = 'documents'
      and s.created_at < at_time - interval '1 day'
      and s.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.(pdf|webp|jpg)$'
      and not exists (
        select 1 from public.documents doc where doc.file_path = s.name
      )
      and not exists (
        select 1 from private.file_uploads u
        where u.used_at is null and u.path = s.name
      )
  )
  -- Byte order: `<key>-s.<ext>` before `<key>.<ext>`, whatever the collation.
  select d.in_bucket, d.file
  from due d
  group by d.in_bucket, d.file
  order by min(d.since), d.file collate "C"
  limit greatest(least(coalesce(max_rows, 500), 1000), 0)
$$;

-- C4's (20261111000500_chat_files.sql), the same for chat files, and a
-- removed document's file once its undo is over: its path, kind, name and
-- size are cleared, and the row stays, removed, saying its file is gone.
create or replace function public.forget_files(
  paths text[],
  at_time timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages integer;
  held integer;
  reserved integer;
  documents_gone integer;
  marked_in uuid[];
begin
  with marked as (
    update public.chat_messages m
    set file_removed_at = at_time
    where m.file_path = any (paths)
      and m.file_removed_at is null
    returning m.conversation_id
  )
  select count(*)::integer, coalesce(array_agg(distinct k.conversation_id), '{}'::uuid[])
  into messages, marked_in
  from marked k;

  update public.chat_conversations c
  set changed_at = clock_timestamp()
  where c.id = any (marked_in);

  update private.chat_removed h
  set file_path = case when h.file_path = any (paths) then null else h.file_path end,
    thumb_path = case when h.thumb_path = any (paths) then null else h.thumb_path end
  where (h.file_path = any (paths) or h.thumb_path = any (paths))
    and h.removed_at < at_time - interval '10 minutes';
  get diagnostics held = row_count;

  delete from private.chat_removed h
  where h.file_path is null
    and h.thumb_path is null
    and h.removed_at < at_time - interval '10 minutes';

  update public.documents doc
  set file_kind = null,
    file_path = null,
    file_name = null,
    file_size = null
  where doc.file_path = any (paths)
    and doc.removed_at is not null
    and doc.file_gone_after <= at_time;
  get diagnostics documents_gone = row_count;

  delete from private.file_uploads u
  where u.path = any (paths)
    and u.used_at is null
    and u.created_at < at_time - interval '1 day';
  get diagnostics reserved = row_count;

  return messages + held + reserved + documents_gone;
end;
$$;

-- C5's (20261111000600_chat_pdfs.sql), the same, for a document's PDF too:
-- its place's signed upload may still be good when its file is removed (a
-- removal and its undo take 10 minutes), so the clean-up lets it go with the
-- tombstone as well.
create or replace function public.chat_paths_signed(
  paths text[],
  at_time timestamptz default now()
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(u.path order by u.path), '{}'::text[])
  from private.file_uploads u
  where u.path = any (paths)
    and u.bucket in ('chat-files', 'documents')
    and u.file_kind = 'pdf'
    and u.created_at > at_time - interval '2 hours 5 minutes'
$$;

------------------------------------------------------------------------------
-- The demo reset's purge: 20261110001000_payroll_months.sql's, with the
-- documents and their recipients before the log.

create or replace function private.purge_business_records(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior text := current_setting('ca.records_purge', true);
begin
  if business is null then
    return;
  end if;
  perform set_config('ca.records_purge', business::text, true);
  delete from public.time_breaks b where b.business_id = business;
  delete from public.time_entries e where e.business_id = business;
  delete from public.member_wages w where w.business_id = business;
  delete from public.member_payroll_details d where d.business_id = business;
  delete from public.employment_periods p where p.business_id = business;
  delete from public.payroll_months pm where pm.business_id = business;
  delete from public.document_recipients r where r.business_id = business;
  delete from public.documents doc where doc.business_id = business;
  delete from public.audit_log a where a.business_id = business;
  perform set_config('ca.records_purge', coalesce(prior, ''), true);
end;
$$;

------------------------------------------------------------------------------
-- Demo businesses: the samples

-- What a demo business starts with in its documents, through the document
-- functions themselves, so every rule holds and the lines and the log are
-- the app's own: a payslip from the first accountant to the first worker two
-- days ago, not opened yet; a procedure from the first manager (or the
-- owner) to everyone else on the staff yesterday, asking for "קראתי", which
-- the second worker opened and confirmed; and a sick note from the first
-- worker three days ago, which the owner opened. Samples only, no note, each
-- titled with its category's words. People are picked by role in the order
-- their definition names them, as the chat seed does, from both definitions
-- alike. Each part is written on its own, so one that can't be (a
-- definition without an accountant) leaves the others, and whatever goes
-- wrong the reset still stands. Once per reset: its documents stay until the
-- next one (nothing deletes them before), so a second call (e2e/db.ts's
-- clearDemoChat runs the chat seed again) writes nothing.
create function private.seed_demo_documents(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
  people jsonb;
  tz text;
  morning date;
  owner_person uuid;
  manager_person uuid;
  accountant_person uuid;
  worker_one uuid;
  worker_two uuid;
  everyone uuid[];
  written uuid;
begin
  if not private.documents_on(business) then
    return;
  end if;
  if exists (select 1 from public.documents d where d.business_id = business) then
    return;
  end if;

  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business;
  if def is null then
    return;
  end if;
  people := case
    when jsonb_typeof(def -> 'people') = 'array' then def -> 'people'
    else '[]'::jsonb
  end;

  select b.timezone into tz from public.businesses b where b.id = business;
  if tz is null then
    return;
  end if;
  -- This morning in the business's clock, or yesterday's before 09:00 there,
  -- as the chat seed's: every document is from the days before it.
  morning := ((now() at time zone tz) - interval '9 hours')::date;

  -- Who: by role, in the order the definition names them.
  select m.user_id into owner_person
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'owner'::public.member_role
  order by person.ordinality
  limit 1;

  select m.user_id into manager_person
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'manager'::public.member_role
  order by person.ordinality
  limit 1;
  manager_person := coalesce(manager_person, owner_person);

  select m.user_id into accountant_person
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'accountant'::public.member_role
  order by person.ordinality
  limit 1;

  select m.user_id into worker_one
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'worker'::public.member_role
  order by person.ordinality
  limit 1;

  select m.user_id into worker_two
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'worker'::public.member_role
    and m.user_id <> worker_one
  order by person.ordinality
  limit 1;

  -- The accountant's payslip to the first worker, not opened yet.
  begin
    if accountant_person is not null and worker_one is not null then
      perform public.send_document(
        accountant_person, business, 'to_people'::text, 'payslip'::text,
        private.document_title('payslip'::text), null::text, array[worker_one], false,
        null::uuid, 'payslip'::text, ((morning - 2) + time '10:00') at time zone tz
      );
    end if;
  exception when others then
    raise warning 'The demo''s payslip was not written: %', sqlstate;
  end;

  -- The manager's procedure to everyone else on the staff, asking for
  -- "קראתי": the second worker opened and confirmed it.
  begin
    if manager_person is not null then
      select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[]) into everyone
      from public.memberships m
      where m.business_id = business
        and m.active
        and private.is_staff_role(m.role)
        and m.user_id <> manager_person;
      if cardinality(everyone) > 0 then
        written := public.send_document(
          manager_person, business, 'to_people'::text, 'procedure'::text,
          private.document_title('procedure'::text), null::text, everyone, true,
          null::uuid, 'procedure'::text, ((morning - 1) + time '12:00') at time zone tz
        );
        if worker_two is not null then
          perform public.open_document(
            worker_two, written, ((morning - 1) + time '15:00') at time zone tz
          );
          perform public.confirm_document(
            worker_two, written, ((morning - 1) + time '15:02') at time zone tz
          );
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'The demo''s procedure was not written: %', sqlstate;
  end;

  -- The first worker's sick note to the business, which the owner opened.
  begin
    if worker_one is not null then
      written := public.send_document(
        worker_one, business, 'from_person'::text, 'sick_note'::text,
        private.document_title('sick_note'::text), null::text, null::uuid[], false,
        null::uuid, 'sick_note'::text, ((morning - 3) + time '07:30') at time zone tz
      );
      if owner_person is not null then
        perform public.open_document(
          owner_person, written, ((morning - 3) + time '09:10') at time zone tz
        );
      end if;
    end if;
  exception when others then
    raise warning 'The demo''s sick note was not written: %', sqlstate;
  end;
end;
$$;

-- The demo's conversations, C3's (20261111000400_chat_announce.sql) as they
-- were, with the documents' seed first: the reset ends with this function and
-- is never replaced again. Each part is written on its own, so one that can't
-- be (a definition without a worker in a department, or without a second
-- worker) leaves the others, and whatever goes wrong the reset still stands:
-- a stale definition never breaks the door. Only what it wrote is marked as
-- the demo's own, so it may also run on a business whose chats were just
-- emptied (e2e/db.ts, clearDemoChat), where the documents' seed writes
-- nothing again.
create or replace function private.seed_demo_chat(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
  people jsonb;
  tz text;
  morning date;
  joined timestamptz;
  owner_person uuid;
  manager_person uuid;
  worker_one uuid;
  worker_one_departments jsonb;
  worker_two uuid;
  team_chat uuid;
  department_chat uuid;
  announced uuid;
  written uuid[] := '{}'::uuid[];
begin
  if not private.module_enabled(business, 'chat'::public.module_key) then
    return;
  end if;

  -- The demo's documents (C6), on their own.
  begin
    perform private.seed_demo_documents(business);
  exception when others then
    raise warning 'The demo''s documents were not written: %', sqlstate;
  end;

  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business;
  people := case
    when jsonb_typeof(def -> 'people') = 'array' then def -> 'people'
    else '[]'::jsonb
  end;

  select b.timezone into tz from public.businesses b where b.id = business;
  if tz is null then
    return;
  end if;
  -- This morning in the business's clock, or yesterday's before 09:00 there:
  -- the last message is at 08:50, so all of them are already in the past.
  morning := ((now() at time zone tz) - interval '9 hours')::date;
  joined := ((morning - 30) + time '09:00') at time zone tz;

  -- Who writes: by role, in the order the definition names them.
  select m.user_id into owner_person
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'owner'::public.member_role
  order by person.ordinality
  limit 1;

  select m.user_id into manager_person
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'manager'::public.member_role
  order by person.ordinality
  limit 1;
  manager_person := coalesce(manager_person, owner_person);
  if manager_person is null then
    return;
  end if;

  select m.user_id, person.value -> 'departments'
  into worker_one, worker_one_departments
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'worker'::public.member_role
  order by person.ordinality
  limit 1;

  select m.user_id into worker_two
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'worker'::public.member_role
    and m.user_id <> worker_one
  order by person.ordinality
  limit 1;

  -- The demo people have been there a month: they read the groups' history.
  update public.memberships m
  set staff_since = joined
  where m.business_id = business and m.staff_since > joined;
  update public.department_members dm
  set added_at = joined
  where dm.business_id = business and dm.added_at > joined;

  select c.id into team_chat
  from public.chat_conversations c
  where c.business_id = business and c.kind = 'team';

  -- The whole team's group.
  begin
    if owner_person is not null then
      written := written || (public.send_chat_message(
        owner_person, business, gen_random_uuid(),
        'תודה לכולם על היום'::text, team_chat, null::uuid, false,
        ((morning - 1) + time '18:30') at time zone tz
      ) ->> 'message')::uuid;
    end if;
    written := written || (public.send_chat_message(
      manager_person, business, gen_random_uuid(),
      'בוקר טוב. הספק מגיע ב-10:00'::text, team_chat, null::uuid, false,
      (morning + time '08:05') at time zone tz
    ) ->> 'message')::uuid;
    -- An announcement from management, pinned at the top of the group: it
    -- asks everyone in it but its author for "קראתי".
    announced := (public.send_chat_message(
      manager_person, business, gen_random_uuid(),
      'מהשבוע הבא סוגרים את הקופה ב-22:00'::text, team_chat, null::uuid, true,
      (morning + time '08:10') at time zone tz
    ) ->> 'message')::uuid;
    written := written || announced;
    -- The first two workers read the group up to then, and confirm the
    -- announcement as they read it.
    if worker_one is not null then
      perform public.read_chat(
        worker_one, team_chat,
        (morning + time '08:20') at time zone tz,
        (morning + time '08:20') at time zone tz
      );
      perform public.confirm_announcement(
        worker_one, announced, (morning + time '08:20') at time zone tz
      );
    end if;
    if worker_two is not null then
      perform public.read_chat(
        worker_two, team_chat,
        (morning + time '08:35') at time zone tz,
        (morning + time '08:35') at time zone tz
      );
      perform public.confirm_announcement(
        worker_two, announced, (morning + time '08:35') at time zone tz
      );
    end if;
  exception when others then
    raise warning 'The demo''s team group was not written: %', sqlerrm;
  end;

  -- The first worker's first department: their message and the manager's answer.
  begin
    select c.id into department_chat
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(worker_one_departments) = 'array' then worker_one_departments
        else '[]'::jsonb
      end
    ) with ordinality as wanted (key, ordinality)
    join public.departments d
      on d.business_id = business and d.key = wanted.key and d.archived_at is null
    join public.department_members dm
      on dm.department_id = d.id and dm.user_id = worker_one
    join public.chat_conversations c
      on c.department_id = d.id and c.kind = 'department'
    order by wanted.ordinality
    limit 1;
    if department_chat is not null then
      written := written || (public.send_chat_message(
        worker_one, business, gen_random_uuid(),
        'סיימנו לסדר להיום. חסרים חומרי ניקוי'::text, department_chat, null::uuid, false,
        (morning + time '08:15') at time zone tz
      ) ->> 'message')::uuid;
      written := written || (public.send_chat_message(
        manager_person, business, gen_random_uuid(),
        'תודה, ההזמנה יוצאת היום'::text, department_chat, null::uuid, false,
        (morning + time '08:25') at time zone tz
      ) ->> 'message')::uuid;
    end if;
  exception when others then
    raise warning 'The demo''s department group was not written: %', sqlerrm;
  end;

  -- The manager and the first worker: the question read, the answer not yet.
  begin
    if worker_one is not null and worker_one <> manager_person then
      written := written || (public.send_chat_message(
        manager_person, business, gen_random_uuid(),
        'אפשר להחליף איתך משמרת ביום שלישי?'::text, null::uuid, worker_one, false,
        (morning + time '08:40') at time zone tz
      ) ->> 'message')::uuid;
      written := written || (public.send_chat_message(
        worker_one, business, gen_random_uuid(),
        'כן, אין בעיה'::text, null::uuid, manager_person, false,
        (morning + time '08:50') at time zone tz
      ) ->> 'message')::uuid;
    end if;
  exception when others then
    raise warning 'The demo''s private chat was not written: %', sqlerrm;
  end;

  -- The demo's own: kept until the next reset, never counted as a visitor's.
  -- A part that failed took its messages back with it, and their ids match
  -- nothing.
  update public.chat_messages m
  set seeded = true
  where m.id = any (written);
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The policies' helpers run as the reader, so the signed-in role runs them.
revoke execute on function private.sees_document(uuid, uuid) from public, anon;
grant execute on function private.sees_document(uuid, uuid) to authenticated;
revoke execute on function private.manages_document(uuid, uuid) from public, anon;
grant execute on function private.manages_document(uuid, uuid) to authenticated;
revoke execute on function private.can_read_document(text) from public, anon;
grant execute on function private.can_read_document(text) to authenticated;

-- The rest of the private ones run inside the functions, triggers and reset,
-- as their owner.
revoke execute on function private.refuse_document_delete() from public, anon, authenticated;
revoke execute on function private.documents_closed(uuid) from public, anon, authenticated;
revoke execute on function private.refuse_demo_document() from public, anon, authenticated;
revoke execute on function private.document_title(text) from public, anon, authenticated;
revoke execute on function private.documents_on(uuid) from public, anon, authenticated;
revoke execute on function private.in_office(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.office_people(uuid) from public, anon, authenticated;
revoke execute on function private.sends_documents(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.documents_guard_bytes() from public, anon, authenticated;
revoke execute on function private.document_space_bytes(uuid) from public, anon, authenticated;
revoke execute on function private.documents_held_bytes(uuid) from public, anon, authenticated;
revoke execute on function private.attach_document_upload(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.settle_documents_from_log()
  from public, anon, authenticated;
revoke execute on function private.seed_demo_documents(uuid)
  from public, anon, authenticated, service_role;

-- The server's alone, for `actor`.
revoke execute on function public.documents_closed(uuid) from public, anon, authenticated;
grant execute on function public.documents_closed(uuid) to service_role;
revoke execute on function public.reserve_document_upload(
  uuid, uuid, text, text, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_document_upload(
  uuid, uuid, text, text, text, integer, text, timestamptz
) to service_role;
revoke execute on function public.document_upload_place(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.document_upload_place(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.send_document(
  uuid, uuid, text, text, text, text, uuid[], boolean, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.send_document(
  uuid, uuid, text, text, text, text, uuid[], boolean, uuid, text, timestamptz
) to service_role;
revoke execute on function public.open_document(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.open_document(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.confirm_document(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_document(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.remove_document(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.remove_document(uuid, uuid, text, timestamptz) to service_role;
revoke execute on function public.restore_document(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.restore_document(uuid, uuid, timestamptz) to service_role;

-- Replaced above: the same grants as before.
revoke execute on function public.expired_files(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.expired_files(timestamptz, integer) to service_role;
revoke execute on function public.forget_files(text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.forget_files(text[], timestamptz) to service_role;
revoke execute on function public.chat_paths_signed(text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.chat_paths_signed(text[], timestamptz) to service_role;
revoke execute on function private.purge_business_records(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_chat(uuid)
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------------
-- Last: both hosted demo businesses start again, with their sample
-- documents. Locally the seed runs after the migrations and resets its own.

select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);
