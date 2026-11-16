-- Roles and permissions by module, R11b: giving a role a business named (the
-- roles plan; Orel's answers of 15 and 16 November 2026, issue #1: answer 1,
-- an owner adds a role with a name they choose, built on a manager or a
-- worker; owners and the ConceptApp team change permissions, and someone
-- other than an owner never gives a role that holds pay, or more than they
-- hold). R11a (20261115001500_named_roles.sql) made the roles; from here
-- people hold them, by an invite or a change of role.
--
--   inviting    public.invites.named_role: the role a business named that an
--               invite gives, built on the invite's role (its base) by the
--               same foreign key as memberships' (business_id, named_role,
--               role), cleared by a change of the invite's role to another
--               base (private.clear_named_role, R11a's, now on invites too)
--               and never an archived one (private.refuse_archived_named_role,
--               R11a's, now on invites too: 22023, hint 'archived').
--               public.team_invite takes one (invite_named, defaulted, so
--               today's calls are unchanged): the invite's role is its base
--               (22023, hint 'base', for any other). A fresh link
--               (public.team_invite_link) is for the invite as it is, its
--               named role with it, so it takes nothing new and asks the
--               giver's rule of that role. The console invites to the
--               built-in roles (public.admin_invite): a fresh invite from it
--               to a number with an open one leaves its named role behind.
--   joining     public.claim_invite puts the person in the invite's named
--               role (memberships.named_role), on a rejoin too, and locks the
--               role's row first, so an archive under way is waited for.
--               public.invite_by_token says the role's names, for the join
--               screen.
--   changing    public.set_member_role takes one (new_named, defaulted): a
--               role change to a named role sets role = its base and
--               named_role; to a built-in role clears it. Between two named
--               roles of one base, or a named role and its base, it is a
--               change too. seen_named (defaulted) is the named role the
--               screen showed with seen_role, for an undo: one changed
--               meanwhile is 40001, as a role is.
--   the giver   an owner gives any live named role of the business; someone
--               else who edits the team (team.edit) gives one only if its
--               base passes the rank rule (private.gives_role), it holds by
--               role nothing settable they don't hold
--               (private.role_holds_beyond, now with the named role: 42501,
--               hint 'held') and never pay (private.role_holds_pay, now with
--               the named role; a named role never holds pay by R11a's
--               trigger, and the check stays: 42501, hint 'pay'). A named
--               role not of the business is P0002; an archived one 22023,
--               hint 'archived' (private.live_named_role).
--   archiving   public.archive_business_role is refused while an open
--               invite (unclaimed, unexpired) names the role, as while
--               someone holds it: 55000, hint 'held', the count of both.
--   closed      an invite whose named role was archived since (one that
--               had expired, then, so its archive went ahead) is closed
--               (private.invite_closed, now with the named role): the join
--               screen reads it as expired, claiming it is P0002, and a
--               fresh link for it is refused (22023, hint 'archived') until
--               the role is restored. It is no longer closed for pay by its
--               base: a named role never holds pay.
--   the log     taking someone off the team (public.remove_member) and
--               deleting an invite (public.team_invite_cancel) name the
--               named role too (named_role, role_name), as inviting, joining
--               and a change of role do.
--
-- Nothing changes for anyone without a named role: every check above asks
-- the built-in role as before when none is given.
--
-- Replaced, each from its latest version and only with what is said above:
-- private.role_holds_beyond (20261115000900_roles_scheduling.sql);
-- private.role_holds_pay, private.invite_closed, public.issue_invite_link,
-- public.team_invite, public.team_invite_link, public.set_member_role,
-- public.remove_member and public.team_invite_cancel
-- (20261115001300_roles_team.sql); public.claim_invite
-- (20261110000900_several_businesses.sql); public.invite_by_token and
-- public.admin_invite (20261108000300_sealed.sql);
-- public.archive_business_role (20261115001500_named_roles.sql).
-- private.role_holds_beyond, private.role_holds_pay, private.invite_closed,
-- public.team_invite and public.set_member_role gain defaulted arguments, so
-- each is dropped and created again, its grants with it; none has a policy
-- or a BEGIN ATOMIC body depending on it. Their callers: role_holds_beyond
-- and role_holds_pay are called by team_invite, team_invite_link and
-- set_member_role (role_holds_pay also by invite_closed), all below;
-- invite_closed by claim_invite, invite_by_token and issue_invite_link, all
-- below. The app calls the public ones with the secret key (@db/invites,
-- @db/team).

------------------------------------------------------------------------------
-- 1. Invites to a named role

alter table public.invites
  add column named_role uuid,
  -- Always a role built on the invite's role, in its business. Deleted only
  -- with its business, as the invite is.
  add constraint invites_named_role_fkey
    foreign key (business_id, named_role, role)
    references public.business_roles (business_id, id, base)
    on delete set null (named_role);

create index invites_named_role_idx
  on public.invites (named_role)
  where named_role is not null;

comment on column public.invites.named_role is
  'The role the business named that the invite gives (public.business_roles), built on its role and live when it was sent; null for the role itself. Cleared when its role changes to another base. Claiming it puts the person in it (memberships.named_role); an invite whose named role was archived since is closed (private.invite_closed).';

-- As memberships' (R11a): a change of the invite's role to another base
-- leaves its named role behind, and one sent again with a named role keeps
-- that one (private.clear_named_role). Before the live-role trigger, by name.
create trigger invites_named_role_follows_role
  before update of role on public.invites
  for each row execute function private.clear_named_role();

-- As memberships' (R11a): nobody is invited to an archived role, whoever
-- writes the invite (private.refuse_archived_named_role: 22023, hint
-- 'archived'), and an archive under way is waited for.
create trigger invites_named_role_live
  before insert or update of named_role on public.invites
  for each row execute function private.refuse_archived_named_role();

------------------------------------------------------------------------------
-- 2. Who gives one

-- A named role `named` of the business, built on `r`, that may be given now:
-- its name, or null for none (`named` null). Refused for a role not of the
-- business (P0002), an archived one (22023, hint 'archived') and one built on
-- another role (22023, hint 'base'). Its row is locked as a foreign key's
-- check locks it, so an archive under way is waited for, and one after this
-- waits and counts what this writes. Its callers: public.team_invite,
-- public.team_invite_link and public.set_member_role.
create function private.live_named_role(
  business uuid,
  r public.member_role,
  named uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_base public.member_role;
  role_label text;
  archived boolean;
begin
  if named is null then
    return null;
  end if;

  select br.base, br.name, br.archived_at is not null
  into role_base, role_label, archived
  from public.business_roles br
  where br.id = named
    and br.business_id = business
  for key share;

  if not found then
    raise exception 'No such role in the business' using errcode = 'P0002';
  end if;

  if archived then
    raise exception 'The role is archived' using errcode = '22023', hint = 'archived';
  end if;

  if role_base <> r then
    raise exception 'The role is built on %', role_base using errcode = '22023', hint = 'base';
  end if;

  return role_label;
end;
$$;

drop function private.role_holds_beyond(uuid, public.member_role, uuid);

-- 20261115000900_roles_scheduling.sql's, with a role the business named
-- (`named`, built on `r`), asked by its own rules (private.role_holds, R11a's):
-- whether giving it would give `person`'s colleague a key owners switch per
-- role that `person` doesn't hold. Its callers: public.team_invite,
-- public.team_invite_link and public.set_member_role (below), and none but
-- the built-in role when `named` is null.
create function private.role_holds_beyond(
  business uuid,
  r public.member_role,
  person uuid,
  named uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.permission_keys k
    where k.settable
      and private.role_holds(business, r, k.key, named)
      and not private.holds_perm(business, person, k.key)
  )
$$;

drop function private.role_holds_pay(uuid, public.member_role);

-- 20261115001300_roles_team.sql's, with a role the business named (`named`,
-- built on `r`), asked by its own rules (private.role_holds, R11a's), which
-- never give it pay: false for any named role, and the check stays. Its
-- callers: public.team_invite, public.team_invite_link,
-- public.set_member_role and private.invite_closed (below).
create function private.role_holds_pay(
  business uuid,
  r public.member_role,
  named uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.permission_keys k
    where k.by_owner
      and private.role_holds(business, r, k.key, named)
  )
$$;

drop function private.invite_closed(uuid, public.member_role, uuid);

-- 20261115001300_roles_team.sql's, with the invite's named role (`named`):
-- its pay asked of it (private.role_holds_pay, never for a named role), and
-- closed once it is archived (since the invite expired, or the archive would
-- have waited for it). Its callers: public.claim_invite (which answers
-- P0002), public.invite_by_token (the join screen reads it as expired) and
-- public.issue_invite_link, all below and passing it.
create function private.invite_closed(
  business uuid,
  invite_role public.member_role,
  inviter uuid,
  named uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.closed_to_invites(business)
    or (
      invite_role = 'owner'
      and exists (
        select 1 from public.memberships m
        where m.business_id = business and m.active and m.role = 'owner'
      )
      and not private.is_active_owner(business, inviter)
    )
    or (
      private.role_holds_pay(business, invite_role, named)
      and not private.is_active_owner(business, inviter)
      and not exists (
        select 1 from public.platform_staff s where s.user_id = inviter
      )
    )
    or exists (
      select 1 from public.business_roles br
      where br.id = named and br.archived_at is not null
    )
$$;

------------------------------------------------------------------------------
-- 3. Inviting

-- 20261108000300_sealed.sql's, the same, with an invite's named role: the
-- console invites to the built-in roles, so a fresh invite from it to a
-- number with an open one leaves that one's named role behind, and the
-- invite is to the role the team chose. No caller in the database; the
-- console calls it with the secret key (inviteFromConsole in @db/invites).
create or replace function public.admin_invite(
  actor uuid,
  business uuid,
  invite_phone text,
  invite_name text,
  invite_role public.member_role,
  new_token_hash text
)
returns uuid
language plpgsql
security definer
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

  if private.closed_to_invites(business) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
  end if;

  if invite_role = 'owner' and exists (
    select 1 from public.memberships m
    where m.business_id = business and m.active and m.role = 'owner'
  ) then
    raise exception 'The business has an owner, who invites another' using errcode = '23P01';
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
      named_role = null,
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

-- 20261115001300_roles_team.sql's, the same, with the invite's named role:
-- passed to private.invite_closed, and a fresh link refused for an invite
-- whose named role was archived since (22023, hint 'archived'), which the
-- team can't make theirs: the role is gone until it is restored. No caller in
-- the database; the console calls it with the secret key (issueInviteLink in
-- @db/invites).
create or replace function public.issue_invite_link(
  actor uuid,
  invite uuid,
  new_token_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  was_closed boolean;
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

  select * into inv
  from public.invites i
  where i.id = invite and i.claimed_at is null
  for update;

  if inv.id is null then
    raise exception 'No open invite' using errcode = 'P0002';
  end if;

  if private.closed_to_invites(inv.business_id) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
  end if;

  -- Its named role archived since: closed for anyone until it is restored.
  perform private.live_named_role(inv.business_id, inv.role, inv.named_role);

  -- Closed for whoever sent it: the team sends it again only where it
  -- would be open had the team sent it, and then it is the team's.
  was_closed := private.invite_closed(inv.business_id, inv.role, inv.invited_by, inv.named_role);
  if was_closed and private.invite_closed(inv.business_id, inv.role, actor, inv.named_role) then
    raise exception 'The business has an owner, who invites another' using errcode = '23P01';
  end if;

  update public.invites i
  set token_hash = new_token_hash,
    invited_by = case when was_closed then actor else i.invited_by end,
    expires_at = now() + interval '14 days'
  where i.id = inv.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (inv.business_id, actor, 'invite.send', jsonb_build_object('invite', inv.id));

  return inv.phone;
end;
$$;

drop function public.team_invite(uuid, uuid, text, text, public.member_role, text);

-- 20261115001300_roles_team.sql's, with a role the business named
-- (invite_named, built on invite_role, which is then its base): live in the
-- business and on that base (private.live_named_role), its pay and what it
-- holds beyond the actor asked of it (private.role_holds_pay,
-- private.role_holds_beyond), written on the invite (a fresh one to the
-- number's open invite replaces its named role, or clears it), and named in
-- the log (named_role, role_name). The rank rule asks its base, as before. No
-- caller in the database; the app calls it with the secret key (inviteToTeam
-- in @db/invites).
create function public.team_invite(
  actor uuid,
  business uuid,
  invite_phone text,
  invite_name text,
  invite_role public.member_role,
  new_token_hash text,
  invite_named uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  existing public.invites%rowtype;
  invite_id uuid;
  named_label text;
begin
  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or not private.holds_perm(business, actor, 'team.edit'::text)
    or invite_role is null
    or (invite_role = 'owner' and actor_role <> 'owner') then
    raise exception 'Not allowed to invite this role' using errcode = '42501';
  end if;

  if invite_role = 'accountant' and actor_role <> 'owner' then
    raise exception 'Only an owner invites an accountant' using errcode = '42501';
  end if;

  -- The rank rule (private.gives_role): someone other than an owner invites
  -- to a role of the staff, not an owner, at or below their own.
  if not private.gives_role(actor_role, invite_role) then
    raise exception 'Not allowed to invite this role' using errcode = '42501';
  end if;

  -- A role the business named: of the business, live, built on the role.
  named_label := private.live_named_role(business, invite_role, invite_named);

  -- Pay is the owner's to give (Orel, 8 November 2026; critique 17): nobody
  -- else gives a role that holds it, by an invite or otherwise, even when
  -- it is their own role.
  if actor_role <> 'owner' and private.role_holds_pay(business, invite_role, invite_named) then
    raise exception 'Only an owner gives a role that sees pay'
      using errcode = '42501', hint = 'pay';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner'
    and private.role_holds_beyond(business, invite_role, actor, invite_named)
  then
    raise exception 'Only an owner invites to a role that holds what you don''t'
      using errcode = '42501', hint = 'held';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
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
    if not private.gives_role(actor_role, existing.role) then
      raise exception 'Not allowed to change this invite' using errcode = '42501';
    end if;
    update public.invites
    set token_hash = new_token_hash,
      role = invite_role,
      named_role = invite_named,
      full_name = coalesce(nullif(btrim(invite_name), ''), full_name),
      invited_by = actor,
      expires_at = now() + interval '14 days'
    where id = existing.id;
    invite_id := existing.id;
  else
    insert into public.invites (
      business_id, phone, role, named_role, full_name, token_hash, invited_by
    )
    values (
      business, invite_phone, invite_role, invite_named, nullif(btrim(invite_name), ''),
      new_token_hash, actor
    )
    returning id into invite_id;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor,
    case when existing.id is null then 'invite.create' else 'invite.send' end,
    jsonb_build_object('invite', invite_id, 'role', invite_role)
      || case
        when invite_named is null then '{}'::jsonb
        else jsonb_build_object('named_role', invite_named, 'role_name', named_label)
      end
  );

  return invite_id;
end;
$$;

-- 20261115001300_roles_team.sql's, with the invite's own named role: a fresh
-- link is for the invite as it is, so it takes no named role of its own; one
-- archived since is refused (private.live_named_role: 22023, hint
-- 'archived'), and its pay and what it holds beyond the actor are asked of it
-- (private.role_holds_pay, private.role_holds_beyond). The rank rule asks its
-- base, as before. No caller in the database; the app calls it with the
-- secret key (issueTeamInviteLink in @db/invites).
create or replace function public.team_invite_link(
  actor uuid,
  invite uuid,
  new_token_hash text
)
returns text
language plpgsql
security definer
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

  if actor_role is null
    or not private.holds_perm(inv.business_id, actor, 'team.edit'::text)
    or not private.gives_role(actor_role, inv.role) then
    raise exception 'Not allowed to send this invite' using errcode = '42501';
  end if;

  -- Its named role still live: one archived since closed the invite.
  perform private.live_named_role(inv.business_id, inv.role, inv.named_role);

  -- Pay is the owner's to give (Orel, 8 November 2026; critique 17): nobody
  -- else gives a role that holds it, by a fresh link or otherwise, even when
  -- it is their own role.
  if actor_role <> 'owner'
    and private.role_holds_pay(inv.business_id, inv.role, inv.named_role)
  then
    raise exception 'Only an owner gives a role that sees pay'
      using errcode = '42501', hint = 'pay';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner'
    and private.role_holds_beyond(inv.business_id, inv.role, actor, inv.named_role)
  then
    raise exception 'Only an owner invites to a role that holds what you don''t'
      using errcode = '42501', hint = 'held';
  end if;

  if private.closed_to_invites(inv.business_id) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
  end if;

  update public.invites
  set token_hash = new_token_hash,
    invited_by = actor,
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

------------------------------------------------------------------------------
-- 4. Joining

-- 20261108000300_sealed.sql's, the same, with the invite's named role: its
-- id and names ('named_role', 'role_name', 'role_name_en', only for an
-- invite that names one, so any other reads as before), which the join
-- screen says, and passed to private.invite_closed, so an
-- invite whose named role was archived since reads as expired. No caller in
-- the database; the join screen calls it with the secret key (findInvite in
-- @db/invites).
create or replace function public.invite_by_token(token_hash text)
returns jsonb
language sql
stable
security definer
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
      when i.expires_at <= now()
        or private.invite_closed(i.business_id, i.role, i.invited_by, i.named_role) then 'expired'
      else 'open'
    end
  ) || case
    when i.named_role is null then '{}'::jsonb
    else jsonb_build_object(
      'named_role', i.named_role, 'role_name', br.name, 'role_name_en', br.name_en
    )
  end
  from public.invites i
  join public.businesses b on b.id = i.business_id
  left join public.business_roles br on br.id = i.named_role
  where i.token_hash = invite_by_token.token_hash;
$$;

-- 20261110000900_several_businesses.sql's, the same, with the invite's named
-- role: its row locked first (as a foreign key's check locks it), so an
-- archive under way is waited for and then reads this claim; passed to
-- private.invite_closed, so one archived since is no open invite (P0002);
-- the person put in it (memberships.named_role, on a rejoin too, where it
-- replaces the one they left with); and named in the log (named_role,
-- role_name). No
-- caller in the database; the join screen calls it with the secret key
-- (claimInvite in @db/invites).
create or replace function public.claim_invite(token_hash text, claimant uuid)
returns uuid
language plpgsql
security definer
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

  if inv.named_role is not null then
    perform 1 from public.business_roles br where br.id = inv.named_role for key share;
  end if;

  if inv.id is null or inv.claimed_at is not null or inv.expires_at <= now()
    or private.invite_closed(inv.business_id, inv.role, inv.invited_by, inv.named_role) then
    raise exception 'No open invite' using errcode = 'P0002';
  end if;

  select p.phone into claimant_phone
  from public.profiles p where p.id = claimant;
  if claimant_phone is distinct from inv.phone then
    raise exception 'Invite is for another number' using errcode = '42501';
  end if;

  if private.is_staff_role(inv.role) and exists (
    select 1
    from public.memberships m
    where m.user_id = claimant
      and m.active
      and m.business_id <> inv.business_id
      and private.is_staff_role(m.role)
  ) then
    raise exception 'Already in another business''s team' using errcode = '23505';
  end if;

  if not private.is_staff_role(inv.role) and (
    exists (
      select 1 from public.time_entries e
      where e.business_id = inv.business_id and e.user_id = claimant
        and e.clock_out is null
    )
    or exists (
      select 1
      from public.shift_assignments a
      join public.schedule_shifts s on s.id = a.shift_id
      join public.businesses b on b.id = s.business_id
      where a.business_id = inv.business_id and a.user_id = claimant
        and s.day >= (now() at time zone b.timezone)::date
    )
    or exists (
      select 1
      from public.shift_swaps w
      join public.schedule_shifts s on s.id = w.shift_id
      join public.businesses b on b.id = s.business_id
      where w.business_id = inv.business_id and w.taken_by = claimant
        and w.status = 'taken'
        and s.day >= (now() at time zone b.timezone)::date
    )
  ) then
    raise exception 'Finish their shifts first' using errcode = '55000';
  end if;

  begin
    insert into public.memberships as mem (business_id, user_id, role, named_role)
    values (inv.business_id, claimant, inv.role, inv.named_role)
    on conflict (business_id, user_id)
      do update set
        role = excluded.role,
        named_role = excluded.named_role,
        active = true,
        perms = case
          when private.is_staff_role(excluded.role) then mem.perms
          else '{}'::text[]
        end;
  exception when unique_violation then
    -- Only memberships_one_staff_idx can say so here: another staff place
    -- was claimed in the meantime.
    raise exception 'Already in another business''s team' using errcode = '23505';
  end;

  if not private.is_staff_role(inv.role) then
    delete from public.department_members dm
    where dm.business_id = inv.business_id and dm.user_id = claimant;

    delete from public.list_people p
    using public.lists l
    where l.id = p.list_id and l.status = 'open'
      and p.business_id = inv.business_id and p.user_id = claimant;

    delete from public.list_schedules ls
    where ls.business_id = inv.business_id and ls.recipient_user = claimant;
  end if;

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
      || case
        when inv.named_role is null then '{}'::jsonb
        else jsonb_build_object(
          'named_role', inv.named_role,
          'role_name', (
            select br.name from public.business_roles br where br.id = inv.named_role
          )
        )
      end
  );

  return inv.business_id;
end;
$$;

------------------------------------------------------------------------------
-- 5. Changing someone's role

drop function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz
);

-- 20261115001300_roles_team.sql's, with a role the business named
-- (new_named, built on new_role, which is then its base): live in the
-- business and on that base (private.live_named_role), its pay and what it
-- holds beyond the actor asked of it (private.role_holds_pay,
-- private.role_holds_beyond), and written with the role (memberships.
-- named_role; none for a built-in role, so a change to one clears it). The
-- same role and named role write nothing; another named role of the same
-- base, or the base itself, is a change. seen_named is the named role the
-- screen showed with seen_role (null for none): either changed meanwhile is
-- 40001. The rank rule asks the base, as before. Named in the log, the one
-- given (named_role, role_name) and the one left (was_named, was_role_name).
-- No caller in the database; the app calls it with the secret key
-- (setMemberRole in @db/team).
create function public.set_member_role(
  actor uuid,
  business uuid,
  person uuid,
  new_role public.member_role,
  seen_role public.member_role default null,
  at_time timestamptz default now(),
  new_named uuid default null,
  seen_named uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  target public.memberships%rowtype;
  leaving boolean;
  joining boolean;
  dropped_perms text[];
  cleared jsonb := '{}'::jsonb;
  named_label text;
  was_label text;
begin
  perform 1 from public.businesses b where b.id = business for no key update;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or not private.holds_perm(business, actor, 'team.edit'::text) then
    raise exception 'Not allowed to change this role' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Not yourself' using errcode = '22023';
  end if;

  if new_role is null then
    raise exception 'Say the new role' using errcode = '22023';
  end if;

  select * into target
  from public.memberships m
  where m.business_id = business and m.user_id = person and m.active
  for update;
  if not found then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if not private.gives_role(actor_role, target.role) then
    raise exception 'Only an owner changes an owner''s, an accountant''s or a higher role'
      using errcode = '42501';
  end if;

  if seen_role is not null
    and (seen_role <> target.role or seen_named is distinct from target.named_role)
  then
    raise exception 'The role changed meanwhile' using errcode = '40001';
  end if;

  if not private.gives_role(actor_role, new_role) then
    raise exception 'Only an owner gives an owner''s, an accountant''s or a higher role'
      using errcode = '42501';
  end if;

  -- A role the business named: of the business, live, built on the role.
  named_label := private.live_named_role(business, new_role, new_named);

  if new_role = target.role and new_named is not distinct from target.named_role then
    return private.left_counts('{}'::jsonb) || jsonb_build_object('changed', false);
  end if;

  -- Pay is the owner's to give (Orel, 8 November 2026; critique 17): nobody
  -- else gives a role that holds it, by a change of role or otherwise, even when
  -- it is their own role.
  if actor_role <> 'owner' and private.role_holds_pay(business, new_role, new_named) then
    raise exception 'Only an owner gives a role that sees pay'
      using errcode = '42501', hint = 'pay';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner'
    and private.role_holds_beyond(business, new_role, actor, new_named)
  then
    raise exception 'Only an owner gives a role that holds what you don''t'
      using errcode = '42501', hint = 'held';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business keeps its people' using errcode = '55000', hint = 'demo';
  end if;

  if target.role = 'owner' and not exists (
    select 1
    from public.memberships m
    where m.business_id = business and m.active and m.role = 'owner'
      and m.user_id <> person
  ) then
    raise exception 'The business keeps one owner' using errcode = '23P01';
  end if;

  leaving := private.is_staff_role(target.role) and not private.is_staff_role(new_role);
  joining := not private.is_staff_role(target.role) and private.is_staff_role(new_role);

  if leaving and exists (
    select 1 from public.time_entries e
    where e.business_id = business and e.user_id = person and e.clock_out is null
  ) then
    raise exception 'Clocked in now' using errcode = '55000', hint = 'clocked_in';
  end if;

  if joining and exists (
    select 1
    from public.memberships m
    where m.user_id = person
      and m.active
      and m.business_id <> business
      and private.is_staff_role(m.role)
  ) then
    raise exception 'Already in another business''s team' using errcode = '23505';
  end if;

  -- An owner holds everything and an accountant what accountants hold: their
  -- personal permissions would only come back on a later change.
  dropped_perms := case
    when new_role in ('owner', 'accountant') then target.perms
    else '{}'::text[]
  end;

  -- The named role they leave, by its name, for the log.
  select br.name into was_label
  from public.business_roles br
  where br.id = target.named_role;

  begin
    update public.memberships m
    set role = new_role,
      named_role = new_named,
      perms = case
        when new_role in ('owner', 'accountant') then '{}'::text[]
        else m.perms
      end
    where m.id = target.id;
  exception when unique_violation then
    -- Only memberships_one_staff_idx can say so here: another staff place was
    -- taken in the meantime.
    raise exception 'Already in another business''s team' using errcode = '23505';
  end;

  if leaving then
    cleared := private.leave_staff(business, person, at_time);
  end if;

  -- Lines for a role above the new one, or for those who hold a permission
  -- the new role doesn't, and, off the staff, the staff's lines about the
  -- schedule, lists and chat: nothing waits on them now.
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.user_id = person
    and (n.read_at is null or n.push_state = 'queued')
    and (
      (
        case
          when n.audience_perm is null
            then private.role_rank(n.audience_role) > private.role_rank(new_role)
          else not private.holds_perm(business, person, n.audience_perm)
        end
      )
      or (
        leaving
        and n.source_module in (
          'scheduling'::public.module_key, 'lists'::public.module_key,
          'chat'::public.module_key
        )
      )
    );

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'member.role',
    jsonb_build_object(
      'person', person,
      'role', new_role,
      'was', target.role,
      'perms', to_jsonb(dropped_perms),
      'at', at_time
    ) || cleared
      || case
        when new_named is null then '{}'::jsonb
        else jsonb_build_object('named_role', new_named, 'role_name', named_label)
      end
      || case
        when target.named_role is null then '{}'::jsonb
        else jsonb_build_object('was_named', target.named_role, 'was_role_name', was_label)
      end
  );

  return private.left_counts(cleared) || jsonb_build_object('changed', true);
end;
$$;

------------------------------------------------------------------------------
-- 6. Archiving a role someone is invited to

-- 20261115001500_named_roles.sql's, with an open invite to the role (nobody
-- claimed it, and it hasn't expired) counted as someone holding it: refused
-- (55000, hint 'held', the count of both as its detail) until it is claimed,
-- deleted, expired, or sent again to another role. An expired invite to it
-- stays, closed (private.invite_closed), until the role is restored. No
-- caller in the database; the app calls it with the secret key
-- (archiveBusinessRole in @db/roles).
create or replace function public.archive_business_role(actor uuid, role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.business_roles%rowtype;
  holders integer;
begin
  select * into target from public.business_roles br where br.id = role_id;
  if not found then
    raise exception 'No such role' using errcode = 'P0002';
  end if;

  perform private.check_role_changer(actor, target.business_id);

  perform 1 from public.businesses b where b.id = target.business_id for no key update;
  select * into target from public.business_roles br where br.id = role_id for update;
  if target.archived_at is not null then
    return;
  end if;

  select count(*)::integer into holders
  from public.memberships m
  where m.named_role = role_id
    and m.active;
  holders := holders + (
    select count(*)::integer
    from public.invites i
    where i.named_role = role_id
      and i.claimed_at is null
      and i.expires_at > now()
  );
  if holders > 0 then
    raise exception 'People hold the role' using errcode = '55000', hint = 'held', detail = holders::text;
  end if;

  update public.memberships m
  set named_role = null
  where m.named_role = role_id;

  update public.business_roles br
  set archived_at = now()
  where br.id = role_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    target.business_id, actor, 'role.archive',
    jsonb_build_object('named_role', role_id, 'name', target.name, 'base', target.base)
  );
end;
$$;

------------------------------------------------------------------------------
-- 7. Leaving the team, and deleting an invite

-- 20261115001300_roles_team.sql's, the same, with the named role the person
-- held named in the log (named_role, role_name), as a change of role names
-- it: someone taken off the team is nameless to the log by then, so their
-- role is what says who they were. The membership keeps it, inactive, as
-- before. No caller in the database; the app calls it with the secret key
-- (removeMember in @db/team).
create or replace function public.remove_member(
  actor uuid,
  business uuid,
  person uuid,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  target public.memberships%rowtype;
  cleared jsonb;
begin
  -- One team change at a time in the business.
  perform 1 from public.businesses b where b.id = business for no key update;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or not private.holds_perm(business, actor, 'team.edit'::text) then
    raise exception 'Not allowed to remove this person' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Not yourself' using errcode = '22023';
  end if;

  select * into target
  from public.memberships m
  where m.business_id = business and m.user_id = person and m.active
  for update;
  if not found then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if not private.gives_role(actor_role, target.role) then
    raise exception 'Only an owner removes an owner, an accountant or someone of a higher role'
      using errcode = '42501';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business keeps its people' using errcode = '55000', hint = 'demo';
  end if;

  if target.role = 'owner' and not exists (
    select 1
    from public.memberships m
    where m.business_id = business and m.active and m.role = 'owner'
      and m.user_id <> person
  ) then
    raise exception 'The business keeps one owner' using errcode = '23P01';
  end if;

  if exists (
    select 1 from public.time_entries e
    where e.business_id = business and e.user_id = person and e.clock_out is null
  ) then
    raise exception 'Clocked in now' using errcode = '55000', hint = 'clocked_in';
  end if;

  update public.memberships m
  set active = false, perms = '{}'::text[], left_at = at_time
  where m.id = target.id;

  cleared := private.leave_staff(business, person, at_time);

  -- Their own lines here wait for nobody now, and none goes to their phone.
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.user_id = person
    and (n.read_at is null or n.push_state = 'queued');

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'member.remove',
    jsonb_build_object(
      'person', person,
      'role', target.role,
      'perms', to_jsonb(target.perms),
      'at', at_time
    ) || cleared
      || case
        when target.named_role is null then '{}'::jsonb
        else jsonb_build_object(
          'named_role', target.named_role,
          'role_name', (
            select br.name from public.business_roles br where br.id = target.named_role
          )
        )
      end
  );

  return private.left_counts(cleared);
end;
$$;

-- 20261115001300_roles_team.sql's, the same, with the invite's named role
-- named in the log (named_role, role_name), as its sending names it. No
-- caller in the database; the app calls it with the secret key
-- (cancelTeamInvite in @db/team).
create or replace function public.team_invite_cancel(
  actor uuid,
  invite uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  actor_role public.member_role;
begin
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

  if actor_role is null
    or not private.holds_perm(inv.business_id, actor, 'team.edit'::text)
    or not private.gives_role(actor_role, inv.role) then
    raise exception 'Not allowed to cancel this invite' using errcode = '42501';
  end if;

  update public.invites i
  set claimed_at = at_time,
    claimed_by = null,
    cancelled_at = at_time,
    -- 64 hex digits of no token anyone was given.
    token_hash = md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text)
  where i.id = inv.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    inv.business_id, actor, 'invite.cancel',
    jsonb_build_object('invite', inv.id, 'role', inv.role)
      || case
        when inv.named_role is null then '{}'::jsonb
        else jsonb_build_object(
          'named_role', inv.named_role,
          'role_name', (
            select br.name from public.business_roles br where br.id = inv.named_role
          )
        )
      end
  );
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The helpers run inside the functions above, as their owner.
revoke execute on function private.live_named_role(uuid, public.member_role, uuid)
  from public, anon, authenticated;
revoke execute on function private.role_holds_beyond(uuid, public.member_role, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.role_holds_pay(uuid, public.member_role, uuid)
  from public, anon, authenticated;
revoke execute on function private.invite_closed(uuid, public.member_role, uuid, uuid)
  from public, anon, authenticated;

-- With the secret key only, as before.
revoke execute on function
  public.team_invite(uuid, uuid, text, text, public.member_role, text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.team_invite(uuid, uuid, text, text, public.member_role, text, uuid)
  to service_role;
revoke execute on function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz, uuid, uuid
) to service_role;

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- granted to the secret key) again all the same.
revoke execute on function public.admin_invite(uuid, uuid, text, text, public.member_role, text)
  from public, anon, authenticated;
grant execute on function public.admin_invite(uuid, uuid, text, text, public.member_role, text)
  to service_role;
revoke execute on function public.issue_invite_link(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.issue_invite_link(uuid, uuid, text) to service_role;
revoke execute on function public.team_invite_link(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.team_invite_link(uuid, uuid, text) to service_role;
revoke execute on function public.invite_by_token(text)
  from public, anon, authenticated;
grant execute on function public.invite_by_token(text) to service_role;
revoke execute on function public.claim_invite(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_invite(text, uuid) to service_role;
revoke execute on function public.archive_business_role(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.archive_business_role(uuid, uuid) to service_role;
revoke execute on function public.remove_member(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.remove_member(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.team_invite_cancel(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.team_invite_cancel(uuid, uuid, timestamptz)
  to service_role;
