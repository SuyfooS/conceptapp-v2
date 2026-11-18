-- Lists, part 6 (L6 of the lists plan; Orel's defaults on issue #1: about
-- 0.3 MB a photo, kept 90 days, a setting for the team, the clean-up in the
-- app's daily job, and nothing that costs): photo items.
--
--   bucket      list-photos: private, a JPEG or WebP of at most 400 KB, in
--               `<business>/<list>/<key>.<webp|jpg>`, the rule
--               list_items.photo_path keeps since 20261109000600_lists.sql.
--               Only the server writes it (@db/list-photos, with the secret
--               key, after re-checking the file the browser re-encoded); the
--               app's /list-photos route reads it under the reader's own
--               session, so the policy below decides.
--   reading     private.can_read_list_photo: the path's list is of the path's
--               business, lists are on there, one of its photo items points
--               at the file, and the reader sees the list (private.sees_list)
--               or views the business as a manager. No insert, update or
--               delete policy: as avatars since 20261108000300_sealed.sql.
--   items       public.set_list_item_photo(actor, item, new_path, at_time):
--               the server sets or clears a photo item's file after the
--               upload, with set_list_item's checks (the list open, held by
--               the actor or managed by them), the path in the item's own
--               list's folder, and gets back the file it replaced, to remove.
--               Templates and lists typed when sending take photo items now
--               (private.list_item_fields).
--   demo        private.list_photos_closed: a demo business takes no photo
--               unless its definition says "photos": true (the local seed's
--               restaurant, for the browser tests; never a hosted one), as
--               profile photos (20261109000100_profile_photo_demo.sql). The
--               server asks first (public.list_photos_closed) and the trigger
--               list_items_demo_photo refuses a new one (55000); clearing
--               stays allowed. Visitors' uploads never pile up.
--   keeping     photos are kept `photoDays` days from when each was taken
--               (the lists settings, 90 unless the team chose 30, 180 or 365
--               in the console: a setting for the team, as the manifest
--               says, so owners and managers never see it). Once a day
--               the job list-photos asks the app (pg_net, with the minute
--               job's Vault secrets) to remove what is older: the app lists
--               it with public.expired_list_photos, removes the files through
--               Storage and marks them with public.forget_list_photos
--               (list_items.photo_removed_at). The item stays done and says
--               its photo is no longer kept.
--   templates   the restaurant's weekly cleaning ends with a photo of the
--               kitchen after cleaning, which may stay empty (a demo
--               business takes none and still finishes the list), a version
--               up. Both hosted demo businesses start again with it.

------------------------------------------------------------------------------
-- The bucket

-- Made from the dashboard before this ran, it is set to the same.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('list-photos', 'list-photos', false, 409600, array['image/jpeg', 'image/webp'])
on conflict (id) do update
set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- When the daily clean-up removed an item's photo. The path stays, so the
-- item stays done and says what it was.
alter table public.list_items
  add column photo_removed_at timestamptz,
  add constraint list_items_photo_removed_check
    check (photo_removed_at is null or photo_path is not null);

-- The photos still kept, oldest first, for the daily clean-up.
create index list_items_photos_idx on public.list_items (done_at)
  where photo_path is not null and photo_removed_at is null;

------------------------------------------------------------------------------
-- Reading

-- The signed-in person may read the file `object_name` of the list-photos
-- bucket: `<business>/<list>/<file>`, the list of that business, lists on
-- there, one of its photo items pointing at the file, and the reader sees the
-- list or views the business as a manager (a view session reads the list, so
-- it reads its photos too). Anything else, and any other shape, is false.
create function private.can_read_list_photo(object_name text)
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
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]{1,40}\.(webp|jpg)$'
  then
    return false;
  end if;
  return exists (
    select 1
    from public.lists l
    join public.list_items i on i.list_id = l.id and i.photo_path = object_name
    where l.id = split_part(object_name, '/', 2)::uuid
      and l.business_id = split_part(object_name, '/', 1)::uuid
      and private.module_enabled(l.business_id, 'lists'::public.module_key)
      and (
        private.sees_list(l.id, reader)
        or private.is_viewing(l.business_id, 'manager'::public.member_role)
      )
  );
end;
$$;

create policy "people read the photos of the lists they see"
  on storage.objects for select to authenticated
  using (bucket_id = 'list-photos' and private.can_read_list_photo(name));

------------------------------------------------------------------------------
-- Demo businesses

-- A demo business that takes no photos: anyone at the demo door is any of its
-- people, and a photo taken there would wait for the next visitor. Open when
-- its definition says "photos": true.
create function private.list_photos_closed(business uuid)
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
      and d.definition -> 'photos' is distinct from 'true'::jsonb
  )
$$;

