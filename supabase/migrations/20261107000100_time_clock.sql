-- Time clock, database first (issue #41): clocking in and out, a manager's
-- correction, and a rotating QR punch code. No screens yet.
--
-- A time entry is one stretch at work: `clock_in`, and `clock_out` once the
-- person leaves (null while they are at work). A person's entries in a
-- business never overlap, so there is at most one open entry each; an
-- entry may run past midnight.
--
-- Writes go through the functions below with the secret key, for `actor`,
-- and each is written to `audit_log`:
--
--   issue_punch_code   a manager or owner's device shows a fresh code (as a
--                      QR); only its SHA-256 is stored, for two minutes
--   clock_in           an active member starts an entry
--   clock_out          they end their open entry
--   add_time_entry     a manager adds an entry someone forgot to punch
--   correct_time_entry a manager changes an entry's times
--
-- When the module's setting `requirePunchCode` is on (the default), clocking
-- in and out needs a code that is still valid, so people punch at the
-- business and not from home. Managers' changes do not.
--
-- Reads: everyone their own entries, managers and owners (and holders of
-- `clock.edit`) the whole business, "view as" at manager the whole
-- business. Nothing when the module is off, and nothing across businesses.

create extension if not exists btree_gist with schema extensions;

create type public.time_entry_source as enum ('punch', 'manager');

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  source public.time_entry_source not null default 'punch',
  note text check (char_length(note) between 1 and 200 and note = btrim(note)),
  edited_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in),
  check (clock_out is null or clock_out - clock_in <= interval '24 hours'),
  check ((edited_by is null) = (edited_at is null)),
  -- No two entries of one person in one business share a moment; an open
  -- entry runs to infinity, so a second open one is refused too.
  constraint time_entries_no_overlap exclude using gist (
    business_id with =,
    user_id with =,
    tstzrange(clock_in, coalesce(clock_out, 'infinity'::timestamptz)) with &&
  )
);

create index time_entries_business_clock_in_idx
  on public.time_entries (business_id, clock_in desc);
create index time_entries_user_id_idx on public.time_entries (user_id, clock_in desc);
create index time_entries_open_idx
  on public.time_entries (business_id) where clock_out is null;
create index time_entries_edited_by_idx on public.time_entries (edited_by);

-- Codes are only checked by the functions below; nobody reads this table.
create table public.punch_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  business_id uuid not null references public.businesses (id) on delete cascade,
  issued_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index punch_codes_business_id_idx on public.punch_codes (business_id, expires_at);
create index punch_codes_issued_by_idx on public.punch_codes (issued_by);

alter table public.time_entries enable row level security;
alter table public.punch_codes enable row level security;

revoke all on public.time_entries, public.punch_codes from anon, authenticated;
grant select on public.time_entries to authenticated;

create policy "people read their own entries, managers the business's"
  on public.time_entries for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or private.has_role(business_id, 'manager')
      or private.has_perm(business_id, 'clock.edit')
      or private.is_viewing(business_id, 'manager')
    )
  );

-- punch_codes: no policies, so no reads or writes but the server's.

-- The module is on for the business, or raise.
create function private.check_time_clock_on(business uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.business_modules bm
    where bm.business_id = business and bm.module_key = 'time_clock' and bm.enabled
  ) then
    raise exception 'The time clock is off for this business' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.check_time_clock_on(uuid) from public;

-- `person` may change the business's time entries: an active owner or
-- manager, or an active member holding `clock.edit`.
create function private.can_edit_clock(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (m.role in ('owner', 'manager') or 'clock.edit' = any (m.perms))
  )
$$;

revoke execute on function private.can_edit_clock(uuid, uuid) from public;

-- Raise unless the punch is allowed: `person` is an active member, and the
-- code is valid at `at_time` when the business requires one.
create function private.check_punch(
  business uuid,
  person uuid,
  code_hash text,
  at_time timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_time_clock_on(business);

  if not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = person and m.active
  ) then
    raise exception 'Only active members of the business can punch' using errcode = '42501';
  end if;

  if coalesce((
    select (bm.settings ->> 'requirePunchCode')::boolean
    from public.business_modules bm
    where bm.business_id = business and bm.module_key = 'time_clock'
  ), true) and not exists (
    select 1 from public.punch_codes c
    where c.code_hash = check_punch.code_hash
      and c.business_id = business
      and c.expires_at > at_time
      and c.created_at <= at_time
  ) then
    raise exception 'The punch code is missing or expired' using errcode = '28000';
  end if;
end;
$$;

