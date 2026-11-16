-- Roles and permissions by module, R6: the team by its permissions (the roles
-- plan; Orel's answers of 15 November 2026, issue #1). Whoever holds
-- team.view sees the team screen, and whoever also holds team.edit changes
-- it, where until now both were owners and managers by role; and owners and
-- the ConceptApp team now switch both per role (permission_keys.settable).
-- Nothing changes for anyone until they do, but one thing (below, "pay"):
-- managers hold both by default, workers neither, owners always both.
--
--   names       every member still reads everyone's name and photo in the
--               business (the memberships and profiles policies, through
--               private.shares_business, unchanged and on purpose, critique
--               15): the schedule, the lists and chat name people. Team
--               "none" hides the screen, the numbers, the minors and the
--               invites, not the names.
--   seeing      the invites (one policy now, for members and views alike),
--               everyone's numbers (public.team_phones) and who is a minor
--               (public.team_youth) are read by those who see the team: a
--               member through private.holds_perm, a view whose role holds
--               team.view by role (or is the owner), through
--               private.businesses_holding (20261115000900_roles_scheduling.sql),
--               asked once per query. The minors' details also by those who
--               build the schedule (schedule.edit, critique 14): a shift
--               plan needs them whatever the team level.
--   changing    inviting and inviting again (public.team_invite,
--               public.team_invite_link), cancelling an invite
--               (public.team_invite_cancel), taking someone off the team
--               (public.remove_member), changing a role
--               (public.set_member_role) and clearing a colleague's line
--               (public.clear_profile_bio) ask team.edit of the actor, where
--               they asked for an owner or a manager. The one rule by role
--               left is the rank rule (private.gives_role): an owner gives
--               every role; anyone else a role of the staff other than owner
--               at or below their own (a manager: managers and workers; a
--               worker raised to team edit: workers). An accountant's place
--               and an owner's stay an owner's to give. Clearing a line keeps
--               its comparison by rank (nobody clears a higher role's), and
--               an accountant's, at a worker's rank, is cleared by those
--               above it (a manager, an owner), not by a worker raised to
--               edit the team.
--   pay         pay stays the owner's to give (Orel, 8 November 2026;
--               critique 17): someone other than an owner gives nobody a
--               role that holds pay by role (a row of public.role_permissions
--               for clock.payroll, private.role_holds_pay), by an invite, a
--               fresh link for one or a change of role (42501, hint 'pay').
--               Nor does an invite sent before: one to such a role that
--               neither an owner nor the ConceptApp team sent can't be
--               claimed (private.invite_closed; the join screen reads it as
--               expired) until an owner's fresh link or the team's makes it
--               theirs. This changes something today: where an owner gave
--               managers pay (the demo shop does), a manager inviting or
--               promoting someone to manager passed pay on, and no longer
--               can; only an owner can. Where no role holds pay, nothing
--               changes.
--   telling     someone joining (team.joined) goes to those who see the
--               team (private.members_holding, holders_of team.view), as a
--               line for that permission: read only while its reader holds
--               it, its push skipped once they don't, settled when a change
--               of role takes it away (R3's rules for such a line). Its
--               audience_role stays 'manager', the lowest role that holds
--               team.view by default, which nothing decides by any more. The
--               lines already written are moved to the key, so a manager
--               lowered later stops reading them too.
--   the area    team.view and team.edit are settable: the console's roles
--               page (and, with R9, the owner's) switches them per role
--               (public.set_role_permission), every check in the area now
--               reading them: edit, view or none.
--
-- The time clock's lines in the same notifier (clock.confirm) are R4's, as
-- 20261115001100_roles_clock.sql left them: to those who edit the clock
-- (clock.edit), hours someone set for themselves to owners. Someone clocked
-- in is still read under the clock's own rules (time_entries' policy):
-- someone who edits the team without reading the team's hours is told that
-- the change waits for the person to clock out, and the database refuses it
-- while they are clocked in (55000, hint 'clocked_in').

------------------------------------------------------------------------------
-- 1. Who sees the team

-- 20261108000300_sealed.sql's, the same, with its readers those who see the
-- team (team.view) rather than owners and managers (and a view as one): a
-- member who holds it, a view whose role holds it by role or is the owner
-- (private.businesses_holding, asked once). No caller in the database; the
-- Team screen calls it (teamPhones in @db/team).
create or replace function public.team_phones(business uuid)
returns table (user_id uuid, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.phone
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.business_id = team_phones.business
    and m.active
    and team_phones.business in (select private.businesses_holding('team.view'::text))
$$;

-- 20261110000600_payroll_details.sql's, the same, with its readers those who
-- see the team (team.view), and those who build the schedule
-- (schedule.edit, critique 14), rather than owners and managers (and a view
-- as one): a shift plan needs who is a minor. No caller in the database; the
-- person's page calls it (getTeamYouth in @db/payroll-details).
create or replace function public.team_youth(business uuid)
returns table (user_id uuid, youth_until date)
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id, d.youth_until
  from public.member_payroll_details d
  join public.memberships m
    on m.business_id = d.business_id and m.user_id = d.user_id and m.active
  join public.businesses b on b.id = d.business_id
  where d.business_id = team_youth.business
    and d.youth_until > (now() at time zone b.timezone)::date
    and private.is_staff_role(m.role)
    and private.module_enabled(team_youth.business, 'time_clock')
    and (
      team_youth.business in (select private.businesses_holding('team.view'::text))
      or team_youth.business in (select private.businesses_holding('schedule.edit'::text))
    )
$$;

-- 20261013000200_access_rules.sql's (managers) and 20261025000100_view_as.sql's
-- twin (a view as a manager), now one rule: the business's invites are read
-- by those who see the team, members and views alike
-- (private.businesses_holding answers a view as its role holds the key, or
-- as the owner), so the twin has nothing left of its own.
alter policy "managers read their business's invites" on public.invites
  rename to "the team's viewers read its invites";
alter policy "the team's viewers read its invites" on public.invites
  using (business_id in (select private.businesses_holding('team.view')));

drop policy "the team reads invites when viewing as a manager" on public.invites;

------------------------------------------------------------------------------
-- 2. Who changes it

-- 20261114000100_team_changes.sql's, with the rank rule alone (the roles
-- plan's R6): who may act at all is team.edit, asked by each caller, and
-- this says which roles they act on. An owner gives every role; anyone else
-- a role of the staff other than owner, at or below their own (owner 3 >
-- manager 2 > worker 1, private.role_rank): a manager managers and workers,
-- as before, and a worker raised to edit the team workers. An accountant
-- (off the staff) and an owner are an owner's to give, as before (Orel,
-- 8 November 2026). Spelled out, never read from the enum's order, in which
-- an accountant comes after a worker. Its callers: public.remove_member,
-- public.set_member_role, public.team_invite_cancel, and now
-- public.team_invite and public.team_invite_link (below). @domain/team's
-- givesRole says the same.
create or replace function private.gives_role(giver public.member_role, r public.member_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    r is not null
      and (
        giver = 'owner'
        or (
          private.is_staff_role(giver)
          and private.is_staff_role(r)
          and r <> 'owner'
          and private.role_rank(r) <= private.role_rank(giver)
        )
      ),
    false
  )
$$;

-- Whether role `r` holds by its role in the business a key only an owner
-- gives (by_owner): pay (clock.payroll), the one there is, through a row of
-- public.role_permissions (private.role_holds; such a key has no default
-- roles). Someone other than an owner gives nobody that role: it would pass
-- on what only an owner gives (Orel, 8 November 2026; critique 17). Owners
-- and accountants hold pay without a row, and only an owner gives either.
create function private.role_holds_pay(business uuid, r public.member_role)
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
      and private.role_holds(business, r, k.key)
  )
$$;

-- 20261108000300_sealed.sql's, with one more reason nobody may claim an
-- invite: it gives a role that holds pay by role (private.role_holds_pay)
-- and neither an owner nor the ConceptApp team sent it (Orel, 8 November
-- 2026; critique 17). The refusals below keep such an invite from being
-- made or sent again; this keeps one sent before them, or before an owner
-- gave its role pay, from passing pay on when it is claimed. An owner's
-- fresh link (public.team_invite_link) or the team's
-- (public.issue_invite_link, below) makes it theirs, and open again. Its
-- callers are unchanged: public.claim_invite (which answers P0002),
-- public.invite_by_token (the join screen reads it as expired) and
-- public.issue_invite_link.
create or replace function private.invite_closed(
  business uuid,
  invite_role public.member_role,
  inviter uuid
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
      private.role_holds_pay(business, invite_role)
      and not private.is_active_owner(business, inviter)
      and not exists (
        select 1 from public.platform_staff s where s.user_id = inviter
      )
    )
$$;

-- 20261108000300_sealed.sql's, the same, but for an invite closed only
-- because someone other than an owner sent it to a role that holds pay
-- (private.invite_closed): the team's fresh link makes it the team's, who
-- may give that role (public.admin_invite), and so open again, as an
-- owner's does (public.team_invite_link). An invite closed for the team too
-- (an owner invite once the business has an owner) stays refused (23P01),
-- as before. No caller in the database; the console calls it with the
-- secret key (issueInviteLink in @db/invites).
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

  -- Closed for whoever sent it: the team sends it again only where it
  -- would be open had the team sent it, and then it is the team's.
  was_closed := private.invite_closed(inv.business_id, inv.role, inv.invited_by);
  if was_closed and private.invite_closed(inv.business_id, inv.role, actor) then
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

-- 20261115000900_roles_scheduling.sql's, the same, with the actor someone who
-- edits the team (team.edit) rather than an owner or a manager, the rank rule
-- (private.gives_role) for the role invited to and for an open invite's role
-- it changes, where only an owner's and an accountant's were an owner's, and
-- someone other than an owner refused (42501, hint 'pay') an invite to a role
-- that holds pay (private.role_holds_pay). The accountant's own refusal
-- stays first, as its message says. No caller in the database; the app calls
-- it with the secret key (inviteToTeam in @db/invites).
create or replace function public.team_invite(
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
  actor_role public.member_role;
  existing public.invites%rowtype;
  invite_id uuid;
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

  -- Pay is the owner's to give (Orel, 8 November 2026; critique 17): nobody
  -- else gives a role that holds it, by an invite or otherwise, even when
  -- it is their own role.
  if actor_role <> 'owner' and private.role_holds_pay(business, invite_role) then
    raise exception 'Only an owner gives a role that sees pay'
      using errcode = '42501', hint = 'pay';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner' and private.role_holds_beyond(business, invite_role, actor) then
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

-- 20261115000900_roles_scheduling.sql's, the same, with the actor someone who
-- edits the team (team.edit) and the invite's role one they give by the rank
-- rule (private.gives_role), rather than an owner or a manager with only an
-- owner's and an accountant's an owner's, and someone other than an owner
-- refused (42501, hint 'pay') a fresh link for an invite to a role that holds
-- pay. No caller in the database; the app calls it with the secret key
-- (issueTeamInviteLink in @db/invites).
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

  -- Pay is the owner's to give (Orel, 8 November 2026; critique 17): nobody
  -- else gives a role that holds it, by a fresh link or otherwise, even when
  -- it is their own role.
  if actor_role <> 'owner' and private.role_holds_pay(inv.business_id, inv.role) then
    raise exception 'Only an owner gives a role that sees pay'
      using errcode = '42501', hint = 'pay';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner'
    and private.role_holds_beyond(inv.business_id, inv.role, actor)
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

-- 20261115000900_roles_scheduling.sql's, the same, with the actor someone who
-- edits the team (team.edit) rather than an owner or a manager, the rank rule
-- (private.gives_role, now for whoever edits the team) for the role now and
-- the new one, and someone other than an owner refused (42501, hint 'pay') a
-- new role that holds pay (private.role_holds_pay), once the same role has
-- written nothing, before R3's refusal of a role that holds what they don't.
-- No caller in the database; the app calls it with the secret key
-- (setMemberRole in @db/team).
create or replace function public.set_member_role(
  actor uuid,
  business uuid,
  person uuid,
  new_role public.member_role,
  seen_role public.member_role default null,
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
  leaving boolean;
  joining boolean;
  dropped_perms text[];
  cleared jsonb := '{}'::jsonb;
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

  if seen_role is not null and seen_role <> target.role then
    raise exception 'The role changed meanwhile' using errcode = '40001';
  end if;

  if not private.gives_role(actor_role, new_role) then
    raise exception 'Only an owner gives an owner''s, an accountant''s or a higher role'
      using errcode = '42501';
  end if;

  if new_role = target.role then
    return private.left_counts('{}'::jsonb) || jsonb_build_object('changed', false);
  end if;

  -- Pay is the owner's to give (Orel, 8 November 2026; critique 17): nobody
  -- else gives a role that holds it, by a change of role or otherwise, even when
  -- it is their own role.
  if actor_role <> 'owner' and private.role_holds_pay(business, new_role) then
    raise exception 'Only an owner gives a role that sees pay'
      using errcode = '42501', hint = 'pay';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner' and private.role_holds_beyond(business, new_role, actor) then
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

  begin
    update public.memberships m
    set role = new_role,
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
  );

  return private.left_counts(cleared) || jsonb_build_object('changed', true);
end;
$$;

-- 20261114000100_team_changes.sql's, the same, with the actor someone who
-- edits the team (team.edit) rather than an owner or a manager; whom they
-- take off is the rank rule's (private.gives_role), as before. No caller in
-- the database; the app calls it with the secret key (removeMember in
-- @db/team).
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
  );

  return private.left_counts(cleared);
end;
$$;

-- 20261114000100_team_changes.sql's, the same, with the actor someone who
-- edits the team (team.edit) as well as giving the invite's role by the rank
-- rule (private.gives_role). No caller in the database; the app calls it with
-- the secret key (cancelTeamInvite in @db/team).
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
  );