-- The same question, for the server before an upload (secret key).
create function public.list_photos_closed(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.list_photos_closed(business)
$$;

-- A new photo in a demo business that takes none is refused. Clearing one
-- stays allowed.
create function private.refuse_demo_list_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_path is not null
    and new.photo_path is distinct from old.photo_path
    and private.list_photos_closed(new.business_id)
  then
    raise exception 'Demo businesses take no photos' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger list_items_demo_photo
  before update of photo_path on public.list_items
  for each row execute function private.refuse_demo_list_photo();

------------------------------------------------------------------------------
-- Photo items

-- private.list_item_fields of 20261109000600_lists.sql, taking photo items:
-- a photo, like a note, has no unit, range or usual quantity.
create or replace function private.list_item_fields(
  raw jsonb,
  with_id boolean,
  out item_kind text,
  out item_label text,
  out item_hint text,
  out item_required boolean,
  out item_unit text,
  out item_min numeric,
  out item_max numeric,
  out item_quantity integer
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(raw) is distinct from 'object' then
    raise exception 'An item must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(raw) as k (field)
    where k.field not in (
        'kind', 'label', 'hint', 'required', 'unit', 'min', 'max', 'defaultQuantity'
      )
      and not (with_id and k.field = 'id')
  ) then
    raise exception 'An item has a kind, a label, a hint, required, a unit, a range and a usual quantity'
      using errcode = '22023';
  end if;

  item_kind := raw ->> 'kind';
  if item_kind is null or item_kind not in ('check', 'number', 'note', 'photo') then
    raise exception 'An item is a check, a number, a note or a photo' using errcode = '22023';
  end if;
  item_label := private.json_text(raw -> 'label', 120, 'An item''s label');
  if item_label is null then
    raise exception 'An item needs a label' using errcode = '22023';
  end if;
  item_hint := private.json_text(raw -> 'hint', 200, 'An item''s hint');
  item_required := private.json_bool(raw -> 'required', true, 'Required');
  item_unit := private.json_text(raw -> 'unit', 12, 'The unit');
  item_min := private.json_num(raw -> 'min', -100000, 100000, 'The lowest value');
  item_max := private.json_num(raw -> 'max', -100000, 100000, 'The highest value');
  item_quantity := private.json_int(raw -> 'defaultQuantity', 1, 9999, 'The usual quantity');

  if item_kind <> 'number'
    and (item_unit is not null or item_min is not null or item_max is not null) then
    raise exception 'Only numbers have a unit and a range' using errcode = '22023';
  end if;
  if item_min > item_max then
    raise exception 'The lowest value is above the highest' using errcode = '22023';
  end if;
  if item_kind <> 'check' and item_quantity is not null then
    raise exception 'Only checks have a usual quantity' using errcode = '22023';
  end if;
end;
$$;

-- Sets a photo item's file once the server has uploaded it, or clears it when
-- `new_path` is null (or left out): the same people as set_list_item (whoever
-- holds the open list, or manages lists), the item a photo, and the path in
-- its own list's folder (`<business>/<list>/<key>.<webp|jpg>`). Who took it
-- and when sit on the row; a photo the daily clean-up removed is taken again
-- from here. Returns the file it replaced, still kept, for the server to
-- remove; null when there is none, or the path is the one it has. Like a
-- tick, it writes no log row: the item is the record.
create function public.set_list_item_photo(
  actor uuid,
  item uuid,
  new_path text default null,
  at_time timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.list_items%rowtype;
  l public.lists%rowtype;
  replaced text;
begin
  select i.* into it from public.list_items i where i.id = item;
  if not found then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  -- The list first, as set_list_item locks it, so a finish waits for this.
  select x.* into l from public.lists x where x.id = it.list_id for update;
  if not exists (
    select 1 from public.memberships m
    where m.business_id = l.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  perform private.lists_on(l.business_id);
  if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
    raise exception 'The list is not yours to fill' using errcode = '42501';
  end if;
  if l.status <> 'open' then
    raise exception 'The list is closed' using errcode = '55000';
  end if;
  if it.kind <> 'photo' then
    raise exception 'Only a photo item takes a photo' using errcode = '22023';
  end if;
  if new_path is not null
    and new_path !~ ('^' || l.business_id::text || '/' || l.id::text || '/[a-z0-9-]{1,40}\.(webp|jpg)$')
  then
    raise exception 'A photo goes in its own list''s folder' using errcode = '22023';
  end if;

  select i.* into it from public.list_items i where i.id = item for update;
  if new_path is not distinct from it.photo_path then
    return null;
  end if;
  replaced := case when it.photo_removed_at is null then it.photo_path end;

  update public.list_items i
  set photo_path = new_path,
    photo_removed_at = null,
    done = new_path is not null,
    done_by = case when new_path is not null then actor end,
    done_at = case when new_path is not null then at_time end
  where i.id = item;

  return replaced;
end;
$$;

------------------------------------------------------------------------------
-- How long photos are kept

-- private.list_settings of 20261109000600_lists.sql, with photoDays
-- (modules/lists/manifest.ts; modules/lists/settings.db.test.ts keeps the two
-- the same).
create or replace function private.list_settings(business uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'remindBeforeMinutes', 30,
      'lateAfterMinutes', 15,
      'tellManagersWhenLate', true,
      'tellWhenFinished', true,
      'photoDays', 90
    )
    || coalesce(
      (
        select bm.settings
        from public.business_modules bm
        where bm.business_id = business and bm.module_key = 'lists'
      ),
      '{}'::jsonb
    )
$$;

-- The photos older than their business keeps them, still in Storage, oldest
-- first and at most `max_rows` (up to 1000, what Storage removes at once): the
-- items and their files, for the app's daily clean-up. A business's
-- `photoDays` counts only as one of the values the manifest offers (30, 90,
-- 180 or 365, which the app holds it to: a setting for the team, so only the
-- console changes it); anything else stored keeps the default 90.
create function public.expired_list_photos(
  at_time timestamptz default now(),
  max_rows integer default 500
)
returns table (item uuid, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.photo_path
  from public.list_items i
  where i.photo_path is not null
    and i.photo_removed_at is null
    and i.done_at < at_time - make_interval(
      days => case private.list_settings(i.business_id) ->> 'photoDays'
        when '30' then 30
        when '180' then 180
        when '365' then 365
        else 90
      end
    )
  order by i.done_at, i.id
  limit greatest(least(max_rows, 1000), 0)
$$;

-- The clean-up removed these files: their items say so from `at_time`. A file
-- is found by its path, which is never used twice, so an item whose photo was
-- replaced meanwhile keeps its new one. Returns how many were marked.
create function public.forget_list_photos(
  paths text[],
  at_time timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  marked integer;
begin
  update public.list_items i
  set photo_removed_at = at_time
  where i.photo_path = any (paths)
    and i.photo_removed_at is null;
  get diagnostics marked = row_count;
  return marked;
end;
$$;

-- Once a day: when a photo is older than its business keeps it, ask the app
-- to remove what is due (/cron/list-photos; only it reaches Storage's files).
-- The app's address and the secret come from Vault, as for the minute job
-- (20261109000500_push.sql); without them nothing is called, and the photos
-- wait for the next day it can.
create function private.list_photos_tick(at_time timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_key text;
begin
  if not exists (select 1 from public.expired_list_photos(at_time, 1)) then
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

select cron.schedule('list-photos', '43 3 * * *', $$select private.list_photos_tick()$$);

------------------------------------------------------------------------------
-- What the restaurant's template brings (a version up)

-- Its weekly cleaning ends with a photo of the kitchen, optional: a demo
-- business takes none, and its people still finish the list.
update public.templates t
set version = t.version + 1,
  definition = jsonb_set(
    t.definition,
    array['listTemplates', (lt.ordinality - 1)::text, 'items'],
    (lt.value -> 'items') || $json$
    [{ "kind": "photo", "label": "צילום של המטבח אחרי הניקיון", "required": false }]
    $json$::jsonb
  )
from public.templates s,
  jsonb_array_elements(
    case when jsonb_typeof(s.definition -> 'listTemplates') = 'array'
      then s.definition -> 'listTemplates' else '[]'::jsonb end
  ) with ordinality as lt (value, ordinality)
where s.key = t.key
  and t.key = 'restaurant'
  and lt.value ->> 'key' = 'weekly-cleaning'
  and not exists (
    select 1 from jsonb_array_elements(lt.value -> 'items') as e (value)
    where e.value ->> 'kind' = 'photo'
  );

-- The hosted demo businesses start again, the restaurant with its photo item.
-- Locally the seed runs after the migrations and resets its own.
select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);

------------------------------------------------------------------------------
-- Who may call what

-- The storage policy's helper runs as the reader, so the signed-in role runs it.
revoke execute on function private.can_read_list_photo(text) from public, anon;
grant execute on function private.can_read_list_photo(text) to authenticated;

revoke execute on function private.list_photos_closed(uuid) from public, anon, authenticated;
revoke execute on function private.refuse_demo_list_photo() from public, anon, authenticated;
revoke execute on function private.list_photos_tick(timestamptz) from public, anon, authenticated;

-- The server's alone.
revoke execute on function public.list_photos_closed(uuid) from public, anon, authenticated;
grant execute on function public.list_photos_closed(uuid) to service_role;
revoke execute on function public.set_list_item_photo(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_list_item_photo(uuid, uuid, text, timestamptz)
  to service_role;
revoke execute on function public.expired_list_photos(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.expired_list_photos(timestamptz, integer) to service_role;
revoke execute on function public.forget_list_photos(text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.forget_list_photos(text[], timestamptz) to service_role;

-- Replaced above; their grants stay as their first migrations set them.
revoke execute on function private.list_item_fields(jsonb, boolean)
  from public, anon, authenticated;
revoke execute on function private.list_settings(uuid) from public, anon, authenticated;
