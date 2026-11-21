-- Taking orders: the kitchen's and the till's screens (waiter mode P8a,
-- #191). A tablet is locked from /orders/prep as the kitchen's screen (one
-- department, or every one) or as the till, holding nobody's account, on the
-- clock station's one registry (20261108000200_qr_clock.sql): the device
-- keeps its secret in its cookie, the database keeps its hash.
--
--   the registry  each station shows something: the clock's code
--                 ('clock_code', every station so far), a prep screen
--                 ('prep', with its department or none for every one) or
--                 the till ('till'), and keeps what it last did and when,
--                 for the list of screens. The clock's editors read the
--                 clock's rows as before; those who run orders read the
--                 others. The secret is still never granted. One cap of ten
--                 running stations in a business, every kind together
--                 (approve_station_pairing's count already reads them all).
--   who did it    a ticket made ready, served by a close, an order closed
--                 or opened again, and an item marked sold out by a station
--                 keep that station (ready_station, served_station,
--                 closed_station, reopened_station and P1's
--                 available_station, which gets its key), never a person:
--                 each beside its person column, at most one of the two.
--   locking       public.lock_order_station, by whoever runs orders, as the
--                 clock's lock: the server pairs and approves at once, on
--                 one of the business's own pairings. Logged as
--                 order.station.add, read by order_taking.edit
--                 (private.log_perm's (menu|order) arm).
--   reading       by the station's secret, with the secret key (a station
--                 has nobody signed in): public.station_order_prep (its
--                 department's tickets, or every one's, no price, marking
--                 the new ones seen), station_order_menu (the items that
--                 reach it, for "מה נגמר", no price) and station_order_till
--                 (the open orders and today's closed and cancelled, by item
--                 and by round, no label, no person, no total). Each stamps
--                 the station seen, at most once a minute.
--   writing       by the secret too: public.station_set_ticket_ready (and
--                 back within 5 minutes), station_set_item_available,
--                 station_close_order, station_reopen_order and
--                 station_undo_close_order (the close's "ביטול", within 2
--                 minutes, by the same station), each as the person's write
--                 decides, with the same refusals. No log row: a person's
--                 ready, close and reopen write none either.
--
-- Errors, which @db/order-station-failures reads: 42501 'Not a station' for a
-- secret that is no station's, with hint 'stopped' for a stopped one,
-- 'shows' for a station of another kind and 'off' while taking orders is
-- off; P0002 'Unknown order' for an order or a ticket not the station's
-- (another business's, another department's, or none, word for word alike)
-- and 'Unknown item' for an item of another business or none, while an item
-- of another department is 42501 with no hint; 22023 hint 'shows' for a kind
-- no lock makes, 'route' for a department that isn't live; 28000 a pairing
-- missing or expired; 54000 ten running; and P3's 55000 hints ('closed',
-- 'held', 'served', 'window', 'day', 'not_closed', 'archived') and 23505
-- hint 'taken'.
--
-- Replaced, each its newest body with only the lines named: from
-- 20261108000200_qr_clock.sql public.station_by_token (two keys more: what
-- it shows and its department), public.issue_station_code (a kitchen's or a
-- till's secret makes no clock code, which would vouch for punches) and
-- public.set_clock_station_stopped (an order station is stopped by whoever
-- runs orders or edits the clock, taking orders on or off, and started again
-- only by whoever runs orders while it is on; logged as order.station.stop
-- and restart; the clock's as before); from
-- 20261120000300_order_taking_orders.sql
-- public.set_order_ticket_ready (back to new clears ready_station),
-- public.serve_order_ticket (not served clears served_station) and
-- public.reopen_order (clears closed_station and reopened_station); from
-- 20261122000100_order_taking_fixes.sql public.undo_close_order (the same).
-- Without those, a person's write after a station's would break the checks
-- that keep one of the two. public.close_order needs no change: an open
-- order holds no closed_station and its unserved tickets no served_station.
-- public.reset_demo_business needs none either: it deletes the business,
-- and its stations of every kind go with it (on delete cascade).
-- packages/db/database.types.ts gains the columns and the functions.

------------------------------------------------------------------------------
-- 1. The one registry

alter table public.clock_stations
  add column shows text not null default 'clock_code'
    check (shows in ('clock_code', 'prep', 'till')),
  add column department_id uuid,
  add column last_action text
    check (last_action in ('ready', 'putBack', 'soldOut', 'available', 'close', 'reopen')),
  add column last_action_at timestamptz,
  add constraint clock_stations_department_prep check (department_id is null or shows = 'prep'),
  add constraint clock_stations_last_action_at check ((last_action is null) = (last_action_at is null)),
  -- A department is archived, never deleted: checked at commit, as the
  -- menu's categories are, since a business going takes both together.
  add foreign key (department_id, business_id)
    references public.departments (id, business_id) deferrable initially deferred;

create index clock_stations_department_idx on public.clock_stations (department_id, business_id);

comment on column public.clock_stations.shows is
  'What the station shows: the clock''s code (clock_code), a prep screen (prep) or the till (till).';
comment on column public.clock_stations.department_id is
  'A prep screen''s department; null for every department. Prep screens only.';
comment on column public.clock_stations.last_action is
  'What the station last did (ready, putBack, soldOut, available, close, reopen), for the list of screens.';
comment on column public.clock_stations.last_action_at is
  'When the station last did it.';

-- Still never the secret's hash.
grant select (shows, department_id, last_action, last_action_at)
  on public.clock_stations to authenticated;

-- 20261115001100_roles_clock.sql's, for the clock's own rows only.
alter policy "the clock's editors read the business's stations" on public.clock_stations
  using (
    shows = 'clock_code'
    and private.module_enabled(business_id, 'time_clock')
    and business_id in (select private.businesses_holding('clock.edit'))
  );

-- The kitchen's and the till's screens, for those who run orders, who lock
-- and stop them (a view as a role that runs them reads them too).
create policy "order_taking's runners read its stations"
  on public.clock_stations for select to authenticated
  using (
    shows in ('prep', 'till')
    and private.module_enabled(business_id, 'order_taking')
    and business_id in (select private.businesses_holding('order_taking.edit'))
  );

------------------------------------------------------------------------------
-- 2. Who did it, by station

alter table public.order_tickets
  add column ready_station uuid references public.clock_stations (id) on delete set null,
  add column served_station uuid references public.clock_stations (id) on delete set null,
  add constraint order_tickets_ready_station_check check (ready_station is null or ready_at is not null),
  add constraint order_tickets_served_station_check check (served_station is null or served_at is not null),
  add constraint order_tickets_ready_one_check check (num_nonnulls(ready_by, ready_station) <= 1),
  add constraint order_tickets_served_one_check check (num_nonnulls(served_by, served_station) <= 1);

alter table public.orders
  add column closed_station uuid references public.clock_stations (id) on delete set null,
  add column reopened_station uuid references public.clock_stations (id) on delete set null,
  add constraint orders_closed_station_check check (closed_station is null or closed_at is not null),
  add constraint orders_reopened_station_check check (reopened_station is null or reopened_at is not null),
  add constraint orders_closed_one_check check (num_nonnulls(closed_by, closed_station) <= 1),
  add constraint orders_reopened_one_check check (num_nonnulls(reopened_by, reopened_station) <= 1);

-- P1 left it without a key "until stations show menus". Always null so far.
alter table public.menu_items
  add constraint menu_items_available_station_fkey
    foreign key (available_station) references public.clock_stations (id) on delete set null;

-- One index for each new key, as for every key of the orders.
create index order_tickets_ready_station_idx on public.order_tickets (ready_station);
create index order_tickets_served_station_idx on public.order_tickets (served_station);
create index orders_closed_station_idx on public.orders (closed_station);
create index orders_reopened_station_idx on public.orders (reopened_station);
create index menu_items_available_station_idx on public.menu_items (available_station);

comment on column public.order_tickets.ready_station is
  'The station that marked it ready, in place of a person (ready_by).';
comment on column public.order_tickets.served_station is
  'The station whose close served it, in place of a person (served_by).';
comment on column public.orders.closed_station is
  'The till that closed it, in place of a person (closed_by).';
comment on column public.orders.reopened_station is
  'The till that opened it again, in place of a person (reopened_by).';

------------------------------------------------------------------------------
-- 3. Helpers

-- The running station of `wanted` kind whose secret's hash this is, as it
-- stands (no lock): 42501 'Not a station' for none, hint 'stopped' for a
-- stopped one, 'shows' for another kind, 'off' while taking orders is off
-- in its business. 22023 for something that is no hash.
create function private.order_station(station_hash text, wanted text)
returns public.clock_stations
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
begin
  if station_hash is null or station_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A station''s hash is 64 hex digits' using errcode = '22023';
  end if;
  select st.* into s from public.clock_stations st where st.token_hash = station_hash;
  if not found then
    raise exception 'Not a station' using errcode = '42501';
  end if;
  if s.stopped_at is not null then
    raise exception 'This station was stopped' using errcode = '42501', hint = 'stopped';
  end if;
  if s.shows is distinct from wanted then
    raise exception 'This station shows something else' using errcode = '42501', hint = 'shows';
  end if;
  if not private.order_taking_on(s.business_id) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;
  return s;
end;
$$;

-- Stamps a station seen, at most once a minute (as issue_station_code
-- does), and, with `what`, what it just did.
create function private.note_station(station uuid, what text, at_time timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.clock_stations st
  set last_seen_at = case
      when st.last_seen_at is null or st.last_seen_at < at_time - interval '1 minute' then at_time
      else st.last_seen_at
    end,
    last_action = coalesce(what, st.last_action),
    last_action_at = case when what is null then st.last_action_at else at_time end
  where st.id = station
    and (
      what is not null
      or st.last_seen_at is null
      or st.last_seen_at < at_time - interval '1 minute'
    )
$$;

-- An order as the till reads it (public.station_order_till): where it is,
-- its times, whether `station` closed it, how many held blocks with a live
-- line wait and how many tickets are ready, the departments of what isn't
-- served yet, and what to ring up by item and by round, as
-- public.order_till groups it, with no person and no label. A cancelled
-- order has nothing to ring up. No total.
create function private.station_till_order(order_ref uuid, station uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'place', (
      select jsonb_build_object('id', p.id, 'name', p.name)
      from public.order_places p
      where p.id = o.place_id and p.business_id = o.business_id
    ),
    'takeaway', o.takeaway_no,
    'openedAt', o.opened_at,
    'reopenedAt', o.reopened_at,
    'closedAt', o.closed_at,
    'cancelledAt', o.cancelled_at,
    'cancelReason', o.cancel_reason,
    'closedHere', coalesce(o.closed_station = station, false),
    'held', (
      select count(*)::integer
      from public.order_tickets t
      where t.order_id = o.id
        and t.business_id = o.business_id
        and t.status = 'held'
        and exists (
          select 1 from public.order_lines l
          where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
        )
    ),
    'ready', (
      select count(*)::integer
      from public.order_tickets t
      where t.order_id = o.id
        and t.business_id = o.business_id
        and t.status = 'ready'
        and exists (
          select 1 from public.order_lines l
          where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
        )
    ),
    'unserved', (
      select coalesce(jsonb_agg(u.department_id order by u.position, u.key), '[]'::jsonb)
      from (
        select distinct t.department_id, d.position, d.key
        from public.order_tickets t
        join public.departments d on d.id = t.department_id and d.business_id = t.business_id
        where t.order_id = o.id
          and t.business_id = o.business_id
          and t.status in ('new', 'ready')
          and exists (
            select 1 from public.order_lines l
            where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
          )
      ) u
    ),
    'byItem', case when o.status = 'cancelled' then '[]'::jsonb else (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'name', g.name,
          'choices', g.choice_names,
          'unitAgorot', g.unit_agorot,
          'quantity', g.quantity,
          'comped', g.comped
        )
        order by g.first_sent, g.first_place, g.name
      ), '[]'::jsonb)
      from (
        select x.name, x.choice_names, x.unit_agorot, x.comped,
          sum(x.quantity)::integer as quantity,
          min(x.sent_at) as first_sent,
          min(x.position) as first_place
        from (
          select l.name, l.unit_agorot, l.quantity, l.position, r.sent_at,
            l.comped_at is not null as comped,
            (
              select coalesce(jsonb_agg(c.value -> 'optionName' order by c.n), '[]'::jsonb)
              from jsonb_array_elements(l.choices) with ordinality as c (value, n)
            ) as choice_names
          from public.order_lines l
          join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
          join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
          where t.order_id = o.id
            and l.taken_back_at is null
            and l.cancelled_at is null
        ) x
        group by x.name, x.choice_names, x.unit_agorot, x.comped
      ) g
    ) end,
    'byRound', case when o.status = 'cancelled' then '[]'::jsonb else (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'sentAt', r.sent_at,
          'lines', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'name', l.name,
                'choices', (
                  select coalesce(jsonb_agg(c.value -> 'optionName' order by c.n), '[]'::jsonb)
                  from jsonb_array_elements(l.choices) with ordinality as c (value, n)
                ),
                'quantity', l.quantity,
                'unitAgorot', l.unit_agorot,
                'comped', l.comped_at is not null
              )
              order by l.position, l.id
            ), '[]'::jsonb)
            from public.order_lines l
            join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
            where t.round_id = r.id
              and l.taken_back_at is null
              and l.cancelled_at is null
          )
        )
        order by r.sent_at, r.id
      ), '[]'::jsonb)
      from public.order_rounds r
      where r.order_id = o.id and r.business_id = o.business_id
    ) end
  )
  from public.orders o
  where o.id = order_ref
