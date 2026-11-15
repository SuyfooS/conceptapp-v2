-- Writing a week in place (the running-week plan's R1a; Orel's answers of
-- 15 November 2026 on #1). Until now every save and publish deleted the whole
-- week and inserted it again with new ids (private.replace_week_schedule),
-- which took every waiting swap request with it and let a builder opened
-- before a change undo that change without a word. Now the week is written
-- shift by shift:
--
--   seen        each shift has a digest of what a screen shows of it (its day,
--               name, hours, people needed, pattern, and its people with their
--               positions), the same text from what is stored and from what is
--               sent, through casts, so "07:00" and "07:00:00" agree
--               (private.shift_digest). A stored position the settings no
--               longer have counts as none, as the builder shows it
--               (private.known_people). public.week_shifts reads a week's
--               shifts with it, in one statement, under the reader's policies.
--   basis       what the screen read: {shift id: its digest}. A save or a
--               publish sends it with the shifts, each shift it read carrying
--               its id. Without one (the demo's renewal, the tests' helpers),
--               the week is replaced as before.
--   the rules   with a basis, an id must be one the screen read, sent once,
--               and a shift of this week (22023). A shift sent as it was read
--               is left alone, whatever happened to it since (a swap approved,
--               someone taken off the team). One sent changed is written in
--               place, its id kept and only the people who changed taken off
--               or put on, while it is still as it was read; one read and not
--               sent is deleted, while it is still as it was read. Otherwise
--               the write is refused with 40001, hint 'moved', and the ids in
--               DETAIL (a JSON array), and nothing is written. A shift read
--               and gone since is skipped when sent unchanged. A shift stored
--               and not read (another manager's) stays. A shift with no id is
--               new. The week as it then stands holds at most 200 shifts;
--               positions are checked on what is written; who is placed by
--               this write must be an active member; and nobody on a shift
--               that is new or moved, and nobody placed by this write, works
--               two shifts at once.
--   swaps       (Orel's answer 2) a waiting request ends only when its shift
--               is deleted, its day or hours change, or whoever asked is taken
--               off it: cancelled, both its people told (swap.removed), and,
--               until a later step keeps their history, the requests of a
--               deleted shift still go with it. A request taken by someone who
--               may no longer take it (put on the shift directly, or now
--               working at the same time) is open again with no taker, its
--               asker told (swap.reopened) and offered again, as a team change
--               does. Every other request waits on, offered only to whoever
--               may still take it.
--   the log     schedule.publish says which shifts were kept, edited, added
--               and removed (ids), the requests it ended (`removed_swaps`, and
--               their count, `swaps_removed`) and opened again (`reopened`),
--               and when (`at`): ids and shifts' days and hours, never a name.
--
-- Both public functions take `basis jsonb default null` and `at_time
-- timestamptz default now()` (logged as `at`; a later step gives it its rule
-- for a week under way), so the three-argument ones are dropped first and
-- every call stays unambiguous. Who may build the week is one helper
-- (private.builds_schedule), for roles and permissions later.
--
-- It replaces, from their latest versions: public.save_week_schedule
-- (20261114000100_team_changes.sql's) and public.publish_week_schedule
-- (20261109000450_notifications.sql's), with the new arguments and the write
-- below; and private.notify_for_team (20261114000100_team_changes.sql's),
-- which now tells of the requests a publish opened again and settles the
-- offers of the ones still open. private.replace_week_schedule
-- (20261103000100_publish_schedule.sql's) is dropped: its rules moved into
-- private.write_week_schedule.

------------------------------------------------------------------------------
-- 1. What a screen saw of a shift

-- A shift's digest: its day, name, hours, people needed, pattern and people
-- (`people` as a payload names them, [{"user", "position"}], in any order),
-- as one text through casts and digested. Stable rather than immutable:
-- jsonb_to_recordset and to_char are. Granted to `authenticated` (and the
-- secret key) because public.week_shifts runs under the reader's policies;
-- it reads no table.
create function private.shift_digest(
  shift_day date,
  shift_name text,
  shift_start time,
  shift_end time,
  shift_needed integer,
  shift_pattern text,
  people jsonb
)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(concat_ws(
    '|',
    to_char(shift_day, 'YYYY-MM-DD'),
    btrim(shift_name),
    to_char(shift_start::interval, 'HH24:MI:SS'),
    to_char(shift_end::interval, 'HH24:MI:SS'),
    shift_needed::text,
    coalesce(shift_pattern, ''),
    coalesce(
      (
        select string_agg(p."user"::text || '=' || coalesce(p.position, ''), ',' order by p."user")
        from jsonb_to_recordset(coalesce(people, '[]'::jsonb)) as p ("user" uuid, position text)
      ),
      ''
    )
  ))
$$;

-- A shift's people as the builder shows them (withKnownPositions in
-- @domain/schedule): a position that is not one of `positions` (the
-- business's scheduling settings' list) is none. A stored shift's digest is of
-- its people this way, so a shift whose position was since taken out of the
-- settings is sent back by an untouched screen as it was read, and kept with
-- its position as stored. Granted as private.shift_digest is; it reads no
-- table.
create function private.known_people(people jsonb, positions jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user', p."user",
        'position', (case
          when exists (
            select 1
            from jsonb_array_elements(coalesce(positions, '[]'::jsonb)) as k (item)
            where k.item ->> 'key' = p.position
          ) then p.position
        end)
      )
    ),
    '[]'::jsonb
  )
  from jsonb_to_recordset(coalesce(people, '[]'::jsonb)) as p ("user" uuid, position text)
$$;

-- The week's stored shifts with their digests, for the write below: of their
-- people as the builder shows them (private.known_people), as
-- public.week_shifts reads them.
create function private.week_digests(week uuid)
returns table (shift_id uuid, digest text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
    private.shift_digest(
      s.day, s.name, s.starts_at, s.ends_at, s.needed, s.pattern_key,
      private.known_people(
        (
          select jsonb_agg(jsonb_build_object('user', a.user_id, 'position', a.position_key))
          from public.shift_assignments a
          where a.shift_id = s.id
        ),
        bm.settings -> 'positions'
      )
    )
  from public.schedule_shifts s
  left join public.business_modules bm
    on bm.business_id = s.business_id and bm.module_key = 'scheduling'
  where s.week_id = week
$$;

-- The shifts a save or a publish sent, one row each, in the order sent (`n`),
-- with their ids (null for a new one), names trimmed, people as sent and
-- digests. Raises on a payload of the wrong shape, which the write below
-- checks first.
create function private.sent_shifts(shifts jsonb)
returns table (
  n bigint,
  id uuid,
  day date,
  name text,
  starts_at time,
  ends_at time,
  needed integer,
  pattern_key text,
  assignees jsonb,
  digest text
)
language sql
stable
set search_path = ''
as $$
  select r.n, r.id, r.day, btrim(r.name), r.start, r."end", r.needed, r.pattern,
    coalesce(r.assignees, '[]'::jsonb),
    private.shift_digest(r.day, r.name, r.start, r."end", r.needed, r.pattern, r.assignees)
  from rows from (
    jsonb_to_recordset(shifts)
      as (id uuid, day date, name text, start time, "end" time, needed integer,
        pattern text, assignees jsonb)
  ) with ordinality as r (id, day, name, start, "end", needed, pattern, assignees, n)
$$;

-- Whether `person` builds the business's schedule: an active owner or manager.
-- The one place the rule lives, for roles and permissions (step 4b).
create function private.builds_schedule(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and m.role in ('owner', 'manager')
  )
$$;

------------------------------------------------------------------------------
-- 2. Reading a week with what was seen

-- A week's shifts as the signed-in person may read them (the policies: its
-- managers and owners, and everyone in the business once it is published),
-- each with its people, by person, and its digest (`seen`), read in one
-- statement so the digest is of what is returned. The people come as stored;
-- the digest is of them as the builder shows them (private.known_people, with
-- the business's settings, which whoever reads its shifts reads too). A JSON
-- array of {"id", "day", "name", "starts_at", "ends_at", "needed",
-- "pattern_key", "assignees": [{"user", "position"}], "seen"}, day by day,
-- earliest first.
create function public.week_shifts(week uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'day', s.day,
        'name', s.name,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'needed', s.needed,
        'pattern_key', s.pattern_key,
        'assignees', p.people,
        'seen', private.shift_digest(
          s.day, s.name, s.starts_at, s.ends_at, s.needed, s.pattern_key,
          private.known_people(p.people, bm.settings -> 'positions')
        )
      )
      order by s.day, s.starts_at, s.name, s.id
    ),
    '[]'::jsonb
  )
  from public.schedule_shifts s
  left join public.business_modules bm
    on bm.business_id = s.business_id and bm.module_key = 'scheduling'
  cross join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('user', a.user_id, 'position', a.position_key)
        order by a.user_id
      ),
      '[]'::jsonb
    ) as people
    from public.shift_assignments a
    where a.shift_id = s.id
  ) p
  where s.week_id = week
