-- Roles and permissions by module, R11d: lists sent to a role a business
-- named (the roles plan's R11 d; Orel's answers of 15 and 16 November 2026,
-- issue #1: an owner adds a role with a name they choose, built on a manager
-- or a worker). R11a (20261115001500_named_roles.sql) made the roles and
-- R11b (20261115001600_named_roles_give.sql) gives them; from here a list,
-- a template's default and a template's time go to one.
--
--   addressing  recipient_named_role on public.lists, public.list_templates
--               and public.list_schedules: the role the business named that
--               a list "to a role" goes to, built on its recipient_role (its
--               base), by a foreign key over (business_id,
--               recipient_named_role, recipient_role) to
--               public.business_roles (business_id, id, base), as
--               memberships' and invites' are, and only on one to a role (a
--               check: recipient_kind = 'role'). Never an archived one,
--               whoever writes it (private.refuse_archived_recipient_role, a
--               trigger on each: 22023, hint 'archived'), and its row locked
--               as the foreign key's check locks it, so an archive under way
--               is waited for. Null: the role itself, as before.
--   who holds   a list to a named role is for exactly the people holding it
--               (memberships.named_role), on the staff and active, read live
--               as a role's people are (private.holds_list,
--               private.list_holders, and through them private.sees_list,
--               the lists' policy, public.my_open_lists, the writers' "holds
--               the list" and every notification of a list). A list to the
--               role itself still reaches everyone in it, those in a role
--               named on it among them: a shift lead built on worker is a
--               worker, and "to the workers" reaches them as it did before
--               anyone held a named role, so nobody's lists change.
--   choosing    a recipient's JSON takes `namedRole` beside `role` (its id;
--               only on a role): of this business (22023 otherwise), live
--               (22023, hint 'archived') and built on that role (22023, hint
--               'base') (private.list_recipient). public.send_list sends to
--               it and logs it (`recipient.named_role` and
--               `recipient.role_name` on `lists.send`); a template's default
--               and its times keep it (public.save_list_template, through
--               private.list_schedule_fields).
--   the times   the minute job opens a time's list to its named role while
--               the role is live (private.lists_tick_business); one archived
--               since (its template archived with it, then restored) has
--               nobody there, as a removed department has, so the list goes
--               to the managers while they run the lists, else to the owners
--               (R5's rule), never to the whole base.
--   passing     public.pass_list gives a list to a department and leaves its
--               named role behind with its role.
--   archiving   public.archive_business_role is refused while a live
--               template goes to the role when nobody chooses, or a time of a
--               live template sends to it, on or paused (55000, hint 'lists',
--               the count of both as its detail), after the people and open
--               invites who hold it (hint 'held', as before). Not a fall
--               back to the base: a list meant for a shift lead would then
--               reach every worker, unasked, and a paused time switched on
--               again later would too. The owner sends those elsewhere
--               first, on the template's screen. A list already sent to the
--               role stays as it was: nobody active holds the role by then
--               (or the archive is refused), and whoever runs the lists sees
--               it, passes it on or cancels it, as with a list to a role
--               nobody is in. A template archived first keeps its role and
--               never blocks; restored after the role was archived, it reads
--               as one whose department was removed: its default is chosen
--               again, a time to it opens for nobody there (above), and a
--               save naming it is refused until it goes elsewhere.
--   moving off public.set_member_role, moving someone off a named role while
--               they stay on the staff, settles the lines of the lists they
--               no longer see (`list:`, `list.due:`, `list.late:`: read,
--               settled, off the phone if not sent yet), as public.pass_list
--               settles a list's former holders': a list to the role is
--               read live by who holds it, so its name and due time wait on
--               nobody. The lines of lists they still see stay.
--
-- Nothing changes for anyone without a named role: every list, template and
-- time made before reads null, and each check asks the built-in role as
-- before.
--
-- Replaced, each from its latest version and only with what is said above:
-- private.holds_list and private.list_holders
-- (20261110000300_payroll_access.sql); private.list_recipient,
-- private.list_schedule_fields and public.send_list
-- (20261109000600_lists.sql); public.save_list_template and
-- private.lists_tick_business (20261115001200_roles_lists.sql);
-- public.pass_list (20261110001400_lists_pass.sql); and
-- public.archive_business_role and public.set_member_role
-- (20261115001600_named_roles_give.sql).
-- private.list_recipient and private.list_schedule_fields gain an out
-- column, so each is dropped and created again, its grants with it; neither
-- has a policy or a BEGIN ATOMIC body depending on it (both are plpgsql, as
-- their callers are). The rest keep their signatures and grants. Their
-- callers: private.list_recipient by private.list_schedule_fields,
-- public.save_list_template and public.send_list;
-- private.list_schedule_fields by public.save_list_template;
-- private.holds_list by private.sees_list, public.set_list_item,
-- public.set_list_item_photo, public.finish_list, public.my_open_lists and
-- public.pass_list; private.list_holders by private.notify_for_lists;
-- private.lists_tick_business by private.lists_tick; public.send_list by
-- private.seed_demo_lists; public.archive_business_role and
-- public.set_member_role by nothing in the database; all unchanged. The app
-- calls the public ones with the secret key (@db/lists, @db/roles,
-- @db/team). private.copy_template_lists and
-- private.seed_demo_lists are unchanged: a global template, and the demo,
-- name no role a business named (the demo's people keep the built-in roles).

------------------------------------------------------------------------------
-- 1. Addressing a named role

-- On delete, set null, as memberships' and invites' foreign keys to a role.
-- Here null would mean the whole base, but nothing deletes a role: delete is
-- revoked on public.business_roles even from the secret key
-- (20261115001500_named_roles.sql), a role goes by its archive, and only a
-- business's own deletion takes its roles, with its lists, templates and
-- times. Not `no action`: a time is deleted with its template, a step after
-- the business's (list_schedules has no foreign key to businesses), so that
-- check could find a time still there and refuse deleting the business (a
-- demo's reset among them), by the order the cascades' triggers fire in.

-- A template's default: a role the business named, built on its role.
alter table public.list_templates
  add column recipient_named_role uuid,
  add constraint list_templates_recipient_named_role_fkey
    foreign key (business_id, recipient_named_role, recipient_role)
    references public.business_roles (business_id, id, base)
    on delete set null (recipient_named_role),
  add constraint list_templates_recipient_named_role_check
    check (recipient_named_role is null or recipient_kind is not distinct from 'role');

-- A template's time: the same.
alter table public.list_schedules
  add column recipient_named_role uuid,
  add constraint list_schedules_recipient_named_role_fkey
    foreign key (business_id, recipient_named_role, recipient_role)
    references public.business_roles (business_id, id, base)
    on delete set null (recipient_named_role),
  add constraint list_schedules_recipient_named_role_check
    check (recipient_named_role is null or recipient_kind is not distinct from 'role');

-- A list: whom it is for now, the role's people read live as its role's are.
alter table public.lists
  add column recipient_named_role uuid,
  add constraint lists_recipient_named_role_fkey
    foreign key (business_id, recipient_named_role, recipient_role)
    references public.business_roles (business_id, id, base)
    on delete set null (recipient_named_role),
  add constraint lists_recipient_named_role_check
    check (recipient_named_role is null or recipient_kind is not distinct from 'role');

create index list_templates_recipient_named_role_idx
  on public.list_templates (recipient_named_role)
  where recipient_named_role is not null;
create index list_schedules_recipient_named_role_idx
  on public.list_schedules (recipient_named_role)
  where recipient_named_role is not null;
create index lists_recipient_named_role_idx
  on public.lists (recipient_named_role)
  where recipient_named_role is not null;

comment on column public.list_templates.recipient_named_role is
  'The role the business named that the template goes to when nobody chooses (public.business_roles), built on recipient_role and live when it was saved; null for the role itself, or another recipient. Its role can''t be archived while a live template names it.';
comment on column public.list_schedules.recipient_named_role is
  'The role the business named that the time''s lists go to, built on recipient_role and live when it was saved; null for the role itself, or another recipient. Its role can''t be archived while a time of a live template names it.';
comment on column public.lists.recipient_named_role is
  'The role the business named that the list is for now: exactly the people who hold it (memberships.named_role), read live. Null for the whole of recipient_role, those in a role named on it among them, or another recipient. Cleared when it is passed to a department.';

-- As memberships' and invites' (R11a, R11b): nobody sends a list, or keeps a
-- template or a time, to an archived role, whoever writes it (22023, hint
-- 'archived'); the role's row is locked as the foreign key's check locks
-- it, so an archive under way is waited for, and one after this waits and
-- counts what this writes. A row that keeps its named role is not asked
-- again, so a list sent before an archive is passed on, filled and closed as
-- before.
create function private.refuse_archived_recipient_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived boolean;
begin
  if new.recipient_named_role is null
    or (tg_op = 'UPDATE' and new.recipient_named_role is not distinct from old.recipient_named_role)
  then
    return new;
  end if;

  select br.archived_at is not null into archived
  from public.business_roles br
  where br.id = new.recipient_named_role
    and br.business_id = new.business_id
  for key share;

  if archived then
    raise exception 'The role is archived' using errcode = '22023', hint = 'archived';
  end if;
  return new;
end;
$$;

create trigger list_templates_recipient_named_role_live
  before insert or update of recipient_named_role on public.list_templates
  for each row execute function private.refuse_archived_recipient_role();
create trigger list_schedules_recipient_named_role_live
  before insert or update of recipient_named_role on public.list_schedules
  for each row execute function private.refuse_archived_recipient_role();
create trigger lists_recipient_named_role_live
  before insert or update of recipient_named_role on public.lists
  for each row execute function private.refuse_archived_recipient_role();

------------------------------------------------------------------------------
-- 2. Who holds a list to one

-- 20261110000300_payroll_access.sql's, with a list to a role the business
-- named held by exactly its people, and one to the role itself, as before,
-- by everyone in it.
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
        -- A role the business named: those who hold it; the role itself:
        -- everyone in it, those in a role named on it among them.
        when 'role' then m.role = l.recipient_role
          and (l.recipient_named_role is null or m.named_role = l.recipient_named_role)
        else exists (
          select 1 from public.list_people p
          where p.list_id = l.id and p.user_id = person
        )
      end
  )
$$;

-- 20261110000300_payroll_access.sql's, with the same rule as
-- private.holds_list above: a named role's holders, or the whole role.
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
      -- As private.holds_list: a named role's holders, or the whole role.
      when 'role' then m.role = l.recipient_role
        and (l.recipient_named_role is null or m.named_role = l.recipient_named_role)
      else exists (
        select 1 from public.list_people p
        where p.list_id = l.id and p.user_id = m.user_id
      )
    end
$$;

------------------------------------------------------------------------------
-- 3. Choosing one

drop function private.list_recipient(uuid, jsonb, text[]);

-- 20261109000600_lists.sql's, with `namedRole` beside `role` (to_named): a
-- role the business named, of this business, live and built on that role.
create function private.list_recipient(
  business uuid,
  raw jsonb,
  kinds text[],
  out to_kind text,
  out to_user uuid,
  out to_department uuid,
  out to_shift text,
  out to_role public.member_role,
  out to_named uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  named_base public.member_role;
  named_archived boolean;
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
    where k.field not in ('kind', 'user', 'department', 'shift', 'role', 'namedRole')
  ) then
    raise exception 'A recipient has a kind and who' using errcode = '22023';
  end if;
  if to_kind <> 'role' and coalesce(jsonb_typeof(raw -> 'namedRole'), 'null') <> 'null' then
    raise exception 'Only a role has a role the business named' using errcode = '22023';
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
    -- A role the business named, built on that one: of this business and
    -- live. The lists' tables check it again with its row locked
    -- (private.refuse_archived_recipient_role), so an archive under way is
    -- waited for.
    to_named := private.json_uuid(raw -> 'namedRole', 'The role the business named');
    if to_named is not null then
      select br.base, br.archived_at is not null
      into named_base, named_archived
      from public.business_roles br
      where br.id = to_named and br.business_id = business;
      if not found then
        raise exception 'Not a role of this business' using errcode = '22023';
      end if;
      if named_archived then
        raise exception 'The role is archived' using errcode = '22023', hint = 'archived';
      end if;
      if named_base <> to_role then
        raise exception 'The role is built on %', named_base using errcode = '22023', hint = 'base';
      end if;
    end if;
  end case;
end;
$$;

drop function private.list_schedule_fields(uuid, jsonb);

-- 20261109000600_lists.sql's, with the named role its recipient names
-- (for_named), from private.list_recipient above.
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
  out for_named uuid,
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

  select r.to_kind, r.to_user, r.to_department, r.to_shift, r.to_role, r.to_named
  into for_kind, for_user, for_department, for_shift, for_role, for_named
  from private.list_recipient(
    business, raw -> 'recipient', array['person', 'department', 'shift', 'role']
  ) as r;

  is_active := private.json_bool(raw -> 'active', true, 'Active');
end;
$$;

------------------------------------------------------------------------------
-- 4. Sending to one, and keeping one

-- 20261109000600_lists.sql's, with the named role of the recipient
-- (private.list_recipient) on the list and in its log row
-- (`recipient.named_role`, `recipient.role_name`).
create or replace function public.send_list(
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
  rn uuid;
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
    select r.to_kind, r.to_user, r.to_department, r.to_role, r.to_named
    into rk, ru, rd, rr, rn
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
    recipient_role, recipient_named_role, shift_id, shift, from_department,
    asks_quantities, sent_by, opens_at, due_at
  )
  values (
    business, tid, list_name,
    nullif(concat_ws(E'\n', t.note, sender_note), ''),
    'sent', rk, rd, rr, rn, sid,
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
        jsonb_build_object(
          'kind', rk, 'id', coalesce(ru, rd, sid), 'role', rr,
          'named_role', rn,
          'role_name', (select br.name from public.business_roles br where br.id = rn)
        )
      ),
      'from_department', t.from_department,
      'due_at', due
    )
  );

  return lid;
