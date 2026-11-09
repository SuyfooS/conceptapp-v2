-- Profile photos, H1 (issue #82): demo businesses keep their people as they are.
--
-- Anyone at the demo door can be any demo person, so a photo set there would
-- greet the next visitor (Orel, 8 November 2026, on #1: photos are refused in
-- demo businesses). The same rule holds the name and the line about yourself
-- in H2. A demo business whose definition says "profiles": true is open: the
-- local seed opens its restaurant so the browser tests can set a photo; the
-- hosted ones are never opened (tooling/demo-profiles.test.ts).
--
--   private.keeps_demo_profile  the person is in a demo business that is not open
--   public.keeps_demo_profile   the same question, for the server (secret key)
--   profiles_demo_photo         the database refuses them a new photo (55000)
--
-- Clearing a photo stays allowed: the reset does it.

create function private.keeps_demo_profile(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join private.demo_businesses d on d.business_id = m.business_id
    where m.user_id = person
      and d.definition -> 'profiles' is distinct from 'true'::jsonb
  )
$$;

revoke execute on function private.keeps_demo_profile(uuid) from public;

create function public.keeps_demo_profile(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.keeps_demo_profile(person)
$$;

revoke execute on function public.keeps_demo_profile(uuid) from public, anon, authenticated;
grant execute on function public.keeps_demo_profile(uuid) to service_role;

create function private.refuse_demo_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.avatar_path is not null
    and new.avatar_path is distinct from old.avatar_path
    and private.keeps_demo_profile(new.id)
  then
    raise exception 'Demo people keep their photo as it is' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke execute on function private.refuse_demo_photo() from public;

create trigger profiles_demo_photo
  before update of avatar_path on public.profiles
  for each row execute function private.refuse_demo_photo();
