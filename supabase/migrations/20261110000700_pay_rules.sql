-- The pay rules (payroll P6; Orel, 9 and 10 November 2026, issue #1): the time
-- clock's settings the hours engine reads (@domain/payroll), each one field in
-- the module's manifest, edited from /manage/time_clock and the console with
-- no new screen.
--
--   rules     workWeek (unset, five or six days; unset works each week out
--             all three ways and pays the highest), shortDay (the short day
--             of a five-day week, Sunday to Thursday), restStart (candle
--             lighting, or a fixed Friday time) and restStartTime, and
--             workersSeeEstimate (workers see their own month's estimate):
--             for an owner or the ConceptApp team, as the punch code is, and
--             checked for their type here.
--   estimate  payEstimate: amounts in shekels from the hours, for pay
--             holders and workers alike. For the ConceptApp team only: it
--             goes on in a real business once an accountant confirms the
--             engine's readings (payroll plan §14). Off unless set.
--   demo      a demo definition's `settings` (by module) go over what its
--             template gave, last in the reset (private.seed_demo_pay): both
--             demo businesses have payEstimate on, here and in supabase/seed.sql
--             and supabase/hosted-demo.sql. The hosted ones get it now,
--             without a reset.

------------------------------------------------------------------------------
-- 1. Who changes the pay rules
--
-- Saving a module's settings (20261108000300_sealed.sql), with the pay rules
-- beside the punch code: for an owner or the team, whatever the manifest says,
-- and the pay estimate for the team alone. Each is checked for its type, so a
-- stored value the engine can't read never gets in.
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
begin
  if not private.can_edit_settings(business, actor) then
    raise exception 'Managers, owners and the team only' using errcode = '42501';
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

-- Replaced above; its grants stay as 20261107000500_module_settings.sql set them.
revoke execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  to service_role;

------------------------------------------------------------------------------
-- 2. The demo shows the estimate
--
-- What a demo business starts with on the pay side
-- (20261110000600_payroll_details.sql's, now with its settings): the module
-- settings its definition names (`settings`, by module key, each over what
-- the template gave; a key that is no module is skipped), the role grants
-- (`rolePermissions`), last month's hours (`hours`), its wages (`wages`), and
-- its details and periods (`details`).
create or replace function private.seed_demo_pay(business uuid)
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
  where d.business_id = business;
  if not found then
    return;
  end if;

  update public.business_modules bm
  set settings = bm.settings || s.setting_patch
  from jsonb_each(
    case
      when jsonb_typeof(def -> 'settings') = 'object' then def -> 'settings'
      else '{}'::jsonb
    end
  ) as s (setting_module, setting_patch)
  where bm.business_id = business
    and bm.module_key::text = s.setting_module
    and jsonb_typeof(s.setting_patch) = 'object';

  insert into public.role_permissions (business_id, role, perm)
  select business, g.role, g.perm
  from jsonb_to_recordset(
    case
      when jsonb_typeof(def -> 'rolePermissions') = 'array'
        then def -> 'rolePermissions'
      else '[]'::jsonb
    end
  ) as g (role public.member_role, perm text)
  on conflict do nothing;

  perform private.seed_demo_hours(business, def -> 'hours');
  perform private.seed_demo_wages(business, def -> 'wages');
  perform private.seed_demo_details(business, def -> 'details');
end;
$$;

revoke execute on function private.seed_demo_pay(uuid)
  from public, anon, authenticated, service_role;

-- The hosted demo businesses, by their fixed ids (supabase/hosted-demo.sql
-- says the same, for the workflow's "demo" step): both show the estimate.
-- Locally the seed runs after the migrations, with its own.
update private.demo_businesses d
set definition = jsonb_set(
  d.definition,
  '{settings}'::text[],
  coalesce(d.definition -> 'settings', '{}'::jsonb)
    || '{"time_clock": {"payEstimate": true}}'::jsonb
)
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);

-- And have it now, without a reset that would take their visitors' changes:
-- every demo business's own settings, over what it has.
update public.business_modules bm
set settings = bm.settings || s.setting_patch
from private.demo_businesses d
cross join lateral jsonb_each(
  case
    when jsonb_typeof(d.definition -> 'settings') = 'object' then d.definition -> 'settings'
    else '{}'::jsonb
  end
) as s (setting_module, setting_patch)
where bm.business_id = d.business_id
  and bm.module_key::text = s.setting_module
  and jsonb_typeof(s.setting_patch) = 'object';
