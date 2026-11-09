-- Lists, part 2 of 2 (Orel, 8 and 9 November 2026, issue #1; L1 of the lists
-- plan): departments and the whole lists database, with no screen yet. The
-- module is off in every template and every business until L2 switches it on.
--
--   departments      a business's own groups of people (kitchen, bar,
--                    storeroom), from its template, edited by owners, managers
--                    and the team, like positions. Removing one archives it, so
--                    old lists keep its name and it can come back (undo).
--   list templates   what a list holds (a check, a number with its range, a
--                    note; photos come later), who it goes to by default, and,
--                    for an order between departments, the department that
--                    asks. Each template's times (list_schedules) are stored
--                    now and run from L4.
--   lists            what was sent or opened: a copy of the items with their
--                    results, who holds it (a person, a department, the people
--                    of a shift when it was sent, a role), and its timeline
--                    (sent, passed, finished, closed). A finished list is
--                    frozen until a list manager reopens it.
--   who reads        departments: the business's members. Templates: members
--                    read the live ones, list managers the archived ones too.
--                    A list: whoever holds it, sent it, was given it, asked for
--                    it or held it before it was passed on, and list managers
--                    (owners, managers, `lists.manage`). A view session reads
--                    as a manager would. With the module off, nothing of lists
--                    is read.
--   writes           server functions with the secret key, for `actor`, each
--                    with its own audit row (set_list_item has none: the item
--                    is the record). Unknown and not yours are the same answer
--                    (P0002), so ids can't be probed across businesses.
--   notifications    a trigger of its own on the audit log
--                    (private.notify_for_lists), so the next notification parts
--                    can replace private.notify_for without dropping lists: a
--                    list sent tells the people it is for; finishing tells
--                    whoever sent it and the department that asked, and settles
--                    the list's lines.
--   templates        `departments` and `listTemplates` are new top-level keys of
--                    a template's definition (@domain/templates), copied by
--                    apply_template, which becomes security definer so the
--                    server role reaches private.copy_template_lists. Every
--                    template is a version up, with the module off.
--   demo             demo people name their departments; the reset puts them
--                    in and ends with private.seed_demo_lists, which does
--                    nothing yet: the next parts replace it, never the reset.

------------------------------------------------------------------------------
-- Departments

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9-]*$' and char_length(key) <= 40),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  position smallint not null default 0,
  -- Removed on screen: kept so old lists keep its name, and for undo.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key),
  unique (id, business_id)
);

create unique index departments_name_idx
  on public.departments (business_id, lower(name)) where archived_at is null;

create trigger departments_touch before update on public.departments
  for each row execute function public.touch_updated_at();

-- A person can be in several departments; managers and owners too.
create table public.department_members (
  department_id uuid not null,
  business_id uuid not null,
  user_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (department_id, user_id),
  foreign key (department_id, business_id)
    references public.departments (id, business_id) on delete cascade,
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete cascade
);

create index department_members_department_idx
  on public.department_members (department_id, business_id);
create index department_members_user_idx
  on public.department_members (business_id, user_id);

------------------------------------------------------------------------------
-- List templates

create table public.list_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- From the global template; null for the business's own.
  key text check (key ~ '^[a-z][a-z0-9-]*$' and char_length(key) <= 40),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  -- Instructions on top of the list.
  note text check (char_length(note) between 1 and 300 and note = btrim(note)),
  -- Who it goes to when sent without choosing; null: chosen each time. Never a
  -- person: people leave, and the send screen picks a person each time.
  recipient_kind text check (recipient_kind in ('department', 'shift', 'role')),
  recipient_department uuid,
  -- A shift pattern key of the scheduling settings.
  recipient_shift text
    check (recipient_shift ~ '^[a-z][a-z0-9-]*$' and char_length(recipient_shift) <= 40),
  recipient_role public.member_role,
  -- An order between departments: the department that asks. Its members may
  -- send it to the template's own recipient with no permission of their own.
  from_department uuid,
  -- The sender sets a count per item; the receiver says how many were given.
  asks_quantities boolean not null default false,
  position smallint not null default 0,
  -- Saves pass the version they read, and are refused (40001) when it moved.
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (business_id, key),
  unique (id, business_id),
  foreign key (recipient_department, business_id)
    references public.departments (id, business_id),
  foreign key (from_department, business_id)
    references public.departments (id, business_id),
  -- The recipient's shape, inline: a check that called into `private` would
  -- run as whoever inserts, and the server role has no use of that schema.
  -- Exactly the column of the kind is set, and none without a kind.
  check (num_nonnulls(recipient_department, recipient_shift, recipient_role)
    = case when recipient_kind is null then 0 else 1 end),
  check (recipient_kind is distinct from 'department' or recipient_department is not null),
  check (recipient_kind is distinct from 'shift' or recipient_shift is not null),
  check (recipient_kind is distinct from 'role' or recipient_role is not null),
  -- An order goes from its department to another one.
  check (
    from_department is null
    or (recipient_kind = 'department' and recipient_department <> from_department)
  )
);

create index list_templates_recipient_department_idx
  on public.list_templates (recipient_department, business_id);
create index list_templates_from_department_idx
  on public.list_templates (from_department, business_id);
create index list_templates_created_by_idx on public.list_templates (created_by);
create index list_templates_updated_by_idx on public.list_templates (updated_by);

create trigger list_templates_touch before update on public.list_templates
  for each row execute function public.touch_updated_at();

create table public.list_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  business_id uuid not null,
  position smallint not null,
  kind text not null check (kind in ('check', 'number', 'note', 'photo')),
  label text not null check (char_length(label) between 1 and 120 and label = btrim(label)),
  hint text check (char_length(hint) between 1 and 200 and hint = btrim(hint)),
  required boolean not null default true,
  -- Numbers only: the unit ("°C", "₪") and the range a reading is flagged outside.
  unit text check (char_length(unit) between 1 and 12 and unit = btrim(unit)),
  min_value numeric check (min_value between -100000 and 100000),
  max_value numeric check (max_value between -100000 and 100000),
  -- Orders: the usual count of a check item, filled in when sending.
  default_quantity integer check (default_quantity between 1 and 9999),
  -- list_items.template_item_id points here, inside the business.
  unique (id, business_id),
  foreign key (template_id, business_id)
    references public.list_templates (id, business_id) on delete cascade,
  check (kind = 'number' or (unit is null and min_value is null and max_value is null)),
  check (min_value is null or max_value is null or min_value <= max_value),
  check (kind = 'check' or default_quantity is null)
);

create index list_template_items_template_idx
  on public.list_template_items (template_id, business_id, position);

-- When a template's lists open by themselves. Stored from L1, run from L4.
create table public.list_schedules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  business_id uuid not null,
  position smallint not null default 0,
  -- 0 = Sunday, each once (the save function checks that).
  days smallint[] not null
    check (cardinality(days) between 1 and 7 and days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  -- day: minutes from the business's local midnight. shift_start, shift_end:
  -- from a published shift with this pattern key on that day.
  anchor text not null default 'day' check (anchor in ('day', 'shift_start', 'shift_end')),
  shift_key text check (shift_key ~ '^[a-z][a-z0-9-]*$' and char_length(shift_key) <= 40),
  opens_offset integer not null,
  -- After opens_offset, at most a day later.
  due_offset integer not null,
  recipient_kind text not null
    check (recipient_kind in ('person', 'department', 'shift', 'role')),
  -- A person by their place in the business: when the membership goes, so does
  -- the schedule. Never `references profiles on delete set null`, which the
  -- shape check below would refuse, blocking the profile's deletion.
  recipient_user uuid,
  recipient_department uuid,
  recipient_shift text
    check (recipient_shift ~ '^[a-z][a-z0-9-]*$' and char_length(recipient_shift) <= 40),
  recipient_role public.member_role,
  -- A pause, without losing the times.
  active boolean not null default true,
  -- The first local day it runs: the business's local today when it was
  -- saved, never the database's day (UTC, yesterday in Israel after midnight).
  starts_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- lists.schedule_id points here, inside the business.
  unique (id, business_id),
  foreign key (template_id, business_id)
    references public.list_templates (id, business_id) on delete cascade,
  foreign key (business_id, recipient_user)
    references public.memberships (business_id, user_id) on delete cascade,
  foreign key (recipient_department, business_id)
    references public.departments (id, business_id),
  check ((anchor = 'day') = (shift_key is null)),
  check (anchor <> 'day' or opens_offset between 0 and 1439),
  check (anchor = 'day' or opens_offset between -720 and 720),
  check (due_offset > opens_offset and due_offset <= opens_offset + 1440),
  -- The recipient's shape, inline (see list_templates).
  check (num_nonnulls(recipient_user, recipient_department, recipient_shift, recipient_role) = 1),
  check (recipient_kind <> 'person' or recipient_user is not null),
  check (recipient_kind <> 'department' or recipient_department is not null),
  check (recipient_kind <> 'shift' or recipient_shift is not null),
  check (recipient_kind <> 'role' or recipient_role is not null)
);

create index list_schedules_template_idx
  on public.list_schedules (template_id, business_id, position);
create index list_schedules_recipient_user_idx
  on public.list_schedules (business_id, recipient_user);
create index list_schedules_recipient_department_idx
  on public.list_schedules (recipient_department, business_id);

create trigger list_schedules_touch before update on public.list_schedules
  for each row execute function public.touch_updated_at();

------------------------------------------------------------------------------
-- Lists: what was sent or opened

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Null: a list typed when sending.
  template_id uuid,
  -- Set: opened by a schedule, for its local day.
  schedule_id uuid,
  occurs_on date,
  name text not null check (char_length(name) between 1 and 60),
  -- The template's note and the sender's, a line apart.
  note text check (char_length(note) between 1 and 601),
  origin text not null check (origin in ('sent', 'scheduled')),
  status text not null default 'open'
    check (status in ('open', 'finished', 'missed', 'cancelled')),
  -- Who holds it now (passing changes this; the history is in list_passes).
  -- A person's or a shift's people are in list_people, a department's and a
  -- role's are read live, so someone new to the storeroom sees what waits there.
  recipient_kind text not null
    check (recipient_kind in ('person', 'department', 'shift', 'role')),
  recipient_department uuid,
  recipient_role public.member_role,
  -- Not composite: schedule_shifts has no (id, business_id) key, and a
  -- republish deletes the row anyway. The writers check the business.
  shift_id uuid references public.schedule_shifts (id) on delete set null,
  -- The shift as it was when the list opened (private.shift_brief), still
  -- readable after a republish.
  shift jsonb,
  -- The department that asked (orders).
  from_department uuid,
  asks_quantities boolean not null default false,
  -- Null for scheduled lists.
  sent_by uuid references public.profiles (id) on delete set null,
  opens_at timestamptz not null,
  due_at timestamptz,
  reminded_at timestamptz,
  -- When it became late (from L4), never cleared.
  late_at timestamptz,
  finished_at timestamptz,
  finished_by uuid references public.profiles (id) on delete set null,
  -- Cancelled or missed.
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (template_id, business_id)
    references public.list_templates (id, business_id) on delete set null (template_id),
  foreign key (schedule_id, business_id)
    references public.list_schedules (id, business_id) on delete set null (schedule_id),
  foreign key (recipient_department, business_id)
    references public.departments (id, business_id),
  foreign key (from_department, business_id)
    references public.departments (id, business_id),
  check ((recipient_kind = 'department') = (recipient_department is not null)),
  check ((recipient_kind = 'role') = (recipient_role is not null)),
  check ((status = 'finished') = (finished_at is not null)),
  check ((status in ('missed', 'cancelled')) = (closed_at is not null)),
  check (due_at is null or due_at > opens_at),
  check (origin <> 'scheduled' or occurs_on is not null),
  -- A plain unique key: nulls are distinct, so sent lists never meet it, and
  -- the tick's `on conflict (schedule_id, occurs_on)` infers it.
  unique (schedule_id, occurs_on)
);

