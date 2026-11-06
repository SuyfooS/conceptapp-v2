-- Profile photos instead of initials (issue #42), database and server
-- first; no screens yet.
--
-- A photo lives in the private Storage bucket `avatars` at
-- `<user id>/<random>.<jpg|png|webp>`, and `profiles.avatar_path` points to
-- the current one. Photos are personal data, so the bucket is not public:
-- the app reads a photo through a short-lived signed URL, which Storage
-- only signs for someone the policies below let read it.
--
--   upload, replace, remove  only the person, in their own folder
--   read                     the person, and active members of a business
--                            they are an active member of
--   anyone else              nothing (other businesses, anonymous visitors)
--
-- The server (`@db/profile-photos`) checks the type and size first
-- (`@domain/profile-photos`: JPEG, PNG or WebP, up to 2MB); the bucket
-- refuses anything else too. `avatar_path` is written by the server only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

alter table public.profiles
  add column avatar_path text
    check (avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{8,64}\.(jpg|png|webp)$'));

-- The person whose folder holds `object_name`: the first path segment as a
-- user id, or null when it is not one.
create function private.avatar_owner(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end
$$;

revoke execute on function private.avatar_owner(text) from public;
grant execute on function private.avatar_owner(text) to authenticated;

create policy "people upload their own photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and private.avatar_owner(name) = (select auth.uid())
  );

create policy "people replace their own photo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and private.avatar_owner(name) = (select auth.uid())
  )
  with check (
    bucket_id = 'avatars'
    and private.avatar_owner(name) = (select auth.uid())
  );

create policy "people remove their own photo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and private.avatar_owner(name) = (select auth.uid())
  );

create policy "people and their colleagues read photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      private.avatar_owner(name) = (select auth.uid())
      or private.shares_business(private.avatar_owner(name))
    )
  );
