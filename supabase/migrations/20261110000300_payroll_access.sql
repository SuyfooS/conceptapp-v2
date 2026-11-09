-- Pay access, in the database (payroll P2; Orel, 8 and 9 November 2026, issue
-- #1). No screen yet: the next part (P3) draws it.
--
--   accountant     someone who does the books (20261110000200_accountant_role.sql).
--                  At a worker's rank (role_rank 1), so a member, but never on
--                  the staff: no hours, shifts, availability, departments or
--                  lists of their own, no lines about the schedule, and no read
--                  of the schedule, swaps, availability, departments or lists.
--                  They read the roster and names, which the pay screens need,
--                  and always hold clock.payroll. Only an owner invites one (the
--                  ConceptApp team may from the console).
--   clock.payroll  everyone's hours, wages, payroll details and estimates (the
--                  next parts add the last three). Owners and accountants
--                  always hold it. A manager doesn't, until the owner switches
--                  it on for managers (Orel, 9 November 2026): without it a
--                  manager still reads and corrects hours, with no amounts.
--                  An owner may also give it to workers, or to one person.
--   permissions    every key a manifest declares is a row of
--                  public.permission_keys (modules/permissions.db.test.ts keeps
--                  the two the same). A role's grant of one an owner gives is a
--                  row of public.role_permissions; a person's is in
--                  memberships.perms, as before. private.holds_perm says who
--                  holds what, private.has_perm now asks it for the caller, and
--                  public.my_permissions tells the screens.
--   grants         only an owner or the ConceptApp team changes them
--                  (set_role_permission, set_member_permission), each change in
--                  the log as permission.grant or permission.revoke.
--   the log        pay rows (wage.*, payroll.*) are read only by pay holders; a
--                  pay holder who isn't a manager reads the clock, pay and
--                  permission rows.
--   view as        as an accountant, the team reads hours and pay rows; as an
--                  owner or a manager it doesn't. As an accountant it reads
--                  what an accountant reads, so no schedule or lists either.
--   demo           the shop's managers hold pay access, to show the switch
--                  (`rolePermissions` in its definition, put back by the reset
--                  through private.seed_demo_pay); the restaurant starts as a
--                  real business does, with managers off.

------------------------------------------------------------------------------
-- 1. The role

