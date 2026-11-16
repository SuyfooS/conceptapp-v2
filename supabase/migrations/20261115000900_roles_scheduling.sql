-- Roles and permissions by module, R3: scheduling by its permissions (the
-- roles plan; Orel's answers of 15 November 2026, issue #1). Who builds the
-- schedule is whoever holds schedule.edit, and who publishes it whoever also
-- holds schedule.publish, where until now both were owners and managers by
-- role; and owners and the ConceptApp team now switch both per role
-- (permission_keys.settable). Nothing changes for anyone until they do:
-- managers hold both by default, workers neither, owners always both.
--
--   floor       view: every staff member sees the published schedule, sends
--               availability, and asks for and takes swaps, as before (Q2).
--               Those rules (the weeks, published shifts and assignments,
--               swaps, one's own availability) don't move: their answers
--               can't change with view as the floor.
--   building    private.builds_schedule is private.holds_perm(…,
--               'schedule.edit'): an active member on the staff whose role
--               holds it (the business's row for the role, else its default
--               roles), or who was given it; an owner always. Saving and
--               publishing (private.write_week_schedule) and deciding a swap
--               (public.decide_shift_swap, Q6: whoever may build the schedule
--               approves) ask it. A swap's own asker or taker decides it only
--               if they publish too: approving it changes a published week,
--               which someone who builds without publishing never does on
--               their word alone (Q3).
--   publishing  public.publish_week_schedule also asks
--               private.publishes_schedule (schedule.edit and
--               schedule.publish), first of all: before it locks the weeks
--               or reads anything for update, so someone who may not
--               publish takes no lock and learns nothing. Someone who builds
--               without publishing saves drafts only: a published week is
--               only ever published again (public.save_week_schedule refuses
--               it), so they can't change one (Q3). The demo's weekly renewal
--               publishes as an owner first, as before, or as someone who may.
--   reading     the draft shifts and assignments and everyone's availability
--               are read by those who build: a member through
--               private.holds_perm, a view whose role holds schedule.edit by
--               role (or is the owner), through
--               private.businesses_holding, which a policy asks once per
--               query (business_id in (select …)) rather than once per row.
--   telling     a line can be for those who hold a permission
--               (notifications.audience_perm, private.notify's holders_of),
--               where until now it was for a rank and up (audience_role,
--               which stays the rule for every other line): written only to
--               those who hold it, read only while they do, its push skipped
--               once they don't (public.claim_due_pushes asks again at every
--               send), and settled when a change of role takes it away
--               (public.set_member_role). swap.waiting and
--               availability.missing go to those who build the schedule
--               (private.members_holding), whoever they are, but a swap's
--               asker who doesn't publish; schedule.unfilled, only ever of a
--               published week, to those who publish it, who alone fill it.
--               Their audience_role stays 'manager', the lowest role that
--               holds the key by default, which nothing decides by any more,
--               and the lines already written are moved to their key, so a
--               manager lowered later stops reading them too. The workers'
--               own lines (schedule.published, schedule.changed, the swaps'
--               outcomes, availability.due) are as they were.
--   giving      only owners and the team change permissions (Q5), so a
--               manager gives nobody a role that holds by role a key owners
--               switch which the manager doesn't hold: changing someone's
--               role (public.set_member_role) and inviting or inviting again
--               (public.team_invite, public.team_invite_link) refuse it
--               (42501, hint 'held'). It bites only where an owner set
--               workers above managers; by default managers hold all that
--               workers do.
--   the area    schedule.edit and schedule.publish are settable: the
--               console's roles page (and, with R9, the owner's) switches
--               them per role (public.set_role_permission), every check in
--               the area now reading them.
--
-- Left for their own phases: the minors' details (public.team_youth), read
-- on the team screen alone, go with the team (R6); the scheduling settings
-- (positions, regular shifts) with the management page (R7, critique 16);
-- clock.confirm, clock.overdue and team.joined in the same notifiers with
-- the clock (R4) and the team (R6).

------------------------------------------------------------------------------
-- 1. Who builds the schedule, and who publishes it

-- 20261115000100_week_in_place.sql's, by the permission rather than the role:
-- someone holds schedule.edit by private.holds_perm (an active owner always;
-- on the staff, by their role's rule for it or by a grant of their own).
-- Its callers are unchanged: private.write_week_schedule (saving and
-- publishing, 20261115000600_running_week_edge.sql), and now
-- public.decide_shift_swap.
create or replace function private.builds_schedule(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'schedule.edit'::text)
$$;

-- Whether `person` publishes the business's schedule: they build it, and
-- hold schedule.publish (by their role only while it also holds
-- schedule.edit, which publishing requires; given to them, whatever it
-- requires, so building is asked here as well).
create function private.publishes_schedule(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.builds_schedule(business, person)
    and private.holds_perm(business, person, 'schedule.publish'::text)
$$;

-- 20261115000600_running_week_edge.sql's, the same, with who may publish
-- asked first of all, before private.lock_week_edges and the reads for
-- update (critique 23): the week's business is read plainly, an unknown week
-- refused as the write refuses it (P0002), and someone who doesn't publish
-- the schedule refused (42501). Its caller, private.renew_demo_schedule
-- (below), is unchanged; the app and the tests call it as before.
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
  week_business uuid;
  w public.schedule_weeks%rowtype;
  written jsonb;
  before_people jsonb;
  after_people jsonb;
  changed jsonb;
  business_zone text;
  nearest jsonb := '{}'::jsonb;
  reopened_next_door jsonb;
begin
  -- Who may publish, before anything is locked or read for update (the roles
  -- plan's R3): someone who may not publish takes no lock and learns nothing
  -- of the week but that it is there, as before. An unknown week is refused
  -- as the write refuses it.
  select wk.business_id into week_business
  from public.schedule_weeks wk
  where wk.id = week;
  if not found then
    raise exception 'Unknown week' using errcode = 'P0002';
  end if;
  if not private.publishes_schedule(week_business, actor) then
    raise exception 'Only someone who publishes the schedule publishes it'
      using errcode = '42501';
  end if;

  -- The week for update and the weeks either side for share, in ascending
  -- order, before anything else (at the top of this file).
  perform private.lock_week_edges(week);

  -- Locked, so what's logged is what happened, in the order of
  -- 20261109000450_notifications.sql's version: the week (two publishes of it
  -- take turns), its shifts, then their waiting requests, before whose shifts
  -- are read. A decision on a request under way finishes first, so both sides
  -- of `changed` see it, and one after waits until this is done. The write
  -- takes the same locks again, already held. Nothing read here is returned,
  -- and whoever got this far may publish.
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

-- 20261105000100_shift_swaps.sql's, the same, with its inline check (an
-- active owner or manager) asking private.builds_schedule instead: whoever
-- may build the schedule approves or declines (Orel's answer 6). Who decides
-- is asked first, before the swap is locked (critique 23, as the publish
-- asks): the swap's business is read plainly, an unknown request refused as
-- before (P0002), and someone who doesn't build refused (42501). Then the
-- swap is locked, and its own asker or taker decides it only if they publish
-- the schedule too (42501): approving it changes a published week, which
-- someone who builds without publishing never does on their word alone (Q3).
-- Owners and managers publish by default, so they decide their own as
-- before. No caller in the database; the app calls it with the secret key.
create or replace function public.decide_shift_swap(
  actor uuid,
  swap uuid,
  approve boolean,
  at_time timestamptz default now()
)
returns public.swap_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  swap_business uuid;
  w public.shift_swaps%rowtype;
  result public.swap_status;
begin
  select sw.business_id into swap_business
  from public.shift_swaps sw
  where sw.id = swap;
  if not found then
    raise exception 'Unknown request' using errcode = 'P0002';
  end if;

  if not private.builds_schedule(swap_business, actor) then
    raise exception 'Only someone who builds the schedule decides' using errcode = '42501';
  end if;

  select * into w from public.shift_swaps where id = swap for update;
  if not found then
    raise exception 'Unknown request' using errcode = 'P0002';
  end if;

  if actor in (w.requested_by, w.taken_by)
    and not private.publishes_schedule(w.business_id, actor)
  then
    raise exception 'Someone who builds without publishing decides only colleagues'' requests'
      using errcode = '42501';
  end if;

  if w.status <> 'taken' then
    raise exception 'Only a taken request waits for a decision' using errcode = '55000';
  end if;

  if approve is null then
    raise exception 'Approve or decline' using errcode = '22023';
  end if;

  if approve then
    perform private.check_shift_open_for_swap(w.shift_id, at_time);

    if not exists (
      select 1 from public.shift_assignments a
      where a.shift_id = w.shift_id and a.user_id = w.requested_by
    ) then
      raise exception 'The worker is no longer on this shift' using errcode = '55000';
    end if;

    perform private.check_can_take(w.shift_id, w.taken_by);

    update public.shift_assignments
    set user_id = w.taken_by
    where shift_id = w.shift_id and user_id = w.requested_by;

    result := 'approved';
  else
    result := 'declined';
  end if;

  update public.shift_swaps
  set status = result, decided_by = actor, decided_at = at_time
  where id = swap;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    w.business_id, actor,
    case when approve then 'swap.approve' else 'swap.decline' end,
    jsonb_build_object('swap', swap, 'shift', w.shift_id, 'from', w.requested_by, 'to', w.taken_by)
  );

  return result;
end;
$$;

-- 20261115000600_running_week_edge.sql's, the same, with the week published
-- as someone who may publish it (private.publishes_schedule): an owner
-- first, as before. Its callers (public.renew_demo_schedules,
-- public.reset_demo_business) are unchanged.
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
  where m.business_id = business and m.active
    and private.publishes_schedule(business, m.user_id)
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
-- 2. Who reads the drafts and everyone's availability

-- The businesses where the signed-in person holds `perm_key`: as a member
-- (private.holds_perm), and those they view as a role that holds it by role
-- (private.role_holds, or the owner), never a key an owner gives but as an
-- accountant, as public.my_permissions answers a view. For the policies'
-- form `business_id in (select private.businesses_holding(…))`, which asks
-- once per query rather than once per row.
create function private.businesses_holding(perm_key text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.active
    and private.holds_perm(m.business_id, m.user_id, perm_key)
  union
  select v.business_id
  from public.view_sessions v
  join public.permission_keys k on k.key = perm_key
  where v.staff_id = (select auth.uid())
    and v.ended_at is null
    and v.expires_at > now()
    and (
      (v.role = 'accountant' and k.key = any (private.accountant_perms()))
      or (
        not k.by_owner
        and (v.role = 'owner' or private.role_holds(v.business_id, v.role, k.key))
      )
    )
$$;

-- 20261030000100_week_schedule.sql's (managers and owners, and a view as
-- one): the schedule's shifts and assignments, drafts included, for those
-- who build it. The published ones stay everyone's
-- (20261110000300_payroll_access.sql's policies, unchanged).
alter policy "managers read their business's shifts" on public.schedule_shifts
  rename to "the schedule's builders read its shifts";
alter policy "the schedule's builders read its shifts" on public.schedule_shifts
  using (
    private.module_enabled(business_id, 'scheduling')
    and business_id in (select private.businesses_holding('schedule.edit'))
  );

alter policy "managers read their business's assignments" on public.shift_assignments
  rename to "the schedule's builders read its assignments";
alter policy "the schedule's builders read its assignments" on public.shift_assignments
  using (
    private.module_enabled(business_id, 'scheduling')
    and business_id in (select private.businesses_holding('schedule.edit'))
  );

-- 20261027000100_availability.sql's: everyone's availability, for those who
-- build the schedule from it. One's own stays one's own
-- (20261110000300_payroll_access.sql's policy, unchanged).
alter policy "managers read their business's availability" on public.availability_submissions
  rename to "the schedule's builders read everyone's availability";
alter policy "the schedule's builders read everyone's availability" on public.availability_submissions
  using (
    private.module_enabled(business_id, 'scheduling')
    and business_id in (select private.businesses_holding('schedule.edit'))
  );

------------------------------------------------------------------------------
-- 3. Who is told

-- A line for those who hold a permission, rather than for a rank and up.
alter table public.notifications
  add column audience_perm text references public.permission_keys (key);

-- The lines already written of the three kinds move to their key, as
-- private.notify writes them from now on (below): read and pushed only while
-- their reader holds it, so a manager lowered after this migrate stops
-- reading them too. Everyone who has one now is an owner or a manager, who
-- hold both keys by default: nobody's inbox changes today. No trigger reads
-- an update of a line.
update public.notifications n
set audience_perm = case
    when n.kind = 'schedule.unfilled' then 'schedule.publish'
    else 'schedule.edit'
  end
where n.kind in ('swap.waiting', 'schedule.unfilled', 'availability.missing')
  and n.audience_perm is null;

create index notifications_audience_perm_idx
  on public.notifications (audience_perm)
  where audience_perm is not null;

comment on column public.notifications.audience_role is
  'The lowest role that may read the line, for a line without audience_perm. For one with it, the lowest role that holds that permission by default: nothing decides by it.';
comment on column public.notifications.audience_perm is
  'The permission whoever reads the line holds (private.holds_perm), when it is for those who hold one rather than for a rank and up: swap.waiting and availability.missing are for those who build the schedule (schedule.edit), schedule.unfilled for those who publish it (schedule.publish). Written only to them (private.notify''s holders_of), read only while they hold it, and its push skipped once they don''t (public.claim_due_pushes).';

-- The active members of the business who hold `perm_key`
-- (private.holds_perm), as private.members_in gives those in some roles.
create function private.members_holding(business uuid, perm_key text)
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
    and private.holds_perm(business, m.user_id, perm_key)
$$;

-- 20261110000300_payroll_access.sql's, with one more argument last,
-- `holders_of`: a line for those who hold that permission goes to the
-- recipients who hold it, whatever their rank, and says so
-- (notifications.audience_perm, kept as a line about the same thing comes
-- back); without it, to those at `audience` and up, as before. A new
-- argument makes a new signature, so the old one is dropped first; every
-- call passes fewer arguments, by position or by name, and stays as it was.
drop function private.notify(
  uuid, uuid[], text, jsonb, uuid, public.module_key, public.member_role, text,
  boolean, timestamptz, timestamptz, uuid[]
);

create function private.notify(
  business uuid,
  recipients uuid[],
  what text,
  facts jsonb default '{}'::jsonb,
  actor uuid default null,
  about public.module_key default null,
  audience public.member_role default 'worker',
  dedupe text default null,
  realert boolean default true,
  push_until timestamptz default null,
  at_time timestamptz default now(),
  leave_out uuid[] default '{}'::uuid[],
  holders_of text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  push_at timestamptz;
  written integer := 0;
begin
  if not private.module_enabled(business, 'notifications') then
    return 0;
  end if;

  for person in
    select distinct m.user_id
    from public.memberships m
    where m.business_id = business
      and m.active
      and m.user_id = any (coalesce(recipients, '{}'::uuid[]))
      and m.user_id is distinct from actor
      and m.user_id <> all (coalesce(array_remove(leave_out, null), '{}'::uuid[]))
      and (
        case
          when holders_of is null
            then private.role_rank(m.role) >= private.role_rank(audience)
          else private.holds_perm(business, m.user_id, holders_of)
        end
      )
      and (about is null or about not in ('scheduling', 'lists')
        or private.is_staff_role(m.role))
  loop
    push_at := private.push_plan(business, person, what, at_time);

    insert into public.notifications (
      business_id, user_id, kind, source_module, audience_role, audience_perm,
      params, actor_id, dedupe_key, created_at, push_state, push_after,
      push_before
    )
    values (
      business, person, what, about, audience, holders_of,
      coalesce(facts, '{}'::jsonb),
      actor, dedupe, at_time,
      case when push_at is null then 'none' else 'queued' end, push_at, push_until
    )
    on conflict (user_id, business_id, dedupe_key) where dedupe_key is not null
    do update set
      kind = excluded.kind,
      params = excluded.params,
      actor_id = excluded.actor_id,
      source_module = excluded.source_module,
      audience_role = excluded.audience_role,
      audience_perm = excluded.audience_perm,
      created_at = excluded.created_at,
      read_at = null,
      resolved_at = null,
      push_state = excluded.push_state,
      push_after = excluded.push_after,
      push_before = excluded.push_before,
      push_attempts = 0,
      pushed_at = null
    where realert;

    if found then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

-- 20261109000450_notifications.sql's read: a line for those who hold a
-- permission is read while its reader holds it (private.has_perm), and every
-- other line, as before, while its reader is at its rank or above; the
-- modules on, as before.
alter policy "people read their own notifications" on public.notifications
  using (
    user_id = (select auth.uid())
    and (
      case
        when audience_perm is null then private.has_role(business_id, audience_role)
        else private.has_perm(business_id, audience_perm)
      end
    )
    and private.module_enabled(business_id, 'notifications')
    and (source_module is null or private.module_enabled(business_id, source_module))
  );

-- 20261115000400_running_week_notices.sql's, the same, with a taken swap
-- told to those who build the schedule (private.members_holding,
-- holders_of), who decide it, rather than to owners and managers: all but
-- its asker when they don't publish, who doesn't decide their own
-- (public.decide_shift_swap). The clock's lines (R4) and someone joining
-- (R6) are as they were. Its callers (the log's triggers) are unchanged.
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
      -- To whoever decides it: those who build the schedule, but its asker
      -- when they don't publish it, who doesn't decide their own (the taker
      -- did this, and is left out as its actor).
      perform private.notify(
        b, private.members_holding(b, 'schedule.edit'::text),
        'swap.waiting',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'from', w.requested_by,
          'to', w.taken_by
        ),
        entry.actor_id, 'scheduling', 'manager', 'swap.approval:' || w.id,
        leave_out => case
          when private.publishes_schedule(b, w.requested_by) then '{}'::uuid[]
          else array[w.requested_by]
        end,
        holders_of => 'schedule.edit'::text
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

-- 20261115000400_running_week_notices.sql's, the same, with the shifts left
-- short told to those who publish the schedule (private.publishes_schedule,
-- holders_of schedule.publish) rather than to owners and managers. Only a
-- published week's shifts are ever left short here, and a published week
-- changes only by being published again, so someone who builds without
-- publishing could do nothing about the line. Its caller
-- (private.notify_team_from_log) is unchanged.
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
        -- To those who publish the schedule, who fill them.
        perform private.notify(
          b,
          array(
            select m.user_id from public.memberships m
            where m.business_id = b and m.active
              and private.publishes_schedule(b, m.user_id)
          ),
          'schedule.unfilled'::text,
          jsonb_build_object(
            'week', week_row.week_key,
            'startsOn', week_row.first_day,
            'count', gaps
          ),
          entry.actor_id, 'scheduling'::public.module_key, 'manager'::public.member_role,
          'schedule.unfilled:' || week_row.week_key,
          at_time => moment,
          holders_of => 'schedule.publish'::text
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

-- 20261112000200_reminders.sql's, the same, with who hasn't sent
-- availability told to those who build the schedule
-- (private.members_holding, holders_of) rather than to owners and managers.
-- Who owes it (private.availability_missing: the staff but owners) is as it
-- was, and so is the clock's overdue line (R4). Its caller
-- (private.run_reminders) is unchanged.
create or replace function private.run_business_reminders(business uuid, at_time timestamptz)
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
          -- To those who build the schedule from the answers.
          fresh := private.without_line(
            business,
            private.members_holding(business, 'schedule.edit'::text),
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
              at_time => at_time,
              holders_of => 'schedule.edit'::text
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

-- 20261112000100_notification_preferences.sql's, the same, with one more
-- line it stops: one for those who hold a permission its reader no longer
-- holds (critique 9), as the read policy now hides it, a push going again
-- after a failure included. No caller in the database; the push route calls
-- it with the secret key.
create or replace function public.claim_due_pushes(
  max_rows integer default 200,
  at_time timestamptz default now()
)
returns table (
  delivery uuid,
  notification uuid,
  what text,
  valid_until timestamptz,
  device uuid,
  push_endpoint text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stopped uuid[];
  due uuid[];
begin
  update public.push_deliveries d
  set state = 'queued', next_at = at_time
  where d.state = 'sending' and d.claimed_at < at_time - interval '5 minutes';

  update public.notifications n
  set push_state = 'skipped'
  where n.push_state = 'queued'
    and n.push_after <= at_time
    and (
      n.read_at is not null
      or n.push_before <= at_time
      or not private.push_business_ok(n.user_id, n.business_id)
      or not exists (
        select 1 from public.push_subscriptions s where s.user_id = n.user_id
      )
      or private.push_kept_off(n.user_id, n.kind)
      or (
        n.audience_perm is not null
        and not private.holds_perm(n.business_id, n.user_id, n.audience_perm)
      )
    );

  with ended as (
    update public.push_deliveries d
    set state = 'skipped'
    from public.notifications n
    where d.notification_id = n.id
      and d.state = 'queued'
      and (
        n.read_at is not null
        or n.push_before <= at_time
        or not private.push_business_ok(n.user_id, n.business_id)
        or private.push_kept_off(n.user_id, n.kind)
        or (
          n.audience_perm is not null
          and not private.holds_perm(n.business_id, n.user_id, n.audience_perm)
        )
      )
    returning d.notification_id
  )
  select coalesce(array_agg(distinct e.notification_id), '{}'::uuid[])
  into stopped
  from ended e;
  perform private.settle_pushes(stopped);

  select coalesce(array_agg(q.id), '{}'::uuid[])
  into due
  from (
    select n.id
    from public.notifications n
    where n.push_state = 'queued' and n.push_after <= at_time
    order by n.push_after
    limit max_rows
    for update skip locked
  ) q;

  if cardinality(due) > 0 then
    -- A line told again starts over on every device.
    delete from public.push_deliveries d where d.notification_id = any (due);
    update public.notifications n
    set push_state = 'sending',
      push_attempts = n.push_attempts + 1,
      pushed_at = at_time
    where n.id = any (due);
    insert into public.push_deliveries (notification_id, device_id, next_at)
    select n.id, s.id, at_time
    from public.notifications n
    join public.push_subscriptions s on s.user_id = n.user_id
    where n.id = any (due);
  end if;

  return query
  with claimed as (
    update public.push_deliveries d
    set state = 'sending', attempts = d.attempts + 1, claimed_at = at_time
    where d.id in (
      select q.id
      from public.push_deliveries q
      join public.notifications l on l.id = q.notification_id
      where q.state = 'queued'
        and q.next_at <= at_time
        and not private.push_held(l.user_id, l.kind, at_time)
      order by q.next_at
      limit max_rows
      for update of q skip locked
    )
    returning d.id, d.notification_id, d.device_id
  )
  select c.id, c.notification_id, n.kind, n.push_before, c.device_id, s.endpoint
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.push_subscriptions s on s.id = c.device_id;
end;
$$;

------------------------------------------------------------------------------
-- 4. Who gives a role

-- Whether role `r` holds in the business, by its role alone
-- (private.role_holds), a key owners switch per role (settable) that
-- `person` doesn't hold (private.holds_perm): giving someone that role would
-- give them what `person` may not do. Only owners and the team change who
-- holds a permission (Q5), so a manager gives no such role. By default
-- managers hold all that workers do, so it is never so until an owner sets
-- workers above managers. Keys an owner gives (pay) are not settable and wait
-- for the team's phase (R6, critique 17).
create function private.role_holds_beyond(
  business uuid,
  r public.member_role,
  person uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.permission_keys k
    where k.settable
      and private.role_holds(business, r, k.key)
      and not private.holds_perm(business, person, k.key)
  )
$$;

-- 20261114000100_team_changes.sql's, the same, with a line for those who
-- hold a permission settled when the new role doesn't hold it (its rank
-- says nothing of it any more), as a line for a rank above the new role is;
-- and a manager refused (42501, hint 'held') a new role that holds by role a
-- key owners switch which the manager doesn't hold
-- (private.role_holds_beyond), once the same role has written nothing. No
-- caller in the database; the app calls it with the secret key.
create or replace function public.set_member_role(
  actor uuid,
  business uuid,
  person uuid,
  new_role public.member_role,
  seen_role public.member_role default null,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  target public.memberships%rowtype;
  leaving boolean;
  joining boolean;
  dropped_perms text[];
  cleared jsonb := '{}'::jsonb;
begin
  perform 1 from public.businesses b where b.id = business for no key update;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or actor_role not in ('owner', 'manager') then
    raise exception 'Not allowed to change this role' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Not yourself' using errcode = '22023';
  end if;

  if new_role is null then
    raise exception 'Say the new role' using errcode = '22023';
  end if;

  select * into target
  from public.memberships m
  where m.business_id = business and m.user_id = person and m.active
  for update;
  if not found then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if not private.gives_role(actor_role, target.role) then
    raise exception 'Only an owner changes an owner''s or an accountant''s role'
      using errcode = '42501';
  end if;

  if seen_role is not null and seen_role <> target.role then
    raise exception 'The role changed meanwhile' using errcode = '40001';
  end if;

  if not private.gives_role(actor_role, new_role) then
    raise exception 'Only an owner makes someone an owner or an accountant'
      using errcode = '42501';
  end if;

  if new_role = target.role then
    return private.left_counts('{}'::jsonb) || jsonb_build_object('changed', false);
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner' and private.role_holds_beyond(business, new_role, actor) then
    raise exception 'Only an owner gives a role that holds what you don''t'
      using errcode = '42501', hint = 'held';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business keeps its people' using errcode = '55000', hint = 'demo';
  end if;

  if target.role = 'owner' and not exists (
    select 1
    from public.memberships m
    where m.business_id = business and m.active and m.role = 'owner'
      and m.user_id <> person
  ) then
    raise exception 'The business keeps one owner' using errcode = '23P01';
  end if;

  leaving := private.is_staff_role(target.role) and not private.is_staff_role(new_role);
  joining := not private.is_staff_role(target.role) and private.is_staff_role(new_role);

  if leaving and exists (
    select 1 from public.time_entries e
    where e.business_id = business and e.user_id = person and e.clock_out is null
  ) then
    raise exception 'Clocked in now' using errcode = '55000', hint = 'clocked_in';
  end if;

  if joining and exists (
    select 1
    from public.memberships m
    where m.user_id = person
      and m.active
      and m.business_id <> business
      and private.is_staff_role(m.role)
  ) then
    raise exception 'Already in another business''s team' using errcode = '23505';
  end if;

  -- An owner holds everything and an accountant what accountants hold: their
  -- personal permissions would only come back on a later change.
  dropped_perms := case
    when new_role in ('owner', 'accountant') then target.perms
    else '{}'::text[]
  end;

  begin
    update public.memberships m
    set role = new_role,
      perms = case
        when new_role in ('owner', 'accountant') then '{}'::text[]
        else m.perms
      end
    where m.id = target.id;
  exception when unique_violation then
    -- Only memberships_one_staff_idx can say so here: another staff place was
    -- taken in the meantime.
    raise exception 'Already in another business''s team' using errcode = '23505';
  end;

  if leaving then
    cleared := private.leave_staff(business, person, at_time);
  end if;

  -- Lines for a role above the new one, or for those who hold a permission
  -- the new role doesn't, and, off the staff, the staff's lines about the
  -- schedule, lists and chat: nothing waits on them now.
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.user_id = person
    and (n.read_at is null or n.push_state = 'queued')
    and (
      (
        case
          when n.audience_perm is null
            then private.role_rank(n.audience_role) > private.role_rank(new_role)
          else not private.holds_perm(business, person, n.audience_perm)
        end
      )
      or (
        leaving
        and n.source_module in (
          'scheduling'::public.module_key, 'lists'::public.module_key,
          'chat'::public.module_key
        )
      )
    );

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'member.role',
    jsonb_build_object(
      'person', person,
      'role', new_role,
      'was', target.role,
      'perms', to_jsonb(dropped_perms),
      'at', at_time
    ) || cleared
  );

  return private.left_counts(cleared) || jsonb_build_object('changed', true);
end;
$$;

-- 20261110000300_payroll_access.sql's, the same, with a manager refused
-- (42501) an invite to a role that holds by role a key owners switch which
-- the manager doesn't hold (private.role_holds_beyond), a new invite or a
-- change to an open one alike. No caller in the database; the app calls it
-- with the secret key.
create or replace function public.team_invite(
  actor uuid,
  business uuid,
  invite_phone text,
  invite_name text,
  invite_role public.member_role,
  new_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  existing public.invites%rowtype;
  invite_id uuid;
begin
  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or actor_role not in ('owner', 'manager')
    or invite_role is null
    or (invite_role = 'owner' and actor_role <> 'owner') then
    raise exception 'Not allowed to invite this role' using errcode = '42501';
  end if;

  if invite_role = 'accountant' and actor_role <> 'owner' then
    raise exception 'Only an owner invites an accountant' using errcode = '42501';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner' and private.role_holds_beyond(business, invite_role, actor) then
    raise exception 'Only an owner invites to a role that holds what you don''t'
      using errcode = '42501', hint = 'held';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
  end if;

  if new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token hash must be 64 hex digits' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.business_id = business and m.active and p.phone = invite_phone
  ) then
    raise exception 'Already in the team' using errcode = '23505';
  end if;

  select * into existing
  from public.invites i
  where i.business_id = business and i.phone = invite_phone
    and i.claimed_at is null
  for update;

  if existing.id is not null then
    if existing.role in ('owner', 'accountant') and actor_role <> 'owner' then
      raise exception 'Not allowed to change this invite' using errcode = '42501';
    end if;
    update public.invites
    set token_hash = new_token_hash,
      role = invite_role,
      full_name = coalesce(nullif(btrim(invite_name), ''), full_name),
      invited_by = actor,
      expires_at = now() + interval '14 days'
    where id = existing.id;
    invite_id := existing.id;
  else
    insert into public.invites (
      business_id, phone, role, full_name, token_hash, invited_by
    )
    values (
      business, invite_phone, invite_role, nullif(btrim(invite_name), ''),
      new_token_hash, actor
    )
    returning id into invite_id;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor,
    case when existing.id is null then 'invite.create' else 'invite.send' end,
    jsonb_build_object('invite', invite_id, 'role', invite_role)
  );

  return invite_id;
end;
$$;

-- 20261110000300_payroll_access.sql's, the same, with a manager refused
-- (42501) a fresh link for an invite to such a role, whoever made it. No
-- caller in the database; the app calls it with the secret key.
create or replace function public.team_invite_link(
  actor uuid,
  invite uuid,
  new_token_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  actor_role public.member_role;
begin
  if new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token hash must be 64 hex digits' using errcode = '22023';
  end if;

  select * into inv
  from public.invites i
  where i.id = invite and i.claimed_at is null
  for update;

  if inv.id is null then
    raise exception 'No open invite' using errcode = 'P0002';
  end if;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = inv.business_id and m.user_id = actor and m.active;

  if actor_role is null or actor_role not in ('owner', 'manager')
    or (inv.role in ('owner', 'accountant') and actor_role <> 'owner') then
    raise exception 'Not allowed to send this invite' using errcode = '42501';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner'
    and private.role_holds_beyond(inv.business_id, inv.role, actor)
  then
    raise exception 'Only an owner invites to a role that holds what you don''t'
      using errcode = '42501', hint = 'held';
  end if;

  if private.closed_to_invites(inv.business_id) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
  end if;

  update public.invites
  set token_hash = new_token_hash,
    invited_by = actor,
    expires_at = now() + interval '14 days'
  where id = inv.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    inv.business_id, actor, 'invite.send',
    jsonb_build_object('invite', inv.id)
  );

  return inv.phone;
end;
$$;

------------------------------------------------------------------------------
-- 5. The area opens

-- Every check in scheduling reads its two permissions now: owners and the
-- team switch them per role (public.set_role_permission).
update public.permission_keys k
set settable = true
where k.key in ('schedule.edit', 'schedule.publish');

------------------------------------------------------------------------------
-- Who may call what

-- The new helpers run inside the functions and policies above, as their
-- owner, but the policies' one, which runs as the reader.
revoke execute on function private.publishes_schedule(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.members_holding(uuid, text)
  from public, anon, authenticated;
revoke execute on function private.role_holds_beyond(uuid, public.member_role, uuid)
  from public, anon, authenticated;
revoke execute on function private.businesses_holding(text) from public, anon;
grant execute on function private.businesses_holding(text) to authenticated;

-- The new signature: nobody but the database's own.
revoke execute on function private.notify(
  uuid, uuid[], text, jsonb, uuid, public.module_key, public.member_role, text,
  boolean, timestamptz, timestamptz, uuid[], text
) from public, anon, authenticated;

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the writes granted to the secret key) again all the same.
revoke execute on function private.builds_schedule(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_week_schedule(uuid, uuid, jsonb, jsonb, timestamptz, jsonb)
  to service_role;
revoke execute on function public.decide_shift_swap(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.decide_shift_swap(uuid, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function private.renew_demo_schedule(uuid)
  from public, anon, authenticated;
revoke execute on function private.notify_for(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notify_for_team(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.run_business_reminders(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.claim_due_pushes(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_due_pushes(integer, timestamptz) to service_role;
revoke execute on function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz
) from public, anon, authenticated;
grant execute on function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz
) to service_role;
revoke execute on function
  public.team_invite(uuid, uuid, text, text, public.member_role, text)
  from public, anon, authenticated;
grant execute on function
  public.team_invite(uuid, uuid, text, text, public.member_role, text)
  to service_role;
revoke execute on function public.team_invite_link(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.team_invite_link(uuid, uuid, text)
  to service_role;
