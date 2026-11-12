-- Documents on screen (C7 of the chat plan): what the screens need that C6
-- (20261111000700_documents.sql) doesn't hold, and one rule of C6's made
-- tighter.
--
--   the notice   the office's documents screen says once that the business
--                should keep its own copy of its official documents, since
--                the free plan keeps no backups (Orel, 11 November 2026, on
--                #1), with "הורדת כל המסמכים" beside it. Who read it is kept
--                here per person and business, in the database and never in
--                the browser, as chat's notice is (public.chat_notices). That
--                table takes the staff alone (its trigger refuses an
--                accountant, who is in the office) and one notice per person,
--                so this one is its own: written once by
--                public.see_documents_notice(actor, business), the server's,
--                for someone in the office (private.in_office: owners,
--                accountants and clock.payroll holders) with documents on,
--                and read by that person alone. It writes no log row, and a
--                demo reset takes it with the memberships.
--
--   a removed    C6's bucket policy (private.can_read_document) let the office
--   file         and the sender read a removed document's file for its 10
--                minutes of undo. Nobody needs to see it to put it back
--                (public.restore_document reads no file), and a sick note its
--                sender took back ("ביטול" right after sending: the wrong
--                page, another medical one) must be seen by nobody, as plan
--                §4 says: the file of a document "not removed". So it is
--                replaced here without that branch; the screens and the
--                /document-files routes refuse a removed one too. Its undo
--                is unchanged: the file stays in Storage for the 10 minutes,
--                read by nobody, and comes back with the document.

create table public.document_notices (
  business_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (business_id, user_id),
  -- Memberships are made inactive, never deleted: this fires when a demo
  -- business is reset, or an account is removed by hand.
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete cascade
);

alter table public.document_notices enable row level security;

-- Written only by public.see_documents_notice; read by its own person alone.
revoke all on public.document_notices from anon, authenticated, service_role;
grant select on public.document_notices to authenticated;

create policy "people read their own document notices"
  on public.document_notices for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.document_notices is
  'When each person in a business''s office first read, on its documents screen, that the business should keep its own copy of its official documents (the free plan keeps no backups): read by that person alone, written once by public.see_documents_notice.';

-- `actor` read the documents' notice in the business: kept once, from the
-- first time. 42501 for anyone not in its office (a manager without pay
-- access, a worker, someone not in it), 55000 while documents are off.
-- Writes no log row.
create function public.see_documents_notice(actor uuid, business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.documents_on(business) then
    raise exception 'Documents are off for this business' using errcode = '55000';
  end if;
  if actor is null or not private.in_office(business, actor) then
    raise exception 'Not in the office' using errcode = '42501';
  end if;

  insert into public.document_notices (business_id, user_id)
  values (business, actor)
  on conflict (business_id, user_id) do nothing;
end;
$$;

-- The server's alone, for `actor`.
revoke execute on function public.see_documents_notice(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.see_documents_notice(uuid, uuid) to service_role;

------------------------------------------------------------------------------
-- A removed document's file: read by nobody

-- The signed-in person may read the file `object_name` of the documents
-- bucket: `<business>/<32 hex>.<pdf|webp|jpg>`, a document of that business
-- pointing at it, which they read (private.sees_document: no branch for the
-- team or a view session), and not removed. A removed one's file is read by
-- nobody, even within its 10 minutes of undo (C6 let the office and its
-- sender read it then; putting it back needs no look at it). Anything else,
-- and any other shape, is false: strict ids, so a name of dashes is false
-- before any cast, never an error inside the policy.
create or replace function private.can_read_document(object_name text)
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
      and d.removed_at is null
      and private.sees_document(d.id, reader)
  );
end;
$$;

-- The bucket's policy runs it as the reader, so the signed-in role runs it.
revoke execute on function private.can_read_document(text) from public, anon;
grant execute on function private.can_read_document(text) to authenticated;
