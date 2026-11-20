-- Taking orders, P3 of waiter mode (issue #191; Orel's decisions of 20
-- November 2026), part 2 of 3: the orders, in the database alone. No screen
-- calls any of it before P4, and the module is off everywhere.
--
--   the tables  an order is at a place (a table, a seat at the bar) or a
--               takeaway with its number of the business day; it is sent in
--               rounds, each round split into tickets, one per department
--               that prepares (private.line_route) and whether it waits to be
--               called (a held block), each ticket holding its lines. A
--               line's name, unit price and choices are frozen when it is
--               sent, so a price changed later never changes an order. RLS
--               is on with no policy and no grant, not even to the server
--               role: what a waiter sold, line by line, is the service log's
--               (§6.4 of the design), so nobody reads the tables directly,
--               and only the functions below, which run as their owner,
--               write them. Nothing deletes an order of a real business
--               (decision 7); the demo's go after two days (the next file).
--   no total    nothing here adds money up (decision 7): no line total, no
--               order total, in a read or a log row. A line's unit price is
--               shown, and its quantity.
--   the send    public.send_order_round, by someone who takes orders now
--               (private.require_taker, 20261120000200_order_taking_takers
--               .sql), keyed by the phone: the same key and body again gives
--               the same answer and writes nothing, so a phone may retry; the
--               key with another body, sender or business is refused
--               (23505). Two first sends to one place within a minute join
--               one order; a later one is told the place is taken.
--   fixing      decision 5: the sender takes a line back within
--               takeBackMinutes while nobody prepared it (unless they are on
--               the staff of the department it went to: they cancel it with a
--               reason); anyone who takes orders cancels a line not yet ready,
--               with a reason; a ready or served line only someone who holds
--               order_taking.edit cancels; and "on the house" is theirs alone.
--               A cancel and "on the house" are undone while the order is
--               open. A whole order is cancelled by order_taking.edit, for
--               good. Running orders isn't the clock's: order_taking.edit
--               fixes off a shift too (default 1 to ask Orel).
--   the kitchen whoever is on the staff of a ticket's department, or holds
--               order_taking.edit, marks it ready (and back, within 5
--               minutes); whoever takes orders serves it, fires a held
--               block, moves the order, closes it and opens it again the
--               same business day.
--   the log     order.line.take_back (only once the kitchen saw it),
--               order.line.cancel, restore, comp and uncomp, and
--               order.cancel, each with the line's quantity and unit price,
--               never a sum, read by order_taking.edit (private.log_perm's
--               (menu|order) arm, 20261117000500_order_taking_menu.sql). A
--               send writes none. None tells anyone.
--   the reads   with the person's own session: the floor, an order, its
--               till (by item and by round, no total), one's own rounds, the
--               kitchen's tickets (no price at all) and the most ordered
--               items, for those who take orders now, a view as a role on
--               the staff, and whoever runs orders; the kitchen's for those
--               on a department's staff. Person ids only on orders of today's
--               business day. The kitchen's read marks what its department
--               saw.
--
-- Errors, which @db/order-failures reads: P0002 unknown or not yours; 42501
-- not yours to do, hint 'off' (the module), 'clock' or 'stale_shift' (off a
-- shift), 'sender', 'own_department' or 'ready'; 22023 a shape, hint
-- 'unavailable' or 'route' (the items' ids as the detail), 'choices',
-- 'price', 'allergy' or 'place'; 23505 hint 'taken' (the order's id as the
-- detail), 'key' or 'body'; 55000 hint 'closed', 'moved', 'held', 'window',
-- 'prepared', 'taken_back', 'cancelled', 'comped', 'served', 'day',
-- 'takeaway' or 'not_closed'; 54000 over a cap. A write that finds nothing
-- to do returns with no error and no log row.

------------------------------------------------------------------------------
-- 1. The tables

-- An order: at a place, or a takeaway with its number of the business day.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  place_id uuid,
  takeaway_no integer check (takeaway_no between 1 and 9999),
  takeaway_label text
    check (
      char_length(takeaway_label) between 1 and 20
      and takeaway_label = btrim(takeaway_label)
      and takeaway_label !~ '[[:cntrl:]]'
    ),
  -- The business day it opened on (private.order_business_day).
  day date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  -- Who did each, cleared by the job 30 days after they did it, as a round's
  -- sender; the same for a ticket's and a line's.
  opened_by uuid references public.profiles (id) on delete set null,
  opened_at timestamptz not null,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  reopened_by uuid references public.profiles (id) on delete set null,
  reopened_at timestamptz,
  moved_by uuid references public.profiles (id) on delete set null,
  moved_at timestamptz,
  moved_from uuid,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason in ('guest', 'mistake', 'other')),
  -- When the job first erased its label and its lines' notes.
  notes_erased_at timestamptz,
  unique (id, business_id),
  -- A place is archived, never deleted: checked at commit, as the menu's
  -- are, since a business going takes its places and orders together.
  foreign key (place_id, business_id)
    references public.order_places (id, business_id) deferrable initially deferred,
  foreign key (moved_from, business_id)
    references public.order_places (id, business_id) deferrable initially deferred,
  check (num_nonnulls(place_id, takeaway_no) = 1),
  check ((status = 'closed') = (closed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check ((cancelled_at is null) = (cancel_reason is null)),
  check (takeaway_label is null or takeaway_no is not null),
  check ((moved_at is null) = (moved_from is null)),
  check (closed_by is null or closed_at is not null),
  check (reopened_by is null or reopened_at is not null),
  check (moved_by is null or moved_at is not null),
  check (cancelled_by is null or cancelled_at is not null)
);

create unique index orders_one_open_idx
  on public.orders (business_id, place_id) where status = 'open' and place_id is not null;
create unique index orders_takeaway_idx
  on public.orders (business_id, day, takeaway_no) where takeaway_no is not null;
create index orders_business_day_idx on public.orders (business_id, day);
create index orders_open_idx on public.orders (business_id) where status = 'open';
create index orders_place_idx on public.orders (place_id, business_id);
create index orders_moved_from_idx on public.orders (moved_from, business_id);
create index orders_opened_by_idx on public.orders (opened_by);
create index orders_closed_by_idx on public.orders (closed_by);
create index orders_reopened_by_idx on public.orders (reopened_by);
create index orders_moved_by_idx on public.orders (moved_by);
create index orders_cancelled_by_idx on public.orders (cancelled_by);
create index orders_labelled_idx on public.orders (business_id) where takeaway_label is not null;

-- The last takeaway number of each business day.
create table private.order_day_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  day date not null,
  last_no integer not null check (last_no > 0),
  primary key (business_id, day)
);

-- A round: what one phone sent at once. Its id is the key the phone made,
-- so the same send twice is one round.
create table public.order_rounds (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_id uuid not null,
  -- The send's body as the server read it (private.order_round_hash), for a
  -- retry; made from the round's id alone once the job erases its order's
  -- notes and label, so nothing erased is read back from it.
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  -- Cleared after 30 days by the job.
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null,
  unique (id, business_id),
  foreign key (order_id, business_id)
    references public.orders (id, business_id) on delete cascade
);

create index order_rounds_order_idx on public.order_rounds (order_id, business_id, sent_at);
create index order_rounds_sent_by_idx on public.order_rounds (sent_by);
create index order_rounds_sender_kept_idx on public.order_rounds (sent_at) where sent_by is not null;
create index order_rounds_business_idx on public.order_rounds (business_id, sent_at);

-- A ticket: a round's lines for one department, held (a block that waits to
-- be called) or not.
create table public.order_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_id uuid not null,
  round_id uuid not null,
  department_id uuid not null,
  held boolean not null default false,
  status text not null check (status in ('held', 'new', 'ready', 'served')),
  fired_at timestamptz,
  fired_by uuid references public.profiles (id) on delete set null,
  -- When someone of its department first had it on the kitchen's screen.
  kitchen_seen_at timestamptz,
  ready_at timestamptz,
  ready_by uuid references public.profiles (id) on delete set null,
  -- The first time a preparer marked it ready: kept when it goes back to
  -- new, so it can no longer be taken back.
  prepared_at timestamptz,
  served_at timestamptz,
  served_by uuid references public.profiles (id) on delete set null,
  -- Served before anyone marked it ready: its undo puts it back to new.
  served_new boolean not null default false,
  -- Its place among its round's tickets, as their lines came.
  position smallint not null default 0,
  unique (id, business_id),
  unique (round_id, department_id, held),
  foreign key (order_id, business_id)
    references public.orders (id, business_id) on delete cascade,
  foreign key (round_id, business_id)
    references public.order_rounds (id, business_id) on delete cascade,
  -- A department is archived, never deleted: checked at commit.
  foreign key (department_id, business_id)
    references public.departments (id, business_id) deferrable initially deferred,
  check ((status = 'held') = (held and fired_at is null)),
  check (fired_at is null or held),
  check ((status in ('ready', 'served')) = (ready_at is not null)),
  check ((status = 'served') = (served_at is not null)),
  check (not served_new or status = 'served'),
  check (fired_by is null or fired_at is not null),
  check (ready_by is null or ready_at is not null),
  check (served_by is null or served_at is not null)
);

