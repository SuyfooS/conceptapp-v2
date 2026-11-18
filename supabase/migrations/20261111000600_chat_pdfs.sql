-- Chat, part 5 (C5 of the chat plan; Orel's numbers on issue #1): PDFs in
-- chat, up to 10 MiB. Vercel refuses request bodies over 4.5 MB, so a PDF
-- doesn't pass through the server as a picture does: the server reserves its
-- place (public.reserve_chat_upload, C4's, with kind 'pdf') and gives the
-- browser a signed upload for that one path, the browser PUTs the file there,
-- and the server reads its first KB and sends it (public.send_chat_message,
-- C4's, which checks its size and type in storage.objects itself). C4 took
-- PDFs in every rule already: the bucket's types, the reservation's kind and
-- 10 MiB, the attach's checks, the read policy and the clean-up. This adds
-- what a file the browser writes itself needs:
--
--   finishing   public.chat_upload_place tells the server where a person's
--               reservation is, so the file it reads to check is the
--               reservation's own, never a path the browser names; and
--               whether it was sent already (a retry) or waited past its 2
--               hours.
--   letting go  Storage's signed upload is good for 2 hours and writes
--               wherever nothing is (it never replaces a file, and nothing
--               marks it used), so a place let go while it may still be good
--               keeps the server's 1-byte tombstone (@domain/chat-files
--               CHAT_PLACE_TOMBSTONE, typed a PDF and never one) instead of
--               going empty: a stop, a refusal on finishing, and the job's
--               removal of a sent PDF's file (its message removed, or the
--               oldest past a business's space) before its place is 2 hours
--               and 5 minutes old (public.chat_paths_signed tells the
--               clean-up which). Nobody reads a tombstone (no live message
--               points at it), it holds no place, and the clean-up removes it
--               a day on, with what nothing points at.
--   waiting     what the browser put and never sent waits for the clean-up a
--               day on: a person holds at most 10 PDF places unsent from the
--               last day that hold a file or may still be given one
--               (public.reserve_chat_upload, replaced, 54000 with hint
--               'pdfs'). A PDF's name ends in .pdf.
--   room        C4's guard counted what Storage holds, and a PDF's bytes come
--               later, from the browser: the places on their way now count
--               for as much as they can bring (private.uploads_on_their_way;
--               a PDF's 10 MiB whatever size it was reserved at, since nothing
--               ties the browser's PUT to it). And a business's PDFs reserved
--               in the last 10 minutes, sent or not, bring at most its
--               `fileSpaceMb` (54000 with hint 'busy'): the job, every 10
--               minutes, brings its files back under its space, so it never
--               holds much more than twice that, and one person can't fill
--               the 900 MB every business shares.
--   one by one  a person's reservations are counted one at a time, and a
--               business's PDFs too (advisory locks, held to the end of the
--               reservation), so reservations sent at once all meet the
--               counts.
--   the list    public.chat_inbox gives the last message's file name too, for
--               a PDF's "קובץ PDF" with its name in the list (dropped and made
--               again, the same grants). Empty once the message is removed,
--               as its kind is. And a private chat with no message yet is
--               listed for neither of its two: a PDF to someone new opens the
--               chat before its bytes go up, and a stop or a refusal then
--               would tell them someone started writing. The one who opened
--               it reaches it from the person's page, as before.

------------------------------------------------------------------------------
-- What a place can hold

-- What Storage holds at `object_name` in the bucket `in_bucket`, in bytes;
-- null when nothing is there. A row whose size isn't written (yet) counts as
-- the most the chat bucket takes, 10 MiB.
create function private.stored_bytes(in_bucket text, object_name text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
    then (o.metadata ->> 'size')::bigint else 10485760::bigint end
  from storage.objects o
  where o.bucket_id = in_bucket and o.name = object_name
$$;

-- The bytes on their way into Storage at `at_time`, every business together:
-- each place reserved up to `at_time` and not sent, where Storage holds
-- nothing yet, while its signed upload may still be good (2 hours from when
-- the server made it, on Storage's clock: 2 hours and 5 minutes here). A PDF
-- counts for the 10 MiB the bucket takes, whatever size it was reserved at
-- (nothing ties the browser's PUT to it); a picture for its size (the server
-- uploads it itself, at once).
create function private.uploads_on_their_way(at_time timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case when u.file_kind = 'pdf' then 10485760::bigint else u.declared_size::bigint end
  ), 0::bigint)::bigint
  from private.file_uploads u
  where u.used_at is null
    and u.created_at > at_time - interval '2 hours 5 minutes'
    and u.created_at <= at_time
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = u.bucket and o.name = u.path
    )
$$;

------------------------------------------------------------------------------
-- Reserving a file's place

-- C4's (20261111000500_chat_files.sql), the same in every rule, and more for
-- what the browser writes itself:
--   - a PDF's name, when given, ends in .pdf (22023);
--   - its sender holds at most 10 PDF places unsent from the day up to
--     `at_time` that hold a file or may still be given one (54000 with hint
--     'pdfs'; @domain/chat-files CHAT_PDFS_WAITING_MAX): a file there (more
--     than the server's 1-byte tombstone), or, with nothing there, a signed
--     upload that may still be good. A PDF sent no longer counts, nor a place
--     let go, nor one whose upload is over with nothing in it;
--   - its business's PDFs reserved in the 10 minutes up to `at_time`, sent
--     or not, with this one, bring at most its `fileSpaceMb` (54000 with hint
--     'busy'; @domain/chat-files CHAT_PDF_BURST_MINUTES): a sent one its
--     size, one not sent what Storage holds at its place, or 10 MiB while
--     nothing is there yet;
--   - the project's guard counts the places on their way too
--     (private.uploads_on_their_way), and this one for what it can bring: a
--     PDF 10 MiB, a picture its size.
-- A person's reservations are counted one at a time, and a business's PDFs
-- too, so reservations sent at once can't all pass the counts.
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
-- Finishing a file the browser put in place

-- `actor`'s own reservation `upload` for a chat file in `business`, as the
-- server needs it to finish a PDF the browser PUT through its signed upload:
-- where its file is (`path`, which the server reads and, on any refusal,
-- removes: never a path the browser names), its conversation, its kind, the
-- size and name reserved, whether it was sent (`used`: a retry of a sending
-- whose answer was lost, so its file is a message's now and stays), and
-- whether its 2 hours are still on at `at_time` (`fresh`; Storage's signed
-- upload is good for as long). Null for anyone else's reservation, another
-- business's, a document's, or none: the same answer whether it exists or
-- not. Writes nothing.
create function public.chat_upload_place(
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
    'conversation', u.conversation_id,
    'kind', u.file_kind,
    'size', u.declared_size,
    'name', u.file_name,
    'used', u.used_at is not null,
    'fresh', u.created_at >= at_time - interval '2 hours'
  )
  from private.file_uploads u
  where u.id = upload
    and u.owner_id = actor
    and u.business_id = business
    and u.target = 'chat'
    and u.bucket = 'chat-files'
$$;

------------------------------------------------------------------------------
-- Letting a place go

-- Of these chat files (`paths`, the clean-up's from public.expired_files),
-- the PDFs whose place was reserved less than 2 hours and 5 minutes before
-- `at_time`, sent or not: Storage's signed upload for one may still be good
-- (2 hours from when the server made it, on Storage's own clock), and it
-- writes wherever nothing is. The clean-up leaves the server's 1-byte
-- tombstone at such a path instead of removing it, so nothing can be written
-- there again; nobody reads it, and it goes a day on, with what nothing
-- points at. A picture's files are the server's own to put: never among them.
-- Writes nothing.
create function public.chat_paths_signed(
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
    and u.bucket = 'chat-files'
    and u.file_kind = 'pdf'
    and u.created_at > at_time - interval '2 hours 5 minutes'
$$;

------------------------------------------------------------------------------
-- The list

-- C1's list (20261111000200_chat.sql), the same, and one more column last:
-- the last message's file name (a PDF's, C5), so the list says "קובץ PDF"
-- with it. Null with no file, for a picture (which has none), and once the
-- message is removed (its file's name went with it). A private chat with no
-- message the reader reads is listed for neither of its two: a file's
-- reservation opens it before anything is sent, and a stop or a refusal
-- then would show the other person that someone started writing to them.
-- Groups are listed with no message, as before.
drop function public.chat_inbox(uuid);

create function public.chat_inbox(business uuid)
returns table (
  conversation uuid,
  kind text,
  department uuid,
  other_person uuid,
  last_at timestamptz,
  last_author uuid,
  last_kind text,
  last_preview text,
  last_file_kind text,
  unread integer,
  muted boolean,
  closed boolean,
  pinned_waiting integer,
  last_file_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.kind,
    c.department_id,
    case when c.kind = 'direct' then
      case when c.person_a = c.reader then c.person_b else c.person_a end
    end,
    lm.created_at,
    lm.author_id,
    lm.kind,
    left(lm.body, 120),
    lm.file_kind,
    (
      select count(*)::integer
      from (
        select 1
        from public.chat_messages m
        where m.conversation_id = c.id
          and m.business_id = c.business_id
          and m.created_at >= c.since
          and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz)
          and m.author_id is distinct from c.reader
          and m.removed_at is null
        limit 99
      ) waiting
    ),
    coalesce(r.muted, false),
    c.closed_at is not null,
    (
      select count(*)::integer
      from public.chat_messages p
      where p.conversation_id = c.id
        and p.pinned
        and p.author_id is distinct from c.reader
        and not exists (
          select 1 from public.chat_acks a
          where a.message_id = p.id and a.user_id = c.reader
        )
    ),
    lm.file_name
  from (
    select x.*, me.reader, private.chat_reads_from(x.id, me.reader) as since
    from (select (select auth.uid()) as reader) me
    cross join public.chat_conversations x
    where x.business_id = business
      and (x.kind <> 'direct' or me.reader in (x.person_a, x.person_b))
    offset 0
  ) c
  left join public.chat_reads r on r.conversation_id = c.id and r.user_id = c.reader
  left join lateral (
    select m.created_at, m.author_id, m.kind, m.body, m.file_kind, m.file_name
    from public.chat_messages m
    where m.conversation_id = c.id
      and m.business_id = c.business_id
      and m.created_at >= c.since
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  where c.since is not null
    and (c.kind <> 'direct' or lm.created_at is not null)
  order by lm.created_at desc nulls last, c.id
$$;

------------------------------------------------------------------------------
-- Who may call what

-- Run inside the functions, as their owner.
revoke execute on function private.stored_bytes(text, text) from public, anon, authenticated;
revoke execute on function private.uploads_on_their_way(timestamptz)
  from public, anon, authenticated;

-- The server's alone.
revoke execute on function public.chat_upload_place(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.chat_upload_place(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.chat_paths_signed(text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.chat_paths_signed(text[], timestamptz) to service_role;

-- Replaced above: the same grants as C4 and C1 set.
revoke execute on function public.reserve_chat_upload(
  uuid, uuid, text, text, integer, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_chat_upload(
  uuid, uuid, text, text, integer, uuid, uuid, text, timestamptz
) to service_role;
revoke execute on function public.chat_inbox(uuid) from public, anon;
grant execute on function public.chat_inbox(uuid) to authenticated;
