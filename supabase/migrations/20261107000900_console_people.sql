-- The console sets up a real business without SQL (Orel, 7 November 2026):
--
--   admin_invite      someone on the ConceptApp team invites a number to a
--                     business, in any role, the way a manager does from the
--                     Team screen (team_invite). A number with an invite
--                     nobody claimed, open or expired, gets that one renewed.
--   admin_business    shows invites that expired too, so a business whose
--                     owner never joined is no longer stuck: the console can
--                     renew the invite (issue_invite_link already reopens an
--                     expired one). Members come first, then open invites,
--                     then expired ones.
--   admin_businesses  counts expired invites, so a stuck business shows on
--                     the list.

-- Invite a number to a business, or renew the invite it already has. Refuses
-- a number already in the team. Returns the invite id. Server only.
create function public.admin_invite(
  actor uuid,
  business uuid,
  invite_phone text,
  invite_name text,
  invite_role public.member_role,
  new_token_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing uuid;
  invite_id uuid;
begin
  -- Both platform roles may invite staff (@domain/platform).
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  if invite_role is null then
    raise exception 'A role is needed' using errcode = '22023';
  end if;

  if new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token hash must be 64 hex digits' using errcode = '22023';
  end if;

  perform 1 from public.businesses b where b.id = business;
  if not found then
    raise exception 'Unknown business: %', business using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.business_id = business and m.active and p.phone = invite_phone
  ) then
    raise exception 'Already in the team' using errcode = '23505';
  end if;

  select i.id into existing
  from public.invites i
  where i.business_id = business and i.phone = invite_phone
    and i.claimed_at is null
  for update;

  if existing is not null then
    update public.invites i
    set token_hash = new_token_hash,
      role = invite_role,
      full_name = coalesce(nullif(btrim(invite_name), ''), i.full_name),
      invited_by = actor,
      expires_at = now() + interval '14 days'
    where i.id = existing;
    invite_id := existing;
  else
    insert into public.invites (
      business_id, phone, role, full_name, token_hash, invited_by
    )
    values (
      business, invite_phone, invite_role, nullif(btrim(invite_name), ''),
      new_token_hash, actor
    )
    returning id into invite_id;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor,
    case when existing is null then 'invite.create' else 'invite.send' end,
    jsonb_build_object('invite', invite_id, 'role', invite_role)
  );

  return invite_id;
end;
$$;

revoke execute on function public.admin_invite(uuid, uuid, text, text, public.member_role, text)
  from public, anon, authenticated;
grant execute on function public.admin_invite(uuid, uuid, text, text, public.member_role, text)
  to service_role;

-- The business and its people for the console: members, then invites nobody
-- claimed, open ('invited') and then expired ('expired'), each invite with
-- its id and when it runs out.
create or replace function public.admin_business(business_slug text)
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
      select jsonb_agg(
        jsonb_build_object(
          'name', p.name, 'phone', p.phone, 'role', p.role,
          'status', p.status, 'invite_id', p.invite_id,
          'expires_at', p.expires_at
        )
        order by p.place, p.role, p.name, p.phone
      )
      from (
        select coalesce(pr.full_name, '') as name, pr.phone, m.role,
          'member' as status, null::uuid as invite_id,
          null::timestamptz as expires_at, 0 as place
        from public.memberships m
        join public.profiles pr on pr.id = m.user_id
        where m.business_id = b.id and m.active
        union all
        select coalesce(i.full_name, ''), i.phone, i.role,
          case when i.expires_at > now() then 'invited' else 'expired' end,
          i.id, i.expires_at,
          case when i.expires_at > now() then 1 else 2 end
        from public.invites i
        where i.business_id = b.id and i.claimed_at is null
      ) p
    ), '[]'::jsonb)
  )
  into result
  from public.businesses b
  where b.slug = business_slug;

  return result;
end;
$$;

-- The list gains a column, so the function is made again.
drop function public.admin_businesses();

create function public.admin_businesses()
returns table (
  id uuid,
  slug text,
  name text,
  accent text,
  template_key text,
  created_at timestamptz,
  members bigint,
  open_invites bigint,
  expired_invites bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff() then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  return query
  select b.id, b.slug, b.name, b.accent, b.template_key, b.created_at,
    (select count(*) from public.memberships m
      where m.business_id = b.id and m.active),
    (select count(*) from public.invites i
      where i.business_id = b.id and i.claimed_at is null
        and i.expires_at > now()),
    (select count(*) from public.invites i
      where i.business_id = b.id and i.claimed_at is null
        and i.expires_at <= now())
  from public.businesses b
  order by b.created_at desc, b.name;
end;
$$;

revoke execute on function public.admin_businesses() from public, anon;
grant execute on function public.admin_businesses() to authenticated;

comment on function public.issue_invite_link(uuid, uuid, text) is
  'A fresh link for an invite nobody claimed, open or expired: 14 more days, and the old link stops working.';
