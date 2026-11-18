-- Notifications, part 3 (Orel, 8 and 9 November 2026, issue #1): each
-- person chooses what reaches their phone, can set quiet hours, and can keep
-- what a line says off the lock screen. The app's inbox always shows
-- everything, whatever they chose.
--
--   the choices   public.notification_preferences: one row per person,
--                 across every business they are in (these are about their
--                 phone and their sleep, not a business), written the first
--                 time they change something. Without one: every group on,
--                 no quiet hours, details on the lock screen.
--   who           the person alone reads their row, under their own session
--                 (select own); nobody else, not an owner, not the team
--                 viewing as someone, not the server's secret key. They
--                 write it through public.set_notification_preferences, for
--                 the signed-in person (auth.uid()), never anyone else, and
--                 never during a view session; the server action refuses
--                 that first. Nothing here writes a log row.
--   groups        private.notification_group, the group of each kind, the
--                 same as @domain/notifications (a vitest db test compares
--                 the two for every kind): the schedule, swaps, approvals,
--                 the team, lists, chat and documents. Any of them may be
--                 kept off the phone, those whose lines ask for something
--                 included, since those still wait in the app; nothing is
--                 ever off in the app. A kind with no group always reaches
--                 the phone: the lines about pay, which payroll kept out of
--                 every group (the person's own pay access and wage,
--                 access.pay_granted and pay.wage_set; and the office's,
--                 pay.after_close to the month's closer and the accountants
--                 and pay.month_due to every pay holder), so the settings
--                 screen says pay always comes; and the test. A chat's group
--                 is on top of each conversation's mute.
--   quiet hours   off until switched on, then 22:00 to 07:00 unless the
--                 person picks other times, on their own clock (the
--                 business's time zone, which the server passes); crossing
--                 midnight when they end before they start. A push due inside
--                 them waits for their end (private.quiet_until), and the
--                 minute job of part 2 (private.notifications_tick) sends it
--                 then; so does one that goes again after a failure (a
--                 retry) and comes due inside them (private.push_held). A
--                 line that was for a time past before then (a test, a
--                 reminder) goes no more, as before. The test from the phone
--                 switch never waits: it is asked for there and then.
--   previews      on by default. Off, /push/inbox shows the group's words
--                 alone ("עדכון בסידור"), never the line.
--   changing      what waits for the phone follows a change at once: a group
--                 switched off goes no more, a push going again included
--                 (private.push_kept_off, asked again by every send), and a
--                 push held for quiet hours waits for their new end, or goes
--                 now that they are off.
--   the ask       `push_asked_at`: when the person was first offered
--                 notifications on the phone, after giving away a shift or
--                 sending availability (public.see_push_ask), so they are
--                 asked once, never again, on any device.
--
-- It replaces three functions, each with the same signature and grants
-- (create or replace): private.push_plan (20261110000900_several_
-- businesses.sql's), which now asks the person's choices too, its callers
-- (private.notify, private.notify_chat) staying as they are;
-- public.claim_due_pushes (the same migration's), which now stops a push
-- going again for a group switched off and holds one due inside quiet hours;
-- and private.notifications_tick (20261109000500_push.sql's), which doesn't
-- wake the app for a push quiet hours hold.

------------------------------------------------------------------------------
-- 1. Groups

-- Every kind this app writes and its group, null for a line nobody switches
-- off (pay and the test, as the header says). @domain/notifications says the
-- same (NOTIFICATION_KINDS), and
-- packages/db/notification-preferences.db.test.ts keeps the two equal: a new
-- kind is a row here too.
create function private.notification_kind_groups()
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

-- The groups, in the order a settings screen lists them
-- (@domain/notifications' NOTIFICATION_GROUPS): what a person may keep off
-- their phone.
create function private.notification_groups()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['schedule', 'swaps', 'approvals', 'team', 'lists', 'chat', 'documents']::text[]
$$;

-- The group of a kind of line, or null: a line nobody switches off, or a
-- kind this app doesn't know.
create function private.notification_group(what text)
returns text
language sql
immutable
set search_path = ''
as $$
  select g.group_key
  from private.notification_kind_groups() g
  where g.kind_key = what
$$;

-- Quiet hours as they start when first switched on.
create function private.default_quiet_hours()
returns table (starts time, stops time)
language sql
immutable
set search_path = ''
as $$
  values (time '22:00', time '07:00')
$$;

------------------------------------------------------------------------------
-- 2. The choices

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Groups that don't reach the phone; they still reach the app.
  push_off text[] not null default '{}'::text[]
    check (push_off <@ private.notification_groups()),
  -- Quiet hours on the clock of `time_zone`, whole minutes, both or neither;
  -- from after to crosses midnight.
  quiet_from time,
  quiet_to time,
  time_zone text not null default 'Asia/Jerusalem'
    check (char_length(time_zone) between 1 and 64),
  -- What the lock screen shows: the line, or only its group's words.
  previews boolean not null default true,
  -- When the person was first offered notifications on the phone.
  push_asked_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((quiet_from is null) = (quiet_to is null)),
  check (quiet_from is null or quiet_from <> quiet_to),
  check (
    quiet_from is null
    or (extract(second from quiet_from) = 0 and extract(second from quiet_to) = 0)
  )
);

alter table public.notification_preferences enable row level security;

-- Written only by public.set_notification_preferences and public.see_push_ask;
-- read by its own person alone, not even with the server's secret key.
revoke all on public.notification_preferences from anon, authenticated, service_role;
grant select on public.notification_preferences to authenticated;

create policy "people read their own notification preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.notification_preferences is
  'Each person''s own choices for their phone (groups off, quiet hours, details on the lock screen), across their businesses: read by that person alone, written by public.set_notification_preferences for the signed-in person.';

------------------------------------------------------------------------------
-- 3. Quiet hours

-- When the quiet hours from `starts` until `stops`, on the clock of
-- `tz_name`, that `at_time` falls in end; null outside them, or with none.
-- They cross midnight when they stop before they start. @domain/notifications'
-- quietEnd is the same (the vitest db test compares them across the clock
-- changes).
create function private.quiet_end(
  starts time,
  stops time,
  tz_name text,
  at_time timestamptz
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when starts is null or stops is null or starts = stops then null::timestamptz
    when starts < stops then (
      case
        when here.t >= starts and here.t < stops
          then (here.d + stops) at time zone tz_name
      end
    )
    when here.t >= starts then (here.d + 1 + stops) at time zone tz_name
    when here.t < stops then (here.d + stops) at time zone tz_name
  end
  from (
    select (at_time at time zone tz_name)::date as d,
      (at_time at time zone tz_name)::time as t
  ) here
$$;

-- The end of `person`'s quiet hours, when `at_time` falls inside them; else
-- null (and with no choices made).
create function private.quiet_until(person uuid, at_time timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select private.quiet_end(p.quiet_from, p.quiet_to, p.time_zone, at_time)
  from public.notification_preferences p
  where p.user_id = person
$$;

-- Whether a push of `what` for `person` waits at `at_time`: inside their
-- quiet hours, unless it is the test, which is asked for there and then.
create function private.push_held(person uuid, what text, at_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select what <> 'push.test' and private.quiet_until(person, at_time) is not null
$$;

------------------------------------------------------------------------------
-- 4. Which lines reach a phone, and when

-- Whether `person` keeps the group of a line of `what` off their phone.
create function private.push_kept_off(person uuid, what text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notification_preferences p
    where p.user_id = person
      and private.notification_group(what) = any (p.push_off)
  )
$$;

-- 20261110000900_several_businesses.sql's, with the person's choices: a line
-- goes to the phone when the person has a device, the line's business
-- reaches their phone, and its group isn't one they keep off the phone; at
-- once, or when their quiet hours end. The test is never held.
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
      and not private.push_kept_off(person, what)
    then (
      case
        when what = 'push.test' then at_time
        else coalesce(private.quiet_until(person, at_time), at_time)
      end
    )
  end
$$;

-- Pushes to send now (20261110000900_several_businesses.sql's), asking the
-- person's choices at every send, not only when the line was written: a line
-- whose group they now keep off the phone stops, a push going again after a
-- failure (finish_pushes' retries) included, and a push that comes due
-- inside their quiet hours (a retry, or a chat's few seconds as they begin)
-- stays queued, as it was, until a send after they end. Nothing else
-- changes.
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

-- The minute job (20261109000500_push.sql's), which asks the app to send
-- only when something is due: a push quiet hours hold isn't, until they end,
-- so a night of them never wakes the app once a minute for nothing.
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

------------------------------------------------------------------------------
-- 5. Changing them (the signed-in person, from the settings screen)

-- The signed-in person, who may change their own choices: 42501 for nobody
-- signed in, and for the team while viewing a business as someone (the app
-- refuses that first).
create function private.preferences_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in to change notifications' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.view_sessions v
    where v.staff_id = me and v.ended_at is null and v.expires_at > now()
  ) then
    raise exception 'Nothing changes while viewing as someone' using errcode = '42501';
  end if;
  return me;
end;
$$;

-- One change from the settings screen, for the signed-in person; whatever is
-- left null stays as it was:
--   phone_group, phone_on  a group on (true) or off (false) for the phone,
--                          both or neither;
--   quiet_on               quiet hours off (false), or on (true) with
--                          quiet_start and quiet_stop, each one not given
--                          kept or, the first time, 22:00 and 07:00; times
--                          alone also switch them on;
--   lock_previews          whether the lock screen shows the line;
--   tz_name                the clock quiet hours are read on (the server
--                          passes the business's).
-- 22023 for a group, a zone or quiet hours that can't be (no length, part of
-- a minute). What waits for the phone follows at once: a group switched off
-- goes no more, a push going again after a failure included, and a push held
-- more than a minute (by quiet hours) waits for their new end, or goes now.
-- Returns the choices as they now stand.
create function public.set_notification_preferences(
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
  -- only quiet hours hold one longer.

  update public.notifications n
  set push_after = coalesce(private.quiet_until(me, now()), now())
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

-- The signed-in person was offered notifications on the phone (the quiet
-- card after giving away a shift or sending availability): kept once, from
-- the first time, so they are never asked again. Writes no log row.
create function public.see_push_ask()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.preferences_owner();
begin
  insert into public.notification_preferences as p (user_id, push_asked_at)
  values (me, now())
  on conflict (user_id) do update
    set push_asked_at = coalesce(p.push_asked_at, excluded.push_asked_at);
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

revoke execute on function private.notification_kind_groups()
  from public, anon, authenticated;
revoke execute on function private.notification_groups()
  from public, anon, authenticated;
revoke execute on function private.notification_group(text)
  from public, anon, authenticated;
revoke execute on function private.default_quiet_hours()
  from public, anon, authenticated;
revoke execute on function private.quiet_end(time, time, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.quiet_until(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.push_held(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.push_kept_off(uuid, text)
  from public, anon, authenticated;
-- Replaced in place, so their grants stay as they were: private.push_plan
-- and private.notifications_tick for nobody but the database's own, and
-- public.claim_due_pushes for the server's secret key alone. Revoked again
-- all the same, as 20261109000500_push.sql does.
revoke execute on function private.push_plan(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.notifications_tick()
  from public, anon, authenticated;
revoke execute on function public.claim_due_pushes(integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.preferences_owner()
  from public, anon, authenticated;

-- The signed-in person's own: never the server's, which would have to say
-- whose.
revoke execute on function public.set_notification_preferences(
  text, boolean, boolean, time, time, boolean, text
) from public, anon, service_role;
grant execute on function public.set_notification_preferences(
  text, boolean, boolean, time, time, boolean, text
) to authenticated;
revoke execute on function public.see_push_ask() from public, anon, service_role;
grant execute on function public.see_push_ask() to authenticated;
