-- Joining another business (docs/ROADMAP.md, known issue 20): someone who
-- already had a name of their own, from another business or an earlier
-- time, came in with it and not with the invite's, so the business called
-- them by a name it never chose. Now the invite's name becomes the
-- business's own name for them (public.member_names,
-- 20261117000700_member_names.sql), as a fix from /team/[person] would be:
-- shown everywhere in that business, to them too, and nowhere else. Their own
-- name (profiles.full_name) stays theirs; someone with none still takes the
-- invite's, as before.
--
--   the name    the invite's, as the app keeps a name (parseTeamName in
--               @domain/team, and private.team_name below): what nobody sees
--               dropped, its letters composed, its spaces collapsed. Not
--               every invite's name came through that rule (the console's
--               staff list keeps what was pasted, and invites sent before
--               this last 14 days), and an own name may hold what an earlier
--               claim copied into it, so both are read that way before they
--               are compared, and the name written is the clean one. A
--               character nobody sees never stops a join, never makes a row
--               for their own name, and never leaves an old row in place.
--               Their own name keeps no row (one kept from an earlier time in
--               the business goes); an invite with no name to keep leaves
--               what the business had for them. Someone with no name takes
--               the same clean name as their own (before, it was only
--               trimmed).
--   an owner    keeps none of the business's: an owner's name there is their
--               own, which they change on /me. Only another owner could
--               change one (public.set_member_name never takes oneself), and
--               the console opens every business with a single owner, by an
--               invite the ConceptApp team named, so the name would stay as
--               typed for good. One kept from an earlier time goes too. The
--               rule is the role, not whether another owner is there today:
--               that one may leave, and the name would be stuck again. So it
--               holds wherever someone becomes an owner, not only here: a
--               member made an owner (public.set_member_role; an owner gives
--               the role) loses the business's name for them as well, by a
--               trigger on public.memberships. The claim keeps its own
--               delete, for someone who comes back as an owner, whose role
--               doesn't change. Nor does the team's fix give an owner one:
--               public.set_member_name refuses an owner (42501, hint
--               `owner`), another owner's fix included, so an owner always
--               appears by their own name. Any kept for an owner on a team
--               before this goes, once (section 5).
--   fixing one  public.set_member_name, the team's fix on /team/[person],
--               decides whether a name is their own as the claim does: both
--               read by private.team_name. An own name that still holds
--               what nobody sees is then their own written clean, so saving
--               it from the screen keeps no row, and the undo of a fix, which
--               the app sends clean, takes the row away. Before, either wrote
--               a row for their own name that nothing could take back, and
--               every rename of theirs on /me stopped short of the business.
--               It never takes an owner (above).
--   locks       the invite, the named role, the membership, the profile, as
--               before, then the business's name for them; for someone the
--               claim makes an owner, the trigger takes the name just after
--               the membership. Always after the membership, as
--               public.set_member_name and public.set_member_role take them,
--               so none of them waits on another in a circle.
--   the log     invite.claim as before, never a name; a role change logs
--               member.role as before, and nothing more for the name.
--   nothing else changes: who may join, the refusals, the return, who may
--   fix a name (but an owner's, which nobody does now) or change a role and
--   what each answers. No table, column or signature in public, so
--   packages/db/database.types.ts stays as it is.

------------------------------------------------------------------------------
-- 1. A name as the app keeps one

-- parseTeamName's rule (@domain/team), for a name that didn't come through
-- the app: what nobody sees dropped (control characters but spaces, format
-- and default-ignorable characters, the braille blank; not the joiners and
-- variation selectors an emoji or a script is drawn with), its letters
-- composed (NFC), every kind of space collapsed into one, a joiner or a
-- selector at a word's edge, where it joins nothing, dropped, and the ends
-- trimmed. Null for nothing left, or for more than 80 characters (a letter
-- NFC spells in two can make it longer). The app also calls a name of
-- nothing but marks none, which no rule here tells; no screen writes one.
-- Postgres has no Unicode classes, so each set is listed by code point, and
-- tooling/team-names.test.ts keeps every list equal to the app's (U+0000,
-- which no text holds, aside). Its callers: public.claim_invite and
-- public.set_member_name, below.
create function private.team_name(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(cleaned.name) between 1 and 80 then cleaned.name end
  from (
    select btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            btrim(
              regexp_replace(
                normalize(
                  regexp_replace(
                    coalesce(value, ''::text),
                    '[\x0001-\x0008\x000E-\x001F\x007F-\x009F\x00AD\x034F\x0600-\x0605\x061C\x06DD\x070F\x0890\x0891\x08E2\x115F\x1160\x17B4\x17B5\x180E\x200B\x200E\x200F\x202A-\x202E\x2060-\x206F\x2800\x3164\xFFA0\xFFF0-\xFFFB\x110BD\x110CD\x13430-\x1343F\x1BCA0-\x1BCA3\x1D173-\x1D17A\xE0000-\xE00FF\xE01F0-\xE0FFF]',
                    ''::text, 'g'
                  ),
                  NFC
                ),
                '[\x0009-\x000D\x0020\x00A0\x1680\x2000-\x200A\x2028\x2029\x202F\x205F\x3000\xFEFF]+',
                ' '::text, 'g'
              ),
              ' '::text
            ),
            '(^| )[\x180B-\x180D\x180F\x200C\x200D\xFE00-\xFE0F\xE0100-\xE01EF]+',
            '\1'::text, 'g'
          ),
          '[\x200C\x200D]+( |$)',
          '\1'::text, 'g'
        ),
        ' {2,}', ' '::text, 'g'
      ),
      ' '::text
    ) as name
  ) as cleaned
