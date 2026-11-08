-- QR clock-in (Orel, 8 November 2026; design in issue #78). On top of the
-- punch codes of 20261107000100_time_clock.sql:
--
--   * a code lives 60 seconds, and carries 6 digits to type beside the QR;
--   * clock stations: a device left at the business that shows codes with no
--     one's account on it. The device asks to be paired, a manager approves
--     from their own phone, and the device's secret becomes the station's
--     token. (Changing the token on every fetch, to catch a copied one, is a
--     follow-up on #78.);
--   * where codes come from is the business's choice (`codeDisplay`: a
--     station, a manager's phone, or both);
--   * nobody uses a code they show themselves, and owners never need one;
--   * someone who can't scan clocks in or out anyway, "without a code": the
--     real time is kept, the entry is marked, and a manager confirms it;
--   * each entry keeps how it was made (scan, typed, without a code, owner,
--     or no code needed), and which station;
--   * five wrong typed codes in 30 minutes block typing for that person;
--     scanning still works. Each attempt is counted before it is checked, in
--     its own call, so attempts sent at once can't slip past the limit.
--
-- Breaks and undoing a clock-out never need a code. The short code's hash is
-- an HMAC the server makes with its own secret, so the table alone can't be
-- reversed into digits.

-- How long a code lives, in one place.
create function private.punch_code_ttl()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '60 seconds' $$;

revoke execute on function private.punch_code_ttl() from public;

-- A time_clock setting, as text, or null.
create function private.clock_setting(business uuid, key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select bm.settings ->> key
  from public.business_modules bm
  where bm.business_id = business and bm.module_key = 'time_clock'
$$;

revoke execute on function private.clock_setting(uuid, text) from public;

-- Stations.
create table public.clock_stations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  -- The device's secret, hashed.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  stopped_at timestamptz,
  stopped_by uuid references public.profiles (id) on delete set null
);

create index clock_stations_business_id_idx on public.clock_stations (business_id, created_at);
create index clock_stations_created_by_idx on public.clock_stations (created_by);
create index clock_stations_stopped_by_idx on public.clock_stations (stopped_by);

alter table public.clock_stations enable row level security;
revoke all on public.clock_stations from anon, authenticated;
-- No token columns: a station's secret is never read.
grant select (id, business_id, name, created_by, created_at, last_seen_at, stopped_at)
  on public.clock_stations to authenticated;

create policy "managers read the business's stations"
  on public.clock_stations for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      private.has_role(business_id, 'manager')
      or private.has_perm(business_id, 'clock.edit')
      or private.is_viewing(business_id, 'manager')
    )
  );