-- Rank of a role (20261013000200_access_rules.sql): owner > manager > worker,
-- and an accountant reads at a worker's rank.
create or replace function private.role_rank(r public.member_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'owner' then 3
    when 'manager' then 2
    when 'worker' then 1
    when 'accountant' then 1
  end
$$;

-- On the staff: scheduled, punching, owing availability, in departments and
-- lists. Everyone but an accountant (`isStaff` in @domain/modules).
create function private.is_staff_role(r public.member_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select r is not null and r <> 'accountant'
$$;

-- The caller is an active member of the business on its staff.
create function private.is_staff_member(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = business
      and m.user_id = (select auth.uid())
      and m.active
      and private.is_staff_role(m.role)
  )
$$;

-- The caller views the business as a role on its staff (any but accountant):
-- what such a member reads, a view in that role reads too.
create function private.is_viewing_staff(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.view_sessions v
    where v.staff_id = (select auth.uid())
      and v.business_id = business
      and v.ended_at is null
      and v.expires_at > now()
      and private.is_staff_role(v.role)
  )
$$;

------------------------------------------------------------------------------
-- 2. Permissions

-- Every permission a manifest declares (modules/<key>/manifest.ts).
create table public.permission_keys (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module_key public.module_key not null,
  -- The staff roles other than the owner that hold it by default, as the
  -- module's own helpers code it (can_edit_clock, can_manage_lists …). A
  -- manifest's `defaultRole` is a minimum (atLeast), so this lists every such
  -- role at or above it: reservations.edit is {manager,worker}. The owner holds
  -- every permission, and an accountant only private.accountant_perms().
  default_roles public.member_role[] not null default '{}'::public.member_role[]
    check (default_roles <@ '{manager,worker}'::public.member_role[]),
  -- An owner gives it, to a role (public.role_permissions) or a person
  -- (memberships.perms), and nobody holds it by role alone: its manifest's
  -- `defaultRole` is "owner" (Orel, 9 November 2026: pay access starts off).
  by_owner boolean not null default false,
  check (not by_owner or cardinality(default_roles) = 0)
);

insert into public.permission_keys (key, module_key, default_roles, by_owner)
values
  ('clock.edit', 'time_clock', '{manager}'::public.member_role[], false),
  ('clock.payroll', 'time_clock', '{}'::public.member_role[], true),
  ('schedule.edit', 'scheduling', '{manager}'::public.member_role[], false),
  ('schedule.publish', 'scheduling', '{manager}'::public.member_role[], false),
  ('reservations.edit', 'reservations', '{manager,worker}'::public.member_role[], false),
  ('storefront.edit', 'storefront', '{manager}'::public.member_role[], false),
  ('lists.manage', 'lists', '{manager}'::public.member_role[], false),
  ('lists.send', 'lists', '{manager}'::public.member_role[], false);

alter table public.permission_keys enable row level security;
revoke all on public.permission_keys from anon, authenticated;
grant select on public.permission_keys to authenticated;

create policy "anyone signed in reads the permission list"
  on public.permission_keys for select to authenticated
  using (true);

-- A role's grant of a permission an owner gives, in one business. Access, not
-- a record: it goes with the business.
create table public.role_permissions (
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Owners hold every permission and accountants theirs, always.
  role public.member_role not null check (role in ('manager', 'worker')),
  perm text not null references public.permission_keys (key),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (business_id, role, perm)
);

create index role_permissions_granted_by_idx on public.role_permissions (granted_by);
create index role_permissions_perm_idx on public.role_permissions (perm);

alter table public.role_permissions enable row level security;
revoke all on public.role_permissions from anon, authenticated;
grant select on public.role_permissions to authenticated;

-- Written only by public.set_role_permission (and the demo's seed).
create policy "members read their business's role grants"
  on public.role_permissions for select to authenticated
  using (private.is_member(business_id) or private.is_viewing(business_id));

comment on table public.permission_keys is
  'Every permission a module manifest declares, with the staff roles that hold it by default; by_owner ones an owner gives instead (public.role_permissions, memberships.perms).';
comment on table public.role_permissions is
  'Which roles a business gives a by-owner permission to (clock.payroll: pay access). Written only by public.set_role_permission; owners and accountants hold it without a row.';

-- What an accountant always holds (ACCOUNTANT_PERMISSIONS in @domain/modules).
-- The hiring file (H4) adds 'people.files'.
create function private.accountant_perms()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select '{clock.payroll}'::text[]
$$;

-- `person` holds `perm_key` in the business: an active member who is its
-- owner, an accountant for what accountants hold, or on the staff and given
-- it personally, in a role the business gives it to, or in one of its default
-- roles when it isn't one an owner gives. A key no manifest declares is held
-- by owners and those given it.
create function private.holds_perm(business uuid, person uuid, perm_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (
        m.role = 'owner'
        or (m.role = 'accountant' and perm_key = any (private.accountant_perms()))
        or (
          private.is_staff_role(m.role)
          and (
            perm_key = any (m.perms)
            or exists (
              select 1
              from public.role_permissions rp
              where rp.business_id = m.business_id
                and rp.role = m.role
                and rp.perm = perm_key
            )
            or exists (
              select 1
              from public.permission_keys k
              where k.key = perm_key
                and not k.by_owner
                and m.role = any (k.default_roles)
            )
          )
        )
      )
  )
$$;

-- The caller holds a permission in the business (20261013000200_access_rules.sql),
-- now through private.holds_perm: every policy that uses it honours role
-- grants, default roles and the accountant.
create or replace function private.has_perm(business uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, (select auth.uid()), perm)
$$;

-- The caller views the business as an accountant: the one view that reads pay.
create function private.viewing_payroll(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.view_sessions v
    where v.staff_id = (select auth.uid())
      and v.business_id = business
      and v.ended_at is null
      and v.expires_at > now()
      and v.role = 'accountant'
  )
$$;

-- A log action of the pay family: what only pay holders read.
create function private.is_pay_action(what text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(what ~ '^(wage|payroll)\.', false)
$$;

-- The caller holds clock.payroll, or views as an accountant, in a business
-- `other` is or was in: they read that person's name, even after they left.
create function private.reads_pay_of(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = other
      and (
        private.has_perm(m.business_id, 'clock.payroll')
        or private.viewing_payroll(m.business_id)
      )
  )
$$;

-- The caller's permissions in the business, sorted, for the screens: the
-- database still decides every read and write. A view holds what its role
-- holds by default, and clock.payroll only as an accountant.
create function public.my_permissions(business uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(k.key order by k.key), '{}'::text[])
  from public.permission_keys k
  where private.holds_perm(business, (select auth.uid()), k.key)
    or exists (
      select 1
      from public.view_sessions v
      where v.staff_id = (select auth.uid())
        and v.business_id = business
        and v.ended_at is null
        and v.expires_at > now()
        and (
          (v.role = 'accountant' and k.key = any (private.accountant_perms()))
          or (
            not k.by_owner
            and (v.role = 'owner' or v.role = any (k.default_roles))
          )
        )
    )
$$;

-- Who may give a permission: an active owner of the business, or the
-- ConceptApp team (the console checks its own staff first, as admin_invite
-- does). Raises 42501 otherwise, P0002 for an unknown business and 22023 for a
-- key that isn't one an owner gives.
create function private.check_permission_giver(actor uuid, business uuid, perm_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_owner(business, actor)
    and not exists (select 1 from public.platform_staff s where s.user_id = actor)
  then
    raise exception 'Only an owner or the team gives this' using errcode = '42501';
  end if;

  if not exists (select 1 from public.businesses b where b.id = business) then
    raise exception 'Unknown business: %', business using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.permission_keys k where k.key = perm_key and k.by_owner
  ) then
    raise exception 'Not a permission an owner gives: %', coalesce(perm_key, 'none')
      using errcode = '22023';
  end if;
end;
$$;

-- Give a permission an owner gives to everyone in a role of the business, or
-- take it back. Owners and accountants always hold it (22023 for them). A call
-- that changes nothing writes nothing.
create function public.set_role_permission(
  actor uuid,
  business uuid,
  grant_role public.member_role,
  perm_key text,
  granted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  perform private.check_permission_giver(actor, business, perm_key);

  if grant_role is null or grant_role not in ('manager', 'worker') then
    raise exception 'Owners and accountants always hold it' using errcode = '22023';
  end if;

  if granted is null then
    raise exception 'Say whether it is given' using errcode = '22023';
  end if;

  if granted then
    insert into public.role_permissions (business_id, role, perm, granted_by)
    values (business, grant_role, perm_key, actor)
    on conflict do nothing;
  else
    delete from public.role_permissions rp
    where rp.business_id = business and rp.role = grant_role and rp.perm = perm_key;
  end if;
  get diagnostics changed = row_count;

  if changed > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, actor,
      case when granted then 'permission.grant' else 'permission.revoke' end,
      jsonb_build_object('role', grant_role, 'perm', perm_key)
    );
  end if;
end;
$$;

-- Give a permission an owner gives to one person on the staff, or take it
-- back. Never to oneself, an owner or an accountant (22023); P0002 for someone
-- who isn't an active member. A call that changes nothing writes nothing.
create function public.set_member_permission(
  actor uuid,
  business uuid,
  person uuid,
  perm_key text,
  granted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.memberships%rowtype;
begin
  perform private.check_permission_giver(actor, business, perm_key);

  if granted is null then
    raise exception 'Say whether it is given' using errcode = '22023';
  end if;

  if person is not distinct from actor then
    raise exception 'Not to yourself' using errcode = '22023';
  end if;

  select * into m
  from public.memberships x
  where x.business_id = business and x.user_id = person and x.active
  for update;
  if not found then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if m.role = 'owner' or not private.is_staff_role(m.role) then
    raise exception 'Owners and accountants always hold it' using errcode = '22023';
  end if;

  if granted = (perm_key = any (m.perms)) then
    return;
  end if;

  update public.memberships x
  set perms = case
    when granted then array_append(x.perms, perm_key)
    else array_remove(x.perms, perm_key)
  end
  where x.id = m.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor,
    case when granted then 'permission.grant' else 'permission.revoke' end,
    jsonb_build_object('person', person, 'perm', perm_key)
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. Reading

-- Hours: pay holders and a view as an accountant, beside today's readers
-- (20261107000100_time_clock.sql, 20261107000300_time_breaks.sql).
drop policy "people read their own entries, managers the business's" on public.time_entries;
create policy "people read their own entries, managers and pay holders the business's"
  on public.time_entries for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or private.has_role(business_id, 'manager')
      or private.has_perm(business_id, 'clock.edit')
      or private.has_perm(business_id, 'clock.payroll')
      or private.is_viewing(business_id, 'manager')
      or private.viewing_payroll(business_id)
    )
  );

alter policy "breaks are read like the entries they belong to" on public.time_breaks
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or private.has_role(business_id, 'manager')
      or private.has_perm(business_id, 'clock.edit')
      or private.has_perm(business_id, 'clock.payroll')
      or private.is_viewing(business_id, 'manager')
      or private.viewing_payroll(business_id)
    )
  );

-- Names of everyone who has worked in the business, for pay holders: the file
-- for payroll needs those who left (known issue 11). The column grants of
-- 20261108000300_sealed.sql still hold, so never a phone.
create policy "pay holders read everyone who worked in the business"
  on public.profiles for select to authenticated
  using (private.reads_pay_of(id));

-- The log: managers read all but the pay rows; pay holders read the pay rows,
-- and, when they are no manager (an accountant, a worker given pay access),
-- the clock's and the permissions' rows too.
drop policy "managers read their business's audit log" on public.audit_log;
create policy "managers read the log, pay holders the pay rows"
  on public.audit_log for select to authenticated
  using (
    (private.has_role(business_id, 'manager') and not private.is_pay_action(action))
    or (
      private.has_perm(business_id, 'clock.payroll')
      and (private.is_pay_action(action) or action ~ '^(clock|permission)\.')
    )
  );

-- A view reads the log as its role would (20261107000700_activity_log.sql):
-- as an owner or a manager without the pay rows, as an accountant only those
-- an accountant reads.
drop policy "the team reads the log when viewing as a manager" on public.audit_log;
create policy "a view reads the log as its role would"
  on public.audit_log for select to authenticated
  using (
    (private.is_viewing(business_id, 'manager') and not private.is_pay_action(action))
    or (
      private.viewing_payroll(business_id)
      and (private.is_pay_action(action) or action ~ '^(clock|permission)\.')
    )
  );

comment on table public.audit_log is
  'Append-only record of what changed in a business: written only by server functions, never changed but for its actor going when their account does, deleted only by a demo reset (private.purge_business_records). Pay rows (wage.*, payroll.*) are read by pay holders only (clock.payroll).';

-- Off the staff, off the schedule and lists: these read through
-- private.is_staff_member where they read through is_member, and a view reads
-- them only in a staff role (20261027000100_availability.sql,
-- 20261103000100_publish_schedule.sql, 20261105000100_shift_swaps.sql,
-- 20261109000600_lists.sql). The roster (memberships) and names (profiles)
-- stay open to every member: the pay screens need them.
alter policy "members read their business's weeks" on public.schedule_weeks
  using (
    private.module_enabled(business_id, 'scheduling')
    and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id))
  );