$$;

------------------------------------------------------------------------------
-- 2. Joining by it

-- 20261115001600_named_roles_give.sql's, the same, with the invite's name
-- read as the app keeps names: their own when they have none, as before but
-- clean, and else written as the business's own name for the claimant
-- (public.member_names), unless it is their own or they join as an owner.
-- No caller in the database; the join screen calls it with the secret key
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
  own_name text;
  kept text;
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

  -- The invite's name as the app keeps names; null for none to keep.
  kept := private.team_name(inv.full_name);

  update public.profiles
  set full_name = kept
  where id = claimant and full_name is null and kept is not null;

  -- The business's own name for them: none for an owner, whose name there is
  -- their own (one whose role just became the owner's lost it to the
  -- trigger below already); none for their own name, read the same way (the
  -- profile just above is seen here). Either way, one kept from an earlier
  -- time goes.
  if inv.role = 'owner'::public.member_role then
    delete from public.member_names n
    where n.business_id = inv.business_id and n.user_id = claimant;
  elsif kept is not null then
    select private.team_name(p.full_name)
    into own_name
    from public.profiles p
    where p.id = claimant;

    if kept is not distinct from own_name then
      delete from public.member_names n
      where n.business_id = inv.business_id and n.user_id = claimant;
    else
      insert into public.member_names (business_id, user_id, name, updated_at)
      values (inv.business_id, claimant, kept, now())
      on conflict (business_id, user_id)
        do update set name = excluded.name, updated_at = excluded.updated_at;
    end if;
  end if;

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
-- 3. Fixing one by the same rule

