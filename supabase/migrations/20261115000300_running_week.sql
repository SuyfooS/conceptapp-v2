-- What has begun stays as it was (the running-week plan's R2a; Orel's answer
-- to Q1 of 15 November 2026 on #1: a shift that has begun only takes more
-- people; its hours, who is on it, and shifts already ended stay as they
-- are). The builder doesn't open the week under way yet (R3a); this is the
-- database's rule for it, which every save and publish follows from now on.
--
--   moment      every write is at a moment, `at_time` (now() unless given):
--               a null one is refused (22023), since every rule below reads
--               it.
--   begun       in a published week, a shift whose start (its day and start
--               on the business's clock, the moment private.shift_span and a
--               swap's rules start it at, read here from the shift itself, so
--               that a shift the spring change turns inside out, 02:30 to
--               03:00 that night, holds up no write of its week) is at or
--               before `at_time` has begun, and it is never
--               rewritten. Not read by the screen, or sent as it was read, or
--               left out of a week replaced with nothing read (the demo's
--               renewal, the tests' helpers), it is kept: its id, its people
--               (someone who has left since, or is now the accountant,
--               included: private.leave_staff leaves them on what has begun)
--               and its swap requests, which no write ends or opens again.
--               Read and sent changed, or read and left out (a removal), the
--               write is refused: 55006, hint 'started', the ids in DETAIL (a
--               JSON array), nothing written. A screen that shows a shift as
--               begun leaves it out of both what it sends and what it read.
--   joins       people go on a shift under way only through `joins`
--               ([{"shift", "user", "position"}], a separate argument, so the
--               shift itself is never sent): a shift of this week that has
--               begun and not ended (its end, the next day when it ends at or
--               before its start, after `at_time`; one that has ended: 55006,
--               hint 'ended', its ids), someone not already on it, a known
--               position or none, an
--               active member on the staff, and nobody then on two shifts at
--               once. A week not published has nothing under way, so it takes
--               no joins (22023).
--   past        in a published week, a shift this write puts in place (a new
--               one, or one still to start written again) starts after
--               `at_time`: 22023, hint 'past', DETAIL a JSON array of
--               {"id" (null for a new one), "day", "start"}.
--   over        a published week that has wholly ended (`at_time` at or past
--               both its next week's first midnight, in the business's zone,
--               and the end of its last shift, so a night shift on its last
--               day takes people until it ends) no longer changes: 55000, hint
--               'over'. A save of a published week is refused with 55000 and
--               no hint, as before, after these rules.
--   never published
--               a week never published is free: its first publish, even in
--               the middle of the week, publishes it as it stands, begun and
--               ended shifts included, and a draft changes as before.
--   the log     schedule.publish says whether the week had begun at `at_time`
--               (`running`) and who joined which shift (`joined`, ids only).
--   lists       schedule_shifts.opens_lists_from: from when a shift's lists
--               count. A write sets it to `at_time` on a shift it adds, moves
--               in its day or hours, or gives another pattern (which brings it
--               into that pattern's lists), and a week's first publish raises
--               it to `at_time` on every shift of the week, so a first publish
--               in the middle of the week, or a shift added today, opens no
--               list that would already be late: private.list_occurrences
--               opens nothing due before it, as list_schedules.opens_from
--               keeps a time saved after its hour from opening late, and the
--               day's list follows the earliest shift of the pattern whose
--               list is not late, so a late one never takes the day's list
--               from a later shift's on time. Null (a shift written before
--               this migration, or put in by hand) counts from the start, as
--               before. A hosted demo's reset ages it with its times
--               (private.seed_demo_lists), so its lists of the day are still
--               there after a reset. The editor's next openings of a saved
--               time (public.next_list_openings) read it through
--               private.list_occurrences; its preview of a time not yet saved
--               (@domain/list-openings) knows no stamp and starts at now, so
--               it differs only on a day whose earliest shift of the pattern
--               was stamped after its list was due: there the saved time
--               opens a later shift's list, and the preview shows none.
--
-- It replaces, from their latest versions and with only these changes:
-- private.write_week_schedule (20261115000200_swap_history.sql's), with the
-- rules above and a sixth argument, `joins`; public.save_week_schedule and
-- public.publish_week_schedule (20261115000100_week_in_place.sql's), which
-- take `joins jsonb default null` last, so every call that names or places
-- the others stays as it was, and the publish raises the list stamps at a
-- first publish and logs `running` and `joined`; private.list_occurrences
-- (20261110001300_list_schedules.sql's), which reads the stamp, and picks
-- the day's shift among those whose list it doesn't leave out; and
-- private.seed_demo_lists (20261110001400_lists_pass.sql's), which ages it.
-- The five-argument functions are dropped first, so no call is ambiguous,
-- and the new ones granted as the old ones were.

------------------------------------------------------------------------------
-- 1. From when a shift's lists count

alter table public.schedule_shifts add column opens_lists_from timestamptz;

comment on column public.schedule_shifts.opens_lists_from is
  'From when the shift''s lists count: set by a save or a publish to its moment when it adds the shift, moves it in its day or hours, or gives it another pattern, and raised to that moment on every shift of a week at its first publish. private.list_occurrences opens nothing due before it. Null counts from the start.';

------------------------------------------------------------------------------
-- 2. Writing a week, with what has begun

drop function public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz);
drop function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz);
drop function private.write_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz);

-- 20261115000200_swap_history.sql's, the same (the rules of
-- 20261115000100_week_in_place.sql, a deleted shift's requests kept), with
-- the rules of a week under way at the top of this file and `joins`. Returns
-- what it did, as before, and who joined which shift (`joined`) and whether
-- the week had begun at `at_time` (`running`).
create function private.write_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb,
  basis jsonb,
  at_time timestamptz,
  joins jsonb
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
  business_zone text;
  week_published boolean;
  over_at timestamptz;
  begun_ids uuid[] := '{}'::uuid[];
  started jsonb;
  too_early jsonb;
  late_joins jsonb;
  joined jsonb;
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

  -- Every rule below reads the write's moment: with none, a week under way
  -- would read as one still to come.
  if at_time is null then
    raise exception 'A write needs its moment' using errcode = '22023';
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

  -- The joins: a list of {"shift", "user", "position"}, each with a shift and
  -- a person.
  if joins is not null then
    if jsonb_typeof(joins) <> 'array' then
      raise exception 'Joins must be a list' using errcode = '22023';
    end if;

    if jsonb_array_length(joins) > 200 then
      raise exception 'Too many joins' using errcode = '22023';
    end if;

    begin
      perform j.shift, j."user", j.position
      from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text);
    exception when others then
      raise exception 'Each join needs a shift, a person and a position or none'
        using errcode = '22023';
    end;

    if exists (
      select 1
      from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text)
      where j.shift is null or j."user" is null
    ) then
      raise exception 'Each join needs a shift, a person and a position or none'
        using errcode = '22023';
    end if;
  end if;

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

  -- A published week is under way from its first day, in the business's
  -- zone, and once it has wholly ended (its next week's first midnight, and
  -- the end of its last shift, a night shift on its last day included) it no
  -- longer changes. The week is locked by whoever called, so its shifts stay
  -- as read here.
  select b.timezone into business_zone from public.businesses b where b.id = w.business_id;
  week_published := w.schedule_published_at is not null;

  if week_published then
    select greatest(
        (w.starts_on + 7)::timestamp at time zone business_zone,
        max(
          (s.day + (case when s.ends_at <= s.starts_at then 1 else 0 end) + s.ends_at)
            at time zone business_zone
        )
      )
    into over_at
    from public.schedule_shifts s
    where s.week_id = w.id;

    if at_time >= over_at then
      raise exception 'This week is over' using errcode = '55000', hint = 'over';
    end if;
  end if;

  -- The week's shifts, then their waiting requests: a request asked, taken or
  -- decided meanwhile finishes first, and everything below reads it.
  perform 1 from public.schedule_shifts s where s.week_id = w.id for update;
  perform 1
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where s.week_id = w.id and sw.status in ('open', 'taken')
  for update of sw;

  -- What has begun at `at_time` in a published week, at the moment a swap's
  -- rules read too (where private.shift_span starts), read from the shift
  -- itself: a range would fail on a shift the spring change turns inside out
  -- (02:30 to 03:00 that night ends before it starts) and hold up every write
  -- of its week. Never rewritten. Nothing has in a week never published.
  if week_published then
    select coalesce(array_agg(s.id order by s.id), '{}'::uuid[])
    into begun_ids
    from public.schedule_shifts s
    where s.week_id = w.id
      and ((s.day + s.starts_at) at time zone business_zone) <= at_time;
  end if;

  -- What happens to each shift: kept as stored, edited in place, removed,
  -- moved since it was read, or begun (both refuse the write).
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
        -- Begun, and the week replaced or the shift not read: kept.
        when st.shift_id = any (begun_ids) and (replacing or seen.shift_id is null) then 'kept'
        when replacing then 'removed'
        -- Stored and not read: another manager's, kept.
        when seen.shift_id is null then 'kept'
        -- Sent as it was read: left alone, whatever happened since.
        when sent.id is not null and sent.digest = seen.digest then 'kept'
        -- Begun, and sent changed or left out: refused.
        when st.shift_id = any (begun_ids) then 'started'
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
    jsonb_agg(v.shift_id order by v.shift_id) filter (where v.verdict = 'moved'),
    jsonb_agg(v.shift_id order by v.shift_id) filter (where v.verdict = 'started')
  into kept_ids, edited_ids, removed_ids, moved, started
  from verdicts v;

  if started is not null then
    raise exception 'Shifts that have begun stay as they are'
      using errcode = '55006', hint = 'started', detail = started::text;
  end if;

  if moved is not null then
    raise exception 'Shifts changed since they were read'
      using errcode = '40001', hint = 'moved', detail = moved::text;
  end if;

  -- In a published week, what this write puts in place (a new shift, or one
  -- still to start written again) starts after `at_time`.
  if week_published then
    select jsonb_agg(
        jsonb_build_object('id', x.id, 'day', x.day, 'start', left(x.starts_at::text, 5))
        order by x.n
      )
    into too_early
    from private.sent_shifts(shifts) x
    where (x.id is null or x.id = any (edited_ids))
      and ((x.day + x.starts_at) at time zone business_zone) <= at_time;

    if too_early is not null then
      raise exception 'A new or moved shift must start after now'
        using errcode = '22023', hint = 'past', detail = too_early::text;
    end if;
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

  -- Who joins a shift under way (Orel's answer 1): one of this week that has
  -- begun, and not ended; nobody on it already or twice; a known position or
  -- none; an active member on the staff.
  if jsonb_array_length(coalesce(joins, '[]'::jsonb)) > 0 then
    if exists (
      select 1
      from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text)
      where not (j.shift = any (begun_ids))
    ) then
      raise exception 'A join is for a shift of this week under way' using errcode = '22023';
    end if;

    -- Ended: its end (the next day when it ends at or before its start), where
    -- private.shift_span ends, read from the shift as its start is above.
    select jsonb_agg(distinct j.shift order by j.shift)
    into late_joins
    from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text)
    join public.schedule_shifts o on o.id = j.shift
    where ((o.day + (case when o.ends_at <= o.starts_at then 1 else 0 end) + o.ends_at)
      at time zone business_zone) <= at_time;

    if late_joins is not null then
      raise exception 'A shift that has ended takes nobody'
        using errcode = '55006', hint = 'ended', detail = late_joins::text;
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text)
      group by j.shift, j."user"
      having count(*) > 1
    ) or exists (
      select 1
      from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text)
      join public.shift_assignments a on a.shift_id = j.shift and a.user_id = j."user"
    ) then
      raise exception 'Each person needs an id and is on a shift once' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text)
      where j.position is not null
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(config -> 'positions', '[]'::jsonb)) as p (item)
          where p.item ->> 'key' = j.position
        )
    ) then
      raise exception 'Unknown position' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text)
      where not exists (
        select 1
        from public.memberships m
        where m.business_id = w.business_id and m.user_id = j."user" and m.active
      )
    ) then
      raise exception 'Only active members of the business can work a shift'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(joins) as j (shift uuid, "user" uuid, position text)
      join public.memberships m
        on m.business_id = w.business_id and m.user_id = j."user" and m.active
      where not private.is_staff_role(m.role)
    ) then
      raise exception 'An accountant is not on the staff' using errcode = '42501';
    end if;
  end if;

  -- Nobody works two shifts at once: everyone on a shift that is new or whose
  -- day or hours changed, everyone this write puts on a shift, and everyone
  -- who joins one, against the week as it will stand. Spans in minutes from
  -- the week's first midnight (an end at or before the start is the next
  -- day).
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
      union all
      select j.shift::text, j."user", o.day, o.starts_at, o.ends_at, true
      from jsonb_to_recordset(coalesce(joins, '[]'::jsonb)) as j (shift uuid, "user" uuid, position text)
      join public.schedule_shifts o on o.id = j.shift
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
  -- off. Read before anything moves, as every member read the shift. None is
  -- on a shift that has begun: the write keeps those.
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
  set status = 'cancelled', cancelled_because = 'schedule'
  where sw.id in (
    select (e.value ->> 'id')::uuid from jsonb_array_elements(ended) as e (value)
  );

  -- A deleted shift's requests stay, its id cleared from them (on delete set
  -- null) and the shift they asked for kept on each; none still waits.
  delete from public.schedule_shifts s where s.id = any (removed_ids);

  -- A shift moved in its day or hours, or given another pattern (which brings
  -- it into that pattern's lists), counts its lists from now.
  update public.schedule_shifts o
  set day = x.day,
    name = x.name,
    starts_at = x.starts_at,
    ends_at = x.ends_at,
    needed = x.needed,
    pattern_key = x.pattern_key,
    opens_lists_from = (case
      when (o.day, o.starts_at, o.ends_at, o.pattern_key)
        is distinct from (x.day, x.starts_at, x.ends_at, x.pattern_key)
        then at_time
      else o.opens_lists_from
    end)
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

  -- The new shifts, their ids drawn first so each person lands on their own,
  -- their lists counting from now.
  select coalesce(jsonb_object_agg(x.n::text, gen_random_uuid()), '{}'::jsonb)
  into new_ids
  from private.sent_shifts(shifts) x
  where x.id is null;

  insert into public.schedule_shifts
    (id, business_id, week_id, day, pattern_key, name, starts_at, ends_at, needed,
      opens_lists_from)
  select (new_ids ->> x.n::text)::uuid, w.business_id, w.id, x.day, x.pattern_key, x.name,
    x.starts_at, x.ends_at, x.needed, at_time
  from private.sent_shifts(shifts) x
  where x.id is null;

  insert into public.shift_assignments (shift_id, business_id, user_id, position_key)
  select (new_ids ->> x.n::text)::uuid, w.business_id, p."user", p.position
  from private.sent_shifts(shifts) x
  cross join lateral jsonb_to_recordset(x.assignees) as p ("user" uuid, position text)
  where x.id is null;

  -- Who joins a shift under way: put on it, the shift itself left as it was.
  insert into public.shift_assignments (shift_id, business_id, user_id, position_key)
  select j.shift, w.business_id, j."user", j.position
  from jsonb_to_recordset(coalesce(joins, '[]'::jsonb)) as j (shift uuid, "user" uuid, position text);

  select coalesce(
    jsonb_agg(jsonb_build_object('shift', j.shift, 'user', j."user") order by j.shift, j."user"),
    '[]'::jsonb
  )
  into joined
  from jsonb_to_recordset(coalesce(joins, '[]'::jsonb)) as j (shift uuid, "user" uuid, position text);

  update public.schedule_weeks wk set schedule_saved_at = now() where wk.id = w.id;

  -- A request taken by someone who may no longer take it (put on the shift,
  -- or working at the same time now): open again with no taker, as a team
  -- change opens it (private.leave_staff). Read after the writes above. One
  -- on a shift that has begun stays as it was: nobody could take it now.
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
    and s.id <> all (begun_ids)
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
    'joined', joined,
    'running', at_time >= (w.starts_on::timestamp at time zone business_zone),
    'at', at_time
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. Saving and publishing

-- 20261115000100_week_in_place.sql's, the same (the week locked first, the
-- rules before anything is said of the week, a published week refused), with
-- the joins passed to the write.
create function public.save_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb,
  basis jsonb default null,
  at_time timestamptz default now(),
  joins jsonb default null
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
  written := private.write_week_schedule(actor, week, shifts, basis, at_time, joins);

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