-- A device asking to become a station: what it shows (a QR and 6 digits),
-- and its secret, hashed. Five minutes, then gone. Nobody reads this table.
create table private.station_pairings (
  pairing_hash text primary key check (pairing_hash ~ '^[0-9a-f]{64}$'),
  short_hash text not null unique check (short_hash ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index station_pairings_expires_at_idx on private.station_pairings (expires_at);

-- Codes: the digits beside the QR, and where the code came from.
alter table public.punch_codes
  add column short_hash text check (short_hash ~ '^[0-9a-f]{64}$'),
  add column station_id uuid references public.clock_stations (id) on delete cascade,
  add constraint punch_codes_one_source check (num_nonnulls(issued_by, station_id) <= 1);

create unique index punch_codes_short_idx on public.punch_codes (business_id, short_hash);
create index punch_codes_station_id_idx on public.punch_codes (station_id, created_at);

-- Typed codes tried, per person and business, for the limit.
create table private.punch_attempts (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null
);

create index punch_attempts_idx on private.punch_attempts (business_id, user_id, at);
create index punch_attempts_user_id_idx on private.punch_attempts (user_id);

-- How each entry was made, and who confirmed one made without a code.
alter table public.time_entries
  add column in_proof text check (in_proof in ('scan', 'typed', 'none', 'owner', 'off')),
  add column out_proof text check (out_proof in ('scan', 'typed', 'none', 'owner', 'off')),
  add column in_station uuid references public.clock_stations (id) on delete set null,
  add column out_station uuid references public.clock_stations (id) on delete set null,
  add column confirmed_by uuid references public.profiles (id) on delete set null,
  add column confirmed_at timestamptz,
  -- A confirmer always has a time; the time stays if the confirmer is deleted.
  add constraint time_entries_confirmed check (confirmed_by is null or confirmed_at is not null);

create index time_entries_in_station_idx on public.time_entries (in_station);
create index time_entries_out_station_idx on public.time_entries (out_station);
create index time_entries_confirmed_by_idx on public.time_entries (confirmed_by);
-- Entries with a punch made without a code; one still needs confirming while
-- its arrival is unconfirmed, or its departure came after the confirmation.
create index time_entries_without_code_idx on public.time_entries (business_id)
  where in_proof = 'none' or out_proof = 'none';

-- The proof of a punch, or raise. `code_hash` is the QR's code, `short_hash`
-- the typed digits (one of the two, or neither with `without_code`).
-- Returns {proof, station, issuer}: proof is 'off' when the business needs
-- no code, 'owner' for an owner, 'none' without a code, else 'scan' or
-- 'typed'.
drop function private.check_punch(uuid, uuid, text, timestamptz);

create function private.check_punch(
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

  if exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = person and m.active and m.role = 'owner'
  ) then
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
    -- The attempt was counted before this call, in its own (note_punch_attempt);
    -- a typed code that skipped the count is refused, so the limit holds.
    if not exists (
      select 1 from private.punch_attempts a
      where a.business_id = business and a.user_id = person
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

  return jsonb_build_object(
    'proof', case when typed then 'typed' else 'scan' end,
    'station', c.station_id,
    'issuer', c.issued_by
  );
end;
$$;

revoke execute on function private.check_punch(uuid, uuid, text, text, boolean, timestamptz) from public;

-- Keep at most four live codes from one source, and none expired.
create function private.trim_punch_codes(
  business uuid,
  issuer uuid,
  station uuid,
  at_time timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.punch_codes c
  where c.business_id = business and c.expires_at <= at_time;

  delete from public.punch_codes c
  where c.code_hash in (
    select k.code_hash from public.punch_codes k
    where k.business_id = business
      and ((issuer is not null and k.issued_by = issuer)
        or (station is not null and k.station_id = station))
    order by k.created_at desc
    offset 3
  );
end;
$$;

revoke execute on function private.trim_punch_codes(uuid, uuid, uuid, timestamptz) from public;

-- A manager or owner's phone shows a code: valid for punch_code_ttl(), with
-- its digits when given. Refused when the business shows codes only on
-- stations. Returns when the code expires.
drop function public.issue_punch_code(uuid, uuid, text, timestamptz);

create function public.issue_punch_code(
  actor uuid,
  business uuid,
  code_hash text,
  at_time timestamptz default now(),
  short_hash text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  expires timestamptz := at_time + private.punch_code_ttl();
begin
  perform private.check_time_clock_on(business);

  if not private.can_edit_clock(business, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if coalesce(private.clock_setting(business, 'codeDisplay'), 'both') = 'station' then
    raise exception 'This business shows codes on its stations only' using errcode = '42501';
  end if;

  if code_hash is null or code_hash !~ '^[0-9a-f]{64}$'
    or (short_hash is not null and short_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Code hash must be 64 hex digits' using errcode = '22023';
  end if;

  perform private.trim_punch_codes(business, actor, null, at_time);

  insert into public.punch_codes (code_hash, short_hash, business_id, issued_by, expires_at, created_at)
  values (code_hash, short_hash, business, actor, expires, at_time);

  return expires;
end;
$$;

revoke execute on function public.issue_punch_code(uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.issue_punch_code(uuid, uuid, text, timestamptz, text) to service_role;

-- A device that is not a station yet asks to be one: it shows the pairing
-- QR and digits, and keeps its secret. Lasts five minutes.
create function public.start_station_pairing(
  pairing_hash text,
  short_hash text,
  token_hash text,
  at_time timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  expires timestamptz := at_time + interval '5 minutes';
begin
  if pairing_hash !~ '^[0-9a-f]{64}$' or short_hash !~ '^[0-9a-f]{64}$'
    or token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hashes must be 64 hex digits' using errcode = '22023';
  end if;

  delete from private.station_pairings p where p.expires_at <= at_time;

  if (select count(*) from private.station_pairings) >= 1000 then
    raise exception 'Too many devices are pairing; try again soon' using errcode = '54000';
  end if;

  insert into private.station_pairings (pairing_hash, short_hash, token_hash, expires_at, created_at)
  values (pairing_hash, short_hash, token_hash, expires, at_time);

  return expires;
end;
$$;

revoke execute on function public.start_station_pairing(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.start_station_pairing(text, text, text, timestamptz) to service_role;

-- A manager approves a device from their own phone, by scanning its pairing
-- QR or typing its digits: it becomes a station of the business. At most ten
-- running. Returns the station's id.
create function public.approve_station_pairing(
  actor uuid,
  business uuid,
  name text,
  pairing_hash text default null,
  short_hash text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p private.station_pairings%rowtype;
  station_id uuid;
begin
  perform private.check_time_clock_on(business);

  if not private.can_edit_clock(business, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if coalesce(private.clock_setting(business, 'codeDisplay'), 'both') = 'manager' then
    raise exception 'This business shows codes on a manager''s phone only' using errcode = '42501';
  end if;

  if name is null or char_length(btrim(name)) not between 1 and 40 then
    raise exception 'A station needs a name of up to 40 characters' using errcode = '22023';
  end if;

  select * into p from private.station_pairings sp
  where sp.expires_at > at_time
    and ((approve_station_pairing.pairing_hash is not null
        and sp.pairing_hash = approve_station_pairing.pairing_hash)
      or (approve_station_pairing.pairing_hash is null
        and sp.short_hash = approve_station_pairing.short_hash))
  for update;
  if not found then
    raise exception 'The pairing code is missing or expired' using errcode = '28000';
  end if;

  if (
    select count(*) from public.clock_stations s
    where s.business_id = business and s.stopped_at is null
  ) >= 10 then
    raise exception 'At most ten stations' using errcode = '54000';
  end if;

  insert into public.clock_stations (business_id, name, token_hash, created_by, created_at)
  values (business, btrim(name), p.token_hash, actor, at_time)
  returning id into station_id;

  delete from private.station_pairings sp where sp.pairing_hash = p.pairing_hash;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.station.add',
    jsonb_build_object('station', station_id, 'name', btrim(name)));

  return station_id;
end;
$$;

revoke execute on function public.approve_station_pairing(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.approve_station_pairing(uuid, uuid, text, text, text, timestamptz)
  to service_role;

-- What a station's page needs, by its current token: null for a token that
-- is no station's (still pairing, or unknown).
create function public.station_by_token(token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'station', s.id,
    'name', s.name,
    'business', b.id,
    'businessName', b.name,
    'accent', b.accent,
    'timeZone', b.timezone,
    'stopped', s.stopped_at is not null
  )
  from public.clock_stations s
  join public.businesses b on b.id = s.business_id
  where s.token_hash = station_by_token.token_hash
$$;

revoke execute on function public.station_by_token(text) from public, anon, authenticated;
grant execute on function public.station_by_token(text) to service_role;

-- A station fetches a code. Returns {business, station, expires}.
create function public.issue_station_code(
  token_hash text,
  code_hash text,
  short_hash text,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
  expires timestamptz := at_time + private.punch_code_ttl();
begin
  if token_hash !~ '^[0-9a-f]{64}$' or code_hash !~ '^[0-9a-f]{64}$'
    or short_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hashes must be 64 hex digits' using errcode = '22023';
  end if;

  select * into s from public.clock_stations st
  where st.token_hash = issue_station_code.token_hash;
  if not found then
    raise exception 'Not a station' using errcode = '42501';
  end if;

  if s.stopped_at is not null then
    raise exception 'This station was stopped' using errcode = '42501';
  end if;

  perform private.check_time_clock_on(s.business_id);

  if coalesce(private.clock_setting(s.business_id, 'codeDisplay'), 'both') = 'manager' then
    raise exception 'This business shows codes on a manager''s phone only' using errcode = '42501';
  end if;

  update public.clock_stations
  set last_seen_at = at_time
  where id = s.id and (last_seen_at is null or last_seen_at < at_time - interval '1 minute');

  perform private.trim_punch_codes(s.business_id, null, s.id, at_time);

  insert into public.punch_codes (code_hash, short_hash, business_id, station_id, expires_at, created_at)
  values (code_hash, short_hash, s.business_id, s.id, expires, at_time);

  return jsonb_build_object('business', s.business_id, 'station', s.id, 'expires', expires);
end;
$$;

revoke execute on function public.issue_station_code(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_station_code(text, text, text, timestamptz) to service_role;

-- A manager stops a station, or restarts one stopped in the last two
-- minutes (the undo).
create function public.set_clock_station_stopped(
  actor uuid,
  station uuid,
  stopped boolean,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
begin
  select * into s from public.clock_stations where id = station for update;
  if not found then
    raise exception 'Unknown station' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(s.business_id);

  if not private.can_edit_clock(s.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if stopped then
    if s.stopped_at is not null then
      return;
    end if;
    update public.clock_stations set stopped_at = at_time, stopped_by = actor where id = station;
    delete from public.punch_codes c where c.station_id = station;
    insert into public.audit_log (business_id, actor_id, action, details)
    values (s.business_id, actor, 'clock.station.stop', jsonb_build_object('station', station));
  else
    if s.stopped_at is null then
      return;
    end if;
    if at_time - s.stopped_at > interval '2 minutes' then
      raise exception 'Too late to take it back; pair the device again' using errcode = '55000';
    end if;
    update public.clock_stations set stopped_at = null, stopped_by = null where id = station;
    insert into public.audit_log (business_id, actor_id, action, details)
    values (s.business_id, actor, 'clock.station.restart', jsonb_build_object('station', station));
  end if;
end;
$$;

revoke execute on function public.set_clock_station_stopped(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_clock_station_stopped(uuid, uuid, boolean, timestamptz)
  to service_role;

-- Some device of the business is showing a live code right now.
create function public.punch_code_showing(
  actor uuid,
  business uuid,
  at_time timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_edit_clock(business, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.punch_codes c
    where c.business_id = business and c.expires_at > at_time and c.created_at <= at_time
  );
end;
$$;

revoke execute on function public.punch_code_showing(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.punch_code_showing(uuid, uuid, timestamptz) to service_role;

-- Count a typed code before it is checked, in its own call, so that
-- attempts sent at once all count. The sixth in 30 minutes writes the block
-- to the log, once. Returns whether typing is blocked now.
create function public.note_punch_attempt(
  actor uuid,
  business uuid,
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

  delete from private.punch_attempts a
  where a.user_id = actor and a.at < at_time - interval '1 day';

  -- One person's attempts are counted one at a time, so attempts sent at
  -- once can't both miss, or both write, the block's log row.
  perform pg_advisory_xact_lock(
    hashtextextended('punch_attempt:' || business::text || ':' || actor::text, 0));

  insert into private.punch_attempts (business_id, user_id, at) values (business, actor, at_time);

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

revoke execute on function public.note_punch_attempt(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.note_punch_attempt(uuid, uuid, timestamptz) to service_role;

-- `actor` starts work. Returns the new entry's id.
drop function public.clock_in(uuid, uuid, text, timestamptz);

create function public.clock_in(
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

  if proof ->> 'proof' = 'typed' then
    delete from private.punch_attempts a where a.business_id = business and a.user_id = actor;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.in', jsonb_build_object('entry', entry_id, 'proof', proof));

  return entry_id;
end;
$$;

revoke execute on function public.clock_in(uuid, uuid, text, timestamptz, text, boolean)
  from public, anon, authenticated;
grant execute on function public.clock_in(uuid, uuid, text, timestamptz, text, boolean) to service_role;

-- `actor` ends their open entry. Returns its id.
drop function public.clock_out(uuid, uuid, text, timestamptz);

create function public.clock_out(
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

  if proof ->> 'proof' = 'typed' then
    delete from private.punch_attempts a where a.business_id = business and a.user_id = actor;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.out', jsonb_build_object('entry', e.id, 'proof', proof));

  return e.id;
end;
$$;

revoke execute on function public.clock_out(uuid, uuid, text, timestamptz, text, boolean)
  from public, anon, authenticated;
grant execute on function public.clock_out(uuid, uuid, text, timestamptz, text, boolean) to service_role;

-- Taking a clock-out back takes its proof back too.
create or replace function public.undo_clock_out(
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
begin
  select * into e from public.time_entries where id = entry for update;
  if not found or e.user_id <> actor then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_on_clock(e.business_id, actor);

  if e.clock_out is null then
    raise exception 'Not clocked out' using errcode = '55000';
  end if;

  if e.source <> 'punch' or e.edited_at is not null
    or at_time - e.clock_out > interval '2 minutes' then
    raise exception 'Too late to take it back' using errcode = '55000';
  end if;

  update public.time_entries
  set clock_out = null, out_proof = null, out_station = null
  where id = entry;

  update public.time_breaks b
  set ended_at = null
  where b.entry_id = entry and b.ended_at = e.clock_out;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (e.business_id, actor, 'clock.undo_out', jsonb_build_object('entry', entry));
end;
$$;

-- A manager confirms an entry made without a code: its arrival, its
-- departure, or both, up to now. Not their own, unless they are an owner.
create function public.confirm_time_entry(
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
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if e.user_id = actor and not exists (
    select 1 from public.memberships m
    where m.business_id = e.business_id and m.user_id = actor and m.active and m.role = 'owner'
  ) then
    raise exception 'Someone else confirms your own hours' using errcode = '42501';
  end if;

  if coalesce(e.in_proof, '') <> 'none' and coalesce(e.out_proof, '') <> 'none' then
    raise exception 'Only an entry made without a code needs confirming' using errcode = '55000';
  end if;

  -- Nothing left to confirm: the arrival is confirmed, and so is a departure
  -- made without a code, by a confirmation that came after it.
  if not (
    (e.in_proof = 'none' and e.confirmed_at is null)
    or (e.out_proof = 'none' and (e.confirmed_at is null or e.confirmed_at < e.clock_out))
  ) then
    return;
  end if;

  update public.time_entries set confirmed_by = actor, confirmed_at = at_time where id = entry;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (e.business_id, actor, 'clock.confirm',
    jsonb_build_object('entry', entry, 'person', e.user_id));
end;
$$;

revoke execute on function public.confirm_time_entry(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_time_entry(uuid, uuid, timestamptz) to service_role;