-- 20261117000700_member_names.sql's, the same, with two changes. An owner
-- is refused, whoever asks (42501, hint `owner`): an owner's name in the
-- business is their own, which they change on /me, and one given by
-- another owner would be stuck once that owner left (canFixName in
-- @domain/team offers no fix for one). And whether the new name is their
-- own is decided as the claim decides it, both read as the app keeps names
-- (private.team_name). An own name that still holds
-- what nobody sees (one an earlier claim copied) is then their own written
-- clean, which keeps no row: saving it from /team/[person] writes nothing,
-- and the undo of a fix, which the app sends through parseTeamName, takes
-- the row away. Their own name as it is stored still makes the name shown
-- (`seen_name` is the name as the screen read it), so it is never a change
-- meanwhile, and it is the name answered when the business keeps none. The
-- same signature, so its grants stay; they are given again all the same.
create or replace function public.set_member_name(
  actor uuid,
  business uuid,
  person uuid,
  new_name text default null,
  seen_name text default null,
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
  own_name text;
  kept text;
  was_kept text;
  seen text;
  shown_before text;
  shown_after text;
begin
  -- One team change at a time in the business.
  perform 1 from public.businesses b where b.id = business for no key update;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or not private.holds_perm(business, actor, 'team.edit'::text) then
    raise exception 'Not allowed to change this name' using errcode = '42501';
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

  -- An owner appears by their own name: the business keeps none for one.
  if target.role = 'owner'::public.member_role then
    raise exception 'An owner keeps their own name' using errcode = '42501', hint = 'owner';
  end if;

  if not private.gives_role(actor_role, target.role) then
    raise exception 'Only an owner changes the name of an accountant or a higher role'
      using errcode = '42501';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business keeps its people' using errcode = '55000', hint = 'demo';
  end if;

  -- Every name as the screens write it: one line, its spaces collapsed.
  kept := nullif(btrim(regexp_replace(coalesce(new_name, ''::text), '\s+', ' ', 'g')), ''::text);
  if kept is not null and (char_length(kept) > 80 or kept ~ '[[:cntrl:]]') then
    raise exception 'A name is one line of 1 to 80 characters'
      using errcode = '22023', hint = 'name';
  end if;
  seen := nullif(btrim(regexp_replace(coalesce(seen_name, ''::text), '\s+', ' ', 'g')), ''::text);

  select nullif(btrim(regexp_replace(coalesce(p.full_name, ''::text), '\s+', ' ', 'g')), ''::text)
  into own_name
  from public.profiles p
  where p.id = person;

  select n.name into was_kept
  from public.member_names n
  where n.business_id = business and n.user_id = person
  for update;

  shown_before := coalesce(was_kept, own_name);
  if seen is distinct from shown_before then
    raise exception 'The name changed meanwhile' using errcode = '40001';
  end if;

  -- Their own name, both read as the app keeps names: the business keeps
  -- none of its own.
  if private.team_name(kept) is not distinct from private.team_name(own_name) then
    kept := null;
  end if;
  shown_after := coalesce(kept, own_name);

  if kept is distinct from was_kept then
    if kept is null then
      delete from public.member_names n
      where n.business_id = business and n.user_id = person;
    else
      insert into public.member_names (business_id, user_id, name, updated_at)
      values (business, person, kept, at_time)
      on conflict (business_id, user_id)
        do update set name = excluded.name, updated_at = excluded.updated_at;
    end if;
  end if;

  if shown_after is not distinct from shown_before then
    return jsonb_build_object('changed', false, 'name', shown_after);
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'member.name', jsonb_build_object('person', person));

  return jsonb_build_object('changed', true, 'name', shown_after);
end;
$$;

------------------------------------------------------------------------------
-- 4. Becoming an owner

-- An owner keeps none of the business's names (the header's "an owner"):
-- a member whose role becomes the owner's loses the one it kept for them,
-- whatever made them one (public.set_member_role, where an owner gives the
-- role, or a claim that brings someone back as an owner from another
-- role). After the membership's update, so the name is taken after the
-- membership, as public.set_member_name takes them. Nothing is logged here:
-- the role change is (member.role, invite.claim). It runs as its owner,
-- since only public.set_member_name and public.claim_invite write the table
-- otherwise; no caller but the trigger.
create function private.drop_owner_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.member_names n
  where n.business_id = new.business_id and n.user_id = new.user_id;
  return null;
end;
$$;

create trigger memberships_owner_keeps_no_name
  after update of role on public.memberships
  for each row
  when (new.role = 'owner'::public.member_role and old.role is distinct from new.role)
  execute function private.drop_owner_name();

comment on table public.member_names is
  'The name a business shows for someone on its team, over their own (profiles.full_name), in that business only. Written only by public.set_member_name, never for an owner, and, from an invite''s name, public.claim_invite; none kept for an owner, so one goes when someone becomes an owner (private.drop_owner_name); read as the person''s profile is read, per business (private.reads_member_name).';

------------------------------------------------------------------------------
-- 5. Owners already on a team

-- Once: a name the business kept for an owner on its team before this
-- (another owner's fix, or a role that became the owner's) goes, so every
-- owner appears by their own name, as from now on. Someone who left keeps
-- theirs, as anyone who left does; a claim that brings them back as an
-- owner takes it then. Nothing is logged, as nothing is when a role change
-- drops one.
delete from public.member_names n
using public.memberships m
where m.business_id = n.business_id
  and m.user_id = n.user_id
  and m.active
  and m.role = 'owner'::public.member_role;

------------------------------------------------------------------------------
-- Who may call what

revoke execute on function private.team_name(text) from public, anon, authenticated;
revoke execute on function private.drop_owner_name() from public, anon, authenticated;

revoke execute on function public.claim_invite(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_invite(text, uuid) to service_role;

revoke execute on function public.set_member_name(uuid, uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_member_name(uuid, uuid, uuid, text, text, timestamptz)
  to service_role;
