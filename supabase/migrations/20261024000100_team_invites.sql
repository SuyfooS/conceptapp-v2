-- Inviting from the Team screen (chunk 1d-2b): an owner or manager invites
-- someone by phone, or sends a fresh link for an invite nobody claimed.
--
-- Same rules as the console's `issue_invite_link`: the app hashes the link
-- token, a fresh token replaces the old one and the invite gets 14 more
-- days, and both functions run with the secret key only. Here the actor is
-- a member, not the ConceptApp team, so each function checks the actor's
-- own role in the invite's business: at least a manager, and never above
-- their own role (a manager cannot invite or re-send to an owner).
--
-- `member_role` is declared owner, manager, worker, so a role is senior to
-- another when it sorts before it. (The `private` helpers are for signed-in
-- callers; these run as service_role.)

-- Invite a number to the actor's business, or, when it already has an
-- invite nobody claimed (open or expired), refresh that one with the new
-- name, role and token. Refuses a number that is already in the team.
-- Returns the invite id.
create function public.team_invite(
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
  actor_role public.member_role;
  existing public.invites%rowtype;
  invite_id uuid;
begin
  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or actor_role > 'manager'
    or invite_role is null or invite_role < actor_role then
    raise exception 'Not allowed to invite this role' using errcode = '42501';
  end if;

  if new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token hash must be 64 hex digits' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.business_id = business and m.active and p.phone = invite_phone
  ) then
    raise exception 'Already in the team' using errcode = '23505';
  end if;

  select * into existing
  from public.invites i
  where i.business_id = business and i.phone = invite_phone
    and i.claimed_at is null
  for update;

  if existing.id is not null then
    if existing.role < actor_role then
      raise exception 'Not allowed to change this invite' using errcode = '42501';
    end if;
    update public.invites
    set token_hash = new_token_hash,
      role = invite_role,
      full_name = coalesce(nullif(btrim(invite_name), ''), full_name),
      invited_by = actor,
      expires_at = now() + interval '14 days'
    where id = existing.id;
    invite_id := existing.id;
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
    case when existing.id is null then 'invite.create' else 'invite.send' end,
    jsonb_build_object('invite', invite_id, 'role', invite_role)
  );

  return invite_id;
end;
$$;

-- A fresh link for an invite nobody claimed, open or expired. Returns the
-- invite's phone.
create function public.team_invite_link(
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
  inv public.invites%rowtype;
  actor_role public.member_role;
begin
  if new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token hash must be 64 hex digits' using errcode = '22023';
  end if;

  select * into inv
  from public.invites i
  where i.id = invite and i.claimed_at is null
  for update;

  if inv.id is null then
    raise exception 'No open invite' using errcode = 'P0002';
  end if;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = inv.business_id and m.user_id = actor and m.active;

  if actor_role is null or actor_role > 'manager' or inv.role < actor_role then
    raise exception 'Not allowed to send this invite' using errcode = '42501';
  end if;

  update public.invites
  set token_hash = new_token_hash,
    expires_at = now() + interval '14 days'
  where id = inv.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    inv.business_id, actor, 'invite.send',
    jsonb_build_object('invite', inv.id)
  );

  return inv.phone;
end;
$$;

revoke execute on function
  public.team_invite(uuid, uuid, text, text, public.member_role, text)
  from public, anon, authenticated;
grant execute on function
  public.team_invite(uuid, uuid, text, text, public.member_role, text)
  to service_role;
revoke execute on function public.team_invite_link(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.team_invite_link(uuid, uuid, text)
  to service_role;