-- As every table that goes with its business: a business going (a demo's
-- reset) finds its tickets and lines by it, never by reading them all.
create index order_tickets_business_idx on public.order_tickets (business_id);
create index order_tickets_order_idx on public.order_tickets (order_id, business_id);
create index order_tickets_round_idx on public.order_tickets (round_id, business_id);
create index order_tickets_department_idx on public.order_tickets (department_id, business_id);
create index order_tickets_open_idx
  on public.order_tickets (business_id, department_id) where status in ('held', 'new', 'ready');
create index order_tickets_fired_by_idx on public.order_tickets (fired_by);
create index order_tickets_ready_by_idx on public.order_tickets (ready_by);
create index order_tickets_served_by_idx on public.order_tickets (served_by);

-- A line: an item, as it was when it was sent.
create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ticket_id uuid not null,
  item_id uuid not null,
  -- Frozen when sent: the item's name, its unit price with the choices
  -- (VAT included, whole agorot) and the choices, each
  -- {group, groupName, option, optionName, priceAgorot}.
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  unit_agorot integer not null check (unit_agorot between 0 and 1100000),
  choices jsonb not null default '[]'::jsonb check (jsonb_typeof(choices) = 'array'),
  quantity smallint not null check (quantity between 1 and 99),
  -- Erased by the job two days after the order closes.
  note text
    check (char_length(note) between 1 and 120 and note = btrim(note) and note !~ '[[:cntrl:]]'),
  allergy boolean not null default false,
  note_erased_at timestamptz,
  position smallint not null default 0,
  taken_back_at timestamptz,
  taken_back_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text check (cancel_reason in ('guest', 'mistake', 'sold_out', 'other')),
  comped_at timestamptz,
  comped_by uuid references public.profiles (id) on delete set null,
  comp_reason text check (comp_reason in ('make_good', 'staff', 'other')),
  unique (id, business_id),
  foreign key (ticket_id, business_id)
    references public.order_tickets (id, business_id) on delete cascade,
  -- Items are archived, never deleted: checked at commit.
  foreign key (item_id, business_id)
    references public.menu_items (id, business_id) deferrable initially deferred,
  check (num_nonnulls(taken_back_at, cancelled_at, comped_at) <= 1),
  check ((cancelled_at is null) = (cancel_reason is null)),
  check ((comped_at is null) = (comp_reason is null)),
  check (not allergy or note is not null or note_erased_at is not null),
  check (note_erased_at is null or note is null),
  check (taken_back_by is null or taken_back_at is not null),
  check (cancelled_by is null or cancelled_at is not null),
  check (comped_by is null or comped_at is not null)
);

create index order_lines_business_idx on public.order_lines (business_id);
create index order_lines_ticket_idx on public.order_lines (ticket_id, business_id, position);
create index order_lines_item_idx on public.order_lines (item_id, business_id);
create index order_lines_noted_idx on public.order_lines (ticket_id) where note is not null;
create index order_lines_taken_back_by_idx on public.order_lines (taken_back_by);
create index order_lines_cancelled_by_idx on public.order_lines (cancelled_by);
create index order_lines_comped_by_idx on public.order_lines (comped_by);

-- When each business's orders last changed, as private.menu_versions: one
-- number per business, for the reads that answer with nothing new.
create table private.order_versions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  version bigint not null
);

alter table public.orders enable row level security;
alter table public.order_rounds enable row level security;
alter table public.order_tickets enable row level security;
alter table public.order_lines enable row level security;
alter table private.order_day_counters enable row level security;
alter table private.order_versions enable row level security;

-- No policy and no grant: every read and write goes through the functions
-- below, which run as their owner. The server role loses its privileges
-- too, so nothing else writes or deletes an order.
revoke all on public.orders, public.order_rounds, public.order_tickets, public.order_lines
  from public, anon, authenticated, service_role;
revoke all on private.order_day_counters, private.order_versions
  from public, anon, authenticated, service_role;

comment on table public.orders is
  'An order: at a place, or a takeaway with its number of the business day. Nobody reads it directly: written by public.send_order_round and the other order functions, read through public.order_floor, order_detail, order_till, order_mine and order_prep. Never deleted for a real business.';
comment on table public.order_rounds is
  'What one phone sent at once, keyed by the phone (the send is idempotent), with its body''s hash (made from its id alone once its order''s notes are erased) and its sender (cleared after 30 days). Read and written only through the order functions.';
comment on table public.order_tickets is
  'A round''s lines for one department, held or not: held, new, ready, served. Read and written only through the order functions.';
comment on table public.order_lines is
  'A line of an order: the item''s name, unit price in agorot and choices frozen when sent, its quantity, a note (erased two days after the order closes), and whether it was taken back, cancelled or given on the house. Never a total. Read and written only through the order functions.';
comment on table private.order_day_counters is
  'The last takeaway number of each business day, for public.send_order_round. Days older than two go with the job.';
comment on table private.order_versions is
  'Each business''s orders version, moved by every write to its orders (private.bump_order_version), for the reads that answer with nothing new.';

------------------------------------------------------------------------------
-- 2. Helpers

