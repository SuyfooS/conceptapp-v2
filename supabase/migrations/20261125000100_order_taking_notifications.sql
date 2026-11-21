-- Taking orders: "מוכן" on the sender's phone, and "המסך לא מחובר" (waiter
-- mode P8b, #191; §9 of the design, with §16's decision 8 as Orel accepted
-- it on 20 November 2026). A new group of lines, `orders`, last on the
-- settings screen, with two kinds. Each is about one ticket and says its
-- place, its department and how many of its items are still live: never a
-- price, a note, a label or a person, since a lock screen is seen by whoever
-- is near the phone.
--
--   order.ready   to the round's sender alone, when a ticket turns ready, by
--                 a person (public.set_order_ticket_ready) or a kitchen's
--                 screen (public.station_set_ticket_ready, with no actor),
--                 through private.notify_order_ready. Never to whoever
--                 marked it (a sender who prepares too knows), and never to
--                 anyone else: no cook hears of a new ticket, the screen is
--                 the kitchen's signal. Its push waits 10 seconds, as a
--                 chat's waits 15, so a mode open on the sender's phone shows
--                 it first; /orders-sync then reads the line
--                 (public.read_order_ready) and no push follows. Put back and
--                 ready again, it tells again.
--   order.unseen  "המסך לא מחובר", from the minute job
--                 (private.run_order_notices, in private.notifications_tick
--                 beside the reminders; the order-taking job runs hourly):
--                 once per ticket that no running prep screen of its
--                 department, or of every department, fetched 2 minutes
--                 after it was sent or called. To the sender, and to whoever
--                 runs orders and is on the clock (with the time clock on),
--                 its push at once. Only tickets of the last 10 minutes, so a
--                 minute job that missed its runs never tells late. A place
--                 with no running prep screen never gets one.
--
--   settled       a ticket leaving "ready" (served, put back, closed)
--                 settles its order.ready, and one fetched by a screen or no
--                 longer new its order.unseen, by a trigger on
--                 public.order_tickets; an order cancelled settles both for
--                 its tickets, by one on public.orders; the minute job
--                 settles what is left (a ticket whose every line went, an
--                 order closed) before it writes. Settling marks a line read,
--                 so Home's count leaves it out. The daily clean-up deletes
--                 every order.* line 2 days after it was written.
--   quiet hours   decision 8: during a shift (private.on_the_clock, with the
--                 time clock on) `orders` reaches the phone in quiet hours
--                 too (private.shift_groups), as the lines about pay always
--                 do; the group's switch still keeps it off the phone.
--                 private.push_plan asks private.push_skips_quiet, and the
--                 sends ask private.push_held_in, which reads the shift in
--                 the line's own business. Off a shift, or with the time
--                 clock off, a push waits out quiet hours as any other, and
--                 goes no more 30 minutes after it was written (its
--                 push_before): the line stays in the app.
--   staff only    'order_taking' joins private.notify's modules whose lines
--                 are for the staff alone: never an accountant.
--   the screen    public.order_mode gains `screens`: the live departments a
--                 running prep screen shows, for the "המסך לא מחובר ·
--                 {department}" of the order's screen and "ההזמנות שלי".
--   demo          in the app alone, as every line of a demo
--                 (private.push_business_ok), "המסך לא מחובר" included.
--
-- Locks: the ready functions take the business, the order and the ticket as
-- before, and then only write lines, as the triggers do. The minute job takes
-- no business and never waits: it settles lines skipping those a write
-- holds, and reads tickets `for share skip locked`, leaving one a write holds
-- for the next minute. So no cycle.
--
-- Errors: none new. Writing or settling a line never stops what wrote it: a
-- failure there is a warning.
--
-- Replaced, each its newest body plus only the change named: from
-- 20261115001700_roles_changes.sql private.notification_kind_groups (the two
-- kinds); from 20261112000200_reminders.sql private.notification_groups
-- (`orders` last), private.notifications_tick (the order notices after the
-- reminders, and a push held by the shift-aware check) and
-- private.clean_notifications (order.* lines after 2 days); from
-- 20261112000100_notification_preferences.sql private.push_plan (a shift's
-- group at once in quiet hours); from 20261115000900_roles_scheduling.sql
-- public.claim_due_pushes (the same check at the send) and private.notify
-- ('order_taking' staff only); from 20261124000100_order_taking_stations.sql
-- public.set_order_ticket_ready and public.station_set_ticket_ready (the
-- ready line); from 20261121000100_order_taking_mode.sql public.order_mode
-- (`screens`). private.notification_group needs no change: it reads
-- private.notification_kind_groups. The push_off check reads
-- private.notification_groups, a superset now, so every row stays valid.
-- packages/db/database.types.ts gains public.read_order_ready.

