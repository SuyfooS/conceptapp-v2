-- Overlaps across the week's edge (the running-week plan's X). Until now a
-- save or a publish checked that nobody works two shifts at once only inside
-- its own week, in minutes from the week's first midnight, so next week's
-- first morning could be given to someone on the running week's last night (a
-- shift past midnight, across the edge), and the running week, which managers
-- edit since R3a, could clash with last week's last night or next week's
-- first day. Only a swap's rules (private.check_can_take) measured shifts by
-- the moments they run. Now:
--
--   edges       the people a write puts on shifts (those its check inside the
--               week covers: everyone on a shift it adds or moves in its day
--               or hours, everyone it puts on a shift, everyone who joins one
--               under way) are checked against their own shifts in the
--               business's weeks either side of it (those that start up to
--               seven days before or after it: last week and next week, from
--               the week's own first day, whatever day the business's week
--               starts on), drafts and published alike, by the moments the
--               shifts run on the business's clock: private.shift_span's,
--               a shift past midnight included, read from the shifts as the
--               rules of a week under way read them, so that a shift the
--               spring change turns inside out holds up nothing. A shift
--               lasts less than a day from its own day, so only shifts on days
--               next to each other can meet: of the weeks next door, only the
--               shifts from the day before the week's first to the day after
--               its last are read, each against the week's shifts within a
--               day of it. Touching is not overlapping: one ending as the
--               other starts is fine. Someone kept where they were is not
--               checked again, as inside the week, and someone else on the
--               shift next door is no one's concern. Refused: 22023, hint
--               'clash', DETAIL a JSON array of {"user", "name", "day",
--               "start", "week"} (who, and the shift next door they are on:
--               its name, its day, its start as "HH:MM", and 'previous' or
--               'next' for the week it is in), the earlier week's first, then
--               by day and start; nothing written. A clash inside the week is
--               refused first, as before, in the same words.
--   locks       a save or a publish locks, as its first statement
--               (private.lock_week_edges), the business's weeks that exist
--               from seven days before its week to seven days after it (last
--               week, the week, next week), one at a time in ascending order
--               of their first day: its own for update, as before, and the
--               others for share. A write of a week next door then waits for
--               it, or it for that one, so each reads the other's shifts as
--               they stand, while writes of last week and of next week, which
--               both only read this week, still run side by side.
--   requests next door
--               after the week's own waiting requests, a save or a publish
--               locks for update, in a statement of its own, the requests
--               taken on the shifts of the weeks either side within a day of
--               it (from the day before its first to the day after its last).
--               An approval (public.decide_shift_swap) locks its request
--               before it checks its taker against every week and puts them
--               on, and locks no week, so until now an approval next door and
--               a write could each miss whom the other put on, and both pass:
--               someone on two shifts at once across the edge. Now one under
--               way finishes first and the check across the edges sees whom
--               it put on, and one after waits and its check sees what the
--               write put in place. Open requests next door are not locked: a
--               take locks its taker's membership after its request, so it
--               may wait for a team change that waits for the weeks a write
--               holds; what it takes still waits for an approval, which
--               checks again.
--   reopened    a publish then opens again, with no taker, a request taken on
--               those shifts next door whose taker may no longer take it
--               (working at the same time now), as the write opens one of the
--               week's own, logged and told with them (the log's `reopened`);
--               one on a shift that has begun stays as it was. A draft saved,
--               which is neither logged nor told, leaves it taken: its
--               approval is refused (private.check_can_take, which reads
--               drafts too) until the week is published and opens it.
--
-- Why none of them deadlocks with another, or with a team change. Every lock
-- on a week row is taken, within each transaction, in ascending order of the
-- weeks' first days, and before any lock on a shift or a swap request; and
-- nothing that holds a week ever waits for an earlier one:
--   - a save or a publish: the weeks next door and its own, ascending, as its
--     first statement; then, as before, its own week's shifts and their
--     waiting requests; then the requests taken next door. It locks no week
--     after that (the write's own lock of its week, and the publish's, are
--     already held), and no business or membership: the key share its
--     inserts take on the business never conflicts with a team change's no
--     key update, as before. An approval next door that it waits for holds
--     only its request and then the assignment it changes, and waits for
--     nothing a write holds. Writes of last week and of next week lock
--     different days of the week between them, so different requests; a
--     write of that week itself, or a team change, takes turns with it at
--     the week rows first.
--   - private.leave_staff, from public.remove_member and
--     public.set_member_role after the business and the membership (which no
--     save or publish locks): every week from a week before today, ascending,
--     for update; then the requests.
--   - private.renew_demo_schedule, the one function that calls a publish: it
--     locked its week alone before publishing, after which the publish would
--     have locked the week before it, out of order. It now takes the same
--     locks, through the same helper, before it reads whether the week is
--     published, so its publish only takes them again.
-- Locks taken in one direction over the same rows can't close a cycle:
-- whoever holds a week waits only for a later week, or for what comes after
-- the weeks, and nothing holding those waits for a week. Swap requests,
-- lists and availability take no lock on a week row (a key share through
-- their keys at most, which a share doesn't refuse). A neighbour is locked
-- for share once, never for share and then for update: two writes of weeks
-- next door, each holding a share of the week between them and waiting to
-- update it, would wait for each other. And a week inserted meanwhile and
-- not committed is not seen, so not waited for.
--
-- It replaces, from their latest versions and with only these changes:
-- private.write_week_schedule (20261115000300_running_week.sql's), the
-- helper both share, with the lock of the requests taken next door after the
-- week's own, and the check across the edges after the one inside the week;
-- public.save_week_schedule (20261115000300_running_week.sql's) and
-- public.publish_week_schedule (20261115000400_running_week_notices.sql's),
-- whose first statement now locks the weeks either side with their own, and
-- the publish, after its write, opens again the requests next door it leaves
-- taken by someone who may no longer take them; and
-- private.renew_demo_schedule (20261107000800_templates_for_every_business.sql's),
-- the publish's one caller, which takes those locks first too, and leaves out
-- of each shift it fills whoever works the weeks either side at that time, so
-- the demo's renewal never meets the new refusal. The same signatures, so the
-- same grants, revoked (and granted) again all the same. One new private
-- helper, private.lock_week_edges. public.save_week_schedule has no caller in
-- the database; the app, the e2e helpers and the pgTAP files call both with
-- the same arguments as before.

------------------------------------------------------------------------------
-- 1. The weeks either side, locked first

-- The business's weeks that start from seven days before `week` to seven days
-- after it (last week, the week, next week: those that exist), one at a time
-- in ascending order of their first day, `week` for update and the others for
-- share. Read first and then locked one by one, so each takes its own
-- strength: a share taken and then raised to an update would wait for a write
-- next door that waits for it. Nothing for a week that isn't there.
create function private.lock_week_edges(week uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  edge record;
begin
  for edge in
    select nw.id as week_key, nw.id = own.id as is_own
    from public.schedule_weeks own
    join public.schedule_weeks nw
      on nw.business_id = own.business_id
      and nw.starts_on between own.starts_on - 7 and own.starts_on + 7
    where own.id = week
    order by nw.starts_on
  loop
    if edge.is_own then
      perform 1 from public.schedule_weeks wk where wk.id = edge.week_key for update;
    else
      perform 1 from public.schedule_weeks wk where wk.id = edge.week_key for share;
    end if;
  end loop;
end;
$$;

------------------------------------------------------------------------------
-- 2. Writing a week, checked across its edges

-- 20261115000300_running_week.sql's, the same, and after the check inside the
-- week, the same people against their shifts in the weeks either side, by the
-- moments the shifts run (hint 'clash', at the top of this file). The weeks
-- next door are locked for share by whoever called, so their shifts stay as
-- read here, and the requests taken on them next to this week are locked
-- after the week's own, so no approval of one changes them meanwhile.
create or replace function private.write_week_schedule(
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
  edge_clashes jsonb;
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

  -- Then the requests taken on the shifts of the weeks either side within a
  -- day of this one (those the check across the edges below reads), in a
  -- statement of their own (at the top of this file): an approval of one
  -- under way finishes first, and that check, a later statement, sees whom it
  -- put on; one after waits for this write, and its own check sees what this
  -- write put in place. For update, as a publish may open them again. Open
  -- ones are not locked: a take waits for its taker's membership, which a
  -- team change holds while it waits for the weeks held here.
  perform 1
  from public.shift_swaps sw
  join public.schedule_shifts o on o.id = sw.shift_id
  join public.schedule_weeks nw on nw.id = o.week_id
  where nw.business_id = w.business_id
    and nw.id <> w.id
    and nw.starts_on between w.starts_on - 7 and w.starts_on + 7
    and o.day between w.starts_on - 1 and w.starts_on + 7
    and sw.status = 'taken'
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

  -- Nor with a shift of theirs in the weeks either side (the running-week
  -- plan's X): the same people the check above covers (on a shift that is new
  -- or whose day or hours changed, put on a shift by this write, or joining
  -- one), against their shifts in the business's weeks that start up to seven
  -- days before or after this one, drafts and published alike, by the moments
  -- the shifts run on the business's clock (private.shift_span's, an end at
  -- or before the start the next day), read from the shifts themselves so a
  -- shift the spring change turns inside out holds up nothing. A shift lasts
  -- less than a day from its own day, so only shifts on days next to each
  -- other can meet: of the weeks next door, the shifts from the day before
  -- this week's first to the day after its last. Locked for share by whoever
  -- called (private.lock_week_edges), they stay as read here.
  with placed as (
    select a."user" as person, s.day, s.starts_at, s.ends_at
    from private.sent_shifts(shifts) s
    cross join lateral jsonb_to_recordset(s.assignees) as a ("user" uuid, position text)
    where (s.id is null or s.id = any (edited_ids))
      and (
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
      )
    union all
    select j."user", o.day, o.starts_at, o.ends_at
    from jsonb_to_recordset(coalesce(joins, '[]'::jsonb)) as j (shift uuid, "user" uuid, position text)
    join public.schedule_shifts o on o.id = j.shift
  ),
  next_door as (
    select a.user_id as person, o.id as shift_id, o.name, o.day, o.starts_at, o.ends_at,
      (case when nw.starts_on < w.starts_on then 'previous' else 'next' end) as side
    from public.schedule_weeks nw
    join public.schedule_shifts o on o.week_id = nw.id
    join public.shift_assignments a on a.shift_id = o.id
    where nw.business_id = w.business_id
      and nw.id <> w.id
      and nw.starts_on between w.starts_on - 7 and w.starts_on + 7
      and o.day between w.starts_on - 1 and w.starts_on + 7
  ),
  clashing as (
    select distinct n.person, n.shift_id, n.name, n.day, n.starts_at, n.side
    from placed p
    join next_door n on n.person = p.person and abs(n.day - p.day) <= 1
    where ((p.day + p.starts_at) at time zone business_zone)
        < ((n.day + (case when n.ends_at <= n.starts_at then 1 else 0 end) + n.ends_at)
          at time zone business_zone)
      and ((n.day + n.starts_at) at time zone business_zone)
        < ((p.day + (case when p.ends_at <= p.starts_at then 1 else 0 end) + p.ends_at)
          at time zone business_zone)
  )
  select jsonb_agg(
      jsonb_build_object(
        'user', c.person,
        'name', c.name,
        'day', c.day,
        'start', left(c.starts_at::text, 5),
        'week', c.side
      )
      order by c.side = 'next', c.day, c.starts_at, c.name, c.person
    )
  into edge_clashes
  from clashing c;

  if edge_clashes is not null then
    raise exception 'Works a shift of the week before or after at the same time'
      using errcode = '22023', hint = 'clash', detail = edge_clashes::text;
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
-- 3. Saving and publishing, the weeks either side locked first

-- 20261115000300_running_week.sql's, the same, with its first statement
-- locking the weeks either side with its own (private.lock_week_edges)
-- rather than its own alone.
create or replace function public.save_week_schedule(
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
  -- The week for update and the weeks either side for share, in ascending
  -- order (at the top of this file): a draft saved, a publish, a team change
  -- and a write of a week next door take turns, and never wait for each
  -- other in a circle.
  perform private.lock_week_edges(week);

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

-- 20261115000400_running_week_notices.sql's, the same, with its first
-- statement locking the weeks either side with its own
-- (private.lock_week_edges); its own lock of the week, which reads it, is
-- then already held. And after its write, the requests taken next door by
-- someone who may no longer take them are opened again, and logged with the
-- week's own (at the top of this file).
create or replace function public.publish_week_schedule(
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
  business_zone text;
  nearest jsonb := '{}'::jsonb;
  reopened_next_door jsonb;
begin
  -- The week for update and the weeks either side for share, in ascending
  -- order, before anything else (at the top of this file).
  perform private.lock_week_edges(week);

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

  -- A request taken on a shift of the weeks either side within a day of this
  -- one (locked for update by the write) by someone who may no longer take
  -- it, working at the same time now: open again with no taker, as the write
  -- opens one of the week's own, and logged and told with them (`reopened`).
  -- Here rather than in the write, as only a publish is logged and told: a
  -- draft saved leaves it taken (at the top of this file). One on a shift
  -- that has begun stays as it was: nobody could take it now.
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
  into reopened_next_door
  from public.shift_swaps sw
  join public.schedule_shifts o on o.id = sw.shift_id
  join public.schedule_weeks nw on nw.id = o.week_id
  join public.businesses bz on bz.id = nw.business_id
  where nw.business_id = w.business_id
    and nw.id <> w.id
    and nw.starts_on between w.starts_on - 7 and w.starts_on + 7
    and o.day between w.starts_on - 1 and w.starts_on + 7
    and sw.status = 'taken'
    and ((o.day + o.starts_at) at time zone bz.timezone) > at_time
    and not private.can_take(sw.shift_id, sw.taken_by);

  update public.shift_swaps sw
  set status = 'open', taken_by = null, taken_at = null
  where sw.id in (
    select (r.value ->> 'id')::uuid from jsonb_array_elements(reopened_next_door) as r (value)
  );

  written := jsonb_set(
    written, '{reopened}', (written -> 'reopened') || reopened_next_door
  );

  after_people := private.week_people(week);

  -- Someone whose line of shifts differs, or who is on one side only.
  select coalesce(jsonb_agg(everyone.person order by everyone.person), '[]'::jsonb)
  into changed
  from (
    select p.key as person from jsonb_each(before_people) p
    union
    select p.key from jsonb_each(after_people) p
  ) everyone
  where (before_people -> everyone.person -> 'line')
    is distinct from (after_people -> everyone.person -> 'line');

  -- A week under way, published again: each of them hears of the nearest of
  -- their shifts that changed. What is published stands, whatever working
  -- that out does.
  if (written ->> 'running')::boolean and w.schedule_published_at is not null then
    begin
      select bz.timezone into business_zone
      from public.businesses bz
      where bz.id = w.business_id;

      select coalesce(jsonb_object_agg(c.person, c.first_change), '{}'::jsonb)
      into nearest
      from (
        select p.person,
          private.nearest_change(
            before_people -> p.person -> 'shifts',
            after_people -> p.person -> 'shifts',
            business_zone,
            at_time
          ) as first_change
        from jsonb_array_elements_text(changed) as p (person)
      ) c
      where c.first_change is not null;
    exception when others then
      raise warning 'the nearest changes of week % were not worked out: %', week, sqlerrm;
      nearest := '{}'::jsonb;
    end;
  end if;

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
      'nearest', nearest,
      'at', at_time
    )
  );

  return (written ->> 'shifts')::int;
end;
$$;

------------------------------------------------------------------------------
-- 4. The demo's renewal, in the same order

-- 20261107000800_templates_for_every_business.sql's, the same, with the weeks
-- either side locked with its own (private.lock_week_edges) where it locked
-- its own alone, so its publish takes no week out of order; and whoever
-- works those weeks next to this one is not put on a shift that runs into
-- theirs. (A clock change inside such a night is the one place the minutes
-- here and the moments the publish compares could differ: the renewal would
-- then fail as any refused publish does, and the week waits for the next
-- try, as the app's callers already allow.)
create or replace function private.renew_demo_schedule(business uuid)
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
  taken_user uuid[] := '{}'::uuid[];
  taken_day date[] := '{}'::date[];
  taken_from integer[] := '{}'::integer[];
  taken_to integer[] := '{}'::integer[];
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

  -- Under the week's lock, so two renewals at once publish it once: taken
  -- with the weeks either side, in the order every write of a week takes
  -- them (private.lock_week_edges), before the publish takes them again.
  perform private.lock_week_edges(week);
  if exists (
    select 1 from public.schedule_weeks w
    where w.id = week and w.schedule_published_at is not null
  ) then
    return false;
  end if;

  -- Whoever works the weeks either side on the days next to this one (the
  -- night before its first day, the day after its last) is taken for those
  -- shifts' minutes too, counted from this week's first midnight, so the
  -- picks below never put them on a shift that runs into one of theirs,
  -- which the publish would refuse (hint 'clash'). Those days are outside
  -- this week, so one shift a day holds as before.
  select
    coalesce(array_agg(a.user_id order by o.day, o.starts_at, a.user_id), '{}'::uuid[]),
    coalesce(array_agg(o.day order by o.day, o.starts_at, a.user_id), '{}'::date[]),
    coalesce(
      array_agg(
        (o.day - week_start) * 1440 + extract(epoch from o.starts_at)::integer / 60
        order by o.day, o.starts_at, a.user_id
      ),
      '{}'::integer[]
    ),
    coalesce(
      array_agg(
        (o.day - week_start) * 1440 + extract(epoch from o.ends_at)::integer / 60
          + (case when o.ends_at <= o.starts_at then 1440 else 0 end)
        order by o.day, o.starts_at, a.user_id
      ),
      '{}'::integer[]
    )
  into taken_user, taken_day, taken_from, taken_to
  from public.schedule_weeks nw
  join public.schedule_shifts o on o.week_id = nw.id
  join public.shift_assignments a on a.shift_id = o.id
  where nw.business_id = business
    and nw.id <> week
    and nw.starts_on between week_start - 7 and week_start + 7
    and o.day between week_start - 1 and week_start + 7;

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

------------------------------------------------------------------------------
-- Grants

-- The new helper: nobody but the database's own, as the write it serves.
revoke execute on function private.lock_week_edges(uuid)
  from public, anon, authenticated, service_role;

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the two writes granted to the secret key) again all the same.
revoke execute on function private.write_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  to service_role;
revoke execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  to service_role;
revoke execute on function private.renew_demo_schedule(uuid)
  from public, anon, authenticated;