alter policy "people read their own availability" on public.availability_submissions
  using (
    user_id = (select auth.uid())
    and private.module_enabled(business_id, 'scheduling')
    and private.is_staff_member(business_id)
  );

alter policy "members read published shifts" on public.schedule_shifts
  using (
    private.module_enabled(business_id, 'scheduling')
    and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id))
    and private.week_published(week_id)
  );

alter policy "members read published assignments" on public.shift_assignments
  using (
    private.module_enabled(business_id, 'scheduling')
    and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id))
    and private.shift_published(shift_id)
  );

alter policy "members read their business's swaps" on public.shift_swaps
  using (
    private.module_enabled(business_id, 'scheduling')
    and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id))
  );

alter policy "members read their business's departments" on public.departments
  using (private.is_staff_member(business_id) or private.is_viewing_staff(business_id));

alter policy "members read who is in which department" on public.department_members
  using (private.is_staff_member(business_id) or private.is_viewing_staff(business_id));

alter policy "members read their business's list templates" on public.list_templates
  using (
    private.module_enabled(business_id, 'lists')
    and (
      (archived_at is null
        and (private.is_staff_member(business_id) or private.is_viewing_staff(business_id)))
      or private.can_manage_lists(business_id, (select auth.uid()))
      or private.is_viewing(business_id, 'manager')
    )
  );

