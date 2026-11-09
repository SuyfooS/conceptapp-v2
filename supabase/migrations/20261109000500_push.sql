-- Notifications, part 2 (Orel, 8 and 9 November 2026, issue #1): the phone,
-- through Web Push (RFC 8030, with VAPID, RFC 8292). A push carries no
-- payload: the phone's service worker asks the app what to show, under the
-- person's own session (/push/inbox), so what a line says never passes
-- through a push service.
--
--   devices      public.push_subscriptions: one row per device, the endpoint
--                its push service gave it, unique, moving to whoever saves it
--                next; at most ten each, a new one forgetting the one seen
--                longest ago. The browser reads a few plain columns of its own
--                rows, never the endpoint or the keys.
--   deliveries   public.push_deliveries: one row per line and device, so a
--                retry goes to the device that missed it and to no other.
--                Nobody but the server reads or writes them.
--   which lines  those of the business the app opens for the person (their
--                oldest active membership), while it isn't a demo and its
--                notifications are on, once they have a device
--                (private.push_plan, which part 1 left empty). A demo business
--                never reaches a phone, and nobody only in demo businesses can
--                save a device: the demo people are shared accounts.
--   sending      the server claims what is due (claim_due_pushes), sends each
--                device one empty push however many lines wait for it, and
--                says how it went (finish_pushes): sent; gone (404, 410), and
--                the device is forgotten; refused (400, 403), counted against
--                the device, which goes after three failures over a day; or
--                later (429, 5xx), again in 1, 5 and 25 minutes, then failed,
--                which counts against the device too. Once a day, a device
--                not seen for 60 days goes when it fails or hasn't taken a
--                push in that time.
--   the minute   pg_cron asks the app to send once a minute, but only while
--                something is due, through pg_net with the app's address and a
--                secret of its own from Vault (app_url, cron_secret; set by
--                hand on a hosted project, absent locally, so nothing is
--                called there). Without them, what is due goes out with the
--                next action anywhere in the app. supabase/seed.sql switches
--                both jobs off for local and CI databases.
--
-- Each person's choices and quiet hours (part 3) replace private.push_plan;
-- the reminders (part 4) replace private.notifications_tick and
-- private.clean_notifications, which keep their names and their jobs.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

------------------------------------------------------------------------------
-- Devices

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null
    check (endpoint ~ '^https?://' and char_length(endpoint) <= 1024),
  endpoint_hash text not null unique check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  -- For payload encryption (RFC 8291): kept, unused while pushes carry none.
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_=-]{80,100}$'),
  auth_secret text not null check (auth_secret ~ '^[A-Za-z0-9_=-]{16,32}$'),
  -- A coarse word for the list of devices, from the browser's user agent,
  -- which itself is not kept.
  label text check (label in ('iphone', 'ipad', 'android', 'computer')),
  created_at timestamptz not null default now(),
  -- When the app last saw the device signed in.
  last_seen_at timestamptz not null default now(),
  -- When its service worker last asked what to show.
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  -- Pushes its push service refused, or that never got through after every
  -- try, since its last success, and since when.
  failures smallint not null default 0 check (failures >= 0),
  failing_since timestamptz,
  -- Pushes in a row its service worker asked about without a session.
  signed_out smallint not null default 0 check (signed_out >= 0)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, user_id, label, created_at, last_seen_at, last_success_at)
  on public.push_subscriptions to authenticated;

create policy "people read their own devices"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.push_subscriptions is
  'Each device a person turned notifications on: written only by the server; its endpoint and keys are never readable from the browser.';

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  device_id uuid not null references public.push_subscriptions (id) on delete cascade,
  state text not null default 'queued'
    check (state in ('queued', 'sending', 'sent', 'skipped', 'failed')),
  attempts smallint not null default 0 check (attempts >= 0),
  next_at timestamptz not null,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, device_id),
  check (state <> 'sending' or claimed_at is not null)
);

