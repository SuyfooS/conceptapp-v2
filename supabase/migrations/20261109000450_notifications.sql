-- Notifications, part 1 (Orel, 8 and 9 November 2026, issue #1): what happened
-- that a person should know, in the app. The phone (Web Push), each person's
-- choices and the reminders come in the next migrations.
--
--   module       `notifications` is on for every template and every business.
--                It has no tab, so it fits every tab bar. Switching it off (the
--                team's switch in the console) stops new lines and hides the
--                old ones.
--   one row      per person, per business, per thing (`dedupe_key`): a second
--                line about the same thing replaces the first and comes back
--                unread, unless it is a reminder.
--   settled      once what a line asks for is handled (a request decided,
--                hours confirmed), its lines are read and `resolved_at` for
--                everyone, so they stop saying something waits.
--   who reads    the person alone, while they are an active member at
--                `audience_role` or above and the module the line is about is
--                on. A view session reads nobody's lines: the team is not a
--                member.
--   writes       private.notify, from a trigger on the audit log, so a line is
--                written with what it is about, in the same transaction, or not
--                at all. It never blocks that write. People mark their own lines
--                read through public.read_notifications (secret key, for
--                `actor`, like every other write).
--   demo         demo businesses get lines in the app like any other. Nothing
--                reaches a phone yet; when it does, never from a demo business.
--
-- What each audit action tells, and whom, is in private.notify_for below; the
-- app reads each kind of line through @domain/notifications.
--
-- It replaces no function that the profile's migrations replace.

------------------------------------------------------------------------------
-- Every template and business

-- A template keeps the settings it had for the module (the restaurant's and the
-- café's), and the others get none, which @domain/templates requires.
update public.templates t
set version = t.version + 1,
  definition = jsonb_set(
    t.definition, '{modules,notifications}',
    jsonb_build_object(
      'enabled', true,
      'settings', coalesce(t.definition #> '{modules,notifications,settings}', '{}'::jsonb)
    )
  )
where t.definition ? 'modules';

insert into public.business_modules (business_id, module_key, enabled)
select b.id, 'notifications', true from public.businesses b
on conflict (business_id, module_key) do update set enabled = true;

------------------------------------------------------------------------------
-- The lines

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  -- The module the line is about: switching it off hides the line.
  source_module public.module_key,
  -- The lowest role that may read it: a line about hours is for managers.
  audience_role public.member_role not null default 'worker',
  -- Ids, and the small facts the line shows (a shift's day, name and times, a
  -- count of one's own shifts), all of which its reader may see in the app.
  -- Never notes, message bodies, phone numbers or hours totals.
  params jsonb not null default '{}'::jsonb
    check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 2048),
  actor_id uuid references public.profiles (id) on delete set null,
  dedupe_key text check (char_length(dedupe_key) between 1 and 120),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- When what it asked for was handled, for everyone (a request decided, hours
  -- confirmed), so the line stops saying something waits. A line about the same
  -- thing that comes back is open again.
  resolved_at timestamptz,
  -- On the phone, from the next migration: 'none' until then.
  push_state text not null default 'none'
    check (push_state in ('none', 'queued', 'sending', 'sent', 'skipped', 'failed')),
  push_after timestamptz,
  push_before timestamptz,
  push_attempts smallint not null default 0 check (push_attempts >= 0),
  pushed_at timestamptz,
  check (push_state <> 'queued' or push_after is not null)
);

create unique index notifications_dedupe_idx
  on public.notifications (user_id, business_id, dedupe_key)
  where dedupe_key is not null;
create index notifications_inbox_idx
  on public.notifications (user_id, business_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (user_id, business_id) where read_at is null;
-- A thing handled for everyone (private.resolve_notifications); also the
-- business's foreign key.
create index notifications_business_dedupe_idx
  on public.notifications (business_id, dedupe_key);
create index notifications_push_due_idx
  on public.notifications (push_after) where push_state = 'queued';
create index notifications_actor_id_idx on public.notifications (actor_id);

alter table public.notifications enable row level security;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create policy "people read their own notifications"
  on public.notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    and private.has_role(business_id, audience_role)
    and private.module_enabled(business_id, 'notifications')
    and (source_module is null or private.module_enabled(business_id, source_module))
  );

comment on table public.notifications is
  'What a person should know, per business: written only by private.notify (from the audit log trigger), read by that person alone while the line is still for them.';

------------------------------------------------------------------------------
-- Writing them

-- When the person's phone gets a line, or null for not at all. No phones yet:
-- the next migration replaces this, and never for a demo business.
create function private.push_plan(
  business uuid,
  person uuid,
  what text,
  at_time timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select null::timestamptz
$$;

-- Write one line for each recipient who is an active member at `audience` or
-- above, other than the actor and anyone in `leave_out`. With a dedupe key, a
-- line about the same thing is replaced and comes back unread, unless
-- `realert` is false (a reminder that was already given). Nothing while the
-- module is off. Returns how many lines were written. The parameters are named
-- apart from the table's columns, so no statement here can read one for the
-- other.
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
  leave_out uuid[] default '{}'::uuid[]
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
      and private.role_rank(m.role) >= private.role_rank(audience)
  loop
    push_at := private.push_plan(business, person, what, at_time);

    insert into public.notifications (
      business_id, user_id, kind, source_module, audience_role, params,
      actor_id, dedupe_key, created_at, push_state, push_after, push_before
    )
    values (
      business, person, what, about, audience, coalesce(facts, '{}'::jsonb),
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

-- A thing was handled (a request decided, hours confirmed): its lines are read
-- and settled for everyone, and a push not sent yet stays unsent. With
-- `still_for`, only the lines of anyone not in it: those it is no longer theirs
-- to act on, while it still waits for the others.
create function private.resolve_notifications(
  business uuid,
  dedupe text,
  at_time timestamptz default now(),
  still_for uuid[] default '{}'::uuid[]
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    resolved_at = at_time,
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.dedupe_key = dedupe
    and n.resolved_at is null
    and n.user_id <> all (coalesce(still_for, '{}'::uuid[]));
$$;

-- The business's active members in these roles.
create function private.members_in(business uuid, roles public.member_role[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[])
  from public.memberships m
  where m.business_id = business and m.active and m.role = any (roles)
$$;

-- Whether `person` may take `shift` from someone: private.check_can_take,
-- without raising.
create function private.can_take(shift uuid, person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_can_take(shift, person);
  return true;
exception when others then
  return false;
end;
$$;

-- What a line shows of a shift: what every member reads in the published week.
create function private.shift_brief(shift uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'day', s.day,
    'name', s.name,
    'start', left(s.starts_at::text, 5),
    'end', left(s.ends_at::text, 5)
  )
  from public.schedule_shifts s
  where s.id = shift
$$;

-- How many shifts `person` has in the week.
create function private.own_shift_count(person uuid, week uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.shift_assignments a
  join public.schedule_shifts s on s.id = a.shift_id
  where s.week_id = week and a.user_id = person
$$;

-- Each person's shifts in the week as one line of text, by person, to tell
-- whose shifts a republish changed.
create function private.week_people(week uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(p.user_id, p.shifts), '{}'::jsonb)
  from (
    select a.user_id,
      string_agg(
        concat_ws('|', s.day, s.starts_at, s.ends_at, s.name, a.position_key),
        ',' order by s.day, s.starts_at, s.name
      ) as shifts
    from public.shift_assignments a
    join public.schedule_shifts s on s.id = a.shift_id
    where s.week_id = week
    group by a.user_id
  ) p
$$;

------------------------------------------------------------------------------
-- Publishing tells whose shifts changed

-- Same rules and the same result as before (20261107000700_activity_log.sql),
-- and the log row says two more things: whose shifts changed (`changed`, user
-- ids) and the waiting requests the old shifts took with them
-- (`removed_swaps`), so their people can be told. `swaps_removed` stays, for
-- the activity log.
create or replace function public.publish_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift_count int;
  w public.schedule_weeks%rowtype;
  swaps_removed int;
  removed_list jsonb;
  before_people jsonb;
  after_people jsonb;
  changed jsonb;
begin
  -- Read before the shifts are replaced: their waiting swap requests go with
  -- them (on delete cascade). Nothing read here is returned, and the rules
  -- below refuse anyone who may not publish, so it tells a stranger nothing.
  -- Locked, so what's logged is what happened: two publishes of the week take
  -- turns, a request for one of its shifts waits (and then finds the shift
  -- gone), and a decision on a waiting request waits until this is done.
  select * into w from public.schedule_weeks where id = week for update;
  perform 1 from public.schedule_shifts s where s.week_id = week for update;
  select count(*) into swaps_removed
  from (
    select 1
    from public.shift_swaps sw
    join public.schedule_shifts s on s.id = sw.shift_id
    where s.week_id = week and sw.status in ('open', 'taken')
    for update of sw
  ) waiting;

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
  into removed_list
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where s.week_id = week and sw.status in ('open', 'taken');

  before_people := private.week_people(week);

  shift_count := private.replace_week_schedule(actor, week, shifts);

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

  update public.schedule_weeks
  set schedule_published_at = now()
  where id = week;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    w.business_id, actor, 'schedule.publish',
    jsonb_build_object(
      'week', week,
      'starts_on', w.starts_on,
      'shifts', shift_count,
      'first', w.schedule_published_at is null,
      'swaps_removed', swaps_removed,
      'changed', changed,
      'removed_swaps', removed_list
    )
  );

  return shift_count;
end;
$$;

revoke execute on function public.publish_week_schedule(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_week_schedule(uuid, uuid, jsonb)
  to service_role;

------------------------------------------------------------------------------
-- What each log row tells

-- The lines a log row writes, and the things it settles:
--
--   schedule.publish  the first time: everyone but the publisher. Again: those
--                     whose own shifts changed, and the people of each waiting
--                     request it removed.
--   swap.request      colleagues who could take the shift.
--   swap.take         the one who asked, and the owners and managers to approve.
--   swap.cancel       the colleague who took it, if anyone did.
--   swap.approve,     the one who asked and the one who took it.
--   swap.decline
--   clock.*           owners and managers, while hours wait for confirmation
--                     (owners alone for hours someone set for themselves, and a
--                     manager's line is settled when they become so), never
--                     the person whose hours they are. The line tells a time
--                     that waits, and an undone clock-out rewrites it quietly.
--   invite.claim      owners and managers: someone joined.
create function private.notify_for(entry public.audit_log)
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
begin
  case entry.action
  when 'schedule.publish' then
    if coalesce((d ->> 'first')::boolean, false) then
      for person in
        select m.user_id from public.memberships m
        where m.business_id = b and m.active
      loop
        perform private.notify(
          b, array[person], 'schedule.published',
          jsonb_build_object(
            'week', d -> 'week',
            'startsOn', d -> 'starts_on',
            'mine', private.own_shift_count(person, (d ->> 'week')::uuid)
          ),
          entry.actor_id, 'scheduling', 'worker', 'schedule:' || (d ->> 'week')
        );
      end loop;
    else
      for person in
        select c.value::uuid
        from jsonb_array_elements_text(coalesce(d -> 'changed', '[]'::jsonb)) as c (value)
      loop
        perform private.notify(
          b, array[person], 'schedule.changed',
          jsonb_build_object(
            'week', d -> 'week',
            'startsOn', d -> 'starts_on',
            'mine', private.own_shift_count(person, (d ->> 'week')::uuid)
          ),
          entry.actor_id, 'scheduling', 'worker', 'schedule:' || (d ->> 'week')
        );
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

-- The trigger: what happened stands, whatever telling people about it does.
create function private.notify_from_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.notify_for(new);
  exception when others then
    raise warning 'notifications for % (%) failed: %', new.action, new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger audit_log_notifies
  after insert on public.audit_log
  for each row
  when (new.action in (
    'schedule.publish', 'swap.request', 'swap.take', 'swap.cancel',
    'swap.approve', 'swap.decline', 'clock.in', 'clock.out', 'clock.add',
    'clock.correct', 'clock.undo_out', 'clock.confirm', 'invite.claim'
  ))
  execute function private.notify_from_log();

------------------------------------------------------------------------------
-- Reading them

-- `actor` has read some of their lines in the business, or all of them. Only
-- their own; the server calls it for the signed-in person, never while they
-- view a business as someone else. Returns how many it marked.
create function public.read_notifications(
  actor uuid,
  business uuid,
  ids uuid[] default null
)
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.notifications n
    set read_at = now(),
      push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
    where n.user_id = actor
      and n.business_id = business
      and n.read_at is null
      and (ids is null or n.id = any (ids))
    returning 1
  )
  select count(*)::integer from done
$$;

------------------------------------------------------------------------------
-- Who may call what

revoke execute on function private.push_plan(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.notify(
  uuid, uuid[], text, jsonb, uuid, public.module_key, public.member_role, text,
  boolean, timestamptz, timestamptz, uuid[]
) from public, anon, authenticated;
revoke execute on function private.resolve_notifications(uuid, text, timestamptz, uuid[])
  from public, anon, authenticated;
revoke execute on function private.members_in(uuid, public.member_role[])
  from public, anon, authenticated;
revoke execute on function private.can_take(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.shift_brief(uuid)
  from public, anon, authenticated;
revoke execute on function private.own_shift_count(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.week_people(uuid)
  from public, anon, authenticated;
revoke execute on function private.notify_for(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notify_from_log()
  from public, anon, authenticated;

revoke execute on function public.read_notifications(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.read_notifications(uuid, uuid, uuid[]) to service_role;
