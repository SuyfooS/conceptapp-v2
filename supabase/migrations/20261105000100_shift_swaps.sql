-- Shift swaps (chunk 2d-1): a worker who cannot make a published shift
-- asks to give it away, a colleague takes it, and a manager approves.
--
--   open      the worker asked; any active colleague may take it
--   taken     a colleague took it; waiting for a manager
--   approved  a manager approved: the colleague is now on the shift, in the
--             same position, and the worker is off it
--   declined  a manager said no; the worker stays on the shift
--   cancelled the worker withdrew the request before a decision
--
-- Only shifts of a published week that have not started yet (in the
-- business's time zone) can be given away. The colleague must be an active
-- member who is not on the shift and works nothing else at the same time.
-- Everything is checked again when the manager approves, since the
-- schedule may have changed in between.
--
-- Writes go through the functions below with the secret key, for `actor`,
-- and each is written to `audit_log`. Members of the business read its
-- swaps (so colleagues see what they can take); "view as" reads them too.
--
-- Publishing changes to a week replaces its shifts, so their open swaps go
-- with them (on delete cascade). Kept that way for now: a request stays
-- meaningful only for the shift as it was.

create type public.swap_status as enum ('open', 'taken', 'approved', 'declined', 'cancelled');

create table public.shift_swaps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shift_id uuid not null references public.schedule_shifts (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  note text check (char_length(note) between 1 and 200 and note = btrim(note)),
  status public.swap_status not null default 'open',
  taken_by uuid references public.profiles (id) on delete cascade,
  taken_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (taken_by is null or taken_by <> requested_by),
  check ((status = 'open') = (taken_by is null) or status = 'cancelled'),
  check ((status in ('approved', 'declined')) = (decided_at is not null))
);

-- One live request per person per shift.
create unique index shift_swaps_live_idx
  on public.shift_swaps (shift_id, requested_by)
  where status in ('open', 'taken');

create index shift_swaps_business_id_idx on public.shift_swaps (business_id, created_at desc);
create index shift_swaps_requested_by_idx on public.shift_swaps (requested_by);
create index shift_swaps_taken_by_idx on public.shift_swaps (taken_by);
create index shift_swaps_decided_by_idx on public.shift_swaps (decided_by);

alter table public.shift_swaps enable row level security;

revoke all on public.shift_swaps from anon, authenticated;
grant select on public.shift_swaps to authenticated;

create policy "members read their business's swaps"
  on public.shift_swaps for select to authenticated
  using (
    private.module_enabled(business_id, 'scheduling')
    and (private.is_member(business_id) or private.is_viewing(business_id))
  );

-- The shift's start and end as local times in the business's time zone,
-- turned into instants (an end at or before the start is the next day).
create function private.shift_span(shift uuid)
returns tstzrange
language sql
stable
security definer
set search_path = ''
as $$
  select tstzrange(
    (s.day + s.starts_at) at time zone b.timezone,
    (s.day + case when s.ends_at <= s.starts_at then 1 else 0 end + s.ends_at)
      at time zone b.timezone
  )
  from public.schedule_shifts s
  join public.businesses b on b.id = s.business_id
  where s.id = shift
$$;

revoke execute on function private.shift_span(uuid) from public;

-- Raise unless `person` may work `shift` in place of someone else: an
-- active member, not already on it, and on no other shift at the same time.
create function private.check_can_take(shift uuid, person uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.schedule_shifts%rowtype;
begin
  select * into s from public.schedule_shifts where id = shift;

  if not exists (
    select 1 from public.memberships m
    where m.business_id = s.business_id and m.user_id = person and m.active
  ) then
    raise exception 'Only active members of the business can take a shift'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.shift_assignments a
    where a.shift_id = shift and a.user_id = person
  ) then
    raise exception 'Already on this shift' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.shift_assignments a
    join public.schedule_shifts o on o.id = a.shift_id
    where a.user_id = person
      and o.business_id = s.business_id
      and o.id <> shift
      and private.shift_span(o.id) && private.shift_span(shift)
  ) then
    raise exception 'Works another shift at the same time' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.check_can_take(uuid, uuid) from public;

-- The scheduling module is on for the shift's business, the week is
-- published and the shift has not started at `at`.
create function private.check_shift_open_for_swap(shift uuid, at_time timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.schedule_shifts%rowtype;
begin
  select * into s from public.schedule_shifts where id = shift;
  if not found then
    raise exception 'Unknown shift' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.business_modules bm
    where bm.business_id = s.business_id and bm.module_key = 'scheduling' and bm.enabled
  ) then
    raise exception 'Scheduling is off for this business' using errcode = '42501';
  end if;

  if not private.week_published(s.week_id) then
    raise exception 'Only a published shift can be swapped' using errcode = '55000';
  end if;

  if lower(private.shift_span(shift)) <= at_time then
    raise exception 'The shift has already started' using errcode = '55000';
  end if;
end;
$$;

revoke execute on function private.check_shift_open_for_swap(uuid, timestamptz) from public;

