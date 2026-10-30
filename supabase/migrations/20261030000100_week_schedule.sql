-- The week's schedule (chunk 2c-1): the shifts of one week and who works
-- each. The manager builds it from the business's shift pattern and the
-- team's availability, then publishes it (a later chunk).
--
-- A shift is one day's run of a shift ("Morning, Sunday 07:00-15:00, needs
-- 3"), usually made from a pattern in the scheduling settings (its key is
-- kept) but free to change or add by hand. An end at or before the start
-- runs past midnight, as in opening hours. An assignment puts one person on
-- one shift, optionally in one of the business's positions.
--
-- Writes go through `save_week_schedule` with the secret key: it replaces
-- the whole week in one transaction, so the rules live in one place. Only
-- active managers and owners save; days fall inside the week; the people
-- are active members; positions are the business's; nobody works two shifts
-- at once. Until publishing exists, only managers and owners (and "view as"
-- a manager) read the schedule; workers read nothing yet.

alter table public.schedule_weeks
  add column schedule_saved_at timestamptz;

create table public.schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  day date not null,
  pattern_key text check (pattern_key ~ '^[a-z][a-z0-9-]*$' and char_length(pattern_key) <= 40),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  starts_at time not null,
  ends_at time not null,
  needed int not null check (needed between 1 and 50),
  check (starts_at <> ends_at)
);

create index schedule_shifts_week_id_idx on public.schedule_shifts (week_id);
create index schedule_shifts_business_id_idx on public.schedule_shifts (business_id);

