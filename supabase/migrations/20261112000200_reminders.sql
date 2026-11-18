-- Notifications, part 4 (Orel, 8 and 9 November 2026, issue #1): the
-- reminders. The database writes them itself, once a minute, each at most
-- once, through private.notify like every other line, so each person's
-- choices (part 3: the group switched off, quiet hours) apply to them too.
--
--   availability.due      next week's availability, `availabilityReminderHours`
--                         (24 unless the business chose 3, 12 or 48; 0 is
--                         none) before it is due, while that week isn't
--                         published: to the active workers and managers who
--                         haven't sent it, never owners and never anyone off
--                         the staff (@domain/availability's
--                         missingAvailability). Pushed until the due moment.
--                         Never before 08:00 on the first day of this week
--                         (REMINDER_RULES.earliestAt), when the app begins to
--                         show next week: a due moment early in the week gets
--                         the hours left before it, not a push at midnight as
--                         the week turns. Due by then (the week's first day,
--                         at 08:00 or before), it is in the app alone, from
--                         the week's start. Group: the schedule.
--   availability.missing  at the due moment and up to 6 hours after, while
--                         someone still hasn't sent it and the week isn't
--                         published: to active owners and managers, with how
--                         many, never who (the team's availability screen
--                         shows them that, in their own business). The count
--                         follows who sends it or leaves the staff after.
--                         Pushed until those 6 hours end. Group: approvals.
--                         With the setting at 0, neither of the two comes.
--   clock.open            still clocked in `clockOutReminderMinutes` (60
--                         unless the business chose 30 or 120; 0 is none)
--                         after the end of their published shift that day
--                         (of the last, when the next one begins within those
--                         minutes of the one before: back-to-back shifts are
--                         one stretch), or 12 hours after clocking in with
--                         none: to the person. Pushed until 24 hours after
--                         clocking in. Group: the clock (new).
--   clock.overdue         an entry open longer than 24 hours, which only a
--                         manager can close (`entryOverdue`): to active
--                         owners and managers, the person too when they are
--                         one, whatever the setting. Group: approvals. Not
--                         for an entry open more than 90 days, whose line
--                         the clean-up may have taken (below).
--
--   when                  next week is the one people answer for, as the app
--                         reads it (@domain/availability's nextWeekStart), and
--                         its due moment comes from the scheduling settings
--                         at the time (availabilityDueAt), as the app's
--                         screens show it, not the moment kept on the week's
--                         row when it opened: a manager who moves the deadline
--                         moves it for the week people are answering now.
--                         modules/notifications/reminders.db.test.ts compares
--                         the two across Israel's clock changes.
--   once                  each has its dedupe key (availability:<week start>,
--                         availability.missing:<week start>, clock.open:<entry>,
--                         clock.overdue:<entry>) and never tells again, not
--                         even after a clock-out is undone. Only those without
--                         the line yet go to private.notify (private.
--                         without_line), so a line already written is neither
--                         planned nor locked again every minute. What the
--                         minute job missed while it didn't run comes when it
--                         runs again, while it is still in its time, and never
--                         after: nothing a day late.
--   settled               sending one's availability settles one's own line,
--                         and the managers' once nobody is missing, with the
--                         count kept true until then (a trigger on
--                         availability_submissions); publishing the week
--                         settles both for everyone. Clocking out settles
--                         clock.open, and so does a correction that closes the
--                         entry, or its 24 hours passing (then only a manager
--                         can close it, and clock.overdue says so). A
--                         correction settles clock.overdue. A trigger on the
--                         audit log does it, beside private.notify_for, which
--                         stays as it is. A line written as its action
--                         commits misses its trigger, so the minute job holds
--                         what it writes about: the open entry (for share,
--                         which a clock-out waits for or has finished before)
--                         and the business's week (an advisory lock that
--                         sending and publishing take too). Each minute also
--                         settles, before writing, what was done without its
--                         trigger: next week's lines of whoever sent it or
--                         left the staff, the managers' when nobody is missing
--                         or the week is published, the lines about the four
--                         weeks before it (begun or past: nothing to send for
--                         them now), and clock.open of an entry since closed
--                         (private.settle_done_reminders).
--   settings              the notifications module's, read with the
--                         manifest's defaults and allowed values: a value the
--                         manifest doesn't offer reads as the default, field
--                         by field, as readModuleSettings does
--                         (private.reminder_settings; the vitest db test
--                         checks missing, allowed and not allowed values). The
--                         scheduling settings the due moment needs are read
--                         the same way (private.schedule_rules).
--   demo                  a demo business gets no reminders at all, in the
--                         app or on a phone, as the payroll reminder doesn't
--                         (20261110001000_payroll_months.sql). Its people are
--                         shared accounts, its weeks and entries are what
--                         visitors left behind, and a line made at real time
--                         about them would wait in the bell for every next
--                         visitor. What a visitor does still tells the others
--                         in the app, as part 1 says.
--   privacy               the lines hold ids, times and a count: no name, no
--                         note, no hours total. A manager learns only how many
--                         of their business haven't sent availability.
--   cleaning              once a day, old lines go: read ones after 90 days,
--                         any after 180, besides what part 2 cleans.
--
-- It replaces four functions, each with the same signature and grants
-- (create or replace): private.notification_kind_groups and
-- private.notification_groups (20261112000100_notification_preferences.sql's),
-- with the four kinds and the clock group, which @domain/notifications has
-- too; private.notifications_tick (the same migration's), which runs the
-- reminders first, on the same job; and private.clean_notifications
-- (20261109000500_push.sql's), which also deletes old lines, on the same
-- job. pg_cron, pg_net, Vault and both jobs are part 2's: nothing here adds
-- them again, and supabase/seed.sql already keeps both jobs off locally and
-- in CI.

------------------------------------------------------------------------------
-- 1. Groups

-- 20261112000100_notification_preferences.sql's, with the reminders.
create or replace function private.notification_kind_groups()
returns table (kind_key text, group_key text)
language sql
immutable
set search_path = ''
as $$
  values
    ('schedule.published'::text, 'schedule'::text),
    ('schedule.changed', 'schedule'),
    ('swap.offered', 'swaps'),
    ('swap.taken', 'swaps'),
    ('swap.waiting', 'approvals'),
    ('swap.cancelled', 'swaps'),
    ('swap.approved', 'swaps'),
    ('swap.declined', 'swaps'),
    ('swap.removed', 'swaps'),
    ('clock.confirm', 'approvals'),
    ('team.joined', 'team'),
    ('availability.due', 'schedule'),
    ('availability.missing', 'approvals'),
    ('clock.open', 'clock'),
    ('clock.overdue', 'approvals'),
    ('lists.sent', 'lists'),
    ('lists.finished', 'lists'),
    ('lists.passed', 'lists'),
    ('lists.due', 'lists'),
    ('lists.late', 'lists'),
    ('lists.late_team', 'lists'),
    ('lists.out_of_range', 'lists'),
    ('access.pay_granted', null::text),
    ('pay.wage_set', null::text),
    ('pay.after_close', null::text),
    ('pay.month_due', null::text),
    ('chat.direct', 'chat'),
    ('chat.group', 'chat'),
    ('chat.announcement', 'chat'),
    ('documents.received', 'documents'),
    ('documents.sent', 'documents'),
    ('documents.to_confirm', 'documents'),
    ('push.test', null::text)
$$;

-- The groups in the settings screen's order, with the clock after swaps. Only
-- one more: every choice kept so far stays valid (notification_preferences'
-- check), and nobody has the new one off until they switch it off.
create or replace function private.notification_groups()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'schedule', 'swaps', 'clock', 'approvals', 'team', 'lists', 'chat', 'documents'
  ]::text[]
$$;

------------------------------------------------------------------------------
-- 2. The rules and the settings

-- The reminders' own times, as @domain/notifications' REMINDER_RULES says: how
-- long after the due moment managers hear who is missing, how long after
-- clocking in someone with no shift hears it, how long a reminder to clock
-- out stays good (an entry's longest, after which it is overdue), and the
-- time of day on the first day of a week before which nobody hears of next
-- week's availability.
create function private.reminder_rules()
returns table (
  missing_for interval,
  open_without_shift interval,
  open_for interval,
  earliest time
)
language sql
immutable
set search_path = ''
as $$
  values (interval '6 hours', interval '12 hours', interval '24 hours', time '08:00')
$$;

-- The notifications module's reminder settings from what a business stored:
-- each one only as a number the manifest offers (modules/notifications/
-- manifest.ts), else its default, as readModuleSettings reads them. JSON
-- numbers compare by value, so 24.0 is 24, and "24" (text) is not a number.
create function private.reminder_settings(stored jsonb)
returns table (availability_hours integer, clock_out_minutes integer)
language sql
immutable
set search_path = ''
as $$
  select
    case stored -> 'availabilityReminderHours'
      when '0'::jsonb then 0
      when '3'::jsonb then 3
      when '12'::jsonb then 12
      when '24'::jsonb then 24
      when '48'::jsonb then 48
      else 24
    end,
    case stored -> 'clockOutReminderMinutes'
      when '0'::jsonb then 0
      when '30'::jsonb then 30
      when '60'::jsonb then 60
      when '120'::jsonb then 120
      else 60
    end
$$;

-- A business's reminder settings, the defaults when it stored none.
create function private.business_reminder_settings(business uuid)
returns table (availability_hours integer, clock_out_minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.availability_hours, s.clock_out_minutes
  from private.reminder_settings(coalesce(
    (
      select bm.settings
      from public.business_modules bm
      where bm.business_id = business and bm.module_key = 'notifications'
    ),
    '{}'::jsonb
  )) s
$$;

-- What the due moment needs from the scheduling settings a business stored
-- (modules/scheduling/manifest.ts), each read as readModuleSettings reads it:
-- the week's first day (0 or 1, else Sunday), the due day (a whole 0 to 6,
-- else Wednesday) and the due time ("HH:MM", else 18:00). Stable, not
-- immutable: reading text as a time is.
create function private.schedule_rules(stored jsonb)
returns table (first_day integer, due_day integer, due_time time)
language sql
stable
set search_path = ''
as $$
  select
    case stored -> 'weekStartsOn'
      when '0'::jsonb then 0
      when '1'::jsonb then 1
      else 0
    end,
    case stored -> 'availabilityDueDay'
      when '0'::jsonb then 0
      when '1'::jsonb then 1
      when '2'::jsonb then 2
      when '3'::jsonb then 3
      when '4'::jsonb then 4
      when '5'::jsonb then 5
      when '6'::jsonb then 6
      else 3
    end,
    case
      when jsonb_typeof(stored -> 'availabilityDueTime') = 'string'
        and (stored ->> 'availabilityDueTime') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        then (stored ->> 'availabilityDueTime')::time
      else time '18:00'
    end
$$;

-- A business's week and due rules, on its own clock. No row for a business
-- that isn't there.
create function private.availability_rules(business uuid)
returns table (first_day integer, due_day integer, due_time time, tz_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.first_day, r.due_day, r.due_time, b.timezone
  from public.businesses b
  cross join lateral private.schedule_rules(coalesce(
    (
      select bm.settings
      from public.business_modules bm
      where bm.business_id = b.id and bm.module_key = 'scheduling'
    ),
    '{}'::jsonb
  )) r
  where b.id = business
$$;

-- The week people answer for at `at_time`: the one after this week, on the
-- clock of `tz_name`, weeks starting on `first_day` (@domain/availability's
-- nextWeekStart).
create function private.week_start_after(
  at_time timestamptz,
  tz_name text,
  first_day integer
)
returns date
language sql
stable
set search_path = ''
as $$
  select here.d - ((extract(dow from here.d)::integer - first_day + 7) % 7) + 7
  from (select (at_time at time zone tz_name)::date as d) here
$$;

-- When availability for the week starting on `week_start` is due: the last
-- `due_day` before the week starts (a full week before when it is the week's
-- own first day), at `due_time` on the clock of `tz_name`. A time the clock
-- skips lands just after the change, and one it repeats is the later one, as
-- @domain/availability's availabilityDueAt has them.
create function private.availability_due_moment(
  week_start date,
  due_day integer,
  due_time time,
  tz_name text
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (week_start - back.days + due_time) at time zone tz_name
  from (
    select coalesce(
      nullif((extract(dow from week_start)::integer - due_day + 7) % 7, 0),
      7
    ) as days
  ) back
$$;

-- When availability for a business's week is due, by its settings now.
create function private.availability_due_at(business uuid, week_start date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select private.availability_due_moment(week_start, r.due_day, r.due_time, r.tz_name)
  from private.availability_rules(business) r
$$;

-- Who hasn't sent availability for the business's week starting on
-- `week_start`: its active workers and managers, never owners and never
-- anyone off the staff (missingAvailability).
create function private.availability_missing(business uuid, week_start date)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[])
  from public.memberships m
  where m.business_id = business
    and m.active
    and m.role in ('manager', 'worker')
    and not exists (
      select 1
      from public.availability_submissions s
      join public.schedule_weeks w on w.id = s.week_id
      where w.business_id = business
        and w.starts_on = week_start
        and s.user_id = m.user_id
    )
$$;

-- When the published shifts an open entry belongs to end. The first is the
-- person's shift on the day they clocked in, or the day before for one past
-- midnight, that ends after they clocked in, the first to end when they have
-- two; then each shift of theirs that begins by the time the one before it
-- ends, or within `bridge` after (the reminder's minutes), is part of the
-- same stretch, up to the next day's: morning and evening back to back are
-- one stretch, and the reminder comes after the evening's end, not in the
-- middle of it. The last of the stretch to end; null when they have no
-- shift (or the schedule is off).
create function private.entry_shift_end(entry uuid, bridge interval)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with recursive mine as (
    select times.at_start, times.at_end,
      s.day <= (e.clock_in at time zone b.timezone)::date as on_the_day
    from public.time_entries e
    join public.businesses b on b.id = e.business_id
    join public.shift_assignments a
      on a.business_id = e.business_id and a.user_id = e.user_id
    join public.schedule_shifts s on s.id = a.shift_id
    join public.schedule_weeks w on w.id = s.week_id
    cross join lateral (
      select (s.day + s.starts_at) at time zone b.timezone as at_start,
        (s.day + (case when s.ends_at <= s.starts_at then 1 else 0 end) + s.ends_at)
          at time zone b.timezone as at_end
    ) times
    where e.id = entry
      and w.schedule_published_at is not null
      and private.module_enabled(e.business_id, 'scheduling'::public.module_key)
      and s.day between (e.clock_in at time zone b.timezone)::date - 1
        and (e.clock_in at time zone b.timezone)::date + 1
      and times.at_end > e.clock_in
  ),
  stretch (at_end) as (
    (
      select m.at_end
      from mine m
      where m.on_the_day
      order by m.at_end
      limit 1
    )
    union
    select m.at_end
    from mine m
    join stretch st on m.at_start <= st.at_end + bridge and m.at_end > st.at_end
  )
  select max(st.at_end) from stretch st
$$;

-- Of `people`, those who have no line with this dedupe key in the business
-- yet, whatever became of it: the only ones a reminder is written for, so
-- the minute job never plans a push for, nor locks, a line already written
-- (private.notify's upsert locks the row it meets, even when it changes
-- nothing).
create function private.without_line(business uuid, people uuid[], dedupe text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.person order by p.person), '{}'::uuid[])
  from unnest(coalesce(people, '{}'::uuid[])) as p (person)
  where not exists (
    select 1
    from public.notifications n
    where n.user_id = p.person
      and n.business_id = business
      and n.dedupe_key = dedupe
  )
$$;

-- One at a time with a business's week of availability reminders, until the
-- transaction ends: the minute job while it reads who is missing and writes,
-- and a sending or a publishing while it settles them. Whichever comes second
-- waits, and then sees what the first did: a line, a sending, a publishing.
create function private.lock_availability_week(business uuid, week_start date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'availability:' || business::text || ':' || to_char(week_start, 'YYYY-MM-DD'),
    0::bigint
  ));
end;
$$;

-- A business's lines about one week's availability, brought up to what is
-- true now: all of them settled once the week is published; else each
-- person's own once they sent it or left the staff (no longer missing), and
-- the managers' once nobody is missing, with how many are until then. Only
-- what changes is written.
create function private.settle_availability_week(
  business uuid,
  week_start date,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_key text := to_char(week_start, 'YYYY-MM-DD');
  missing uuid[];
begin
  if not exists (
    select 1
    from public.notifications n
    where n.business_id = business
      and n.dedupe_key in ('availability:' || week_key, 'availability.missing:' || week_key)
      and n.resolved_at is null
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.schedule_weeks w
    where w.business_id = business
      and w.starts_on = week_start
      and w.schedule_published_at is not null
  ) then
    perform private.resolve_notifications(business, 'availability:' || week_key, at_time);
    perform private.resolve_notifications(
      business, 'availability.missing:' || week_key, at_time
    );
    return;
  end if;

  missing := private.availability_missing(business, week_start);
  perform private.resolve_notifications(
    business, 'availability:' || week_key, at_time, still_for => missing
  );
  if cardinality(missing) = 0 then
    perform private.resolve_notifications(
      business, 'availability.missing:' || week_key, at_time
    );
  else
    update public.notifications n
    set params = jsonb_set(n.params, '{missing}'::text[], to_jsonb(cardinality(missing)))
    where n.business_id = business
      and n.dedupe_key = 'availability.missing:' || week_key
      and n.resolved_at is null
      and n.params -> 'missing' is distinct from to_jsonb(cardinality(missing));
  end if;
end;
$$;

-- What the reminders asked for that was done without its trigger settling
-- it, at the start of each business's minute, `week_start` being next week:
-- that week's lines (private.settle_availability_week); the lines about the
-- four weeks before it, begun or past, with nothing to send for them now
-- (the app reads next week only, so their links would open the wrong one),
-- whether or not they were published; and the reminder to clock out of an
-- entry closed since, whose clock-out came as the line was written. Each is
-- a look-up by dedupe key, writing only what is still open.
create function private.settle_done_reminders(
  business uuid,
  week_start date,
  at_time timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  past_week date;
  closed_entry uuid;
begin
  perform private.settle_availability_week(business, week_start, at_time);

  for past_week in
    select week_start - 7 * g.weeks_back
    from generate_series(1, 4) as g (weeks_back)
  loop
    perform private.resolve_notifications(
      business, 'availability:' || to_char(past_week, 'YYYY-MM-DD'), at_time
    );
    perform private.resolve_notifications(
      business, 'availability.missing:' || to_char(past_week, 'YYYY-MM-DD'), at_time
    );
  end loop;

  for closed_entry in
    select e.id
    from public.time_entries e
    where e.business_id = business
      and e.clock_in > at_time - (select r.open_for from private.reminder_rules() r)
        - interval '1 hour'
      and e.clock_in <= at_time
      and e.clock_out is not null
      and exists (
        select 1
        from public.notifications n
        where n.business_id = business
          and n.dedupe_key = 'clock.open:' || e.id::text
          and n.resolved_at is null
      )
  loop
    perform private.resolve_notifications(
      business, 'clock.open:' || closed_entry::text, at_time
    );
  end loop;
end;
$$;

------------------------------------------------------------------------------
-- 3. The reminders

-- Every reminder of one business that is due at `at_time`, each at most once,
-- after settling what was done meanwhile without its trigger. Returns how
-- many lines it wrote.
create function private.run_business_reminders(business uuid, at_time timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules record;
  chosen record;
  week_rules record;
  next_start date;
  week_key text;
  due timestamptz;
  remind_from timestamptz;
  in_app_only boolean;
  missing uuid[];
  fresh uuid[];
  open_entry record;
  late_entry record;
  open_due timestamptz;
  written integer := 0;
begin
  select r.missing_for, r.open_without_shift, r.open_for, r.earliest into rules
  from private.reminder_rules() r;
  select s.availability_hours, s.clock_out_minutes into chosen
  from private.business_reminder_settings(business) s;
  select a.first_day, a.tz_name into week_rules
  from private.availability_rules(business) a;
  if not found then
    return 0;
  end if;
  next_start := private.week_start_after(at_time, week_rules.tz_name, week_rules.first_day);
  week_key := to_char(next_start, 'YYYY-MM-DD');

  perform private.settle_done_reminders(business, next_start, at_time);

  -- 1. Next week's availability, while that week isn't published. The
  --    reminder before it is due comes no earlier than `rules.earliest` on
  --    the first day of this week, when the app begins to show next week;
  --    when that is as late as the due moment, it is in the app alone, from
  --    the week's start (at_time is in this week: next_start is from it).
  if chosen.availability_hours > 0
    and private.module_enabled(business, 'scheduling'::public.module_key)
  then
    due := private.availability_due_at(business, next_start);
    remind_from := greatest(
      due - make_interval(hours => chosen.availability_hours),
      ((next_start - 7) + rules.earliest) at time zone week_rules.tz_name
    );
    in_app_only := remind_from >= due;

    if due is not null
      and at_time < due + rules.missing_for
      and (at_time >= remind_from or in_app_only)
    then
      -- Held until the minute ends, before looking: a sending or publishing
      -- under way finishes first, and one that comes after waits and then
      -- settles what this writes.
      perform private.lock_availability_week(business, next_start);

      if not exists (
        select 1
        from public.schedule_weeks w
        where w.business_id = business
          and w.starts_on = next_start
          and w.schedule_published_at is not null
      ) then
        missing := private.availability_missing(business, next_start);

        if at_time < due then
          fresh := private.without_line(business, missing, 'availability:' || week_key);
          if cardinality(fresh) > 0 then
            written := written + private.notify(
              business, fresh, 'availability.due'::text,
              jsonb_build_object('startsOn', next_start, 'dueAt', due),
              null::uuid, 'scheduling'::public.module_key, 'worker'::public.member_role,
              'availability:' || week_key,
              realert => false,
              push_until => due,
              at_time => at_time
            );
            if in_app_only then
              update public.notifications n
              set push_state = 'none', push_after = null
              where n.business_id = business
                and n.dedupe_key = 'availability:' || week_key
                and n.user_id = any (fresh)
                and n.push_state = 'queued';
            end if;
          end if;
        elsif cardinality(missing) > 0 then
          fresh := private.without_line(
            business,
            private.members_in(business, '{owner,manager}'::public.member_role[]),
            'availability.missing:' || week_key
          );
          if cardinality(fresh) > 0 then
            written := written + private.notify(
              business, fresh, 'availability.missing'::text,
              jsonb_build_object(
                'startsOn', next_start, 'dueAt', due, 'missing', cardinality(missing)
              ),
              null::uuid, 'scheduling'::public.module_key, 'manager'::public.member_role,
              'availability.missing:' || week_key,
              realert => false,
              push_until => due + rules.missing_for,
              at_time => at_time
            );
          end if;
        end if;
      end if;
    end if;
  end if;

  if not private.module_enabled(business, 'time_clock'::public.module_key) then
    return written;
  end if;

  -- 2. Still clocked in after the shift, while the person can still clock
  --    out themselves.
  if chosen.clock_out_minutes > 0 then
    for open_entry in
      select e.id, e.user_id, e.clock_in,
        private.entry_shift_end(
          e.id, make_interval(mins => chosen.clock_out_minutes)
        ) as shift_end
      from public.time_entries e
      where e.business_id = business
        and e.clock_out is null
        and e.clock_in <= at_time
        and e.clock_in > at_time - rules.open_for
      order by e.clock_in, e.id
    loop
      open_due := coalesce(
        open_entry.shift_end + make_interval(mins => chosen.clock_out_minutes),
        open_entry.clock_in + rules.open_without_shift
      );
      if at_time >= open_due
        and cardinality(private.without_line(
          business, array[open_entry.user_id], 'clock.open:' || open_entry.id::text
        )) > 0
      then
        -- Held until the minute ends: a clock-out under way finishes first,
        -- and then there is nothing to remind of; one that comes after waits,
        -- and then settles the line.
        perform 1
        from public.time_entries t
        where t.id = open_entry.id and t.clock_out is null
        for share;
        if found then
          written := written + private.notify(
            business, array[open_entry.user_id], 'clock.open'::text,
            jsonb_build_object(
              'entry', open_entry.id,
              'since', open_entry.clock_in,
              'shiftEnd', open_entry.shift_end
            ),
            null::uuid, 'time_clock'::public.module_key, 'worker'::public.member_role,
            'clock.open:' || open_entry.id::text,
            realert => false,
            push_until => open_entry.clock_in + rules.open_for,
            at_time => at_time
          );
        end if;
      end if;
    end loop;
  end if;

  -- 3. Open longer than an entry can be: only a manager closes it now, so
  --    the person's own reminder is done with. Never for one left open more
  --    than 90 days: its line, once read, is cleaned after 90 days
  --    (private.clean_notifications) and would otherwise come back as new.
  for late_entry in
    select e.id, e.user_id, e.clock_in
    from public.time_entries e
    where e.business_id = business
      and e.clock_out is null
      and e.clock_in < at_time - rules.open_for
      and e.clock_in >= at_time - interval '90 days'
    order by e.clock_in, e.id
  loop
    fresh := private.without_line(
      business,
      private.members_in(business, '{owner,manager}'::public.member_role[]),
      'clock.overdue:' || late_entry.id::text
    );
    if cardinality(fresh) > 0 then
      written := written + private.notify(
        business, fresh, 'clock.overdue'::text,
        jsonb_build_object(
          'entry', late_entry.id, 'person', late_entry.user_id, 'since', late_entry.clock_in
        ),
        null::uuid, 'time_clock'::public.module_key, 'manager'::public.member_role,
        'clock.overdue:' || late_entry.id::text,
        realert => false,
        at_time => at_time
      );
    end if;
    perform private.resolve_notifications(
      business, 'clock.open:' || late_entry.id::text, at_time
    );
  end loop;

  return written;
end;
$$;

-- Every reminder due at `at_time` (the minute job's now, or the time a test
-- chooses), in every business with notifications on that isn't a demo, or
-- only in `for_business` (the tests'), each business in its own block, so one
-- that fails leaves the others' reminders coming. Returns how many lines it
-- wrote.
create function private.run_reminders(
  at_time timestamptz default now(),
  for_business uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  each_business uuid;
  written integer := 0;
begin
  for each_business in
    select b.id
    from public.businesses b
    where (for_business is null or b.id = for_business)
      and private.module_enabled(b.id, 'notifications'::public.module_key)
      and not exists (
        select 1 from private.demo_businesses d where d.business_id = b.id
      )
    order by b.id
  loop
    begin
      written := written + private.run_business_reminders(each_business, at_time);
    exception when others then
      raise warning 'Reminders did not run for business %: %', each_business, sqlerrm;
    end;
  end loop;
  return written;
end;
$$;

------------------------------------------------------------------------------
-- 4. What settles them

-- Sending one's availability settles one's own reminder, and the managers'
-- once nobody is missing, with how many are until then
-- (private.settle_availability_week), after the minute job is done writing
-- that week's. What was sent stands, whatever this does.
create function private.resolve_availability_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_first date;
begin
  begin
    select w.starts_on into week_first
    from public.schedule_weeks w
    where w.id = new.week_id;
    if week_first is not null then
      perform private.lock_availability_week(new.business_id, week_first);
      perform private.settle_availability_week(new.business_id, week_first, now());
    end if;
  exception when others then
    raise warning 'availability reminders for % were not settled: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger availability_submissions_resolve
  after insert on public.availability_submissions
  for each row
  execute function private.resolve_availability_reminder();

-- What the audit log says settles a reminder:
--   clock.out         the reminder to clock out;
--   clock.correct     the overdue entry's line, and the reminder to clock out
--                     once the entry is closed (a correction may leave it
--                     open, still to clock out of);
--   schedule.publish  the week's availability reminders, for everyone.
create function private.resolve_reminders_for(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := entry.details;
begin
  case entry.action
  when 'clock.out' then
    perform private.resolve_notifications(entry.business_id, 'clock.open:' || (d ->> 'entry'));
  when 'clock.correct' then
    perform private.resolve_notifications(
      entry.business_id, 'clock.overdue:' || (d ->> 'entry')
    );
    if exists (
      select 1 from public.time_entries t
      where t.id = (d ->> 'entry')::uuid and t.clock_out is not null
    ) then
      perform private.resolve_notifications(
        entry.business_id, 'clock.open:' || (d ->> 'entry')
      );
    end if;
  when 'schedule.publish' then
    -- After the minute job is done writing that week's, if it is.
    perform private.lock_availability_week(entry.business_id, (d ->> 'starts_on')::date);
    perform private.resolve_notifications(
      entry.business_id, 'availability:' || (d ->> 'starts_on')
    );
    perform private.resolve_notifications(
      entry.business_id, 'availability.missing:' || (d ->> 'starts_on')
    );
  else
    null;
  end case;
end;
$$;

-- The trigger: what happened stands, whatever settling its reminders does.
create function private.resolve_reminders_from_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.resolve_reminders_for(new);
  exception when others then
    raise warning 'reminders for % (%) were not settled: %', new.action, new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger audit_log_resolves_reminders
  after insert on public.audit_log
  for each row
  when (new.action in ('clock.out', 'clock.correct', 'schedule.publish'))
  execute function private.resolve_reminders_from_log();

------------------------------------------------------------------------------
-- 5. Once a minute, and once a day

-- 20261112000100_notification_preferences.sql's, with the reminders first, so
-- what they queue for a phone goes this same minute. A failure there never
-- stops the sending. The rest is as it was: the app is asked to send only
-- when something is due, and only with both Vault secrets.
create or replace function private.notifications_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_key text;
begin
  begin
    perform private.run_reminders(now());
  exception when others then
    raise warning 'Reminders did not run: %', sqlerrm;
  end;

  if not exists (
      select 1 from public.notifications n
      where n.push_state = 'queued' and n.push_after <= now()
    )
    and not exists (
      select 1
      from public.push_deliveries d
      join public.notifications n on n.id = d.notification_id
      where d.state = 'queued'
        and d.next_at <= now()
        and not private.push_held(n.user_id, n.kind, now())
    )
    and not exists (
      select 1 from public.push_deliveries d
      where d.state = 'sending' and d.claimed_at < now() - interval '5 minutes'
    )
  then
    return;
  end if;

  select v.decrypted_secret into app_url
  from vault.decrypted_secrets v where v.name = 'app_url';
  select v.decrypted_secret into cron_key
  from vault.decrypted_secrets v where v.name = 'cron_secret';
  if app_url is null or cron_key is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(app_url, '/') || '/cron/notifications',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- 20261109000500_push.sql's, with old lines going first: read ones after 90
-- days, any after 180, their deliveries with them. The rest is as it was: a
-- push that waited a day goes no more, deliveries done a week ago go, a
-- device unseen for 60 days goes when it fails or took no push in that time,
-- and the minute job's history keeps a week.
create or replace function private.clean_notifications(at_time timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
  where n.created_at < at_time - interval '180 days'
    or (n.read_at is not null and n.created_at < at_time - interval '90 days');

  delete from public.push_deliveries d
  where d.state in ('sent', 'skipped', 'failed')
    and d.created_at < at_time - interval '7 days';

  update public.notifications n
  set push_state = 'skipped'
  where n.push_state = 'queued' and n.push_after < at_time - interval '1 day';

  perform private.forget_devices(array(
    select s.id
    from public.push_subscriptions s
    where s.last_seen_at < at_time - interval '60 days'
      and (
        s.failures > 0
        or coalesce(s.last_success_at, s.created_at) < at_time - interval '60 days'
      )
  ));

  delete from cron.job_run_details r
  where r.start_time < at_time - interval '7 days';
end;
$$;

------------------------------------------------------------------------------
-- Who may call what: nobody but the database's own. The four replaced in
-- place keep their grants; revoked again all the same, as before.

revoke execute on function private.notification_kind_groups()
  from public, anon, authenticated;
revoke execute on function private.notification_groups()
  from public, anon, authenticated;
revoke execute on function private.notifications_tick()
  from public, anon, authenticated;
revoke execute on function private.clean_notifications(timestamptz)
  from public, anon, authenticated;

revoke execute on function private.reminder_rules()
  from public, anon, authenticated;
revoke execute on function private.reminder_settings(jsonb)
  from public, anon, authenticated;
revoke execute on function private.business_reminder_settings(uuid)
  from public, anon, authenticated;
revoke execute on function private.schedule_rules(jsonb)
  from public, anon, authenticated;
revoke execute on function private.availability_rules(uuid)
  from public, anon, authenticated;
revoke execute on function private.week_start_after(timestamptz, text, integer)
  from public, anon, authenticated;
revoke execute on function private.availability_due_moment(date, integer, time, text)
  from public, anon, authenticated;
revoke execute on function private.availability_due_at(uuid, date)
  from public, anon, authenticated;
revoke execute on function private.availability_missing(uuid, date)
  from public, anon, authenticated;
revoke execute on function private.entry_shift_end(uuid, interval)
  from public, anon, authenticated;
revoke execute on function private.without_line(uuid, uuid[], text)
  from public, anon, authenticated;
revoke execute on function private.lock_availability_week(uuid, date)
  from public, anon, authenticated;
revoke execute on function private.settle_availability_week(uuid, date, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.settle_done_reminders(uuid, date, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.run_business_reminders(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.run_reminders(timestamptz, uuid)
  from public, anon, authenticated;
revoke execute on function private.resolve_availability_reminder()
  from public, anon, authenticated;
revoke execute on function private.resolve_reminders_for(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.resolve_reminders_from_log()
  from public, anon, authenticated;