$$;

------------------------------------------------------------------------------
-- 3. Writing a week

-- Write the week's schedule as `actor` (the rules at the top), with `shifts`
-- as before ({"day", "name", "start", "end", "needed", "pattern",
-- "assignees": [{"user", "position"}]}, each read shift with its "id") and
-- `basis` the digests the screen read, or null to replace the week. Called by
-- save_week_schedule and publish_week_schedule after they lock the week; it
-- locks the week's shifts and then their waiting requests, in that order.
-- Returns what it did: the week's number of shifts (`shifts`), the ids kept,
-- edited, added and removed, the requests it ended (`removed_swaps`) and
-- opened again (`reopened`), and `at`.
create function private.write_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb,
  basis jsonb,
  at_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.schedule_weeks%rowtype;
  config jsonb;
  replacing boolean := basis is null;
  moved jsonb;
  kept_ids uuid[];
  edited_ids uuid[];
  removed_ids uuid[];
  new_ids jsonb;
  ended jsonb;
  reopened_list jsonb;
  shift_total integer;
begin
  select * into w from public.schedule_weeks wk where wk.id = week;
  if not found then
    raise exception 'Unknown week' using errcode = 'P0002';
  end if;

  if not private.builds_schedule(w.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  select bm.settings into config
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

  if jsonb_array_length(shifts) > 200 then
    raise exception 'Too many shifts' using errcode = '22023';
  end if;

  -- Shape: every field of the right type, every assignee list a list.
  begin
    perform s.id, s.digest from private.sent_shifts(shifts) s;

    perform a."user"
    from jsonb_to_recordset(shifts) as r (assignees jsonb)
    cross join lateral jsonb_to_recordset(coalesce(r.assignees, '[]'::jsonb))
      as a ("user" uuid, position text);
  exception when others then
    raise exception 'Each shift needs a day, a name, a start, an end, the people needed and a list of people'
      using errcode = '22023';
  end;

  -- The basis: an object of shift ids and their digests.
  if basis is not null then
    begin
      perform b.key::uuid from jsonb_each(basis) b;
    exception when others then
      raise exception 'What was read must be shift ids and digests' using errcode = '22023';
    end;

    if exists (
      select 1 from jsonb_each(basis) b where jsonb_typeof(b.value) <> 'string'
    ) then
      raise exception 'What was read must be shift ids and digests' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from private.sent_shifts(shifts) s
    where s.day is null or s.starts_at is null or s.ends_at is null
      or s.starts_at = s.ends_at
      or s.name is null or char_length(s.name) not between 1 and 40
      or s.needed is null or s.needed not between 1 and 50
      or (s.pattern_key is not null
        and (s.pattern_key !~ '^[a-z][a-z0-9-]*$' or char_length(s.pattern_key) > 40))
  ) then
    raise exception 'Each shift needs a day, a name, a start, a different end and 1 to 50 people'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from private.sent_shifts(shifts) s
    where s.day not between w.starts_on and w.starts_on + 6
  ) then
    raise exception 'A shift falls outside the week' using errcode = '22023';
  end if;

  if exists (
    select 1
    from private.sent_shifts(shifts) s
    cross join lateral jsonb_to_recordset(s.assignees) as a ("user" uuid, position text)
    group by s.n, a."user"
    having a."user" is null or count(*) > 1
  ) then
    raise exception 'Each person needs an id and is on a shift once' using errcode = '22023';
  end if;

  -- An id is a shift the screen read, of this week, sent once.
  if exists (
    select 1
    from private.sent_shifts(shifts) s
    where s.id is not null
    group by s.id
    having count(*) > 1
  ) or exists (
    select 1
    from private.sent_shifts(shifts) s
    where s.id is not null
      and not exists (
        select 1
        from jsonb_object_keys(coalesce(basis, '{}'::jsonb)) as b (shift_key)
        where b.shift_key::uuid = s.id
      )
  ) or exists (
    select 1
    from jsonb_object_keys(coalesce(basis, '{}'::jsonb)) as b (shift_key)
    join public.schedule_shifts o on o.id = b.shift_key::uuid
    where o.week_id <> w.id
  ) then
    raise exception 'A shift sent is not one this week''s screen read' using errcode = '22023';
  end if;

  -- The week's shifts, then their waiting requests: a request asked, taken or
  -- decided meanwhile finishes first, and everything below reads it.
  perform 1 from public.schedule_shifts s where s.week_id = w.id for update;
  perform 1
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where s.week_id = w.id and sw.status in ('open', 'taken')
  for update of sw;

  -- What happens to each shift: kept as stored, edited in place, removed, or
  -- moved since it was read (the write is refused).
  with seen as (
    select b.key::uuid as shift_id, b.value as digest
    from jsonb_each_text(coalesce(basis, '{}'::jsonb)) b
  ),
  stored as (
    select d.shift_id, d.digest from private.week_digests(w.id) d
  ),
  sent as (
    select s.id, s.digest from private.sent_shifts(shifts) s where s.id is not null
  ),
  verdicts as (
    select st.shift_id,
      (case
        when replacing then 'removed'
        -- Stored and not read: another manager's, kept.
        when seen.shift_id is null then 'kept'
        -- Sent as it was read: left alone, whatever happened since.
        when sent.id is not null and sent.digest = seen.digest then 'kept'
        when st.digest <> seen.digest then 'moved'
        when sent.id is null then 'removed'
        else 'edited'
      end) as verdict
    from stored st
    left join seen on seen.shift_id = st.shift_id
    left join sent on sent.id = st.shift_id
    union all
    -- Sent with the id of a shift gone since: skipped when unchanged.
    select sent.id, (case when sent.digest = seen.digest then 'gone' else 'moved' end)
    from sent
    join seen on seen.shift_id = sent.id
    where not exists (select 1 from stored st where st.shift_id = sent.id)
  )
  select
    coalesce(array_agg(v.shift_id order by v.shift_id) filter (where v.verdict = 'kept'), '{}'::uuid[]),
    coalesce(array_agg(v.shift_id order by v.shift_id) filter (where v.verdict = 'edited'), '{}'::uuid[]),
    coalesce(array_agg(v.shift_id order by v.shift_id) filter (where v.verdict = 'removed'), '{}'::uuid[]),
    jsonb_agg(v.shift_id order by v.shift_id) filter (where v.verdict = 'moved')
  into kept_ids, edited_ids, removed_ids, moved
  from verdicts v;

  if moved is not null then
    raise exception 'Shifts changed since they were read'
      using errcode = '40001', hint = 'moved', detail = moved::text;
  end if;

  -- The week as it will stand.
  shift_total := (
      select count(*)::integer from public.schedule_shifts s where s.week_id = w.id
    )
    - cardinality(removed_ids)
    + (select count(*)::integer from private.sent_shifts(shifts) s where s.id is null);

  if shift_total > 200 then
    raise exception 'Too many shifts' using errcode = '22023';
  end if;

  -- What is written: the shifts edited and the new ones.
  if exists (
    select 1
    from private.sent_shifts(shifts) s
    cross join lateral jsonb_to_recordset(s.assignees) as a ("user" uuid, position text)
    where (s.id is null or s.id = any (edited_ids))
      and a.position is not null
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(config -> 'positions', '[]'::jsonb)) as p (item)
        where p.item ->> 'key' = a.position
      )
  ) then
    raise exception 'Unknown position' using errcode = '22023';
  end if;

  -- Who this write puts on a shift: an active member. Who stays where they
  -- were is not put on again.
  if exists (
    select 1
    from private.sent_shifts(shifts) s
    cross join lateral jsonb_to_recordset(s.assignees) as a ("user" uuid, position text)
    where (s.id is null or s.id = any (edited_ids))
      and not exists (
        select 1 from public.shift_assignments sa
        where sa.shift_id = s.id and sa.user_id = a."user"
      )
      and not exists (
        select 1
        from public.memberships m
        where m.business_id = w.business_id and m.user_id = a."user" and m.active
      )
  ) then
    raise exception 'Only active members of the business can work a shift'
      using errcode = '22023';
  end if;

  -- Nobody works two shifts at once: everyone on a shift that is new or whose
  -- day or hours changed, and everyone this write puts on a shift, against
  -- the week as it will stand. Spans in minutes from the week's first
  -- midnight (an end at or before the start is the next day).
  if exists (
    with placed as (
      select s.id::text as shift_key, a.user_id as person, s.day, s.starts_at, s.ends_at,
        false as checked
      from public.schedule_shifts s
      join public.shift_assignments a on a.shift_id = s.id
      where s.week_id = w.id
        and s.id <> all (removed_ids)
        and s.id <> all (edited_ids)
      union all
      select coalesce(s.id::text, 'new:' || s.n::text), a."user", s.day, s.starts_at, s.ends_at,
        s.id is null
          or not exists (
            select 1 from public.shift_assignments sa
            where sa.shift_id = s.id and sa.user_id = a."user"
          )
          or exists (
            select 1 from public.schedule_shifts o
            where o.id = s.id
              and (o.day, o.starts_at, o.ends_at) is distinct from (s.day, s.starts_at, s.ends_at)
          )
      from private.sent_shifts(shifts) s
      cross join lateral jsonb_to_recordset(s.assignees) as a ("user" uuid, position text)
      where s.id is null or s.id = any (edited_ids)
    ),
    spans as (
      select p.shift_key, p.person, p.checked,
        (p.day - w.starts_on) * 1440 + extract(epoch from p.starts_at)::integer / 60 as from_minute,
        (p.day - w.starts_on) * 1440 + extract(epoch from p.ends_at)::integer / 60
          + (case when p.ends_at <= p.starts_at then 1440 else 0 end) as to_minute
      from placed p
    )
    select 1
    from spans x
    join spans y on x.person = y.person and x.shift_key < y.shift_key
    where (x.checked or y.checked)
      and x.from_minute < y.to_minute and y.from_minute < x.to_minute
  ) then
    raise exception 'A person works two shifts at once' using errcode = '22023';
  end if;

  -- The waiting requests this write ends (Orel's answer 2): on a shift it
  -- deletes, one whose day or hours it changes, or one it takes their asker
  -- off. Read before anything moves, as every member read the shift.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sw.id,
        'requested_by', sw.requested_by,
        'taken_by', sw.taken_by,
        'shift', private.shift_brief(sw.shift_id)
      )
      order by sw.created_at, sw.id
    ),
    '[]'::jsonb
  )
  into ended
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where s.week_id = w.id
    and sw.status in ('open', 'taken')
    and (
      s.id = any (removed_ids)
      or exists (
        select 1
        from private.sent_shifts(shifts) x
        where x.id = s.id
          and s.id = any (edited_ids)
          and (
            (x.day, x.starts_at, x.ends_at) is distinct from (s.day, s.starts_at, s.ends_at)
            or not exists (
              select 1
              from jsonb_to_recordset(x.assignees) as a ("user" uuid, position text)
              where a."user" = sw.requested_by
            )
          )
      )
    );

  update public.shift_swaps sw
  set status = 'cancelled'
  where sw.id in (
    select (e.value ->> 'id')::uuid from jsonb_array_elements(ended) as e (value)
  );

  -- Until their history is kept, a deleted shift's requests go with it.
  delete from public.schedule_shifts s where s.id = any (removed_ids);

  update public.schedule_shifts o
  set day = x.day,
    name = x.name,
    starts_at = x.starts_at,
    ends_at = x.ends_at,
    needed = x.needed,
    pattern_key = x.pattern_key
  from private.sent_shifts(shifts) x
  where o.id = x.id and o.id = any (edited_ids);

  -- On a shift edited, only the people who changed: off, a new position, on.
  delete from public.shift_assignments a
  where a.shift_id = any (edited_ids)
    and not exists (
      select 1
      from private.sent_shifts(shifts) x
      cross join lateral jsonb_to_recordset(x.assignees) as p ("user" uuid, position text)
      where x.id = a.shift_id and p."user" = a.user_id
    );

  update public.shift_assignments a
  set position_key = p.position
  from private.sent_shifts(shifts) x
  cross join lateral jsonb_to_recordset(x.assignees) as p ("user" uuid, position text)
  where x.id = a.shift_id
    and a.shift_id = any (edited_ids)
    and p."user" = a.user_id
    and a.position_key is distinct from p.position;

  insert into public.shift_assignments (shift_id, business_id, user_id, position_key)
  select x.id, w.business_id, p."user", p.position
  from private.sent_shifts(shifts) x
  cross join lateral jsonb_to_recordset(x.assignees) as p ("user" uuid, position text)
  where x.id = any (edited_ids)
    and not exists (
      select 1 from public.shift_assignments a
      where a.shift_id = x.id and a.user_id = p."user"
    );

  -- The new shifts, their ids drawn first so each person lands on their own.
  select coalesce(jsonb_object_agg(x.n::text, gen_random_uuid()), '{}'::jsonb)
  into new_ids
  from private.sent_shifts(shifts) x
  where x.id is null;

  insert into public.schedule_shifts
    (id, business_id, week_id, day, pattern_key, name, starts_at, ends_at, needed)
  select (new_ids ->> x.n::text)::uuid, w.business_id, w.id, x.day, x.pattern_key, x.name,
    x.starts_at, x.ends_at, x.needed
  from private.sent_shifts(shifts) x
  where x.id is null;

  insert into public.shift_assignments (shift_id, business_id, user_id, position_key)
  select (new_ids ->> x.n::text)::uuid, w.business_id, p."user", p.position
  from private.sent_shifts(shifts) x
  cross join lateral jsonb_to_recordset(x.assignees) as p ("user" uuid, position text)
  where x.id is null;

  update public.schedule_weeks wk set schedule_saved_at = now() where wk.id = w.id;

  -- A request taken by someone who may no longer take it (put on the shift,
  -- or working at the same time now): open again with no taker, as a team
  -- change opens it (private.leave_staff). Read after the writes above.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sw.id,
        'requested_by', sw.requested_by,
        'shift', private.shift_brief(sw.shift_id)
      )
      order by sw.created_at, sw.id
    ),
    '[]'::jsonb
  )
  into reopened_list
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where s.week_id = w.id
    and sw.status = 'taken'
    and not private.can_take(sw.shift_id, sw.taken_by);

  update public.shift_swaps sw
  set status = 'open', taken_by = null, taken_at = null
  where sw.id in (
    select (r.value ->> 'id')::uuid from jsonb_array_elements(reopened_list) as r (value)
  );

  return jsonb_build_object(
    'shifts', shift_total,
    'kept', to_jsonb(kept_ids),
    'edited', to_jsonb(edited_ids),
    'added', (
      select coalesce(jsonb_agg(i.value order by i.key::integer), '[]'::jsonb)
      from jsonb_each(new_ids) as i
    ),
    'removed', to_jsonb(removed_ids),
    'removed_swaps', ended,
    'reopened', reopened_list,
    'at', at_time
  );
