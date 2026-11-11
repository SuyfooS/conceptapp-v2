-- Chat, part 4 (C4 of the chat plan; Orel's answers of 11 November 2026 on
-- issue #1): pictures in chat, and how long chat files are kept.
--
--   bucket       chat-files: private, at most 10 MiB, a JPEG or WebP picture
--                (and from C5 a PDF), in `<business>/<conversation>/<32 hex>
--                .<webp|jpg|pdf>`, a picture's thumbnail beside it as
--                `…-s.<ext>`. Only the server writes it, with the secret key:
--                no insert, update or delete policy, as list photos and
--                avatars. The app's /chat-files route reads it under the
--                reader's own session, so the policy below decides.
--   reading      private.can_read_chat_file: one of the path's conversation's
--                messages points at the file (its picture or its thumbnail),
--                in the path's business, not removed and its file not gone,
--                and the reader reads that message (private.reads_chat_message,
--                C1's one gate, with no branch for owners, the team or a view
--                session): a private chat's files are read by its two people
--                alone. A removed message's file is unreadable at once (its
--                path moved to private.chat_removed for the undo), and gone
--                from Storage once the undo's 10 minutes are over.
--   sending      the server checks the picture again (@domain/chat-files),
--                reserves its place (public.reserve_chat_upload, with the
--                sending's own checks, which opens a private chat on its
--                first file as on its first message), uploads the picture
--                and its thumbnail, and sends the message with them
--                (public.send_chat_message's new `upload`, dropped and made
--                again with it; private.attach_chat_upload checks the
--                reservation is the sender's, for this conversation, unused
--                and under 2 hours old, and that Storage holds both files at
--                the sizes and type reserved, all before the row is written).
--                A reservation never sent goes after a day, its files too.
--   space        Orel (11 November 2026): when a business's chat files pass
--                its space (`fileSpaceMb`, 100 MB unless the team chose 50 or
--                200), its OLDEST go first, even before their days are up; the
--                message stays and says its file is no longer kept. Files are
--                kept `fileDays` days (90, Orel's number, unless the team chose
--                30 or 180). Both are the team's (modules/chat/manifest.ts),
--                read through C1's private.chat_settings. Documents (C6) are
--                never deleted for space. Across the project, a new file is
--                refused once Storage holds 900 MB (private.storage_used, 54000
--                with hint 'storage'): the free plan's 1 GB is shared by every
--                business.
--   the job      C1's `chat`, every 10 minutes, now also asks the app at
--                /cron/chat-files (pg_net, with the minute job's Vault
--                secrets) whenever public.expired_files has a row: files past
--                their days, the oldest past a business's space, removed
--                messages' files after their 10 minutes, reservations never
--                sent after a day, and anything in the bucket older than a day
--                that no row points at (what a hand-deleted account, business
--                or demo reset left). The app removes them through Storage
--                (only it reaches the files) and marks them
--                (public.forget_files, which moves their conversations'
--                changed_at, so a screen open there says so at once).
--                Without the secrets nothing is called and the files wait.
--   demo         a demo business takes no files (private.chat_files_closed)
--                unless its definition says "chatFiles": true (the local
--                seed's restaurant, for the browser tests; never a hosted
--                one): anyone at the demo door is any of its people, and the
--                reset can't remove Storage files. The trigger
--                chat_messages_demo_file refuses one too.
--   console      public.admin_storage, for the ConceptApp team only: the
--                database's size, Storage per bucket, each business's chat
--                space used and its caps, and the caps' sum against the free
--                plan. Sizes only: no file, conversation or person.
--   confirming   (moved here from C3's review) "קראתי" no longer moves the
--                conversation's changed_at, which every member's sync reads:
--                a worker could tell that someone confirmed. Only those who see
--                who confirmed learn of it (the announcement's author while
--                they read it, the moderators, and the person who confirmed):
--                chat_acks.recorded_at, read by the new public.chat_stamp (the
--                conversation's stamp for the sync, per reader) and by
--                public.chat_version, both replaced for it.
--   pages        public.chat_page also gives each message's file and
--                thumbnail paths, for the screens' pictures (dropped and made
--                again, the same grants).

------------------------------------------------------------------------------
-- The bucket

-- Made from the dashboard before this ran, it is set to the same.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files', 'chat-files', false, 10485760,
  array['image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

------------------------------------------------------------------------------
-- Reservations: a file's place, before its message

create table private.file_uploads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- A chat message's file, or (C6) an official document's.
  target text not null check (target in ('chat', 'document')),
  -- Chat only.
  conversation_id uuid,
  bucket text not null check (bucket in ('chat-files', 'documents')),
  path text not null unique,
  -- A picture's thumbnail.
  thumb_path text unique,
  file_kind text not null check (file_kind in ('image', 'pdf')),
  file_type text not null check (file_type in ('image/jpeg', 'image/webp', 'application/pdf')),
  -- The file and its thumbnail together, as the server will upload them.
  declared_size integer not null check (declared_size between 1 and 10485760),
  file_name text check (char_length(file_name) between 1 and 120),
  created_at timestamptz not null default now(),
  -- Sent: its message (or document) holds the files now.
  used_at timestamptz,
  foreign key (conversation_id, business_id)
    references public.chat_conversations (id, business_id) on delete cascade,
  check (target = 'document' or conversation_id is not null),
  check (target <> 'chat' or bucket = 'chat-files'),
  -- A chat picture has its thumbnail; a document's photo (C7) has none.
  check (thumb_path is null or file_kind = 'image'),
  check (target <> 'chat' or file_kind <> 'image' or thumb_path is not null),
  check ((file_kind = 'pdf') = (file_type = 'application/pdf'))
);

create index file_uploads_unused_idx on private.file_uploads (created_at) where used_at is null;
create index file_uploads_used_idx on private.file_uploads (used_at) where used_at is not null;
create index file_uploads_business_idx on private.file_uploads (business_id);
create index file_uploads_owner_idx on private.file_uploads (owner_id, created_at);
create index file_uploads_conversation_idx on private.file_uploads (conversation_id, business_id);

alter table private.file_uploads enable row level security;
revoke all on private.file_uploads from public, anon, authenticated, service_role;

comment on table private.file_uploads is
  'A file''s place, reserved by the server before it uploads it with the secret key: used when its message is sent, removed with its files after a day when it never is. Nobody reads it but the functions.';

-- One conversation's announcements, for the sync's stamp and version below,
-- which read their confirmations.
create index chat_messages_announcements_idx
  on public.chat_messages (conversation_id, business_id)
  where kind = 'announcement';

------------------------------------------------------------------------------
-- Demo businesses

-- A demo business that takes no files: anyone at the demo door is any of its
-- people, a file sent there would wait for the next visitor, and the reset
-- can't remove it from Storage. Open when its definition says
-- "chatFiles": true.
create function private.chat_files_closed(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.demo_businesses d
    where d.business_id = business
      and d.definition -> 'chatFiles' is distinct from 'true'::jsonb
  )
$$;

-- The same question, for the server before an upload (secret key).
create function public.chat_files_closed(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.chat_files_closed(business)
$$;

-- A new file in a demo business that takes none is refused, whoever writes
-- it. Clearing one (a removal) stays allowed.
create function private.refuse_demo_chat_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.file_path is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.file_path is not distinct from old.file_path then
      return new;
    end if;
  end if;
  if private.chat_files_closed(new.business_id) then
    raise exception 'Demo businesses take no files' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger chat_messages_demo_file
  before insert or update of file_path on public.chat_messages
  for each row execute function private.refuse_demo_chat_file();

------------------------------------------------------------------------------
-- Room in the project

-- What Storage holds now, every bucket together, in bytes.
create function private.storage_used()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
      then (o.metadata ->> 'size')::bigint else 0::bigint end
  ), 0::bigint)::bigint
  from storage.objects o
