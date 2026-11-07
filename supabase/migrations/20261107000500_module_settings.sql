-- Settings a business changes itself, without touching code (Orel, 7 November
-- 2026). Owners, managers and the ConceptApp team can edit a business's settings.
--
-- Writes go through these functions with the secret key, for `actor`, and each
-- is written to `audit_log`:
--
--   set_module_settings  an owner, a manager or the team saves some of a module's
--                        settings; the other fields stay as they are
--   set_module_enabled   the team switches a module on or off for one business
--
-- The server checks what's written against the module's manifest first, and which
-- fields this person may change: some settings are for the team only. Only the
-- manifests know that, so it can't be checked here. What is checked here is who may
-- touch this business at all.
--
-- It replaces `set_clock_settings`, which could write only one field.
--
-- Also here: a template no longer has to name every module, so a module built for
-- one business doesn't touch every template. What it leaves out starts off.

-- `person` may edit this business's settings.
create function private.can_edit_settings(business uuid, person uuid)
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
      and m.role in ('owner', 'manager')
  ) or exists (
    select 1 from public.platform_staff s where s.user_id = person
  )
$$;

revoke execute on function private.can_edit_settings(uuid, uuid) from public;

create function public.set_module_settings(
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
begin
  if not private.can_edit_settings(business, actor) then
    raise exception 'Managers, owners and the team only' using errcode = '42501';
  end if;

  if jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'Settings must be an object' using errcode = '22023';
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

create function public.set_module_enabled(
  actor uuid,
  business uuid,
  module public.module_key,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'The ConceptApp team only' using errcode = '42501';
  end if;

  -- A module added after this business was set up has no row until now.
  insert into public.business_modules (business_id, module_key, enabled)
  values (business, module, set_module_enabled.enabled)
  on conflict (business_id, module_key)
  do update set enabled = excluded.enabled;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'module.enabled',
    jsonb_build_object('module', module, 'enabled', enabled)
  );
end;
$$;

revoke execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  from public, anon, authenticated;
revoke execute on function public.set_module_enabled(uuid, uuid, public.module_key, boolean)
  from public, anon, authenticated;
grant execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  to service_role;
grant execute on function public.set_module_enabled(uuid, uuid, public.module_key, boolean)
  to service_role;

drop function public.set_clock_settings(uuid, uuid, boolean);

-- A row for every module, on or off: what the template doesn't name starts off, with
-- its defaults. A name no module has is still a mistake.
create or replace function public.apply_template(business uuid, template text)
returns void
language plpgsql
security invoker
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

  update public.businesses b
  set template_key = template,
    template_version = ver,
    opening_hours = coalesce(def -> 'openingHours', '[]'::jsonb)
  where b.id = business;
end;
$$;