end;
$$;

-- 20261109000400_profile_about.sql's, the same, with the actor someone who
-- edits the team (team.edit) rather than an owner or a manager, and its
-- comparison by rank kept: nobody clears the line of a higher role than
-- their own. An accountant reads at a worker's rank (private.role_rank) and
-- keeps one line in every business they serve, so a worker raised to edit
-- the team doesn't clear theirs: someone off the staff is cleared only from
-- above their rank (a manager, an owner), as only owners and managers could
-- before. @domain/profile's mayClearBio says the same. No caller in the
-- database; the app calls it with the secret key (clearProfileBio in
-- @db/profile).
create or replace function public.clear_profile_bio(actor uuid, business uuid, person uuid, seen text)
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
  if actor_role is null or not private.holds_perm(business, actor, 'team.edit'::text) then
    raise exception 'Only someone who edits the team' using errcode = '42501';
  end if;

  select m.role into person_role
  from public.memberships m
  where m.business_id = business and m.user_id = person and m.active;
  if person_role is null then
    raise exception 'Not in this business' using errcode = '42501';
  end if;
  if private.role_rank(person_role) > private.role_rank(actor_role)
    or (
      not private.is_staff_role(person_role)
      and private.role_rank(person_role) >= private.role_rank(actor_role)
    )
  then
    raise exception 'Nobody clears the line of a higher role, nor of an accountant at theirs'
      using errcode = '42501';
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

