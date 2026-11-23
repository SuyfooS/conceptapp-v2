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
--   the name    the invite's, read as public.set_member_name reads a name
--               (one line, its spaces collapsed). Their own name keeps no
--               row (one kept from an earlier time in the business goes); a
--               name with a control character, which no screen writes,
--               keeps none either, so a join never fails over a name; an
--               invite with no name leaves what the business had for them.
--               The invite's own check holds the length (1 to 80, before
--               collapsing).
--   locks       the invite, the named role, the membership, the profile, as
--               before, then the business's name for them: after the
--               membership, as public.set_member_name takes them, so the two
--               never wait on each other in a circle.
--   the log     invite.claim as before, never a name.
--   nothing else changes: who may join, the refusals, the return. No table,
--   column or signature, so packages/db/database.types.ts stays as it is.

-- 20261115001600_named_roles_give.sql's, the same, with the invite's name
-- written as the business's own name for the claimant (public.member_names),
-- unless it is their own. No caller in the database; the join screen calls
-- it with the secret key (claimInvite in @db/invites).
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

  update public.profiles
  set full_name = btrim(inv.full_name)
  where id = claimant and full_name is null and inv.full_name is not null;

  -- The invite's name, as the business's own for them, read as
  -- public.set_member_name reads one: none for their own name (the profile
  -- just above is seen here), and none for a name the table wouldn't keep.
  kept := nullif(btrim(regexp_replace(coalesce(inv.full_name, ''::text), '\s+', ' ', 'g')), ''::text);
  if kept is not null and kept !~ '[[:cntrl:]]' then
    select nullif(btrim(regexp_replace(coalesce(p.full_name, ''::text), '\s+', ' ', 'g')), ''::text)
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

comment on table public.member_names is
  'The name a business shows for someone on its team, over their own (profiles.full_name), in that business only. Written only by public.set_member_name and, from an invite''s name, public.claim_invite; read as the person''s profile is read, per business (private.reads_member_name).';

revoke execute on function public.claim_invite(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_invite(text, uuid) to service_role;
