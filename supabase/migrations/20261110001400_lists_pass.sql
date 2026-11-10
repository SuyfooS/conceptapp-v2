-- Lists, part 5 (L5 of the lists plan; Orel's defaults on issue #1: managers
-- send anything, a department its own orders): lists that pass between
-- departments, such as the bar's order to the storeroom and back.
--
--   passing     public.pass_list: whoever holds an open list, or manages the
--               business's lists, passes it to another live department of
--               the same business, with a note if they want. A row in
--               list_passes (the table of 20261109000600_lists.sql) keeps who
--               passed it, from where, to where, when and the note; the list
--               is then the department's (recipient_kind 'department'), and
--               whoever held it before keeps reading it: its people (a
--               person, a shift) through list_people, a department through
--               list_passes (private.sees_list). Orders already ask for counts
--               (send_list's quantities) and say how many were given
--               (set_list_item's `given`), both from L1.
--   lines       private.notify_for_lists (L4's), with `lists.passed` to the
--               new department's people, the one who passed it left out
--               (`list:<id>`, so someone who had it before reads it again,
--               unread), and the list's lines settled for everyone who no
--               longer holds it. The facts carry the department's name and
--               whether there is a note; the note itself stays in the list,
--               out of the log and the line. A finished order already tells
--               the department that asked (L1).
--   demo        private.seed_demo_lists (L4's) sends one more example: the
--               template's first order, by someone of the department that
--               asks (one who isn't in the department it goes to, when there
--               is one), with its first item given there, so the bar's order
--               waits at the storeroom after a reset. In a block of its own,
--               after theirs: it is tried whatever became of the examples
--               before it (no manager, nothing left to send, a failure), and
--               if it fails, they stay. Both hosted demo businesses start
--               again.

------------------------------------------------------------------------------
-- Passing a list on

-- Passes an open list to another department: the actor holds it or manages
-- the business's lists; the department is live, of the list's business, and
-- not the one holding it now. `pass_note` (at most 200, trimmed, none when
-- blank) stays on the pass row, never in the log.
create function public.pass_list(
  actor uuid,
  list uuid,
  department uuid,
  pass_note text default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lists%rowtype;
  goes_to public.departments%rowtype;
  kept_note text;
  was_with uuid;
begin
  select x.* into l from public.lists x where x.id = list for update;
  if not found or not exists (
    select 1 from public.memberships m
    where m.business_id = l.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown list' using errcode = 'P0002';
  end if;
  perform private.lists_on(l.business_id);
  if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
    raise exception 'The list is not yours to pass on' using errcode = '42501';
  end if;
  if l.status <> 'open' then
    raise exception 'The list is closed' using errcode = '55000';
  end if;

  select d.* into goes_to
  from public.departments d
  where d.id = department and d.business_id = l.business_id and d.archived_at is null;
  if not found then
    raise exception 'Not a department of this business' using errcode = '22023';
  end if;
  if l.recipient_kind = 'department' and l.recipient_department = goes_to.id then
    raise exception 'The list is with this department already' using errcode = '22023';
  end if;

  kept_note := nullif(btrim(pass_note), '');
  if char_length(kept_note) > 200 then
    raise exception 'A note has at most 200 characters' using errcode = '22023';
  end if;

  was_with := case when l.recipient_kind = 'department' then l.recipient_department end;

  insert into public.list_passes (
    list_id, business_id, from_department, to_department, passed_by, passed_at, note
  )
  values (l.id, l.business_id, was_with, goes_to.id, actor, at_time, kept_note);

  -- The department's now. Its people of before stay in list_people and keep
  -- reading it; the shift it was sent to stays on the row for its history.
  update public.lists x
  set recipient_kind = 'department',
    recipient_department = goes_to.id,
    recipient_role = null
  where x.id = l.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    l.business_id, actor, 'lists.pass',
    jsonb_build_object(
      'list', l.id,
      'name', l.name,
      'from_department', was_with,
      'to_department', goes_to.id,
      'has_note', kept_note is not null
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- What each log row tells

-- private.notify_for_lists of 20261110001300_list_schedules.sql, with L5's
-- row:
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

  else
    null;
  end case;
end;
$$;

------------------------------------------------------------------------------
-- Demo businesses

-- private.seed_demo_lists of 20261110001300_list_schedules.sql, with one more
-- example at its end: the template's first order still live, sent by someone
-- of the department that asks (one who isn't also in the department it goes
-- to, when there is one; a worker before a manager), with its first item
-- given by someone there, so the bar's order waits at the storeroom. In a
-- block of its own, after the examples' block: L4's two early returns (no
-- manager, no template left for the first example) became conditions around
-- the examples, so the order is tried whatever became of them, and they stay
-- if it fails. Whatever goes wrong here, the reset still stands.
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

-- The hosted demo businesses start again, with the example order. Locally
-- the seed runs after the migrations and resets its own.
select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);

------------------------------------------------------------------------------
-- Who may call what

-- Passing a list: the server's alone, for `actor`.
revoke execute on function public.pass_list(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.pass_list(uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- Replaced above; they run inside the trigger and the reset, as their owner.
revoke execute on function private.notify_for_lists(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.seed_demo_lists(uuid)
  from public, anon, authenticated;