-- Moves the business's orders version, as private.bump_menu_version: the
-- moment in microseconds, or one more than before when that is later.
create function private.bump_order_version(business uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.order_versions as v (business_id, version)
  values (business, (extract(epoch from clock_timestamp()) * 1000000)::bigint)
  on conflict (business_id) do update
  set version = greatest(v.version + 1, excluded.version)
$$;

-- How many rounds a demo business takes from its visitors in an hour.
create function private.order_demo_per_hour()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 100
$$;

-- A send's body as the server read it, hashed: its target and its lines in
-- the canonical forms public.send_order_round builds. jsonb's text is the
-- same for the same value, so the hash is the server's, never the phone's.
create function private.order_round_hash(target jsonb, lines jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(
    sha256(convert_to(jsonb_build_object('target', target, 'lines', lines)::text, 'UTF8')),
    'hex'
  )
$$;

-- Where an order is, as the log keeps it: {"place": its place's name} or
-- {"takeaway": its number}.
create function private.order_where(order_ref uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.place_id is not null then jsonb_build_object('place', p.name)
    else jsonb_build_object('takeaway', o.takeaway_no)
  end
  from public.orders o
  left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
  where o.id = order_ref
$$;

-- A line as the log keeps it, standing on its own: its name and choices as
-- sent, its quantity and unit price (never a total, decision 7), where and
-- which business day, the department it went to, its ticket's status now and
-- who sent it.
create function private.order_line_facts(line uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'line', l.id,
    'order', o.id,
    'item', l.item_id,
    'name', l.name,
    'choices', (
      select coalesce(jsonb_agg(c.value -> 'optionName' order by c.n), '[]'::jsonb)
      from jsonb_array_elements(l.choices) with ordinality as c (value, n)
    ),
    'quantity', l.quantity,
    'unitAgorot', l.unit_agorot,
    'where', private.order_where(o.id),
    'day', o.day,
    'department', t.department_id,
    'ticket', t.status,
    'sender', r.sent_by
  )
  from public.order_lines l
  join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
  join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
  join public.orders o on o.id = t.order_id and o.business_id = t.business_id
  where l.id = line
$$;

-- Refuses a write on an order of `row_business` by `actor`: P0002 unless
-- they are an active member of it (an order of another business, or none, is
-- unknown), then 42501 hint 'off' while the module is off. Every write that
-- names a line, a ticket or an order calls it before any lock, and is refused
-- P0002 as well when a row it then locks is gone (a demo's order the job or
-- a reset deleted after it was read), never going on with empty rows.
create function private.order_writer(row_business uuid, actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if row_business is null or not exists (
    select 1 from public.memberships m
    where m.business_id = row_business and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if not private.order_taking_on(row_business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;
end;
$$;

-- Refuses `actor` unless they run orders (order_taking.edit, with no clock)
-- or take orders now (private.require_taker, with its hints).
create function private.require_taker_or_runs(business uuid, actor uuid, at_time timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.runs_orders(business, actor) then
    perform private.require_taker(business, actor, at_time);
  end if;
end;
$$;

-- A round as the send answers it: its order, when it was sent, whether it
-- was the order's first, the order's place or takeaway number, and its
-- tickets in the order their lines were sent.
create function private.order_round_answer(round_ref uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'round', r.id,
    'order', o.id,
    'sentAt', r.sent_at,
    'first', not exists (
      select 1 from public.order_rounds e
      where e.order_id = r.order_id
        and e.business_id = r.business_id
        and (e.sent_at, e.id) < (r.sent_at, r.id)
    ),
    'place', o.place_id,
    'takeaway', o.takeaway_no,
    'tickets', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', t.id, 'department', t.department_id, 'held', t.held)
        order by t.position, t.id
      ), '[]'::jsonb)
      from public.order_tickets t
      where t.round_id = r.id and t.business_id = r.business_id
    )
  )
  from public.order_rounds r
  join public.orders o on o.id = r.order_id and o.business_id = r.business_id
  where r.id = round_ref
$$;

------------------------------------------------------------------------------
-- 3. The send

-- Sends a round of `business` for `actor`, keyed `round_key` by the phone.
-- `target` is {"order": id, "place": id?} for an order the phone shows (the
-- place it shows it at), {"place": id} for a first send to a place, or
-- {"takeaway": true, "label": text?}; `lines` is a list of 1 to 40
-- {item, quantity, note?, allergy?, held?, choices?: [{group, option}]}.
-- Each line goes to its item's department, held lines in a block of their
-- own, with its name, unit price and choices frozen. The same key and body
-- again returns the same answer and writes nothing; the key with another
-- body (hint 'body'), sender or business (hint 'key') is refused (23505).
-- Two first sends to one place within 60 seconds join one order; a later
-- one is refused 23505 hint 'taken', the open order's id as the detail.
-- Returns {round, order, sentAt, first, place, takeaway, tickets: [{id,
-- department, held}]}. No log row.
create function public.send_order_round(
  actor uuid,
  business uuid,
  round_key uuid,
  target jsonb,
  lines jsonb,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  pick jsonb;
  target_order uuid;
  target_place uuid;
  takeaway_label_given text;
  canonical_target jsonb;
  canonical_lines jsonb := '[]'::jsonb;
  canonical_picks jsonb;
  body text;
  stored public.order_rounds%rowtype;
  line_item uuid;
  line_quantity integer;
  line_note text;
  line_allergy boolean;
  line_held boolean;
  line_picks jsonb;
  item_row public.menu_items%rowtype;
  item_route uuid;
  item_unit integer;
  unavailable uuid[] := '{}'::uuid[];
  no_route uuid[] := '{}'::uuid[];
  prepared jsonb := '[]'::jsonb;
  the_order public.orders%rowtype;
  order_ref uuid;
  order_day date;
  takeaway_number integer;
  ticket_ref uuid;
  line_place integer := 0;
  ticket_place integer := 0;
begin
  if not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;

  -- The target, in its canonical form.
  if jsonb_typeof(target) is distinct from 'object' then
    raise exception 'A send names its order, its place or a takeaway' using errcode = '22023';
  end if;
  if target ? 'takeaway' then
    if exists (
      select 1 from jsonb_object_keys(target) as k (field)
      where k.field not in ('takeaway', 'label')
    ) or (target -> 'takeaway') is distinct from 'true'::jsonb then
      raise exception 'A takeaway has a label and nothing else' using errcode = '22023';
    end if;
    takeaway_label_given := private.json_text(target -> 'label', 20, 'The label');
    if takeaway_label_given ~ '[[:cntrl:]]' then
      raise exception 'The label is one line of text' using errcode = '22023';
    end if;
    canonical_target := jsonb_build_object('takeaway', true, 'label', takeaway_label_given);
  elsif target ? 'order' then
    if exists (
      select 1 from jsonb_object_keys(target) as k (field)
      where k.field not in ('order', 'place')
    ) then
      raise exception 'An order is named with the place it shows' using errcode = '22023';
    end if;
    target_order := private.json_uuid(target -> 'order', 'The order');
    if target_order is null then
      raise exception 'The order is missing' using errcode = '22023';
    end if;
    target_place := private.json_uuid(target -> 'place', 'The place');
    canonical_target := jsonb_build_object('order', target_order, 'place', target_place);
  elsif target ? 'place' then
    if exists (
      select 1 from jsonb_object_keys(target) as k (field)
      where k.field <> 'place'
    ) then
      raise exception 'A first send names its place only' using errcode = '22023';
    end if;
    target_place := private.json_uuid(target -> 'place', 'The place');
    if target_place is null then
      raise exception 'The place is missing' using errcode = '22023';
    end if;
    canonical_target := jsonb_build_object('place', target_place);
  else
    raise exception 'A send names its order, its place or a takeaway' using errcode = '22023';
  end if;

  -- The lines, in their canonical form, in the order sent.
  if jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'Lines must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(lines) = 0 then
    raise exception 'A send has a line at least' using errcode = '22023';
  end if;
  if jsonb_array_length(lines) > 40 then
    raise exception 'A send has at most 40 lines' using errcode = '54000';
  end if;
  for entry in select e.value from jsonb_array_elements(lines) as e (value)
  loop
    if jsonb_typeof(entry) <> 'object' then
      raise exception 'A line must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(entry) as k (field)
      where k.field not in ('item', 'quantity', 'note', 'allergy', 'held', 'choices')
    ) then
      raise exception 'A line has an item, a quantity, a note, an allergy, held and choices'
        using errcode = '22023';
    end if;
    line_item := private.json_uuid(entry -> 'item', 'The item');
    if line_item is null then
      raise exception 'A line needs its item' using errcode = '22023';
    end if;
    line_quantity := private.json_int(entry -> 'quantity', 1, 99, 'The quantity');
    if line_quantity is null then
      raise exception 'A line needs its quantity' using errcode = '22023';
    end if;
    line_note := private.json_text(entry -> 'note', 120, 'The note');
    if line_note ~ '[[:cntrl:]]' then
      raise exception 'A note is one line of text' using errcode = '22023';
    end if;
    line_allergy := private.json_bool(entry -> 'allergy', false, 'The allergy');
    line_held := private.json_bool(entry -> 'held', false, 'Held');
    line_picks := coalesce(entry -> 'choices', '[]'::jsonb);
    if jsonb_typeof(line_picks) = 'null' then
      line_picks := '[]'::jsonb;
    end if;
    if jsonb_typeof(line_picks) <> 'array' then
      raise exception 'Choices must be a list' using errcode = '22023';
    end if;
    canonical_picks := '[]'::jsonb;
    for pick in select p.value from jsonb_array_elements(line_picks) as p (value)
    loop
      if jsonb_typeof(pick) <> 'object' then
        raise exception 'A choice is a group and an option' using errcode = '22023';
      end if;
      if (select count(*) from jsonb_object_keys(pick) as k (field)) <> 2
        or jsonb_typeof(pick -> 'group') is distinct from 'string'
        or jsonb_typeof(pick -> 'option') is distinct from 'string'
      then
        raise exception 'A choice is a group and an option' using errcode = '22023';
      end if;
      canonical_picks := canonical_picks
        || jsonb_build_array(jsonb_build_object('group', pick -> 'group', 'option', pick -> 'option'));
    end loop;
    if line_allergy and line_note is null then
      raise exception 'An allergy says what in its note' using errcode = '22023', hint = 'allergy';
    end if;
    canonical_lines := canonical_lines || jsonb_build_array(jsonb_build_object(
      'item', line_item,
      'quantity', line_quantity,
      'note', line_note,
      'allergy', line_allergy,
      'held', line_held,
      'choices', canonical_picks
    ));
  end loop;
  body := private.order_round_hash(canonical_target, canonical_lines);

  -- All sends of a business one after another: two first sends to one place,
  -- a takeaway number and the demo's cap never race.
  perform 1 from public.businesses b where b.id = business for no key update;
  -- Gone since it was read (a demo's reset deletes it and writes it again):
  -- the phone sends again.
  if not found then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;

  -- The same round again: its answer as it is, before the clock is asked, so
  -- a retry of a round that went through is never refused.
  select r.* into stored from public.order_rounds r where r.id = round_key;
  if found then
    if stored.business_id <> business or stored.sent_by is distinct from actor then
      raise exception 'That round is someone else''s' using errcode = '23505', hint = 'key';
    end if;
    if stored.body_hash <> body then
      raise exception 'That round was sent with other lines' using errcode = '23505', hint = 'body';
    end if;
    return private.order_round_answer(stored.id);
  end if;

  perform private.require_taker(business, actor, at_time);

  if exists (select 1 from private.demo_businesses d where d.business_id = business)
    and (
      select count(*) from public.order_rounds r
      where r.business_id = business and r.sent_at > at_time - interval '1 hour'
    ) >= private.order_demo_per_hour()
  then
    raise exception 'The demo takes % rounds an hour', private.order_demo_per_hour()
      using errcode = '54000';
  end if;

  -- Each line's item: live, available and the business's, going to a live
  -- department, its picks fitting its choices. Every item refused is named.
  for entry in select e.value from jsonb_array_elements(canonical_lines) as e (value)
  loop
    line_item := (entry ->> 'item')::uuid;
    select i.* into item_row
    from public.menu_items i
    join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
    where i.id = line_item
      and i.business_id = business
      and i.archived_at is null
      and c.archived_at is null
      and i.available;
    if not found then
      if not (line_item = any (unavailable)) then
        unavailable := unavailable || line_item;
      end if;
      continue;
    end if;
    item_route := private.line_route(item_row.id);
    if item_route is null then
      if not (line_item = any (no_route)) then
        no_route := no_route || line_item;
      end if;
      continue;
    end if;
    item_unit := private.unit_agorot(item_row.price_agorot, item_row.option_groups, entry -> 'choices');
    if item_unit is null then
      raise exception 'Those choices don''t fit the item' using errcode = '22023', hint = 'choices';
    end if;
    if item_unit > 1100000 then
      raise exception 'A unit price is at most 11,000.00' using errcode = '22023', hint = 'price';
    end if;
    prepared := prepared || jsonb_build_array(entry || jsonb_build_object(
      'route', item_route,
      'unit', item_unit,
      'name', item_row.name,
      'frozen', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'group', g.value -> 'id',
            'groupName', g.value -> 'name',
            'option', o.value -> 'id',
            'optionName', o.value -> 'name',
            'priceAgorot', o.value -> 'priceAgorot'
          )
          order by g.n, o.n
        ), '[]'::jsonb)
        from jsonb_array_elements(item_row.option_groups) with ordinality as g (value, n)
        cross join lateral jsonb_array_elements(g.value -> 'options') with ordinality as o (value, n)
        where exists (
          select 1 from jsonb_array_elements(entry -> 'choices') as p (value)
          where p.value -> 'group' = g.value -> 'id' and p.value -> 'option' = o.value -> 'id'
        )
      )
    ));
  end loop;
  if cardinality(unavailable) > 0 then
    raise exception 'Some items can''t be ordered now'
      using errcode = '22023', hint = 'unavailable', detail = to_jsonb(unavailable)::text;
  end if;
  if cardinality(no_route) > 0 then
    raise exception 'Some items go to no department'
      using errcode = '22023', hint = 'route', detail = to_jsonb(no_route)::text;
  end if;

  -- The order.
  if target_order is not null then
    select o.* into the_order
    from public.orders o
    where o.id = target_order and o.business_id = business
    for update;
    if not found then
      raise exception 'Unknown order' using errcode = 'P0002';
    end if;
    if the_order.status <> 'open' then
      raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
    end if;
    if target_place is not null and the_order.place_id is distinct from target_place then
      raise exception 'The order moved to another place' using errcode = '55000', hint = 'moved';
    end if;
    order_ref := the_order.id;
  elsif target_place is not null then
    if not exists (
      select 1 from public.order_places p where p.id = target_place and p.business_id = business
    ) then
      raise exception 'Unknown place' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.order_places p
      where p.id = target_place and p.business_id = business and p.archived_at is null
    ) then
      raise exception 'That place was removed' using errcode = '22023', hint = 'place';
    end if;
    select o.* into the_order
    from public.orders o
    where o.business_id = business and o.place_id = target_place and o.status = 'open'
    for update;
    if found then
      if the_order.opened_at < at_time - interval '60 seconds' then
        raise exception 'That place has an open order'
          using errcode = '23505', hint = 'taken', detail = the_order.id::text;
      end if;
      order_ref := the_order.id;
    else
      insert into public.orders (business_id, place_id, day, opened_by, opened_at)
      values (business, target_place, private.order_business_day(business, at_time), actor, at_time)
      returning id into order_ref;
    end if;
  else
    order_day := private.order_business_day(business, at_time);
    insert into private.order_day_counters as c (business_id, day, last_no)
    values (business, order_day, 1)
    on conflict (business_id, day) do update set last_no = c.last_no + 1
    returning c.last_no into takeaway_number;
    if takeaway_number > 9999 then
      raise exception 'A business day has at most 9999 takeaways' using errcode = '54000';
    end if;
    insert into public.orders (
      business_id, takeaway_no, takeaway_label, day, opened_by, opened_at
    )
    values (business, takeaway_number, takeaway_label_given, order_day, actor, at_time)
    returning id into order_ref;
  end if;

  insert into public.order_rounds (id, business_id, order_id, body_hash, sent_by, sent_at)
  values (round_key, business, order_ref, body, actor, at_time);

  -- A ticket per department and block, in the order their lines came.
  for entry in select e.value from jsonb_array_elements(prepared) as e (value)
  loop
    line_held := (entry ->> 'held')::boolean;
    item_route := (entry ->> 'route')::uuid;
    ticket_ref := null;
    select t.id into ticket_ref
    from public.order_tickets t
    where t.round_id = round_key and t.department_id = item_route and t.held = line_held;
    if ticket_ref is null then
      insert into public.order_tickets (
        business_id, order_id, round_id, department_id, held, status, position
      )
      values (
        business, order_ref, round_key, item_route, line_held,
        case when line_held then 'held' else 'new' end, ticket_place::smallint
      )
      returning id into ticket_ref;
      ticket_place := ticket_place + 1;
    end if;
    insert into public.order_lines (
      business_id, ticket_id, item_id, name, unit_agorot, choices, quantity, note, allergy,
      position
    )
    values (
      business, ticket_ref, (entry ->> 'item')::uuid, entry ->> 'name', (entry ->> 'unit')::integer,
      entry -> 'frozen', (entry ->> 'quantity')::smallint, entry ->> 'note',
      (entry ->> 'allergy')::boolean, line_place::smallint
    );
    line_place := line_place + 1;
  end loop;

  perform private.bump_order_version(business);
  return private.order_round_answer(round_key);
end;
$$;

------------------------------------------------------------------------------
-- 4. Fixing a line, and cancelling an order

-- The sender takes back a line they sent (decision 5): within
-- takeBackMinutes of sending it (none when it is 0), while its ticket is
-- held or new and nobody of its department ever marked it ready, unless the
-- sender is on that department's staff (42501 hint 'own_department': they
-- cancel it with a reason). 42501 hint 'sender' for anyone else; 55000 hint
-- 'closed', 'cancelled', 'comped', 'prepared' or 'window'. One taken back
-- already is left as it is. Logged as order.line.take_back, with no sender,
-- only once the kitchen had it on its screen.
create function public.take_back_order_line(
  actor uuid,
  line uuid,
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
  ticket_ref uuid;
  the_order public.orders%rowtype;
  the_ticket public.order_tickets%rowtype;
  the_line public.order_lines%rowtype;
  the_round public.order_rounds%rowtype;
  window_length interval;
begin
  select l.business_id, l.ticket_id, t.order_id into row_business, ticket_ref, order_ref
  from public.order_lines l
  join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
  where l.id = line;
  perform private.order_writer(row_business, actor);
  perform private.require_taker(row_business, actor, at_time);

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select t.* into the_ticket from public.order_tickets t where t.id = ticket_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select l.* into the_line from public.order_lines l where l.id = line for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select r.* into the_round from public.order_rounds r where r.id = the_ticket.round_id;

  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;
  if the_round.sent_by is distinct from actor then
    raise exception 'Only the sender takes a line back' using errcode = '42501', hint = 'sender';
  end if;
  if the_line.taken_back_at is not null then
    return;
  end if;
  if the_line.cancelled_at is not null then
    raise exception 'The line was cancelled' using errcode = '55000', hint = 'cancelled';
  end if;
  if the_line.comped_at is not null then
    raise exception 'The line is on the house' using errcode = '55000', hint = 'comped';
  end if;
  if private.in_department(the_ticket.department_id, actor) and exists (
    select 1 from public.memberships m
    where m.business_id = row_business
      and m.user_id = actor
      and m.active
      and private.is_staff_role(m.role)
  ) then
    raise exception 'Someone of the department cancels it with a reason'
      using errcode = '42501', hint = 'own_department';
  end if;
  if the_ticket.prepared_at is not null or the_ticket.status in ('ready', 'served') then
    raise exception 'It was already prepared' using errcode = '55000', hint = 'prepared';
  end if;
  window_length := private.order_take_back(row_business);
  if window_length = interval '0' or at_time > the_round.sent_at + window_length then
    raise exception 'The time to take it back passed' using errcode = '55000', hint = 'window';
  end if;

  update public.order_lines l
  set taken_back_at = at_time, taken_back_by = actor
  where l.id = the_line.id;
  perform private.bump_order_version(row_business);
  if the_ticket.kitchen_seen_at is not null then
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      row_business, actor, 'order.line.take_back',
      private.order_line_facts(the_line.id) - 'sender',
      at_time
    );
  end if;
