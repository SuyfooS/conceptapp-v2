-- The running week's notifications (the running-week plan's R2b; Orel's
-- answers to Q4 and Q5 of 15 November 2026 on #1). Since
-- 20261115000300_running_week.sql a published week changes while it runs, so
-- what its people hear says what is left of it, and which of their shifts
-- changed:
--
--   running     schedule.published and schedule.changed for a week that had
--               begun at the log row's moment (`running` and `at`, logged by
--               the publish) carry `running: true`, and `mine` counts the
--               person's shifts still to start then (their start, on the
--               business's clock, after that moment, as everywhere else).
--               Without them (a row from before them, or one of a week still
--               to come) a line is as before: every shift of the person's
--               week, and no more.
--   first       a week's first publish in the middle of the week tells only
--               the active members with a shift still to start, how many are
--               left, and reaches their phone only until the first of them
--               starts.
--   nearest     (Orel's answer 5) the line of someone whose shifts a publish
--               of a week under way changed names the nearest one that did:
--               `nearest`, {"change", "shift", "from"}, its change ('moved':
--               the same shift on another day or at other hours, named as it
--               is now; 'edited': the same shift and hours with another name
--               or position only, named as it is now; 'added': a shift they
--               are on now, a shift under way they joined included;
--               'removed': one they are no longer on, named as it was), the
--               shift as a line shows one (day, name, start, end), and when
--               the change counts from. The nearest is the one that starts
--               first, a shift moved counted from the earlier of its two
--               starts; an edit, which moves nothing, only when nothing else
--               changed. The publish works it out from each person's shifts
--               before and after (private.week_people, which now lists them
--               by id beside the text it compared, and
--               private.nearest_change), and the log row keeps it per changed
--               person (`nearest`: {person id: {"shift" id, "change",
--               "brief", "from", "until"}}, ids and the shift's day, name and
--               hours, never a person's name; empty for a week not under way,
--               and, should working it out fail, a warning that never holds
--               up the publish). A nearer change the person hasn't heard of
--               yet (their line unread, its push not gone) stays named while
--               it still holds and its shift is ahead, so a burst of
--               publishes never loses it: a later publish names its own only
--               when that one is nearer.
--   in time     (Orel's answer 4) quiet hours are kept: a push they hold waits
--               for their end, as before, and is never sent once the shift it
--               is about has begun. A changed line reaches the phone until its
--               nearest shift starts, or ends when it has begun (a join); a
--               first publish's, until the person's first shift still to
--               start (`push_until`, the line's push_before, which
--               public.claim_due_pushes already reads). The line is in the
--               app at once, whatever the phone does; the generic line for the
--               manager is the builder's (R3a).
--   bursts      a schedule.changed push waits two minutes from the publish
--               (push_after, never earlier than quiet hours say), and a later
--               publish of the week replaces the push still waiting with its
--               own (the line's dedupe key, `schedule:<week>`), so several
--               small fixes in one evening make one push per person. Every
--               week's changes, not only a running one's. Choices saved
--               meanwhile (public.set_notification_preferences) keep the two
--               minutes.
--   unfilled    a publish counts the week's schedule.unfilled lines again,
--               at its moment: settled when none of its shifts still to start
--               lacks someone, and otherwise their count lowered to that when
--               it is fewer, read or not as they were, nothing pushed again
--               (until now any publish settled them). Never raised: a shift a
--               builder publishes with nobody on it wasn't freed by a team
--               change, which is what the line says.
--
-- It replaces, from their latest versions and with only these changes:
-- private.week_people (20261109000450_notifications.sql's), which lists each
-- person's shifts by id beside the same text; public.publish_week_schedule
-- (20261115000300_running_week.sql's), which compares that text and logs
-- `nearest`; private.notify_for (20261109000450_notifications.sql's), whose
-- schedule.publish lines follow the rules above; private.notify_for_team
-- (20261115000100_week_in_place.sql's), which counts schedule.unfilled again
-- at a publish; and public.set_notification_preferences
-- (20261112000100_notification_preferences.sql's), which keeps the
-- two-minute hold. The same signatures, so the same grants, revoked (and
-- granted) again all the same. Two new private helpers: private.shifts_ahead
-- and private.nearest_change. private.push_plan, public.claim_due_pushes
-- (20261112000100_notification_preferences.sql's) and private.settle_unfilled
-- (20261114000100_team_changes.sql's) stay as they are.

------------------------------------------------------------------------------
-- 1. Each person's shifts, by id

-- 20261109000450_notifications.sql's, the same line of text per person
-- (`line`, which says whose shifts a publish changed), and beside it the same
-- shifts in the same order, each with its id, as a line names a shift
-- (`shifts`: [{"shift", "day", "start", "end", "name", "position"}], times
-- "HH:MM"), so a publish can say which of them changed.
create or replace function private.week_people(week uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(p.user_id, jsonb_build_object('line', p.shifts, 'shifts', p.entries)),
    '{}'::jsonb
  )
  from (
    select a.user_id,
      string_agg(
        concat_ws('|', s.day, s.starts_at, s.ends_at, s.name, a.position_key),
        ',' order by s.day, s.starts_at, s.name
      ) as shifts,
      jsonb_agg(
        jsonb_build_object(
          'shift', s.id,
          'day', s.day,
          'start', left(s.starts_at::text, 5),
          'end', left(s.ends_at::text, 5),
          'name', s.name,
          'position', a.position_key
        )
        order by s.day, s.starts_at, s.name
      ) as entries
    from public.shift_assignments a
    join public.schedule_shifts s on s.id = a.shift_id
    where s.week_id = week
    group by a.user_id
  ) p
$$;

------------------------------------------------------------------------------
-- 2. Helpers

-- How many of `person`'s shifts in the week start after `at_time` (their day
-- and start on the business's clock, where private.shift_span and
-- private.unfilled_shifts start them), and when the first of them does; 0 and
-- null when none.
create function private.shifts_ahead(person uuid, week uuid, at_time timestamptz)
returns table (shift_count integer, first_start timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, min(o.starts)
  from (
    select ((s.day + s.starts_at) at time zone bz.timezone) as starts
    from public.shift_assignments a
    join public.schedule_shifts s on s.id = a.shift_id
    join public.businesses bz on bz.id = s.business_id
    where s.week_id = week and a.user_id = person
  ) o
  where o.starts > at_time
$$;

-- The nearest of one person's shifts that changed between two lists of them
-- (private.week_people's `shifts`, before and after a write), or null when
-- none did. A shift on one side the same as one on the other (day, hours,
-- name and position) didn't change, whatever its id (a week replaced with
-- nothing read gives every shift a new id). Otherwise a shift on both sides,
-- by id, was 'moved' when its day or hours differ and 'edited' when only its
-- name or position does, named as it is after; one only after was 'added' (a
-- shift under way they joined included); one only before was 'removed', named
-- as it was. The nearest starts first, on the clock of `zone_name` (a shift
-- moved counted from the earlier of its two starts), by id when two start
-- together; an edit, which changes nothing of when they work, only when
-- nothing else changed. Returns {"shift": its id, "change", "brief": {day,
-- name, start, end}, "from", "until"}: when the change counts from (the start
-- it was ordered by), and when a push about it is too late, its start, or its
-- end when it had begun at `at_time` (the next day when it ends at or before
-- its start).
create function private.nearest_change(
  before_shifts jsonb,
  after_shifts jsonb,
  zone_name text,
  at_time timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with was as (
    select e.value ->> 'shift' as shift_key,
      e.value - 'shift' as content,
      (((e.value ->> 'day')::date + (e.value ->> 'start')::time) at time zone zone_name) as starts
    from jsonb_array_elements(coalesce(before_shifts, '[]'::jsonb)) as e (value)
  ),
  now_is as (
    select e.value ->> 'shift' as shift_key,
      e.value - 'shift' as content,
      (((e.value ->> 'day')::date + (e.value ->> 'start')::time) at time zone zone_name) as starts
    from jsonb_array_elements(coalesce(after_shifts, '[]'::jsonb)) as e (value)
  ),
  gone as (
    select x.shift_key, x.content, x.starts
    from was x
    where not exists (select 1 from now_is y where y.content = x.content)
  ),
  came as (
    select y.shift_key, y.content, y.starts
    from now_is y
    where not exists (select 1 from was x where x.content = y.content)
  ),
  changes as (
    select c.shift_key,
      (case
        when g.shift_key is null then 'added'
        when (c.content - 'name' - 'position') = (g.content - 'name' - 'position') then 'edited'
        else 'moved'
      end) as change,
      c.content,
      c.starts,
      least(c.starts, g.starts) as sort_at
    from came c
    left join gone g on g.shift_key = c.shift_key
    union all
    select g.shift_key, 'removed', g.content, g.starts, g.starts
    from gone g
    where not exists (select 1 from came c where c.shift_key = g.shift_key)
  )
  select jsonb_build_object(
      'shift', ch.shift_key,
      'change', ch.change,
      'brief', ch.content - 'position',
      'from', ch.sort_at,
      'until', (case
        when ch.starts > at_time then ch.starts
        else (
          ((ch.content ->> 'day')::date
            + (case
                when (ch.content ->> 'end')::time <= (ch.content ->> 'start')::time then 1
                else 0
              end)
            + (ch.content ->> 'end')::time) at time zone zone_name
        )
      end)
    )
  from changes ch
  order by (ch.change = 'edited'), ch.sort_at, ch.shift_key
  limit 1
$$;

------------------------------------------------------------------------------
-- 3. Publishing says which shift changed

-- 20261115000300_running_week.sql's, the same, with private.week_people's
-- new shape: whose shifts changed is read from its `line`, as before; and a
-- week under way published again logs, for each person whose shifts changed,
-- the nearest shift that did (`nearest`, by person: private.nearest_change at
-- the write's moment, on the business's clock), empty otherwise, and empty
-- with a warning should working it out fail: the publish stands.
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
-- 4. What a publish tells its people

-- 20261109000450_notifications.sql's, the same for every action but
-- schedule.publish, whose lines now follow the header above:
--
--   schedule.publish  at its moment (`at`, else when it was logged). The
--                     first time: everyone but the publisher, or, in a week
--                     that had begun (`running`), only those with a shift
--                     still to start, counting those and reaching the phone
--                     until the first of them starts. Again: those whose own
--                     shifts changed, in a week that had begun with how many
--                     are left and the nearest that changed (`nearest`, or
--                     the one their line already names when they haven't
--                     heard of it yet, it still holds, and it is nearer),
--                     reaching the phone until it starts (or ends, once
--                     begun); on the phone two minutes after the publish, so
--                     a later one replaces the push still waiting; and the
--                     people of each waiting request it removed, as before.
create or replace function private.notify_for(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := entry.details;
  b uuid := entry.business_id;
  w public.shift_swaps%rowtype;
  e public.time_entries%rowtype;
  person uuid;
  gone jsonb;
  proof text;
  thing text;
  arrival_open boolean;
  departure_open boolean;
  leaving boolean;
  for_role public.member_role;
  recipients uuid[];
  facts jsonb;
  moment timestamptz;
  running boolean;
  ahead integer;
  until_at timestamptz;
  near jsonb;
  prior_near jsonb;
  prior_until timestamptz;
  prior_on boolean;
  prior_kept boolean;
  written integer;
begin
  case entry.action
  when 'schedule.publish' then
    -- The publish's moment and whether the week had begun then; a row
    -- without them (from before them) is of a week still to come.
    moment := coalesce((d ->> 'at')::timestamptz, entry.created_at);
    running := coalesce((d ->> 'running')::boolean, false);

    if coalesce((d ->> 'first')::boolean, false) then
      for person in
        select m.user_id from public.memberships m
        where m.business_id = b and m.active
      loop
        -- Under way: only someone with a shift still to start, how many, and
        -- on the phone until the first of them starts.
        if running then
          select h.shift_count, h.first_start into ahead, until_at
          from private.shifts_ahead(person, (d ->> 'week')::uuid, moment) h;
          continue when ahead = 0;
        else
          ahead := private.own_shift_count(person, (d ->> 'week')::uuid);
          until_at := null;
        end if;

        facts := jsonb_build_object(
          'week', d -> 'week',
          'startsOn', d -> 'starts_on',
          'mine', ahead
        );
        if running then
          facts := facts || jsonb_build_object('running', true);
        end if;

        perform private.notify(
          b, array[person], 'schedule.published'::text, facts,
          entry.actor_id, 'scheduling'::public.module_key, 'worker'::public.member_role,
          'schedule:' || (d ->> 'week'),
          push_until => until_at,
          at_time => moment
        );
      end loop;
    else
      for person in
        select c.value::uuid
        from jsonb_array_elements_text(coalesce(d -> 'changed', '[]'::jsonb)) as c (value)
      loop
        -- Under way: how many are left, and the nearest shift that changed,
        -- on the phone until it starts (or ends, once begun).
        near := null;
        until_at := null;
        if running then
          ahead := (
            select h.shift_count
            from private.shifts_ahead(person, (d ->> 'week')::uuid, moment) h
          );
          near := d -> 'nearest' -> person::text;
          if jsonb_typeof(near) = 'object' then
            until_at := (near ->> 'until')::timestamptz;
            near := jsonb_build_object(
              'change', near -> 'change', 'shift', near -> 'brief', 'from', near -> 'from'
            );
          else
            near := null;
          end if;

          -- The change their line names already, when they haven't heard of
          -- it yet: unread, and its push not gone (held for its two minutes,
          -- by quiet hours, or never to go, with no phone). Several publishes
          -- in a row then never lose a nearer one: it stays named while it
          -- still holds of them and its shift is ahead, unless this
          -- publish's own is nearer.
          select l.params -> 'nearest', l.push_before
          into prior_near, prior_until
          from public.notifications l
          where l.business_id = b
            and l.user_id = person
            and l.dedupe_key = 'schedule:' || (d ->> 'week')
            and l.kind = 'schedule.changed'
            and l.read_at is null
            and l.resolved_at is null
            and l.push_state not in ('sending', 'sent');
          prior_kept := false;
          if jsonb_typeof(prior_near) = 'object' and prior_until > moment then
            -- On a shift as it names it, now: what a move, an edit or an
            -- addition says still holds, and a removal holds while they
            -- aren't.
            prior_on := exists (
              select 1
              from public.shift_assignments a
              join public.schedule_shifts s on s.id = a.shift_id
              where s.week_id = (d ->> 'week')::uuid
                and a.user_id = person
                and s.day = (prior_near #>> '{shift,day}'::text[])::date
                and s.starts_at = (prior_near #>> '{shift,start}'::text[])::time
                and s.ends_at = (prior_near #>> '{shift,end}'::text[])::time
                and s.name = (prior_near #>> '{shift,name}'::text[])
            );
            -- Nearer as private.nearest_change orders: an edit after any
            -- other change, then by when each counts from.
            prior_kept := (case
                when prior_near ->> 'change' = 'removed' then not prior_on
                else prior_on
              end)
              and (
                near is null
                or ((prior_near ->> 'change') = 'edited', (prior_near ->> 'from')::timestamptz)
                  < ((near ->> 'change') = 'edited', (near ->> 'from')::timestamptz)
              );
          end if;
          if prior_kept then
            near := prior_near;
            until_at := prior_until;
          end if;
        else
          ahead := private.own_shift_count(person, (d ->> 'week')::uuid);
        end if;

        facts := jsonb_build_object(
          'week', d -> 'week',
          'startsOn', d -> 'starts_on',
          'mine', ahead
        );
        if running then
          facts := facts || jsonb_build_object('running', true);
        end if;
        if near is not null then
          facts := facts || jsonb_build_object('nearest', near);
        end if;

        written := private.notify(
          b, array[person], 'schedule.changed'::text, facts,
          entry.actor_id, 'scheduling'::public.module_key, 'worker'::public.member_role,
          'schedule:' || (d ->> 'week'),
          push_until => until_at,
          at_time => moment
        );

        -- On the phone two minutes after the publish, or when quiet hours
        -- end if later: a publish of the week before then replaces this
        -- push with its own, through the same line.
        if written > 0 then
          update public.notifications n
          set push_after = greatest(n.push_after, moment + interval '2 minutes')
          where n.business_id = b
            and n.user_id = person
            and n.dedupe_key = 'schedule:' || (d ->> 'week')
            and n.push_state = 'queued';
        end if;
      end loop;
      for gone in
        select c.value
        from jsonb_array_elements(coalesce(d -> 'removed_swaps', '[]'::jsonb)) as c (value)
      loop
        perform private.notify(
          b,
          array[(gone ->> 'requested_by')::uuid, (gone ->> 'taken_by')::uuid],
          'swap.removed',
          jsonb_build_object('swap', gone -> 'id', 'shift', gone -> 'shift'),
          entry.actor_id, 'scheduling', 'worker', 'swap:' || (gone ->> 'id')
        );
        perform private.resolve_notifications(b, 'swap.offer:' || (gone ->> 'id'));
        perform private.resolve_notifications(b, 'swap.approval:' || (gone ->> 'id'));
      end loop;
    end if;

  when 'swap.request' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      perform private.notify(
        b,
        array(
          select m.user_id from public.memberships m
          where m.business_id = b and m.active and m.user_id <> w.requested_by
            and private.can_take(w.shift_id, m.user_id)
        ),
        'swap.offered',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'from', w.requested_by
        ),
        entry.actor_id, 'scheduling', 'worker', 'swap.offer:' || w.id
      );
    end if;

  when 'swap.take' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      perform private.notify(
        b, array[w.requested_by], 'swap.taken',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'by', w.taken_by
        ),
        entry.actor_id, 'scheduling', 'worker', 'swap:' || w.id
      );
      perform private.notify(
        b, private.members_in(b, '{owner,manager}'::public.member_role[]),
        'swap.waiting',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'from', w.requested_by,
          'to', w.taken_by
        ),
        entry.actor_id, 'scheduling', 'manager', 'swap.approval:' || w.id
      );
      perform private.resolve_notifications(b, 'swap.offer:' || w.id);
    end if;

  when 'swap.cancel' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      if w.taken_by is not null then
        perform private.notify(
          b, array[w.taken_by], 'swap.cancelled',
          jsonb_build_object(
            'swap', w.id,
            'shift', private.shift_brief(w.shift_id),
            'from', w.requested_by
          ),
          entry.actor_id, 'scheduling', 'worker', 'swap:' || w.id
        );
      end if;
      perform private.resolve_notifications(b, 'swap.offer:' || w.id);
      perform private.resolve_notifications(b, 'swap.approval:' || w.id);
    end if;

  when 'swap.approve', 'swap.decline' then
    perform private.notify(
      b,
      array[(d ->> 'from')::uuid, (d ->> 'to')::uuid],
      case entry.action when 'swap.approve' then 'swap.approved' else 'swap.declined' end,
      jsonb_build_object(
        'swap', d -> 'swap',
        'shift', private.shift_brief((d ->> 'shift')::uuid),
        'from', d -> 'from',
        'to', d -> 'to'
      ),
      entry.actor_id, 'scheduling', 'worker', 'swap:' || (d ->> 'swap')
    );
    perform private.resolve_notifications(b, 'swap.approval:' || (d ->> 'swap'));

  when 'clock.in', 'clock.out', 'clock.add', 'clock.correct', 'clock.undo_out' then
    select * into e from public.time_entries t where t.id = (d ->> 'entry')::uuid;
    if found then
      thing := 'clock.confirm:' || e.id;
      -- What is left to confirm, by the rule of confirm_time_entry: the arrival
      -- until confirmed, and a departure after the last confirmation. Hours
      -- someone set for themselves are an owner's to confirm.
      arrival_open := coalesce(e.in_proof, '') in ('none', 'self') and e.confirmed_at is null;
      departure_open := coalesce(e.out_proof, '') in ('none', 'self')
        and coalesce(e.confirmed_at is null or e.confirmed_at < e.clock_out, false);
      proof := case
        when (arrival_open and e.in_proof = 'self') or (departure_open and e.out_proof = 'self')
          then 'self'
        when arrival_open or departure_open then 'none'
      end;
      if proof is null then
        -- Nothing left to confirm: an owner's correction, an undone clock-out.
        perform private.resolve_notifications(b, thing);
      else
        for_role := (case proof when 'self' then 'owner' else 'manager' end)::public.member_role;
        recipients := private.members_in(
          b,
          case proof
            when 'self' then '{owner}'::public.member_role[]
            else '{owner,manager}'::public.member_role[]
          end
        );
        -- The line tells a time that waits, whatever the action was: the
        -- departure, the later of the two, unless the arrival is what makes
        -- the hours an owner's.
        leaving := departure_open and (not arrival_open or e.out_proof = proof);
        facts := jsonb_build_object(
          'entry', e.id,
          'person', e.user_id,
          'proof', proof,
          'direction', case when leaving then 'out' else 'in' end,
          'at', case when leaving then e.clock_out else e.clock_in end
        );
        -- Anyone who may no longer confirm them (a manager, once the hours rest
        -- on someone's own word) is done with them.
        perform private.resolve_notifications(b, thing, still_for => recipients);
        if entry.action = 'clock.undo_out' then
          -- The departure is gone and the arrival still waits: the lines say
          -- so without coming back unread, and anyone new to them gets one.
          update public.notifications n
          set params = facts, audience_role = for_role
          where n.business_id = b and n.dedupe_key = thing and n.resolved_at is null;
          perform private.notify(
            b, recipients, 'clock.confirm', facts, entry.actor_id, 'time_clock',
            for_role, thing,
            realert => false,
            leave_out => array[e.user_id]
          );
        elsif entry.action <> 'clock.out' or departure_open then
          -- A clock-out tells again only when the departure itself waits.
          perform private.notify(
            b, recipients, 'clock.confirm', facts,
            -- Whoever did it: the person, or the manager who corrected it.
            entry.actor_id, 'time_clock', for_role, thing,
            -- Never to the person whose hours they are.
            leave_out => array[e.user_id]
          );
        end if;
      end if;
    end if;

  when 'clock.confirm' then
    perform private.resolve_notifications(b, 'clock.confirm:' || (d ->> 'entry'));

  when 'invite.claim' then
    perform private.notify(
      b, private.members_in(b, '{owner,manager}'::public.member_role[]),
      'team.joined',
      jsonb_build_object('person', entry.actor_id),
      entry.actor_id, null::public.module_key, 'manager',
      'team.joined:' || entry.actor_id
    );

  else
    null;
  end case;
end;
$$;

------------------------------------------------------------------------------
-- 5. A publish counts the shifts that lack someone again

-- 20261115000100_week_in_place.sql's, the same, but a publish no longer
-- settles the week's schedule.unfilled lines whatever it did: it counts the
-- week's shifts still to start that lack someone at its moment, and settles
-- the lines at 0, or otherwise lowers the count of those still open to it
-- when it is fewer, read or not as they were and nothing pushed again (its
-- builders saw the week as they published it). Never raised: a shift
-- published with nobody on it wasn't freed by a team change, as the line
-- says its shifts were.
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
    gaps := private.unfilled_shifts((d ->> 'week')::uuid, moment);
    if gaps = 0 then
      perform private.resolve_notifications(b, 'schedule.unfilled:' || (d ->> 'week'), moment);
    else
      update public.notifications n
      set params = jsonb_set(
        n.params, '{count}'::text[], to_jsonb(least((n.params ->> 'count')::integer, gaps))
      )
      where n.business_id = b
        and n.dedupe_key = 'schedule.unfilled:' || (d ->> 'week')
        and n.resolved_at is null;
    end if;
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
-- 6. Choices saved meanwhile keep the two minutes

-- 20261112000100_notification_preferences.sql's, the same, but a push it
-- moves to now (one held more than a minute, as the two minutes are for a
-- publish's first minute) keeps a schedule.changed line's two minutes from
-- its publish: otherwise choices saved in that minute would send it at once,
-- and a publish of the week within the two minutes a second push.
create or replace function public.set_notification_preferences(
  phone_group text default null,
  phone_on boolean default null,
  quiet_on boolean default null,
  quiet_start time default null,
  quiet_stop time default null,
  lock_previews boolean default null,
  tz_name text default null
)
returns table (
  off_groups text[],
  quiet_starts time,
  quiet_stops time,
  zone_name text,
  shows_previews boolean,
  asked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.preferences_owner();
  saved public.notification_preferences%rowtype;
  next_off text[];
  next_from time;
  next_to time;
  stopped_lines uuid[];
begin
  if (phone_group is null) <> (phone_on is null) then
    raise exception 'Say which group, and whether it is on' using errcode = '22023';
  end if;
  if phone_group is not null and not (phone_group = any (private.notification_groups())) then
    raise exception 'Unknown group of notifications: %', phone_group using errcode = '22023';
  end if;
  if tz_name is not null and not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = tz_name
  ) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;

  -- One change at a time for each person, so two quick switches both hold.
  insert into public.notification_preferences (user_id)
  values (me)
  on conflict (user_id) do nothing;
  select p.* into saved
  from public.notification_preferences p
  where p.user_id = me
  for update;

  next_off := saved.push_off;
  if phone_group is not null then
    -- Kept in the screen's order, each group once.
    next_off := array(
      select g.item
      from unnest(private.notification_groups()) with ordinality as g (item, place)
      where (g.item = any (saved.push_off) and g.item <> phone_group)
        or (g.item = phone_group and not phone_on)
      order by g.place
    );
  end if;

  next_from := saved.quiet_from;
  next_to := saved.quiet_to;
  if quiet_on is false then
    next_from := null;
    next_to := null;
  elsif quiet_on or quiet_start is not null or quiet_stop is not null then
    select coalesce(quiet_start, saved.quiet_from, d.starts),
      coalesce(quiet_stop, saved.quiet_to, d.stops)
    into next_from, next_to
    from private.default_quiet_hours() d;
    if next_from = next_to then
      raise exception 'Quiet hours need a length' using errcode = '22023';
    end if;
    if extract(second from next_from) <> 0 or extract(second from next_to) <> 0 then
      raise exception 'Quiet hours are whole minutes' using errcode = '22023';
    end if;
  end if;

  update public.notification_preferences p
  set push_off = next_off,
    quiet_from = next_from,
    quiet_to = next_to,
    time_zone = coalesce(tz_name, saved.time_zone),
    previews = coalesce(lock_previews, saved.previews),
    updated_at = now()
  where p.user_id = me;

  -- What waits for the phone follows the change. A group switched off goes
  -- no more: what waits for it, and what goes again after a failure, whose
  -- line then says how it went.
  update public.notifications n
  set push_state = 'skipped'
  where n.user_id = me
    and n.push_state = 'queued'
    and private.notification_group(n.kind) = any (next_off);

  with stopped as (
    update public.push_deliveries d
    set state = 'skipped'
    from public.notifications n
    where d.notification_id = n.id
      and n.user_id = me
      and d.state = 'queued'
      and private.notification_group(n.kind) = any (next_off)
    returning d.notification_id
  )
  select coalesce(array_agg(distinct s.notification_id), '{}'::uuid[])
  into stopped_lines
  from stopped s;
  perform private.settle_pushes(stopped_lines);

  -- A push due within a minute (a chat's few seconds) keeps its time, and
  -- the send holds it when that is inside quiet hours (claim_due_pushes);
  -- only quiet hours hold one longer, and a schedule.changed push keeps its
  -- two minutes from the publish (its line's created_at, the publish's
  -- moment), so a publish within them still replaces it.

  update public.notifications n
  set push_after = greatest(
    coalesce(private.quiet_until(me, now()), now()),
    (case when n.kind = 'schedule.changed' then n.created_at + interval '2 minutes' end)
  )
  where n.user_id = me
    and n.push_state = 'queued'
    and n.kind <> 'push.test'
    and n.push_after > now() + interval '1 minute';

  return query
  select p.push_off, p.quiet_from, p.quiet_to, p.time_zone, p.previews, p.push_asked_at
  from public.notification_preferences p
  where p.user_id = me;
end;
$$;

------------------------------------------------------------------------------
-- Grants

-- The new helpers: nobody but the database's own.
revoke execute on function private.shifts_ahead(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.nearest_change(jsonb, jsonb, text, timestamptz)
  from public, anon, authenticated;

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the publish granted to the secret key) again all the same.
revoke execute on function private.week_people(uuid)
  from public, anon, authenticated;
revoke execute on function private.notify_for(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notify_for_team(public.audit_log)
  from public, anon, authenticated;
revoke execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  to service_role;
-- The signed-in person's own, as 20261112000100_notification_preferences.sql
-- has it: never the server's, which would have to say whose.
revoke execute on function public.set_notification_preferences(
  text, boolean, boolean, time, time, boolean, text
) from public, anon, service_role;
grant execute on function public.set_notification_preferences(
  text, boolean, boolean, time, time, boolean, text
) to authenticated;
