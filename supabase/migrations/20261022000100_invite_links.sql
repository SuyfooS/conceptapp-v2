-- Invite links (chunk 1d): the console issues a link for an open invite,
-- and the person it was sent to joins the business through it.
--
-- A link carries a random token; only its SHA-256 (hex) is stored, so the
-- app hashes the token before calling these functions. All three run with
-- the secret key only: the app checks who is asking first, and each
-- function checks again.

-- A fresh link for an open invite, from someone on the ConceptApp team.
-- Replaces the old token (an earlier link stops working) and gives the
-- invite another 14 days. Returns the invite's phone.
create function public.issue_invite_link(
  actor uuid,
  invite uuid,
  new_token_hash text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  biz uuid;
  invited_phone text;
begin
  -- Both platform roles may invite staff (@domain/platform).
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  if new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token hash must be 64 hex digits' using errcode = '22023';
  end if;

  update public.invites i
  set token_hash = new_token_hash,
    expires_at = now() + interval '14 days'
  where i.id = invite and i.claimed_at is null
  returning i.business_id, i.phone into biz, invited_phone;

  if biz is null then
    raise exception 'No open invite' using errcode = 'P0002';
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (biz, actor, 'invite.send', jsonb_build_object('invite', invite));

  return invited_phone;
end;
$$;

-- What the join screen shows for a link: the invite, its business and
-- whether it can still be used. Null for a token nobody issued (or one a
-- newer link replaced).
create function public.invite_by_token(token_hash text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'phone', i.phone,
    'role', i.role,
    'name', i.full_name,
    'business', jsonb_build_object('id', b.id, 'name', b.name, 'accent', b.accent),
    'status', case
      when i.claimed_at is not null then 'claimed'
      when i.expires_at <= now() then 'expired'
      else 'open'
    end
  )
  from public.invites i
  join public.businesses b on b.id = i.business_id
  where i.token_hash = invite_by_token.token_hash;
$$;

-- The person who signed in from a link joins its business with the
-- invite's role, in one transaction: the membership (an earlier, inactive
-- one comes back with the new role), the invite marked claimed, the name
-- written to the profile if it had none, and the audit log. Only the
-- number the invite was sent to may claim it. Returns the business id.
create function public.claim_invite(token_hash text, claimant uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  claimant_phone text;
begin
  select * into inv
  from public.invites i
  where i.token_hash = claim_invite.token_hash
  for update;

  if inv.id is null or inv.claimed_at is not null or inv.expires_at <= now() then
    raise exception 'No open invite' using errcode = 'P0002';
  end if;

  select p.phone into claimant_phone
  from public.profiles p where p.id = claimant;
  if claimant_phone is distinct from inv.phone then
    raise exception 'Invite is for another number' using errcode = '42501';
  end if;

  insert into public.memberships (business_id, user_id, role)
  values (inv.business_id, claimant, inv.role)
  on conflict (business_id, user_id)
    do update set role = excluded.role, active = true;

  update public.invites
  set claimed_at = now(), claimed_by = claimant
  where id = inv.id;

  update public.profiles
  set full_name = btrim(inv.full_name)
  where id = claimant and full_name is null and inv.full_name is not null;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    inv.business_id, claimant, 'invite.claim',
    jsonb_build_object('invite', inv.id, 'role', inv.role)
  );

  return inv.business_id;
end;
$$;

revoke execute on function public.issue_invite_link(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.issue_invite_link(uuid, uuid, text)
  to service_role;
revoke execute on function public.invite_by_token(text)
  from public, anon, authenticated;
grant execute on function public.invite_by_token(text) to service_role;
revoke execute on function public.claim_invite(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_invite(text, uuid) to service_role;

-- The checklist's people now carry the invite id (null for members), so
-- the console can issue a link for each open invite.
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
      select jsonb_agg(p order by p.status, p.role, p.name, p.phone)
      from (
        select coalesce(pr.full_name, '') as name, pr.phone, m.role,
          'member' as status, null::uuid as invite_id
        from public.memberships m
        join public.profiles pr on pr.id = m.user_id
        where m.business_id = b.id and m.active
        union all
        select coalesce(i.full_name, ''), i.phone, i.role, 'invited', i.id
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
