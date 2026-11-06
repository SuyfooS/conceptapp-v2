-- Breaks on the time clock, and the business's setting for whether a break
-- counts as paid time. A person goes on a break during their open entry and
-- comes back; leaving work ends an open break.
--
-- A break keeps `unpaid` as the setting stood when it began, so changing the
-- setting never rewrites hours already worked. Hours are summed on the server
-- and in the screens (`entryMinutes` in `@domain/time-clock`).
--
-- Writes go through the functions below with the secret key, for `actor`, and
-- each is written to `audit_log`:
--
--   start_break        a member on the clock goes on a break
--   end_break          they come back
--   undo_clock_out     they take back leaving, within two minutes
--   set_clock_settings a manager or owner chooses how breaks count
--
-- None of these needs a punch code. The code proves someone is at the business
-- when they arrive and leave; a break happens between the two.
--
-- Also here: the clock no longer asks for a punch code unless the business
-- turned it on, because the screens have no way to show or scan one yet.

create table public.time_breaks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.time_entries (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  unpaid boolean not null,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  -- Breaks of one entry never share a moment, so at most one is open.
  constraint time_breaks_no_overlap exclude using gist (
    entry_id with =,
    tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) with &&
  )
);

create index time_breaks_entry_id_idx on public.time_breaks (entry_id);
create index time_breaks_business_id_idx on public.time_breaks (business_id);
create index time_breaks_user_id_idx on public.time_breaks (user_id);

alter table public.time_breaks enable row level security;

revoke all on public.time_breaks from anon, authenticated;
grant select on public.time_breaks to authenticated;

create policy "breaks are read like the entries they belong to"
  on public.time_breaks for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or private.has_role(business_id, 'manager')
      or private.has_perm(business_id, 'clock.edit')
      or private.is_viewing(business_id, 'manager')
    )
  );

-- An entry's breaks stay inside it, however its times change: those wholly
-- outside go, the rest are cut to fit, and leaving ends an open break.
create function private.fit_breaks_to_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.time_breaks b
  where b.entry_id = new.id
    and (
      b.started_at >= coalesce(new.clock_out, 'infinity'::timestamptz)
      or b.ended_at <= new.clock_in
    );

  update public.time_breaks b
  set started_at = greatest(b.started_at, new.clock_in),
    ended_at = case
      when new.clock_out is null then b.ended_at
      else least(coalesce(b.ended_at, new.clock_out), new.clock_out)
    end
  where b.entry_id = new.id
    and (
      b.started_at < new.clock_in
      or (new.clock_out is not null and (b.ended_at is null or b.ended_at > new.clock_out))
    );

  return null;
end;
$$;

revoke execute on function private.fit_breaks_to_entry() from public;

create trigger time_entries_fit_breaks
  after update of clock_in, clock_out on public.time_entries
  for each row execute function private.fit_breaks_to_entry();

-- `person` is an active member of a business with the clock on, or raise.
create function private.check_on_clock(business uuid, person uuid)
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
    raise exception 'Only active members of the business can use the clock'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.check_on_clock(uuid, uuid) from public;

-- `actor` goes on a break during their open entry. Returns the break's id.
create function public.start_break(
  actor uuid,
  business uuid,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  break_id uuid;
begin
  perform private.check_on_clock(business, actor);

  select * into e from public.time_entries t
  where t.business_id = business and t.user_id = actor and t.clock_out is null
  for update;
  if not found then
    raise exception 'Not clocked in' using errcode = '55000';
  end if;

  if at_time <= e.clock_in then
    raise exception 'A break must start after the entry' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.time_breaks b
    where b.entry_id = e.id and b.ended_at is null
  ) then
    raise exception 'Already on a break' using errcode = '23P01';
  end if;

  insert into public.time_breaks (entry_id, business_id, user_id, started_at, unpaid)
  values (
    e.id, business, actor, at_time,
    coalesce((
      select (bm.settings ->> 'unpaidBreaks')::boolean
      from public.business_modules bm
      where bm.business_id = business and bm.module_key = 'time_clock'
    ), false)
  )
  returning id into break_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.break_start',
    jsonb_build_object('entry', e.id, 'break', break_id));

  return break_id;
end;
$$;

-- `actor` comes back from their open break. Returns the break's id.
create function public.end_break(
  actor uuid,
  business uuid,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.time_breaks%rowtype;
begin
  perform private.check_on_clock(business, actor);

  select tb.* into b from public.time_breaks tb
  join public.time_entries e on e.id = tb.entry_id
  where tb.business_id = business
    and tb.user_id = actor
    and tb.ended_at is null
    and e.clock_out is null
  for update of tb;
  if not found then
    raise exception 'Not on a break' using errcode = '55000';
  end if;

  if at_time <= b.started_at then
    raise exception 'A break must end after it starts' using errcode = '22023';
  end if;

  update public.time_breaks set ended_at = at_time where id = b.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.break_end',
    jsonb_build_object('entry', b.entry_id, 'break', b.id));

  return b.id;
end;
$$;

-- `actor` takes back leaving, shortly after: their entry is open again, as if
-- they had not left. Only an entry they punched themselves and nobody changed.
create function public.undo_clock_out(
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

  -- Refused by the no-overlap constraint if they have clocked in again since.
  update public.time_entries set clock_out = null where id = entry;

  -- If leaving ended a break, they are back on it. It can't overlap another:
  -- nothing in the entry starts after it left.
  update public.time_breaks b
  set ended_at = null
  where b.entry_id = entry and b.ended_at = e.clock_out;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (e.business_id, actor, 'clock.undo_out', jsonb_build_object('entry', entry));
end;
$$;

-- An active owner or manager chooses how breaks count, from now on.
create function public.set_clock_settings(
  actor uuid,
  business uuid,
  unpaid_breaks boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_time_clock_on(business);

  if not exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = actor
      and m.active
      and m.role in ('owner', 'manager')
  ) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  update public.business_modules
  set settings = settings || jsonb_build_object('unpaidBreaks', unpaid_breaks)
  where business_id = business and module_key = 'time_clock';

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'clock.settings',
    jsonb_build_object('unpaid_breaks', unpaid_breaks));
end;
$$;

revoke execute on function public.start_break(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.end_break(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.undo_clock_out(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.set_clock_settings(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.start_break(uuid, uuid, timestamptz) to service_role;
grant execute on function public.end_break(uuid, uuid, timestamptz) to service_role;
grant execute on function public.undo_clock_out(uuid, uuid, timestamptz) to service_role;
grant execute on function public.set_clock_settings(uuid, uuid, boolean) to service_role;

-- A punch code only when the business turned it on.
create or replace function private.check_punch(
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
  ), false) and not exists (
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
