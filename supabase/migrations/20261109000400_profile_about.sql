-- The profile, H2 (issue #82): a line about yourself, a cover and how the app
-- addresses you, on the profile the person's colleagues read.
--
--   bio           up to 160 characters on one line. Null: none.
--   cover         a preset key (COVER_PRESETS in @domain/profile, drawn by
--                 @ui/profile-cover in the reader's business colour). Only its
--                 form is checked here, as shabbat_city is, so a new preset
--                 needs no migration. Null: the default.
--   address_form  'f', 'm' or 'x' (no gender). Null: not chosen yet, and the
--                 copy stays neutral. Never derived from or into legal sex.
--
-- Writes go through set_own_profile with the secret key, for `actor`, the
-- signed-in person: name, language, line, cover and form of address. The
-- direct path, where a person changed their own name and language from the
-- browser, closes; nothing in the app used it. In a demo business that keeps
-- its people (private.keeps_demo_profile), a visitor may pick a cover, a form
-- of address and a language, but not write a line or change a name (55000):
-- the next visitor would read it. The reset clears what they chose.
--
-- An owner or manager clears an abusive line with clear_profile_bio, logged as
-- profile.bio_cleared {person}, never with the text: the line they read, not
-- one written since. A manager does not clear an owner's. The person can
-- write a new one.

alter table public.profiles
  add column bio text
    check (
      bio is null
      or (bio = btrim(bio) and char_length(bio) between 1 and 160 and bio !~ '[[:cntrl:]]')
    ),
  add column cover text
    check (cover is null or cover ~ '^[a-z][a-z0-9_]{0,23}$'),
  add column address_form text
    check (address_form in ('f', 'm', 'x'));

comment on column public.profiles.bio is
  'One line about the person, up to 160 characters. Written only by set_own_profile; cleared by clear_profile_bio.';
comment on column public.profiles.cover is
  'Key in COVER_PRESETS (@domain/profile). Null: the default cover.';
comment on column public.profiles.address_form is
  'How the app addresses the person: f, m or x (no gender). Null: not chosen, copy stays neutral.';

-- Colleagues read them, as they read names and photos (20261108000300_sealed.sql).
grant select (bio, cover, address_form) on public.profiles to authenticated;

-- The direct path closes. A table-level revoke also removes every
-- column-level update grant (the only one is (full_name, locale), from
-- 20261013000200_access_rules.sql), so no column stays writable by mistake.
drop policy "people update themselves" on public.profiles;
revoke update on public.profiles from authenticated, anon;

-- The signed-in person changes their own profile; what the patch leaves out
-- stays. Keys are column names. A value that doesn't fit is refused by the
-- table's checks (23514).
create function public.set_own_profile(actor uuid, patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row public.profiles;
  new_bio text;
begin
  if jsonb_typeof(patch) is distinct from 'object' or patch = '{}'::jsonb then
    raise exception 'A profile patch must be an object with something in it'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_each(patch) as field (key, value)
    where case field.key
      when 'full_name' then jsonb_typeof(field.value) <> 'string'
      when 'locale' then jsonb_typeof(field.value) <> 'string'
      when 'bio' then jsonb_typeof(field.value) not in ('string', 'null')
      when 'cover' then jsonb_typeof(field.value) not in ('string', 'null')
      when 'address_form' then jsonb_typeof(field.value) not in ('string', 'null')
      else true
    end
  ) then
    raise exception 'Unknown or malformed profile field' using errcode = '22023';
  end if;

  select * into old_row from public.profiles p where p.id = actor for update;
  if not found then
    raise exception 'No profile for %', actor using errcode = 'P0002';
  end if;

  new_bio := case
    when patch ? 'bio' then nullif(btrim(coalesce(patch ->> 'bio', '')), '')
    else old_row.bio
  end;

  if private.keeps_demo_profile(actor) and (
    (patch ? 'full_name' and btrim(patch ->> 'full_name') is distinct from old_row.full_name)
    or new_bio is distinct from old_row.bio
  ) then
    raise exception 'Demo people keep their name and write no line about themselves'
      using errcode = '55000';
  end if;

  update public.profiles p
  set full_name = case when patch ? 'full_name' then btrim(patch ->> 'full_name') else p.full_name end,
    locale = case when patch ? 'locale' then patch ->> 'locale' else p.locale end,
    bio = new_bio,
    cover = case when patch ? 'cover' then patch ->> 'cover' else p.cover end,
    address_form = case when patch ? 'address_form' then patch ->> 'address_form' else p.address_form end
  where p.id = actor;
end;
$$;

revoke execute on function public.set_own_profile(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_own_profile(uuid, jsonb) to service_role;

-- An owner or manager of `business` clears the line of someone in it, when it
-- is abusive: `seen`, the line as they read it. A line rewritten since then is
-- not cleared unread (40001: the screen reads it again). Logged in that
-- business, without the text. Clearing a line that is already gone changes
-- and logs nothing.
create function public.clear_profile_bio(actor uuid, business uuid, person uuid, seen text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  person_role public.member_role;
begin
  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;
  if actor_role is null or actor_role not in ('owner', 'manager') then
    raise exception 'Owners and managers only' using errcode = '42501';
  end if;

  select m.role into person_role
  from public.memberships m
  where m.business_id = business and m.user_id = person and m.active;
  if person_role is null then
    raise exception 'Not in this business' using errcode = '42501';
  end if;
  if private.role_rank(person_role) > private.role_rank(actor_role) then
    raise exception 'A manager does not clear an owner''s line' using errcode = '42501';
  end if;

  update public.profiles p set bio = null where p.id = person and p.bio = seen;
  if found then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (business, actor, 'profile.bio_cleared', jsonb_build_object('person', person));
  elsif exists (select 1 from public.profiles p where p.id = person and p.bio is not null) then
    -- Never the text, in the message or anywhere: the log could keep it.
    raise exception 'The line changed since it was read' using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.clear_profile_bio(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.clear_profile_bio(uuid, uuid, uuid, text) to service_role;

-- The reset (20261107000800_templates_for_every_business.sql) also clears what
-- a visitor chose for a demo person: line, cover, form of address.
create or replace function public.reset_demo_business(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
begin
  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business
  for update;
  if not found then
    raise exception 'Not a demo business: %', business using errcode = 'P0002';
  end if;

  delete from public.businesses b where b.id = business;

  insert into public.businesses (id, slug, name, accent, address, shabbat_city)
  values (
    business, def ->> 'slug', def ->> 'name', def ->> 'accent',
    def ->> 'address', def ->> 'shabbat_city'
  );
  perform public.apply_template(business, def ->> 'template');

  insert into public.memberships (business_id, user_id, role)
  select business, person.user_id, person.role
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  join public.profiles p on p.id = person.user_id;

  update public.profiles p
  set full_name = person.name, locale = 'he', avatar_path = null,
    bio = null, cover = null, address_form = null
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  where p.id = person.user_id;

  update private.demo_businesses d
  set reset_at = now()
  where d.business_id = business;

  if coalesce((def ->> 'renews')::boolean, false) then
    perform private.renew_demo_schedule(business);
  end if;
end;
$$;