end;
$$;

-- Cancels a line (`cancelled` true), with `reason` ('guest', 'mistake',
-- 'sold_out' or 'other'), or undoes a cancel (`cancelled` false) while the
-- order is open. A line of a held or new ticket by anyone who takes orders
-- now, or runs orders; one of a ready or served ticket only by order_taking
-- .edit (42501 hint 'ready'). 55000 hint 'closed', 'taken_back' or 'comped';
-- 22023 for another reason. The same again is left as it is. Logged as
-- order.line.cancel with the reason and who sent it, or order.line.restore.
create function public.cancel_order_line(
  actor uuid,
  line uuid,
  reason text default null,
  cancelled boolean default true,
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
  ticket_ref uuid;
  the_order public.orders%rowtype;
  the_ticket public.order_tickets%rowtype;
  the_line public.order_lines%rowtype;
begin
  select l.business_id, l.ticket_id, t.order_id into row_business, ticket_ref, order_ref
  from public.order_lines l
  join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
  where l.id = line;
  perform private.order_writer(row_business, actor);
  -- Who, before any lock: someone who takes orders now or runs them. Whether
  -- its ticket is ready yet is asked once it is locked, below.
  perform private.require_taker_or_runs(row_business, actor, at_time);
  if cancelled is null then
    raise exception 'Cancelled or not' using errcode = '22023';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select t.* into the_ticket from public.order_tickets t where t.id = ticket_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select l.* into the_line from public.order_lines l where l.id = line for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;

  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;
  -- A line whose ticket is ready or served now: those who run orders only.
  if the_ticket.status in ('ready', 'served') and not private.runs_orders(row_business, actor) then
    raise exception 'A line already ready is cancelled by those who run orders'
      using errcode = '42501', hint = 'ready';
  end if;

  if cancelled then
    if the_line.cancelled_at is not null then
      return;
    end if;
    if the_line.taken_back_at is not null then
      raise exception 'The line was taken back' using errcode = '55000', hint = 'taken_back';
    end if;
    if the_line.comped_at is not null then
      raise exception 'The line is on the house' using errcode = '55000', hint = 'comped';
    end if;
    if reason is null or reason not in ('guest', 'mistake', 'sold_out', 'other') then
      raise exception 'A cancel says why' using errcode = '22023';
    end if;
    update public.order_lines l
    set cancelled_at = at_time, cancelled_by = actor, cancel_reason = reason
    where l.id = the_line.id;
    perform private.bump_order_version(row_business);
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      row_business, actor, 'order.line.cancel',
      private.order_line_facts(the_line.id) || jsonb_build_object('reason', reason),
      at_time
    );
  else
    if the_line.cancelled_at is null then
      return;
    end if;
    update public.order_lines l
    set cancelled_at = null, cancelled_by = null, cancel_reason = null
    where l.id = the_line.id;
    perform private.bump_order_version(row_business);
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      row_business, actor, 'order.line.restore',
      private.order_line_facts(the_line.id) - 'sender',
      at_time
    );
  end if;
