-- Chat files, list photos and profile photos through the server only
-- (getting ready for a real business, Orel's order of 22 November 2026 on
-- issue #1), as official documents' files have been since
-- 20261111000900_documents_server_only.sql.
--
--   why          three policies on storage.objects were left: "people read
--                the files of the chat messages they read"
--                (private.can_read_chat_file), "people read the photos of the
--                lists they see" (private.can_read_list_photo) and "people
--                and their colleagues read photos". Each let a reader's own
--                session read its bucket, so their access token, copied from
--                the browser's developer tools, could ask Storage for a
--                signed URL of a file they read (createSignedUrl), good for
--                as long as it asked: opened by anyone without signing in,
--                after the person left the business and after a message was
--                removed, until the clean-up took the file, and served by
--                Supabase without the app's row check or /chat-files' rules
--                (its CSP, same-origin only). And the avatars policy took a
--                person's whole folder, never profiles.avatar_path, so a
--                replaced or removed photo whose removal failed stayed
--                readable to their colleagues.
--   now          no bucket has a policy: anon and authenticated read nothing
--                of chat-files, list-photos, avatars or documents (no
--                download, no list, no signed URL), whoever they are. The
--                app's routes check the row under the reader's own session
--                (RLS: the message for /chat-files, the list's item for
--                /list-photos, public.sees_profile_photo for /photos), and
--                only then the server reads the file with the secret key.
--                Writes are as they were: only the server writes.
--   photos       a profile photo is read only while profiles.avatar_path
--                points at it, by the person and their active colleagues, the
--                policy's audience (public.sees_profile_photo). The server
--                swaps the pointer under the row's lock and gets back the
--                file it replaced, to remove (public.set_avatar_path), so two
--                saves at once, or a save and a removal, never leave a file
--                that nothing points at. The daily job `list-photos` also
--                asks the app while a profile photo a day old has no profile
--                pointing at it (public.expired_avatars, and
--                private.list_photos_tick replaced): a removal Storage
--                refused, a save whose answer was lost, a deleted account's,
--                what a demo reset left.
--   shares       one person's share of a business's space for chat files is
--                half of it. Past the space, what one person holds beyond
--                their half goes first, their oldest first, and only then
--                the oldest of all (public.expired_files, replaced): nobody
--                alone pushes out the files of chats they don't read. And
--                their own PDFs of the last 10 minutes bring at most half of
--                it (public.reserve_chat_upload, replaced, 54000 with hint
--                'own'), so nobody alone keeps everyone's PDFs waiting. Under
--                its space a business keeps its files as before.
--   dropped      the three policies, each before its helper:
--                private.can_read_chat_file(text) and
--                private.can_read_list_photo(text), which only the policies
--                called. private.avatar_owner(text) stays, for the functions
--                below, which run it as their owner: authenticated no longer
--                runs it.

------------------------------------------------------------------------------
-- No read of the three buckets but the server's

drop policy "people read the files of the chat messages they read" on storage.objects;

drop function private.can_read_chat_file(text);

drop policy "people read the photos of the lists they see" on storage.objects;

drop function private.can_read_list_photo(text);

drop policy "people and their colleagues read photos" on storage.objects;

-- Only the policies ran it as the reader.
revoke execute on function private.avatar_owner(text) from authenticated;

------------------------------------------------------------------------------
-- Profile photos: the current one only

-- The signed-in person may be shown the profile photo `photo_path`: it is the
-- current photo of its folder's person (profiles.avatar_path), and that person
-- is them or an active colleague (private.shares_business): what the avatars
-- bucket's policy said, now tied to the row, so a replaced or removed photo is
-- nobody's. False for anything else, any other shape and none included, never
-- an error. For /photos, under the reader's own session, before the server
-- reads the file with the secret key. No branch for a view session, as before.
create function public.sees_profile_photo(photo_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = private.avatar_owner(photo_path)
      and p.avatar_path = photo_path
      and (p.id = (select auth.uid()) or private.shares_business(p.id))
  )
$$;

-- The server points `person`'s profile at the photo it uploaded (`new_path`),
-- or at none, under the row's lock, and gets back the file it replaced, to
-- remove: two saves at once, or a save and a removal, each remove the one they
-- replaced, so none leaves a file that nothing points at. Null when there was
-- none, or it is the same path. Refused: no such person (P0002); a path out of
-- their folder or of another shape (23514, the column's check); a new photo for
-- someone a demo business keeps as they are (55000, profiles_demo_photo).
-- Callers make sure `person` is the signed-in person.
create function public.set_avatar_path(person uuid, new_path text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  replaced text;
begin
  select p.avatar_path into replaced
  from public.profiles p
  where p.id = person
  for update;
  if not found then
    raise exception 'Unknown person' using errcode = 'P0002';
  end if;
  if new_path is not distinct from replaced then
    return null;
  end if;
  update public.profiles p set avatar_path = new_path where p.id = person;
  return replaced;
end;
$$;

-- The avatars bucket's files a day old that no profile points at, oldest first
-- and at most `max_rows` (up to 1000, what Storage removes at once), for the
-- daily clean-up: a replaced or removed photo whose removal Storage refused, a
-- save whose answer was lost, a deleted account's, what a demo reset left.
-- Only names in the app's shape (`<user id>/<key>.<jpg|png|webp>`).
create function public.expired_avatars(
  at_time timestamptz default now(),
  max_rows integer default 500
)
returns table (path text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name
  from storage.objects s
  where s.bucket_id = 'avatars'
    and s.created_at < at_time - interval '1 day'
    and s.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{8,64}\.(jpg|png|webp)$'
    and not exists (
      select 1 from public.profiles p
      where p.id = private.avatar_owner(s.name) and p.avatar_path = s.name
    )
  order by s.created_at, s.name collate "C"
  limit greatest(least(coalesce(max_rows, 500), 1000), 0)
$$;

-- 20261110001500_list_photos.sql's, the same, and also while a profile photo
-- nothing points at is due (public.expired_avatars): the app removes both.
--
-- Once a day: when a photo is older than its business keeps it, or a profile
-- photo a day old has no profile pointing at it, ask the app to remove what
-- is due (/cron/list-photos; only it reaches Storage's files). The app's
-- address and the secret come from Vault, as for the minute job
-- (20261109000500_push.sql); without them nothing is called, and the photos
-- wait for the next day it can.
create or replace function private.list_photos_tick(at_time timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_key text;
begin
  if not exists (select 1 from public.expired_list_photos(at_time, 1))
    and not exists (select 1 from public.expired_avatars(at_time, 1))
  then
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
    url := rtrim(app_url, '/') || '/cron/list-photos',
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
-- Chat files: one person's share

-- C6's (20261111000700_documents.sql), the same, with one person's share:
-- past a business's space, what one person holds beyond half of it goes
-- first, their oldest first, and only then the oldest of all, so nobody alone
-- pushes out everyone's files (those of chats they don't read among them).
-- Under its space nothing goes for space, however much one person holds, and
-- a business with one sender keeps its files as before. A deleted account's
-- files (no author) count as one sender's.
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
  with by_sender as (
    -- What each file's sender holds from it on, newest first: one person's
    -- share is half of the business's space (CHAT_SENDER_SPACE_DIVISOR).
    select m.id, m.business_id, m.file_path, m.thumb_path, m.created_at, m.file_size,
      sum(m.file_size::bigint) over (
        partition by m.business_id, m.author_id
        order by m.created_at desc, m.id desc
        rows between unbounded preceding and current row
      ) as sender_bytes
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
    from (select distinct o.business_id from by_sender o) b
    cross join lateral (select private.chat_settings(b.business_id) as settings) x
  ),
  live as (
    -- What is kept ahead of each file (newer_bytes): first what each sender
    -- holds within their share, newest first, then what they hold beyond it,
    -- newest first (false sorts before true). So past its space a business's
    -- files beyond someone's half go first, their oldest first, and only then
    -- the oldest of all; under its space nothing goes for space.
    select o.business_id, o.file_path, o.thumb_path, o.created_at,
      sum(o.file_size::bigint) over (
        partition by o.business_id
        order by (o.sender_bytes > c.space_bytes / 2), o.created_at desc, o.id desc
        rows between unbounded preceding and current row
      ) as newer_bytes
    from by_sender o
    join caps c on c.business_id = o.business_id
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

-- C5's (20261111000600_chat_pdfs.sql), the same, with one rule more: a PDF's
-- sender's own PDFs reserved in the 10 minutes up to `at_time`, counted as the
-- business's are, with this one's 10 MiB, bring at most half of the
-- business's space (54000 with hint 'own'; @domain/chat-files
-- CHAT_SENDER_SPACE_DIVISOR), asked before the business's own ('busy') and
-- under the same lock.
create or replace function public.reserve_chat_upload(
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
  -- One person's reservations one at a time: those sent at once each see the
  -- others' rows in the counts below (READ COMMITTED: each count reads what
  -- was committed when it starts, after the lock).
  perform pg_advisory_xact_lock(hashtextextended('chat_upload:' || actor::text, 0));
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
  if upload_kind = 'pdf' and clean_name is not null and clean_name !~* '\.pdf$' then
    raise exception 'A PDF''s name ends in .pdf' using errcode = '22023';
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
  if upload_kind = 'pdf' then
    -- A business's PDFs one at a time too, for its 10 minutes below.
    perform pg_advisory_xact_lock(hashtextextended('chat_pdfs:' || business::text, 0));
    -- The day up to `at_time`, the same way: PDF places never sent that hold
    -- a file (more than a tombstone), or, with nothing there, whose signed
    -- upload may still be good.
    if (
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
    -- The sender's own PDFs of the same 10 minutes, counted the same way, with
    -- this one's 10 MiB, bring at most half of the business's space: nobody
    -- alone keeps everyone's PDFs waiting (CHAT_SENDER_SPACE_DIVISOR).
    if (
      select coalesce(sum(
        case when u.used_at is not null then u.declared_size::bigint
          else coalesce(private.stored_bytes(u.bucket, u.path), 10485760::bigint)
        end
      ), 0::bigint)::bigint
      from private.file_uploads u
      where u.business_id = business
        and u.owner_id = actor
        and u.target = 'chat'
        and u.file_kind = 'pdf'
        and u.created_at > at_time - interval '10 minutes'
        and u.created_at <= at_time
    ) + 10485760::bigint > (
      case private.chat_settings(business) ->> 'fileSpaceMb'
        when '50' then 50::bigint when '200' then 200::bigint else 100::bigint
      end * 1048576
    ) / 2 then
      raise exception 'Too many of your PDFs for now' using errcode = '54000', hint = 'own';
    end if;
    -- The business's 10 minutes up to `at_time`: what its PDFs bring, at
    -- most, with this one's 10 MiB, within its space.
    if (
      select coalesce(sum(
        case when u.used_at is not null then u.declared_size::bigint
          else coalesce(private.stored_bytes(u.bucket, u.path), 10485760::bigint)
        end
      ), 0::bigint)::bigint
      from private.file_uploads u
      where u.business_id = business
        and u.target = 'chat'
        and u.file_kind = 'pdf'
        and u.created_at > at_time - interval '10 minutes'
        and u.created_at <= at_time
    ) + 10485760::bigint > (
      case private.chat_settings(business) ->> 'fileSpaceMb'
        when '50' then 50::bigint when '200' then 200::bigint else 100::bigint
      end * 1048576
    ) then
      raise exception 'Too many PDFs here for now' using errcode = '54000', hint = 'busy';
    end if;
  end if;
  if private.storage_used() + private.uploads_on_their_way(at_time)
    + (case when upload_kind = 'pdf' then 10485760::bigint else upload_size::bigint end)
    > private.files_guard_bytes()
  then
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

------------------------------------------------------------------------------
-- Who may call what

-- /photos asks it under the reader's own session.
revoke execute on function public.sees_profile_photo(text) from public, anon;
grant execute on function public.sees_profile_photo(text) to authenticated;

-- The server's alone.
revoke execute on function public.set_avatar_path(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_avatar_path(uuid, text) to service_role;
revoke execute on function public.expired_avatars(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.expired_avatars(timestamptz, integer) to service_role;

-- Replaced above with their signatures: their grants stay.