-- `actor` asks to give away their shift. Returns the request's id.
create function public.request_shift_swap(
  actor uuid,
  shift uuid,
  note text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.schedule_shifts%rowtype;
  swap_id uuid;
begin
  perform private.check_shift_open_for_swap(shift, at_time);
  select * into s from public.schedule_shifts where id = shift;

  if not exists (
    select 1
    from public.shift_assignments a
    join public.memberships m on m.business_id = a.business_id and m.user_id = a.user_id
    where a.shift_id = shift and a.user_id = actor and m.active
  ) then
    raise exception 'Only someone on the shift can give it away' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.shift_swaps w
    where w.shift_id = shift and w.requested_by = actor and w.status in ('open', 'taken')
  ) then
    raise exception 'Already asked to give this shift away' using errcode = '23505';
  end if;

  insert into public.shift_swaps (business_id, shift_id, requested_by, note)
  values (s.business_id, shift, actor, nullif(btrim(note), ''))
  returning id into swap_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (s.business_id, actor, 'swap.request', jsonb_build_object('swap', swap_id, 'shift', shift));

  return swap_id;
end;
$$;

-- `actor` takes an open request; it now waits for a manager.
create function public.take_shift_swap(
  actor uuid,
  swap uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.shift_swaps%rowtype;
begin
  select * into w from public.shift_swaps where id = swap for update;
  if not found then
    raise exception 'Unknown request' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.business_id = w.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Only active members of the business can take a shift'
      using errcode = '42501';
  end if;

  if w.status <> 'open' then
    raise exception 'This request is no longer open' using errcode = '55000';
  end if;

  if w.requested_by = actor then
    raise exception 'Cannot take your own shift' using errcode = '22023';
  end if;

  perform private.check_shift_open_for_swap(w.shift_id, at_time);
  perform private.check_can_take(w.shift_id, actor);

  update public.shift_swaps
  set status = 'taken', taken_by = actor, taken_at = at_time
  where id = swap;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (w.business_id, actor, 'swap.take', jsonb_build_object('swap', swap));
end;
$$;

-- The worker who asked withdraws, while no manager has decided.
create function public.cancel_shift_swap(actor uuid, swap uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.shift_swaps%rowtype;
begin
  select * into w from public.shift_swaps where id = swap for update;
  if not found then
    raise exception 'Unknown request' using errcode = 'P0002';
  end if;

  if w.requested_by <> actor then
    raise exception 'Only the person who asked can cancel' using errcode = '42501';
  end if;

  if w.status not in ('open', 'taken') then
    raise exception 'This request is already closed' using errcode = '55000';
  end if;

  update public.shift_swaps set status = 'cancelled' where id = swap;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (w.business_id, actor, 'swap.cancel', jsonb_build_object('swap', swap));
end;
$$;

-- An active manager or owner approves or declines a taken request. On
-- approval the colleague replaces the worker on the shift, in the same
-- position, after every rule is checked again.
create function public.decide_shift_swap(
  actor uuid,
  swap uuid,
  approve boolean,
  at_time timestamptz default now()
)
returns public.swap_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.shift_swaps%rowtype;
  result public.swap_status;
begin
  select * into w from public.shift_swaps where id = swap for update;
  if not found then
    raise exception 'Unknown request' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.business_id = w.business_id
      and m.user_id = actor
      and m.active
      and m.role in ('owner', 'manager')
  ) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if w.status <> 'taken' then
    raise exception 'Only a taken request waits for a decision' using errcode = '55000';
  end if;

  if approve is null then
    raise exception 'Approve or decline' using errcode = '22023';
  end if;

  if approve then
    perform private.check_shift_open_for_swap(w.shift_id, at_time);

    if not exists (
      select 1 from public.shift_assignments a
      where a.shift_id = w.shift_id and a.user_id = w.requested_by
    ) then
      raise exception 'The worker is no longer on this shift' using errcode = '55000';
    end if;

    perform private.check_can_take(w.shift_id, w.taken_by);

    update public.shift_assignments
    set user_id = w.taken_by
    where shift_id = w.shift_id and user_id = w.requested_by;

    result := 'approved';
  else
    result := 'declined';
  end if;

  update public.shift_swaps
  set status = result, decided_by = actor, decided_at = at_time
  where id = swap;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    w.business_id, actor,
    case when approve then 'swap.approve' else 'swap.decline' end,
    jsonb_build_object('swap', swap, 'shift', w.shift_id, 'from', w.requested_by, 'to', w.taken_by)
  );

  return result;
end;
$$;

revoke execute on function public.request_shift_swap(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.take_shift_swap(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.cancel_shift_swap(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.decide_shift_swap(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.request_shift_swap(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.take_shift_swap(uuid, uuid, timestamptz) to service_role;
grant execute on function public.cancel_shift_swap(uuid, uuid) to service_role;
grant execute on function public.decide_shift_swap(uuid, uuid, boolean, timestamptz) to service_role;