------------------------------------------------------------------------------
-- 4. Off the staff

-- No hours, shifts, availability, departments or lists for an accountant. One
-- trigger on each table covers every way a row for a person gets in (punches,
-- stations, add_time_entry, the schedule, a swap's approval, which moves the
-- assignment, set_department_members, send_list), without replacing any of
-- them. Taking a swap writes no such row, so private.check_can_take refuses it
-- below. What someone had on the staff before coming back as an accountant
-- (section 5's claim_invite) the list helpers below no longer count.
create function private.refuse_non_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.memberships m
    where m.business_id = new.business_id
      and m.user_id = new.user_id
      and not private.is_staff_role(m.role)
  ) then
    raise exception 'An accountant is not on the staff' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger time_entries_staff_only before insert on public.time_entries
  for each row execute function private.refuse_non_staff();
create trigger shift_assignments_staff_only
  before insert or update of user_id on public.shift_assignments
  for each row execute function private.refuse_non_staff();
create trigger availability_staff_only before insert on public.availability_submissions
  for each row execute function private.refuse_non_staff();
create trigger department_members_staff_only
  before insert or update of user_id on public.department_members
  for each row execute function private.refuse_non_staff();
create trigger list_people_staff_only before insert on public.list_people
  for each row execute function private.refuse_non_staff();

