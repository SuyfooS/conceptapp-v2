-- The profile's number follows a change of the sign-in number (ROADMAP's
-- known issue 69). profiles.phone was written only when the account was
-- made (public.handle_new_user), so after the team changed a number
-- (supabase/README.md, 20261127000400_file_step_up.sql) the profile, the
-- team's phones and public.own_phone() kept the old one, while sign-in and
-- the bank's code went to the new one.
--
-- Now any change of auth.users.phone writes the profile in the same
-- transaction, as handle_new_user does: E.164 with the +, or none when the
-- number is taken away. Another profile that holds the new number while its
-- own sign-in has another holds it stale (from a change before this
-- migration) and lets it go first, since profiles.phone is unique too; one
-- whose sign-in still has it (the number written with the +, which
-- auth.users' unique index counts as another) refuses the change (23505). A
-- number the profile's check refuses rolls the whole change back.
--
-- Nothing else changes: the refusal of any change but the team's
-- (public.refuse_own_phone_change, before) and the week after it
-- (public.note_phone_change, after) stay as they are.

create function public.follow_phone_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shown text := case
    when coalesce(new.phone, ''::text) = ''::text then null
    else '+'::text || ltrim(new.phone, '+'::text)
  end;
begin
  if shown is not null then
    -- Someone else who still signs in with this number (the team writing it
    -- with the +, which auth.users' unique index tells apart) keeps it: the
    -- change is refused rather than taking their number away.
    if exists (
      select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.phone = shown
        and p.id <> new.id
        and '+'::text || ltrim(coalesce(u.phone, ''::text), '+'::text) = shown
    ) then
      raise exception 'Another account signs in with this number'
        using errcode = '23505';
    end if;
    -- A copy left stale by a change before this migration; after its
    -- backfill none is left, so this is defence only.
    update public.profiles p
    set phone = null
    where p.phone = shown and p.id <> new.id;
  end if;
  update public.profiles p
  set phone = shown
  where p.id = new.id and p.phone is distinct from shown;
  return null;
end;
$$;

create trigger on_auth_user_phone_followed
  after update of phone on auth.users
  for each row
  when (old.phone is distinct from new.phone)
  execute function public.follow_phone_to_profile();

-- Run by the trigger alone, as note_phone_change's.
revoke execute on function public.follow_phone_to_profile() from public, anon, authenticated;

-- Once: a profile left behind by a change before this migration takes the
-- number its sign-in has now, or none when its sign-in has none. Every
-- stale one lets go first, so two profiles that swapped numbers, or one
-- still holding a number its sign-in gave away, never meet the unique index
-- halfway.
update public.profiles p
set phone = null
from auth.users u
where u.id = p.id
  and p.phone is not null
  and p.phone is distinct from (
    case
      when coalesce(u.phone, ''::text) = ''::text then null
      else '+'::text || ltrim(u.phone, '+'::text)
    end
  );

-- Then each takes its own, unless the profile's check would refuse it or
-- another sign-in writes the same number another way (with the +): such a
-- profile stays without one rather than stopping the migration, and the
-- team fixes that number by hand.
update public.profiles p
set phone = '+'::text || ltrim(u.phone, '+'::text)
from auth.users u
where u.id = p.id
  and coalesce(u.phone, ''::text) <> ''::text
  and p.phone is null
  and '+'::text || ltrim(u.phone, '+'::text) ~ '^\+[1-9][0-9]{7,14}$'
  and not exists (
    select 1
    from auth.users o
    where o.id <> u.id
      and '+'::text || ltrim(coalesce(o.phone, ''::text), '+'::text)
        = '+'::text || ltrim(u.phone, '+'::text)
  );
