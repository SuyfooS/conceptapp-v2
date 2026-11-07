-- Templates for every kind of business (stage 2 of docs/ROADMAP.md), and demo
-- businesses that can be put back as they were.
--
--   general         a business of any kind: the schedule and the time clock,
--                   with positions and shifts left for the business to fill in
--                   from /manage/scheduling (the manifest's defaults, empty).
--   retail          a shop: shop positions, morning and evening shifts, a
--                   short Friday, closed on Shabbat (the manifest's default).
--   restaurant v2,  stop switching on what isn't built yet (reservations, the
--   cafe-bar v2     public page, notifications), so a business never gets a tab
--                   that leads to an empty screen. Their settings stay in the
--                   template for when those modules arrive.
--   existing        businesses already set up get the same: those three
--   businesses      modules off. The ConceptApp team can switch one back on
--                   from the console.
--   demo reset      private.demo_businesses holds how each demo business
--                   starts (written by supabase/seed.sql and
--                   supabase/hosted-demo.sql), and public.reset_demo_business
--                   puts one back: details, template and people, with nothing
--                   else left. A demo business that renews always has this
--                   week's schedule published (public.renew_demo_schedules).

insert into public.templates (key, version, definition)
values
  ('general', 1, $json$
  {
    "modules": {
      "scheduling": { "enabled": true, "settings": {} },
      "time_clock": { "enabled": true, "settings": {} }
    },
    "openingHours": []
  }
  $json$::jsonb),
  ('retail', 1, $json$
  {
    "modules": {
      "scheduling": {
        "enabled": true,
        "settings": {
          "positions": [
            { "key": "cashier", "name": "קופאי/ת" },
            { "key": "sales", "name": "מוכר/ת" },
            { "key": "stock", "name": "מחסנאי/ת" },
            { "key": "lead", "name": "אחראי/ת משמרת" }
          ],
          "shifts": [
            { "key": "morning", "name": "בוקר", "days": [0, 1, 2, 3, 4], "start": "08:00", "end": "15:00", "needed": 2 },
            { "key": "evening", "name": "ערב", "days": [0, 1, 2, 3, 4], "start": "15:00", "end": "22:00", "needed": 2 },
            { "key": "friday", "name": "שישי", "days": [5], "start": "08:00", "end": "14:00", "needed": 3 }
          ]
        }
      },
      "time_clock": { "enabled": true, "settings": {} }
    },
    "openingHours": [
      { "day": 0, "open": "09:00", "close": "21:00" },
      { "day": 1, "open": "09:00", "close": "21:00" },
      { "day": 2, "open": "09:00", "close": "21:00" },
      { "day": 3, "open": "09:00", "close": "21:00" },
      { "day": 4, "open": "09:00", "close": "21:00" },
      { "day": 5, "open": "09:00", "close": "14:00" }
    ]
  }
  $json$::jsonb);

update public.templates t
set version = t.version + 1,
  definition = jsonb_set(
    jsonb_set(
      jsonb_set(t.definition, '{modules,reservations,enabled}', 'false'),
      '{modules,storefront,enabled}', 'false'),
    '{modules,notifications,enabled}', 'false')
where t.key in ('restaurant', 'cafe-bar');

update public.business_modules bm
set enabled = false
where bm.module_key in ('reservations', 'storefront', 'notifications')
  and bm.enabled;

-- How each demo business starts. Only server functions read it: browser roles
-- have usage on the private schema, so the table itself grants them nothing.
--   definition  {slug, name, accent, address, shabbat_city, template, renews,
--                people: [{user_id, role, name}]}
--   reset_at    the last reset, so presses a few seconds apart reset once.
create table private.demo_businesses (
  business_id uuid primary key,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  reset_at timestamptz
);

alter table private.demo_businesses enable row level security;
revoke all on private.demo_businesses from public, anon, authenticated;

comment on table private.demo_businesses is
  'How each demo business starts, for public.reset_demo_business. Written by supabase/seed.sql and supabase/hosted-demo.sql.';

-- Publishes this week's schedule for one demo business, if it is not published
-- yet, from the business's own shift patterns as they are now. People are
-- picked in turn from its managers and workers (owners do not fill shifts), at
-- most one shift a day each and never two that overlap; positions are given in
-- turn too. A shift there are not enough people for is published short, as a
-- manager might. Each publish is logged as the owner's, like any other.
-- Returns whether it published.
create function private.renew_demo_schedule(business uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  sched jsonb;
  tz text;
  first_day integer;
  today date;
  week_start date;
  week uuid;
  actor uuid;
  staff uuid[];
  positions text[];
  shifts jsonb := '[]'::jsonb;
  pattern record;
  assignees jsonb;
  candidate uuid;
  picked integer;
  tries integer;
  next_person integer := 0;
  next_position integer := 0;
  span_from integer;
  span_to integer;
  taken_user uuid[] := '{}';
  taken_day date[] := '{}';
  taken_from integer[] := '{}';
  taken_to integer[] := '{}';
begin
  select m.settings, b.timezone into sched, tz
  from public.businesses b
  join public.business_modules m
    on m.business_id = b.id and m.module_key = 'scheduling' and m.enabled
  where b.id = business;
  if not found
    or jsonb_array_length(coalesce(sched -> 'shifts', '[]'::jsonb)) = 0 then
    return false;
  end if;

  select m.user_id into actor
  from public.memberships m
  where m.business_id = business and m.active and m.role in ('owner', 'manager')
  order by m.role = 'owner' desc, m.created_at, m.user_id
  limit 1;
  if actor is null then
    return false;
  end if;

  first_day := coalesce((sched ->> 'weekStartsOn')::integer, 0);
  today := (now() at time zone tz)::date;
  week_start := today - ((extract(dow from today)::integer - first_day + 7) % 7);
  week := public.open_schedule_week(business, week_start, now());

  -- Under the week's lock, so two renewals at once publish it once.
  perform 1 from public.schedule_weeks w
  where w.id = week and w.schedule_published_at is null
  for update;
  if not found then
    return false;
  end if;

  select coalesce(
    array_agg(m.user_id order by m.role = 'manager' desc, m.created_at, m.user_id),
    '{}')
  into staff
  from public.memberships m
  where m.business_id = business and m.active and m.role in ('manager', 'worker');

  select coalesce(array_agg(p.value ->> 'key' order by p.ordinality), '{}')
  into positions
  from jsonb_array_elements(coalesce(sched -> 'positions', '[]'::jsonb))
    with ordinality as p (value, ordinality);

  for pattern in
    select s.value ->> 'key' as key,
      s.value ->> 'name' as name,
      s.value ->> 'start' as starts,
      s.value ->> 'end' as ends,
      (s.value ->> 'needed')::integer as needed,
      week_start + ((d.value::integer - first_day + 7) % 7) as day
    from jsonb_array_elements(sched -> 'shifts') as s (value),
      jsonb_array_elements_text(s.value -> 'days') as d (value)
    order by day, starts, key
  loop
    -- The shift's span in minutes from the week's first midnight; one that
    -- ends at or before its start runs past midnight.
    span_from := (pattern.day - week_start) * 1440
      + extract(hour from pattern.starts::time)::integer * 60
      + extract(minute from pattern.starts::time)::integer;
    span_to := (pattern.day - week_start) * 1440
      + extract(hour from pattern.ends::time)::integer * 60
      + extract(minute from pattern.ends::time)::integer;
    if pattern.ends::time <= pattern.starts::time then
      span_to := span_to + 1440;
    end if;

    assignees := '[]'::jsonb;
    picked := 0;
    tries := 0;
    while picked < pattern.needed and tries < cardinality(staff) loop
      candidate := staff[next_person % cardinality(staff) + 1];
      next_person := next_person + 1;
      tries := tries + 1;
      if not exists (
        select 1
        from unnest(taken_user, taken_day, taken_from, taken_to)
          as t (person, on_day, from_minute, to_minute)
        where t.person = candidate
          and (t.on_day = pattern.day
            or (t.from_minute < span_to and span_from < t.to_minute))
      ) then
        assignees := assignees || jsonb_build_array(jsonb_build_object(
          'user', candidate,
          'position', case when cardinality(positions) = 0 then null
            else positions[next_position % cardinality(positions) + 1] end
        ));
        next_position := next_position + 1;
        picked := picked + 1;
        taken_user := taken_user || candidate;
        taken_day := taken_day || pattern.day;
        taken_from := taken_from || span_from;
        taken_to := taken_to || span_to;
      end if;
    end loop;

    shifts := shifts || jsonb_build_array(jsonb_build_object(
      'day', pattern.day::text,
      'name', pattern.name,
      'start', pattern.starts,
      'end', pattern.ends,
      'needed', pattern.needed,
      'pattern', pattern.key,
      'assignees', assignees
    ));
  end loop;

  perform public.publish_week_schedule(actor, week, shifts);
  return true;
end;
$$;

revoke execute on function private.renew_demo_schedule(uuid)
  from public, anon, authenticated;

-- Renews every demo business that renews (private.renew_demo_schedule). The app
-- calls it at the door, and on Today when a demo business's week is not
-- published. Returns how many weeks it published.
create function public.renew_demo_schedules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo uuid;
  published integer := 0;
begin
  for demo in
    select d.business_id
    from private.demo_businesses d
    join public.businesses b on b.id = d.business_id
    where coalesce((d.definition ->> 'renews')::boolean, false)
    order by d.business_id
  loop
    if private.renew_demo_schedule(demo) then
      published := published + 1;
    end if;
  end loop;
  return published;
end;
$$;

revoke execute on function public.renew_demo_schedules()
  from public, anon, authenticated;
grant execute on function public.renew_demo_schedules() to service_role;

-- Puts one demo business back the way it starts. Deleting it clears everything
-- that belongs to it (people's places in it, settings, schedules, swaps, hours,
-- invites, views, its log), and it is made again with the same id and slug,
-- from its template, with its people. Their names, language and photo go back
-- too; a photo file stays in Storage, unreferenced.
create function public.reset_demo_business(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
begin
  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business
  for update;
  if not found then
    raise exception 'Not a demo business: %', business using errcode = 'P0002';
  end if;

  delete from public.businesses b where b.id = business;

  insert into public.businesses (id, slug, name, accent, address, shabbat_city)
  values (
    business, def ->> 'slug', def ->> 'name', def ->> 'accent',
    def ->> 'address', def ->> 'shabbat_city'
  );
  perform public.apply_template(business, def ->> 'template');

  insert into public.memberships (business_id, user_id, role)
  select business, person.user_id, person.role
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  join public.profiles p on p.id = person.user_id;

  update public.profiles p
  set full_name = person.name, locale = 'he', avatar_path = null
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  where p.id = person.user_id;

  update private.demo_businesses d
  set reset_at = now()
  where d.business_id = business;

  if coalesce((def ->> 'renews')::boolean, false) then
    perform private.renew_demo_schedule(business);
  end if;
end;
$$;

revoke execute on function public.reset_demo_business(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_demo_business(uuid) to service_role;

-- The door's reset: every demo business, except one reset in the last few
-- seconds (a second press, or two visitors at once). Returns how many it reset.
create function public.reset_demo_businesses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo uuid;
  done integer := 0;
begin
  for demo in
    select d.business_id
    from private.demo_businesses d
    where d.reset_at is null or d.reset_at < now() - interval '10 seconds'
    order by d.business_id
    for update skip locked
  loop
    perform public.reset_demo_business(demo);
    done := done + 1;
  end loop;
  return done;
end;
$$;

revoke execute on function public.reset_demo_businesses()
  from public, anon, authenticated;
grant execute on function public.reset_demo_businesses() to service_role;

comment on table public.audit_log is
  'Append-only record of what changed in a business: written only by server functions, read by its owners and managers (and by a view as one of them). The one exception: resetting a demo business (public.reset_demo_business) clears its log with it.';