end;
$$;

-- Gives a line on the house (`comped` true), with `reason` ('make_good',
-- 'staff' or 'other'), or takes that back (`comped` false), while the order
-- is open: order_taking.edit only, on a shift or not (42501). 55000 hint
-- 'closed', 'taken_back' or 'cancelled'; 22023 for another reason. The same
-- again is left as it is. Logged as order.line.comp with the reason and who
-- sent it, or order.line.uncomp.
create function public.comp_order_line(
  actor uuid,
  line uuid,
  reason text default null,
  comped boolean default true,
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
  ticket_ref uuid;
  the_order public.orders%rowtype;
  the_line public.order_lines%rowtype;
begin
  select l.business_id, l.ticket_id, t.order_id into row_business, ticket_ref, order_ref
  from public.order_lines l
  join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
  where l.id = line;
  perform private.order_writer(row_business, actor);
  if not private.runs_orders(row_business, actor) then
    raise exception 'Those who run orders only' using errcode = '42501';
  end if;
  if comped is null then
    raise exception 'On the house or not' using errcode = '22023';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  perform 1 from public.order_tickets t where t.id = ticket_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select l.* into the_line from public.order_lines l where l.id = line for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;

  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;

  if comped then
    if the_line.comped_at is not null then
      return;
    end if;
    if the_line.taken_back_at is not null then
      raise exception 'The line was taken back' using errcode = '55000', hint = 'taken_back';
    end if;
    if the_line.cancelled_at is not null then
      raise exception 'The line was cancelled' using errcode = '55000', hint = 'cancelled';
    end if;
    if reason is null or reason not in ('make_good', 'staff', 'other') then
      raise exception 'On the house says why' using errcode = '22023';
    end if;
    update public.order_lines l
    set comped_at = at_time, comped_by = actor, comp_reason = reason
    where l.id = the_line.id;
    perform private.bump_order_version(row_business);
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      row_business, actor, 'order.line.comp',
      private.order_line_facts(the_line.id) || jsonb_build_object('reason', reason),
      at_time
    );
  else
    if the_line.comped_at is null then
      return;
    end if;
    update public.order_lines l
    set comped_at = null, comped_by = null, comp_reason = null
    where l.id = the_line.id;
    perform private.bump_order_version(row_business);
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      row_business, actor, 'order.line.uncomp',
      private.order_line_facts(the_line.id) - 'sender',
      at_time
    );
  end if;
end;
$$;