create index push_deliveries_due_idx
  on public.push_deliveries (next_at) where state = 'queued';
create index push_deliveries_sending_idx
  on public.push_deliveries (claimed_at) where state = 'sending';
create index push_deliveries_device_id_idx on public.push_deliveries (device_id);

alter table public.push_deliveries enable row level security;

revoke all on public.push_deliveries from anon, authenticated;

comment on table public.push_deliveries is
  'One push of a line to one device, with its own retries: the server''s alone.';

------------------------------------------------------------------------------
-- Which lines reach a phone

-- The business whose lines reach `person`'s phone: the one the app opens for
-- them (their oldest active membership, as @db/session reads it), while it
-- isn't a demo and its notifications are on. Null for anyone else. A push
-- from a second business would open the first, so none goes until the app can
-- switch between them.
create function private.push_business(person uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select home.business_id
  from (
    select m.business_id
    from public.memberships m
    where m.user_id = person and m.active
    order by m.created_at
    limit 1
  ) home
  where not exists (
      select 1 from private.demo_businesses d where d.business_id = home.business_id
    )
    and private.module_enabled(home.business_id, 'notifications')
$$;

-- From now on a line goes to the phone at once when the person has a device
-- and it is their phone's business. Choices and quiet hours come in part 3.
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
    when private.push_business(person) = business
      and exists (select 1 from public.push_subscriptions s where s.user_id = person)
    then at_time
  end
$$;

-- Whether `person` can turn notifications on for a phone: the server asks
-- before it offers the switch (secret key).
create function public.push_allowed(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.push_business(person) is not null
$$;

------------------------------------------------------------------------------
-- Saving and forgetting devices (the server, for `actor`, after checking the
-- endpoint's host against the push services it knows)

create function private.endpoint_hash(push_endpoint text)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(push_endpoint, 'UTF8')), 'hex')
$$;

-- Forget these devices, and stop the pushes still on their way to them: a
-- line they leave with nothing to wait for says how it went.
create function private.forget_devices(devices uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lines uuid[];
begin
  if cardinality(coalesce(devices, '{}'::uuid[])) = 0 then
    return;
  end if;

  with stopped as (
    delete from public.push_deliveries d
    where d.device_id = any (devices) and d.state in ('queued', 'sending')
    returning d.notification_id
  )
  select coalesce(array_agg(distinct st.notification_id), '{}'::uuid[])
  into lines
  from stopped st;

  delete from public.push_subscriptions s where s.id = any (devices);
  perform private.settle_pushes(lines);
end;
$$;

-- Save this device for `actor`, or move it to them from whoever had it, whose
-- pushes still on the way to it stop. Refused (55000) for anyone whose phone
-- would get no lines: only in demo businesses, or with notifications off.
-- At most ten devices each: one new to `actor` forgets the one they were seen
-- on longest ago, so nobody multiplies their pushes (and the queue every
-- business shares) with devices that aren't there. Returns the device's id,
-- which the app keeps in a cookie for signing out.
create function public.save_push_subscription(
  actor uuid,
  push_endpoint text,
  key_p256dh text,
  key_auth text,
  device_label text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  this_hash text := private.endpoint_hash(push_endpoint);
  previous_owner uuid;
  device uuid;
  lines uuid[];
  oldest uuid[];
begin
  if private.push_business(actor) is null then
    raise exception 'Notifications reach a phone only in a business that is not a demo'
      using errcode = '55000';
  end if;

  -- One save at a time for each person, so the count below holds.
  perform 1 from public.profiles p where p.id = actor for no key update;

  select s.user_id into previous_owner
  from public.push_subscriptions s
  where s.endpoint_hash = this_hash
  for update;

  -- A device new to them: nine of theirs stay, the ones seen last.
  if previous_owner is distinct from actor then
    select coalesce(array_agg(extra.id), '{}'::uuid[])
    into oldest
    from (
      select s.id
      from public.push_subscriptions s
      where s.user_id = actor
      order by s.last_seen_at desc, s.created_at desc, s.id
      offset 9
    ) extra;
    perform private.forget_devices(oldest);
  end if;

  insert into public.push_subscriptions as s (
    user_id, endpoint, endpoint_hash, p256dh, auth_secret, label,
    created_at, last_seen_at
  )
  values (
    actor, push_endpoint, this_hash, key_p256dh, key_auth, device_label,
    at_time, at_time
  )
  on conflict (endpoint_hash) do update set
    user_id = excluded.user_id,
    endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    label = coalesce(excluded.label, s.label),
    last_seen_at = excluded.last_seen_at,
    failures = 0,
    failing_since = null,
    signed_out = 0,
    -- Someone new on the device starts from now: nothing of the last
    -- person's is theirs to see.
    last_fetched_at = case
      when s.user_id = excluded.user_id then s.last_fetched_at
      else excluded.last_seen_at
    end
  returning s.id into device;

  if previous_owner is not null and previous_owner <> actor then
    with stopped as (
      delete from public.push_deliveries d
      where d.device_id = device and d.state in ('queued', 'sending')
      returning d.notification_id
    )
    select coalesce(array_agg(st.notification_id), '{}'::uuid[])
    into lines
    from stopped st;
    perform private.settle_pushes(lines);
  end if;

  return device;
end;
$$;

-- Forget one of `actor`'s devices, by its id or its endpoint: only their own.
-- Returns whether one went.
create function public.remove_push_subscription(
  actor uuid,
  device uuid default null,
  push_endpoint text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions s
  where s.user_id = actor
    and (s.id = device or s.endpoint_hash = private.endpoint_hash(push_endpoint));
  return found;
end;
$$;

------------------------------------------------------------------------------
-- What the phone shows (/push/inbox)

-- A phone is asking what to show, with `actor` signed in on it: the business
-- whose lines it shows, and the moment after which they are new to it. The
-- device's last fetch, or when it was saved, and from now on this one. With
-- no endpoint (a browser that wouldn't say), the last hour. Nothing at all
-- when the device is someone else's or `actor`'s lines reach no phone: the
-- phone then shows a line that says nothing.
create function public.note_push_fetch(
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
  home uuid := private.push_business(actor);
  device public.push_subscriptions%rowtype;
begin
  if home is null then
    return;
  end if;
  if push_endpoint is null then
    return query select at_time - interval '1 hour', home;
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

  update public.push_subscriptions s
  set last_fetched_at = at_time, signed_out = 0
  where s.id = device.id;
  return query select coalesce(device.last_fetched_at, device.created_at), home;
end;
$$;

-- A phone asked what to show with nobody signed in. A session being renewed
-- at that moment can read as none, so only the third time in a row forgets
-- the device.
create function public.note_push_signed_out(push_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  times smallint;
begin
  update public.push_subscriptions s
  set signed_out = s.signed_out + 1
  where s.endpoint_hash = private.endpoint_hash(push_endpoint)
  returning s.signed_out into times;
  if times >= 3 then
    delete from public.push_subscriptions s
    where s.endpoint_hash = private.endpoint_hash(push_endpoint);
  end if;
end;
$$;

------------------------------------------------------------------------------
-- Sending

-- A line whose pushes are all done says how it went: sent if any device got
-- it, else skipped when every one stopped before sending, else failed.
create function private.settle_pushes(lines uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
  set push_state = case
    when exists (
      select 1 from public.push_deliveries d
      where d.notification_id = n.id and d.state = 'sent'
    ) then 'sent'
    when exists (
      select 1 from public.push_deliveries d
      where d.notification_id = n.id and d.state = 'skipped'
    ) and not exists (
      select 1 from public.push_deliveries d
      where d.notification_id = n.id and d.state = 'failed'
    ) then 'skipped'
    else 'failed'
  end
  where n.id = any (coalesce(lines, '{}'::uuid[]))
    and n.push_state = 'sending'
    and not exists (
      select 1 from public.push_deliveries d
      where d.notification_id = n.id and d.state in ('queued', 'sending')
    );
$$;

-- Pushes to send now, one row per line and device, each claimed once, so two
-- senders never send the same one. First, a send that died midway (claimed
-- five minutes ago) goes again; a line that can't go any more (read, past the
-- time it was for, nowhere to go, no longer the phone's business) stops; and
-- each line that is due becomes a fresh round of deliveries, one per device
-- the person has.
create function public.claim_due_pushes(
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
      or private.push_business(n.user_id) is distinct from n.business_id
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
        or private.push_business(n.user_id) is distinct from n.business_id
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

-- What the push services said, one answer per delivery claimed:
--   ok       sent; the device works again.
--   gone     404 or 410: the device is forgotten, with what waited for it.
--   refused  400 or 403 (a key the service won't take, a mistake of ours):
--            this one failed, counted against the device, which goes when it
--            refuses with three failures over a day, so one bug of ours never
--            forgets every phone at once.
--   retry    429, 5xx or no answer: again in 1, 5 and 25 minutes, or after
--            `wait` seconds when the service asked for longer, then failed
--            and counted against the device, which the daily clean-up then
--            forgets once it goes unseen (a host that never answers, say).
-- Anything else leaves the delivery claimed, to go again in five minutes.
create function public.finish_pushes(
  outcomes jsonb,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lines uuid[];
  refusing uuid[];
  exhausted uuid[];
begin
  if jsonb_typeof(outcomes) is distinct from 'array' then
    raise exception 'Outcomes must be an array' using errcode = '22023';
  end if;

  select
    coalesce(array_agg(distinct d.notification_id), '{}'::uuid[]),
    coalesce(
      array_agg(distinct d.device_id) filter (where o.outcome = 'refused'),
      '{}'::uuid[]
    )
  into lines, refusing
  from jsonb_to_recordset(outcomes) as o (delivery uuid, outcome text, wait integer)
  join public.push_deliveries d on d.id = o.delivery
  where d.state = 'sending';

  update public.push_deliveries d
  set state = 'sent', sent_at = at_time
  from jsonb_to_recordset(outcomes) as o (delivery uuid, outcome text, wait integer)
  where d.id = o.delivery and d.state = 'sending' and o.outcome = 'ok';

  update public.push_subscriptions s
  set last_success_at = at_time, failures = 0, failing_since = null
  where s.id in (
    select d.device_id
    from jsonb_to_recordset(outcomes) as o (delivery uuid, outcome text, wait integer)
    join public.push_deliveries d on d.id = o.delivery
    where o.outcome = 'ok' and d.state = 'sent'
  );

  with retried as (
    update public.push_deliveries d
    set state = case when d.attempts >= 4 then 'failed' else 'queued' end,
      next_at = at_time + greatest(
        case d.attempts
          when 1 then interval '1 minute'
          when 2 then interval '5 minutes'
          else interval '25 minutes'
        end,
        make_interval(secs => least(greatest(coalesce(o.wait, 0), 0), 3600))
      )
    from jsonb_to_recordset(outcomes) as o (delivery uuid, outcome text, wait integer)
    where d.id = o.delivery and d.state = 'sending' and o.outcome = 'retry'
    returning d.device_id, d.state
  )
  select coalesce(
    array_agg(distinct r.device_id) filter (where r.state = 'failed'),
    '{}'::uuid[]
  )
  into exhausted
  from retried r;

  update public.push_deliveries d
  set state = 'failed'
  from jsonb_to_recordset(outcomes) as o (delivery uuid, outcome text, wait integer)
  where d.id = o.delivery and d.state = 'sending' and o.outcome = 'refused';

  -- A refusal, or a push that never got through, counts against its device.
  update public.push_subscriptions s
  set failures = least(s.failures + 1, 1000),
    failing_since = coalesce(s.failing_since, at_time)
  where s.id = any (refusing || exhausted);
  delete from public.push_subscriptions s
  where s.id = any (refusing)
    and s.failures >= 3
    and s.failing_since <= at_time - interval '1 day';

  delete from public.push_subscriptions s
  where s.id in (
    select d.device_id
    from jsonb_to_recordset(outcomes) as o (delivery uuid, outcome text, wait integer)
    join public.push_deliveries d on d.id = o.delivery
    where o.outcome = 'gone' and d.state = 'sending'
  );

  perform private.settle_pushes(lines);
end;
$$;

-- "Send a test notification": a line for `actor` alone, in their phone's
-- business, that goes to their devices like any other. At most one every 30
-- seconds: false when it is too soon. Refused (55000) for anyone whose phone
-- gets no lines.
create function public.send_test_push(
  actor uuid,
  at_time timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  home uuid := private.push_business(actor);
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
    home, array[actor], 'push.test',
    actor => null,
    dedupe => 'push.test',
    push_until => at_time + interval '15 minutes',
    at_time => at_time
  ) > 0;
end;
$$;

------------------------------------------------------------------------------
-- Once a minute, and once a day

-- Ask the app to send, when something is due: a line queued, a delivery to try
-- again, or one whose send died. The app's address and the secret come from
-- Vault; without them nothing is called, and what is due goes out with the
-- next action in the app. The app answers at once and sends after, so pg_net's
-- five seconds never decide whether it sends. Part 4 runs the reminders here
-- first.
create function private.notifications_tick()
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
      select 1 from public.push_deliveries d
      where d.state = 'queued' and d.next_at <= now()
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

-- Once a day: deliveries done a week ago go, a push that waited a day goes no
-- more, a device not seen for 60 days is forgotten when it fails or hasn't
-- taken a push in those 60 days either (whatever it failed, so a device whose
-- push service never answers goes too), and the minute job's own history
-- keeps a week (about 525,000 rows a year otherwise). Part 4 also deletes old
-- lines here.
create function private.clean_notifications(at_time timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

select cron.schedule(
  'notifications', '* * * * *', $$select private.notifications_tick()$$
);
select cron.schedule(
  'notifications-clean', '17 3 * * *', $$select private.clean_notifications()$$
);

------------------------------------------------------------------------------
-- Who may call what

revoke execute on function private.push_business(uuid)
  from public, anon, authenticated;
revoke execute on function private.push_plan(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.endpoint_hash(text)
  from public, anon, authenticated;
revoke execute on function private.forget_devices(uuid[])
  from public, anon, authenticated;
revoke execute on function private.settle_pushes(uuid[])
  from public, anon, authenticated;
revoke execute on function private.notifications_tick()
  from public, anon, authenticated;
revoke execute on function private.clean_notifications(timestamptz)
  from public, anon, authenticated;

revoke execute on function public.push_allowed(uuid)
  from public, anon, authenticated;
revoke execute on function public.save_push_subscription(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.remove_push_subscription(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.note_push_fetch(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.note_push_signed_out(text)
  from public, anon, authenticated;
revoke execute on function public.claim_due_pushes(integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.finish_pushes(jsonb, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.send_test_push(uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.push_allowed(uuid) to service_role;
grant execute on function public.save_push_subscription(uuid, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.remove_push_subscription(uuid, uuid, text) to service_role;
grant execute on function public.note_push_fetch(uuid, text, timestamptz) to service_role;
grant execute on function public.note_push_signed_out(text) to service_role;
grant execute on function public.claim_due_pushes(integer, timestamptz) to service_role;
grant execute on function public.finish_pushes(jsonb, timestamptz) to service_role;
grant execute on function public.send_test_push(uuid, timestamptz) to service_role;