-- A list's times for one person (list_schedules.recipient_user) open lists for
-- them from L4: the same, for that column. A role recipient is refused already
-- (private.list_recipient takes owner, manager or worker).
create function private.refuse_non_staff_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_user is not null and exists (
    select 1
    from public.memberships m
    where m.business_id = new.business_id
      and m.user_id = new.recipient_user
      and not private.is_staff_role(m.role)
  ) then
    raise exception 'An accountant is not on the staff' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger list_schedules_staff_only
  before insert or update of recipient_user on public.list_schedules
  for each row execute function private.refuse_non_staff_recipient();

-- Raise unless `person` may work `shift` in place of someone else
-- (20261105000100_shift_swaps.sql): an active member on the staff, not already
-- on it, and on no other shift at the same time. take_shift_swap,
-- decide_shift_swap's second check and private.can_take (who is told of an
-- open swap) all ask it, so an accountant never takes a swap, never has one
-- approved and is never offered one. Its grants stay as they were.
create or replace function private.check_can_take(shift uuid, person uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.schedule_shifts%rowtype;
begin
  select * into s from public.schedule_shifts where id = shift;

  if not exists (
    select 1 from public.memberships m
    where m.business_id = s.business_id and m.user_id = person and m.active
  ) then
    raise exception 'Only active members of the business can take a shift'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.memberships m
    where m.business_id = s.business_id and m.user_id = person
      and not private.is_staff_role(m.role)
  ) then
    raise exception 'An accountant is not on the staff' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.shift_assignments a
    where a.shift_id = shift and a.user_id = person
  ) then
    raise exception 'Already on this shift' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.shift_assignments a
    join public.schedule_shifts o on o.id = a.shift_id
    where a.user_id = person
      and o.business_id = s.business_id
      and o.id <> shift
      and private.shift_span(o.id) && private.shift_span(shift)
  ) then
    raise exception 'Works another shift at the same time' using errcode = '22023';
  end if;