create table public.shift_assignments (
  shift_id uuid not null references public.schedule_shifts (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position_key text check (position_key ~ '^[a-z][a-z0-9-]*$' and char_length(position_key) <= 40),
  primary key (shift_id, user_id)
);

create index shift_assignments_user_id_idx on public.shift_assignments (user_id);
create index shift_assignments_business_id_idx on public.shift_assignments (business_id);

alter table public.schedule_shifts enable row level security;
alter table public.shift_assignments enable row level security;

revoke all on public.schedule_shifts, public.shift_assignments from anon, authenticated;
grant select on public.schedule_shifts, public.shift_assignments to authenticated;

-- Managers and owners read the week's schedule while they build it.
create policy "managers read their business's shifts"
  on public.schedule_shifts for select to authenticated
  using (
    private.module_enabled(business_id, 'scheduling')
    and (
      private.has_role(business_id, 'manager')
      or private.is_viewing(business_id, 'manager')
    )
  );

create policy "managers read their business's assignments"
  on public.shift_assignments for select to authenticated
  using (
    private.module_enabled(business_id, 'scheduling')
    and (
      private.has_role(business_id, 'manager')
      or private.is_viewing(business_id, 'manager')
    )
  );

-- Replace the week's schedule with `shifts`, saved by `actor`. `shifts` is
-- a JSON array of {"day": "YYYY-MM-DD", "name": text, "start": "HH:MM",
-- "end": "HH:MM", "needed": int, "pattern": key or null, "assignees":
-- [{"user": uuid, "position": key or null}]}. An empty array clears the
-- week. Returns the number of shifts saved.
create function public.save_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  w public.schedule_weeks%rowtype;
  settings jsonb;
  shift_count int;
begin
  select * into w from public.schedule_weeks where id = week;
  if not found then
    raise exception 'Unknown week' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.business_id = w.business_id
      and m.user_id = actor
      and m.active
      and m.role in ('owner', 'manager')
  ) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  select bm.settings into settings
  from public.business_modules bm
  where bm.business_id = w.business_id
    and bm.module_key = 'scheduling'
    and bm.enabled;

  if not found then
    raise exception 'Scheduling is off for this business' using errcode = '42501';
  end if;

  if shifts is null or jsonb_typeof(shifts) <> 'array' then
    raise exception 'Shifts must be a list' using errcode = '22023';
  end if;

  shift_count := jsonb_array_length(shifts);
  if shift_count > 200 then
    raise exception 'Too many shifts' using errcode = '22023';
  end if;

  -- Shape: every field of the right type, every assignee list a list.
  begin
    perform r.day, r.start, r."end", r.needed
    from jsonb_to_recordset(shifts)
      as r(day date, name text, start time, "end" time, needed int, pattern text, assignees jsonb);

    perform a."user"
    from jsonb_to_recordset(shifts) as r(assignees jsonb)
    cross join lateral jsonb_to_recordset(coalesce(r.assignees, '[]'::jsonb))
      as a("user" uuid, position text);
  exception when others then
    raise exception 'Each shift needs a day, a name, a start, an end, the people needed and a list of people'
      using errcode = '22023';
  end;

  if exists (
    select 1
    from jsonb_to_recordset(shifts)
      as r(day date, name text, start time, "end" time, needed int, pattern text)
    where r.day is null or r.start is null or r."end" is null
      or r.start = r."end"
      or r.name is null or char_length(btrim(r.name)) not between 1 and 40
      or r.needed is null or r.needed not between 1 and 50
      or (r.pattern is not null
        and (r.pattern !~ '^[a-z][a-z0-9-]*$' or char_length(r.pattern) > 40))
  ) then
    raise exception 'Each shift needs a day, a name, a start, a different end and 1 to 50 people'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(shifts) as r(day date)
    where r.day not between w.starts_on and w.starts_on + 6
  ) then
    raise exception 'A shift falls outside the week' using errcode = '22023';
  end if;

  -- One row per person on a shift: the shift's place in the list, the
  -- person, the position, and the shift's span in minutes from the week's
  -- first midnight (an end at or before the start is the next day).
  if exists (
    select 1
    from rows from (jsonb_to_recordset(shifts) as (assignees jsonb))
      with ordinality as r(assignees, n)
    cross join lateral jsonb_to_recordset(coalesce(r.assignees, '[]'::jsonb))
      as a("user" uuid, position text)
    group by r.n, a."user"
    having a."user" is null or count(*) > 1
  ) then
    raise exception 'Each person needs an id and is on a shift once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(shifts) as r(assignees jsonb)
    cross join lateral jsonb_to_recordset(coalesce(r.assignees, '[]'::jsonb))
      as a("user" uuid, position text)
    where not exists (
      select 1
      from public.memberships m
      where m.business_id = w.business_id and m.user_id = a."user" and m.active
    )
  ) then
    raise exception 'Only active members of the business can work a shift'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(shifts) as r(assignees jsonb)
    cross join lateral jsonb_to_recordset(coalesce(r.assignees, '[]'::jsonb))
      as a("user" uuid, position text)
    where a.position is not null
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(settings -> 'positions', '[]'::jsonb)) as p(item)
        where p.item ->> 'key' = a.position
      )
  ) then
    raise exception 'Unknown position' using errcode = '22023';
  end if;

  if exists (
    with spans as (
      select
        r.n,
        a."user" as user_id,
        (r.day - w.starts_on) * 1440 + extract(epoch from r.start)::int / 60 as from_minute,
        (r.day - w.starts_on) * 1440 + extract(epoch from r."end")::int / 60
          + case when r."end" <= r.start then 1440 else 0 end as to_minute
      from rows from (
        jsonb_to_recordset(shifts) as (day date, start time, "end" time, assignees jsonb)
      ) with ordinality as r(day, start, "end", assignees, n)
      cross join lateral jsonb_to_recordset(coalesce(r.assignees, '[]'::jsonb))
        as a("user" uuid, position text)
    )
    select 1
    from spans a
    join spans b on a.user_id = b.user_id and a.n < b.n
    where a.from_minute < b.to_minute and b.from_minute < a.to_minute
  ) then
    raise exception 'A person works two shifts at once' using errcode = '22023';
  end if;

  delete from public.schedule_shifts ss where ss.week_id = w.id;

  -- Ids are drawn up front so each person lands on their own shift; the
  -- foreign keys are checked at the end of the statement.
  with source as materialized (
    select gen_random_uuid() as id, r.*
    from jsonb_to_recordset(shifts)
      as r(day date, name text, start time, "end" time, needed int, pattern text, assignees jsonb)
  ),
  saved as (
    insert into public.schedule_shifts
      (id, business_id, week_id, day, pattern_key, name, starts_at, ends_at, needed)
    select s.id, w.business_id, w.id, s.day, s.pattern, btrim(s.name), s.start, s."end", s.needed
    from source s
  )
  insert into public.shift_assignments (shift_id, business_id, user_id, position_key)
  select s.id, w.business_id, a."user", a.position
  from source s
  cross join lateral jsonb_to_recordset(coalesce(s.assignees, '[]'::jsonb))
    as a("user" uuid, position text);

  update public.schedule_weeks set schedule_saved_at = now() where id = w.id;

  return shift_count;
end;
$$;

revoke execute on function public.save_week_schedule(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_week_schedule(uuid, uuid, jsonb)
  to service_role;
