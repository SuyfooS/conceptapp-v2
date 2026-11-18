-- Roles and permissions by module, R5: lists by their permissions (the roles
-- plan; Orel's answers of 15 November 2026, issue #1). Who runs the lists is
-- whoever holds lists.manage, and who sends them whoever holds lists.send,
-- where until now both were owners and managers by role (and anyone given
-- one); and owners and the ConceptApp team now switch both per role
-- (permission_keys.settable). Nothing changes for anyone until they do:
-- managers hold both by default, workers neither, owners always both.
--
--   floor       view: every staff member fills the lists sent to them, to
--               their department, their shift or their role, sends their
--               department's own orders and passes on what they hold, as
--               before (Q2). Those rules (private.holds_list, list_holders,
--               in_department, and the writers' "holds the list" and "the
--               department that asks") don't move.
--   editing     private.can_manage_lists is private.holds_perm(…,
--               'lists.manage'): an active member on the staff whose role
--               holds it (the business's row for the role, else its default
--               roles), or who was given it; an owner always. Templates and
--               their times (public.save_list_template,
--               archive_list_template, restore_list_template and
--               next_list_openings), every list (private.sees_list), and
--               filling, finishing, passing, reopening and cancelling any of
--               them (public.set_list_item, set_list_item_photo,
--               finish_list, pass_list, reopen_list, cancel_list) ask it, the
--               callers unchanged. The template writers took
--               private.can_edit_settings too, for the ConceptApp team, whom
--               they now name alone (R7's handover, critique 4): since R7
--               that check is manage.edit, which would have let someone run
--               the lists' templates and times from the management page
--               without lists.manage.
--   sending     private.can_send_lists is private.holds_perm(…,
--               'lists.send'), a switch under edit (Q3): lists.send now
--               requires lists.manage (permission_keys.requires), so a role
--               holds it only while it runs the lists, on by default where
--               it does. One given to a person holds whatever it requires,
--               as private.holds_perm has it, and a person given lists.manage
--               sends as before. public.send_list asks it, unchanged; the
--               demo's lists are sent by someone who may send them
--               (private.seed_demo_lists).
--   reading     the archived templates, the templates' times and every list
--               are read by those who run the lists: a member through
--               private.holds_perm, a view whose role holds lists.manage by
--               role (or is the owner), through private.businesses_holding
--               (20261115000900_roles_scheduling.sql), asked once per query,
--               where it was the manager's rank for a view; the list photos
--               as the lists (private.can_read_list_photo, critique 5).
--               Departments stay on the staff's reads: lists and chat share
--               them.
--   telling     a list still late (lists.late_team) and a reading out of
--               its range (lists.out_of_range) go to those who run the lists
--               (private.list_managers, holders_of lists.manage), whoever
--               they are, as lines for that permission (read only while
--               their reader holds it, pushed only while they do, settled
--               when a change of role takes it away: R3's rules for such a
--               line). The lines already written are moved to the key. Their
--               audience_role stays 'worker', as they were written (for
--               whoever ran the lists, whatever their rank), which nothing
--               decides by any more. The owners' late line (lists.late_owner)
--               stays with owners, by rank.
--   giving      a manager gives nobody a role that holds lists.manage or
--               lists.send by role while they don't (private.role_holds_beyond,
--               R3's, asks every settable key): it bites only where an owner
--               set workers above managers.
--   nobody      a list of a template's times with nobody there to take it
--               goes to the managers while their role runs the lists, else
--               to the owners (private.lists_tick_business), where it went to
--               the managers by role, lowered or not, with its lines.
--   the area    lists.manage and lists.send are settable: the console's
--               roles page (and, with R9, the owner's) switches them per role
--               (public.set_role_permission), every check in the area now
--               reading them.
--
-- Left as they are: the departments, saved at manage.edit
-- (public.set_departments, set_department_members, R7), which lists and chat
-- share. Whoever is in a department fills its lists, as the floor has it, so
-- someone at manage.edit decides who gets a department's lists, themselves
-- included; the roles screen's hint for manage.edit says so. The templates'
-- times stay with lists.manage (Orel's split: times are edit), so someone
-- who runs the lists without sending still sets when lists open by
-- themselves; the hint for sending says so.

------------------------------------------------------------------------------
-- 1. Who runs the lists, and who sends them

-- Sending lists needs running them: a role holds lists.send by its role only
-- while it also holds lists.manage. Managers hold both by default and
-- nothing gives a role lists.send yet (the key wasn't settable), so nobody
-- holds less. A grant of one's own holds as before (private.holds_perm).
update public.permission_keys k
set requires = 'lists.manage'
where k.key = 'lists.send';

-- 20261109000600_lists.sql's, by the permission rather than the role:
-- someone holds lists.manage by private.holds_perm (an active owner always;
-- on the staff, by their role's rule for it or by a grant of their own),
-- where it was an active owner or manager, or anyone given it. Its callers
-- are unchanged: public.save_list_template, restore_list_template,
-- next_list_openings, set_list_item and reopen_list
-- (20261110001300_list_schedules.sql), public.archive_list_template,
-- finish_list and cancel_list (20261109000600_lists.sql), public.pass_list
-- (20261110001400_lists_pass.sql) and public.set_list_item_photo
-- (20261110001500_list_photos.sql). No policy asks it any more (below).
create or replace function private.can_manage_lists(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'lists.manage'::text)
$$;

-- 20261109000600_lists.sql's, the same: someone holds lists.send by
-- private.holds_perm, by their role only while it also runs the lists
-- (lists.send requires lists.manage), where it was an active owner or
-- manager; and a person given lists.manage or lists.send themselves sends,
-- as before. Its caller, public.send_list (20261109000600_lists.sql), is
-- unchanged: a department's own order still needs neither.
create or replace function private.can_send_lists(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'lists.send'::text)
    or exists (
      select 1 from public.memberships m
      where m.business_id = business
        and m.user_id = person
        and m.active
        and private.is_staff_role(m.role)
        and 'lists.manage' = any (m.perms)
    )
$$;

-- 20261109000600_lists.sql's, the same: the active members who run the lists
-- (private.holds_perm, lists.manage), where it was owners, managers and
-- anyone given it. Its caller, private.notify_for_lists (below), is
-- unchanged but for the lines it writes.
create or replace function private.list_managers(business uuid)
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
    and private.holds_perm(business, m.user_id, 'lists.manage'::text)
$$;

-- 20261110000300_payroll_access.sql's, the same, with every list for those
-- who run the lists (private.holds_perm, lists.manage), where it was owners
-- and managers by role, and anyone given it. The rest (its sender, those
-- who hold it, its people, the departments that asked for it or passed it)
-- is as it was. Its callers: the lists' read policy and
-- private.can_read_list_photo (below).
create or replace function private.sees_list(list uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lists l
    join public.memberships m
      on m.business_id = l.business_id and m.user_id = person and m.active
      and private.is_staff_role(m.role)
    where l.id = list
      and (
        private.holds_perm(l.business_id, person, 'lists.manage'::text)
        or l.sent_by = person
        or private.holds_list(l.id, person)
        or exists (
          select 1 from public.list_people p
          where p.list_id = l.id and p.user_id = person
        )
        or exists (
          select 1 from public.department_members dm
          where dm.user_id = person and dm.department_id = l.from_department
        )
        or exists (
          select 1
          from public.list_passes lp
          join public.department_members dm
            on dm.user_id = person
            and dm.department_id in (lp.from_department, lp.to_department)
          where lp.list_id = l.id
        )
      )
  )
$$;

-- 20261115000300_running_week.sql's, the same, with the demo's example lists
-- sent by someone in the definition who may send them
-- (private.can_send_lists): its first manager who does, else its owner, as
-- before (who always does). Its caller, public.reset_demo_business
-- (20261111000200_chat.sql), is unchanged; it seeds the role rows after the
-- lists, so the sender is found by the defaults.
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
    where private.can_send_lists(business, m.user_id)
    order by (m.role = 'manager') desc, (m.role = 'owner') desc, person.ordinality
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

-- 20261115000500_lists_owners_late.sql's, the same, with a list of a
-- template's times that has nobody there to take it (the person left, the
-- shift is empty, the department was removed) going to the managers only
-- while their role runs the lists (private.role_holds, lists.manage), else
-- to the owners, who always do: it went to the managers by role, so once an
-- owner lowered them it still reached them, with its lines and pushes, and
-- they filled it. On today's defaults it goes to the managers, as before.
-- Its caller, private.lists_tick (20261110001300_list_schedules.sql), is
-- unchanged.
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

      -- Nobody there to take it: the managers while their role runs the
      -- lists, else the owners, who always do, so it is never lost and never
      -- goes to a role the lists were taken from (R5).
      if (to_kind in ('person', 'shift') and cardinality(people) = 0)
        or (to_kind = 'department' and to_department is null)
        or (to_kind = 'role' and to_role is null) then
        to_kind := 'role';
        to_role := (
          case
            when private.role_holds(business, 'manager'::public.member_role, 'lists.manage'::text)
              then 'manager'
            else 'owner'
          end
        )::public.member_role;
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
-- 2. Templates and their times: those who run the lists, or the team

-- 20261110001300_list_schedules.sql's, the same, with the ConceptApp team
-- named where private.can_edit_settings stood (R7's handover, critique 4):
-- it was there for the team, who build a business's lists from the console,
-- and since R7 it also lets anyone at manage.edit through, lists.manage or
-- not. Its callers are the app's (the lists' templates and the console's),
-- with the secret key.
create or replace function public.save_list_template(
  actor uuid,
  business uuid,
  template jsonb,
  seen_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  existing public.list_templates%rowtype;
  tid uuid;
  new_version integer;
  is_new boolean;
  new_name text;
  new_note text;
  rk text;
  rd uuid;
  rs text;
  rr public.member_role;
  asking uuid;
  asks boolean;
  wanted_items jsonb;
  wanted_schedules jsonb;
  entry jsonb;
  place integer;
  entry_id uuid;
  f record;
  s record;
  kept uuid[] := '{}'::uuid[];
  item_count integer;
  schedule_count integer;
begin
  if not (
    private.can_manage_lists(business, actor)
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'List managers and the team only' using errcode = '42501';
  end if;
  select b.timezone into tz from public.businesses b where b.id = business;
  if not found then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;
  perform private.lists_on(business);

  if jsonb_typeof(template) is distinct from 'object' then
    raise exception 'A template must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(template) as k (field)
    where k.field not in (
      'id', 'name', 'note', 'recipient', 'fromDepartment', 'asksQuantities', 'items', 'schedules'
    )
  ) then
    raise exception 'A template has a name, a note, a recipient, an asking department, items and schedules'
      using errcode = '22023';
  end if;

  new_name := private.json_text(template -> 'name', 60, 'The name');
  if new_name is null then
    raise exception 'A template needs a name' using errcode = '22023';
  end if;
  new_note := private.json_text(template -> 'note', 300, 'The note');

  if coalesce(jsonb_typeof(template -> 'recipient'), 'null') <> 'null' then
    select r.to_kind, r.to_department, r.to_shift, r.to_role
    into rk, rd, rs, rr
    from private.list_recipient(
      business, template -> 'recipient', array['department', 'shift', 'role']
    ) as r;
  end if;

  asking := private.json_uuid(template -> 'fromDepartment', 'The department that asks');
  if asking is not null then
    if not exists (
      select 1 from public.departments d
      where d.id = asking and d.business_id = business and d.archived_at is null
    ) then
      raise exception 'Not a department of this business' using errcode = '22023';
    end if;
    if rk is distinct from 'department' or rd = asking then
      raise exception 'An order goes from its department to another one'
        using errcode = '22023';
    end if;
  end if;
  asks := private.json_bool(template -> 'asksQuantities', false, 'Asks for quantities');

  wanted_items := template -> 'items';
  if jsonb_typeof(wanted_items) is distinct from 'array' then
    raise exception 'A template has from 1 to 60 items' using errcode = '22023';
  end if;
  if jsonb_array_length(wanted_items) not between 1 and 60 then
    raise exception 'A template has from 1 to 60 items' using errcode = '22023';
  end if;
  wanted_schedules := coalesce(template -> 'schedules', '[]'::jsonb);
  if jsonb_typeof(wanted_schedules) = 'null' then
    wanted_schedules := '[]'::jsonb;
  end if;
  if jsonb_typeof(wanted_schedules) <> 'array' then
    raise exception 'A template has at most 7 schedules' using errcode = '22023';
  end if;
  if jsonb_array_length(wanted_schedules) > 7 then
    raise exception 'A template has at most 7 schedules' using errcode = '22023';
  end if;

  tid := private.json_uuid(template -> 'id', 'The template''s id');
  if tid is null then
    -- Under the business's lock, so two saves at once can't pass the cap.
    perform 1 from public.businesses b where b.id = business for no key update;
    if (
      select count(*) from public.list_templates t
      where t.business_id = business and t.archived_at is null
    ) >= 100 then
      raise exception 'A business keeps at most 100 lists' using errcode = '22023';
    end if;
    insert into public.list_templates (
      business_id, name, note, recipient_kind, recipient_department, recipient_shift,
      recipient_role, from_department, asks_quantities, position, created_by, updated_by
    )
    values (
      business, new_name, new_note, rk, rd, rs, rr, asking, asks,
      (
        select coalesce(max(t.position) + 1, 0)
        from public.list_templates t
        where t.business_id = business
      )::smallint,
      actor, actor
    )
    returning id, version into tid, new_version;
    is_new := true;
  else
    select t.* into existing
    from public.list_templates t
    where t.id = tid and t.business_id = business
    for update;
    if not found then
      raise exception 'Unknown template' using errcode = 'P0002';
    end if;
    if existing.archived_at is not null then
      raise exception 'The template was removed' using errcode = '55000';
    end if;
    if seen_version is not null and seen_version <> existing.version then
      raise exception 'The template changed since it was read' using errcode = '40001';
    end if;
    new_version := existing.version + 1;
    update public.list_templates t
    set name = new_name,
      note = new_note,
      recipient_kind = rk,
      recipient_department = rd,
      recipient_shift = rs,
      recipient_role = rr,
      from_department = asking,
      asks_quantities = asks,
      version = new_version,
      updated_by = actor
    where t.id = tid;
    is_new := false;
  end if;

  for entry, place in
    select e.value, e.ordinality::integer
    from jsonb_array_elements(wanted_items) with ordinality as e (value, ordinality)
  loop
    select * into f from private.list_item_fields(entry, true);
    entry_id := private.json_uuid(entry -> 'id', 'An item''s id');
    if entry_id = any (kept) then
      raise exception 'An item is there twice' using errcode = '22023';
    end if;
    if entry_id is null then
      insert into public.list_template_items (
        template_id, business_id, position, kind, label, hint, required, unit,
        min_value, max_value, default_quantity
      )
      values (
        tid, business, (place - 1)::smallint, f.item_kind, f.item_label, f.item_hint,
        f.item_required, f.item_unit, f.item_min, f.item_max, f.item_quantity
      )
      returning id into entry_id;
    else
      update public.list_template_items i
      set position = (place - 1)::smallint,
        kind = f.item_kind,
        label = f.item_label,
        hint = f.item_hint,
        required = f.item_required,
        unit = f.item_unit,
        min_value = f.item_min,
        max_value = f.item_max,
        default_quantity = f.item_quantity
      where i.id = entry_id and i.template_id = tid;
      if not found then
        raise exception 'Not an item of this template' using errcode = '22023';
      end if;
    end if;
    kept := kept || entry_id;
  end loop;
  delete from public.list_template_items i
  where i.template_id = tid and i.id <> all (kept);
  item_count := cardinality(kept);

  kept := '{}'::uuid[];
  for entry, place in
    select e.value, e.ordinality::integer
    from jsonb_array_elements(wanted_schedules) with ordinality as e (value, ordinality)
  loop
    select * into s from private.list_schedule_fields(business, entry);
    entry_id := private.json_uuid(entry -> 'id', 'A schedule''s id');
    if entry_id = any (kept) then
      raise exception 'A schedule is there twice' using errcode = '22023';
    end if;
    if entry_id is null then
      insert into public.list_schedules (
        template_id, business_id, position, days, anchor, shift_key, opens_offset,
        due_offset, recipient_kind, recipient_user, recipient_department,
        recipient_shift, recipient_role, active, starts_on
      )
      values (
        tid, business, (place - 1)::smallint, s.at_days, s.at_anchor, s.at_shift,
        s.at_opens, s.at_due, s.for_kind, s.for_user, s.for_department, s.for_shift,
        s.for_role, s.is_active, (now() at time zone tz)::date
      )
      returning id into entry_id;
    else
      -- Edited in place, keeping its id, so the day's list never opens twice.
      update public.list_schedules ls
      set position = (place - 1)::smallint,
        days = s.at_days,
        anchor = s.at_anchor,
        shift_key = s.at_shift,
        opens_offset = s.at_opens,
        due_offset = s.at_due,
        recipient_kind = s.for_kind,
        recipient_user = s.for_user,
        recipient_department = s.for_department,
        recipient_shift = s.for_shift,
        recipient_role = s.for_role,
        active = s.is_active,
        -- Other days or hours, or on again: it counts from now.
        opens_from = case
          when not (ls.days @> s.at_days and ls.days <@ s.at_days)
            or ls.anchor is distinct from s.at_anchor
            or ls.shift_key is distinct from s.at_shift
            or ls.opens_offset <> s.at_opens
            or ls.due_offset <> s.at_due
            or (not ls.active and s.is_active)
            then now()
          else ls.opens_from
        end
      where ls.id = entry_id and ls.template_id = tid;
      if not found then
        raise exception 'Not a schedule of this template' using errcode = '22023';
      end if;
    end if;
    kept := kept || entry_id;
  end loop;
  delete from public.list_schedules ls
  where ls.template_id = tid and ls.id <> all (kept);
  schedule_count := cardinality(kept);

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'lists.template.save',
    jsonb_build_object(
      'template', tid,
      'name', new_name,
      'created', is_new,
      'items', item_count,
      'schedules', schedule_count
    )
  );

  return jsonb_build_object('id', tid, 'version', new_version);
end;
$$;

-- 20261109000600_lists.sql's, the same as public.save_list_template above.
create or replace function public.archive_list_template(actor uuid, template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.list_templates%rowtype;
begin
  select x.* into t from public.list_templates x where x.id = template for update;
  if not found or not (
    exists (
      select 1 from public.memberships m
      where m.business_id = t.business_id and m.user_id = actor and m.active
    )
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'Unknown template' using errcode = 'P0002';
  end if;
  if not (
    private.can_manage_lists(t.business_id, actor)
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'List managers and the team only' using errcode = '42501';
  end if;
  perform private.lists_on(t.business_id);
  if t.archived_at is not null then
    return;
  end if;

  update public.list_templates x
  set archived_at = now(), version = t.version + 1, updated_by = actor
  where x.id = t.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    t.business_id, actor, 'lists.template.archive',
    jsonb_build_object('template', t.id, 'name', t.name)
  );
end;
$$;

-- 20261110001300_list_schedules.sql's, the same as public.save_list_template
-- above.
create or replace function public.restore_list_template(actor uuid, template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.list_templates%rowtype;
begin
  select x.* into t from public.list_templates x where x.id = template for update;
  if not found or not (
    exists (
      select 1 from public.memberships m
      where m.business_id = t.business_id and m.user_id = actor and m.active
    )
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'Unknown template' using errcode = 'P0002';
  end if;
  if not (
    private.can_manage_lists(t.business_id, actor)
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'List managers and the team only' using errcode = '42501';
  end if;
  perform private.lists_on(t.business_id);
  if t.archived_at is null then
    return;
  end if;
  -- Under the business's lock, as in save_list_template.
  perform 1 from public.businesses b where b.id = t.business_id for no key update;
  if (
    select count(*) from public.list_templates x
    where x.business_id = t.business_id and x.archived_at is null
  ) >= 100 then
    raise exception 'A business keeps at most 100 lists' using errcode = '22023';
  end if;

  update public.list_templates x
  set archived_at = null, version = t.version + 1, updated_by = actor
  where x.id = t.id;
  update public.list_schedules ls
  set opens_from = now()
  where ls.template_id = t.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    t.business_id, actor, 'lists.template.restore',
    jsonb_build_object('template', t.id, 'name', t.name)
  );
end;
$$;

-- 20261110001300_list_schedules.sql's, the same as public.save_list_template
-- above: when a template's times open next, which its editor shows.
create or replace function public.next_list_openings(
  actor uuid,
  template uuid,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.list_templates%rowtype;
begin
  select x.* into t from public.list_templates x where x.id = template;
  if not found or not (
    exists (
      select 1 from public.memberships m
      where m.business_id = t.business_id and m.user_id = actor and m.active
    )
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'Unknown template' using errcode = 'P0002';
  end if;
  if not (
    private.can_manage_lists(t.business_id, actor)
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'List managers and the team only' using errcode = '42501';
  end if;
  perform private.lists_on(t.business_id);

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'schedule', ls.id,
          'openings', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'occursOn', o.occurs_on,
                  'opensAt', o.opens_at,
                  'dueAt', o.due_at
                )
                order by o.opens_at
              )
              from (
                select n.occurs_on, n.opens_at, n.due_at
                from private.list_occurrences(
                  ls.id, at_time, at_time + interval '22 days'
                ) as n
                where not exists (
                  select 1 from public.lists l
                  where l.schedule_id = ls.id and l.occurs_on = n.occurs_on
                )
                order by n.opens_at
                limit 3
              ) o
            ),
            '[]'::jsonb
          )
        )
        order by ls.position, ls.id
      )
      from public.list_schedules ls
      where ls.template_id = t.id
    ),
    '[]'::jsonb
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. Who reads every template, the templates' times, every list and its photos

-- 20261110000300_payroll_access.sql's (live templates for the staff and a
-- view of them; every template for whoever ran the lists and a view as a
-- manager or owner): every template, the archived ones too, for those who
-- run the lists, members and views alike (private.businesses_holding, asked
-- once per query), where private.can_manage_lists per row and the manager's
-- rank for a view were two branches. The live ones for the staff are as
-- they were.
alter policy "members read their business's list templates" on public.list_templates
  using (
    private.module_enabled(business_id, 'lists')
    and (
      (archived_at is null
        and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id)))
      or business_id in (select private.businesses_holding('lists.manage'))
    )
  );

-- 20261109000600_lists.sql's (whoever ran the lists, and a view as a manager
-- or owner): the templates' times, for those who run the lists, the same way.
alter policy "list managers read the schedules" on public.list_schedules
  using (
    private.module_enabled(business_id, 'lists')
    and business_id in (select private.businesses_holding('lists.manage'))
  );

-- 20261109000600_lists.sql's (the lists someone sees, and every list for a
-- view as a manager or owner): every list for those who run the lists,
-- members and views alike, asked first and once per query, and the rest by
-- private.sees_list as before. A list's items, people and passes follow it.
alter policy "people read the lists they see" on public.lists
  using (
    private.module_enabled(business_id, 'lists')
    and (
      business_id in (select private.businesses_holding('lists.manage'))
      or private.sees_list(id, (select auth.uid()))
    )
  );

-- 20261110001500_list_photos.sql's, the same, with a photo read by a view
-- whose role runs the lists (private.businesses_holding, lists.manage)
-- rather than one as a manager or owner (critique 5): a view reads the
-- lists, so it reads their photos too. A member reads those of the lists
-- they see (private.sees_list, above). Its caller is the list photos' read
-- policy on storage.objects, unchanged.
create or replace function private.can_read_list_photo(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reader uuid := (select auth.uid());
begin
  if object_name is null
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]{1,40}\.(webp|jpg)$'
  then
    return false;
  end if;
  return exists (
    select 1
    from public.lists l
    join public.list_items i on i.list_id = l.id and i.photo_path = object_name
    where l.id = split_part(object_name, '/', 2)::uuid
      and l.business_id = split_part(object_name, '/', 1)::uuid
      and private.module_enabled(l.business_id, 'lists'::public.module_key)
      and (
        private.sees_list(l.id, reader)
        or l.business_id in (select private.businesses_holding('lists.manage'::text))
      )
  );
end;
$$;

------------------------------------------------------------------------------
-- 4. Who is told

-- The lines already written of the two kinds move to the key, as
-- private.notify_for_lists writes them from now on (below): read and pushed
-- only while their reader holds it, so a manager lowered after this migrates
-- stops reading them too. Each went to whoever ran the lists then (owners,
-- managers, anyone given lists.manage), who hold it now: nobody's inbox
-- changes today, but for someone no longer among them since (a manager made
-- a worker), whose line was for any rank and is now theirs no longer. No
-- trigger reads an update of a line.
update public.notifications n
set audience_perm = 'lists.manage'
where n.kind in ('lists.late_team', 'lists.out_of_range')
  and n.audience_perm is null;

comment on column public.notifications.audience_role is
  'The lowest role that may read the line, for a line without audience_perm. For one with it, nothing decides by it: the lowest role that holds that permission by default, or ''worker'' on the lists'' lines (lists.late_team, lists.out_of_range), written so for anyone who ran the lists.';
comment on column public.notifications.audience_perm is
  'The permission whoever reads the line holds (private.holds_perm), when it is for those who hold one rather than for a rank and up: swap.waiting and availability.missing are for those who build the schedule (schedule.edit), schedule.unfilled for those who publish it (schedule.publish), clock.confirm (but hours someone set for themselves, an owner''s line by rank) and clock.overdue for those who edit the clock (clock.edit), lists.late_team and lists.out_of_range for those who run the lists (lists.manage). Written only to them (private.notify''s holders_of), read only while they hold it, and its push skipped once they don''t (public.claim_due_pushes).';

-- 20261115000500_lists_owners_late.sql's, the same, with a list still late
-- (lists.late_team) and a reading out of its range (lists.out_of_range) told
-- to those who run the lists as lines for lists.manage (holders_of), where
-- they were lines for any rank written to owners, managers and anyone given
-- it (private.list_managers, above, gives the recipients). The owners' late
-- line (lists.late_owner) and the rest are as they were. Its caller,
-- private.notify_lists_from_log (the log's trigger,
-- 20261109000600_lists.sql), is unchanged.
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
        realert => false, leave_out => private.list_holders(l.id),
        holders_of => 'lists.manage'::text
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
      entry.actor_id, 'lists', 'worker', 'list.range:' || (entry.details ->> 'item'),
      holders_of => 'lists.manage'::text
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

------------------------------------------------------------------------------
-- 5. The area opens

-- Every check in lists reads its two keys now: owners and the team switch
-- them per role (public.set_role_permission), sending under running.
update public.permission_keys k
set settable = true
where k.key in ('lists.manage', 'lists.send');

------------------------------------------------------------------------------
-- Who may call what

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the policies' and the app's granted) again all the same.

-- The policies' helpers run as the reader, so the signed-in role runs them.
revoke execute on function private.can_manage_lists(uuid, uuid) from public, anon;
revoke execute on function private.sees_list(uuid, uuid) from public, anon;
revoke execute on function private.can_read_list_photo(text) from public, anon;
grant execute on function private.can_manage_lists(uuid, uuid) to authenticated;
grant execute on function private.sees_list(uuid, uuid) to authenticated;
grant execute on function private.can_read_list_photo(text) to authenticated;

revoke execute on function private.can_send_lists(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.list_managers(uuid)
  from public, anon, authenticated;
revoke execute on function private.seed_demo_lists(uuid)
  from public, anon, authenticated;
revoke execute on function private.notify_for_lists(public.audit_log)
  from public, anon, authenticated;
-- The minute job's, not even the secret key's.
revoke execute on function private.lists_tick_business(uuid, timestamptz)
  from public, anon, authenticated, service_role;

revoke execute on function public.save_list_template(uuid, uuid, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.save_list_template(uuid, uuid, jsonb, integer)
  to service_role;
revoke execute on function public.archive_list_template(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.archive_list_template(uuid, uuid) to service_role;
revoke execute on function public.restore_list_template(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_list_template(uuid, uuid) to service_role;
revoke execute on function public.next_list_openings(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.next_list_openings(uuid, uuid, timestamptz) to service_role;