end;
$$;

-- The three list helpers of 20261109000600_lists.sql, each with one more
-- condition on the membership: on the staff. Someone who comes back as an
-- accountant keeps their place on the record of lists done (claim_invite takes
-- them off those still open), but no longer holds, reads or hears of any list,
-- one they sent included. Their grants stay as they were.

-- The list is for `person` now: they are among its people (a person, a shift),
-- in its department, or in its role, and an active member of its business on
-- its staff. Lists a removed department already holds stay with its people, so
-- they are never left with nobody to fill them.
create or replace function private.holds_list(list uuid, person uuid)
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
      and private.is_staff_role(m.role)
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

-- `person` may read the list: an active member of its business on its staff
-- who holds it, sent it, is among its people, is in the department that asked
-- for it or in one it passed through, or manages the business's lists.
create or replace function private.sees_list(list uuid, person uuid)
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
      and private.is_staff_role(m.role)
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

-- The active people on the staff a list is for now, for its notifications.
create or replace function private.list_holders(list uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[])
  from public.lists l
  join public.memberships m
    on m.business_id = l.business_id and m.active and private.is_staff_role(m.role)
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

-- Lines about the schedule or lists never reach someone off the staff:
-- private.notify of 20261109000450_notifications.sql, with one more condition
-- in its loop. For lists that is the finished line to whoever sent the list,
-- which someone who came back as an accountant may have.
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
      and (about is null or about not in ('scheduling', 'lists')
        or private.is_staff_role(m.role))
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

------------------------------------------------------------------------------
-- 5. Invites

-- Invite a number to the actor's business (20261108000300_sealed.sql), with
-- the rules said instead of read from the enum's order, which would let a
-- manager invite an accountant: owners and managers invite; only an owner
-- invites an owner or an accountant, or changes their open invite.
create or replace function public.team_invite(
  actor uuid,
  business uuid,
  invite_phone text,
  invite_name text,
  invite_role public.member_role,
  new_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  existing public.invites%rowtype;
  invite_id uuid;
begin
  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or actor_role not in ('owner', 'manager')
    or invite_role is null
    or (invite_role = 'owner' and actor_role <> 'owner') then
    raise exception 'Not allowed to invite this role' using errcode = '42501';
  end if;

  if invite_role = 'accountant' and actor_role <> 'owner' then
    raise exception 'Only an owner invites an accountant' using errcode = '42501';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
  end if;

  if new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token hash must be 64 hex digits' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.business_id = business and m.active and p.phone = invite_phone
  ) then
    raise exception 'Already in the team' using errcode = '23505';
  end if;

  select * into existing
  from public.invites i
  where i.business_id = business and i.phone = invite_phone
    and i.claimed_at is null
  for update;

  if existing.id is not null then
    if existing.role in ('owner', 'accountant') and actor_role <> 'owner' then
      raise exception 'Not allowed to change this invite' using errcode = '42501';
    end if;
    update public.invites
    set token_hash = new_token_hash,
      role = invite_role,
      full_name = coalesce(nullif(btrim(invite_name), ''), full_name),
      invited_by = actor,
      expires_at = now() + interval '14 days'
    where id = existing.id;
    invite_id := existing.id;
  else
    insert into public.invites (
      business_id, phone, role, full_name, token_hash, invited_by
    )
    values (
      business, invite_phone, invite_role, nullif(btrim(invite_name), ''),
      new_token_hash, actor
    )
    returning id into invite_id;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor,
    case when existing.id is null then 'invite.create' else 'invite.send' end,
    jsonb_build_object('invite', invite_id, 'role', invite_role)
  );

  return invite_id;
end;
$$;