-- Cancels a whole open order, with `reason` ('guest', 'mistake' or
-- 'other'): order_taking.edit only (42501), for good (default 6 to ask
-- Orel: no undo here; the screen holds it 8 seconds first). Every line still
-- live (not taken back, cancelled or on the house) is cancelled with the
-- same reason. 55000 hint 'closed' for a closed order; one cancelled already
-- is left as it is; 22023 for another reason. Logged as order.cancel with
-- the lines it cancelled, each with its quantity and unit price, never a sum.
create function public.cancel_order(
  actor uuid,
  order_ref uuid,
  reason text,
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
  gone jsonb;
begin
  select o.business_id into row_business from public.orders o where o.id = order_ref;
  perform private.order_writer(row_business, actor);
  if not private.runs_orders(row_business, actor) then
    raise exception 'Those who run orders only' using errcode = '42501';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if the_order.status = 'cancelled' then
    return;
  end if;
  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;
  if reason is null or reason not in ('guest', 'mistake', 'other') then
    raise exception 'A cancel says why' using errcode = '22023';
  end if;

  -- The lines it cancels, as they are before.
  select coalesce(jsonb_agg(
      jsonb_build_object(
        'line', l.id,
        'name', l.name,
        'choices', (
          select coalesce(jsonb_agg(c.value -> 'optionName' order by c.n), '[]'::jsonb)
          from jsonb_array_elements(l.choices) with ordinality as c (value, n)
        ),
        'quantity', l.quantity,
        'unitAgorot', l.unit_agorot,
        'department', t.department_id,
        'ticket', t.status
      )
      order by r.sent_at, r.id, l.position, l.id
    ), '[]'::jsonb)
  into gone
  from public.order_lines l
  join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
  join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
  where t.order_id = the_order.id
    and l.taken_back_at is null
    and l.cancelled_at is null
    and l.comped_at is null;

  update public.order_lines l
  set cancelled_at = at_time, cancelled_by = actor, cancel_reason = reason
  from public.order_tickets t
  where t.id = l.ticket_id
    and t.order_id = the_order.id
    and l.taken_back_at is null
    and l.cancelled_at is null
    and l.comped_at is null;
  update public.orders o
  set status = 'cancelled', cancelled_at = at_time, cancelled_by = actor, cancel_reason = reason
  where o.id = the_order.id;
  perform private.bump_order_version(row_business);

  insert into public.audit_log (business_id, actor_id, action, details, created_at)
  values (
    row_business, actor, 'order.cancel',
    jsonb_build_object(
      'order', the_order.id,
      'where', private.order_where(the_order.id),
      'day', the_order.day,
      'reason', reason,
      'lines', gone
    ),
    at_time
  );
end;
$$;

------------------------------------------------------------------------------
-- 5. The kitchen side

-- Marks a ticket ready (`ready` true), or back to new within 5 minutes
-- (`ready` false): by whoever is on the staff of its department, or runs
-- orders, on a shift or not (42501). 55000 hint 'closed', 'held' (fire it
-- first), 'served' or 'window'. The first ready by anyone is kept
-- (prepared_at), so the sender can no longer take it back. The same again
-- is left as it is. No log row.
create function public.set_order_ticket_ready(
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
    set status = 'new', ready_at = null, ready_by = null
    where t.id = the_ticket.id;
  end if;
  perform private.bump_order_version(row_business);
end;
$$;

-- Marks a ticket served (`served` true), or not (`served` false, back to
-- where it was: new when it was served before anyone marked it ready), by
-- whoever takes orders now or runs orders. 55000 hint 'closed' or 'held'.
-- The same again is left as it is. No log row.
create function public.serve_order_ticket(
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
      served_by = null
    where t.id = the_ticket.id;
  end if;
  perform private.bump_order_version(row_business);
end;
$$;

-- Calls the held blocks of an open order: each held ticket with a line still
-- live goes to its department as new. By whoever takes orders now or runs
-- orders. 55000 hint 'closed'. Returns how many it called; none changes
-- nothing.
create function public.fire_order_tickets(
  actor uuid,
  order_ref uuid,
  at_time timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_business uuid;
  the_order public.orders%rowtype;
  fired integer;
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
  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;

  update public.order_tickets t
  set status = 'new', fired_at = at_time, fired_by = actor
  where t.order_id = the_order.id
    and t.status = 'held'
    and exists (
      select 1 from public.order_lines l
      where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
    );
  get diagnostics fired = row_count;
  if fired > 0 then
    perform private.bump_order_version(row_business);
  end if;
  return fired;
end;
$$;

------------------------------------------------------------------------------
-- 6. The order

-- Moves an open order to another place, live in the business, by whoever
-- takes orders now or runs orders. Not a takeaway (55000 hint 'takeaway',
-- default 7 to ask Orel); 22023 hint 'place' for a removed place, P0002 for
-- one not the business's; 23505 hint 'taken' when the place has an open
-- order, its id as the detail; 55000 hint 'closed'. The same place is left
-- as it is.
create function public.move_order(
  actor uuid,
  order_ref uuid,
  place uuid,
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
  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;
  if the_order.place_id is null then
    raise exception 'A takeaway stays a takeaway' using errcode = '55000', hint = 'takeaway';
  end if;
  if not exists (
    select 1 from public.order_places p where p.id = place and p.business_id = row_business
  ) then
    raise exception 'Unknown place' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.order_places p
    where p.id = place and p.business_id = row_business and p.archived_at is null
  ) then
    raise exception 'That place was removed' using errcode = '22023', hint = 'place';
  end if;
  if place = the_order.place_id then
    return;
  end if;
  select o.id into other_order
  from public.orders o
  where o.business_id = row_business and o.place_id = place and o.status = 'open';
  if other_order is not null then
    raise exception 'That place has an open order'
      using errcode = '23505', hint = 'taken', detail = other_order::text;
  end if;

  update public.orders o
  set place_id = place, moved_from = the_order.place_id, moved_by = actor, moved_at = at_time
  where o.id = the_order.id;
  perform private.bump_order_version(row_business);
end;
$$;

-- Closes an open order, by whoever takes orders now or runs orders: every
-- ticket not yet served is served then (one never marked ready, as served
-- before it was ready). 55000 hint 'held' while a held block with a live
-- line waits (fire or cancel it first), 'closed' for a cancelled order. One
-- closed already is left as it is.
create function public.close_order(
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
    served_by = actor
  where t.order_id = the_order.id and t.status in ('new', 'ready');
  update public.orders o
  set status = 'closed', closed_at = at_time, closed_by = actor
  where o.id = the_order.id;
  perform private.bump_order_version(row_business);
end;
$$;

-- Opens a closed order again, the same business day only (55000 hint
-- 'day'), by whoever takes orders now or runs orders; its tickets stay
-- served. 55000 hint 'not_closed' for a cancelled order; 23505 hint 'taken'
-- when its place has another open order, its id as the detail. One open
-- already is left as it is.
create function public.reopen_order(
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
  set status = 'open', closed_at = null, closed_by = null, reopened_at = at_time, reopened_by = actor
  where o.id = the_order.id;
  perform private.bump_order_version(row_business);
end;
$$;

-- Names an open takeaway ("חולצה אדומה"), or clears its name (`label` null
-- or blank), by whoever takes orders now or runs orders: one line of up to
-- 20 characters (22023). 55000 hint 'takeaway' for an order at a place,
-- 'closed' for one no longer open.
create function public.set_order_label(
  actor uuid,
  order_ref uuid,
  label text default null,
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
  new_label text := nullif(btrim(label), '');
begin
  select o.business_id into row_business from public.orders o where o.id = order_ref;
  perform private.order_writer(row_business, actor);
  perform private.require_taker_or_runs(row_business, actor, at_time);
  if char_length(new_label) > 20 or new_label ~ '[[:cntrl:]]' then
    raise exception 'A label is one line of up to 20 characters' using errcode = '22023';
  end if;

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if the_order.status <> 'open' then
    raise exception 'The order is no longer open' using errcode = '55000', hint = 'closed';
  end if;
  if the_order.place_id is not null then
    raise exception 'Only a takeaway has a label' using errcode = '55000', hint = 'takeaway';
  end if;
  if new_label is not distinct from the_order.takeaway_label then
    return;
  end if;

  update public.orders o
  set takeaway_label = new_label
  where o.id = the_order.id;
  perform private.bump_order_version(row_business);
end;
$$;

------------------------------------------------------------------------------
-- 7. Reading

-- How the signed-in person reads the orders of `business`: 'runs' for
-- someone on its staff who holds order_taking.edit, 'takes' for someone who
-- takes orders now, 'view' or 'view_runs' for a view as a role on the staff
-- (as the viewed role holds order_taking.edit or not), all while the module
-- is on. P0002 for anyone else; 42501 hint 'clock' or 'stale_shift' for a
-- taker off a shift. Never a moment the caller picks: now.
create function private.order_access(business uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reader uuid := (select auth.uid());
  refusal text;
begin
  if not private.order_taking_on(business) then
    raise exception 'Unknown orders' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = reader
      and m.active
      and private.is_staff_role(m.role)
  ) then
    if private.runs_orders(business, reader) then
      return 'runs';
    end if;
    refusal := private.order_taker_refusal(business, reader, now());
    if refusal = 'not_taker' then
      raise exception 'Unknown orders' using errcode = 'P0002';
    end if;
    if refusal is not null then
      raise exception 'Orders are read during a shift' using errcode = '42501', hint = refusal;
    end if;
    return 'takes';
  end if;
  if private.is_viewing_staff(business) then
    if exists (
      select 1 from private.viewed_perms() v
      where v.business_id = business and v.perm = 'order_taking.edit'
    ) then
      return 'view_runs';
    end if;
    return 'view';
  end if;
  raise exception 'Unknown orders' using errcode = 'P0002';
end;
$$;

-- The floor of `business`: every open order (of any day, at an archived
-- place too) with its place or takeaway number and name, when it opened and
-- by whom, its last round, its tickets by status, since when its oldest new
-- ticket waits and whether the kitchen has yet to see one; today's closed
-- and cancelled orders; and, for those who run orders, how many lines were
-- taken back, cancelled and given on the house today. No money. Null when
-- `known_version` is the version now. As private.order_access reads it.
create function public.order_floor(business uuid, known_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access text := private.order_access(business);
  current_version bigint;
  today date := private.order_business_day(business, now());
begin
  select v.version into current_version
  from private.order_versions v
  where v.business_id = business;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;

  return jsonb_build_object(
    'version', current_version,
    'now', now(),
    'day', today,
    'runs', access in ('runs', 'view_runs'),
    'orders', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'place', o.place_id,
          'placeName', p.name,
          'takeaway', o.takeaway_no,
          'label', o.takeaway_label,
          'openedAt', o.opened_at,
          'openedBy', case when o.day = today then o.opened_by end,
          'movedAt', o.moved_at,
          'lastSentAt', (
            select max(r.sent_at) from public.order_rounds r
            where r.order_id = o.id and r.business_id = o.business_id
          ),
          'rounds', (
            select count(*) from public.order_rounds r
            where r.order_id = o.id and r.business_id = o.business_id
          ),
          'tickets', (
            select jsonb_build_object(
              'held', count(*) filter (where t.status = 'held'),
              'new', count(*) filter (where t.status = 'new'),
              'ready', count(*) filter (where t.status = 'ready'),
              'served', count(*) filter (where t.status = 'served')
            )
            from public.order_tickets t
            where t.order_id = o.id
              and t.business_id = o.business_id
              and exists (
                select 1 from public.order_lines l
                where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
              )
          ),
          'waitingSince', (
            select min(coalesce(t.fired_at, r.sent_at))
            from public.order_tickets t
            join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
            where t.order_id = o.id
              and t.business_id = o.business_id
              and t.status = 'new'
              and exists (
                select 1 from public.order_lines l
                where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
              )
          ),
          'unseen', exists (
            select 1 from public.order_tickets t
            where t.order_id = o.id
              and t.business_id = o.business_id
              and t.status = 'new'
              and t.kitchen_seen_at is null
              and exists (
                select 1 from public.order_lines l
                where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
              )
          )
        )
        order by o.opened_at, o.id
      ), '[]'::jsonb)
      from public.orders o
      left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
      where o.business_id = business and o.status = 'open'
    ),
    'closed', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'placeName', p.name,
          'takeaway', o.takeaway_no,
          'status', o.status,
          'closedAt', coalesce(o.closed_at, o.cancelled_at)
        )
        order by coalesce(o.closed_at, o.cancelled_at) desc, o.id
      ), '[]'::jsonb)
      from public.orders o
      left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
      where o.business_id = business and o.status <> 'open' and o.day = today
    ),
    'fixes', case
      when access in ('runs', 'view_runs') then (
        select jsonb_build_object(
          'takenBack', count(*) filter (where l.taken_back_at is not null),
          'cancelled', count(*) filter (where l.cancelled_at is not null),
          'comped', count(*) filter (where l.comped_at is not null)
        )
        from public.order_lines l
        join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
        join public.orders o on o.id = t.order_id and o.business_id = t.business_id
        where o.business_id = business and o.day = today
      )
    end
  );