end;
$$;

-- 20261115001200_roles_lists.sql's, with the named role of the template's
-- default and of each of its times (private.list_recipient,
-- private.list_schedule_fields) kept on them.
create or replace function public.save_list_template(
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
  rn uuid;
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
    private.can_manage_lists(business, actor)
    or exists (select 1 from public.platform_staff ps where ps.user_id = actor)
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
    select r.to_kind, r.to_department, r.to_shift, r.to_role, r.to_named
    into rk, rd, rs, rr, rn
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
      recipient_role, recipient_named_role, from_department, asks_quantities, position,
      created_by, updated_by
    )
    values (
      business, new_name, new_note, rk, rd, rs, rr, rn, asking, asks,
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
      recipient_named_role = rn,
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
        recipient_shift, recipient_role, recipient_named_role, active, starts_on
      )
      values (
        tid, business, (place - 1)::smallint, s.at_days, s.at_anchor, s.at_shift,
        s.at_opens, s.at_due, s.for_kind, s.for_user, s.for_department, s.for_shift,
        s.for_role, s.for_named, s.is_active, (now() at time zone tz)::date
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
        recipient_named_role = s.for_named,
        active = s.is_active,
        -- Other days or hours, or on again: it counts from now.
        opens_from = case
          when not (ls.days @> s.at_days and ls.days <@ s.at_days)
            or ls.anchor is distinct from s.at_anchor
            or ls.shift_key is distinct from s.at_shift
            or ls.opens_offset <> s.at_opens
            or ls.due_offset <> s.at_due
            or (not ls.active and s.is_active)
            then now()
          else ls.opens_from
        end
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

-- 20261110001400_lists_pass.sql's, with the named role left behind with the
-- role when the list goes to a department.
create or replace function public.pass_list(
  actor uuid,
  list uuid,
  department uuid,
  pass_note text default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lists%rowtype;
  goes_to public.departments%rowtype;
  kept_note text;
  was_with uuid;
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
    raise exception 'The list is not yours to pass on' using errcode = '42501';
  end if;
  if l.status <> 'open' then
    raise exception 'The list is closed' using errcode = '55000';
  end if;

  select d.* into goes_to
  from public.departments d
  where d.id = department and d.business_id = l.business_id and d.archived_at is null;
  if not found then
    raise exception 'Not a department of this business' using errcode = '22023';
  end if;
  if l.recipient_kind = 'department' and l.recipient_department = goes_to.id then
    raise exception 'The list is with this department already' using errcode = '22023';
  end if;

  kept_note := nullif(btrim(pass_note), '');
  if char_length(kept_note) > 200 then
    raise exception 'A note has at most 200 characters' using errcode = '22023';
  end if;

  was_with := case when l.recipient_kind = 'department' then l.recipient_department end;

  insert into public.list_passes (
    list_id, business_id, from_department, to_department, passed_by, passed_at, note
  )
  values (l.id, l.business_id, was_with, goes_to.id, actor, at_time, kept_note);

  -- The department's now. Its people of before stay in list_people and keep
  -- reading it; the shift it was sent to stays on the row for its history.
  update public.lists x
  set recipient_kind = 'department',
    recipient_department = goes_to.id,
    recipient_role = null,
    recipient_named_role = null
  where x.id = l.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    l.business_id, actor, 'lists.pass',
    jsonb_build_object(
      'list', l.id,
      'name', l.name,
      'from_department', was_with,
      'to_department', goes_to.id,
      'has_note', kept_note is not null
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- 5. The times

-- 20261115001200_roles_lists.sql's, with a time to a named role opening its
-- list to that role while it is live, and to nobody there (the managers
-- while they run the lists, else the owners) once it was archived.
create or replace function private.lists_tick_business(business uuid, at_time timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  lists_settings jsonb;
  remind_before integer;
  late_after integer;
  owners_after integer;
  in_shabbat boolean;
  due_one record;
  gone record;
  soon record;
  late_one record;
  still_late record;
  lid uuid;
  people uuid[];
  to_kind text;
  to_department uuid;
  to_role public.member_role;
  to_named uuid;
  to_shift uuid;
  locked boolean := false;
  opened integer := 0;
begin
  select b.timezone into tz from public.businesses b where b.id = business;
  if not found then
    return 0;
  end if;
  lists_settings := private.list_settings(business);
  remind_before := coalesce((lists_settings ->> 'remindBeforeMinutes')::integer, 30);
  late_after := coalesce((lists_settings ->> 'lateAfterMinutes')::integer, 15);
  -- Only a value the manifest offers; anything else stored reads as 60.
  owners_after := case lists_settings -> 'tellOwnersAfterMinutes'
    when '0'::jsonb then 0
    when '30'::jsonb then 30
    when '60'::jsonb then 60
    when '120'::jsonb then 120
    else 60
  end;
  in_shabbat := private.closes_on_shabbat(business)
    and coalesce(
      private.shabbat_span(business, (at_time at time zone tz)::date) @> at_time,
      false
    );

  -- 1. What has opened by now, once each (the unique key of a schedule's day).
  if not in_shabbat then
    for due_one in
      select ls.id as schedule, ls.template_id as template, t.name as template_name,
        t.note as template_note, t.from_department as asking, t.asks_quantities as asks,
        ls.anchor as anchor_kind, ls.shift_key as pattern, ls.recipient_kind as for_kind,
        ls.recipient_user as for_user, ls.recipient_department as for_department,
        ls.recipient_shift as for_shift, ls.recipient_role as for_role,
        ls.recipient_named_role as for_named,
        o.occurs_on as on_day, o.opens_at as opens, o.due_at as due,
        o.shift_id as anchor_shift
      from public.list_schedules ls
      join public.list_templates t
        on t.id = ls.template_id and t.business_id = ls.business_id and t.archived_at is null
      cross join lateral private.list_occurrences(
        ls.id, at_time - interval '36 hours', at_time
      ) as o
      where ls.business_id = business
        and ls.active
        and o.due_at > at_time - interval '12 hours'
        and not exists (
          select 1 from public.lists l
          where l.schedule_id = ls.id and l.occurs_on = o.occurs_on
        )
      order by o.opens_at, ls.id
    loop
      if not locked then
        -- Under the business's lock, as send_list counts, so the cap holds.
        perform 1 from public.businesses b where b.id = business for no key update;
        locked := true;
      end if;
      if (
        select count(*) from public.lists l
        where l.business_id = business and l.status = 'open'
      ) >= 500 then
        raise warning 'Business % keeps 500 open lists: its times wait', business;
        exit;
      end if;

      to_kind := due_one.for_kind;
      to_department := null;
      to_role := null;
      to_named := null;
      to_shift := null;
      people := '{}'::uuid[];
      case due_one.for_kind
      when 'person' then
        people := array(
          select m.user_id
          from public.memberships m
          where m.business_id = business
            and m.user_id = due_one.for_user
            and m.active
            and private.is_staff_role(m.role)
        );
      when 'department' then
        if exists (
          select 1 from public.departments d
          where d.id = due_one.for_department
            and d.business_id = business
            and d.archived_at is null
        ) then
          to_department := due_one.for_department;
        end if;
      when 'shift' then
        -- The shift it follows, or that day's published shift of the pattern.
        if due_one.anchor_kind <> 'day' and due_one.for_shift = due_one.pattern then
          to_shift := due_one.anchor_shift;
        else
          select ss.id into to_shift
          from public.schedule_shifts ss
          where ss.business_id = business
            and ss.pattern_key = due_one.for_shift
            and ss.day = due_one.on_day
            and private.shift_published(ss.id)
          order by ss.starts_at, ss.id
          limit 1;
        end if;
        people := array(
          select a.user_id
          from public.shift_assignments a
          join public.memberships m
            on m.business_id = business and m.user_id = a.user_id and m.active
            and private.is_staff_role(m.role)
          where a.shift_id = to_shift
          order by a.user_id
        );
      else
        to_role := due_one.for_role;
        -- A role the business named: to its people while it is live; one
        -- archived since (its template was restored after it) has nobody
        -- there, as a removed department has.
        if due_one.for_named is not null then
          if exists (
            select 1 from public.business_roles br
            where br.id = due_one.for_named
              and br.business_id = business
              and br.archived_at is null
          ) then
            to_named := due_one.for_named;
          else
            to_role := null;
          end if;
        end if;
      end case;

      -- Nobody there to take it: the managers while their role runs the
      -- lists, else the owners, who always do, so it is never lost and never
      -- goes to a role the lists were taken from (R5).
      if (to_kind in ('person', 'shift') and cardinality(people) = 0)
        or (to_kind = 'department' and to_department is null)
        or (to_kind = 'role' and to_role is null) then
        to_kind := 'role';
        to_role := (
          case
            when private.role_holds(business, 'manager'::public.member_role, 'lists.manage'::text)
              then 'manager'
            else 'owner'
          end
        )::public.member_role;
        to_named := null;
        people := '{}'::uuid[];
      end if;

      lid := null;
      insert into public.lists (
        business_id, template_id, schedule_id, occurs_on, name, note, origin,
        recipient_kind, recipient_department, recipient_role, recipient_named_role,
        shift_id, shift, from_department, asks_quantities, opens_at, due_at
      )
      values (
        business, due_one.template, due_one.schedule, due_one.on_day,
        due_one.template_name, due_one.template_note, 'scheduled', to_kind,
        to_department, to_role, to_named, to_shift,
        case when to_shift is not null then private.shift_brief(to_shift) end,
        due_one.asking, due_one.asks, due_one.opens, due_one.due
      )
      on conflict (schedule_id, occurs_on) do nothing
      returning id into lid;
      if lid is null then
        continue;
      end if;

      insert into public.list_items (
        list_id, business_id, template_item_id, position, kind, label, hint, required,
        unit, min_value, max_value, requested
      )
      select lid, business, i.id, i.position, i.kind, i.label, i.hint, i.required,
        i.unit, i.min_value, i.max_value,
        case when due_one.asks and i.kind = 'check' then i.default_quantity end
      from public.list_template_items i
      where i.template_id = due_one.template
      order by i.position;

      insert into public.list_people (list_id, business_id, user_id)
      select lid, business, p.person from unnest(people) as p (person);

      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        business, null::uuid, 'lists.open',
        jsonb_build_object(
          'list', lid,
          'schedule', due_one.schedule,
          'template', due_one.template,
          'name', due_one.template_name,
          'occurs_on', due_one.on_day
        )
      );
      opened := opened + 1;
    end loop;
  end if;

  -- 2. Missed: a scheduled list whose next one has opened, or still open 24
  --    hours after its due time. A daily list missed for a week leaves one
  --    open list, not seven. One opened again by hand (reopen_list) is a
  --    correction, which waits for whoever finishes or cancels it.
  for gone in
    update public.lists l
    set status = 'missed', closed_at = at_time
    where l.id in (
      select x.id
      from public.lists x
      where x.business_id = business
        and x.status = 'open'
        and x.origin = 'scheduled'
        and x.reopened_at is null
        and (
          x.due_at + interval '24 hours' <= at_time
          or exists (
            select 1 from public.lists newer
            where newer.business_id = business
              and newer.schedule_id = x.schedule_id
              and newer.occurs_on > x.occurs_on
              and newer.opens_at <= at_time
          )
        )
      for update skip locked
    )
    returning l.id, l.name
  loop
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, null::uuid, 'lists.missed',
      jsonb_build_object('list', gone.id, 'name', gone.name)
    );
  end loop;

  if in_shabbat then
    return opened;
  end if;

  -- 3. Due soon: once, `remindBeforeMinutes` before the due time, unless the
  --    list opened inside that window (its "sent" line says as much).
  if remind_before > 0 then
    for soon in
      update public.lists l
      set reminded_at = at_time
      where l.id in (
        select x.id
        from public.lists x
        where x.business_id = business
          and x.status = 'open'
          and x.due_at is not null
          and x.reminded_at is null
          and x.due_at - make_interval(mins => remind_before) <= at_time
          and at_time < x.due_at
          and x.opens_at < x.due_at - make_interval(mins => remind_before)
        for update skip locked
      )
      returning l.id, l.name, l.due_at
    loop
      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        business, null::uuid, 'lists.due',
        jsonb_build_object('list', soon.id, 'name', soon.name, 'due_at', soon.due_at)
      );
    end loop;
  end if;

  -- 4. Late: once, `lateAfterMinutes` after the due time.
  for late_one in
    update public.lists l
    set late_at = at_time
    where l.id in (
      select x.id
      from public.lists x
      where x.business_id = business
        and x.status = 'open'
        and x.due_at is not null
        and x.late_at is null
        and x.due_at + make_interval(mins => late_after) <= at_time
      for update skip locked
    )
    returning l.id, l.name, l.due_at
  loop
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, null::uuid, 'lists.late',
      jsonb_build_object('list', late_one.id, 'name', late_one.name, 'due_at', late_one.due_at)
    );
  end loop;

  -- 5. Still late, to the owners: once, `tellOwnersAfterMinutes` after it
  --    became late (from the minute of late_at, since each run's now() is a
  --    different fraction past its minute; so never in the minute of its late
  --    line), for a scheduled list nobody opened again by hand once it was
  --    late. None while the setting is 0.
  if owners_after > 0 then
    for still_late in
      update public.lists l
      set owners_told_at = at_time
      where l.id in (
        select x.id
        from public.lists x
        where x.business_id = business
          and x.status = 'open'
          and x.origin = 'scheduled'
          and x.late_at is not null
          and (x.reopened_at is null or x.reopened_at < x.late_at)
          and x.owners_told_at is null
          and date_trunc('minute', x.late_at) + make_interval(mins => owners_after) <= at_time
        for update skip locked
      )
      returning l.id, l.name, l.due_at, l.late_at
    loop
      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        business, null::uuid, 'lists.late_owner',
        jsonb_build_object(
          'list', still_late.id,
          'name', still_late.name,
          'due_at', still_late.due_at,
          'late_at', still_late.late_at
        )
      );
    end loop;
  end if;

  return opened;
