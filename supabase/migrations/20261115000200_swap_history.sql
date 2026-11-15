-- Swap history survives a deleted shift (the running-week plan's R1c; Orel's
-- answers of 15 November 2026 on #1). Until now a request went with its shift
-- (on delete cascade): whatever deleted a shift (a publish that left it out,
-- the demo's renewal, a week replaced) deleted every request ever made for
-- it, approved and declined ones too, and the activity log could no longer
-- say what they were about. Now:
--
--   the shift   shift_swaps.shift_id is `on delete set null`, and the row
--               keeps `shift`: the shift as it was when the request was made
--               (private.shift_brief: its day, name and hours, what every
--               member read on the published week), taken by
--               public.request_shift_swap, as lists keep theirs
--               (20261109000600_lists.sql). It is never rewritten: a request
--               is about the shift it asked for, and a change to that shift's
--               day or hours ends it while it waits
--               (20261115000100_week_in_place.sql). Backfilled here from the
--               earliest brief of the request the log or a line keeps (a
--               cancelled one's from the log row that ended it), and only
--               failing both from the live shift, which since that migration
--               may have been edited in place after the request closed.
--   waiting     a request still waiting (open or taken) always has its shift
--               (shift_swaps_live_shift). Whatever deletes a shift ends its
--               waiting requests first, as private.write_week_schedule does,
--               telling both their people (swap.removed); a delete that
--               doesn't (by hand, a test's clean-up) is refused, 23514, rather
--               than leave a request waiting on a shift that is gone. A
--               business deleted (a demo reset, a purge) still takes its
--               requests with it: the cascade from the business deletes them
--               in the same round as its shifts, before the shifts' own set
--               null runs and finds nothing to clear.
--   why         a cancelled request says why (`cancelled_because`, set exactly
--               when it is cancelled, shift_swaps_cancelled_says_why):
--               'withdrawn' by whoever asked (public.cancel_shift_swap),
--               'schedule' by a save or a publish
--               (private.write_week_schedule), 'team' when whoever asked left
--               the team or the staff (private.leave_staff, from
--               public.remove_member and public.set_member_role). Backfilled
--               from the log: a request a publish's `removed_swaps` names was
--               ended by the schedule, one a team change's `swaps` names by
--               the team, and any other was withdrawn, the only other way a
--               request was ever cancelled.
--
-- This replaces the note at 20261105000100_shift_swaps.sql:21-23 ("Publishing
-- changes to a week replaces its shifts, so their open swaps go with them (on
-- delete cascade)"): a week is written in place now, a request keeps its shift
-- while the shift is there, and its history outlives it. The policy on
-- shift_swaps is unchanged: the business's staff read its requests, history
-- too, as they read the published week the snapshots come from.
--
-- Every function and read that joins a request to its shift was checked for a
-- shift that is gone. Those that join (private.leave_staff,
-- private.write_week_schedule, public.publish_week_schedule,
-- private.notify_for_team, public.claim_invite) read only waiting requests,
-- which always have one; public.take_shift_swap, public.cancel_shift_swap and
-- public.decide_shift_swap refuse a request no longer waiting before they read
-- its shift; private.notify_for reads a request's shift as its own step is
-- logged, while the shift is there. None of them changes for it.
--
-- It replaces, from their latest versions and with only these changes:
-- public.request_shift_swap (20261114000100_team_changes.sql's), which keeps
-- the snapshot (and names its `shift` argument by the function's name where
-- the table's new column of that name is in reach); public.cancel_shift_swap
-- (20261105000100_shift_swaps.sql's), private.leave_staff
-- (20261114000100_team_changes.sql's) and private.write_week_schedule
-- (20261115000100_week_in_place.sql's), which say why they cancel. The same
-- signatures, so the same grants, revoked again all the same.

------------------------------------------------------------------------------
-- 1. The request keeps its shift, and why it was cancelled

alter table public.shift_swaps add column shift jsonb;
alter table public.shift_swaps
  add column cancelled_because text
    check (cancelled_because in ('withdrawn', 'schedule', 'team'));

-- Every request so far has its shift (the cascade took the others), but not
-- always as it asked for it: since 20261115000100_week_in_place.sql a shift is
-- edited in place, and a request closed on it (cancelled, approved, declined)
-- stays on it while its day or hours change. So each takes the earliest brief
-- kept of it: from the log, where a publish or a team change ended it or
-- opened it again (`removed_swaps` and `swaps`, read before the write, and
-- `reopened`), or from a line about it (public.notifications, `shift` as each
-- step was logged). Every one was read while the request waited or as it
-- closed, so with the day and hours it asked for: a change to them ends a
-- waiting request (and deleted it before that migration), and a request a
-- publish opens again is one whose day and hours it left alone. Failing both,
-- the live shift.
update public.shift_swaps sw
set shift = coalesce(
  (
    select kept.brief
    from (
      select l.created_at as kept_at, e.value -> 'shift' as brief
      from public.audit_log l
      cross join lateral jsonb_array_elements(
        coalesce(l.details -> 'removed_swaps', '[]'::jsonb)
          || coalesce(l.details -> 'swaps', '[]'::jsonb)
          || coalesce(l.details -> 'reopened', '[]'::jsonb)
      ) as e (value)
      where l.business_id = sw.business_id
        and l.action in ('schedule.publish', 'member.remove', 'member.role')
        and e.value ->> 'id' = sw.id::text
      union all
      select n.created_at, n.params -> 'shift'
      from public.notifications n
      where n.business_id = sw.business_id
        and n.kind like 'swap.%'
        and n.params ->> 'swap' = sw.id::text
    ) kept
    where jsonb_typeof(kept.brief) = 'object'
    order by kept.kept_at
    limit 1
  ),
  private.shift_brief(sw.shift_id)
);

alter table public.shift_swaps alter column shift set not null;

update public.shift_swaps sw
set cancelled_because = (case
    when exists (
      select 1
      from public.audit_log l
      where l.business_id = sw.business_id
        and l.action = 'schedule.publish'
        and l.details -> 'removed_swaps' @> jsonb_build_array(jsonb_build_object('id', sw.id))
    ) then 'schedule'
    when exists (
      select 1
      from public.audit_log l
      where l.business_id = sw.business_id
        and l.action in ('member.remove', 'member.role')
        and l.details -> 'swaps' @> jsonb_build_array(jsonb_build_object('id', sw.id))
    ) then 'team'
    else 'withdrawn'
  end)
where sw.status = 'cancelled';

alter table public.shift_swaps
  add constraint shift_swaps_cancelled_says_why
    check ((status = 'cancelled') = (cancelled_because is not null));

-- The shift goes and the request stays; while it waits, it has its shift.
alter table public.shift_swaps drop constraint shift_swaps_shift_id_fkey;
alter table public.shift_swaps alter column shift_id drop not null;
alter table public.shift_swaps
  add constraint shift_swaps_shift_id_fkey
    foreign key (shift_id) references public.schedule_shifts (id) on delete set null;
alter table public.shift_swaps
  add constraint shift_swaps_live_shift
    check (shift_id is not null or status not in ('open', 'taken'));

-- What a deleted shift's set null looks up (the live index holds only the
-- waiting ones).
create index shift_swaps_shift_id_idx on public.shift_swaps (shift_id);

comment on column public.shift_swaps.shift_id is
  'The shift asked for, while it is there: null once it is deleted (on delete set null), and never while the request waits (shift_swaps_live_shift), so whatever deletes a shift ends its waiting requests first (private.write_week_schedule).';
comment on column public.shift_swaps.shift is
  'The shift as it was when the request was made (private.shift_brief: day, name, start, end), taken by public.request_shift_swap and never rewritten, so the request and the activity log still name it after the shift moves or goes.';
comment on column public.shift_swaps.cancelled_because is
  'Why a cancelled request was cancelled, set exactly then: withdrawn (by whoever asked, public.cancel_shift_swap), schedule (a save or a publish changed or deleted its shift, or took whoever asked off it: private.write_week_schedule) or team (whoever asked left the team or the staff: private.leave_staff).';

------------------------------------------------------------------------------
-- 2. Asking keeps the shift as it is

-- 20261114000100_team_changes.sql's, the same (the actor's membership locked
-- first), and the request keeps its shift as it is now (`shift`). The table
-- has a column named `shift` now, so the argument is named by the function's
-- name in a statement that reads the table.
create or replace function public.request_shift_swap(
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

  perform 1
  from public.memberships m
  where m.business_id = s.business_id and m.user_id = actor
  for share;

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
    where w.shift_id = request_shift_swap.shift and w.requested_by = actor
      and w.status in ('open', 'taken')
  ) then
    raise exception 'Already asked to give this shift away' using errcode = '23505';
  end if;

  insert into public.shift_swaps (business_id, shift_id, requested_by, note, shift)
  values (s.business_id, request_shift_swap.shift, actor, nullif(btrim(note), ''),
    private.shift_brief(request_shift_swap.shift))
  returning id into swap_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (s.business_id, actor, 'swap.request', jsonb_build_object('swap', swap_id, 'shift', shift));

  return swap_id;
end;
$$;

------------------------------------------------------------------------------
-- 3. Saying why a request was cancelled

-- 20261105000100_shift_swaps.sql's, the same, and the request says it was
-- withdrawn.
create or replace function public.cancel_shift_swap(actor uuid, swap uuid)
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

  update public.shift_swaps set status = 'cancelled', cancelled_because = 'withdrawn'
  where id = swap;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (w.business_id, actor, 'swap.cancel', jsonb_build_object('swap', swap));
end;
$$;

-- 20261114000100_team_changes.sql's, the same, and the requests whoever left
-- had asked for say the team ended them.
create or replace function private.leave_staff(business uuid, person uuid, at_time timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  local_today date;
  taken_published jsonb;
  draft_count integer;
  swaps_gone jsonb;
  swaps_back jsonb;
  department_count integer;
  list_count integer;
  list_time_count integer;
begin
  select b.timezone into tz from public.businesses b where b.id = business;
  local_today := (at_time at time zone coalesce(tz, 'Asia/Jerusalem'))::date;

  -- Every week that may still hold a shift to start, in publish_week_schedule's
  -- order (the week, then its swaps): a publish or a draft saved under way
  -- finishes first (both lock the week first, section 9), and what it wrote
  -- is then taken off too; one after this finds the person off the team
  -- (22023) or off the staff (42501).
  perform 1
  from public.schedule_weeks w
  where w.business_id = business and w.starts_on >= local_today - 7
  order by w.starts_on
  for update;

  -- Every live swap they asked for or took, locked in one statement after the
  -- weeks; then each of the two kinds has its own end. A request or a take of
  -- theirs under way finished before the caller locked their membership, and
  -- one after waits for it (section 10), so none is missed here.
  perform 1
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where sw.business_id = business
    and sw.status in ('open', 'taken')
    and (sw.requested_by = person or sw.taken_by = person)
    and (s.day + s.starts_at) at time zone coalesce(tz, 'Asia/Jerusalem') > at_time
  for update of sw;

  -- The ones they asked for, open or taken: cancelled, their taker (if any)
  -- told, since their own place on the shift comes off below.
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
  into swaps_gone
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where sw.business_id = business
    and sw.status in ('open', 'taken')
    and sw.requested_by = person
    and (s.day + s.starts_at) at time zone coalesce(tz, 'Asia/Jerusalem') > at_time;

  -- The ones they took from a colleague, waiting for a manager: open again,
  -- the colleague still on the shift, so someone else may take it. Who took
  -- it is the person, so only who asked is kept.
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
  into swaps_back
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where sw.business_id = business
    and sw.status = 'taken'
    and sw.taken_by = person
    and (s.day + s.starts_at) at time zone coalesce(tz, 'Asia/Jerusalem') > at_time;

  update public.shift_swaps sw
  set status = 'cancelled', cancelled_because = 'team'
  where sw.id in (
    select (g.value ->> 'id')::uuid from jsonb_array_elements(swaps_gone) as g (value)
  );

  -- Open with no taker, as shift_swaps' checks want ((status = 'open') =
  -- (taken_by is null)); still the one live request of its asker on the
  -- shift (shift_swaps_live_idx), as it was while taken.
  update public.shift_swaps sw
  set status = 'open', taken_by = null, taken_at = null
  where sw.id in (
    select (g.value ->> 'id')::uuid from jsonb_array_elements(swaps_back) as g (value)
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'week', s.week_id,
        'starts_on', w.starts_on,
        'day', s.day,
        'name', s.name,
        'start', left(s.starts_at::text, 5),
        'end', left(s.ends_at::text, 5)
      )
      order by s.day, s.starts_at, s.name
    ),
    '[]'::jsonb
  )
  into taken_published
  from public.shift_assignments a
  join public.schedule_shifts s on s.id = a.shift_id
  join public.schedule_weeks w on w.id = s.week_id
  where a.business_id = business
    and a.user_id = person
    and w.schedule_published_at is not null
    and (s.day + s.starts_at) at time zone coalesce(tz, 'Asia/Jerusalem') > at_time;

  select count(*)::integer into draft_count
  from public.shift_assignments a
  join public.schedule_shifts s on s.id = a.shift_id
  join public.schedule_weeks w on w.id = s.week_id
  where a.business_id = business
    and a.user_id = person
    and w.schedule_published_at is null
    and (s.day + s.starts_at) at time zone coalesce(tz, 'Asia/Jerusalem') > at_time;

  delete from public.shift_assignments a
  using public.schedule_shifts s
  where s.id = a.shift_id
    and a.business_id = business
    and a.user_id = person
    and (s.day + s.starts_at) at time zone coalesce(tz, 'Asia/Jerusalem') > at_time;

  delete from public.department_members dm
  where dm.business_id = business and dm.user_id = person;
  get diagnostics department_count = row_count;

  delete from public.list_people p
  using public.lists l
  where l.id = p.list_id and l.status = 'open'
    and p.business_id = business and p.user_id = person;
  get diagnostics list_count = row_count;

  delete from public.list_schedules ls
  where ls.business_id = business and ls.recipient_user = person;
  get diagnostics list_time_count = row_count;

  return jsonb_build_object(
    'shifts', taken_published,
    'drafts', draft_count,
    'swaps', swaps_gone,
    'reopened', swaps_back,
    'departments', department_count,
    'lists', list_count,
    'list_times', list_time_count
  );
end;
$$;

-- 20261115000100_week_in_place.sql's, the same, and the requests it ends say
-- the schedule ended them. A deleted shift's requests stay, their shift
-- cleared and their snapshot kept; none of them still waits, since every
-- waiting one on a shift it deletes is among those it ends.
create or replace function private.write_week_schedule(
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
  set status = 'cancelled', cancelled_because = 'schedule'
  where sw.id in (
    select (e.value ->> 'id')::uuid from jsonb_array_elements(ended) as e (value)
  );

  -- A deleted shift's requests stay, its id cleared from them (on delete set
  -- null) and the shift they asked for kept on each; none still waits.
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
-- Grants

-- Replaced in place (sections 2 and 3): the same signatures, so their grants
-- stay; revoked and granted again all the same, as before.
revoke execute on function public.request_shift_swap(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.request_shift_swap(uuid, uuid, text, timestamptz)
  to service_role;
revoke execute on function public.cancel_shift_swap(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_shift_swap(uuid, uuid) to service_role;
revoke execute on function private.leave_staff(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.write_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
