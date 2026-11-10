-- One login in several businesses (payroll P3b; Orel, 8 November 2026, issue
-- #1): an outside bookkeeper keeps the books of several businesses with one
-- phone number. At most one active place on a business's staff per login,
-- and any number as an accountant.
--
--   the rule    public.memberships_one_staff_idx: one active membership per
--               person in any role but accountant. That is today's rule for
--               staff too (the app's activeElsewhere), so it also stops one
--               owner from owning two businesses: branches wait until after
--               the pilot. Before it is made, the migration counts the logins
--               that would break it and stops with how many, changing nobody:
--               a project in that state fails here loudly, never half done.
--   choosing    the app opens the business the person chose, from a cookie
--               the server checks against their active memberships on every
--               request (@db/session), never trusted alone; else their place
--               on a staff, else the business they joined first. Nothing here
--               knows the cookie.
--   joining     public.claim_invite (20261110000300_payroll_access.sql's)
--               refuses a staff invite to someone on another business's
--               staff, in words (23505), and turns a race the index catches
--               into the same words, so /join can say it. An accountant's
--               invite is never refused for that. admin_invite, team_invite
--               and create_business write invites, never memberships, so the
--               index never meets them; the app asks before each of them
--               (@db/invites: activeElsewhere for the Team screen and the
--               console's business page, onAnotherStaff for the console's
--               new-business wizard), so no link goes out that /join would
--               refuse.
--   the phone   pushes come from every business the person is in that isn't a
--               demo and has notifications on (private.push_business_ok), not
--               only the oldest: the phone's line opens the app through
--               /notifications/open/<id>, which switches to the line's
--               business first. private.push_business is now the first such
--               business they joined, for the callers that need one
--               (save_push_subscription, push_allowed and the test line).
--               note_push_fetch answers one row per business, the same
--               moment on each. A demo business still never reaches a phone.
--   the test    public.send_test_push takes the business the person is in
--               now, and writes the test line there when its lines reach a
--               phone; else in the first business whose lines do.
--   demo        Galit, the demo's accountant, is now the accountant of the
--               restaurant too (supabase/seed.sql, supabase/hosted-demo.sql),
--               and each business's reset puts her back in it.

------------------------------------------------------------------------------
-- 1. One place on a staff per login

-- Stops before the index when a login is on two staffs: the index would
-- fail anyway, with a message that says less. Nobody is deactivated here.
do $$
declare
  doubled integer;
begin
  select count(*)::integer into doubled
  from (
    select m.user_id
    from public.memberships m
    where m.active and m.role <> 'accountant'::public.member_role
    group by m.user_id
    having count(*) > 1
  ) twice;

  if doubled > 0 then
    raise exception
      '% login(s) are active on the staff of more than one business. Nothing was changed: end their extra memberships by hand, then run this migration again.',
      doubled
      using errcode = '23505';
  end if;
end;
$$;

create unique index memberships_one_staff_idx
  on public.memberships (user_id)
  where active and role <> 'accountant';

comment on index public.memberships_one_staff_idx is
  'One active place on a business''s staff per login (payroll P3b): any number as an accountant.';

------------------------------------------------------------------------------
-- 2. Joining from a link

-- 20261110000300_payroll_access.sql's, which still sets the role and asks
-- someone coming back as an accountant to finish their shifts first. Now it
-- also refuses a staff invite to someone on another business's staff
-- (23505, which /join says in words), before anything is written, and a race
-- the index catches reads the same. An accountant's invite never is.
create or replace function public.claim_invite(token_hash text, claimant uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  claimant_phone text;
begin
  select * into inv
  from public.invites i
  where i.token_hash = claim_invite.token_hash
  for update;

  if inv.id is null or inv.claimed_at is not null or inv.expires_at <= now()
    or private.invite_closed(inv.business_id, inv.role, inv.invited_by) then
    raise exception 'No open invite' using errcode = 'P0002';
  end if;

  select p.phone into claimant_phone
  from public.profiles p where p.id = claimant;
  if claimant_phone is distinct from inv.phone then
    raise exception 'Invite is for another number' using errcode = '42501';
  end if;

  if private.is_staff_role(inv.role) and exists (
    select 1
    from public.memberships m
    where m.user_id = claimant
      and m.active
      and m.business_id <> inv.business_id
      and private.is_staff_role(m.role)
  ) then
    raise exception 'Already in another business''s team' using errcode = '23505';
  end if;

  if not private.is_staff_role(inv.role) and (
    exists (
      select 1 from public.time_entries e
      where e.business_id = inv.business_id and e.user_id = claimant
        and e.clock_out is null
    )
    or exists (
      select 1
      from public.shift_assignments a
      join public.schedule_shifts s on s.id = a.shift_id
      join public.businesses b on b.id = s.business_id
      where a.business_id = inv.business_id and a.user_id = claimant
        and s.day >= (now() at time zone b.timezone)::date
    )
    or exists (
      select 1
      from public.shift_swaps w
      join public.schedule_shifts s on s.id = w.shift_id
      join public.businesses b on b.id = s.business_id
      where w.business_id = inv.business_id and w.taken_by = claimant
        and w.status = 'taken'
        and s.day >= (now() at time zone b.timezone)::date
    )
  ) then
    raise exception 'Finish their shifts first' using errcode = '55000';
  end if;

  begin
    insert into public.memberships as mem (business_id, user_id, role)
    values (inv.business_id, claimant, inv.role)
    on conflict (business_id, user_id)
      do update set
        role = excluded.role,
        active = true,
        perms = case
          when private.is_staff_role(excluded.role) then mem.perms
          else '{}'::text[]
        end;
  exception when unique_violation then
    -- Only memberships_one_staff_idx can say so here: another staff place
    -- was claimed in the meantime.
    raise exception 'Already in another business''s team' using errcode = '23505';
  end;

  if not private.is_staff_role(inv.role) then
    delete from public.department_members dm
    where dm.business_id = inv.business_id and dm.user_id = claimant;

    delete from public.list_people p
    using public.lists l
    where l.id = p.list_id and l.status = 'open'
      and p.business_id = inv.business_id and p.user_id = claimant;

    delete from public.list_schedules ls
    where ls.business_id = inv.business_id and ls.recipient_user = claimant;
  end if;

  update public.invites
  set claimed_at = now(), claimed_by = claimant
  where id = inv.id;

  update public.profiles
  set full_name = btrim(inv.full_name)
  where id = claimant and full_name is null and inv.full_name is not null;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    inv.business_id, claimant, 'invite.claim',
    jsonb_build_object('invite', inv.id, 'role', inv.role)
  );

  return inv.business_id;
end;
$$;

------------------------------------------------------------------------------
-- 3. The phone: every business the person is in

-- `business`'s lines reach `person`'s phone: they are an active member of it,
-- it isn't a demo, and its notifications are on.
create function private.push_business_ok(person uuid, business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.memberships m
      where m.user_id = person and m.business_id = business and m.active
    )
    and not exists (
      select 1 from private.demo_businesses d where d.business_id = business
    )
    and private.module_enabled(business, 'notifications')
$$;

-- The first business `person` joined whose lines reach a phone, or null when
-- none does (20261109000500_push.sql's took the oldest membership, and null
-- when that one didn't). Whether a phone can be saved at all
-- (save_push_subscription, push_allowed), and where a test line goes when the
-- business the person is in now gets none.
create or replace function private.push_business(person uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_id
  from public.memberships m
  where m.user_id = person
    and m.active
    and private.push_business_ok(person, m.business_id)
  order by m.created_at, m.business_id
  limit 1
$$;

-- A line goes to the phone at once when the person has a device and the
-- line's business reaches their phone, whichever of their businesses it is.
create or replace function private.push_plan(
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
  select case
    when private.push_business_ok(person, business)
      and exists (select 1 from public.push_subscriptions s where s.user_id = person)
    then at_time
  end
$$;

-- A phone is asking what to show, with `actor` signed in on it
-- (20261109000500_push.sql's): one row for each business whose lines reach
-- their phone, in the order they joined, each with the same moment after
-- which lines are new to it. Nothing when the device is someone else's or no
-- business of theirs reaches a phone.
create or replace function public.note_push_fetch(
  actor uuid,
  push_endpoint text default null,
  at_time timestamptz default now()
)
returns table (since timestamptz, business uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  homes uuid[];
  device public.push_subscriptions%rowtype;
  fetched_since timestamptz;
begin
  select coalesce(array_agg(m.business_id order by m.created_at, m.business_id), '{}'::uuid[])
  into homes
  from public.memberships m
  where m.user_id = actor
    and m.active
    and private.push_business_ok(actor, m.business_id);

  if cardinality(homes) = 0 then
    return;
  end if;
  if push_endpoint is null then
    return query
    select at_time - interval '1 hour', h.home
    from unnest(homes) with ordinality as h (home, place)
    order by h.place;
    return;
  end if;

  select * into device
  from public.push_subscriptions s
  where s.endpoint_hash = private.endpoint_hash(push_endpoint)
    and s.user_id = actor
  for update;
  if not found then
    return;
  end if;

  fetched_since := coalesce(device.last_fetched_at, device.created_at);
  update public.push_subscriptions s
  set last_fetched_at = at_time, signed_out = 0
  where s.id = device.id;
  return query
  select fetched_since, h.home
  from unnest(homes) with ordinality as h (home, place)
  order by h.place;
end;
$$;

-- Pushes to send now (20261109000500_push.sql's), with one change: a line
-- stops when its business no longer reaches the person's phone (they left
-- it, it became a demo, its notifications went off), not when it isn't the
-- oldest business they are in.
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
      where q.state = 'queued' and q.next_at <= at_time
      order by q.next_at
      limit max_rows
      for update skip locked
    )
    returning d.id, d.notification_id, d.device_id
  )
  select c.id, c.notification_id, n.kind, n.push_before, c.device_id, s.endpoint
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.push_subscriptions s on s.id = c.device_id;
end;
$$;

-- "Send a test notification" (20261109000500_push.sql's), now in the business
-- the person is in (`business`) when its lines reach their phone, else in the
-- first business whose lines do. Refused (55000) for anyone whose phone gets
-- no lines. At most one every 30 seconds in that business: false when it is
-- too soon.
drop function public.send_test_push(uuid, timestamptz);

create function public.send_test_push(
  actor uuid,
  at_time timestamptz default now(),
  business uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  home uuid := case
    when business is not null and private.push_business_ok(actor, business)
      then business
    else private.push_business(actor)
  end;
  last_sent timestamptz;
begin
  if home is null then
    raise exception 'Notifications reach a phone only in a business that is not a demo'
      using errcode = '55000';
  end if;

  select n.created_at into last_sent
  from public.notifications n
  where n.user_id = actor and n.business_id = home and n.dedupe_key = 'push.test';
  if last_sent is not null and last_sent > at_time - interval '30 seconds' then
    return false;
  end if;

  -- From nobody, so the person themselves is not left out; for a quarter of
  -- an hour, so a test that waited longer never arrives.
  return private.notify(
    home, array[actor], 'push.test'::text,
    actor => null::uuid,
    dedupe => 'push.test'::text,
    push_until => at_time + interval '15 minutes',
    at_time => at_time
  ) > 0;
end;
$$;

------------------------------------------------------------------------------
-- 4. The demo: Galit in the restaurant too

-- The hosted restaurant, by its fixed id (supabase/hosted-demo.sql says the
-- same, for the workflow's "demo" step): its accountant is the shop's, Galit
-- (…112). She joins it now, without a reset that would take its visitors'
-- changes, once her account exists; before the demo step makes it, that step
-- starts the restaurant again, as it does any demo business missing someone
-- with an account. Locally the seed runs after the migrations, with its own.
update private.demo_businesses d
set definition = jsonb_set(
  d.definition, '{people}'::text[],
  coalesce(d.definition -> 'people', '[]'::jsonb)
    || '[{"user_id": "10000000-0000-4000-a000-000000000112", "role": "accountant", "name": "גלית הדגמה"}]'::jsonb
)
where d.business_id = '10000000-0000-4000-b000-000000000001'
  and not coalesce(d.definition -> 'people', '[]'::jsonb)
    @> '[{"user_id": "10000000-0000-4000-a000-000000000112"}]'::jsonb;

insert into public.memberships (business_id, user_id, role)
select b.id, p.id, 'accountant'::public.member_role
from public.businesses b
join public.profiles p on p.id = '10000000-0000-4000-a000-000000000112'
where b.id = '10000000-0000-4000-b000-000000000001'
on conflict (business_id, user_id) do nothing;

------------------------------------------------------------------------------
-- Who may call what

revoke execute on function private.push_business_ok(uuid, uuid)
  from public, anon, authenticated;

revoke execute on function public.send_test_push(uuid, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.send_test_push(uuid, timestamptz, uuid)
  to service_role;
