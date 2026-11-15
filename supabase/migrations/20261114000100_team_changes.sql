-- Team changes (Orel, 14 November 2026, issue #1): an owner or manager takes
-- someone off the team, changes their role, or cancels an invite. Until now
-- nothing did, so whoever left went on seeing everything.
--
--   who            as with inviting (team_invite of
--                  20261110000300_payroll_access.sql): whoever may invite to a
--                  role may remove from it and change to it. An owner acts on
--                  every role, a manager on managers and workers only: an
--                  owner's or an accountant's place is an owner's to touch
--                  (private.gives_role, @domain/team's invitableRoles). Never
--                  oneself (22023), never the last owner (23P01), never in a
--                  demo business closed to invites (55000, hint 'demo'), and
--                  not while the person is clocked in (55000, hint
--                  'clocked_in'): off the team or the staff they could not
--                  clock out. The server calls these with the secret key, for
--                  `actor`.
--   one at a time  each change locks its business's row first, so two owners
--                  taking each other off at once leave one of them.
--   removing       the membership stays, inactive, with `left_at`: nothing
--                  that is history goes (hours, breaks, pay, periods, past and
--                  started shifts, availability, chat, documents, the person's
--                  lines, the log). Their personal permissions are cleared, so
--                  coming back on a new invite doesn't bring them back. Their
--                  shifts still to start, in published and draft weeks, come
--                  off them and show as missing (a draft holding someone off
--                  the team could never be saved again); the live swaps they
--                  asked for on those shifts are cancelled and their other side
--                  told, as a republish does (swap.removed); a colleague's shift
--                  they took, still waiting for approval, is open again (Orel,
--                  15 November 2026): its taker cleared, its asker told
--                  (swap.reopened), the approval waiting for managers settled,
--                  and it is offered again as a new request is (swap.offered);
--                  one already approved is theirs and comes off as any shift
--                  does. They leave their departments,
--                  the open lists sent to them and the lists' times for them, as
--                  claim_invite has someone back as an accountant do. Their own
--                  lines in the business are read and kept off the phone. The
--                  schedule's builders (owners and managers, but the actor) are
--                  told how many of each published week's shifts still to start
--                  lack someone (schedule.unfilled), never who left. The person
--                  is told nothing (decision 3): public.own_departures names,
--                  to them alone, the businesses they are no longer in.
--   role           to an accountant: off the staff as removing takes them
--                  (Orel's decision 2 for the shifts, rather than claim_invite's
--                  "finish their shifts first"), personal permissions cleared;
--                  to an owner, cleared too (an owner holds everything); between
--                  manager and worker they stay. From an accountant onto the
--                  staff: refused while they are on another business's staff
--                  (23505). Lines for a higher role than the new one are read
--                  and kept off the phone, and so are a staff member's lines
--                  about the schedule, lists and chat when they leave the staff.
--                  `seen_role` is the role the screen showed (an undo), and
--                  40001 says it changed meanwhile. The same role writes
--                  nothing.
--   invites        a cancelled invite keeps its row (the activity log names
--                  invites by it): `claimed_at` closes it for every reader of
--                  open invites, `cancelled_at` says why, and a fresh hash
--                  nobody holds ends its link at once. The number is free for
--                  a new invite.
--   logged         member.remove, member.role and invite.cancel: ids, roles,
--                  counts, the moment, the published shifts' days and times
--                  (what every member read on the board), and the swaps
--                  cancelled and reopened (ids, the people's ids and their
--                  shifts, as publish_week_schedule logs them), never a name or
--                  a number.
--   settled        documents.received and access.pay_granted lines of anyone
--                  who no longer holds pay access, as permission.revoke settles
--                  them; a week's schedule.unfilled line when the week is
--                  published again, and by the minute job once none of its
--                  shifts still to start lacks anyone.
--
-- It replaces five functions with the same signature and grants (create or
-- replace): private.notification_kind_groups (20261112000200_reminders.sql's),
-- with the two new kinds; private.settle_done_reminders (the same migration's),
-- which also settles the new kind; public.save_week_schedule
-- (20261103000100_publish_schedule.sql's), which now locks its week first,
-- so a draft saved and a removal take turns; and public.request_shift_swap
-- and public.take_shift_swap (20261105000100_shift_swaps.sql's), which now
-- lock the actor's membership first, so a swap asked for or taken and a
-- team change take turns (section 10). It recreates one trigger,
-- audit_log_settles_documents (20261111000700_documents.sql's), on the two new
-- actions too. Every new function is security definer with an empty
-- search_path, and all but own_departures are the secret key's alone.

------------------------------------------------------------------------------
-- 1. Columns

alter table public.memberships add column left_at timestamptz;

alter table public.memberships
  add constraint memberships_left_inactive check (left_at is null or not active);

comment on column public.memberships.left_at is
  'When an owner or manager took the person off the team (public.remove_member). Null while active, and cleared when the row is made active again (a new invite claimed). public.own_departures reads it for the person.';

-- A row made active again (claim_invite, a demo reset's rows are new) is back
-- on the team: it has left nothing.
create function private.clear_left_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.left_at := null;
  return new;
end;
$$;

revoke execute on function private.clear_left_at() from public, anon, authenticated;

create trigger memberships_back
  before update of active on public.memberships
  for each row
  when (new.active and not old.active)
  execute function private.clear_left_at();

alter table public.invites add column cancelled_at timestamptz;

alter table public.invites
  add constraint invites_cancelled_closed
  check (cancelled_at is null or (claimed_at = cancelled_at and claimed_by is null));

comment on column public.invites.cancelled_at is
  'When an owner or manager cancelled the invite (public.team_invite_cancel). claimed_at is the same moment, so every reader of open invites (claimed_at is null) leaves it out, and claimed_by stays null: claimed_at alone no longer means someone joined.';

------------------------------------------------------------------------------
-- 2. Helpers

-- Whether someone in `giver`'s role may invite to `r`, and so remove someone
-- from it and change someone to it (Orel, 14 November 2026): owners and
-- managers invite; only an owner gives an owner's or an accountant's role.
-- Spelled out as team_invite does, never read from the enum's order, in which
-- an accountant comes after a worker. @domain/team's invitableRoles says the
-- same.
create function private.gives_role(giver public.member_role, r public.member_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    giver in ('owner', 'manager')
      and r is not null
      and (giver = 'owner' or r in ('manager', 'worker')),
    false
  )
$$;

revoke execute on function private.gives_role(public.member_role, public.member_role)
  from public, anon, authenticated;

-- How many of the week's shifts still to start at `at_time` (in the business's
-- time zone, as private.shift_span) need more people than they have: what
-- the schedule shows as missing.
create function private.unfilled_shifts(week uuid, at_time timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.schedule_shifts s
  join public.businesses b on b.id = s.business_id
  where s.week_id = week
    and (s.day + s.starts_at) at time zone b.timezone > at_time
    and s.needed > (
      select count(*) from public.shift_assignments a where a.shift_id = s.id
    )
$$;

revoke execute on function private.unfilled_shifts(uuid, timestamptz)
  from public, anon, authenticated;

-- `person` leaves the business's staff at `at_time`: off their shifts still to
-- start, in published and draft weeks; the live swaps they asked for on shifts
-- still to start cancelled, since their place on the shift comes off anyway;
-- those they took from a colleague on shifts still to start, still waiting for
-- approval, open again with no taker (Orel, 15 November 2026), so someone
-- else may take them (an open one by a colleague had no taker, and one
-- approved is theirs, an assignment like any other); out of their
-- departments, the open lists sent to them and the lists' times for them
-- (claim_invite's, for someone back as an accountant). Shifts begun or past
-- keep them: they are history. Returns what it did, for the log row: the
-- published shifts taken off (`shifts`, as every member read them, with their
-- week), how many draft ones (`drafts`), the swaps cancelled (`swaps`, as
-- publish_week_schedule's `removed_swaps`) and reopened (`reopened`: each
-- one's id, who asked and its shift), and how many departments, open lists and
-- lists' times. The caller checks who may.
create function private.leave_staff(business uuid, person uuid, at_time timestamptz)
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
  set status = 'cancelled'
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

revoke execute on function private.leave_staff(uuid, uuid, timestamptz)
  from public, anon, authenticated;

-- What the screen hears back: how many published shifts and draft shifts came
-- off, how many swaps were cancelled and how many open again.
create function private.left_counts(cleared jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'shifts', coalesce(jsonb_array_length(cleared -> 'shifts'), 0),
    'drafts', coalesce((cleared ->> 'drafts')::integer, 0),
    'swaps', coalesce(jsonb_array_length(cleared -> 'swaps'), 0),
    'reopened', coalesce(jsonb_array_length(cleared -> 'reopened'), 0)
  )
$$;

revoke execute on function private.left_counts(jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 3. Taking someone off the team

-- `actor`, an active owner or manager of `business`, takes `person` off its
-- team at `at_time` (the rules at the top). Returns how many published
-- shifts, draft shifts and swaps came off (`shifts`, `drafts`, `swaps`), and
-- how many swaps they had taken are open again (`reopened`).
create function public.remove_member(
  actor uuid,
  business uuid,
  person uuid,
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
  cleared jsonb;
begin
  -- One team change at a time in the business.
  perform 1 from public.businesses b where b.id = business for no key update;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or actor_role not in ('owner', 'manager') then
    raise exception 'Not allowed to remove this person' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Not yourself' using errcode = '22023';
  end if;

  select * into target
  from public.memberships m
  where m.business_id = business and m.user_id = person and m.active
  for update;
  if not found then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if not private.gives_role(actor_role, target.role) then
    raise exception 'Only an owner removes an owner or an accountant'
      using errcode = '42501';
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

  if exists (
    select 1 from public.time_entries e
    where e.business_id = business and e.user_id = person and e.clock_out is null
  ) then
    raise exception 'Clocked in now' using errcode = '55000', hint = 'clocked_in';
  end if;

  update public.memberships m
  set active = false, perms = '{}'::text[], left_at = at_time
  where m.id = target.id;

  cleared := private.leave_staff(business, person, at_time);

  -- Their own lines here wait for nobody now, and none goes to their phone.
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.user_id = person
    and (n.read_at is null or n.push_state = 'queued');

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'member.remove',
    jsonb_build_object(
      'person', person,
      'role', target.role,
      'perms', to_jsonb(target.perms),
      'at', at_time
    ) || cleared
  );

  return private.left_counts(cleared);
end;
$$;

------------------------------------------------------------------------------
-- 4. Changing someone's role

-- `actor`, an active owner or manager of `business`, gives `person` the role
-- `new_role` at `at_time` (the rules at the top). `seen_role`, when given, is
-- the role the screen showed. Returns whether anything changed (`changed`)
-- and, for someone who left the staff, how many published shifts, draft
-- shifts and swaps came off and how many swaps opened again, as
-- remove_member does.
create function public.set_member_role(
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

  -- Lines for a role above the new one, and, off the staff, the staff's lines
  -- about the schedule, lists and chat: nothing waits on them now.
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.user_id = person
    and (n.read_at is null or n.push_state = 'queued')
    and (
      private.role_rank(n.audience_role) > private.role_rank(new_role)
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

------------------------------------------------------------------------------
-- 5. Cancelling an invite

-- `actor` cancels an invite nobody claimed, open or expired, by the rules of
-- team_invite_link: an owner or manager of its business, and an owner's or an
-- accountant's invite only an owner. P0002 for one claimed, cancelled or
-- unknown. Its link stops working at once, and its number is free for a new
-- invite. Hosted demos hold no invites, so there is nothing to refuse there.
create function public.team_invite_cancel(
  actor uuid,
  invite uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  actor_role public.member_role;
begin
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

  if actor_role is null or not private.gives_role(actor_role, inv.role) then
    raise exception 'Not allowed to cancel this invite' using errcode = '42501';
  end if;

  update public.invites i
  set claimed_at = at_time,
    claimed_by = null,
    cancelled_at = at_time,
    -- 64 hex digits of no token anyone was given.
    token_hash = md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text)
  where i.id = inv.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    inv.business_id, actor, 'invite.cancel',
    jsonb_build_object('invite', inv.id, 'role', inv.role)
  );
end;
$$;

------------------------------------------------------------------------------
-- 6. Telling the person they left (decision 3)

-- The businesses the signed-in person was taken off the team of, the latest
-- first: what they read of them while they were in it (its name and colour).
-- Under the policies they read nothing of a business they left, so the app
-- asks this as it draws a screen, and says each departure once (or, with no
-- business left, every time).
create function public.own_departures()
returns table (business uuid, name text, accent text, left_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, b.accent, m.left_at
  from public.memberships m
  join public.businesses b on b.id = m.business_id
  where m.user_id = (select auth.uid())
    and not m.active
    and m.left_at is not null
  order by m.left_at desc, b.id
$$;

------------------------------------------------------------------------------
-- 7. The schedule's builders hear of shifts left open

-- 20261112000200_reminders.sql's, with the two new kinds: shifts freed in the
-- schedule wait for its builders, as approvals do, and a request open again
-- is about swaps, as the rest of its asker's lines are.
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

-- What a team change tells, and what it settles:
--
--   member.remove,   for each published week whose shifts still to start came
--   member.role      off the person: its owners and managers (but the actor),
--                    how many of those shifts lack someone now, one line per
--                    week (`schedule.unfilled:<week>`), back unread with each
--                    later change, or settled when none does; the other side
--                    of each swap it cancelled (swap.removed), its offer and
--                    approval settled, as a republish does; for each swap it
--                    opened again, the one who asked (swap.reopened, on their
--                    `swap:<id>` line, which said it was taken, and with no
--                    word of who took it; the actor too, when they made the
--                    change themselves), its approval settled, since nothing
--                    waits for a manager now, and its offer made again to
--                    whoever may take it, as swap.request makes it
--                    (private.notify_for: the asker its actor, so nobody but
--                    them is left out, and the lines settled when it was
--                    taken come back unread); and the person's
--                    own access.pay_granted line once they hold no pay access.
--                    Never the person removed (private.notify writes only to
--                    active members, and nothing about the schedule to someone
--                    off the staff).
--   schedule.publish the week's schedule.unfilled lines: its builders saw it.
create function private.notify_for_team(entry public.audit_log)
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
  if entry.action = 'schedule.publish' then
    perform private.resolve_notifications(b, 'schedule.unfilled:' || (d ->> 'week'));
    return;
  end if;

  moment := coalesce((d ->> 'at')::timestamptz, entry.created_at);

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

  if d ? 'person'
    and not private.holds_perm(b, (d ->> 'person')::uuid, 'clock.payroll'::text)
  then
    perform private.resolve_notifications(b, 'access.pay:' || (d ->> 'person'), moment);
  end if;
end;
$$;

-- The trigger: the change stands, whatever telling people about it does.
create function private.notify_team_from_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.notify_for_team(new);
  exception when others then
    raise warning 'team notifications for % (%) failed: %', new.action, new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger audit_log_notifies_team
  after insert on public.audit_log
  for each row
  when (new.action in ('member.remove', 'member.role', 'schedule.publish'))
  execute function private.notify_team_from_log();

-- A week's schedule.unfilled lines whose week has no shift still to start that
-- lacks someone at `at_time` (filled, or begun): nothing waits on them. One
-- look-up by dedupe key per open line.
create function private.settle_unfilled(business uuid, at_time timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_key text;
begin
  for open_key in
    select distinct n.dedupe_key
    from public.notifications n
    where n.business_id = business
      and n.kind = 'schedule.unfilled'
      and n.resolved_at is null
      and n.dedupe_key ~ '^schedule\.unfilled:[0-9a-f-]{36}$'
  loop
    if private.unfilled_shifts(substr(open_key, 19)::uuid, at_time) = 0 then
      perform private.resolve_notifications(business, open_key, at_time);
    end if;
  end loop;
end;
$$;

-- 20261112000200_reminders.sql's, the same, and last the schedule's freed
-- shifts (private.settle_unfilled above), which never stop the reminders.
create or replace function private.settle_done_reminders(
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

  begin
    perform private.settle_unfilled(business, at_time);
  exception when others then
    raise warning 'freed shifts of business % were not settled: %', business, sqlerrm;
  end;
end;
$$;

------------------------------------------------------------------------------
-- 8. Lines settled when pay access goes

-- 20261111000700_documents.sql's trigger, on the team changes too: someone
-- taken off the team, or given a role without pay access, is no longer in
-- the office. private.settle_documents_from_log is unchanged.
drop trigger audit_log_settles_documents on public.audit_log;
create trigger audit_log_settles_documents
  after insert on public.audit_log
  for each row
  when (new.action in ('permission.revoke', 'member.remove', 'member.role'))
  execute function private.settle_documents_from_log();

------------------------------------------------------------------------------
-- 9. A draft saved takes turns with a team change

-- 20261103000100_publish_schedule.sql's, the same, but the week is locked
-- first, as publish_week_schedule locks it: private.leave_staff locks the
-- business's weeks before it takes someone off their shifts, so a save and a
-- removal take turns on the week. A save that waits for a removal then reads
-- the person off the team (22023: the builder reads the week again); a
-- removal that waits for a save takes them off what it saved. Without it the
-- two could deadlock, or a save could put someone just taken off the team
-- back on the draft. Locking tells a stranger nothing: the rules below still
-- refuse them, and nothing is returned before they do.
create or replace function public.save_week_schedule(
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
begin
  perform 1 from public.schedule_weeks w where w.id = week for update;

  -- The rules first, so a worker or a stranger learns nothing about the
  -- week; an error below undoes the replacement.
  shift_count := private.replace_week_schedule(actor, week, shifts);

  if exists (
    select 1 from public.schedule_weeks w
    where w.id = week and w.schedule_published_at is not null
  ) then
    raise exception 'This week is published; publish the changes instead'
      using errcode = '55000';
  end if;

  return shift_count;
end;
$$;

------------------------------------------------------------------------------
-- 10. Asking for a swap or taking one takes turns with a team change

-- 20261105000100_shift_swaps.sql's two, the same, but the actor's membership
-- is locked first (for share), as remove_member and set_member_role lock it
-- (for update): a request or a take under way while the person leaves would
-- otherwise read them still on the team, after private.leave_staff had
-- locked their swaps without it, and leave a request on a shift they are off,
-- or a swap taken by someone gone, waiting for an approval nobody can give
-- and never open again. One that waits for the change reads them off the
-- team or the staff (42501); a change that waits for one finds its swap.
-- Neither waits on the other's rows besides: a removal locks only the
-- person's own live swaps, never an open one by someone else with no taker.
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
    where w.shift_id = shift and w.requested_by = actor and w.status in ('open', 'taken')
  ) then
    raise exception 'Already asked to give this shift away' using errcode = '23505';
  end if;

  insert into public.shift_swaps (business_id, shift_id, requested_by, note)
  values (s.business_id, shift, actor, nullif(btrim(note), ''))
  returning id into swap_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (s.business_id, actor, 'swap.request', jsonb_build_object('swap', swap_id, 'shift', shift));

  return swap_id;
end;
$$;

create or replace function public.take_shift_swap(
  actor uuid,
  swap uuid,
  at_time timestamptz default now()
)
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

  perform 1
  from public.memberships m
  where m.business_id = w.business_id and m.user_id = actor
  for share;

  if not exists (
    select 1 from public.memberships m
    where m.business_id = w.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Only active members of the business can take a shift'
      using errcode = '42501';
  end if;

  if w.status <> 'open' then
    raise exception 'This request is no longer open' using errcode = '55000';
  end if;

  if w.requested_by = actor then
    raise exception 'Cannot take your own shift' using errcode = '22023';
  end if;

  perform private.check_shift_open_for_swap(w.shift_id, at_time);
  perform private.check_can_take(w.shift_id, actor);

  update public.shift_swaps
  set status = 'taken', taken_by = actor, taken_at = at_time
  where id = swap;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (w.business_id, actor, 'swap.take', jsonb_build_object('swap', swap));
end;
$$;

------------------------------------------------------------------------------
-- Grants

-- The new private functions: nobody but the database's own, as
-- 20261112000200_reminders.sql's. Its two replaced in place (section 7) keep
-- their grants; revoked again all the same, as there.
revoke execute on function private.notify_for_team(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notify_team_from_log()
  from public, anon, authenticated;
revoke execute on function private.settle_unfilled(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.notification_kind_groups()
  from public, anon, authenticated;
revoke execute on function private.settle_done_reminders(uuid, date, timestamptz)
  from public, anon, authenticated;

-- Replaced above (save_week_schedule, request_shift_swap, take_shift_swap):
-- the same grants as before.
revoke execute on function public.save_week_schedule(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_week_schedule(uuid, uuid, jsonb)
  to service_role;

revoke execute on function public.request_shift_swap(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.request_shift_swap(uuid, uuid, text, timestamptz)
  to service_role;

revoke execute on function public.take_shift_swap(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.take_shift_swap(uuid, uuid, timestamptz)
  to service_role;

revoke execute on function public.remove_member(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.remove_member(uuid, uuid, uuid, timestamptz)
  to service_role;

revoke execute on function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz
) from public, anon, authenticated;
grant execute on function public.set_member_role(
  uuid, uuid, uuid, public.member_role, public.member_role, timestamptz
) to service_role;

revoke execute on function public.team_invite_cancel(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.team_invite_cancel(uuid, uuid, timestamptz)
  to service_role;

revoke execute on function public.own_departures() from public, anon;
grant execute on function public.own_departures() to authenticated;
