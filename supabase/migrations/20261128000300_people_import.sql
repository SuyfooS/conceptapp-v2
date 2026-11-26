-- Inviting from a list, part 3: the database ("הזמנה מרשימה"; Orel, 25
-- November 2026: the ConceptApp team pastes first, in the console, then owners
-- and managers on /team; each person's link is made at the moment of sending;
-- the app sends nothing to anyone). A pasted list, read on the device
-- (@domain/people-import), becomes many invites at once, all or none, with
-- no link: each is saved as the console's new-business wizard saves its
-- invites since 20261128000200_invite_links_pending.sql (link_pending, a hash
-- of no token anyone holds), and /team lists it under "עוד לא קיבלו קישור"
-- until someone makes its link there.
--
--   the column  invites.import_id: the import that made the invite, which its
--               undo cancels by. Null for one made otherwise, and never set by
--               an update: an invite an import only renamed keeps the import
--               that made it, or none.
--   the worker  private.import_invites(business, actor, giver, people,
--               from_console): the business's row locked first (for no key
--               update, as public.import_menu locks it), so two imports into
--               one business go one after the other; refused in a demo
--               business closed to invites (55000, as every way of inviting
--               is). Then every row is checked before anything is read of the
--               team: an object of {name, phone, role, named_role,
--               role_from_line} and nothing else, a staff role (manager or
--               worker; 22023, hint 'role': owners and accountants are
--               invited one at a time), an Israeli mobile in E.164 (hint
--               'phone'), a name as the app keeps names (private.team_name;
--               hint 'name'), each number once (hint 'duplicate'), 1 to 300
--               rows (22023 for none, 54000 with hint 'limit' past 300). A
--               refusal names the row by its place in the list (detail), never
--               by a name or a number, as the actions log the message.
--   each row    against the team, under the invite's row lock: a number that
--               is an active member's is left out ('member'), whatever its
--               role or name; an invite nobody claimed to an owner or an
--               accountant is never changed by a list ('kept'); one whose link
--               was made is never touched, so a link already sent keeps
--               working ('invited', or 'expired' once it ran out); one with
--               no link yet that the giver may not change (by rank, a role
--               that sees pay or holds what they don't, or a named role
--               archived since) is left as it is ('invited'); one with no link
--               yet that the giver may change keeps its role and named role
--               unless the line named one (role_from_line: the list's role is
--               for new invites only), and is 'same' when nothing differs,
--               else 'updated' (its name, role, named role, giver and 14 days;
--               its hash untouched, so still no link). Any other number is a
--               new invite ('created'), or 'invited' when a single invite to
--               it was made meanwhile (on conflict with
--               invites_open_phone_key, waited for). Only what is written is
--               held to the giver's rules, as public.team_invite holds an
--               invite: the rank rule (private.gives_role; 42501), a live
--               named role on its base (private.live_named_role: P0002, 22023
--               'archived' or 'base'), and for anyone but an owner no role
--               that sees pay (42501, hint 'pay') or holds what they don't
--               (42501, hint 'held').
--   elsewhere   only from the console: a number written that is on another
--               business's staff (not as its accountant) refuses the whole
--               import, 23505 with hint 'elsewhere' and the rows' places in
--               the detail, since claiming it would fail (one place on a
--               staff a person). The Team screen never asks (#80).
--   the cap     500 invites waiting in a business (unclaimed, and with no
--               link yet or one still open): an import that would pass it is
--               refused, 54000 with hint 'open' and how many wait (detail).
--   the log     one invite.import row when anything was written: the import's
--               id and its counts (created, updated, same, member, invited,
--               expired, kept, by role), and whether the console or the team
--               wrote it. Never a name or a number. No trigger notifies for
--               it (audit_log_notifies lists invite.claim alone), so nobody is
--               told; each person's own join later says so, as ever.
--   the answer  {import, rows}: the import's id when it made an invite (its
--               undo's), and per row its place, its status and its invite's
--               id. No token and no link: none exists.
--   undo        private.undo_import(business, actor, giver, batch): the
--               business's row locked, refused (42501) when the giver doesn't
--               give, by rank, a role among the import's invites still with no
--               link; then those invites, unclaimed and still with no link,
--               are cancelled as public.team_invite_cancel cancels one (the
--               rows kept for the log: claimed_at, cancelled_at, a hash of no
--               token). One that got a link meanwhile (it may have been sent)
--               stays, still open, and is counted ('kept': /team can delete
--               it); one claimed stays too, counted apart ('joined': that
--               person is on the team now, with no invite left to delete).
--               One invite.import_undo row with the id and the counts, when
--               it cancelled any. A second run cancels none; another
--               business's import id cancels none. No demo check: deleting
--               invites never needed one (public.team_invite_cancel has none).
--   archiving   public.archive_business_role counts as holding a named role
--               an invite with no link yet whatever its date, as everything
--               else counts it waiting (public.admin_business, the cap
--               above), and an open link as before: an import is the first
--               writer of such an invite to a named role, and past its 14
--               days the archive would otherwise go ahead and leave the
--               invite with no way to its link (public.team_invite_link
--               refuses an archived role).
--   who         public.team_import_people and public.team_import_undo: an
--               active member on the staff who edits the team (team.edit),
--               giving by their own role, as public.team_invite asks;
--               public.admin_import_people and public.admin_import_undo: the
--               ConceptApp team (public.platform_staff), giving as an owner,
--               as public.admin_invite does. Each checks its actor before
--               anything is locked. The secret key's alone (service_role);
--               the two private workers are revoked from everyone.
--
-- No table, no policy and no grant on a table changes: the invites' one
-- select policy and its table grant cover the new column. Nothing is sent:
-- there is no SMS, push or message anywhere in this path. @db/people-import
-- calls the four public functions.
--
-- Replaced, from its latest version and only with what is said above:
-- public.archive_business_role (20261115001900_named_roles_lists.sql). The
-- same signature, so its grants stay; nothing in the database calls it, and
-- the app calls it with the secret key (archiveBusinessRole in @db/roles,
-- whose readRoleInvites counts the same invites for the roles screen).

------------------------------------------------------------------------------
-- 1. Which import made an invite

alter table public.invites
  add column import_id uuid;

comment on column public.invites.import_id is
  'The people import that made the invite (public.team_import_people, public.admin_import_people), as its invite.import row''s details say (import): its undo cancels by it. Null for an invite made otherwise; an import that only updated an invite leaves it as it was.';

create index invites_import_idx
  on public.invites (business_id, import_id)
  where import_id is not null;

------------------------------------------------------------------------------
-- 2. The import

-- The one worker behind both doors. `giver` is the role the actor gives by:
-- their own in the business (public.team_import_people), or 'owner' for the
-- ConceptApp team (public.admin_import_people), as public.admin_invite
-- gives. `from_console` also checks other businesses' staff and says so in
-- the log. The callers check the actor first.
create function private.import_invites(
  business uuid,
  actor uuid,
  giver public.member_role,
  people jsonb,
  from_console boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch uuid := gen_random_uuid();
  r record;
  p_phone text;
  p_name text;
  p_role public.member_role;
  p_named uuid;
  from_line boolean;
  seen text[] := '{}';
  far integer[] := '{}';
  existing public.invites%rowtype;
  invite_id uuid;
  st text;
  answer jsonb := '[]'::jsonb;
  made integer := 0;
  updated integer := 0;
  unchanged integer := 0;
  members integer := 0;
  linked integer := 0;
  lapsed integer := 0;
  kept integer := 0;
  by_role jsonb := '{}'::jsonb;
  open_before integer;
begin
  perform 1 from public.businesses b where b.id = business for no key update;
  if not found then
    raise exception 'No such business' using errcode = 'P0002';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
  end if;

  if jsonb_typeof(people) is distinct from 'array' then
    raise exception 'An import is a list of people' using errcode = '22023';
  end if;
  if jsonb_array_length(people) = 0 then
    raise exception 'An import has someone in it' using errcode = '22023';
  end if;
  if jsonb_array_length(people) > 300 then
    raise exception 'At most 300 people at a time'
      using errcode = '54000', hint = 'limit';
  end if;

  -- 1. Every row as the app sends it, before anything of the team is read.
  for r in
    select e.value as v, e.n::integer as n
    from jsonb_array_elements(people) with ordinality as e (value, n)
  loop
    if jsonb_typeof(r.v) is distinct from 'object' then
      raise exception 'A person is an object' using errcode = '22023', detail = r.n::text;
    end if;
    if exists (
      select 1 from jsonb_object_keys(r.v) as k (field)
      where k.field not in ('name', 'phone', 'role', 'named_role', 'role_from_line')
    ) then
      raise exception 'A person is a name, a number and a role'
        using errcode = '22023', detail = r.n::text;
    end if;

    if jsonb_typeof(r.v -> 'role') is distinct from 'string'
      or (r.v ->> 'role') not in ('manager', 'worker') then
      raise exception 'Staff roles only' using errcode = '22023', hint = 'role', detail = r.n::text;
    end if;
    -- 22023 for anything but an id, and anything but true or false.
    perform private.json_uuid(r.v -> 'named_role', 'A named role');
    perform private.json_bool(r.v -> 'role_from_line', false, 'Whether the line named its role');

    p_phone := r.v ->> 'phone';
    if jsonb_typeof(r.v -> 'phone') is distinct from 'string'
      or p_phone !~ '^\+9725[0-9]{8}$' then
      raise exception 'An Israeli mobile' using errcode = '22023', hint = 'phone', detail = r.n::text;
    end if;

    if jsonb_typeof(r.v -> 'name') is distinct from 'string'
      or char_length(r.v ->> 'name') > 400
      or private.team_name(r.v ->> 'name') is null then
      raise exception 'A name of 1 to 80 characters'
        using errcode = '22023', hint = 'name', detail = r.n::text;
    end if;

    if p_phone = any (seen) then
      raise exception 'A number twice' using errcode = '22023', hint = 'duplicate', detail = r.n::text;
    end if;
    seen := seen || p_phone;
  end loop;

  select count(*)::integer into open_before
  from public.invites i
  where i.business_id = business
    and i.claimed_at is null
    and (i.link_pending or i.expires_at > now());

  -- 2. Each row against the team, and what is written.
  for r in
    select e.value as v, e.n::integer as n
    from jsonb_array_elements(people) with ordinality as e (value, n)
  loop
    p_phone := r.v ->> 'phone';
    p_name := private.team_name(r.v ->> 'name');
    p_role := (r.v ->> 'role')::public.member_role;
    p_named := private.json_uuid(r.v -> 'named_role', 'A named role');
    from_line := private.json_bool(r.v -> 'role_from_line', false, 'Whether the line named its role');
    invite_id := null;
    st := null;

    -- The number's open invite first, so a claim of it under way is waited
    -- for, and the membership it makes is then seen just below.
    select * into existing
    from public.invites i
    where i.business_id = business and i.phone = p_phone and i.claimed_at is null
    for update;

    if exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id = m.user_id
      where m.business_id = business and m.active and p.phone = p_phone
    ) then
      -- On the team already, the owner's own line among them.
      st := 'member';
    else
      if existing.id is not null then
        invite_id := existing.id;
        if existing.role not in ('manager', 'worker') then
          -- An owner's or an accountant's (the wizard makes them): given one
          -- at a time, never by a list. private.gives_role('owner', …) is
          -- true for both, so without this the console would make the
          -- owner's own invite a worker's.
          st := 'kept';
        elsif not existing.link_pending then
          -- Its link was made, and maybe sent: never touched.
          st := case when existing.expires_at <= now() then 'expired' else 'invited' end;
        elsif not private.gives_role(giver, existing.role)
          or exists (
            select 1 from public.business_roles br
            where br.id = existing.named_role and br.archived_at is not null
          )
          or (giver <> 'owner' and (
            private.role_holds_pay(business, existing.role, existing.named_role)
            or private.role_holds_beyond(business, existing.role, actor, existing.named_role)
          ))
        then
          -- Not this giver's to change, or its role is gone: as it is.
          st := 'invited';
        else
          -- The list's role is for new invites: a line that names none
          -- keeps the role the invite gives.
          if not from_line then
            p_role := existing.role;
            p_named := existing.named_role;
          end if;
          -- Read as the app keeps names: the wizard's are only trimmed.
          if private.team_name(existing.full_name) is not distinct from p_name
            and existing.role = p_role
            and existing.named_role is not distinct from p_named then
            st := 'same';
          end if;
        end if;
      end if;
    end if;

    if st is null then
      -- Written: held to the giver's rules for the role it ends with, as
      -- public.team_invite holds an invite. An update that keeps the
      -- invite's own role was asked of that role above.
      if invite_id is null or from_line then
        if not private.gives_role(giver, p_role) then
          raise exception 'Not allowed to invite this role'
            using errcode = '42501', detail = r.n::text;
        end if;
        perform private.live_named_role(business, p_role, p_named);
        if giver <> 'owner' and private.role_holds_pay(business, p_role, p_named) then
          raise exception 'Only an owner gives a role that sees pay'
            using errcode = '42501', hint = 'pay', detail = r.n::text;
        end if;
        if giver <> 'owner' and private.role_holds_beyond(business, p_role, actor, p_named) then
          raise exception 'Only an owner invites to a role that holds what you don''t'
            using errcode = '42501', hint = 'held', detail = r.n::text;
        end if;
      end if;

      if from_console and exists (
        select 1
        from public.memberships m
        join public.profiles p on p.id = m.user_id
        where m.active and m.business_id <> business
          and private.is_staff_role(m.role) and p.phone = p_phone
      ) then
        far := far || r.n;
      end if;

      if invite_id is null then
        insert into public.invites (
          business_id, phone, role, named_role, full_name, token_hash,
          invited_by, link_pending, import_id
        )
        values (
          business, p_phone, p_role, p_named, p_name,
          -- A hash of no token anyone holds, as public.create_business's.
          encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
          actor, true, batch
        )
        on conflict (business_id, phone) where claimed_at is null do nothing
        returning id into invite_id;
        -- None: a single invite to the number came first, with its link.
        st := case when invite_id is null then 'invited' else 'created' end;
      else
        update public.invites i
        set full_name = p_name,
          role = p_role,
          named_role = p_named,
          invited_by = actor,
          expires_at = now() + interval '14 days'
        where i.id = invite_id;   -- its hash untouched: still no link
        st := 'updated';
      end if;
    end if;

    case st
      when 'created' then made := made + 1;
      when 'updated' then updated := updated + 1;
      when 'same' then unchanged := unchanged + 1;
      when 'member' then members := members + 1;
      when 'invited' then linked := linked + 1;
      when 'expired' then lapsed := lapsed + 1;
      else kept := kept + 1;
    end case;
    if st in ('created', 'updated') then
      by_role := jsonb_set(
        by_role, array[p_role::text],
        to_jsonb(coalesce((by_role ->> p_role::text)::integer, 0) + 1)
      );
    end if;
    answer := answer || jsonb_build_array(
      jsonb_build_object('i', r.n, 'status', st, 'invite', invite_id)
    );
  end loop;

  if cardinality(far) > 0 then
    raise exception 'On another business''s staff'
      using errcode = '23505', hint = 'elsewhere', detail = array_to_string(far, ',');
  end if;

  if open_before + made > 500 then
    raise exception 'Too many invites waiting'
      using errcode = '54000', hint = 'open', detail = open_before::text;
  end if;

  if made + updated > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, actor, 'invite.import',
      jsonb_build_object(
        'import', batch,
        'created', made,
        'updated', updated,
        'same', unchanged,
        'member', members,
        'invited', linked,
        'expired', lapsed,
        'kept', kept,
        'roles', by_role,
        'by', case when from_console then 'console' else 'team' end
      )
    );
  end if;

  return jsonb_build_object(
    'import', case when made > 0 then batch end,
    'rows', answer
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. Taking an import back

-- The import's invites still with no link, cancelled as
-- public.team_invite_cancel cancels one, the rows kept for the log. Refused
-- (42501) when `giver` doesn't give, by rank, a role among them. A claim
-- under way holds its invite's row, so the update waits for it and then
-- leaves it, claimed. Returns {cancelled, kept, joined}: kept, the import's
-- invites still open with the link made for them; joined, those claimed.
create function private.undo_import(
  business uuid,
  actor uuid,
  giver public.member_role,
  batch uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled integer;
  left_in integer;
  joined integer;
begin
  perform 1 from public.businesses b where b.id = business for no key update;
  if not found then
    raise exception 'No such business' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.invites i
    where i.business_id = business and i.import_id = batch
      and i.claimed_at is null and i.link_pending
      and not private.gives_role(giver, i.role)
  ) then
    raise exception 'Not allowed to cancel these invites' using errcode = '42501';
  end if;

  update public.invites i
  set claimed_at = now(),
    claimed_by = null,
    cancelled_at = now(),
    -- 64 hex digits of no token anyone was given.
    token_hash = md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text)
  where i.business_id = business and i.import_id = batch
    and i.claimed_at is null and i.link_pending;
  get diagnostics cancelled = row_count;

  -- What stays, in two counts the screen words apart: open with its link
  -- (on /team, where it can still be deleted), and claimed (on the team
  -- now: nothing to delete). By claimed_at, which a claim sets and a
  -- deleted profile never clears (claimed_by goes null with it).
  select
    (count(*) filter (where i.claimed_at is null))::integer,
    (count(*) filter (where i.claimed_at is not null))::integer
  into left_in, joined
  from public.invites i
  where i.business_id = business and i.import_id = batch
    and i.cancelled_at is null
    and (i.claimed_at is not null or not i.link_pending);

  if cancelled > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, actor, 'invite.import_undo',
      jsonb_build_object(
        'import', batch, 'cancelled', cancelled, 'kept', left_in, 'joined', joined
      )
    );
  end if;

  return jsonb_build_object('cancelled', cancelled, 'kept', left_in, 'joined', joined);