------------------------------------------------------------------------------
-- 1. The group and its kinds

-- 20261115001700_roles_changes.sql's, with the two lines about orders.
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
    ('role.changed', null::text),
    ('order.ready', 'orders'),
    ('order.unseen', 'orders'),
    ('push.test', null::text)
$$;

-- 20261112000200_reminders.sql's, with `orders` last.
create or replace function private.notification_groups()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'schedule', 'swaps', 'clock', 'approvals', 'team', 'lists', 'chat', 'documents',
    'orders'
  ]::text[]
$$;

-- The groups that reach the phone in quiet hours while the person is on a
-- shift (decision 8): a dish ready at 23:00 is no use at 07:00. The group's
-- switch still keeps them off. @domain/notifications' SHIFT_GROUPS, kept
-- equal by packages/db/notification-preferences.db.test.ts.
create function private.shift_groups()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['orders']::text[]
$$;

-- The order lines' own times, @domain/notifications' ORDER_NOTICE_RULES
-- (packages/db/notification-preferences.db.test.ts compares them): a ready
-- line's push waits `ready_delay`; a ticket no screen fetched tells
-- `unseen_after` after it was sent or called, and only within
-- `unseen_window` of that, so a minute job that missed its runs never tells
-- late; a line's push goes no more `push_for` after it was written; and the
-- lines are kept `kept`.
create function private.order_notice_rules()
returns table (
  ready_delay interval,
  unseen_after interval,
  unseen_window interval,
  push_for interval,
  kept interval
)
language sql
immutable
set search_path = ''
as $$
  values (
    interval '10 seconds',
    interval '2 minutes',
    interval '10 minutes',
    interval '30 minutes',
    interval '2 days'
  )
$$;

-- The open order lines, for the minute job's settling.
create index notifications_open_orders_idx
  on public.notifications (business_id)
  where kind in ('order.ready', 'order.unseen') and resolved_at is null;

------------------------------------------------------------------------------
-- 2. Quiet hours during a shift (decision 8)

-- Whether a line of `what` for `person` reaches their phone in their quiet
-- hours at `at_time`: its group is one a shift lets through, the business
-- has the time clock on, and they are on the clock there. Without the time
-- clock there is no shift to know of, so quiet hours hold as for any line.
create function private.push_skips_quiet(
  business uuid,
  person uuid,
  what text,
  at_time timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.notification_group(what) = any (private.shift_groups()), false)
    and private.module_enabled(business, 'time_clock'::public.module_key)
    and private.on_the_clock(business, person, at_time)
$$;

-- private.push_held, read in the line's business: a push of a shift's group
-- to someone on the clock there isn't held.
create function private.push_held_in(
  business uuid,
  person uuid,
  what text,
  at_time timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.push_held(person, what, at_time)
    and not private.push_skips_quiet(business, person, what, at_time)
$$;

-- 20261112000100_notification_preferences.sql's, with a shift's group at
-- once for someone on the clock. The group's switch still comes first.
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
        when private.push_skips_quiet(business, person, what, at_time) then at_time
        else coalesce(private.quiet_until(person, at_time), at_time)
      end
    )
  end
$$;

-- 20261115000900_roles_scheduling.sql's, holding a delivery in quiet hours
-- by private.push_held_in, so a shift's group goes. Nothing else changed.
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
        and not private.push_held_in(l.business_id, l.user_id, l.kind, at_time)
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
-- 3. For the staff alone