$$;

-- Past this, no new chat file is taken (900 MB of the free plan's 1 GB,
-- @domain/chat-files FILES_GUARD_BYTES): documents (C6) go up to 980 MB.
create function private.files_guard_bytes()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 943718400::bigint
$$;

------------------------------------------------------------------------------
-- Reserving a file's place

-- `actor` is about to send a file in a conversation they read
-- (`conversation`), or to someone else on the staff (`to_person`, whose
-- private chat it opens, as a first message does): a picture (`upload_kind`
-- 'image', a JPEG or WebP, the picture and its thumbnail together at most
-- 448 KB) or a PDF (C5, at most 10 MiB), of `upload_size` bytes as the server
-- will upload them, with a name for a PDF (`upload_name`, cleaned by the
-- server). The same refusals as sending (42501 off the staff or where only
-- management writes, P0002 for a conversation they don't read, 55000 for chat
-- off, a closed group or a private chat whose other person left), 55000 in a
-- demo business that takes no files, 22023 for a kind, type, size or name it
-- doesn't take, 54000 for a 31st in a minute, and 54000 with hint 'storage'
-- once the project's Storage is full. Writes no log row. Returns {upload,
-- path, thumb, conversation}: where the server uploads the file and its
-- thumbnail, under a fresh random key, so a new file gets a new link.
create function public.reserve_chat_upload(
  actor uuid,
  business uuid,
  upload_kind text,
  upload_type text,
  upload_size integer,
  conversation uuid default null,
  to_person uuid default null,
  upload_name text default null,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.chat_conversations%rowtype;
  file_ext text;
  file_key text;
  saved private.file_uploads%rowtype;
  clean_name text := nullif(btrim(coalesce(upload_name, '')), '');
begin
  perform private.chat_on(business);
  if not private.chat_staff(business, actor) then
    raise exception 'Not on the staff' using errcode = '42501';
  end if;
  if (conversation is null) = (to_person is null) then
    raise exception 'A conversation or a person' using errcode = '22023';
  end if;
  file_ext := case
    when upload_kind = 'image' and upload_type = 'image/webp' then 'webp'
    when upload_kind = 'image' and upload_type = 'image/jpeg' then 'jpg'
    when upload_kind = 'pdf' and upload_type = 'application/pdf' then 'pdf'
  end;
  if file_ext is null then
    raise exception 'A picture is a JPEG or a WebP, a document a PDF' using errcode = '22023';
  end if;
  -- In parentheses: PL/pgSQL ends an IF's condition at its first THEN.
  if upload_size is null or upload_size < 1
    or upload_size > (case when upload_kind = 'image' then 458752 else 10485760 end)
  then
    raise exception 'Too large a file' using errcode = '22023';
  end if;
  if clean_name is not null
    and (char_length(clean_name) > 120 or clean_name ~ '[[:cntrl:]/\\]')
  then
    raise exception 'A file''s name is at most 120 characters, with no folder' using errcode = '22023';
  end if;
  if private.chat_files_closed(business) then
    raise exception 'Demo businesses take no files' using errcode = '55000';
  end if;

  if to_person is not null then
    conv := private.direct_chat(business, actor, to_person);
  else
    select x.* into conv
    from public.chat_conversations x
    where x.id = conversation and x.business_id = business;
    if not found or private.chat_reads_from(conv.id, actor) is null then
      raise exception 'Unknown conversation' using errcode = 'P0002';
    end if;
  end if;
  if conv.closed_at is not null then
    raise exception 'The group is closed' using errcode = '55000';
  end if;
  if conv.kind = 'direct' and not private.chat_staff(
    business, case when conv.person_a = actor then conv.person_b else conv.person_a end
  ) then
    raise exception 'No longer on the staff' using errcode = '55000';
  end if;
  if conv.kind = 'team'
    and private.chat_settings(business) ->> 'teamGroupWho' = 'announcers'
    and not private.holds_perm(business, actor, 'chat.announce')
  then
    raise exception 'Only management writes here' using errcode = '42501';
  end if;

  -- The minute up to `at_time`: a reservation stamped later is no part of it.
  if (
    select count(*)
    from private.file_uploads u
    where u.owner_id = actor
      and u.created_at > at_time - interval '1 minute'
      and u.created_at <= at_time
  ) >= 30 then
    raise exception 'Too many in a minute' using errcode = '54000';
  end if;
  if private.storage_used() + upload_size > private.files_guard_bytes() then
    raise exception 'No room for files' using errcode = '54000', hint = 'storage';
  end if;

  file_key := replace(gen_random_uuid()::text, '-', '');
  insert into private.file_uploads (
    business_id, owner_id, target, conversation_id, bucket, path, thumb_path,
    file_kind, file_type, declared_size, file_name, created_at
  )
  values (
    business, actor, 'chat', conv.id, 'chat-files',
    business::text || '/' || conv.id::text || '/' || file_key || '.' || file_ext,
    case when upload_kind = 'image'
      then business::text || '/' || conv.id::text || '/' || file_key || '-s.' || file_ext
    end,
    upload_kind, upload_type, upload_size, clean_name, at_time
  )
  returning * into saved;

  return jsonb_build_object(
    'upload', saved.id,
    'path', saved.path,
    'thumb', saved.thumb_path,
    'conversation', conv.id
  );
end;
$$;

-- The reservation `upload`, checked for `actor`'s message in `conversation`
-- at `at_time` and locked: theirs, for a chat file of this conversation,
-- unused, made in the last 2 hours (how long Storage's signed upload is good
-- for), in a business that takes files, and with its file (and a picture's
-- thumbnail) in the bucket at the type reserved, each within its kind's size
-- (a picture at most 400 KB, its thumbnail 48 KB, a PDF 10 MiB) and the two
-- together the size reserved. 22023 for anything else, 55000 in a demo
-- business that takes no files. Returns it, for the message's file columns.
create function private.attach_chat_upload(
  upload uuid,
  actor uuid,
  conversation uuid,
  at_time timestamptz
)
returns private.file_uploads
language plpgsql
security definer
set search_path = ''
as $$
declare
  held private.file_uploads%rowtype;
  full_size bigint;
  full_type text;
  thumb_size bigint;
  thumb_type text;
begin
  select u.* into held from private.file_uploads u where u.id = upload for update;
  if not found
    or held.owner_id is distinct from actor
    or held.target <> 'chat'
    or held.bucket <> 'chat-files'
    or held.conversation_id is distinct from conversation
  then
    raise exception 'Unknown file' using errcode = '22023';
  end if;
  if held.used_at is not null then
    raise exception 'The file was sent already' using errcode = '22023';
  end if;
  if held.created_at < at_time - interval '2 hours' then
    raise exception 'The file waited too long' using errcode = '22023';
  end if;
  if private.chat_files_closed(held.business_id) then
    raise exception 'Demo businesses take no files' using errcode = '55000';
  end if;

  select
    case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
      then (o.metadata ->> 'size')::bigint end,
    o.metadata ->> 'mimetype'
  into full_size, full_type
  from storage.objects o
  where o.bucket_id = 'chat-files' and o.name = held.path;
  if full_size is null or full_size < 1 or full_type is distinct from held.file_type
    or full_size > (case when held.file_kind = 'image' then 409600 else 10485760 end)
  then
    raise exception 'The file is not in place' using errcode = '22023';
  end if;

  if held.file_kind = 'image' then
    select
      case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
        then (o.metadata ->> 'size')::bigint end,
      o.metadata ->> 'mimetype'
    into thumb_size, thumb_type
    from storage.objects o
    where o.bucket_id = 'chat-files' and o.name = held.thumb_path;
    if thumb_size is null or thumb_size < 1 or thumb_size > 49152
      or thumb_type is distinct from held.file_type
    then
      raise exception 'The thumbnail is not in place' using errcode = '22023';
    end if;
  end if;

  if full_size + coalesce(thumb_size, 0::bigint) <> held.declared_size then
    raise exception 'The file is not the size reserved' using errcode = '22023';
  end if;
  return held;
end;
$$;

------------------------------------------------------------------------------
-- Sending, with a file

-- C1's send (20261111000200_chat.sql), the same in every rule, with the
-- reservation of a file the server put in place (`upload`, last, so every
-- call that names its arguments in order still reads as before): checked by
-- private.attach_chat_upload with the rest, before the row is written, and
-- sent with or without words. A message is words, a file, or both (22023 for
-- neither). Returns {conversation, message, attached}: `attached` false when
-- the draft was sent already, so the server removes the files it uploaded
-- again for it.
drop function public.send_chat_message(uuid, uuid, uuid, text, uuid, uuid, boolean, timestamptz);

create function public.send_chat_message(
  actor uuid,
  business uuid,
  draft uuid,
  words text default null,
  conversation uuid default null,
  to_person uuid default null,
  announce boolean default false,
  at_time timestamptz default now(),
  upload uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.chat_conversations%rowtype;
  held private.file_uploads%rowtype;
  sent uuid;
  sent_in uuid;
  sent_business uuid;
  clean text := nullif(regexp_replace(coalesce(words, ''), '^\s+|\s+$', '', 'g'), '');
  as_announcement boolean := coalesce(announce, false);
begin
  perform private.chat_on(business);
  if not private.chat_staff(business, actor) then
    raise exception 'Not on the staff' using errcode = '42501';
  end if;
  if draft is null then
    raise exception 'A message needs its draft id' using errcode = '22023';
  end if;

  -- A retry of what was sent already gives back the same message.
  select m.id, m.conversation_id, m.business_id into sent, sent_in, sent_business
  from public.chat_messages m
  where m.author_id = actor and m.draft_id = draft;
  if sent is not null then
    if sent_business <> business then
      raise exception 'A draft id goes with one message' using errcode = '22023';
    end if;
    return jsonb_build_object('conversation', sent_in, 'message', sent, 'attached', false);
  end if;

  if (conversation is null) = (to_person is null) then
    raise exception 'A conversation or a person' using errcode = '22023';
  end if;
  if to_person is not null then
    conv := private.direct_chat(business, actor, to_person);
  else
    select x.* into conv
    from public.chat_conversations x
    where x.id = conversation and x.business_id = business
    for update;
    if not found or private.chat_reads_from(conv.id, actor) is null then
      raise exception 'Unknown conversation' using errcode = 'P0002';
    end if;
  end if;

  if conv.closed_at is not null then
    raise exception 'The group is closed' using errcode = '55000';
  end if;
  if conv.kind = 'direct' and not private.chat_staff(
    business, case when conv.person_a = actor then conv.person_b else conv.person_a end
  ) then
    raise exception 'No longer on the staff' using errcode = '55000';
  end if;
  if as_announcement
    and (conv.kind = 'direct' or not private.holds_perm(business, actor, 'chat.announce'))
  then
    raise exception 'Announcements are for management, in groups' using errcode = '42501';
  end if;
  if conv.kind = 'team'
    and not as_announcement
    and private.chat_settings(business) ->> 'teamGroupWho' = 'announcers'
    and not private.holds_perm(business, actor, 'chat.announce')
  then
    raise exception 'Only management writes here' using errcode = '42501';
  end if;
  if clean is null and upload is null then
    raise exception 'An empty message' using errcode = '22023';
  end if;
  if char_length(clean) > 2000 then
    raise exception 'At most 2000 characters' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.chat_messages m
    where m.author_id = actor and m.created_at > at_time - interval '1 minute'
  ) >= 30 then
    raise exception 'Too many in a minute' using errcode = '54000';
  end if;
  if exists (select 1 from private.demo_businesses d where d.business_id = business)
    and (
      select count(*)
      from public.chat_messages m
      where m.business_id = business
        and not m.seeded
        and m.created_at > at_time - interval '1 hour'
    ) >= private.chat_demo_per_hour()
  then
    raise exception 'Too many in this demo for now' using errcode = '54000';
  end if;
  if upload is not null then
    held := private.attach_chat_upload(upload, actor, conv.id, at_time);
  end if;

  insert into public.chat_messages (
    business_id, conversation_id, author_id, draft_id, kind, body,
    file_kind, file_path, thumb_path, file_name, file_size, pinned, created_at
  )
  values (
    business, conv.id, actor, draft,
    case when as_announcement then 'announcement' else 'text' end,
    clean, held.file_kind, held.path, held.thumb_path, held.file_name, held.declared_size,
    as_announcement, at_time
  )
  on conflict (author_id, draft_id) do nothing
  returning id into sent;
  if sent is null then
    -- The same draft arrived twice at once: the first one stands.
    select m.id, m.conversation_id into sent, sent_in
    from public.chat_messages m
    where m.author_id = actor and m.draft_id = draft;
    return jsonb_build_object('conversation', sent_in, 'message', sent, 'attached', false);
  end if;
  if upload is not null then
    update private.file_uploads u set used_at = at_time where u.id = held.id;
  end if;

  update public.chat_conversations x
  set last_message_at = greatest(x.last_message_at, at_time),
    changed_at = clock_timestamp()
  where x.id = conv.id;

  -- What one sends, one has read.
  insert into public.chat_reads as r (conversation_id, business_id, user_id, read_at)
  values (conv.id, business, actor, at_time)
  on conflict (conversation_id, user_id)
  do update set read_at = greatest(r.read_at, excluded.read_at);

  if as_announcement then
    perform private.notify_announcement(sent, actor, at_time);
  else
    perform private.notify_chat(business, conv.id, private.chat_members(conv.id), actor, at_time);
  end if;

  return jsonb_build_object(
    'conversation', conv.id, 'message', sent, 'attached', upload is not null
  );
end;
$$;

------------------------------------------------------------------------------
-- Reading a file

-- The signed-in person may read the file `object_name` of the chat-files
-- bucket: `<business>/<conversation>/<32 hex>[-s].<webp|jpg|pdf>`, a message
-- of that conversation of that business pointing at it (its file or its
-- thumbnail), the message not removed and its file not gone, and the reader
-- reads the message (C1's gate: a private chat's two people, a group's members
-- from when they joined it and its pinned announcements, the moderators all of
-- a group; never an owner, the team or a view session as such). Anything else,
-- and any other shape, is false: strict ids, so a name of 36 dashes is false
-- before any cast, never an error inside the policy.
create function private.can_read_chat_file(object_name text)
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
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}(-s)?\.(webp|jpg|pdf)$'
  then
    return false;
  end if;
  return exists (
    select 1
    from public.chat_messages m
    where (m.file_path = object_name or m.thumb_path = object_name)
      and m.business_id = split_part(object_name, '/', 1)::uuid
      and m.conversation_id = split_part(object_name, '/', 2)::uuid
      and m.removed_at is null
      and m.file_removed_at is null
      and private.reads_chat_message(m.id, reader)
  );