-- 20261115000100_week_in_place.sql's, the same (the week, its shifts and
-- their waiting requests locked before whose shifts are read), with the joins
-- passed to the write; at a week's first publish the lists of its shifts
-- count from now; and the log row says whether the week had begun and who
-- joined which shift.
create function public.publish_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb,
  basis jsonb default null,
  at_time timestamptz default now(),
  joins jsonb default null
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

  written := private.write_week_schedule(actor, week, shifts, basis, at_time, joins);

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

  -- The week's first publish: every shift's lists count from now, so one in
  -- the middle of the week opens none already late.
  if w.schedule_published_at is null then
    update public.schedule_shifts s
    set opens_lists_from = greatest(s.opens_lists_from, at_time)
    where s.week_id = week;
  end if;

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
      'joined', written -> 'joined',
      'running', (written ->> 'running')::boolean,
      'at', at_time
    )
  );

  return (written ->> 'shifts')::int;
end;
$$;

------------------------------------------------------------------------------
-- 4. A shift's lists open from its stamp

-- 20261110001300_list_schedules.sql's, the same, and an opening around a
-- shift is left out when it is due (after Shabbat's rule) before the shift's
-- opens_lists_from (null counts from the start). The day's list follows its
-- earliest shift of the pattern among those not left out, so a shift added,
-- moved or first published after its list was due never takes the day's
-- list from a later one whose list is on time. Shabbat's rule now runs on
-- every shift of the day rather than on the one picked, and the opening on
-- Friday after candle lighting it drops is dropped after the pick, as
-- before: with no stamp, the day's openings are as they were.
create or replace function private.list_occurrences(
  schedule uuid,
  from_time timestamptz,
  to_time timestamptz
)
returns table (occurs_on date, opens_at timestamptz, due_at timestamptz, shift_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with sched as (
    select ls.id, ls.business_id, ls.days, ls.anchor, ls.shift_key, ls.opens_offset,
      ls.due_offset, ls.starts_on, ls.opens_from, b.timezone as tz,
      private.closes_on_shabbat(ls.business_id) as shabbat_closed
    from public.list_schedules ls
    join public.list_templates t
      on t.id = ls.template_id and t.business_id = ls.business_id and t.archived_at is null
    join public.businesses b on b.id = ls.business_id
    where ls.id = schedule
      and ls.active
      and from_time < to_time
      and (ls.anchor = 'day' or private.has_shift_pattern(ls.business_id, ls.shift_key))
  ),
  -- A time of the day: each local day around the window it runs on, its
  -- minutes read on the business's clock.
  by_day as (
    select g.on_day, sc.opens_offset, sc.due_offset,
      (g.on_day + make_interval(mins => sc.opens_offset)) at time zone sc.tz as raw_opens,
      (g.on_day + make_interval(mins => sc.due_offset)) at time zone sc.tz as raw_due
    from sched sc
    cross join lateral (
      select (from_time at time zone sc.tz)::date - 1 + k as on_day
      from generate_series(
        0,
        (to_time at time zone sc.tz)::date - (from_time at time zone sc.tz)::date + 2
      ) as k
    ) g
    where sc.anchor = 'day'
      and extract(dow from g.on_day)::smallint = any (sc.days)
      and g.on_day >= sc.starts_on
  ),
  -- A time the spring change skips opens an hour later, which can pass a due
  -- time just after the change: then it has as long as it would have.
  day_fixed as (
    select bd.on_day, bd.raw_opens as opens,
      case when bd.raw_due <= bd.raw_opens
        then bd.raw_opens + make_interval(mins => bd.due_offset - bd.opens_offset)
        else bd.raw_due
      end as due,
      null::uuid as shift,
      null::timestamptz as stamp,
      null::timestamptz as anchor_at
    from by_day bd
  ),
  -- A time that follows a shift: minutes around the start or the end (the
  -- next day when it ends at or before its start) of each published shift of
  -- its pattern, on the days it runs, with the shift's stamp and its anchor
  -- (one a day is picked below).
  by_shift as (
    select ss.day as on_day,
      a.anchor_at + make_interval(mins => sc.opens_offset) as opens,
      a.anchor_at + make_interval(mins => sc.due_offset) as due,
      ss.id as shift,
      ss.opens_lists_from as stamp,
      a.anchor_at
    from sched sc
    join public.schedule_shifts ss
      on ss.business_id = sc.business_id and ss.pattern_key = sc.shift_key
    cross join lateral (
      select case sc.anchor
        when 'shift_start' then (ss.day + ss.starts_at) at time zone sc.tz
        else (ss.day + case when ss.ends_at <= ss.starts_at then 1 else 0 end + ss.ends_at)
          at time zone sc.tz
      end as anchor_at
    ) a
    where sc.anchor <> 'day'
      and ss.day between (from_time at time zone sc.tz)::date - 2
        and (to_time at time zone sc.tz)::date + 2
      and extract(dow from ss.day)::smallint = any (sc.days)
      and ss.day >= sc.starts_on
      and private.shift_published(ss.id)
  ),
  -- Every opening, with the Shabbat of the day it opens on, for a business
  -- closed on it (a time of the day and one around a shift alike).
  spanned as (
    select o.on_day, o.opens, o.due, o.shift, o.stamp, o.anchor_at,
      extract(dow from (o.opens at time zone sc.tz))::integer as weekday,
      case when sc.shabbat_closed
        then private.shabbat_span(sc.business_id, (o.opens at time zone sc.tz)::date)
      end as span
    from (
      select df.on_day, df.opens, df.due, df.shift, df.stamp, df.anchor_at from day_fixed df
      union all
      select bs.on_day, bs.opens, bs.due, bs.shift, bs.stamp, bs.anchor_at from by_shift bs
    ) o
    cross join sched sc
  ),
  -- Shabbat: nothing on Friday after candle lighting (`dropped`, once the
  -- day's shift is picked); on Saturday before havdalah, at havdalah with the
  -- same length; due at candle lighting when it opens before it on Friday
  -- and is due after.
  shabbat_kept as (
    select sp.on_day,
      case when sp.span @> sp.opens and sp.weekday = 6
        then upper(sp.span) else sp.opens
      end as opens,
      case
        when sp.span @> sp.opens and sp.weekday = 6
          then upper(sp.span) + (sp.due - sp.opens)
        when sp.weekday = 5
          and sp.opens < lower(sp.span) and sp.due > lower(sp.span)
          then lower(sp.span)
        else sp.due
      end as due,
      sp.shift,
      sp.stamp,
      sp.anchor_at,
      coalesce(sp.span @> sp.opens and sp.weekday = 5, false) as dropped
    from spanned sp
  ),
  -- One opening a day around a shift: the earliest shift of the pattern
  -- whose list is not due before its stamp (a shift added, moved or first
  -- published after its list was due opens none, and leaves the day to the
  -- next one). A time of the day has no stamp.
  shift_picked as (
    select distinct on (k.on_day) k.on_day, k.opens, k.due, k.shift, k.dropped
    from shabbat_kept k
    where k.shift is not null
      and (k.stamp is null or k.due >= k.stamp)
    order by k.on_day, k.anchor_at, k.shift
  ),
  kept as (
    select k.on_day, k.opens, k.due, k.shift, k.dropped
    from shabbat_kept k
    where k.shift is null
    union all
    select p.on_day, p.opens, p.due, p.shift, p.dropped
    from shift_picked p
  )
  select k.on_day, k.opens, k.due, k.shift
  from kept k
  cross join sched sc
  where not k.dropped
    and k.opens > from_time
    and k.opens <= to_time
    -- Saved, changed or switched on after its own time today: it starts with
    -- the next one.
    and k.opens >= sc.opens_from
  order by k.opens
$$;

------------------------------------------------------------------------------
-- 5. A hosted demo's shifts are as old as its times

-- 20261110001400_lists_pass.sql's, the same, and where the definition says
-- "scheduledLists": true, the shifts' stamps age with the times, before the
-- tick: the reset publishes this week for the first time, which stamps every
-- shift with now, so without it the lists of today already due would not
-- open.
create or replace function private.seed_demo_lists(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
  sender uuid;
  filler uuid;
  first_list public.list_templates%rowtype;
  second_list public.list_templates%rowtype;
  order_list public.list_templates%rowtype;
  asker uuid;
  giver uuid;
  sent uuid;
  done_item uuid;
begin
  if not private.module_enabled(business, 'lists'::public.module_key) then
    return;
  end if;

  begin
    select d.definition into def
    from private.demo_businesses d
    where d.business_id = business;

    if coalesce((def ->> 'scheduledLists')::boolean, false) then
      update public.list_schedules ls
      set created_at = ls.created_at - interval '2 days',
        opens_from = ls.opens_from - interval '2 days',
        starts_on = ls.starts_on - 2
      where ls.business_id = business;
      update public.schedule_shifts s
      set opens_lists_from = s.opens_lists_from - interval '2 days'
      where s.business_id = business
        and s.opens_lists_from is not null;
      perform private.lists_tick(now(), business);
    end if;

    select m.user_id into sender
    from jsonb_array_elements(
      case when jsonb_typeof(def -> 'people') = 'array' then def -> 'people' else '[]'::jsonb end
    ) with ordinality as person (value, ordinality)
    join public.memberships m
      on m.business_id = business
      and m.user_id::text = person.value ->> 'user_id'
      and m.active
    where m.role in ('manager', 'owner')
    order by (m.role = 'manager') desc, person.ordinality
    limit 1;

    -- No early return (L5): the order after this block needs none of it.
    if sender is not null then
      select t.* into first_list
      from public.list_templates t
      where t.business_id = business
        and t.archived_at is null
        and t.from_department is null
        and not exists (select 1 from public.lists x where x.template_id = t.id)
      order by t.position, t.key
      limit 1;

      if found then
        select m.user_id into filler
        from jsonb_array_elements(
          case when jsonb_typeof(def -> 'people') = 'array' then def -> 'people' else '[]'::jsonb end
        ) with ordinality as person (value, ordinality)
        join public.memberships m
          on m.business_id = business
          and m.user_id::text = person.value ->> 'user_id'
          and m.active
        where m.role = 'worker'
        order by coalesce(
          (first_list.recipient_kind = 'department' and exists (
            select 1 from public.department_members dm
            where dm.department_id = first_list.recipient_department and dm.user_id = m.user_id
          ))
          or (first_list.recipient_kind = 'role' and first_list.recipient_role = m.role),
          false
        ) desc, person.ordinality
        limit 1;

        if filler is not null then
          sent := public.send_list(
            sender, business,
            jsonb_build_object(
              'template', first_list.id,
              'recipient', jsonb_build_object('kind', 'person', 'user', filler)
            )
          );
          for done_item in
            select i.id from public.list_items i
            where i.list_id = sent and i.kind = 'check'
            order by i.position
            limit 2
          loop
            perform public.set_list_item(filler, done_item, '{"checked": true}'::jsonb);
          end loop;
        end if;

        select t.* into second_list
        from public.list_templates t
        where t.business_id = business
          and t.archived_at is null
          and t.from_department is null
          and t.id <> first_list.id
          and t.recipient_kind in ('department', 'role')
          and not exists (select 1 from public.lists x where x.template_id = t.id)
        order by t.position, t.key
        limit 1;
        if found then
          perform public.send_list(
            sender, business,
            jsonb_build_object(
              'template', second_list.id,
              'recipient', case second_list.recipient_kind
                when 'department' then jsonb_build_object(
                  'kind', 'department', 'department', second_list.recipient_department
                )
                else jsonb_build_object('kind', 'role', 'role', second_list.recipient_role)
              end
            )
          );
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'The demo''s example lists were not sent: %', sqlerrm;
  end;

  -- An order between departments (L5), waiting where it goes. Its asker and
  -- its giver are the departments' people, so it needs neither the manager
  -- nor the examples above: it is tried whatever became of them, and if it
  -- fails, they stay.
  begin
    select t.* into order_list
    from public.list_templates t
    where t.business_id = business
      and t.archived_at is null
      and t.from_department is not null
      and t.recipient_kind = 'department'
      and exists (
        select 1 from public.departments d
        where d.id = t.from_department and d.archived_at is null
      )
      and not exists (select 1 from public.lists x where x.template_id = t.id)
    order by t.position, t.key
    limit 1;
    if found then
      select dm.user_id into asker
      from public.department_members dm
      join public.memberships m
        on m.business_id = dm.business_id and m.user_id = dm.user_id and m.active
      where dm.department_id = order_list.from_department
        and private.is_staff_role(m.role)
      order by exists (
          select 1 from public.department_members o
          where o.department_id = order_list.recipient_department
            and o.user_id = dm.user_id
        ),
        (m.role = 'worker') desc,
        dm.user_id
      limit 1;

      if asker is not null then
        sent := public.send_list(
          asker, business,
          jsonb_build_object(
            'template', order_list.id,
            'recipient', jsonb_build_object(
              'kind', 'department', 'department', order_list.recipient_department
            )
          )
        );

        select dm.user_id into giver
        from public.department_members dm
        join public.memberships m
          on m.business_id = dm.business_id and m.user_id = dm.user_id and m.active
        where dm.department_id = order_list.recipient_department
          and private.is_staff_role(m.role)
        order by (m.role = 'worker') desc, dm.user_id
        limit 1;

        if giver is not null then
          select i.id into done_item
          from public.list_items i
          where i.list_id = sent and i.kind = 'check'
          order by i.position
          limit 1;
          if found then
            -- Ticking gives what was asked for.
            perform public.set_list_item(giver, done_item, '{"checked": true}'::jsonb);
          end if;
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'The demo''s example order was not sent: %', sqlerrm;
  end;
end;
$$;

------------------------------------------------------------------------------
-- Grants

-- The write: nobody but the database's own, as before.
revoke execute on function private.write_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  from public, anon, authenticated, service_role;

-- Dropped and made again with one more argument (section 3): the secret
-- key's alone, as before.
revoke execute on function public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  to service_role;
revoke execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  to service_role;

-- Replaced in place (sections 4 and 5): the same signatures, so their grants
-- stay; revoked again all the same.
revoke execute on function private.list_occurrences(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.seed_demo_lists(uuid)
  from public, anon, authenticated;