create index lists_open_idx on public.lists (business_id, due_at) where status = 'open';
create index lists_day_idx on public.lists (business_id, opens_at desc);
create index lists_template_idx on public.lists (template_id, business_id);
create index lists_schedule_idx on public.lists (schedule_id, business_id);
create index lists_department_idx on public.lists (recipient_department, business_id);
create index lists_from_department_idx on public.lists (from_department, business_id);
create index lists_shift_idx on public.lists (shift_id);
create index lists_sent_by_idx on public.lists (sent_by);
create index lists_finished_by_idx on public.lists (finished_by);
create index lists_closed_by_idx on public.lists (closed_by);

create trigger lists_touch before update on public.lists
  for each row execute function public.touch_updated_at();

-- The people a list is for when it went to a person or a shift (the shift's
-- people when it was sent). They keep reading it after it is passed on.
create table public.list_people (
  list_id uuid not null,
  business_id uuid not null,
  user_id uuid not null,
  primary key (list_id, user_id),
  foreign key (list_id, business_id)
    references public.lists (id, business_id) on delete cascade,
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete cascade
);

create index list_people_list_idx on public.list_people (list_id, business_id);
create index list_people_user_idx on public.list_people (business_id, user_id);

-- One row per item of a list: a copy of the template's item, and its result.
-- Who did it and when sit on the row.
create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  business_id uuid not null,
  -- The template's item, for readings over time.
  template_item_id uuid,
  position smallint not null,
  kind text not null check (kind in ('check', 'number', 'note', 'photo')),
  label text not null check (char_length(label) between 1 and 120),
  hint text check (char_length(hint) between 1 and 200),
  required boolean not null default true,
  unit text check (char_length(unit) between 1 and 12),
  min_value numeric,
  max_value numeric,
  -- Orders: how many the sender asked for.
  requested integer check (requested between 0 and 9999),
  -- The result.
  checked boolean,
  reading numeric check (reading between -100000 and 100000),
  answer text check (char_length(answer) between 1 and 500 and answer = btrim(answer)),
  -- From L6: <business>/<list>/<file>.
  photo_path text
    check (photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9-]{1,40}\.(webp|jpg)$'),
  -- Orders: how many were given (ticking gives what was asked for).
  given integer check (given between 0 and 9999),
  comment text check (char_length(comment) between 1 and 200 and comment = btrim(comment)),
  -- Whether the item counts as done: kept by set_list_item, held to its result
  -- here.
  done boolean not null default false,
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  foreign key (list_id, business_id)
    references public.lists (id, business_id) on delete cascade,
  foreign key (template_item_id, business_id)
    references public.list_template_items (id, business_id)
    on delete set null (template_item_id),
  check (kind = 'check' or (checked is null and given is null and requested is null)),
  check (kind = 'number' or reading is null),
  check (kind = 'note' or answer is null),
  check (kind = 'photo' or photo_path is null),
  check (done = case kind
    when 'check' then coalesce(checked, false) or given is not null
    when 'number' then reading is not null
    when 'note' then answer is not null
    else photo_path is not null
  end),
  -- Who did it may be gone (their profile deleted); when, never.
  check (done = (done_at is not null)),
  check (done or done_by is null)
);

create index list_items_list_idx on public.list_items (list_id, business_id, position);
create index list_items_template_item_idx
  on public.list_items (template_item_id, business_id);
create index list_items_done_by_idx on public.list_items (done_by);

-- Passing a list to another department (the function comes in L5).
create table public.list_passes (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  business_id uuid not null,
  -- Null: it was with a person, a shift or a role.
  from_department uuid,
  to_department uuid not null,
  passed_by uuid references public.profiles (id) on delete set null,
  passed_at timestamptz not null default now(),
  note text check (char_length(note) between 1 and 200 and note = btrim(note)),
  foreign key (list_id, business_id)
    references public.lists (id, business_id) on delete cascade,
  foreign key (from_department, business_id)
    references public.departments (id, business_id),
  foreign key (to_department, business_id)
    references public.departments (id, business_id)
);

create index list_passes_list_idx on public.list_passes (list_id, business_id, passed_at);
create index list_passes_from_department_idx
  on public.list_passes (from_department, business_id);
create index list_passes_to_department_idx
  on public.list_passes (to_department, business_id);
create index list_passes_passed_by_idx on public.list_passes (passed_by);

alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.list_templates enable row level security;
alter table public.list_template_items enable row level security;
alter table public.list_schedules enable row level security;
alter table public.lists enable row level security;
alter table public.list_people enable row level security;
alter table public.list_items enable row level security;
alter table public.list_passes enable row level security;

-- Every write goes through the functions below, with the secret key.
revoke all on
  public.departments, public.department_members, public.list_templates,
  public.list_template_items, public.list_schedules, public.lists,
  public.list_people, public.list_items, public.list_passes
from anon, authenticated;
grant select on
  public.departments, public.department_members, public.list_templates,
  public.list_template_items, public.list_schedules, public.lists,
  public.list_people, public.list_items, public.list_passes
to authenticated;

comment on table public.departments is
  'A business''s own groups of people (kitchen, bar, storeroom), from its template. Removed ones are archived, so old lists keep their name. Written by public.set_departments.';
comment on table public.lists is
  'Lists sent or opened in a business, with their items in list_items and their people in list_people. Written only by the lists functions; read by whoever it is for, sent it or asked for it, and by list managers.';

------------------------------------------------------------------------------
-- Who may do what with lists

-- `person` manages the business's lists: an active owner or manager, or an
-- active member holding `lists.manage` (the manifest's defaultRole "manager").
create function private.can_manage_lists(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (m.role in ('owner', 'manager') or 'lists.manage' = any (m.perms))
  )
$$;

-- `person` may send any list to anyone: a list manager, or an active member
-- holding `lists.send` (the manifest's defaultRole "manager"). A department's
-- own orders need neither.
create function private.can_send_lists(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (
        m.role in ('owner', 'manager')
        or m.perms && '{lists.manage,lists.send}'::text[]
      )
  )
$$;

-- `person` is in the department, which is live (a removed department sends
-- and cancels nothing, though set_departments keeps its people for the undo),
-- and an active member of its business.
create function private.in_department(department uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.department_members dm
    join public.departments d on d.id = dm.department_id and d.archived_at is null
    join public.memberships m
      on m.business_id = dm.business_id and m.user_id = dm.user_id and m.active
    where dm.department_id = department and dm.user_id = person
  )
$$;

-- The list is for `person` now: they are among its people (a person, a shift),
-- in its department, or in its role, and an active member of its business.
-- Lists a removed department already holds stay with its people, so they are
-- never left with nobody to fill them.
create function private.holds_list(list uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lists l
    join public.memberships m
      on m.business_id = l.business_id and m.user_id = person and m.active
    where l.id = list
      and case l.recipient_kind
        when 'department' then exists (
          select 1 from public.department_members dm
          where dm.department_id = l.recipient_department and dm.user_id = person
        )
        when 'role' then m.role = l.recipient_role
        else exists (
          select 1 from public.list_people p
          where p.list_id = l.id and p.user_id = person
        )
      end
  )
$$;

-- `person` may read the list: an active member of its business who holds it,
-- sent it, is among its people, is in the department that asked for it or in
-- one it passed through, or manages the business's lists.
create function private.sees_list(list uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lists l
    join public.memberships m
      on m.business_id = l.business_id and m.user_id = person and m.active
    where l.id = list
      and (
        m.role in ('owner', 'manager')
        or 'lists.manage' = any (m.perms)
        or l.sent_by = person
        or private.holds_list(l.id, person)
        or exists (
          select 1 from public.list_people p
          where p.list_id = l.id and p.user_id = person
        )
        or exists (
          select 1 from public.department_members dm
          where dm.user_id = person and dm.department_id = l.from_department
        )
        or exists (
          select 1
          from public.list_passes lp
          join public.department_members dm
            on dm.user_id = person
            and dm.department_id in (lp.from_department, lp.to_department)
          where lp.list_id = l.id
        )
      )
  )
$$;

-- The active people a list is for now, for its notifications.
create function private.list_holders(list uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[])
  from public.lists l
  join public.memberships m on m.business_id = l.business_id and m.active
  where l.id = list
    and case l.recipient_kind
      when 'department' then exists (
        select 1 from public.department_members dm
        where dm.department_id = l.recipient_department and dm.user_id = m.user_id
      )
      when 'role' then m.role = l.recipient_role
      else exists (
        select 1 from public.list_people p
        where p.list_id = l.id and p.user_id = m.user_id
      )
    end
$$;

-- The business's list managers.
create function private.list_managers(business uuid)
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
    and (m.role in ('owner', 'manager') or 'lists.manage' = any (m.perms))
$$;

-- The business's lists settings over the manifest's defaults
-- (modules/lists/manifest.ts; modules/lists/settings.db.test.ts keeps the two
-- the same).
create function private.list_settings(business uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'remindBeforeMinutes', 30,
      'lateAfterMinutes', 15,
      'tellManagersWhenLate', true,
      'tellWhenFinished', true
    )
    || coalesce(
      (
        select bm.settings
        from public.business_modules bm
        where bm.business_id = business and bm.module_key = 'lists'
      ),
      '{}'::jsonb
    )
$$;

-- One lists setting, as text.
create function private.list_setting(business uuid, key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.list_settings(business) ->> key
$$;

-- The module is on for the business, or raise.
create function private.lists_on(business uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.module_enabled(business, 'lists') then
    raise exception 'Lists are off for this business' using errcode = '42501';
  end if;
end;
$$;

-- A shift pattern key the business's scheduling settings have.
create function private.has_shift_pattern(business uuid, pattern text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_modules bm,
      jsonb_array_elements(
        case when jsonb_typeof(bm.settings -> 'shifts') = 'array'
          then bm.settings -> 'shifts' else '[]'::jsonb end
      ) as s (value)
    where bm.business_id = business
      and bm.module_key = 'scheduling'
      and s.value ->> 'key' = pattern
  )
$$;

------------------------------------------------------------------------------
-- Reading

-- Departments are business data, not the lists module's: every member reads
-- them, and so does the team while viewing.
create policy "members read their business's departments"
  on public.departments for select to authenticated
  using (private.is_member(business_id) or private.is_viewing(business_id));

create policy "members read who is in which department"
  on public.department_members for select to authenticated
  using (private.is_member(business_id) or private.is_viewing(business_id));

-- Members read live templates (to send their department's orders and to see
-- where a list came from); list managers read the archived ones too (undo).
create policy "members read their business's list templates"
  on public.list_templates for select to authenticated
  using (
    private.module_enabled(business_id, 'lists')
    and (
      (archived_at is null
        and (private.is_member(business_id) or private.is_viewing(business_id)))
      or private.can_manage_lists(business_id, (select auth.uid()))
      or private.is_viewing(business_id, 'manager')
    )
  );

create policy "items follow their template"
  on public.list_template_items for select to authenticated
  using (
    exists (
      select 1 from public.list_templates t
      where t.id = list_template_items.template_id
    )
  );

create policy "list managers read the schedules"
  on public.list_schedules for select to authenticated
  using (
    private.module_enabled(business_id, 'lists')
    and (
      private.can_manage_lists(business_id, (select auth.uid()))
      or private.is_viewing(business_id, 'manager')
    )
  );

create policy "people read the lists they see"
  on public.lists for select to authenticated
  using (
    private.module_enabled(business_id, 'lists')
    and (
      private.sees_list(id, (select auth.uid()))
      or private.is_viewing(business_id, 'manager')
    )
  );

create policy "items follow their list"
  on public.list_items for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_items.list_id));

create policy "people follow their list"
  on public.list_people for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_people.list_id));

create policy "passes follow their list"
  on public.list_passes for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_passes.list_id));

------------------------------------------------------------------------------
-- Reading what the app sends