$$;

------------------------------------------------------------------------------
-- 4. Locking a device as the kitchen's screen or the till

-- Whoever runs orders makes the device they are on a station of their
-- business showing `station_shows` ('prep', with `station_department` or
-- none for every department, or 'till'), named `station_name`, through the
-- pairing `pairing` the server just started for it, as
-- approve_station_pairing does for the clock's. Returns the station's id.
-- 42501 while taking orders is off (hint 'off') and for anyone who doesn't
-- run orders; 22023 for another kind or a till with a department (hint
-- 'shows'), a department that isn't a live one of the business (hint
-- 'route') and a name that is no name; 28000 for a pairing missing or
-- expired; 54000 with ten stations of the business running, every kind
-- together. The business is locked first, so two locks at once can't pass
-- ten between them.
create function public.lock_order_station(
  actor uuid,
  business uuid,
  station_name text,
  station_shows text,
  station_department uuid default null,
  pairing text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p private.station_pairings%rowtype;
  made uuid;
begin
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;
  if not private.runs_orders(business, actor) then
    raise exception 'Those who run orders only' using errcode = '42501';
  end if;

  if station_shows is null or station_shows not in ('prep', 'till') then
    raise exception 'A kitchen''s screen or a till' using errcode = '22023', hint = 'shows';
  end if;
  if station_shows = 'till' and station_department is not null then
    raise exception 'A till shows every department' using errcode = '22023', hint = 'shows';
  end if;
  if station_department is not null and not exists (
    select 1 from public.departments d
    where d.id = station_department and d.business_id = business and d.archived_at is null
  ) then
    raise exception 'Not a live department of the business' using errcode = '22023', hint = 'route';
  end if;
  if station_name is null
    or char_length(btrim(station_name)) not between 1 and 40
    or station_name ~ '[[:cntrl:]]'
  then
    raise exception 'A station needs a name of up to 40 characters' using errcode = '22023';
  end if;

  perform 1 from public.businesses b where b.id = business for no key update;

  select * into p from private.station_pairings sp
  where sp.pairing_hash = pairing and sp.expires_at > at_time
  for update;
  if not found then
    raise exception 'The pairing code is missing or expired' using errcode = '28000';
  end if;

  if (
    select count(*) from public.clock_stations s
    where s.business_id = business and s.stopped_at is null
  ) >= 10 then
    raise exception 'At most ten stations' using errcode = '54000';
  end if;

  insert into public.clock_stations (
    business_id, name, token_hash, created_by, created_at, shows, department_id
  )
  values (
    business, btrim(station_name), p.token_hash, actor, at_time, station_shows, station_department
  )
  returning id into made;

  delete from private.station_pairings sp where sp.pairing_hash = p.pairing_hash;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'order.station.add',
    jsonb_build_object(
      'station', made,
      'name', btrim(station_name),
      'shows', station_shows,
      'department', station_department
    ));

  return made;
