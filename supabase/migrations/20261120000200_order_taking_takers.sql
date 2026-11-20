-- Taking orders, P3 of waiter mode (issue #191; Orel's decisions of 20
-- November 2026), part 1 of 3: who takes orders, and when. Nothing here is
-- read until the orders (20261120000300_order_taking_orders.sql) and the
-- screens that send them (P4); the module stays off everywhere.
--
--   settings    five, as modules/order_taking/manifest.ts defaults them
--               (modules/order_taking/settings.db.test.ts keeps the two
--               equal): takerDepartments, the departments whose staff take
--               orders; onlyOnTheClock; takeBackMinutes, how long the sender
--               takes a line back; lateAfterMinutes, when a ticket reads as
--               waiting; and dayEndsAt, when the business's day ends, for
--               takeaway numbers and "today". Each reader here takes a stored
--               value the manifest wouldn't as the default, field by field,
--               as readModuleSettings does.
--   who         decision 3: an active owner, or someone active on the staff
--               (never an accountant) who is in one of takerDepartments (a
--               live department of the business) or holds order_taking.edit.
--               Templates name their departments: the restaurant's floor and
--               bar, the café's coffee bar and bar; a business already on one
--               of them gets the same now. The module is off, so nothing
--               changes until it is switched on.
--   when        decision 4: with onlyOnTheClock (on by default) and the time
--               clock on, someone who isn't an owner takes orders only during
--               a shift: an open one that began less than 16 hours before, or
--               until 30 minutes after clocking out. A cancelled shift never
--               counts. Refused with hint 'clock', or 'stale_shift' for a
--               shift left open more than 16 hours.
--   saving      public.set_module_settings checks the module's fields: who
--               takes orders, the clock rule and the take-back time are an
--               owner's and the team's (as the punch code), each value one
--               the manifest offers.
--
-- It replaces public.set_module_settings (20261115001000_roles_manage.sql's)
-- with one more branch, the same signature; revoked and granted again all the
-- same.

------------------------------------------------------------------------------
-- 1. The settings

-- The module's settings for `business`: the manifest's defaults, and what the
-- business stored over them. The readers below check each field.
create function private.order_taking_settings(business uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'takerDepartments', '[]'::jsonb,
      'onlyOnTheClock', true,
      'takeBackMinutes', 2,
      'lateAfterMinutes', 15,
      'dayEndsAt', '05:00'::text
    )
    || coalesce(
      (
        select bm.settings
        from public.business_modules bm
        where bm.business_id = business and bm.module_key = 'order_taking'
      ),
      '{}'::jsonb
    )
$$;

-- Whether `raw` is a list of departments the manifest's takerDepartments
-- takes: at most 30 keys, each a department's key (^[a-z][a-z0-9-]*$, at most
-- 40 characters), each once. False for anything else, never an error: the
-- save and the reader ask the same, so they never differ.
create function private.valid_taker_keys(raw jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if raw is null or jsonb_typeof(raw) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(raw) > 30 then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(raw) as k (value)
    where jsonb_typeof(k.value) <> 'string'
      or (k.value #>> '{}'::text[]) !~ '^[a-z][a-z0-9-]*$'
      or char_length(k.value #>> '{}'::text[]) > 40
  ) then
    return false;
  end if;
  return (
    select count(distinct k.value) from jsonb_array_elements(raw) as k (value)
  ) = jsonb_array_length(raw);
end;
$$;

-- The departments whose staff take orders, by key, as stored; none when what
-- is stored isn't a list the manifest takes.
create function private.order_taker_keys(business uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stored jsonb := private.order_taking_settings(business) -> 'takerDepartments';
begin
  if not private.valid_taker_keys(stored) then
    return '{}'::text[];
  end if;
  return array(
    select k.value
    from jsonb_array_elements_text(stored) with ordinality as k (value, n)
    order by k.n
  );
end;
$$;

-- Whether orders are taken only during a shift: onlyOnTheClock when it is
-- true or false, else on.
create function private.order_clock_rule(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(s.value -> 'onlyOnTheClock') = 'boolean'
      then (s.value ->> 'onlyOnTheClock')::boolean
    else true
  end
  from (select private.order_taking_settings(business) as value) s
$$;

-- How long the sender takes a line back: takeBackMinutes as the manifest
-- offers it (0, 2 or 5 minutes; 2.0 is 2), anything else stored as 2.
create function private.order_take_back(business uuid)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(
    mins => case private.order_taking_settings(business) -> 'takeBackMinutes'
      when '0'::jsonb then 0
      when '5'::jsonb then 5
      else 2
    end
  )
$$;

-- When the business's day ends, after midnight: dayEndsAt as "HH:MM", else
-- 05:00.
create function private.order_day_ends(business uuid)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(s.value -> 'dayEndsAt') = 'string'
      and (s.value ->> 'dayEndsAt') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (s.value ->> 'dayEndsAt')::time - time '00:00'
    else interval '5 hours'
  end
  from (select private.order_taking_settings(business) as value) s
$$;

-- The business day `at_time` falls on: its date in the business's clock,
-- the day before until dayEndsAt. Wall-clock arithmetic, so a change of the
-- clocks after midnight never moves the day (orderDay in @domain/orders, its
-- twin). Null for no business.
create function private.order_business_day(business uuid, at_time timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select ((at_time at time zone b.timezone) - private.order_day_ends(business))::date
  from public.businesses b
  where b.id = business
$$;

------------------------------------------------------------------------------
-- 2. Saving them

-- 20261115001000_roles_manage.sql's, with a branch for taking orders after
-- the time clock's: who takes orders, the clock rule and the take-back time
-- are an owner's and the team's (42501), and each field is a value the
-- manifest offers (22023), through the same private.valid_taker_keys the
-- reader asks. Nothing else changed. Its callers are unchanged:
-- setModuleSettings in @db/module-settings, from /manage and the console.
create or replace function public.set_module_settings(
  actor uuid,
  business uuid,
  module public.module_key,
  patch jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old jsonb;
  on_team boolean;
  owner_or_team boolean;
  needed text;
begin
  if not private.can_edit_settings(business, actor) then
    raise exception 'Managers, owners and the team only' using errcode = '42501';
  end if;

  needed := private.settings_perm(module);
  if needed is not null
    and not exists (select 1 from public.platform_staff s where s.user_id = actor)
    and not private.holds_perm(business, actor, needed)
  then
    raise exception 'These settings need % too', needed
      using errcode = '42501', hint = 'module', detail = needed;
  end if;

  if jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'Settings must be an object' using errcode = '22023';
  end if;

  if module = 'time_clock' then
    on_team := exists (select 1 from public.platform_staff s where s.user_id = actor);
    owner_or_team := on_team or private.is_active_owner(business, actor);

    if patch ?| array['requirePunchCode', 'codeDisplay'] and not owner_or_team then
      raise exception 'Only an owner or the team changes the punch code' using errcode = '42501';
    end if;
    if patch ?| array['workWeek', 'shortDay', 'restStart', 'restStartTime', 'workersSeeEstimate']
      and not owner_or_team then
      raise exception 'Only an owner or the team changes the pay rules' using errcode = '42501';
    end if;
    if patch ? 'payEstimate' and not on_team then
      raise exception 'Only the team switches the pay estimate' using errcode = '42501';
    end if;

    if (patch ? 'requirePunchCode'
        and jsonb_typeof(patch -> 'requirePunchCode') is distinct from 'boolean')
      or (patch ? 'codeDisplay'
        and (patch -> 'codeDisplay') not in ('"station"'::jsonb, '"manager"'::jsonb, '"both"'::jsonb))
    then
      raise exception 'Not a punch code setting' using errcode = '22023';
    end if;
    if (patch ? 'workWeek'
        and (patch -> 'workWeek') not in ('"unset"'::jsonb, '"five"'::jsonb, '"six"'::jsonb))
      or (patch ? 'shortDay'
        and (patch -> 'shortDay') not in ('0'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb, '4'::jsonb))
      or (patch ? 'restStart'
        and (patch -> 'restStart') not in ('"candleLighting"'::jsonb, '"fixed"'::jsonb))
      or (patch ? 'restStartTime'
        and (jsonb_typeof(patch -> 'restStartTime') is distinct from 'string'
          or (patch ->> 'restStartTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
      or (patch ? 'workersSeeEstimate'
        and jsonb_typeof(patch -> 'workersSeeEstimate') is distinct from 'boolean')
      or (patch ? 'payEstimate'
        and jsonb_typeof(patch -> 'payEstimate') is distinct from 'boolean')
    then
      raise exception 'Not a pay rule setting' using errcode = '22023';
    end if;
  elsif module = 'order_taking' then
    on_team := exists (select 1 from public.platform_staff s where s.user_id = actor);
    owner_or_team := on_team or private.is_active_owner(business, actor);

    if patch ?| array['takerDepartments', 'onlyOnTheClock', 'takeBackMinutes']
      and not owner_or_team then
      raise exception 'Only an owner or the team changes who takes orders and when'
        using errcode = '42501';
    end if;

    if (patch ? 'takerDepartments' and not private.valid_taker_keys(patch -> 'takerDepartments'))
      or (patch ? 'onlyOnTheClock'
        and jsonb_typeof(patch -> 'onlyOnTheClock') is distinct from 'boolean')
      or (patch ? 'takeBackMinutes'
        and (patch -> 'takeBackMinutes') not in ('0'::jsonb, '2'::jsonb, '5'::jsonb))
      or (patch ? 'lateAfterMinutes'
        and (patch -> 'lateAfterMinutes') not in ('10'::jsonb, '15'::jsonb, '20'::jsonb, '30'::jsonb))
      or (patch ? 'dayEndsAt'
        and (jsonb_typeof(patch -> 'dayEndsAt') is distinct from 'string'
          or (patch ->> 'dayEndsAt') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
    then
      raise exception 'Not a setting taking orders keeps' using errcode = '22023';
    end if;
  end if;

  -- A module added after this business was set up has no row yet. It starts off.
  insert into public.business_modules (business_id, module_key, enabled)
  values (business, module, false)
  on conflict (business_id, module_key) do nothing;

  select bm.settings into old
  from public.business_modules bm
  where bm.business_id = business and bm.module_key = module
  for update;

  update public.business_modules bm
  set settings = old || patch
  where bm.business_id = business and bm.module_key = module;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'module.settings',
    jsonb_build_object(
      'module', module,
      'from', (
        select coalesce(jsonb_object_agg(field, old -> field), '{}'::jsonb)
        from jsonb_object_keys(patch) as field
      ),
      'to', patch
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. The templates, and the businesses on them

-- The departments whose staff take orders, by template (decision 3), a
-- version up each; the module stays off. A shop and the general template
-- name none: a business picks its own when it switches the module on.
update public.templates t
set version = t.version + 1,
  definition = jsonb_set(
    t.definition, '{modules,order_taking}',
    jsonb_build_object(
      'enabled', false,
      'settings',
      coalesce(t.definition #> '{modules,order_taking,settings}', '{}'::jsonb)
        || jsonb_build_object('takerDepartments', data.keys)
    )
  )
from (
  values
    ('restaurant', '["floor", "bar"]'::jsonb),
    ('cafe-bar', '["coffee", "bar"]'::jsonb)
) as data (key, keys)
where t.key = data.key;

-- A business already opened from one of them gets its template's departments
-- (default 5 to ask Orel), those it has live, in the template's order, unless
-- it set its own. The module is off in each, so nothing changes until it is
-- switched on. No log row: the migration's data, as chat was switched on
-- (20261111000300_chat_on.sql).
update public.business_modules bm
set settings = bm.settings || jsonb_build_object(
  'takerDepartments',
  coalesce(
    (
      select jsonb_agg(wanted.key order by wanted.n)
      from jsonb_array_elements_text(
        t.definition #> '{modules,order_taking,settings,takerDepartments}'
      ) with ordinality as wanted (key, n)
      where exists (
        select 1 from public.departments d
        where d.business_id = bm.business_id
          and d.key = wanted.key
          and d.archived_at is null
      )
    ),
    '[]'::jsonb
  )
)
from public.businesses b
join public.templates t on t.key = b.template_key
where bm.business_id = b.id
  and bm.module_key = 'order_taking'
  and b.template_key in ('restaurant', 'cafe-bar')
  and not (bm.settings ? 'takerDepartments');

------------------------------------------------------------------------------
-- 4. Who takes orders, and who prepares

-- `person` is active on the business's staff and in one of the departments
-- that take orders (private.order_taker_keys), a live one.
create function private.in_taker_department(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.department_members dm
    join public.departments d
      on d.id = dm.department_id and d.business_id = dm.business_id and d.archived_at is null
    join public.memberships m
      on m.business_id = dm.business_id and m.user_id = dm.user_id and m.active
    where dm.business_id = business
      and dm.user_id = person
      and private.is_staff_role(m.role)
      and d.key = any (private.order_taker_keys(business))
  )
$$;

-- `person` is on a shift in the business at `at_time` (decision 4): a live
-- time entry that is open and began less than 16 hours before, or that ended
-- less than 30 minutes before. A cancelled shift never counts.
create function private.on_the_clock(business uuid, person uuid, at_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.time_entries e
    where e.business_id = business
      and e.user_id = person
      and e.cancelled_at is null
      and e.clock_in <= at_time
      and (
        (e.clock_out is null and e.clock_in > at_time - interval '16 hours')
        or (e.clock_out is not null and e.clock_out > at_time - interval '30 minutes')
      )
  )
$$;

-- Why `person` doesn't take orders in the business at `at_time`, or null when
-- they do: 'not_taker' for anyone who isn't an owner, nor active on the staff
-- in a department that takes orders or holding order_taking.edit; then, while
-- the time clock is on and the business takes orders only on shift, 'clock'
-- off a shift, or 'stale_shift' when the only shift is one left open more
-- than 16 hours. Owners always take orders.
create function private.order_taker_refusal(business uuid, person uuid, at_time timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.is_active_owner(business, person) then
    return null;
  end if;
  if not exists (
      select 1 from public.memberships m
      where m.business_id = business
        and m.user_id = person
        and m.active
        and private.is_staff_role(m.role)
    )
    or not (
      private.in_taker_department(business, person)
      or private.runs_orders(business, person)
    )
  then
    return 'not_taker';
  end if;
  if not private.module_enabled(business, 'time_clock'::public.module_key)
    or not private.order_clock_rule(business)
    or private.on_the_clock(business, person, at_time)
  then
    return null;
  end if;
  if exists (
    select 1
    from public.time_entries e
    where e.business_id = business
      and e.user_id = person
      and e.cancelled_at is null
      and e.clock_out is null
      and e.clock_in <= at_time - interval '16 hours'
  ) then
    return 'stale_shift';
  end if;
  return 'clock';
end;
$$;

-- `person` takes orders in the business at `at_time`.
create function private.takes_orders(business uuid, person uuid, at_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.order_taker_refusal(business, person, at_time) is null
$$;

-- Refuses anyone who doesn't take orders now: 42501, with hint 'clock' or
-- 'stale_shift' for a taker off a shift.
create function private.require_taker(business uuid, person uuid, at_time timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  refusal text := private.order_taker_refusal(business, person, at_time);
begin
  if refusal = 'not_taker' then
    raise exception 'Those who take orders only' using errcode = '42501';
  end if;
  if refusal is not null then
    raise exception 'Orders are taken during a shift' using errcode = '42501', hint = refusal;
  end if;
end;
$$;

-- `person` prepares what goes to `department`: they run the menu
-- (order_taking.edit), or are active on the staff and in that department,
-- as public.set_menu_item_available decides "sold out". An accountant never,
-- even put in one.
create function private.prepares_in(business uuid, person uuid, department uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.runs_orders(business, person)
    or (
      exists (
        select 1 from public.memberships m
        where m.business_id = business
          and m.user_id = person
          and m.active
          and private.is_staff_role(m.role)
      )
      and exists (
        select 1 from public.departments d
        where d.id = department and d.business_id = business
      )
      and private.in_department(department, person)
    )
$$;

------------------------------------------------------------------------------
-- Who may call what

-- They run inside the functions, as their owner, for nobody else.
revoke execute on function private.order_taking_settings(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.valid_taker_keys(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_taker_keys(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_clock_rule(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_take_back(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_day_ends(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_business_day(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.in_taker_department(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.on_the_clock(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.order_taker_refusal(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.takes_orders(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.require_taker(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.prepares_in(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Replaced in place, the same signature: its grants stay as its first
-- migration set them; revoked and granted again all the same.
revoke execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  to service_role;