-- Text from JSON, trimmed, or null when missing, null or blank. Raises 22023
-- for anything else or text longer than `max_length`.
create function private.json_text(raw jsonb, max_length integer, what text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  trimmed text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then
    return null;
  end if;
  if jsonb_typeof(raw) <> 'string' then
    raise exception '% must be text', what using errcode = '22023';
  end if;
  trimmed := btrim(raw #>> '{}'::text[]);
  if trimmed = '' then
    return null;
  end if;
  if char_length(trimmed) > max_length then
    raise exception '% is longer than % characters', what, max_length
      using errcode = '22023';
  end if;
  return trimmed;
end;
$$;

-- A key ("kitchen", "d-1a2b3c4d") from JSON, or null when missing or null.
create function private.json_key(raw jsonb, what text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  given_key text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then
    return null;
  end if;
  given_key := raw #>> '{}'::text[];
  if jsonb_typeof(raw) <> 'string'
    or given_key !~ '^[a-z][a-z0-9-]*$'
    or char_length(given_key) > 40 then
    raise exception '% must be a key', what using errcode = '22023';
  end if;
  return given_key;
end;
$$;

-- A whole number from JSON between `lo` and `hi`, or null when missing or null.
create function private.json_int(raw jsonb, lo integer, hi integer, what text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then
    return null;
  end if;
  if jsonb_typeof(raw) <> 'number' then
    raise exception '% must be a number', what using errcode = '22023';
  end if;
  n := (raw #>> '{}'::text[])::numeric;
  if n <> trunc(n) or n < lo or n > hi then
    raise exception '% must be a whole number from % to %', what, lo, hi
      using errcode = '22023';
  end if;
  return n::integer;
end;
$$;

-- A number from JSON between `lo` and `hi`, or null when missing or null.
create function private.json_num(raw jsonb, lo numeric, hi numeric, what text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then
    return null;
  end if;
  if jsonb_typeof(raw) <> 'number' then
    raise exception '% must be a number', what using errcode = '22023';
  end if;
  n := (raw #>> '{}'::text[])::numeric;
  if n < lo or n > hi then
    raise exception '% must be from % to %', what, lo, hi using errcode = '22023';
  end if;
  return n;
end;
$$;

-- true or false from JSON, or `fallback` when missing or null.
create function private.json_bool(raw jsonb, fallback boolean, what text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if raw is null or jsonb_typeof(raw) = 'null' then
    return fallback;
  end if;
  if jsonb_typeof(raw) <> 'boolean' then
    raise exception '% must be true or false', what using errcode = '22023';
  end if;
  return (raw #>> '{}'::text[])::boolean;
end;
$$;

-- An id from JSON, or null when missing or null.
create function private.json_uuid(raw jsonb, what text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  given_id text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then
    return null;
  end if;
  given_id := raw #>> '{}'::text[];
  if jsonb_typeof(raw) <> 'string'
    or given_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception '% must be an id', what using errcode = '22023';
  end if;
  return given_id::uuid;
end;
$$;

-- A moment from JSON, with its offset ("2026-11-10T08:30:00.000Z"), or null
-- when missing or null.
create function private.json_instant(raw jsonb, what text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  stamp text;
  moment timestamptz;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then
    return null;
  end if;
  stamp := raw #>> '{}'::text[];
  if jsonb_typeof(raw) <> 'string'
    or stamp !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
    raise exception '% must be a time with its offset', what using errcode = '22023';
  end if;
  begin
    moment := stamp::timestamptz;
  exception when others then
    raise exception '% must be a time', what using errcode = '22023';
  end;
  return moment;
end;
$$;

-- An item of a template or of a typed list, from JSON: {kind, label, hint?,
-- required?, unit?, min?, max?, defaultQuantity?}, and `id` where `with_id`.
-- Photos are refused until L6 brings them.
create function private.list_item_fields(
  raw jsonb,
  with_id boolean,
  out item_kind text,
  out item_label text,
  out item_hint text,
  out item_required boolean,
  out item_unit text,
  out item_min numeric,
  out item_max numeric,
  out item_quantity integer
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(raw) is distinct from 'object' then
    raise exception 'An item must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(raw) as k (field)
    where k.field not in (
        'kind', 'label', 'hint', 'required', 'unit', 'min', 'max', 'defaultQuantity'
      )
      and not (with_id and k.field = 'id')
  ) then
    raise exception 'An item has a kind, a label, a hint, required, a unit, a range and a usual quantity'
      using errcode = '22023';
  end if;

  item_kind := raw ->> 'kind';
  if item_kind = 'photo' then
    raise exception 'Photo items come later' using errcode = '22023';
  end if;
  if item_kind is null or item_kind not in ('check', 'number', 'note') then
    raise exception 'An item is a check, a number or a note' using errcode = '22023';
  end if;
  item_label := private.json_text(raw -> 'label', 120, 'An item''s label');
  if item_label is null then
    raise exception 'An item needs a label' using errcode = '22023';
  end if;
  item_hint := private.json_text(raw -> 'hint', 200, 'An item''s hint');
  item_required := private.json_bool(raw -> 'required', true, 'Required');
  item_unit := private.json_text(raw -> 'unit', 12, 'The unit');
  item_min := private.json_num(raw -> 'min', -100000, 100000, 'The lowest value');
  item_max := private.json_num(raw -> 'max', -100000, 100000, 'The highest value');
  item_quantity := private.json_int(raw -> 'defaultQuantity', 1, 9999, 'The usual quantity');

  if item_kind <> 'number'
    and (item_unit is not null or item_min is not null or item_max is not null) then
    raise exception 'Only numbers have a unit and a range' using errcode = '22023';
  end if;
  if item_min > item_max then
    raise exception 'The lowest value is above the highest' using errcode = '22023';
  end if;
  if item_kind <> 'check' and item_quantity is not null then
    raise exception 'Only checks have a usual quantity' using errcode = '22023';
  end if;
end;
$$;

-- Who a list goes to, from JSON: {kind, user | department | shift | role}, one
-- of `kinds`, checked against the business: a person is an active member, a
-- department one of its live ones, a shift a pattern key of its scheduling
-- settings (a template's or a schedule's; a sent list names a real shift,
-- which send_list reads itself).
create function private.list_recipient(
  business uuid,
  raw jsonb,
  kinds text[],
  out to_kind text,
  out to_user uuid,
  out to_department uuid,
  out to_shift text,
  out to_role public.member_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(raw) is distinct from 'object' then
    raise exception 'A recipient must be an object' using errcode = '22023';
  end if;
  to_kind := raw ->> 'kind';
  if to_kind is null or to_kind <> all (kinds) then
    raise exception 'Not a recipient here: %', coalesce(to_kind, 'none')
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(raw) as k (field)
    where k.field not in ('kind', 'user', 'department', 'shift', 'role')
  ) then
    raise exception 'A recipient has a kind and who' using errcode = '22023';
  end if;

  case to_kind
  when 'person' then
    to_user := private.json_uuid(raw -> 'user', 'The person');
    if to_user is null or not exists (
      select 1 from public.memberships m
      where m.business_id = business and m.user_id = to_user and m.active
    ) then
      raise exception 'Not an active member of this business' using errcode = '22023';
    end if;
  when 'department' then
    to_department := private.json_uuid(raw -> 'department', 'The department');
    if to_department is null or not exists (
      select 1 from public.departments d
      where d.id = to_department and d.business_id = business and d.archived_at is null
    ) then
      raise exception 'Not a department of this business' using errcode = '22023';
    end if;
  when 'shift' then
    to_shift := private.json_key(raw -> 'shift', 'The shift');
    if to_shift is null or not private.has_shift_pattern(business, to_shift) then
      raise exception 'Not a shift of this business' using errcode = '22023';
    end if;
  else
    if (raw ->> 'role') is null or (raw ->> 'role') not in ('owner', 'manager', 'worker') then
      raise exception 'Not a role' using errcode = '22023';
    end if;
    to_role := (raw ->> 'role')::public.member_role;
  end case;
end;
$$;

-- A template's schedule, from JSON: {id?, days, anchor?, shift?, opensOffset,
-- dueOffset, recipient, active?}. Offsets are minutes: from local midnight for
-- `day`, from the shift's start or end otherwise.
create function private.list_schedule_fields(
  business uuid,
  raw jsonb,
  out at_days smallint[],
  out at_anchor text,
  out at_shift text,
  out at_opens integer,
  out at_due integer,
  out for_kind text,
  out for_user uuid,
  out for_department uuid,
  out for_shift text,
  out for_role public.member_role,
  out is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(raw) is distinct from 'object' then
    raise exception 'A schedule must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(raw) as k (field)
    where k.field not in (
      'id', 'days', 'anchor', 'shift', 'opensOffset', 'dueOffset', 'recipient', 'active'
    )
  ) then
    raise exception 'A schedule has days, an anchor, a shift, times, a recipient and active'
      using errcode = '22023';
  end if;

  if jsonb_typeof(raw -> 'days') is distinct from 'array' then
    raise exception 'A schedule runs on from 1 to 7 days' using errcode = '22023';
  end if;
  if jsonb_array_length(raw -> 'days') not between 1 and 7 or exists (
    select 1 from jsonb_array_elements(raw -> 'days') as d (value)
    where jsonb_typeof(d.value) <> 'number'
      or (d.value #>> '{}'::text[]) not in ('0', '1', '2', '3', '4', '5', '6')
  ) then
    raise exception 'A schedule runs on from 1 to 7 days, 0 to 6' using errcode = '22023';
  end if;
  at_days := array(
    select (d.value #>> '{}'::text[])::smallint
    from jsonb_array_elements(raw -> 'days') with ordinality as d (value, ordinality)
    order by d.ordinality
  );
  if (select count(distinct u.weekday) from unnest(at_days) as u (weekday))
    <> cardinality(at_days) then
    raise exception 'Each day once' using errcode = '22023';
  end if;

  at_anchor := coalesce(private.json_text(raw -> 'anchor', 20, 'The anchor'), 'day');
  if at_anchor not in ('day', 'shift_start', 'shift_end') then
    raise exception 'A schedule follows the day or a shift' using errcode = '22023';
  end if;
  at_shift := private.json_key(raw -> 'shift', 'The shift');
  if (at_anchor = 'day') <> (at_shift is null) then
    raise exception 'A schedule that follows a shift names it, and only then'
      using errcode = '22023';
  end if;
  if at_shift is not null and not private.has_shift_pattern(business, at_shift) then
    raise exception 'Not a shift of this business' using errcode = '22023';
  end if;

  at_opens := private.json_int(raw -> 'opensOffset', -720, 1439, 'When it opens');
  at_due := private.json_int(raw -> 'dueOffset', -719, 2879, 'When it is due');
  if at_opens is null or at_due is null then
    raise exception 'A schedule has times' using errcode = '22023';
  end if;
  if (at_anchor = 'day' and at_opens < 0) or (at_anchor <> 'day' and at_opens > 720) then
    raise exception 'A time of day, or up to 12 hours around the shift'
      using errcode = '22023';
  end if;
  if at_due <= at_opens or at_due > at_opens + 1440 then
    raise exception 'Due after it opens, within a day' using errcode = '22023';
  end if;

  select r.to_kind, r.to_user, r.to_department, r.to_shift, r.to_role
  into for_kind, for_user, for_department, for_shift, for_role
  from private.list_recipient(
    business, raw -> 'recipient', array['person', 'department', 'shift', 'role']
  ) as r;

  is_active := private.json_bool(raw -> 'active', true, 'Active');
end;
$$;

------------------------------------------------------------------------------
-- Departments: who sets them up

-- Saves the business's departments, in order, as [{key, name}]: at most 30,
-- each key and each name once. Keys missing from it are archived, archived
-- keys that come back are restored (the undo), new keys are added. Owners,
-- managers and the team, who edit positions too.
create function public.set_departments(
  actor uuid,
  business uuid,
  departments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  before_list jsonb;
  after_list jsonb;
begin
  if not private.can_edit_settings(business, actor) then
    raise exception 'Managers, owners and the team only' using errcode = '42501';
  end if;
  perform 1 from public.businesses b where b.id = business for no key update;
  if not found then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;

  if jsonb_typeof(departments) is distinct from 'array' then
    raise exception 'Departments must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(departments) > 30 then
    raise exception 'A business has at most 30 departments' using errcode = '22023';
  end if;
  for entry in select e.value from jsonb_array_elements(departments) as e (value)
  loop
    if jsonb_typeof(entry) <> 'object' then
      raise exception 'A department must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(entry) as k (field)
      where k.field not in ('key', 'name')
    ) then
      raise exception 'A department has a key and a name' using errcode = '22023';
    end if;
    if private.json_key(entry -> 'key', 'A department''s key') is null
      or private.json_text(entry -> 'name', 40, 'A department''s name') is null then
      raise exception 'A department needs a key and a name' using errcode = '22023';
    end if;
  end loop;
  if (
    select count(distinct e.value ->> 'key') from jsonb_array_elements(departments) as e (value)
  ) <> jsonb_array_length(departments) then
    raise exception 'Each department''s key once' using errcode = '22023';
  end if;
  if (
    select count(distinct lower(btrim(e.value ->> 'name')))
    from jsonb_array_elements(departments) as e (value)
  ) <> jsonb_array_length(departments) then
    raise exception 'Each department''s name once' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('key', d.key, 'name', d.name) order by d.position, d.key),
    '[]'::jsonb
  )
  into before_list
  from public.departments d
  where d.business_id = business and d.archived_at is null;

  -- Everything live is archived first, so names can move between departments
  -- in one save; what stays is restored with its new name and place.
  update public.departments d
  set archived_at = now()
  where d.business_id = business and d.archived_at is null;

  insert into public.departments as d (business_id, key, name, position, archived_at)
  select business, e.value ->> 'key', btrim(e.value ->> 'name'),
    (e.ordinality - 1)::smallint, null::timestamptz
  from jsonb_array_elements(departments) with ordinality as e (value, ordinality)
  on conflict (business_id, key) do update
  set name = excluded.name, position = excluded.position, archived_at = null;

  select coalesce(
    jsonb_agg(jsonb_build_object('key', d.key, 'name', d.name) order by d.position, d.key),
    '[]'::jsonb
  )
  into after_list
  from public.departments d
  where d.business_id = business and d.archived_at is null;

  if before_list is distinct from after_list then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, actor, 'departments.change',
      jsonb_build_object('from', before_list, 'to', after_list)
    );
  end if;
end;
$$;

-- Replaces a live department's people: each an active member of the business.
-- The same people may do it as set_departments.
create function public.set_department_members(
  actor uuid,
  business uuid,
  department uuid,
  members uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted uuid[];
  before_people uuid[];
  added uuid[];
  removed uuid[];
begin
  if not private.can_edit_settings(business, actor) then
    raise exception 'Managers, owners and the team only' using errcode = '42501';
  end if;
  perform 1 from public.departments d
  where d.id = department and d.business_id = business and d.archived_at is null
  for update;
  if not found then
    raise exception 'Unknown department' using errcode = 'P0002';
  end if;

  wanted := array(
    select distinct p.person
    from unnest(coalesce(members, '{}'::uuid[])) as p (person)
    where p.person is not null
    order by p.person
  );
  if exists (
    select 1 from unnest(wanted) as p (person)
    where not exists (
      select 1 from public.memberships m
      where m.business_id = business and m.user_id = p.person and m.active
    )
  ) then
    raise exception 'Everyone in a department is an active member of the business'
      using errcode = '22023';
  end if;

  before_people := array(
    select dm.user_id from public.department_members dm
    where dm.department_id = department
    order by dm.user_id
  );

  delete from public.department_members dm
  where dm.department_id = department and dm.user_id <> all (wanted);
  insert into public.department_members (department_id, business_id, user_id)
  select department, business, p.person from unnest(wanted) as p (person)
  on conflict (department_id, user_id) do nothing;

  added := array(
    select p.person from unnest(wanted) as p (person)
    where p.person <> all (before_people)
    order by p.person
  );
  removed := array(
    select p.person from unnest(before_people) as p (person)
    where p.person <> all (wanted)
    order by p.person
  );
  if cardinality(added) + cardinality(removed) > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, actor, 'departments.members',
      jsonb_build_object(
        'department', department, 'added', to_jsonb(added), 'removed', to_jsonb(removed)
      )
    );
  end if;
end;
$$;

------------------------------------------------------------------------------
-- List templates: who sets them up

-- Creates a template (no `id`) or updates one, with its items and its
-- schedules, all matched by id: an item or schedule missing from the save is
-- deleted (old lists keep their own copy of an item), a new one is added, and
-- a new schedule starts on the business's local today. `seen_version` is the
-- version the editor read: a save behind it is refused (40001). List managers,
-- owners, managers and the team. Returns {id, version}.
--
-- template = {id?, name, note?, recipient?: {kind: department|shift|role, ...},
--   fromDepartment?, asksQuantities?, items: [{id?, kind, label, ...}],
--   schedules?: [{id?, days, anchor?, shift?, opensOffset, dueOffset,
--   recipient: {kind: person|department|shift|role, ...}, active?}]}
create function public.save_list_template(
  actor uuid,
  business uuid,
  template jsonb,
  seen_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  existing public.list_templates%rowtype;
  tid uuid;
  new_version integer;
  is_new boolean;
  new_name text;
  new_note text;
  rk text;
  rd uuid;
  rs text;
  rr public.member_role;
  asking uuid;
  asks boolean;
  wanted_items jsonb;
  wanted_schedules jsonb;
  entry jsonb;
  place integer;
  entry_id uuid;
  f record;
  s record;
  kept uuid[] := '{}'::uuid[];
  item_count integer;
  schedule_count integer;
begin
  if not (
    private.can_manage_lists(business, actor) or private.can_edit_settings(business, actor)
  ) then
    raise exception 'List managers and the team only' using errcode = '42501';
  end if;
  select b.timezone into tz from public.businesses b where b.id = business;
  if not found then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;
  perform private.lists_on(business);

  if jsonb_typeof(template) is distinct from 'object' then
    raise exception 'A template must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(template) as k (field)
    where k.field not in (
      'id', 'name', 'note', 'recipient', 'fromDepartment', 'asksQuantities', 'items', 'schedules'
    )
  ) then
    raise exception 'A template has a name, a note, a recipient, an asking department, items and schedules'
      using errcode = '22023';
  end if;

  new_name := private.json_text(template -> 'name', 60, 'The name');
  if new_name is null then
    raise exception 'A template needs a name' using errcode = '22023';
  end if;
  new_note := private.json_text(template -> 'note', 300, 'The note');

  if coalesce(jsonb_typeof(template -> 'recipient'), 'null') <> 'null' then
    select r.to_kind, r.to_department, r.to_shift, r.to_role
    into rk, rd, rs, rr
    from private.list_recipient(
      business, template -> 'recipient', array['department', 'shift', 'role']
    ) as r;
  end if;

  asking := private.json_uuid(template -> 'fromDepartment', 'The department that asks');
  if asking is not null then
    if not exists (
      select 1 from public.departments d
      where d.id = asking and d.business_id = business and d.archived_at is null
    ) then
      raise exception 'Not a department of this business' using errcode = '22023';
    end if;
    if rk is distinct from 'department' or rd = asking then
      raise exception 'An order goes from its department to another one'
        using errcode = '22023';
    end if;
  end if;
  asks := private.json_bool(template -> 'asksQuantities', false, 'Asks for quantities');

  wanted_items := template -> 'items';
  if jsonb_typeof(wanted_items) is distinct from 'array' then
    raise exception 'A template has from 1 to 60 items' using errcode = '22023';
  end if;
  if jsonb_array_length(wanted_items) not between 1 and 60 then
    raise exception 'A template has from 1 to 60 items' using errcode = '22023';
  end if;
  wanted_schedules := coalesce(template -> 'schedules', '[]'::jsonb);
  if jsonb_typeof(wanted_schedules) = 'null' then
    wanted_schedules := '[]'::jsonb;
  end if;
  if jsonb_typeof(wanted_schedules) <> 'array' then
    raise exception 'A template has at most 7 schedules' using errcode = '22023';
  end if;
  if jsonb_array_length(wanted_schedules) > 7 then
    raise exception 'A template has at most 7 schedules' using errcode = '22023';
  end if;

  tid := private.json_uuid(template -> 'id', 'The template''s id');
  if tid is null then
    -- Under the business's lock, so two saves at once can't pass the cap.
    perform 1 from public.businesses b where b.id = business for no key update;
    if (
      select count(*) from public.list_templates t
      where t.business_id = business and t.archived_at is null
    ) >= 100 then
      raise exception 'A business keeps at most 100 lists' using errcode = '22023';
    end if;
    insert into public.list_templates (
      business_id, name, note, recipient_kind, recipient_department, recipient_shift,
      recipient_role, from_department, asks_quantities, position, created_by, updated_by
    )
    values (
      business, new_name, new_note, rk, rd, rs, rr, asking, asks,
      (
        select coalesce(max(t.position) + 1, 0)
        from public.list_templates t
        where t.business_id = business
      )::smallint,
      actor, actor
    )
    returning id, version into tid, new_version;
    is_new := true;
  else
    select t.* into existing
    from public.list_templates t
    where t.id = tid and t.business_id = business
    for update;
    if not found then
      raise exception 'Unknown template' using errcode = 'P0002';
    end if;
    if existing.archived_at is not null then
      raise exception 'The template was removed' using errcode = '55000';
    end if;
    if seen_version is not null and seen_version <> existing.version then
      raise exception 'The template changed since it was read' using errcode = '40001';
    end if;
    new_version := existing.version + 1;
    update public.list_templates t
    set name = new_name,
      note = new_note,
      recipient_kind = rk,
      recipient_department = rd,
      recipient_shift = rs,
      recipient_role = rr,
      from_department = asking,
      asks_quantities = asks,
      version = new_version,
      updated_by = actor
    where t.id = tid;
    is_new := false;
  end if;

  for entry, place in
    select e.value, e.ordinality::integer
    from jsonb_array_elements(wanted_items) with ordinality as e (value, ordinality)
  loop
    select * into f from private.list_item_fields(entry, true);
    entry_id := private.json_uuid(entry -> 'id', 'An item''s id');
    if entry_id = any (kept) then
      raise exception 'An item is there twice' using errcode = '22023';
    end if;
    if entry_id is null then
      insert into public.list_template_items (
        template_id, business_id, position, kind, label, hint, required, unit,
        min_value, max_value, default_quantity
      )
      values (
        tid, business, (place - 1)::smallint, f.item_kind, f.item_label, f.item_hint,
        f.item_required, f.item_unit, f.item_min, f.item_max, f.item_quantity
      )
      returning id into entry_id;
    else
      update public.list_template_items i
      set position = (place - 1)::smallint,
        kind = f.item_kind,
        label = f.item_label,
        hint = f.item_hint,
        required = f.item_required,
        unit = f.item_unit,
        min_value = f.item_min,
        max_value = f.item_max,
        default_quantity = f.item_quantity
      where i.id = entry_id and i.template_id = tid;
      if not found then
        raise exception 'Not an item of this template' using errcode = '22023';
      end if;
    end if;
    kept := kept || entry_id;
  end loop;
  delete from public.list_template_items i
  where i.template_id = tid and i.id <> all (kept);
  item_count := cardinality(kept);

  kept := '{}'::uuid[];
  for entry, place in
    select e.value, e.ordinality::integer
    from jsonb_array_elements(wanted_schedules) with ordinality as e (value, ordinality)
  loop
    select * into s from private.list_schedule_fields(business, entry);
    entry_id := private.json_uuid(entry -> 'id', 'A schedule''s id');
    if entry_id = any (kept) then
      raise exception 'A schedule is there twice' using errcode = '22023';
    end if;
    if entry_id is null then
      insert into public.list_schedules (
        template_id, business_id, position, days, anchor, shift_key, opens_offset,
        due_offset, recipient_kind, recipient_user, recipient_department,
        recipient_shift, recipient_role, active, starts_on
      )
      values (
        tid, business, (place - 1)::smallint, s.at_days, s.at_anchor, s.at_shift,
        s.at_opens, s.at_due, s.for_kind, s.for_user, s.for_department, s.for_shift,
        s.for_role, s.is_active, (now() at time zone tz)::date
      )
      returning id into entry_id;
    else
      -- Edited in place, keeping its id, so the day's list never opens twice.
      update public.list_schedules ls
      set position = (place - 1)::smallint,
        days = s.at_days,
        anchor = s.at_anchor,
        shift_key = s.at_shift,
        opens_offset = s.at_opens,
        due_offset = s.at_due,
        recipient_kind = s.for_kind,
        recipient_user = s.for_user,
        recipient_department = s.for_department,
        recipient_shift = s.for_shift,
        recipient_role = s.for_role,
        active = s.is_active
      where ls.id = entry_id and ls.template_id = tid;
      if not found then
        raise exception 'Not a schedule of this template' using errcode = '22023';
      end if;
    end if;
    kept := kept || entry_id;
  end loop;
  delete from public.list_schedules ls
  where ls.template_id = tid and ls.id <> all (kept);
  schedule_count := cardinality(kept);

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'lists.template.save',
    jsonb_build_object(
      'template', tid,
      'name', new_name,
      'created', is_new,
      'items', item_count,
      'schedules', schedule_count
    )
  );

  return jsonb_build_object('id', tid, 'version', new_version);
end;
$$;

-- Removes a template from the screens, with its schedules paused by that
-- (nothing opens from an archived template); restore_list_template is the undo.
create function public.archive_list_template(actor uuid, template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.list_templates%rowtype;
begin
  select x.* into t from public.list_templates x where x.id = template for update;
  if not found or not (
    exists (
      select 1 from public.memberships m
      where m.business_id = t.business_id and m.user_id = actor and m.active
    )
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'Unknown template' using errcode = 'P0002';
  end if;
  if not (
    private.can_manage_lists(t.business_id, actor)
    or private.can_edit_settings(t.business_id, actor)
  ) then
    raise exception 'List managers and the team only' using errcode = '42501';
  end if;
  perform private.lists_on(t.business_id);
  if t.archived_at is not null then
    return;
  end if;

  update public.list_templates x
  set archived_at = now(), version = t.version + 1, updated_by = actor
  where x.id = t.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    t.business_id, actor, 'lists.template.archive',
    jsonb_build_object('template', t.id, 'name', t.name)
  );
end;
$$;

create function public.restore_list_template(actor uuid, template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.list_templates%rowtype;
begin
  select x.* into t from public.list_templates x where x.id = template for update;
  if not found or not (
    exists (
      select 1 from public.memberships m
      where m.business_id = t.business_id and m.user_id = actor and m.active
    )
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
  ) then
    raise exception 'Unknown template' using errcode = 'P0002';
  end if;
  if not (
    private.can_manage_lists(t.business_id, actor)
    or private.can_edit_settings(t.business_id, actor)
  ) then
    raise exception 'List managers and the team only' using errcode = '42501';
  end if;
  perform private.lists_on(t.business_id);
  if t.archived_at is null then
    return;
  end if;
  -- Under the business's lock, as in save_list_template.
  perform 1 from public.businesses b where b.id = t.business_id for no key update;
  if (
    select count(*) from public.list_templates x
    where x.business_id = t.business_id and x.archived_at is null
  ) >= 100 then
    raise exception 'A business keeps at most 100 lists' using errcode = '22023';
  end if;

  update public.list_templates x
  set archived_at = null, version = t.version + 1, updated_by = actor
  where x.id = t.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    t.business_id, actor, 'lists.template.restore',
    jsonb_build_object('template', t.id, 'name', t.name)
  );
end;
$$;

------------------------------------------------------------------------------
-- Sending and filling

-- Sends a list now, from a template or typed when sending, to a person, a
-- department, a role, or the people of a published shift from today to a week
-- ahead. Members who may send lists send anything; a department's members send
-- its own orders (the template's `from_department`) to the template's own
-- recipient. Returns the list's id.
--
-- list = {template?, name?, items?, recipient: {kind, user | department |
--   shift (a shift's id) | role}, dueAt?, note?, quantities?: {item id: count}}
create function public.send_list(
  actor uuid,
  business uuid,
  list jsonb,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.list_templates%rowtype;
  tid uuid;
  typed jsonb;
  list_name text;
  sender_note text;
  rk text;
  ru uuid;
  rd uuid;
  rr public.member_role;
  sid uuid;
  shift_row public.schedule_shifts%rowtype;
  tz text;
  people uuid[] := '{}'::uuid[];
  due timestamptz;
  quantities jsonb;
  item_key text;
  amount jsonb;
  lid uuid;
  entry jsonb;
  place integer;
  f record;
begin
  if not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = actor and m.active
  ) then
    raise exception 'Members only' using errcode = '42501';
  end if;
  perform private.lists_on(business);

  if jsonb_typeof(list) is distinct from 'object' then
    raise exception 'A list must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(list) as k (field)
    where k.field not in ('template', 'name', 'items', 'recipient', 'dueAt', 'note', 'quantities')
  ) then
    raise exception 'A list has a template or a name and items, a recipient, a due time, a note and quantities'
      using errcode = '22023';
  end if;

  tid := private.json_uuid(list -> 'template', 'The template');
  typed := list -> 'items';
  if tid is not null then
    if typed is not null or list ? 'name' then
      raise exception 'A list from a template has the template''s name and items'
        using errcode = '22023';
    end if;
    select x.* into t
    from public.list_templates x
    where x.id = tid and x.business_id = business;
    if not found then
      raise exception 'Unknown template' using errcode = 'P0002';
    end if;
    if t.archived_at is not null then
      raise exception 'The template was removed' using errcode = '55000';
    end if;
    list_name := t.name;
  else
    list_name := private.json_text(list -> 'name', 60, 'The name');
    if list_name is null then
      raise exception 'A list needs a name' using errcode = '22023';
    end if;
    if jsonb_typeof(typed) is distinct from 'array' then
      raise exception 'A list has from 1 to 60 items' using errcode = '22023';
    end if;
    if jsonb_array_length(typed) not between 1 and 60 then
      raise exception 'A list has from 1 to 60 items' using errcode = '22023';
    end if;
  end if;
  sender_note := private.json_text(list -> 'note', 300, 'The note');

  if (list -> 'recipient' ->> 'kind') = 'shift' then
    if exists (
      select 1 from jsonb_object_keys(list -> 'recipient') as k (field)
      where k.field not in ('kind', 'shift')
    ) then
      raise exception 'A shift recipient names the shift' using errcode = '22023';
    end if;
    rk := 'shift';
    sid := private.json_uuid(list -> 'recipient' -> 'shift', 'The shift');
    select x.* into shift_row
    from public.schedule_shifts x
    where x.id = sid and x.business_id = business;
    if not found or not private.shift_published(sid) then
      raise exception 'Not a published shift of this business' using errcode = '22023';
    end if;
    select b.timezone into tz from public.businesses b where b.id = business;
    if shift_row.day < (at_time at time zone tz)::date
      or shift_row.day > (at_time at time zone tz)::date + 7 then
      raise exception 'A shift from today to a week ahead' using errcode = '22023';
    end if;
    people := array(
      select a.user_id
      from public.shift_assignments a
      join public.memberships m
        on m.business_id = business and m.user_id = a.user_id and m.active
      where a.shift_id = sid
      order by a.user_id
    );
    if cardinality(people) = 0 then
      raise exception 'Nobody is on this shift' using errcode = '22023';
    end if;
  else
    select r.to_kind, r.to_user, r.to_department, r.to_role
    into rk, ru, rd, rr
    from private.list_recipient(
      business, list -> 'recipient', array['person', 'department', 'role']
    ) as r;
    if rk = 'person' then
      people := array[ru];
    end if;
  end if;

  if not (
    private.can_send_lists(business, actor)
    or (
      tid is not null
      and t.from_department is not null
      and private.in_department(t.from_department, actor)
      and rk = 'department'
      and rd = t.recipient_department
    )
  ) then
    raise exception 'Sending lists is for list senders and the department that asks'
      using errcode = '42501';
  end if;

  due := private.json_instant(list -> 'dueAt', 'The due time');
  if due is not null and (due <= at_time or due > at_time + interval '14 days') then
    raise exception 'A due time within the next 14 days' using errcode = '22023';
  end if;

  quantities := list -> 'quantities';
  if quantities is not null and jsonb_typeof(quantities) <> 'null' then
    if tid is null or not t.asks_quantities or jsonb_typeof(quantities) <> 'object' then
      raise exception 'Quantities are for templates that ask for them' using errcode = '22023';
    end if;
    for item_key, amount in
      select q.key, q.value from jsonb_each(quantities) as q (key, value)
    loop
      if not exists (
        select 1 from public.list_template_items i
        where i.template_id = tid and i.kind = 'check' and i.id::text = item_key
      ) then
        raise exception 'Not an item of this template' using errcode = '22023';
      end if;
      perform private.json_int(amount, 0, 9999, 'A quantity');
    end loop;
  end if;

  -- Under the business's lock, so two sends at once can't pass the cap.
  perform 1 from public.businesses b where b.id = business for no key update;
  if (
    select count(*) from public.lists l
    where l.business_id = business and l.status = 'open'
  ) >= 500 then
    raise exception 'A business keeps at most 500 open lists' using errcode = '22023';
  end if;

  insert into public.lists (
    business_id, template_id, name, note, origin, recipient_kind, recipient_department,
    recipient_role, shift_id, shift, from_department, asks_quantities, sent_by,
    opens_at, due_at
  )
  values (
    business, tid, list_name,
    nullif(concat_ws(E'\n', t.note, sender_note), ''),
    'sent', rk, rd, rr, sid,
    case when sid is not null then private.shift_brief(sid) end,
    t.from_department, coalesce(t.asks_quantities, false), actor, at_time, due
  )
  returning id into lid;

  if tid is not null then
    insert into public.list_items (
      list_id, business_id, template_item_id, position, kind, label, hint, required,
      unit, min_value, max_value, requested
    )
    select lid, business, i.id, i.position, i.kind, i.label, i.hint, i.required,
      i.unit, i.min_value, i.max_value,
      case when t.asks_quantities and i.kind = 'check' then
        coalesce((quantities ->> i.id::text)::integer, i.default_quantity)
      end
    from public.list_template_items i
    where i.template_id = tid
    order by i.position;
  else
    for entry, place in
      select e.value, e.ordinality::integer
      from jsonb_array_elements(typed) with ordinality as e (value, ordinality)
    loop
      select * into f from private.list_item_fields(entry, false);
      insert into public.list_items (
        list_id, business_id, position, kind, label, hint, required, unit,
        min_value, max_value
      )
      values (
        lid, business, (place - 1)::smallint, f.item_kind, f.item_label, f.item_hint,
        f.item_required, f.item_unit, f.item_min, f.item_max
      );
    end loop;
  end if;

  insert into public.list_people (list_id, business_id, user_id)
  select lid, business, p.person from unnest(people) as p (person);

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'lists.send',
    jsonb_build_object(
      'list', lid,
      'template', tid,
      'name', list_name,
      'recipient', jsonb_strip_nulls(
        jsonb_build_object('kind', rk, 'id', coalesce(ru, rd, sid), 'role', rr)
      ),
      'from_department', t.from_department,
      'due_at', due
    )
  );

  return lid;
end;
$$;

-- An item's result, or null to clear it (the undo): {checked: true} for a
-- check ({given: n} on an order, where ticking gives what was asked for),
-- {reading: n} for a number, {answer: "..."} for a note, each with an
-- optional {comment}. Fields left out are cleared. The list must be open, and
-- the actor hold it or manage lists. Returns the list's progress, so the
-- screen needs no second read.
create function public.set_list_item(
  actor uuid,
  item uuid,
  result jsonb,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.list_items%rowtype;
  l public.lists%rowtype;
  new_checked boolean;
  new_reading numeric;
  new_answer text;
  new_given integer;
  new_comment text;
  is_done boolean;
  progress jsonb;
begin
  select i.* into it from public.list_items i where i.id = item;
  if not found then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  -- The list first, so a finish waits for this and this for a finish.
  select x.* into l from public.lists x where x.id = it.list_id for update;
  if not exists (
    select 1 from public.memberships m
    where m.business_id = l.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  perform private.lists_on(l.business_id);
  if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
    raise exception 'The list is not yours to fill' using errcode = '42501';
  end if;
  if l.status <> 'open' then
    raise exception 'The list is closed' using errcode = '55000';
  end if;
  select i.* into it from public.list_items i where i.id = item for update;

  if result is not null and jsonb_typeof(result) <> 'null' then
    if jsonb_typeof(result) <> 'object' then
      raise exception 'A result must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(result) as k (field)
      where k.field not in ('checked', 'reading', 'answer', 'given', 'comment')
        or (it.kind = 'check' and k.field in ('reading', 'answer'))
        or (it.kind = 'number' and k.field in ('checked', 'answer', 'given'))
        or (it.kind = 'note' and k.field in ('checked', 'reading', 'given'))
        or (it.kind = 'photo' and k.field <> 'comment')
    ) then
      raise exception 'Not a result for this item' using errcode = '22023';
    end if;
    new_comment := private.json_text(result -> 'comment', 200, 'The comment');
    case it.kind
    when 'check' then
      new_checked := private.json_bool(result -> 'checked', false, 'Checked');
      new_given := private.json_int(result -> 'given', 0, 9999, 'How many were given');
      if new_given is not null and not l.asks_quantities then
        raise exception 'Only orders say how many were given' using errcode = '22023';
      end if;
      if new_given is not null then
        new_checked := true;
      elsif new_checked and l.asks_quantities then
        new_given := it.requested;
      end if;
      if not new_checked then
        new_checked := null;
      end if;
    when 'number' then
      new_reading := private.json_num(result -> 'reading', -100000, 100000, 'The reading');
    when 'note' then
      new_answer := private.json_text(result -> 'answer', 500, 'The answer');
    else
      -- Photos are set by the server after an upload (L6); a comment only here.
      null;
    end case;
  end if;

  is_done := case it.kind
    when 'check' then coalesce(new_checked, false) or new_given is not null
    when 'number' then new_reading is not null
    when 'note' then new_answer is not null
    else it.photo_path is not null
  end;

  update public.list_items i
  set checked = new_checked,
    reading = new_reading,
    answer = new_answer,
    given = new_given,
    comment = new_comment,
    done = is_done,
    done_by = case
      when it.kind = 'photo' then it.done_by
      when is_done then actor
    end,
    done_at = case
      when it.kind = 'photo' then it.done_at
      when is_done then at_time
    end
  where i.id = item;

  select jsonb_build_object(
    'done', count(*) filter (where i.done),
    'total', count(*),
    'required', count(*) filter (where i.required),
    'requiredLeft', count(*) filter (where i.required and not i.done)
  )
  into progress
  from public.list_items i
  where i.list_id = l.id;
  return progress;
end;
$$;

-- Finishes an open list once every required item is done (23514 otherwise,
-- with how many are left). The same people as filling it.
create function public.finish_list(
  actor uuid,
  list uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lists%rowtype;
  left_required integer;
  left_optional integer;
  late_after integer;
begin
  select x.* into l from public.lists x where x.id = list for update;
  if not found or not exists (
    select 1 from public.memberships m
    where m.business_id = l.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown list' using errcode = 'P0002';
  end if;
  perform private.lists_on(l.business_id);
  if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
    raise exception 'The list is not yours to finish' using errcode = '42501';
  end if;
  if l.status <> 'open' then
    raise exception 'The list is closed' using errcode = '55000';
  end if;

  select (count(*) filter (where i.required and not i.done))::integer,
    (count(*) filter (where not i.required and not i.done))::integer
  into left_required, left_optional
  from public.list_items i
  where i.list_id = l.id;
  if left_required > 0 then
    raise exception '% required items are left', left_required using errcode = '23514';
  end if;

  late_after := coalesce(private.list_setting(l.business_id, 'lateAfterMinutes')::integer, 15);

  update public.lists x
  set status = 'finished', finished_at = at_time, finished_by = actor
  where x.id = l.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    l.business_id, actor, 'lists.finish',
    jsonb_build_object(
      'list', l.id,
      'name', l.name,
      'late', coalesce(at_time > l.due_at + make_interval(mins => late_after), false),
      'left_optional', left_optional,
      'from_department', l.from_department,
      'sent_by', l.sent_by
    )
  );
end;
$$;

-- Cancels an open list: whoever sent it, the department that asked for it, or
-- a list manager.
create function public.cancel_list(
  actor uuid,
  list uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lists%rowtype;
begin
  select x.* into l from public.lists x where x.id = list for update;
  if not found or not exists (
    select 1 from public.memberships m
    where m.business_id = l.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown list' using errcode = 'P0002';
  end if;
  perform private.lists_on(l.business_id);
  if not (
    l.sent_by is not distinct from actor
    or (l.from_department is not null and private.in_department(l.from_department, actor))
    or private.can_manage_lists(l.business_id, actor)
  ) then
    raise exception 'The list is not yours to cancel' using errcode = '42501';
  end if;
  if l.status <> 'open' then
    raise exception 'The list is closed' using errcode = '55000';
  end if;

  update public.lists x
  set status = 'cancelled', closed_at = at_time, closed_by = actor
  where x.id = l.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    l.business_id, actor, 'lists.cancel',
    jsonb_build_object('list', l.id, 'name', l.name)
  );
end;
$$;

-- Opens a finished or cancelled list again: whoever did it, within 5 minutes
-- (the undo), or a list manager at any time, to correct something. A missed
-- list stays missed.
create function public.reopen_list(
  actor uuid,
  list uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lists%rowtype;
begin
  select x.* into l from public.lists x where x.id = list for update;
  if not found or not exists (
    select 1 from public.memberships m
    where m.business_id = l.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown list' using errcode = 'P0002';
  end if;
  perform private.lists_on(l.business_id);
  if l.status not in ('finished', 'cancelled') then
    raise exception 'Only a finished or cancelled list opens again' using errcode = '55000';
  end if;
  if not (
    private.can_manage_lists(l.business_id, actor)
    or (
      l.status = 'finished'
      and l.finished_by = actor
      and at_time <= l.finished_at + interval '5 minutes'
    )
    or (
      l.status = 'cancelled'
      and l.closed_by = actor
      and at_time <= l.closed_at + interval '5 minutes'
    )
  ) then
    raise exception 'Only a list manager opens it again after 5 minutes'
      using errcode = '42501';
  end if;
  -- The open-lists cap holds here too, under the business's lock as in send_list.
  perform 1 from public.businesses b where b.id = l.business_id for no key update;
  if (
    select count(*) from public.lists x
    where x.business_id = l.business_id and x.status = 'open'
  ) >= 500 then
    raise exception 'A business keeps at most 500 open lists' using errcode = '22023';
  end if;

  update public.lists x
  set status = 'open',
    finished_at = null,
    finished_by = null,
    closed_at = null,
    closed_by = null
  where x.id = l.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    l.business_id, actor, 'lists.reopen',
    jsonb_build_object('list', l.id, 'name', l.name, 'was', l.status)
  );
end;
$$;

-- The Lists tab's count: open lists `actor` holds (their people, their
-- departments, their role). Not a count under RLS, which gives a list manager
-- every list in the business.
create function public.my_open_lists(actor uuid, business uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.lists l
  where l.business_id = business
    and l.status = 'open'
    and private.module_enabled(business, 'lists')
    and private.holds_list(l.id, actor)
$$;

------------------------------------------------------------------------------
-- What each log row tells

-- The lines a lists row writes, and the things it settles:
--
--   lists.send,       `lists.sent` to the people the list is for now, the
--   lists.open        actor left out (`list:<id>`). lists.open comes with L4.
--   lists.finish      settles the list's lines, and, while tellWhenFinished is
--                     on, `lists.finished` to whoever sent it and the
--                     department that asked, the finisher left out.
--   lists.cancel,     settle the list's lines.
--   lists.missed
--   lists.reopen      `lists.sent` again, unread, to the people it is for, and
--                     settles the finished line.
--
-- The facts are ids and the list's name, all of which the reader may see in
-- the app; never the note. `fromDepartment`, not `from`, which the inbox reads
-- as a person.
create function private.notify_for_lists(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b uuid := entry.business_id;
  l public.lists%rowtype;
  facts jsonb;
begin
  select x.* into l
  from public.lists x
  where x.id = (entry.details ->> 'list')::uuid and x.business_id = b;
  if not found then
    return;
  end if;
  facts := jsonb_build_object(
    'list', l.id,
    'name', l.name,
    'due', l.due_at,
    'department', l.recipient_department,
    'fromDepartment', l.from_department
  );

  case entry.action
  when 'lists.send', 'lists.open', 'lists.reopen' then
    perform private.notify(
      b, private.list_holders(l.id), 'lists.sent', facts,
      entry.actor_id, 'lists', 'worker', 'list:' || l.id
    );
    if entry.action = 'lists.reopen' then
      perform private.resolve_notifications(b, 'list.finished:' || l.id);
    end if;

  when 'lists.finish' then
    perform private.resolve_notifications(b, 'list:' || l.id);
    perform private.resolve_notifications(b, 'list.due:' || l.id);
    perform private.resolve_notifications(b, 'list.late:' || l.id);
    perform private.resolve_notifications(b, 'list.late_team:' || l.id);
    if coalesce(private.list_setting(b, 'tellWhenFinished')::boolean, true) then
      perform private.notify(
        b,
        array[l.sent_by] || array(
          select dm.user_id from public.department_members dm
          where dm.department_id = l.from_department
        ),
        'lists.finished', facts,
        entry.actor_id, 'lists', 'worker', 'list.finished:' || l.id
      );
    end if;

  when 'lists.cancel', 'lists.missed' then
    perform private.resolve_notifications(b, 'list:' || l.id);
    perform private.resolve_notifications(b, 'list.due:' || l.id);
    perform private.resolve_notifications(b, 'list.late:' || l.id);
    perform private.resolve_notifications(b, 'list.late_team:' || l.id);

  else
    null;
  end case;
end;
$$;

-- The trigger: what happened stands, whatever telling people about it does.
create function private.notify_lists_from_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.notify_for_lists(new);
  exception when others then
    raise warning 'list notifications for % (%) failed: %', new.action, new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger audit_log_notifies_lists
  after insert on public.audit_log
  for each row
  when (new.action like 'lists.%')
  execute function private.notify_lists_from_log();

------------------------------------------------------------------------------
-- Templates: departments and lists from the definition

-- A seed's recipient, {kind, department: key | shift: key | role}, resolved
-- for the business: departments by key, shifts against the template's own
-- shift pattern. All null for none. P0001 for a name the template doesn't have.
create function private.seed_recipient(
  business uuid,
  raw jsonb,
  shift_keys text[],
  out to_kind text,
  out to_department uuid,
  out to_shift text,
  out to_role public.member_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if raw is null or jsonb_typeof(raw) = 'null' then
    return;
  end if;
  to_kind := raw ->> 'kind';
  case to_kind
  when 'department' then
    select d.id into to_department
    from public.departments d
    where d.business_id = business and d.key = raw ->> 'department';
    if not found then
      raise exception 'The template names an unknown department: %', raw ->> 'department'
        using errcode = 'P0001';
    end if;
  when 'shift' then
    to_shift := raw ->> 'shift';
    if to_shift is null or to_shift <> all (shift_keys) then
      raise exception 'The template names an unknown shift: %', coalesce(to_shift, 'none')
        using errcode = 'P0001';
    end if;
  when 'role' then
    to_role := (raw ->> 'role')::public.member_role;
  else
    raise exception 'The template names an unknown recipient: %', coalesce(to_kind, 'none')
      using errcode = 'P0001';
  end case;
end;
$$;

-- Copies a definition's departments (in order), then each list template with
-- its items and schedules, into a business apply_template is setting up.
-- A schedule without its own recipient goes to its template's. Refuses (P0001)
-- a department or shift the definition doesn't have.
create function private.copy_template_lists(business uuid, def jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  shift_keys text[];
  lt jsonb;
  lt_place integer;
  sched jsonb;
  sched_place integer;
  tid uuid;
  asking uuid;
  sched_anchor text;
  sched_opens integer;
  t_kind text;
  t_department uuid;
  t_shift text;
  t_role public.member_role;
  s_kind text;
  s_department uuid;
  s_shift text;
  s_role public.member_role;
begin
  select b.timezone into tz from public.businesses b where b.id = business;
  shift_keys := array(
    select s.value ->> 'key'
    from jsonb_array_elements(
      case when jsonb_typeof(def #> '{modules,scheduling,settings,shifts}'::text[]) = 'array'
        then def #> '{modules,scheduling,settings,shifts}'::text[] else '[]'::jsonb end
    ) as s (value)
  );

  insert into public.departments (business_id, key, name, position)
  select business, e.value ->> 'key', e.value ->> 'name', (e.ordinality - 1)::smallint
  from jsonb_array_elements(
    case when jsonb_typeof(def -> 'departments') = 'array'
      then def -> 'departments' else '[]'::jsonb end
  ) with ordinality as e (value, ordinality);

  for lt, lt_place in
    select e.value, e.ordinality::integer
    from jsonb_array_elements(
      case when jsonb_typeof(def -> 'listTemplates') = 'array'
        then def -> 'listTemplates' else '[]'::jsonb end
    ) with ordinality as e (value, ordinality)
  loop
    select r.to_kind, r.to_department, r.to_shift, r.to_role
    into t_kind, t_department, t_shift, t_role
    from private.seed_recipient(business, lt -> 'recipient', shift_keys) as r;

    asking := null;
    if jsonb_typeof(lt -> 'fromDepartment') = 'string' then
      select d.id into asking
      from public.departments d
      where d.business_id = business and d.key = lt ->> 'fromDepartment';
      if not found then
        raise exception 'The template names an unknown department: %', lt ->> 'fromDepartment'
          using errcode = 'P0001';
      end if;
    end if;

    insert into public.list_templates (
      business_id, key, name, note, recipient_kind, recipient_department,
      recipient_shift, recipient_role, from_department, asks_quantities, position
    )
    values (
      business, lt ->> 'key', lt ->> 'name', lt ->> 'note', t_kind, t_department,
      t_shift, t_role, asking, coalesce((lt ->> 'asksQuantities')::boolean, false),
      (lt_place - 1)::smallint
    )
    returning id into tid;

    insert into public.list_template_items (
      template_id, business_id, position, kind, label, hint, required, unit,
      min_value, max_value, default_quantity
    )
    select tid, business, (e.ordinality - 1)::smallint, e.value ->> 'kind',
      e.value ->> 'label', e.value ->> 'hint',
      coalesce((e.value ->> 'required')::boolean, true), e.value ->> 'unit',
      (e.value ->> 'min')::numeric, (e.value ->> 'max')::numeric,
      (e.value ->> 'defaultQuantity')::integer
    from jsonb_array_elements(
      case when jsonb_typeof(lt -> 'items') = 'array' then lt -> 'items' else '[]'::jsonb end
    ) with ordinality as e (value, ordinality);

    for sched, sched_place in
      select e.value, e.ordinality::integer
      from jsonb_array_elements(
        case when jsonb_typeof(lt -> 'schedules') = 'array'
          then lt -> 'schedules' else '[]'::jsonb end
      ) with ordinality as e (value, ordinality)
    loop
      sched_anchor := coalesce(sched ->> 'anchor', 'day');
      if sched_anchor <> 'day'
        and (sched ->> 'shift' is null or (sched ->> 'shift') <> all (shift_keys)) then
        raise exception 'The template names an unknown shift: %', coalesce(sched ->> 'shift', 'none')
          using errcode = 'P0001';
      end if;
      -- "HH:MM" for the day, minutes around the shift for a shift.
      sched_opens := case
        when sched_anchor = 'day' then
          extract(hour from (sched ->> 'opens')::time)::integer * 60
            + extract(minute from (sched ->> 'opens')::time)::integer
        else (sched ->> 'opens')::integer
      end;
      if coalesce(jsonb_typeof(coalesce(sched -> 'recipient', lt -> 'recipient')), 'null') = 'null' then
        raise exception 'A schedule of % goes to nobody', lt ->> 'key' using errcode = 'P0001';
      end if;
      select r.to_kind, r.to_department, r.to_shift, r.to_role
      into s_kind, s_department, s_shift, s_role
      from private.seed_recipient(
        business, coalesce(sched -> 'recipient', lt -> 'recipient'), shift_keys
      ) as r;

      insert into public.list_schedules (
        template_id, business_id, position, days, anchor, shift_key, opens_offset,
        due_offset, recipient_kind, recipient_department, recipient_shift,
        recipient_role, starts_on
      )
      values (
        tid, business, (sched_place - 1)::smallint,
        array(
          select d.value::smallint
          from jsonb_array_elements_text(sched -> 'days') with ordinality as d (value, ordinality)
          order by d.ordinality
        ),
        sched_anchor,
        case when sched_anchor = 'day' then null else sched ->> 'shift' end,
        sched_opens,
        sched_opens + (sched ->> 'dueAfterMinutes')::integer,
        s_kind, s_department, s_shift, s_role,
        (now() at time zone tz)::date
      );
    end loop;
  end loop;
end;
$$;

-- As before (20261107000500_module_settings.sql), and then the definition's
-- departments and lists. Security definer now: the server role that runs it
-- has no use of the private schema, and only it may run this.
create or replace function public.apply_template(business uuid, template text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
  ver integer;
begin
  select t.definition, t.version into def, ver
  from public.templates t
  where t.key = template;
  if not found then
    raise exception 'Unknown template: %', template using errcode = 'P0002';
  end if;

  perform 1 from public.businesses b where b.id = business for update;
  if not found then
    raise exception 'Unknown business: %', business using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.businesses b
    where b.id = business and b.template_key is not null
  ) or exists (
    select 1 from public.business_modules bm where bm.business_id = business
  ) then
    raise exception 'Business % is already set up', business
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_object_keys(def -> 'modules') as named
    where named not in (
      select unnest(enum_range(null::public.module_key))::text
    )
  ) then
    raise exception 'Template % names an unknown module', template
      using errcode = 'P0001';
  end if;

  insert into public.business_modules (business_id, module_key, enabled, settings)
  select business, known.key,
    coalesce((def -> 'modules' -> known.key::text ->> 'enabled')::boolean, false),
    coalesce(def -> 'modules' -> known.key::text -> 'settings', '{}'::jsonb)
  from unnest(enum_range(null::public.module_key)) as known (key);

  perform private.copy_template_lists(business, def);

  update public.businesses b
  set template_key = template,
    template_version = ver,
    opening_hours = coalesce(def -> 'openingHours', '[]'::jsonb)
  where b.id = business;
end;
$$;

------------------------------------------------------------------------------
-- What each template brings (a version up each, the module off)

update public.templates t
set version = t.version + 1,
  definition = jsonb_set(
    t.definition, '{modules,lists}', '{"enabled": false, "settings": {}}'::jsonb
  ) || jsonb_build_object('departments', data.departments, 'listTemplates', data.list_templates)
from (
  values
  ('restaurant', $json$
  [
    { "key": "kitchen", "name": "מטבח" },
    { "key": "floor", "name": "אולם" },
    { "key": "bar", "name": "בר" },
    { "key": "storeroom", "name": "מחסן" }
  ]
  $json$::jsonb, $json$
  [
    {
      "key": "kitchen-opening", "name": "פתיחת מטבח",
      "recipient": { "kind": "department", "department": "kitchen" },
      "items": [
        { "kind": "number", "label": "מקרר ראשי", "unit": "°C", "min": 0, "max": 5 },
        { "kind": "number", "label": "מקפיא", "unit": "°C", "min": -25, "max": -18 },
        { "kind": "check", "label": "בדיקת תאריכים ותוויות" },
        { "kind": "check", "label": "הכנות לפי רשימת ההכנות" },
        { "kind": "check", "label": "ניקוי משטחי עבודה" },
        { "kind": "note", "label": "מה חסר במטבח", "required": false }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4, 5], "opens": "08:30", "dueAfterMinutes": 45 }
      ]
    },
    {
      "key": "floor-opening", "name": "פתיחת אולם",
      "recipient": { "kind": "department", "department": "floor" },
      "items": [
        { "kind": "check", "label": "סידור שולחנות וכיסאות" },
        { "kind": "check", "label": "ניקוי שירותים" },
        { "kind": "check", "label": "מילוי מפיות ותבלינים" },
        { "kind": "check", "label": "תפריטים נקיים" }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4], "opens": "10:30", "dueAfterMinutes": 45 }
      ]
    },
    {
      "key": "kitchen-closing", "name": "סגירת מטבח",
      "recipient": { "kind": "department", "department": "kitchen" },
      "items": [
        { "kind": "number", "label": "מקרר ראשי", "unit": "°C", "min": 0, "max": 5 },
        { "kind": "number", "label": "מקפיא", "unit": "°C", "min": -25, "max": -18 },
        { "kind": "check", "label": "כיסוי ואחסון מזון" },
        { "kind": "check", "label": "ניקוי כיריים וגריל" },
        { "kind": "check", "label": "פינוי פחים" },
        { "kind": "check", "label": "סגירת גז" }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4], "opens": "23:00", "dueAfterMinutes": 45 },
        { "days": [6], "opens": "23:30", "dueAfterMinutes": 45 }
      ]
    },
    {
      "key": "bar-closing", "name": "סגירת בר",
      "recipient": { "kind": "department", "department": "bar" },
      "items": [
        { "kind": "check", "label": "ניקוי ברזים ומקררים" },
        { "kind": "number", "label": "ספירת בקבוקים פתוחים", "unit": "יח׳" },
        { "kind": "check", "label": "סגירת קופה" }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4], "opens": "23:00", "dueAfterMinutes": 45 },
        { "days": [6], "opens": "23:30", "dueAfterMinutes": 45 }
      ]
    },
    {
      "key": "bar-order", "name": "הזמנה מהבר למחסן",
      "recipient": { "kind": "department", "department": "storeroom" },
      "fromDepartment": "bar", "asksQuantities": true,
      "items": [
        { "kind": "check", "label": "בירה מהחבית", "hint": "חביות", "defaultQuantity": 1 },
        { "kind": "check", "label": "יין לבן", "hint": "בקבוקים", "defaultQuantity": 6 },
        { "kind": "check", "label": "יין אדום", "hint": "בקבוקים", "defaultQuantity": 6 },
        { "kind": "check", "label": "קרח", "hint": "שקיות", "defaultQuantity": 2 },
        { "kind": "check", "label": "לימונים", "defaultQuantity": 20 },
        { "kind": "check", "label": "קשים", "hint": "חבילות", "defaultQuantity": 1 }
      ]
    },
    {
      "key": "weekly-cleaning", "name": "ניקיון שבועי",
      "recipient": { "kind": "department", "department": "kitchen" },
      "items": [
        { "kind": "check", "label": "ניקוי מקרר ראשי" },
        { "kind": "check", "label": "ניקוי מנדף" },
        { "kind": "check", "label": "סידור מחסן יבש" }
      ],
      "schedules": [
        { "days": [0], "opens": "15:00", "dueAfterMinutes": 120 }
      ]
    }
  ]
  $json$::jsonb),
  ('cafe-bar', $json$
  [
    { "key": "coffee", "name": "בר קפה" },
    { "key": "kitchen", "name": "מטבח" },
    { "key": "bar", "name": "בר" },
    { "key": "storeroom", "name": "מחסן" }
  ]
  $json$::jsonb, $json$
  [
    {
      "key": "coffee-opening", "name": "פתיחת בר הקפה",
      "recipient": { "kind": "department", "department": "coffee" },
      "items": [
        { "kind": "check", "label": "כיול המטחנה" },
        { "kind": "number", "label": "מקרר חלב", "unit": "°C", "min": 0, "max": 5 },
        { "kind": "check", "label": "סידור מאפים בוויטרינה" }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4, 5], "opens": "07:00", "dueAfterMinutes": 30 }
      ]
    },
    {
      "key": "coffee-closing", "name": "סגירת בר הקפה",
      "recipient": { "kind": "department", "department": "coffee" },
      "items": [
        { "kind": "check", "label": "ניקוי מכונת האספרסו" },
        { "kind": "check", "label": "ניקוי מקציף החלב" }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4], "opens": "23:00", "dueAfterMinutes": 30 },
        { "days": [5], "opens": "15:00", "dueAfterMinutes": 30 }
      ]
    },
    {
      "key": "bar-closing", "name": "סגירת בר",
      "recipient": { "kind": "department", "department": "bar" },
      "items": [
        { "kind": "check", "label": "מילוי מקרר הבר" },
        { "kind": "check", "label": "ניקוי ברזים" },
        { "kind": "check", "label": "סגירת קופה" }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4], "opens": "23:30", "dueAfterMinutes": 45 }
      ]
    },
    {
      "key": "bar-order", "name": "הזמנה מהבר למחסן",
      "recipient": { "kind": "department", "department": "storeroom" },
      "fromDepartment": "bar", "asksQuantities": true,
      "items": [
        { "kind": "check", "label": "בירה מהחבית", "hint": "חביות", "defaultQuantity": 1 },
        { "kind": "check", "label": "יין לבן", "hint": "בקבוקים", "defaultQuantity": 6 },
        { "kind": "check", "label": "יין אדום", "hint": "בקבוקים", "defaultQuantity": 6 },
        { "kind": "check", "label": "קרח", "hint": "שקיות", "defaultQuantity": 2 },
        { "kind": "check", "label": "לימונים", "defaultQuantity": 20 },
        { "kind": "check", "label": "קשים", "hint": "חבילות", "defaultQuantity": 1 }
      ]
    }
  ]
  $json$::jsonb),
  ('retail', $json$
  [
    { "key": "checkout", "name": "קופה" },
    { "key": "floor", "name": "רצפת מכירה" },
    { "key": "stock", "name": "מחסן" }
  ]
  $json$::jsonb, $json$
  [
    {
      "key": "store-opening", "name": "פתיחת החנות",
      "recipient": { "kind": "department", "department": "floor" },
      "items": [
        { "kind": "check", "label": "כיבוי אזעקה ופתיחה" },
        { "kind": "check", "label": "אורות ומוזיקה" },
        { "kind": "number", "label": "קופה בפתיחה", "unit": "₪" },
        { "kind": "check", "label": "חלון ראווה נקי" },
        { "kind": "check", "label": "תוויות מחיר במקום" }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4, 5], "opens": "08:30", "dueAfterMinutes": 30 }
      ]
    },
    {
      "key": "store-closing", "name": "סגירת החנות",
      "recipient": { "kind": "department", "department": "checkout" },
      "items": [
        { "kind": "number", "label": "קופה בסגירה", "unit": "₪" },
        { "kind": "check", "label": "הפקדת מזומן בכספת" },
        { "kind": "check", "label": "החזרת פריטים למדפים" },
        { "kind": "check", "label": "כיבוי אורות ומיזוג" },
        { "kind": "check", "label": "נעילה ואזעקה" }
      ],
      "schedules": [
        { "days": [0, 1, 2, 3, 4], "opens": "20:45", "dueAfterMinutes": 30 },
        { "days": [5], "opens": "13:45", "dueAfterMinutes": 30 }
      ]
    },
    {
      "key": "floor-order", "name": "הזמנה מהמחסן",
      "recipient": { "kind": "department", "department": "stock" },
      "fromDepartment": "floor", "asksQuantities": true,
      "items": [
        { "kind": "check", "label": "שקיות", "hint": "חבילות", "defaultQuantity": 2 },
        { "kind": "check", "label": "גלילי קופה", "defaultQuantity": 5 },
        { "kind": "check", "label": "תוויות מחיר", "hint": "חבילות", "defaultQuantity": 1 },
        { "kind": "check", "label": "חומרי ניקוי", "defaultQuantity": 1 }
      ]
    },
    {
      "key": "stock-count", "name": "ספירת מלאי",
      "recipient": { "kind": "department", "department": "stock" },
      "items": [
        { "kind": "check", "label": "ספירת המחסן לפי הרשימה" },
        { "kind": "check", "label": "סימון פריטים שחסרים" },
        { "kind": "note", "label": "מה צריך להזמין", "required": false }
      ],
      "schedules": [
        { "days": [0], "opens": "08:00", "dueAfterMinutes": 120 }
      ]
    }
  ]
  $json$::jsonb),
  ('general', '[]'::jsonb, $json$
  [
    {
      "key": "opening", "name": "פתיחה",
      "recipient": { "kind": "role", "role": "worker" },
      "items": [
        { "kind": "check", "label": "פתיחת המקום" },
        { "kind": "check", "label": "אורות ומיזוג" },
        { "kind": "check", "label": "המקום נקי ומוכן" },
        { "kind": "note", "label": "מה נשאר מהמשמרת הקודמת", "required": false },
        { "kind": "note", "label": "משהו שהמנהל צריך לדעת", "required": false }
      ]
    },
    {
      "key": "closing", "name": "סגירה",
      "recipient": { "kind": "role", "role": "worker" },
      "items": [
        { "kind": "check", "label": "כיבוי מכשירים ואורות" },
        { "kind": "check", "label": "פינוי פחים" },
        { "kind": "check", "label": "נעילה" },
        { "kind": "note", "label": "משהו שהמנהל צריך לדעת", "required": false }
      ]
    }
  ]
  $json$::jsonb)
) as data (key, departments, list_templates)
where t.key = data.key;

-- Every business has a row for the module, off, like a module added after it
-- was set up. Their template's departments and lists come with L2.
insert into public.business_modules (business_id, module_key, enabled)
select b.id, 'lists', false from public.businesses b
on conflict (business_id, module_key) do nothing;

------------------------------------------------------------------------------
-- Demo businesses

-- The demo's example lists. Nothing yet: the next parts (L2, L4, L5) replace
-- this function, never public.reset_demo_business, which other work replaces.
create function private.seed_demo_lists(business uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select business where false
$$;

-- The reset (20261109000400_profile_about.sql), and the demo people's
-- departments: each person may name department keys
-- ({"departments": ["kitchen"]}). A person without an account is left out, as
-- before, and a key the template has no department for is skipped, so a stale
-- definition never breaks the door. Ends with the demo's example lists.
create or replace function public.reset_demo_business(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
begin
  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business
  for update;
  if not found then
    raise exception 'Not a demo business: %', business using errcode = 'P0002';
  end if;

  delete from public.businesses b where b.id = business;

  insert into public.businesses (id, slug, name, accent, address, shabbat_city)
  values (
    business, def ->> 'slug', def ->> 'name', def ->> 'accent',
    def ->> 'address', def ->> 'shabbat_city'
  );
  perform public.apply_template(business, def ->> 'template');

  insert into public.memberships (business_id, user_id, role)
  select business, person.user_id, person.role
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  join public.profiles p on p.id = person.user_id;

  insert into public.department_members (department_id, business_id, user_id)
  select distinct dep.id, business, person.user_id
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text, departments text[])
  join public.memberships m on m.business_id = business and m.user_id = person.user_id
  cross join lateral unnest(coalesce(person.departments, '{}'::text[])) as wanted (key)
  join public.departments dep
    on dep.business_id = business and dep.key = wanted.key and dep.archived_at is null;

  update public.profiles p
  set full_name = person.name, locale = 'he', avatar_path = null,
    bio = null, cover = null, address_form = null
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  where p.id = person.user_id;

  update private.demo_businesses d
  set reset_at = now()
  where d.business_id = business;

  if coalesce((def ->> 'renews')::boolean, false) then
    perform private.renew_demo_schedule(business);
  end if;

  perform private.seed_demo_lists(business);
end;
$$;

-- The hosted demo people's departments (supabase/hosted-demo.sql says the same,
-- for the workflow's "demo" step), by their fixed ids, never by their place in
-- the list. Then both hosted demo businesses start again with them. Locally the
-- seed runs after the migrations, with its own.
update private.demo_businesses d
set definition = jsonb_set(
  d.definition, '{people}',
  (
    select coalesce(
      jsonb_agg(
        case
          when patch.departments is null then p.value
          else p.value || jsonb_build_object('departments', patch.departments)
        end
        order by p.ordinality
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(d.definition -> 'people') with ordinality as p (value, ordinality)
    left join (
      values
        -- The restaurant: Shiran on the floor and the bar, Noa in the kitchen,
        -- Yoav at the bar and the storeroom.
        ('10000000-0000-4000-a000-000000000103', '["floor", "bar"]'::jsonb),
        ('10000000-0000-4000-a000-000000000104', '["kitchen"]'::jsonb),
        ('10000000-0000-4000-a000-000000000105', '["bar", "storeroom"]'::jsonb),
        -- The shop: Omer and Itai on the floor, Tamar at the checkout, Roni in
        -- the stock room, Lia at the checkout and on the floor.
        ('10000000-0000-4000-a000-000000000107', '["floor"]'::jsonb),
        ('10000000-0000-4000-a000-000000000108', '["checkout"]'::jsonb),
        ('10000000-0000-4000-a000-000000000109', '["floor"]'::jsonb),
        ('10000000-0000-4000-a000-000000000110', '["stock"]'::jsonb),
        ('10000000-0000-4000-a000-000000000111', '["checkout", "floor"]'::jsonb)
    ) as patch (user_id, departments) on patch.user_id = p.value ->> 'user_id'
  )
)
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
)
  and jsonb_typeof(d.definition -> 'people') = 'array';

select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);

------------------------------------------------------------------------------
-- Who may call what

-- The policies' helpers run as the reader, so the signed-in role runs them.
revoke execute on function private.can_manage_lists(uuid, uuid) from public, anon;
revoke execute on function private.sees_list(uuid, uuid) from public, anon;
grant execute on function private.can_manage_lists(uuid, uuid) to authenticated;
grant execute on function private.sees_list(uuid, uuid) to authenticated;

revoke execute on function private.can_send_lists(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.in_department(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.holds_list(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.list_holders(uuid)
  from public, anon, authenticated;
revoke execute on function private.list_managers(uuid)
  from public, anon, authenticated;
revoke execute on function private.list_settings(uuid)
  from public, anon, authenticated;
revoke execute on function private.list_setting(uuid, text)
  from public, anon, authenticated;
revoke execute on function private.lists_on(uuid)
  from public, anon, authenticated;
revoke execute on function private.has_shift_pattern(uuid, text)
  from public, anon, authenticated;
revoke execute on function private.json_text(jsonb, integer, text)
  from public, anon, authenticated;
revoke execute on function private.json_key(jsonb, text)
  from public, anon, authenticated;
revoke execute on function private.json_int(jsonb, integer, integer, text)
  from public, anon, authenticated;
revoke execute on function private.json_num(jsonb, numeric, numeric, text)
  from public, anon, authenticated;
revoke execute on function private.json_bool(jsonb, boolean, text)
  from public, anon, authenticated;
revoke execute on function private.json_uuid(jsonb, text)
  from public, anon, authenticated;
revoke execute on function private.json_instant(jsonb, text)
  from public, anon, authenticated;
revoke execute on function private.list_item_fields(jsonb, boolean)
  from public, anon, authenticated;
revoke execute on function private.list_recipient(uuid, jsonb, text[])
  from public, anon, authenticated;
revoke execute on function private.list_schedule_fields(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function private.notify_for_lists(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notify_lists_from_log()
  from public, anon, authenticated;
revoke execute on function private.seed_recipient(uuid, jsonb, text[])
  from public, anon, authenticated;
revoke execute on function private.copy_template_lists(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function private.seed_demo_lists(uuid)
  from public, anon, authenticated;

revoke execute on function public.set_departments(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.set_department_members(uuid, uuid, uuid, uuid[])
  from public, anon, authenticated;
revoke execute on function public.save_list_template(uuid, uuid, jsonb, integer)
  from public, anon, authenticated;
revoke execute on function public.archive_list_template(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.restore_list_template(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.send_list(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.set_list_item(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.finish_list(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.cancel_list(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.reopen_list(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.my_open_lists(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.apply_template(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.reset_demo_business(uuid)
  from public, anon, authenticated;

grant execute on function public.set_departments(uuid, uuid, jsonb) to service_role;
grant execute on function public.set_department_members(uuid, uuid, uuid, uuid[])
  to service_role;
grant execute on function public.save_list_template(uuid, uuid, jsonb, integer)
  to service_role;
grant execute on function public.archive_list_template(uuid, uuid) to service_role;
grant execute on function public.restore_list_template(uuid, uuid) to service_role;
grant execute on function public.send_list(uuid, uuid, jsonb, timestamptz) to service_role;
grant execute on function public.set_list_item(uuid, uuid, jsonb, timestamptz)
  to service_role;
grant execute on function public.finish_list(uuid, uuid, timestamptz) to service_role;
grant execute on function public.cancel_list(uuid, uuid, timestamptz) to service_role;
grant execute on function public.reopen_list(uuid, uuid, timestamptz) to service_role;
grant execute on function public.my_open_lists(uuid, uuid) to service_role;
grant execute on function public.apply_template(uuid, text) to service_role;
grant execute on function public.reset_demo_business(uuid) to service_role;