end;
$$;

------------------------------------------------------------------------------
-- 4. Saving and publishing

drop function public.save_week_schedule(uuid, uuid, jsonb);
drop function public.publish_week_schedule(uuid, uuid, jsonb);

-- 20261114000100_team_changes.sql's, the same (the week locked first, the
-- rules before anything is said of the week, a published week refused), with
-- the basis and the moment, through the write above.
create function public.save_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb,
  basis jsonb default null,
  at_time timestamptz default now()
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  written jsonb;
begin
  perform 1 from public.schedule_weeks w where w.id = week for update;

  -- The rules first, so a worker or a stranger learns nothing about the
  -- week; an error below undoes the write.
  written := private.write_week_schedule(actor, week, shifts, basis, at_time);

  if exists (
    select 1 from public.schedule_weeks w
    where w.id = week and w.schedule_published_at is not null
  ) then
    raise exception 'This week is published; publish the changes instead'
      using errcode = '55000';
  end if;

  return (written ->> 'shifts')::int;
end;
$$;

-- 20261109000450_notifications.sql's, the same (the week locked, whose shifts
-- changed), with the basis and the moment: the write locks the shifts and
-- their requests and says which it ended, and the log row says what it did.
create function public.publish_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb,
  basis jsonb default null,
  at_time timestamptz default now()
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.schedule_weeks%rowtype;
  written jsonb;
  before_people jsonb;
  after_people jsonb;
  changed jsonb;