end;
$$;

------------------------------------------------------------------------------
-- 6. Archiving a role lists go to

-- 20261115001600_named_roles_give.sql's, refused too while a live template
-- or a time of one sends to the role (55000, hint 'lists'). No caller in
-- the database; the app calls it with the secret key (archiveBusinessRole
-- in @db/roles).
create or replace function public.archive_business_role(actor uuid, role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.business_roles%rowtype;
  holders integer;
  sending integer;
begin
  select * into target from public.business_roles br where br.id = role_id;
  if not found then
    raise exception 'No such role' using errcode = 'P0002';
  end if;

  perform private.check_role_changer(actor, target.business_id);

  perform 1 from public.businesses b where b.id = target.business_id for no key update;
  select * into target from public.business_roles br where br.id = role_id for update;
  if target.archived_at is not null then
    return;
  end if;

  select count(*)::integer into holders
  from public.memberships m
  where m.named_role = role_id
    and m.active;
  holders := holders + (
    select count(*)::integer
    from public.invites i
    where i.named_role = role_id
      and i.claimed_at is null
      and i.expires_at > now()
  );
  if holders > 0 then
    raise exception 'People hold the role' using errcode = '55000', hint = 'held', detail = holders::text;
  end if;

  -- A live template that goes to the role when nobody chooses, and a time of
  -- a live template that sends to it, on or paused: refused too (55000, hint
  -- 'lists', the count of both as its detail), until each goes to someone
  -- else, so no list of a template is left for nobody, or for the whole base
  -- in its place. A list already sent to it stays as it was.
  select count(*)::integer into sending
  from public.list_templates t
  where t.recipient_named_role = role_id
    and t.archived_at is null;
  sending := sending + (
    select count(*)::integer
    from public.list_schedules ls
    join public.list_templates t
      on t.id = ls.template_id and t.business_id = ls.business_id
    where ls.recipient_named_role = role_id
      and t.archived_at is null
  );
  if sending > 0 then
    raise exception 'Lists go to the role' using errcode = '55000', hint = 'lists', detail = sending::text;
  end if;

  update public.memberships m
  set named_role = null
  where m.named_role = role_id;

  update public.business_roles br
  set archived_at = now()
  where br.id = role_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    target.business_id, actor, 'role.archive',
    jsonb_build_object('named_role', role_id, 'name', target.name, 'base', target.base)
  );
