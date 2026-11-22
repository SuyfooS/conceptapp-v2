-- Bigger teams, the first fixes (Orel, 22 November 2026, issue #1), for a
-- business of a few hundred people:
--   1. a document to people goes to 1 to 1000 others on the staff (200
--      before), so "everyone" and a department reach everyone; the screen
--      says when more are chosen, never a cut. public.send_document,
--      20261111000700_documents.sql's with only that number;
--   2. public.file_space(actor, business): how full a business's spaces for
--      documents and chat files are, sizes only, for whoever sees the
--      management page or sends documents (the secret key's);
--   3. public.admin_storage(): 20261111000500_chat_files.sql's, with each
--      business's documents' bytes as their refusal counts them.
-- Nothing else changes; no table, no policy.

------------------------------------------------------------------------------
-- 1. A document to people: 1 to 1000

-- 20261111000700_documents.sql's, with 1000 people where it took 200: a
-- department or everyone of a business of a few hundred people. The
-- recipients are still one insert and their lines one private.notify.
--
-- `actor` sends a document: to the business (`send_direction` 'from_person',
-- anyone on the staff, a sick note, a form or another document), or to people
-- (`send_to`, 'to_people', one who sends documents: a payslip, a contract, a
-- procedure, a form or another document, asking for "קראתי" when `asks`).
-- Its file is the place `upload` (public.reserve_document_upload) the server
-- put in place, or in a demo business a `send_sample`. Every rule is checked
-- before the row is written, so a refused document never reaches the
-- Postgres log with its title. Refused: documents off (55000); not one who
-- may send that way (42501); a category the direction doesn't take, people
-- who aren't someone else active on the staff (or none, or more than 1000),
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
create or replace function public.send_document(
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
    if cardinality(people) = 0 or cardinality(people) > 1000 then
      raise exception 'One to 1000 people' using errcode = '22023';
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
-- 2. How full a business's spaces are, for its own people

-- `actor`, an active member who sees the management page (manage.view) or
-- sends documents (private.sends_documents: an owner, chat.send_documents or
-- the office), reads how full the business's spaces are: its documents'
-- bytes as their refusal counts them (private.documents_held_bytes, a file
-- still kept, a removed one waiting for its undo included) beside
-- `documentSpaceMb`; its chat files' bytes as the console counts them (the
-- Storage objects under its folder of chat-files) beside `fileSpaceMb`; and
-- whether it takes files at all (chat on, and no demo that takes none).
-- Sizes only: no file, document, message or person. 42501 for anyone else;
-- no branch for a view session or the ConceptApp team, who have the console.
-- Writes nothing and logs nothing.
create function public.file_space(actor uuid, business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    private.holds_perm(business, actor, 'manage.view')
    or private.sends_documents(business, actor)
  ) then
    raise exception 'Not one who sees the business''s files' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'files_open', private.module_enabled(business, 'chat'::public.module_key)
      and not private.chat_files_closed(business),
    'document_bytes', private.documents_held_bytes(business),
    'document_space_bytes', private.document_space_bytes(business),
    'chat_bytes', (
      select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
        then (o.metadata ->> 'size')::bigint else 0::bigint end), 0::bigint)
      from storage.objects o
      where o.bucket_id = 'chat-files'
        and split_part(o.name, '/', 1) = business::text
    ),
    'chat_space_bytes', (case private.chat_settings(business) ->> 'fileSpaceMb'
        when '50' then 50::bigint when '200' then 200::bigint else 100::bigint
      end) * 1048576
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. The console's storage card: each business's documents too

-- 20261111000500_chat_files.sql's, with each business's `document_bytes`.
--
-- How full the project is, for the ConceptApp team (42501 for anyone else,
-- under their own session, as public.admin_businesses): the database's size;
-- Storage per bucket (bytes and files); each business's chat files (bytes
-- under its folder of chat-files) beside its caps (`fileSpaceMb` and
-- `documentSpaceMb`, counted only where chat is on and files are taken); and
-- the caps' sum, which must stay under the free plan's 1 GB with the rest;
-- and the bytes each business's documents hold, as their refusal counts them
-- (a sum, never a row).
-- Sizes and counts only: no file, conversation, message or person, and no
-- chat table is read for it.
create or replace function public.admin_storage()
returns jsonb
language plpgsql
-- Volatile, as pg_database_size is.
volatile
security definer
set search_path = ''
as $$
declare
  per_business jsonb;
begin
  if not private.is_platform_staff() then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  with used as (
    select split_part(o.name, '/', 1) as folder,
      sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
        then (o.metadata ->> 'size')::bigint else 0::bigint end) as bytes
    from storage.objects o
    where o.bucket_id = 'chat-files'
    group by 1
  ),
  each_business as (
    select b.id, b.slug, b.name,
      coalesce(u.bytes, 0::bigint) as chat_bytes,
      (private.module_enabled(b.id, 'chat'::public.module_key)
        and not private.chat_files_closed(b.id)) as files_open,
      private.chat_settings(b.id) as settings,
      private.documents_held_bytes(b.id) as document_bytes
    from public.businesses b
    left join used u on u.folder = b.id::text
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'business', e.id,
      'slug', e.slug,
      'name', e.name,
      'chat_bytes', e.chat_bytes,
      'files_open', e.files_open,
      'document_bytes', e.document_bytes,
      'chat_cap_bytes', case when e.files_open then
        (case e.settings ->> 'fileSpaceMb'
          when '50' then 50::bigint when '200' then 200::bigint else 100::bigint
        end) * 1048576 else 0::bigint end,
      'document_cap_bytes', case when e.files_open then
        (case e.settings ->> 'documentSpaceMb'
          when '100' then 100::bigint when '200' then 200::bigint else 50::bigint
        end) * 1048576 else 0::bigint end
    ) order by e.chat_bytes desc, e.name), '[]'::jsonb)
  into per_business
  from each_business e;

  return jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'storage_bytes', private.storage_used(),
    'guard_bytes', private.files_guard_bytes(),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object(
          'bucket', b.id, 'bytes', coalesce(s.bytes, 0::bigint), 'files', coalesce(s.files, 0::bigint)
        ) order by b.id)
      from storage.buckets b
      left join (
        select o.bucket_id,
          sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
            then (o.metadata ->> 'size')::bigint else 0::bigint end) as bytes,
          count(*) as files
        from storage.objects o
        group by o.bucket_id
      ) s on s.bucket_id = b.id
    ), '[]'::jsonb),
    'businesses', per_business,
    'chat_caps_bytes', (
      select coalesce(sum((p.value ->> 'chat_cap_bytes')::bigint), 0::bigint)
      from jsonb_array_elements(per_business) p
    ),
    'document_caps_bytes', (
      select coalesce(sum((p.value ->> 'document_cap_bytes')::bigint), 0::bigint)
      from jsonb_array_elements(per_business) p
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The server's alone, for `actor` (send_document and admin_storage keep
-- their grants: the same signatures, replaced).
revoke execute on function public.file_space(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_space(uuid, uuid) to service_role;
