-- Roles and permissions by module, R4: the time clock by its permission (the
-- roles plan; Orel's answers of 15 November 2026, issue #1). Who edits the
-- clock is whoever holds clock.edit, where until now it was owners and
-- managers by role (and anyone given clock.edit); and owners and the
-- ConceptApp team now switch it per role (permission_keys.settable). Nothing
-- changes for anyone until they do: managers hold it by default, workers
-- don't, owners always do.
--
--   floor       view: every staff member punches in and out, takes breaks,
--               undoes a clock-out and reads their own hours, as before
--               (Q2). Those rules (public.clock_in, clock_out, start_break,
--               end_break, undo_clock_out, and "your own" in the policies
--               below) don't move.
--   editing     private.can_edit_clock is private.holds_perm(…,
--               'clock.edit'): an active member on the staff whose role
--               holds it (the business's row for the role, else its default
--               roles), or who was given it; an owner always. Its callers ask
--               it as before, and none changes: public.issue_punch_code,
--               punch_code_showing, approve_station_pairing and
--               set_clock_station_stopped (the punch-code screen and the
--               stations, 20261108000200_qr_clock.sql),
--               public.confirm_time_entry (20261108000300_sealed.sql),
--               public.add_time_entry and public.correct_time_entry
--               (20261110001000_payroll_months.sql). The demo's correction
--               (private.seed_demo_hours) is made by someone who may correct.
--   owners      what stays the owner's for good is as it was: an owner needs
--               no punch code (private.check_punch's 'owner' proof); hours
--               someone set for themselves, a manager's correction of their
--               own included, are 'self' and only an owner confirms them
--               (public.confirm_time_entry, add_time_entry,
--               correct_time_entry: private.is_active_owner); the punch code
--               and the pay rules are an owner's settings
--               (public.set_module_settings, the management page's phase).
--   reading     the team's hours and breaks and the stations are read by
--               those who edit the clock: a member through
--               private.holds_perm, a view whose role holds clock.edit by
--               role (or is the owner), through private.businesses_holding
--               (20261115000900_roles_scheduling.sql), asked once per query.
--               One's own hours stay one's own, and pay holders and a view as
--               an accountant read every hour as before (clock.payroll,
--               private.viewing_payroll): pay is the owner's switch, and its
--               readers don't change at any level.
--   telling     hours without a code (clock.confirm) and an entry open too
--               long (clock.overdue) go to those who edit the clock
--               (private.members_holding, holders_of clock.edit), whoever
--               they are, as lines for that permission (read only while
--               their reader holds it, pushed only while they do, settled
--               when a change of role takes it away: R3's rules for such a
--               line). Hours someone set for themselves stay with owners, by
--               rank (critique 24). The lines already written are moved to
--               their key, so a manager lowered later stops reading them too.
--   giving      a manager gives nobody a role that holds clock.edit by role
--               while they don't (private.role_holds_beyond, R3's, asks every
--               settable key): it bites only where an owner set workers above
--               managers.
--   the area    clock.edit is settable: the console's roles page (and, with
--               R9, the owner's) switches it per role
--               (public.set_role_permission), every check in the area now
--               reading it. clock.payroll keeps its own switch.
--
-- Left for their own phases: the activity log's clock.* rows (the
-- management page, R7, critique 7: the log by each action's own area), and
-- someone joining (team.joined, in the same notifier) with the team (R6).

------------------------------------------------------------------------------
-- 1. Who edits the clock

-- 20261107000100_time_clock.sql's, by the permission rather than the role:
-- someone holds clock.edit by private.holds_perm (an active owner always; on
-- the staff, by their role's rule for it or by a grant of their own). Its
-- callers are unchanged: public.issue_punch_code, approve_station_pairing,
-- set_clock_station_stopped and punch_code_showing
-- (20261108000200_qr_clock.sql), public.confirm_time_entry
-- (20261108000300_sealed.sql), public.add_time_entry and
-- public.correct_time_entry (20261110001000_payroll_months.sql).
create or replace function private.can_edit_clock(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'clock.edit'::text)
$$;

-- 20261110000400_payroll_screens.sql's, the same, with last month's
-- correction made by someone who may correct (private.holds_perm,
-- clock.edit): its first manager who does, else its owner, as before. Its
-- caller, private.seed_demo_pay (20261110000700_pay_rules.sql's, which the
-- demo's reset calls), is unchanged.
create or replace function private.seed_demo_hours(business uuid, hours_plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  breaks_unpaid boolean;
  last_day date;
  first_day date;
  corrector uuid;
  fixed record;
begin
  if jsonb_typeof(hours_plan) is distinct from 'object' then
    return;
  end if;

  begin
    select b.timezone, coalesce((m.settings ->> 'unpaidBreaks')::boolean, false)
    into tz, breaks_unpaid
    from public.businesses b
    left join public.business_modules m
      on m.business_id = b.id and m.module_key = 'time_clock'
    where b.id = business;
    if tz is null then
      return;
    end if;

    -- The day before this month began, by the business's clock, and the
    -- first of its month.
    last_day := date_trunc('month', now() at time zone tz)::date - 1;
    first_day := date_trunc('month', last_day::timestamp)::date;

    -- Who corrects: someone in the definition who edits the clock
    -- (clock.edit), its first manager who does, else its owner, as before.
    select m.user_id into corrector
    from private.demo_businesses d
    cross join lateral jsonb_array_elements(d.definition -> 'people')
      with ordinality as p (value, ordinality)
    join public.memberships m
      on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
    where d.business_id = business
      and private.holds_perm(business, m.user_id, 'clock.edit'::text)
    order by m.role = 'manager' desc, m.role = 'owner' desc, p.ordinality
    limit 1;

    with days as (
      select g::date as day, extract(dow from g)::integer as weekday
      from generate_series(first_day::timestamp, last_day::timestamp, interval '1 day') as g
    ),
    staff as (
      select m.user_id, m.role, row_number() over (order by p.ordinality) as place
      from private.demo_businesses d
      cross join lateral jsonb_array_elements(d.definition -> 'people')
        with ordinality as p (value, ordinality)
      join public.memberships m
        on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
      where d.business_id = business and m.role in ('manager', 'worker')
    ),
    -- Each case on its day of the month.
    cases as (
      select c.value ->> 'user_id' as user_text,
        c.value ->> 'case' as kind,
        nullif(btrim(coalesce(c.value ->> 'note', '')), '') as note_text,
        case c.value ->> 'case'
          when 'corrected' then (select min(x.day) from days x where x.weekday = 1)
          when 'evening' then (select max(x.day) from days x where x.weekday = 2)
          when 'without_code' then (select min(x.day) + 7 from days x where x.weekday = 3)
          when 'night' then (select max(x.day) from days x where x.weekday = 4)
          when 'friday_late' then (select max(x.day) from days x where x.weekday = 5)
          when 'saturday_night' then (select max(x.day) from days x where x.weekday = 6)
        end as day
      from jsonb_array_elements(
        case when jsonb_typeof(hours_plan -> 'cases') = 'array'
          then hours_plan -> 'cases' else '[]'::jsonb end
      ) as c (value)
    ),
    -- The usual days, without the ones a case takes instead.
    usual as (
      select s.user_id, x.day,
        case when x.weekday = 5 then '08:00'::time else '09:00'::time end as starts,
        case when x.weekday = 5 then '14:00'::time else '17:00'::time end as ends
      from staff s
      cross join days x
      where (
          (x.weekday between 0 and 4 and x.weekday <> (s.place - 1) % 5)
          or (x.weekday = 5 and s.role = 'worker'
            and coalesce((hours_plan ->> 'fridays')::boolean, false))
        )
        and not exists (
          select 1 from cases c
          where c.user_text = s.user_id::text and c.day = x.day
        )
    ),
    shifts as (
      select u.user_id, u.day, u.starts, u.ends,
        null::text as kind, null::text as note_text
      from usual u
      union all
      select s.user_id, c.day,
        case c.kind
          when 'evening' then '18:00'::time
          when 'night' then '22:00'::time
          when 'friday_late' then '12:00'::time
          when 'saturday_night' then '20:00'::time
          else '09:00'::time
        end,
        case c.kind
          when 'evening' then '22:30'::time
          when 'night' then '06:30'::time
          when 'friday_late' then '21:00'::time
          when 'saturday_night' then '01:00'::time
          else '17:00'::time
        end,
        c.kind, c.note_text
      from cases c
      join staff s on s.user_id::text = c.user_text
      where c.day between first_day and last_day
        and (c.kind <> 'corrected' or corrector is not null)
    )
    insert into public.time_entries (
      business_id, user_id, clock_in, clock_out, source, in_proof, out_proof,
      note, edited_by, edited_at
    )
    select business, s.user_id,
      (s.day + s.starts) at time zone tz,
      (case when s.ends <= s.starts then s.day + 1 else s.day end + s.ends) at time zone tz,
      'punch'::public.time_entry_source,
      case when s.kind = 'without_code' then 'none' else 'off' end,
      case when s.kind = 'corrected' then 'manager' else 'off' end,
      case when s.kind = 'corrected' then coalesce(s.note_text, '-') end,
      case when s.kind = 'corrected' then corrector end,
      case when s.kind = 'corrected' then (s.day + 1 + '10:00'::time) at time zone tz end
    from shifts s
    order by s.day, s.user_id;

    -- The usual weekday's break.
    insert into public.time_breaks (entry_id, business_id, user_id, started_at, ended_at, unpaid)
    select e.id, business, e.user_id,
      ((e.clock_in at time zone tz)::date + '13:00'::time) at time zone tz,
      ((e.clock_in at time zone tz)::date + '13:30'::time) at time zone tz,
      breaks_unpaid
    from public.time_entries e
    where e.business_id = business
      and e.clock_in >= (first_day::timestamp at time zone tz)
      and e.clock_in < ((last_day + 1)::timestamp at time zone tz)
      and (e.clock_in at time zone tz)::time = '09:00'::time
      and (e.clock_out at time zone tz)::time = '17:00'::time;

    -- The correction's row, on the morning it was made, as correct_time_entry
    -- writes it.
    for fixed in
      select e.id, e.user_id, e.clock_in, e.clock_out, e.note, e.edited_by, e.edited_at
      from public.time_entries e
      where e.business_id = business
        and e.edited_by is not null
        and e.clock_in >= (first_day::timestamp at time zone tz)
        and e.clock_in < ((last_day + 1)::timestamp at time zone tz)
    loop
      insert into public.audit_log (business_id, actor_id, action, details, created_at)
      values (
        business, fixed.edited_by, 'clock.correct',
        jsonb_build_object(
          'entry', fixed.id, 'person', fixed.user_id,
          'from', jsonb_build_object('clock_in', fixed.clock_in, 'clock_out', null),
          'to', jsonb_build_object('clock_in', fixed.clock_in, 'clock_out', fixed.clock_out),
          'proof', jsonb_build_object('in', 'off', 'out', 'manager'),
          'note', fixed.note
        ),
        fixed.edited_at
      );
    end loop;
  exception when others then
    raise warning 'The demo''s hours were not written: %', sqlerrm;
  end;
end;
$$;

------------------------------------------------------------------------------
-- 2. Who reads the team's hours, breaks and stations

-- 20261110000300_payroll_access.sql's (one's own; managers, holders of
-- clock.edit and a view as a manager or owner; pay holders and a view as an
-- accountant): the business's hours for those who edit the clock, members and
-- views alike (private.businesses_holding, asked once per query), where the
-- manager's rank, a view's and clock.edit were three branches. One's own and
-- the two pay branches are exactly as they were. Its old name is longer than
-- a name's 63 bytes, so Postgres keeps it cut, and asked for by its whole
-- text, it is cut the same way; the new one fits whole.
alter policy "people read their own entries, managers and pay holders the business's"
  on public.time_entries
  rename to "people read their own entries, editors and pay holders all";
alter policy "people read their own entries, editors and pay holders all"
  on public.time_entries
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or business_id in (select private.businesses_holding('clock.edit'))
      or private.has_perm(business_id, 'clock.payroll')
      or private.viewing_payroll(business_id)
    )
  );

-- 20261110000300_payroll_access.sql's, the same as the entries' above.
alter policy "breaks are read like the entries they belong to" on public.time_breaks
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or business_id in (select private.businesses_holding('clock.edit'))
      or private.has_perm(business_id, 'clock.payroll')
      or private.viewing_payroll(business_id)
    )
  );