begin
  -- Locked, so what's logged is what happened, in the order of
  -- 20261109000450_notifications.sql's version: the week (two publishes of it
  -- take turns), its shifts, then their waiting requests, before whose shifts
  -- are read. A decision on a request under way finishes first, so both sides
  -- of `changed` see it, and one after waits until this is done. The write
  -- takes the same locks again, already held. Nothing read here is returned,
  -- and the write refuses anyone who may not publish, so it tells a stranger
  -- nothing.
  select * into w from public.schedule_weeks where id = week for update;
  perform 1 from public.schedule_shifts s where s.week_id = week for update;
  perform 1
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where s.week_id = week and sw.status in ('open', 'taken')
  for update of sw;

  before_people := private.week_people(week);

  written := private.write_week_schedule(actor, week, shifts, basis, at_time);

  after_people := private.week_people(week);

  -- Someone whose line of shifts differs, or who is on one side only.
  select coalesce(jsonb_agg(everyone.person order by everyone.person), '[]'::jsonb)
  into changed
  from (
    select p.key as person from jsonb_each(before_people) p
    union
    select p.key from jsonb_each(after_people) p
  ) everyone
  where (before_people -> everyone.person) is distinct from (after_people -> everyone.person);

  update public.schedule_weeks
  set schedule_published_at = now()
  where id = week;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    w.business_id, actor, 'schedule.publish',
    jsonb_build_object(
      'week', week,
      'starts_on', w.starts_on,
      'shifts', (written ->> 'shifts')::int,
      'first', w.schedule_published_at is null,
      'swaps_removed', jsonb_array_length(written -> 'removed_swaps'),
      'changed', changed,
      'removed_swaps', written -> 'removed_swaps',
      'reopened', written -> 'reopened',
      'kept', written -> 'kept',
      'edited', written -> 'edited',
      'added', written -> 'added',
      'removed', written -> 'removed',
      'at', at_time
    )
  );

  return (written ->> 'shifts')::int;
