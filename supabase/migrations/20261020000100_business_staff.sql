-- The new-business wizard invites the staff list pasted into it, and the
-- console shows a checklist for each business it opened.
--
-- Invites now carry the name they were sent to, so the Team screen (1d) and
-- the checklist can say who is still to join. At most one open invite per
-- number in a business.

alter table public.invites
  add column full_name text check (char_length(btrim(full_name)) between 1 and 80);

create unique index invites_open_phone_key
  on public.invites (business_id, phone) where claimed_at is null;

-- Same as before, plus `staff`: a JSON array of {name, phone, role}, checked
-- by @domain/staff-list and again by the table's constraints. Each person
-- becomes an open invite in the same transaction. The link token is random
-- and only its hash is kept: no link can be rebuilt from it, so sending an
-- invite (chunk 1d) issues a fresh token.
drop function public.create_business(uuid, text, text, text, text, text);

create function public.create_business(
  actor uuid,
  name text,
  slug text,
  address text,
  accent text,
  template text,
  staff jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
  invited integer;
begin
  -- Both platform roles may open businesses (@domain/platform).
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(staff, '[]'::jsonb)) <> 'array' then
    raise exception 'staff must be a JSON array' using errcode = '22023';
  end if;

  -- A taken slug fails here with 23505 (businesses_slug_key); the console
  -- tells the person to pick another.
  insert into public.businesses (slug, name, address, accent)
  values (
    slug,
    btrim(name),
    nullif(btrim(coalesce(address, '')), ''),
    accent
  )
  returning id into new_id;

  perform public.apply_template(new_id, template);

  insert into public.invites (
    business_id, phone, role, full_name, token_hash, invited_by
  )
  select new_id, p.phone, p.role, btrim(p.name),
    encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
    actor
  from jsonb_to_recordset(coalesce(staff, '[]'::jsonb))
    as p(name text, phone text, role public.member_role);
  get diagnostics invited = row_count;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    new_id, actor, 'business.create',
    jsonb_build_object('template', template, 'slug', slug, 'invites', invited)
  );

  return new_id;
end;
$$;

revoke execute on function public.create_business(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_business(uuid, text, text, text, text, text, jsonb)
  to service_role;

-- One business as the console's checklist needs it: its details, and the
-- people in it (active members and open invites) with their role. Platform
-- staff only, like admin_businesses; null for an unknown slug.
create function public.admin_business(business_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_staff() then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name', b.name,
    'accent', b.accent,
    'address', b.address,
    'template_key', b.template_key,
    'created_at', b.created_at,
    'people', coalesce((
      select jsonb_agg(p order by p.status, p.role, p.name, p.phone)
      from (
        select coalesce(pr.full_name, '') as name, pr.phone, m.role,
          'member' as status
        from public.memberships m
        join public.profiles pr on pr.id = m.user_id
        where m.business_id = b.id and m.active
        union all
        select coalesce(i.full_name, ''), i.phone, i.role, 'invited'
        from public.invites i
        where i.business_id = b.id and i.claimed_at is null
          and i.expires_at > now()
      ) p
    ), '[]'::jsonb)
  )
  into result
  from public.businesses b
  where b.slug = business_slug;

  return result;
end;
$$;

revoke execute on function public.admin_business(text) from public, anon;
grant execute on function public.admin_business(text) to authenticated;