-- 20261108000200_qr_clock.sql's (managers, holders of clock.edit and a view
-- as a manager or owner): the stations, for those who edit the clock, who
-- pair and stop them. Their token columns stay unreadable (its column grant).
alter policy "managers read the business's stations" on public.clock_stations
  rename to "the clock's editors read the business's stations";
alter policy "the clock's editors read the business's stations" on public.clock_stations
  using (
    private.module_enabled(business_id, 'time_clock')
    and business_id in (select private.businesses_holding('clock.edit'))
  );

------------------------------------------------------------------------------
-- 3. Who is told

-- The lines already written of the two kinds move to their key, as
-- private.notify_for and private.run_business_reminders write them from now
-- on (below): read and pushed only while their reader holds it, so a
-- manager lowered after this migrates stops reading them too. Hours someone
-- set for themselves (audience_role 'owner') stay an owner's line, by rank.
-- Every other one was written to owners and managers, who hold the key by
-- default: nobody's inbox changes today. No trigger reads an update of a
-- line.
update public.notifications n
set audience_perm = 'clock.edit'
where (
    n.kind = 'clock.overdue'
    or (n.kind = 'clock.confirm' and n.audience_role = 'manager')
  )
  and n.audience_perm is null;

comment on column public.notifications.audience_perm is
  'The permission whoever reads the line holds (private.holds_perm), when it is for those who hold one rather than for a rank and up: swap.waiting and availability.missing are for those who build the schedule (schedule.edit), schedule.unfilled for those who publish it (schedule.publish), clock.confirm (but hours someone set for themselves, an owner''s line by rank) and clock.overdue for those who edit the clock (clock.edit). Written only to them (private.notify''s holders_of), read only while they hold it, and its push skipped once they don''t (public.claim_due_pushes).';

