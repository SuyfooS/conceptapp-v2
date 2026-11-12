-- Official documents' files through the server only (Orel's decision of 12
-- November 2026, on issue #1).
--
--   why          C6's policy on storage.objects, "people read the files of
--                the documents they read" (private.can_read_document, made
--                tighter by C7), let whoever reads a document's row read its
--                file straight from Storage under their own session. Their
--                access token, copied from the browser's developer tools,
--                downloaded it with no public.open_document, so with no
--                document.open row: the access log of reg 10 (plan §15)
--                missed the office reading a worker's sick note, and nothing
--                marked it opened. The same token could also ask Storage for
--                a signed URL of the file (createSignedUrl), good for as long
--                as it was asked to be, which anyone opens without signing
--                in, after the person has lost their access too, and which
--                any browser or proxy may keep: none of /document-files'
--                rules (the app's own request only, no-store, the sandbox).
--   now          the documents bucket has no policy at all. anon and
--                authenticated read nothing of it, whoever they are (the
--                document's person, its sender, a recipient, the office):
--                no download, no list, no signed URL, no file's details.
--                Its files are read by the server alone, with the secret key
--                (the service role, which RLS doesn't stop), and only in the
--                /document-files routes: public.open_document for the
--                signed-in person first (private.sees_document decides; their
--                mark, the office's "received" and the log's document.open),
--                then the document's row under the reader's own session
--                (RLS), and only then the bytes, served by the app. The
--                server makes no signed URL to read a document's file either:
--                the only signed one is a PDF's upload, for its one reserved
--                place, which writes and reads nothing. Writes are as they
--                were (no browser writes; the server uploads a photo, a PDF
--                goes up through that signed upload).
--   opening      public.open_document is replaced with the same arguments,
--                return and grants. It now stands before the secret key's
--                read, so it serves, and logs, nothing of a removed document,
--                even within its 10 minutes of undo: `path` and `sample` null,
--                no document.open row, no mark (which it never made for a
--                removed one). C7 (20261111000800_documents_screens.sql) made
--                the bucket's policy so: a sick note its sender took back is
--                seen by nobody, and putting it back needs no look at it.
--   dropped      the policy, then private.can_read_document(text), which
--                only that policy called.

------------------------------------------------------------------------------
-- No read of the documents bucket but the server's

drop policy "people read the files of the documents they read" on storage.objects;

drop function private.can_read_document(text);

------------------------------------------------------------------------------
-- Opening: nothing of a removed document

-- `actor` opens a document they read (P0002 otherwise: unknown and not yours
-- are the same answer), for the route that serves it, before it reads the
-- file with the secret key. A recipient on the staff: their mark (the first
-- time), and their documents.sent line settled (a documents.to_confirm one
-- waits for "קראתי"). The office's first opening of someone's document to the
-- business: its opened_at and opened_by, and documents.received settled for
-- all of the office. Every opening by the office of someone else's document
-- (not their own, not one they sent, not one sent to them) that serves
-- something writes document.open {document, person}, once per reader,
-- document and day in the business's clock: the access log, read by the
-- office alone. Returns {document, business, path, kind, name, sample}: `path`
-- and `sample` are what the route may serve, both null for a removed one
-- (even within its 10 minutes of undo), and `path` null once its file is gone.
create or replace function public.open_document(
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
  serves := doc.removed_at is null
    and (doc.sample is not null or doc.file_path is not null);

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
    'path', case when serves then doc.file_path end,
    'kind', doc.file_kind,
    'name', doc.file_name,
    'sample', case when serves then doc.sample end
  );
end;
$$;

-- The server's alone, for `actor`, as before.
revoke execute on function public.open_document(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.open_document(uuid, uuid, timestamptz) to service_role;