end;
$$;

------------------------------------------------------------------------------
-- 4. The doors

-- The Team screen's import (/team/import, PR 5): someone on the staff who
-- edits the team, giving by their own role, as public.team_invite asks. No
-- caller in the database; the app calls it with the secret key
-- (importPeopleToTeam in @db/people-import).
create function public.team_import_people(actor uuid, business uuid, people jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
begin
  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null
    or not private.is_staff_role(actor_role)
    or not private.holds_perm(business, actor, 'team.edit'::text) then
    raise exception 'Not allowed to invite' using errcode = '42501';
  end if;

  return private.import_invites(business, actor, actor_role, people, false);
end;
$$;

-- The console's import (PR 4): the ConceptApp team, giving as an owner, as
-- public.admin_invite does. No caller in the database; the console calls it
-- with the secret key (importPeopleFromConsole in @db/people-import).
create function public.admin_import_people(actor uuid, business uuid, people jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Both platform roles may invite staff (@domain/platform).
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  return private.import_invites(business, actor, 'owner'::public.member_role, people, true);
end;
$$;

-- "מחיקת ההזמנות מהרשימה" on the Team screen's done card: as
-- public.team_import_people asks. No caller in the database; the app calls
-- it with the secret key (undoTeamImport in @db/people-import).
create function public.team_import_undo(actor uuid, business uuid, batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
begin
  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null
    or not private.is_staff_role(actor_role)
    or not private.holds_perm(business, actor, 'team.edit'::text) then
    raise exception 'Not allowed to cancel invites' using errcode = '42501';
  end if;

  return private.undo_import(business, actor, actor_role, batch);
end;
$$;

-- The same on the console's done card: the ConceptApp team, as an owner. No
-- caller in the database; the console calls it with the secret key
-- (undoConsoleImport in @db/people-import).
create function public.admin_import_undo(actor uuid, business uuid, batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  return private.undo_import(business, actor, 'owner'::public.member_role, batch);
end;
$$;

------------------------------------------------------------------------------
-- 5. Archiving a role an invite with no link yet gives

-- 20261115001900_named_roles_lists.sql's, with only this: an invite nobody
-- claimed holds the role while its link is open, as before, or while no link
-- was made for it yet (link_pending), whatever its date, as an invite with
-- no link waits everywhere else. No caller in the database; the app calls it
-- with the secret key (archiveBusinessRole in @db/roles).
create or replace function public.archive_business_role(actor uuid, role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.business_roles%rowtype;
  holders integer;
  sending integer;
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
      and (i.link_pending or i.expires_at > now())
  );
  if holders > 0 then
    raise exception 'People hold the role' using errcode = '55000', hint = 'held', detail = holders::text;
  end if;

  -- A live template that goes to the role when nobody chooses, and a time of
  -- a live template that sends to it, on or paused: refused too (55000, hint
  -- 'lists', the count of both as its detail), until each goes to someone
  -- else, so no list of a template is left for nobody, or for the whole base
  -- in its place. A list already sent to it stays as it was.
  select count(*)::integer into sending
  from public.list_templates t
  where t.recipient_named_role = role_id
    and t.archived_at is null;
  sending := sending + (
    select count(*)::integer
    from public.list_schedules ls
    join public.list_templates t
      on t.id = ls.template_id and t.business_id = ls.business_id
    where ls.recipient_named_role = role_id
      and t.archived_at is null
  );
  if sending > 0 then
    raise exception 'Lists go to the role' using errcode = '55000', hint = 'lists', detail = sending::text;
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
-- Who may call what

-- The workers run inside the doors above, as their owner. New functions get
-- EXECUTE for PUBLIC, and anon and authenticated have USAGE on private; the
-- secret key goes through the doors too, never around them.
revoke execute on function
  private.import_invites(uuid, uuid, public.member_role, jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function
  private.undo_import(uuid, uuid, public.member_role, uuid)
  from public, anon, authenticated, service_role;

-- With the secret key only.
revoke execute on function public.team_import_people(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.team_import_people(uuid, uuid, jsonb) to service_role;
revoke execute on function public.admin_import_people(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_import_people(uuid, uuid, jsonb) to service_role;
revoke execute on function public.team_import_undo(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.team_import_undo(uuid, uuid, uuid) to service_role;
revoke execute on function public.admin_import_undo(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_import_undo(uuid, uuid, uuid) to service_role;