-- 20261115000900_roles_scheduling.sql's, the same, with hours that wait for
-- confirmation told to those who edit the clock (private.members_holding,
-- holders_of clock.edit), who confirm them, rather than to owners and
-- managers; hours someone set for themselves stay with owners, by rank, as
-- only an owner confirms them (critique 24). Someone joining (R6) is as it
-- was. Its callers (the log's triggers) are unchanged.
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
  for_perm text;
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
        -- Hours someone set for themselves stay with owners, by rank (critique
        -- 24): an owner confirms them. The rest go to those who edit the
        -- clock (private.members_holding, holders_of clock.edit), whatever
        -- their role, as a line for that permission; 'manager' stays its
        -- audience_role, the lowest role that holds it by default.
        for_role := (case proof when 'self' then 'owner' else 'manager' end)::public.member_role;
        for_perm := case proof when 'self' then null::text else 'clock.edit'::text end;
        recipients := case proof
          when 'self' then private.members_in(b, '{owner}'::public.member_role[])
          else private.members_holding(b, 'clock.edit'::text)
        end;
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
        -- Anyone who may no longer confirm them (one who edits the clock, once
        -- the hours rest on someone's own word, or who no longer edits it) is
        -- done with them.
        perform private.resolve_notifications(b, thing, still_for => recipients);
        if entry.action = 'clock.undo_out' then
          -- The departure is gone and the arrival still waits: the lines say
          -- so without coming back unread, and anyone new to them gets one.
          update public.notifications n
          set params = facts, audience_role = for_role, audience_perm = for_perm
          where n.business_id = b and n.dedupe_key = thing and n.resolved_at is null;
          perform private.notify(
            b, recipients, 'clock.confirm', facts, entry.actor_id, 'time_clock',
            for_role, thing,
            realert => false,
            leave_out => array[e.user_id],
            holders_of => for_perm
          );
        elsif entry.action <> 'clock.out' or departure_open then
          -- A clock-out tells again only when the departure itself waits.
          perform private.notify(
            b, recipients, 'clock.confirm', facts,
            -- Whoever did it: the person, or the manager who corrected it.
            entry.actor_id, 'time_clock', for_role, thing,
            -- Never to the person whose hours they are.
            leave_out => array[e.user_id],
            holders_of => for_perm
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

-- 20261115000900_roles_scheduling.sql's, the same, with an entry open too
-- long told to those who edit the clock (private.members_holding,
-- holders_of clock.edit), who close it, rather than to owners and managers.
-- Its caller (private.run_reminders) is unchanged.
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

  -- 3. Open longer than an entry can be: only someone who edits the clock
  --    (clock.edit) closes it now, so the person's own reminder is done
  --    with. Never for one left open more than 90 days: its line, once read,
  --    is cleaned after 90 days (private.clean_notifications) and would
  --    otherwise come back as new.
  for late_entry in
    select e.id, e.user_id, e.clock_in
    from public.time_entries e
    where e.business_id = business
      and e.clock_out is null
      and e.clock_in < at_time - rules.open_for
      and e.clock_in >= at_time - interval '90 days'
    order by e.clock_in, e.id
  loop
    -- To those who edit the clock, whatever their role.
    fresh := private.without_line(
      business,
      private.members_holding(business, 'clock.edit'::text),
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
        at_time => at_time,
        holders_of => 'clock.edit'::text
      );
    end if;
    perform private.resolve_notifications(
      business, 'clock.open:' || late_entry.id::text, at_time
    );
  end loop;

  return written;
end;
$$;

------------------------------------------------------------------------------
-- 4. The area opens

-- Every check in the time clock reads clock.edit now: owners and the team
-- switch it per role (public.set_role_permission). Pay (clock.payroll) keeps
-- its own switch, an owner's.
update public.permission_keys k
set settable = true
where k.key = 'clock.edit';

------------------------------------------------------------------------------
-- Who may call what

-- Replaced in place: the same signatures, so their grants stay; revoked
-- again all the same.
revoke execute on function private.can_edit_clock(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.seed_demo_hours(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.notify_for(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.run_business_reminders(uuid, timestamptz)
  from public, anon, authenticated;
