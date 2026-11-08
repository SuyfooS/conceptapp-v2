-- What the security check of 8 November 2026 found in the database (issue
-- #80; Orel's decisions on #1):
--
--   demo businesses  take no invites, and nobody joins one. Anyone at the
--                    demo door can act as their owner, so an invite from one
--                    would text a real number and pull a real person in. The
--                    local seed opens its demo businesses to invites
--                    ("invites": true in their definition) so the browser
--                    tests can invite; the hosted ones are never opened.
--   the owner role   the console gives it only to a business with no active
--                    owner; a second owner is invited by an owner. An owner
--                    invite nobody may claim any more reads as expired.
--   sign-in codes    each code sent or checked is counted, per number and per
--                    caller (the address it came from, hashed), against the
--                    limits in private.auth_limits. The server asks first, and
--                    gives a try back when the auth server sent nothing for its
--                    own short wait. This covers the app's own way in; the auth
--                    API called directly is held by Supabase's and Twilio's
--                    limits, and CAPTCHA once it is on.
--   own hours        a manager or clock.edit holder still records and
--                    corrects their own hours, but those times are marked
--                    'self', for an owner to confirm. A code from a station
--                    the person paired counts the same way. A corrected time
--                    no longer keeps the 'scan' or 'typed' proof of the time
--                    it replaced: it is 'manager', what a manager set.
--   typed codes      each guess is counted on its own: checking one needs an
--                    attempt counted for that same guess in the last minute.
--   code settings    requirePunchCode and codeDisplay change only by an owner
--                    or the ConceptApp team.
--   phones           members read their colleagues' names, not their numbers:
--                    managers get them from team_phones, and everyone their
--                    own from own_phone.
--   photos           Storage takes photos from the server only.
--
-- The invite functions now run as their owner (security definer), like the
-- other server functions, so they can use the private helpers; they are still
-- for the secret key only.

-- An active owner of the business.
create function private.is_active_owner(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = person and m.active and m.role = 'owner'
  )
$$;

revoke execute on function private.is_active_owner(uuid, uuid) from public;

------------------------------------------------------------------------------
-- Demo businesses and the owner role

-- A demo business takes no invites, unless its definition opens it.
create function private.closed_to_invites(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.demo_businesses d
    where d.business_id = business
      and d.definition -> 'invites' is distinct from 'true'::jsonb
  )
$$;

revoke execute on function private.closed_to_invites(uuid) from public;

-- Nobody may claim this invite: its business takes no invites, or it makes an
-- owner of a business that has one, and no owner sent it.
create function private.invite_closed(
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
$$;

revoke execute on function private.invite_closed(uuid, public.member_role, uuid) from public;

-- Visitors' invites in the hosted demo businesses go, and so does anyone who
-- joined one through them: such a business is put back the way it starts.
delete from public.invites i
where i.claimed_at is null and private.closed_to_invites(i.business_id);

select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where private.closed_to_invites(d.business_id)
  and exists (
    select 1 from public.memberships m
    where m.business_id = d.business_id
      and not exists (
        select 1
        from jsonb_to_recordset(d.definition -> 'people') as person (user_id uuid)
        where person.user_id = m.user_id
      )
  );

-- Invite a number to the actor's business (20261024000100_team_invites.sql),
-- never to a demo business.
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

  if actor_role is null or actor_role > 'manager'
    or invite_role is null or invite_role < actor_role then
    raise exception 'Not allowed to invite this role' using errcode = '42501';
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

-- A fresh link from the Team screen, never in a demo business. Whoever sends
-- it now stands behind the invite, as with team_invite: an owner's link for an
-- owner invite the console sent can be claimed.
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

  if actor_role is null or actor_role > 'manager' or inv.role < actor_role then
    raise exception 'Not allowed to send this invite' using errcode = '42501';
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

-- The console invites a number (20261107000900_console_people.sql): never to
-- a demo business, and as an owner only while the business has none.
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

-- A fresh link from the console (20261022000100_invite_links.sql): not in a
-- demo business, nor for an owner invite nobody may claim any more.
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

  if private.invite_closed(inv.business_id, inv.role, inv.invited_by) then
    raise exception 'The business has an owner, who invites another' using errcode = '23P01';
  end if;

  update public.invites i
  set token_hash = new_token_hash,
    expires_at = now() + interval '14 days'
  where i.id = inv.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (inv.business_id, actor, 'invite.send', jsonb_build_object('invite', inv.id));

  return inv.phone;
end;
$$;

-- What the join screen shows for a link: an invite nobody may claim any more
-- reads as expired, so the screen asks for a new one and sends no code.
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
        or private.invite_closed(i.business_id, i.role, i.invited_by) then 'expired'
      else 'open'
    end
  )
  from public.invites i
  join public.businesses b on b.id = i.business_id
  where i.token_hash = invite_by_token.token_hash;
$$;

-- Joining from a link, as before, unless nobody may claim the invite any more.
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

  if inv.id is null or inv.claimed_at is not null or inv.expires_at <= now()
    or private.invite_closed(inv.business_id, inv.role, inv.invited_by) then
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

------------------------------------------------------------------------------
-- Sign-in codes

-- How many codes one number, or one caller, may send or check in a window.
-- The ConceptApp team tunes these; the local seed lifts them for the tests.
create table private.auth_limits (
  kind text not null check (kind in ('send', 'verify')),
  scope text not null check (scope in ('phone', 'caller')),
  max_count integer not null check (max_count > 0),
  per interval not null check (per > interval '0 seconds' and per <= interval '1 day'),
  primary key (kind, scope)
);

insert into private.auth_limits (kind, scope, max_count, per)
values
  ('send', 'phone', 5, interval '15 minutes'),
  ('send', 'caller', 20, interval '15 minutes'),
  ('verify', 'phone', 10, interval '15 minutes'),
  ('verify', 'caller', 40, interval '15 minutes');

-- Codes sent and checked: by a hash of the number or the caller, so the table
-- holds no numbers or addresses. Kept for a day.
create table private.auth_attempts (
  kind text not null,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz not null
);

create index auth_attempts_key_idx on private.auth_attempts (kind, key_hash, at);
create index auth_attempts_at_idx on private.auth_attempts (at);

alter table private.auth_limits enable row level security;
alter table private.auth_attempts enable row level security;
revoke all on private.auth_limits, private.auth_attempts from public, anon, authenticated;

-- Count a code sent ('send') or checked ('verify') for `phone` and for
-- `caller` (either may be null), unless one of them is at its limit. Returns
-- 0 when it was counted, else the seconds until it may be. A refused try is
-- not counted, so a limit lifts on its own.
create function public.note_auth_attempt(
  kind text,
  phone text,
  caller text,
  at_time timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  scopes text[] := '{}'::text[];
  keys text[] := '{}'::text[];
  lim private.auth_limits%rowtype;
  freed timestamptz;
  wait integer := 0;
begin
  if kind is null or kind not in ('send', 'verify') then
    raise exception 'Unknown kind of attempt: %', kind using errcode = '22023';
  end if;

  if nullif(btrim(phone), '') is not null then
    scopes := scopes || 'phone'::text;
    keys := keys || encode(sha256(convert_to('phone:' || btrim(phone), 'UTF8')), 'hex');
  end if;
  if nullif(btrim(caller), '') is not null then
    scopes := scopes || 'caller'::text;
    keys := keys || encode(sha256(convert_to('caller:' || btrim(caller), 'UTF8')), 'hex');
  end if;

  delete from private.auth_attempts a where a.at < at_time - interval '1 day';

  for i in 1 .. coalesce(array_length(keys, 1), 0) loop
    -- One count at a time per number or caller, so tries sent at once all
    -- meet the limit.
    perform pg_advisory_xact_lock(
      hashtextextended('auth_attempt:' || note_auth_attempt.kind || ':' || keys[i], 0));

    select * into lim from private.auth_limits l
    where l.kind = note_auth_attempt.kind and l.scope = scopes[i];
    if found then
      -- The try whose expiry frees a place, when the window is full.
      select a.at into freed
      from private.auth_attempts a
      where a.kind = note_auth_attempt.kind and a.key_hash = keys[i]
        and a.at > at_time - lim.per and a.at <= at_time
      order by a.at desc
      offset lim.max_count - 1
      limit 1;
      if freed is not null then
        wait := greatest(wait, ceil(extract(epoch from (freed + lim.per - at_time)))::integer);
      end if;
    end if;
  end loop;

  if wait > 0 then
    return wait;
  end if;

  insert into private.auth_attempts (kind, key_hash, at)
  select note_auth_attempt.kind, k.key_hash, at_time
  from unnest(keys) as k (key_hash);

  return 0;
end;
$$;

revoke execute on function public.note_auth_attempt(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.note_auth_attempt(text, text, text, timestamptz) to service_role;

-- Give back a try that sent nothing (the auth server refused it for its own
-- short wait), by the time it was counted at.
create function public.forget_auth_attempt(
  kind text,
  phone text,
  caller text,
  at_time timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.auth_attempts a
  where a.kind = forget_auth_attempt.kind
    and a.at = at_time
    and a.key_hash in (
      encode(sha256(convert_to('phone:' || btrim(coalesce(phone, '')), 'UTF8')), 'hex'),
      encode(sha256(convert_to('caller:' || btrim(coalesce(caller, '')), 'UTF8')), 'hex')
    );
end;
$$;

revoke execute on function public.forget_auth_attempt(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.forget_auth_attempt(text, text, text, timestamptz) to service_role;

------------------------------------------------------------------------------
-- Own hours, corrections and typed codes

-- Two more ways a time can rest: 'manager', set by a manager (adding or
-- correcting it), and 'self', set by the person themselves, as a manager or
-- clock.edit holder, or from a station they paired, for an owner to confirm.
alter table public.time_entries
  drop constraint time_entries_in_proof_check,
  drop constraint time_entries_out_proof_check,
  add constraint time_entries_in_proof_check
    check (in_proof in ('scan', 'typed', 'none', 'owner', 'off', 'manager', 'self')),
  add constraint time_entries_out_proof_check
    check (out_proof in ('scan', 'typed', 'none', 'owner', 'off', 'manager', 'self'));

-- Entries with a time somebody still confirms: one made without a code, or
-- one the person set for themselves.
drop index public.time_entries_without_code_idx;
create index time_entries_to_confirm_idx on public.time_entries (business_id)
  where in_proof in ('none', 'self') or out_proof in ('none', 'self');

-- Each typed attempt keeps its guess (the digits' hash).
alter table private.punch_attempts
  add column guess text check (guess ~ '^[0-9a-f]{64}$');

-- The proof of a punch (20261108000200_qr_clock.sql), with two changes: a
-- typed code needs an attempt counted for that same guess, and a code from a
-- station the person paired is 'self'.
create or replace function private.check_punch(
  business uuid,
  person uuid,
  code_hash text,
  short_hash text,
  without_code boolean,
  at_time timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.punch_codes%rowtype;
  typed boolean := false;
begin
  perform private.check_time_clock_on(business);

  if not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = person and m.active
  ) then
    raise exception 'Only active members of the business can punch' using errcode = '42501';
  end if;

  if not coalesce(private.clock_setting(business, 'requirePunchCode')::boolean, false) then
    return jsonb_build_object('proof', 'off');
  end if;

  if private.is_active_owner(business, person) then
    return jsonb_build_object('proof', 'owner');
  end if;

  if coalesce(without_code, false) then
    return jsonb_build_object('proof', 'none');
  end if;

  if check_punch.code_hash is not null then
    select * into c from public.punch_codes pc
    where pc.code_hash = check_punch.code_hash
      and pc.business_id = business
      and pc.expires_at > at_time
      and pc.created_at <= at_time;
  elsif check_punch.short_hash is not null then
    typed := true;
    -- This very guess was counted before this call, in its own
    -- (note_punch_attempt): each guess meets the limit.
    if not exists (
      select 1 from private.punch_attempts a
      where a.business_id = business and a.user_id = person
        and a.guess = check_punch.short_hash
        and a.at > at_time - interval '1 minute' and a.at <= at_time
    ) then
      raise exception 'A typed code is counted first' using errcode = '42501';
    end if;
    if (
      select count(*) from private.punch_attempts a
      where a.business_id = business and a.user_id = person
        and a.at > at_time - interval '30 minutes' and a.at <= at_time
    ) > 5 then
      raise exception 'Too many wrong codes; scan instead' using errcode = '28000';
    end if;
    select * into c from public.punch_codes pc
    where pc.short_hash = check_punch.short_hash
      and pc.business_id = business
      and pc.expires_at > at_time
      and pc.created_at <= at_time;
  end if;

  if c.code_hash is null then
    raise exception 'The punch code is missing or expired' using errcode = '28000';
  end if;

  if c.issued_by = person then
    raise exception 'A code you showed yourself does not count' using errcode = '28000';
  end if;

  -- A station the person paired vouches for nobody's hours but an owner's.
  if exists (
    select 1 from public.clock_stations s
    where s.id = c.station_id and s.created_by = person
  ) then
    return jsonb_build_object('proof', 'self', 'station', c.station_id, 'typed', typed);
  end if;

  return jsonb_build_object(
    'proof', case when typed then 'typed' else 'scan' end,
    'station', c.station_id,
    'issuer', c.issued_by
  );
end;
$$;

-- Count a typed code, with its guess, before it is checked
-- (20261108000200_qr_clock.sql). Returns whether typing is blocked now.
drop function public.note_punch_attempt(uuid, uuid, timestamptz);

create function public.note_punch_attempt(
  actor uuid,
  business uuid,
  short_hash text,
  at_time timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent int;
begin
  if not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = actor and m.active
  ) then
    raise exception 'Only active members of the business can punch' using errcode = '42501';
  end if;

  if short_hash is null or short_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Code hash must be 64 hex digits' using errcode = '22023';
  end if;

  delete from private.punch_attempts a
  where a.user_id = actor and a.at < at_time - interval '1 day';

  -- One person's attempts are counted one at a time, so attempts sent at
  -- once can't both miss, or both write, the block's log row.
  perform pg_advisory_xact_lock(
    hashtextextended('punch_attempt:' || business::text || ':' || actor::text, 0));

  insert into private.punch_attempts (business_id, user_id, at, guess)
  values (business, actor, at_time, short_hash);

  select count(*) into recent from private.punch_attempts a
  where a.business_id = business and a.user_id = actor
    and a.at > at_time - interval '30 minutes' and a.at <= at_time;

  if recent = 6 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (business, actor, 'clock.code.locked', jsonb_build_object('person', actor));
  end if;

  return recent > 5;
end;
$$;

revoke execute on function public.note_punch_attempt(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.note_punch_attempt(uuid, uuid, text, timestamptz) to service_role;

-- Clocking in and out (20261108000200_qr_clock.sql), as before, but a typed
-- code that worked clears the count also when it came from a station the
-- person paired (proof 'self', typed).
create or replace function public.clock_in(
  actor uuid,
  business uuid,
  code_hash text default null,
  at_time timestamptz default now(),
  short_hash text default null,
  without_code boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid;
  proof jsonb;
begin
  proof := private.check_punch(business, actor, code_hash, short_hash, without_code, at_time);

  if exists (
    select 1 from public.time_entries e
    where e.business_id = business and e.user_id = actor and e.clock_out is null
  ) then
    raise exception 'Already clocked in' using errcode = '23P01';
  end if;

  insert into public.time_entries (business_id, user_id, clock_in, in_proof, in_station)
  values (business, actor, at_time, proof ->> 'proof', (proof ->> 'station')::uuid)
  returning id into entry_id;

  if proof ->> 'proof' = 'typed' or proof ->> 'typed' = 'true' then
    delete from private.punch_attempts a where a.business_id = business and a.user_id = actor;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.in', jsonb_build_object('entry', entry_id, 'proof', proof));

  return entry_id;
end;
$$;

create or replace function public.clock_out(
  actor uuid,
  business uuid,
  code_hash text default null,
  at_time timestamptz default now(),
  short_hash text default null,
  without_code boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  proof jsonb;
begin
  proof := private.check_punch(business, actor, code_hash, short_hash, without_code, at_time);

  select * into e from public.time_entries t
  where t.business_id = business and t.user_id = actor and t.clock_out is null
  for update;
  if not found then
    raise exception 'Not clocked in' using errcode = '55000';
  end if;

  if at_time <= e.clock_in then
    raise exception 'An entry must end after it starts' using errcode = '22023';
  end if;

  if at_time - e.clock_in > interval '24 hours' then
    raise exception 'Open for more than 24 hours; a manager corrects it'
      using errcode = '55000';
  end if;

  -- Leaving without a code needs its own confirmation: one made before the
  -- clock-out does not cover it (see confirm_time_entry).
  update public.time_entries
  set clock_out = at_time,
    out_proof = proof ->> 'proof',
    out_station = (proof ->> 'station')::uuid
  where id = e.id;

  if proof ->> 'proof' = 'typed' or proof ->> 'typed' = 'true' then
    delete from private.punch_attempts a where a.business_id = business and a.user_id = actor;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.out', jsonb_build_object('entry', e.id, 'proof', proof));

  return e.id;
end;
$$;

-- A manager adds an entry (20261107000100_time_clock.sql). Its times are
-- 'manager', or 'self' when it is the actor's own and they are no owner.
create or replace function public.add_time_entry(
  actor uuid,
  business uuid,
  person uuid,
  new_clock_in timestamptz,
  new_clock_out timestamptz,
  note text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid;
  proof text;
begin
  perform private.check_time_clock_on(business);

  if not private.can_edit_clock(business, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = person
  ) then
    raise exception 'Not a member of the business' using errcode = '42501';
  end if;

  perform private.check_entry_times(new_clock_in, new_clock_out, at_time);

  proof := case
    when person = actor and not private.is_active_owner(business, actor) then 'self'
    else 'manager'
  end;

  insert into public.time_entries (
    business_id, user_id, clock_in, clock_out, source, note, edited_by, edited_at,
    in_proof, out_proof
  )
  values (
    business, person, new_clock_in, new_clock_out, 'manager',
    nullif(btrim(note), ''), actor, at_time,
    proof, case when new_clock_out is null then null else proof end
  )
  returning id into entry_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'clock.add',
    jsonb_build_object('entry', entry_id, 'person', person,
      'clock_in', new_clock_in, 'clock_out', new_clock_out, 'proof', proof)
  );

  return entry_id;
end;
$$;

-- A manager changes an entry's times (20261107000400_clock_corrections.sql).
-- A time that moves rests on whoever moved it: 'manager', or 'self' when the
-- entry is the actor's own, or was already 'self', and they are no owner. Its
-- station goes, and a time newly 'self' takes the confirmation away.
create or replace function public.correct_time_entry(
  actor uuid,
  entry uuid,
  new_clock_in timestamptz,
  new_clock_out timestamptz default null,
  note text default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  by_owner boolean;
  in_moved boolean;
  out_moved boolean;
  new_in_proof text;
  new_out_proof text;
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if new_clock_out is null and e.clock_out is not null then
    raise exception 'An entry that ended needs an end' using errcode = '22023';
  end if;

  perform private.check_entry_times(new_clock_in, new_clock_out, at_time);

  if new_clock_out is null and at_time - new_clock_in > interval '24 hours' then
    raise exception 'An entry is at most 24 hours' using errcode = '22023';
  end if;

  by_owner := private.is_active_owner(e.business_id, actor);
  in_moved := new_clock_in is distinct from e.clock_in;
  out_moved := new_clock_out is distinct from e.clock_out;

  new_in_proof := case
    when not in_moved then e.in_proof
    when by_owner then 'manager'
    when e.user_id = actor or e.in_proof = 'self' then 'self'
    else 'manager'
  end;
  new_out_proof := case
    when not out_moved then e.out_proof
    when by_owner then 'manager'
    when e.user_id = actor or e.out_proof = 'self' then 'self'
    else 'manager'
  end;

  update public.time_entries
  set clock_in = new_clock_in,
    clock_out = new_clock_out,
    note = coalesce(nullif(btrim(correct_time_entry.note), ''), time_entries.note),
    edited_by = actor,
    edited_at = at_time,
    in_proof = new_in_proof,
    out_proof = new_out_proof,
    in_station = case when in_moved then null else time_entries.in_station end,
    out_station = case when out_moved then null else time_entries.out_station end,
    confirmed_by = case
      when (in_moved and new_in_proof = 'self') or (out_moved and new_out_proof = 'self')
        then null
      else time_entries.confirmed_by
    end,
    confirmed_at = case
      when (in_moved and new_in_proof = 'self') or (out_moved and new_out_proof = 'self')
        then null
      else time_entries.confirmed_at
    end
  where id = entry;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    e.business_id, actor, 'clock.correct',
    jsonb_build_object('entry', entry, 'person', e.user_id,
      'from', jsonb_build_object('clock_in', e.clock_in, 'clock_out', e.clock_out),
      'to', jsonb_build_object('clock_in', new_clock_in, 'clock_out', new_clock_out),
      'proof', jsonb_build_object('in', new_in_proof, 'out', new_out_proof))
  );
end;
$$;

-- A manager confirms an entry (20261108000200_qr_clock.sql): one made without
-- a code, or one somebody set for themselves, which only an owner confirms.
-- Never one's own, unless one is an owner.
create or replace function public.confirm_time_entry(
  actor uuid,
  entry uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  by_owner boolean;
  arrival_open boolean;
  departure_open boolean;
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  by_owner := private.is_active_owner(e.business_id, actor);

  if e.user_id = actor and not by_owner then
    raise exception 'Someone else confirms your own hours' using errcode = '42501';
  end if;

  if coalesce(e.in_proof, '') not in ('none', 'self')
    and coalesce(e.out_proof, '') not in ('none', 'self') then
    raise exception 'Only an entry made without a code needs confirming' using errcode = '55000';
  end if;

  -- What is left to confirm: the arrival, until confirmed, and a departure
  -- that came after the last confirmation.
  arrival_open := coalesce(e.in_proof, '') in ('none', 'self') and e.confirmed_at is null;
  departure_open := coalesce(e.out_proof, '') in ('none', 'self')
    and coalesce(e.confirmed_at is null or e.confirmed_at < e.clock_out, false);

  if not (arrival_open or departure_open) then
    return;
  end if;

  if ((arrival_open and e.in_proof = 'self') or (departure_open and e.out_proof = 'self'))
    and not by_owner then
    raise exception 'Only an owner confirms hours someone set for themselves' using errcode = '42501';
  end if;

  update public.time_entries set confirmed_by = actor, confirmed_at = at_time where id = entry;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (e.business_id, actor, 'clock.confirm',
    jsonb_build_object('entry', entry, 'person', e.user_id));
end;
$$;

------------------------------------------------------------------------------
-- The punch code settings

-- Saving a module's settings (20261107000500_module_settings.sql), with one
-- more check: whether the time clock needs a code, and where codes show, are
-- for an owner or the ConceptApp team, whatever the manifest says.
create or replace function public.set_module_settings(
  actor uuid,
  business uuid,
  module public.module_key,
  patch jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old jsonb;
begin
  if not private.can_edit_settings(business, actor) then
    raise exception 'Managers, owners and the team only' using errcode = '42501';
  end if;

  if jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'Settings must be an object' using errcode = '22023';
  end if;

  if module = 'time_clock' and patch ?| array['requirePunchCode', 'codeDisplay'] then
    if not private.is_active_owner(business, actor)
      and not exists (select 1 from public.platform_staff s where s.user_id = actor) then
      raise exception 'Only an owner or the team changes the punch code' using errcode = '42501';
    end if;
    if (patch ? 'requirePunchCode'
        and jsonb_typeof(patch -> 'requirePunchCode') is distinct from 'boolean')
      or (patch ? 'codeDisplay'
        and (patch -> 'codeDisplay') not in ('"station"'::jsonb, '"manager"'::jsonb, '"both"'::jsonb))
    then
      raise exception 'Not a punch code setting' using errcode = '22023';
    end if;
  end if;

  -- A module added after this business was set up has no row yet. It starts off.
  insert into public.business_modules (business_id, module_key, enabled)
  values (business, module, false)
  on conflict (business_id, module_key) do nothing;

  select bm.settings into old
  from public.business_modules bm
  where bm.business_id = business and bm.module_key = module
  for update;

  update public.business_modules bm
  set settings = old || patch
  where bm.business_id = business and bm.module_key = module;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'module.settings',
    jsonb_build_object(
      'module', module,
      'from', (
        select coalesce(jsonb_object_agg(field, old -> field), '{}'::jsonb)
        from jsonb_object_keys(patch) as field
      ),
      'to', patch
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- Phones

-- Colleagues' names and photos, not their numbers.
revoke select on public.profiles from authenticated;
grant select (id, full_name, locale, avatar_path, created_at, updated_at)
  on public.profiles to authenticated;

-- The numbers of a business's active members, for its owners and managers
-- (and the ConceptApp team viewing it as one): the Team screen's.
create function public.team_phones(business uuid)
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
    and (private.has_role(team_phones.business, 'manager')
      or private.is_viewing(team_phones.business, 'manager'))
$$;

revoke execute on function public.team_phones(uuid) from public, anon;
grant execute on function public.team_phones(uuid) to authenticated;

-- The signed-in person's own number.
create function public.own_phone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.phone from public.profiles p where p.id = (select auth.uid())
$$;

revoke execute on function public.own_phone() from public, anon;
grant execute on function public.own_phone() to authenticated;

------------------------------------------------------------------------------
-- Photos

-- The server uploads, replaces and removes photos (@db/profile-photos) after
-- checking them; the browser only reads.
drop policy "people upload their own photo" on storage.objects;
drop policy "people replace their own photo" on storage.objects;
drop policy "people remove their own photo" on storage.objects;