end;
$$;

create policy "people read the files of the chat messages they read"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and private.can_read_chat_file(name));

-- C1's page (20261111000200_chat.sql), the same but for two more columns: a
-- message's file and its thumbnail, so the screen shows its picture through
-- /chat-files (whose route and the bucket's policy check the reader again).
-- Both are empty once the message is removed.
drop function public.chat_page(uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer);

create function public.chat_page(
  business uuid,
  conversation uuid,
  before_at timestamptz default null,
  before_id uuid default null,
  after_at timestamptz default null,
  after_id uuid default null,
  page_limit integer default 50
)
returns table (
  id uuid,
  author_id uuid,
  kind text,
  body text,
  file_kind text,
  file_name text,
  file_size integer,
  file_removed_at timestamptz,
  pinned boolean,
  created_at timestamptz,
  removed_at timestamptz,
  removed_by uuid,
  file_path text,
  thumb_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with gate as materialized (
    select c.id, c.business_id, private.chat_reads_from(c.id, (select auth.uid())) as since
    from public.chat_conversations c
    where c.id = conversation and c.business_id = business
  )
  select m.id, m.author_id, m.kind, m.body, m.file_kind, m.file_name, m.file_size,
    m.file_removed_at, m.pinned, m.created_at, m.removed_at, m.removed_by,
    m.file_path, m.thumb_path
  from gate g
  join public.chat_messages m
    on m.conversation_id = g.id
    and m.business_id = g.business_id
    and m.created_at >= g.since
  -- Row comparisons with no "is null or" around them, so the cursor bounds
  -- the index too; one left out is no bound.
  where (m.created_at, m.id) < (
      coalesce(before_at, 'infinity'::timestamptz),
      coalesce(before_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    and (m.created_at, m.id) > (
      coalesce(after_at, '-infinity'::timestamptz),
      coalesce(after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
    )
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(page_limit, 50), 1), 50)
$$;

------------------------------------------------------------------------------
-- Keeping files

-- The chat files due to go, oldest first and at most `max_rows` (up to 1000,
-- what Storage removes at once), as (bucket, path), each once, a thumbnail
-- just before its picture:
--   - the files of live messages older than their business's `fileDays` (30,
--     90 or 180, the manifest's choices; anything else stored counts as 90);
--   - each business's oldest live files past its `fileSpaceMb` (50, 100 or
--     200 MB; else 100), counting from its newest (Orel: the oldest go first,
--     even before their days are up);
--   - the files held for a removed message's undo once its 10 minutes are over;
--   - the files of a reservation never sent, after a day;
--   - anything in the bucket older than a day, in the app's shape, that no
--     message, held removal or open reservation points at: what a
--     hand-deleted account or business, or a demo reset, left behind (SQL can
--     read Storage's rows, never remove its files).
-- For the app's clean-up, which removes them through Storage and calls
-- public.forget_files. Documents (C6) are never listed for space.
create function public.expired_files(
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
    select l.file_path as file, l.thumb_path as thumb, l.created_at as since
    from live l
    join caps c on c.business_id = l.business_id
    where l.created_at < at_time - make_interval(days => c.keep_days)
      or l.newer_bytes > c.space_bytes
    union all
    select h.file_path, h.thumb_path, h.removed_at
    from private.chat_removed h
    where h.removed_at < at_time - interval '10 minutes'
      and (h.file_path is not null or h.thumb_path is not null)
    union all
    select u.path, u.thumb_path, u.created_at
    from private.file_uploads u
    where u.used_at is null
      and u.bucket = 'chat-files'
      and u.created_at < at_time - interval '1 day'
  ),
  due as (
    select 'chat-files'::text as bucket, o.thumb as path, o.since
    from owned o
    where o.thumb is not null
    union all
    select 'chat-files'::text, o.file, o.since
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
  )
  -- Byte order: `<key>-s.<ext>` before `<key>.<ext>`, whatever the collation.
  select d.bucket, d.path
  from due d
  group by d.bucket, d.path
  order by min(d.since), d.path collate "C"
  limit greatest(least(coalesce(max_rows, 500), 1000), 0)
$$;

-- The clean-up removed these files from Storage: a live message whose picture
-- is among them says from `at_time` that its file is no longer kept
-- (file_removed_at; the message stays), and its conversation's changed_at
-- moves, so every reader's sync hears of it and a screen open on it shows
-- the line in the picture's place (every reader of the message sees its file
-- go, so nobody learns more than that); a removed message's held file is let
-- go once its undo is over (the holding goes when nothing is left in it), and
-- a reservation never sent goes. A path is never used twice, so nothing else
-- is touched. Returns how many rows of files changed.
create function public.forget_files(
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

  delete from private.file_uploads u
  where u.path = any (paths)
    and u.used_at is null
    and u.created_at < at_time - interval '1 day';
  get diagnostics reserved = row_count;

  return messages + held + reserved;
end;
$$;

-- C1's tick (20261111000200_chat.sql), every 10 minutes: removed texts and
-- demo visitors' messages first (private.clean_chat, pure SQL), the
-- reservations sent more than a day ago (their messages hold the files now),
-- and then, only while a file is due, a call to the app to remove the files
-- (/cron/chat-files; only it reaches Storage's files). The app's address and
-- the secret come from Vault, as for the minute job (20261109000500_push.sql);
-- without them nothing is called, and the files wait.
create or replace function private.chat_tick(at_time timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_key text;
begin
  perform private.clean_chat(at_time);

  delete from private.file_uploads u
  where u.used_at is not null and u.used_at < at_time - interval '1 day';

  if not exists (select 1 from public.expired_files(at_time, 1)) then
    return;
  end if;

  select v.decrypted_secret into app_url
  from vault.decrypted_secrets v where v.name = 'app_url';
  select v.decrypted_secret into cron_key
  from vault.decrypted_secrets v where v.name = 'cron_secret';
  if app_url is null or cron_key is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(app_url, '/') || '/cron/chat-files',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

------------------------------------------------------------------------------
-- The console's storage card

-- How full the project is, for the ConceptApp team (42501 for anyone else,
-- under their own session, as public.admin_businesses): the database's size;
-- Storage per bucket (bytes and files); each business's chat files (bytes
-- under its folder of chat-files) beside its caps (`fileSpaceMb` and
-- `documentSpaceMb`, counted only where chat is on and files are taken); and
-- the caps' sum, which must stay under the free plan's 1 GB with the rest.
-- Sizes and counts only: no file, conversation, message or person, and no
-- chat table is read for it.
create function public.admin_storage()
returns jsonb
language plpgsql
stable
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
      private.chat_settings(b.id) as settings
    from public.businesses b
    left join used u on u.folder = b.id::text
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'business', e.id,
      'slug', e.slug,
      'name', e.name,
      'chat_bytes', e.chat_bytes,
      'files_open', e.files_open,
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
-- Confirming an announcement: only those who see who confirmed learn of it

-- When the row was written, as the database's clock says (acked_at is when
-- the person pressed, as the caller says): what moves the sync's stamp and
-- version for the announcement's author, the moderators and the person
-- themselves. Read by nobody else, as the row itself.
alter table public.chat_acks add column recorded_at timestamptz;
update public.chat_acks a set recorded_at = a.acked_at;
alter table public.chat_acks
  alter column recorded_at set default clock_timestamp(),
  alter column recorded_at set not null;

comment on column public.chat_acks.recorded_at is
  'When the confirmation was written (clock time): public.chat_stamp and public.chat_version read it for the announcement''s author, the moderators and the person themselves, never for anyone else.';
comment on column public.chat_conversations.changed_at is
  'When anything every reader of the conversation sees last changed there: a message sent, removed, put back, pinned or unpinned, or a file no longer kept. Never a confirmation, which only its announcement''s author and the moderators see (public.chat_stamp).';

-- C1's confirm (20261111000200_chat.sql), the same but that it no longer
-- moves the conversation's changed_at: every member's sync reads that, so a
-- worker could tell that someone confirmed. The confirmation's own row moves
-- the stamp and the version of those who see it (recorded_at).
create or replace function public.confirm_announcement(
  actor uuid,
  message uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.chat_messages%rowtype;
begin
  select m.* into msg from public.chat_messages m where m.id = message;
  if not found or not private.reads_chat_message(msg.id, actor) then
    raise exception 'Unknown message' using errcode = 'P0002';
  end if;
  if msg.kind <> 'announcement' then
    raise exception 'Not an announcement' using errcode = '22023';
  end if;
  if msg.removed_at is not null then
    raise exception 'The announcement was removed' using errcode = '55000';
  end if;
  if msg.author_id is not distinct from actor then
    return;
  end if;

  insert into public.chat_acks (message_id, business_id, user_id, acked_at)
  values (msg.id, msg.business_id, actor, at_time)
  on conflict (message_id, user_id) do nothing;

  perform private.settle_own_line(
    msg.business_id, actor, 'chat.announcement.' || msg.id::text, at_time
  );
end;
$$;

-- One conversation's stamp for the signed-in person's sync (C3's `cv`): its
-- kind, and when anything they see there last changed: its changed_at (a
-- message sent, removed, put back, pinned, a file no longer kept), or a
-- confirmation they see: their own, any there for a moderator, or one of
-- their own announcement while they still read it (as
-- public.announcement_readers shows its readers only then). Nothing for a
-- conversation they don't read. A worker's stamp never moves when someone
-- else confirms.
create function public.chat_stamp(business uuid, conversation uuid)
returns table (kind text, changed timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.kind,
    greatest(
      c.changed_at,
      (
        select max(a.recorded_at)
        from public.chat_messages m
        join public.chat_acks a on a.message_id = m.id and a.business_id = m.business_id
        where m.conversation_id = c.id
          and m.business_id = c.business_id
          and m.kind = 'announcement'
          and (
            a.user_id = me.reader
            or me.moderates
            or (m.author_id = me.reader and private.reads_chat_message(m.id, me.reader))
          )
      )
    )
  from (
    select (select auth.uid()) as reader,
      private.chat_moderates(business, (select auth.uid())) as moderates
  ) me
  join public.chat_conversations c on c.id = conversation and c.business_id = business
  where private.chat_reads_from(c.id, me.reader) is not null
$$;

-- C1's version (20261111000200_chat.sql), the same parts, and one more: the
-- confirmations whose readers the caller sees (of their own announcements
-- they still read, and for a moderator every one in their groups), counted,
-- with the newest. Since confirming no longer moves changed_at, someone
-- else's confirmation moves nobody else's version.
create or replace function public.chat_version(business uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as reader,
      private.chat_moderates(business, (select auth.uid())) as moderates
  ),
  mine as (
    select c.id, c.kind, c.changed_at
    from public.chat_conversations c
    cross join me
    where c.business_id = business
      and (c.kind <> 'direct' or me.reader in (c.person_a, c.person_b))
      and private.chat_reads_from(c.id, me.reader) is not null
  ),
  told as (
    select a.recorded_at
    from mine c
    cross join me
    join public.chat_messages m
      on m.conversation_id = c.id and m.business_id = business and m.kind = 'announcement'
    join public.chat_acks a on a.message_id = m.id and a.business_id = m.business_id
    where c.kind <> 'direct'
      and (
        me.moderates
        or (m.author_id = me.reader and private.reads_chat_message(m.id, me.reader))
      )
  )
  select md5(concat_ws('|',
    (select count(*) from mine)::text,
    coalesce((select max(m.changed_at) from mine m)::text, ''),
    coalesce((
      select max(r.read_at) from public.chat_reads r cross join me
      where r.business_id = business and r.user_id = me.reader
    )::text, ''),
    (
      select count(*) from public.chat_reads r cross join me
      where r.business_id = business and r.user_id = me.reader and r.muted
    )::text,
    (
      select count(*) from public.chat_acks a cross join me
      where a.business_id = business and a.user_id = me.reader
    )::text,
    coalesce((
      select max(o.read_at)
      from mine m
      join public.chat_reads o on o.conversation_id = m.id
      cross join me
      where m.kind = 'direct' and o.user_id <> me.reader and private.chat_read_marks()
    )::text, ''),
    (select count(*) from told)::text,
    coalesce((select max(t.recorded_at) from told t)::text, '')
  ))
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The storage policy's helper runs as the reader, so the signed-in role runs it.
revoke execute on function private.can_read_chat_file(text) from public, anon;
grant execute on function private.can_read_chat_file(text) to authenticated;

-- The rest of the private ones run inside the functions, as their owner.
revoke execute on function private.chat_files_closed(uuid) from public, anon, authenticated;
revoke execute on function private.refuse_demo_chat_file() from public, anon, authenticated;
revoke execute on function private.storage_used() from public, anon, authenticated;
revoke execute on function private.files_guard_bytes() from public, anon, authenticated;
revoke execute on function private.attach_chat_upload(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

-- The screens ask with the person's own session.
revoke execute on function public.chat_page(
  uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer
) from public, anon;
grant execute on function public.chat_page(
  uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer
) to authenticated;
revoke execute on function public.chat_stamp(uuid, uuid) from public, anon;
grant execute on function public.chat_stamp(uuid, uuid) to authenticated;
-- The console, for the team only (the function refuses anyone else).
revoke execute on function public.admin_storage() from public, anon;
grant execute on function public.admin_storage() to authenticated;

-- The server's alone.
revoke execute on function public.chat_files_closed(uuid) from public, anon, authenticated;
grant execute on function public.chat_files_closed(uuid) to service_role;
revoke execute on function public.reserve_chat_upload(
  uuid, uuid, text, text, integer, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_chat_upload(
  uuid, uuid, text, text, integer, uuid, uuid, text, timestamptz
) to service_role;
revoke execute on function public.send_chat_message(
  uuid, uuid, uuid, text, uuid, uuid, boolean, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.send_chat_message(
  uuid, uuid, uuid, text, uuid, uuid, boolean, timestamptz, uuid
) to service_role;
revoke execute on function public.expired_files(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.expired_files(timestamptz, integer) to service_role;
revoke execute on function public.forget_files(text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.forget_files(text[], timestamptz) to service_role;

-- Replaced above: the same grants as C1 set.
revoke execute on function private.chat_tick(timestamptz) from public, anon, authenticated;
revoke execute on function public.confirm_announcement(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_announcement(uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.chat_version(uuid) from public, anon;
grant execute on function public.chat_version(uuid) to authenticated;