------------------------------------------------------------------------------
-- 3. Who is told

-- 20261115001100_roles_clock.sql's, the same, with someone joining
-- (team.joined) told to those who see the team (private.members_holding,
-- holders_of team.view) rather than to owners and managers. The clock's
-- lines are R4's, as they are there: clock.confirm to those who edit the
-- clock (holders_of clock.edit), hours someone set for themselves to owners.
-- Its caller (private.notify_from_log, the log's trigger) is unchanged.
create or replace function private.notify_for(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := entry.details;
  b uuid := entry.business_id;
  w public.shift_swaps%rowtype;
  e public.time_entries%rowtype;
  person uuid;
  gone jsonb;
  proof text;
  thing text;
  arrival_open boolean;
  departure_open boolean;
  leaving boolean;
  for_role public.member_role;
  for_perm text;
  recipients uuid[];
  facts jsonb;
  moment timestamptz;
  running boolean;
  ahead integer;
  until_at timestamptz;
  near jsonb;
  prior_near jsonb;
  prior_until timestamptz;
  prior_on boolean;
  prior_kept boolean;
  written integer;
begin
  case entry.action
  when 'schedule.publish' then
    -- The publish's moment and whether the week had begun then; a row
    -- without them (from before them) is of a week still to come.
    moment := coalesce((d ->> 'at')::timestamptz, entry.created_at);
    running := coalesce((d ->> 'running')::boolean, false);

    if coalesce((d ->> 'first')::boolean, false) then
      for person in
        select m.user_id from public.memberships m
        where m.business_id = b and m.active
      loop
        -- Under way: only someone with a shift still to start, how many, and
        -- on the phone until the first of them starts.
        if running then
          select h.shift_count, h.first_start into ahead, until_at
          from private.shifts_ahead(person, (d ->> 'week')::uuid, moment) h;
          continue when ahead = 0;
        else
          ahead := private.own_shift_count(person, (d ->> 'week')::uuid);
          until_at := null;
        end if;

        facts := jsonb_build_object(
          'week', d -> 'week',
          'startsOn', d -> 'starts_on',
          'mine', ahead
        );
        if running then
          facts := facts || jsonb_build_object('running', true);
        end if;

        perform private.notify(
          b, array[person], 'schedule.published'::text, facts,
          entry.actor_id, 'scheduling'::public.module_key, 'worker'::public.member_role,
          'schedule:' || (d ->> 'week'),
          push_until => until_at,
          at_time => moment
        );
      end loop;
    else
      for person in
        select c.value::uuid
        from jsonb_array_elements_text(coalesce(d -> 'changed', '[]'::jsonb)) as c (value)
      loop
        -- Under way: how many are left, and the nearest shift that changed,
        -- on the phone until it starts (or ends, once begun).
        near := null;
        until_at := null;
        if running then
          ahead := (
            select h.shift_count
            from private.shifts_ahead(person, (d ->> 'week')::uuid, moment) h
          );
          near := d -> 'nearest' -> person::text;
          if jsonb_typeof(near) = 'object' then
            until_at := (near ->> 'until')::timestamptz;
            near := jsonb_build_object(
              'change', near -> 'change', 'shift', near -> 'brief', 'from', near -> 'from'
            );
          else
            near := null;
          end if;

          -- The change their line names already, when they haven't heard of
          -- it yet: unread, and its push not gone (held for its two minutes,
          -- by quiet hours, or never to go, with no phone). Several publishes
          -- in a row then never lose a nearer one: it stays named while it
          -- still holds of them and its shift is ahead, unless this
          -- publish's own is nearer.
          select l.params -> 'nearest', l.push_before
          into prior_near, prior_until
          from public.notifications l
          where l.business_id = b
            and l.user_id = person
            and l.dedupe_key = 'schedule:' || (d ->> 'week')
            and l.kind = 'schedule.changed'
            and l.read_at is null
            and l.resolved_at is null
            and l.push_state not in ('sending', 'sent');
          prior_kept := false;
          if jsonb_typeof(prior_near) = 'object' and prior_until > moment then
            -- On a shift as it names it, now: what a move, an edit or an
            -- addition says still holds, and a removal holds while they
            -- aren't.
            prior_on := exists (
              select 1
              from public.shift_assignments a
              join public.schedule_shifts s on s.id = a.shift_id
              where s.week_id = (d ->> 'week')::uuid
                and a.user_id = person
                and s.day = (prior_near #>> '{shift,day}'::text[])::date
                and s.starts_at = (prior_near #>> '{shift,start}'::text[])::time
                and s.ends_at = (prior_near #>> '{shift,end}'::text[])::time
                and s.name = (prior_near #>> '{shift,name}'::text[])
            );
            -- Nearer as private.nearest_change orders: an edit after any
            -- other change, then by when each counts from.
            prior_kept := (case
                when prior_near ->> 'change' = 'removed' then not prior_on
                else prior_on
              end)
              and (
                near is null
                or ((prior_near ->> 'change') = 'edited', (prior_near ->> 'from')::timestamptz)
                  < ((near ->> 'change') = 'edited', (near ->> 'from')::timestamptz)
              );
          end if;
          if prior_kept then
            near := prior_near;
            until_at := prior_until;
          end if;
        else
          ahead := private.own_shift_count(person, (d ->> 'week')::uuid);
        end if;

        facts := jsonb_build_object(
          'week', d -> 'week',
          'startsOn', d -> 'starts_on',
          'mine', ahead
        );
        if running then
          facts := facts || jsonb_build_object('running', true);
        end if;
        if near is not null then
          facts := facts || jsonb_build_object('nearest', near);
        end if;

        written := private.notify(
          b, array[person], 'schedule.changed'::text, facts,
          entry.actor_id, 'scheduling'::public.module_key, 'worker'::public.member_role,
          'schedule:' || (d ->> 'week'),
          push_until => until_at,
          at_time => moment
        );

        -- On the phone two minutes after the publish, or when quiet hours
        -- end if later: a publish of the week before then replaces this
        -- push with its own, through the same line.
        if written > 0 then
          update public.notifications n
          set push_after = greatest(n.push_after, moment + interval '2 minutes')
          where n.business_id = b
            and n.user_id = person
            and n.dedupe_key = 'schedule:' || (d ->> 'week')
            and n.push_state = 'queued';
        end if;
      end loop;
      for gone in
        select c.value
        from jsonb_array_elements(coalesce(d -> 'removed_swaps', '[]'::jsonb)) as c (value)
      loop
        perform private.notify(
          b,
          array[(gone ->> 'requested_by')::uuid, (gone ->> 'taken_by')::uuid],
          'swap.removed',
          jsonb_build_object('swap', gone -> 'id', 'shift', gone -> 'shift'),
          entry.actor_id, 'scheduling', 'worker', 'swap:' || (gone ->> 'id')
        );
        perform private.resolve_notifications(b, 'swap.offer:' || (gone ->> 'id'));
        perform private.resolve_notifications(b, 'swap.approval:' || (gone ->> 'id'));
      end loop;
    end if;

  when 'swap.request' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      perform private.notify(
        b,
        array(
          select m.user_id from public.memberships m
          where m.business_id = b and m.active and m.user_id <> w.requested_by
            and private.can_take(w.shift_id, m.user_id)
        ),
        'swap.offered',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'from', w.requested_by
        ),
        entry.actor_id, 'scheduling', 'worker', 'swap.offer:' || w.id
      );
    end if;

  when 'swap.take' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      perform private.notify(
        b, array[w.requested_by], 'swap.taken',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'by', w.taken_by
        ),
        entry.actor_id, 'scheduling', 'worker', 'swap:' || w.id
      );
      -- To whoever decides it: those who build the schedule, but its asker
      -- when they don't publish it, who doesn't decide their own (the taker
      -- did this, and is left out as its actor).
      perform private.notify(
        b, private.members_holding(b, 'schedule.edit'::text),
        'swap.waiting',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'from', w.requested_by,
          'to', w.taken_by
        ),
        entry.actor_id, 'scheduling', 'manager', 'swap.approval:' || w.id,
        leave_out => case
          when private.publishes_schedule(b, w.requested_by) then '{}'::uuid[]
          else array[w.requested_by]
        end,
        holders_of => 'schedule.edit'::text
      );
      perform private.resolve_notifications(b, 'swap.offer:' || w.id);
    end if;

  when 'swap.cancel' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      if w.taken_by is not null then
        perform private.notify(
          b, array[w.taken_by], 'swap.cancelled',
          jsonb_build_object(
            'swap', w.id,
            'shift', private.shift_brief(w.shift_id),
            'from', w.requested_by
          ),
          entry.actor_id, 'scheduling', 'worker', 'swap:' || w.id
        );
      end if;
      perform private.resolve_notifications(b, 'swap.offer:' || w.id);
      perform private.resolve_notifications(b, 'swap.approval:' || w.id);
    end if;

  when 'swap.approve', 'swap.decline' then
    perform private.notify(
      b,
      array[(d ->> 'from')::uuid, (d ->> 'to')::uuid],
      case entry.action when 'swap.approve' then 'swap.approved' else 'swap.declined' end,
      jsonb_build_object(
        'swap', d -> 'swap',
        'shift', private.shift_brief((d ->> 'shift')::uuid),
        'from', d -> 'from',
        'to', d -> 'to'
      ),
      entry.actor_id, 'scheduling', 'worker', 'swap:' || (d ->> 'swap')
    );
    perform private.resolve_notifications(b, 'swap.approval:' || (d ->> 'swap'));

  when 'clock.in', 'clock.out', 'clock.add', 'clock.correct', 'clock.undo_out' then
    select * into e from public.time_entries t where t.id = (d ->> 'entry')::uuid;
    if found then
      thing := 'clock.confirm:' || e.id;
      -- What is left to confirm, by the rule of confirm_time_entry: the arrival
      -- until confirmed, and a departure after the last confirmation. Hours
      -- someone set for themselves are an owner's to confirm.
      arrival_open := coalesce(e.in_proof, '') in ('none', 'self') and e.confirmed_at is null;
      departure_open := coalesce(e.out_proof, '') in ('none', 'self')
        and coalesce(e.confirmed_at is null or e.confirmed_at < e.clock_out, false);
      proof := case
        when (arrival_open and e.in_proof = 'self') or (departure_open and e.out_proof = 'self')
          then 'self'
        when arrival_open or departure_open then 'none'
      end;
      if proof is null then
        -- Nothing left to confirm: an owner's correction, an undone clock-out.
        perform private.resolve_notifications(b, thing);
      else
        -- Hours someone set for themselves stay with owners, by rank (critique
        -- 24): an owner confirms them. The rest go to those who edit the
        -- clock (private.members_holding, holders_of clock.edit), whatever
        -- their role, as a line for that permission; 'manager' stays its
        -- audience_role, the lowest role that holds it by default.
        for_role := (case proof when 'self' then 'owner' else 'manager' end)::public.member_role;
        for_perm := case proof when 'self' then null::text else 'clock.edit'::text end;
        recipients := case proof
          when 'self' then private.members_in(b, '{owner}'::public.member_role[])
          else private.members_holding(b, 'clock.edit'::text)
        end;
        -- The line tells a time that waits, whatever the action was: the
        -- departure, the later of the two, unless the arrival is what makes
        -- the hours an owner's.
        leaving := departure_open and (not arrival_open or e.out_proof = proof);
        facts := jsonb_build_object(
          'entry', e.id,
          'person', e.user_id,
          'proof', proof,
          'direction', case when leaving then 'out' else 'in' end,
          'at', case when leaving then e.clock_out else e.clock_in end
        );
        -- Anyone who may no longer confirm them (one who edits the clock, once
        -- the hours rest on someone's own word, or who no longer edits it) is
        -- done with them.
        perform private.resolve_notifications(b, thing, still_for => recipients);
        if entry.action = 'clock.undo_out' then
          -- The departure is gone and the arrival still waits: the lines say
          -- so without coming back unread, and anyone new to them gets one.
          update public.notifications n
          set params = facts, audience_role = for_role, audience_perm = for_perm
          where n.business_id = b and n.dedupe_key = thing and n.resolved_at is null;
          perform private.notify(
            b, recipients, 'clock.confirm', facts, entry.actor_id, 'time_clock',
            for_role, thing,
            realert => false,
            leave_out => array[e.user_id],
            holders_of => for_perm
          );
        elsif entry.action <> 'clock.out' or departure_open then
          -- A clock-out tells again only when the departure itself waits.
          perform private.notify(
            b, recipients, 'clock.confirm', facts,
            -- Whoever did it: the person, or the manager who corrected it.
            entry.actor_id, 'time_clock', for_role, thing,
            -- Never to the person whose hours they are.
            leave_out => array[e.user_id],
            holders_of => for_perm
          );
        end if;
      end if;
    end if;

  when 'clock.confirm' then
    perform private.resolve_notifications(b, 'clock.confirm:' || (d ->> 'entry'));

  when 'invite.claim' then
    -- To those who see the team (the roles plan's R6), whoever they are.
    perform private.notify(
      b, private.members_holding(b, 'team.view'::text),
      'team.joined',
      jsonb_build_object('person', entry.actor_id),
      entry.actor_id, null::public.module_key, 'manager',
      'team.joined:' || entry.actor_id,
      holders_of => 'team.view'::text
    );

  else
    null;
  end case;
end;
$$;

-- The lines already written move to their key, as private.notify_for writes
-- them from now on: read and pushed only while their reader holds team.view,
-- so a manager lowered after this migrates stops reading them too. Everyone
-- who has one now is an owner or a manager, who hold the key by default:
-- nobody's inbox changes today. No trigger reads an update of a line.
update public.notifications n
set audience_perm = 'team.view'
where n.kind = 'team.joined'
  and n.audience_perm is null;

comment on column public.notifications.audience_perm is
  'The permission whoever reads the line holds (private.holds_perm), when it is for those who hold one rather than for a rank and up, as each kind''s perm in NOTIFICATION_KINDS (@domain/notifications) names it. Written only to them (private.notify''s holders_of), read only while they hold it, its push skipped once they don''t (public.claim_due_pushes), and settled when a change of role takes it away (public.set_member_role).';

------------------------------------------------------------------------------
-- 4. The area opens

-- Every check of the team screen now reads its two permissions: owners and
-- the team switch them per role (public.set_role_permission), edit, view or
-- none.
update public.permission_keys k
set settable = true
where k.key in ('team.view', 'team.edit');

------------------------------------------------------------------------------
-- Who may call what

-- The new helper runs inside the functions above, as their owner.
revoke execute on function private.role_holds_pay(uuid, public.member_role)
  from public, anon, authenticated;

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the writes granted to the secret key, the reads to the signed-in) again all
-- the same.
revoke execute on function private.gives_role(public.member_role, public.member_role)
  from public, anon, authenticated;
revoke execute on function private.invite_closed(uuid, public.member_role, uuid)
  from public, anon, authenticated;
revoke execute on function public.issue_invite_link(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.issue_invite_link(uuid, uuid, text)
  to service_role;
revoke execute on function public.team_phones(uuid) from public, anon;
grant execute on function public.team_phones(uuid) to authenticated;
revoke execute on function public.team_youth(uuid) from public, anon;
grant execute on function public.team_youth(uuid) to authenticated;
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
revoke execute on function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz
) from public, anon, authenticated;
grant execute on function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz
) to service_role;
revoke execute on function public.remove_member(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.remove_member(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.team_invite_cancel(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.team_invite_cancel(uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.clear_profile_bio(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.clear_profile_bio(uuid, uuid, uuid, text)
  to service_role;
revoke execute on function private.notify_for(public.audit_log)
  from public, anon, authenticated;
