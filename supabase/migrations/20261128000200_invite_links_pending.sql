-- Who hasn't got a link yet (inviting from a list, part 2; Orel, 25 November
-- 2026: each person's link is made at the moment of sending, and /team keeps
-- "עוד לא קיבלו קישור"). The console's new-business wizard saves its invites
-- with a hash of no token anyone holds, so nobody was ever sent them: until
-- someone makes each one's link there is nothing to send, yet the Team screen
-- read them as "ממתין להצטרפות" and, after 14 days, "פג תוקף" with "קישור
-- חדש". The database now says so.
--
--   the column  invites.link_pending: true while no link was ever made for
--               the invite. Saved so by public.create_business (below) and,
--               later, by the people import; every other writer of a new
--               invite returns its link, and keeps the default false.
--   the past    the invites saved so far with no link, marked once
--               (private.mark_links_pending): every function that ever made
--               a link logs invite.create or invite.send naming the invite
--               (20261022000100_invite_links.sql on), and before those only
--               public.create_business made invites, with no link. The audit
--               log is never changed, and only a demo reset deletes a demo's
--               rows; the hosted demos take no invites and their unclaimed
--               ones went when they were sealed. So the record is complete
--               wherever it is read. On a local database the seed comes after
--               the migrations, and nothing is marked.
--   a new link  clears it, by a trigger (invites_link_given): any new token
--               on an invite nobody claimed is its link made just now. That
--               covers each function that makes one, as each sets token_hash
--               on the open row: public.team_invite_link and
--               public.team_invite (sending to a number with an open invite),
--               public.issue_invite_link and public.admin_invite (the
--               console's), so none of them is redefined here. Cancelling
--               (public.team_invite_cancel) also writes a hash, of no token,
--               but closes the row in the same update (claimed_at), so the
--               flag is left as it was; claiming writes no hash. Nothing sets
--               it back once a link was made.
--   the wizard  public.create_business, the same, with its invites saved as
--               pending.
--   who reads   the invites' policy as before ("the team's viewers read its
--               invites"), whose table grant covers the new column; nothing
--               else changes. @db/team's openInvites reads it (false before
--               this reaches a project), and the Team screen lists those
--               invites under "עוד לא קיבלו קישור", where each one's link is
--               made, sent on WhatsApp or copied, one person at a time. The
--               app sends nothing.
--   the first   public.team_invite_first_link (new): the Team screen's
--   link        "יצירת קישור", public.team_invite_link only while the invite
--               is still pending, so a screen not read again since a link was
--               made elsewhere never replaces the link already sent.
--               public.team_invite_link itself, "קישור חדש", is unchanged.
--   the console public.admin_business gives each person 'link_pending' and
--               never says 'expired' for these, and public.admin_businesses
--               counts them among the open invites, never the expired ones,
--               so the ConceptApp team's screens say what the owners' Team
--               screen says. Its statuses stay the three the code before
--               this reads, so either may reach a project first.

------------------------------------------------------------------------------
-- 1. The column

alter table public.invites
  add column link_pending boolean not null default false;

comment on column public.invites.link_pending is
  'True while no link was ever made for the invite: saved with a hash of no token anyone holds (public.create_business, the console''s new-business wizard). The first new token any function gives it while nobody claimed it clears it (the trigger invites_link_given); nothing sets it back. The Team screen lists these under "עוד לא קיבלו קישור".';

------------------------------------------------------------------------------
-- 2. The invites saved so far with no link

-- Marks every unclaimed invite that no audit row says got a link: each
-- function that makes one logs invite.create or invite.send with the
-- invite's id (20261022000100_invite_links.sql on). Returns how many it
-- marked. Run once, below; nothing calls it after.
create function private.mark_links_pending()
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.invites i
    set link_pending = true
    where i.claimed_at is null
      and not i.link_pending
      and not exists (
        select 1 from public.audit_log a
        where a.business_id = i.business_id
          and a.action in ('invite.create', 'invite.send')
          and a.details ->> 'invite' = i.id::text
      )
    returning 1
  )
  select count(*)::integer from marked
$$;

revoke execute on function private.mark_links_pending()
  from public, anon, authenticated;

select private.mark_links_pending();

------------------------------------------------------------------------------
-- 3. A new link clears it

-- A new token on an invite nobody claimed: its link was just made. A row
-- closed in the same update (a cancel) keeps the flag as it was.
create function private.invite_link_given()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.claimed_at is null and new.token_hash is distinct from old.token_hash then
    new.link_pending := false;
  end if;
  return new;
end;
$$;

revoke execute on function private.invite_link_given()
  from public, anon, authenticated;

create trigger invites_link_given
  before update of token_hash on public.invites
  for each row execute function private.invite_link_given();

------------------------------------------------------------------------------
-- 4. The wizard saves its invites as pending