end;
$$;

-- An order whole, for whoever reads the floor (private.order_access): its
-- place or takeaway, who opened, closed, opened again, moved or cancelled it
-- and when, the take-back time, and its rounds with their tickets and lines,
-- each line's unit price and choices as sent, never a sum. An order of a past
-- business day that isn't open only for those who run orders, and with no
-- person on it then. P0002 for anyone else.
create function public.order_detail(order_ref uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  the_order public.orders%rowtype;
  access text;
  is_today boolean;
begin
  -- No order, and another business's, answer word for word alike
  -- (private.order_access's words), so no id is told from none.
  select o.* into the_order from public.orders o where o.id = order_ref;
  if not found then
    raise exception 'Unknown orders' using errcode = 'P0002';
  end if;
  access := private.order_access(the_order.business_id);
  is_today := the_order.day = private.order_business_day(the_order.business_id, now());
  if the_order.status <> 'open' and not is_today and access not in ('runs', 'view_runs') then
    raise exception 'Unknown orders' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', the_order.id,
    'status', the_order.status,
    'day', the_order.day,
    'place', (
      select jsonb_build_object('id', p.id, 'name', p.name)
      from public.order_places p
      where p.id = the_order.place_id and p.business_id = the_order.business_id
    ),
    'takeaway', case
      when the_order.takeaway_no is not null then jsonb_build_object(
        'number', the_order.takeaway_no, 'label', the_order.takeaway_label
      )
    end,
    'openedAt', the_order.opened_at,
    'openedBy', case when is_today then the_order.opened_by end,
    'closedAt', the_order.closed_at,
    'closedBy', case when is_today then the_order.closed_by end,
    'reopenedAt', the_order.reopened_at,
    'reopenedBy', case when is_today then the_order.reopened_by end,
    'movedAt', the_order.moved_at,
    'movedBy', case when is_today then the_order.moved_by end,
    'movedFrom', (
      select p.name from public.order_places p
      where p.id = the_order.moved_from and p.business_id = the_order.business_id
    ),
    'cancelledAt', the_order.cancelled_at,
    'cancelledBy', case when is_today then the_order.cancelled_by end,
    'cancelReason', the_order.cancel_reason,
    'now', now(),
    'takeBackMinutes',
      (extract(epoch from private.order_take_back(the_order.business_id)) / 60)::integer,
    'rounds', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'sentAt', r.sent_at,
          'sentBy', case when is_today then r.sent_by end,
          'tickets', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', t.id,
                'department', t.department_id,
                'status', t.status,
                'held', t.held,
                'firedAt', t.fired_at,
                'kitchenSeenAt', t.kitchen_seen_at,
                'readyAt', t.ready_at,
                'servedAt', t.served_at,
                'prepared', t.prepared_at is not null,
                'lines', (
                  select coalesce(jsonb_agg(
                    jsonb_build_object(
                      'id', l.id,
                      'item', l.item_id,
                      'name', l.name,
                      'choices', (
                        select coalesce(jsonb_agg(
                          jsonb_build_object(
                            'group', c.value -> 'groupName',
                            'option', c.value -> 'optionName',
                            'priceAgorot', c.value -> 'priceAgorot'
                          )
                          order by c.n
                        ), '[]'::jsonb)
                        from jsonb_array_elements(l.choices) with ordinality as c (value, n)
                      ),
                      'quantity', l.quantity,
                      'note', l.note,
                      'allergy', l.allergy,
                      'unitAgorot', l.unit_agorot,
                      'takenBackAt', l.taken_back_at,
                      'cancelledAt', l.cancelled_at,
                      'cancelReason', l.cancel_reason,
                      'compedAt', l.comped_at,
                      'compReason', l.comp_reason
                    )
                    order by l.position, l.id
                  ), '[]'::jsonb)
                  from public.order_lines l
                  where l.ticket_id = t.id and l.business_id = t.business_id
                )
              )
              order by t.position, t.id
            ), '[]'::jsonb)
            from public.order_tickets t
            where t.round_id = r.id and t.business_id = r.business_id
          )
        )
        order by r.sent_at, r.id
      ), '[]'::jsonb)
      from public.order_rounds r
      where r.order_id = the_order.id and r.business_id = the_order.business_id
    )
  );
end;
$$;

-- What to ring up for an order, for whoever reads it (as public.order_detail
-- decides): its live lines by item (identical ones, choices and unit price
-- and all, with their quantities together) and by round, those on the house
-- marked. Taken back and cancelled lines are left out. No total (decision
-- 7): the till adds it up.
create function public.order_till(order_ref uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  the_order public.orders%rowtype;
  access text;
  is_today boolean;
begin
  -- No order, and another business's, answer word for word alike
  -- (private.order_access's words), so no id is told from none.
  select o.* into the_order from public.orders o where o.id = order_ref;
  if not found then
    raise exception 'Unknown orders' using errcode = 'P0002';
  end if;
  access := private.order_access(the_order.business_id);
  is_today := the_order.day = private.order_business_day(the_order.business_id, now());
  if the_order.status <> 'open' and not is_today and access not in ('runs', 'view_runs') then
    raise exception 'Unknown orders' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', the_order.id,
    'status', the_order.status,
    'place', (
      select jsonb_build_object('id', p.id, 'name', p.name)
      from public.order_places p
      where p.id = the_order.place_id and p.business_id = the_order.business_id
    ),
    'takeaway', case
      when the_order.takeaway_no is not null then jsonb_build_object(
        'number', the_order.takeaway_no, 'label', the_order.takeaway_label
      )
    end,
    'byItem', (
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
          where t.order_id = the_order.id
            and l.taken_back_at is null
            and l.cancelled_at is null
        ) x
        group by x.name, x.choice_names, x.unit_agorot, x.comped
      ) g
    ),
    'byRound', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'sentAt', r.sent_at,
          'sentBy', case when is_today then r.sent_by end,
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
      where r.order_id = the_order.id and r.business_id = the_order.business_id
    )
  );
