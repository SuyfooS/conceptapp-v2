-- Availability (chunk 2b-1): each week of the schedule, and each person's
-- availability for it. Workers say when they can work in the coming week,
-- by the business's due day and time; the manager sees who has not
-- submitted yet and builds the schedule from the answers.
--
-- A week starts on the business's `weekStartsOn` (scheduling settings).
-- A submission is one person's answer for one week: any number of ranges
-- ("Sunday 08:00-16:00"), or none at all, which means "not available this
-- week". A range whose end is at or before its start runs past midnight,
-- as in opening hours.
--
-- Writes go through the two functions below with the secret key, so the
-- rules live in one place: the week must start on the business's day, the
-- person must be an active member, every range must fall inside the week,
-- and ranges on the same day must not overlap. Reads follow RLS and close
-- when the scheduling module is switched off.

create table public.schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  starts_on date not null,
  availability_due_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (business_id, starts_on)
);

create table public.availability_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  note text check (char_length(note) <= 300),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, user_id)
);

create index availability_submissions_user_id_idx
  on public.availability_submissions (user_id);
create index availability_submissions_business_id_idx
  on public.availability_submissions (business_id);

create table public.availability_ranges (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.availability_submissions (id) on delete cascade,
  day date not null,
  starts_at time not null,
  ends_at time not null,
  check (starts_at <> ends_at)
);

create index availability_ranges_submission_id_idx
  on public.availability_ranges (submission_id);

alter table public.schedule_weeks enable row level security;
alter table public.availability_submissions enable row level security;
alter table public.availability_ranges enable row level security;

revoke all on
  public.schedule_weeks, public.availability_submissions,
  public.availability_ranges
from anon, authenticated;
grant select on
  public.schedule_weeks, public.availability_submissions,
  public.availability_ranges
to authenticated;

-- schedule_weeks: the whole team sees the weeks.
create policy "members read their business's weeks"
  on public.schedule_weeks for select to authenticated
  using (
    private.module_enabled(business_id, 'scheduling')
    and (private.is_member(business_id) or private.is_viewing(business_id))
  );

-- availability_submissions: your own, or everyone's from manager up.
create policy "people read their own availability"
  on public.availability_submissions for select to authenticated
  using (
    user_id = (select auth.uid())
    and private.module_enabled(business_id, 'scheduling')
    and private.is_member(business_id)
  );

create policy "managers read their business's availability"
  on public.availability_submissions for select to authenticated
  using (
    private.module_enabled(business_id, 'scheduling')
    and (
      private.has_role(business_id, 'manager')
      or private.is_viewing(business_id, 'manager')
    )
  );

-- availability_ranges: whoever reads the submission reads its ranges.
create policy "ranges follow their submission"
  on public.availability_ranges for select to authenticated
  using (
    exists (
      select 1
      from public.availability_submissions s
      where s.id = availability_ranges.submission_id
    )
  );

-- Open the week starting on `week_start` for availability, due at `due_at`
-- (the app works the due moment out from the settings), or return the
-- week that is already open. Refuses a start on the wrong weekday and a
-- business whose scheduling is off. Returns the week id.
create function public.open_schedule_week(
  business uuid,
  week_start date,
  due_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  settings jsonb;
  week_id uuid;
begin
  select bm.settings into settings
  from public.business_modules bm
  where bm.business_id = business
    and bm.module_key = 'scheduling'
    and bm.enabled;

  if not found then
    raise exception 'Scheduling is off for this business' using errcode = '42501';
  end if;

  if week_start is null or due_at is null then
    raise exception 'A week start and a due time are required' using errcode = '22023';
  end if;

  if extract(dow from week_start)::int
    <> coalesce((settings ->> 'weekStartsOn')::int, 0) then
    raise exception 'The week starts on another day' using errcode = '22023';
  end if;

  insert into public.schedule_weeks (business_id, starts_on, availability_due_at)
  values (business, week_start, due_at)
  on conflict (business_id, starts_on) do nothing
  returning id into week_id;

  if week_id is null then
    select w.id into week_id
    from public.schedule_weeks w
    where w.business_id = business and w.starts_on = week_start;
  end if;

  return week_id;
end;
$$;

-- Save the actor's availability for a week, replacing what they sent
-- before. `ranges` is a JSON array of {"day": "YYYY-MM-DD", "start":
-- "HH:MM", "end": "HH:MM"}; an empty array means not available that week.
-- `submitted_at` keeps the first submission, `updated_at` the last.
-- Returns the submission id.
create function public.submit_availability(
  actor uuid,
  week uuid,
  ranges jsonb,
  note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  w public.schedule_weeks%rowtype;
  saved_id uuid;
begin
  select * into w from public.schedule_weeks where id = week;
  if not found then
    raise exception 'Unknown week' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.business_id = w.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Members only' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.business_modules bm
    where bm.business_id = w.business_id
      and bm.module_key = 'scheduling'
      and bm.enabled
  ) then
    raise exception 'Scheduling is off for this business' using errcode = '42501';
  end if;

  if ranges is null or jsonb_typeof(ranges) <> 'array' then
    raise exception 'Ranges must be a list' using errcode = '22023';
  end if;

  if jsonb_array_length(ranges) > 21 then
    raise exception 'Too many ranges' using errcode = '22023';
  end if;

  begin
    perform (r.day)::date, (r.start)::time, (r."end")::time
    from jsonb_to_recordset(ranges) as r(day text, start text, "end" text);
  exception when others then
    raise exception 'Each range needs a day, a start and an end'
      using errcode = '22023';
  end;

  if exists (
    select 1
    from jsonb_to_recordset(ranges) as r(day date, start time, "end" time)
    where r.day is null or r.start is null or r."end" is null
      or r.start = r."end"
  ) then
    raise exception 'Each range needs a day, a start and a different end'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(ranges) as r(day date, start time, "end" time)
    where r.day not between w.starts_on and w.starts_on + 6
  ) then
    raise exception 'A range falls outside the week' using errcode = '22023';
  end if;

  -- Minutes from the day's midnight; an end at or before the start is
  -- the next day.
  if exists (
    with spans as (
      select
        r.n,
        r.day,
        extract(epoch from r.start)::int / 60 as from_minute,
        extract(epoch from r."end")::int / 60
          + case when r."end" <= r.start then 1440 else 0 end as to_minute
      from rows from (
        jsonb_to_recordset(ranges) as (day date, start time, "end" time)
      ) with ordinality as r(day, start, "end", n)
    )
    select 1
    from spans a
    join spans b on a.day = b.day and a.n < b.n
    where a.from_minute < b.to_minute and b.from_minute < a.to_minute
  ) then
    raise exception 'Ranges on the same day overlap' using errcode = '22023';
  end if;

  insert into public.availability_submissions (business_id, week_id, user_id, note)
  values (w.business_id, w.id, actor, nullif(btrim(note), ''))
  on conflict (week_id, user_id) do update
    set note = excluded.note, updated_at = now()
  returning id into saved_id;

  delete from public.availability_ranges ar where ar.submission_id = saved_id;

  insert into public.availability_ranges (submission_id, day, starts_at, ends_at)
  select saved_id, r.day, r.start, r."end"
  from jsonb_to_recordset(ranges) as r(day date, start time, "end" time);

  return saved_id;
end;
$$;

revoke execute on function public.open_schedule_week(uuid, date, timestamptz)
  from public, anon, authenticated;
grant execute on function public.open_schedule_week(uuid, date, timestamptz)
  to service_role;
revoke execute on function public.submit_availability(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.submit_availability(uuid, uuid, jsonb, text)
  to service_role;