-- 20261020000100_business_staff.sql's, the same, with each invite saved as
-- pending (link_pending): its hash is of no token anyone holds, so nobody
-- has a link to it until one is made. The same signature, so its grants
-- stay (service_role only). No caller in the database; the console's wizard
-- calls it with the secret key (createBusiness in @db/admin).
create or replace function public.create_business(
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

  -- No link yet: the hash is of no token anyone holds.
  insert into public.invites (
    business_id, phone, role, full_name, token_hash, invited_by, link_pending
  )
  select new_id, p.phone, p.role, btrim(p.name),
    encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
    actor, true
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

------------------------------------------------------------------------------
-- 5. The first link, only while it is the first

-- The Team screen's "יצירת קישור" (SendLinkRow, firstLinkAction): an invite
-- nobody got a link for yet gets its first through public.team_invite_link,
-- unchanged, with every check it makes. Once a link was made for it
-- meanwhile (another device, someone else, the console), link_pending is
-- false and the call is refused, P0002 with hint 'linked', so the link
-- already sent keeps working: a screen read before that never replaces it.
-- The row is locked first, so of two presses at once the second waits for
-- the first and is refused. Only someone who edits that business's team
-- (team.edit there) learns that it has a link; anyone else is refused,
-- 42501, as team_invite_link refuses them. An invite that is no longer open
-- is left to team_invite_link, which says so (P0002, no hint). "קישור חדש"
-- still calls team_invite_link itself, which replaces a link on purpose. No
-- caller in the database; the app calls it with the secret key
-- (issueFirstInviteLink in @db/invites).
create function public.team_invite_first_link(
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
begin
  select * into inv
  from public.invites i
  where i.id = invite and i.claimed_at is null
  for update;

  if inv.id is not null and not inv.link_pending then
    if not private.holds_perm(inv.business_id, actor, 'team.edit'::text) then
      raise exception 'Not allowed to send this invite' using errcode = '42501';
    end if;
    raise exception 'The invite has its link already'
      using errcode = 'P0002', hint = 'linked';
  end if;

  return public.team_invite_link(actor, invite, new_token_hash);
end;
$$;

revoke execute on function public.team_invite_first_link(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.team_invite_first_link(uuid, uuid, text)
  to service_role;

------------------------------------------------------------------------------
-- 6. The console says so too

-- 20261117000700_member_names.sql's, with only this: each person carries
-- 'link_pending' (false for a member), and an invite nobody got a link for
-- yet reads 'invited' whatever its date, never 'expired', and is listed with
-- the open ones. Its status stays one of the three the code before this
-- reads ('member', 'invited', 'expired'; @db/admin parses them with a Zod
-- enum, which a fourth would fail), and that code drops the new key, so the
-- console keeps working whichever comes first, this migration or the code
-- that reads it, and after a rollback of the code alone. @db/admin reads an
-- invited one with link_pending as 'pending'. The console's checklist counts
-- it, as it counts an open one, and the console's own link for it is made as
-- before (the trigger above then clears the flag). The same signature, so its
-- grants stay; they are given again all the same.
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
          'expires_at', p.expires_at, 'link_pending', p.link_pending
        )
        order by p.place, p.role, p.name, p.phone
      )
      from (
        select coalesce(n.name, pr.full_name, '') as name, pr.phone, m.role,
          'member' as status, null::uuid as invite_id,
          null::timestamptz as expires_at, false as link_pending, 0 as place
        from public.memberships m
        join public.profiles pr on pr.id = m.user_id
        left join public.member_names n
          on n.business_id = m.business_id and n.user_id = m.user_id
        where m.business_id = b.id and m.active
        union all
        select coalesce(i.full_name, ''), i.phone, i.role,
          -- Still one of the three statuses the code before this reads.
          case
            when i.link_pending or i.expires_at > now() then 'invited'
            else 'expired'
          end,
          i.id, i.expires_at, i.link_pending,
          case when i.link_pending or i.expires_at > now() then 1 else 2 end
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

revoke execute on function public.admin_business(text) from public, anon;
grant execute on function public.admin_business(text) to authenticated;

-- 20261107000900_console_people.sql's, with only this: an invite nobody got a
-- link for yet is counted among the open ones whatever its date, never among
-- the expired, so the list never says a wizard's business has invites that
-- ran out. The same columns, so it is replaced in place and its grants stay;
-- they are given again all the same.
create or replace function public.admin_businesses()
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
        and (i.link_pending or i.expires_at > now())),
    (select count(*) from public.invites i
      where i.business_id = b.id and i.claimed_at is null
        and not i.link_pending and i.expires_at <= now())
  from public.businesses b
  order by b.created_at desc, b.name;
end;
$$;

revoke execute on function public.admin_businesses() from public, anon;
grant execute on function public.admin_businesses() to authenticated;