revoke execute on function private.check_punch(uuid, uuid, text, timestamptz) from public;

-- Raise unless the times make an entry: not in the future, the end after
-- the start, at most 24 hours long.
create function private.check_entry_times(
  clock_in timestamptz,
  clock_out timestamptz,
  at_time timestamptz
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if clock_in is null then
    raise exception 'An entry needs a start' using errcode = '22023';
  end if;
  if clock_in > at_time or clock_out > at_time then
    raise exception 'An entry cannot be in the future' using errcode = '22023';
  end if;
  if clock_out <= clock_in then
    raise exception 'An entry must end after it starts' using errcode = '22023';
  end if;
  if clock_out - clock_in > interval '24 hours' then
    raise exception 'An entry is at most 24 hours' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.check_entry_times(timestamptz, timestamptz, timestamptz) from public;

-- A manager or owner's device stores a fresh code for the business, valid
-- for two minutes; the app makes the code and passes its SHA-256 (hex).
-- Codes that expired are cleared. Returns when the new one expires.
create function public.issue_punch_code(
  actor uuid,
  business uuid,
  code_hash text,
  at_time timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  expires timestamptz := at_time + interval '2 minutes';
begin
  perform private.check_time_clock_on(business);

  if not private.can_edit_clock(business, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if code_hash is null or code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Code hash must be 64 hex digits' using errcode = '22023';
  end if;

  delete from public.punch_codes c
  where c.business_id = business and c.expires_at <= at_time;

  insert into public.punch_codes (code_hash, business_id, issued_by, expires_at, created_at)
  values (code_hash, business, actor, expires, at_time);

  return expires;
end;
$$;

-- `actor` starts work. Returns the new entry's id.
create function public.clock_in(
  actor uuid,
  business uuid,
  code_hash text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid;
begin
  perform private.check_punch(business, actor, code_hash, at_time);

  if exists (
    select 1 from public.time_entries e
    where e.business_id = business and e.user_id = actor and e.clock_out is null
  ) then
    raise exception 'Already clocked in' using errcode = '23P01';
  end if;

  insert into public.time_entries (business_id, user_id, clock_in)
  values (business, actor, at_time)
  returning id into entry_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.in', jsonb_build_object('entry', entry_id));

  return entry_id;
end;
$$;

-- `actor` ends their open entry. Returns its id.
create function public.clock_out(
  actor uuid,
  business uuid,
  code_hash text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
begin
  perform private.check_punch(business, actor, code_hash, at_time);

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

  update public.time_entries set clock_out = at_time where id = e.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.out', jsonb_build_object('entry', e.id));

  return e.id;
end;
$$;

-- A manager adds an entry for an active or former member who forgot to
-- punch. Returns the new entry's id.
create function public.add_time_entry(
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

  insert into public.time_entries (
    business_id, user_id, clock_in, clock_out, source, note, edited_by, edited_at
  )
  values (
    business, person, new_clock_in, new_clock_out, 'manager',
    nullif(btrim(note), ''), actor, at_time
  )
  returning id into entry_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'clock.add',
    jsonb_build_object('entry', entry_id, 'person', person,
      'clock_in', new_clock_in, 'clock_out', new_clock_out)
  );

  return entry_id;
end;
$$;

-- A manager changes an entry's times (a null end leaves it open, e.g. to
-- fix only the start of someone still at work). The old times go to the
-- audit log.
create function public.correct_time_entry(
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
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  perform private.check_entry_times(new_clock_in, new_clock_out, at_time);

  if new_clock_out is null and at_time - new_clock_in > interval '24 hours' then
    raise exception 'An entry is at most 24 hours' using errcode = '22023';
  end if;

  update public.time_entries
  set clock_in = new_clock_in,
    clock_out = new_clock_out,
    note = coalesce(nullif(btrim(correct_time_entry.note), ''), time_entries.note),
    edited_by = actor,
    edited_at = at_time
  where id = entry;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    e.business_id, actor, 'clock.correct',
    jsonb_build_object('entry', entry, 'person', e.user_id,
      'from', jsonb_build_object('clock_in', e.clock_in, 'clock_out', e.clock_out),
      'to', jsonb_build_object('clock_in', new_clock_in, 'clock_out', new_clock_out))
  );
end;
$$;

revoke execute on function public.issue_punch_code(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.clock_in(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.clock_out(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.add_time_entry(uuid, uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.correct_time_entry(uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_punch_code(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.clock_in(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.clock_out(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.add_time_entry(uuid, uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  to service_role;
grant execute on function public.correct_time_entry(uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  to service_role;