end;
$$;

------------------------------------------------------------------------------
-- 5. The registry's own functions, replaced

-- 20261108000200_qr_clock.sql's, with what it shows and its department.
create or replace function public.station_by_token(token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'station', s.id,
    'name', s.name,
    'business', b.id,
    'businessName', b.name,
    'accent', b.accent,
    'timeZone', b.timezone,
    'stopped', s.stopped_at is not null,
    'shows', s.shows,
    'department', s.department_id
  )
  from public.clock_stations s
  join public.businesses b on b.id = s.business_id
  where s.token_hash = station_by_token.token_hash
$$;

-- 20261108000200_qr_clock.sql's, refusing a station that doesn't show the
-- clock's code: a kitchen's or a till's secret never makes a code, which
-- would vouch for a punch as a station's.
create or replace function public.issue_station_code(
  token_hash text,
  code_hash text,
  short_hash text,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
  expires timestamptz := at_time + private.punch_code_ttl();
begin
  if token_hash !~ '^[0-9a-f]{64}$' or code_hash !~ '^[0-9a-f]{64}$'
    or short_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hashes must be 64 hex digits' using errcode = '22023';
  end if;

  select * into s from public.clock_stations st
  where st.token_hash = issue_station_code.token_hash;
  if not found then
    raise exception 'Not a station' using errcode = '42501';
  end if;
  if s.shows <> 'clock_code' then
    raise exception 'Not a station' using errcode = '42501';
  end if;

  if s.stopped_at is not null then
    raise exception 'This station was stopped' using errcode = '42501';
  end if;

  perform private.check_time_clock_on(s.business_id);

  if coalesce(private.clock_setting(s.business_id, 'codeDisplay'), 'both') = 'manager' then
    raise exception 'This business shows codes on a manager''s phone only' using errcode = '42501';
  end if;

  update public.clock_stations
  set last_seen_at = at_time
  where id = s.id and (last_seen_at is null or last_seen_at < at_time - interval '1 minute');

  perform private.trim_punch_codes(s.business_id, null, s.id, at_time);

  insert into public.punch_codes (code_hash, short_hash, business_id, station_id, expires_at, created_at)
  values (code_hash, short_hash, s.business_id, s.id, expires, at_time);

  return jsonb_build_object('business', s.business_id, 'station', s.id, 'expires', expires);
end;
$$;

-- 20261108000200_qr_clock.sql's: the clock's station as before, by whoever
-- edits the clock; a kitchen's screen or a till stopped by whoever runs
-- orders or edits the clock of its business, taking orders on or off, so a
-- device left as one never outlives taking orders switched off, nor keeps
-- one of the ten; started again only by whoever runs orders, while taking
-- orders is on (42501 hint 'off'). Logged as order.station.stop and restart
-- with what it shows.
create or replace function public.set_clock_station_stopped(
  actor uuid,
  station uuid,
  stopped boolean,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
begin
  select * into s from public.clock_stations where id = station for update;
  if not found then
    raise exception 'Unknown station' using errcode = 'P0002';
  end if;

  if s.shows = 'clock_code' then
    perform private.check_time_clock_on(s.business_id);

    if not private.can_edit_clock(s.business_id, actor) then
      raise exception 'Managers and owners only' using errcode = '42501';
    end if;
  elsif stopped then
    if not private.runs_orders(s.business_id, actor)
      and not private.can_edit_clock(s.business_id, actor)
    then
      raise exception 'Those who run orders or edit the clock only' using errcode = '42501';
    end if;
  else
    if not private.order_taking_on(s.business_id) then
      raise exception 'Taking orders is off for this business'
        using errcode = '42501', hint = 'off';
    end if;
    if not private.runs_orders(s.business_id, actor) then
      raise exception 'Those who run orders only' using errcode = '42501';
    end if;
  end if;

  if stopped then
    if s.stopped_at is not null then
      return;
    end if;
    update public.clock_stations set stopped_at = at_time, stopped_by = actor where id = station;
    delete from public.punch_codes c where c.station_id = station;
    insert into public.audit_log (business_id, actor_id, action, details)
    values (s.business_id, actor,
      case when s.shows = 'clock_code' then 'clock.station.stop' else 'order.station.stop' end,
      case
        when s.shows = 'clock_code' then jsonb_build_object('station', station)
        else jsonb_build_object('station', station, 'shows', s.shows)
      end);
  else
    if s.stopped_at is null then
      return;
    end if;
    if at_time - s.stopped_at > interval '2 minutes' then
      raise exception 'Too late to take it back; pair the device again' using errcode = '55000';
    end if;
    update public.clock_stations set stopped_at = null, stopped_by = null where id = station;
    insert into public.audit_log (business_id, actor_id, action, details)
    values (s.business_id, actor,
      case when s.shows = 'clock_code' then 'clock.station.restart' else 'order.station.restart' end,
      case
        when s.shows = 'clock_code' then jsonb_build_object('station', station)
        else jsonb_build_object('station', station, 'shows', s.shows)
      end);
  end if;
end;
$$;

------------------------------------------------------------------------------
-- 6. The station's reads

-- A prep screen's tickets, by its secret: as public.order_prep gives them
-- (new, ready in the last 5 minutes, held with a live line, of open orders,
-- oldest first, with their lines and no price at all), of its department or
-- of every one. First it marks the new ones it shows as seen, under the
-- business's lock, and moves the version. With the departments by name
-- (removed ones too: a ticket of one still names it), whether its own was
-- removed, and the business's lateAfterMinutes. Who sent a round only on an
-- order of today's business day. Null when `known_version` is the version
-- now. Stamps the station seen.
create function public.station_order_prep(
  station_hash text,
  known_version bigint default null,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
  current_version bigint;
  today date;
  late_setting text;
begin
  s := private.order_station(station_hash, 'prep');

  if exists (
    select 1
    from public.order_tickets t
    join public.orders o on o.id = t.order_id and o.business_id = t.business_id
    where t.business_id = s.business_id
      and t.status = 'new'
      and t.kitchen_seen_at is null
      and o.status = 'open'
      and (s.department_id is null or t.department_id = s.department_id)
  ) then
    perform 1 from public.businesses b where b.id = s.business_id for no key update;
    update public.order_tickets t
    set kitchen_seen_at = at_time
    from public.orders o
    where o.id = t.order_id
      and o.business_id = t.business_id
      and t.business_id = s.business_id
      and t.status = 'new'
      and t.kitchen_seen_at is null
      and o.status = 'open'
      and (s.department_id is null or t.department_id = s.department_id);
    perform private.bump_order_version(s.business_id);
  end if;
  perform private.note_station(s.id, null, at_time);

  select v.version into current_version
  from private.order_versions v
  where v.business_id = s.business_id;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;
  today := private.order_business_day(s.business_id, at_time);
  late_setting := private.order_taking_settings(s.business_id) ->> 'lateAfterMinutes';

  return jsonb_build_object(
    'version', current_version,
    'now', at_time,
    'lateAfterMinutes', case
      when late_setting in ('10', '15', '20', '30') then late_setting::integer
      else 15
    end,
    'department', s.department_id,
    'departmentGone', s.department_id is not null and not exists (
      select 1 from public.departments d
      where d.id = s.department_id and d.business_id = s.business_id and d.archived_at is null
    ),
    'departments', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', d.id, 'name', d.name, 'archived', d.archived_at is not null)
        order by d.position, d.key
      ), '[]'::jsonb)
      from public.departments d
      where d.business_id = s.business_id
    ),
    'tickets', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'order', o.id,
          'department', t.department_id,
          'placeName', p.name,
          'takeaway', o.takeaway_no,
          'status', t.status,
          'sentAt', r.sent_at,
          'firedAt', t.fired_at,
          'readyAt', t.ready_at,
          'sentBy', case when o.day = today then r.sent_by end,
          'lines', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', l.id,
                'name', l.name,
                'choices', (
                  select coalesce(jsonb_agg(c.value -> 'optionName' order by c.n), '[]'::jsonb)
                  from jsonb_array_elements(l.choices) with ordinality as c (value, n)
                ),
                'quantity', l.quantity,
                'note', l.note,
                'allergy', l.allergy,
                'state', case
                  when l.taken_back_at is not null then 'takenBack'::text
                  when l.cancelled_at is not null then 'cancelled'::text
                  else 'live'::text
                end
              )
              order by l.position, l.id
            ), '[]'::jsonb)
            from public.order_lines l
            where l.ticket_id = t.id and l.business_id = t.business_id
          )
        )
        order by coalesce(t.fired_at, r.sent_at), t.id
      ), '[]'::jsonb)
      from public.order_tickets t
      join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
      join public.orders o on o.id = t.order_id and o.business_id = t.business_id
      left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
      where t.business_id = s.business_id
        and o.status = 'open'
        and (s.department_id is null or t.department_id = s.department_id)
        and (
          t.status = 'new'
          or (t.status = 'ready' and t.ready_at > at_time - interval '5 minutes')
          or (
            t.status = 'held'
            and exists (
              select 1 from public.order_lines l
              where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
            )
          )
        )
    )
  );
