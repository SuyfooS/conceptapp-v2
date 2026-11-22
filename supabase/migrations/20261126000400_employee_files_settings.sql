-- The hiring file (profile H5b, issue #82 §3.4; the H5 plan's default 9):
-- what each business asks of it. The module stays off everywhere, and
-- nothing in a template or a business changes: every business reads the
-- defaults, which ask what H4 asked.
--
--   settings    eleven, as modules/employee_files/manifest.ts defaults them
--               (modules/employee_files/settings.db.test.ts keeps the two
--               equal): askBank and askAddress (on), askEmergencyContact and
--               askWorkLanguage (off), form101 (print, link or off), the
--               101's system and its link, who prepares the payroll, the
--               employer's legal name, its phone and its deductions file.
--   the groups  private.file_groups reads askAddress and askBank: the
--               identity and the pension always, the address and the bank
--               while asked, a stored value that isn't a boolean read as
--               the default, as readModuleSettings reads it. So what a file
--               counts missing (private.file_missing, and through it
--               employee_file, employee_file_status and the export) follows
--               the business's choice at once. The contact and the language
--               are never counted: they are the worker's to give or not.
--   saving      public.set_module_settings checks the module's fields: every
--               one is an owner's and the team's (42501), the 101's link
--               above all, and each value is one the manifest outputs
--               (22023): the booleans, the three ways, each name one line of
--               at most 60 characters, the link https to a named host, the
--               phone a mobile or a landline in E.164, the deductions file
--               nine digits starting with 9, or "" for each text.
--
-- It replaces private.file_groups (20261126000200_employee_files.sql's) and
-- public.set_module_settings (20261120000200_order_taking_takers.sql's),
-- each its newest body with only these changes, the same signatures;
-- revoked and granted again all the same.

------------------------------------------------------------------------------
-- 1. The settings

-- The module's settings for `business`: the manifest's defaults, and what the
-- business stored over them. The readers below check each field.
create function private.employee_files_settings(business uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'askBank', true,
      'askAddress', true,
      'askEmergencyContact', false,
      'askWorkLanguage', false,
      'form101', 'print'::text,
      'form101Provider', ''::text,
      'form101Link', ''::text,
      'payrollProvider', ''::text,
      'employerName', ''::text,
      'employerPhone', ''::text,
      'deductionsFile', ''::text
    )
    || coalesce(
      (
        select bm.settings
        from public.business_modules bm
        where bm.business_id = business and bm.module_key = 'employee_files'
      ),
      '{}'::jsonb
    )
$$;

-- Whether the business asks for one part (askAddress, askBank): the stored
-- value when it is true or false, else `fallback`, the manifest's default.
create function private.file_asks(business uuid, field text, fallback boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(s.value -> field) = 'boolean' then (s.value ->> field)::boolean
    else fallback
  end
  from (select private.employee_files_settings(business) as value) s
$$;

------------------------------------------------------------------------------
-- 2. The groups the file counts

-- 20261126000200_employee_files.sql's, reading the ask settings: the
-- identity and the pension always, the address and the bank while asked
-- (FILE_GROUPS' order, as fileGroupsAsked in @domain/employee-file-settings).
-- Its callers are unchanged: private.file_missing and
-- public.set_direct_groups. Still security invoker: both are definers.
create or replace function private.file_groups(business uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_remove(
    array[
      'identity'::text,
      case when private.file_asks(business, 'askAddress'::text, true) then 'address'::text end,
      case when private.file_asks(business, 'askBank'::text, true) then 'bank'::text end,
      'pension'::text
    ],
    null::text
  )
$$;

------------------------------------------------------------------------------
-- 3. The values' checks

-- A setting's one line, as settingLine in @domain/employee-file-settings:
-- text with no outer space, at most `most` characters, and no control
-- character or line break (C0, DEL, C1, U+2028, U+2029). False for anything
-- else, never an error.
create function private.file_setting_line(value jsonb, most integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(value) = 'string'
      and (value #>> '{}'::text[]) = btrim(value #>> '{}'::text[])
      and char_length(value #>> '{}'::text[]) <= most
      and (value #>> '{}'::text[]) !~ '[\u0001-\u001f\u007f-\u009f\u2028\u2029]',
    false
  )
$$;

-- The 101's link, as FORM101_LINK in @domain/employee-file-settings: none
-- (""), or https to a host of lower-case letters, digits and dashes with a
-- top-level name, printable ASCII after it, at most 300 characters. False
-- for anything else, never an error.
create function private.file_setting_link(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(value) = 'string'
      and (
        (value #>> '{}'::text[]) = ''
        or (
          char_length(value #>> '{}'::text[]) <= 300
          and (value #>> '{}'::text[]) ~ '^https://([a-z0-9-]+\.)+[a-z]{2,63}([/?#][!-~]*)?$'
        )
      ),
    false
  )
$$;

------------------------------------------------------------------------------
-- 4. Saving them

-- 20261120000200_order_taking_takers.sql's, with a branch for the hiring file
-- after taking orders': every one of its settings is an owner's and the
-- team's (42501), no key outside the manifest's eleven, and each value one
-- the manifest outputs (22023). Nothing else changed. Its callers are
-- unchanged: setModuleSettings in @db/module-settings, from /manage and the
-- console.
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
  elsif module = 'employee_files' then
    on_team := exists (select 1 from public.platform_staff s where s.user_id = actor);
    owner_or_team := on_team or private.is_active_owner(business, actor);

    -- Every one of the file's settings is an owner's and the team's: the
    -- 101's link above all, since a manager could point the workers at a
    -- site that asks for their IDs.
    if not owner_or_team then
      raise exception 'Only an owner or the team changes what the file asks'
        using errcode = '42501';
    end if;

    if not private.file_keys_ok(
        patch,
        '{askBank,askAddress,askEmergencyContact,askWorkLanguage,form101,form101Provider,form101Link,payrollProvider,employerName,employerPhone,deductionsFile}'::text[]
      )
      or exists (
        select 1
        from jsonb_each(patch) as f (key, value)
        where not coalesce(
          case
            when f.key in ('askBank', 'askAddress', 'askEmergencyContact', 'askWorkLanguage')
              then jsonb_typeof(f.value) = 'boolean'
            when f.key = 'form101'
              then f.value in ('"print"'::jsonb, '"link"'::jsonb, '"off"'::jsonb)
            when f.key in ('form101Provider', 'payrollProvider', 'employerName')
              then private.file_setting_line(f.value, 60)
            when f.key = 'form101Link'
              then private.file_setting_link(f.value)
            when f.key = 'employerPhone'
              then jsonb_typeof(f.value) = 'string'
                and (f.value #>> '{}'::text[]) ~ '^(\+972([23489][0-9]{7}|[57][0-9]{8}))?$'
            when f.key = 'deductionsFile'
              then jsonb_typeof(f.value) = 'string'
                and (f.value #>> '{}'::text[]) ~ '^(9[0-9]{8})?$'
            else false
          end,
          false
        )
      )
    then
      raise exception 'Not a setting the file keeps' using errcode = '22023';
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
-- 5. Who may call them

-- Run inside the reads and the save above, as their owner.
revoke execute on function private.employee_files_settings(uuid) from public, anon, authenticated;
revoke execute on function private.file_asks(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function private.file_setting_line(jsonb, integer)
  from public, anon, authenticated;
revoke execute on function private.file_setting_link(jsonb) from public, anon, authenticated;

-- Replaced in place, the same signatures, so their grants stay; revoked and
-- granted again all the same.
revoke execute on function private.file_groups(uuid) from public, anon, authenticated;
revoke execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  to service_role;