end;
$$;

-- Its rules live in private.write_week_schedule now.
drop function private.replace_week_schedule(uuid, uuid, jsonb);

------------------------------------------------------------------------------
-- 5. What a publish tells of the requests it opened again

-- 20261114000100_team_changes.sql's, the same for a team change, and for a
-- publish: besides settling the week's schedule.unfilled lines, the requests
-- it opened again are told and offered as a team change's are (the same
-- loop), and every request still open on the week is no longer offered to
-- whoever may not take it now (on the shift, or working at the same time).
create or replace function private.notify_for_team(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := entry.details;
  b uuid := entry.business_id;
  moment timestamptz;
  week_row record;
  gaps integer;
  gone jsonb;
  reopen jsonb;
  w public.shift_swaps%rowtype;
begin
  moment := coalesce((d ->> 'at')::timestamptz, entry.created_at);

  if entry.action = 'schedule.publish' then
    perform private.resolve_notifications(b, 'schedule.unfilled:' || (d ->> 'week'));
  else
    for week_row in
      select t.value ->> 'week' as week_key, min(t.value ->> 'starts_on') as first_day
      from jsonb_array_elements(coalesce(d -> 'shifts', '[]'::jsonb)) as t (value)
      where t.value ->> 'week' is not null
      group by t.value ->> 'week'
      order by min(t.value ->> 'starts_on')
    loop
      gaps := private.unfilled_shifts(week_row.week_key::uuid, moment);
      if gaps > 0 then
        perform private.notify(
          b, private.members_in(b, '{owner,manager}'::public.member_role[]),
          'schedule.unfilled'::text,
          jsonb_build_object(
            'week', week_row.week_key,
            'startsOn', week_row.first_day,
            'count', gaps
          ),
          entry.actor_id, 'scheduling'::public.module_key, 'manager'::public.member_role,
          'schedule.unfilled:' || week_row.week_key,
          at_time => moment
        );
      else
        perform private.resolve_notifications(
          b, 'schedule.unfilled:' || week_row.week_key, moment
        );
      end if;
    end loop;

    for gone in
      select g.value
      from jsonb_array_elements(coalesce(d -> 'swaps', '[]'::jsonb)) as g (value)
    loop
      perform private.notify(
        b,
        array[(gone ->> 'requested_by')::uuid, (gone ->> 'taken_by')::uuid],
        'swap.removed'::text,
        jsonb_build_object('swap', gone -> 'id', 'shift', gone -> 'shift'),
        entry.actor_id, 'scheduling'::public.module_key, 'worker'::public.member_role,
        'swap:' || (gone ->> 'id'),
        at_time => moment
      );
      perform private.resolve_notifications(b, 'swap.offer:' || (gone ->> 'id'), moment);
      perform private.resolve_notifications(b, 'swap.approval:' || (gone ->> 'id'), moment);
    end loop;
  end if;

  for reopen in
    select g.value
    from jsonb_array_elements(coalesce(d -> 'reopened', '[]'::jsonb)) as g (value)
  loop
    -- An owner or a manager gives shifts away too, so who made the change may
    -- be who asked: their line said it was taken, and is written for them as
    -- well, with no actor (private.notify leaves the actor out).
    perform private.notify(
      b,
      array[(reopen ->> 'requested_by')::uuid],
      'swap.reopened'::text,
      jsonb_build_object('swap', reopen -> 'id', 'shift', reopen -> 'shift'),
      nullif(entry.actor_id, (reopen ->> 'requested_by')::uuid),
      'scheduling'::public.module_key, 'worker'::public.member_role,
      'swap:' || (reopen ->> 'id'),
      at_time => moment
    );
    perform private.resolve_notifications(b, 'swap.approval:' || (reopen ->> 'id'), moment);

    select * into w
    from public.shift_swaps sw
    where sw.id = (reopen ->> 'id')::uuid and sw.status = 'open';
    if found then
      perform private.notify(
        b,
        array(
          select m.user_id from public.memberships m
          where m.business_id = b and m.active and m.user_id <> w.requested_by
            and private.can_take(w.shift_id, m.user_id)
        ),
        'swap.offered'::text,
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'from', w.requested_by
        ),
        w.requested_by, 'scheduling'::public.module_key, 'worker'::public.member_role,
        'swap.offer:' || w.id,
        at_time => moment
      );
    end if;
  end loop;

  -- A publish: who may take each request still open on the week follows the
  -- schedule as it is now.
  if entry.action = 'schedule.publish' then
    for w in
      select sw.*
      from public.shift_swaps sw
      join public.schedule_shifts s on s.id = sw.shift_id
      where s.week_id = (d ->> 'week')::uuid and sw.status = 'open'
    loop
      perform private.resolve_notifications(
        b, 'swap.offer:' || w.id, moment,
        array(
          select m.user_id from public.memberships m
          where m.business_id = b and m.active and m.user_id <> w.requested_by
            and private.can_take(w.shift_id, m.user_id)
        )
      );
    end loop;
  end if;

  if d ? 'person'
    and not private.holds_perm(b, (d ->> 'person')::uuid, 'clock.payroll'::text)
  then
    perform private.resolve_notifications(b, 'access.pay:' || (d ->> 'person'), moment);
  end if;