end;
$$;

------------------------------------------------------------------------------
-- 7. Moving someone off a role lists go to

-- 20261115001600_named_roles_give.sql's, with only this: someone moved off a
-- role the business named, and still on the staff, has the lines of the
-- lists they no longer see settled (read, settled, and off the phone if not
-- sent yet: `list:`, `list.due:` and `list.late:`, the lines a list's
-- holders get), as public.pass_list settles a list's former holders'. A list
-- to a named role is read live by who holds it, so once they hold it no
-- longer they don't open it, and its name and due time wait on nobody; a
-- list they still see (to the base, sent by them, or theirs to run) keeps
-- its line. Someone leaving the staff is as before (every lists line put
-- away), and a change that keeps the named role, or gives one to someone
-- without, touches no line. No caller in the database; the app calls it with
-- the secret key (setMemberRole in @db/team). The same signature, so its
-- grants stay.
create or replace function public.set_member_role(
  actor uuid,
  business uuid,
  person uuid,
  new_role public.member_role,
  seen_role public.member_role default null,
  at_time timestamptz default now(),
  new_named uuid default null,
  seen_named uuid default null
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
  named_label text;
  was_label text;
begin
  perform 1 from public.businesses b where b.id = business for no key update;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or not private.holds_perm(business, actor, 'team.edit'::text) then
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
    raise exception 'Only an owner changes an owner''s, an accountant''s or a higher role'
      using errcode = '42501';
  end if;

  if seen_role is not null
    and (seen_role <> target.role or seen_named is distinct from target.named_role)
  then
    raise exception 'The role changed meanwhile' using errcode = '40001';
  end if;

  if not private.gives_role(actor_role, new_role) then
    raise exception 'Only an owner gives an owner''s, an accountant''s or a higher role'
      using errcode = '42501';
  end if;

  -- A role the business named: of the business, live, built on the role.
  named_label := private.live_named_role(business, new_role, new_named);

  if new_role = target.role and new_named is not distinct from target.named_role then
    return private.left_counts('{}'::jsonb) || jsonb_build_object('changed', false);
  end if;

  -- Pay is the owner's to give (Orel, 8 November 2026; critique 17): nobody
  -- else gives a role that holds it, by a change of role or otherwise, even when
  -- it is their own role.
  if actor_role <> 'owner' and private.role_holds_pay(business, new_role, new_named) then
    raise exception 'Only an owner gives a role that sees pay'
      using errcode = '42501', hint = 'pay';
  end if;

  -- Only owners and the team change who holds a permission (Q5).
  if actor_role <> 'owner'
    and private.role_holds_beyond(business, new_role, actor, new_named)
  then
    raise exception 'Only an owner gives a role that holds what you don''t'
      using errcode = '42501', hint = 'held';
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

  -- The named role they leave, by its name, for the log.
  select br.name into was_label
  from public.business_roles br
  where br.id = target.named_role;

  begin
    update public.memberships m
    set role = new_role,
      named_role = new_named,
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

  -- Lines for a role above the new one, or for those who hold a permission
  -- the new role doesn't, and, off the staff, the staff's lines about the
  -- schedule, lists and chat: nothing waits on them now.
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.user_id = person
    and (n.read_at is null or n.push_state = 'queued')
    and (
      (
        case
          when n.audience_perm is null
            then private.role_rank(n.audience_role) > private.role_rank(new_role)
          else not private.holds_perm(business, person, n.audience_perm)
        end
      )
      or (
        leaving
        and n.source_module in (
          'scheduling'::public.module_key, 'lists'::public.module_key,
          'chat'::public.module_key
        )
      )
    );

  -- Off a role the business named, on the staff still (R11d): the lines of
  -- the lists it held that they no longer see (a list to that role, read
  -- live by who holds it) are settled, as a list passed elsewhere settles
  -- its former holders' (public.pass_list), so nothing waits on them and no
  -- phone says the list's name; the lines of lists they still see stay.
  if target.named_role is not null
    and new_named is distinct from target.named_role
    and not leaving
  then
    update public.notifications n
    set read_at = coalesce(n.read_at, at_time),
      resolved_at = at_time,
      push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
    where n.business_id = business
      and n.user_id = person
      and n.source_module = 'lists'::public.module_key
      and n.resolved_at is null
      and case
        when split_part(n.dedupe_key, ':', 1) in ('list', 'list.due', 'list.late')
          then not private.sees_list(split_part(n.dedupe_key, ':', 2)::uuid, person)
        else false
      end;
  end if;

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
      || case
        when new_named is null then '{}'::jsonb
        else jsonb_build_object('named_role', new_named, 'role_name', named_label)
      end
      || case
        when target.named_role is null then '{}'::jsonb
        else jsonb_build_object('was_named', target.named_role, 'was_role_name', was_label)
      end
  );

  return private.left_counts(cleared) || jsonb_build_object('changed', true);
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The helpers run inside the functions above, as their owner. The others
-- kept their signatures and their grants; the private ones are revoked again
-- all the same.
revoke execute on function private.refuse_archived_recipient_role()
  from public, anon, authenticated;
revoke execute on function private.list_recipient(uuid, jsonb, text[])
  from public, anon, authenticated;
revoke execute on function private.list_schedule_fields(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function private.holds_list(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.list_holders(uuid)
  from public, anon, authenticated;
revoke execute on function private.lists_tick_business(uuid, timestamptz)
  from public, anon, authenticated, service_role;