end;
$$;

-- The signed-in person's own rounds of today's business day in `business`,
-- each with its order and its tickets (how many lines still live in each),
-- those with a ticket ready first, then the newest. A view is nobody's:
-- none. Null when `known_version` is the version now. As private.order_access
-- reads it.
create function public.order_mine(business uuid, known_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access text := private.order_access(business);
  reader uuid := (select auth.uid());
  current_version bigint;
  today date := private.order_business_day(business, now());
begin
  select v.version into current_version
  from private.order_versions v
  where v.business_id = business;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;

  return jsonb_build_object(
    'version', current_version,
    'now', now(),
    'day', today,
    'rounds', case
      when access in ('view', 'view_runs') then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'order', o.id,
            'placeName', p.name,
            'takeaway', o.takeaway_no,
            'orderStatus', o.status,
            'sentAt', r.sent_at,
            'tickets', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'id', t.id,
                  'department', t.department_id,
                  'status', t.status,
                  'held', t.held,
                  'kitchenSeenAt', t.kitchen_seen_at,
                  'readyAt', t.ready_at,
                  'servedAt', t.served_at,
                  'lines', (
                    select count(*) from public.order_lines l
                    where l.ticket_id = t.id
                      and l.taken_back_at is null
                      and l.cancelled_at is null
                  )
                )
                order by t.position, t.id
              ), '[]'::jsonb)
              from public.order_tickets t
              where t.round_id = r.id and t.business_id = r.business_id
            )
          )
          order by w.has_ready desc, r.sent_at desc, r.id
        ), '[]'::jsonb)
        from public.order_rounds r
        join public.orders o on o.id = r.order_id and o.business_id = r.business_id
        left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
        cross join lateral (
          select exists (
            select 1 from public.order_tickets t
            where t.round_id = r.id and t.business_id = r.business_id and t.status = 'ready'
          ) as has_ready
        ) w
        where r.business_id = business
          and r.sent_by = reader
          and private.order_business_day(business, r.sent_at) = today
      )
    end
  );
end;
$$;

-- What the kitchen prepares in `business`: the tickets of open orders, held
-- and new, and those made ready in the last 5 minutes, oldest first, each
-- with its lines (name, choices, quantity, note, allergy, and whether still
-- live), and no price at all. For someone on the staff, the live departments
-- they are in (none: P0002); for those who run orders and a view as a role on
-- the staff, every department. First it marks the new tickets of the
-- reader's own departments as seen (default 8 to ask Orel: only someone of
-- the department, never a view, never running orders alone). Null when
-- `known_version` is the version now. P0002 while the module is off and for
-- anyone else.
create function public.order_prep(business uuid, known_version bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reader uuid := (select auth.uid());
  on_staff boolean;
  every_department boolean := false;
  own uuid[];
  current_version bigint;
  today date;
begin
  if not private.order_taking_on(business) then
    raise exception 'Unknown orders' using errcode = 'P0002';
  end if;
  on_staff := exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = reader
      and m.active
      and private.is_staff_role(m.role)
  );
  if on_staff then
    select coalesce(array_agg(d.id order by d.position, d.key), '{}'::uuid[]) into own
    from public.departments d
    where d.business_id = business
      and d.archived_at is null
      and private.in_department(d.id, reader);
    every_department := private.runs_orders(business, reader);
    if cardinality(own) = 0 and not every_department then
      raise exception 'Unknown orders' using errcode = 'P0002';
    end if;
  elsif private.is_viewing_staff(business) then
    own := '{}'::uuid[];
    every_department := true;
  else
    raise exception 'Unknown orders' using errcode = 'P0002';
  end if;

  -- Seen by someone of its department.
  if on_staff and exists (
    select 1
    from public.order_tickets t
    join public.orders o on o.id = t.order_id and o.business_id = t.business_id
    where t.business_id = business
      and t.status = 'new'
      and t.kitchen_seen_at is null
      and o.status = 'open'
      and t.department_id = any (own)
  ) then
    perform 1 from public.businesses b where b.id = business for no key update;
    update public.order_tickets t
    set kitchen_seen_at = now()
    from public.orders o
    where o.id = t.order_id
      and o.business_id = t.business_id
      and t.business_id = business
      and t.status = 'new'
      and t.kitchen_seen_at is null
      and o.status = 'open'
      and t.department_id = any (own);
    perform private.bump_order_version(business);
  end if;

  select v.version into current_version
  from private.order_versions v
  where v.business_id = business;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;
  today := private.order_business_day(business, now());

  return jsonb_build_object(
    'version', current_version,
    'now', now(),
    'departments', case
      when every_department then (
        select coalesce(jsonb_agg(d.id order by d.position, d.key), '[]'::jsonb)
        from public.departments d
        where d.business_id = business and d.archived_at is null
      )
      else to_jsonb(own)
    end,
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
                  when l.taken_back_at is not null then 'takenBack'
                  when l.cancelled_at is not null then 'cancelled'
                  else 'live'
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
      where t.business_id = business
        and o.status = 'open'
        and (every_department or t.department_id = any (own))
        and (
          t.status = 'new'
          or (t.status = 'ready' and t.ready_at > now() - interval '5 minutes')
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

-- The items most ordered in `business` in the last 14 days, for the send's
-- first screen: up to 8 of its live, available items, by how many of their
-- lines were sent and not taken back or cancelled, ties by name. No person,
-- no money. As private.order_access reads it.
create function public.order_favourites(business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.order_access(business);
  return jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(f.id order by f.ordered desc, f.name, f.id), '[]'::jsonb)
      from (
        select i.id, i.name, sum(l.quantity) as ordered
        from public.order_lines l
        join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
        join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
        join public.menu_items i on i.id = l.item_id and i.business_id = l.business_id
        join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
        where l.business_id = business
          and r.sent_at > now() - interval '14 days'
          and l.taken_back_at is null
          and l.cancelled_at is null
          and i.archived_at is null
          and c.archived_at is null
          and i.available
        group by i.id, i.name
        order by sum(l.quantity) desc, i.name, i.id
        limit 8
      ) f
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- They run inside the functions, as their owner, for nobody else.
revoke execute on function private.bump_order_version(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_demo_per_hour()
  from public, anon, authenticated, service_role;
revoke execute on function private.order_round_hash(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_where(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_line_facts(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_writer(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.require_taker_or_runs(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_round_answer(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_access(uuid)
  from public, anon, authenticated, service_role;

-- The screens read with the person's own session.
revoke execute on function public.order_floor(uuid, bigint) from public, anon;
grant execute on function public.order_floor(uuid, bigint) to authenticated;
revoke execute on function public.order_detail(uuid) from public, anon;
grant execute on function public.order_detail(uuid) to authenticated;
revoke execute on function public.order_till(uuid) from public, anon;
grant execute on function public.order_till(uuid) to authenticated;
revoke execute on function public.order_mine(uuid, bigint) from public, anon;
grant execute on function public.order_mine(uuid, bigint) to authenticated;
revoke execute on function public.order_prep(uuid, bigint) from public, anon;
grant execute on function public.order_prep(uuid, bigint) to authenticated;
revoke execute on function public.order_favourites(uuid) from public, anon;
grant execute on function public.order_favourites(uuid) to authenticated;

-- The server's alone, for `actor`.
revoke execute on function public.send_order_round(uuid, uuid, uuid, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.send_order_round(uuid, uuid, uuid, jsonb, jsonb, timestamptz)
  to service_role;
revoke execute on function public.take_back_order_line(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.take_back_order_line(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.cancel_order_line(uuid, uuid, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cancel_order_line(uuid, uuid, text, boolean, timestamptz)
  to service_role;
revoke execute on function public.comp_order_line(uuid, uuid, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.comp_order_line(uuid, uuid, text, boolean, timestamptz)
  to service_role;
revoke execute on function public.cancel_order(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cancel_order(uuid, uuid, text, timestamptz) to service_role;
revoke execute on function public.set_order_ticket_ready(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_order_ticket_ready(uuid, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.serve_order_ticket(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.serve_order_ticket(uuid, uuid, boolean, timestamptz)
  to service_role;
revoke execute on function public.fire_order_tickets(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fire_order_tickets(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.move_order(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.move_order(uuid, uuid, uuid, timestamptz) to service_role;
revoke execute on function public.close_order(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.close_order(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.reopen_order(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reopen_order(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.set_order_label(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_order_label(uuid, uuid, text, timestamptz) to service_role;