end;
$$;

------------------------------------------------------------------------------
-- Grants

-- The new private helpers: nobody but the database's own, but the digest,
-- which public.week_shifts runs under the reader's own role.
revoke execute on function private.shift_digest(date, text, time, time, integer, text, jsonb)
  from public, anon;
grant execute on function private.shift_digest(date, text, time, time, integer, text, jsonb)
  to authenticated, service_role;
revoke execute on function private.known_people(jsonb, jsonb)
  from public, anon;
grant execute on function private.known_people(jsonb, jsonb)
  to authenticated, service_role;
revoke execute on function private.week_digests(uuid)
  from public, anon, authenticated;
revoke execute on function private.sent_shifts(jsonb)
  from public, anon, authenticated;
revoke execute on function private.builds_schedule(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.write_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

-- Replaced in place (section 5): its grants stay; revoked again all the same.
revoke execute on function private.notify_for_team(public.audit_log)
  from public, anon, authenticated;

-- The reading: anyone signed in, under the policies.
revoke execute on function public.week_shifts(uuid) from public, anon;
grant execute on function public.week_shifts(uuid) to authenticated, service_role;

-- Dropped and made again with two more arguments (section 4): the secret key's
-- alone, as before.
revoke execute on function public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)
  to service_role;
revoke execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)
  to service_role;