-- A fresh link from the Team screen (20261108000300_sealed.sql), by the same
-- rules: an owner's or an accountant's invite only from an owner.
create or replace function public.team_invite_link(
  actor uuid,
  invite uuid,
  new_token_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  actor_role public.member_role;
begin
  if new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token hash must be 64 hex digits' using errcode = '22023';
  end if;

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

  if actor_role is null or actor_role not in ('owner', 'manager')
    or (inv.role in ('owner', 'accountant') and actor_role <> 'owner') then
    raise exception 'Not allowed to send this invite' using errcode = '42501';
  end if;

  if private.closed_to_invites(inv.business_id) then
    raise exception 'A demo business takes no invites' using errcode = '55000';
  end if;

  update public.invites
  set token_hash = new_token_hash,
    invited_by = actor,
    expires_at = now() + interval '14 days'
  where id = inv.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    inv.business_id, actor, 'invite.send',
    jsonb_build_object('invite', inv.id)
  );

  return inv.phone;
end;
$$;

-- Joining from a link (20261108000300_sealed.sql). The claim sets the role
-- (`role = excluded.role`), so someone who worked here and comes back as an
-- accountant must have finished their shifts: an open entry, a shift from the
-- business's today on, or a swap they took for one is refused (55000, which
-- /join says in words). They leave what is the staff's: their departments,
-- personal permissions, the lists still open for them and any list's times
-- that open lists for them (a schedule goes with its person's place). Lists
-- done keep them on their record, and the list helpers above no longer count
-- them.
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
-- 6. The demo

-- What a demo business starts with on the pay side (20261110000100_hours_kept.sql):
-- the role grants its definition names (`rolePermissions`, a list of {role,
-- perm}). P3, P4 and P5 replace this, never the reset.
create or replace function private.seed_demo_pay(business uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.role_permissions (business_id, role, perm)
  select d.business_id, g.role, g.perm
  from private.demo_businesses d
  cross join lateral jsonb_to_recordset(
    case
      when jsonb_typeof(d.definition -> 'rolePermissions') = 'array'
        then d.definition -> 'rolePermissions'
      else '[]'::jsonb
    end
  ) as g (role public.member_role, perm text)
  where d.business_id = business
  on conflict do nothing;
$$;

-- The hosted shop's managers hold pay access (supabase/hosted-demo.sql says
-- the same, for the workflow's "demo" step), by its fixed id; then each demo
-- business there is takes its grants, without a reset. Locally the seed runs
-- after the migrations, with its own.
update private.demo_businesses d
set definition = d.definition
  || '{"rolePermissions": [{"role": "manager", "perm": "clock.payroll"}]}'::jsonb
where d.business_id = '10000000-0000-4000-b000-000000000002';

select private.seed_demo_pay(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id;

------------------------------------------------------------------------------
-- Who may call what

-- The policies' helpers run as the reader, so the signed-in role runs them.
revoke execute on function private.is_staff_member(uuid) from public, anon;
revoke execute on function private.is_viewing_staff(uuid) from public, anon;
revoke execute on function private.viewing_payroll(uuid) from public, anon;
revoke execute on function private.is_pay_action(text) from public, anon;
revoke execute on function private.reads_pay_of(uuid) from public, anon;
grant execute on function private.is_staff_member(uuid) to authenticated;
grant execute on function private.is_viewing_staff(uuid) to authenticated;
grant execute on function private.viewing_payroll(uuid) to authenticated;
grant execute on function private.is_pay_action(text) to authenticated;
grant execute on function private.reads_pay_of(uuid) to authenticated;

-- The rest run inside the functions above, as their owner: nobody else may ask
-- who holds what.
revoke execute on function private.is_staff_role(public.member_role)
  from public, anon, authenticated;
revoke execute on function private.accountant_perms() from public, anon, authenticated;
revoke execute on function private.holds_perm(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function private.check_permission_giver(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function private.refuse_non_staff() from public, anon, authenticated;
revoke execute on function private.refuse_non_staff_recipient()
  from public, anon, authenticated;

-- The screens ask with the person's own session.
revoke execute on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;

-- Grants change with the secret key only, for `actor`.
revoke execute on function public.set_role_permission(uuid, uuid, public.member_role, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.set_member_permission(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_role_permission(uuid, uuid, public.member_role, text, boolean)
  to service_role;
grant execute on function public.set_member_permission(uuid, uuid, uuid, text, boolean)
  to service_role;