end;
$$;

-- What a prep screen marks sold out ("מה נגמר"), by its secret: the live
-- items of live categories that go to its department (private.line_route),
-- or to any live one for every department, each with its category and
-- whether it is available, in the menu's order. No price. Null when
-- `known_version` is the menu's version now.
create function public.station_order_menu(
  station_hash text,
  known_version bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
  current_version bigint;
begin
  s := private.order_station(station_hash, 'prep');

  select v.version into current_version
  from private.menu_versions v
  where v.business_id = s.business_id;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;

  return jsonb_build_object(
    'version', current_version,
    'items', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'category', jsonb_build_object('id', c.id, 'name', c.name),
          'available', i.available
        )
        order by c.position, c.created_at, c.id, i.position, i.created_at, i.id
      ), '[]'::jsonb)
      from public.menu_items i
      join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
      join public.departments d
        on d.id = coalesce(i.department_id, c.department_id)
        and d.business_id = i.business_id
        and d.archived_at is null
      where i.business_id = s.business_id
        and i.archived_at is null
        and c.archived_at is null
        and (s.department_id is null or d.id = s.department_id)
    )
  );
end;
$$;

-- The till's orders, by its secret: every open order, oldest first, and
-- today's closed and cancelled ones, the newest first, each as
-- private.station_till_order gives it, with the departments by name. No
-- label, no person, no total. Null when `known_version` is the version now.
-- Stamps the station seen.
create function public.station_order_till(
  station_hash text,
  known_version bigint default null,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
  current_version bigint;
  today date;
begin
  s := private.order_station(station_hash, 'till');
  perform private.note_station(s.id, null, at_time);

  select v.version into current_version
  from private.order_versions v
  where v.business_id = s.business_id;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;
  today := private.order_business_day(s.business_id, at_time);

  return jsonb_build_object(
    'version', current_version,
    'now', at_time,
    'day', today,
    'departments', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', d.id, 'name', d.name, 'archived', d.archived_at is not null)
        order by d.position, d.key
      ), '[]'::jsonb)
      from public.departments d
      where d.business_id = s.business_id
    ),
    'orders', (
      select coalesce(jsonb_agg(
        private.station_till_order(o.id, s.id) order by o.opened_at, o.id
      ), '[]'::jsonb)
      from public.orders o
      where o.business_id = s.business_id and o.status = 'open'
    ),
    'closed', (
      select coalesce(jsonb_agg(
        private.station_till_order(o.id, s.id)
        order by coalesce(o.closed_at, o.cancelled_at) desc, o.id
      ), '[]'::jsonb)
      from public.orders o
      where o.business_id = s.business_id and o.status <> 'open' and o.day = today
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- 7. The station's writes

-- A prep screen marks a ticket of its department (any, for every
-- department) ready, or back to new within 5 minutes, as
-- public.set_order_ticket_ready decides, kept as the station's. P0002 for a
-- ticket that isn't its own; 55000 hint 'closed', 'held', 'served' or
-- 'window'. The same again is left as it is. No log row.
create function public.station_set_ticket_ready(
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

-- A prep screen marks an item that goes to its department (any item, for
-- every department) sold out (`is_available` false) or back, as
-- public.set_menu_item_available does, kept as the station's. P0002 for an
-- item of another business or none; 42501 for one of another department;
-- 55000 hint 'archived' for a removed one. The same again changes nothing.
-- No log row.
create function public.station_set_item_available(
  station_hash text,
  item uuid,
  is_available boolean,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.clock_stations%rowtype;
  was public.menu_items%rowtype;
begin
  s := private.order_station(station_hash, 'prep');
  select i.* into was
  from public.menu_items i
  where i.id = item and i.business_id = s.business_id
  for update;
  if not found then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  if s.department_id is not null
    and private.line_route(was.id) is distinct from s.department_id
  then
    raise exception 'The screen''s department''s items only' using errcode = '42501';
  end if;
  if was.archived_at is not null then
    raise exception 'A removed item is restored first' using errcode = '55000', hint = 'archived';
  end if;
  if is_available is null then
    raise exception 'Sold out or not' using errcode = '22023';
  end if;
  if was.available = is_available then
    return;
  end if;

  update public.menu_items i
  set available = is_available,
    available_changed_at = at_time,
    available_by = null,
    available_station = s.id
  where i.id = was.id;
  if is_available then
    perform private.note_station(s.id, 'available', at_time);
  else
    perform private.note_station(s.id, 'soldOut', at_time);
  end if;
  perform private.bump_menu_version(s.business_id);
end;
$$;

-- The till closes an open order of its business, as public.close_order
-- does: every ticket not yet served is served then, kept as the station's.
-- 55000 hint 'held' while a held block with a live line waits, 'closed' for
-- a cancelled order. One closed already is left as it is.
create function public.station_close_order(
  station_hash text,
  order_ref uuid,
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
  the_order public.orders%rowtype;
begin
  s := private.order_station(station_hash, 'till');
  select o.business_id into row_business from public.orders o where o.id = order_ref;
  if row_business is distinct from s.business_id then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if the_order.status = 'closed' then
    return;
  end if;
  if the_order.status <> 'open' then
    raise exception 'The order was cancelled' using errcode = '55000', hint = 'closed';
  end if;
  if exists (
    select 1
    from public.order_tickets t
    where t.order_id = the_order.id
      and t.status = 'held'
      and exists (
        select 1 from public.order_lines l
        where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
      )
  ) then
    raise exception 'A held block waits to be called' using errcode = '55000', hint = 'held';
  end if;

  update public.order_tickets t
  set status = 'served',
    ready_at = coalesce(t.ready_at, at_time),
    served_new = (t.status = 'new'),
    served_at = at_time,
    served_by = null,
    served_station = s.id
  where t.order_id = the_order.id and t.status in ('new', 'ready');
  update public.orders o
  set status = 'closed', closed_at = at_time, closed_by = null, closed_station = s.id
  where o.id = the_order.id;
  perform private.note_station(s.id, 'close', at_time);
  perform private.bump_order_version(row_business);
end;
$$;

-- The till opens a closed order of its business again, as
-- public.reopen_order does: the same business day only (55000 hint 'day'),
-- its tickets left served, kept as the station's. 55000 hint 'not_closed'
-- for a cancelled order; 23505 hint 'taken' when its place has another open
-- order, its id as the detail. One open already is left as it is.
create function public.station_reopen_order(
  station_hash text,
  order_ref uuid,
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
  the_order public.orders%rowtype;
  other_order uuid;
begin
  s := private.order_station(station_hash, 'till');
  select o.business_id into row_business from public.orders o where o.id = order_ref;
  if row_business is distinct from s.business_id then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if the_order.status = 'open' then
    return;
  end if;
  if the_order.status <> 'closed' then
    raise exception 'A cancelled order stays cancelled' using errcode = '55000', hint = 'not_closed';
  end if;
  if private.order_business_day(row_business, at_time) is distinct from the_order.day then
    raise exception 'Its business day is over' using errcode = '55000', hint = 'day';
  end if;
  if the_order.place_id is not null then
    select o.id into other_order
    from public.orders o
    where o.business_id = row_business
      and o.place_id = the_order.place_id
      and o.status = 'open';
    if other_order is not null then
      raise exception 'That place has an open order'
        using errcode = '23505', hint = 'taken', detail = other_order::text;
    end if;
  end if;

  update public.orders o
  set status = 'open', closed_at = null, closed_by = null, closed_station = null,
    reopened_at = at_time, reopened_by = null, reopened_station = s.id
  where o.id = the_order.id;
  perform private.note_station(s.id, 'reopen', at_time);
  perform private.bump_order_version(row_business);
end;
$$;

-- The till takes its own close back, as its toast's "ביטול" does and as
-- public.undo_close_order does for a person: only the station that closed
-- it, within 2 minutes of the close (55000 hint 'window' for another's
-- close, or after that), the order open again and every ticket the close
-- served back where it was; the same business day only (hint 'day'), while
-- the place is free (23505 hint 'taken'), never a cancelled order (hint
-- 'not_closed'). One open already is left as it is.
create function public.station_undo_close_order(
  station_hash text,
  order_ref uuid,
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
  the_order public.orders%rowtype;
  other_order uuid;
begin
  s := private.order_station(station_hash, 'till');
  select o.business_id into row_business from public.orders o where o.id = order_ref;
  if row_business is distinct from s.business_id then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if the_order.status = 'open' then
    return;
  end if;
  if the_order.status <> 'closed' then
    raise exception 'A cancelled order stays cancelled' using errcode = '55000', hint = 'not_closed';
  end if;
  if the_order.closed_station is distinct from s.id
    or at_time > the_order.closed_at + interval '2 minutes'
  then
    raise exception 'Only the station that closed it takes the close back, within 2 minutes'
      using errcode = '55000', hint = 'window';
  end if;
  if private.order_business_day(row_business, at_time) is distinct from the_order.day then
    raise exception 'Its business day is over' using errcode = '55000', hint = 'day';
  end if;
  if the_order.place_id is not null then
    select o.id into other_order
    from public.orders o
    where o.business_id = row_business
      and o.place_id = the_order.place_id
      and o.status = 'open';
    if other_order is not null then
      raise exception 'That place has an open order'
        using errcode = '23505', hint = 'taken', detail = other_order::text;
    end if;
  end if;

  update public.order_tickets t
  set status = case when t.served_new then 'new' else 'ready' end,
    ready_at = case when t.served_new then null else t.ready_at end,
    served_new = false,
    served_at = null,
    served_by = null,
    served_station = null
  where t.order_id = the_order.id
    and t.status = 'served'
    and t.served_at = the_order.closed_at
    and t.served_station = the_order.closed_station;
  update public.orders o
  set status = 'open', closed_at = null, closed_by = null, closed_station = null,
    reopened_at = at_time, reopened_by = null, reopened_station = s.id
  where o.id = the_order.id;
  perform private.note_station(s.id, 'reopen', at_time);
  perform private.bump_order_version(row_business);
end;
$$;

------------------------------------------------------------------------------
-- 8. A person's writes, replaced to clear the station's column with theirs

-- 20261120000300_order_taking_orders.sql's, with back to new clearing the
-- station that marked it ready too.
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

-- 20261120000300_order_taking_orders.sql's, with not served clearing the
-- station whose close served it too.
create or replace function public.serve_order_ticket(
  actor uuid,
  ticket uuid,
  served boolean default true,
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
  the_order public.orders%rowtype;
  the_ticket public.order_tickets%rowtype;
begin
  select t.business_id, t.order_id into row_business, order_ref
  from public.order_tickets t
  where t.id = ticket;
  perform private.order_writer(row_business, actor);
  perform private.require_taker_or_runs(row_business, actor, at_time);
  if served is null then
    raise exception 'Served or not' using errcode = '22023';
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

  if served then
    if the_ticket.status = 'served' then
      return;
    end if;
    update public.order_tickets t
    set status = 'served',
      ready_at = coalesce(t.ready_at, at_time),
      served_new = (t.status = 'new'),
      served_at = at_time,
      served_by = actor
    where t.id = the_ticket.id;
  else
    if the_ticket.status <> 'served' then
      return;
    end if;
    update public.order_tickets t
    set status = case when t.served_new then 'new' else 'ready' end,
      ready_at = case when t.served_new then null else t.ready_at end,
      served_new = false,
      served_at = null,
      served_by = null,
      served_station = null
    where t.id = the_ticket.id;
  end if;
  perform private.bump_order_version(row_business);
end;
$$;

-- 20261120000300_order_taking_orders.sql's, with the reopen clearing the
-- till that closed it and one that opened it before.
create or replace function public.reopen_order(
  actor uuid,
  order_ref uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_business uuid;
  the_order public.orders%rowtype;
  other_order uuid;
begin
  select o.business_id into row_business from public.orders o where o.id = order_ref;
  perform private.order_writer(row_business, actor);
  perform private.require_taker_or_runs(row_business, actor, at_time);

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if the_order.status = 'open' then
    return;
  end if;
  if the_order.status <> 'closed' then
    raise exception 'A cancelled order stays cancelled' using errcode = '55000', hint = 'not_closed';
  end if;
  if private.order_business_day(row_business, at_time) is distinct from the_order.day then
    raise exception 'Its business day is over' using errcode = '55000', hint = 'day';
  end if;
  if the_order.place_id is not null then
    select o.id into other_order
    from public.orders o
    where o.business_id = row_business
      and o.place_id = the_order.place_id
      and o.status = 'open';
    if other_order is not null then
      raise exception 'That place has an open order'
        using errcode = '23505', hint = 'taken', detail = other_order::text;
    end if;
  end if;

  update public.orders o
  set status = 'open', closed_at = null, closed_by = null, closed_station = null,
    reopened_at = at_time, reopened_by = actor, reopened_station = null
  where o.id = the_order.id;
  perform private.bump_order_version(row_business);
end;
$$;

-- 20261122000100_order_taking_fixes.sql's, with the same: the tickets and
-- the order clear the station columns beside the person's.
create or replace function public.undo_close_order(
  actor uuid,
  order_ref uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_business uuid;
  the_order public.orders%rowtype;
  other_order uuid;
begin
  select o.business_id into row_business from public.orders o where o.id = order_ref;
  perform private.order_writer(row_business, actor);
  perform private.require_taker_or_runs(row_business, actor, at_time);

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if the_order.status = 'open' then
    return;
  end if;
  if the_order.status <> 'closed' then
    raise exception 'A cancelled order stays cancelled' using errcode = '55000', hint = 'not_closed';
  end if;
  if the_order.closed_by is distinct from actor
    or at_time > the_order.closed_at + interval '2 minutes'
  then
    raise exception 'Only whoever closed it takes the close back, within 2 minutes'
      using errcode = '55000', hint = 'window';
  end if;
  if private.order_business_day(row_business, at_time) is distinct from the_order.day then
    raise exception 'Its business day is over' using errcode = '55000', hint = 'day';
  end if;
  if the_order.place_id is not null then
    select o.id into other_order
    from public.orders o
    where o.business_id = row_business
      and o.place_id = the_order.place_id
      and o.status = 'open';
    if other_order is not null then
      raise exception 'That place has an open order'
        using errcode = '23505', hint = 'taken', detail = other_order::text;
    end if;
  end if;

  update public.order_tickets t
  set status = case when t.served_new then 'new' else 'ready' end,
    ready_at = case when t.served_new then null else t.ready_at end,
    served_new = false,
    served_at = null,
    served_by = null,
    served_station = null
  where t.order_id = the_order.id
    and t.status = 'served'
    and t.served_at = the_order.closed_at
    and t.served_by = the_order.closed_by;
  update public.orders o
  set status = 'open', closed_at = null, closed_by = null, closed_station = null,
    reopened_at = at_time, reopened_by = actor, reopened_station = null
  where o.id = the_order.id;
  perform private.bump_order_version(row_business);
end;
$$;

------------------------------------------------------------------------------
-- 9. The restaurant's and the café's words

-- Both templates the same sentences: the screen is the kitchen's ("מסך
-- מטבח", "פתיחת המטבח") and the till lists tables. Only where nothing is
-- stored yet.
insert into public.template_wording (template_key, key, sentence, base_sentence)
select t.template_key, w.key, w.sentence, w.base_sentence
from (values ('restaurant'), ('cafe-bar')) as t (template_key)
cross join (
  values
    ('app.orders.stations.prep.lock',
      'נעילת המכשיר כמסך מטבח',
      'נעילת המכשיר כמסך הכנה'),
    ('app.orders.stations.prep.hint',
      'הטאבלט מציג את ההזמנות למטבח, עם צליל, בלי החשבון של אף אחד.',
      'הטאבלט מציג את ההזמנות להכנה, עם צליל, בלי החשבון של אף אחד.'),
    ('app.orders.stations.reminder.prep',
      'המכשיר הזה הוא מסך המטבח של העסק. כשמסיימים, נועלים אותו שוב.',
      'המכשיר הזה הוא מסך ההכנה של העסק. כשמסיימים, נועלים אותו שוב.'),
    ('app.orders.stations.lock.prep.title',
      'להשאיר את המכשיר כמסך מטבח',
      'להשאיר את המכשיר כמסך הכנה'),
    ('app.orders.station.open',
      'פתיחת המטבח',
      'פתיחת מסך ההכנה'),
    ('app.orders.station.till.choose.title',
      'בוחרים שולחן',
      'בוחרים הזמנה'),
    ('app.orders.station.till.back',
      'לכל השולחנות',
      'לכל ההזמנות')
) as w (key, sentence, base_sentence)
where exists (select 1 from public.templates tt where tt.key = t.template_key)
on conflict (template_key, key) do nothing;

------------------------------------------------------------------------------
-- 10. Who may call what

-- They run inside the functions, as their owner, for nobody else.
revoke execute on function private.order_station(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.note_station(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.station_till_order(uuid, uuid)
  from public, anon, authenticated, service_role;

-- The server's alone: a station has nobody signed in, so its reads and
-- writes go by its secret with the secret key, and a lock for `actor`.
revoke execute on function public.lock_order_station(uuid, uuid, text, text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.lock_order_station(uuid, uuid, text, text, uuid, text, timestamptz)
  to service_role;
revoke execute on function public.station_order_prep(text, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.station_order_prep(text, bigint, timestamptz) to service_role;
revoke execute on function public.station_order_menu(text, bigint)
  from public, anon, authenticated;
grant execute on function public.station_order_menu(text, bigint) to service_role;
revoke execute on function public.station_order_till(text, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.station_order_till(text, bigint, timestamptz) to service_role;
revoke execute on function public.station_set_ticket_ready(text, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.station_set_ticket_ready(text, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.station_set_item_available(text, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.station_set_item_available(text, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.station_close_order(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.station_close_order(text, uuid, timestamptz) to service_role;
revoke execute on function public.station_reopen_order(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.station_reopen_order(text, uuid, timestamptz) to service_role;
revoke execute on function public.station_undo_close_order(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.station_undo_close_order(text, uuid, timestamptz) to service_role;

-- Replaced in place, the same signatures: set again all the same.
revoke execute on function public.station_by_token(text) from public, anon, authenticated;
grant execute on function public.station_by_token(text) to service_role;
revoke execute on function public.issue_station_code(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_station_code(text, text, text, timestamptz) to service_role;
revoke execute on function public.set_clock_station_stopped(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_clock_station_stopped(uuid, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.set_order_ticket_ready(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_order_ticket_ready(uuid, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.serve_order_ticket(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.serve_order_ticket(uuid, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.reopen_order(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reopen_order(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.undo_close_order(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.undo_close_order(uuid, uuid, timestamptz) to service_role;
