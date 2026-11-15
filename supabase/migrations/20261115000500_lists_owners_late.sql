-- Lists: one more step for a list still late, to the owners (Orel, 15
-- November 2026, issue #1). Until now a list's times reminded its people
-- before it was due, and once late told them (`lists.late`) and, while
-- tellManagersWhenLate is on, the list managers (`lists.late_team`); a
-- scheduled list nobody did closes as missed. Now a list that stays open goes
-- one step further.
--
--   the setting tellOwnersAfterMinutes, the lists module's (modules/lists/
--               manifest.ts): how long after a list became late the owners
--               hear it is still open, 30, 60 or 120 minutes, or 0 for never;
--               60 unless the business chose otherwise. A setting of the
--               business, which /manage/lists and the console draw from the
--               manifest. private.list_settings holds its default with the
--               others; the tick reads only a value the manifest offers, and
--               anything else stored as 60, as readModuleSettings does
--               (private.reminder_settings reads the notifications' the same
--               way).
--   the step    private.lists_tick_business, fifth and last, after the late
--               lists and like them not during a business's Shabbat: once
--               (lists.owners_told_at), a scheduled list still open that many
--               minutes after it became late (lists.late_at, the minute its
--               late line was written, so never before it), logged as
--               `lists.late_owner` with no actor. Counted in whole minutes
--               from the minute of late_at: the job's at_time is now(), a
--               little past its minute, by a little more or less each run.
--               A list that the next one or its 24 hours closed as missed in
--               the same minute is not told, since the missed lists close
--               first. A list sent once is not a list's times', so it never
--               comes here (Orel's words: recurring lists), and neither does
--               one opened again by hand (reopen_list) after it became late:
--               a correction, which the missed lists leave alone too. One
--               opened again before it was late (an undo within its 5
--               minutes, say) still becomes late, and is told like any other.
--   the line    private.notify_for_lists: `lists.late_owner` to the active
--               owners of the business, but whoever holds the list (an owner
--               in the department it went to is already told, as its own
--               people are), one line each (`list.late_owner:<id>`), for owners
--               alone (audience 'owner': an owner made a manager no longer
--               reads it, as set_member_role marks it read). Its facts are the
--               late line's: ids, the list's name and its due time. An owner
--               told this way had the list managers' late line too
--               (`lists.late_team`, while tellManagersWhenLate is on), which
--               this one takes over: that line is marked read, not settled
--               (the list is still late), so Home counts the list once. A
--               demo's lists tell its people in the app like any business's
--               (and private.push_plan keeps every demo line off the phone),
--               so its owners get this one there too. Finishing the list,
--               cancelling it, or its closing as missed settles it, with the
--               list's other lines. Group: lists; it asks the owner to look,
--               so Home counts it (@domain/notifications).
--
-- It replaces, from their latest versions and with only these changes:
-- private.list_settings (20261110001500_list_photos.sql's), with the new
-- default; private.lists_tick_business (20261110001300_list_schedules.sql's),
-- with the setting and the fifth step; private.notify_for_lists
-- (20261110001400_lists_pass.sql's), with the new row and its settling; and
-- private.notification_kind_groups (20261114000100_team_changes.sql's), with
-- the new kind. Each keeps its signature, so its grants stay; revoked again
-- all the same.

------------------------------------------------------------------------------
-- 1. When the owners were told

alter table public.lists add column owners_told_at timestamptz;

comment on column public.lists.owners_told_at is
  'When the owners were told the list was still late (private.lists_tick_business, tellOwnersAfterMinutes after late_at), never cleared. Null while they were not.';

------------------------------------------------------------------------------
-- 2. The setting's default

-- private.list_settings of 20261110001500_list_photos.sql, with
-- tellOwnersAfterMinutes (modules/lists/manifest.ts; modules/lists/
-- settings.db.test.ts keeps the two the same).
create or replace function private.list_settings(business uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'remindBeforeMinutes', 30,
      'lateAfterMinutes', 15,
      'tellManagersWhenLate', true,
      'tellOwnersAfterMinutes', 60,
      'tellWhenFinished', true,
      'photoDays', 90
    )
    || coalesce(
      (
        select bm.settings
        from public.business_modules bm
        where bm.business_id = business and bm.module_key = 'lists'
      ),
      '{}'::jsonb
    )
$$;

------------------------------------------------------------------------------
-- 3. The tick

-- private.lists_tick_business of 20261110001300_list_schedules.sql, the same,
-- with tellOwnersAfterMinutes read as the manifest offers it and the fifth
-- step at its end: a scheduled list still open that long after it became late
-- is logged once as `lists.late_owner`, which tells the owners. One
-- business's minute, at `at_time`: opens the lists its times have opened by
-- then and that are not more than 12 hours past their due time, closes as
-- missed what nobody did, and marks reminders, late lists and those still
-- late, each once. A business closed on Shabbat gets none of it during
-- Shabbat (missed lists tell nobody, and still close). Logged with no actor;
-- the lines hang on the log. Returns how many lists it opened.
create or replace function private.lists_tick_business(business uuid, at_time timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  lists_settings jsonb;
  remind_before integer;
  late_after integer;
  owners_after integer;
  in_shabbat boolean;
  due_one record;
  gone record;
  soon record;
  late_one record;
  still_late record;
  lid uuid;
  people uuid[];
  to_kind text;
  to_department uuid;
  to_role public.member_role;
  to_shift uuid;
  locked boolean := false;
  opened integer := 0;
begin
  select b.timezone into tz from public.businesses b where b.id = business;
  if not found then
    return 0;
  end if;
  lists_settings := private.list_settings(business);
  remind_before := coalesce((lists_settings ->> 'remindBeforeMinutes')::integer, 30);
  late_after := coalesce((lists_settings ->> 'lateAfterMinutes')::integer, 15);
  -- Only a value the manifest offers; anything else stored reads as 60.
  owners_after := case lists_settings -> 'tellOwnersAfterMinutes'
    when '0'::jsonb then 0
    when '30'::jsonb then 30
    when '60'::jsonb then 60
    when '120'::jsonb then 120
    else 60
  end;
  in_shabbat := private.closes_on_shabbat(business)
    and coalesce(
      private.shabbat_span(business, (at_time at time zone tz)::date) @> at_time,
      false
    );

  -- 1. What has opened by now, once each (the unique key of a schedule's day).
  if not in_shabbat then
    for due_one in
      select ls.id as schedule, ls.template_id as template, t.name as template_name,
        t.note as template_note, t.from_department as asking, t.asks_quantities as asks,
        ls.anchor as anchor_kind, ls.shift_key as pattern, ls.recipient_kind as for_kind,
        ls.recipient_user as for_user, ls.recipient_department as for_department,
        ls.recipient_shift as for_shift, ls.recipient_role as for_role,
        o.occurs_on as on_day, o.opens_at as opens, o.due_at as due,
        o.shift_id as anchor_shift
      from public.list_schedules ls
      join public.list_templates t
        on t.id = ls.template_id and t.business_id = ls.business_id and t.archived_at is null
      cross join lateral private.list_occurrences(
        ls.id, at_time - interval '36 hours', at_time
      ) as o
      where ls.business_id = business
        and ls.active
        and o.due_at > at_time - interval '12 hours'
        and not exists (
          select 1 from public.lists l
          where l.schedule_id = ls.id and l.occurs_on = o.occurs_on
        )
      order by o.opens_at, ls.id
    loop
      if not locked then
        -- Under the business's lock, as send_list counts, so the cap holds.
        perform 1 from public.businesses b where b.id = business for no key update;
        locked := true;
      end if;
      if (
        select count(*) from public.lists l
        where l.business_id = business and l.status = 'open'
      ) >= 500 then
        raise warning 'Business % keeps 500 open lists: its times wait', business;
        exit;
      end if;

      to_kind := due_one.for_kind;
      to_department := null;
      to_role := null;
      to_shift := null;
      people := '{}'::uuid[];
      case due_one.for_kind
      when 'person' then
        people := array(
          select m.user_id
          from public.memberships m
          where m.business_id = business
            and m.user_id = due_one.for_user
            and m.active
            and private.is_staff_role(m.role)
        );
      when 'department' then
        if exists (
          select 1 from public.departments d
          where d.id = due_one.for_department
            and d.business_id = business
            and d.archived_at is null
        ) then
          to_department := due_one.for_department;
        end if;
      when 'shift' then
        -- The shift it follows, or that day's published shift of the pattern.
        if due_one.anchor_kind <> 'day' and due_one.for_shift = due_one.pattern then
          to_shift := due_one.anchor_shift;
        else
          select ss.id into to_shift
          from public.schedule_shifts ss
          where ss.business_id = business
            and ss.pattern_key = due_one.for_shift
            and ss.day = due_one.on_day
            and private.shift_published(ss.id)
          order by ss.starts_at, ss.id
          limit 1;
        end if;
        people := array(
          select a.user_id
          from public.shift_assignments a
          join public.memberships m
            on m.business_id = business and m.user_id = a.user_id and m.active
            and private.is_staff_role(m.role)
          where a.shift_id = to_shift
          order by a.user_id
        );
      else
        to_role := due_one.for_role;
      end case;

      -- Nobody there to take it: the managers, so it is never lost.
      if (to_kind in ('person', 'shift') and cardinality(people) = 0)
        or (to_kind = 'department' and to_department is null)
        or (to_kind = 'role' and to_role is null) then
        to_kind := 'role';
        to_role := 'manager'::public.member_role;
        people := '{}'::uuid[];
      end if;

      lid := null;
      insert into public.lists (
        business_id, template_id, schedule_id, occurs_on, name, note, origin,
        recipient_kind, recipient_department, recipient_role, shift_id, shift,
        from_department, asks_quantities, opens_at, due_at
      )
      values (
        business, due_one.template, due_one.schedule, due_one.on_day,
        due_one.template_name, due_one.template_note, 'scheduled', to_kind,
        to_department, to_role, to_shift,
        case when to_shift is not null then private.shift_brief(to_shift) end,
        due_one.asking, due_one.asks, due_one.opens, due_one.due
      )
      on conflict (schedule_id, occurs_on) do nothing
      returning id into lid;
      if lid is null then
        continue;
      end if;

      insert into public.list_items (
        list_id, business_id, template_item_id, position, kind, label, hint, required,
        unit, min_value, max_value, requested
      )
      select lid, business, i.id, i.position, i.kind, i.label, i.hint, i.required,
        i.unit, i.min_value, i.max_value,
        case when due_one.asks and i.kind = 'check' then i.default_quantity end
      from public.list_template_items i
      where i.template_id = due_one.template
      order by i.position;

      insert into public.list_people (list_id, business_id, user_id)
      select lid, business, p.person from unnest(people) as p (person);

      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        business, null::uuid, 'lists.open',
        jsonb_build_object(
          'list', lid,
          'schedule', due_one.schedule,
          'template', due_one.template,
          'name', due_one.template_name,
          'occurs_on', due_one.on_day
        )
      );
      opened := opened + 1;
    end loop;
  end if;

  -- 2. Missed: a scheduled list whose next one has opened, or still open 24
  --    hours after its due time. A daily list missed for a week leaves one
  --    open list, not seven. One opened again by hand (reopen_list) is a
  --    correction, which waits for whoever finishes or cancels it.
  for gone in
    update public.lists l
    set status = 'missed', closed_at = at_time
    where l.id in (
      select x.id
      from public.lists x
      where x.business_id = business
        and x.status = 'open'
        and x.origin = 'scheduled'
        and x.reopened_at is null
        and (
          x.due_at + interval '24 hours' <= at_time
          or exists (
            select 1 from public.lists newer
            where newer.business_id = business
              and newer.schedule_id = x.schedule_id
              and newer.occurs_on > x.occurs_on
              and newer.opens_at <= at_time
          )
        )
      for update skip locked
    )
    returning l.id, l.name
  loop
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, null::uuid, 'lists.missed',
      jsonb_build_object('list', gone.id, 'name', gone.name)
    );
  end loop;

  if in_shabbat then
    return opened;
  end if;

  -- 3. Due soon: once, `remindBeforeMinutes` before the due time, unless the
  --    list opened inside that window (its "sent" line says as much).
  if remind_before > 0 then
    for soon in
      update public.lists l
      set reminded_at = at_time
      where l.id in (
        select x.id
        from public.lists x
        where x.business_id = business
          and x.status = 'open'
          and x.due_at is not null
          and x.reminded_at is null
          and x.due_at - make_interval(mins => remind_before) <= at_time
          and at_time < x.due_at
          and x.opens_at < x.due_at - make_interval(mins => remind_before)
        for update skip locked
      )
      returning l.id, l.name, l.due_at
    loop
      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        business, null::uuid, 'lists.due',
        jsonb_build_object('list', soon.id, 'name', soon.name, 'due_at', soon.due_at)
      );
    end loop;
  end if;

  -- 4. Late: once, `lateAfterMinutes` after the due time.
  for late_one in
    update public.lists l
    set late_at = at_time
    where l.id in (
      select x.id
      from public.lists x
      where x.business_id = business
        and x.status = 'open'
        and x.due_at is not null
        and x.late_at is null
        and x.due_at + make_interval(mins => late_after) <= at_time
      for update skip locked
    )
    returning l.id, l.name, l.due_at
  loop
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, null::uuid, 'lists.late',
      jsonb_build_object('list', late_one.id, 'name', late_one.name, 'due_at', late_one.due_at)
    );
  end loop;

  -- 5. Still late, to the owners: once, `tellOwnersAfterMinutes` after it
  --    became late (from the minute of late_at, since each run's now() is a
  --    different fraction past its minute; so never in the minute of its late
  --    line), for a scheduled list nobody opened again by hand once it was
  --    late. None while the setting is 0.
  if owners_after > 0 then
    for still_late in
      update public.lists l
      set owners_told_at = at_time
      where l.id in (
        select x.id
        from public.lists x
        where x.business_id = business
          and x.status = 'open'
          and x.origin = 'scheduled'
          and x.late_at is not null
          and (x.reopened_at is null or x.reopened_at < x.late_at)
          and x.owners_told_at is null
          and date_trunc('minute', x.late_at) + make_interval(mins => owners_after) <= at_time
        for update skip locked
      )
      returning l.id, l.name, l.due_at, l.late_at
    loop
      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        business, null::uuid, 'lists.late_owner',
        jsonb_build_object(
          'list', still_late.id,
          'name', still_late.name,
          'due_at', still_late.due_at,
          'late_at', still_late.late_at
        )
      );
    end loop;
  end if;

  return opened;
end;
$$;

------------------------------------------------------------------------------
-- 4. The owners' line

-- private.notify_for_lists of 20261110001400_lists_pass.sql, with one more
-- row, and its line settled with the others:
--
--   lists.send,       `lists.sent` to the people the list is for now, the
--   lists.open        actor left out (`list:<id>`).
--   lists.pass        `lists.passed` to the people of the department it went
--                     to, the actor left out (`list:<id>`, so a line someone
--                     had about it reads again, unread), with the
--                     department's name and whether a note came with it; the
--                     list's lines are settled for everyone who no longer
--                     holds it (`list:`, `list.due:`, `list.late:`).
--   lists.due         `lists.due` to them, once, pushed only until it is due
--                     (`list.due:<id>`).
--   lists.late        `lists.late` to them, once (`list.late:<id>`), and while
--                     tellManagersWhenLate is on `lists.late_team` to the list
--                     managers who don't hold it (`list.late_team:<id>`).
--   lists.late_owner  `lists.late_owner` to the business's active owners who
--                     don't hold it, once (`list.late_owner:<id>`), for owners
--                     alone (audience 'owner'); their `lists.late_team` line
--                     of the list is marked read, not settled.
--   lists.out_of_range  `lists.out_of_range` to the list managers, the reader
--                     left out (`list.range:<item>`), with the item's label,
--                     the reading, its range and its unit.
--   lists.finish      settles the list's lines, and, while tellWhenFinished is
--                     on, `lists.finished` to whoever sent it and the
--                     department that asked, the finisher left out.
--   lists.cancel,     settle the list's lines.
--   lists.missed
--   lists.reopen      `lists.sent` again, unread, to the people it is for, and
--                     settles the finished line.
--
-- The facts are ids, the list's name, a department's name, an item's label
-- and a reading with its range, all of which the reader may see in the app;
-- never a note. `fromDepartment`, not `from`, which the inbox reads as a
-- person.
create or replace function private.notify_for_lists(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b uuid := entry.business_id;
  l public.lists%rowtype;
  facts jsonb;
  holders uuid[];
begin
  select x.* into l
  from public.lists x
  where x.id = (entry.details ->> 'list')::uuid and x.business_id = b;
  if not found then
    return;
  end if;
  facts := jsonb_build_object(
    'list', l.id,
    'name', l.name,
    'due', l.due_at,
    'department', l.recipient_department,
    'fromDepartment', l.from_department
  );

  case entry.action
  when 'lists.send', 'lists.open', 'lists.reopen' then
    perform private.notify(
      b, private.list_holders(l.id), 'lists.sent', facts,
      entry.actor_id, 'lists', 'worker', 'list:' || l.id
    );
    if entry.action = 'lists.reopen' then
      perform private.resolve_notifications(b, 'list.finished:' || l.id);
    end if;

  when 'lists.pass' then
    holders := private.list_holders(l.id);
    perform private.notify(
      b, holders, 'lists.passed',
      facts || jsonb_build_object(
        'departmentName', (
          select d.name from public.departments d
          where d.id = l.recipient_department and d.business_id = b
        ),
        'hasNote', coalesce((entry.details ->> 'has_note')::boolean, false)
      ),
      entry.actor_id, 'lists', 'worker', 'list:' || l.id
    );
    -- Nothing waits on whoever had it before; the new holders' lines stay.
    perform private.resolve_notifications(b, 'list:' || l.id, still_for => holders);
    perform private.resolve_notifications(b, 'list.due:' || l.id, still_for => holders);
    perform private.resolve_notifications(b, 'list.late:' || l.id, still_for => holders);

  when 'lists.due' then
    perform private.notify(
      b, private.list_holders(l.id), 'lists.due', facts,
      entry.actor_id, 'lists', 'worker', 'list.due:' || l.id,
      realert => false, push_until => l.due_at
    );

  when 'lists.late' then
    perform private.notify(
      b, private.list_holders(l.id), 'lists.late', facts,
      entry.actor_id, 'lists', 'worker', 'list.late:' || l.id,
      realert => false
    );
    if coalesce(private.list_setting(b, 'tellManagersWhenLate')::boolean, true) then
      perform private.notify(
        b, private.list_managers(b), 'lists.late_team', facts,
        entry.actor_id, 'lists', 'worker', 'list.late_team:' || l.id,
        realert => false, leave_out => private.list_holders(l.id)
      );
    end if;

  when 'lists.late_owner' then
    perform private.notify(
      b,
      array(
        select m.user_id
        from public.memberships m
        where m.business_id = b
          and m.active
          and m.role = 'owner'::public.member_role
        order by m.user_id
      ),
      'lists.late_owner', facts,
      entry.actor_id, 'lists'::public.module_key, 'owner'::public.member_role,
      'list.late_owner:' || l.id,
      realert => false, leave_out => private.list_holders(l.id)
    );
    -- It takes over from the managers' late line of each owner it reached:
    -- read, and off the phone if not sent yet, so Home counts the list once;
    -- not settled, since the list is still late.
    update public.notifications n
    set read_at = coalesce(n.read_at, now()),
      push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
    where n.business_id = b
      and n.dedupe_key = 'list.late_team:' || l.id
      and n.resolved_at is null
      and (n.read_at is null or n.push_state = 'queued')
      and exists (
        select 1 from public.notifications o
        where o.business_id = b
          and o.user_id = n.user_id
          and o.dedupe_key = 'list.late_owner:' || l.id
          and o.resolved_at is null
      );

  when 'lists.out_of_range' then
    perform private.notify(
      b, private.list_managers(b), 'lists.out_of_range',
      facts || jsonb_build_object(
        'item', entry.details -> 'item',
        'label', entry.details -> 'label',
        'reading', entry.details -> 'reading',
        'min', entry.details -> 'min',
        'max', entry.details -> 'max',
        'unit', entry.details -> 'unit'
      ),
      entry.actor_id, 'lists', 'worker', 'list.range:' || (entry.details ->> 'item')
    );

  when 'lists.finish' then
    perform private.resolve_notifications(b, 'list:' || l.id);
    perform private.resolve_notifications(b, 'list.due:' || l.id);
    perform private.resolve_notifications(b, 'list.late:' || l.id);
    perform private.resolve_notifications(b, 'list.late_team:' || l.id);
    perform private.resolve_notifications(b, 'list.late_owner:' || l.id);
    if coalesce(private.list_setting(b, 'tellWhenFinished')::boolean, true) then
      perform private.notify(
        b,
        array[l.sent_by] || array(
          select dm.user_id from public.department_members dm
          where dm.department_id = l.from_department
        ),
        'lists.finished', facts,
        entry.actor_id, 'lists', 'worker', 'list.finished:' || l.id
      );
    end if;

  when 'lists.cancel', 'lists.missed' then
    perform private.resolve_notifications(b, 'list:' || l.id);
    perform private.resolve_notifications(b, 'list.due:' || l.id);
    perform private.resolve_notifications(b, 'list.late:' || l.id);
    perform private.resolve_notifications(b, 'list.late_team:' || l.id);
    perform private.resolve_notifications(b, 'list.late_owner:' || l.id);

  else
    null;
  end case;
end;
$$;

-- 20261114000100_team_changes.sql's, with the new kind, in the lists group
-- with the list's other lines (@domain/notifications has it too).
create or replace function private.notification_kind_groups()
returns table (kind_key text, group_key text)
language sql
immutable
set search_path = ''
as $$
  values
    ('schedule.published'::text, 'schedule'::text),
    ('schedule.changed', 'schedule'),
    ('schedule.unfilled', 'approvals'),
    ('swap.offered', 'swaps'),
    ('swap.taken', 'swaps'),
    ('swap.waiting', 'approvals'),
    ('swap.cancelled', 'swaps'),
    ('swap.approved', 'swaps'),
    ('swap.declined', 'swaps'),
    ('swap.removed', 'swaps'),
    ('swap.reopened', 'swaps'),
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
    ('lists.late_owner', 'lists'),
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

------------------------------------------------------------------------------
-- Who may call what

-- Replaced in place, the same signatures: their grants stay as their first
-- migrations set them (nobody but the database's own, and the tick not even
-- the secret key); revoked again all the same.
revoke execute on function private.list_settings(uuid) from public, anon, authenticated;
revoke execute on function private.lists_tick_business(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.notify_for_lists(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notification_kind_groups()
  from public, anon, authenticated;