-- 20261115000900_roles_scheduling.sql's, with 'order_taking' among the
-- modules whose lines are for the staff alone: the orders are the floor's
-- and the kitchen's, never an accountant's. The same signature, so replaced
-- in place.
create or replace function private.notify(
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
      and (about is null or about not in ('scheduling', 'lists', 'order_taking')
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

------------------------------------------------------------------------------
-- 4. "מוכן"

-- What a line about a ticket says: its order and ticket, its place (id and
-- name) or its takeaway's number, its department (id and name), and how
-- many of its items are still live (not taken back, not cancelled). No
-- price, no note, no label, no person.
create function private.order_notice_facts(ticket uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order', t.order_id,
    'ticket', t.id,
    'place', o.place_id,
    'placeName', p.name,
    'takeaway', o.takeaway_no,
    'department', t.department_id,
    'departmentName', d.name,
    'count', coalesce((
      select sum(l.quantity)::integer
      from public.order_lines l
      where l.ticket_id = t.id
        and l.business_id = t.business_id
        and l.taken_back_at is null
        and l.cancelled_at is null
    ), 0)
  )
  from public.order_tickets t
  join public.orders o on o.id = t.order_id and o.business_id = t.business_id
  left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
  left join public.departments d on d.id = t.department_id and d.business_id = t.business_id
  where t.id = ticket
$$;

-- A ticket turned ready: its round's sender hears of it, unless they marked
-- it themselves (private.notify leaves the actor out; a station's ready has
-- none). Nothing once the sender was forgotten (after 30 days) or when no
-- line of it is live. The same ticket ready again tells again. Its push
-- waits a little, as a chat's does, so a mode open on the sender's phone
-- shows it first and reads it (public.read_order_ready); it goes no more
-- half an hour on. What marked it ready stands, whatever this does.
create function private.notify_order_ready(ticket uuid, actor uuid, at_time timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_business uuid;
  the_sender uuid;
  facts jsonb;
  told integer;
begin
  begin
    select t.business_id, r.sent_by into the_business, the_sender
    from public.order_tickets t
    join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
    where t.id = ticket;
    if the_sender is null then
      return 0;
    end if;
    facts := private.order_notice_facts(ticket);
    if coalesce((facts ->> 'count')::integer, 0) = 0 then
      return 0;
    end if;

    told := private.notify(
      the_business, array[the_sender], 'order.ready', facts, actor,
      'order_taking'::public.module_key, 'worker'::public.member_role,
      'order.ready:' || ticket::text,
      push_until => at_time + (select r.push_for from private.order_notice_rules() r),
      at_time => at_time
    );
    update public.notifications n
    set push_after = n.push_after + (select r.ready_delay from private.order_notice_rules() r)
    where n.business_id = the_business
      and n.user_id = the_sender
      and n.dedupe_key = 'order.ready:' || ticket::text
      and n.push_state = 'queued'
      and n.created_at = at_time;
    return told;
  exception when others then
    raise warning 'The ready line of ticket % was not written: %', ticket, sqlerrm;
    return 0;
  end;
end;
$$;

-- 20261124000100_order_taking_stations.sql's, telling the sender once it is
-- ready. Nothing else changed.
create or replace function public.set_order_ticket_ready(
  actor uuid,
  ticket uuid,
  ready boolean default true,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_business uuid;
  order_ref uuid;
  ticket_department uuid;
  the_order public.orders%rowtype;
  the_ticket public.order_tickets%rowtype;
begin
  select t.business_id, t.order_id, t.department_id
  into row_business, order_ref, ticket_department
  from public.order_tickets t
  where t.id = ticket;
  perform private.order_writer(row_business, actor);
  if not private.prepares_in(row_business, actor, ticket_department) then
    raise exception 'Those who prepare it only' using errcode = '42501';
  end if;
  if ready is null then
    raise exception 'Ready or not' using errcode = '22023';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select t.* into the_ticket from public.order_tickets t where t.id = ticket for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;

  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;
  if the_ticket.status = 'held' then
    raise exception 'It waits to be called' using errcode = '55000', hint = 'held';
  end if;

  if ready then
    if the_ticket.status in ('ready', 'served') then
      return;
    end if;
    update public.order_tickets t
    set status = 'ready',
      ready_at = at_time,
      ready_by = actor,
      prepared_at = coalesce(t.prepared_at, at_time)
    where t.id = the_ticket.id;
    perform private.notify_order_ready(the_ticket.id, actor, at_time);
  else
    if the_ticket.status = 'new' then
      return;
    end if;
    if the_ticket.status = 'served' then
      raise exception 'It was served' using errcode = '55000', hint = 'served';
    end if;
    if at_time > the_ticket.ready_at + interval '5 minutes' then
      raise exception 'The time to put it back passed' using errcode = '55000', hint = 'window';
    end if;
    update public.order_tickets t
    set status = 'new', ready_at = null, ready_by = null, ready_station = null
    where t.id = the_ticket.id;
  end if;
  perform private.bump_order_version(row_business);
end;
$$;

-- 20261124000100_order_taking_stations.sql's, telling the sender once it is
-- ready, with no actor: a kitchen's screen is nobody. Nothing else changed.
create or replace function public.station_set_ticket_ready(
  station_hash text,
  ticket uuid,
  ready boolean default true,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
  row_business uuid;
  order_ref uuid;
  ticket_department uuid;
  the_order public.orders%rowtype;
  the_ticket public.order_tickets%rowtype;
begin
  s := private.order_station(station_hash, 'prep');
  select t.business_id, t.order_id, t.department_id
  into row_business, order_ref, ticket_department
  from public.order_tickets t
  where t.id = ticket;
  if row_business is distinct from s.business_id
    or (s.department_id is not null and ticket_department is distinct from s.department_id)
  then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if ready is null then
    raise exception 'Ready or not' using errcode = '22023';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select t.* into the_ticket from public.order_tickets t where t.id = ticket for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;

  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;
  if the_ticket.status = 'held' then
    raise exception 'It waits to be called' using errcode = '55000', hint = 'held';
  end if;

  if ready then
    if the_ticket.status in ('ready', 'served') then
      return;
    end if;
    update public.order_tickets t
    set status = 'ready',
      ready_at = at_time,
      ready_by = null,
      ready_station = s.id,
      prepared_at = coalesce(t.prepared_at, at_time)
    where t.id = the_ticket.id;
    perform private.notify_order_ready(the_ticket.id, null, at_time);
    perform private.note_station(s.id, 'ready', at_time);
  else
    if the_ticket.status = 'new' then
      return;
    end if;
    if the_ticket.status = 'served' then
      raise exception 'It was served' using errcode = '55000', hint = 'served';
    end if;
    if at_time > the_ticket.ready_at + interval '5 minutes' then
      raise exception 'The time to put it back passed' using errcode = '55000', hint = 'window';
    end if;
    update public.order_tickets t
    set status = 'new', ready_at = null, ready_by = null, ready_station = null
    where t.id = the_ticket.id;
    perform private.note_station(s.id, 'putBack', at_time);
  end if;
  perform private.bump_order_version(row_business);
end;
$$;

------------------------------------------------------------------------------
-- 5. What settles them

-- A ticket left "ready" (served, put back, closed): its ready line is
-- settled. One fetched by a screen, or no longer new: its "המסך לא מחובר".
-- What changed the ticket stands, whatever this does.
create function private.settle_ticket_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if old.status = 'ready' and new.status <> 'ready' then
      perform private.resolve_notifications(new.business_id, 'order.ready:' || new.id::text);
    end if;
    if new.status <> 'new' or new.kitchen_seen_at is not null then
      perform private.resolve_notifications(new.business_id, 'order.unseen:' || new.id::text);
    end if;
  exception when others then
    raise warning 'The lines of ticket % were not settled: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger order_tickets_settle_notices
  after update of status, kitchen_seen_at on public.order_tickets
  for each row
  when (
    old.status is distinct from new.status
    or (old.kitchen_seen_at is null and new.kitchen_seen_at is not null)
  )
  execute function private.settle_ticket_notices();

-- An order cancelled: every line about its tickets is settled. The cancel
-- stands, whatever this does.
create function private.settle_order_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  each_ticket uuid;
begin
  begin
    for each_ticket in
      select t.id
      from public.order_tickets t
      where t.order_id = new.id and t.business_id = new.business_id
      order by t.id
    loop
      perform private.resolve_notifications(new.business_id, 'order.ready:' || each_ticket::text);
      perform private.resolve_notifications(new.business_id, 'order.unseen:' || each_ticket::text);
    end loop;
  exception when others then
    raise warning 'The lines of order % were not settled: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger orders_settle_notices
  after update of status on public.orders
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function private.settle_order_notices();

-- Ready tickets shown to their sender: /orders-sync gave them their own
-- rounds with these in them, so their lines are read and no push follows,
-- as an open conversation reads a chat's line. Only `actor`'s own unread
-- ready lines, of at most 200 tickets; the server calls it for the
-- signed-in person, never while they view as someone. Returns how many it
-- marked.
create function public.read_order_ready(actor uuid, business uuid, tickets uuid[])
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
      and n.kind = 'order.ready'
      and n.read_at is null
      and n.dedupe_key in (
        select 'order.ready:' || w.one::text
        from unnest((coalesce(tickets, '{}'::uuid[]))[1:200]) as w (one)
      )
    returning 1
  )
  select count(*)::integer from done
$$;

------------------------------------------------------------------------------
-- 6. "המסך לא מחובר", once a minute

-- In every business with taking orders and notifications on (a demo's in
-- the app alone), or only `for_business` (the tests'), at `at_time` (the
-- minute job's now, or the moment a test chooses), each business in its own
-- block, so one that fails leaves the others' coming. First the lines whose
-- ticket no longer waits (no longer ready, or new and unseen; its order no
-- longer open; no line of it live) are settled, skipping any a write holds.
-- Then each ticket new and unseen, with a line live, of an open order, sent
-- or called between `unseen_window` and `unseen_after` ago, whose department
-- a running prep screen shows (its own, or every one), and with no line
-- about it yet, tells its sender and whoever runs orders and is on the clock
-- (only with the time clock on), once. A ticket a write holds waits for the
-- next minute. Returns how many lines it wrote.
create function private.run_order_notices(
  at_time timestamptz default now(),
  for_business uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  each_business uuid;
  late record;
  recipients uuid[];
  wait_for interval;
  look_back interval;
  push_within interval;
  written integer := 0;
begin
  select r.unseen_after, r.unseen_window, r.push_for
  into wait_for, look_back, push_within
  from private.order_notice_rules() r;

  for each_business in
    select b.id
    from public.businesses b
    where (for_business is null or b.id = for_business)
      and private.order_taking_on(b.id)
      and private.module_enabled(b.id, 'notifications'::public.module_key)
    order by b.id
  loop
    begin
      update public.notifications n
      set read_at = coalesce(n.read_at, at_time),
        resolved_at = at_time,
        push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
      where n.id in (
        select o.id
        from public.notifications o
        where o.business_id = each_business
          and o.kind in ('order.ready', 'order.unseen')
          and o.resolved_at is null
          and not exists (
            select 1
            from public.order_tickets t
            join public.orders w on w.id = t.order_id and w.business_id = t.business_id
            where t.business_id = o.business_id
              and t.id = case
                when pg_input_is_valid(o.params ->> 'ticket', 'uuid')
                  then (o.params ->> 'ticket')::uuid
              end
              and w.status = 'open'
              and (
                (o.kind = 'order.ready' and t.status = 'ready')
                or (o.kind = 'order.unseen' and t.status = 'new' and t.kitchen_seen_at is null)
              )
              and exists (
                select 1 from public.order_lines l
                where l.ticket_id = t.id
                  and l.business_id = t.business_id
                  and l.taken_back_at is null
                  and l.cancelled_at is null
              )
          )
        for update of o skip locked
      );

      for late in
        select t.id as ticket_id, r.sent_by as sender
        from public.order_tickets t
        join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
        join public.orders w on w.id = t.order_id and w.business_id = t.business_id
        where t.business_id = each_business
          and t.status = 'new'
          and t.kitchen_seen_at is null
          and w.status = 'open'
          and coalesce(t.fired_at, r.sent_at) > at_time - look_back
          and coalesce(t.fired_at, r.sent_at) <= at_time - wait_for
          and exists (
            select 1 from public.order_lines l
            where l.ticket_id = t.id
              and l.business_id = t.business_id
              and l.taken_back_at is null
              and l.cancelled_at is null
          )
          and exists (
            select 1 from public.clock_stations s
            where s.business_id = t.business_id
              and s.shows = 'prep'
              and s.stopped_at is null
              and (s.department_id is null or s.department_id = t.department_id)
          )
          and not exists (
            select 1 from public.notifications n
            where n.business_id = t.business_id
              and n.dedupe_key = 'order.unseen:' || t.id::text
          )
        order by t.id
        for share of t skip locked
      loop
        recipients := array_remove(array[late.sender], null);
        if private.module_enabled(each_business, 'time_clock'::public.module_key) then
          recipients := recipients || array(
            select h.person
            from unnest(private.members_holding(each_business, 'order_taking.edit')) as h (person)
            where private.on_the_clock(each_business, h.person, at_time)
          );
        end if;
        if cardinality(recipients) > 0 then
          written := written + private.notify(
            each_business, recipients, 'order.unseen',
            private.order_notice_facts(late.ticket_id), null,
            'order_taking'::public.module_key, 'worker'::public.member_role,
            'order.unseen:' || late.ticket_id::text,
            realert => false,
            push_until => at_time + push_within,
            at_time => at_time
          );
        end if;
      end loop;
    exception when others then
      raise warning 'Order notices did not run for business %: %', each_business, sqlerrm;
    end;
  end loop;
  return written;
end;
$$;

-- 20261112000200_reminders.sql's, with the order notices after the
-- reminders, so what they queue goes this same minute, and a delivery held
-- by private.push_held_in. A failure there never stops the sending. The
-- rest is as it was.
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
  begin
    perform private.run_reminders(now());
  exception when others then
    raise warning 'Reminders did not run: %', sqlerrm;
  end;
  begin
    perform private.run_order_notices(now());
  exception when others then
    raise warning 'Order notices did not run: %', sqlerrm;
  end;

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
        and not private.push_held_in(n.business_id, n.user_id, n.kind, now())
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

-- 20261112000200_reminders.sql's, with every line about orders going 2 days
-- after it was written. The rest is as it was.
create or replace function private.clean_notifications(at_time timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
  where n.created_at < at_time - interval '180 days'
    or (n.read_at is not null and n.created_at < at_time - interval '90 days')
    or (
      n.kind like 'order.%'
      and n.created_at < at_time - (select r.kept from private.order_notice_rules() r)
    );

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

------------------------------------------------------------------------------
-- 7. The order's screen

-- 20261121000100_order_taking_mode.sql's, with `screens`: the live
-- departments a running prep screen shows (its own, or every one), in the
-- business's order, for a view as a role on the staff too. A ticket of one
-- that no screen fetched in 2 minutes says "המסך לא מחובר". Nothing else
-- changed.
create or replace function public.order_mode(business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reader uuid := (select auth.uid());
  is_viewing boolean := false;
  reads_all boolean;
  taker_refusal text;
  own uuid[];
  current_version bigint;
  today date;
begin
  if not private.order_taking_on(business) then
    return null;
  end if;
  if exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = reader
      and m.active
      and private.is_staff_role(m.role)
  ) then
    reads_all := private.runs_orders(business, reader);
    taker_refusal := private.order_taker_refusal(business, reader, now());
  elsif private.is_viewing_staff(business) then
    is_viewing := true;
    reads_all := exists (
      select 1 from private.viewed_perms() v
      where v.business_id = business and v.perm = 'order_taking.edit'
    );
  else
    return null;
  end if;

  select coalesce(array_agg(d.id order by d.position, d.key), '{}'::uuid[]) into own
  from public.departments d
  where d.business_id = business
    and d.archived_at is null
    and (is_viewing or reads_all or private.in_department(d.id, reader))
    -- As private.line_route has it: the item's own department, else its
    -- category's; d is live.
    and exists (
      select 1
      from public.menu_items i
      join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
      where i.business_id = business
        and i.archived_at is null
        and c.archived_at is null
        and coalesce(i.department_id, c.department_id) = d.id
    );

  select v.version into current_version
  from private.order_versions v
  where v.business_id = business;
  today := private.order_business_day(business, now());

  return jsonb_build_object(
    'version', coalesce(current_version, 0),
    'takes', is_viewing or taker_refusal is distinct from 'not_taker',
    'runs', reads_all,
    'viewing', is_viewing,
    'clock', case
      when not is_viewing and taker_refusal in ('clock', 'stale_shift') then taker_refusal
    end,
    'departments', to_jsonb(own),
    'ready', case
      when is_viewing then 0
      else (
        select count(*)
        from public.order_tickets t
        join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
        join public.orders o on o.id = t.order_id and o.business_id = t.business_id
        where t.business_id = business
          and r.sent_by = reader
          and t.status = 'ready'
          and o.status = 'open'
          and private.order_business_day(business, r.sent_at) = today
          and exists (
            select 1 from public.order_lines l
            where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
          )
      )
    end,
    'making', case
      when is_viewing then 0
      else (
        select count(*)
        from public.order_tickets t
        join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
        join public.orders o on o.id = t.order_id and o.business_id = t.business_id
        where t.business_id = business
          and r.sent_by = reader
          and t.status = 'new'
          and o.status = 'open'
          and private.order_business_day(business, r.sent_at) = today
          and exists (
            select 1 from public.order_lines l
            where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
          )
      )
    end,
    'waiting', (
      select coalesce(jsonb_agg(
        jsonb_build_object('department', w.department_id, 'count', w.tickets)
        order by w.place_of, w.key_of
      ), '[]'::jsonb)
      from (
        select d.id as department_id, d.position as place_of, d.key as key_of,
          count(*) as tickets
        from public.order_tickets t
        join public.orders o on o.id = t.order_id and o.business_id = t.business_id
        join public.departments d on d.id = t.department_id and d.business_id = t.business_id
        where t.business_id = business
          and t.status = 'new'
          and o.status = 'open'
          and t.department_id = any (own)
          and exists (
            select 1 from public.order_lines l
            where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
          )
        group by d.id, d.position, d.key
      ) w
    ),
    'soldOut', (
      select count(*)
      from public.menu_items i
      join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
      where i.business_id = business
        and i.archived_at is null
        and c.archived_at is null
        and not i.available
    ),
    'screens', (
      select coalesce(jsonb_agg(d.id order by d.position, d.key), '[]'::jsonb)
      from public.departments d
      where d.business_id = business
        and d.archived_at is null
        and exists (
          select 1 from public.clock_stations s
          where s.business_id = business
            and s.shows = 'prep'
            and s.stopped_at is null
            and (s.department_id is null or s.department_id = d.id)
        )
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The database's own: nobody calls them.
revoke execute on function private.shift_groups() from public, anon, authenticated;
revoke execute on function private.order_notice_rules() from public, anon, authenticated;
revoke execute on function private.push_skips_quiet(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.push_held_in(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.order_notice_facts(uuid) from public, anon, authenticated;
revoke execute on function private.notify_order_ready(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.settle_ticket_notices() from public, anon, authenticated;
revoke execute on function private.settle_order_notices() from public, anon, authenticated;
revoke execute on function private.run_order_notices(timestamptz, uuid)
  from public, anon, authenticated;

-- The sync's, with the secret key alone.
revoke execute on function public.read_order_ready(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.read_order_ready(uuid, uuid, uuid[]) to service_role;

-- Replaced in place, the same signatures, so their grants stay; set again
-- all the same.
revoke execute on function private.notification_kind_groups()
  from public, anon, authenticated;
revoke execute on function private.notification_groups()
  from public, anon, authenticated;
revoke execute on function private.push_plan(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.claim_due_pushes(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_due_pushes(integer, timestamptz) to service_role;
revoke execute on function private.notify(
  uuid, uuid[], text, jsonb, uuid, public.module_key, public.member_role, text,
  boolean, timestamptz, timestamptz, uuid[], text
) from public, anon, authenticated;
revoke execute on function private.notifications_tick()
  from public, anon, authenticated;
revoke execute on function private.clean_notifications(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.set_order_ticket_ready(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_order_ticket_ready(uuid, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.station_set_ticket_ready(text, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.station_set_ticket_ready(text, uuid, boolean, timestamptz)
  to service_role;
-- The screens read it with the person's own session.
revoke execute on function public.order_mode(uuid) from public, anon;
grant execute on function public.order_mode(uuid) to authenticated;
